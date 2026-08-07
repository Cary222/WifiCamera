import type { SvgProps } from 'react-native-svg';
import { Image } from 'expo-image';
import * as React from 'react';

const settingsInactive = require('@/assets/icons/tab/setting_0.png');
const settingsActive = require('@/assets/icons/tab/setting_1.png');

export function SettingsFilled({ focused, size = 24 }: { focused?: boolean; size?: number } & SvgProps) {
  return (
    <Image
      source={focused ? settingsActive : settingsInactive}
      style={{ width: size, height: size }}
      contentFit="contain"
    />
  );
}
