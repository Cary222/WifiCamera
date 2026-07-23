import type { PicFile } from '../types';
import { useState } from 'react';

import { Dimensions, Pressable, View } from 'react-native';
import { Image, Text } from '@/components/ui';

type ImageGridProps = {
  files: PicFile[];
  onFilePress: (file: PicFile) => void;
  onFileSelect?: (file: PicFile) => void;
  selectedFiles?: Set<string>;
};

/** 3-column grid of picture thumbnails. */
export function ImageGrid({ files, onFilePress, onFileSelect, selectedFiles = new Set() }: ImageGridProps) {
  const screenWidth = Dimensions.get('window').width;
  const columnGap = 8;
  const containerPadding = 40; // px-5 * 2
  const columns = 3;
  const itemWidth = (screenWidth - containerPadding - columnGap * (columns - 1)) / columns;
  const itemHeight = itemWidth;

  return (
    <View
      className="flex-row flex-wrap"
      style={{ gap: columnGap }}
    >
      {files.map((file) => {
        const isSelected = selectedFiles.has(file.path);
        return (
          <Pressable
            key={file.path}
            onPress={() => onFilePress(file)}
            onLongPress={() => onFileSelect?.(file)}
            className="relative overflow-hidden rounded-xl"
            style={{ width: itemWidth, height: itemHeight }}
          >
            <Image
              source={{ uri: file.thumbUrl ?? file.url ?? '' }}
              className="size-full"
              contentFit="cover"
            />

            {/* Selection overlay */}
            {onFileSelect && (
              <View
                className={`absolute inset-0 items-center justify-center ${
                  isSelected ? 'bg-black/40' : 'bg-transparent'
                }`}
              >
                <View
                  className={`size-6 items-center justify-center rounded-full border-2 ${
                    isSelected ? 'border-orange-500 bg-orange-500' : 'border-white bg-transparent'
                  }`}
                >
                  {isSelected && <Text className="text-xs text-white">✓</Text>}
                </View>
              </View>
            )}

            {/* Size badge */}
            <View className="absolute right-1 bottom-1 rounded-md bg-black/60 px-1.5 py-0.5">
              <Text className="text-xs text-white">{formatSize(file.size ?? 0)}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024)
    return `${bytes}B`;
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
