import type { PhotoItem } from '../types';
import { Image } from 'expo-image';
import { Pressable, useWindowDimensions, View } from 'react-native';

import { Text } from '@/components/ui';

// eslint-disable-next-line perfectionist/sort-imports -- require must come after regular imports
const nebulaPlaceholder = require('@/assets/icons/index/PhotoAlbum.png');

export function computeTileWidth(screenWidth: number): number {
  const horizontalMargin = 16 * 2;
  const gap = 5 * 2;
  return (screenWidth - horizontalMargin - gap) / 3;
}

type TileProps = {
  item: PhotoItem;
  width: number;
};

/**
 * Single photo tile in the album grid (3-col layout).
 *
 * Visual layers (back to front):
 *   1. Dark blue semi-transparent fill
 *   2. Photo background (cropped/zoomed)
 *   3. Black border for separation
 *   4. Foreground labels: badge, target name, exposure/gain, timestamp
 */
function FolderTileInner({ item, width }: TileProps) {
  const height = Math.round(width * 1.3);
  // Target name positioned at 58% of tile height — computed in JS to avoid
  // Uniwind calc validation errors (it rejects % mixed with other units).
  const targetTop = Math.round(height * 0.58);

  return (
    <Pressable
      style={{ width, height }}
      className="overflow-hidden rounded-[15px] border-[0.5px] border-[#6d6d6d] bg-[rgba(30,49,66,0.7)] active:opacity-80"
    >
      {/* Background image */}
      <Image
        source={nebulaPlaceholder}
        style={{
          position: 'absolute',
          left: -width * 0.78,
          top: 0,
          width: width * 2.5,
          height: height * 1.1,
          opacity: 0.85,
        }}
        contentFit="cover"
      />

      {/* Inner black border */}
      <View pointerEvents="none" className="absolute inset-0 rounded-[15px] border border-black" />

      {/* Top-right badge */}
      {item.badge
        ? (
            <View className="absolute top-1.5 right-2">
              <Text className="text-[9.6px] font-normal text-white/70">
                {item.badge}
              </Text>
            </View>
          )
        : null}

      {/* Target name — positioned at 58% of tile height */}
      <View style={{ position: 'absolute', left: 8, top: targetTop }}>
        <Text className="text-[20px] font-bold text-white" numberOfLines={1}>
          {item.target}
        </Text>
      </View>

      {/* Bottom row: exposure (left) + gain (right) */}
      <View className="absolute inset-x-2 bottom-7 flex-row items-end justify-between">
        <Text className="text-[10px] font-normal text-white">{item.exposure}</Text>
        <Text className="text-[10px] font-normal text-white">{item.gain}</Text>
      </View>

      {/* Bottom-right timestamp */}
      <View className="absolute right-1.5 bottom-1">
        <Text className="text-right text-[8px] font-normal text-white" numberOfLines={1}>
          {item.timestamp}
        </Text>
      </View>
    </Pressable>
  );
}

export function FolderGrid({ items }: { items: PhotoItem[] }) {
  const { width: screenWidth } = useWindowDimensions();
  const tileWidth = computeTileWidth(screenWidth);

  return (
    <View className="mx-4 mt-2 flex-row flex-wrap justify-between">
      {items.map((item, index) => {
        const remaining = items.length - index - 1;
        const isLastRow = remaining < 3;
        const marginBottom = isLastRow ? 0 : 5;
        return (
          <View key={item.id} style={{ width: tileWidth, marginBottom }}>
            <FolderTileInner item={item} width={tileWidth} />
          </View>
        );
      })}
    </View>
  );
}
