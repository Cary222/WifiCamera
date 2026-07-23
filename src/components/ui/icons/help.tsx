import type { SvgProps } from 'react-native-svg';
import * as React from 'react';
import Svg, { Path } from 'react-native-svg';

export function Help({ color = '#000', ...props }: SvgProps) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" {...props}>
      <Path
        d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm.07 15.5a1.43 1.43 0 1 1 0-2.86 1.43 1.43 0 0 1 0 2.86Zm1.43-5.34c-.74.42-.93.7-.93 1.21a.9.9 0 0 1-1.8 0c0-1.21.62-1.91 1.65-2.47.7-.38.88-.66.88-1.1 0-.5-.43-.86-1.1-.86-.62 0-1.04.27-1.21.81a.9.9 0 0 1-1.74-.5c.42-1.3 1.53-2.1 2.97-2.1 1.65 0 2.88 1 2.88 2.5 0 1.07-.55 1.86-1.6 2.5Z"
        fill={color}
      />
    </Svg>
  );
}
