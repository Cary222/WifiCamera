import { View } from 'react-native';
import { Text } from '@/components/ui';
import { Battery } from '@/components/ui/icons';
import { translate } from '@/lib/i18n';

type Props = {
  batteryLevel: number;
  storageRemaining: string;
};

export function DeviceInfoCards({ batteryLevel, storageRemaining }: Props) {
  return (
    <>
      <View className="mr-2 mb-4 ml-5">
        <Text className="text-[32px] font-light text-black dark:text-white">
          {translate('home.wifi_camera')}
        </Text>
      </View>

      <View className="mr-5 mb-4 ml-12">
        <View className="flex-row items-center gap-2 rounded-[20px] border border-neutral-300 bg-neutral-100 px-4 py-2 dark:border-[rgba(72,72,72,0.3)] dark:bg-[#121315]">
          <View className="size-[10px] rounded-full bg-[#c5e538]" />
          <Text className="text-[16px] font-normal text-[#c5e538]">
            {translate('home.device_connected')}
          </Text>
        </View>
      </View>

      <View className="mx-5 mb-6 flex-row gap-4">
        <View className="flex-1 rounded-[15px] border border-neutral-200 bg-neutral-50 p-5 dark:border-[rgba(72,72,72,0.5)] dark:bg-[#111113]">
          <View className="flex-row items-center gap-3">
            <Battery color="#000000" className="dark:text-white" width={30} height={30} />
            <View className="flex-1">
              <Text className="text-[22px] font-light text-black dark:text-white">
                {batteryLevel}
                %
              </Text>
              <Text className="mt-1 text-[12px] font-light text-black/50 dark:text-white/50">
                {translate('home.battery_level')}
              </Text>
            </View>
          </View>
        </View>

        <View className="flex-1 rounded-[15px] border border-neutral-200 bg-neutral-50 p-5 dark:border-[rgba(72,72,72,0.5)] dark:bg-[#111113]">
          <View className="flex-row items-center gap-3">
            <View className="size-[30px] items-center justify-center">
              <Text className="text-xl">💾</Text>
            </View>
            <View className="flex-1">
              <Text className="text-[22px] font-light text-black dark:text-white">
                {storageRemaining}
              </Text>
              <Text className="mt-1 text-[12px] font-light text-black/50 dark:text-white/50">
                {translate('home.storage_remaining')}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </>
  );
}
