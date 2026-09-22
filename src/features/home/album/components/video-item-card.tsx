import type { VideoMediaItem } from '../types';
import * as React from 'react';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';
import { useUniwind } from 'uniwind';
import { Text } from '@/components/ui';
import { Download } from '@/components/ui/icons';
import { translate } from '@/lib/i18n';
import { downloadSerFile, formatBytes } from '../services/album-service';

type Props = {
  item: VideoMediaItem;
  onPlayPress?: (item: VideoMediaItem) => void;
};

function SerActionButton({
  isDownloadable,
  isDownloading,
  onPress,
}: {
  isDownloadable: boolean;
  isDownloading: boolean;
  onPress: () => void;
}) {
  const { theme } = useUniwind();
  const isDark = theme === 'dark';

  return (
    <Pressable
      hitSlop={8}
      disabled={isDownloading}
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        backgroundColor: isDownloadable
          ? isDark
            ? '#22252A'
            : '#E5E7EB'
          : 'transparent',
        opacity: isDownloadable ? 1 : 0.4,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      {isDownloading
        ? (
            <ActivityIndicator size="small" color={isDark ? '#CBFF3C' : '#000'} />
          )
        : (
            <>
              <Download
                color={isDownloadable ? (isDark ? '#CBFF3C' : '#222') : '#888'}
                size={16}
              />
              <Text
                style={{
                  fontSize: 12,
                  marginLeft: 4,
                  fontWeight: '600',
                  color: isDownloadable
                    ? isDark
                      ? '#FFFFFF'
                      : '#111827'
                    : '#888888',
                }}
              >
                {isDownloadable ? translate('album.videos.download') : '未收尾'}
              </Text>
            </>
          )}
    </Pressable>
  );
}

function Mp4PlayButton() {
  const { theme } = useUniwind();
  const isDark = theme === 'dark';

  return (
    <View
      style={{
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: isDark ? '#22252A' : '#E5E7EB',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontSize: 13,
          color: isDark ? '#FFFFFF' : '#111827',
          marginLeft: 2,
        }}
      >
        ▶
      </Text>
    </View>
  );
}

function ItemInfoSection({ item }: { item: VideoMediaItem }) {
  const isSer = item.kind === 'ser';
  return (
    <View className="flex-1 flex-row items-center pr-3">
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          backgroundColor: isSer
            ? 'rgba(203, 255, 60, 0.12)'
            : 'rgba(74, 144, 226, 0.15)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          style={{
            fontSize: 11,
            fontWeight: '700',
            color: isSer ? '#CBFF3C' : '#4A90E2',
          }}
        >
          {isSer ? 'SER' : 'MP4'}
        </Text>
      </View>

      <View className="ml-3 flex-1">
        <Text
          numberOfLines={1}
          className="text-[15px] font-medium text-black dark:text-white"
        >
          {item.name}
        </Text>
        <Text className="mt-1 text-[12px] text-neutral-400 dark:text-neutral-500">
          {item.timestamp}
          {' '}
          ·
          {formatBytes(item.size)}
        </Text>
      </View>
    </View>
  );
}

export function VideoItemCard({ item, onPlayPress }: Props) {
  const { theme } = useUniwind();
  const isDark = theme === 'dark';
  const [isDownloading, setIsDownloading] = React.useState(false);

  const isSer = item.kind === 'ser';
  const isDownloadable = isSer ? item.downloadable !== false : true;

  const handleSerDownload = React.useCallback(async () => {
    if (!isDownloadable) {
      Alert.alert('提示', translate('album.videos.not_finalized'));
      return;
    }
    if (isDownloading)
      return;

    setIsDownloading(true);
    try {
      const finalUri = await downloadSerFile({
        path: item.path,
        name: item.name,
        size: item.size,
      });
      const Sharing = await import('expo-sharing');
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(finalUri, {
          mimeType: 'application/octet-stream',
          UTI: 'public.data',
          dialogTitle: item.name,
        });
      }
      else {
        Alert.alert(translate('album.videos.download_success'));
      }
    }
    catch (error: unknown) {
      console.warn('[VideoItemCard] SER download failed', error);
      const isNotFinalized
        = error instanceof Error && error.message === 'SER_NOT_FINALIZED';
      Alert.alert(
        '下载失败',
        isNotFinalized
          ? translate('album.videos.not_finalized')
          : translate('album.videos.download_failed'),
      );
    }
    finally {
      setIsDownloading(false);
    }
  }, [isDownloadable, isDownloading, item.path, item.name, item.size]);

  return (
    <Pressable
      testID={`video-card-${item.id}`}
      onPress={() => (isSer ? handleSerDownload() : onPlayPress?.(item))}
      className={`mx-4 mb-3 flex-row items-center justify-between rounded-2xl border p-3.5 active:opacity-85 ${
        isDark
          ? 'border-neutral-800 bg-[#121316]'
          : 'border-neutral-200 bg-neutral-50'
      }`}
    >
      <ItemInfoSection item={item} />
      {isSer
        ? (
            <SerActionButton
              isDownloadable={isDownloadable}
              isDownloading={isDownloading}
              onPress={handleSerDownload}
            />
          )
        : (
            <Mp4PlayButton />
          )}
    </Pressable>
  );
}
