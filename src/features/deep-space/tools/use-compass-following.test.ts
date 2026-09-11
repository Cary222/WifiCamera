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

function createCompassRefs() {
  const mockSetViewBearing = jest.fn();
  return {
    mockSetViewBearing,
    stellaRef: {
      current: {
        setViewBearing: mockSetViewBearing,
      } as unknown as StellariumViewHandle,
    },
  };
}

function grantPermission() {
  (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({
    status: Location.PermissionStatus.GRANTED,
  });
}

async function startFollowing(result: { current: ReturnType<typeof useCompassFollowing> }) {
  await act(async () => {
    await result.current.toggleCompassFollowing();
  });
}

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

describe('useCompassFollowing stop invalidates pending work', () => {
  let mockSetViewBearing: jest.Mock;
  let stellaRef: { current: StellariumViewHandle | null };
  const mockRemove = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    const refs = createCompassRefs();
    mockSetViewBearing = refs.mockSetViewBearing;
    stellaRef = refs.stellaRef;
  });

  it('stops immediately while the permission request is still pending', async () => {
    let resolvePermission: (value: { status: string }) => void = () => {};
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockReturnValueOnce(
      new Promise((resolve) => { resolvePermission = resolve; }),
    );

    const { result } = renderHook(() => useCompassFollowing(stellaRef));
    let startPromise: Promise<void> = Promise.resolve();
    await act(async () => {
      startPromise = result.current.toggleCompassFollowing();
    });

    await act(async () => {
      result.current.stopCompassFollowing();
    });

    await act(async () => {
      resolvePermission({ status: Location.PermissionStatus.GRANTED });
      await startPromise;
    });

    expect(Location.watchHeadingAsync).not.toHaveBeenCalled();
    expect(result.current.compassFollowing).toBe(false);
    expect(showDeepSpaceFeedback).not.toHaveBeenCalledWith({
      message: '正在按真实罗盘航向跟随',
      tone: 'success',
    });
  });

  it('drops a heading watch that resolves after the user stopped following', async () => {
    let resolveWatch: (value: { remove: jest.Mock }) => void = () => {};
    grantPermission();
    (Location.watchHeadingAsync as jest.Mock).mockReturnValueOnce(
      new Promise((resolve) => { resolveWatch = resolve; }),
    );

    const { result } = renderHook(() => useCompassFollowing(stellaRef));
    let startPromise: Promise<void> = Promise.resolve();
    await act(async () => {
      startPromise = result.current.toggleCompassFollowing();
    });

    await act(async () => {
      result.current.stopCompassFollowing();
    });

    await act(async () => {
      resolveWatch({ remove: mockRemove });
      await startPromise;
    });

    expect(mockRemove).toHaveBeenCalledTimes(1);
    expect(result.current.compassFollowing).toBe(false);
  });

  it('never steers the view from a heading callback that lands after stop', async () => {
    let headingCallback: ((heading: Location.LocationHeadingObject) => void) | undefined;
    grantPermission();
    (Location.watchHeadingAsync as jest.Mock).mockImplementationOnce((callback: (heading: Location.LocationHeadingObject) => void) => {
      headingCallback = callback;
      return Promise.resolve({ remove: mockRemove });
    });

    const { result } = renderHook(() => useCompassFollowing(stellaRef));
    await startFollowing(result);

    act(() => {
      headingCallback?.({ accuracy: 1, magHeading: 45, trueHeading: 180.5 });
    });
    expect(mockSetViewBearing).toHaveBeenCalledWith(180.5);
    mockSetViewBearing.mockClear();

    await act(async () => {
      result.current.stopCompassFollowing();
    });

    act(() => {
      headingCallback?.({ accuracy: 1, magHeading: 45, trueHeading: 90 });
    });

    expect(mockSetViewBearing).not.toHaveBeenCalled();
    expect(mockRemove).toHaveBeenCalledTimes(1);
    expect(result.current.compassFollowing).toBe(false);
  });
});

describe('useCompassFollowing keeps a single live subscription', () => {
  let mockSetViewBearing: jest.Mock;
  let stellaRef: { current: StellariumViewHandle | null };
  const mockRemove = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    const refs = createCompassRefs();
    mockSetViewBearing = refs.mockSetViewBearing;
    stellaRef = refs.stellaRef;
  });

  it('creates a single heading subscription when start is requested twice', async () => {
    const secondRemove = jest.fn();
    let secondCallback: ((heading: Location.LocationHeadingObject) => void) | undefined;
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
      status: Location.PermissionStatus.GRANTED,
    });
    (Location.watchHeadingAsync as jest.Mock).mockImplementationOnce((callback: (heading: Location.LocationHeadingObject) => void) => {
      secondCallback = callback;
      return Promise.resolve({ remove: secondRemove });
    });

    const { result } = renderHook(() => useCompassFollowing(stellaRef));
    await act(async () => {
      await Promise.all([
        result.current.toggleCompassFollowing(),
        result.current.toggleCompassFollowing(),
      ]);
    });

    expect(Location.watchHeadingAsync).toHaveBeenCalledTimes(1);
    expect(result.current.compassFollowing).toBe(true);
    act(() => {
      secondCallback?.({ accuracy: 1, magHeading: 0, trueHeading: 34 });
    });
    expect(mockSetViewBearing).toHaveBeenCalledWith(34);
  });

  it('removes the subscription and ignores late headings after unmount', async () => {
    let headingCallback: ((heading: Location.LocationHeadingObject) => void) | undefined;
    grantPermission();
    (Location.watchHeadingAsync as jest.Mock).mockImplementationOnce((callback: (heading: Location.LocationHeadingObject) => void) => {
      headingCallback = callback;
      return Promise.resolve({ remove: mockRemove });
    });

    const { result, unmount } = renderHook(() => useCompassFollowing(stellaRef));
    await startFollowing(result);

    unmount();

    expect(mockRemove).toHaveBeenCalledTimes(1);
    act(() => {
      headingCallback?.({ accuracy: 1, magHeading: 0, trueHeading: 90 });
    });
    expect(mockSetViewBearing).not.toHaveBeenCalled();
  });
});
