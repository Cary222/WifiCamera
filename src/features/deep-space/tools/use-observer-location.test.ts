import type { StellariumViewHandle } from '@/features/stellarium/stellarium-view';
import { act, renderHook } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { useObserverLocation } from './use-observer-location';

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  PermissionStatus: { DENIED: 'denied', GRANTED: 'granted' },
  getCurrentPositionAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
}));

describe('useObserverLocation', () => {
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
