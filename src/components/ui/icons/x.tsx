import type { SvgProps } from 'react-native-svg';
import Svg, { Path } from 'react-native-svg';

interface XProps extends Omit<SvgProps, 'width' | 'height'> {
  size?: number;
}

export function X({ color = '#000', size = 24, ...props }: XProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
      <Path
        d="M18 6L6 18M6 6l12 12"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
