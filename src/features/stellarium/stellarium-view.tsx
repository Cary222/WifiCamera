import type { WebViewProps } from 'react-native-webview';
import type { StellariumBridge } from './stellarium-service';
/**
 * StellariumView — pure WebView wrapper for the Stellarium Web Engine.
 * Handles platform-specific source paths and postMessage bridge.
 *
 * The HTML asset path differs per platform:
 *   iOS:        'stellar/index.html'   (bundled in app bundle)
 *   Android:    'file:///android_asset/stellar/index.html'
 *
 * This component does NOT contain any business logic — only
 * platform source resolution and the WebView itself.
 */
import * as React from 'react';
import { Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { createStellariumBridge } from './stellarium-service';

const STELLARIUM_HTML_PATH = Platform.select({
  ios: 'stellar/index.html',
  android: 'file:///android_asset/stellar/index.html',
  default: 'stellar/index.html',
});

const WEBVIEW_PROPS: WebViewProps = Platform.select({
  android: {
    allowFileAccess: true,
    mixedContentMode: 'always' as const,
  },
  ios: {
    allowUniversalAccessFromFileURLs: true,
    scrollEnabled: false,
    bounces: false,
    overScrollMode: 'never',
    allowsBackForwardNavigationGestures: false,
  },
  default: {},
});

export type StellariumViewRef = {
  webViewRef: React.RefObject<WebView | null>;
} & StellariumBridge;

export type StellariumViewProps = {
  onReady?: () => void;
  style?: WebViewProps['style'];
};

export type StellariumViewHandle = {
  gotoRaDec: (ra: number, dec: number, duration?: number) => void;
  zoomTo: (fovDeg: number, duration?: number) => void;
  searchTarget: (name: string) => void;
  toggleConstellations: (visible: boolean) => void;
  setFovFrame: (fovDeg: number, sensorW: number, sensorH: number) => void;
};

export function StellariumView({ ref, onReady, style }: StellariumViewProps & { ref?: React.RefObject<StellariumViewHandle | null> }) {
  const webViewRef = React.useRef<WebView>(null);
  const bridge = React.useRef(createStellariumBridge((msg: unknown) => {
    webViewRef.current?.postMessage(JSON.stringify(msg));
  }));

  React.useImperativeHandle(ref, () => ({
    gotoRaDec: bridge.current.gotoRaDec,
    zoomTo: bridge.current.zoomTo,
    searchTarget: bridge.current.searchTarget,
    toggleConstellations: bridge.current.toggleConstellations,
    setFovFrame: bridge.current.setFovFrame,
  }));

  const handleMessage = React.useCallback((event: { nativeEvent: { data?: string } }) => {
    try {
      if (event.nativeEvent.data) {
        const msg = JSON.parse(event.nativeEvent.data);
        if (msg.type === 'engine_ready' && onReady) {
          onReady();
        }
      }
    }
    catch { /* ignore non-JSON messages */ }
  }, [onReady]);

  return (
    <WebView
      ref={webViewRef}
      source={{ uri: STELLARIUM_HTML_PATH }}
      style={[{ flex: 1 }, style]}
      onMessage={handleMessage}
      javaScriptEnabled
      domStorageEnabled
      {...WEBVIEW_PROPS}
    />
  );
}
