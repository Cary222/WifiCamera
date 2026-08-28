import * as React from 'react';
import Svg, { Line } from 'react-native-svg';

import { OVERLAY } from './deep-space-theme';

export function CloseIcon(): React.ReactElement {
  return (
    <Svg height={26} viewBox="0 0 26 26" width={26}>
      <Line stroke={OVERLAY.text} strokeLinecap="round" strokeWidth={2} x1={6} x2={20} y1={6} y2={20} />
      <Line stroke={OVERLAY.text} strokeLinecap="round" strokeWidth={2} x1={20} x2={6} y1={6} y2={20} />
    </Svg>
  );
}
