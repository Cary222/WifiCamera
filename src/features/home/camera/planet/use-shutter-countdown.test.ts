import { act, renderHook } from '@testing-library/react-native';
import { useShutterCountdown } from './use-shutter-countdown';

describe('useShutterCountdown', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('fires only after the configured delay elapses', () => {
    const onFire = jest.fn();
    const { result } = renderHook(() => useShutterCountdown({ seconds: 3, onFire }));

    act(() => {
      expect(result.current.start()).toBe(true);
    });
    expect(result.current.remaining).toBe(3);
    expect(onFire).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current.remaining).toBe(2);
    expect(onFire).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(onFire).toHaveBeenCalledTimes(1);
    expect(result.current.remaining).toBe(0);
  });

  it('reports no countdown when disabled so the caller fires immediately', () => {
    const onFire = jest.fn();
    const { result } = renderHook(() => useShutterCountdown({ seconds: 0, onFire }));

    act(() => {
      expect(result.current.start()).toBe(false);
    });
    expect(onFire).not.toHaveBeenCalled();
  });

  it('cancels a running countdown when started again', () => {
    const onFire = jest.fn();
    const { result } = renderHook(() => useShutterCountdown({ seconds: 3, onFire }));

    act(() => {
      result.current.start();
    });
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    act(() => {
      expect(result.current.start()).toBe(true);
    });

    expect(result.current.remaining).toBe(0);
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(onFire).not.toHaveBeenCalled();
  });

  it('stops the timer when unmounted mid-countdown', () => {
    const onFire = jest.fn();
    const { result, unmount } = renderHook(() => useShutterCountdown({ seconds: 3, onFire }));

    act(() => {
      result.current.start();
    });
    unmount();
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(onFire).not.toHaveBeenCalled();
  });
});
