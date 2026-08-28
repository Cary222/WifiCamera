import type { SvgProps } from 'react-native-svg';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

type IconProps = SvgProps & {
  color?: string;
  size?: number;
  disabled?: boolean;
};

function stroke(color: string, width = 1.8) {
  return {
    fill: 'none' as const,
    stroke: color,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: width,
  };
}

export function ChevronLeftIcon({ color = '#FFF', size = 22, ...props }: IconProps) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" {...props}><Path d="M15 4.5 7.8 12l7.2 7.5" {...stroke(color, 2.2)} /></Svg>;
}

export function ChevronDownIcon({ color = '#FFF', size = 16, ...props }: IconProps) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" {...props}><Path d="m5.5 9 6.5 6.5L18.5 9" {...stroke(color, 2)} /></Svg>;
}

export function ChevronUpIcon({ color = '#FFF', size = 16, ...props }: IconProps) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" {...props}><Path d="m5.5 15 6.5-6.5L18.5 15" {...stroke(color, 2)} /></Svg>;
}

export function CloseIcon({ color = '#FFF', size = 20, ...props }: IconProps) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" {...props}><Path d="M6 6l12 12M18 6 6 18" {...stroke(color, 2)} /></Svg>;
}

export function ResetIcon({ color = '#FFF', size = 20, ...props }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...props}>
      <Path d="M20.2 12a8.2 8.2 0 1 1-2.6-6" {...stroke(color)} />
      <Path d="M17.8 2.6v3.8H14" {...stroke(color)} />
    </Svg>
  );
}

export function StopwatchIcon({ color = '#FFF', size = 26, disabled = false, ...props }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...props}>
      <Circle cx={12} cy={13.4} r={7.4} {...stroke(color)} />
      <Path d="M12 9.6v3.8l2.6 1.7M9.4 2.8h5.2M12 2.8v3" {...stroke(color)} />
      {disabled && <Line x1="4" y1="20" x2="20" y2="4" {...stroke(color)} />}
    </Svg>
  );
}

export function CountdownIcon({ color = '#FFF', size = 26, disabled = false, ...props }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...props}>
      <Path d="M20.2 12a8.2 8.2 0 1 1-2.6-6" {...stroke(color)} />
      <Path d="M17.8 2.6v3.8H14" {...stroke(color)} />
      <Path d="M12 7.8V12l2.8 1.8" {...stroke(color)} />
      {disabled && <Line x1="4" y1="20" x2="20" y2="4" {...stroke(color)} />}
    </Svg>
  );
}

export function WatermarkFlaskIcon({ color = '#FFF', size = 26, disabled = false, ...props }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...props}>
      <Path d="M9.6 3h4.8M10.6 3v5.4L5.9 17a2.6 2.6 0 0 0 2.3 3.9h7.6a2.6 2.6 0 0 0 2.3-3.9l-4.7-8.6V3" {...stroke(color)} />
      <Path d="M8 14.4h8" {...stroke(color)} />
      {disabled && <Line x1="4" y1="20" x2="20" y2="4" {...stroke(color)} />}
    </Svg>
  );
}

export function SheetMenuIcon({ color = '#FFF', size = 24, ...props }: IconProps) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" {...props}><Path d="M3 7.5h18M5 12h14M7 16.5h10" {...stroke(color, 2)} /></Svg>;
}

export function RatioBoxIcon({ color = '#FFF', size = 24, ...props }: IconProps) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" {...props}><Rect x="3" y="5" width="18" height="14" rx="2.6" {...stroke(color)} /></Svg>;
}

export function MeteringIcon({ color = '#FFF', size = 24, ...props }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...props}>
      <Path d="M7 4H5.5A1.5 1.5 0 0 0 4 5.5V7M17 4h1.5A1.5 1.5 0 0 1 20 5.5V7M7 20H5.5A1.5 1.5 0 0 1 4 18.5V17M17 20h1.5a1.5 1.5 0 0 0 1.5-1.5V17" {...stroke(color, 2.2)} />
      <Circle cx={12} cy={12} r={3.2} {...stroke(color, 2)} />
    </Svg>
  );
}
