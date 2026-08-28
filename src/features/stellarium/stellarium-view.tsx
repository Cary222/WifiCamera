import type { WebViewMessageEvent, WebViewProps } from 'react-native-webview';
import type { SelectedCelestialObject, StellariumBridge } from './stellarium-service';
import * as React from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Text } from '@/components/ui';
import { getLanguage, translate } from '@/lib/i18n';
import { createStellariumBridge } from './stellarium-service';

const READY_TIMEOUT_MS = 15_000;
// The engine resolves names during init, so the language must exist before the document runs.
const LANGUAGE_SCRIPT = `window.__STEL_LANG = ${JSON.stringify(getLanguage() === 'zh' ? 'zh' : 'en')}; true;`;
const STELLARIUM_SOURCE = Platform.select({
  android: { uri: 'https://appassets.androidplatform.net/assets/stellar/index.html' },
  ios: { uri: 'stellar/index.html' },
  default: { uri: 'stellar/index.html' },
});

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
  style?: WebViewProps['style'];
};

function useStellariumLifecycle({
  onCommandError,
  onError,
  onReady,
  webViewRef,
}: {
  onCommandError?: (message: string) => void;
  onError?: (message: string) => void;
  onReady?: () => void;
  webViewRef: React.RefObject<WebView | null>;
}) {
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const readyRef = React.useRef(false);
  const [error, setError] = React.useState<string>();
  const [loading, setLoading] = React.useState(true);

  const clearTimeout = React.useCallback(() => {
    if (timeoutRef.current)
      globalThis.clearTimeout(timeoutRef.current);
    timeoutRef.current = undefined;
  }, []);

  const reportError = React.useCallback((message: string) => {
    clearTimeout();
    bridge.current.setReady(false);
    setLoading(false);
    setError(translate('deep_space.map_error'));
    onError?.(message);
  }, [clearTimeout, onError]);

  const bridge = React.useRef(createStellariumBridge(webViewRef, {
    onError: (message) => {
      if (readyRef.current)
        onCommandError?.(message);
      else
        reportError(message);
    },
    onReload: () => webViewRef.current?.reload(),
  }));

  const beginLoading = React.useCallback(() => {
    clearTimeout();
    readyRef.current = false;
    bridge.current.setReady(false);
    setError(undefined);
    setLoading(true);
    timeoutRef.current = globalThis.setTimeout(() => {
      if (!readyRef.current)
        reportError('Stellarium initialization timed out.');
    }, READY_TIMEOUT_MS);
  }, [clearTimeout, reportError]);

  const markReady = React.useCallback(() => {
    clearTimeout();
    bridge.current.setReady(true);
    setLoading(false);
    setError(undefined);
    if (!readyRef.current) {
      readyRef.current = true;
      onReady?.();
    }
  }, [clearTimeout, onReady]);

  React.useEffect(() => clearTimeout, [clearTimeout]);

  return { beginLoading, bridge, error, loading, markReady, readyRef, reportError };
}

export function StellariumView({
  onBearingChange,
  onCommandError,
  onError,
  onObjectSelected,
  onReady,
  onSelectionCleared,
  onTargetFound,
  onTargetNotFound,
  ref,
  style,
}: StellariumViewProps & { ref?: React.RefObject<StellariumViewHandle | null> }) {
  const webViewRef = React.useRef<WebView>(null);
  const { beginLoading, bridge, error, loading, markReady, readyRef, reportError } = useStellariumLifecycle({
    onCommandError,
    onError,
    onReady,
    webViewRef,
  });

  if (ref && typeof ref === 'object' && 'current' in ref && !ref.current) {
    (ref as React.MutableRefObject<StellariumViewHandle | null>).current = bridge.current;
  }
  React.useImperativeHandle(ref, () => bridge.current, [bridge]);

  const onMessage = React.useCallback((event: WebViewMessageEvent) => {
    try {
      dispatchSceneMessage(JSON.parse(event.nativeEvent.data), {
        markReady,
        onBearingChange,
        onCommandError,
        onObjectSelected,
        onSelectionCleared,
        onTargetFound,
        onTargetNotFound,
        reportError,
        resolveRequest: (requestId, payload) => bridge.current.resolveRequest(requestId, payload),
        wasReady: () => readyRef.current,
      });
    }
    catch { reportError('Received an unreadable Stellarium message.'); }
  }, [bridge, markReady, onBearingChange, onCommandError, onObjectSelected, onSelectionCleared, onTargetFound, onTargetNotFound, readyRef, reportError]);
  return (
    <View style={styles.root}>
      <WebView
        ref={webViewRef}
        source={STELLARIUM_SOURCE}
        style={[styles.webView, style]}
        javaScriptEnabled
        domStorageEnabled
        injectedJavaScriptBeforeContentLoaded={LANGUAGE_SCRIPT}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        setBuiltInZoomControls={false}
        allowsBackForwardNavigationGestures={false}
        onLoadStart={beginLoading}
        onLoad={markReady}
        onLoadEnd={markReady}
        onLoadProgress={({ nativeEvent }) => {
          if (nativeEvent.progress >= 0.95)
            markReady();
        }}
        onMessage={onMessage}
        onError={() => {
          // Sky-culture tiles 404 on demand; only a failure before ready means the map is dead.
          if (!readyRef.current)
            reportError('WebView failed to load Stellarium.');
        }}
      />
      {loading && <LoadingOverlay />}
      {error && <ErrorOverlay message={error} onRetry={() => bridge.current.reload()} />}
    </View>
  );
}

type SceneMessageHandlers = {
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

function dispatchSceneMessage(message: { type: string; [key: string]: unknown }, handlers: SceneMessageHandlers) {
  switch (message.type) {
    case 'ready':
    case 'engine_ready':
      return handlers.markReady();
    case 'view_bearing':
      return handlers.onBearingChange?.(message.azimuthDeg as number);
    case 'object_selected':
      return handlers.onObjectSelected?.(message.object as SelectedCelestialObject);
    case 'selection_cleared':
      return handlers.onSelectionCleared?.();
    case 'target_found':
      return handlers.onTargetFound?.();
    case 'target_not_found':
      return handlers.onTargetNotFound?.();
    case 'tonight':
    case 'events':
      return handlers.resolveRequest(message.requestId as number, message.payload);
    case 'error': {
      const errorMessage = (message.message as string) || 'Stellarium failed to start.';
      // Before ready the map is dead; afterwards only that one command failed.
      if (handlers.wasReady())
        return handlers.onCommandError?.(errorMessage);
      return handlers.reportError(errorMessage);
    }
  }
}

function LoadingOverlay() {
  return (
    <View style={styles.status}>
      <ActivityIndicator color="#9EC5FF" />
      <Text className="mt-3 text-sm text-white">{translate('deep_space.map_loading')}</Text>
    </View>
  );
}

function ErrorOverlay({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.status}>
      <Text className="text-center text-sm text-white">{message}</Text>
      <Text className="mt-3 text-xs text-[#9EC5FF]" onPress={onRetry}>{translate('deep_space.map_retry')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050A14' },
  webView: { flex: 1, backgroundColor: 'transparent' },
  status: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: '#071020EE',
    justifyContent: 'center',
    padding: 24,
  },
});
