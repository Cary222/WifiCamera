import type { OtaUpdateInfo } from '../services/ota-service';
import { useMutation, useQuery } from '@tanstack/react-query';
import Env from 'env';
import * as Updates from 'expo-updates';
import { useState } from 'react';

import { Alert, View } from 'react-native';
import { Text } from '@/components/ui';
import { useCameraStore } from '@/features/home/camera/camera-store';
import { translate } from '@/lib/i18n';
import { getFirmwareUpdate } from '../services/ota-service';
import { OtaUpdateDialog } from './ota-update-dialog';
import { SettingsContainer } from './settings-container';
import { SettingsItem } from './settings-item';

export function SettingsUpdates() {
  const serial = useCameraStore.use.serial();
  const version = useCameraStore.use.version();
  return (
    <SettingsContainer>
      <FirmwareUpdateRow
        key={`${serial?.SN}:${serial?.hardware}:${version?.server}`}
        device={serial}
        version={version?.server}
      />
      <View className="mx-2 h-px bg-neutral-200 dark:bg-[#353535]" />
      <AppUpdateRow />
    </SettingsContainer>
  );
}

function VersionSubtitle({
  current,
  next,
}: {
  current?: string;
  next?: string;
}) {
  const cleanCurrent = current
    ? current.replace(/^(?:WifiCamera\.)?v?/i, '')
    : '—';
  if (!next) {
    return (
      <Text className="mt-1 text-[12px] text-neutral-500 dark:text-[#858585]">{`V ${cleanCurrent}`}</Text>
    );
  }
  const cleanNext = next.replace(/^(?:WifiCamera\.)?v?/i, '');
  return (
    <View className="mt-1 flex-row items-center gap-1.5">
      <Text className="text-[12px] text-neutral-500 dark:text-[#858585]">{`V ${cleanCurrent}`}</Text>
      <Text className="text-[12px] text-[#758600] dark:text-[#C8E733]">→</Text>
      <Text className="text-[12px] text-[#758600] dark:text-[#C8E733]">{`V ${cleanNext}`}</Text>
    </View>
  );
}

function FirmwareUpdateRow({
  device,
  version,
}: {
  device: { hardware: string; SN: string } | null;
  version?: string;
}) {
  const [showDialog, setShowDialog] = useState(false);
  const [targetUpdate, setTargetUpdate] = useState<OtaUpdateInfo | null>(null);
  const canCheck = Boolean(
    device?.hardware && device.SN && device.SN !== 'not_connected' && version,
  );
  const query = useQuery({
    queryKey: ['firmware-update', device?.SN, device?.hardware, version],
    queryFn: () => getFirmwareUpdate(device!.hardware, version!),
    enabled: canCheck,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const check = async () => {
    if (!canCheck) {
      Alert.alert(
        translate('ota.no_device_info'),
        translate('ota.connect_first'),
      );
      return;
    }
    const update = query.data ?? (await query.refetch().catch(() => null))?.data ?? null;
    setTargetUpdate(update);
    setShowDialog(true);
  };
  const label = query.isFetching
    ? 'ota.checking'
    : query.data
      ? 'ota.update_now'
      : 'ota.check_new_version';

  return (
    <>
      <SettingsItem
        text="settings.firmware"
        subtitle={
          <VersionSubtitle current={version} next={query.data?.version} />
        }
        value={translate(label)}
        disabled={query.isFetching}
        onPress={check}
      />
      <OtaUpdateDialog
        visible={showDialog}
        updateInfo={targetUpdate ?? query.data ?? null}
        device={device}
        onClose={() => setShowDialog(false)}
        onUpdated={() => query.refetch()}
      />
    </>
  );
}

function AppUpdateRow() {
  const query = useQuery({
    queryKey: ['app-update'],
    queryFn: () => Updates.checkForUpdateAsync(),
    enabled: Updates.isEnabled && !__DEV__,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const download = useMutation({
    mutationFn: () => Updates.fetchUpdateAsync(),
    onSuccess: (result) => {
      if (!result.isNew) {
        Alert.alert(
          translate('settings.app_version'),
          translate('ota.app_latest'),
        );
        return;
      }
      Alert.alert(
        translate('settings.app_version'),
        translate('ota.restart_app'),
        [
          { text: translate('ota.cancel'), style: 'cancel' },
          {
            text: translate('ota.start_update'),
            onPress: () => {
              void Updates.reloadAsync().catch(showAppError);
            },
          },
        ],
      );
    },
    onError: showAppError,
  });
  const check = async () => {
    if (!Updates.isEnabled || __DEV__) {
      Alert.alert(
        translate('settings.app_version'),
        translate('ota.app_unavailable'),
      );
      return;
    }
    let result = query.data;
    if (!result?.isAvailable) {
      const checked = await query.refetch();
      if (checked.isError) {
        showAppError();
        return;
      }
      result = checked.data;
    }
    if (!result)
      return;
    if (result.isAvailable) {
      promptAppDownload(download.mutate);
    }
    else {
      Alert.alert(
        translate('settings.app_version'),
        translate('ota.app_latest'),
      );
    }
  };
  const label = download.isPending
    ? 'download.title'
    : query.isFetching
      ? 'ota.checking'
      : query.data?.isAvailable
        ? 'ota.update_now'
        : 'ota.check_new_version';

  const manifestVersion = (query.data as any)?.manifest?.version;

  return (
    <SettingsItem
      text="settings.app_version"
      subtitle={(
        <VersionSubtitle
          current={String(Env.EXPO_PUBLIC_VERSION)}
          next={query.data?.isAvailable ? manifestVersion : undefined}
        />
      )}
      value={translate(label)}
      onPress={check}
      disabled={query.isFetching || download.isPending}
    />
  );
}

function showAppError() {
  Alert.alert(translate('settings.app_version'), translate('ota.error'));
}

function promptAppDownload(onDownload: () => void) {
  Alert.alert(
    translate('settings.app_version'),
    translate('ota.update_available'),
    [
      { text: translate('ota.cancel'), style: 'cancel' },
      { text: translate('ota.download_now'), onPress: onDownload },
    ],
  );
}
