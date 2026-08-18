import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { FocusAwareStatusBar, Text } from '@/components/ui';
import { useCameraStore } from '@/features/home/camera/camera-store';
import { getDiskUsage, getPower } from '@/features/home/camera/services/file-service';
import { translate } from '@/lib/i18n';
import { ConnectionStatusCard } from './components/connection-status-card';
import { DeviceConnectionModal } from './components/device-connection-modal';
import { DeviceInfoCards } from './components/device-info-cards';
import { ModeGrid } from './components/mode-grid';

export function HomeScreen() {
  const [modalVisible, setModalVisible] = useState(false);
  const [storageRemaining, setStorageRemaining] = useState<string>('—');
  const connectionStatus = useCameraStore.use.connectionStatus();
  const powerLevel = useCameraStore.use.powerLevel();
  const inCharge = useCameraStore.use.inCharge();
  const setPower = useCameraStore.use.setPower();
  const showConnectionModal = useCameraStore.use.showConnectionModal();
  const setShowConnectionModal = useCameraStore.use.setShowConnectionModal();

  const isConnected = connectionStatus === 'open';

  // Show connection modal when triggered by Wi-Fi switch (using ref to avoid setState in effect)
  const showModalRef = useRef(false);
  if (showConnectionModal && !showModalRef.current) {
    showModalRef.current = true;
    setModalVisible(true);
    setShowConnectionModal(false);
  }
  if (!showConnectionModal) {
    showModalRef.current = false;
  }

  useEffect(() => {
    let active = true;
    if (!isConnected) {
      return () => {
        active = false;
      };
    }

    void getDiskUsage()
      .then(({ used, total, free }) => {
        if (!active)
          return;
        const remaining = free ?? Math.max(0, total - used);
        setStorageRemaining(`${remaining.toFixed(1)}GB`);
      })
      .catch(() => {
        if (active)
          setStorageRemaining('—');
      });

    void getPower()
      .then(({ power, in_charging }) => {
        if (active)
          setPower(power, in_charging);
      })
      .catch(() => {
        // Board without a battery gauge — the store keeps powerLevel as null.
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
                  storageRemaining={storageRemaining}
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
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
      />
    </>
  );
}
