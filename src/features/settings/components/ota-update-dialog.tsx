import * as React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Modal, useModal } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/progress-bar';
import { translate } from '@/lib/i18n';
import { uploadOtaTar } from '../services/ota-service';

export type OtaUpdateInfo = {
  version: string;
  file_name: string;
  release_notes?: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  updateInfo: OtaUpdateInfo | null;
};

type Phase = 'prompt' | 'uploading' | 'done' | 'error';

function formatBytes(bytes: number): string {
  if (bytes === 0)
    return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

function PromptContent({
  updateInfo,
  onIgnore,
  onInstall,
}: {
  updateInfo: OtaUpdateInfo | null;
  onIgnore: () => void;
  onInstall: () => void;
}) {
  return (
    <>
      <View className="mb-6 px-2">
        <View className="mb-3 flex-row items-center justify-between">
          <View>
            <View className="mb-1">
              <Text className="text-xs text-neutral-400 dark:text-neutral-500">
                {translate('ota.version_label')}
              </Text>
              <Text className="text-base font-bold text-neutral-900 dark:text-white">
                {updateInfo?.version ?? '-'}
              </Text>
            </View>
          </View>
        </View>

        <View className="mb-3 rounded-lg bg-neutral-100 px-3 py-2 dark:bg-neutral-800">
          <Text className="mb-1 text-xs text-neutral-400 dark:text-neutral-500">
            {translate('ota.file_name')}
          </Text>
          <Text className="text-sm text-neutral-700 dark:text-neutral-200">
            {updateInfo?.file_name ?? '-'}
          </Text>
        </View>

        {updateInfo?.release_notes
          ? (
              <View className="rounded-lg bg-neutral-100 px-3 py-2 dark:bg-neutral-800">
                <Text className="mb-1 text-xs text-neutral-400 dark:text-neutral-500">
                  {translate('ota.release_notes')}
                </Text>
                <Text className="text-sm text-neutral-700 dark:text-neutral-200">
                  {updateInfo.release_notes}
                </Text>
              </View>
            )
          : null}
      </View>

      <View className="flex-row gap-3 px-2">
        <View className="flex-1">
          <Button variant="outline" label={translate('ota.skip')} onPress={onIgnore} />
        </View>
        <View className="flex-1">
          <Button variant="default" label={translate('ota.start_update')} onPress={onInstall} />
        </View>
      </View>
    </>
  );
}

function UploadingContent({
  progress,
  bytesWritten,
  totalBytes,
  fileName,
  progressRef,
}: {
  progress: number;
  bytesWritten: number;
  totalBytes: number;
  fileName: string | undefined;
  progressRef: React.RefObject<{ setProgress: (v: number) => void } | null>;
}) {
  return (
    <View className="mb-6 items-center px-2">
      <ActivityIndicator size="large" className="mb-4" />
      <Text className="mb-2 text-base font-semibold text-neutral-900 dark:text-white">
        {translate('ota.uploading')}
      </Text>
      <Text className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
        {fileName ?? '-'}
      </Text>
      <ProgressBar ref={progressRef} initialProgress={progress} className="w-full" />
      <View className="mt-2 flex-row justify-between text-xs text-neutral-400 dark:text-neutral-500">
        <Text>{formatBytes(bytesWritten)}</Text>
        <Text>
          {progress.toFixed(0)}
          %
        </Text>
        <Text>{formatBytes(totalBytes)}</Text>
      </View>
    </View>
  );
}

function DoneContent({ onDone }: { onDone: () => void }) {
  return (
    <>
      <View className="mb-6 items-center px-2">
        <Text className="mb-3 text-base font-semibold text-green-600">
          {translate('ota.success')}
        </Text>
        <Text className="text-sm text-neutral-600 dark:text-neutral-400">
          {translate('ota.success_message')}
        </Text>
      </View>
      <View className="px-2">
        <Button variant="default" label={translate('ota.done')} onPress={onDone} />
      </View>
    </>
  );
}

function ErrorContent({
  errorMessage,
  onCancel,
  onRetry,
}: {
  errorMessage: string | null;
  onCancel: () => void;
  onRetry: () => void;
}) {
  return (
    <>
      <View className="mb-6 items-center px-2">
        <Text className="mb-3 text-base font-semibold text-red-600">
          {translate('ota.error')}
        </Text>
        <View className="rounded-lg bg-red-50 px-3 py-2 dark:bg-red-900/20">
          <Text className="text-sm text-red-600 dark:text-red-400">
            {errorMessage ?? 'Unknown error'}
          </Text>
        </View>
      </View>
      <View className="flex-row gap-3 px-2">
        <View className="flex-1">
          <Button variant="outline" label={translate('ota.cancel')} onPress={onCancel} />
        </View>
        <View className="flex-1">
          <Button variant="default" label={translate('ota.retry')} onPress={onRetry} />
        </View>
      </View>
    </>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────────

export function OtaUpdateDialog({ visible, onClose, updateInfo }: Props) {
  const modal = useModal();
  const progressRef = React.useRef<{ setProgress: (v: number) => void } | null>(null);

  const [phase, setPhase] = React.useState<Phase>('prompt');
  const [progress, setProgress] = React.useState(0);
  const [bytesWritten, setBytesWritten] = React.useState(0);
  const [totalBytes, setTotalBytes] = React.useState(0);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  // Reset state when dialog becomes visible
  React.useEffect(() => {
    if (visible) {
      setPhase(() => 'prompt');
      setProgress(() => 0);
      setBytesWritten(() => 0);
      setTotalBytes(() => 0);
      setErrorMessage(() => null);
      modal.present();
    }
    else {
      modal.dismiss();
    }
  }, [visible, modal]);

  const handleInstall = React.useCallback(async () => {
    if (!updateInfo)
      return;

    setPhase(() => 'uploading');
    setProgress(() => 0);
    setErrorMessage(() => null);

    try {
      await uploadOtaTar(
        updateInfo.file_name,
        updateInfo.file_name,
        (written: number, total: number) => {
          setBytesWritten(() => written);
          setTotalBytes(() => total);
          const pct = total > 0 ? (written / total) * 100 : 0;
          setProgress(() => pct);
          progressRef.current?.setProgress(pct);
        },
      );
      setPhase(() => 'done');
    }
    catch (err) {
      setErrorMessage(() => err instanceof Error ? err.message : String(err));
      setPhase(() => 'error');
    }
  }, [updateInfo]);

  const handleIgnore = React.useCallback(() => onClose(), [onClose]);
  const handleDone = React.useCallback(() => onClose(), [onClose]);

  const title = phase === 'done'
    ? translate('ota.success')
    : phase === 'error'
      ? translate('ota.error')
      : translate('ota.update_available');

  return (
    <Modal
      ref={modal.ref}
      snapPoints={['60%']}
      title={title}
      detached
      enableDynamicSizing={false}
      enablePanDownToClose={phase !== 'uploading'}
      onDismiss={phase === 'uploading' ? undefined : onClose}
    >
      <View className="px-2 pb-4">
        {phase === 'prompt'
          && <PromptContent updateInfo={updateInfo} onIgnore={handleIgnore} onInstall={handleInstall} />}
        {phase === 'uploading'
          && <UploadingContent progress={progress} bytesWritten={bytesWritten} totalBytes={totalBytes} fileName={updateInfo?.file_name} progressRef={progressRef} />}
        {phase === 'done' && <DoneContent onDone={handleDone} />}
        {phase === 'error'
          && <ErrorContent errorMessage={errorMessage} onCancel={onClose} onRetry={handleInstall} />}
      </View>
    </Modal>
  );
}
