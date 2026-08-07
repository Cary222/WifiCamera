import type { SvgProps } from 'react-native-svg';
import { Image } from 'expo-image';
import * as React from 'react';

const homeInactive = require('@/assets/icons/tab/home_0.png');
const homeActive = require('@/assets/icons/tab/home_1.png');

export function HomeFilled({ focused, size = 24 }: { focused?: boolean; size?: number } & SvgProps) {
  return (
    <Image
      source={focused ? homeActive : homeInactive}
      style={{ width: size, height: size }}
      contentFit="contain"
    />
  );
}
