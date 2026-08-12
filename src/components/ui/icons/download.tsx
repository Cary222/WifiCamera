import type { SvgProps } from 'react-native-svg';
import * as React from 'react';
import Svg, { Path } from 'react-native-svg';

type DownloadProps = {
  size?: number;
} & Omit<SvgProps, 'width' | 'height'>;

export function Download({ color = '#fff', size = 24, ...props }: DownloadProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
      <Path
        d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
