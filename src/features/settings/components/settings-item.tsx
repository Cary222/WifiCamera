import type { TxKeyPath } from '@/lib/i18n';

import * as React from 'react';
import { Pressable, Text, View } from '@/components/ui';
import { ArrowRight } from '@/components/ui/icons';

type ItemProps = {
  text: TxKeyPath;
  value?: string;
  onPress?: () => void;
  icon?: React.ReactNode;
};

export function SettingsItem({ text, value, icon, onPress }: ItemProps) {
  const isPressable = onPress !== undefined;
  return (
    <Pressable
      onPress={onPress}
      pointerEvents={isPressable ? 'auto' : 'none'}
      className="min-h-[68px] flex-row items-center justify-between px-6"
    >
      <View className="flex-row items-center">
        {icon && <View className="mr-3">{icon}</View>}
        <Text className="text-[15px] text-black dark:text-white" tx={text} />
      </View>
      <View className="flex-row items-center">
        {value && <Text className="max-w-[150px] text-right text-[12px] text-neutral-500 dark:text-charcoal-300">{value}</Text>}
        {isPressable && (
          <View className="ml-3">
            <ArrowRight color="#C8E733" />
          </View>
        )}
      </View>
    </Pressable>
  );
}
