import type { SvgProps } from 'react-native-svg';
import * as React from 'react';
import Svg, { Path } from 'react-native-svg';

export function Info({ color = '#000', ...props }: SvgProps) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" {...props}>
      <Path
        d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm.07 14.93a1.07 1.07 0 1 1 0-2.14 1.07 1.07 0 0 1 0 2.14ZM13.5 9.93a.9.9 0 0 1-1.8 0V7.07a.9.9 0 0 1 1.8 0v2.86Z"
        fill={color}
      />
    </Svg>
  );
}
