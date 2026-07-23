import type { SvgProps } from 'react-native-svg';
import * as React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export function Image({ color = '#000', ...props }: SvgProps) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" {...props}>
      <Rect x={3} y={3} width={18} height={18} rx={2} stroke={color} strokeWidth={2} fill="none" />
      <Circle cx={8.5} cy={8.5} r={1.5} fill={color} />
      <Path d="M21 15l-5-5L5 21" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
