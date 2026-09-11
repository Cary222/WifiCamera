import * as React from 'react';
import Svg, { Line } from 'react-native-svg';

import { useUniwind } from 'uniwind';

import { OVERLAY } from './deep-space-theme';

export function CloseIcon({ color }: { color?: string } = {}): React.ReactElement {
  const { theme } = useUniwind();
  const isDark = theme === 'dark';
  const stroke = color ?? (isDark ? OVERLAY.text : '#0A0B0D');

  return (
    <Svg height={26} viewBox="0 0 26 26" width={26}>
      <Line stroke={stroke} strokeLinecap="round" strokeWidth={2} x1={6} x2={20} y1={6} y2={20} />
      <Line stroke={stroke} strokeLinecap="round" strokeWidth={2} x1={20} x2={6} y1={6} y2={20} />
    </Svg>
  );
}
