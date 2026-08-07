import Env from 'env';
import { useRouter } from 'expo-router';
import { useUniwind } from 'uniwind';

import {
  colors,
  FocusAwareStatusBar,
  ScreenHeader,
  ScrollView,
  View,
} from '@/components/ui';
import {
  Github,
  Rate,
  Share,
  Support,
  Website,
} from '@/components/ui/icons';
import { useCameraStore } from '@/features/camera/camera-store';
import { translate } from '@/lib/i18n';
import { LanguageItem } from './components/language-item';
import { SettingsContainer } from './components/settings-container';
import { SettingsItem } from './components/settings-item';
import { ThemeItem } from './components/theme-item';

export default function SettingsScreen() {
  const router = useRouter();
  const { theme } = useUniwind();
  const isDark = theme === 'dark';
  const iconColor = isDark ? colors.neutral[400] : colors.neutral[500];

  const serial = useCameraStore.use.serial();
  const version = useCameraStore.use.version();
  const connectionStatus = useCameraStore.use.connectionStatus();

  const isConnected = connectionStatus === 'open';

  return (
    <>
      <FocusAwareStatusBar />
      <View className={`flex-1 ${isDark ? 'bg-black' : 'bg-white'}`}>
        <ScreenHeader title={translate('settings.title')} />
        <ScrollView>
          <View className="flex-1 px-5">
            {isConnected && (
              <SettingsContainer title="settings.camera_info">
                <SettingsItem
                  text="settings.camera_serial"
                  value={serial?.SN ?? '-'}
                />
                <SettingsItem
                  text="settings.camera_version"
                  value={version?.server ?? '-'}
                />
              </SettingsContainer>
            )}

            {!isConnected && (
              <SettingsContainer>
                <SettingsItem
                  text="settings.connect_camera"
                  onPress={() => router.push('/')}
                />
              </SettingsContainer>
            )}

            <SettingsContainer>
              <SettingsItem
                text="settings.change_wifi_password"
                onPress={() => router.push('/settings/wifi-password')}
              />
              <SettingsItem
                text="settings.ota"
                onPress={() => router.push('/settings/ota')}
              />
            </SettingsContainer>

            <SettingsContainer title="settings.generale">
              <LanguageItem />
              <ThemeItem />
            </SettingsContainer>

            <SettingsContainer title="settings.about">
              <SettingsItem
                text="settings.app_name"
                value={Env.EXPO_PUBLIC_NAME}
              />
              <SettingsItem
                text="settings.version"
                value={Env.EXPO_PUBLIC_VERSION}
              />
            </SettingsContainer>

            <SettingsContainer title="settings.support_us">
              <SettingsItem
                text="settings.share"
                icon={<Share color={iconColor} />}
                onPress={() => {}}
              />
              <SettingsItem
                text="settings.rate"
                icon={<Rate color={iconColor} />}
                onPress={() => {}}
              />
              <SettingsItem
                text="settings.support"
                icon={<Support color={iconColor} />}
                onPress={() => {}}
              />
            </SettingsContainer>

            <SettingsContainer title="settings.links">
              <SettingsItem text="settings.privacy" onPress={() => {}} />
              <SettingsItem text="settings.terms" onPress={() => {}} />
              <SettingsItem
                text="settings.github"
                icon={<Github color={iconColor} />}
                onPress={() => {}}
              />
              <SettingsItem
                text="settings.website"
                icon={<Website color={iconColor} />}
                onPress={() => {}}
              />
            </SettingsContainer>
          </View>
        </ScrollView>
      </View>
    </>
  );
}
