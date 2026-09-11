/* eslint-disable react/no-unnecessary-use-prefix */
import type { CelestialSearchSheetProps } from './celestial-search-sheet';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import * as React from 'react';
import { Keyboard } from 'react-native';
import i18n, { translate } from '@/lib/i18n';
import { storage } from '@/lib/storage';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import { isFavoriteSkyObject, toggleFavoriteSkyObject } from '../tools/favorite-sky-objects';
import { ALL_CELESTIAL_OBJECTS } from './celestial-catalog';
import { CelestialSearchSheet } from './celestial-search-sheet';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 24, left: 0, right: 0, top: 32 }),
}));

function makeProps(overrides: Partial<CelestialSearchSheetProps> = {}): CelestialSearchSheetProps {
  return {
    category: 'all',
    error: false,
    onChange: jest.fn(),
    onClearHistory: jest.fn(),
    onClose: jest.fn(),
    onSelectCategory: jest.fn(),
    onSelectItem: jest.fn(),
    onSelectRecent: jest.fn(),
    onSubmit: jest.fn(),
    query: '',
    recentObjects: [],
    ...overrides,
  };
}

beforeEach(async () => {
  jest.useFakeTimers();
  // App language changes reload the runtime; keep each locale test equally isolated.
  translate.cache.clear?.();
  const values = new Map<string, string>();
  jest.mocked(storage.getString).mockImplementation(key => values.get(key));
  jest.mocked(storage.set).mockImplementation((key, value) => {
    values.set(key, String(value));
  });
  await act(async () => {
    await i18n.changeLanguage('zh');
  });
});

afterEach(() => {
  act(() => {
    jest.runOnlyPendingTimers();
  });
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it('opens with manually selectable target lists and keeps all three existing entry points', () => {
  render(<CelestialSearchSheet {...makeProps()} />);
  expect(screen.getByTestId('deep-space-map-search-input').props.value).toBe('');
  expect(screen.getByRole('tab', { name: '热门天体', selected: true })).toBeTruthy();
  expect(screen.getByRole('tab', { name: '当前可见', selected: false })).toBeTruthy();
  expect(screen.getByRole('tab', { name: '收藏夹' })).toBeTruthy();
  expect(screen.getByRole('tab', { name: '最近' })).toBeTruthy();
  expect(screen.getByRole('tab', { name: '浏览' })).toBeTruthy();
  expect(screen.queryAllByTestId(/^deep-space-search-item-/)).toHaveLength(0);
});

it.each(['zh', 'en'])('searches Chinese and English with a %s interface', async (language) => {
  await act(async () => {
    await i18n.changeLanguage(language);
  });
  const props = makeProps({ query: '木星' });
  const { rerender } = render(<CelestialSearchSheet {...props} />);
  expect(screen.getByText('Jupiter')).toBeTruthy();
  expect(screen.getByText('木星')).toBeTruthy();
  fireEvent.press(screen.getByTestId('deep-space-search-item-NAME Jupiter'));
  expect(props.onSelectItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'NAME Jupiter' }));
  rerender(<CelestialSearchSheet {...props} query="Jupiter" />);
  expect(screen.getByTestId('deep-space-search-item-NAME Jupiter')).toBeTruthy();
});

it('keeps clear, submit and localized direct engine search available for unknown names', () => {
  const props = makeProps({ error: true, query: 'C/2030 Unknown' });
  render(<CelestialSearchSheet {...props} />);
  fireEvent.press(screen.getByTestId('deep-space-search-direct-submit'));
  expect(props.onSubmit).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('deep-space-map-search-error')).toBeTruthy();
  expect(screen.getByRole('button', { name: '在星图中查找“C/2030 Unknown”' })).toBeTruthy();
  fireEvent.press(screen.getByTestId('deep-space-map-search-clear'));
  expect(props.onChange).toHaveBeenCalledWith('');
});

it('suppresses duplicate engine requests while pending without hiding errors', () => {
  const props = makeProps({ error: true, pending: true, query: 'unknown' });
  render(<CelestialSearchSheet {...props} />);
  fireEvent.press(screen.getByTestId('deep-space-map-search-submit'));
  fireEvent.press(screen.getByTestId('deep-space-search-direct-submit'));
  fireEvent(screen.getByTestId('deep-space-map-search-input'), 'submitEditing');
  expect(props.onSubmit).not.toHaveBeenCalled();
  expect(screen.getByText('正在查找…')).toBeTruthy();
  expect(screen.getByTestId('deep-space-map-search-error')).toBeTruthy();
});

it('browses all six categories including non-popular catalog entries', () => {
  const props = makeProps();
  const { rerender } = render(<CelestialSearchSheet {...props} />);
  fireEvent.press(screen.getByRole('tab', { name: '浏览' }));
  for (const id of ['all', 'solar_system', 'stars', 'constellation', 'dso', 'satellites']) {
    expect(screen.getByTestId(`deep-space-search-category-${id}`)).toBeTruthy();
  }
  fireEvent.press(screen.getByTestId('deep-space-search-category-solar_system'));
  expect(props.onSelectCategory).toHaveBeenCalledWith('solar_system');
  rerender(<CelestialSearchSheet {...props} category="solar_system" />);
  expect(screen.getByTestId('deep-space-search-item-NAME Neptune')).toBeTruthy();
});

it('clears or removes recent history without accidentally selecting an object', () => {
  const recent = { id: 'NAME Jupiter', name: '木星', typeZh: '行星' };
  const props = makeProps({ onRemoveRecent: jest.fn(), recentObjects: [recent] });
  render(<CelestialSearchSheet {...props} />);
  fireEvent.press(screen.getByRole('tab', { name: '最近' }));
  fireEvent.press(screen.getByTestId('deep-space-remove-recent-NAME Jupiter'));
  expect(props.onRemoveRecent).toHaveBeenCalledWith('NAME Jupiter');
  expect(props.onSelectRecent).not.toHaveBeenCalled();
  fireEvent.press(screen.getByTestId('deep-space-search-recent-NAME Jupiter'));
  expect(props.onSelectRecent).toHaveBeenCalledWith(recent);
  fireEvent.press(screen.getByTestId('deep-space-clear-history-btn'));
  expect(props.onClearHistory).toHaveBeenCalledTimes(1);
});

it('loads favorite IDs from the existing store and selects through onSelectRecent', () => {
  toggleFavoriteSkyObject(storage, 'NAME Jupiter');
  const props = makeProps();
  render(<CelestialSearchSheet {...props} />);
  fireEvent.press(screen.getByRole('tab', { name: '收藏夹' }));
  fireEvent.press(screen.getByTestId('deep-space-search-favorite-NAME Jupiter'));
  expect(props.onSelectRecent).toHaveBeenCalledWith(expect.objectContaining({ id: 'NAME Jupiter', name: '木星' }));
  fireEvent.press(screen.getByTestId('deep-space-toggle-favorite-NAME Jupiter'));
  expect(isFavoriteSkyObject(storage, 'NAME Jupiter')).toBe(false);
  expect(screen.queryByTestId('deep-space-search-favorite-NAME Jupiter')).toBeNull();
});

it('can favorite a search result without selecting it and restores unknown engine IDs', () => {
  const props = makeProps({ query: 'Jupiter' });
  const { rerender } = render(<CelestialSearchSheet {...props} />);
  fireEvent.press(screen.getByTestId('deep-space-toggle-favorite-NAME Jupiter'));
  expect(isFavoriteSkyObject(storage, 'NAME Jupiter')).toBe(true);
  expect(props.onSelectItem).not.toHaveBeenCalled();
  toggleFavoriteSkyObject(storage, 'ENGINE unknown');
  rerender(<CelestialSearchSheet {...props} query="" />);
  fireEvent.press(screen.getByRole('tab', { name: '收藏夹' }));
  expect(screen.getByTestId('deep-space-search-favorite-ENGINE unknown')).toBeTruthy();
});

it('never presents catalog magnitudes or invented altitude as live engine data', () => {
  render(<CelestialSearchSheet {...makeProps({ query: 'Jupiter' })} />);
  const row = within(screen.getByTestId('deep-space-search-item-NAME Jupiter'));
  expect(row.queryByText(/mag|高度|方位/)).toBeNull();
});

it('sorts above-horizon popular candidates by real altitude and excludes unavailable metrics', () => {
  render(
    <CelestialSearchSheet {...makeProps({ metrics: {
      'NAME Sun': { altDeg: 10, available: true, vmag: -26.7 },
      'NAME Jupiter': { altDeg: 63, available: true, azDeg: 120, vmag: -2.4 },
      'NAME Moon': { altDeg: -3, available: true },
      'NAME Mars': { altDeg: 85, available: false },
    } })}
    />,
  );
  fireEvent.press(screen.getByRole('tab', { name: '当前可见' }));
  expect(screen.getByRole('tab', { name: '当前可见', selected: true })).toBeTruthy();
  const rows = screen.getAllByTestId(/^deep-space-popular-/);
  expect(rows.map(row => row.props.testID)).toEqual(['deep-space-popular-NAME Jupiter', 'deep-space-popular-NAME Sun']);
  expect(screen.getByText(/高度 63.0°/)).toBeTruthy();
  expect(screen.queryByText(/今夜最佳|今晚最佳/)).toBeNull();
});

it('keeps popular targets selected when live visibility data arrives or is cleared', () => {
  const props = makeProps();
  const { rerender } = render(<CelestialSearchSheet {...props} />);
  const metrics = { 'NAME Jupiter': { altDeg: 63, available: true } };
  rerender(<CelestialSearchSheet {...props} metrics={metrics} />);
  expect(screen.getByRole('tab', { name: '热门天体', selected: true })).toBeTruthy();
  expect(screen.getByTestId('deep-space-popular-NAME Moon')).toBeTruthy();
  rerender(<CelestialSearchSheet {...props} metrics={{}} />);
  expect(screen.getByRole('tab', { name: '热门天体', selected: true })).toBeTruthy();
  expect(screen.getByTestId('deep-space-popular-NAME Moon')).toBeTruthy();
});

it('keeps visible mode through loading and empty updates without falling back to popular targets', () => {
  const props = makeProps({ metrics: { 'NAME Jupiter': { altDeg: 63, available: true } } });
  const { rerender } = render(<CelestialSearchSheet {...props} />);
  fireEvent.press(screen.getByRole('tab', { name: '当前可见' }));
  expect(screen.getByTestId('deep-space-popular-NAME Jupiter')).toBeTruthy();

  rerender(<CelestialSearchSheet {...props} metrics={{}} />);
  expect(screen.getByRole('tab', { name: '当前可见', selected: true })).toBeTruthy();
  expect(screen.queryAllByTestId(/^deep-space-popular-/)).toHaveLength(0);
  expect(screen.getByText('正在加载天体数据，请稍后重试')).toBeTruthy();

  const belowHorizonMetrics = Object.fromEntries(ALL_CELESTIAL_OBJECTS.map(item => [item.id, { altDeg: -10, available: true }]));
  rerender(<CelestialSearchSheet {...props} metrics={belowHorizonMetrics} />);
  expect(screen.getByRole('tab', { name: '当前可见', selected: true })).toBeTruthy();
  expect(screen.queryAllByTestId(/^deep-space-popular-/)).toHaveLength(0);
  expect(screen.getByText('当前没有已确认在地平线上方的热门天体')).toBeTruthy();

  fireEvent.press(screen.getByRole('tab', { name: '热门天体' }));
  expect(screen.getByTestId('deep-space-popular-NAME Moon')).toBeTruthy();
});

it('restores the selected list after clearing search and allows returning from recent history', () => {
  const props = makeProps({ metrics: { 'NAME Jupiter': { altDeg: 63, available: true } } });
  const { rerender } = render(<CelestialSearchSheet {...props} />);
  fireEvent.press(screen.getByRole('tab', { name: '当前可见' }));
  rerender(<CelestialSearchSheet {...props} query="Jupiter" />);
  expect(screen.queryByRole('tab', { name: '当前可见' })).toBeNull();
  expect(screen.getByTestId('deep-space-search-item-NAME Jupiter')).toBeTruthy();
  rerender(<CelestialSearchSheet {...props} query="" />);
  expect(screen.getByRole('tab', { name: '当前可见', selected: true })).toBeTruthy();
  expect(screen.queryByTestId('deep-space-popular-NAME Moon')).toBeNull();

  fireEvent.press(screen.getByRole('tab', { name: '最近' }));
  expect(screen.getByText('暂无最近记录')).toBeTruthy();
  fireEvent.press(screen.getByRole('tab', { name: '热门天体' }));
  expect(screen.getByTestId('deep-space-popular-NAME Moon')).toBeTruthy();
});

it('excludes invalid and horizon-level altitudes from the manually selected visible list', () => {
  const props = makeProps({ metrics: {
    'NAME Sun': { altDeg: Number.POSITIVE_INFINITY, available: true },
    'NAME Jupiter': { altDeg: Number.NaN, available: true },
    'NAME Moon': { altDeg: null, available: true },
    'NAME Mars': { altDeg: 0, available: true },
    'NAME Venus': { altDeg: 1, available: true },
  } });
  render(<CelestialSearchSheet {...props} />);
  fireEvent.press(screen.getByRole('tab', { name: '当前可见' }));
  expect(screen.getAllByTestId(/^deep-space-popular-/).map(row => row.props.testID)).toEqual(['deep-space-popular-NAME Venus']);
});

it('shows retry rather than an endless loading state when visible metrics time out', () => {
  const props = makeProps({ metrics: {}, metricsRetryAvailable: true, onRetry: jest.fn() });
  render(<CelestialSearchSheet {...props} />);
  fireEvent.press(screen.getByRole('tab', { name: '当前可见' }));
  expect(screen.queryByText('正在加载天体数据，请稍后重试')).toBeNull();
  expect(screen.getByText('当前没有已确认在地平线上方的热门天体')).toBeTruthy();
  fireEvent.press(screen.getByTestId('deep-space-search-retry'));
  expect(props.onRetry).toHaveBeenCalledTimes(1);
});

it.each([
  { language: 'en', popularLabel: 'Popular Targets', visibleLabel: 'Currently Visible', altitudeLabel: 'Alt 63.0°' },
  { language: 'ar', popularLabel: 'أجرام شائعة', visibleLabel: 'مرئي حالياً', altitudeLabel: 'الارتفاع 63.0°' },
])('localizes the selector and visible altitude in $language', async ({ language, popularLabel, visibleLabel, altitudeLabel }) => {
  await act(async () => {
    await i18n.changeLanguage(language);
  });
  render(<CelestialSearchSheet {...makeProps({ metrics: { 'NAME Jupiter': { altDeg: 63, available: true } } })} />);
  expect(screen.getByRole('tab', { name: popularLabel, selected: true })).toBeTruthy();
  fireEvent.press(screen.getByRole('tab', { name: visibleLabel }));
  expect(screen.getByRole('tab', { name: visibleLabel, selected: true })).toBeTruthy();
  expect(screen.getByText(altitudeLabel)).toBeTruthy();
});

it('reports more than twelve popular candidates once and ignores new callback identities or metrics ordering', () => {
  const first = jest.fn();
  const second = jest.fn();
  const props = makeProps({ onVisibleItemsChange: first });
  const { rerender } = render(<CelestialSearchSheet {...props} />);
  expect(first).toHaveBeenCalledTimes(1);
  expect(first.mock.calls[0][0].length).toBeGreaterThan(12);
  expect(first.mock.calls[0][0].length).toBeLessThanOrEqual(100);
  rerender(<CelestialSearchSheet {...props} metrics={{ 'NAME Jupiter': { altDeg: 75, available: true } }} onVisibleItemsChange={second} />);
  expect(second).not.toHaveBeenCalled();
  rerender(<CelestialSearchSheet {...props} onVisibleItemsChange={second} query="Jupiter" />);
  expect(second).toHaveBeenCalledWith(['NAME Jupiter', 'NAME Io', 'NAME Europa', 'NAME Ganymede', 'NAME Callisto']);
});

it('isolates Android back and backdrop taps, dismissing a keyboard before closing', () => {
  const props = makeProps();
  const visible = jest.spyOn(Keyboard, 'isVisible').mockReturnValue(true);
  const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
  render(<CelestialSearchSheet {...props} />);
  fireEvent(screen.getByTestId('deep-space-search-modal'), 'requestClose');
  expect(dismiss).toHaveBeenCalledTimes(1);
  expect(props.onClose).not.toHaveBeenCalled();
  visible.mockReturnValue(false);
  fireEvent.press(screen.getByTestId('deep-space-search-backdrop'));
  expect(props.onClose).toHaveBeenCalledTimes(1);
});

it('uses a reduced-motion-safe modal, safe insets and a red night palette positioned at the top half of the screen', () => {
  render(<CelestialSearchSheet {...makeProps({ nightMode: true, query: 'Jupiter' })} />);
  expect(screen.getByTestId('deep-space-search-modal').props.animationType).toBe('none');
  expect(screen.getByTestId('deep-space-reference-search-sheet').props.accessibilityViewIsModal).toBe(true);
  expect(screen.getByTestId('deep-space-reference-search-sheet')).toHaveStyle({ justifyContent: 'flex-start' });
  expect(screen.getByTestId('deep-space-search-safe-area')).toHaveStyle({
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    height: '52%',
    paddingBottom: 12,
    paddingTop: 40,
  });
  expect(screen.getByTestId('deep-space-map-search-input')).toHaveStyle({ color: '#ef9a9a' });
  expect(screen.getByTestId('deep-space-map-search-submit')).toHaveStyle({ minHeight: 48, minWidth: 48 });
});

it('does not expose storage internals on the search screen', () => {
  storage.set(STORAGE_KEYS.DEEP_SPACE_FAVORITE_OBJECT_IDS, '{broken json');
  render(<CelestialSearchSheet {...makeProps()} />);
  fireEvent.press(screen.getByRole('tab', { name: '收藏夹' }));
  expect(screen.getByText('暂无收藏')).toBeTruthy();
});

it('supports arabic interface and direct search copy', async () => {
  await act(async () => {
    await i18n.changeLanguage('ar');
  });
  const props = makeProps({ query: 'NonExistentSkyTarget' });
  render(<CelestialSearchSheet {...props} />);
  expect(screen.getByTestId('deep-space-search-direct-submit')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'البحث عن “NonExistentSkyTarget” في خريطة النجوم' })).toBeTruthy();
  fireEvent.press(screen.getByTestId('deep-space-search-direct-submit'));
  expect(props.onSubmit).toHaveBeenCalledTimes(1);
});

it.each([
  ['loading', '正在加载天体数据，请稍后重试'],
  ['culture_mismatch', '该天体不属于当前天空文化，请在设置中选择相应文化'],
  ['missing_data', '该天体的数据缺失或已过期，需要更新离线数据'],
  ['failed', '搜索暂时无法完成，请重试'],
] as const)('shows a distinct %s failure with an explicit retry action', (errorReason, message) => {
  const props = makeProps({ error: true, errorReason, onRetry: jest.fn(), query: 'Jupiter' });
  render(<CelestialSearchSheet {...props} />);
  expect(screen.getByTestId('deep-space-map-search-error')).toHaveTextContent(message);
  fireEvent.press(screen.getByTestId('deep-space-search-retry'));
  expect(props.onRetry).toHaveBeenCalledTimes(1);
  expect(props.onSelectItem).not.toHaveBeenCalled();
});

it('shows unavailable row reasons without invented live metrics and permits a bounded-query retry', () => {
  const props = makeProps({
    metrics: { 'NAME Jupiter': { altDeg: 50, available: false, reason: 'loading', vmag: 0 } },
    metricsRetryAvailable: true,
    onRetry: jest.fn(),
    query: 'Jupiter',
  });
  render(<CelestialSearchSheet {...props} />);
  const row = within(screen.getByTestId('deep-space-search-item-NAME Jupiter'));
  expect(row.getByText('正在加载天体数据，请稍后重试')).toBeTruthy();
  expect(row.queryByText(/50.0|0.0 mag/)).toBeNull();
  fireEvent.press(screen.getByTestId('deep-space-search-retry'));
  expect(props.onRetry).toHaveBeenCalledTimes(1);
});

it('supports fallback recent prop and satellites category', () => {
  const recentItem = { id: 'NAME Moon', name: '月亮', typeZh: '天然卫星' };
  const props = makeProps({ recent: [recentItem], recentObjects: undefined });
  render(<CelestialSearchSheet {...props} />);
  fireEvent.press(screen.getByRole('tab', { name: '最近' }));
  expect(screen.getByTestId('deep-space-search-recent-NAME Moon')).toBeTruthy();

  fireEvent.press(screen.getByRole('tab', { name: '浏览' }));
  expect(screen.getByTestId('deep-space-search-category-satellites')).toBeTruthy();
  fireEvent.press(screen.getByTestId('deep-space-search-category-satellites'));
  expect(props.onSelectCategory).toHaveBeenCalledWith('satellites');
});

it('shows manual refresh button and snapshot calculation hint only when visible tab is active with empty query', () => {
  const onRefreshMetrics = jest.fn();
  const props = makeProps({ onRefreshMetrics });
  const { rerender } = render(<CelestialSearchSheet {...props} />);

  expect(screen.queryByTestId('deep-space-visible-refresh')).toBeNull();
  expect(screen.queryByText('按刷新时的时间与位置计算')).toBeNull();

  fireEvent.press(screen.getByRole('tab', { name: '当前可见' }));
  expect(screen.getByTestId('deep-space-visible-refresh')).toBeTruthy();
  expect(screen.getByText('按刷新时的时间与位置计算')).toBeTruthy();

  rerender(<CelestialSearchSheet {...props} query="Jupiter" />);
  expect(screen.queryByTestId('deep-space-visible-refresh')).toBeNull();

  rerender(<CelestialSearchSheet {...props} query="" />);
  expect(screen.getByRole('tab', { name: '当前可见', selected: true })).toBeTruthy();
  expect(screen.getByTestId('deep-space-visible-refresh')).toBeTruthy();

  fireEvent.press(screen.getByRole('tab', { name: '浏览' }));
  expect(screen.queryByTestId('deep-space-visible-refresh')).toBeNull();
});

it('calls onRefreshMetrics when refresh button is tapped and reflects normal idle accessibility state', () => {
  const onRefreshMetrics = jest.fn();
  render(<CelestialSearchSheet {...makeProps({ metricsRefreshing: false, onRefreshMetrics })} />);

  fireEvent.press(screen.getByRole('tab', { name: '当前可见' }));
  const btn = screen.getByTestId('deep-space-visible-refresh');
  expect(within(btn).getByText('刷新')).toBeTruthy();
  expect(btn.props.accessibilityState).toEqual({ busy: false, disabled: false });
  expect(btn.props.accessibilityRole).toBe('button');

  fireEvent.press(btn);
  expect(onRefreshMetrics).toHaveBeenCalledTimes(1);
});

it('disables refresh button and prevents duplicate invocations while metricsRefreshing is true', () => {
  const onRefreshMetrics = jest.fn();
  render(<CelestialSearchSheet {...makeProps({ metricsRefreshing: true, onRefreshMetrics })} />);

  fireEvent.press(screen.getByRole('tab', { name: '当前可见' }));
  const btn = screen.getByTestId('deep-space-visible-refresh');
  expect(within(btn).getByText('刷新中…')).toBeTruthy();
  expect(btn.props.accessibilityState).toEqual({ busy: true, disabled: true });
  expect(btn.props.accessibilityRole).toBe('button');

  fireEvent.press(btn);
  expect(onRefreshMetrics).not.toHaveBeenCalled();
});

it('does not trigger onRefreshMetrics automatically on initial mount or metrics updates', () => {
  const onRefreshMetrics = jest.fn();
  const props = makeProps({
    metrics: { 'NAME Jupiter': { altDeg: 63, available: true } },
    onRefreshMetrics,
  });
  const { rerender } = render(<CelestialSearchSheet {...props} />);

  expect(onRefreshMetrics).not.toHaveBeenCalled();

  fireEvent.press(screen.getByRole('tab', { name: '当前可见' }));
  expect(onRefreshMetrics).not.toHaveBeenCalled();

  rerender(
    <CelestialSearchSheet
      {...props}
      metrics={{
        'NAME Jupiter': { altDeg: 65, available: true },
        'NAME Saturn': { altDeg: 20, available: true },
      }}
    />,
  );
  expect(onRefreshMetrics).not.toHaveBeenCalled();
});

it('retains existing rows during refresh while metricsRefreshing is true', () => {
  const props = makeProps({
    metrics: { 'NAME Jupiter': { altDeg: 63, available: true } },
    metricsRefreshing: true,
  });
  render(<CelestialSearchSheet {...props} />);

  fireEvent.press(screen.getByRole('tab', { name: '当前可见' }));
  expect(screen.getByTestId('deep-space-popular-NAME Jupiter')).toBeTruthy();
  expect(screen.queryByText('正在加载天体数据，请稍后重试')).toBeNull();
});

it('displays empty state rather than endless loading when refresh finishes with no visible targets', () => {
  const props = makeProps({
    metrics: {},
    metricsRefreshing: false,
  });
  render(<CelestialSearchSheet {...props} />);

  fireEvent.press(screen.getByRole('tab', { name: '当前可见' }));
  expect(screen.getByText('当前没有已确认在地平线上方的热门天体')).toBeTruthy();
  expect(screen.queryByText('正在加载天体数据，请稍后重试')).toBeNull();
});

it.each([
  {
    hintText: 'Calculated based on time and location at refresh',
    language: 'en',
    refreshLabel: 'Refresh',
    refreshingLabel: 'Refreshing…',
    visibleTab: 'Currently Visible',
  },
  {
    hintText: 'محسوب بناءً على الوقت والموقع عند التحديث',
    language: 'ar',
    refreshLabel: 'تحديث',
    refreshingLabel: 'جارٍ التحديث…',
    visibleTab: 'مرئي حالياً',
  },
])('localizes manual refresh button and hint text in $language', async ({
  hintText,
  language,
  refreshLabel,
  refreshingLabel,
  visibleTab,
}) => {
  await act(async () => {
    translate.cache.clear?.();
    await i18n.changeLanguage(language);
  });

  const onRefreshMetrics = jest.fn();
  const { rerender } = render(
    <CelestialSearchSheet
      {...makeProps({
        metricsRefreshing: false,
        onRefreshMetrics,
      })}
    />,
  );

  fireEvent.press(screen.getByRole('tab', { name: visibleTab }));
  expect(screen.getByText(hintText)).toBeTruthy();
  const btn = screen.getByTestId('deep-space-visible-refresh');
  expect(within(btn).getByText(refreshLabel)).toBeTruthy();

  rerender(
    <CelestialSearchSheet
      {...makeProps({
        metricsRefreshing: true,
        onRefreshMetrics,
      })}
    />,
  );
  expect(within(screen.getByTestId('deep-space-visible-refresh')).getByText(refreshingLabel)).toBeTruthy();
});

it('renders a single unified collection toolbar with corresponding counts across all five tabs', () => {
  const recent = [{ id: 'NAME Jupiter', name: '木星', typeZh: '行星' }];
  toggleFavoriteSkyObject(storage, 'NAME Jupiter');
  const popularCount = ALL_CELESTIAL_OBJECTS.filter(item => item.popular).length;
  const props = makeProps({
    metrics: { 'NAME Jupiter': { altDeg: 45, available: true } },
    onClearHistory: jest.fn(),
    onRefreshMetrics: jest.fn(),
    recentObjects: recent,
  });
  render(<CelestialSearchSheet {...props} />);

  // 1. Popular tab
  expect(screen.getAllByTestId('deep-space-search-collection-toolbar')).toHaveLength(1);
  expect(screen.getByTestId('deep-space-search-collection-toolbar')).toHaveTextContent(new RegExp(`共 ${popularCount} 个天体`));
  expect(screen.queryByTestId('deep-space-visible-refresh')).toBeNull();
  expect(screen.queryByTestId('deep-space-clear-history-btn')).toBeNull();

  // 2. Visible tab
  fireEvent.press(screen.getByRole('tab', { name: '当前可见' }));
  expect(screen.getAllByTestId('deep-space-search-collection-toolbar')).toHaveLength(1);
  expect(screen.getByTestId('deep-space-search-collection-toolbar')).toHaveTextContent(/共 1 个天体/);
  expect(screen.getByText('按刷新时的时间与位置计算')).toBeTruthy();
  expect(screen.getByTestId('deep-space-visible-refresh')).toBeTruthy();

  // 3. Favorites tab
  fireEvent.press(screen.getByRole('tab', { name: '收藏夹' }));
  expect(screen.getAllByTestId('deep-space-search-collection-toolbar')).toHaveLength(1);
  expect(screen.getByTestId('deep-space-search-collection-toolbar')).toHaveTextContent(/共 1 个天体/);
  expect(screen.queryByTestId('deep-space-visible-refresh')).toBeNull();

  // 4. Recent tab
  fireEvent.press(screen.getByRole('tab', { name: '最近' }));
  expect(screen.getAllByTestId('deep-space-search-collection-toolbar')).toHaveLength(1);
  expect(screen.getByTestId('deep-space-search-collection-toolbar')).toHaveTextContent(/共 1 个天体/);
  expect(screen.getByTestId('deep-space-clear-history-btn')).toBeTruthy();

  // 5. Browse tab
  fireEvent.press(screen.getByRole('tab', { name: '浏览' }));
  expect(screen.getAllByTestId('deep-space-search-collection-toolbar')).toHaveLength(1);
  const browseAllCount = Math.min(ALL_CELESTIAL_OBJECTS.length, 100);
  expect(screen.getByTestId('deep-space-search-collection-toolbar')).toHaveTextContent(new RegExp(`共 ${browseAllCount} 个天体`));
});

it('renders consistent bilingual names and types across popular, favorites, and recent tabs for known objects', async () => {
  const jupiterRecent = { id: 'NAME Jupiter', name: '木星', typeZh: '行星' };
  const customRecent = { id: 'CUSTOM_UNKNOWN', name: '未知天体', typeZh: '深空天体' };
  toggleFavoriteSkyObject(storage, 'NAME Jupiter');
  const props = makeProps({
    onRemoveRecent: jest.fn(),
    recentObjects: [jupiterRecent, customRecent],
  });

  // Test in Chinese
  const { rerender } = render(<CelestialSearchSheet {...props} />);

  // Popular
  const popularRow = within(screen.getByTestId('deep-space-popular-NAME Jupiter'));
  expect(popularRow.getByText('木星')).toBeTruthy();
  expect(popularRow.getByText('Jupiter')).toBeTruthy();

  // Favorites
  fireEvent.press(screen.getByRole('tab', { name: '收藏夹' }));
  const favoriteRow = within(screen.getByTestId('deep-space-search-favorite-NAME Jupiter'));
  expect(favoriteRow.getByText('木星')).toBeTruthy();
  expect(favoriteRow.getByText('Jupiter')).toBeTruthy();

  // Recent
  fireEvent.press(screen.getByRole('tab', { name: '最近' }));
  const recentRow = within(screen.getByTestId('deep-space-search-recent-NAME Jupiter'));
  expect(recentRow.getByText('木星')).toBeTruthy();
  expect(recentRow.getByText('Jupiter')).toBeTruthy();
  expect(screen.getByTestId('deep-space-remove-recent-NAME Jupiter')).toBeTruthy();

  // Unknown recent item keeps name and typeZh without invented subtitle
  const unknownRow = within(screen.getByTestId('deep-space-search-recent-CUSTOM_UNKNOWN'));
  expect(unknownRow.getByText('未知天体')).toBeTruthy();
  expect(unknownRow.getByText('深空天体')).toBeTruthy();

  // Test in English
  await act(async () => {
    await i18n.changeLanguage('en');
  });
  rerender(<CelestialSearchSheet {...props} />);
  const recentRowEn = within(screen.getByTestId('deep-space-search-recent-NAME Jupiter'));
  expect(recentRowEn.getByText('Jupiter')).toBeTruthy();
  expect(recentRowEn.getByText('木星')).toBeTruthy();
});

it('reuses the search empty state container across empty favorites, recent, visible, and search results', () => {
  const props = makeProps({
    metrics: {},
    metricsRefreshing: false,
    query: 'NonExistentCelestialItem123',
    recentObjects: [],
  });
  const { rerender } = render(<CelestialSearchSheet {...props} />);

  // Search results empty state
  expect(screen.getByTestId('deep-space-search-empty-state')).toHaveTextContent('未找到匹配天体，支持中文、英文及星表编号');

  // Switch to non-query tabs
  rerender(<CelestialSearchSheet {...props} query="" />);

  // Visible empty state
  fireEvent.press(screen.getByRole('tab', { name: '当前可见' }));
  expect(screen.getByTestId('deep-space-search-empty-state')).toHaveTextContent('当前没有已确认在地平线上方的热门天体');

  // Favorites empty state
  fireEvent.press(screen.getByRole('tab', { name: '收藏夹' }));
  expect(screen.getByTestId('deep-space-search-empty-state')).toHaveTextContent('暂无收藏');

  // Recent empty state
  fireEvent.press(screen.getByRole('tab', { name: '最近' }));
  expect(screen.getByTestId('deep-space-search-empty-state')).toHaveTextContent('暂无最近记录');
});

it('preserves browse category button accessibility roles, selected states, and action triggers', () => {
  const onSelectCategory = jest.fn();
  const props = makeProps({ category: 'solar_system', onSelectCategory });
  render(<CelestialSearchSheet {...props} />);
  fireEvent.press(screen.getByRole('tab', { name: '浏览' }));

  const solarBtn = screen.getByTestId('deep-space-search-category-solar_system');
  expect(solarBtn.props.accessibilityRole).toBe('button');
  expect(solarBtn.props.accessibilityState).toEqual({ selected: true });

  const starsBtn = screen.getByTestId('deep-space-search-category-stars');
  expect(starsBtn.props.accessibilityRole).toBe('button');
  expect(starsBtn.props.accessibilityState).toEqual({ selected: false });

  fireEvent.press(starsBtn);
  expect(onSelectCategory).toHaveBeenCalledWith('stars');
});
