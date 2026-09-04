import type { StellariumViewHandle } from '@/features/stellarium/stellarium-view';
import * as React from 'react';
import { storage } from '@/lib/storage';
import { STORAGE_KEYS } from '@/lib/storage-keys';

export type StartTimePolicy = 'now' | 'last_view';

export const DEFAULT_SETTINGS = {
  brightness: 3.0,
  fullscreen: false,
  limitMagEnabled: false,
  limitMagValue: 6.5,
  startTimePolicy: 'now' as StartTimePolicy,
};

type SettingsStorage = {
  delete?: (key: string) => void;
  getBoolean?: (key: string) => boolean | undefined;
  getNumber?: (key: string) => number | undefined;
  getString?: (key: string) => string | undefined;
  remove?: (key: string) => void;
  set: (key: string, value: string | number | boolean) => void;
};

type UseStellariumSettingsOptions = {
  onReturnToNow?: () => void;
  storage?: SettingsStorage;
};

function clearSettingsStorage(store: SettingsStorage) {
  const removeKey = (key: string) => {
    if ('remove' in store && typeof store.remove === 'function')
      store.remove(key);
    else if ('delete' in store && typeof store.delete === 'function')
      store.delete(key);
  };

  removeKey(STORAGE_KEYS.DEEP_SPACE_SETTINGS_START_TIME_POLICY);
  removeKey(STORAGE_KEYS.DEEP_SPACE_SETTINGS_LAST_VIEW_TIME);
  removeKey(STORAGE_KEYS.DEEP_SPACE_SETTINGS_FULLSCREEN);
  removeKey(STORAGE_KEYS.DEEP_SPACE_SETTINGS_LIMIT_MAG_ENABLED);
  removeKey(STORAGE_KEYS.DEEP_SPACE_SETTINGS_LIMIT_MAG_VALUE);
  removeKey(STORAGE_KEYS.DEEP_SPACE_SETTINGS_BRIGHTNESS);
}

export function useStellariumSettings(
  stellaRef: React.RefObject<StellariumViewHandle | null>,
  options?: UseStellariumSettingsOptions,
) {
  const store = options?.storage ?? storage;

  const [startTimePolicy, setPolicyState] = React.useState<StartTimePolicy>(() => {
    const saved = store.getString?.(STORAGE_KEYS.DEEP_SPACE_SETTINGS_START_TIME_POLICY);
    return saved === 'last_view' ? 'last_view' : DEFAULT_SETTINGS.startTimePolicy;
  });

  const [fullscreen, setFullscreenState] = React.useState<boolean>(() => {
    return store.getBoolean?.(STORAGE_KEYS.DEEP_SPACE_SETTINGS_FULLSCREEN) ?? DEFAULT_SETTINGS.fullscreen;
  });

  const [limitMagEnabled, setLimitMagEnabledState] = React.useState<boolean>(() => {
    return store.getBoolean?.(STORAGE_KEYS.DEEP_SPACE_SETTINGS_LIMIT_MAG_ENABLED) ?? DEFAULT_SETTINGS.limitMagEnabled;
  });

  const [limitMagValue, setLimitMagValueState] = React.useState<number>(() => {
    const saved = store.getNumber?.(STORAGE_KEYS.DEEP_SPACE_SETTINGS_LIMIT_MAG_VALUE);
    return typeof saved === 'number' && Number.isFinite(saved) ? saved : DEFAULT_SETTINGS.limitMagValue;
  });

  const [brightness, setBrightnessState] = React.useState<number>(() => {
    const saved = store.getNumber?.(STORAGE_KEYS.DEEP_SPACE_SETTINGS_BRIGHTNESS);
    return typeof saved === 'number' && Number.isFinite(saved) ? saved : DEFAULT_SETTINGS.brightness;
  });

  const setStartTimePolicy = React.useCallback((policy: StartTimePolicy) => {
    setPolicyState(policy);
    store.set(STORAGE_KEYS.DEEP_SPACE_SETTINGS_START_TIME_POLICY, policy);
    if (policy === 'now') {
      options?.onReturnToNow?.();
    }
  }, [options, store]);

  const setFullscreen = React.useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    setFullscreenState((prev) => {
      const next = typeof val === 'function' ? val(prev) : val;
      store.set(STORAGE_KEYS.DEEP_SPACE_SETTINGS_FULLSCREEN, next);
      return next;
    });
  }, [store]);

  const setLimitMagEnabled = React.useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    setLimitMagEnabledState((prev) => {
      const next = typeof val === 'function' ? val(prev) : val;
      store.set(STORAGE_KEYS.DEEP_SPACE_SETTINGS_LIMIT_MAG_ENABLED, next);
      if (next) {
        stellaRef.current?.setMagnitudeLimit?.(limitMagValue);
      }
      else {
        stellaRef.current?.setMagnitudeLimit?.(99);
      }
      return next;
    });
  }, [limitMagValue, stellaRef, store]);

  const setLimitMagValue = React.useCallback((val: number) => {
    const clamped = Math.max(3.5, Math.min(12.0, Math.round(val * 10) / 10));
    setLimitMagValueState(clamped);
    store.set(STORAGE_KEYS.DEEP_SPACE_SETTINGS_LIMIT_MAG_VALUE, clamped);
    if (limitMagEnabled) {
      stellaRef.current?.setMagnitudeLimit?.(clamped);
    }
  }, [limitMagEnabled, stellaRef, store]);

  const setBrightness = React.useCallback((val: number) => {
    const clamped = Math.max(0.2, Math.min(5.0, Math.round(val * 10) / 10));
    setBrightnessState(clamped);
    store.set(STORAGE_KEYS.DEEP_SPACE_SETTINGS_BRIGHTNESS, clamped);
    stellaRef.current?.setBrightness?.(clamped);
  }, [stellaRef, store]);

  const resetSettings = React.useCallback(() => {
    setPolicyState(DEFAULT_SETTINGS.startTimePolicy);
    setFullscreenState(DEFAULT_SETTINGS.fullscreen);
    setLimitMagEnabledState(DEFAULT_SETTINGS.limitMagEnabled);
    setLimitMagValueState(DEFAULT_SETTINGS.limitMagValue);
    setBrightnessState(DEFAULT_SETTINGS.brightness);

    clearSettingsStorage(store);
    stellaRef.current?.setMagnitudeLimit?.(99);
    stellaRef.current?.setBrightness?.(DEFAULT_SETTINGS.brightness);
    options?.onReturnToNow?.();
  }, [options, stellaRef, store]);

  return {
    brightness,
    fullscreen,
    limitMagEnabled,
    limitMagValue,
    resetSettings,
    setBrightness,
    setFullscreen,
    setLimitMagEnabled,
    setLimitMagValue,
    setStartTimePolicy,
    startTimePolicy,
  };
}
