import type { PhotoItem } from '../types';
import { Image } from 'expo-image';
import * as React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui';
import { ArrowLeft, Download, Share, Trash } from '@/components/ui/icons';
import { useImageViewerActions } from '../hooks/use-image-viewer-actions';

type Props = {
  item: PhotoItem | null;
  onClose: () => void;
  onDeleted?: (item: PhotoItem) => void;
};

type ViewerTopBarProps = {
  item: PhotoItem | null;
  topInset: number;
  disabled: boolean;
  onClose: () => void;
};

function ViewerTopBar({ item, topInset, disabled, onClose }: ViewerTopBarProps) {
  return (
    <View
      testID="viewer-top-bar"
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
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
      }}
    >
      <Pressable
        testID="viewer-back-button"
        hitSlop={12}
        disabled={disabled}
        onPress={onClose}
        style={{
          width: 40,
          height: 40,
          justifyContent: 'center',
          alignItems: 'flex-start',
        }}
      >
        <ArrowLeft color="#FFFFFF" size={24} />
      </Pressable>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text
          testID="viewer-target"
          numberOfLines={1}
          style={{ fontSize: 16, fontWeight: '500', color: '#FFFFFF' }}
        >
          {item?.target ?? ''}
        </Text>
        {Boolean(item?.timestamp) && (
          <Text
            testID="viewer-timestamp"
            numberOfLines={1}
            style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.6)', marginTop: 2 }}
          >
            {item?.timestamp}
          </Text>
        )}
      </View>

      <View style={{ width: 40 }} />
    </View>
  );
}

type ViewerBottomBarProps = {
  bottomInset: number;
  isBusy: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  isSharing: boolean;
  onSave: () => void;
  onDelete: () => void;
  onShare: () => void;
};

function ViewerBottomBar({
  bottomInset,
  isBusy,
  isSaving,
  isDeleting,
  isSharing,
  onSave,
  onDelete,
  onShare,
}: ViewerBottomBarProps) {
  return (
    <View
      testID="viewer-bottom-toolbar"
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        paddingTop: 16,
        paddingBottom: Math.max(bottomInset, 20),
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
      }}
    >
      <Pressable
        testID="viewer-download-button"
        hitSlop={12}
        disabled={isBusy}
        onPress={onSave}
        style={{
          width: 48,
          height: 48,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: isBusy && !isSaving ? 0.4 : 1,
        }}
      >
        {isSaving && <ActivityIndicator size="small" color="#CBFF3C" />}
        {!isSaving && <Download color="#FFFFFF" size={24} />}
      </Pressable>

      <Pressable
        testID="viewer-delete-button"
        hitSlop={12}
        disabled={isBusy}
        onPress={onDelete}
        style={{
          width: 48,
          height: 48,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: isBusy && !isDeleting ? 0.4 : 1,
        }}
      >
        {isDeleting && <ActivityIndicator size="small" color="#FF3B30" />}
        {!isDeleting && <Trash color="#FFFFFF" size={24} />}
      </Pressable>

      <Pressable
        testID="viewer-share-button"
        hitSlop={12}
        disabled={isBusy}
        onPress={onShare}
        style={{
          width: 48,
          height: 48,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: isBusy && !isSharing ? 0.4 : 1,
        }}
      >
        {isSharing && <ActivityIndicator size="small" color="#FFFFFF" />}
        {!isSharing && <Share color="#FFFFFF" size={24} />}
      </Pressable>
    </View>
  );
}

/**
 * Full-screen image preview screen matching camera album specs:
 * - Centered contain black canvas
 * - Top bar: Left back button, centered item target with timestamp beneath
 * - Bottom toolbar: thin white download, delete, and share icon buttons
 * - Busy duplicate protection, error feedback, and delete confirmation
 */
export function ImageViewer({ item, onClose, onDeleted }: Props) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);

  const {
    isBusy,
    isSaving,
    isDeleting,
    isSharing,
    handleSave,
    handleDelete,
    handleShare,
  } = useImageViewerActions({ item, onClose, onDeleted });

  const visible = item !== null;

  const close = React.useCallback(() => {
    if (isBusy)
      return;
    setLoading(true);
    setFailed(false);
    onClose();
  }, [isBusy, onClose]);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      statusBarTranslucent
      onRequestClose={close}
    >
      <View className="flex-1 bg-black">
        <ViewerTopBar
          item={item}
          topInset={insets.top}
          disabled={isBusy}
          onClose={close}
        />

        {Boolean(item?.previewUrl) && (
          <Image
            key={item?.id}
            source={{ uri: item?.previewUrl }}
            style={{ flex: 1 }}
            contentFit="contain"
            onLoadStart={() => {
              setLoading(true);
              setFailed(false);
            }}
            onLoadEnd={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setFailed(true);
            }}
          />
        )}

        {loading && !failed && (
          <View className="absolute inset-0 items-center justify-center">
            <ActivityIndicator color="#CBFF3C" />
            <Text className="mt-3 text-[13px] text-white/70">正在加载原图…</Text>
          </View>
        )}

        {failed && (
          <View className="absolute inset-0 items-center justify-center px-8">
            <Text className="text-center text-[14px] text-white/70">
              图片预览加载失败
            </Text>
          </View>
        )}

        <ViewerBottomBar
          bottomInset={insets.bottom}
          isBusy={isBusy}
          isSaving={isSaving}
          isDeleting={isDeleting}
          isSharing={isSharing}
          onSave={handleSave}
          onDelete={handleDelete}
          onShare={handleShare}
        />
      </View>
    </Modal>
  );
}
