import type { SvgProps } from 'react-native-svg';
import { Image } from 'expo-image';
import * as React from 'react';
import { useUniwind } from 'uniwind';

const homeInactive = require('@/assets/icons/tab/home_0.png');
const homeActive = require('@/assets/icons/tab/home_1.png');

export function HomeFilled({ color, focused, size = 24 }: { focused?: boolean; size?: number } & SvgProps) {
  const { theme } = useUniwind();
  const isDark = theme === 'dark';
  return (
    <Image
      source={focused ? homeActive : homeInactive}
      style={{ width: size, height: size }}
      contentFit="contain"
      tintColor={focused ? undefined : (isDark ? undefined : (typeof color === 'string' ? color : '#687076'))}
    />
  );
}
