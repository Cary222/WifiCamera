/* eslint-disable max-lines-per-function */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useCameraStore } from '../camera-store';

export type PlanetFormat = 'ser8' | 'ser12' | 'ser16' | 'mp4';

export type RoiPreset = {
  key: string;
  label: string;
  resolution: string;
  fps: number;
  x: number;
  y: number;
  width: number;
  height: number;
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
export function usePlanetCapture({ exposure, gain, format, roiPreset }: Options) {
  const sendCommand = useCameraStore.use.sendCommand();
  const sendCommandWait = useCameraStore.use.sendCommandWait();
  const changeStreamingSetting = useCameraStore.use.changeStreamingSetting();
  const requestCameraState = useCameraStore.use.requestCameraState();
  const connectionStatus = useCameraStore.use.connectionStatus();

  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [writtenFrames, setWrittenFrames] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isConnected = connectionStatus === 'open';

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

  // 板端切换硬件裁切窗口会中断当前推流（见网页端 roi_addon.js 的 ROI 恢复流程），
  // 所以进入页面时沿用板端现有视场，只有用户主动换预设后才下发。
  const appliedRoiKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isConnected)
      return;
    if (appliedRoiKeyRef.current === null) {
      appliedRoiKeyRef.current = roiPreset.key;
      return;
    }
    if (appliedRoiKeyRef.current === roiPreset.key)
      return;
    appliedRoiKeyRef.current = roiPreset.key;
    sendCommand({
      device_name: 'main_camera',
      instruction: 'set_sensor_roi',
      params: [roiPreset.x, roiPreset.y, roiPreset.width, roiPreset.height, 0],
      id: `APP-PLANET-ROI-${Date.now().toString(36)}`,
    });
  }, [roiPreset, isConnected, sendCommand]);

  const clearTimers = useCallback(() => {
    if (recordingTimerRef.current)
      clearInterval(recordingTimerRef.current);
    if (statusPollRef.current)
      clearInterval(statusPollRef.current);
    recordingTimerRef.current = null;
    statusPollRef.current = null;
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const capturePhoto = useCallback(async () => {
    if (!isConnected || isCapturing || isRecording)
      return;
    setIsCapturing(true);
    setActionError(null);
    try {
      const result = await sendCommandWait('capture_stream_frame', [], 10_000);
      if (result.error)
        throw new Error(result.error);
      if (result.timeout)
        throw new Error('拍照超时');
      if (result.msg?.success === false)
        throw new Error('板端拍照失败');
      requestCameraState();
    }
    catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
    finally {
      setIsCapturing(false);
    }
  }, [isConnected, isCapturing, isRecording, sendCommandWait, requestCameraState]);

  const pollSerStatus = useCallback(() => {
    statusPollRef.current = setInterval(() => {
      void sendCommandWait('get_ser_status', [], 3000).then((result) => {
        const payload = readSerStatusPayload(result.msg?.data);
        if (!payload)
          return;
        if (typeof payload.written_frames === 'number')
          setWrittenFrames(payload.written_frames);
        if (payload.error_message)
          setActionError(payload.error_message);
      });
    }, 1500);
  }, [sendCommandWait]);

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
    if (!isConnected || isRecording)
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
      setActionError(error instanceof Error ? error.message : String(error));
    }
  }, [
    isConnected,
    isRecording,
    format,
    roiPreset,
    sendCommandWait,
    clearTimers,
    pollSerStatus,
    ensureSerStreaming,
    waitForSerCondition,
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
      setActionError(error instanceof Error ? error.message : String(error));
    }
    finally {
      setIsRecording(false);
    }
  }, [
    isConnected,
    isRecording,
    format,
    sendCommandWait,
    clearTimers,
    requestCameraState,
    waitForSerCondition,
  ]);

  const dismissError = useCallback(() => setActionError(null), []);

  return {
    isRecording,
    recordingSeconds,
    writtenFrames,
    isCapturing,
    actionError,
    capturePhoto,
    startRecording,
    stopRecording,
    dismissError,
  };
}
