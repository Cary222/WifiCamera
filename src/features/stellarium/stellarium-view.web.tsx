import type { StyleProp, ViewStyle } from 'react-native';
import type {
  SelectedCelestialObject,
  StellariumBridge,
} from './stellarium-service';
import * as React from 'react';
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui';
import { getLanguage, translate } from '@/lib/i18n';
import { createStellariumBridge } from './stellarium-service';

const READY_TIMEOUT_MS = 15_000;

export type StellariumViewHandle = StellariumBridge;
export type StellariumViewProps = {
  onBearingChange?: (azimuthDeg: number) => void;
  onCommandError?: (message: string) => void;
  onError?: (message: string) => void;
  onObjectSelected?: (object: SelectedCelestialObject) => void;
  onReady?: () => void;
  onSelectionCleared?: () => void;
  onTargetFound?: () => void;
  onTargetNotFound?: () => void;
  style?: StyleProp<ViewStyle>;
};

type SceneHandlers = {
  markReady: () => void;
  onBearingChange?: (azimuthDeg: number) => void;
  onCommandError?: (message: string) => void;
  onObjectSelected?: (object: SelectedCelestialObject) => void;
  onSelectionCleared?: () => void;
  onTargetFound?: () => void;
  onTargetNotFound?: () => void;
  reportError: (message: string) => void;
  resolveRequest: (requestId: number, payload: unknown) => void;
  wasReady: () => boolean;
};

function dispatchSceneMessage(
  message: { type: string; [key: string]: unknown },
  handlers: SceneHandlers,
) {
  switch (message.type) {
    case 'ready':
    case 'engine_ready':
      return handlers.markReady();
    case 'view_bearing':
      return handlers.onBearingChange?.(message.azimuthDeg as number);
    case 'object_selected':
      return handlers.onObjectSelected?.(
        message.object as SelectedCelestialObject,
      );
    case 'selection_cleared':
      return handlers.onSelectionCleared?.();
    case 'target_found':
      return handlers.onTargetFound?.();
    case 'target_not_found':
      return handlers.onTargetNotFound?.();
    case 'tonight':
    case 'events':
      return handlers.resolveRequest(
        message.requestId as number,
        message.payload,
      );
    case 'error': {
      const err = (message.message as string) || 'Stellarium failed to start.';
      if (handlers.wasReady()) {
        return handlers.onCommandError?.(err);
      }
      return handlers.reportError(err);
    }
  }
}

function useWebStellariumLifecycle({
  handlersRef,
  iframeRef,
}: {
  handlersRef: React.RefObject<StellariumViewProps>;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
}) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const readyRef = useRef(false);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  const clearTimeout = useCallback(() => {
    if (timeoutRef.current) {
      globalThis.clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = undefined;
  }, []);

  const reportError = useCallback(
    (message: string) => {
      console.error('[StellariumView Web Error]:', message);
      clearTimeout();
      bridge.current.setReady(false);
      setLoading(false);
      setError(translate('deep_space.map_error'));
      handlersRef.current?.onError?.(message);
    },
    [clearTimeout, handlersRef],
  );

  const markReady = useCallback(() => {
    clearTimeout();
    bridge.current.setReady(true);
    setLoading(false);
    setError(undefined);
    if (!readyRef.current) {
      readyRef.current = true;
      handlersRef.current?.onReady?.();
    }
  }, [clearTimeout, handlersRef]);

  const adapterRef = useRef({
    postMessage: (data: string) => {
      iframeRef.current?.contentWindow?.postMessage(
        data,
        window.location.origin,
      );
    },
  });

  const beginLoading = useCallback(() => {
    clearTimeout();
    readyRef.current = false;
    bridge.current.setReady(false);
    setError(undefined);
    setLoading(true);
    timeoutRef.current = globalThis.setTimeout(() => {
      if (!readyRef.current) {
        reportError('Stellarium initialization timed out.');
      }
    }, READY_TIMEOUT_MS);
  }, [clearTimeout, reportError]);

  const bridge = useRef(
    createStellariumBridge(adapterRef as unknown as React.RefObject<any>, {
      onError: (message) => {
        if (readyRef.current) {
          handlersRef.current?.onCommandError?.(message);
        }
        else {
          reportError(message);
        }
      },
      onReload: () => {
        beginLoading();
        iframeRef.current?.contentWindow?.location.reload();
      },
    }),
  );

  useEffect(() => clearTimeout, [clearTimeout]);

  return {
    beginLoading,
    bridge,
    error,
    loading,
    markReady,
    readyRef,
    reportError,
  };
}

export function StellariumView(
  props: StellariumViewProps & {
    ref?: React.RefObject<StellariumViewHandle | null>;
  },
) {
  const { ref, style } = props;
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const handlersRef = useRef<StellariumViewProps>(props);
  handlersRef.current = props;

  const {
    beginLoading,
    bridge,
    error,
    loading,
    markReady,
    readyRef,
    reportError,
  } = useWebStellariumLifecycle({
    handlersRef,
    iframeRef,
  });

  if (ref && typeof ref === 'object' && 'current' in ref && !ref.current) {
    (ref as { current: StellariumViewHandle | null }).current = bridge.current;
  }
  useImperativeHandle(ref, () => bridge.current, [bridge]);

  useEffect(() => {
    beginLoading();

    const handleWindowMessage = (event: MessageEvent) => {
      if (
        iframeRef.current
        && event.source !== iframeRef.current.contentWindow
      ) {
        return;
      }
      try {
        const message
          = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (!message || typeof message.type !== 'string') {
          return;
        }
        dispatchSceneMessage(message, {
          markReady,
          onBearingChange: deg => handlersRef.current?.onBearingChange?.(deg),
          onCommandError: msg => handlersRef.current?.onCommandError?.(msg),
          onObjectSelected: obj =>
            handlersRef.current?.onObjectSelected?.(obj),
          onSelectionCleared: () => handlersRef.current?.onSelectionCleared?.(),
          onTargetFound: () => handlersRef.current?.onTargetFound?.(),
          onTargetNotFound: () => handlersRef.current?.onTargetNotFound?.(),
          reportError,
          resolveRequest: (requestId, payload) =>
            bridge.current.resolveRequest(requestId, payload),
          wasReady: () => readyRef.current,
        });
      }
      catch {
        // ignore non-JSON or third-party messages
      }
    };

    window.addEventListener('message', handleWindowMessage);
    return () => window.removeEventListener('message', handleWindowMessage);
  }, [beginLoading, bridge, markReady, readyRef, reportError]);

  const lang = getLanguage() === 'zh' ? 'zh' : 'en';

  return (
    <View style={[styles.root, style]}>
      <iframe
        ref={iframeRef}
        src={`/stellar/index.html?lang=${lang}`}
        style={iframeStyle}
        title="Stellarium"
      />
      {loading && <LoadingOverlay />}
      {error && (
        <ErrorOverlay message={error} onRetry={() => bridge.current.reload()} />
      )}
    </View>
  );
}

const iframeStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  border: 'none',
  backgroundColor: 'transparent',
};

function LoadingOverlay() {
  return (
    <View style={styles.status}>
      <ActivityIndicator color="#9EC5FF" />
      <Text className="mt-3 text-sm text-white">
        {translate('deep_space.map_loading')}
      </Text>
    </View>
  );
}

function ErrorOverlay({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <View style={styles.status}>
      <Text className="text-center text-sm text-white">{message}</Text>
      <Text className="mt-3 text-xs text-[#9EC5FF]" onPress={onRetry}>
        {translate('deep_space.map_retry')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050A14' },
  status: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: '#071020EE',
    justifyContent: 'center',
    padding: 24,
  },
});
