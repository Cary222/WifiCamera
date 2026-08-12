import type { SvgProps } from 'react-native-svg';
import * as React from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

type SdCardProps = {
  size?: number;
} & Omit<SvgProps, 'width' | 'height'>;

export function SdCard({ color = '#fff', size = 24, ...props }: SdCardProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
      <Path
        d="M6 3h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M15 3v4a1 1 0 0 0 1 1h4"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Rect x={7} y={13} width={2} height={4} rx={0.4} fill={color} />
      <Rect x={10} y={13} width={2} height={4} rx={0.4} fill={color} />
      <Rect x={13} y={13} width={2} height={4} rx={0.4} fill={color} />
    </Svg>
  );
}
