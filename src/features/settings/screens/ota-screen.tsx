import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import { useUniwind } from 'uniwind';
import { FocusAwareStatusBar, ScreenHeader, Text } from '@/components/ui';
import { useCameraStore } from '@/features/camera/camera-store';
import { translate } from '@/lib/i18n';
import {
  checkOtaPackage,
  getOtaInfo,
  startOtaUpdate,
  updateAppDeviceCode,
} from '../services/ota-service';

type OtaPhase = 'idle' | 'checking' | 'checking_success' | 'installing' | 'done' | 'error';

type OtaUpdateInfo = {
  version: string;
  file_name: string;
  release_notes?: string;
};

/* eslint-disable max-lines-per-function */
export default function OtaScreen() {
  const { theme } = useUniwind();
  const isDark = theme === 'dark';

  const serial = useCameraStore.use.serial();
  const version = useCameraStore.use.version();
  const connectionStatus = useCameraStore.use.connectionStatus();
  const isConnected = connectionStatus === 'open';

  const [phase, setPhase] = useState<OtaPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [updateInfo, setUpdateInfo] = useState<OtaUpdateInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const serialRef = useRef(serial);

  useEffect(() => {
    serialRef.current = serial;
  }, [serial]);

  const startCheck = useCallback(async () => {
    setPhase('checking');
    setErrorMsg('');

    if (isConnected) {
      setPhase('idle');
      Alert.alert(translate('ota.local_not_supported'), translate('ota.local_hint'));
      return;
    }

    const s = serialRef.current;
    if (!s?.SN || s.SN === 'not_connected') {
      Alert.alert(translate('ota.no_device_info'), translate('ota.connect_first'));
      setPhase('idle');
      return;
    }

    try {
      await updateAppDeviceCode(s.hardware, 'app-device-code-placeholder', s.SN);
      const res = await getOtaInfo(s.hardware);
      const data = res?.data?.data;

      if (!data) {
        Alert.alert(translate('ota.no_update'), translate('ota.already_latest'));
        setPhase('idle');
        return;
      }

      setUpdateInfo(data);
      setPhase('checking_success');
    }
    catch (err) {
      setErrorMsg(String(err));
      setPhase('error');
    }
  }, [isConnected]);

  const handleInstall = useCallback(async () => {
    if (!updateInfo?.file_name)
      return;

    setPhase('installing');
    setProgress(0);

    try {
      await checkOtaPackage(updateInfo.file_name);
      await startOtaUpdate(updateInfo.file_name);
      setPhase('done');
      Alert.alert(
        translate('ota.success'),
        translate('ota.success_message'),
        [{ text: 'OK', onPress: () => setPhase('idle') }],
      );
    }
    catch (err) {
      setErrorMsg(String(err));
      setPhase('error');
    }
  }, [updateInfo]);

  const cardBg = isDark ? 'rgba(228, 228, 228, 0.15)' : 'rgba(0, 0, 0, 0.06)';
  const borderColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
  const isLoading = phase === 'checking' || phase === 'installing';

  return (
    <>
      <FocusAwareStatusBar />
      <View className={`flex-1 ${isDark ? 'bg-black' : 'bg-white'}`}>
        <ScreenHeader title={translate('ota.title')} />

        <ScrollView className="flex-1 px-5 pt-4" contentContainerStyle={{ gap: 20 }}>
          <DeviceInfoCard
            serial={serial}
            version={version}
            isConnected={isConnected}
            cardBg={cardBg}
            borderColor={borderColor}
            isDark={isDark}
          />

          <UpdateStatusCard
            phase={phase}
            updateInfo={updateInfo}
            errorMsg={errorMsg}
          />

          <ProgressCard
            isLoading={isLoading}
            phase={phase}
            progress={progress}
            cardBg={cardBg}
          />

          {phase === 'idle' && (
            <Pressable
              onPress={startCheck}
              className="flex-row items-center justify-center rounded-2xl bg-orange-500 py-4"
            >
              <Text className="text-base font-semibold text-white">
                {translate('ota.check_new_version')}
              </Text>
            </Pressable>
          )}

          {phase === 'checking_success' && (
            <Pressable
              onPress={handleInstall}
              className="flex-row items-center justify-center rounded-2xl bg-orange-500 py-4"
            >
              <Text className="text-base font-semibold text-white">
                {translate('ota.start_update')}
              </Text>
            </Pressable>
          )}
        </ScrollView>
      </View>
    </>
  );
}

function DeviceInfoCard({
  serial,
  version,
  isConnected,
  cardBg,
  borderColor,
  isDark,
}: {
  serial: { SN?: string; hardware?: string } | null;
  version: { server?: string; hardware?: string } | null;
  isConnected: boolean;
  cardBg: string;
  borderColor: string;
  isDark: boolean;
}) {
  return (
    <>
      <View className="gap-3 rounded-2xl p-5" style={{ backgroundColor: cardBg }}>
        <InfoRow label={translate('ota.serial_number')} value={serial?.SN ?? '-'} isDark={isDark} />
        <InfoRow label={translate('ota.firmware_version')} value={version?.server ?? '-'} isDark={isDark} />
        <InfoRow label={translate('ota.hardware_version')} value={version?.hardware ?? '-'} isDark={isDark} />
      </View>

      <View className="rounded-2xl p-4" style={{ backgroundColor: cardBg, borderWidth: 1, borderColor }}>
        <Text className={`text-sm ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>
          {isConnected ? translate('ota.connected_mode') : translate('ota.offline_mode')}
        </Text>
      </View>
    </>
  );
}

function UpdateStatusCard({
  phase,
  updateInfo,
  errorMsg,
}: {
  phase: OtaPhase;
  updateInfo: OtaUpdateInfo | null;
  errorMsg: string;
}) {
  if (phase === 'checking_success' && updateInfo) {
    return (
      <View className="rounded-2xl bg-green-900/30 p-5">
        <Text className="text-base font-semibold text-green-400">
          {translate('ota.update_available')}
        </Text>
        <Text className="mt-2 text-sm text-green-300">
          {translate('ota.version_label')}
          {' '}
          {updateInfo.version}
        </Text>
        {updateInfo.release_notes && (
          <Text className="mt-1 text-sm text-green-300">{updateInfo.release_notes}</Text>
        )}
      </View>
    );
  }

  if (phase === 'error') {
    return (
      <View className="rounded-2xl bg-red-900/30 p-5">
        <Text className="text-sm text-red-400">{errorMsg || translate('ota.error')}</Text>
      </View>
    );
  }

  if (phase === 'done') {
    return (
      <View className="rounded-2xl bg-green-900/30 p-5">
        <Text className="text-sm text-green-400">{translate('ota.done')}</Text>
      </View>
    );
  }

  return null;
}

function ProgressCard({
  isLoading,
  phase,
  progress,
  cardBg,
}: {
  isLoading: boolean;
  phase: OtaPhase;
  progress: number;
  cardBg: string;
}) {
  if (!isLoading)
    return null;

  return (
    <View className="rounded-2xl p-5" style={{ backgroundColor: cardBg }}>
      <Text className="mb-2 text-sm text-neutral-400">
        {phase === 'checking' ? translate('ota.checking') : translate('ota.installing')}
        ...
      </Text>
      <View className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-700">
        <View
          className="h-full rounded-full bg-orange-500"
          style={{ width: `${progress}%` }}
        />
      </View>
    </View>
  );
}

function InfoRow({ label, value, isDark }: { label: string; value: string; isDark: boolean }) {
  return (
    <View className="flex-row items-center justify-between py-2">
      <Text className={`text-sm ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>{label}</Text>
      <Text className={`text-sm font-medium ${isDark ? 'text-white' : 'text-black'}`}>{value}</Text>
    </View>
  );
}
