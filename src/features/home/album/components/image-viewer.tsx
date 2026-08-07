import type { PicFile } from '../types';
import { useState } from 'react';

import { Dimensions, Modal, Pressable, ScrollView, View } from 'react-native';
import { Image, Text } from '@/components/ui';
import { X as CloseIcon } from '@/components/ui/icons';

type ImageViewerProps = {
  visible: boolean;
  file: PicFile | null;
  onClose: () => void;
};

/** Full-screen modal image viewer. Key-based remount resets zoom on file change. */
export function ImageViewer({ visible, file, onClose }: ImageViewerProps) {
  const [scale, setScale] = useState(1);
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

  if (!file)
    return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View className="flex-1 bg-black">
        {/* Header */}
        <View className="absolute inset-x-0 top-0 z-10 flex-row items-center justify-between px-4 pt-12 pb-3">
          <View className="flex-1">
            <Text className="text-base font-medium text-white" numberOfLines={1}>
              {file.name}
            </Text>
            <Text className="text-sm text-neutral-400">{formatSize(file.size ?? 0)}</Text>
          </View>
          <Pressable
            onPress={onClose}
            className="ml-4 rounded-full bg-white/20 p-2"
          >
            <CloseIcon color="white" size={20} />
          </Pressable>
        </View>

        {/* Image — key resets zoom on file change */}
        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            width: screenWidth,
            height: screenHeight,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          maximumZoomScale={4}
          minimumZoomScale={1}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          bouncesZoom
        >
          <Pressable
            onPress={() => setScale(s => (s > 1 ? 1 : 2))}
            style={{ transform: [{ scale }] }}
          >
            <Image
              key={file.path}
              source={{ uri: file.url ?? '' }}
              style={{ width: screenWidth, height: screenHeight * 0.7 }}
              contentFit="contain"
            />
          </Pressable>
        </ScrollView>

        {/* Footer actions */}
        <View className="absolute inset-x-0 bottom-10 flex-row justify-center gap-8">
          <ActionButton label="Delete" onPress={() => {}} />
          <ActionButton label="Stretch" onPress={() => {}} />
          <ActionButton label="Download" onPress={() => {}} />
        </View>
      </View>
    </Modal>
  );
}

function ActionButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="rounded-full bg-white/20 px-5 py-2"
    >
      <Text className="text-sm text-white">{label}</Text>
    </Pressable>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024)
    return `${bytes}B`;
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
