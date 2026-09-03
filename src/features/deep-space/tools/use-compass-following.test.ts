import type { StellariumViewHandle } from '@/features/stellarium/stellarium-view';
import { act, renderHook } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { showDeepSpaceFeedback } from '../ui/deep-space-feedback';
import { useCompassFollowing } from './use-compass-following';

jest.mock('expo-location', () => ({
  PermissionStatus: {
    DENIED: 'denied',
    GRANTED: 'granted',
  },
  requestForegroundPermissionsAsync: jest.fn(),
  watchHeadingAsync: jest.fn(),
}));

jest.mock('../ui/deep-space-feedback', () => ({
  showDeepSpaceFeedback: jest.fn(),
}));

jest.mock('@/lib/i18n', () => ({
  translate: (key: string) => ({
    'deep_space.compass_permission_denied': '需要位置权限才能使用真实罗盘航向',
    'deep_space.compass_started': '正在按真实罗盘航向跟随',
    'deep_space.compass_stopped': '已停止罗盘航向跟随',
    'deep_space.compass_unavailable': '当前设备无法提供罗盘航向',
  }[key] ?? key),
}));

describe('useCompassFollowing', () => {
  let mockSetViewBearing: jest.Mock;
  let stellaRef: { current: StellariumViewHandle | null };
  const mockRemove = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockSetViewBearing = jest.fn();
    stellaRef = {
      current: {
        setViewBearing: mockSetViewBearing,
      } as unknown as StellariumViewHandle,
    };
  });

  it('subscribes to real heading updates when location permission is granted', async () => {
    let headingCallback: ((heading: Location.LocationHeadingObject) => void) | undefined;
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      status: Location.PermissionStatus.GRANTED,
    });
    (Location.watchHeadingAsync as jest.Mock).mockImplementationOnce((callback: (heading: Location.LocationHeadingObject) => void) => {
      headingCallback = callback;
      return Promise.resolve({ remove: mockRemove });
    });

    const { result } = renderHook(() => useCompassFollowing(stellaRef));
    expect(result.current.compassFollowing).toBe(false);

    await act(async () => {
      await result.current.toggleCompassFollowing();
    });

    expect(result.current.compassFollowing).toBe(true);
    expect(showDeepSpaceFeedback).toHaveBeenCalledWith({
      message: '正在按真实罗盘航向跟随',
      tone: 'success',
    });

    expect(headingCallback).toBeDefined();
    act(() => {
      headingCallback?.({
        accuracy: 1,
        magHeading: 45,
        trueHeading: 180.5,
      });
    });

    expect(mockSetViewBearing).toHaveBeenCalledWith(180.5);
  });

  it('shows danger feedback when location permission is denied', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      status: Location.PermissionStatus.DENIED,
    });

    const { result } = renderHook(() => useCompassFollowing(stellaRef));

    await act(async () => {
      await result.current.toggleCompassFollowing();
    });

    expect(result.current.compassFollowing).toBe(false);
    expect(showDeepSpaceFeedback).toHaveBeenCalledWith({
      message: '需要位置权限才能使用真实罗盘航向',
      tone: 'danger',
    });
  });

  it('unsubscribes and confirms stopped feedback when toggled off', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      status: Location.PermissionStatus.GRANTED,
    });
    (Location.watchHeadingAsync as jest.Mock).mockResolvedValueOnce({ remove: mockRemove });

    const { result } = renderHook(() => useCompassFollowing(stellaRef));

    await act(async () => {
      await result.current.toggleCompassFollowing();
    });
    expect(result.current.compassFollowing).toBe(true);

    await act(async () => {
      await result.current.toggleCompassFollowing();
    });

    expect(mockRemove).toHaveBeenCalledTimes(1);
    expect(result.current.compassFollowing).toBe(false);
    expect(showDeepSpaceFeedback).toHaveBeenCalledWith({
      message: '已停止罗盘航向跟随',
      tone: 'success',
    });
  });

  it('catches sensor errors and displays an unavailable feedback banner', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockRejectedValueOnce(new Error('Sensor broken'));

    const { result } = renderHook(() => useCompassFollowing(stellaRef));

    await act(async () => {
      await result.current.toggleCompassFollowing();
    });

    expect(result.current.compassFollowing).toBe(false);
    expect(showDeepSpaceFeedback).toHaveBeenCalledWith({
      message: '当前设备无法提供罗盘航向',
      tone: 'danger',
    });
  });
});
