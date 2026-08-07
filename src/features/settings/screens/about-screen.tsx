import Env from 'env';

import { View } from 'react-native';
import { useUniwind } from 'uniwind';
import { FocusAwareStatusBar, ScreenHeader, Text } from '@/components/ui';
import { useCameraStore } from '@/features/home/camera/camera-store';
import { translate } from '@/lib/i18n';

export default function AboutScreen() {
  const { theme } = useUniwind();
  const isDark = theme === 'dark';

  const serial = useCameraStore.use.serial();
  const version = useCameraStore.use.version();
  const connectionStatus = useCameraStore.use.connectionStatus();
  const isConnected = connectionStatus === 'open';

  const cardBg = isDark ? 'rgba(228, 228, 228, 0.15)' : 'rgba(0, 0, 0, 0.06)';

  return (
    <>
      <FocusAwareStatusBar />
      <View className={`flex-1 ${isDark ? 'bg-black' : 'bg-white'}`}>
        <ScreenHeader title={translate('about.title')} />

        <View className="flex-1 gap-6 px-5 pt-6">
          {/* App info */}
          <View className="gap-4 rounded-2xl p-5" style={{ backgroundColor: cardBg }}>
            <InfoRow
              label={translate('about.app_name')}
              value={Env.EXPO_PUBLIC_NAME}
              isDark={isDark}
            />
            <InfoRow
              label={translate('about.app_version')}
              value={Env.EXPO_PUBLIC_VERSION}
              isDark={isDark}
            />
          </View>

          {/* Camera info (only if connected) */}
          {isConnected && (
            <View className="gap-4 rounded-2xl p-5" style={{ backgroundColor: cardBg }}>
              <Text className={`mb-2 text-sm font-medium ${isDark ? 'text-white' : 'text-black'}`}>
                {translate('about.camera_info')}
              </Text>
              <InfoRow
                label={translate('about.serial_number')}
                value={serial?.SN ?? '-'}
                isDark={isDark}
              />
              <InfoRow
                label={translate('about.hardware')}
                value={serial?.hardware ?? '-'}
                isDark={isDark}
              />
              <InfoRow
                label={translate('about.firmware_version')}
                value={version?.server ?? '-'}
                isDark={isDark}
              />
            </View>
          )}

          {!isConnected && (
            <View className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
              <Text className="text-sm text-amber-700 dark:text-amber-400">
                {translate('about.connect_for_info')}
              </Text>
            </View>
          )}
        </View>
      </View>
    </>
  );
}

function InfoRow({ label, value, isDark }: { label: string; value: string; isDark: boolean }) {
  return (
    <View className="flex-row items-center justify-between py-1.5">
      <Text className={`text-sm ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>{label}</Text>
      <Text className={`text-sm font-medium ${isDark ? 'text-white' : 'text-black'}`}>{value}</Text>
    </View>
  );
}
