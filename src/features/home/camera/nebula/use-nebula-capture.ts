/* eslint-disable max-lines-per-function, react-hooks/set-state-in-effect */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useCameraStore } from '../camera-store';

const NEBULA_CAPTURE = 'nebula_capture';

type Options = { exposure: number; gain: number };
type CaptureOptions = { count?: number; interval?: number };
type State = 'idle' | 'countdown' | 'capturing';

function waitMs(exposure: number, count: number, interval: number): number {
  if (count <= 1)
    return Math.max(10_000, exposure * 1000 + 15_000);
  return count * Math.max(3_000, exposure * 1000 + 8_000) + interval * 1000 * (count - 1) + 20_000;
}

/**
 * The board runs nebula exposure asynchronously. Completion is detected from
 * camera_state / newestCameraJpgUrl, matching the working browser app.
 */
export function useNebulaCapture({ exposure, gain }: Options) {
  const sendCommand = useCameraStore.use.sendCommand();
  const requestCameraState = useCameraStore.use.requestCameraState();
  const stopRepeatExposure = useCameraStore.use.stopRepeatExposure();
  const abortExposure = useCameraStore.use.abortExposure();
  const cameraStatus = useCameraStore.use.cameraStatus();
  const [captureState, setCaptureState] = useState<State>('idle');
  const [countdownRemaining, setCountdownRemaining] = useState(0);
  const [repeatTotal, setRepeatTotal] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finishPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeRef = useRef(false);
  /** Latest countdown value, mirrored so the interval can tick without a setState updater side effect. */
  const countdownValueRef = useRef(0);
  /** True once the board has actually entered exposing/repeating for this job. */
  const observedBoardCaptureRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (timeoutRef.current)
      clearTimeout(timeoutRef.current);
    if (countdownRef.current)
      clearInterval(countdownRef.current);
    if (finishPollRef.current)
      clearInterval(finishPollRef.current);
    timeoutRef.current = null;
    countdownRef.current = null;
    finishPollRef.current = null;
  }, []);

  const finish = useCallback(() => {
    clearTimers();
    activeRef.current = false;
    observedBoardCaptureRef.current = false;
    setRepeatTotal(0);
    setCaptureState('idle');
    requestCameraState();
    // A completed long exposure can be written a few seconds after busy clears.
    let tries = 0;
    finishPollRef.current = setInterval(() => {
      tries += 1;
      requestCameraState();
      if (tries >= 6 && finishPollRef.current) {
        clearInterval(finishPollRef.current);
        finishPollRef.current = null;
      }
    }, 1500);
  }, [clearTimers, requestCameraState]);

  useEffect(() => {
    if (!activeRef.current)
      return;
    if (cameraStatus === 'in_exposure' || cameraStatus === 'in_repeat') {
      observedBoardCaptureRef.current = true;
      return;
    }
    // Board reports `stopping` before real exposure; finish only after it has
    // exposed/repeated and returned to its steady streaming/idle state.
    if (observedBoardCaptureRef.current && (cameraStatus === 'in_streaming' || cameraStatus === 'idle'))
      finish();
  }, [cameraStatus, finish]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const begin = useCallback((count: number, interval: number) => {
    activeRef.current = true;
    observedBoardCaptureRef.current = false;
    setRepeatTotal(count);
    setCountdownRemaining(0);
    setCaptureState('capturing');
    sendCommand({
      device_name: 'main_camera',
      instruction: NEBULA_CAPTURE,
      params: [exposure, gain, count, interval],
      id: `APP-NEB-${Date.now().toString(36)}`,
    });
    timeoutRef.current = setTimeout(finish, waitMs(exposure, count, interval));
  }, [exposure, finish, gain, sendCommand]);

  const capture = useCallback((options: CaptureOptions = {}) => {
    if (activeRef.current)
      return;
    begin(Math.max(1, Math.round(options.count ?? 1)), Math.max(0, Math.round(options.interval ?? 0)));
  }, [begin]);

  const startCountdown = useCallback((seconds: number, options: CaptureOptions = {}) => {
    if (activeRef.current || countdownRef.current)
      return;
    if (seconds <= 0)
      return capture(options);
    setCaptureState('countdown');
    setCountdownRemaining(seconds);
    countdownValueRef.current = seconds;
    countdownRef.current = setInterval(() => {
      // Read the latest value instead of calling begin() inside the setState
      // updater: updater side effects are deferred and can double-fire.
      const current = countdownValueRef.current - 1;
      countdownValueRef.current = current;
      setCountdownRemaining(current);
      if (current <= 0) {
        clearTimers();
        begin(Math.max(1, Math.round(options.count ?? 1)), Math.max(0, Math.round(options.interval ?? 0)));
      }
    }, 1000);
  }, [begin, capture, clearTimers]);

  const cancel = useCallback(() => {
    if (!activeRef.current && !countdownRef.current)
      return;
    const captureStarted = activeRef.current;
    clearTimers();
    activeRef.current = false;
    observedBoardCaptureRef.current = false;
    setCountdownRemaining(0);
    setRepeatTotal(0);
    setCaptureState('idle');
    // Pure countdown cancellation must not touch the board: no exposure has
    // started yet (mirrors landscape's cancelLandscapeTimerCapture).
    if (!captureStarted)
      return;
    if (repeatTotal > 1)
      stopRepeatExposure();
    else
      abortExposure();
  }, [abortExposure, clearTimers, repeatTotal, stopRepeatExposure]);

  return { captureState, countdownRemaining, repeatTotal, capture, startCountdown, cancel };
}
