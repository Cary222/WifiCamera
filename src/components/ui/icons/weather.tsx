import type { SvgProps } from 'react-native-svg';
import * as React from 'react';
import Svg, { Path } from 'react-native-svg';

export function Weather({ color, ...props }: SvgProps) {
  return (
    <Svg width={25} height={24} fill="none" viewBox="0 0 25 24" {...props}>
      <Path
        d="M20.75 14.875C20.75 12.875 19.625 11.25 17.75 11.25C17.375 11.25 17 11.25 16.625 11.375C15.875 9.25 13.875 7.625 11.5 7.625C8.375 7.625 5.75 10.25 5.75 13.375C5.75 13.5 5.75 13.625 5.75 13.75C3.25 14.375 1.375 16.75 1.375 19.5C1.375 22.125 3.5 24.25 6.125 24.25H18.625C21.375 24.25 23.625 22 23.625 19.25C23.625 16.75 21.75 14.875 20.75 14.875Z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
