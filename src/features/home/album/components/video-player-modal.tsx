import type { VideoMediaItem } from '../types';
import * as Sharing from 'expo-sharing';
import * as React from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Text } from '@/components/ui';
import { ArrowLeft, Download, Share } from '@/components/ui/icons';
import { translate } from '@/lib/i18n';
import { downloadImageFile, saveVideoToPhone } from '../services/album-service';

type Props = {
  item: VideoMediaItem | null;
  onClose: () => void;
};

function VideoTopBar({
  item,
  topInset,
  onClose,
}: {
  item: VideoMediaItem;
  topInset: number;
  onClose: () => void;
}) {
  return (
    <View
      style={{
        position: 'absolute',
        top: topInset,
        left: 0,
        right: 0,
        zIndex: 20,
        height: 56,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
      }}
    >
      <Pressable
        testID="video-viewer-back-button"
        hitSlop={12}
        onPress={onClose}
        style={{ width: 40, height: 40, justifyContent: 'center' }}
      >
        <ArrowLeft color="#FFFFFF" size={24} />
      </Pressable>

      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '600', color: '#FFFFFF' }}>
          {item.name}
        </Text>
        <Text style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.6)', marginTop: 2 }}>
          {item.timestamp}
        </Text>
      </View>

      <View style={{ width: 40 }} />
    </View>
  );
}

function VideoBottomToolbar({
  bottomInset,
  isSaving,
  isSharing,
  onSave,
  onShare,
}: {
  bottomInset: number;
  isSaving: boolean;
  isSharing: boolean;
  onSave: () => void;
  onShare: () => void;
}) {
  const isBusy = isSaving || isSharing;
  return (
    <View
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        paddingTop: 14,
        paddingBottom: Math.max(bottomInset, 16),
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
      }}
    >
      <Pressable
        testID="video-download-button"
        hitSlop={12}
        disabled={isBusy}
        onPress={onSave}
        style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}
      >
        {isSaving ? <ActivityIndicator size="small" color="#CBFF3C" /> : <Download color="#FFFFFF" size={24} />}
      </Pressable>

      <Pressable
        testID="video-share-button"
        hitSlop={12}
        disabled={isBusy}
        onPress={onShare}
        style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}
      >
        {isSharing ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Share color="#FFFFFF" size={24} />}
      </Pressable>
    </View>
  );
}

export function VideoPlayerModal({ item, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [isSaving, setIsSaving] = React.useState(false);
  const [isSharing, setIsSharing] = React.useState(false);

  const visible = item !== null && item.kind === 'mp4';

  const handleSave = React.useCallback(async () => {
    if (!item?.videoUrl || isSaving || isSharing)
      return;
    setIsSaving(true);
    try {
      await saveVideoToPhone({ videoUrl: item.videoUrl, path: item.path });
      Alert.alert('提示', translate('album.video_player.save_success'));
    }
    catch (error: unknown) {
      console.warn('[VideoPlayerModal] save video failed', error);
      Alert.alert('提示', translate('album.video_player.save_failed'));
    }
    finally {
      setIsSaving(false);
    }
  }, [item, isSaving, isSharing]);

  const handleShare = React.useCallback(async () => {
    if (!item?.videoUrl || isSaving || isSharing)
      return;
    setIsSharing(true);
    try {
      const localUri = await downloadImageFile({ previewUrl: item.videoUrl, path: item.path });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(localUri, {
          mimeType: 'video/mp4',
          UTI: 'public.mpeg-4',
          dialogTitle: item.name,
        });
      }
      else {
        Alert.alert('提示', translate('album.viewer.share_unavailable'));
      }
    }
    catch (error: unknown) {
      console.warn('[VideoPlayerModal] share video failed', error);
      Alert.alert('提示', translate('album.viewer.share_failed'));
    }
    finally {
      setIsSharing(false);
    }
  }, [item, isSaving, isSharing]);

  if (!item)
    return null;

  return (
    <Modal visible={visible} animationType="fade" transparent={false} statusBarTranslucent onRequestClose={onClose}>
      <View className="flex-1 bg-black">
        <VideoTopBar item={item} topInset={insets.top} onClose={onClose} />
        <View style={{ flex: 1, paddingTop: insets.top + 56, paddingBottom: insets.bottom + 70 }}>
          {item.videoUrl && (
            <WebView
              testID="video-webview-player"
              style={{ flex: 1, backgroundColor: '#000000' }}
              originWhitelist={['*']}
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              source={{
                html: `
                  <!DOCTYPE html>
                  <html>
                  <head>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
                    <style>
                      html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; display: flex; align-items: center; justify-content: center; overflow: hidden; }
                      video { width: 100%; height: 100%; object-fit: contain; }
                    </style>
                  </head>
                  <body>
                    <video src="${item.videoUrl}" controls playsinline autoplay></video>
                  </body>
                  </html>
                `,
              }}
            />
          )}
        </View>
        <VideoBottomToolbar
          bottomInset={insets.bottom}
          isSaving={isSaving}
          isSharing={isSharing}
          onSave={handleSave}
          onShare={handleShare}
        />
      </View>
    </Modal>
  );
}
