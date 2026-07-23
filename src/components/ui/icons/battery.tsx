import type { SvgProps } from 'react-native-svg';
import * as React from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

export function Battery({ percent = 85, size = 24, color = '#fff', ...props }: SvgProps & { percent?: number; size?: number }) {
  const cappedPercent = Math.min(100, Math.max(0, percent));
  const bodyWidth = 20;
  const bodyHeight = 10;
  const tipWidth = 2;
  const tipHeight = 5;
  const fillWidth = (cappedPercent / 100) * bodyWidth;
  const fillColor = cappedPercent > 20 ? '#22C55E' : '#EF4444';

  return (
    <Svg width={size} height={size} viewBox="0 0 24 12" fill="none" {...props}>
      <Rect x="1" y="1" width={bodyWidth} height={bodyHeight} rx="2" stroke={color} strokeWidth="1.5" />
      <Path d={`M ${bodyWidth + 1} ${bodyHeight / 2 - tipHeight / 2} v ${tipHeight} h ${tipWidth} a 1 1 0 0 1 ${tipWidth} -${tipHeight} z`} fill={color} />
      {cappedPercent > 0 && (
        <Rect x="2" y="2" width={fillWidth} height={bodyHeight - 2} rx="1" fill={fillColor} />
      )}
    </Svg>
  );
}
