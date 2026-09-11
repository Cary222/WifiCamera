import type { RecentSkyObject } from '../tools/recent-sky-objects';
import type { CelestialSearchCategory, CelestialSearchItem } from './celestial-catalog';
import type { TxKeyPath } from '@/lib/i18n';
import * as React from 'react';
import {
  FlatList,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { Text } from '@/components/ui';
import i18n, { translate } from '@/lib/i18n';
import { storage } from '@/lib/storage';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import { isFavoriteSkyObject, toggleFavoriteSkyObject } from '../tools/favorite-sky-objects';
import { CelestialAvatar, guessCategory } from './celestial-avatar';
import { ALL_CELESTIAL_OBJECTS, searchCelestialObjects } from './celestial-catalog';

export type ExtendedCelestialCategory = CelestialSearchCategory | 'satellites';

export type SearchFailureReason = 'loading' | 'culture_mismatch' | 'missing_data' | 'not_found' | 'failed';

const SEARCH_FAILURE_KEYS: Record<SearchFailureReason, TxKeyPath> = {
  culture_mismatch: 'deep_space.search_culture_mismatch',
  failed: 'deep_space.search_failed',
  loading: 'deep_space.search_loading',
  missing_data: 'deep_space.search_missing_data',
  not_found: 'deep_space.search_not_found',
};

export type CelestialMetricsItem = {
  reason?: SearchFailureReason | 'available';
  canonicalId?: string;
  altDeg?: number | null;
  azDeg?: number | null;
  vmag?: number | null;
  available: boolean;
};

export type CelestialSearchSheetProps = {
  category: ExtendedCelestialCategory;
  error: boolean;
  errorReason?: SearchFailureReason;
  metricsRetryAvailable?: boolean;
  onRetry?: () => void;
  onChange: (query: string) => void;
  onClearHistory: () => void;
  onClose: () => void;
  onSelectCategory: (category: ExtendedCelestialCategory) => void;
  onSelectItem: (item: CelestialSearchItem) => void;
  onSelectRecent: (object: RecentSkyObject | CelestialSearchItem) => void;
  onSubmit: () => void;
  query: string;
  recentObjects?: RecentSkyObject[];
  recent?: RecentSkyObject[];
  onRemoveRecent?: (id: string) => void;
  nightMode?: boolean;
  pending?: boolean;
  metrics?: Record<string, CelestialMetricsItem>;
  metricsRefreshing?: boolean;
  onRefreshMetrics?: () => void;
  onVisibleItemsChange?: (ids: string[]) => void;
};

type SearchTab = 'popular' | 'visible' | 'favorites' | 'recent' | 'browse';

const CATEGORIES: { id: ExtendedCelestialCategory; labelKey: TxKeyPath }[] = [
  { id: 'all', labelKey: 'deep_space.search_category_all' },
  { id: 'solar_system', labelKey: 'deep_space.search_category_solar_system' },
  { id: 'stars', labelKey: 'deep_space.search_category_stars' },
  { id: 'constellation', labelKey: 'deep_space.search_category_constellation' },
  { id: 'dso', labelKey: 'deep_space.search_category_dso' },
  { id: 'satellites', labelKey: 'deep_space.search_category_satellites' },
];

function getThemeColors(nightMode?: boolean) {
  return {
    accentColor: nightMode ? '#ef5350' : '#38bdf8',
    bgCard: nightMode ? 'rgba(50, 12, 12, 0.6)' : 'rgba(30, 41, 59, 0.6)',
    bgSheet: nightMode ? 'rgba(26, 8, 8, 0.96)' : 'rgba(15, 23, 42, 0.95)',
    borderColor: nightMode ? 'rgba(239, 83, 80, 0.25)' : 'rgba(255, 255, 255, 0.1)',
    subtextColor: nightMode ? '#c62828' : '#94a3b8',
    textColor: nightMode ? '#ef9a9a' : '#ffffff',
  };
}

function getFavoriteIdsFromStorage(): string[] {
  try {
    const raw = storage.getString(STORAGE_KEYS.DEEP_SPACE_FAVORITE_OBJECT_IDS);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  }
  catch {
    return [];
  }
}

function getObjectDisplayNames(item: { nameEn: string; nameZh: string }, isZh: boolean) {
  if (isZh) {
    return {
      primary: item.nameZh,
      secondary: item.nameEn !== item.nameZh ? item.nameEn : '',
    };
  }
  return {
    primary: item.nameEn,
    secondary: item.nameZh !== item.nameEn ? item.nameZh : '',
  };
}

function StarIcon({ isFav, nightMode }: { isFav: boolean; nightMode: boolean }) {
  const fillColor = isFav ? (nightMode ? '#ef5350' : '#fbbf24') : 'none';
  const strokeColor = isFav
    ? (nightMode ? '#ef5350' : '#fbbf24')
    : (nightMode ? '#c62828' : '#64748b');

  return (
    <Svg height={20} viewBox="0 0 24 24" width={20}>
      <Path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth="2"
      />
    </Svg>
  );
}

function SearchHeaderBar({
  accentColor,
  borderColor,
  onChange,
  onSubmit,
  query,
  subtextColor,
  textColor,
}: {
  accentColor: string;
  borderColor: string;
  onChange: (text: string) => void;
  onSubmit: () => void;
  query: string;
  subtextColor: string;
  textColor: string;
}) {
  const hasQuery = query.trim().length > 0;

  return (
    <View style={[styles.searchBar, { borderColor }]}>
      <View style={styles.searchIconWrapper}>
        <Svg height={20} viewBox="0 0 24 24" width={20}>
          <Circle cx="11" cy="11" fill="none" r="7" stroke={subtextColor} strokeWidth="2" />
          <Path d="M16.5 16.5L21 21" fill="none" stroke={subtextColor} strokeLinecap="round" strokeWidth="2" />
        </Svg>
      </View>

      <TextInput
        accessibilityLabel={translate('deep_space.search')}
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        placeholder={translate('deep_space.search_placeholder')}
        placeholderTextColor={subtextColor}
        returnKeyType="search"
        style={[styles.input, { color: textColor }]}
        testID="deep-space-map-search-input"
        value={query}
      />

      {hasQuery && (
        <Pressable
          accessibilityLabel={translate('deep_space.search_clear_input')}
          accessibilityRole="button"
          onPress={() => onChange('')}
          style={styles.iconBtn}
          testID="deep-space-map-search-clear"
        >
          <Text style={[styles.clearIconText, { color: subtextColor }]}>✕</Text>
        </Pressable>
      )}

      <Pressable
        accessibilityLabel={translate('deep_space.search')}
        accessibilityRole="button"
        onPress={onSubmit}
        style={[styles.submitBtn, { minHeight: 48, minWidth: 48 }]}
        testID="deep-space-map-search-submit"
      >
        <Svg height={22} viewBox="0 0 24 24" width={22}>
          <Circle cx="11" cy="11" fill="none" r="7" stroke={accentColor} strokeWidth="2" />
          <Path d="M16.5 16.5L21 21" fill="none" stroke={accentColor} strokeLinecap="round" strokeWidth="2" />
        </Svg>
      </Pressable>
    </View>
  );
}

function SearchEntryTabs({
  accentColor,
  activeTab,
  bgCard,
  borderColor,
  nightMode,
  onSelectTab,
  textColor,
}: {
  accentColor: string;
  activeTab: SearchTab;
  bgCard: string;
  borderColor: string;
  nightMode: boolean;
  onSelectTab: (tab: SearchTab) => void;
  textColor: string;
}) {
  const tabs: { key: SearchTab; labelKey: TxKeyPath }[] = [
    { key: 'popular', labelKey: 'deep_space.search_popular_targets' },
    { key: 'visible', labelKey: 'deep_space.search_visible_targets' },
    { key: 'favorites', labelKey: 'deep_space.search_favorites' },
    { key: 'recent', labelKey: 'deep_space.search_recent' },
    { key: 'browse', labelKey: 'deep_space.search_browse' },
  ];

  return (
    <ScrollView
      accessibilityRole="tablist"
      contentContainerStyle={styles.entryRow}
      horizontal
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
      style={styles.entryScroll}
      testID="deep-space-search-tabs"
    >
      {tabs.map((tab) => {
        const isSelected = activeTab === tab.key;
        const activeBg = nightMode ? 'rgba(183, 28, 28, 0.4)' : 'rgba(56, 189, 248, 0.2)';
        return (
          <Pressable
            accessibilityLabel={translate(tab.labelKey)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            key={tab.key}
            onPress={() => onSelectTab(tab.key)}
            style={[
              styles.entryTab,
              { backgroundColor: bgCard, borderColor },
              isSelected && { backgroundColor: activeBg, borderColor: accentColor },
            ]}
            testID={`deep-space-search-tab-${tab.key}`}
          >
            <Text numberOfLines={1} style={[styles.entryTabText, { color: isSelected ? accentColor : textColor }]}>
              {translate(tab.labelKey)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function SearchEmptyState({
  message,
  subtextColor,
  testID = 'deep-space-search-empty-state',
}: {
  message: string;
  subtextColor: string;
  testID?: string;
}) {
  return (
    <View style={styles.emptyState} testID={testID}>
      <Text style={[styles.emptyText, { color: subtextColor }]}>
        {message}
      </Text>
    </View>
  );
}

function SearchCollectionToolbar({
  action,
  borderColor,
  count,
  subtitle,
  textColor,
}: {
  action?: React.ReactNode;
  borderColor: string;
  count: number;
  subtitle?: React.ReactNode;
  textColor: string;
}) {
  return (
    <View style={[styles.collectionToolbar, { borderColor }]} testID="deep-space-search-collection-toolbar">
      <View style={styles.collectionToolbarLeft}>
        <Text style={[styles.collectionCountText, { color: textColor }]}>
          {translate('deep_space.search_collection_count', { count })}
        </Text>
        {subtitle}
      </View>
      {Boolean(action) && (
        <View style={styles.collectionToolbarRight}>
          {action}
        </View>
      )}
    </View>
  );
}

function resolveDisplayInfo(
  item: CelestialSearchItem | RecentSkyObject,
  isZh: boolean,
) {
  if ('nameZh' in item) {
    const names = getObjectDisplayNames(item, isZh);
    return {
      category: item.category || guessCategory(item.id),
      constellationLabel: isZh ? item.constellationZh : item.constellationEn,
      names,
      typeLabel: isZh ? item.typeZh : item.typeEn,
    };
  }
  const matched = ALL_CELESTIAL_OBJECTS.find(
    o => o.id === item.id || (Boolean(item.catalogId) && o.id === item.catalogId),
  );
  if (matched) {
    const names = getObjectDisplayNames(matched, isZh);
    return {
      category: matched.category || guessCategory(matched.id),
      constellationLabel: isZh ? matched.constellationZh : matched.constellationEn,
      names,
      typeLabel: isZh ? matched.typeZh : matched.typeEn,
    };
  }
  return {
    category: guessCategory(item.id),
    constellationLabel: '',
    names: {
      primary: item.name,
      secondary: '',
    },
    typeLabel: item.typeZh || '',
  };
}

type SearchResultRowProps<T extends CelestialSearchItem | RecentSkyObject = CelestialSearchItem | RecentSkyObject> = {
  accentColor: string;
  borderColor: string;
  item: T;
  metrics?: Record<string, CelestialMetricsItem>;
  nightMode: boolean;
  onSelectItem: (item: T) => void;
  onToggleFavorite?: (id: string) => void;
  subtextColor: string;
  textColor: string;
  testID?: string;
  trailingAction?: React.ReactNode;
};

function SearchResultRow<T extends CelestialSearchItem | RecentSkyObject>({
  accentColor,
  borderColor,
  item,
  metrics,
  nightMode,
  onSelectItem,
  onToggleFavorite,
  subtextColor,
  textColor,
  testID,
  trailingAction,
}: SearchResultRowProps<T>) {
  const isZh = (i18n.language || 'zh').startsWith('zh');
  const info = resolveDisplayInfo(item, isZh);
  const isFav = isFavoriteSkyObject(storage, item.id);
  const itemMetrics = metrics?.[item.id];
  const hasLiveMetrics = Boolean(itemMetrics && itemMetrics.available);
  const rowTestId = testID || `deep-space-search-item-${item.id}`;

  return (
    <View style={[styles.rowItem, { borderColor }]}>
      <Pressable
        onPress={() => onSelectItem(item)}
        style={styles.rowMainTouchable}
        testID={rowTestId}
      >
        <CelestialAvatar category={info.category} nightMode={nightMode} />

        <View style={styles.rowInfo}>
          <View style={styles.rowTitleWrap}>
            <Text numberOfLines={1} style={[styles.rowTitle, { color: textColor }]}>
              {info.names.primary}
            </Text>
            {Boolean(info.names.secondary) && (
              <Text numberOfLines={1} style={[styles.rowSecondary, { color: subtextColor }]}>
                {info.names.secondary}
              </Text>
            )}
          </View>

          <View style={styles.rowSubWrap}>
            {Boolean(info.typeLabel) && (
              <Text numberOfLines={1} style={[styles.rowSub, { color: subtextColor }]}>
                {info.typeLabel}
                {Boolean(info.constellationLabel) && ` · ${info.constellationLabel}`}
              </Text>
            )}

            {itemMetrics && !itemMetrics.available && itemMetrics.reason && itemMetrics.reason !== 'available' && (
              <Text style={[styles.rowMetric, { color: subtextColor }]}>
                {translate(SEARCH_FAILURE_KEYS[itemMetrics.reason])}
              </Text>
            )}
            {hasLiveMetrics && typeof itemMetrics?.altDeg === 'number' && (
              <Text style={[styles.rowMetric, { color: accentColor }]}>
                {translate('deep_space.search_altitude', { alt: itemMetrics.altDeg.toFixed(1) })}
              </Text>
            )}
            {hasLiveMetrics && typeof itemMetrics?.vmag === 'number' && (
              <Text style={[styles.rowMetric, { color: accentColor }]}>
                {`${itemMetrics.vmag.toFixed(1)} mag`}
              </Text>
            )}
          </View>
        </View>
      </Pressable>

      {trailingAction !== undefined
        ? (
            trailingAction
          )
        : onToggleFavorite
          ? (
              <Pressable
                accessibilityLabel="收藏"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => onToggleFavorite?.(item.id)}
                style={styles.favBtn}
                testID={`deep-space-toggle-favorite-${item.id}`}
              >
                <StarIcon isFav={isFav} nightMode={nightMode} />
              </Pressable>
            )
          : null}
    </View>
  );
}

function BrowseCategoryView({
  accentColor,
  borderColor,
  category,
  items,
  nightMode,
  onSelectCategory,
  onSelectItem,
  onToggleFavorite,
  subtextColor,
  textColor,
}: {
  accentColor: string;
  borderColor: string;
  category: ExtendedCelestialCategory;
  items: CelestialSearchItem[];
  nightMode: boolean;
  onSelectCategory: (category: ExtendedCelestialCategory) => void;
  onSelectItem: (item: CelestialSearchItem) => void;
  onToggleFavorite: (id: string) => void;
  subtextColor: string;
  textColor: string;
}) {
  const activeBg = nightMode ? 'rgba(183, 28, 28, 0.5)' : 'rgba(56, 189, 248, 0.25)';

  return (
    <View style={styles.sectionContainer}>
      <SearchCollectionToolbar
        borderColor={borderColor}
        count={items.length}
        textColor={textColor}
      />

      <View style={styles.categoryGrid}>
        {CATEGORIES.map((cat) => {
          const isSelected = category === cat.id;
          return (
            <Pressable
              accessibilityLabel={translate(cat.labelKey)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              key={cat.id}
              onPress={() => onSelectCategory(cat.id)}
              style={[
                styles.categoryGridChip,
                { borderColor },
                isSelected
                  ? { backgroundColor: activeBg, borderColor: accentColor }
                  : { backgroundColor: 'transparent' },
              ]}
              testID={`deep-space-search-category-${cat.id}`}
            >
              <Text style={[styles.categoryGridChipText, { color: isSelected ? accentColor : textColor }]}>
                {translate(cat.labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        contentContainerStyle={styles.listContent}
        data={items}
        keyExtractor={item => item.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={(
          <SearchEmptyState
            message={translate('deep_space.search_no_results')}
            subtextColor={subtextColor}
          />
        )}
        renderItem={({ item }) => (
          <SearchResultRow
            accentColor={accentColor}
            borderColor={borderColor}
            item={item}
            nightMode={nightMode}
            onSelectItem={onSelectItem}
            onToggleFavorite={onToggleFavorite}
            subtextColor={subtextColor}
            textColor={textColor}
          />
        )}
      />
    </View>
  );
}

function RecentHistoryView({
  accentColor,
  borderColor,
  items,
  nightMode,
  onClearHistory,
  onRemoveRecent,
  onSelectRecent,
  subtextColor,
  textColor,
}: {
  accentColor: string;
  borderColor: string;
  items: RecentSkyObject[];
  nightMode: boolean;
  onClearHistory: () => void;
  onRemoveRecent?: (id: string) => void;
  onSelectRecent: (object: RecentSkyObject) => void;
  subtextColor: string;
  textColor: string;
}) {
  return (
    <View style={styles.sectionContainer}>
      <SearchCollectionToolbar
        action={(
          <Pressable
            accessibilityLabel={translate('deep_space.search_clear_history')}
            accessibilityRole="button"
            onPress={onClearHistory}
            style={[styles.toolbarActionBtn, { borderColor: accentColor }]}
            testID="deep-space-clear-history-btn"
          >
            <Text style={[styles.toolbarActionBtnText, { color: accentColor }]}>
              {translate('deep_space.search_clear_history')}
            </Text>
          </Pressable>
        )}
        borderColor={borderColor}
        count={items.length}
        textColor={textColor}
      />

      <FlatList
        contentContainerStyle={styles.listContent}
        data={items}
        keyExtractor={item => item.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={(
          <SearchEmptyState
            message={translate('deep_space.search_no_recent')}
            subtextColor={subtextColor}
          />
        )}
        renderItem={({ item }) => (
          <SearchResultRow
            accentColor={accentColor}
            borderColor={borderColor}
            item={item}
            nightMode={nightMode}
            onSelectItem={onSelectRecent}
            subtextColor={subtextColor}
            textColor={textColor}
            testID={`deep-space-search-recent-${item.id}`}
            trailingAction={onRemoveRecent
              ? (
                  <Pressable
                    accessibilityLabel="删除"
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => onRemoveRecent(item.id)}
                    style={styles.removeRecentBtn}
                    testID={`deep-space-remove-recent-${item.id}`}
                  >
                    <Text style={[styles.removeRecentText, { color: subtextColor }]}>✕</Text>
                  </Pressable>
                )
              : null}
          />
        )}
      />
    </View>
  );
}

function FavoritesView({
  accentColor,
  borderColor,
  items,
  nightMode,
  onSelectRecent,
  onToggleFavorite,
  subtextColor,
  textColor,
}: {
  accentColor: string;
  borderColor: string;
  items: (CelestialSearchItem & { name: string })[];
  nightMode: boolean;
  onSelectRecent: (object: RecentSkyObject | CelestialSearchItem) => void;
  onToggleFavorite: (id: string) => void;
  subtextColor: string;
  textColor: string;
}) {
  return (
    <View style={styles.sectionContainer}>
      <SearchCollectionToolbar
        borderColor={borderColor}
        count={items.length}
        textColor={textColor}
      />
      <FlatList
        contentContainerStyle={styles.listContent}
        data={items}
        keyExtractor={item => item.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={(
          <SearchEmptyState
            message={translate('deep_space.search_no_favorites')}
            subtextColor={subtextColor}
          />
        )}
        renderItem={({ item }) => (
          <SearchResultRow
            accentColor={accentColor}
            borderColor={borderColor}
            item={item}
            nightMode={nightMode}
            onSelectItem={onSelectRecent}
            onToggleFavorite={onToggleFavorite}
            subtextColor={subtextColor}
            textColor={textColor}
            testID={`deep-space-search-favorite-${item.id}`}
          />
        )}
      />
    </View>
  );
}

type PopularTargetsViewProps = {
  accentColor: string;
  borderColor: string;
  items: CelestialSearchItem[];
  metrics?: Record<string, CelestialMetricsItem>;
  metricsRefreshing?: boolean;
  nightMode: boolean;
  onRefreshMetrics?: () => void;
  onSelectItem: (item: CelestialSearchItem) => void;
  onToggleFavorite: (id: string) => void;
  showVisibleTitle: boolean;
  subtextColor: string;
  textColor: string;
  visibleTargetsPending: boolean;
};

function PopularTargetsView({
  accentColor,
  borderColor,
  items,
  metrics,
  metricsRefreshing,
  nightMode,
  onRefreshMetrics,
  onSelectItem,
  onToggleFavorite,
  showVisibleTitle,
  subtextColor,
  textColor,
  visibleTargetsPending,
}: PopularTargetsViewProps) {
  const refreshLabel = translate(metricsRefreshing ? 'deep_space.search_refreshing' : 'deep_space.search_refresh');

  return (
    <View style={styles.sectionContainer}>
      <SearchCollectionToolbar
        action={showVisibleTitle
          ? (
              <Pressable
                accessibilityLabel={refreshLabel}
                accessibilityRole="button"
                accessibilityState={{
                  busy: Boolean(metricsRefreshing),
                  disabled: Boolean(metricsRefreshing),
                }}
                disabled={Boolean(metricsRefreshing)}
                onPress={onRefreshMetrics}
                style={[styles.toolbarActionBtn, { borderColor: accentColor }]}
                testID="deep-space-visible-refresh"
              >
                <Text style={[styles.toolbarActionBtnText, { color: accentColor }]}>
                  {refreshLabel}
                </Text>
              </Pressable>
            )
          : undefined}
        borderColor={borderColor}
        count={items.length}
        subtitle={showVisibleTitle
          ? (
              <Text style={[styles.snapshotText, { color: subtextColor }]}>
                {translate('deep_space.search_visible_snapshot')}
              </Text>
            )
          : undefined}
        textColor={textColor}
      />
      <FlatList
        contentContainerStyle={styles.listContent}
        data={items}
        keyExtractor={item => item.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={(
          <SearchEmptyState
            message={translate(visibleTargetsPending ? 'deep_space.search_loading' : 'deep_space.search_no_visible_targets')}
            subtextColor={subtextColor}
          />
        )}
        renderItem={({ item }) => (
          <SearchResultRow
            accentColor={accentColor}
            borderColor={borderColor}
            item={item}
            metrics={showVisibleTitle ? metrics : undefined}
            nightMode={nightMode}
            onSelectItem={onSelectItem}
            onToggleFavorite={onToggleFavorite}
            subtextColor={subtextColor}
            textColor={textColor}
            testID={`deep-space-popular-${item.id}`}
          />
        )}
      />
    </View>
  );
}

function SearchResultsListView({
  accentColor,
  borderColor,
  metrics,
  nightMode,
  onSelectItem,
  onToggleFavorite,
  searchResults,
  subtextColor,
  textColor,
}: {
  accentColor: string;
  borderColor: string;
  metrics?: Record<string, CelestialMetricsItem>;
  nightMode: boolean;
  onSelectItem: (item: CelestialSearchItem) => void;
  onToggleFavorite: (id: string) => void;
  searchResults: CelestialSearchItem[];
  subtextColor: string;
  textColor: string;
}) {
  return (
    <FlatList
      contentContainerStyle={styles.listContent}
      data={searchResults}
      keyExtractor={item => item.id}
      keyboardShouldPersistTaps="handled"
      ListEmptyComponent={(
        <SearchEmptyState
          message={translate('deep_space.search_no_results')}
          subtextColor={subtextColor}
        />
      )}
      renderItem={({ item }) => (
        <SearchResultRow
          accentColor={accentColor}
          borderColor={borderColor}
          item={item}
          metrics={metrics}
          nightMode={nightMode}
          onSelectItem={onSelectItem}
          onToggleFavorite={onToggleFavorite}
          subtextColor={subtextColor}
          textColor={textColor}
        />
      )}
    />
  );
}

type SearchBodyContentProps = {
  accentColor: string;
  activeTab: SearchTab;
  bgCard: string;
  bgSheet?: string;
  borderColor: string;
  browseCategoryItems: CelestialSearchItem[];
  category: ExtendedCelestialCategory;
  favoriteItems: (CelestialSearchItem & { name: string })[];
  hasQuery: boolean;
  metrics?: Record<string, CelestialMetricsItem>;
  metricsRefreshing?: boolean;
  nightMode: boolean;
  onClearHistory: () => void;
  onRefreshMetrics?: () => void;
  onRemoveRecent?: (id: string) => void;
  onSelectCategory: (category: ExtendedCelestialCategory) => void;
  onSelectItem: (item: CelestialSearchItem) => void;
  onSelectRecent: (object: RecentSkyObject | CelestialSearchItem) => void;
  onToggleFavorite: (id: string) => void;
  popularItems: CelestialSearchItem[];
  recentList: RecentSkyObject[];
  searchResults: CelestialSearchItem[];
  showVisibleTitle: boolean;
  subtextColor: string;
  textColor: string;
  visibleTargetsPending: boolean;
};

function SearchBodyContent(props: SearchBodyContentProps) {
  if (props.hasQuery) {
    return (
      <SearchResultsListView
        accentColor={props.accentColor}
        borderColor={props.borderColor}
        metrics={props.metrics}
        nightMode={props.nightMode}
        onSelectItem={props.onSelectItem}
        onToggleFavorite={props.onToggleFavorite}
        searchResults={props.searchResults}
        subtextColor={props.subtextColor}
        textColor={props.textColor}
      />
    );
  }

  if (props.activeTab === 'browse') {
    return (
      <BrowseCategoryView
        accentColor={props.accentColor}
        borderColor={props.borderColor}
        category={props.category}
        items={props.browseCategoryItems}
        nightMode={props.nightMode}
        onSelectCategory={props.onSelectCategory}
        onSelectItem={props.onSelectItem}
        onToggleFavorite={props.onToggleFavorite}
        subtextColor={props.subtextColor}
        textColor={props.textColor}
      />
    );
  }

  if (props.activeTab === 'recent') {
    return (
      <RecentHistoryView
        accentColor={props.accentColor}
        borderColor={props.borderColor}
        items={props.recentList}
        nightMode={props.nightMode}
        onClearHistory={props.onClearHistory}
        onRemoveRecent={props.onRemoveRecent}
        onSelectRecent={props.onSelectRecent}
        subtextColor={props.subtextColor}
        textColor={props.textColor}
      />
    );
  }

  if (props.activeTab === 'favorites') {
    return (
      <FavoritesView
        accentColor={props.accentColor}
        borderColor={props.borderColor}
        items={props.favoriteItems}
        nightMode={props.nightMode}
        onSelectRecent={props.onSelectRecent}
        onToggleFavorite={props.onToggleFavorite}
        subtextColor={props.subtextColor}
        textColor={props.textColor}
      />
    );
  }

  return (
    <PopularTargetsView
      accentColor={props.accentColor}
      borderColor={props.borderColor}
      items={props.popularItems}
      metrics={props.metrics}
      metricsRefreshing={props.metricsRefreshing}
      nightMode={props.nightMode}
      onRefreshMetrics={props.onRefreshMetrics}
      onSelectItem={props.onSelectItem}
      onToggleFavorite={props.onToggleFavorite}
      showVisibleTitle={props.showVisibleTitle}
      subtextColor={props.subtextColor}
      textColor={props.textColor}
      visibleTargetsPending={props.visibleTargetsPending}
    />
  );
}

function useVisibleItemsReporter({
  activeTab,
  allPopularItems,
  browseCategoryItems,
  category,
  onVisibleItemsChange,
  query,
  searchResults,
}: {
  activeTab: SearchTab;
  allPopularItems: CelestialSearchItem[];
  browseCategoryItems: CelestialSearchItem[];
  category: ExtendedCelestialCategory;
  onVisibleItemsChange?: (ids: string[]) => void;
  query: string;
  searchResults: CelestialSearchItem[];
}) {
  const onVisibleItemsChangeRef = React.useRef(onVisibleItemsChange);
  onVisibleItemsChangeRef.current = onVisibleItemsChange;

  const lastReportedIdsRef = React.useRef<string[] | null>(null);

  React.useEffect(() => {
    let rawIds: string[];
    if (query.trim()) {
      rawIds = searchResults.map(item => item.id);
    }
    else if (activeTab === 'browse' && category !== 'all') {
      rawIds = browseCategoryItems.map(item => item.id);
    }
    else {
      rawIds = allPopularItems.map(item => item.id);
    }
    const idsToReport = rawIds.slice(0, 100);

    const last = lastReportedIdsRef.current;
    const isSame = last !== null
      && last.length === idsToReport.length
      && last.every((id, idx) => id === idsToReport[idx]);

    if (!isSame) {
      lastReportedIdsRef.current = idsToReport;
      onVisibleItemsChangeRef.current?.(idsToReport);
    }
  }, [query, category, activeTab, searchResults, browseCategoryItems, allPopularItems]);
}

function useMappedFavorites(favoriteIds: string[], isZh: boolean) {
  return React.useMemo(() => {
    return favoriteIds.map((id) => {
      const found = ALL_CELESTIAL_OBJECTS.find(item => item.id === id);
      if (found) {
        return {
          ...found,
          name: isZh ? found.nameZh : found.nameEn,
        };
      }
      const rawName = id.replace(/^NAME\s+/, '');
      return {
        category: 'stars' as const,
        id,
        name: rawName,
        nameEn: rawName,
        nameZh: rawName,
        typeEn: 'Object',
        typeZh: '天体',
      };
    });
  }, [favoriteIds, isZh]);
}

function useSearchSheetState({
  category,
  metrics,
  metricsRefreshing,
  metricsRetryAvailable,
  onClose,
  onSubmit,
  onVisibleItemsChange,
  pending,
  query,
  recent,
  recentObjects,
}: CelestialSearchSheetProps) {
  const [activeTab, setActiveTab] = React.useState<SearchTab>('popular');
  const [, setFavVersion] = React.useState(0);

  const favoriteIds = getFavoriteIdsFromStorage();
  const isZh = (i18n.language || 'zh').startsWith('zh');

  const handleToggleFavorite = React.useCallback((id: string) => {
    toggleFavoriteSkyObject(storage, id);
    setFavVersion(v => v + 1);
  }, []);

  const handleDismiss = React.useCallback(() => {
    if (Keyboard.isVisible()) {
      Keyboard.dismiss();
      return;
    }
    onClose();
  }, [onClose]);

  const handleSubmit = React.useCallback(() => {
    if (pending) {
      return;
    }
    onSubmit();
  }, [pending, onSubmit]);

  const allPopularItems = React.useMemo(() => ALL_CELESTIAL_OBJECTS.filter(item => item.popular), []);

  const visiblePopularItems = React.useMemo(() => {
    if (!metrics) {
      return [];
    }
    const above = allPopularItems.filter((item) => {
      const m = metrics[item.id];
      return m && m.available === true && typeof m.altDeg === 'number' && Number.isFinite(m.altDeg) && m.altDeg > 0;
    });
    return above.sort((a, b) => ((metrics[b.id]?.altDeg ?? 0) - (metrics[a.id]?.altDeg ?? 0)));
  }, [allPopularItems, metrics]);
  const visibleTargetsPending = metricsRefreshing ?? (!metricsRetryAvailable && allPopularItems.some((item) => {
    const m = metrics?.[item.id];
    return !m || m.reason === 'loading';
  }));

  const browseCategoryItems = React.useMemo(() => {
    if (category === 'all') {
      return ALL_CELESTIAL_OBJECTS.slice(0, 100);
    }
    return ALL_CELESTIAL_OBJECTS.filter(item => item.category === category);
  }, [category]);

  const searchResults = React.useMemo(() => {
    if (!query.trim()) {
      return [];
    }
    return searchCelestialObjects(query, category as CelestialSearchCategory, 100);
  }, [query, category]);

  useVisibleItemsReporter({
    activeTab,
    allPopularItems,
    browseCategoryItems,
    category,
    onVisibleItemsChange,
    query,
    searchResults,
  });

  const recentList = recentObjects || recent || [];
  const favoriteItems = useMappedFavorites(favoriteIds, isZh);
  const hasQuery = query.trim().length > 0;

  return {
    activeTab,
    allPopularItems,
    browseCategoryItems,
    favoriteItems,
    handleDismiss,
    handleSubmit,
    handleToggleFavorite,
    hasQuery,
    recentList,
    searchResults,
    setActiveTab,
    visiblePopularItems,
    visibleTargetsPending,
  };
}

function SearchStatusBanner({
  accentColor,
  error,
  errorReason = 'not_found',
  metricsRetryAvailable,
  onRetry,
  pending,
}: {
  accentColor: string;
  error: boolean;
  errorReason?: SearchFailureReason;
  metricsRetryAvailable?: boolean;
  onRetry?: () => void;
  pending: boolean;
}) {
  return (
    <>
      {pending && (
        <View style={styles.pendingRow}>
          <Text style={[styles.pendingText, { color: accentColor }]}>
            {translate('deep_space.search_pending')}
          </Text>
        </View>
      )}

      {error && (
        <View style={styles.errorRow}>
          <Text style={[styles.errorText, { color: '#f87171' }]} testID="deep-space-map-search-error">
            {translate(SEARCH_FAILURE_KEYS[errorReason])}
          </Text>
        </View>
      )}
      {(error || metricsRetryAvailable) && onRetry && (
        <Pressable accessibilityRole="button" disabled={pending} onPress={onRetry} style={styles.directSubmitBtn} testID="deep-space-search-retry">
          <Text style={[styles.directSubmitText, { color: accentColor }]}>{translate('deep_space.search_retry')}</Text>
        </Pressable>
      )}
    </>
  );
}

function DirectSubmitButton({
  accentColor,
  bgCard,
  onSubmit,
  query,
}: {
  accentColor: string;
  bgCard: string;
  onSubmit: () => void;
  query: string;
}) {
  return (
    <Pressable
      accessibilityLabel={translate('deep_space.search_in_star_map', { query })}
      accessibilityRole="button"
      onPress={onSubmit}
      style={[styles.directSubmitBtn, { backgroundColor: bgCard, borderColor: accentColor }]}
      testID="deep-space-search-direct-submit"
    >
      <Text style={[styles.directSubmitText, { color: accentColor }]}>
        {translate('deep_space.search_in_star_map', { query })}
      </Text>
    </Pressable>
  );
}

export function CelestialSearchSheet(props: CelestialSearchSheetProps) {
  const insets = useSafeAreaInsets();
  const state = useSearchSheetState(props);
  const colors = getThemeColors(props.nightMode);

  return (
    <Modal
      animationType="none"
      onRequestClose={state.handleDismiss}
      testID="deep-space-search-modal"
      transparent
      visible
    >
      <View
        accessibilityViewIsModal
        style={styles.overlay}
        testID="deep-space-reference-search-sheet"
      >
        <Pressable
          accessibilityLabel={translate('deep_space.back')}
          accessibilityRole="button"
          onPress={state.handleDismiss}
          style={styles.backdrop}
          testID="deep-space-search-backdrop"
        />

        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.bgSheet,
              borderColor: colors.borderColor,
              paddingBottom: 12,
              paddingTop: insets.top + 8,
            },
          ]}
          testID="deep-space-search-safe-area"
        >
          <SearchHeaderBar
            {...colors}
            onChange={props.onChange}
            onSubmit={state.handleSubmit}
            query={props.query}
          />

          <SearchStatusBanner
            accentColor={colors.accentColor}
            error={props.error}
            errorReason={props.errorReason}
            metricsRetryAvailable={props.metricsRetryAvailable}
            onRetry={props.onRetry}
            pending={Boolean(props.pending)}
          />

          {!state.hasQuery && (
            <SearchEntryTabs
              {...colors}
              activeTab={state.activeTab}
              nightMode={Boolean(props.nightMode)}
              onSelectTab={state.setActiveTab}
            />
          )}

          {state.hasQuery && (props.error || state.searchResults.length === 0) && (
            <DirectSubmitButton
              accentColor={colors.accentColor}
              bgCard={colors.bgCard}
              onSubmit={state.handleSubmit}
              query={props.query}
            />
          )}

          <View style={styles.body}>
            <SearchBodyContent
              {...colors}
              activeTab={state.activeTab}
              browseCategoryItems={state.browseCategoryItems}
              category={props.category}
              favoriteItems={state.favoriteItems}
              hasQuery={state.hasQuery}
              metrics={props.metrics}
              metricsRefreshing={props.metricsRefreshing}
              nightMode={Boolean(props.nightMode)}
              onClearHistory={props.onClearHistory}
              onRefreshMetrics={props.onRefreshMetrics}
              onRemoveRecent={props.onRemoveRecent}
              onSelectCategory={props.onSelectCategory}
              onSelectItem={props.onSelectItem}
              onSelectRecent={props.onSelectRecent}
              onToggleFavorite={state.handleToggleFavorite}
              popularItems={state.activeTab === 'visible' ? state.visiblePopularItems : state.allPopularItems}
              recentList={state.recentList}
              searchResults={state.searchResults}
              showVisibleTitle={state.activeTab === 'visible'}
              visibleTargetsPending={state.visibleTargetsPending}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  body: {
    flex: 1,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  categoryGridChip: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: '30%',
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  categoryGridChipText: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  clearIconText: {
    fontSize: 15,
    fontWeight: '600',
  },
  collectionCountText: {
    fontSize: 14,
    fontWeight: '600',
  },
  collectionToolbar: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
    minHeight: 40,
    paddingVertical: 4,
  },
  collectionToolbarLeft: {
    flex: 1,
    justifyContent: 'center',
    paddingRight: 8,
  },
  collectionToolbarRight: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  directSubmitBtn: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    marginBottom: 12,
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  directSubmitText: {
    fontSize: 14,
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
  entryRow: {
    flexDirection: 'row',
    flexGrow: 1,
    gap: 8,
  },
  entryScroll: {
    flexGrow: 0,
    marginBottom: 8,
  },
  entryTab: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 40,
    minWidth: 48,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  entryTabText: {
    fontSize: 13,
    fontWeight: '500',
  },
  errorRow: {
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  errorText: {
    fontSize: 13,
  },
  favBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 48,
  },
  iconBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 44,
  },
  input: {
    flex: 1,
    fontSize: 15,
    minHeight: 44,
    paddingHorizontal: 4,
  },
  listContent: {
    flexGrow: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  pendingRow: {
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  pendingText: {
    fontSize: 13,
    fontWeight: '500',
  },
  removeRecentBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 48,
  },
  removeRecentText: {
    fontSize: 15,
    fontWeight: '600',
  },
  rowInfo: {
    flex: 1,
    justifyContent: 'center',
    marginLeft: 12,
    minWidth: 0,
  },
  rowItem: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 52,
    paddingVertical: 6,
  },
  rowMainTouchable: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    minHeight: 48,
  },
  rowMetric: {
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 8,
  },
  rowSecondary: {
    flexShrink: 1,
    fontSize: 12,
    marginLeft: 6,
  },
  rowSub: {
    fontSize: 12,
  },
  rowSubWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 2,
  },
  rowTitle: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  rowTitleWrap: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 16,
  },
  searchBar: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 8,
    minHeight: 44,
    paddingLeft: 12,
    paddingRight: 4,
  },
  searchIconWrapper: {
    marginRight: 8,
  },
  sectionContainer: {
    flex: 1,
  },
  sheet: {
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    borderWidth: 1,
    borderTopWidth: 0,
    height: '52%',
    paddingHorizontal: 16,
  },
  snapshotText: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 4,
  },
  submitBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarActionBtn: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 48,
    paddingHorizontal: 12,
  },
  toolbarActionBtnText: {
    fontSize: 13,
    fontWeight: '500',
  },
});
