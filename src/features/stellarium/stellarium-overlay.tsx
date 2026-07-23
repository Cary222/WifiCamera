import type { StellariumViewHandle } from './stellarium-view';
/**
 * StellariumOverlay — deep-space star map overlay.
 *
 * Wraps StellariumView with:
 * - Semi-transparent back button
 * - Bottom toolbar (constellation toggle / search / FOV)
 * - Auto-follow of currentRaDec from camera state
 *
 * Visibility is controlled by the `visible` prop.
 * The star map WebView is pre-initialized when the overlay mounts.
 */
import * as React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui';
import { ArrowLeft } from '@/components/ui/icons';
import { useCameraStore } from '@/features/camera/camera-store';
import { StellariumView } from './stellarium-view';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function StellariumOverlay({ visible, onClose }: Props) {
  const stellaRef = React.useRef<StellariumViewHandle>(null);
  const [ready, setReady] = React.useState(false);
  const [constellations, setConstellations] = React.useState(true);

  // TODO: wire up to actual RA/Dec solving result from camera deep-sky mode
  const cameraStatus = useCameraStore.use.cameraStatus();

  // Follow camera RA/Dec updates — placeholder until solving is wired in
  React.useEffect(() => {
    if (ready && cameraStatus) {
      stellaRef.current?.gotoRaDec(0, 0);
    }
  }, [ready, cameraStatus]);

  if (!visible)
    return null;

  return (
    <View style={StyleSheet.absoluteFill} className="z-50 bg-black">
      <StellariumView
        ref={stellaRef}
        onReady={() => setReady(true)}
      />

      {/* Top bar */}
      <View className="absolute inset-x-0 top-12 flex-row items-center px-4">
        <Pressable
          onPress={onClose}
          className="size-10 items-center justify-center rounded-full bg-black/50"
        >
          <ArrowLeft color="#fff" />
        </Pressable>
        <Text className="ml-3 text-base font-semibold text-white">Star Map</Text>
        {!ready && (
          <Text className="ml-2 text-xs text-white/60">Loading...</Text>
        )}
      </View>

      {/* Bottom toolbar */}
      <View className="absolute inset-x-0 bottom-12 flex-row justify-center gap-4 px-6">
        <Pressable
          onPress={() => {
            const next = !constellations;
            setConstellations(next);
            stellaRef.current?.toggleConstellations(next);
          }}
          className="rounded-full bg-black/60 px-4 py-2"
        >
          <Text className="text-sm text-white">
            {constellations ? 'Hide' : 'Show'}
            {' '}
            Lines
          </Text>
        </Pressable>
        <Pressable
          onPress={() => stellaRef.current?.zoomTo(1)}
          className="rounded-full bg-black/60 px-4 py-2"
        >
          <Text className="text-sm text-white">1° FOV</Text>
        </Pressable>
      </View>
    </View>
  );
}
