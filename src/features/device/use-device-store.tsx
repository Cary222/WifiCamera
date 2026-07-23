import type { Device } from './types';
import { useMMKVString } from 'react-native-mmkv';

import { create } from 'zustand';
import { removeItem, storage } from '@/lib/storage';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import { createSelectors } from '@/lib/utils';

type DeviceState = {
  devices: Device[];
  isScanning: boolean;
  scan: () => Promise<void>;
  connect: (id: string) => Promise<void>;
};

const MOCK_DEVICES: Device[] = [
  { id: 'starbase-01', name: 'starbase', status: 'available', signal: 'strong' },
  { id: 'starbase-02', name: 'starbase', status: 'available', signal: 'medium' },
  { id: 'starbase-03', name: 'starbase', status: 'available', signal: 'weak' },
  { id: 'starbase-04', name: 'STAR-mini', status: 'unavailable' },
  { id: 'starbase-05', name: 'STAR-pro', status: 'unavailable' },
];

const _useDeviceStore = create<DeviceState>(set => ({
  devices: [],
  isScanning: false,

  scan: async () => {
    set({ isScanning: true, devices: [] });
    await new Promise(resolve => setTimeout(resolve, 1500));
    set({ isScanning: false, devices: MOCK_DEVICES });
  },

  connect: async (id: string) => {
    set(state => ({
      devices: state.devices.map(d =>
        d.id === id ? { ...d, status: 'connecting' as const } : d,
      ),
    }));

    await new Promise(resolve => setTimeout(resolve, 800));

    let connectedName: string | undefined;
    set((state) => {
      const next = state.devices.map((d) => {
        if (d.id !== id)
          return d;
        connectedName = d.name;
        return { ...d, status: 'connected' as const };
      });
      return { devices: next };
    });

    if (connectedName) {
      storage.set(STORAGE_KEYS.BOUND_DEVICE_NAME, connectedName);
    }
  },
}));

export const useDeviceStore = createSelectors(_useDeviceStore);

export function useBoundDeviceId(): [
  string | undefined,
  (value: string | undefined) => void,
] {
  return useMMKVString(STORAGE_KEYS.BOUND_DEVICE_ID, storage);
}

// eslint-disable-next-line react/no-unnecessary-use-prefix
export function useBoundDeviceName(): string | undefined {
  return storage.getString(STORAGE_KEYS.BOUND_DEVICE_NAME);
}

export function clearBoundDevice() {
  removeItem(STORAGE_KEYS.BOUND_DEVICE_ID);
  removeItem(STORAGE_KEYS.BOUND_DEVICE_NAME);
}
