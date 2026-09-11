import type { SvgProps } from 'react-native-svg';
import { Image } from 'expo-image';
import * as React from 'react';
import { useUniwind } from 'uniwind';

const starmapInactive = require('@/assets/icons/tab/starmap_0.png');
const starmapActive = require('@/assets/icons/tab/starmap_1.png');

export function StarmapFilled({ color, focused, size = 24 }: { focused?: boolean; size?: number } & SvgProps) {
  const { theme } = useUniwind();
  const isDark = theme === 'dark';
  return (
    <Image
      source={focused ? starmapActive : starmapInactive}
      style={{ width: size, height: size }}
      contentFit="contain"
      tintColor={focused ? undefined : (isDark ? undefined : (typeof color === 'string' ? color : '#687076'))}
    />
  );
}
