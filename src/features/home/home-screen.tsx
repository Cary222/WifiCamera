import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { FocusAwareStatusBar, Text } from '@/components/ui';
import { useCameraStore } from '@/features/camera/camera-store';
import { translate } from '@/lib/i18n';
import { ConnectionStatusCard } from './components/connection-status-card';
import { DeviceConnectionModal } from './components/device-connection-modal';
import { DeviceInfoCards } from './components/device-info-cards';
import { ModeGrid } from './components/mode-grid';

export function HomeScreen() {
  const [modalVisible, setModalVisible] = useState(false);
  const connectionStatus = useCameraStore.use.connectionStatus();
  const powerLevel = useCameraStore.use.powerLevel();
  const usedSpace = useCameraStore.use.usedSpace();
  const allSpace = useCameraStore.use.allSpace();

  const isConnected = connectionStatus === 'open';

  const formatStorage = (used: number | null, total: number | null) => {
    if (used === null || total === null)
      return '—';
    const remainingGB = ((total - used) / (1024 * 1024 * 1024)).toFixed(1);
    return `${remainingGB}GB`;
  };

  return (
    <>
      <FocusAwareStatusBar />
      <View className="flex-1 bg-white dark:bg-[#090a0c]">
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="pt-12 pb-2">
            <Text className="mx-5 text-[32px] font-light text-black dark:text-white">
              {translate('home.title')}
            </Text>
          </View>

          {isConnected
            ? (
                <DeviceInfoCards
                  batteryLevel={powerLevel}
                  storageRemaining={formatStorage(usedSpace, allSpace)}
                />
              )
            : (
                <ConnectionStatusCard onConnectPress={() => setModalVisible(true)} />
              )}

          <View className="mt-6">
            <ModeGrid />
          </View>
        </ScrollView>
      </View>

      <DeviceConnectionModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
      />
    </>
  );
}
