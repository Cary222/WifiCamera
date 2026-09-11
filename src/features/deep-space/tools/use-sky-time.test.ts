import type { AppStateStatus } from 'react-native';
import type { StellariumViewHandle } from '@/features/stellarium/stellarium-view';
import { act, cleanup, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import { TIME_PLAYBACK_SPEEDS, useSkyTime } from './use-sky-time';

const NOW = new Date('2026-09-09T12:00:00.000Z');
const SELECTED = new Date('2025-01-15T00:00:00.000Z');

function createStore() {
  const values = new Map<string, string>();
  return {
    getString: (key: string) => values.get(key),
    set: (key: string, value: string) => values.set(key, value),
  };
}

function createClock(storage = createStore()) {
  const setTime = jest.fn();
  const stellaRef = { current: { setTime } as unknown as StellariumViewHandle };
  return { ...renderHook(() => useSkyTime(stellaRef, { storage })), setTime, storage };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('useSkyTime anchored clock', () => {
  it('retains existing speeds and supports reverse and pause', () => {
    expect(TIME_PLAYBACK_SPEEDS).toEqual([-60, -1, 0, 1, 10, 60, 600]);
  });

  it.each([-60, -1, 1, 60] as const)('plays %sx from the anchor, including delayed ticks', (speed) => {
    const { result, setTime } = createClock();
    act(() => result.current.updateTime(SELECTED));
    act(() => result.current.setPlaybackSpeed(speed));
    act(() => result.current.togglePlayback());
    setTime.mockClear();
    // The event loop was blocked for 17 seconds; only one interval callback runs.
    jest.setSystemTime(NOW.getTime() + 17_000);
    act(() => jest.advanceTimersByTime(1000));
    expect(result.current.clock.getTime()).toBe(SELECTED.getTime() + speed * 18_000);
    expect(setTime).toHaveBeenCalledTimes(1);
    expect(setTime).toHaveBeenLastCalledWith(result.current.clock);
  });

  it('pauses at the actual elapsed instant when changing speed between ticks', () => {
    const { result } = createClock();
    act(() => result.current.updateTime(SELECTED));
    act(() => result.current.setPlaybackSpeed(60));
    act(() => result.current.togglePlayback());
    jest.setSystemTime(NOW.getTime() + 1500);
    act(() => result.current.setPlaybackSpeed(-1));
    jest.setSystemTime(NOW.getTime() + 2000);
    act(() => result.current.setPlaybackSpeed(0));
    expect(result.current.clock.getTime()).toBe(SELECTED.getTime() + 89_500);
    expect(result.current.mode).toBe('paused');
    act(() => jest.advanceTimersByTime(60_000));
    expect(result.current.clock.getTime()).toBe(SELECTED.getTime() + 89_500);
  });

  it('returns to realtime and follows system clock, not the old playback anchor', () => {
    const { result } = createClock();
    act(() => result.current.updateTime(SELECTED));
    act(() => result.current.setPlaybackSpeed(-60));
    act(() => result.current.togglePlayback());
    act(() => result.current.returnToNow());
    expect(result.current.mode).toBe('realtime');
    expect(result.current.isCustomTime).toBe(false);
    act(() => jest.advanceTimersByTime(2000));
    expect(result.current.clock.getTime()).toBe(NOW.getTime() + 2000);
  });
});

describe('useSkyTime lifecycle and persistence', () => {
  it('samples once after backgrounding without replaying missed ticks and removes the listener', () => {
    let changeState: (state: AppStateStatus) => void = () => {};
    const remove = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
      changeState = callback;
      return { remove };
    });
    const { result, setTime, unmount } = createClock();
    act(() => result.current.updateTime(SELECTED));
    act(() => result.current.setPlaybackSpeed(60));
    act(() => result.current.togglePlayback());
    act(() => changeState('background'));
    setTime.mockClear();
    act(() => jest.advanceTimersByTime(120_000));
    expect(setTime).not.toHaveBeenCalled();
    act(() => changeState('active'));
    expect(setTime).toHaveBeenCalledTimes(1);
    expect(result.current.clock.getTime()).toBe(SELECTED.getTime() + 120_000 * 60);
    unmount();
    expect(remove).toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('saves the selected date immediately and restores it paused for last_view only', () => {
    const storage = createStore();
    const first = createClock(storage);
    act(() => first.result.current.updateTime(SELECTED));
    expect(storage.getString(STORAGE_KEYS.DEEP_SPACE_SETTINGS_LAST_VIEW_TIME)).toBe(SELECTED.toISOString());
    first.unmount();
    storage.set(STORAGE_KEYS.DEEP_SPACE_SETTINGS_START_TIME_POLICY, 'last_view');
    const second = createClock(storage);
    expect(second.result.current.clock).toEqual(SELECTED);
    expect(second.result.current.mode).toBe('paused');
    act(() => jest.advanceTimersByTime(2000));
    expect(second.result.current.clock).toEqual(SELECTED);
    second.unmount();
    storage.set(STORAGE_KEYS.DEEP_SPACE_SETTINGS_START_TIME_POLICY, 'now');
    const third = createClock(storage);
    expect(third.result.current.clock.getTime()).toBe(Date.now());
    expect(third.result.current.mode).toBe('realtime');
  });

  it('persists the sampled playback date on unmount even between ticks', () => {
    const { result, storage, unmount } = createClock();
    act(() => result.current.updateTime(SELECTED));
    act(() => result.current.setPlaybackSpeed(-60));
    act(() => result.current.togglePlayback());
    jest.setSystemTime(NOW.getTime() + 1500);
    unmount();
    expect(storage.getString(STORAGE_KEYS.DEEP_SPACE_SETTINGS_LAST_VIEW_TIME)).toBe(new Date(SELECTED.getTime() - 90_000).toISOString());
    expect(jest.getTimerCount()).toBe(0);
  });

  it('ignores corrupt saved dates and invalid manual dates', () => {
    const storage = createStore();
    storage.set(STORAGE_KEYS.DEEP_SPACE_SETTINGS_START_TIME_POLICY, 'last_view');
    storage.set(STORAGE_KEYS.DEEP_SPACE_SETTINGS_LAST_VIEW_TIME, 'invalid');
    const { result, setTime } = createClock(storage);
    expect(result.current.mode).toBe('realtime');
    act(() => result.current.updateTime(new Date(Number.NaN)));
    expect(result.current.clock).toEqual(NOW);
    expect(setTime).not.toHaveBeenCalled();
  });
});
