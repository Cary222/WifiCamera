import type { GestureResponderEvent, LayoutChangeEvent } from 'react-native';
import * as React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

type LocationWorldMapProps = {
  latitudeDeg: number;
  longitudeDeg: number;
  onSelectCoordinate: (lat: number, lon: number) => void;
};

// Simplified continent landmasses in a 360x180 Equirectangular coordinate system
const CONTINENT_LANDS = [
  {
    d: 'M 10 30 Q 30 20 60 25 T 100 20 T 140 30 T 170 40 L 150 70 L 120 80 L 90 60 L 70 75 L 45 80 L 30 50 Z M 30 75 Q 50 65 60 85 T 45 130 T 25 100 Z',
    id: 'eurasia-africa',
  },
  {
    d: 'M 200 25 Q 230 15 260 25 T 280 50 L 260 75 L 245 70 L 235 60 L 210 45 Z M 260 85 Q 280 95 270 125 T 255 150 T 245 110 Z',
    id: 'americas',
  },
  {
    d: 'M 115 110 Q 140 105 145 125 T 130 145 T 115 130 Z',
    id: 'australia',
  },
];

export function LocationWorldMap({
  latitudeDeg,
  longitudeDeg,
  onSelectCoordinate,
}: LocationWorldMapProps): React.ReactElement {
  const [dimensions, setDimensions] = React.useState({ height: 160, width: 320 });

  const onLayout = React.useCallback((event: LayoutChangeEvent) => {
    const { height, width } = event.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setDimensions({ height, width });
    }
  }, []);

  const handlePress = React.useCallback(
    (event: GestureResponderEvent) => {
      const { locationX, locationY } = event.nativeEvent;
      const { height, width } = dimensions;
      if (width <= 0 || height <= 0)
        return;

      const normX = Math.max(0, Math.min(width, locationX));
      const normY = Math.max(0, Math.min(height, locationY));

      const lon = (normX / width) * 360 - 180;
      const lat = 90 - (normY / height) * 180;

      const clampedLat = Number(Math.max(-90, Math.min(90, lat)).toFixed(4));
      const clampedLon = Number(Math.max(-180, Math.min(180, lon)).toFixed(4));

      onSelectCoordinate(clampedLat, clampedLon);
    },
    [dimensions, onSelectCoordinate],
  );

  const clampedLat = Math.max(-90, Math.min(90, latitudeDeg));
  const clampedLon = Math.max(-180, Math.min(180, longitudeDeg));

  const pinX = ((clampedLon + 180) / 360) * dimensions.width;
  const pinY = ((90 - clampedLat) / 180) * dimensions.height;

  return (
    <Pressable
      accessibilityLabel="世界地图位置选择"
      accessibilityRole="imagebutton"
      onLayout={onLayout}
      onPress={handlePress}
      style={styles.mapContainer}
      testID="deep-space-location-world-map"
    >
      <Svg height={dimensions.height} viewBox={`0 0 ${dimensions.width} ${dimensions.height}`} width={dimensions.width}>
        {/* Ocean background */}
        <Rect fill="#191D24" height={dimensions.height} rx={8} width={dimensions.width} />

        {/* Latitude / Longitude Grid Lines */}
        {[-60, -30, 0, 30, 60].map(deg => (
          <Line
            key={`lat-${deg}`}
            stroke={deg === 0 ? '#373F4D' : '#222832'}
            strokeWidth={deg === 0 ? 1.5 : 1}
            x1={0}
            x2={dimensions.width}
            y1={((90 - deg) / 180) * dimensions.height}
            y2={((90 - deg) / 180) * dimensions.height}
          />
        ))}
        {[-120, -60, 0, 60, 120].map(deg => (
          <Line
            key={`lon-${deg}`}
            stroke={deg === 0 ? '#373F4D' : '#222832'}
            strokeWidth={deg === 0 ? 1.5 : 1}
            x1={((deg + 180) / 360) * dimensions.width}
            x2={((deg + 180) / 360) * dimensions.width}
            y1={0}
            y2={dimensions.height}
          />
        ))}

        {/* Continent shapes scaled to dimensions */}
        <Svg
          height={dimensions.height}
          viewBox="0 0 360 180"
          width={dimensions.width}
        >
          {CONTINENT_LANDS.map(land => (
            <Path
              d={land.d}
              fill="#2D3542"
              key={land.id}
              stroke="#3B4454"
              strokeWidth={0.8}
            />
          ))}
        </Svg>

        {/* Location Pin target */}
        <Circle cx={pinX} cy={pinY} fill="#64A6FF" opacity={0.3} r={12} testID="deep-space-location-map-pin" />
        <Circle cx={pinX} cy={pinY} fill="#FFFFFF" r={3.5} stroke="#3875D7" strokeWidth={1.5} />
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  mapContainer: {
    borderRadius: 8,
    marginHorizontal: 18,
    marginVertical: 12,
    overflow: 'hidden',
  },
});
