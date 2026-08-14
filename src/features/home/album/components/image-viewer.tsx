import type { PhotoItem } from '../types';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui';

type Props = {
  item: PhotoItem | null;
  onClose: () => void;
};

/** Full-screen still-image viewer backed by the board's /get_image endpoint. */
export function ImageViewer({ item, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const visible = item !== null;

  const close = () => {
    setLoading(true);
    setFailed(false);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      statusBarTranslucent
      onRequestClose={close}
    >
      <View className="flex-1 bg-black">
        <View
          className="absolute inset-x-0 z-10 flex-row items-center justify-between px-4"
          style={{ top: insets.top + 8 }}
        >
          <View className="max-w-[78%] rounded-full bg-black/55 px-4 py-2">
            <Text className="text-[15px] font-medium text-white">图片预览</Text>
            <Text className="mt-0.5 text-[10px] text-white/60" numberOfLines={1}>
              {item?.path ?? ''}
            </Text>
          </View>
          <Pressable
            onPress={close}
            hitSlop={10}
            className="size-10 items-center justify-center rounded-full bg-black/55 active:opacity-70"
          >
            <Text className="text-[26px] font-light text-white">×</Text>
          </Pressable>
        </View>

        {item?.previewUrl && (
          <Image
            key={item.id}
            source={{ uri: item.previewUrl }}
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
            <Text className="text-center text-[14px] text-white/70">图片预览加载失败</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}
