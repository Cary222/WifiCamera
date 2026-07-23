import type { SvgProps } from 'react-native-svg';
import Svg, { Path } from 'react-native-svg';

interface FolderProps extends Omit<SvgProps, 'width' | 'height'> {
  size?: number;
}

export function Folder({ color = '#000', size = 24, ...props }: FolderProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
      <Path
        d="M3 6a2 2 0 012-2h4l2 2h8a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V6z"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
