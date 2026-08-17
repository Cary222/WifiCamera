import type { WebViewMessageEvent, WebViewProps } from 'react-native-webview';
import type { StellariumBridge } from './stellarium-service';
import * as React from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Text } from '@/components/ui';
import { createStellariumBridge } from './stellarium-service';

const READY_TIMEOUT_MS = 15_000;
const STELLARIUM_SOURCE = Platform.select({
  android: { uri: 'https://appassets.androidplatform.net/assets/stellar/index.html' },
  ios: { uri: 'stellar/index.html' },
  default: { uri: 'stellar/index.html' },
});

export type StellariumViewHandle = StellariumBridge;
export type StellariumViewProps = {
  onReady?: () => void;
  onError?: (message: string) => void;
  style?: WebViewProps['style'];
};

export function StellariumView({ ref, onError, onReady, style }: StellariumViewProps & { ref?: React.RefObject<StellariumViewHandle | null> }) {
  const webViewRef = React.useRef<WebView>(null);
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
    setError(message);
    onError?.(message);
  }, [clearTimeout, onError]);
  const bridge = React.useRef(createStellariumBridge(webViewRef, {
    onError: message => reportError(message),
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
  React.useImperativeHandle(ref, () => bridge.current, []);
  const onMessage = React.useCallback((event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if (message.type === 'ready' || message.type === 'engine_ready') {
        markReady();
      }
      else if (message.type === 'error') {
        reportError(message.message || 'Stellarium failed to start.');
      }
    }
    catch { reportError('Received an unreadable Stellarium message.'); }
  }, [markReady, reportError]);
  return (
    <View style={styles.root}>
      <WebView
        ref={webViewRef}
        source={STELLARIUM_SOURCE}
        style={[styles.webView, style]}
        javaScriptEnabled
        domStorageEnabled
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
        onError={() => reportError('WebView failed to load Stellarium.')}
      />
      {loading && (
        <View style={styles.status}>
          <ActivityIndicator />
          <Text className="text-sm text-white">Loading star map...</Text>
        </View>
      )}
      {error && (
        <View style={styles.status}>
          <Text className="text-center text-sm text-white">{error}</Text>
          <Text className="mt-2 text-xs text-white/70" onPress={() => bridge.current.reload()}>Tap to retry</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#05070b' }, webView: { flex: 1, backgroundColor: 'transparent' }, status: { ...StyleSheet.absoluteFillObject, alignItems: 'center', backgroundColor: '#05070bcc', justifyContent: 'center', padding: 24 } });
