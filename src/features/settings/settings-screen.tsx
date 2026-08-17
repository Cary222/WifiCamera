import type { TxKeyPath } from '@/lib/i18n';
import Env from 'env';
import { useRouter } from 'expo-router';

import { FocusAwareStatusBar, ScrollView, Text, View } from '@/components/ui';
import { ArrowRight, Battery, Wifi } from '@/components/ui/icons';
import { useCameraStore } from '@/features/home/camera/camera-store';
import { translate } from '@/lib/i18n';
import { LanguageItem } from './components/language-item';
import { SettingsContainer } from './components/settings-container';
import { SettingsItem } from './components/settings-item';
import { ThemeItem } from './components/theme-item';

function SettingHeading({ tx }: { tx: TxKeyPath }) {
  return <Text tx={tx} className="mb-3 px-1 text-[20px] font-bold text-black dark:text-white" />;
}

function WifiBandSelector() {
  return (
    <View className="mx-4 mb-5 flex-row items-center justify-between rounded-[15px] border border-neutral-200 bg-white px-5 py-4 dark:border-[#48484880] dark:bg-[#111113]">
      <View>
        <Text tx="settings.wifi_band" className="text-[18px] text-black dark:text-white" />
        <Text tx="settings.wifi_band_hint" className="mt-2 text-[12px] text-neutral-500 dark:text-charcoal-400" />
      </View>
      <View className="h-[41px] w-[143px] flex-row rounded-[7px] border border-neutral-200 p-[3px] dark:border-[#2D2D2E]">
        <View className="flex-1 items-center justify-center">
          <Text className="text-[12px] text-neutral-500 dark:text-white">2.4GHz</Text>
        </View>
        <View className="flex-1 items-center justify-center rounded-[4px] bg-[#C8E733]">
          <Text className="text-[12px] text-[#2B2B2B]">5GHz</Text>
        </View>
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const serial = useCameraStore.use.serial();
  const version = useCameraStore.use.version();
  const connectionStatus = useCameraStore.use.connectionStatus();
  const powerLevel = useCameraStore.use.powerLevel();
  const isConnected = connectionStatus === 'open';
  const batteryText = !isConnected
    ? translate('settings.camera_disconnected')
    : powerLevel === null ? '—' : `${powerLevel}%`;

  return (
    <>
      <FocusAwareStatusBar />
      <View className="flex-1 bg-white dark:bg-[#090A0C]">
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
          <View className="px-5 pt-14">
            <Text tx="settings.title" className="text-[32px] font-light text-black dark:text-white" />
            <View className="mt-8 rounded-[25px] border border-neutral-200 bg-white p-5 dark:border-white dark:bg-[#101011]">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <Wifi color="#C8E733" size={22} />
                  <Text tx="home.wifi_camera" className="ml-3 text-[19px] text-black dark:text-white" />
                </View>
                <View className="flex-row items-center">
                  <Battery
                    percent={isConnected && powerLevel !== null ? powerLevel : 0}
                    color={isConnected ? '#C8E733' : '#A3A3A3'}
                    size={30}
                  />
                  <Text className="ml-2 text-[20px] text-black dark:text-white">{batteryText}</Text>
                </View>
              </View>
              <View className="mt-3 flex-row items-center">
                <View className={`mr-2 size-2 rounded-full ${isConnected ? 'bg-[#C8E733]' : 'bg-neutral-400 dark:bg-charcoal-500'}`} />
                <Text tx={isConnected ? 'device.connected' : 'settings.camera_disconnected'} className="text-[12px] text-neutral-600 dark:text-white" />
              </View>
            </View>
          </View>

          <View className="mt-8">
            <SettingHeading tx="settings.wifi" />
            <WifiBandSelector />
          </View>

          <View className="px-5">
            <SettingHeading tx="settings.firmware" />
            <SettingsContainer>
              <SettingsItem text="settings.camera_version" value={version?.server ?? '-'} onPress={() => router.push('/ota')} />
              <SettingsItem text="settings.version" value={Env.EXPO_PUBLIC_VERSION} onPress={() => router.push('/ota')} />
            </SettingsContainer>

            <SettingHeading tx="settings.more" />
            <SettingsContainer>
              <SettingsItem text="settings.privacy" onPress={() => {}} />
              <SettingsItem text="settings.reset_camera" onPress={() => {}} />
            </SettingsContainer>

            <SettingHeading tx="settings.generale" />
            <SettingsContainer>
              <LanguageItem />
              <ThemeItem />
              <SettingsItem text="settings.change_wifi_password" onPress={() => router.push('/wifi-password')} />
            </SettingsContainer>

            {!isConnected && (
              <SettingsContainer>
                <SettingsItem text="settings.connect_camera" icon={<ArrowRight color="#C8E733" />} onPress={() => router.push('/')} />
              </SettingsContainer>
            )}
            <Text className="mt-1 text-center text-[11px] text-neutral-400 dark:text-charcoal-500">{serial?.SN ?? ''}</Text>
          </View>
        </ScrollView>
      </View>
    </>
  );
}
