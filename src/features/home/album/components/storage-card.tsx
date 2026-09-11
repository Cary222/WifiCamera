import type { StorageCardState } from '../types';
import { Image as NImage } from 'expo-image';

import { Pressable, View } from 'react-native';
import { useUniwind } from 'uniwind';
import { Text } from '@/components/ui';

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
 *   [SD icon] [Name]  [used / total]        [format button]
 *                     [==== progress ====]
 */
export function StorageCard({ storage, onFormatPress }: Props) {
  const { theme } = useUniwind();
  const isDark = theme === 'dark';
  const ratio = storage.totalGB > 0
    ? Math.max(0, Math.min(1, storage.usedGB / storage.totalGB))
    : 0;
  const percent = Math.round(ratio * 100);
  const hasData = storage.totalGB > 0;

  return (
    <View className="w-full flex-row items-center justify-between rounded-[20px] border-[0.5px] border-neutral-200 bg-neutral-50 px-4 py-3.5 dark:border-[rgba(196,196,196,0.3)] dark:bg-[#111213]">
      {/* Left: SD icon & Name */}
      <View className="flex-row items-center">
        <NImage
          source={cardIcon}
          style={{ width: 28, height: 28 }}
          contentFit="contain"
          tintColor={isDark ? undefined : '#222222'}
        />
        <Text className="ml-2.5 text-[15px] font-light text-black dark:text-white">
          {typeof storage.name === 'string' && storage.name.startsWith('album.')
            ? translate(storage.name as Parameters<typeof translate>[0])
            : storage.name}
        </Text>
      </View>

      {/* Middle: Used / total & Progress bar stacked vertically */}
      <View className="mx-4 flex-1">
        <Text className={`text-[15px] font-light ${hasData ? 'text-black dark:text-white' : 'text-neutral-400 dark:text-white/40'}`}>
          {hasData
            ? `${storage.usedGB.toFixed(1)} GB / ${storage.totalGB} GB`
            : '—'}
        </Text>
        <View className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-[#333333]">
          <View className="h-full rounded-full bg-[#C8E733]" style={{ width: `${percent}%` }} />
        </View>
      </View>

      {/* Right: Format button */}
      <Pressable onPress={onFormatPress} hitSlop={8} className="active:opacity-70">
        <Text className="text-[15px] font-light text-[#FF3B30]">
          {translate('album.storage_card.format')}
        </Text>
      </Pressable>
    </View>
  );
}
