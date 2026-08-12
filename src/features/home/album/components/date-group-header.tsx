import { Pressable, View } from 'react-native';

import { Image, Text } from '@/components/ui';
import { translate } from '@/lib/i18n';

// eslint-disable-next-line perfectionist/sort-imports -- require must come after regular imports
const folderIcon = require('@/assets/common/file.png');

type Props = {
  /** Display label, e.g. "2026年5月22日" — pass either an i18n key path or a raw string */
  dateLabel: string;
  itemCount: number;
  onPress?: () => void;
  /** Whether the chevron points down (expanded) or up (collapsed) */
  expanded?: boolean;
};

/**
 * Date section header used between photo groups in the album screen.
 *
 * Layout (per the Figma reference):
 *   [folder icon] [date label]  ........  [count badge]  [chevron]
 */
export function DateGroupHeader({ dateLabel, itemCount, onPress, expanded = true }: Props) {
  return (
    <Pressable
      onPress={onPress}
      className="mx-4 mt-4 flex-row items-center active:opacity-70"
    >
      <Image
        source={folderIcon}
        style={{ width: 24, height: 24 }}
        contentFit="contain"
      />
      <Text className="ml-2 text-[16px] font-normal tracking-[0.77px] text-white">
        {dateLabel}
      </Text>
      <View className="flex-1" />
      <Text className="mr-2 text-[10px] font-bold text-[#dedcdd]">
        {translate('album.folder_count', { count: itemCount })}
      </Text>
      <Text className="text-white">
        {expanded ? '▾' : '›'}
      </Text>
    </Pressable>
  );
}
