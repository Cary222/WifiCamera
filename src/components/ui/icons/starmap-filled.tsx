import type { SvgProps } from 'react-native-svg';
import { Image } from 'expo-image';
import * as React from 'react';

const starmapInactive = require('@/assets/icons/tab/starmap_0.png');
const starmapActive = require('@/assets/icons/tab/starmap_1.png');

export function StarmapFilled({ focused, size = 24 }: { focused?: boolean; size?: number } & SvgProps) {
  return (
    <Image
      source={focused ? starmapActive : starmapInactive}
      style={{ width: size, height: size }}
      contentFit="contain"
    />
  );
}
