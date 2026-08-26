/* eslint-disable max-lines-per-function */

import type {
  CameraJsonMessage,
  CameraWebSocketMessage,
} from './services/websocket-protocol';
import type { CameraWebSocketStatus } from './services/websocket-service';
import type { CameraTransport, CameraTransportPreference } from './transport';
import type { CameraSerial, CameraVersion } from './types';

import { create } from 'zustand';
import { createSelectors } from '@/lib/utils';
import { getCameraWebSocketUrl } from './config';
import { CameraWebSocketService } from './services/websocket-service';
import {
  getActiveTransport,
  getTransportPreference,
  probeTransportReachability,
  probeTransports,
  setActiveTransport,
  setTransportPreference,
  TRANSPORT_FALLBACK_GRACE_MS,
  TRANSPORT_PROBE_MIN_INTERVAL_MS,
} from './transport';

export type CameraStatus
  = | 'idle'
    | 'in_repeat'
    | 'in_streaming'
    | 'in_exposure'
    | 'recording'
    | 'stopping';

export type LongExposureConfig = {
  id: number;
  name: string;
  exposure_time: number;
  gain: number;
  repeat?: number;
};

export type LandscapeShutterMode = 'auto' | 'pro';
export type LandscapeCaptureMode = 'photo' | 'video';
export type LandscapeCaptureState = 'idle' | 'countdown' | 'capturing';
export type LandscapeRepeatState = 'idle' | 'running' | 'cancelling';
export type LandscapeRecordingState = 'idle' | 'starting' | 'recording' | 'processing';
export type LandscapeRatio = 'full' | '16:9' | '4:3';

export type LandscapeTimerPlan = {
  count: number;
  interval: number;
};

type BoardCameraState = {
  busy?: string;
  streaming?: boolean;
  recording?: boolean;
  preview?: { exposure_s?: number; gain?: number };
  last_result?: { jpg_path?: string; video_name?: string | null };
};

const DEFAULT_TIMER_PLAN: LandscapeTimerPlan = { count: 1, interval: 0 };

/**
 * Outcome of a command that waits for the board's reply. A timeout or a
 * dropped connection resolves (never rejects) so callers handle one shape.
 */
export type CommandWaitResult = {
  msg?: CameraJsonMessage;
  timeout?: boolean;
  error?: string;
  elapsedMs: number;
};

/** Board accepts 0.001s–1s for landscape streaming exposure. */
function clampExposure(value: number): number {
  return Number.isNaN(value) ? 0.001 : Math.min(1, Math.max(0.001, value));
}

/** Board accepts 0–200 dB gain, integers only. */
function clampGain(value: number): number {
  return Number.isNaN(value) ? 0 : Math.min(200, Math.max(0, Math.round(value)));
}

type CameraState = {
  cameraStatus: CameraStatus;
  connectionStatus: CameraWebSocketStatus | 'idle';
  /** When true the app is running without a real camera and using mock data. */
  isMockMode: boolean;
  exposureConfigs: LongExposureConfig[];
  currentExposureConfig: LongExposureConfig;
  streamingInProgress: boolean;
  /** Battery percentage, or null when the board reports no battery data. */
  powerLevel: number | null;
  inCharge: boolean;
  usedSpace: number | null;
  allSpace: number | null;
  serial: CameraSerial | null;
  version: CameraVersion | null;
  newestCameraJpgUrl: string;
  newestStreamJpgUrl: string;
  remainingExposureTime: number;
  lastCommandError: string | null;
  cameraState: BoardCameraState | null;
  /** Current Wi-Fi band: true = 5GHz, false = 2.4GHz. Null when unknown / disconnected. */
  wifiBand: boolean | null;
  /** When true, show the device connection modal on home screen after Wi-Fi switch. */
  showConnectionModal: boolean;
  /** Link currently used to reach the board. */
  transport: CameraTransport;
  /** User's link choice; `auto` lets probing decide. */
  transportPreference: CameraTransportPreference;
  /** True while a probe is in flight, preventing re-entrant probes. */
  transportProbing: boolean;
  /**
   * Per-link reachability from the last probe, for the connection UI.
   * `null` means "not probed yet", which must not be shown as "unreachable".
   */
  transportReachability: Record<CameraTransport, boolean> | null;

  landscapeShutterMode: LandscapeShutterMode;
  landscapeCaptureMode: LandscapeCaptureMode;
  landscapeCaptureState: LandscapeCaptureState;
  landscapeCountdownRemaining: number;
  landscapeCapturePendingId: string | null;
  landscapeAutoMode: boolean;
  landscapeManualExposure: number;
  landscapeManualGain: number;
  landscapeWhiteBalance: number;
  landscapeEv: number;
  landscapeWatermark: boolean;
  landscapeRatio: LandscapeRatio;
  landscapeTimerPlan: LandscapeTimerPlan;
  landscapeRepeatState: LandscapeRepeatState;
  landscapeRepeatCurrent: number;
  landscapeRecordingState: LandscapeRecordingState;
  landscapeRecordingBaseName: string;
  landscapeRecordingVideoName: string;
  landscapeLatestVideoName: string;

  sendInstruction: (instruction: string, params?: unknown[]) => void;
  requestCameraState: () => void;
  setLandscapeShutterMode: (mode: LandscapeShutterMode) => void;
  setLandscapeCaptureMode: (mode: LandscapeCaptureMode) => void;
  setLandscapeTimerPlan: (plan: LandscapeTimerPlan) => void;
  setLandscapeWatermark: (enabled: boolean) => void;
  setLandscapeRatio: (ratio: LandscapeRatio) => void;
  setLandscapeSensorRatio: (ratio: Exclude<LandscapeRatio, 'full'>) => void;
  switchAutoMode: (auto: boolean) => void;
  startStreaming: (mode: 'auto') => void;
  startStreamingManual: (exposure: number, gain: number) => void;
  stopStreaming: () => void;
  changeStreamingSetting: (exposure: number, gain: number) => void;
  changeWhiteBalance: (cct: number) => void;
  changeEv: (ev: number) => void;
  captureStreamFrame: (path: string) => void;
  startRecording: (baseName: string) => void;
  stopRecording: () => void;
  startLandscapeCapture: () => void;
  startLandscapeCountdown: (seconds: number) => void;
  cancelLandscapeTimerCapture: () => void;
  startLandscapeRepeat: () => void;
  cancelLandscapeRepeat: () => void;
  startLandscapeRecording: () => void;
  stopLandscapeRecording: () => void;

  connect: () => void;
  disconnect: () => void;
  initTransport: () => void;
  switchTransport: (preference: CameraTransportPreference) => void;
  /** Refresh per-link reachability for the connection UI. */
  refreshTransportReachability: () => Promise<void>;
  sendCommand: (message: CameraJsonMessage) => void;
  sendCommandWait: (
    instruction: string,
    params?: unknown[],
    timeoutMs?: number,
  ) => Promise<CommandWaitResult>;
  requestCameraStatus: () => void;
  /** Request battery status from the camera. */
  requestBattery: () => void;
  /** Request storage info from the camera. */
  requestDisk: () => void;
  setGain: (gain: number) => void;
  setStretch: (enabled: boolean) => void;
  startExposure: () => void;
  startRepeatExposure: (repeat: number) => void;
  abortExposure: () => void;
  stopRepeatExposure: () => void;
  setCameraStatus: (status: CameraStatus) => void;
  setConnectionStatus: (status: CameraWebSocketStatus) => void;
  setPower: (power: number, charging: number | null) => void;
  setDisk: (usedSpace: number, allSpace: number) => void;
  setSerial: (serial: CameraSerial) => void;
  setVersion: (version: CameraVersion) => void;
  setNewestCameraJpgUrl: (url: string) => void;
  setNewestStreamJpgUrl: (url: string) => void;
  setCurrentExposureConfig: (config: LongExposureConfig) => void;
  setWifiBand: (band: boolean) => void;
  setShowConnectionModal: (show: boolean) => void;
  addExposureConfig: (config: Omit<LongExposureConfig, 'id'>) => void;
  updateExposureConfig: (config: LongExposureConfig) => void;
  deleteExposureConfig: (id: number) => void;
};

const DEFAULT_EXPOSURE_CONFIGS: LongExposureConfig[] = [
  { id: 0, name: 'Saturn', exposure_time: 0.1, gain: 0 },
  { id: 1, name: 'Jupiter', exposure_time: 0.02, gain: 10 },
  { id: 2, name: 'Full Moon', exposure_time: 0.003, gain: 1 },
  { id: 3, name: 'Crescent Moon', exposure_time: 0.04, gain: 70 },
  { id: 4, name: 'Nebula', exposure_time: 0.001, gain: 90 },
];

const DEFAULT_CURRENT_CONFIG = DEFAULT_EXPOSURE_CONFIGS[2];

let cameraWebSocket: CameraWebSocketService | null = null;

/** Board instruction names, mirroring the board's `command_map.c`. */
const CAMERA_INSTRUCTIONS = {
  cameraState: 'camera_state',
  cameraStatus: 'get_camera_status',
  startStreaming: 'start_streaming_exposure',
  stopStreaming: 'stop_streaming',
  captureStreamFrame: 'capture_stream_frame',
  changeStreamingSetting: 'change_streaming_setting',
  switchAutoMode: 'switch_auto_mode',
  startRecording: 'streaming_start_save',
  stopRecording: 'streaming_stop_save',
  startPlateSolve: 'start_plate_solve',
  setWhiteBalance: 'set_white_balance',
  setEv: 'set_ev',
  switchWifiBand: 'switch_wifi_band',
  setSensorRoi: 'set_sensor_roi',
} as const;

/**
 * Sensor crop windows backing the landscape ratio switch. The board rebuilds the
 * whole VI -> VPSS -> VENC chain from this window, so preview and captured JPEG
 * always share the selected ratio. Bounds mirror the board's validation:
 * `x + width <= 1920`, `y + height <= 1080`, every value even.
 */
const LANDSCAPE_RATIO_ROI = {
  '16:9': { x: 0, y: 0, width: 1920, height: 1080 },
  '4:3': { x: 240, y: 0, width: 1440, height: 1080 },
} as const;

/**
 * Dragging a ruler emits dozens of updates per second. The board cannot keep up
 * with one `change_streaming_setting` per event, so they are coalesced into at
 * most one command per window, always ending on the final value.
 */
const STREAMING_SETTING_THROTTLE_MS = 120;

const LANDSCAPE_CAPTURE_TIMEOUT_MS = 15_000;
const RECORDING_COMMAND_TIMEOUT_MS = 60_000;

let commandSequence = 0;
let streamingSettingTimer: ReturnType<typeof setTimeout> | null = null;
let streamingSettingSentAt = 0;
let captureTimer: ReturnType<typeof setTimeout> | null = null;
let captureStatePoll: ReturnType<typeof setInterval> | null = null;
let countdownTimer: ReturnType<typeof setInterval> | null = null;
let repeatTimer: ReturnType<typeof setTimeout> | null = null;
let recordingTimer: ReturnType<typeof setTimeout> | null = null;
let repeatCancelled = false;
/** When the control channel last left `open`; null while connected. */
let disconnectedSince: number | null = null;
let lastProbeAt = 0;

/**
 * Re-probe while `auto` and fall back to whichever link answers.
 *
 * Deliberately hung off `onStatusChange` rather than `onGiveUp`: the camera
 * socket runs with `retryForever`, so its attempt budget never runs out and
 * `onGiveUp` never fires. The guards below keep a flapping USB link — which
 * re-enumerates several times per session — from bouncing the app between
 * transports: the link must stay down past the grace period, probes are
 * throttled, and a switch only happens when the other link actually answers.
 */
function maybeFallbackTransport(): void {
  const state = _useCameraStore.getState();
  if (state.transportPreference !== 'auto' || state.transportProbing)
    return;
  if (disconnectedSince === null || Date.now() - disconnectedSince < TRANSPORT_FALLBACK_GRACE_MS)
    return;
  if (Date.now() - lastProbeAt < TRANSPORT_PROBE_MIN_INTERVAL_MS)
    return;

  lastProbeAt = Date.now();
  _useCameraStore.setState({ transportProbing: true });
  void probeTransports(state.transport)
    .then((reachable) => {
      if (reachable && reachable !== _useCameraStore.getState().transport)
        applyTransport(reachable);
    })
    .finally(() => _useCameraStore.setState({ transportProbing: false }));
}

/**
 * Point every channel at `transport` by cycling the control connection.
 *
 * The preview effect keys on `connectionStatus`, so the closed -> open
 * transition tears down the old WHEP session and reopens it against the new
 * address. Without the full cycle, control would move while video stayed on
 * the previous link.
 */
function applyTransport(transport: CameraTransport): void {
  console.log('[CONN]', '=== applyTransport 被调用 ===', { transport });
  const state = _useCameraStore.getState();
  console.log('[CONN]', '断开旧连接', { hasSocket: !!cameraWebSocket });
  state.disconnect();
  console.log('[CONN]', '设置新传输方式', { transport });
  setActiveTransport(transport);
  disconnectedSince = null;
  _useCameraStore.setState({ transport });
  console.log('[CONN]', '连接新传输', { newWsUrl: getCameraWebSocketUrl() });
  state.connect();
}

/**
 * Commands awaiting their matching board response, keyed by command id.
 * The board answers asynchronously, so callers of `sendCommandWait` park a
 * resolver here until `handleCameraMessage` matches the id or the timer fires.
 */
const pendingCommands = new Map<string, (result: CommandWaitResult) => void>();

function nextCommandId(): string {
  commandSequence += 1;
  return `APP-${Date.now().toString(36)}-${commandSequence}`;
}

/** Release every waiter so a dropped connection cannot leak pending promises. */
function settlePendingCommands(reason: string): void {
  for (const resolve of pendingCommands.values()) {
    resolve({ error: reason, elapsedMs: 0 });
  }
  pendingCommands.clear();
}

function clearCaptureTimer(): void {
  if (captureTimer)
    clearTimeout(captureTimer);
  if (captureStatePoll)
    clearInterval(captureStatePoll);
  captureTimer = null;
  captureStatePoll = null;
}

function clearCountdownTimer(): void {
  if (countdownTimer)
    clearInterval(countdownTimer);
  countdownTimer = null;
}

function clearRepeatTimer(): void {
  if (repeatTimer)
    clearTimeout(repeatTimer);
  repeatTimer = null;
}

function clearRecordingTimer(): void {
  if (recordingTimer)
    clearTimeout(recordingTimer);
  recordingTimer = null;
}

function scheduleStreamingSetting(): void {
  if (streamingSettingTimer)
    return;
  const elapsed = Date.now() - streamingSettingSentAt;
  const delay = Math.max(0, STREAMING_SETTING_THROTTLE_MS - elapsed);
  streamingSettingTimer = setTimeout(() => {
    streamingSettingTimer = null;
    streamingSettingSentAt = Date.now();
    const state = _useCameraStore.getState();
    state.sendInstruction(CAMERA_INSTRUCTIONS.changeStreamingSetting, [
      state.landscapeManualExposure,
      state.landscapeManualGain,
    ]);
  }, delay);
}

/** Landscape actions are only safe while streaming and not already busy. */
function canStartLandscapeAction(state: CameraState): boolean {
  return state.connectionStatus === 'open'
    && state.landscapeCaptureState === 'idle'
    && state.landscapeRepeatState === 'idle'
    && state.cameraStatus !== 'in_exposure'
    && state.cameraStatus !== 'in_repeat'
    && state.cameraStatus !== 'recording'
    && state.cameraStatus !== 'stopping';
}

function finishLandscapeCapture(jpgPath: string | null): void {
  const state = _useCameraStore.getState();
  if (state.landscapeCaptureState !== 'capturing')
    return;
  clearCaptureTimer();
  _useCameraStore.setState({
    landscapeCaptureState: 'idle',
    landscapeCapturePendingId: null,
    cameraStatus: state.cameraStatus === 'recording' ? 'recording' : 'in_streaming',
    lastCommandError: jpgPath ? null : state.lastCommandError ?? '风景拍照失败',
  });
  if (_useCameraStore.getState().landscapeRepeatState === 'running') {
    advanceLandscapeRepeat();
  }
}

function advanceLandscapeRepeat(): void {
  const state = _useCameraStore.getState();
  if (repeatCancelled) {
    clearRepeatTimer();
    _useCameraStore.setState({ landscapeRepeatState: 'idle', landscapeRepeatCurrent: 0 });
    return;
  }
  const next = state.landscapeRepeatCurrent + 1;
  _useCameraStore.setState({ landscapeRepeatCurrent: next });
  const { count, interval } = state.landscapeTimerPlan;
  if (next >= count) {
    clearRepeatTimer();
    _useCameraStore.setState({ landscapeRepeatState: 'idle', landscapeRepeatCurrent: 0 });
    return;
  }
  repeatTimer = setTimeout(runLandscapeRepeatStep, Math.max(0, interval) * 1000);
}

function runLandscapeRepeatStep(): void {
  const state = _useCameraStore.getState();
  if (repeatCancelled || state.landscapeRepeatState !== 'running') {
    clearRepeatTimer();
    _useCameraStore.setState({ landscapeRepeatState: 'idle', landscapeRepeatCurrent: 0 });
    return;
  }
  if (state.landscapeRepeatCurrent >= state.landscapeTimerPlan.count) {
    clearRepeatTimer();
    _useCameraStore.setState({ landscapeRepeatState: 'idle', landscapeRepeatCurrent: 0 });
    return;
  }
  state.startLandscapeCapture();
}

/** Recording results may arrive as a bare filename or nested in a data object. */
function extractVideoName(value: unknown): string | null {
  if (typeof value === 'string') {
    return /\.(h264|mp4)$/i.test(value) ? value.trim() : null;
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const name = record.video_name ?? record.videoName ?? record.path;
    if (typeof name === 'string' && name.trim())
      return name.trim();
    if (typeof record.data === 'object' && record.data !== null) {
      return extractVideoName(record.data);
    }
  }
  return null;
}

function finishRecording(videoName: string | null): void {
  const state = _useCameraStore.getState();
  if (state.landscapeRecordingState === 'idle')
    return;
  clearRecordingTimer();
  const resolved = videoName || state.landscapeRecordingVideoName || state.landscapeLatestVideoName;
  _useCameraStore.setState({
    landscapeRecordingState: 'idle',
    landscapeRecordingBaseName: '',
    landscapeRecordingVideoName: '',
    landscapeLatestVideoName: resolved || state.landscapeLatestVideoName,
    cameraStatus: 'in_streaming',
  });
}

function formatRecordingBaseName(): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const now = new Date();
  return [
    'app_landscape_record_',
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '_',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('');
}

const _useCameraStore = create<CameraState>(set => ({
  cameraStatus: 'idle',
  connectionStatus: 'idle',
  isMockMode: false,
  exposureConfigs: DEFAULT_EXPOSURE_CONFIGS,
  currentExposureConfig: DEFAULT_CURRENT_CONFIG,
  streamingInProgress: false,
  powerLevel: null,
  inCharge: false,
  usedSpace: null,
  allSpace: null,
  serial: null,
  version: null,
  newestCameraJpgUrl: '',
  newestStreamJpgUrl: '',
  remainingExposureTime: 0,
  lastCommandError: null,
  cameraState: null,
  wifiBand: null,
  transport: getActiveTransport(),
  transportPreference: getTransportPreference(),
  transportProbing: false,
  transportReachability: null,
  showConnectionModal: false,

  landscapeShutterMode: 'auto',
  landscapeCaptureMode: 'photo',
  landscapeCaptureState: 'idle',
  landscapeCountdownRemaining: 0,
  landscapeCapturePendingId: null,
  landscapeAutoMode: true,
  // 1/1000s + 0dB never blows out in daylight; the board seeds real AE values
  // before manual mode is entered, so this is only a safe fallback.
  landscapeManualExposure: 0.001,
  landscapeManualGain: 0,
  landscapeWhiteBalance: 0,
  landscapeEv: 0,
  landscapeWatermark: true,
  landscapeRatio: 'full',
  landscapeTimerPlan: DEFAULT_TIMER_PLAN,
  landscapeRepeatState: 'idle',
  landscapeRepeatCurrent: 0,
  landscapeRecordingState: 'idle',
  landscapeRecordingBaseName: '',
  landscapeRecordingVideoName: '',
  landscapeLatestVideoName: '',

  connect: () => {
    const wsUrl = getCameraWebSocketUrl();
    console.log('[CONN]', '=== connect 被调用 ===', { wsUrl, hasSocket: !!cameraWebSocket });
    if (!cameraWebSocket) {
      console.log('[CONN]', '创建新的 CameraWebSocketService', { wsUrl });
      cameraWebSocket = new CameraWebSocketService({
        url: wsUrl,
        retryForever: true,
        onStatusChange: (status) => {
          console.log('[CONN]', 'WebSocket 状态变化', { status });
          set(status === 'open'
            ? { connectionStatus: status, isMockMode: false }
            : { connectionStatus: status });
          if (status === 'open') {
            disconnectedSince = null;
            _useCameraStore.getState().requestCameraState();
            _useCameraStore.getState().requestCameraStatus();
          }
          else {
            settlePendingCommands('设备连接已断开');
            disconnectedSince ??= Date.now();
            maybeFallbackTransport();
          }
        },
        onMessage: message => handleCameraMessage(message, set),
        /** Camera is unreachable — switch to mock mode. */
        onGiveUp: () => {
          console.log('[CONN]', 'WebSocket 连接放弃，切换到 Mock 模式');
          set({
            connectionStatus: 'error',
            isMockMode: true,
            // Provide reasonable mock values so the UI renders correctly.
            powerLevel: null,
            inCharge: false,
            usedSpace: 15 * 1024 * 1024 * 1024,
            allSpace: 32 * 1024 * 1024 * 1024,
          });
        },
      });
    }
    console.log('[CONN]', '调用 cameraWebSocket.connect()', { wsUrl });
    cameraWebSocket.connect();
  },
  disconnect: () => {
    settlePendingCommands('设备连接已断开');
    cameraWebSocket?.close();
    cameraWebSocket = null;
    set({ connectionStatus: 'closed', isMockMode: false });
  },
  initTransport: () => {
    const preference = getTransportPreference();
    const activeTransport = getActiveTransport();
    console.log('[CONN]', '=== initTransport 开始 ===', { preference, activeTransport, wsUrl: getCameraWebSocketUrl() });
    set({ transportPreference: preference, transport: activeTransport });
    if (preference !== 'auto') {
      setActiveTransport(preference);
      set({ transport: preference });
      console.log('[CONN]', '非 auto 模式，直接连接', { transport: preference });
      _useCameraStore.getState().connect();
      return;
    }
    lastProbeAt = Date.now();
    set({ transportProbing: true });
    console.log('[CONN]', 'auto 模式，开始探测传输方式', { preferredTransport: activeTransport });
    // Refresh the per-link view alongside the probe that picks the transport,
    // so the UI never shows reachability that contradicts the active link.
    void _useCameraStore.getState().refreshTransportReachability();
    void probeTransports(activeTransport)
      .then((reachable) => {
        console.log('[CONN]', '探测结果', { reachable, currentTransport: _useCameraStore.getState().transport });
        if (reachable && reachable !== _useCameraStore.getState().transport) {
          console.log('[CONN]', '传输方式改变，应用新传输', { from: _useCameraStore.getState().transport, to: reachable });
          applyTransport(reachable);
        }
        else {
          console.log('[CONN]', '传输方式不变，连接', { transport: reachable ?? activeTransport });
          _useCameraStore.getState().connect();
        }
      })
      .finally(() => {
        console.log('[CONN]', '探测完成');
        set({ transportProbing: false });
      });
  },
  refreshTransportReachability: async () => {
    const reachability = await probeTransportReachability();
    set({ transportReachability: reachability });
  },
  switchTransport: (preference) => {
    setTransportPreference(preference);
    set({ transportPreference: preference });
    if (preference === 'auto') {
      _useCameraStore.getState().initTransport();
      return;
    }
    if (preference !== _useCameraStore.getState().transport)
      applyTransport(preference);
  },
  sendCommand: (message) => {
    cameraWebSocket?.send(message);
  },
  sendCommandWait: (instruction, params = [], timeoutMs = 30_000) => {
    const startedAt = Date.now();
    if (_useCameraStore.getState().connectionStatus !== 'open') {
      return Promise.resolve({ error: '设备未连接', elapsedMs: 0 });
    }
    const id = nextCommandId();
    return new Promise<CommandWaitResult>((resolve) => {
      const timer = setTimeout(() => {
        pendingCommands.delete(id);
        resolve({ timeout: true, elapsedMs: Date.now() - startedAt });
      }, timeoutMs);
      pendingCommands.set(id, (result) => {
        clearTimeout(timer);
        resolve({ ...result, elapsedMs: Date.now() - startedAt });
      });
      cameraWebSocket?.send({ device_name: 'main_camera', instruction, params, id });
    });
  },
  sendInstruction: (instruction, params = []) => {
    _useCameraStore.getState().sendCommand({
      device_name: 'main_camera',
      instruction,
      params,
      id: nextCommandId(),
    });
  },

  requestCameraState: () => _useCameraStore.getState().sendInstruction(CAMERA_INSTRUCTIONS.cameraState),
  setLandscapeShutterMode: (mode) => {
    _useCameraStore.getState().switchAutoMode(mode === 'auto');
  },
  setLandscapeCaptureMode: (mode) => {
    if (_useCameraStore.getState().landscapeCaptureState === 'idle') {
      set({ landscapeCaptureMode: mode });
    }
  },
  setLandscapeTimerPlan: plan => set({
    landscapeTimerPlan: {
      count: Math.max(1, Math.min(64, Math.round(plan.count))),
      interval: Math.max(0, Math.round(plan.interval)),
    },
  }),
  setLandscapeWatermark: landscapeWatermark => set({ landscapeWatermark }),
  setLandscapeRatio: landscapeRatio => set({ landscapeRatio }),
  setLandscapeSensorRatio: (landscapeRatio) => {
    const state = _useCameraStore.getState();
    if (state.landscapeRatio === landscapeRatio)
      return;
    set({ landscapeRatio });
    const roi = LANDSCAPE_RATIO_ROI[landscapeRatio];
    // Changing the sensor window tears down and rebuilds VI/VPSS/VENC, so the
    // preview drops for a moment before WHEP renegotiates on its own.
    state.sendInstruction(
      CAMERA_INSTRUCTIONS.setSensorRoi,
      [roi.x, roi.y, roi.width, roi.height, 0],
    );
  },

  switchAutoMode: (auto) => {
    const state = _useCameraStore.getState();
    if (auto) {
      set({
        landscapeAutoMode: true,
        landscapeShutterMode: 'auto',
      });
      state.sendInstruction(CAMERA_INSTRUCTIONS.switchAutoMode, [0]);
      return;
    }

    if (!state.landscapeAutoMode)
      return;

    const exposure = clampExposure(state.landscapeManualExposure);
    const gain = clampGain(state.landscapeManualGain);
    set({
      landscapeAutoMode: false,
      landscapeShutterMode: 'pro',
      landscapeManualExposure: exposure,
      landscapeManualGain: gain,
    });
    state.sendInstruction(CAMERA_INSTRUCTIONS.switchAutoMode, [1]);
    state.sendInstruction(CAMERA_INSTRUCTIONS.changeStreamingSetting, [exposure, gain]);
  },

  // The board's `start_streaming_exposure(exposure, gain)` takes gain as a
  // required positional argument, so auto mode has to pass the -1 "let the
  // board decide" placeholder that the ROI path already relies on. Sending
  // only ['auto'] makes the board raise a missing-argument TypeError.
  startStreaming: (mode = 'auto') => {
    _useCameraStore.getState().sendInstruction(CAMERA_INSTRUCTIONS.startStreaming, [mode, -1]);
  },
  startStreamingManual: (exposure, gain) => {
    set({
      landscapeManualExposure: clampExposure(exposure),
      landscapeManualGain: clampGain(gain),
    });
    const state = _useCameraStore.getState();
    state.sendInstruction(CAMERA_INSTRUCTIONS.startStreaming, [
      state.landscapeManualExposure,
      state.landscapeManualGain,
    ]);
  },
  stopStreaming: () => _useCameraStore.getState().sendInstruction(CAMERA_INSTRUCTIONS.stopStreaming),
  changeStreamingSetting: (exposure, gain) => {
    set({
      landscapeManualExposure: clampExposure(exposure),
      landscapeManualGain: clampGain(gain),
    });
    scheduleStreamingSetting();
  },
  changeWhiteBalance: (cct) => {
    set({ landscapeWhiteBalance: cct });
    _useCameraStore.getState().sendInstruction(CAMERA_INSTRUCTIONS.setWhiteBalance, [cct]);
  },
  changeEv: (ev) => {
    set({ landscapeEv: ev });
    _useCameraStore.getState().sendInstruction(CAMERA_INSTRUCTIONS.setEv, [ev]);
  },
  captureStreamFrame: (path) => {
    _useCameraStore.getState().sendInstruction(
      CAMERA_INSTRUCTIONS.captureStreamFrame,
      path ? [path] : [],
    );
  },
  startRecording: baseName => _useCameraStore.getState().sendInstruction(
    CAMERA_INSTRUCTIONS.startRecording,
    [baseName || `record_${Date.now()}`],
  ),
  stopRecording: () => _useCameraStore.getState().sendInstruction(CAMERA_INSTRUCTIONS.stopRecording),

  startLandscapeCapture: () => {
    const state = _useCameraStore.getState();
    if (!canStartLandscapeAction(state))
      return;
    const path = `/mnt/sdcard/Pictures/stream_frame_${Date.now()}.jpg`;
    set({
      landscapeCaptureState: 'capturing',
      landscapeCapturePendingId: path,
      lastCommandError: null,
    });
    clearCaptureTimer();
    // This firmware publishes the completed JPEG in `camera_state.last_result`
    // rather than always replying to capture_stream_frame itself.
    state.requestCameraState();
    captureStatePoll = setInterval(() => {
      _useCameraStore.getState().requestCameraState();
    }, 300);
    captureTimer = setTimeout(() => finishLandscapeCapture(null), LANDSCAPE_CAPTURE_TIMEOUT_MS);
    state.captureStreamFrame(path);
  },
  startLandscapeCountdown: (seconds) => {
    if (!canStartLandscapeAction(_useCameraStore.getState()))
      return;
    clearCountdownTimer();
    set({ landscapeCaptureState: 'countdown', landscapeCountdownRemaining: seconds });
    countdownTimer = setInterval(() => {
      const remaining = _useCameraStore.getState().landscapeCountdownRemaining;
      if (remaining <= 1) {
        clearCountdownTimer();
        set({ landscapeCaptureState: 'idle', landscapeCountdownRemaining: 0 });
        _useCameraStore.getState().startLandscapeCapture();
        return;
      }
      set({ landscapeCountdownRemaining: remaining - 1 });
    }, 1000);
  },
  cancelLandscapeTimerCapture: () => {
    clearCountdownTimer();
    set({ landscapeCaptureState: 'idle', landscapeCountdownRemaining: 0 });
  },
  startLandscapeRepeat: () => {
    const state = _useCameraStore.getState();
    if (!canStartLandscapeAction(state) || state.landscapeRepeatState !== 'idle')
      return;
    repeatCancelled = false;
    set({ landscapeRepeatState: 'running', landscapeRepeatCurrent: 0 });
    runLandscapeRepeatStep();
  },
  cancelLandscapeRepeat: () => {
    repeatCancelled = true;
    clearRepeatTimer();
    set({ landscapeRepeatState: 'cancelling' });
  },
  startLandscapeRecording: () => {
    const state = _useCameraStore.getState();
    if (state.landscapeRecordingState !== 'idle' || state.landscapeRepeatState !== 'idle')
      return;
    const baseName = formatRecordingBaseName();
    clearRecordingTimer();
    recordingTimer = setTimeout(() => {
      if (_useCameraStore.getState().landscapeRecordingState === 'starting') {
        set({
          landscapeRecordingState: 'idle',
          landscapeRecordingBaseName: '',
          lastCommandError: '录像启动超时',
        });
      }
    }, RECORDING_COMMAND_TIMEOUT_MS);
    set({
      landscapeRecordingState: 'starting',
      landscapeRecordingBaseName: baseName,
      lastCommandError: null,
    });
    state.startRecording(baseName);
  },
  stopLandscapeRecording: () => {
    const state = _useCameraStore.getState();
    if (state.landscapeRecordingState !== 'recording')
      return;
    clearRecordingTimer();
    recordingTimer = setTimeout(() => {
      if (_useCameraStore.getState().landscapeRecordingState === 'processing') {
        set({ landscapeRecordingState: 'idle', lastCommandError: '停止录像超时' });
      }
    }, RECORDING_COMMAND_TIMEOUT_MS);
    set({ landscapeRecordingState: 'processing', lastCommandError: null });
    state.stopRecording();
  },

  requestCameraStatus: () => sendCameraCommand('get_camera_status', []),
  requestBattery: () => {
    console.log('[WS] 请求电池信息');
    sendCameraCommand('get_battery', []);
  },
  requestDisk: () => {
    console.log('[WS] 请求磁盘信息');
    sendCameraCommand('get_disk', []);
  },
  setGain: gain => sendCameraCommand('set_gain', [gain]),
  setStretch: enabled => sendCameraCommand('set_stretch', [enabled]),
  startExposure: () => {
    const { currentExposureConfig } = _useCameraStore.getState();
    sendCameraCommand('start_exposure', [currentExposureConfig.exposure_time, true, '', 'SINGLE']);
  },
  startRepeatExposure: (repeat) => {
    const { currentExposureConfig } = _useCameraStore.getState();
    sendCameraCommand('start_exposure_repeat', [
      currentExposureConfig.exposure_time,
      repeat,
      true,
      '',
      'camera-store',
    ]);
  },
  abortExposure: () => sendCameraCommand('abort_exposure', []),
  stopRepeatExposure: () => sendCameraCommand('stop_exposure_repeat', []),
  setCameraStatus: cameraStatus => set({ cameraStatus }),
  setConnectionStatus: connectionStatus => set({ connectionStatus }),
  setPower: (power, charging) => set({
    powerLevel: power < 0 ? null : power,
    inCharge: charging === 1,
  }),
  setDisk: (usedSpace, allSpace) => set({ usedSpace, allSpace }),
  setSerial: serial => set({ serial }),
  setVersion: version => set({ version }),
  setNewestCameraJpgUrl: newestCameraJpgUrl => set({ newestCameraJpgUrl }),
  setNewestStreamJpgUrl: newestStreamJpgUrl => set({ newestStreamJpgUrl }),
  setWifiBand: wifiBand => set({ wifiBand }),
  setShowConnectionModal: show => set({ showConnectionModal: show }),
  setCurrentExposureConfig: currentExposureConfig => set({ currentExposureConfig }),
  addExposureConfig: (config) => {
    const nextId = Math.max(0, ..._useCameraStore.getState().exposureConfigs.map(item => item.id)) + 1;
    const next = { ...config, id: nextId };
    set(state => ({
      exposureConfigs: [...state.exposureConfigs, next],
      currentExposureConfig: next,
    }));
  },
  updateExposureConfig: config => set(state => ({
    exposureConfigs: state.exposureConfigs.map(item => item.id === config.id ? config : item),
    currentExposureConfig: config,
  })),
  deleteExposureConfig: id => set((state) => {
    const exposureConfigs = state.exposureConfigs.filter(item => item.id !== id);
    const currentExposureConfig = state.currentExposureConfig.id === id
      ? (exposureConfigs[0] ?? DEFAULT_CURRENT_CONFIG)
      : state.currentExposureConfig;

    return { exposureConfigs, currentExposureConfig };
  }),
}));

export const useCameraStore = createSelectors(_useCameraStore);

function sendCameraCommand(instruction: string, params: unknown[]): void {
  cameraWebSocket?.send({
    device_name: 'main_camera',
    instruction,
    params,
    id: 'CAMERA',
  });
}

function handleCameraMessage(
  message: CameraWebSocketMessage,
  set: (partial: Partial<CameraState>) => void,
): void {
  if ('metadata' in message) {
    return;
  }

  if (message.device_name !== 'main_camera') {
    return;
  }

  // Release `sendCommandWait` before the failure branch below returns early,
  // otherwise a failed command would hang its caller until the timeout.
  const commandId = message.id;
  if (typeof commandId === 'string') {
    const resolve = pendingCommands.get(commandId);
    if (resolve) {
      pendingCommands.delete(commandId);
      resolve({ msg: message, elapsedMs: 0 });
    }
  }

  // A failed command must release whatever state machine was waiting on it,
  // otherwise the UI stays stuck in "capturing" / "recording" forever.
  if ((message as { success?: boolean }).success === false) {
    const failure = message as { error?: string; message?: string };
    set({ lastCommandError: failure.error ?? failure.message ?? 'Camera command failed' });
    if (message.instruction === CAMERA_INSTRUCTIONS.captureStreamFrame) {
      finishLandscapeCapture(null);
    }
    if (message.instruction === CAMERA_INSTRUCTIONS.startRecording) {
      clearRecordingTimer();
      set({ landscapeRecordingState: 'idle', landscapeRecordingBaseName: '' });
    }
    if (message.instruction === CAMERA_INSTRUCTIONS.stopRecording) {
      finishRecording(null);
    }
    return;
  }

  switch (message.instruction) {
    case CAMERA_INSTRUCTIONS.cameraState: {
      if (typeof message.data !== 'object' || message.data === null)
        break;
      const state = message.data as BoardCameraState;
      const busy = state.busy;
      const cameraStatus: CameraStatus = state.recording || busy === 'recording'
        ? 'recording'
        : state.streaming || busy === 'streaming'
          ? 'in_streaming'
          : busy === 'repeating'
            ? 'in_repeat'
            : busy === 'exposing' ? 'in_exposure' : 'idle';
      const update: Partial<CameraState> = {
        cameraState: state,
        cameraStatus,
        streamingInProgress: state.streaming === true,
        lastCommandError: null,
      };
      const jpgPath = state.last_result?.jpg_path;
      if (typeof jpgPath === 'string') {
        update.newestCameraJpgUrl = jpgPath;
        update.newestStreamJpgUrl = jpgPath;
      }
      const videoName = state.last_result?.video_name;
      if (typeof videoName === 'string' && videoName) {
        update.landscapeLatestVideoName = videoName;
      }
      set(update);
      // `capture_stream_frame` reports completion through camera_state on this
      // firmware, not necessarily through its own instruction response.
      if (typeof jpgPath === 'string' && _useCameraStore.getState().landscapeCaptureState === 'capturing') {
        finishLandscapeCapture(jpgPath);
      }
      if (state.recording || busy === 'recording') {
        const current = _useCameraStore.getState();
        if (current.landscapeRecordingState === 'starting' || current.landscapeRecordingState === 'idle') {
          clearRecordingTimer();
          set({ landscapeRecordingState: 'recording', cameraStatus: 'recording' });
        }
      }
      else if (_useCameraStore.getState().landscapeRecordingState === 'recording' && state.streaming) {
        finishRecording(extractVideoName(state.last_result));
      }
      break;
    }
    case CAMERA_INSTRUCTIONS.changeStreamingSetting:
      break;
    case CAMERA_INSTRUCTIONS.captureStreamFrame: {
      const data = message.data as Record<string, unknown> | undefined;
      const jpgPath = typeof data?.jpg_path === 'string'
        ? data.jpg_path
        : typeof data?.path === 'string' ? data.path : null;
      if (jpgPath) {
        set({ newestStreamJpgUrl: jpgPath, newestCameraJpgUrl: jpgPath });
      }
      finishLandscapeCapture(jpgPath);
      break;
    }
    case CAMERA_INSTRUCTIONS.startRecording:
      if (_useCameraStore.getState().landscapeRecordingState === 'starting') {
        clearRecordingTimer();
        set({ landscapeRecordingState: 'recording', cameraStatus: 'recording' });
      }
      break;
    case CAMERA_INSTRUCTIONS.stopRecording:
      finishRecording(extractVideoName(message.data));
      break;
    case 'get_camera_status':
      if (isCameraStatus(message.data)) {
        set({ cameraStatus: message.data });
      }
      break;
    case 'battery':
      if (typeof message.power === 'number') {
        console.log('[WS] 收到电池信息:', message.power, message.in_charging);
        set({
          powerLevel: message.power < 0 ? null : message.power,
          inCharge: message.in_charging === 1,
        });
      }
      break;
    case 'disk':
      if (typeof message.used_space === 'number' && typeof message.all_space === 'number') {
        console.log('[WS] 收到磁盘信息:', message.used_space, message.all_space);
        set({ usedSpace: message.used_space, allSpace: message.all_space });
      }
      break;
    case CAMERA_INSTRUCTIONS.switchWifiBand:
      if (message.data !== undefined && message.data !== null) {
        if (typeof message.data === 'object') {
          const data = message.data as Record<string, unknown>;
          const band = data.band;
          if (band === '5G' || band === '5g') {
            set({ wifiBand: true });
          }
          else if (band === '2.4G' || band === '2.4g') {
            set({ wifiBand: false });
          }
        }
        else if (typeof message.data === 'number') {
          set({ wifiBand: message.data === 1 });
        }
      }
      break;
  }
}

function isCameraStatus(value: unknown): value is CameraStatus {
  return value === 'idle'
    || value === 'in_repeat'
    || value === 'in_streaming'
    || value === 'in_exposure';
}
