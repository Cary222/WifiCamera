import type { RefObject } from 'react';
import type { FieldOfViewInput } from './field-of-view';
import type { StellariumViewHandle } from '@/features/stellarium/stellarium-view';
import * as React from 'react';
import { StyleSheet, View } from 'react-native';
import { createFrameLayout, getMapVerticalFov } from './field-of-view';

type FieldOfViewOverlayProps = {
  input: FieldOfViewInput;
  stellaRef: RefObject<StellariumViewHandle | null>;
};

type ViewportSize = { height: number; width: number };

export function FieldOfViewOverlay({ input, stellaRef }: FieldOfViewOverlayProps): React.ReactElement {
  const [viewport, setViewport] = React.useState<ViewportSize>({ height: 0, width: 0 });
  const frame = createFrameLayout(viewport, { heightMm: input.sensorHeightMm, widthMm: input.sensorWidthMm });
  const { height: frameHeight, width: frameWidth } = frame;
  const verticalFovDeg = 2 * Math.atan(input.sensorHeightMm / (2 * input.focalLengthMm * input.multiplier)) * 180 / Math.PI;

  React.useEffect(() => {
    const mapVerticalFovDeg = getMapVerticalFov(verticalFovDeg, { height: frameHeight, width: frameWidth, x: 0, y: 0 }, viewport.height);
    if (mapVerticalFovDeg)
      stellaRef.current?.setFovFrame(mapVerticalFovDeg, input.sensorWidthMm, input.sensorHeightMm);
  }, [frameHeight, frameWidth, input.sensorHeightMm, input.sensorWidthMm, stellaRef, verticalFovDeg, viewport.height]);

  return (
    <View
      onLayout={({ nativeEvent }) => setViewport(nativeEvent.layout)}
      pointerEvents="none"
      style={styles.root}
      testID="deep-space-fov-overlay"
    >
      {frame.width > 0 && (
        <View style={[styles.frame, { height: frame.height, left: frame.x, top: frame.y, width: frame.width }]}>
          <View style={styles.verticalCrosshair} />
          <View style={styles.horizontalCrosshair} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
  },
  frame: {
    borderColor: '#FFFFFF',
    borderRadius: 2,
    borderWidth: 2,
    position: 'absolute',
  },
  horizontalCrosshair: {
    backgroundColor: 'rgba(255,255,255,0.84)',
    height: 1,
    left: '45%',
    position: 'absolute',
    right: '45%',
    top: '50%',
  },
  verticalCrosshair: {
    backgroundColor: 'rgba(255,255,255,0.84)',
    bottom: '45%',
    left: '50%',
    position: 'absolute',
    top: '45%',
    width: 1,
  },
});
