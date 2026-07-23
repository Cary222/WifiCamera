import type { TxKeyPath } from '@/lib/i18n';

import * as React from 'react';
import { useUniwind } from 'uniwind';
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
  const { theme } = useUniwind();
  const isDark = theme === 'dark';
  const arrowColor = isDark ? '#CCCCCC' : '#999999';
  return (
    <Pressable
      onPress={onPress}
      pointerEvents={isPressable ? 'auto' : 'none'}
      className="flex-1 flex-row items-center justify-between px-4 py-2"
    >
      <View className="flex-row items-center">
        {icon && <View className="pr-2">{icon}</View>}
        <Text tx={text} />
      </View>
      <View className="flex-row items-center">
        <Text className="text-neutral-600 dark:text-neutral-300">{value}</Text>
        {isPressable && (
          <View className="pl-2">
            <ArrowRight color={arrowColor} />
          </View>
        )}
      </View>
    </Pressable>
  );
}
