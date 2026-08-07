import { Modal, Pressable, View } from 'react-native';

import { ActivityIndicator, Text } from '@/components/ui';
import { X as CloseIcon } from '@/components/ui/icons';
import { translate } from '@/lib/i18n';

type DownloadProgressProps = {
  visible: boolean;
  title?: string;
  description?: string;
  receivedSize?: number;
  totalSize?: number;
  progress?: number; // 0-100
  onCancel?: () => void;
};

/** Progress dialog for file downloads and uploads. */
export function DownloadProgress({
  visible,
  title,
  description,
  receivedSize,
  totalSize,
  progress,
  onCancel,
}: DownloadProgressProps) {
  const pct = progress ?? (totalSize && receivedSize ? (receivedSize / totalSize) * 100 : 0);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View className="flex-1 items-center justify-center bg-black/60">
        <View className="w-72 rounded-2xl bg-white p-6 dark:bg-[#1A1A1A]">
          {/* Header */}
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-base font-semibold text-black dark:text-white">
              {title ?? translate('download.title')}
            </Text>
            {onCancel && (
              <Pressable onPress={onCancel} className="rounded-full p-1">
                <CloseIcon color="#9CA3AF" size={18} />
              </Pressable>
            )}
          </View>

          {/* Description */}
          {description && (
            <Text className="mb-4 text-sm text-neutral-500">{description}</Text>
          )}

          {/* Progress bar */}
          <View className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
            <View
              className="h-full rounded-full bg-orange-500"
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </View>

          {/* Percentage + byte counter */}
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-neutral-500">
              {Math.round(pct)}
              %
            </Text>
            {totalSize && receivedSize !== undefined && (
              <Text className="text-sm text-neutral-500">
                {formatBytes(receivedSize)}
                {' '}
                /
                {formatBytes(totalSize)}
              </Text>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024)
    return `${bytes}B`;
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
