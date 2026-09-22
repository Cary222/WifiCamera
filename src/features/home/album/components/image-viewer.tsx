import type { LayoutChangeEvent } from 'react-native';
import type { PhotoItem } from '../types';
import { Image } from 'expo-image';
import * as React from 'react';
import { ActivityIndicator, Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui';
import { ArrowLeft, Download, Share, Trash } from '@/components/ui/icons';
import { useImageViewerActions } from '../hooks/use-image-viewer-actions';

const watermarkLogo = require('@/assets/common/watermark_white.png') as number;

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
type ViewerWatermarkProps = {
  containerSize: { width: number; height: number };
  imageSize: { width: number; height: number } | null;
  bottomInset: number;
};

function ViewerWatermark({ containerSize, imageSize, bottomInset }: ViewerWatermarkProps) {
  const watermarkBottom = React.useMemo(() => {
    const cw = containerSize.width;
    const ch = containerSize.height;
    if (cw <= 0 || ch <= 0)
      return bottomInset + 80;

    const imgWidth = imageSize?.width ?? 16;
    const imgHeight = imageSize?.height ?? 9;
    const imgRatio = imgWidth / imgHeight;
    const containerRatio = cw / ch;

    if (containerRatio <= imgRatio) {
      const renderedHeight = cw / imgRatio;
      const verticalPadding = (ch - renderedHeight) / 2;
      return Math.max(bottomInset + 20, verticalPadding + 16);
    }
    return bottomInset + 80;
  }, [containerSize.width, containerSize.height, imageSize, bottomInset]);

  return (
    <View
      testID="viewer-watermark"
      pointerEvents="none"
      style={{
        position: 'absolute',
        bottom: watermarkBottom,
        left: 0,
        right: 0,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
      }}
    >
      <Image
        source={watermarkLogo}
        style={{ width: 140, height: 14, opacity: 0.88 }}
        contentFit="contain"
      />
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

  const [containerSize, setContainerSize] = React.useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [imageSize, setImageSize] = React.useState<{ width: number; height: number } | null>(null);

  const handleContainerLayout = React.useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setContainerSize({ width, height });
  }, []);

  const close = React.useCallback(() => {
    if (isBusy)
      return;
    setLoading(true);
    setFailed(false);
    setImageSize(null);
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
      <View className="flex-1 bg-black" onLayout={handleContainerLayout}>
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
            onLoad={(event) => {
              if (event.source?.width && event.source?.height) {
                setImageSize({ width: event.source.width, height: event.source.height });
              }
            }}
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

        {!loading && !failed && Boolean(item?.previewUrl) && (
          <ViewerWatermark
            containerSize={containerSize}
            imageSize={imageSize}
            bottomInset={insets.bottom}
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
