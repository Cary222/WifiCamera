import type { PicFolder } from '../types';

import { Pressable, View } from 'react-native';
import { Image, Text } from '@/components/ui';
import { Folder as FolderIcon } from '@/components/ui/icons';
import { translate } from '@/lib/i18n';

type FolderListProps = {
  folders: PicFolder[];
  onFolderPress: (folder: PicFolder) => void;
};

/** Renders a flat list of PicFolder items. */
export function FolderList({ folders, onFolderPress }: FolderListProps) {
  if (folders.length === 0) {
    return (
      <View className="flex-1 items-center justify-center py-20">
        <FolderIcon color="#9CA3AF" size={48} />
        <Text className="mt-4 text-neutral-400">{translate('album.empty')}</Text>
      </View>
    );
  }

  return (
    <View className="gap-3">
      {folders.map(folder => (
        <Pressable
          key={folder.path}
          onPress={() => onFolderPress(folder)}
          className="flex-row items-center rounded-2xl p-4 dark:bg-[#1A1A1A]"
          style={{ backgroundColor: 'rgba(0,0,0,0.06)' }}
        >
          <View className="mr-4 rounded-xl bg-orange-500 p-3">
            <FolderIcon color="white" size={24} />
          </View>
          <View className="flex-1">
            <Text className="text-base font-medium text-black dark:text-white">
              {folder.name}
            </Text>
            <Text className="mt-0.5 text-sm text-neutral-500">{folder.path}</Text>
          </View>
          <View className="rotate-180">
            <View
              style={{
                borderLeftWidth: 1.5,
                borderBottomWidth: 1.5,
                width: 8,
                height: 8,
                borderColor: '#9CA3AF',
                transform: [{ rotate: '-45deg' }],
              }}
            />
          </View>
        </Pressable>
      ))}
    </View>
  );
}
