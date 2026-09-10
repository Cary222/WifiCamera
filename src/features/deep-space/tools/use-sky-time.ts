import type { StellariumViewHandle } from '@/features/stellarium/stellarium-view';
import * as React from 'react';
import { AppState } from 'react-native';
import { storage } from '@/lib/storage';
import { STORAGE_KEYS } from '@/lib/storage-keys';

export const TIME_PLAYBACK_SPEEDS = [-60, -1, 0, 1, 10, 60, 600] as const;
export type TimePlaybackSpeed = (typeof TIME_PLAYBACK_SPEEDS)[number];
export type SkyTimeMode = 'realtime' | 'paused' | 'playback';

type TimeStorage = {
  getString: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
};

type TimeAnchor = {
  mode: SkyTimeMode;
  playbackSpeed: TimePlaybackSpeed;
  skyMs: number;
  wallMs: number;
};

function loadTimeAnchor(store: TimeStorage): TimeAnchor {
  const wallMs = Date.now();
  const saved = store.getString(STORAGE_KEYS.DEEP_SPACE_SETTINGS_LAST_VIEW_TIME);
  const savedMs = saved ? Date.parse(saved) : Number.NaN;
  const restore = store.getString(STORAGE_KEYS.DEEP_SPACE_SETTINGS_START_TIME_POLICY) === 'last_view' && Number.isFinite(savedMs);
  return { mode: restore ? 'paused' : 'realtime', playbackSpeed: 1, skyMs: restore ? savedMs : wallMs, wallMs };
}

function sampleTime(anchor: TimeAnchor): Date {
  const now = Date.now();
  if (anchor.mode === 'realtime')
    return new Date(now);
  const elapsed = anchor.mode === 'playback' ? (now - anchor.wallMs) * anchor.playbackSpeed : 0;
  return new Date(Math.max(-8.64e15, Math.min(8.64e15, anchor.skyMs + elapsed)));
}

function useSkyTimeTicker({ persistTime, running, syncTime }: {
  persistTime: () => void;
  running: boolean;
  syncTime: () => Date;
}) {
  const appState = React.useRef(AppState.currentState);
  React.useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const stop = () => {
      if (timer !== undefined)
        clearInterval(timer);
      timer = undefined;
    };
    const start = () => {
      stop();
      if (running)
        timer = setInterval(syncTime, 1000);
    };
    if (appState.current !== 'background' && appState.current !== 'inactive')
      start();
    const subscription = AppState.addEventListener('change', (next) => {
      const previous = appState.current;
      appState.current = next;
      if (next === 'active' && previous !== 'active') {
        syncTime();
        start();
      }
      else if (next !== 'active') {
        stop();
        persistTime();
      }
    });
    return () => {
      stop();
      subscription.remove();
      persistTime();
    };
  }, [persistTime, running, syncTime]);
}

/** One clock for the engine, calendar and selected-object context; the panel owns no timer. */
export function useSkyTime(
  stellaRef: React.RefObject<StellariumViewHandle | null>,
  options?: { storage?: TimeStorage },
) {
  const store = options?.storage ?? storage;
  const anchorRef = React.useRef<TimeAnchor | null>(null);
  if (!anchorRef.current)
    anchorRef.current = loadTimeAnchor(store);
  const [snapshot, setSnapshot] = React.useState(() => ({
    clock: sampleTime(anchorRef.current!),
    mode: anchorRef.current!.mode,
    playbackSpeed: anchorRef.current!.playbackSpeed,
  }));
  const getCurrentTime = React.useCallback(() => sampleTime(anchorRef.current!), []);
  const persistTime = React.useCallback(() => {
    store.set(STORAGE_KEYS.DEEP_SPACE_SETTINGS_LAST_VIEW_TIME, getCurrentTime().toISOString());
  }, [getCurrentTime, store]);
  const syncTime = React.useCallback(() => {
    const clock = getCurrentTime();
    const { mode, playbackSpeed } = anchorRef.current!;
    setSnapshot(prev => prev.clock.getTime() === clock.getTime() && prev.mode === mode && prev.playbackSpeed === playbackSpeed
      ? prev
      : { clock, mode, playbackSpeed });
    store.set(STORAGE_KEYS.DEEP_SPACE_SETTINGS_LAST_VIEW_TIME, clock.toISOString());
    stellaRef.current?.setTime(clock);
    return clock;
  }, [getCurrentTime, stellaRef, store]);
  const reanchor = React.useCallback((patch: Partial<TimeAnchor>) => {
    anchorRef.current = { ...anchorRef.current!, skyMs: getCurrentTime().getTime(), wallMs: Date.now(), ...patch };
    syncTime();
  }, [getCurrentTime, syncTime]);
  const updateTime = React.useCallback((date: Date) => {
    if (Number.isFinite(date.getTime()))
      reanchor({ mode: 'paused', skyMs: date.getTime() });
  }, [reanchor]);
  const returnToNow = React.useCallback(() => reanchor({ mode: 'realtime', playbackSpeed: 1 }), [reanchor]);
  const setPlaybackSpeed = React.useCallback((speed: TimePlaybackSpeed) => {
    if (!TIME_PLAYBACK_SPEEDS.includes(speed))
      return;
    const mode = speed !== 0 && anchorRef.current!.mode === 'playback' ? 'playback' : 'paused';
    reanchor({ mode, playbackSpeed: speed });
  }, [reanchor]);
  const togglePlayback = React.useCallback(() => {
    const { mode, playbackSpeed } = anchorRef.current!;
    reanchor({ mode: mode === 'playback' ? 'paused' : 'playback', playbackSpeed: playbackSpeed || 1 });
  }, [reanchor]);

  useSkyTimeTicker({ persistTime, running: snapshot.mode !== 'paused', syncTime });
  return {
    ...snapshot,
    getCurrentTime,
    isCustomTime: snapshot.mode !== 'realtime',
    isPlaying: snapshot.mode === 'playback',
    persistTime,
    returnToNow,
    setPlaybackSpeed,
    syncTime,
    togglePlayback,
    updateTime,
  };
}
