/* eslint-disable max-lines-per-function */

import type { MediaStream } from 'react-native-webrtc';

import { memo, useEffect, useState } from 'react';
import { NativeModules, View } from 'react-native';
import { Text } from '@/components/ui';
import { appLogger } from '@/lib/app-logger';
import { translate } from '@/lib/i18n';
import { useCameraStore } from '../camera-store';
import { getCameraWhepUrl } from '../config';
import { openWhepSession } from '../services/whep-service';

const NativeWebRTC = NativeModules.WebRTCModule ? require('react-native-webrtc') : null;

export const RTCView = NativeWebRTC?.RTCView ?? View;

export type CameraPreviewMode = 'auto' | 'manual';
export type CameraPreviewState = 'connecting' | 'live' | 'error';

type LandscapePreviewOptions = {
  mode?: CameraPreviewMode;
  manualExposure?: number;
  manualGain?: number;
};

let mountedPreviewCount = 0;

// The browser app keeps a single `state.webRtcPeer` and always runs
// `stopDirectWebRtcPreview()` before starting a new one, so two previews can
// never pull the board stream at once. React unmounts the old screen and mounts
// the new one concurrently, so without this guard the outgoing session is still
// closing while the next offer is already posted — two WHEP sessions then share
// the same WiFi link and both stall. Serialising teardown here restores the
// browser's one-session-at-a-time behaviour.
let activePreviewTeardown: Promise<void> = Promise.resolve();

function serializePreviewTeardown(teardown: () => Promise<void>): Promise<void> {
  activePreviewTeardown = activePreviewTeardown.then(teardown, teardown);
  return activePreviewTeardown;
}

export function useLandscapeCameraPreview(_options: LandscapePreviewOptions = {}) {
  const startStreaming = useCameraStore.use.startStreaming();
  const startStreamingManual = useCameraStore.use.startStreamingManual();
  const connectionStatus = useCameraStore.use.connectionStatus();
  const [previewState, setPreviewState] = useState<CameraPreviewState>('connecting');
  const [stream, setStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    mountedPreviewCount += 1;
    return () => {
      mountedPreviewCount = Math.max(0, mountedPreviewCount - 1);
    };
  }, []);

  useEffect(() => {
    if (connectionStatus !== 'open') {
      setPreviewState('connecting');
      return;
    }

    let active = true;
    let connecting = false;
    let startupTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let statsTimer: ReturnType<typeof setInterval> | null = null;
    let closeSession: (() => Promise<void>) | null = null;

    const releaseSession = () => {
      const close = closeSession;
      closeSession = null;
      if (statsTimer) {
        clearInterval(statsTimer);
        statsTimer = null;
      }
      if (!close)
        return activePreviewTeardown;
      return serializePreviewTeardown(close);
    };

    const scheduleReconnect = () => {
      if (!active || reconnectTimer)
        return;
      setStream(null);
      setPreviewState('connecting');
      appLogger.info('WHEP', '视频流将在 600ms 后重连');
      void releaseSession();
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void connect();
      }, 600);
    };

    const connect = async () => {
      if (!active || connecting)
        return;
      connecting = true;
      try {
        await releaseSession();
        // Also wait for a previous screen's session to finish tearing down.
        await activePreviewTeardown;
        if (!active)
          return;
        const session = await openWhepSession(getCameraWhepUrl(), { onDisconnected: scheduleReconnect });
        if (!active) {
          await session.close();
          return;
        }
        closeSession = session.close;
        setStream(session.stream);
        setPreviewState('live');
        // Periodic diagnostics: after 4 ticks (8s) drop to a slow cadence.
        let ticks = 0;
        statsTimer = setInterval(() => {
          ticks += 1;
          if (ticks <= 4 || ticks % 6 === 0) {
            void session.getStats().then((stats) => {
              if (__DEV__)
                console.info(`[CameraWHEP-stats] ${stats}`);
            });
          }
        }, 2_000);
      }
      catch (error) {
        if (__DEV__)
          console.warn('[CameraWHEP]', error);
        scheduleReconnect();
      }
      finally {
        connecting = false;
      }
    };

    setPreviewState('connecting');

    // 与网页端一致：只在进入风景模式时开流一次；WHEP 重连只重挂预览，绝不重启板端推流。
    const storeState = useCameraStore.getState();
    if (storeState.landscapeAutoMode) {
      startStreaming('auto');
    }
    else {
      startStreamingManual(storeState.landscapeManualExposure, storeState.landscapeManualGain);
    }

    // Matches browser app.js: 200ms delay between sending start_streaming and
    // opening the WHEP session gives the board time to create its RTSP source.
    startupTimer = setTimeout(() => void connect(), 200);
    return () => {
      active = false;
      if (startupTimer)
        clearTimeout(startupTimer);
      if (reconnectTimer)
        clearTimeout(reconnectTimer);
      if (statsTimer)
        clearInterval(statsTimer);
      setStream(null);
      void releaseSession();
    };
    // 不依赖模式/曝光/增益，避免调参时断开并重建 WebRTC 会话。
  }, [connectionStatus]);

  return { previewState, stream };
}

export type PreviewSurfaceProps = {
  stream: MediaStream | null;
  previewState: CameraPreviewState;
  width: number;
  height: number;
};

export const PreviewSurface = memo(({ stream, previewState, width, height }: PreviewSurfaceProps) => {
  if (stream && NativeWebRTC) {
    return (
      <RTCView
        streamURL={stream.toURL()}
        objectFit="cover"
        mirror={false}
        style={{ width, height }}
      />
    );
  }
  return (
    <View className="flex-1 items-center justify-center bg-[#0B0B0D]" style={{ width, height }}>
      <Text className="text-sm text-white/40">
        {previewState === 'error'
          ? translate('landscape.preview_failed')
          : translate('landscape.preview_connecting')}
      </Text>
    </View>
  );
});
PreviewSurface.displayName = 'PreviewSurface';

/**
 * Keeps the existing preview-area layout intact and replaces only its
 * placeholder content with the board's native WebRTC stream.
 */
export function NativeCameraPreview() {
  const { previewState, stream } = useLandscapeCameraPreview();

  return (
    <View className="flex-1 overflow-hidden rounded-2xl bg-neutral-900">
      {stream && NativeWebRTC && (
        <RTCView
          streamURL={stream.toURL()}
          objectFit="cover"
          mirror={false}
          style={{ flex: 1 }}
        />
      )}
      {previewState !== 'live' && (
        <View className="absolute inset-0 items-center justify-center">
          <Text className="text-neutral-500">
            {previewState === 'error' ? '相机预览连接失败' : '相机预览区域'}
          </Text>
        </View>
      )}
    </View>
  );
}
