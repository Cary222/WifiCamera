import type { StorageCardState } from '../types';
import { Pressable, View } from 'react-native';

import { Image, Text } from '@/components/ui';
import { translate } from '@/lib/i18n';

// eslint-disable-next-line perfectionist/sort-imports -- require must come after regular imports
const cardIcon = require('@/assets/common/card.png');

type Props = {
  storage: StorageCardState;
  onFormatPress?: () => void;
};

/**
 * Top "TF card" row showing storage info with a progress bar.
 *
 * Layout:
 *   [SD icon] [Name] ............. [used / total] [format button]
 *   [-------------------- progress bar -----------------]
 */
export function StorageCard({ storage, onFormatPress }: Props) {
  const ratio = Math.max(0, Math.min(1, storage.usedGB / storage.totalGB));
  const percent = Math.round(ratio * 100);

  return (
    <View className="mx-4 rounded-[15px] border-[0.5px] border-[rgba(196,196,196,0.3)] bg-[#111213] px-4 py-3">
      <View className="flex-row items-center">
        {/* SD icon */}
        <Image
          source={cardIcon}
          style={{ width: 30, height: 30 }}
          contentFit="contain"
        />

        {/* Name */}
        <Text className="ml-2 text-[15px] font-light text-white">
          {typeof storage.name === 'string' && storage.name.startsWith('album.')
            ? translate(storage.name as Parameters<typeof translate>[0])
            : storage.name}
        </Text>

        {/* Spacer */}
        <View className="flex-1" />

        {/* Used / total */}
        <Text className="text-[15px] font-light text-white">
          {storage.usedGB.toFixed(1)}
          {' GB / '}
          {storage.totalGB}
          {' GB'}
        </Text>

        {/* Format button */}
        <Pressable onPress={onFormatPress} hitSlop={8} className="ml-3 active:opacity-70">
          <Text className="text-[15px] font-light text-[rgba(255,0,0,0.5)]">
            {translate('album.storage_card.format')}
          </Text>
        </Pressable>
      </View>

      {/* Progress bar — lime green fill matching the brand accent #C8E733 */}
      <View className="mt-2 h-[2px] w-full overflow-hidden rounded-full bg-white/10">
        <View className="h-full bg-[#C8E733]" style={{ width: `${percent}%` }} />
      </View>
    </View>
  );
}
