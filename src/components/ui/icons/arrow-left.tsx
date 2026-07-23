import type { SvgProps } from 'react-native-svg';
import * as React from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { isRTL } from '@/lib/i18n';

export function ArrowLeft({ color = '#000', size = 24, style, ...props }: SvgProps & { size?: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      {...props}
      style={StyleSheet.flatten([
        style,
        { transform: [{ scaleX: isRTL ? -1 : 1 }] },
      ])}
    >
      <Path
        d="M14.71 6.71a1 1 0 0 0-1.42 0l-6 6a1 1 0 0 0 0 1.42l6 6a1 1 0 1 0 1.42-1.42L9.41 12l5.3-5.29a1 1 0 0 0 0-1.42Z"
        fill={color}
      />
    </Svg>
  );
}
