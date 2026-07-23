import type { SvgProps } from 'react-native-svg';
import * as React from 'react';
import Svg, { Path } from 'react-native-svg';

export function User({ color = '#000', ...props }: SvgProps) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" {...props}>
      <Path
        d="M12 12c2.762 0 5-2.238 5-5s-2.238-5-5-5-5 2.238-5 5 2.238 5 5 5Zm0 2c-3.866 0-9 1.79-9 5.5V21h18v-1.5c0-3.71-5.134-5.5-9-5.5Z"
        fill={color}
      />
    </Svg>
  );
}
