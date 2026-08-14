/* eslint-disable max-lines-per-function */

import type {
  CameraJsonMessage,
  CameraWebSocketMessage,
} from './services/websocket-protocol';
import type { CameraWebSocketStatus } from './services/websocket-service';
import type { CameraSerial, CameraVersion } from './types';

import { create } from 'zustand';
import { createSelectors } from '@/lib/utils';
import { getCameraWebSocketUrl } from './config';
import { CameraWebSocketService } from './services/websocket-service';

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
  powerLevel: number;
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

  landscapeShutterMode: LandscapeShutterMode;
  landscapeCaptureMode: LandscapeCaptureMode;
  landscapeCaptureState: LandscapeCaptureState;
  landscapeCountdownRemaining: number;
  landscapeCapturePendingId: string | null;
  landscapeAutoMode: boolean;
  landscapeManualExposure: number;
  landscapeManualGain: number;
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
  switchAutoMode: (auto: boolean) => void;
  startStreaming: (mode: 'auto') => void;
  startStreamingManual: (exposure: number, gain: number) => void;
  stopStreaming: () => void;
  changeStreamingSetting: (exposure: number, gain: number) => void;
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
  sendCommand: (message: CameraJsonMessage) => void;
  requestCameraStatus: () => void;
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

function nextCommandId(): string {
  commandSequence += 1;
  return `APP-${Date.now().toString(36)}-${commandSequence}`;
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
  powerLevel: 92,
  inCharge: true,
  usedSpace: null,
  allSpace: null,
  serial: null,
  version: null,
  newestCameraJpgUrl: '',
  newestStreamJpgUrl: '',
  remainingExposureTime: 0,
  lastCommandError: null,
  cameraState: null,

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
    if (!cameraWebSocket) {
      cameraWebSocket = new CameraWebSocketService({
        url: getCameraWebSocketUrl(),
        onStatusChange: (status) => {
          set({ connectionStatus: status });
          if (status === 'open') {
            _useCameraStore.getState().requestCameraState();
            _useCameraStore.getState().requestCameraStatus();
          }
        },
        onMessage: message => handleCameraMessage(message, set),
        /** Camera is unreachable — switch to mock mode. */
        onGiveUp: () => set({
          connectionStatus: 'error',
          isMockMode: true,
          // Provide reasonable mock values so the UI renders correctly.
          powerLevel: 92,
          inCharge: true,
          usedSpace: 15 * 1024 * 1024 * 1024,
          allSpace: 32 * 1024 * 1024 * 1024,
        }),
      });
    }
    cameraWebSocket.connect();
  },
  disconnect: () => {
    cameraWebSocket?.close();
    cameraWebSocket = null;
    set({ connectionStatus: 'closed', isMockMode: false });
  },
  sendCommand: (message) => {
    cameraWebSocket?.send(message);
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

  switchAutoMode: (auto) => {
    // Entering manual seeds the sliders from the board's live AE values so the
    // picture does not jump; returning to auto keeps the manual values intact.
    const state = _useCameraStore.getState();
    const exposure = auto
      ? state.landscapeManualExposure
      : clampExposure(state.landscapeManualExposure);
    const gain = auto
      ? state.landscapeManualGain
      : clampGain(state.landscapeManualGain);
    set({
      landscapeAutoMode: auto,
      landscapeShutterMode: auto ? 'auto' : 'pro',
      landscapeManualExposure: exposure,
      landscapeManualGain: gain,
    });
    _useCameraStore.getState().sendInstruction(CAMERA_INSTRUCTIONS.switchAutoMode, [auto ? 0 : 1]);
  },

  startStreaming: (mode = 'auto') => {
    _useCameraStore.getState().sendInstruction(CAMERA_INSTRUCTIONS.startStreaming, [mode]);
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
    powerLevel: power,
    inCharge: charging === 1,
  }),
  setDisk: (usedSpace, allSpace) => set({ usedSpace, allSpace }),
  setSerial: serial => set({ serial }),
  setVersion: version => set({ version }),
  setNewestCameraJpgUrl: newestCameraJpgUrl => set({ newestCameraJpgUrl }),
  setNewestStreamJpgUrl: newestStreamJpgUrl => set({ newestStreamJpgUrl }),
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
        set({
          powerLevel: message.power,
          inCharge: message.in_charging === 1,
        });
      }
      break;
    case 'disk':
      if (typeof message.used_space === 'number' && typeof message.all_space === 'number') {
        set({ usedSpace: message.used_space, allSpace: message.all_space });
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
