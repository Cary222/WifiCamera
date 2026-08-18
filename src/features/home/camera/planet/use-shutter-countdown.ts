import { useCallback, useEffect, useRef, useState } from 'react';

type Options = {
  seconds: number;
  onFire: () => void;
};

/**
 * Delays the shutter by the configured countdown and exposes the remaining
 * seconds so the shutter button can render them. Tapping again while the
 * countdown runs cancels it instead of queueing a second capture.
 */
export function useShutterCountdown({ seconds, onFire }: Options) {
  const [remaining, setRemaining] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onFireRef = useRef(onFire);
  onFireRef.current = onFire;

  const cancel = useCallback(() => {
    if (timerRef.current)
      clearInterval(timerRef.current);
    timerRef.current = null;
    setRemaining(0);
  }, []);

  useEffect(() => () => {
    if (timerRef.current)
      clearInterval(timerRef.current);
  }, []);

  /** Returns true when the countdown took over, false to fire immediately. */
  const start = useCallback(() => {
    if (timerRef.current) {
      cancel();
      return true;
    }
    if (seconds <= 0)
      return false;
    setRemaining(seconds);
    timerRef.current = setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          cancel();
          onFireRef.current();
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return true;
  }, [cancel, seconds]);

  const isRunning = useCallback(() => timerRef.current !== null, []);

  return { remaining, start, cancel, isRunning };
}
