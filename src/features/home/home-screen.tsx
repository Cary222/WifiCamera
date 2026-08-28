import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { FocusAwareStatusBar, Text } from '@/components/ui';
import { useCameraStore } from '@/features/home/camera/camera-store';
import { getPower } from '@/features/home/camera/services/file-service';
import { translate } from '@/lib/i18n';
import { ConnectionStatusCard } from './components/connection-status-card';
import { DeviceConnectionModal } from './components/device-connection-modal';
import { DeviceInfoCards } from './components/device-info-cards';
import { ModeGrid } from './components/mode-grid';
import { useStorageInfo } from './hooks/use-storage-info';

export function HomeScreen() {
  const [modalVisible, setModalVisible] = useState(false);
  const connectionStatus = useCameraStore.use.connectionStatus();
  const powerLevel = useCameraStore.use.powerLevel();
  const inCharge = useCameraStore.use.inCharge();
  const setPower = useCameraStore.use.setPower();
  const showConnectionModal = useCameraStore.use.showConnectionModal();
  const setShowConnectionModal = useCameraStore.use.setShowConnectionModal();

  const isConnected = connectionStatus === 'open';
  const storageInfo = useStorageInfo(isConnected);

  const isConnectionModalVisible = modalVisible || showConnectionModal;

  const handleConnectionModalClose = () => {
    setModalVisible(false);
    if (showConnectionModal)
      setShowConnectionModal(false);
  };

  useEffect(() => {
    if (!isConnected)
      return;

    let active = true;
    void getPower()
      .then(({ power, in_charging }) => {
        if (active)
          setPower(power, in_charging);
      })
      .catch(() => {
      });

    return () => {
      active = false;
    };
  }, [isConnected, setPower]);

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
                  inCharge={inCharge}
                  storageRemaining={storageInfo.remainingLabel}
                  isConnected={isConnected}
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
        visible={isConnectionModalVisible}
        onClose={handleConnectionModalClose}
      />
    </>
  );
}
