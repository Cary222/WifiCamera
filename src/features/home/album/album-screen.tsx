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
import { ImageViewer } from './components/image-viewer';
import { StorageCard } from './components/storage-card';
import { getAlbumBaseUrl } from './config';
import { MOCK_ALBUM_DATA } from './mock-data';
import { listPicFolders } from './services/album-service';
// eslint-disable-next-line perfectionist/sort-imports -- require must come after regular imports
const backIcon = require('@/assets/common/back.png');
const moreIcon = require('@/assets/common/more.png');

type Status = 'loading' | 'success' | 'error';

/**
 * Normalizes storage values to GB.
 * The board's `/FileCopy/get_disk_usage/` already reports GB, while the
 * WebSocket `used_space`/`all_space` fields report raw bytes.
 */
function formatStorage(
  used: number | null,
  total: number | null,
): { usedGB: number; totalGB: number } | null {
  if (used === null || total === null)
    return null;
  const isBytes = total > 1024;
  const divisor = isBytes ? 1024 * 1024 * 1024 : 1;
  return {
    usedGB: Math.round((used / divisor) * 10) / 10,
    totalGB: Math.round((total / divisor) * 10) / 10,
  };
}

function parseDateFromFolder(f: { name: string; path?: string; mtime?: number }): { label: string; timestamp: string; sortKey: string } {
  const text = `${f.path || ''} ${f.name}`;

  // 1. Check for YYYY-MM-DD (e.g. /Pictures/2026-08-13/...)
  const isoMatch = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const year = isoMatch[1];
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    const monthStr = String(month).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    return {
      label: `${year}年${month}月${day}日`,
      timestamp: `${year}-${monthStr}-${dayStr}`,
      sortKey: `${year}${monthStr}${dayStr}`,
    };
  }

  // 2. Check for compact YYYYMMDD (e.g. 20260810)
  const compactMatch = text.match(/(\d{4})(\d{2})(\d{2})/);
  if (compactMatch) {
    const year = compactMatch[1];
    const month = Number(compactMatch[2]);
    const day = Number(compactMatch[3]);
    const monthStr = String(month).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    return {
      label: `${year}年${month}月${day}日`,
      timestamp: `${year}-${monthStr}-${dayStr}`,
      sortKey: `${year}${monthStr}${dayStr}`,
    };
  }

  // 3. Use mtime timestamp
  if (typeof f.mtime === 'number' && f.mtime > 1000000000) {
    const d = new Date(f.mtime * 1000);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const monthStr = String(month).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    return {
      label: `${year}年${month}月${day}日`,
      timestamp: `${year}-${monthStr}-${dayStr}`,
      sortKey: `${year}${monthStr}${dayStr}`,
    };
  }

  return {
    label: '拍摄记录',
    timestamp: '近期',
    sortKey: '00000000',
  };
}

function extractTargetName(name: string): string {
  if (name.includes('nebula') || name.startsWith('S_'))
    return '星云拍摄';
  if (name.includes('stream_frame'))
    return '风景照片';
  if (name.includes('record'))
    return '风景录像';
  if (name.includes('solve'))
    return '星图解算';
  const clean = name.replace(/\.[^.]+$/, '').replace(/_\d+$/, '');
  return clean.length > 8 ? `${clean.slice(0, 8)}…` : clean;
}

/**
 * Groups raw PicFolder items by their detected date.
 * Returns an AlbumData-compatible structure ready for rendering.
 */
function groupIntoAlbumData(
  folders: Array<{ name: string; path?: string; size?: number; mtime?: number }>,
  usedSpace: number | null,
  allSpace: number | null,
): AlbumData {
  const real = formatStorage(usedSpace, allSpace);
  const baseUrl = getAlbumBaseUrl();

  const map = new Map<string, { label: string; sortKey: string; items: PhotoItem[] }>();

  for (const f of folders) {
    const { label, timestamp, sortKey } = parseDateFromFolder(f);
    if (!map.has(label)) {
      map.set(label, { label, sortKey, items: [] });
    }

    const previewUrl = f.path
      ? `${baseUrl}/get_image?path=${encodeURIComponent(f.path)}`
      : undefined;

    map.get(label)!.items.push({
      id: `${f.name}-${map.get(label)!.items.length}`,
      target: extractTargetName(f.name),
      exposure: f.name.includes('LIGHT_') ? `${f.name.split('LIGHT_')[1]?.split('_')[0] ?? '-'}s` : '-',
      gain: f.name.includes('LIGHT_') ? `G${f.name.split('LIGHT_')[1]?.split('_')[1] ?? '-'}` : '-',
      timestamp,
      path: f.path,
      previewUrl,
    });
  }

  // Sort groups descending by date (latest first)
  const sortedEntries = Array.from(map.values()).sort((a, b) => b.sortKey.localeCompare(a.sortKey));

  const groups = sortedEntries.map((entry, i) => ({
    id: `g-${i}`,
    dateLabel: entry.label,
    items: entry.items,
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
  onItemPress,
  insetsBottom,
}: {
  data: AlbumData;
  collapsed: Record<string, boolean>;
  toggleGroup: (groupId: string) => void;
  isMockMode: boolean;
  onFormatPress?: () => void;
  onItemPress?: (item: PhotoItem) => void;
  insetsBottom: number;
}) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#090a0c' }}
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
            {!isCollapsed && <FolderGrid items={group.items} onItemPress={onItemPress} />}
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
  const [selectedPhoto, setSelectedPhoto] = React.useState<PhotoItem | null>(null);

  const toggleGroup = React.useCallback((groupId: string) => {
    setCollapsed(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  }, []);

  const handleRefresh = React.useCallback(async () => {
    setStatus('loading');
    try {
      const folders = await listPicFolders();
      console.info(`[Album] folders=${folders.length}`);
      const data = groupIntoAlbumData(folders, usedSpace, allSpace);
      console.info(`[Album] groups=${data.groups.length} items=${data.groups.reduce((n, g) => n + g.items.length, 0)}`);
      setAlbumData(data);
      setStatus('success');
    }
    catch (error) {
      console.warn('[Album] load failed', error);
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
        onItemPress={item => setSelectedPhoto(item)}
        insetsBottom={insets.bottom}
      />
    );
  };

  return (
    <>
      <FocusAwareStatusBar />
      <SafeAreaView style={{ flex: 1, backgroundColor: '#090a0c' }}>
        <TitleBar onRefreshPress={handleRefresh} />
        {renderContent()}
      </SafeAreaView>

      <ImageViewer
        item={selectedPhoto}
        onClose={() => setSelectedPhoto(null)}
      />
    </>
  );
}
