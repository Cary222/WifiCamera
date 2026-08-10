import type { TxKeyPath } from '@/lib/i18n';

import * as React from 'react';
import { Text, View } from '@/components/ui';

type Props = {
  children: React.ReactNode;
  title?: TxKeyPath;
};

export function SettingsContainer({ children, title }: Props) {
  return (
    <View className="mb-5">
      {title && (
        <Text
          className="mb-3 px-1 text-[14px] font-semibold text-neutral-500 dark:text-charcoal-400"
          tx={title}
        />
      )}
      <View className="overflow-hidden rounded-[17px] border border-neutral-200 bg-white dark:border-[#2D2D2D] dark:bg-[#111213]">
        {children}
      </View>
    </View>
  );
}
