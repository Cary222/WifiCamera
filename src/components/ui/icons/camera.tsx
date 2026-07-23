import type { SvgProps } from 'react-native-svg';
import * as React from 'react';
import Svg, { Path } from 'react-native-svg';

export function Camera({ color = '#000', ...props }: SvgProps) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" {...props}>
      <Path
        d="M9.4 4l-1.83 2H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3.57L14.6 4h-5.2ZM12 17a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9Zm0-2a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"
        fill={color}
      />
    </Svg>
  );
}
