import type { SvgProps } from 'react-native-svg';
import { Image } from 'expo-image';
import * as React from 'react';
import { useUniwind } from 'uniwind';

const settingsInactive = require('@/assets/icons/tab/setting_0.png');
const settingsActive = require('@/assets/icons/tab/setting_1.png');

export function SettingsFilled({ color, focused, size = 24 }: { focused?: boolean; size?: number } & SvgProps) {
  const { theme } = useUniwind();
  const isDark = theme === 'dark';
  return (
    <Image
      source={focused ? settingsActive : settingsInactive}
      style={{ width: size, height: size }}
      contentFit="contain"
      tintColor={focused ? undefined : (isDark ? undefined : (typeof color === 'string' ? color : '#687076'))}
    />
  );
}
