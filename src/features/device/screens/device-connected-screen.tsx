import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Button, FocusAwareStatusBar, Text } from '@/components/ui';
import { translate } from '@/lib/i18n';

import { clearBoundDevice, useBoundDeviceId, useBoundDeviceName } from '../use-device-store';

export function DeviceConnectedScreen() {
  const router = useRouter();
  const [, setBoundDeviceId] = useBoundDeviceId();
  const deviceName = useBoundDeviceName();

  const handleContinue = () => {
    router.replace('/(app)');
  };

  const handleNotFound = () => {
    clearBoundDevice();
    setBoundDeviceId(undefined);
    router.replace('/device-setup');
  };

  return (
    <>
      <FocusAwareStatusBar />
      <View className="flex-1 bg-black">
        <Text
          tx="device.connected"
          className="mt-16 text-center text-[27px] text-white"
        />

        <View className="mx-5 flex-1 items-center justify-center">
          <View
            className="aspect-400/508 max-h-full w-full items-center justify-center rounded-2xl"
            style={{ backgroundColor: 'rgba(228, 228, 228, 0.2)' }}
          >
            <View
              className="aspect-186/295 w-[56.5%] rounded-2xl"
              style={{ backgroundColor: '#9D9D9D' }}
            />
            <Text className="mt-3 text-[18px] text-white">{deviceName ?? translate('device.device_name')}</Text>
          </View>
        </View>

        <View className="items-center pb-6">
          <Button
            label={translate('device.start_using')}
            onPress={handleContinue}
            className="mb-6 h-[60px] w-[256px] rounded-full"
            style={{ backgroundColor: '#FF8F1C' }}
            textClassName="text-[20px] font-normal text-white no-underline"
            variant="ghost"
          />

          <Pressable hitSlop={10} onPress={handleNotFound}>
            <Text
              tx="device.device_not_found"
              className="text-[15px] font-semibold text-white"
            />
          </Pressable>
        </View>
      </View>
    </>
  );
}
