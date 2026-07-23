import type { CameraJsonMessage } from './services/websocket-protocol';

import * as React from 'react';
import { createContext, use, useEffect, useMemo } from 'react';
import { useBoundDeviceId } from '@/features/device/use-device-store';
import { useCameraStore } from './camera-store';
import { getSerial, getVersion } from './services/startup-service';

export type CameraContextValue = {
  connect: () => void;
  disconnect: () => void;
  sendCommand: (message: CameraJsonMessage) => void;
  currentRaDec: { ra: number; dec: number } | null;
  setCurrentRaDec: (raDec: { ra: number; dec: number } | null) => void;
};

const CameraContext = createContext<CameraContextValue | null>(null);

export function CameraProvider({ children }: { children: React.ReactNode }) {
  const connect = useCameraStore.use.connect();
  const disconnect = useCameraStore.use.disconnect();
  const sendCommand = useCameraStore.use.sendCommand();
  const connectionStatus = useCameraStore.use.connectionStatus();
  const setSerial = useCameraStore.use.setSerial();
  const setVersion = useCameraStore.use.setVersion();
  const [boundDeviceId] = useBoundDeviceId();
  const [currentRaDec, setCurrentRaDec] = React.useState<{ ra: number; dec: number } | null>(null);

  useEffect(() => {
    if (boundDeviceId) {
      connect();
    }
    else {
      disconnect();
    }
    return disconnect;
  }, [boundDeviceId, connect, disconnect]);

  useEffect(() => {
    if (connectionStatus === 'open') {
      getSerial().then(s => setSerial(s)).catch(() => {});
      getVersion().then(v => setVersion(v)).catch(() => {});
    }
  }, [connectionStatus, setSerial, setVersion]);

  const value = useMemo(() => ({
    connect,
    disconnect,
    sendCommand,
    currentRaDec,
    setCurrentRaDec,
  }), [connect, disconnect, sendCommand, currentRaDec, setCurrentRaDec]);

  return <CameraContext value={value}>{children}</CameraContext>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCameraContext(): CameraContextValue {
  const context = use(CameraContext);

  if (!context) {
    throw new Error('useCameraContext must be used inside CameraProvider');
  }

  return context;
}
