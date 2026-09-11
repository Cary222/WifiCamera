import type { TxKeyPath } from '@/lib/i18n';

import * as React from 'react';
import { Pressable, Text, View } from '@/components/ui';
import { ArrowRight } from '@/components/ui/icons';

type ItemProps = {
  text: TxKeyPath;
  value?: string;
  subtitle?: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
};

export function SettingsItem({ text, value, subtitle, icon, onPress, disabled = false }: ItemProps) {
  const isPressable = onPress !== undefined;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={isPressable ? 'button' : undefined}
      accessibilityState={{ disabled }}
      pointerEvents={isPressable ? 'auto' : 'none'}
      className="min-h-[68px] flex-row items-center justify-between gap-3 px-6 py-3"
    >
      <View className="flex-1 flex-row items-center">
        {icon && <View className="mr-3">{icon}</View>}
        <View className="flex-1">
          <Text className="text-[15px] text-black dark:text-white" tx={text} />
          {typeof subtitle === 'string'
            ? (
                <Text className="mt-1 text-[12px] text-neutral-500 dark:text-[#858585]">{subtitle}</Text>
              )
            : (
                subtitle
              )}
        </View>
      </View>
      <View className="flex-row items-center">
        {value && <Text className={`max-w-[150px] text-right text-[12px] ${subtitle ? 'text-[#758600] dark:text-[#C8E733]' : 'text-neutral-500 dark:text-charcoal-300'}`}>{value}</Text>}
        {isPressable && (
          <View className="ml-4">
            <ArrowRight color="#484848" />
          </View>
        )}
      </View>
    </Pressable>
  );
}
