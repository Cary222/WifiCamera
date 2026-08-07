import type { PicFolder } from './types';
/**
 * Album folder list screen.
 * Fetches and displays all saved picture folders from the camera.
 */
import { useCallback, useEffect, useState } from 'react';

import { ActivityIndicator, Alert, FlatList, Pressable, View } from 'react-native';
import { Button, FocusAwareStatusBar, Text } from '@/components/ui';
import { translate } from '@/lib/i18n';
import { listPicFolders } from './services/album-service';

function formatSize(bytes?: number) {
  if (!bytes)
    return '-';
  if (bytes < 1024)
    return `${bytes} B`;
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ts?: number) {
  if (!ts)
    return '-';
  return new Date(ts * 1000).toLocaleDateString();
}

export function AlbumScreen() {
  const [folders, setFolders] = useState<PicFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFolders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listPicFolders();
      setFolders(data);
    }
    catch (e) {
      setError(String(e));
    }
    finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  if (loading) {
    return (
      <>
        <FocusAwareStatusBar />
        <View className="flex-1 items-center justify-center bg-white dark:bg-black">
          <ActivityIndicator size="large" />
          <Text tx="album.loading" className="mt-3 text-neutral-500" />
        </View>
      </>
    );
  }

  if (error) {
    return (
      <>
        <FocusAwareStatusBar />
        <View className="flex-1 items-center justify-center bg-white p-6 dark:bg-black">
          <Text tx="album.load_error" className="text-center text-red-500" />
          <Text className="mt-2 text-center text-sm text-neutral-500">{error}</Text>
          <Button label={translate('album.retry')} variant="outline" className="mt-4" onPress={loadFolders} />
        </View>
      </>
    );
  }

  return (
    <>
      <FocusAwareStatusBar />
      <View className="flex-1 bg-white dark:bg-black">
        <View className="flex-row items-center justify-between px-5 py-4">
          <View>
            <Text className="text-2xl font-bold text-black dark:text-white">Album</Text>
            <Text tx="album.title" className="mt-1 text-sm text-neutral-500 dark:text-neutral-400" />
          </View>
          <Button label={translate('album.refresh')} variant="ghost" size="sm" onPress={loadFolders} />
        </View>

        {folders.length === 0
          ? (
              <View className="flex-1 items-center justify-center px-6">
                <Text tx="album.empty" className="text-neutral-500" />
              </View>
            )
          : (
              <FlatList
                data={folders}
                keyExtractor={item => item.name}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
                renderItem={({ item }) => (
                  <FolderItem
                    folder={item}
                    onPress={() => Alert.alert(item.name, `Open ${item.name}?`)}
                  />
                )}
              />
            )}
      </View>
    </>
  );
}

type FolderItemProps = {
  folder: PicFolder;
  onPress: () => void;
};

function FolderItem({ folder, onPress }: FolderItemProps) {
  return (
    <Pressable
      onPress={onPress}
      className="mb-3 flex-row items-center justify-between rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-[#2C2C2C] dark:bg-[#1A1A1A]"
    >
      <View className="flex-1">
        <Text className="font-semibold text-black dark:text-white">{folder.name}</Text>
        <View className="mt-1 flex-row gap-4">
          <Text className="text-xs text-neutral-500">{formatSize(folder.size)}</Text>
          <Text className="text-xs text-neutral-500">{formatDate(folder.mtime)}</Text>
        </View>
      </View>
      <View className="size-2 rounded-full bg-neutral-400" />
    </Pressable>
  );
}
