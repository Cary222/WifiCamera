/* eslint-disable better-tailwindcss/no-unknown-classes */
import type { TextProps, TextStyle } from 'react-native';
import type { TxKeyPath } from '@/lib/i18n';
import * as React from 'react';
import { I18nManager, Text as NNText, StyleSheet } from 'react-native';

import { twMerge } from 'tailwind-merge';
import { translate } from '@/lib/i18n';

type Props = {
  className?: string;
  tx?: TxKeyPath;
} & TextProps;

export function Text({
  className = '',
  style,
  tx,
  children,
  ...props
}: Props) {
  const nStyle = React.useMemo(
    () =>
      StyleSheet.flatten([
        {
          writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
        },
        style,
      ]) as TextStyle,
    [style],
  );

  const textStyle = React.useMemo(
    () =>
      twMerge(
        nStyle.fontSize === undefined
          ? 'font-inter text-base font-normal text-black dark:text-white'
          : 'font-inter font-normal text-black dark:text-white',
        className,
      ),
    [className, nStyle.fontSize],
  );
  return (
    <NNText className={textStyle} style={nStyle} {...props}>
      {tx ? translate(tx) : children}
    </NNText>
  );
}
