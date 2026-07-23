import type { SvgProps } from 'react-native-svg';
import * as React from 'react';
import Svg, { Path } from 'react-native-svg';

export function Droplet({ size = 24, color = '#fff', ...props }: SvgProps & { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
      <Path
        d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-3.5-6c0-3 2.5-5.5 2.5-5.5S15 5 12 5c-3 0-5 2.5-5 2.5S7 8.5 7 11c0 2-1.5 3.5-3 5.5S5 15 5 15a7 7 0 0 0 7 7Z"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
