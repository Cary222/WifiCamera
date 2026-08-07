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

export type CameraStatus = 'idle' | 'in_repeat' | 'in_streaming' | 'in_exposure';

export type LongExposureConfig = {
  id: number;
  name: string;
  exposure_time: number;
  gain: number;
  repeat?: number;
};

type CameraState = {
  cameraStatus: CameraStatus;
  connectionStatus: CameraWebSocketStatus | 'idle';
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

const _useCameraStore = create<CameraState>(set => ({
  cameraStatus: 'idle',
  connectionStatus: 'idle',
  exposureConfigs: DEFAULT_EXPOSURE_CONFIGS,
  currentExposureConfig: DEFAULT_CURRENT_CONFIG,
  streamingInProgress: false,
  powerLevel: 4,
  inCharge: false,
  usedSpace: null,
  allSpace: null,
  serial: null,
  version: null,
  newestCameraJpgUrl: '',
  newestStreamJpgUrl: '',
  remainingExposureTime: 0,

  connect: () => {
    if (!cameraWebSocket) {
      cameraWebSocket = new CameraWebSocketService({
        url: getCameraWebSocketUrl(),
        onStatusChange: status => set({ connectionStatus: status }),
        onMessage: message => handleCameraMessage(message, set),
      });
    }
    cameraWebSocket.connect();
  },
  disconnect: () => {
    cameraWebSocket?.close();
    cameraWebSocket = null;
    set({ connectionStatus: 'closed' });
  },
  sendCommand: (message) => {
    cameraWebSocket?.send(message);
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

  switch (message.instruction) {
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
