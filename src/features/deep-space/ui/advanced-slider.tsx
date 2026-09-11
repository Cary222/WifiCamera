import * as React from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

type AdvancedSliderProps = {
  disabled?: boolean;
  max: number;
  min: number;
  onChange: (val: number) => void;
  step?: number;
  testID: string;
  value: number;
};

export function AdvancedSlider({
  disabled = false,
  max,
  min,
  onChange,
  step = 0.1,
  testID,
  value,
}: AdvancedSliderProps): React.ReactElement {
  const [_trackWidth, setTrackWidth] = React.useState(0);
  const [dragValue, setDragValue] = React.useState<number | null>(null);
  const trackRef = React.useRef<View>(null);
  const trackBoundsRef = React.useRef({ pageX: 0, width: 0 });

  const clamped = Math.max(min, Math.min(max, value));
  const currentVal = dragValue ?? clamped;
  const progressRatio = (currentVal - min) / (max - min);

  const updateFromPageX = React.useCallback(
    (pageX: number, isFinal = false) => {
      const { pageX: startX, width } = trackBoundsRef.current;
      if (width <= 0)
        return;
      const ratio = Math.max(0, Math.min(1, (pageX - startX) / width));
      const raw = min + ratio * (max - min);
      const stepped = Math.max(min, Math.min(max, Math.round(raw / step) * step));
      const finalVal = Number(stepped.toFixed(2));
      setDragValue(isFinal ? null : finalVal);
      onChange(finalVal);
    },
    [max, min, onChange, step],
  );

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderGrant: (event) => {
          trackRef.current?.measure((...args: number[]) => {
            const width = args[2];
            const pageX = args[4];
            if (typeof width === 'number' && width > 0 && typeof pageX === 'number') {
              trackBoundsRef.current = { pageX, width };
              setTrackWidth(width);
              updateFromPageX(event.nativeEvent.pageX);
            }
          });
        },
        onPanResponderMove: (event) => {
          if (!disabled)
            updateFromPageX(event.nativeEvent.pageX);
        },
        onPanResponderRelease: (event) => {
          if (!disabled)
            updateFromPageX(event.nativeEvent.pageX, true);
        },
        onPanResponderTerminate: (event) => {
          if (!disabled)
            updateFromPageX(event.nativeEvent.pageX, true);
        },
        onStartShouldSetPanResponder: () => !disabled,
      }),
    [disabled, updateFromPageX],
  );

  return (
    <View
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      accessibilityRole="adjustable"
      accessibilityValue={{ max, min, now: currentVal }}
      onAccessibilityAction={(event) => {
        if (disabled)
          return;
        if (event.nativeEvent?.actionName === 'increment')
          onChange(Math.min(max, currentVal + step));
        if (event.nativeEvent?.actionName === 'decrement')
          onChange(Math.max(min, currentVal - step));
      }}
      onLayout={e => setTrackWidth(e.nativeEvent.layout.width)}
      ref={trackRef}
      style={[styles.sliderRow, disabled && styles.sliderDisabled]}
      testID={testID}
      {...panResponder.panHandlers}
    >
      <View style={styles.sliderTrack}>
        <View style={[styles.sliderFill, { width: `${progressRatio * 100}%` }]} />
        <View style={[styles.sliderThumb, { left: `${progressRatio * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sliderDisabled: {
    opacity: 0.35,
  },
  sliderFill: {
    backgroundColor: '#64A6FF',
    borderRadius: 3,
    height: '100%',
  },
  sliderRow: {
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: 20,
    width: '100%',
  },
  sliderThumb: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    height: 20,
    marginLeft: -10,
    marginTop: -7,
    position: 'absolute',
    top: '50%',
    width: 20,
  },
  sliderTrack: {
    backgroundColor: '#353941',
    borderRadius: 3,
    height: 6,
    position: 'relative',
    width: '100%',
  },
});
