import type { SvgProps } from 'react-native-svg';
import * as React from 'react';
import Svg, { Path } from 'react-native-svg';

type RefreshProps = {
  size?: number;
} & Omit<SvgProps, 'width' | 'height'>;

export function Refresh({ color = '#fff', size = 24, ...props }: RefreshProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
      <Path
        d="M20.453 11.453a8.5 8.5 0 0 0-14.83-5.045M3.547 12.547a8.5 8.5 0 0 0 14.83 5.045"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M20.667 4v5.333h-5.333M3.333 20v-5.333h5.333"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
