/* eslint-disable perfectionist/sort-imports */
import { Image } from 'expo-image';
import { View } from 'react-native';

import { Text } from '@/components/ui';
import { translate } from '@/lib/i18n';

const cardIcon = require('@/assets/common/card.png');
const powerIcon = require('@/assets/common/Power.png');

type Props = {
  /** Battery percentage, or null when the board has no battery gauge. */
  batteryLevel: number | null;
  /** True when the board reports it is charging. */
  inCharge?: boolean;
  storageRemaining: string;
  /** True when the camera is connected. */
  isConnected: boolean;
};

export function DeviceInfoCards({ batteryLevel, inCharge = false, storageRemaining, isConnected }: Props) {
  return (
    <View className="mx-[19px] my-6 rounded-[25px] border border-neutral-200 bg-white p-5 dark:border-[#48484880] dark:bg-[#101011]">
      <Text className="text-[28px] font-bold text-white">
        {translate('home.wifi_camera')}
      </Text>

      <View className="mt-5 flex-row items-center gap-2 self-start rounded-[20px] border border-neutral-200 bg-transparent px-4 py-2 dark:border-[#48484880]">
        <View className={`size-[10px] rounded-full ${isConnected ? 'bg-[#c8e733]' : 'bg-neutral-400'}`} />
        <Text className={`text-[14px] font-normal ${isConnected ? 'text-[#c8e733]! dark:text-[#c8e733]!' : 'text-neutral-400! dark:text-neutral-400!'}`}>
          {translate(isConnected ? 'home.device_connected' : 'home.device_not_connected')}
        </Text>
      </View>

      <View className="mt-5 flex-row gap-3">
        <View className="flex-1 rounded-[20px] border border-neutral-200 bg-transparent p-4 dark:border-[#48484880]">
          <View className="flex-row items-center gap-3">
            <View className="size-[52px] items-center justify-center rounded-[15px]">
              <Image
                source={powerIcon}
                style={{ width: 28, height: 28 }}
                contentFit="contain"
                tintColor="#c8e733"
              />
            </View>
            <View className="flex-1">
              <Text className="text-[22px] font-light text-white">
                {batteryLevel === null ? '—' : `${Math.round(batteryLevel)}%`}
              </Text>
              <Text
                className={`mt-1 text-[12px] font-light ${
                  inCharge ? 'text-[#c8e733]' : 'text-white/50'
                }`}
              >
                {inCharge
                  ? translate('home.battery_charging')
                  : translate('home.battery_level')}
              </Text>
            </View>
          </View>
        </View>

        <View className="flex-1 rounded-[20px] border border-neutral-200 bg-transparent p-4 dark:border-[#48484880]">
          <View className="flex-row items-center gap-3">
            <View className="size-[52px] items-center justify-center rounded-[15px]">
              <Image
                source={cardIcon}
                style={{ width: 28, height: 28 }}
                contentFit="contain"
              />
            </View>
            <View className="flex-1">
              <Text className="text-[22px] font-light text-white">
                {storageRemaining}
              </Text>
              <Text className="mt-1 text-[12px] font-light text-white/50">
                {translate('home.storage_remaining')}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}
