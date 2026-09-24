/* eslint-disable max-lines-per-function */

import type { MediaStream } from 'react-native-webrtc';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NativeModules, Platform, Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Text } from '@/components/ui';
import { appLogger } from '@/lib/app-logger';
import { translate } from '@/lib/i18n';
import { useCameraStore } from '../camera-store';
import { getCameraWhepUrl } from '../config';
import {
  logStreamPoint,
  markStreamStart,
} from '../services/stream-start-probe';
import {
  openWhepSession,
  startWhepNegotiation,
} from '../services/whep-service';

const NativeWebRTC = NativeModules.WebRTCModule
  ? require('react-native-webrtc')
  : null;

export const RTCView = NativeWebRTC?.RTCView ?? View;

export type CameraPreviewMode = 'auto' | 'manual';
export type CameraPreviewState = 'connecting' | 'live' | 'error';

let mountedPreviewCount = 0;

// The browser app keeps a single `state.webRtcPeer` and always runs
// `stopDirectWebRtcPreview()` before starting a new one, so two previews can
// never pull the board stream at once. React unmounts the old screen and mounts
// the new one concurrently, so without this guard the outgoing session is still
// closing while the next offer is already posted — two WHEP sessions then share
// the same WiFi link and both stall. Serialising teardown here restores the
// browser's one-session-at-a-time behaviour.
let activePreviewTeardown: Promise<void> = Promise.resolve();

function serializePreviewTeardown(
  teardown: () => Promise<void>,
): Promise<void> {
  activePreviewTeardown = activePreviewTeardown.then(teardown, teardown);
  return activePreviewTeardown;
}

type LandscapePreviewOptions = {
  mode?: CameraPreviewMode;
  manualExposure?: number;
  manualGain?: number;
  reconnectKey?: string | number;
};

export function useLandscapeCameraPreview(
  options: LandscapePreviewOptions = {},
) {
  const { reconnectKey } = options;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const startStreaming = useCameraStore.use.startStreaming();
  const startStreamingManual = useCameraStore.use.startStreamingManual();
  const connectionStatus = useCameraStore.use.connectionStatus();
  const transport = useCameraStore.use.transport();
  const landscapeRatioVersion = useCameraStore.use.landscapeRatioVersion();
  const [previewState, setPreviewState]
    = useState<CameraPreviewState>('connecting');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [actualFps, setActualFps] = useState<number | null>(null);

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
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 5;
    const BASE_RECONNECT_DELAY_MS = 1000;
    const MAX_RECONNECT_DELAY_MS = 8000;
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
      const cameraBusy = useCameraStore.getState().cameraState?.busy;
      if (cameraBusy === 'error') {
        appLogger.warn('WHEP', '相机状态机处于 error 状态，停止自动重连');
        setPreviewState('error');
        return;
      }
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        appLogger.warn(
          'WHEP',
          `视频流已达到最大重试次数(${MAX_RECONNECT_ATTEMPTS})，停止自动重试`,
        );
        setPreviewState('error');
        return;
      }
      reconnectAttempts += 1;
      const delay = Math.min(
        MAX_RECONNECT_DELAY_MS,
        BASE_RECONNECT_DELAY_MS * 1.5 ** (reconnectAttempts - 1),
      );
      setStream(null);
      setPreviewState('connecting');
      appLogger.info(
        'WHEP',
        `视频流将在 ${Math.round(delay)}ms 后第 ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} 次重连`,
      );
      void releaseSession();
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void connect();
      }, delay);
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
        logStreamPoint('whep_connect');
        const session = await openWhepSession(getCameraWhepUrl(), {
          onDisconnected: scheduleReconnect,
          onTrack: (incomingStream) => {
            if (active) {
              setStream(incomingStream);
            }
          },
        });
        if (!active) {
          await session.close();
          return;
        }
        closeSession = session.close;
        setStream(session.stream);
        setPreviewState('live');
        reconnectAttempts = 0;
        // Periodic diagnostics & actual fps sampling: 1s cadence.
        let ticks = 0;
        statsTimer = setInterval(() => {
          ticks += 1;
          void session.getActualFps().then((fps) => {
            if (active && fps !== null) {
              setActualFps(fps);
            }
          });
          if (ticks <= 4 || ticks % 6 === 0) {
            void session.getStats().then((stats) => {
              if (__DEV__)
                console.info(`[CameraWHEP-stats] ${stats}`);
            });
          }
        }, 1_000);
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
    // createOffer 和等开流回包并行；POST 仍等回包 + 上次 DELETE 结束。
    const bringUp = async () => {
      const storeState = useCameraStore.getState();
      const currentOpts = optionsRef.current;
      const auto = currentOpts.mode ? currentOpts.mode === 'auto' : storeState.landscapeAutoMode;
      const targetExposure = currentOpts.manualExposure ?? storeState.landscapeManualExposure;
      const targetGain = currentOpts.manualGain ?? storeState.landscapeManualGain;
      markStreamStart(auto ? 'auto' : 'manual');
      const negotiation = startWhepNegotiation(getCameraWhepUrl(), {
        onDisconnected: scheduleReconnect,
        onTrack: (incomingStream) => {
          if (active)
            setStream(incomingStream);
        },
      });
      const ack = auto
        ? await startStreaming('auto')
        : await startStreamingManual(
            targetExposure,
            targetGain,
          );
      if (!active) {
        negotiation.discard();
        return;
      }
      logStreamPoint('stream_ack', {
        timeout: Boolean(ack.timeout),
        error: ack.error ?? null,
        success: ack.msg?.success !== false,
        waitMs: ack.elapsedMs,
      });
      connecting = true;
      try {
        await activePreviewTeardown;
        if (!active) {
          negotiation.discard();
          return;
        }
        logStreamPoint('whep_connect');
        const session = await negotiation.post();
        if (!active) {
          await session.close();
          return;
        }
        closeSession = session.close;
        setStream(session.stream);
        setPreviewState('live');
        reconnectAttempts = 0;
        let ticks = 0;
        statsTimer = setInterval(() => {
          ticks += 1;
          void session.getActualFps().then((fps) => {
            if (active && fps !== null) {
              setActualFps(fps);
            }
          });
          if (ticks <= 4 || ticks % 6 === 0) {
            void session.getStats().then((stats) => {
              if (__DEV__)
                console.info(`[CameraWHEP-stats] ${stats}`);
            });
          }
        }, 1_000);
      }
      catch (error) {
        negotiation.discard();
        if (__DEV__)
          console.warn('[CameraWHEP]', error);
        if (active)
          scheduleReconnect();
      }
      finally {
        connecting = false;
      }
    };
    void bringUp();
    return () => {
      active = false;
      if (reconnectTimer)
        clearTimeout(reconnectTimer);
      if (statsTimer)
        clearInterval(statsTimer);
      setStream(null);
      setActualFps(null);
      void releaseSession();
    };
    // 画幅版本变化时重建 WHEP 会话，彻底消除旧分辨率/比例缓存。
    // transport 变化必须重建：WHEP 地址随链路切换而变。
  }, [connectionStatus, transport, landscapeRatioVersion, reconnectKey]);

  return { previewState, stream, actualFps };
}

export type PreviewSurfaceProps = {
  stream: MediaStream | null;
  previewState: CameraPreviewState;
  width: number;
  height: number;
  objectFit?: 'cover' | 'contain';
  rotation?: number;
  scale?: number;
  pinchZoomable?: boolean;
  onVideoDimensionsChange?: (dimensions: { width: number; height: number }) => void;
};

/**
 * Web surface: browsers have no RTCView, so the MediaStream is attached to a
 * plain <video> element. Never rendered on native.
 */
const WebVideoSurface = memo(
  ({
    stream,
    width = '100%',
    height = '100%',
    objectFit = 'cover',
    rotation = 0,
    scale = 1,
  }: {
    stream: MediaStream | null;
    width?: number | string;
    height?: number | string;
    objectFit?: 'cover' | 'contain';
    rotation?: number;
    scale?: number;
  }) => {
    const videoRef = useRef<HTMLVideoElement | null>(null);

    const attachVideo = useCallback(
      (node: HTMLVideoElement | null) => {
        videoRef.current = node;
        if (node) {
          node.srcObject = stream as unknown as globalThis.MediaStream | null;
          void node.play().catch(() => {});
        }
      },
      [stream],
    );

    useEffect(() => {
      const video = videoRef.current;
      if (!video)
        return;

      if (!stream) {
        video.srcObject = null;
        return;
      }

      const nativeStream = stream as unknown as globalThis.MediaStream;
      video.srcObject = nativeStream;
      void video.play().catch(() => {});

      const handleTrackEvent = () => {
        if (video.srcObject !== nativeStream) {
          video.srcObject = nativeStream;
        }
        void video.play().catch(() => {});
      };

      nativeStream.addEventListener?.('addtrack', handleTrackEvent);
      nativeStream.addEventListener?.('removetrack', handleTrackEvent);

      return () => {
        nativeStream.removeEventListener?.('addtrack', handleTrackEvent);
        nativeStream.removeEventListener?.('removetrack', handleTrackEvent);
      };
    }, [stream]);

    const transformStyle
      = [
        rotation ? `rotate(${rotation}deg)` : '',
        scale !== 1 ? `scale(${scale})` : '',
      ]
        .filter(Boolean)
        .join(' ') || undefined;

    return (
      <video
        ref={attachVideo}
        autoPlay
        playsInline
        muted
        style={{
          width,
          height,
          objectFit,
          transform: transformStyle,
          background: '#0B0B0D',
        }}
      />
    );
  },
);
WebVideoSurface.displayName = 'WebVideoSurface';

export const PreviewSurface = memo(
  ({
    stream,
    previewState,
    width,
    height,
    objectFit = 'contain',
    rotation = 0,
    scale = 1,
    pinchZoomable = true,
    onVideoDimensionsChange,
  }: PreviewSurfaceProps) => {
    const pinchScale = useSharedValue(1);
    const savedScale = useSharedValue(1);
    const [zoomText, setZoomText] = useState('1.0x');
    const [isZoomed, setIsZoomed] = useState(false);

    const updateZoomState = useCallback((val: number) => {
      setZoomText(`${val.toFixed(1)}x`);
      setIsZoomed(val > 1.02);
    }, []);

    useAnimatedReaction(
      () => Math.round(pinchScale.value * 10) / 10,
      (current, previous) => {
        if (current !== previous) {
          runOnJS(updateZoomState)(current);
        }
      },
      [pinchScale, updateZoomState],
    );

    const handleResetZoom = useCallback(() => {
      pinchScale.value = withTiming(1, { duration: 180 });
      savedScale.value = 1;
    }, [pinchScale, savedScale]);
    const pinchGesture = useMemo(() => {
      if (!pinchZoomable)
        return null;
      return Gesture.Pinch()
        .onUpdate((event) => {
          pinchScale.value = Math.min(
            Math.max(savedScale.value * event.scale, 1),
            5,
          );
        })
        .onEnd(() => {
          if (pinchScale.value < 1) {
            pinchScale.value = withSpring(1);
            savedScale.value = 1;
          }
          else {
            savedScale.value = pinchScale.value;
          }
        });
    }, [pinchZoomable, pinchScale, savedScale]);

    const doubleTapGesture = useMemo(() => {
      if (!pinchZoomable)
        return null;
      return Gesture.Tap()
        .numberOfTaps(2)
        .onEnd(() => {
          pinchScale.value = withTiming(1, { duration: 180 });
          savedScale.value = 1;
        });
    }, [pinchZoomable, pinchScale, savedScale]);

    const composedGesture = useMemo(() => {
      if (!pinchGesture || !doubleTapGesture)
        return null;
      return Gesture.Simultaneous(pinchGesture, doubleTapGesture);
    }, [pinchGesture, doubleTapGesture]);

    const animatedSurfaceStyle = useAnimatedStyle(() => {
      const totalScale = scale * pinchScale.value;
      return {
        transform: [
          ...(rotation ? [{ rotate: `${rotation}deg` }] : []),
          ...(totalScale !== 1 ? [{ scale: totalScale }] : []),
        ],
      };
    });

    const hasTracks
      = stream && (stream.getTracks ? stream.getTracks().length > 0 : true);

    const isRotated = rotation === 90 || rotation === 270;
    const containerWidth = isRotated ? height : width;
    const containerHeight = isRotated ? width : height;

    const isVideoActive = Boolean(
      Platform.OS === 'web' ? stream : stream && hasTracks && NativeWebRTC,
    );

    const cameraBusy = useCameraStore.getState().cameraState?.busy;
    const errorText
      = cameraBusy === 'error'
        ? '相机服务异常，请重启相机'
        : translate('landscape.preview_failed');

    const renderActiveSurface = () => {
      if (Platform.OS === 'web') {
        return (
          <WebVideoSurface
            stream={stream}
            width={width}
            height={height}
            objectFit={objectFit}
          />
        );
      }
      if (stream && hasTracks && NativeWebRTC) {
        return (
          <RTCView
            key={`rtc-${width}x${height}-${rotation}-${stream.toURL()}`}
            streamURL={stream.toURL()}
            objectFit={objectFit}
            mirror={false}
            style={{ width, height }}
            onDimensionsChange={(event: { nativeEvent: { width: number; height: number } }) => {
              const { width: videoWidth, height: videoHeight } = event.nativeEvent;
              if (videoWidth > 0 && videoHeight > 0)
                onVideoDimensionsChange?.({ width: videoWidth, height: videoHeight });
            }}
          />
        );
      }
      return null;
    };

    const surfaceContent = (
      <View
        style={{ width: containerWidth, height: containerHeight }}
        className="items-center justify-center overflow-hidden"
      >
        {isVideoActive
          ? (
              <Animated.View style={animatedSurfaceStyle}>
                {renderActiveSurface()}
              </Animated.View>
            )
          : (
              <View
                className="flex-1 items-center justify-center bg-[#0B0B0D]"
                style={{ width: containerWidth, height: containerHeight }}
              >
                <Text className="text-sm text-white/40">
                  {previewState === 'error'
                    ? errorText
                    : translate('landscape.preview_connecting')}
                </Text>
              </View>
            )}
        {isZoomed && (
          <View
            pointerEvents="box-none"
            className="absolute inset-x-0 bottom-4 items-center"
          >
            <Pressable
              onPress={handleResetZoom}
              className="flex-row items-center rounded-full bg-black/75 px-3 py-1 active:opacity-70"
            >
              <Text className="text-xs font-semibold text-white">
                {zoomText}
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    );

    if (composedGesture) {
      return (
        <GestureDetector gesture={composedGesture}>
          {surfaceContent}
        </GestureDetector>
      );
    }

    return surfaceContent;
  },
);
PreviewSurface.displayName = 'PreviewSurface';

/**
 * Keeps the existing preview-area layout intact and replaces only its
 * placeholder content with the board's native WebRTC stream.
 */
export function NativeCameraPreview({
  objectFit = 'contain',
  rotation = 0,
  scale = 1,
}: {
  objectFit?: 'cover' | 'contain';
  rotation?: number;
  scale?: number;
} = {}) {
  const { previewState, stream } = useLandscapeCameraPreview();
  const hasTracks
    = stream && (stream.getTracks ? stream.getTracks().length > 0 : true);

  const transformStyle = useMemo(() => {
    const transforms: Array<{ rotate?: string } | { scale?: number }> = [];
    if (rotation) {
      transforms.push({ rotate: `${rotation}deg` });
    }
    if (scale !== 1) {
      transforms.push({ scale });
    }
    return transforms.length > 0 ? transforms : undefined;
  }, [rotation, scale]);

  return (
    <View className="flex-1 overflow-hidden rounded-2xl bg-neutral-900">
      {Platform.OS === 'web'
        ? (
            <WebVideoSurface
              stream={stream}
              objectFit={objectFit}
              rotation={rotation}
              scale={scale}
            />
          )
        : (
            stream
            && hasTracks
            && NativeWebRTC && (
              <RTCView
                streamURL={stream.toURL()}
                objectFit={objectFit}
                mirror={false}
                style={[
                  { flex: 1 },
                  transformStyle ? { transform: transformStyle } : undefined,
                ]}
              />
            )
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
