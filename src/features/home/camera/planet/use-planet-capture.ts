/* eslint-disable max-lines-per-function */

import type { AspectRatio, SensorRoi } from './preview-layout';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCameraStore } from '../camera-store';
import { getEffectiveSensorRoi, getSensorRoiCommandParams } from './preview-layout';

export type PlanetFormat = 'ser8' | 'ser12' | 'ser16' | 'mp4';

export type RoiPreset = SensorRoi & {
  key: string;
  label: string;
  resolution: string;
  fps: number;
};

/**
 * Sensor crops mirroring the board's ROI presets. Cropping fewer rows lets the
 * sensor clock out frames faster, which is what makes planetary capture usable.
 */
export const PLANET_ROI_PRESETS: RoiPreset[] = [
  { key: 'full120', label: '1920×1080', resolution: '1080P', fps: 120, x: 0, y: 0, width: 1920, height: 1080 },
  { key: 'full60', label: '1920×1080', resolution: '1080P', fps: 60, x: 0, y: 0, width: 1920, height: 1080 },
  { key: 'medium', label: '800×600', resolution: '800P', fps: 120, x: 560, y: 240, width: 800, height: 600 },
  { key: 'deep', label: '640×480', resolution: '640P', fps: 200, x: 640, y: 300, width: 640, height: 480 },
];

type Options = {
  exposure: number;
  gain: number;
  format: PlanetFormat;
  roiPreset: RoiPreset;
  aspectRatio: AspectRatio;
};

type SerStatusPayload = {
  recording?: boolean;
  status?: string;
  written_frames?: number;
  accepted_frames?: number;
  effective_fps?: number;
  error_message?: string;
};

function readSerStatusPayload(data: unknown): SerStatusPayload | null {
  if (typeof data !== 'object' || data === null)
    return null;
  return data as SerStatusPayload;
}

/**
 * The board reports an in-flight recording either through `recording` or via a
 * transitional `status` string (see the browser app's `normalizeSerStatus`).
 */
function isSerRecording(payload: SerStatusPayload): boolean {
  if (payload.recording === true)
    return true;
  const status = String(payload.status ?? '').toLowerCase();
  return ['recording', 'running', 'starting', 'stopping'].includes(status);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Owns the planetary capture side effects: streaming parameters, hardware ROI,
 * and the SER/MP4 recording lifecycle with its board status polling.
 */
export function usePlanetCapture({ exposure, gain, format, roiPreset, aspectRatio }: Options) {
  const sendCommandWait = useCameraStore.use.sendCommandWait();
  const changeStreamingSetting = useCameraStore.use.changeStreamingSetting();
  const requestCameraState = useCameraStore.use.requestCameraState();
  const startLandscapeCapture = useCameraStore.use.startLandscapeCapture();
  const landscapeCaptureState = useCameraStore.use.landscapeCaptureState();
  const lastCommandError = useCameraStore.use.lastCommandError();
  const connectionStatus = useCameraStore.use.connectionStatus();

  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [writtenFrames, setWrittenFrames] = useState(0);
  const [isApplyingRoi, setIsApplyingRoi] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const reportActionError = useCallback((message: string) => {
    console.error('[planet-capture]', message);
    setActionError(message);
  }, []);

  const effectiveRoi = useMemo(
    () => getEffectiveSensorRoi(roiPreset, aspectRatio),
    [aspectRatio, roiPreset],
  );

  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRecordingRef = useRef(isRecording);
  isRecordingRef.current = isRecording;
  const formatRef = useRef(format);
  formatRef.current = format;

  const isConnected = connectionStatus === 'open';
  const isCapturing = landscapeCaptureState === 'capturing';

  // 与星云模式一致：进入页面不要用本地默认值覆盖板端 AE。changeStreamingSetting
  // 会让板端切到手动并锁定该曝光/增益，一进来就下发会得到与实际光照无关的亮度。
  const appliedSettingRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isConnected)
      return;
    const key = `${exposure}/${gain}`;
    if (appliedSettingRef.current === null) {
      appliedSettingRef.current = key;
      return;
    }
    if (appliedSettingRef.current === key)
      return;
    appliedSettingRef.current = key;
    changeStreamingSetting(exposure, gain);
  }, [exposure, gain, isConnected, changeStreamingSetting]);

  // Apply the selected window on entry and after every ratio/preset change so
  // the preview, captured JPEG, MP4 and SER all use one hardware ROI.
  const appliedRoiKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isConnected)
      return;
    const roiKey = `${effectiveRoi.x}/${effectiveRoi.y}/${effectiveRoi.width}/${effectiveRoi.height}`;
    if (appliedRoiKeyRef.current === roiKey)
      return;

    // Default 1920x1080 full frame is already the board's startup stream.
    // Marking it applied on entry skips an unnecessary sensor restart that
    // drops the initial WHEP handshake.
    if (
      appliedRoiKeyRef.current === null
      && effectiveRoi.x === 0
      && effectiveRoi.y === 0
      && effectiveRoi.width === 1920
      && effectiveRoi.height === 1080
    ) {
      appliedRoiKeyRef.current = roiKey;
      return;
    }

    let active = true;
    void Promise.resolve().then(async () => {
      if (!active)
        return;
      setIsApplyingRoi(true);
      setActionError(null);
      useCameraStore.setState({ lastCommandError: null });
      const result = await sendCommandWait(
        'set_sensor_roi',
        getSensorRoiCommandParams(effectiveRoi),
        12_000,
      );
      if (!active)
        return;
      if (result.error)
        throw new Error(result.error);
      if (result.timeout)
        throw new Error('切换画幅超时');
      if (result.msg?.success === false)
        throw new Error('板端拒绝了画幅设置');
      appliedRoiKeyRef.current = roiKey;
      // Hardware ROI rebuilds the stream pipeline. Keep capture controls locked
      // until the WHEP source has had time to publish the new dimensions.
      await sleep(700);
    }).catch((error) => {
      if (active)
        reportActionError(error instanceof Error ? error.message : String(error));
    }).finally(() => {
      if (active)
        setIsApplyingRoi(false);
    });

    return () => {
      active = false;
    };
  }, [effectiveRoi, isConnected, reportActionError, sendCommandWait]);

  const clearTimers = useCallback(() => {
    if (recordingTimerRef.current)
      clearInterval(recordingTimerRef.current);
    if (statusPollRef.current)
      clearInterval(statusPollRef.current);
    recordingTimerRef.current = null;
    statusPollRef.current = null;
  }, []);

  useEffect(() => () => {
    clearTimers();
    if (isRecordingRef.current) {
      // Safety stop on unmount so the board does not continue recording indefinitely.
      const instruction = formatRef.current === 'mp4' ? 'streaming_stop_save' : 'stop_ser_record';
      useCameraStore.getState().sendCommand({
        device_name: 'main_camera',
        instruction,
        params: [],
        id: `APP-PLANET-UNMOUNT-STOP-${Date.now().toString(36)}`,
      });
    }
  }, [clearTimers]);

  const capturePhoto = useCallback(() => {
    if (!isConnected || isCapturing || isRecording || isApplyingRoi)
      return;
    setActionError(null);
    useCameraStore.setState({ lastCommandError: null });
    // Reuse the camera store's proven capture_stream_frame state machine. This
    // firmware completes through camera_state.last_result instead of replying
    // directly to capture_stream_frame, so sendCommandWait would time out.
    startLandscapeCapture();
  }, [isConnected, isCapturing, isRecording, isApplyingRoi, startLandscapeCapture]);

  const pollSerStatus = useCallback(() => {
    statusPollRef.current = setInterval(() => {
      void sendCommandWait('get_ser_status', [], 3000).then((result) => {
        const payload = readSerStatusPayload(result.msg?.data);
        if (!payload)
          return;
        if (typeof payload.written_frames === 'number')
          setWrittenFrames(payload.written_frames);
        if (payload.error_message)
          reportActionError(payload.error_message);
      });
    }, 1500);
  }, [reportActionError, sendCommandWait]);

  const readSerStatus = useCallback(async (): Promise<SerStatusPayload | null> => {
    const result = await sendCommandWait('get_ser_status', [], 4500);
    return readSerStatusPayload(result.msg?.data);
  }, [sendCommandWait]);

  /**
   * Poll `get_ser_status` until the board agrees with the state we expect, the
   * same handshake the browser app performs via `waitForSerCondition`.
   */
  const waitForSerCondition = useCallback(async (
    predicate: (payload: SerStatusPayload) => boolean,
    timeoutMs: number,
  ): Promise<SerStatusPayload | null> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const payload = await readSerStatus();
      if (payload && predicate(payload))
        return payload;
      await sleep(350);
    }
    return null;
  }, [readSerStatus]);

  /**
   * SER pulls RAW frames, so the board needs a stream whose exposure matches the
   * target frame rate before recording starts (browser: `ensureSerStreaming`).
   */
  const ensureSerStreaming = useCallback(async (fps: number) => {
    const exposureForFps = Math.max(0.001, Math.min(0.25, 1 / Math.max(fps, 0.1)));
    const result = await sendCommandWait('start_streaming_exposure', [exposureForFps, -1], 22_000);
    if (result.error)
      throw new Error(result.error);
    if (result.timeout)
      throw new Error('启动 RAW 采集流超时');
    if (result.msg?.success === false)
      throw new Error('启动 RAW 采集流失败');
    await sleep(700);
  }, [sendCommandWait]);

  const startRecording = useCallback(async () => {
    if (!isConnected || isRecording || isApplyingRoi)
      return;
    setActionError(null);
    setRecordingSeconds(0);
    setWrittenFrames(0);

    try {
      const bitDepth = format === 'ser16' ? 16 : format === 'ser12' ? 12 : 8;
      if (format !== 'mp4')
        await ensureSerStreaming(roiPreset.fps);

      const result = format === 'mp4'
        ? await sendCommandWait('streaming_start_save', [`planet_${Date.now()}`], 10_000)
        : await sendCommandWait('start_ser_record', [
            `/mnt/sdcard/Videos/planet_${Date.now()}.ser`,
            bitDepth,
            roiPreset.fps,
          ], 10_000);

      if (result.error)
        throw new Error(result.error);
      if (result.timeout)
        throw new Error('启动录制超时');
      if (result.msg?.success === false)
        throw new Error('板端拒绝了录制请求');

      // Only claim we are recording once the board confirms it, so the UI can
      // never show REC for a session the board silently refused.
      if (format !== 'mp4') {
        const started = await waitForSerCondition(isSerRecording, 10_000);
        if (!started)
          throw new Error('板端未进入 SER 录制状态');
      }

      setIsRecording(true);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(seconds => seconds + 1);
      }, 1000);
      if (format !== 'mp4')
        pollSerStatus();
    }
    catch (error) {
      clearTimers();
      setIsRecording(false);
      if (format !== 'mp4') {
        appliedSettingRef.current = `${exposure}/${gain}`;
        changeStreamingSetting(exposure, gain);
      }
      reportActionError(error instanceof Error ? error.message : String(error));
    }
  }, [
    isConnected,
    isRecording,
    isApplyingRoi,
    format,
    roiPreset,
    exposure,
    gain,
    changeStreamingSetting,
    sendCommandWait,
    clearTimers,
    pollSerStatus,
    ensureSerStreaming,
    waitForSerCondition,
    reportActionError,
  ]);

  const stopRecording = useCallback(async () => {
    if (!isConnected || !isRecording)
      return;
    clearTimers();
    try {
      if (format === 'mp4') {
        const result = await sendCommandWait('streaming_stop_save', [], 20_000);
        if (result.error)
          throw new Error(result.error);
        if (result.timeout)
          throw new Error('停止录制超时');
      }
      else {
        const result = await sendCommandWait('stop_ser_record', [], 15_000);
        if (result.error)
          throw new Error(result.error);
        // The SER writer keeps flushing after the command returns; wait for the
        // board to leave the recording state so the file is complete on disk.
        const stopped = await waitForSerCondition(
          payload => !isSerRecording(payload),
          20_000,
        );
        if (!stopped)
          throw new Error('SER 文件刷盘未在预期时间内完成');
      }
      requestCameraState();
    }
    catch (error) {
      reportActionError(error instanceof Error ? error.message : String(error));
    }
    finally {
      setIsRecording(false);
      if (format !== 'mp4') {
        appliedSettingRef.current = `${exposure}/${gain}`;
        changeStreamingSetting(exposure, gain);
      }
    }
  }, [
    isConnected,
    isRecording,
    format,
    exposure,
    gain,
    changeStreamingSetting,
    sendCommandWait,
    clearTimers,
    requestCameraState,
    waitForSerCondition,
    reportActionError,
  ]);

  const dismissError = useCallback(() => {
    setActionError(null);
    useCameraStore.setState({ lastCommandError: null });
  }, []);

  return {
    isRecording,
    recordingSeconds,
    writtenFrames,
    isCapturing,
    isApplyingRoi,
    effectiveRoi,
    actionError: actionError ?? lastCommandError,
    capturePhoto,
    startRecording,
    stopRecording,
    dismissError,
  };
}
