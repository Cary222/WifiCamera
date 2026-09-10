import type { StellariumViewHandle } from '@/features/stellarium/stellarium-view';
import { act, renderHook } from '@testing-library/react-native';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import { restoreStellariumContext, useStellariumSettings } from './use-stellarium-settings';

function createTestStorage() {
  const map = new Map<string, string | number | boolean>();
  return {
    delete: jest.fn((key: string) => map.delete(key)),
    getBoolean: jest.fn((key: string) => (typeof map.get(key) === 'boolean' ? (map.get(key) as boolean) : undefined)),
    getNumber: jest.fn((key: string) => (typeof map.get(key) === 'number' ? (map.get(key) as number) : undefined)),
    getString: jest.fn((key: string) => (typeof map.get(key) === 'string' ? (map.get(key) as string) : undefined)),
    set: jest.fn((key: string, val: string | number | boolean) => map.set(key, val)),
  };
}

describe('restoreStellariumContext', () => {
  it.each([false, true])('replays all values, including disabled layers and magnitude state %s', (limitMagEnabled) => {
    const calls: [string, unknown[]][] = [];
    const command = (name: string) => jest.fn((...args: unknown[]) => {
      calls.push([name, args]);
    });
    const engine = {
      focusTarget: command('focus'),
      setBrightness: command('brightness'),
      setEnvironment: command('environment'),
      setGridLines: command('grids'),
      setLandscape: command('landscape'),
      setLocation: command('location'),
      setMagnitudeLimit: command('magnitude'),
      setSkyCulture: command('culture'),
      setSkyLayers: command('layers'),
      setTime: command('time'),
    } as unknown as StellariumViewHandle;
    const context = {
      brightness: 2.3,
      clock: new Date('2025-01-01T00:00:00.000Z'),
      currentCulture: 'chinese',
      environment: { bortleIndex: 7, cardinals: false, fog: false, turbidity: 0.96 },
      gridLines: { azimuthal: true, ecliptic: true, equator: false, equatorial_j2000: true, equatorial_jnow: false, meridian: true },
      landscapeId: 'zero_horizon',
      limitMagEnabled,
      limitMagValue: 4.5,
      observer: { latitudeDeg: 0, longitudeDeg: 0 },
      skyLayers: { atmosphere: false, constellationArt: false, constellationBoundaries: true, constellationLabels: false, constellationLines: true, constellationOnlyPointed: true, dsoHintsOffset: 0, dsoLabels: false, landscape: false, planetHintsOffset: 1, planetLabels: true, satelliteHintsOffset: 2, satelliteLabels: false, starHintsOffset: 3, starLabels: true },
    };
    restoreStellariumContext(engine, context);
    expect(calls).toEqual([
      ['time', [context.clock]],
      ['location', [0, 0]],
      ['culture', ['chinese']],
      ['landscape', ['zero_horizon']],
      ['layers', [context.skyLayers]],
      ['environment', [context.environment]],
      ['grids', [context.gridLines]],
      ['brightness', [2.3]],
      ['magnitude', [limitMagEnabled ? 4.5 : 99]],
    ]);
  });
});

describe('useStellariumSettings', () => {
  let mockSetMagnitudeLimit: jest.Mock;
  let mockSetBrightness: jest.Mock;
  let mockSetTime: jest.Mock;
  let stellaRef: { current: StellariumViewHandle | null };

  beforeEach(() => {
    mockSetMagnitudeLimit = jest.fn();
    mockSetBrightness = jest.fn();
    mockSetTime = jest.fn();
    stellaRef = {
      current: {
        setBrightness: mockSetBrightness,
        setMagnitudeLimit: mockSetMagnitudeLimit,
        setTime: mockSetTime,
      } as unknown as StellariumViewHandle,
    };
  });

  it('initializes with default settings and saves changes to storage', () => {
    const storage = createTestStorage();
    const { result } = renderHook(() => useStellariumSettings(stellaRef, { storage }));

    expect(result.current.startTimePolicy).toBe('now');
    expect(result.current.fullscreen).toBe(false);
    expect(result.current.limitMagEnabled).toBe(false);
    expect(result.current.limitMagValue).toBe(6.5);
    expect(result.current.brightness).toBe(1.0);

    act(() => {
      result.current.setBrightness(2.5);
    });

    expect(result.current.brightness).toBe(2.5);
    expect(mockSetBrightness).toHaveBeenCalledWith(2.5);
    expect(storage.set).toHaveBeenCalledWith(STORAGE_KEYS.DEEP_SPACE_SETTINGS_BRIGHTNESS, 2.5);
  });

  it('sends magnitude limit when enabled and sends 99 when disabled', () => {
    const storage = createTestStorage();
    const { result } = renderHook(() => useStellariumSettings(stellaRef, { storage }));

    act(() => {
      result.current.setLimitMagValue(7.2);
    });
    expect(result.current.limitMagValue).toBe(7.2);
    expect(mockSetMagnitudeLimit).not.toHaveBeenCalled();

    act(() => {
      result.current.setLimitMagEnabled(true);
    });
    expect(result.current.limitMagEnabled).toBe(true);
    expect(mockSetMagnitudeLimit).toHaveBeenCalledWith(7.2);

    act(() => {
      result.current.setLimitMagValue(5.0);
    });
    expect(mockSetMagnitudeLimit).toHaveBeenCalledWith(5.0);

    act(() => {
      result.current.setLimitMagEnabled(false);
    });
    expect(mockSetMagnitudeLimit).toHaveBeenCalledWith(99);
  });

  it('updates start time policy and returns to now when now policy is selected', () => {
    const storage = createTestStorage();
    const onReturnToNow = jest.fn();
    const { result } = renderHook(() => useStellariumSettings(stellaRef, { onReturnToNow, storage }));

    act(() => {
      result.current.setStartTimePolicy('last_view');
    });
    expect(result.current.startTimePolicy).toBe('last_view');
    expect(storage.set).toHaveBeenCalledWith(STORAGE_KEYS.DEEP_SPACE_SETTINGS_START_TIME_POLICY, 'last_view');

    act(() => {
      result.current.setStartTimePolicy('now');
    });
    expect(result.current.startTimePolicy).toBe('now');
    expect(onReturnToNow).toHaveBeenCalled();
  });

  it('resets all settings to default on resetAll', () => {
    const storage = createTestStorage();
    const onReturnToNow = jest.fn();
    const { result } = renderHook(() => useStellariumSettings(stellaRef, { onReturnToNow, storage }));

    act(() => {
      result.current.setBrightness(4.0);
      result.current.setLimitMagEnabled(true);
      result.current.setLimitMagValue(8.0);
      result.current.setFullscreen(true);
      result.current.setStartTimePolicy('last_view');
    });

    act(() => {
      result.current.resetSettings();
    });

    expect(result.current.brightness).toBe(1.0);
    expect(result.current.limitMagEnabled).toBe(false);
    expect(result.current.limitMagValue).toBe(6.5);
    expect(result.current.fullscreen).toBe(false);
    expect(result.current.startTimePolicy).toBe('now');
    expect(mockSetMagnitudeLimit).toHaveBeenLastCalledWith(99);
    expect(mockSetBrightness).toHaveBeenLastCalledWith(1.0);
  });
});
