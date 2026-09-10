/* eslint-disable react-refresh/only-export-components */
import * as React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, Line, Path, Rect } from 'react-native-svg';

export type CelestialAvatarCategory = 'solar_system' | 'stars' | 'constellation' | 'dso' | 'satellites';

export function guessCategory(id: string, defaultCategory: CelestialAvatarCategory = 'stars'): CelestialAvatarCategory {
  if (id.startsWith('NAME Sun') || id.startsWith('NAME Moon') || id.startsWith('NAME Mercury')
    || id.startsWith('NAME Venus') || id.startsWith('NAME Mars') || id.startsWith('NAME Jupiter')
    || id.startsWith('NAME Saturn') || id.startsWith('NAME Uranus') || id.startsWith('NAME Neptune')
    || id.startsWith('NAME Pluto') || id.startsWith('NAME Titan') || id.startsWith('NAME Ganymede')
    || id.startsWith('NAME Io') || id.startsWith('NAME Europa') || id.startsWith('NAME Callisto')) {
    return 'solar_system';
  }
  if (id.startsWith('CON ')) {
    return 'constellation';
  }
  if (id.startsWith('M ') || id.startsWith('NGC ') || id.startsWith('IC ') || id.startsWith('Caldwell ') || id === 'LMC' || id === 'SMC') {
    return 'dso';
  }
  if (id.startsWith('NORAD ') || id.toLowerCase().includes('satellite') || id.toLowerCase().includes('iss') || id.toLowerCase().includes('tiangong')) {
    return 'satellites';
  }
  return defaultCategory;
}

function SolarSystemIcon({ primaryColor, size, strokeColor }: { primaryColor: string; size: number; strokeColor: string }) {
  return (
    <Svg height={size * 0.65} viewBox="0 0 24 24" width={size * 0.65}>
      <Circle cx="12" cy="12" fill={primaryColor} r="5.5" />
      <Ellipse
        cx="12"
        cy="12"
        fill="none"
        rx="10"
        ry="3.5"
        stroke={strokeColor}
        strokeWidth="1.5"
        transform="rotate(-25 12 12)"
      />
    </Svg>
  );
}

function StarAvatarIcon({ nightMode, size }: { nightMode: boolean; size: number }) {
  return (
    <Svg height={size * 0.65} viewBox="0 0 24 24" width={size * 0.65}>
      <Path
        d="M12 2 Q12 12 2 12 Q12 12 12 22 Q12 12 22 12 Q12 12 12 2 Z"
        fill={nightMode ? '#ff8a80' : '#ffe082'}
      />
      <Circle cx="12" cy="12" fill="#ffffff" r="2" />
    </Svg>
  );
}

function ConstellationAvatarIcon({ size, strokeColor }: { size: number; strokeColor: string }) {
  return (
    <Svg height={size * 0.65} viewBox="0 0 24 24" width={size * 0.65}>
      <Line stroke={strokeColor} strokeDasharray="1.5 1.5" strokeWidth="1.2" x1="5" x2="11" y1="6" y2="12" />
      <Line stroke={strokeColor} strokeDasharray="1.5 1.5" strokeWidth="1.2" x1="11" x2="19" y1="12" y2="8" />
      <Line stroke={strokeColor} strokeDasharray="1.5 1.5" strokeWidth="1.2" x1="11" x2="14" y1="12" y2="19" />
      <Circle cx="5" cy="6" fill="#ffffff" r="2" />
      <Circle cx="11" cy="12" fill="#ffffff" r="2.5" />
      <Circle cx="19" cy="8" fill="#ffffff" r="2" />
      <Circle cx="14" cy="19" fill="#ffffff" r="2" />
    </Svg>
  );
}

function DsoAvatarIcon({ nightMode, primaryColor, size, strokeColor }: { nightMode: boolean; primaryColor: string; size: number; strokeColor: string }) {
  return (
    <Svg height={size * 0.65} viewBox="0 0 24 24" width={size * 0.65}>
      <Ellipse
        cx="12"
        cy="12"
        fill="none"
        rx="8.5"
        ry="4.5"
        stroke={primaryColor}
        strokeWidth="1.4"
        transform="rotate(-30 12 12)"
      />
      <Ellipse
        cx="12"
        cy="12"
        fill="none"
        rx="5"
        ry="2.5"
        stroke={strokeColor}
        strokeWidth="1.4"
        transform="rotate(-30 12 12)"
      />
      <Circle cx="12" cy="12" fill={nightMode ? '#ffcdd2' : '#e1f5fe'} r="2" />
    </Svg>
  );
}

function SatelliteAvatarIcon({ primaryColor, secondaryColor, size, strokeColor }: { primaryColor: string; secondaryColor: string; size: number; strokeColor: string }) {
  return (
    <Svg height={size * 0.65} viewBox="0 0 24 24" width={size * 0.65}>
      <Rect fill={primaryColor} height="6" rx="1" width="6" x="9" y="9" />
      <Rect fill={secondaryColor} height="4" rx="0.5" stroke={strokeColor} strokeWidth="0.8" width="6" x="2" y="10" />
      <Rect fill={secondaryColor} height="4" rx="0.5" stroke={strokeColor} strokeWidth="0.8" width="6" x="16" y="10" />
      <Line stroke={strokeColor} strokeWidth="1" x1="8" x2="9" y1="12" y2="12" />
      <Line stroke={strokeColor} strokeWidth="1" x1="15" x2="16" y1="12" y2="12" />
      <Circle cx="12" cy="12" fill="#ffffff" r="1" />
    </Svg>
  );
}

export function CelestialAvatar({
  category,
  nightMode = false,
  size = 36,
}: {
  category: CelestialAvatarCategory;
  nightMode?: boolean;
  size?: number;
}) {
  const primaryColor = nightMode ? '#ef5350' : '#4fc3f7';
  const secondaryColor = nightMode ? '#b71c1c' : '#0288d1';
  const strokeColor = nightMode ? '#ff8a80' : '#81d4fa';

  const renderIcon = () => {
    switch (category) {
      case 'solar_system':
        return <SolarSystemIcon primaryColor={primaryColor} size={size} strokeColor={strokeColor} />;
      case 'stars':
        return <StarAvatarIcon nightMode={nightMode} size={size} />;
      case 'constellation':
        return <ConstellationAvatarIcon size={size} strokeColor={strokeColor} />;
      case 'dso':
        return <DsoAvatarIcon nightMode={nightMode} primaryColor={primaryColor} size={size} strokeColor={strokeColor} />;
      case 'satellites':
        return <SatelliteAvatarIcon primaryColor={primaryColor} secondaryColor={secondaryColor} size={size} strokeColor={strokeColor} />;
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: nightMode ? 'rgba(183, 28, 28, 0.25)' : 'rgba(30, 41, 59, 0.7)',
          borderColor: nightMode ? 'rgba(239, 83, 80, 0.35)' : 'rgba(255, 255, 255, 0.12)',
          borderRadius: size / 2,
          height: size,
          width: size,
        },
      ]}
    >
      {renderIcon()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    borderWidth: 1,
    justifyContent: 'center',
  },
});
