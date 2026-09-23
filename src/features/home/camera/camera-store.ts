/* eslint-disable max-lines-per-function */

import type {
  CameraJsonMessage,
  CameraWebSocketMessage,
} from './services/websocket-protocol';
import type { CameraWebSocketStatus } from './services/websocket-service';
import type { CameraTransport, CameraTransportPreference } from './transport';
import type { CameraSerial, CameraVersion } from './types';

import { create } from 'zustand';
import { translate } from '@/lib/i18n';
import { createSelectors } from '@/lib/utils';
import { getCameraWebSocketUrl } from './config';
import { calculateEvLinkedExposure } from './ev-linkage';
import { syncBoardTime } from './services/startup-service';
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
    | 'starting'
    | 'stopping'
    | 'closed'
    | 'error'
    | 'unknown';

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
export type LandscapeRecordingState
  = | 'idle'
    | 'starting'
    | 'recording'
    | 'processing';
export type LandscapeRatio = 'full' | '16:9' | '4:3';

export type LandscapeTimerPlan = {
  count: number;
  interval: number;
};

export type CameraErrorPayload = {
  code?: number;
  name?: string;
  operation?: string;
  at_uptime_ms?: number;
};

export type BoardCameraState = {
  schema_version?: number;
  seq?: number;
  busy?: string;
  streaming?: boolean;
  recording?: boolean;
  fault_active?: boolean;
  flags?: {
    repeat_active?: boolean;
    storage_ready?: boolean;
  };
  last_error?: CameraErrorPayload | null;
  preview?: {
    exposure_s?: number;
    gain?: number;
    target_gain_percent?: number | null;
    actual_gain_percent?: number | null;
    gain_mode?: string;
  };
  job?: {
    target_gain_percent?: number | null;
  };
  last_result?: { jpg_path?: string; video_name?: string | null };
};

export function mapBoardStateToCameraStatus(
  data: BoardCameraState | null | undefined,
): CameraStatus {
  if (!data || typeof data !== 'object') {
    return 'unknown';
  }
  if (data.fault_active === true || data.busy === 'error') {
    return 'error';
  }
  const busy
    = typeof data.busy === 'string' ? data.busy.trim().toLowerCase() : '';
  switch (busy) {
    case 'idle':
      return 'idle';
    case 'streaming':
      return 'in_streaming';
    case 'recording':
      return 'recording';
    case 'repeating':
      return 'in_repeat';
    case 'exposing':
      return 'in_exposure';
    case 'starting':
      return 'starting';
    case 'stopping':
      return 'stopping';
    case 'closed':
      return 'closed';
    case 'error':
      return 'error';
    default:
      if (!busy) {
        if (data.recording === true)
          return 'recording';
        if (data.streaming === true)
          return 'in_streaming';
      }
      return 'unknown';
  }
}

export function mapLegacyStatusToCameraStatus(data: unknown): CameraStatus {
  if (typeof data !== 'string') {
    return 'unknown';
  }
  const s = data.trim().toLowerCase();
  switch (s) {
    case 'idle':
      return 'idle';
    case 'in_streaming':
      return 'in_streaming';
    case 'in_repeat':
      return 'in_repeat';
    case 'in_exposure':
      return 'in_exposure';
    case 'starting':
      return 'starting';
    case 'stopping':
      return 'stopping';
    case 'closed':
      return 'closed';
    case 'error':
      return 'error';
    default:
      return 'unknown';
  }
}

export const STORAGE_ERROR_TRANSLATIONS: Record<string, string> = {
  'NO_CARD': '未检测到 TF 卡',
  '-20': '未检测到 TF 卡',
  'CARD_NOT_MOUNTED': 'TF 卡未挂载，暂时无法保存',
  '-21': 'TF 卡未挂载，暂时无法保存',
  'CARD_READ_ONLY': 'TF 卡只读，无法保存',
  '-22': 'TF 卡只读，无法保存',
  'CARD_FULL': 'TF 卡空间不足',
  '-23': 'TF 卡空间不足',
  'STORAGE_IO_ERROR': '存储读写失败',
  '-24': '存储读写失败',
  'INVALID_STORAGE_PATH': '保存路径无效',
  '-25': '保存路径无效',
};

export const CAMERA_OPERATION_KEY_MAP: Record<string, string> = {
  change_streaming_frame_rate: 'change_streaming_frame_rate',
  change_streaming_setting: 'change_streaming_setting',
  ev_set: 'ev_set',
  record_start: 'record_start',
  record_stop: 'record_stop',
  roi_set: 'roi_set',
  ser_start: 'ser_start',
  set_ev: 'set_ev',
  set_gain: 'set_gain',
  set_sensor_roi: 'set_sensor_roi',
  set_stretch: 'set_stretch',
  set_white_balance: 'set_white_balance',
  streaming_frame_rate_set: 'streaming_frame_rate_set',
  streaming_setting_set: 'streaming_setting_set',
  switch_auto_mode: 'switch_auto_mode',
  white_balance_set: 'white_balance_set',
};

export const FIRMWARE_CODE_TO_ERROR_NAME: Record<number, string> = {
  [-1]: 'FAILED',
  [-2]: 'INVALID_PARAM',
  [-3]: 'NOT_READY',
  [-4]: 'BUSY',
  [-5]: 'NOT_SUPPORTED',
  [-6]: 'BUFFER_TOO_SMALL',
  [-7]: 'ADAPTER',
  [-8]: 'NOT_FOUND',
};

export const GENERIC_ERROR_NAME_KEYS: Record<string, string> = {
  ADAPTER: 'adapter',
  BAD_COMMAND: 'bad_command',
  BUFFER_SMALL: 'buffer_too_small',
  BUFFER_TOO_SMALL: 'buffer_too_small',
  BUSY: 'busy',
  FAILED: 'failed',
  INVALID_PARAM: 'invalid_param',
  NOT_FOUND: 'not_found',
  NOT_READY: 'not_ready',
  NOT_SUPPORTED: 'not_supported',
  TIMEOUT: 'timeout',
  UNKNOWN: 'unknown',
};

export function getCameraOperationLabel(op?: string): string {
  if (op) {
    const key = CAMERA_OPERATION_KEY_MAP[op.trim().toLowerCase()];
    if (key) {
      return translate(`camera_error.operation.${key}` as Parameters<typeof translate>[0]);
    }
  }
  return translate('camera_error.operation.unknown');
}

export function formatGenericCameraError(
  op: string | undefined,
  name: string,
): string {
  const opLabel = getCameraOperationLabel(op);
  const normalizedName = name.trim().toUpperCase();
  const key = GENERIC_ERROR_NAME_KEYS[normalizedName];

  if (normalizedName === 'FAILED' || normalizedName === 'UNKNOWN') {
    return translate('camera_error.format_retry', { op: opLabel });
  }

  if (key) {
    const reason = translate(`camera_error.name.${key}` as Parameters<typeof translate>[0]);
    return translate('camera_error.format_with_reason', { op: opLabel, reason });
  }

  return translate('camera_error.format_retry', { op: opLabel });
}

export function formatCameraErrorMessage(
  failure: unknown,
  defaultFallback = '操作失败',
): string {
  if (typeof failure === 'string' && failure.trim() && failure !== 'see data') {
    const trimmed = failure.trim();
    for (const [key, translated] of Object.entries(STORAGE_ERROR_TRANSLATIONS)) {
      if (trimmed === key || trimmed.includes(`${key}(`) || trimmed.endsWith(`:${key}`)) {
        return translated;
      }
    }
    const upperTrimmed = trimmed.toUpperCase();
    if (GENERIC_ERROR_NAME_KEYS[upperTrimmed]) {
      return formatGenericCameraError(undefined, upperTrimmed);
    }
    return trimmed;
  }
  if (typeof failure === 'object' && failure !== null) {
    const rec = failure as Record<string, unknown>;
    const err = rec.error;
    if (typeof err === 'object' && err !== null) {
      const errObj = err as Record<string, unknown>;
      const op
        = typeof errObj.operation === 'string'
          ? errObj.operation.trim()
          : typeof rec.instruction === 'string'
            ? rec.instruction.trim()
            : '';
      const code = typeof errObj.code === 'number' ? errObj.code : undefined;
      const rawName = typeof errObj.name === 'string' ? errObj.name.trim() : '';
      const name = rawName || (code !== undefined ? FIRMWARE_CODE_TO_ERROR_NAME[code] || '' : '');

      const mappedStorage
        = STORAGE_ERROR_TRANSLATIONS[rawName]
          || (code !== undefined ? STORAGE_ERROR_TRANSLATIONS[String(code)] : undefined);
      if (mappedStorage) {
        return mappedStorage;
      }

      const upperName = name.toUpperCase();
      if (GENERIC_ERROR_NAME_KEYS[upperName]) {
        console.warn(`[CameraError] ${op}: ${rawName || name}(${code ?? ''})`);
        return formatGenericCameraError(op, upperName);
      }

      if (op || rawName || code !== undefined) {
        const namePart = rawName
          ? code !== undefined
            ? `${rawName}(${code})`
            : rawName
          : code !== undefined
            ? `(${code})`
            : '';
        return op ? `${op}: ${namePart}`.trim() : namePart;
      }
    }
    if (typeof err === 'string' && err.trim() && err !== 'see data') {
      const trimmedErr = err.trim();
      for (const [key, translated] of Object.entries(STORAGE_ERROR_TRANSLATIONS)) {
        if (trimmedErr === key || trimmedErr.includes(key)) {
          return translated;
        }
      }
      const upperErr = trimmedErr.toUpperCase();
      if (GENERIC_ERROR_NAME_KEYS[upperErr]) {
        const op = typeof rec.instruction === 'string' ? rec.instruction.trim() : undefined;
        return formatGenericCameraError(op, upperErr);
      }
      return trimmedErr;
    }
    const msg = typeof rec.message === 'string' ? rec.message.trim() : '';
    if (msg && msg !== 'see data') {
      for (const [key, translated] of Object.entries(STORAGE_ERROR_TRANSLATIONS)) {
        if (msg === key || msg.includes(key)) {
          return translated;
        }
      }
      const upperMsg = msg.toUpperCase();
      if (GENERIC_ERROR_NAME_KEYS[upperMsg]) {
        const op = typeof rec.instruction === 'string' ? rec.instruction.trim() : undefined;
        return formatGenericCameraError(op, upperMsg);
      }
      return msg;
    }
  }
  return defaultFallback;
}

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

/** App-supported manual exposure range in seconds (up to 60s long exposure). */
function clampExposure(value: number): number {
  return Number.isNaN(value) ? 0.001 : Math.min(60, Math.max(0.001, value));
}

/** Camera Gain is unified to integer 0~100 with step 1 per 2026-09-20 spec. */
export function clampGain(value: number): number {
  return Number.isNaN(value)
    ? 0
    : Math.min(100, Math.max(0, Math.round(value)));
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
  gainPercentSupported: boolean | null;
  storageReady: boolean | null;
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
  landscapeBaseExposure: number;
  landscapeBaseGain: number;
  landscapeManualExposure: number;
  landscapeManualGain: number;
  landscapeWhiteBalance: number;
  landscapeEv: number;
  landscapeWatermark: boolean;
  landscapeRatio: LandscapeRatio;
  landscapeApplyingRatio: boolean;
  landscapeRatioVersion: number;
  landscapeTimerPlan: LandscapeTimerPlan;
  landscapeRepeatState: LandscapeRepeatState;
  landscapeRepeatCurrent: number;
  landscapeRecordingState: LandscapeRecordingState;
  landscapeRecordingBaseName: string;
  landscapeRecordingVideoName: string;
  landscapeLatestVideoName: string;
  desiredStreamingFps: number;

  sendInstruction: (instruction: string, params?: unknown[]) => void;
  requestCameraState: () => void;
  setDesiredStreamingFps: (fps: number) => void;
  changeStreamingFrameRate: (mode: number, rate: number) => void;
  setLandscapeShutterMode: (mode: LandscapeShutterMode) => void;
  setLandscapeCaptureMode: (mode: LandscapeCaptureMode) => void;
  setLandscapeTimerPlan: (plan: LandscapeTimerPlan) => void;
  setLandscapeWatermark: (enabled: boolean) => void;
  setLandscapeRatio: (ratio: LandscapeRatio) => void;
  setLandscapeSensorRatio: (ratio: Exclude<LandscapeRatio, 'full'>) => void;
  switchAutoMode: (auto: boolean) => void;
  startStreaming: (mode?: 'auto') => Promise<CommandWaitResult>;
  startStreamingManual: (
    exposure: number,
    gain: number,
  ) => Promise<CommandWaitResult>;
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
  startExposure: 'start_exposure',
  startExposureRepeat: 'start_exposure_repeat',
  abortExposure: 'abort_exposure',
  stopExposureRepeat: 'stop_exposure_repeat',
  nebulaCapture: 'nebula_capture',
  changeStreamingSetting: 'change_streaming_setting',
  switchAutoMode: 'switch_auto_mode',
  startRecording: 'streaming_start_save',
  stopRecording: 'streaming_stop_save',
  startPlateSolve: 'start_plate_solve',
  setWhiteBalance: 'set_white_balance',
  setEv: 'set_ev',
  switchWifiBand: 'switch_wifi_band',
  setSensorRoi: 'set_sensor_roi',
  changeStreamingFrameRate: 'change_streaming_frame_rate',
} as const;

export const GAIN_PERCENT_COMMANDS = new Set([
  'set_gain',
  'change_streaming_setting',
  'start_streaming_exposure',
  'start_streaming_exposure_and_save',
  'nebula_capture',
  'change_set_params',
]);

export function normalizeCameraCommand(message: CameraJsonMessage): {
  valid: boolean;
  message: CameraJsonMessage;
  error?: string;
} {
  const instruction
    = typeof message.instruction === 'string' ? message.instruction : '';

  const copy: CameraJsonMessage = GAIN_PERCENT_COMMANDS.has(instruction)
    ? { ...message, gain_unit: 'percent' }
    : { ...message };
  const params = Array.isArray(copy.params) ? [...copy.params] : [];

  const isValidGain = (g: unknown) =>
    typeof g === 'number'
    && !Number.isNaN(g)
    && Number.isInteger(g)
    && g >= 0
    && g <= 100;

  if (instruction === 'set_stretch') {
    if (params.length !== 1) {
      return {
        valid: false,
        message,
        error: 'set_stretch 参数必须为单个布尔值或 0/1',
      };
    }
    const val = params[0];
    if (val === true || val === 1) {
      copy.params = [1];
    }
    else if (val === false || val === 0) {
      copy.params = [0];
    }
    else {
      return {
        valid: false,
        message,
        error: 'set_stretch 参数必须为布尔值或 0/1',
      };
    }
  }
  else if (instruction === 'switch_auto_mode') {
    const val = params[0];
    if (val === 1 || val === true) {
      params[0] = 1;
      copy.params = params;
    }
    else if (val === 0 || val === false) {
      params[0] = 0;
      copy.params = params;
    }
    else {
      return {
        valid: false,
        message,
        error: 'switch_auto_mode 模式参数必须为 0 或 1',
      };
    }
  }
  else if (instruction === 'set_ev') {
    const ev = params[0];
    if (typeof ev !== 'number' || !Number.isFinite(ev) || ev < -3 || ev > 3) {
      return {
        valid: false,
        message,
        error: 'set_ev 曝光补偿值必须在 -3 到 3 之间',
      };
    }
    copy.params = params;
  }
  else if (instruction === 'set_white_balance') {
    const wb = params[0];
    const isValidWb
      = typeof wb === 'number'
        && Number.isInteger(wb)
        && (wb === 0 || (wb >= 2000 && wb <= 10000));
    if (!isValidWb) {
      return {
        valid: false,
        message,
        error: 'set_white_balance 白平衡值必须为 0 或 2000~10000 的整数',
      };
    }
    copy.params = params;
  }
  else if (instruction === 'change_streaming_frame_rate') {
    const mode = params[0];
    const isValidMode
      = mode === 0 || mode === 1 || mode === false || mode === true;
    if (!isValidMode) {
      return {
        valid: false,
        message,
        error: 'change_streaming_frame_rate 模式必须为 0 或 1',
      };
    }
    params[0] = mode === 1 || mode === true ? 1 : 0;
    const fps = params[1];
    if (fps !== null && fps !== undefined) {
      const isValidFps
        = typeof fps === 'number' && Number.isInteger(fps) && fps >= 1 && fps <= 60;
      if (!isValidFps) {
        return {
          valid: false,
          message,
          error: 'change_streaming_frame_rate 帧率必须为 1~60 的整数',
        };
      }
      params[1] = fps;
    }
    copy.params = params;
  }
  else if (instruction === 'set_gain') {
    const gain = params[0];
    if (!isValidGain(gain)) {
      return {
        valid: false,
        message,
        error: 'set_gain 增益值必须为 0~100 的整数',
      };
    }
    copy.params = [gain];
  }
  else if (
    instruction === 'change_streaming_setting'
    || instruction === 'start_streaming_exposure'
    || instruction === 'start_streaming_exposure_and_save'
  ) {
    const exposure = params[0];
    if (exposure !== 'auto' && exposure !== null && exposure !== undefined) {
      const isValidExposure
        = typeof exposure === 'number' && Number.isFinite(exposure) && exposure > 0;
      if (!isValidExposure) {
        return {
          valid: false,
          message,
          error: `${instruction} 曝光值必须为大于 0 的数字、'auto' 或 null`,
        };
      }
    }
    const gain = params[1];
    if (gain !== null && gain !== undefined) {
      if (!isValidGain(gain)) {
        return {
          valid: false,
          message,
          error: `${instruction} 增益值必须为 0~100 的整数或 null`,
        };
      }
      params[1] = gain;
    }
    copy.params = params;
  }
  else if (instruction === 'nebula_capture') {
    const gain = params[1];
    if (!isValidGain(gain)) {
      return {
        valid: false,
        message,
        error: 'nebula_capture 增益值必须为 0~100 的整数',
      };
    }
    copy.params = params;
  }

  return { valid: true, message: copy };
}

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
let repeatSessionTimer: ReturnType<typeof setTimeout> | null = null;
let recordingTimer: ReturnType<typeof setTimeout> | null = null;
let sensorRatioTimer: ReturnType<typeof setTimeout> | null = null;
let repeatCancelled = false;
let currentConnectionSeq = -1;
let detailedStatusSupported = true;
let activeFaultPresent = false;

function resetStatusTracking(): void {
  currentConnectionSeq = -1;
  detailedStatusSupported = true;
  activeFaultPresent = false;
}
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
  // A manual preference is a statement about the user's physical setup. Moving
  // them to the other link would hide the very failure they are debugging, so
  // only `auto` may switch; manual links surface the error instead.
  if (state.transportPreference !== 'auto')
    return;
  if (state.transportProbing)
    return;
  if (
    disconnectedSince === null
    || Date.now() - disconnectedSince < TRANSPORT_FALLBACK_GRACE_MS
  ) {
    return;
  }
  if (Date.now() - lastProbeAt < TRANSPORT_PROBE_MIN_INTERVAL_MS)
    return;

  lastProbeAt = Date.now();
  _useCameraStore.setState({ transportProbing: true });
  void probeTransports(state.transport)
    .then((reachable) => {
      if (reachable && reachable !== _useCameraStore.getState().transport) {
        console.log(
          '[CONN]',
          '当前通道故障断开，自动故障转移至可用通道:',
          reachable,
        );
        applyTransport(reachable);
      }
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
  if (repeatSessionTimer)
    clearTimeout(repeatSessionTimer);
  repeatTimer = null;
  repeatSessionTimer = null;
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
    if (state.desiredStreamingFps === 60 && state.landscapeManualExposure <= 0.0167) {
      state.sendInstruction(CAMERA_INSTRUCTIONS.changeStreamingFrameRate, [1, 60]);
    }
  }, delay);
}

function exposureTimeoutMs(exposure: number): number {
  return Math.max(10_000, exposure * 1000 + 15_000);
}

function startSensorExposure(exposure: number, uuid: string): void {
  _useCameraStore.getState().sendInstruction(CAMERA_INSTRUCTIONS.startExposure, [
    clampExposure(exposure),
    true,
    '',
    uuid,
  ]);
}

function startSensorExposureRepeat(exposure: number, count: number, uuid: string): void {
  _useCameraStore.getState().sendInstruction(CAMERA_INSTRUCTIONS.startExposureRepeat, [
    clampExposure(exposure),
    Math.max(1, Math.round(count)),
    true,
    '',
    uuid,
  ]);
}

/** Landscape actions are only safe while streaming and not already busy. */
function canStartLandscapeAction(
  state: CameraState,
  allowRunningRepeat = false,
): boolean {
  return (
    state.connectionStatus === 'open'
    && !state.landscapeApplyingRatio
    && state.landscapeCaptureState === 'idle'
    && (allowRunningRepeat
      ? state.landscapeRepeatState === 'running'
      || state.landscapeRepeatState === 'idle'
      : state.landscapeRepeatState === 'idle')
    && state.cameraStatus !== 'unknown'
    && state.cameraStatus !== 'error'
    && state.cameraStatus !== 'closed'
    && state.cameraStatus !== 'starting'
    && state.cameraStatus !== 'stopping'
    && state.cameraStatus !== 'in_exposure'
    && state.cameraStatus !== 'in_repeat'
    && state.cameraStatus !== 'recording'
  );
}

function finishLandscapeCapture(jpgPath: string | null): void {
  const state = _useCameraStore.getState();
  if (state.landscapeCaptureState !== 'capturing')
    return;
  clearCaptureTimer();
  _useCameraStore.setState({
    landscapeCaptureState: 'idle',
    landscapeCapturePendingId: null,
    lastCommandError: jpgPath
      ? activeFaultPresent
        ? state.lastCommandError
        : null
      : (state.lastCommandError ?? '风景拍照失败'),
  });
  if (_useCameraStore.getState().landscapeRepeatState === 'running') {
    advanceLandscapeRepeat();
  }
}

function advanceLandscapeRepeat(): void {
  const state = _useCameraStore.getState();
  if (repeatCancelled) {
    clearRepeatTimer();
    _useCameraStore.setState({
      landscapeRepeatState: 'idle',
      landscapeRepeatCurrent: 0,
    });
    return;
  }
  const next = state.landscapeRepeatCurrent + 1;
  _useCameraStore.setState({ landscapeRepeatCurrent: next });
  const { count, interval } = state.landscapeTimerPlan;
  if (next >= count) {
    clearRepeatTimer();
    _useCameraStore.setState({
      landscapeRepeatState: 'idle',
      landscapeRepeatCurrent: 0,
    });
    return;
  }
  repeatTimer = setTimeout(
    runLandscapeRepeatStep,
    Math.max(0, interval) * 1000,
  );
}

function runLandscapeRepeatStep(): void {
  const state = _useCameraStore.getState();
  if (repeatCancelled || state.landscapeRepeatState !== 'running') {
    clearRepeatTimer();
    _useCameraStore.setState({
      landscapeRepeatState: 'idle',
      landscapeRepeatCurrent: 0,
    });
    return;
  }
  if (state.landscapeRepeatCurrent >= state.landscapeTimerPlan.count) {
    clearRepeatTimer();
    _useCameraStore.setState({
      landscapeRepeatState: 'idle',
      landscapeRepeatCurrent: 0,
    });
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
  const resolved
    = videoName
      || state.landscapeRecordingVideoName
      || state.landscapeLatestVideoName;
  _useCameraStore.setState({
    landscapeRecordingState: 'idle',
    landscapeRecordingBaseName: '',
    landscapeRecordingVideoName: '',
    landscapeLatestVideoName: resolved || state.landscapeLatestVideoName,
  });
}

function formatRecordingBaseName(): string {
  return 'app_landscape';
}

const _useCameraStore = create<CameraState>(set => ({
  cameraStatus: 'unknown',
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
  storageReady: null,
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
  // Default manual gain 10 on the unified 0~100 scale.
  landscapeBaseExposure: 0.08,
  landscapeBaseGain: 10,
  landscapeManualExposure: 0.08,
  landscapeManualGain: 10,
  gainPercentSupported: null,
  landscapeWhiteBalance: 0,
  landscapeEv: 0,
  landscapeWatermark: true,
  landscapeRatio: 'full',
  landscapeApplyingRatio: false,
  landscapeRatioVersion: 0,
  landscapeTimerPlan: DEFAULT_TIMER_PLAN,
  landscapeRepeatState: 'idle',
  landscapeRepeatCurrent: 0,
  landscapeRecordingState: 'idle',
  landscapeRecordingBaseName: '',
  landscapeRecordingVideoName: '',
  landscapeLatestVideoName: '',
  desiredStreamingFps: 30,

  connect: () => {
    const wsUrl = getCameraWebSocketUrl();
    console.log('[CONN]', '=== connect 被调用 ===', {
      wsUrl,
      hasSocket: !!cameraWebSocket,
    });
    if (!cameraWebSocket) {
      console.log('[CONN]', '创建新的 CameraWebSocketService', { wsUrl });
      cameraWebSocket = new CameraWebSocketService({
        url: wsUrl,
        retryForever: true,
        onStatusChange: (status) => {
          console.log('[CONN]', 'WebSocket 状态变化', { status });
          set(
            status === 'open'
              ? { connectionStatus: status, isMockMode: false }
              : { connectionStatus: status },
          );
          if (status === 'open') {
            disconnectedSince = null;
            resetStatusTracking();
            set({
              connectionStatus: status,
              cameraStatus: 'unknown',
              cameraState: null,
              lastCommandError: null,
              isMockMode: false,
            });
            // The board boots at 2021 with no RTC, which corrupts capture
            // mtimes and hides new photos from the album's /list_images feed.
            // Fire-and-forget: syncBoardTime never rejects.
            void syncBoardTime();
            _useCameraStore.getState().requestCameraState();
            _useCameraStore.getState().sendInstruction('get_static_info', []);
          }
          else {
            resetStatusTracking();
            settlePendingCommands('设备连接已断开');
            clearCountdownTimer();
            clearRepeatTimer();
            clearCaptureTimer();
            if (sensorRatioTimer) {
              clearTimeout(sensorRatioTimer);
              sensorRatioTimer = null;
            }
            set({
              connectionStatus: status,
              cameraStatus: 'closed',
              cameraState: null,
              landscapeCaptureState: 'idle',
              landscapeRepeatState: 'idle',
              landscapeRepeatCurrent: 0,
              landscapeApplyingRatio: false,
            });
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
    resetStatusTracking();
    settlePendingCommands('设备连接已断开');
    clearCountdownTimer();
    clearRepeatTimer();
    clearCaptureTimer();
    if (sensorRatioTimer) {
      clearTimeout(sensorRatioTimer);
      sensorRatioTimer = null;
    }
    cameraWebSocket?.close();
    cameraWebSocket = null;
    set({
      connectionStatus: 'closed',
      cameraStatus: 'closed',
      cameraState: null,
      isMockMode: false,
      landscapeCaptureState: 'idle',
      landscapeRepeatState: 'idle',
      landscapeRepeatCurrent: 0,
      landscapeApplyingRatio: false,
    });
  },
  initTransport: () => {
    const preference = getTransportPreference();
    const activeTransport = getActiveTransport();
    console.log('[CONN]', '=== initTransport 开始 ===', {
      preference,
      activeTransport,
      wsUrl: getCameraWebSocketUrl(),
    });
    set({ transportPreference: preference, transport: activeTransport });
    if (preference !== 'auto') {
      setActiveTransport(preference);
      set({ transport: preference });
      console.log('[CONN]', '非 auto 模式，直接连接', {
        transport: preference,
      });
      _useCameraStore.getState().connect();
      return;
    }
    lastProbeAt = Date.now();
    set({ transportProbing: true });
    console.log('[CONN]', 'auto 模式，开始探测传输方式', {
      preferredTransport: activeTransport,
    });
    // Refresh the per-link view alongside the probe that picks the transport,
    // so the UI never shows reachability that contradicts the active link.
    void _useCameraStore.getState().refreshTransportReachability();
    void probeTransports(activeTransport)
      .then((reachable) => {
        console.log('[CONN]', '探测结果', {
          reachable,
          currentTransport: _useCameraStore.getState().transport,
        });
        if (reachable && reachable !== _useCameraStore.getState().transport) {
          console.log('[CONN]', '传输方式改变，应用新传输', {
            from: _useCameraStore.getState().transport,
            to: reachable,
          });
          applyTransport(reachable);
        }
        else {
          console.log('[CONN]', '传输方式不变，连接', {
            transport: reachable ?? activeTransport,
          });
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
    try {
      const norm = normalizeCameraCommand(message);
      if (!norm.valid) {
        console.warn('[CameraWS] 命令校验失败，拒绝发送:', norm.error);
        _useCameraStore.setState({ lastCommandError: norm.error });
        return;
      }
      cameraWebSocket?.send(norm.message);
    }
    catch {
      // ignore
    }
  },
  sendCommandWait: (instruction, params = [], timeoutMs = 30_000) => {
    const startedAt = Date.now();
    if (_useCameraStore.getState().connectionStatus !== 'open') {
      return Promise.resolve({ error: '设备未连接', elapsedMs: 0 });
    }
    const id = nextCommandId();
    const norm = normalizeCameraCommand({
      device_name: 'main_camera',
      instruction,
      params,
      id,
    });
    if (!norm.valid) {
      console.warn('[CameraWS] 命令校验失败，拒绝发送:', norm.error);
      _useCameraStore.setState({ lastCommandError: norm.error });
      return Promise.resolve({ error: norm.error, elapsedMs: 0 });
    }
    return new Promise<CommandWaitResult>((resolve) => {
      const timer = setTimeout(() => {
        pendingCommands.delete(id);
        resolve({ timeout: true, elapsedMs: Date.now() - startedAt });
      }, timeoutMs);
      pendingCommands.set(id, (result) => {
        clearTimeout(timer);
        resolve({ ...result, elapsedMs: Date.now() - startedAt });
      });
      try {
        cameraWebSocket?.send(norm.message);
      }
      catch (e) {
        pendingCommands.delete(id);
        clearTimeout(timer);
        resolve({
          error: e instanceof Error ? e.message : 'WebSocket 未处于就绪状态',
          elapsedMs: Date.now() - startedAt,
        });
      }
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

  requestCameraState: () =>
    _useCameraStore.getState().sendInstruction(CAMERA_INSTRUCTIONS.cameraState),
  setDesiredStreamingFps: fps => set({ desiredStreamingFps: fps }),
  changeStreamingFrameRate: (mode, rate) => {
    set({ desiredStreamingFps: rate });
    _useCameraStore
      .getState()
      .sendInstruction(CAMERA_INSTRUCTIONS.changeStreamingFrameRate, [mode, rate]);
  },
  setLandscapeShutterMode: (mode) => {
    _useCameraStore.getState().switchAutoMode(mode === 'auto');
  },
  setLandscapeCaptureMode: (mode) => {
    if (_useCameraStore.getState().landscapeCaptureState === 'idle') {
      set({ landscapeCaptureMode: mode });
    }
  },
  setLandscapeTimerPlan: plan =>
    set({
      landscapeTimerPlan: {
        count: Math.max(1, Math.min(64, Math.round(plan.count))),
        interval: Math.max(0, Math.round(plan.interval)),
      },
    }),
  setLandscapeWatermark: landscapeWatermark => set({ landscapeWatermark }),
  setLandscapeRatio: landscapeRatio => set({ landscapeRatio }),
  setLandscapeSensorRatio: (landscapeRatio) => {
    const state = _useCameraStore.getState();
    if (state.landscapeRatio === landscapeRatio || state.landscapeApplyingRatio)
      return;
    if (
      state.landscapeCaptureState !== 'idle'
      || state.landscapeRecordingState !== 'idle'
      || state.landscapeRepeatState !== 'idle'
    ) {
      return;
    }
    set(s => ({
      landscapeRatio,
      landscapeApplyingRatio: true,
      landscapeRatioVersion: s.landscapeRatioVersion + 1,
    }));
    const roi = LANDSCAPE_RATIO_ROI[landscapeRatio];
    state.sendInstruction(CAMERA_INSTRUCTIONS.setSensorRoi, [
      roi.x,
      roi.y,
      roi.width,
      roi.height,
      0,
    ]);
    if (sensorRatioTimer)
      clearTimeout(sensorRatioTimer);
    sensorRatioTimer = setTimeout(() => {
      sensorRatioTimer = null;
      set(s => ({
        landscapeApplyingRatio: false,
        landscapeRatioVersion: s.landscapeRatioVersion + 1,
      }));
    }, 1500);
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
    state.sendInstruction(CAMERA_INSTRUCTIONS.changeStreamingSetting, [
      exposure,
      gain,
    ]);
  },

  // The board's `start_streaming_exposure(exposure, gain)` takes gain as a
  // required positional argument, so auto mode has to pass the -1 "let the
  // board decide" placeholder that the ROI path already relies on. Sending
  // only ['auto'] makes the board raise a missing-argument TypeError.
  // Wait for the WS reply: that is after 554 is listening (InStreaming /
  // g_rtsplive). WHEP posted before this races MediaMTX on-demand pull.
  startStreaming: (mode = 'auto'): Promise<CommandWaitResult> => {
    return _useCameraStore
      .getState()
      .sendCommandWait(
        CAMERA_INSTRUCTIONS.startStreaming,
        [mode, null],
        25_000,
      );
  },
  startStreamingManual: (exposure, gain): Promise<CommandWaitResult> => {
    const clampedExposure = clampExposure(exposure);
    const clampedGain = clampGain(gain);
    set({
      landscapeBaseExposure: clampedExposure,
      landscapeBaseGain: clampedGain,
      landscapeManualExposure: clampedExposure,
      landscapeManualGain: clampedGain,
      landscapeEv: 0,
    });
    const state = _useCameraStore.getState();
    return state.sendCommandWait(
      CAMERA_INSTRUCTIONS.startStreaming,
      [state.landscapeManualExposure, state.landscapeManualGain],
      25_000,
    );
  },
  stopStreaming: () =>
    _useCameraStore
      .getState()
      .sendInstruction(CAMERA_INSTRUCTIONS.stopStreaming),
  changeStreamingSetting: (exposure, gain) => {
    const clampedExposure = clampExposure(exposure);
    const clampedGain = clampGain(gain);
    set({
      landscapeBaseExposure: clampedExposure,
      landscapeBaseGain: clampedGain,
      landscapeManualExposure: clampedExposure,
      landscapeManualGain: clampedGain,
      landscapeEv: 0,
    });
    scheduleStreamingSetting();
  },
  changeWhiteBalance: (cct) => {
    set({ landscapeWhiteBalance: cct });
    _useCameraStore
      .getState()
      .sendInstruction(CAMERA_INSTRUCTIONS.setWhiteBalance, [cct]);
  },
  changeEv: (ev) => {
    const state = _useCameraStore.getState();
    const baseExp = state.landscapeBaseExposure || state.landscapeManualExposure || 0.08;
    const baseGain = typeof state.landscapeBaseGain === 'number'
      ? state.landscapeBaseGain
      : state.landscapeManualGain;
    const linkage = calculateEvLinkedExposure(baseExp, baseGain, ev);

    set({
      landscapeEv: ev,
      landscapeManualExposure: clampExposure(linkage.exposure),
      landscapeManualGain: clampGain(linkage.gain),
    });
    scheduleStreamingSetting();
    _useCameraStore.getState().sendInstruction(CAMERA_INSTRUCTIONS.setEv, [ev]);
  },
  captureStreamFrame: (path) => {
    _useCameraStore
      .getState()
      .sendInstruction(
        CAMERA_INSTRUCTIONS.captureStreamFrame,
        path ? [path] : [],
      );
  },
  startRecording: baseName =>
    _useCameraStore
      .getState()
      .sendInstruction(CAMERA_INSTRUCTIONS.startRecording, [
        baseName || `record_${Date.now()}`,
      ]),
  stopRecording: () =>
    _useCameraStore
      .getState()
      .sendInstruction(CAMERA_INSTRUCTIONS.stopRecording),

  startLandscapeCapture: () => {
    const state = _useCameraStore.getState();
    const isRepeatRunning = state.landscapeRepeatState === 'running';
    if (!canStartLandscapeAction(state, isRepeatRunning))
      return;
    const isLongExposure
      = !state.landscapeAutoMode && state.landscapeManualExposure > 1;
    const path = `/mnt/sdcard/Pictures/stream_frame_${Date.now()}.jpg`;

    set({
      landscapeCaptureState: 'capturing',
      landscapeCapturePendingId: isLongExposure ? null : path,
      lastCommandError: null,
    });
    clearCaptureTimer();
    state.requestCameraState();
    captureStatePoll = setInterval(() => {
      _useCameraStore.getState().requestCameraState();
    }, isLongExposure ? 500 : 300);

    const timeout = isLongExposure
      ? exposureTimeoutMs(state.landscapeManualExposure)
      : LANDSCAPE_CAPTURE_TIMEOUT_MS;

    captureTimer = setTimeout(
      () => finishLandscapeCapture(null),
      timeout,
    );

    if (isLongExposure) {
      startSensorExposure(state.landscapeManualExposure, 'LANDSCAPE_SINGLE');
    }
    else {
      state.captureStreamFrame(path);
    }
  },
  startLandscapeCountdown: (seconds) => {
    if (!canStartLandscapeAction(_useCameraStore.getState()))
      return;
    clearCountdownTimer();
    set({
      landscapeCaptureState: 'countdown',
      landscapeCountdownRemaining: seconds,
    });
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
    if (
      !canStartLandscapeAction(state)
      || state.landscapeRepeatState !== 'idle'
    ) {
      return;
    }
    const isLongExposure
      = !state.landscapeAutoMode && state.landscapeManualExposure > 1;
    repeatCancelled = false;
    clearRepeatTimer();

    if (isLongExposure) {
      set({
        landscapeRepeatState: 'running',
        landscapeRepeatCurrent: 0,
        lastCommandError: null,
      });
      startSensorExposureRepeat(
        state.landscapeManualExposure,
        state.landscapeTimerPlan.count,
        'LANDSCAPE_REPEAT',
      );
      return;
    }

    const { count, interval } = state.landscapeTimerPlan;
    const maxSessionDurationMs
      = count * (LANDSCAPE_CAPTURE_TIMEOUT_MS + Math.max(0, interval) * 1000)
        + 10_000;
    repeatSessionTimer = setTimeout(() => {
      if (_useCameraStore.getState().landscapeRepeatState === 'running') {
        clearRepeatTimer();
        set({
          landscapeRepeatState: 'idle',
          lastCommandError: '连拍超时已停止',
        });
      }
    }, maxSessionDurationMs);
    set({
      landscapeRepeatState: 'running',
      landscapeRepeatCurrent: 0,
      lastCommandError: null,
    });
    runLandscapeRepeatStep();
  },
  cancelLandscapeRepeat: () => {
    repeatCancelled = true;
    clearRepeatTimer();
    const state = _useCameraStore.getState();
    const isLongExposure
      = !state.landscapeAutoMode && state.landscapeManualExposure > 1;
    if (isLongExposure) {
      set({ landscapeRepeatState: 'cancelling' });
      _useCameraStore.getState().sendInstruction(CAMERA_INSTRUCTIONS.stopExposureRepeat, []);
      return;
    }
    if (state.landscapeCaptureState === 'idle') {
      set({ landscapeRepeatState: 'idle', landscapeRepeatCurrent: 0 });
    }
    else {
      set({ landscapeRepeatState: 'cancelling' });
    }
  },
  startLandscapeRecording: () => {
    const state = _useCameraStore.getState();
    if (
      state.landscapeRecordingState !== 'idle'
      || state.landscapeRepeatState !== 'idle'
    ) {
      return;
    }
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
        set({
          landscapeRecordingState: 'idle',
          lastCommandError: '停止录像超时',
        });
      }
    }, RECORDING_COMMAND_TIMEOUT_MS);
    set({ landscapeRecordingState: 'processing', lastCommandError: null });
    state.stopRecording();
  },

  requestCameraStatus: () => _useCameraStore.getState().requestCameraState(),
  requestBattery: () => {
    console.log('[WS] 请求电池信息');
    sendCameraCommand('get_battery', []);
  },
  requestDisk: () => {
    console.log('[WS] 请求磁盘信息');
    sendCameraCommand('get_disk', []);
  },
  setGain: gain => sendCameraCommand('set_gain', [gain]),
  setStretch: enabled => sendCameraCommand('set_stretch', [enabled ? 1 : 0]),
  startExposure: () => {
    const { currentExposureConfig } = _useCameraStore.getState();
    sendCameraCommand('start_exposure', [
      currentExposureConfig.exposure_time,
      true,
      '',
      'SINGLE',
    ]);
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
  setPower: (power, charging) =>
    set({
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
  setCurrentExposureConfig: currentExposureConfig =>
    set({ currentExposureConfig }),
  addExposureConfig: (config) => {
    const nextId
      = Math.max(
        0,
        ..._useCameraStore.getState().exposureConfigs.map(item => item.id),
      ) + 1;
    const next = { ...config, id: nextId };
    set(state => ({
      exposureConfigs: [...state.exposureConfigs, next],
      currentExposureConfig: next,
    }));
  },
  updateExposureConfig: config =>
    set(state => ({
      exposureConfigs: state.exposureConfigs.map(item =>
        item.id === config.id ? config : item,
      ),
      currentExposureConfig: config,
    })),
  deleteExposureConfig: id =>
    set((state) => {
      const exposureConfigs = state.exposureConfigs.filter(
        item => item.id !== id,
      );
      const currentExposureConfig
        = state.currentExposureConfig.id === id
          ? (exposureConfigs[0] ?? DEFAULT_CURRENT_CONFIG)
          : state.currentExposureConfig;

      return { exposureConfigs, currentExposureConfig };
    }),
}));

export const useCameraStore = createSelectors(_useCameraStore);

function sendCameraCommand(instruction: string, params: unknown[]): void {
  const norm = normalizeCameraCommand({
    device_name: 'main_camera',
    instruction,
    params,
    id: 'CAMERA',
  });
  if (norm.valid) {
    cameraWebSocket?.send(norm.message);
  }
  else {
    console.warn('[CameraWS] sendCameraCommand 校验失败:', norm.error);
    _useCameraStore.setState({ lastCommandError: norm.error });
  }
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
    const failure = message as { error?: unknown; message?: string };
    const formattedError = formatCameraErrorMessage(failure);

    if (message.instruction === CAMERA_INSTRUCTIONS.cameraState) {
      const errStr = (
        typeof failure.error === 'string'
          ? failure.error
          : JSON.stringify(failure.error ?? '')
      ).toUpperCase();
      const msgStr = (
        typeof failure.message === 'string' ? failure.message : ''
      ).toUpperCase();
      if (
        errStr.includes('BAD_COMMAND')
        || errStr.includes('NOT_SUPPORTED')
        || msgStr.includes('BAD_COMMAND')
        || msgStr.includes('NOT_SUPPORTED')
      ) {
        detailedStatusSupported = false;
        sendCameraCommand('get_camera_status', []);
      }
      return;
    }

    if (!activeFaultPresent) {
      set({ lastCommandError: formattedError });
    }

    if (
      message.instruction === CAMERA_INSTRUCTIONS.captureStreamFrame
      || message.instruction === CAMERA_INSTRUCTIONS.startExposure
      || message.instruction === CAMERA_INSTRUCTIONS.startExposureRepeat
    ) {
      finishLandscapeCapture(null);
      if (_useCameraStore.getState().landscapeRepeatState !== 'idle') {
        _useCameraStore.setState({
          landscapeRepeatState: 'idle',
          landscapeRepeatCurrent: 0,
        });
      }
      _useCameraStore.getState().requestCameraState();
    }
    if (message.instruction === CAMERA_INSTRUCTIONS.startRecording) {
      clearRecordingTimer();
      set({ landscapeRecordingState: 'idle', landscapeRecordingBaseName: '' });
      _useCameraStore.getState().requestCameraState();
    }
    if (message.instruction === CAMERA_INSTRUCTIONS.stopRecording) {
      clearRecordingTimer();
      set({ landscapeRecordingState: 'idle' });
      _useCameraStore.getState().requestCameraState();
    }
    if (
      message.instruction === CAMERA_INSTRUCTIONS.startStreaming
      || message.instruction === CAMERA_INSTRUCTIONS.stopStreaming
    ) {
      _useCameraStore.getState().requestCameraState();
    }
    return;
  }

  switch (message.instruction) {
    case CAMERA_INSTRUCTIONS.cameraState: {
      if (typeof message.data !== 'object' || message.data === null) {
        break;
      }
      const state = message.data as BoardCameraState;

      // 1. Seq check: drop older / duplicate snapshots within current connection
      if (typeof state.seq === 'number') {
        if (currentConnectionSeq >= 0 && state.seq < currentConnectionSeq) {
          break;
        }
        currentConnectionSeq = state.seq;
      }

      // 2. We received a valid detailed snapshot, so detailed status is supported
      detailedStatusSupported = true;

      // 3. Map to CameraStatus
      const cameraStatus = mapBoardStateToCameraStatus(state);

      // 4. Fault & Error Handling
      const isFault = state.fault_active === true || state.busy === 'error';
      let lastCommandError = _useCameraStore.getState().lastCommandError;

      if (isFault) {
        activeFaultPresent = true;
        // Keep the first cause of fault; do not overwrite if one already exists
        if (!lastCommandError || lastCommandError === '操作失败') {
          lastCommandError = formatCameraErrorMessage(
            {
              error: state.last_error,
              message: '相机状态异常(error)，请重启相机',
            },
            '相机状态异常(error)，请重启相机',
          );
        }

        const current = _useCameraStore.getState();
        if (current.landscapeCaptureState === 'capturing') {
          finishLandscapeCapture(null);
        }
        if (current.landscapeRecordingState !== 'idle') {
          clearRecordingTimer();
          set({
            landscapeRecordingState: 'idle',
            landscapeRecordingBaseName: '',
          });
        }
        if (current.landscapeRepeatState !== 'idle') {
          clearRepeatTimer();
          set({ landscapeRepeatState: 'idle', landscapeRepeatCurrent: 0 });
        }
      }
      else if (activeFaultPresent) {
        // Explicitly received recovery state (healthy state after a fault)
        activeFaultPresent = false;
        lastCommandError = null;
      }

      const update: Partial<CameraState> = {
        cameraState: state,
        cameraStatus,
        streamingInProgress: state.streaming === true,
        lastCommandError,
        storageReady:
          typeof state.flags?.storage_ready === 'boolean'
            ? state.flags.storage_ready
            : _useCameraStore.getState().storageReady,
      };
      if (typeof state.preview?.target_gain_percent === 'number') {
        update.landscapeManualGain = clampGain(
          state.preview.target_gain_percent,
        );
      }

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

      if (
        typeof jpgPath === 'string'
        && _useCameraStore.getState().landscapeCaptureState === 'capturing'
      ) {
        finishLandscapeCapture(jpgPath);
      }

      if (state.recording || state.busy === 'recording') {
        const current = _useCameraStore.getState();
        if (
          current.landscapeRecordingState === 'starting'
          || current.landscapeRecordingState === 'idle'
        ) {
          clearRecordingTimer();
          set({
            landscapeRecordingState: 'recording',
          });
        }
      }
      else if (
        _useCameraStore.getState().landscapeRecordingState === 'recording'
        && state.streaming
      ) {
        finishRecording(extractVideoName(state.last_result));
      }
      break;
    }
    case CAMERA_INSTRUCTIONS.changeStreamingSetting:
      break;
    case CAMERA_INSTRUCTIONS.captureStreamFrame: {
      const data = message.data as Record<string, unknown> | undefined;
      const jpgPath
        = typeof data?.jpg_path === 'string'
          ? data.jpg_path
          : typeof data?.path === 'string'
            ? data.path
            : null;
      if (jpgPath) {
        set({ newestStreamJpgUrl: jpgPath, newestCameraJpgUrl: jpgPath });
      }
      finishLandscapeCapture(jpgPath);
      break;
    }
    case CAMERA_INSTRUCTIONS.startRecording:
      if (_useCameraStore.getState().landscapeRecordingState === 'starting') {
        clearRecordingTimer();
        set({
          landscapeRecordingState: 'recording',
        });
      }
      break;
    case CAMERA_INSTRUCTIONS.stopRecording:
      finishRecording(extractVideoName(message.data));
      break;
    case 'get_static_info': {
      if (typeof message.data === 'object' && message.data !== null) {
        const data = message.data as Record<string, unknown>;
        const capabilities = data.capabilities as
          | Record<string, unknown>
          | undefined;
        const supported = capabilities?.gain_percent_v1 === true;
        set({ gainPercentSupported: supported });
        if (!supported && capabilities?.gain_db_v1) {
          set({ lastCommandError: '固件版本过低，请升级固件以支持增益设置' });
        }
      }
      break;
    }
    case 'get_streaming_setting': {
      if (typeof message.data === 'object' && message.data !== null) {
        const data = message.data as Record<string, unknown>;
        if (typeof data.target_gain_percent === 'number') {
          set({ landscapeManualGain: clampGain(data.target_gain_percent) });
        }
      }
      break;
    }
    case 'get_camera_status':
      if (!detailedStatusSupported) {
        set({ cameraStatus: mapLegacyStatusToCameraStatus(message.data) });
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
      if (
        typeof message.used_space === 'number'
        && typeof message.all_space === 'number'
      ) {
        console.log(
          '[WS] 收到磁盘信息:',
          message.used_space,
          message.all_space,
        );
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

export function isCameraStatus(value: unknown): value is CameraStatus {
  return (
    value === 'idle'
    || value === 'in_repeat'
    || value === 'in_streaming'
    || value === 'in_exposure'
    || value === 'recording'
    || value === 'starting'
    || value === 'stopping'
    || value === 'closed'
    || value === 'error'
    || value === 'unknown'
  );
}
