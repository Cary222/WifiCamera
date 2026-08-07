import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Modal, Text, useModal } from '@/components/ui';
import { translate } from '@/lib/i18n';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function DeviceConnectionModal({ visible, onClose }: Props) {
  const { ref, present, dismiss } = useModal();
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (visible) {
      present();
    }
    else {
      dismiss();
    }
  }, [visible, present, dismiss]);

  const handleConnect = () => {
    setConnecting(true);
    setTimeout(() => {
      setConnecting(false);
      onClose();
    }, 2000);
  };

  return (
    <Modal
      ref={ref}
      title={translate('settings.connect_camera')}
      snapPoints={['70%']}
      onDismiss={onClose}
    >
      <ScrollView className="flex-1 px-5">
        <View className="py-4">
          <Text className="mb-4 text-center text-neutral-500 dark:text-neutral-400">
            {translate('home.connect_hint')}
          </Text>

          <View className="mt-6 gap-3">
            <Pressable
              onPress={handleConnect}
              disabled={connecting}
              className="rounded-xl border border-neutral-200 bg-white p-4 active:bg-neutral-50 disabled:opacity-50 dark:border-[#2C2C2C] dark:bg-[#1A1A1A] dark:active:bg-[#252525]"
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-1">
                  <Text className="font-semibold text-black dark:text-white">
                    Wi-Fi Camera
                  </Text>
                  <Text className="mt-1 text-sm text-neutral-500">
                    {connecting ? 'Connecting...' : 'Available'}
                  </Text>
                </View>
                <View className="size-3 rounded-full bg-green-500" />
              </View>
            </Pressable>

            <View className="mt-4 rounded-lg bg-amber-50 p-4 dark:bg-amber-950/20">
              <Text className="text-sm text-amber-800 dark:text-amber-200">
                💡 Make sure your device is on the same Wi-Fi network as the camera
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </Modal>
  );
}
