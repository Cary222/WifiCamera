/**
 * Album screen — shows TF card storage and photo folders grouped by date.
 *
 * Architecture:
 *   - Real data path: HTTP API → `album-service` → flat PicFolder[] → date-grouped in-screen
 *   - Mock data path: `mock-data.ts` provides full AlbumData (storage + groups)
 *
 * The store (`useAlbumStore`) is NOT used here — the screen manages its own
 * data loading so it can directly own the mock/real data transformation.
 */
import type { AlbumData, PhotoItem } from './types';
import { useNavigation } from '@react-navigation/native';
import { Image as NImage } from 'expo-image';
import * as React from 'react';

import { ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { FocusAwareStatusBar, Pressable, Text } from '@/components/ui';
import { useCameraStore } from '@/features/home/camera';
import { translate } from '@/lib/i18n';
import { AlbumErrorState } from './components/album-error-state';
import { DateGroupHeader } from './components/date-group-header';
import { FolderGrid } from './components/folder-tile';
import { StorageCard } from './components/storage-card';

import { MOCK_ALBUM_DATA } from './mock-data';
import { listPicFolders } from './services/album-service';
// eslint-disable-next-line perfectionist/sort-imports -- require must come after regular imports
const backIcon = require('@/assets/common/back.png');
const moreIcon = require('@/assets/common/more.png');

type Status = 'loading' | 'success' | 'error';

/** Converts bytes to GB for display. Returns null if either value is null. */
function formatStorage(
  usedBytes: number | null,
  totalBytes: number | null,
): { usedGB: number; totalGB: number } | null {
  if (usedBytes === null || totalBytes === null)
    return null;
  return {
    usedGB: Math.round((usedBytes / (1024 * 1024 * 1024)) * 10) / 10,
    totalGB: Math.round((totalBytes / (1024 * 1024 * 1024)) * 10) / 10,
  };
}

/**
 * Groups raw PicFolder items by the date portion of their name (YYYYMMDD suffix).
 * Returns an AlbumData-compatible structure ready for rendering.
 */
function groupIntoAlbumData(
  folders: Array<{ name: string; size?: number; mtime?: number }>,
  usedSpace: number | null,
  allSpace: number | null,
): AlbumData {
  const real = formatStorage(usedSpace, allSpace);

  // Group folders by the date segment (last 8 chars before any extension).
  const map = new Map<string, PhotoItem[]>();
  for (const f of folders) {
    // name format: "M33_20260522_123456" or just "20260522"
    const match = f.name.match(/(\d{8})$/);
    const dateStr = match ? match[1] : 'unknown';
    // e.g. "20260522" → "2026年5月22日"
    const year = dateStr.slice(0, 4);
    const month = Number(dateStr.slice(4, 6));
    const day = Number(dateStr.slice(6, 8));
    const label = `${year}年${month}月${day}日`;
    if (!map.has(label)) {
      map.set(label, []);
    }
    // Mock fallback folders all share `name: 'M33'`, so the id needs the
    // folder index appended to stay unique across items in the same group.
    map.get(label)!.push({
      id: `${f.name}-${map.get(label)!.length}`,
      target: f.name.replace(/\d{8}.*$/, '').replace(/_$/, '') || f.name,
      exposure: '-',
      gain: '-',
      timestamp: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    });
  }

  const groups = Array.from(map.entries()).map(([label, items], i) => ({
    id: `g-${i}`,
    dateLabel: label,
    items,
  }));

  return {
    storage: {
      name: 'album.storage_card.name',
      usedGB: real?.usedGB ?? MOCK_ALBUM_DATA.storage.usedGB,
      totalGB: real?.totalGB ?? MOCK_ALBUM_DATA.storage.totalGB,
    },
    groups,
  };
}

function TitleBar({
  onRefreshPress,
}: {
  onRefreshPress?: () => void;
}) {
  const navigation = useNavigation();

  return (
    <View style={{ height: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
      <Pressable
        hitSlop={10}
        onPress={() => navigation.goBack()}
        style={{ width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-start' }}
      >
        <NImage source={backIcon} style={{ width: 28, height: 28 }} contentFit="contain" />
      </Pressable>

      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text className="text-[20px] font-light text-white">
          {translate('album.title')}
        </Text>
      </View>

      <Pressable
        hitSlop={10}
        onPress={onRefreshPress}
        style={{ width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-end' }}
      >
        <NImage source={moreIcon} style={{ width: 28, height: 28 }} contentFit="contain" />
      </Pressable>
    </View>
  );
}

function AlbumBody({
  data,
  collapsed,
  toggleGroup,
  isMockMode,
  onFormatPress,
  insetsBottom,
}: {
  data: AlbumData;
  collapsed: Record<string, boolean>;
  toggleGroup: (groupId: string) => void;
  isMockMode: boolean;
  onFormatPress?: () => void;
  insetsBottom: number;
}) {
  return (
    <ScrollView
      className="flex-1 bg-[#090a0c]"
      contentContainerStyle={{ paddingBottom: 40 + insetsBottom }}
      showsVerticalScrollIndicator={false}
    >
      <View className="mt-2">
        <StorageCard
          storage={data.storage}
          onFormatPress={onFormatPress}
        />
      </View>

      {isMockMode && (
        <View className="mx-4 mt-3 rounded-[10px] border border-[rgba(196,196,196,0.2)] bg-[rgba(255,255,255,0.05)] px-3 py-2">
          <Text className="text-center text-[11px] text-white/50">
            {translate('album.mock_mode_hint')}
          </Text>
        </View>
      )}

      {data.groups.map((group) => {
        const isCollapsed = collapsed[group.id] ?? false;
        return (
          <View key={group.id}>
            <DateGroupHeader
              dateLabel={group.dateLabel}
              itemCount={group.items.length}
              expanded={!isCollapsed}
              onPress={() => toggleGroup(group.id)}
            />
            {!isCollapsed && <FolderGrid items={group.items} />}
          </View>
        );
      })}
    </ScrollView>
  );
}

export function AlbumScreen() {
  const insets = useSafeAreaInsets();
  const isMockMode = useCameraStore.use.isMockMode();
  const usedSpace = useCameraStore.use.usedSpace();
  const allSpace = useCameraStore.use.allSpace();

  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});
  const [status, setStatus] = React.useState<Status>('loading');
  const [albumData, setAlbumData] = React.useState<AlbumData | null>(null);

  const toggleGroup = React.useCallback((groupId: string) => {
    setCollapsed(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  }, []);

  const handleRefresh = React.useCallback(async () => {
    setStatus('loading');
    try {
      const folders = await listPicFolders();
      const data = groupIntoAlbumData(folders, usedSpace, allSpace);
      setAlbumData(data);
      setStatus('success');
    }
    catch {
      setStatus('error');
    }
  }, [usedSpace, allSpace]);

  const handleFormatPress = React.useCallback(() => {
    // TODO: wire up to camera format command once the camera API is reachable
  }, []);

  // Initial load
  React.useEffect(() => {
    void handleRefresh();
  }, [handleRefresh]);

  const renderContent = () => {
    if (status === 'loading') {
      return (
        <View className="flex-1 items-center justify-center bg-[#090a0c]">
          <Text className="text-[14px] text-white">{translate('album.loading')}</Text>
        </View>
      );
    }

    if (status === 'error' || !albumData) {
      return (
        <AlbumErrorState
          message={translate('album.load_error')}
          onRetry={handleRefresh}
        />
      );
    }

    return (
      <AlbumBody
        data={albumData}
        collapsed={collapsed}
        toggleGroup={toggleGroup}
        isMockMode={isMockMode}
        onFormatPress={handleFormatPress}
        insetsBottom={insets.bottom}
      />
    );
  };

  return (
    <>
      <FocusAwareStatusBar />
      <SafeAreaView className="flex-1 bg-[#090a0c]">
        <TitleBar onRefreshPress={handleRefresh} />
        {renderContent()}
      </SafeAreaView>
    </>
  );
}
