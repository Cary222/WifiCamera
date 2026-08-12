import type { SvgProps } from 'react-native-svg';
import * as React from 'react';
import Svg, { Path } from 'react-native-svg';

type FolderFilledProps = {
  size?: number;
} & Omit<SvgProps, 'width' | 'height'>;

export function FolderFilled({ color = '#fff', size = 24, ...props }: FolderFilledProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
      <Path
        d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.379a2 2 0 0 1 1.414.586L11.5 6.207a1 1 0 0 0 .707.293h6.293A2.5 2.5 0 0 1 21 9v8.5A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-11Z"
        fill={color}
      />
    </Svg>
  );
}
