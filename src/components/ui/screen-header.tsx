import { useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUniwind } from 'uniwind';

import { ArrowLeft } from '@/components/ui/icons';

import { Text } from './text';

export type ScreenHeaderProps = {
  title: string;
  onBack?: () => void;
};

export function ScreenHeader({ title, onBack }: ScreenHeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useUniwind();
  const isDark = theme === 'dark';
  const arrowColor = isDark ? '#D0D0D0' : '#666';
  const titleColor = isDark ? 'text-white' : 'text-black';

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (router.canGoBack()) {
      router.back();
    }
  };

  return (
    <View className="flex-row items-center p-4" style={{ paddingTop: insets.top }}>
      <Pressable
        hitSlop={10}
        onPress={handleBack}
        className="pr-3"
      >
        <ArrowLeft color={arrowColor} />
      </Pressable>
      <View className="flex-1 items-center">
        <Text className={`text-[20px] ${titleColor}`}>{title}</Text>
      </View>
      <View className="w-6" />
    </View>
  );
}
