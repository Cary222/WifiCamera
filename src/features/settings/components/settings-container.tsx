import type { TxKeyPath } from '@/lib/i18n';

import * as React from 'react';
import { useUniwind } from 'uniwind';
import { Text, View } from '@/components/ui';

type Props = {
  children: React.ReactNode;
  title?: TxKeyPath;
};

export function SettingsContainer({ children, title }: Props) {
  const { theme } = useUniwind();
  const isDark = theme === 'dark';
  const titleColor = isDark ? 'text-white' : 'text-neutral-600';
  return (
    <>
      {title && <Text className={`pt-4 pb-2 text-lg ${titleColor}`} tx={title} />}
      <View
        className="rounded-md border border-neutral-200 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800"
      >
        {children}
      </View>
    </>
  );
}
