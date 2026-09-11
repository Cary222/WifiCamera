import type { TxKeyPath } from '@/lib/i18n';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FocusAwareStatusBar, ScrollView, Text, View } from '@/components/ui';

import { useCameraStore } from '@/features/home/camera/camera-store';

import { LanguageItem } from './components/language-item';
import { SettingsContainer } from './components/settings-container';
import { SettingsItem } from './components/settings-item';
import { SettingsUpdates } from './components/settings-updates';
import { ThemeItem } from './components/theme-item';

function SettingHeading({ tx }: { tx: TxKeyPath }) {
  return <Text tx={tx} className="mb-3 px-2 text-[20px] font-bold text-black dark:text-white" />;
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const connectionStatus = useCameraStore.use.connectionStatus();
  const powerLevel = useCameraStore.use.powerLevel();
  const setShowConnectionModal = useCameraStore.use.setShowConnectionModal();
  const isConnected = connectionStatus === 'open';
  const batteryText = powerLevel === null || !isConnected ? '—' : `${Math.round(powerLevel)}%`;

  return (
    <>
      <FocusAwareStatusBar />
      <View className="flex-1 bg-white dark:bg-[#090A0C]">
        <ScrollView
          contentContainerStyle={{ paddingTop: Math.max(insets.top, 32), paddingHorizontal: 16, paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}
        >
          <Text tx="settings.title" className="px-1 text-[32px] font-light text-black dark:text-white" />
          <View className="mt-5 mb-6 min-h-[120px] flex-row items-center justify-between rounded-[25px] border border-neutral-200 bg-white px-7 dark:border-[#48484880] dark:bg-[#101011]">
            <View className="flex-1 items-center">
              <Text tx="home.wifi_camera" className="text-[19px] text-black dark:text-white" />
              <View className="mt-3 flex-row items-center">
                <View className={`mr-2 size-2 rounded-full ${isConnected ? 'bg-[#C8E733]' : 'bg-neutral-500 dark:bg-white'}`} />
                <Text tx={isConnected ? 'home.device_connected' : 'settings.camera_disconnected'} className="text-[12px] text-black dark:text-white" />
              </View>
            </View>
            <View className="ml-4 flex-row items-center">
              <Image source={require('@/assets/common/Power.png')} style={{ width: 26, height: 26 }} contentFit="contain" tintColor="#C8E733" />
              <Text className="ml-3 text-[23px] font-light text-black dark:text-white">{batteryText}</Text>
            </View>
          </View>

          <SettingHeading tx="home.shooting_modes" />
          <SettingsContainer>
            <SettingsItem text="settings.connection_settings" onPress={() => setShowConnectionModal(true)} />
          </SettingsContainer>

          <SettingHeading tx="ota.check_new_version" />
          <SettingsUpdates />

          <SettingHeading tx="settings.device_info" />
          <SettingsContainer>
            <SettingsItem text="settings.privacy_statement" onPress={() => {}} />
            <View className="mx-2 h-px bg-neutral-200 dark:bg-[#353535]" />
            <SettingsItem text="settings.reset_camera" onPress={() => {}} />
          </SettingsContainer>

          <SettingHeading tx="settings.generale" />
          <SettingsContainer>
            <LanguageItem />
            <View className="mx-2 h-px bg-neutral-200 dark:bg-[#353535]" />
            <ThemeItem />
          </SettingsContainer>
        </ScrollView>
      </View>
    </>
  );
}
