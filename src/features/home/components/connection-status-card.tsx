/* eslint-disable perfectionist/sort-imports */
import { Image } from 'expo-image';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui';
import { translate } from '@/lib/i18n';

const powerIcon = require('@/assets/common/Power.png');
const cameraEquipment = require('@/assets/icons/index/CameraEquipment.png');

type Props = {
  onConnectPress: () => void;
};

export function ConnectionStatusCard({ onConnectPress }: Props) {
  return (
    <View className="mx-[19px] mt-6 rounded-[25px] border border-neutral-200 bg-white p-5 dark:border-[#48484880] dark:bg-[#101011]">
      <View className="items-center gap-5">
        <View className="size-20 items-center justify-center rounded-[20px] bg-[#1A1A1A]">
          <Image
            source={cameraEquipment}
            style={{ width: 44, height: 44 }}
            contentFit="contain"
          />
        </View>

        <View className="items-center gap-1">
          <Text className="text-center text-[28px] font-bold text-white">
            {translate('home.device_not_connected')}
          </Text>
          <Text className="text-center text-[15px] font-normal text-white/50">
            {translate('home.connect_hint')}
          </Text>
        </View>

        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={onConnectPress}
            className="flex-row items-center gap-2 rounded-[22.674px] bg-[#c8e733] px-6 py-[14px] active:opacity-80"
          >
            <Image
              source={powerIcon}
              style={{ width: 20, height: 20 }}
              contentFit="contain"
              tintColor="#2a3319"
            />
            <Text className="text-center text-[16px] font-bold text-[#2a3319]">
              {translate('home.connect_device')}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
