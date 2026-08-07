import { Image } from 'expo-image';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui';
import { translate } from '@/lib/i18n';

// eslint-disable-next-line perfectionist/sort-imports -- require statement must come after regular imports
const cameraEquipment = require('@/assets/icons/index/CameraEquipment.png');

type Props = {
  onConnectPress: () => void;
};

export function ConnectionStatusCard({ onConnectPress }: Props) {
  return (
    <View className="mx-5 mt-6 rounded-[25px] border border-neutral-200 bg-neutral-100 p-8 dark:border-white dark:bg-[#101011]">
      <View className="items-center gap-4">
        <View className="size-16 items-center justify-center rounded-full bg-neutral-200 dark:bg-[#1A1A1A]">
          <Image
            source={cameraEquipment}
            style={{ width: 36, height: 36 }}
            contentFit="contain"
          />
        </View>

        <View className="items-center gap-2">
          <Text className="text-center text-[28px] font-bold text-black dark:text-white">
            {translate('home.device_not_connected')}
          </Text>
          <Text className="text-center text-[15px] font-bold text-black/50 dark:text-white/50">
            {translate('home.connect_hint')}
          </Text>
        </View>

        <Pressable
          onPress={onConnectPress}
          className="mt-2 rounded-[22.674px] bg-[#c8e733] px-12 py-3 active:opacity-80"
        >
          <Text className="text-center text-[16px] font-bold text-[#2a3319]">
            {translate('home.connect_device')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
