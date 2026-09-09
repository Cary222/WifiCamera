import type { GestureResponderEvent, LayoutChangeEvent } from 'react-native';
import * as React from 'react';
import { Image, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { STELLARIUM_WORLD_MAP_BASE64 } from '@/assets/stellar/world-map-texture';
import { translate } from '@/lib/i18n';

type LocationWorldMapProps = {
  enabled?: boolean;
  latitudeDeg: number;
  longitudeDeg: number;
  onSelectCoordinate: (lat: number, lon: number) => void;
};

const PIN_COLOR = '#7BAAF7';
const PIN_SCALE = 1.2;

function calculateCoords(
  touch: { x: number; y: number },
  dims: { height: number; width: number },
): { lat: number; lon: number } {
  const normX = Math.max(0, Math.min(dims.width, touch.x));
  const normY = Math.max(0, Math.min(dims.height, touch.y));
  const lon = (normX / dims.width) * 360 - 180;
  const lat = 90 - (normY / dims.height) * 180;
  return {
    lat: Number(Math.max(-90, Math.min(90, lat)).toFixed(4)),
    lon: Number(Math.max(-180, Math.min(180, lon)).toFixed(4)),
  };
}

/**
 * Material-style drop pin marker matching official Stellarium location pointer
 */
function MapLocationPin({ pinX, pinY }: { pinX: number; pinY: number }) {
  const offsetX = pinX - 12 * PIN_SCALE;
  const offsetY = pinY - 22 * PIN_SCALE;

  return (
    <>
      {/* Soft shadow below the pin tip */}
      <Circle
        cx={pinX}
        cy={pinY}
        fill="rgba(0,0,0,0.35)"
        r={3}
      />
      {/* Blue drop marker with white center hole */}
      <Path
        d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
        fill={PIN_COLOR}
        stroke="rgba(0,0,0,0.2)"
        strokeWidth={0.5}
        testID="deep-space-location-map-pin"
        transform={`translate(${offsetX}, ${offsetY}) scale(${PIN_SCALE})`}
      />
    </>
  );
}

export function LocationWorldMap({
  enabled = true,
  latitudeDeg,
  longitudeDeg,
  onSelectCoordinate,
}: LocationWorldMapProps): React.ReactElement {
  const [dimensions, setDimensions] = React.useState({ height: 160, width: 320 });
  const dimsRef = React.useRef(dimensions);
  dimsRef.current = dimensions;
  const enabledRef = React.useRef(enabled);
  enabledRef.current = enabled;

  const onLayout = React.useCallback((event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    if (width > 0) {
      // Strictly maintain 2:1 aspect ratio matching 1000x500 map texture
      const height = Math.round(width / 2);
      setDimensions({ height, width });
    }
  }, []);

  const handleTouch = React.useCallback((locationX: number, locationY: number) => {
    if (!enabledRef.current)
      return;
    const { height, width } = dimsRef.current;
    if (width <= 0 || height <= 0)
      return;
    const { lat, lon } = calculateCoords({ x: locationX, y: locationY }, { height, width });
    onSelectCoordinate(lat, lon);
  }, [onSelectCoordinate]);

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: () => enabledRef.current,
        onPanResponderGrant: e => handleTouch(e.nativeEvent.locationX, e.nativeEvent.locationY),
        onPanResponderMove: e => handleTouch(e.nativeEvent.locationX, e.nativeEvent.locationY),
        onStartShouldSetPanResponder: () => enabledRef.current,
      }),
    [handleTouch],
  );

  const clampedLat = Math.max(-90, Math.min(90, latitudeDeg));
  const clampedLon = Math.max(-180, Math.min(180, longitudeDeg));
  const pinX = ((clampedLon + 180) / 360) * dimensions.width;
  const pinY = ((90 - clampedLat) / 180) * dimensions.height;

  return (
    <Pressable
      accessibilityLabel={translate('deep_space.location.world_map')}
      accessibilityRole="imagebutton"
      onLayout={onLayout}
      onPress={(e: GestureResponderEvent) => handleTouch(e.nativeEvent.locationX, e.nativeEvent.locationY)}
      style={styles.mapContainer}
      testID="deep-space-location-world-map"
      {...panResponder.panHandlers}
    >
      <Image
        resizeMode="stretch"
        source={{ uri: STELLARIUM_WORLD_MAP_BASE64 }}
        style={{ height: dimensions.height, width: dimensions.width }}
        testID="deep-space-location-world-map-image"
      />
      <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
        <Svg height={dimensions.height} viewBox={`0 0 ${dimensions.width} ${dimensions.height}`} width={dimensions.width}>
          <MapLocationPin pinX={pinX} pinY={pinY} />
        </Svg>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  mapContainer: {
    // 100% full width, 0 horizontal margin, 0 border radius matching Stellarium QML
    alignSelf: 'stretch',
    aspectRatio: 2,
    backgroundColor: '#000000',
    overflow: 'hidden',
    width: '100%',
  },
});
