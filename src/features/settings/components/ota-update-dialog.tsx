/* eslint-disable max-lines-per-function, react-hooks/set-state-in-effect, react-hooks-extra/no-direct-set-state-in-use-effect */
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import type { OtaUpdateInfo } from '../services/ota-service';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUniwind } from 'uniwind';

import { Text, useModal } from '@/components/ui';
import { translate } from '@/lib/i18n';
import {
  downloadFirmwarePackage,
  formatFirmwareVersion,
  installFirmwarePackage,
} from '../services/ota-service';

export type OtaDialogPhase
  = | 'available'
    | 'already_latest'
    | 'downloading'
    | 'download_complete'
    | 'updating'
    | 'update_complete';

type Props = {
  visible: boolean;
  onClose: () => void;
  updateInfo: OtaUpdateInfo | null;
  device: { hardware: string; SN: string } | null;
  initialPhase?: OtaDialogPhase;
  onUpdated?: () => void;
};

export function OtaUpdateDialog({
  visible,
  onClose,
  updateInfo,
  device,
  initialPhase,
  onUpdated,
}: Props) {
  const { ref, present, dismiss } = useModal();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { theme } = useUniwind();
  const isDark = theme === 'dark';

  const [phase, setPhase] = useState<OtaDialogPhase>(() => {
    if (initialPhase)
      return initialPhase;
    return updateInfo ? 'available' : 'already_latest';
  });

  const [downloadProgress, setDownloadProgress] = useState(0);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [downloadedUri, setDownloadedUri] = useState<string | null>(null);
  const isCancelledRef = useRef(false);
  const prevVisibleRef = useRef(false);

  useEffect(() => {
    if (visible && !prevVisibleRef.current) {
      setPhase(initialPhase ?? (updateInfo ? 'available' : 'already_latest'));
      present();
    }
    else if (!visible && prevVisibleRef.current) {
      dismiss();
    }
    prevVisibleRef.current = visible;
  }, [visible, present, dismiss, updateInfo, initialPhase]);

  const handleClose = useCallback(() => {
    dismiss();
    onClose();
  }, [dismiss, onClose]);

  const startDownload = async () => {
    if (!updateInfo || !device)
      return;
    setPhase('downloading');
    setDownloadProgress(0);
    isCancelledRef.current = false;

    try {
      const uri = await downloadFirmwarePackage(
        updateInfo,
        device,
        (written, total) => {
          if (isCancelledRef.current)
            return;
          if (total > 0) {
            setDownloadProgress(
              Math.min(100, Math.round((written / total) * 100)),
            );
          }
        },
      );
      if (isCancelledRef.current)
        return;
      setDownloadedUri(uri);
      setPhase('download_complete');
    }
    catch (err) {
      if (isCancelledRef.current)
        return;
      Alert.alert(translate('ota.error'), String(err), [
        {
          text: translate('ota.cancel'),
          onPress: handleClose,
          style: 'cancel',
        },
        { text: translate('ota.retry'), onPress: startDownload },
      ]);
      setPhase('available');
    }
  };

  const startInstall = async () => {
    if (!downloadedUri || !updateInfo)
      return;
    setPhase('updating');
    setUpdateProgress(10);

    try {
      await installFirmwarePackage(downloadedUri, updateInfo.file_name, p =>
        setUpdateProgress(p));
      setPhase('update_complete');
    }
    catch (err) {
      Alert.alert(translate('ota.error'), String(err), [
        {
          text: translate('ota.cancel'),
          onPress: handleClose,
          style: 'cancel',
        },
        { text: translate('ota.retry'), onPress: startInstall },
      ]);
      setPhase('download_complete');
    }
  };

  const isNonDismissable = phase === 'downloading' || phase === 'updating';

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior={isNonDismissable ? 'none' : 'close'}
      />
    ),
    [isNonDismissable],
  );

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={[Math.min(height - insets.top, 300 + insets.bottom)]}
      enableDynamicSizing={false}
      enablePanDownToClose={!isNonDismissable}
      enableContentPanningGesture={false}
      onDismiss={onClose}
      backdropComponent={renderBackdrop}
      backgroundStyle={{
        backgroundColor: isDark ? '#101011' : '#FFFFFF',
        borderRadius: 25,
        borderWidth: 1,
        borderColor: isDark ? '#484848' : '#E5E5E5',
      }}
      handleIndicatorStyle={{
        width: 50,
        height: 4,
        backgroundColor: '#858585',
      }}
    >
      <BottomSheetView style={{ paddingHorizontal: 24, paddingBottom: Math.max(insets.bottom, 24) }}>
        <Text
          tx="ota.title"
          className="mt-2 mb-6 text-center text-[20px] font-bold text-black dark:text-white"
        />

        {phase === 'available' && updateInfo && (
          <AvailablePhase
            version={formatFirmwareVersion(updateInfo.version)}
            onCancel={handleClose}
            onDownload={startDownload}
          />
        )}
        {phase === 'already_latest' && (
          <AlreadyLatestPhase onConfirm={handleClose} />
        )}
        {phase === 'downloading' && (
          <DownloadingPhase
            progress={downloadProgress}
            onCancel={() => {
              isCancelledRef.current = true;
              handleClose();
            }}
          />
        )}
        {phase === 'download_complete' && (
          <DownloadCompletePhase
            onCancel={handleClose}
            onUpdate={startInstall}
          />
        )}
        {phase === 'updating' && <UpdatingPhase progress={updateProgress} />}
        {phase === 'update_complete' && (
          <UpdateCompletePhase
            onConfirm={() => {
              onUpdated?.();
              handleClose();
            }}
          />
        )}
      </BottomSheetView>
    </BottomSheetModal>
  );
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <View className="mt-6 h-[8px] w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-[#2A2A2D]">
      <View
        style={{ width: `${Math.max(5, Math.min(100, progress))}%` }}
        className="h-full rounded-full bg-[#C8E733]"
      />
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        marginTop: 32,
        height: 48,
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 12,
        backgroundColor: '#C8E733',
      }}
    >
      <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#1A2000' }}>{label}</Text>
    </Pressable>
  );
}

function ActionButtons({
  cancelText = translate('ota.cancel'),
  confirmText,
  onCancel,
  onConfirm,
}: {
  cancelText?: string;
  confirmText: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <View style={{ marginTop: 32, width: '100%', flexDirection: 'row', gap: 16 }}>
      <Pressable
        accessibilityRole="button"
        onPress={onCancel}
        style={{
          height: 48,
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 12,
          borderWidth: 1,
          borderColor: '#333333',
          backgroundColor: '#1A1A1C',
        }}
      >
        <Text style={{ fontSize: 15, fontWeight: '500', color: '#FFFFFF' }}>
          {cancelText}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={onConfirm}
        style={{
          height: 48,
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 12,
          backgroundColor: '#C8E733',
        }}
      >
        <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#1A2000' }}>
          {confirmText}
        </Text>
      </Pressable>
    </View>
  );
}

function AvailablePhase({
  version,
  onCancel,
  onDownload,
}: {
  version: string;
  onCancel: () => void;
  onDownload: () => void;
}) {
  return (
    <View className="items-center">
      <Text className="text-center text-[15px]/6 font-medium text-black dark:text-white">
        {translate('ota.download_prompt', { version })}
      </Text>
      <Text
        tx="ota.download_hint"
        className="mt-2 text-center text-[12px] text-neutral-500 dark:text-[#858585]"
      />
      <ActionButtons
        confirmText={translate('ota.download_now')}
        onCancel={onCancel}
        onConfirm={onDownload}
      />
    </View>
  );
}

function AlreadyLatestPhase({ onConfirm }: { onConfirm: () => void }) {
  return (
    <View className="items-center">
      <Text
        tx="ota.device_is_latest"
        className="text-center text-[15px]/6 font-medium text-black dark:text-white"
      />
      <PrimaryButton label={translate('ota.confirm')} onPress={onConfirm} />
    </View>
  );
}

function DownloadingPhase({
  progress,
  onCancel,
}: {
  progress: number;
  onCancel: () => void;
}) {
  return (
    <View className="items-center">
      <Text
        tx="ota.downloading_hint"
        className="text-center text-[15px]/6 font-medium text-black dark:text-white"
      />
      <ProgressBar progress={progress} />
      <Pressable
        accessibilityRole="button"
        onPress={onCancel}
        style={{
          marginTop: 32,
          height: 48,
          width: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 12,
          borderWidth: 1,
          borderColor: '#333333',
          backgroundColor: '#1A1A1C',
        }}
      >
        <Text style={{ fontSize: 15, fontWeight: '500', color: '#FFFFFF' }}>
          {translate('ota.cancel_download')}
        </Text>
      </Pressable>
    </View>
  );
}

function DownloadCompletePhase({
  onCancel,
  onUpdate,
}: {
  onCancel: () => void;
  onUpdate: () => void;
}) {
  return (
    <View className="items-center">
      <Text
        tx="ota.download_complete_prompt"
        className="text-center text-[15px]/6 font-medium text-black dark:text-white"
      />
      <Text
        tx="ota.updating_warning"
        className="mt-2 text-center text-[12px] text-neutral-500 dark:text-[#858585]"
      />
      <ActionButtons
        confirmText={translate('ota.update_now')}
        onCancel={onCancel}
        onConfirm={onUpdate}
      />
    </View>
  );
}

function UpdatingPhase({ progress }: { progress: number }) {
  return (
    <View className="items-center">
      <Text
        tx="ota.updating_hint"
        className="text-center text-[15px]/6 font-medium text-black dark:text-white"
      />
      <ProgressBar progress={progress} />
      <View className="mt-8 h-[48px]" />
    </View>
  );
}

function UpdateCompletePhase({ onConfirm }: { onConfirm: () => void }) {
  return (
    <View className="items-center">
      <Text
        tx="ota.updated_to_latest"
        className="text-center text-[15px]/6 font-medium text-black dark:text-white"
      />
      <PrimaryButton label={translate('ota.confirm')} onPress={onConfirm} />
    </View>
  );
}
