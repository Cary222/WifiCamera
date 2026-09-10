import type { StellariumViewHandle } from '@/features/stellarium/stellarium-view';
import { act, renderHook } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { storage } from '@/lib/storage';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import { useObserverLocation } from './use-observer-location';

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  PermissionStatus: { DENIED: 'denied', GRANTED: 'granted' },
  getCurrentPositionAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  reverseGeocodeAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
}));

describe('useObserverLocation automatic tracking', () => {
  const mockRemove = jest.fn();
  let mockSetLocation: jest.Mock;
  let stellaRef: { current: StellariumViewHandle | null };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSetLocation = jest.fn();
    stellaRef = { current: { setLocation: mockSetLocation } as unknown as StellariumViewHandle };
  });

  it('follows the device position and sends its coordinates to the star map', async () => {
    let positionCallback: ((location: Location.LocationObject) => void) | undefined;
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: Location.PermissionStatus.GRANTED });
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValueOnce({
      coords: { latitude: 34.2, longitude: 108.94 },
    });
    (Location.watchPositionAsync as jest.Mock).mockImplementationOnce((_options: unknown, callback: (location: Location.LocationObject) => void) => {
      positionCallback = callback;
      return Promise.resolve({ remove: mockRemove });
    });

    const { result, unmount } = renderHook(() => useObserverLocation(stellaRef));

    await act(async () => {
      await result.current.enableAutomaticLocation();
    });

    expect(result.current.automaticLocation).toBe(true);
    expect(result.current.observer).toMatchObject({
      latitudeDeg: 34.2,
      longitudeDeg: 108.94,
      name: '当前位置',
      source: 'automatic',
    });
    expect(mockSetLocation).toHaveBeenLastCalledWith(34.2, 108.94);

    act(() => {
      positionCallback?.({ coords: { latitude: 31.23, longitude: 121.47 } } as Location.LocationObject);
    });

    expect(result.current.observer).toMatchObject({ latitudeDeg: 31.23, longitudeDeg: 121.47 });
    expect(mockSetLocation).toHaveBeenLastCalledWith(31.23, 121.47);

    unmount();
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });

  it('toggles automatic location off when already active', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: Location.PermissionStatus.GRANTED });
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValueOnce({
      coords: { latitude: 34.2, longitude: 108.94 },
    });
    (Location.watchPositionAsync as jest.Mock).mockResolvedValueOnce({ remove: mockRemove });

    const { result } = renderHook(() => useObserverLocation(stellaRef));

    await act(async () => {
      await result.current.toggleAutomaticLocation();
    });
    expect(result.current.automaticLocation).toBe(true);

    await act(async () => {
      await result.current.toggleAutomaticLocation();
    });
    expect(result.current.automaticLocation).toBe(false);
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });
});

describe('useObserverLocation manual controls', () => {
  const mockRemove = jest.fn();
  let mockSetLocation: jest.Mock;
  let stellaRef: { current: StellariumViewHandle | null };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSetLocation = jest.fn();
    stellaRef = { current: { setLocation: mockSetLocation } as unknown as StellariumViewHandle };
  });

  it('stops automatic tracking before applying a manual observer', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: Location.PermissionStatus.GRANTED });
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValueOnce({
      coords: { latitude: 34.2, longitude: 108.94 },
    });
    (Location.watchPositionAsync as jest.Mock).mockResolvedValueOnce({ remove: mockRemove });
    const { result } = renderHook(() => useObserverLocation(stellaRef));

    await act(async () => {
      await result.current.enableAutomaticLocation();
    });
    act(() => {
      result.current.setManualObserver({ latitudeDeg: 31.23, longitudeDeg: 121.47, name: '上海' });
    });

    expect(mockRemove).toHaveBeenCalledTimes(1);
    expect(result.current.automaticLocation).toBe(false);
    expect(result.current.observer).toMatchObject({
      latitudeDeg: 31.23,
      longitudeDeg: 121.47,
      name: '上海',
      source: 'manual',
    });
    expect(mockSetLocation).toHaveBeenLastCalledWith(31.23, 121.47);
  });

  it('updates manual coordinates with setManualCoordinate', () => {
    const { result } = renderHook(() => useObserverLocation(stellaRef));

    act(() => {
      result.current.setManualCoordinate(24.87, 118.68, '泉州');
    });

    expect(result.current.observer).toMatchObject({
      latitudeDeg: 24.87,
      longitudeDeg: 118.68,
      name: '泉州',
      source: 'manual',
    });
    expect(mockSetLocation).toHaveBeenLastCalledWith(24.87, 118.68);
  });
});

describe('useObserverLocation restoration and permission safety', () => {
  const setLocation = jest.fn();
  const stellaRef = { current: { setLocation } as unknown as StellariumViewHandle };
  const manual = { altitudeM: 42, latitudeDeg: 0, longitudeDeg: 0, name: 'Manual', source: 'manual' };

  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  it('persists the chosen observer and restores it without asking for location access', () => {
    const { result, unmount } = renderHook(() => useObserverLocation(stellaRef));
    act(() => result.current.setManualObserver(manual));
    expect(storage.set).toHaveBeenLastCalledWith(STORAGE_KEYS.DEEP_SPACE_SETTINGS_OBSERVER, JSON.stringify(manual));
    unmount();
    jest.spyOn(storage, 'getString').mockReturnValue(JSON.stringify(manual));
    const { result: restored } = renderHook(() => useObserverLocation(stellaRef));
    expect(restored.current.observer).toEqual(manual);
    expect(restored.current.automaticLocation).toBe(false);
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('keeps the manual observer and editable controls after permission denial', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false } as Response);
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'denied' });
    const { result } = renderHook(() => useObserverLocation(stellaRef));
    act(() => result.current.setManualObserver(manual));
    await act(async () => result.current.enableAutomaticLocation());
    expect(result.current.automaticLocation).toBe(false);
    expect(result.current.observer).toEqual(manual);
    expect(fetchSpy).not.toHaveBeenCalled();
    act(() => result.current.setManualCoordinate(1, 2));
    expect(setLocation).toHaveBeenLastCalledWith(1, 2);
  });

  it('ignores GPS responses after a manual choice and removes the late subscription', async () => {
    let resolveWatch: (value: Location.LocationSubscription) => void = () => {};
    const remove = jest.fn();
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'granted' });
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValueOnce({ coords: { latitude: 34.2, longitude: 108.94 } });
    (Location.watchPositionAsync as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => {
      resolveWatch = resolve;
    }));
    const { result, unmount } = renderHook(() => useObserverLocation(stellaRef));
    let enabling: Promise<void>;
    await act(async () => {
      enabling = result.current.enableAutomaticLocation();
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => result.current.setManualObserver(manual));
    await act(async () => {
      resolveWatch({ remove });
      await enabling;
    });
    expect(result.current.observer).toEqual(manual);
    expect(remove).toHaveBeenCalledTimes(1);
    unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('clears the GeoIP timeout even when fetch rejects', async () => {
    jest.useFakeTimers();
    try {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'granted' });
      (Location.getCurrentPositionAsync as jest.Mock).mockRejectedValueOnce(new Error('GPS unavailable'));
      jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('offline'));
      const { result, unmount } = renderHook(() => useObserverLocation(stellaRef));
      await act(async () => result.current.enableAutomaticLocation());
      expect(result.current.automaticLocation).toBe(false);
      unmount();
      // React's async act queues its own microtask; drain it without advancing timers.
      act(() => jest.runAllTicks());
      expect(jest.getTimerCount()).toBe(0);
    }
    finally {
      jest.useRealTimers();
    }
  });
});

describe('useObserverLocation pending GeoIP cleanup', () => {
  it('aborts a pending GeoIP request and clears its timer when unmounted', async () => {
    jest.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation((_url, options) => {
      signal = options?.signal ?? undefined;
      return new Promise((_resolve, reject) => signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    });
    try {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'granted' });
      (Location.getCurrentPositionAsync as jest.Mock).mockRejectedValueOnce(new Error('GPS unavailable'));
      const stellaRef = { current: { setLocation: jest.fn() } as unknown as StellariumViewHandle };
      const { result, unmount } = renderHook(() => useObserverLocation(stellaRef));
      let enabling: Promise<void> | undefined;
      await act(async () => {
        enabling = result.current.enableAutomaticLocation();
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(signal).toBeDefined();
      unmount();
      const wasAborted = signal?.aborted;
      // Settle the intentionally held request even on the red run.
      if (!wasAborted)
        act(() => jest.advanceTimersByTime(4000));
      await act(async () => enabling);
      act(() => jest.runAllTicks());
      expect(wasAborted).toBe(true);
      expect(jest.getTimerCount()).toBe(0);
    }
    finally {
      fetchSpy.mockRestore();
      jest.useRealTimers();
    }
  });
});

describe('useObserverLocation fallbacks and geocode', () => {
  const mockRemove = jest.fn();
  let mockSetLocation: jest.Mock;
  let stellaRef: { current: StellariumViewHandle | null };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSetLocation = jest.fn();
    stellaRef = { current: { setLocation: mockSetLocation } as unknown as StellariumViewHandle };
  });

  it('resolves location name via reverse geocode and records altitude', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: Location.PermissionStatus.GRANTED });
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValueOnce({
      coords: { altitude: 12.3, latitude: 24.87, longitude: 118.68 },
    });
    (Location.watchPositionAsync as jest.Mock).mockResolvedValueOnce({ remove: mockRemove });
    (Location.reverseGeocodeAsync as jest.Mock).mockResolvedValueOnce([
      { city: '泉州', country: '中国' },
    ]);

    const { result } = renderHook(() => useObserverLocation(stellaRef));

    await act(async () => {
      await result.current.enableAutomaticLocation();
    });

    expect(result.current.observer).toMatchObject({
      altitudeM: 12,
      latitudeDeg: 24.87,
      longitudeDeg: 118.68,
      name: '泉州, 中国',
      source: 'automatic',
    });
  });

  it('falls back to Stellarium GeoIP when GPS fails with SERVICE_INVALID', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: Location.PermissionStatus.GRANTED });
    (Location.getCurrentPositionAsync as jest.Mock).mockRejectedValueOnce(new Error('SERVICE_INVALID'));

    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn().mockResolvedValueOnce({
      json: () => Promise.resolve({
        city: 'Hangzhou',
        country_name: 'China',
        latitude: 30.294,
        longitude: 120.1619,
      }),
      ok: true,
    } as unknown as Response);

    const { result } = renderHook(() => useObserverLocation(stellaRef));

    await act(async () => {
      await result.current.enableAutomaticLocation();
    });

    expect(result.current.automaticLocation).toBe(true);
    expect(result.current.observer).toMatchObject({
      latitudeDeg: 30.294,
      longitudeDeg: 120.1619,
      name: 'Hangzhou, China',
      source: 'automatic',
    });
    expect(mockSetLocation).toHaveBeenLastCalledWith(30.294, 120.1619);

    globalThis.fetch = originalFetch;
  });
});
