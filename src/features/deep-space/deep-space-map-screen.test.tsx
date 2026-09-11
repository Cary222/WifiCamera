import type { SelectedCelestialObject, TargetQueryResult, TonightReport } from '@/features/stellarium/stellarium-service';
import * as React from 'react';

import { translate } from '@/lib/i18n';
import { storage } from '@/lib/storage';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import { act, cleanup, fireEvent, screen, setup, waitFor } from '@/lib/test-utils';

import { DeepSpaceMapScreen } from './deep-space-map-screen';

const TONIGHT_FIXTURE: TonightReport = {
  dawnStart: '2026-08-22T03:40:00.000Z',
  duskEnd: '2026-08-21T12:10:00.000Z',
  moon: { illumination: 0.61, phase: 'waxing_gibbous', rise: '2026-08-21T14:20:00.000Z', set: '2026-08-22T02:05:00.000Z' },
  planets: [
    { from: '2026-08-21T11:30:00.000Z', key: 'saturn', magnitude: 0.6, peakAltitudeDeg: 48, to: '2026-08-22T04:10:00.000Z' },
  ],
  sunrise: '2026-08-22T04:15:00.000Z',
  sunset: '2026-08-21T11:05:00.000Z',
};
const EVENTS_FIXTURE = [
  { time: '2026-08-28T05:30:00.000Z', type: 'full_moon' },
  { name: 'Aurigids', time: '2026-09-01T14:00:00.000Z', type: 'meteor_shower', zhr: 6 },
];

const mockComputeEvents = jest.fn(async () => EVENTS_FIXTURE);
const mockComputeTonight = jest.fn(async () => TONIGHT_FIXTURE);
const mockGetCurrentPosition = jest.fn(async (_options?: unknown) => ({ coords: { latitude: 39.9, longitude: 116.41 } }));
const mockRequestLocationPermission = jest.fn(async () => ({ status: 'granted' }));
const mockHeadingSubscription = { remove: jest.fn() };
let mockHeadingCallback: ((heading: { trueHeading: number }) => void) | undefined;
const mockWatchHeading = jest.fn(async (callback?: unknown) => {
  mockHeadingCallback = callback as (heading: { trueHeading: number }) => void;
  return mockHeadingSubscription;
});
const mockWatchPosition = jest.fn(async (_options?: unknown, _callback?: unknown) => ({ remove: jest.fn() }));
const mockClearSelection = jest.fn();
const mockGetObjectInfo = jest.fn();
const mockGotoRaDec = jest.fn();
const mockPointAndLock = jest.fn();
const mockReload = jest.fn();
const mockRestoreView = jest.fn();
const mockSearchTarget = jest.fn();
const mockCancelSearch = jest.fn();
const mockFocusTarget = jest.fn(async (name: string): Promise<SelectedCelestialObject | null> => ({
  altDeg: 35.8,
  azDeg: 120.4,
  decDeg: -5.38,
  designations: [name],
  englishName: name.replace(/^NAME\s+/, ''),
  id: name,
  name: name.replace(/^NAME\s+/, ''),
  raHours: 5.58,
  vmag: 4.0,
}));
const mockQueryTargets = jest.fn(async (names: string[]): Promise<TargetQueryResult[]> => names.map(name => ({ altDeg: 42.5, available: true, azDeg: 123.4, id: name, vmag: 1.2 })));
const mockSetBrightness = jest.fn();
const mockSetEnvironment = jest.fn();
let mockOnReady: (() => void) | undefined;
const mockSetGridLines = jest.fn();
const mockSetLandscape = jest.fn();
const mockSetLocation = jest.fn();
const mockSetSearchCatalog = jest.fn();
const mockSetSkyCulture = jest.fn();
const mockSetSkyLayers = jest.fn();
const mockSetMagnitudeLimit = jest.fn();
const mockSetTime = jest.fn();
const mockSetViewBearing = jest.fn();
const mockSetFovFrame = jest.fn();
const mockToggleConstellations = jest.fn();
const mockZoomTo = jest.fn();
const mockShowDeepSpaceFeedback = jest.fn();
let mockOnCommandError: (() => void) | undefined;
let mockOnObjectSelected: ((object: unknown) => void) | undefined;
let mockOnSelectionCleared: (() => void) | undefined;
let _mockOnTargetFound: (() => void) | undefined;
let _mockOnTargetNotFound: (() => void) | undefined;
let mockOnBearingChange: ((azimuthDeg: number) => void) | undefined;
let mockOnViewStateChange: ((state: { altitudeDeg: number; azimuthDeg: number; fovDeg: number }) => void) | undefined;

const CENTER_TARGET: SelectedCelestialObject = {
  altDeg: 35.8,
  azDeg: 120.4,
  decDeg: -5.38,
  designations: ['M 42'],
  englishName: 'Orion Nebula',
  id: 'NAME Great Orion Nebula',
  name: '猎户座大星云',
  raHours: 5.58,
  vmag: 4.0,
};

const ARCHIVED_SKY_LAYERS = {
  atmosphere: true,
  constellationArt: true,
  constellationBoundaries: false,
  constellationLabels: true,
  constellationLines: true,
  constellationOnlyPointed: false,
  dsoHintsOffset: 0,
  dsoLabels: true,
  landscape: false,
  planetHintsOffset: 0,
  planetLabels: true,
  satelliteHintsOffset: 0,
  satelliteLabels: true,
  starHintsOffset: 2.5,
  starLabels: false,
};

function archivedPreferencesJson(): string {
  return JSON.stringify({
    version: 1,
    currentCulture: 'chinese',
    environment: { bortleIndex: 5, cardinals: false, fog: false, turbidity: 3 },
    gridLines: { azimuthal: false, ecliptic: false, equator: false, equatorial_j2000: false, equatorial_jnow: false, meridian: true },
    landscapeId: 'ocean',
    nightMode: true,
    skyLayers: ARCHIVED_SKY_LAYERS,
  });
}

function archivedViewStateJson(): string {
  return JSON.stringify({ version: 1, state: { altitudeDeg: 12.5, azimuthDeg: 271.2, fovDeg: 30.5 } });
}

/** Typed view of the MMKV stub so the tests can back it with real storage. */
type MockedStorage = {
  delete?: jest.Mock;
  getString: jest.Mock;
  remove?: jest.Mock;
  set: jest.Mock;
};

function mockedStorage(): MockedStorage {
  return storage as unknown as MockedStorage;
}

/** Backs the MMKV stub with a real map so reopening the screen reads what the last visit wrote. */
function installArchivedStorage() {
  const map = new Map<string, string | number | boolean>();
  const store = mockedStorage();
  store.getString.mockImplementation((key: string) => (typeof map.get(key) === 'string' ? (map.get(key) as string) : undefined));
  store.set.mockImplementation((key: string, value: string | number | boolean) => map.set(key, value));
  store.remove?.mockImplementation((key: string) => map.delete(key));
  store.delete?.mockImplementation((key: string) => map.delete(key));
  return map;
}

function storedJson(map: Map<string, string | number | boolean>, key: string) {
  const raw = map.get(key);
  return typeof raw === 'string' ? JSON.parse(raw) : null;
}

jest.mock('uniwind', () => ({
  // eslint-disable-next-line react/no-unnecessary-use-prefix
  useUniwind: () => ({ theme: 'dark' }),
  withUniwind: (component: unknown) => component,
}));

jest.mock('react-native-safe-area-context', () => ({
  // eslint-disable-next-line react/no-unnecessary-use-prefix
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

jest.mock('./ui/deep-space-feedback', () => ({
  showDeepSpaceFeedback: (...args: unknown[]) => mockShowDeepSpaceFeedback(...args),
}));

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  PermissionStatus: {
    DENIED: 'denied',
    GRANTED: 'granted',
  },
  getCurrentPositionAsync: (options: unknown) => mockGetCurrentPosition(options),
  requestForegroundPermissionsAsync: () => mockRequestLocationPermission(),
  watchHeadingAsync: (callback: unknown) => mockWatchHeading(callback),
  watchPositionAsync: (options: unknown, callback: unknown) => mockWatchPosition(options, callback),
}));

jest.mock('@/components/ui', () => {
  const { Text } = require('react-native');
  return {
    FocusAwareStatusBar: () => null,
    Text,
  };
});

// Resolve every key from the shipped zh translations so this mock cannot drift
// from the copy the app actually renders.
jest.mock('@/lib/i18n', () => {
  const zh = jest.requireActual('@/translations/zh.json').deep_space as Record<string, unknown>;
  return {
    getLanguage: () => 'zh',
    translate: (key: string, options?: Record<string, unknown>) => {
      const value = key
        .split('.')
        .slice(1)
        .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], zh);
      if (typeof value !== 'string')
        return key;
      return options
        ? value.replace(/\{\{(\w+)\}\}/g, (_match: string, name: string) => String(options[name] ?? ''))
        : value;
    },
  };
});

jest.mock('@/features/deep-space/calendar/satellite-pass-service', () => ({
  loadVisualOmm: jest.fn(async () => []),
  predictVisiblePasses: jest.fn(async () => []),
}));

jest.mock('@/features/stellarium/stellarium-view', () => {
  const mockReact = require('react');
  const { View: MockView } = require('react-native');

  return {
    StellariumView: ({ onBearingChange, onCommandError, onObjectSelected, onReady, onSelectionCleared, onTargetFound, onTargetNotFound, onViewStateChange, ref }: { onBearingChange?: (azimuthDeg: number) => void; onCommandError?: () => void; onObjectSelected?: (object: unknown) => void; onReady?: () => void; onSelectionCleared?: () => void; onTargetFound?: () => void; onTargetNotFound?: () => void; onViewStateChange?: (state: { altitudeDeg: number; azimuthDeg: number; fovDeg: number }) => void; ref?: unknown }) => {
      mockOnReady = onReady;
      mockOnBearingChange = onBearingChange;
      mockOnCommandError = onCommandError;
      mockOnObjectSelected = onObjectSelected;
      mockOnSelectionCleared = onSelectionCleared;
      mockOnViewStateChange = onViewStateChange;
      _mockOnTargetFound = onTargetFound;
      _mockOnTargetNotFound = onTargetNotFound;
      const readyRef = mockReact.useRef(false);
      mockReact.useImperativeHandle(ref, () => ({
        cancelSearch: mockCancelSearch,
        clearSelection: mockClearSelection,
        computeEvents: mockComputeEvents,
        computeTonight: mockComputeTonight,
        focusTarget: mockFocusTarget,
        getObjectInfo: mockGetObjectInfo,
        gotoRaDec: mockGotoRaDec,
        pointAndLock: mockPointAndLock,
        queryTargets: mockQueryTargets,
        reload: mockReload,
        restoreView: mockRestoreView,
        searchTarget: mockSearchTarget,
        setBrightness: mockSetBrightness,
        setEnvironment: mockSetEnvironment,
        setFovFrame: mockSetFovFrame,
        setGridLines: mockSetGridLines,
        setLandscape: mockSetLandscape,
        setLocation: mockSetLocation,
        setMagnitudeLimit: mockSetMagnitudeLimit,
        setSearchCatalog: mockSetSearchCatalog,
        setSkyCulture: mockSetSkyCulture,
        setSkyLayers: mockSetSkyLayers,
        setTime: mockSetTime,
        setViewBearing: mockSetViewBearing,
        toggleConstellations: mockToggleConstellations,
        zoomTo: mockZoomTo,
      }));
      mockReact.useEffect(() => {
        if (!readyRef.current) {
          readyRef.current = true;
          onReady?.();
        }
      }, [onReady]);
      return <MockView testID="stellarium-canvas" />;
    },
  };
});

afterEach(() => {
  cleanup();
  mockClearSelection.mockClear();
  mockComputeEvents.mockClear();
  mockComputeTonight.mockClear();
  mockPointAndLock.mockClear();
  mockRequestLocationPermission.mockClear();
  mockWatchHeading.mockClear();
  mockHeadingSubscription.remove.mockClear();
  mockHeadingCallback = undefined;
  mockReload.mockClear();
  mockRestoreView.mockClear();
  mockSearchTarget.mockClear();
  mockCancelSearch.mockClear();
  mockFocusTarget.mockClear();
  mockQueryTargets.mockClear();
  mockSetEnvironment.mockClear();
  mockSetGridLines.mockClear();
  mockSetLocation.mockClear();
  mockSetSkyCulture.mockClear();
  mockSetSkyLayers.mockClear();
  mockSetTime.mockClear();
  mockSetViewBearing.mockClear();
  mockSetFovFrame.mockClear();
  mockGetObjectInfo.mockReset();
  mockGotoRaDec.mockClear();
  mockToggleConstellations.mockClear();
  mockZoomTo.mockClear();
  mockShowDeepSpaceFeedback.mockClear();
  (storage.getString as jest.Mock).mockReset();
  (storage.set as jest.Mock).mockReset();
  mockedStorage().remove?.mockReset();
  mockedStorage().delete?.mockReset();
  mockOnBearingChange = undefined;
  mockOnCommandError = undefined;
  mockOnViewStateChange = undefined;
  _mockOnTargetFound = undefined;
  _mockOnTargetNotFound = undefined;
});

describe('deep space map screen', () => {
  it('renders the reference-style Stellarium chrome without the custom title pill', () => {
    setup(<DeepSpaceMapScreen />);
    expect(screen.getByTestId('deep-space-map-shell')).toBeOnTheScreen();
    expect(screen.getByTestId('stellarium-canvas')).toBeOnTheScreen();
    expect(screen.getByTestId('deep-space-reference-menu')).toBeOnTheScreen();
    expect(screen.getByTestId('deep-space-reference-search')).toBeOnTheScreen();
    expect(screen.queryByTestId('deep-space-reference-layers')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('deep-space-reference-layers-panel')).not.toBeOnTheScreen();
    expect(screen.getByTestId('deep-space-reference-compass')).toBeOnTheScreen();
    expect(screen.getByTestId('deep-space-reference-compass-instrument')).toBeOnTheScreen();
    expect(screen.getByTestId('deep-space-reference-time')).toBeOnTheScreen();
    expect(screen.queryByTestId('deep-space-map-title-pill')).not.toBeOnTheScreen();
  });

  it('rotates the compass and names the bearing reported by the engine', () => {
    setup(<DeepSpaceMapScreen />);

    act(() => mockOnBearingChange?.(90));
    expect(screen.getByTestId('deep-space-reference-compass-rose')).toHaveStyle({ transform: [{ rotate: '-90deg' }] });
    expect(screen.getByTestId('deep-space-reference-compass-azimuth')).toHaveTextContent('90°');
    expect(screen.getByTestId('deep-space-horizon-bearing')).toHaveTextContent('东');
  });

  it('keeps the compass pointing north and absolutely centered until the engine reports a bearing', () => {
    setup(<DeepSpaceMapScreen />);
    expect(screen.getByTestId('deep-space-reference-compass-center')).toHaveStyle({
      alignItems: 'center',
      left: 0,
      position: 'absolute',
      right: 0,
    });
    expect(screen.getByTestId('deep-space-reference-compass-rose')).toHaveStyle({ transform: [{ rotate: '-0deg' }] });
    expect(screen.getByTestId('deep-space-reference-compass-azimuth')).toHaveTextContent('0°');
    expect(screen.getByTestId('deep-space-horizon-bearing')).toHaveTextContent('北');
  });

  it('keeps layer switching in the quick control panel without the redundant layer button', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    expect(screen.queryByTestId('deep-space-reference-layers')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('deep-space-reference-layers-panel')).not.toBeOnTheScreen();

    await user.press(screen.getByTestId('deep-space-grid-quick-toggle'));
    await user.press(screen.getByTestId('deep-space-grid-quick-landscape'));
    expect(mockSetSkyLayers).toHaveBeenLastCalledWith({ landscape: false });
  });

  it('opens the reference-style drawer from the menu control', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-menu'));
    expect(screen.getByTestId('deep-space-reference-drawer')).toBeOnTheScreen();
  });

  it('matches the complete official drawer entry set', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-menu'));

    for (const label of ['星空述语', '日历', '观测工具', '设置', '帮助与反馈', '退出']) {
      expect(screen.getByText(label)).toBeOnTheScreen();
    }
  });

  it('closes the drawer from the header close control', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-menu'));
    await user.press(screen.getByTestId('deep-space-reference-drawer-close'));
    expect(screen.queryByTestId('deep-space-reference-drawer')).not.toBeOnTheScreen();
  });
});

describe('deep space glossary feature', () => {
  it('matches the reference full-screen list without region headers or placeholder glyphs', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-menu'));
    await user.press(screen.getByText('星空述语'));
    expect(screen.getByTestId('deep-space-glossary-panel')).toBeOnTheScreen();
    expect(screen.getByTestId('deep-space-glossary-item-egyptian')).toBeOnTheScreen();
    expect(screen.getByTestId('deep-space-glossary-item-arabic_ancient')).toBeOnTheScreen();
    expect(screen.getByText('中国')).toBeOnTheScreen();
    expect(screen.getByText('阿拉伯语（古）')).toBeOnTheScreen();
    expect(screen.queryByText('中东')).not.toBeOnTheScreen();
    expect(screen.queryByText('❖')).not.toBeOnTheScreen();
  });

  it('switches the engine sky culture from the glossary', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-menu'));
    await user.press(screen.getByText('星空述语'));
    await user.press(screen.getByTestId('deep-space-glossary-item-chinese'));

    // 点击列表卡片进入详情页，并触发实时星图联动
    expect(screen.getByTestId('deep-space-glossary-detail-chinese')).toBeOnTheScreen();
    expect(mockSetSkyCulture).toHaveBeenCalledWith('chinese');

    // 全屏详情保留原版的地区行、使用按钮和正文面板。
    expect(screen.getByTestId('deep-space-glossary-use-button')).toBeOnTheScreen();
    expect(screen.getByText('亚洲')).toBeOnTheScreen();

    // 浏览详情只预览文化；明确点击使用后才把代表星官带给引擎定位。
    await user.press(screen.getByTestId('deep-space-glossary-use-button'));
    expect(mockSetSkyCulture).toHaveBeenLastCalledWith('chinese', 'CON chinese 236');
    expect(screen.queryByTestId('deep-space-glossary-detail-chinese')).not.toBeOnTheScreen();
  });

  it('returns from the reference-style full-screen detail to the list', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-menu'));
    await user.press(screen.getByText('星空述语'));
    await user.press(screen.getByTestId('deep-space-glossary-item-chinese'));
    expect(screen.getByTestId('deep-space-glossary-detail-chinese')).toBeOnTheScreen();
    await user.press(screen.getByTestId('deep-space-glossary-back-to-list'));
    expect(screen.getByTestId('deep-space-glossary-panel')).toBeOnTheScreen();
  });

  it('shows a restore default floating button when a non-default sky culture is active', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);

    // 默认是西方文化，不显示恢复浮钮
    expect(screen.queryByTestId('deep-space-restore-culture-fab')).not.toBeOnTheScreen();

    // 从述语切换到中国文化并应用
    await user.press(screen.getByTestId('deep-space-reference-menu'));
    await user.press(screen.getByText('星空述语'));
    await user.press(screen.getByTestId('deep-space-glossary-item-chinese'));
    await user.press(screen.getByTestId('deep-space-glossary-use-button'));

    // 应用后右下角出现恢复浮钮
    expect(screen.getByTestId('deep-space-restore-culture-fab')).toBeOnTheScreen();

    // 点击浮钮弹出确认并还原
    await user.press(screen.getByTestId('deep-space-restore-culture-fab'));
    expect(screen.getByTestId('deep-space-restore-culture-dialog')).toBeOnTheScreen();
    await user.press(screen.getByTestId('deep-space-restore-culture-confirm'));
    expect(mockSetSkyCulture).toHaveBeenLastCalledWith('western');
    expect(screen.queryByTestId('deep-space-restore-culture-fab')).not.toBeOnTheScreen();
  });
});

describe('deep space settings and location features', () => {
  it('opens the official settings root before selecting a location', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-menu'));
    await user.press(screen.getByText('设置'));

    expect(screen.getByTestId('deep-space-settings-panel')).toBeOnTheScreen();
    expect(screen.getByTestId('deep-space-settings-panel')).toHaveStyle({ alignSelf: 'stretch' });
    for (const label of ['传感器', '所在位置', '高级的', '重置设置']) {
      expect(screen.getByText(label)).toBeOnTheScreen();
    }
    expect(screen.queryByTestId('deep-space-settings-location-上海')).not.toBeOnTheScreen();
  });

  it('connects the settings sensor control to real heading updates', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-menu'));
    await user.press(screen.getByText('设置'));
    await user.press(screen.getByTestId('deep-space-settings-sensor-toggle'));

    expect(mockRequestLocationPermission).toHaveBeenCalledTimes(1);
    expect(mockWatchHeading).toHaveBeenCalledTimes(1);
  });

  it('uses automatic location from the official settings location page', async () => {
    mockGetCurrentPosition.mockResolvedValueOnce({ coords: { latitude: 34.2, longitude: 108.94 } });
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-menu'));
    await user.press(screen.getByText('设置'));
    await user.press(screen.getByTestId('deep-space-settings-location-entry'));

    expect(screen.getByText('使用自动定位')).toBeOnTheScreen();
    expect(screen.getByText('纬度')).toBeOnTheScreen();
    expect(screen.getByText('经度')).toBeOnTheScreen();
    expect(screen.getByText('地名/城市:')).toBeOnTheScreen();
    await user.press(screen.getByTestId('deep-space-settings-auto-location-toggle'));

    expect(mockGetCurrentPosition).toHaveBeenCalledWith({ accuracy: 3 });
    expect(mockWatchPosition).toHaveBeenCalledWith({ accuracy: 3 }, expect.any(Function));
    expect(mockSetLocation).toHaveBeenLastCalledWith(34.2, 108.94);
  });

  it('updates manual latitude and longitude from coordinate input dialogs', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-menu'));
    await user.press(screen.getByText('设置'));
    await user.press(screen.getByTestId('deep-space-settings-location-entry'));

    // Open latitude dialog and input 24.5
    await user.press(screen.getByTestId('deep-space-settings-latitude-btn'));
    expect(screen.getByTestId('deep-space-settings-latitude-modal')).toBeOnTheScreen();
    await user.clear(screen.getByTestId('deep-space-settings-latitude-input'));
    await user.type(screen.getByTestId('deep-space-settings-latitude-input'), '24.5');
    await user.press(screen.getByTestId('deep-space-settings-latitude-confirm'));
    expect(mockSetLocation).toHaveBeenLastCalledWith(24.5, 116.41);

    // Open longitude dialog and input 118.5
    await user.press(screen.getByTestId('deep-space-settings-longitude-btn'));
    expect(screen.getByTestId('deep-space-settings-longitude-modal')).toBeOnTheScreen();
    await user.clear(screen.getByTestId('deep-space-settings-longitude-input'));
    await user.type(screen.getByTestId('deep-space-settings-longitude-input'), '118.5');
    await user.press(screen.getByTestId('deep-space-settings-longitude-confirm'));
    expect(mockSetLocation).toHaveBeenLastCalledWith(24.5, 118.5);
  });

  it('selects city and updates observer from city picker modal', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-menu'));
    await user.press(screen.getByText('设置'));
    await user.press(screen.getByTestId('deep-space-settings-location-entry'));

    await user.press(screen.getByTestId('deep-space-settings-city-btn'));
    expect(screen.getByTestId('deep-space-settings-city-modal')).toBeOnTheScreen();
    await user.press(screen.getByTestId('deep-space-settings-city-泉州'));
    expect(mockSetLocation).toHaveBeenLastCalledWith(24.87, 118.68);
  });
});

describe('deep space advanced settings and reset features', () => {
  it('navigates to the official advanced settings subpage and back', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-menu'));
    await user.press(screen.getByText('设置'));
    await user.press(screen.getByTestId('deep-space-settings-advanced-entry'));

    expect(screen.getByTestId('deep-space-settings-advanced-panel')).toBeOnTheScreen();
    expect(screen.getByText('开始时间')).toBeOnTheScreen();
    expect(screen.getByText('全屏')).toBeOnTheScreen();
    expect(screen.getByText('限制星等')).toBeOnTheScreen();
    expect(screen.getByText('亮度')).toBeOnTheScreen();
    expect(screen.getByText('1.0')).toBeOnTheScreen();

    await user.press(screen.getByTestId('deep-space-settings-advanced-back'));
    expect(screen.getByTestId('deep-space-settings-panel')).toBeOnTheScreen();
  });

  it('returns the star map to the current time from advanced settings', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-menu'));
    await user.press(screen.getByText('设置'));
    await user.press(screen.getByTestId('deep-space-settings-advanced-entry'));
    await user.press(screen.getByTestId('deep-space-settings-start-time'));
    await user.press(screen.getByTestId('deep-space-settings-start-time-now'));

    expect(mockSetTime).toHaveBeenCalled();
  });

  it('sends a magnitude limit to the engine when the advanced switch is turned on', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-menu'));
    await user.press(screen.getByText('设置'));
    await user.press(screen.getByTestId('deep-space-settings-advanced-entry'));
    await user.press(screen.getByTestId('deep-space-settings-limitmag-toggle'));

    expect(mockSetMagnitudeLimit).toHaveBeenCalledWith(expect.any(Number));
  });

  it('retains star-map controls when fullscreen is enabled, reveals exit button on corner tap and restores standard mode on exit', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-menu'));
    await user.press(screen.getByText('设置'));
    await user.press(screen.getByTestId('deep-space-settings-advanced-entry'));
    await user.press(screen.getByTestId('deep-space-settings-fullscreen-toggle'));
    await user.press(screen.getByLabelText(translate('deep_space.back')));

    expect(screen.queryByTestId('deep-space-settings-advanced-panel')).not.toBeOnTheScreen();
    // In full-screen mode, star-map own controls remain accessible
    expect(screen.getByTestId('deep-space-reference-menu')).toBeOnTheScreen();
    expect(screen.getByTestId('deep-space-reference-search')).toBeOnTheScreen();
    expect(screen.getByTestId('deep-space-grid-quick-toggle')).toBeOnTheScreen();
    // Exit button is not shown permanently to avoid cluttering the view.
    expect(screen.queryByTestId('deep-space-exit-fullscreen')).not.toBeOnTheScreen();

    // Tapping the top-right corner reveals the exit button.
    await user.press(screen.getByTestId('deep-space-fullscreen-corner-trigger'));
    expect(screen.getByTestId('deep-space-exit-fullscreen')).toBeOnTheScreen();

    // Pressing the revealed exit button exits full-screen mode.
    await user.press(screen.getByTestId('deep-space-exit-fullscreen'));
    expect(screen.getByTestId('deep-space-reference-menu')).toBeOnTheScreen();
    expect(screen.getByTestId('deep-space-reference-search')).toBeOnTheScreen();
  });

  it('shows the official reset settings confirmation dialog and cancels or confirms', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-menu'));
    await user.press(screen.getByText('设置'));
    await user.press(screen.getByTestId('deep-space-settings-reset-entry'));

    expect(screen.getByTestId('deep-space-settings-reset-dialog')).toBeOnTheScreen();
    expect(screen.getAllByText('重置设置')).toHaveLength(2);
    expect(screen.getByText('这将重置全部设置。是否确认？')).toBeOnTheScreen();

    await user.press(screen.getByText('取消'));
    expect(screen.queryByTestId('deep-space-settings-reset-dialog')).not.toBeOnTheScreen();

    await user.press(screen.getByTestId('deep-space-settings-reset-entry'));
    await user.press(screen.getByText('确定'));
    expect(screen.queryByTestId('deep-space-settings-reset-dialog')).not.toBeOnTheScreen();
    expect(mockShowDeepSpaceFeedback).toHaveBeenCalledWith({
      message: '已恢复默认设置',
      tone: 'success',
    });
  });

  it('opens the reference calendar without the legacy time-shift controls', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-menu'));
    await user.press(screen.getByText('日历'));
    expect(screen.getByTestId('deep-space-calendar-panel')).toBeOnTheScreen();
    expect(screen.queryByTestId('deep-space-calendar-forward-day')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('deep-space-calendar-back-hour')).not.toBeOnTheScreen();
  });
});

describe('deep space calendar panel', () => {
  it('renders tonight ephemeris computed for the selected observer city', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-menu'));
    await user.press(screen.getByText('日历'));
    expect(await screen.findByTestId('deep-space-calendar-tonight')).toBeOnTheScreen();

    // Beijing is the default observer, so the ephemeris must be requested for it.
    expect(mockComputeTonight).toHaveBeenCalledWith(expect.any(Date), { latitudeDeg: 39.9, longitudeDeg: 116.41 });
    expect(screen.getByTestId('deep-space-calendar-chart-saturn')).toBeOnTheScreen();
    expect(screen.getByTestId('deep-space-calendar-chart-saturn-ring')).toBeOnTheScreen();
    expect(screen.getByText('有卫星经过')).toBeOnTheScreen();
  });

  it('switches to the events tab and groups what the engine returned', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-menu'));
    await user.press(screen.getByText('日历'));
    await screen.findByTestId('deep-space-calendar-tonight');
    await user.press(screen.getByTestId('deep-space-calendar-tab-events'));
    expect(mockComputeEvents).toHaveBeenCalledWith(expect.any(Date), 60, { latitudeDeg: 39.9, longitudeDeg: 116.41 });
    expect(screen.getByTestId('deep-space-calendar-events')).toBeOnTheScreen();
    expect(screen.getByText('满月')).toBeOnTheScreen();
    expect(screen.getByText('Aurigids 流星雨极大')).toBeOnTheScreen();
  });

  it('recomputes the calendar when the observer city changes', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-menu'));
    await user.press(screen.getByText('设置'));
    await user.press(screen.getByTestId('deep-space-settings-location-entry'));
    await user.press(screen.getByTestId('deep-space-settings-location-上海'));
    await user.press(screen.getByTestId('deep-space-reference-menu'));
    await user.press(screen.getByText('日历'));
    await screen.findByTestId('deep-space-calendar-tonight');
    expect(mockComputeTonight).toHaveBeenLastCalledWith(expect.any(Date), { latitudeDeg: 31.23, longitudeDeg: 121.47 });
  });

  it('charts tonight visibility instead of repeating it as a list', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-menu'));
    await user.press(screen.getByText('日历'));
    await screen.findByTestId('deep-space-calendar-tonight');
    expect(screen.getByTestId('deep-space-calendar-chart')).toBeOnTheScreen();
    // The reference shows each body once; the textual list is the fallback only.
    expect(screen.queryByTestId('deep-space-calendar-planet-saturn')).not.toBeOnTheScreen();
    expect(screen.getByText('19:30')).toBeOnTheScreen();
  });

  it('shows a safe empty state when the night window is unknown', async () => {
    mockComputeTonight.mockResolvedValueOnce({ ...TONIGHT_FIXTURE, sunrise: null, sunset: null });
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-menu'));
    await user.press(screen.getByText('日历'));
    await screen.findByTestId('deep-space-calendar-tonight');
    expect(screen.queryByTestId('deep-space-calendar-chart')).not.toBeOnTheScreen();
    expect(screen.getByText('今晚没有行星在地平线以上')).toBeOnTheScreen();
  });

  it('labels each event with its name and full local time', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-menu'));
    await user.press(screen.getByText('日历'));
    await screen.findByTestId('deep-space-calendar-tonight');
    await user.press(screen.getByTestId('deep-space-calendar-tab-events'));
    expect(screen.getByText('八月 2026')).toBeOnTheScreen();
    // The meteor shower row stays date-only because a peak has no meaningful clock time.
    expect(screen.getByText('九月 1')).toBeOnTheScreen();
    expect(screen.getByText(/^八月 28, \d{2}:\d{2} GMT[+-]\d{2}:\d{2}$/)).toBeOnTheScreen();
  });

  it('offers a retry when the engine fails to compute the calendar', async () => {
    mockComputeTonight.mockRejectedValueOnce(new Error('boom'));
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-menu'));
    await user.press(screen.getByText('日历'));
    expect(await screen.findByTestId('deep-space-calendar-error')).toBeOnTheScreen();
    await user.press(screen.getByTestId('deep-space-calendar-retry'));
    expect(await screen.findByTestId('deep-space-calendar-tonight')).toBeOnTheScreen();
  });
});

describe('deep space 3x2 quick controls', () => {
  it('opens the reference 3×2 Stellarium overlay panel and applies its grouped controls', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-grid-quick-toggle'));

    expect(screen.getByTestId('deep-space-grid-quick-panel')).toBeOnTheScreen();
    expect(screen.getByText('网格和线条')).toBeOnTheScreen();
    expect(screen.getByText('星座')).toBeOnTheScreen();
    expect(screen.getByText('地景')).toBeOnTheScreen();
    expect(screen.getByText('大气层')).toBeOnTheScreen();
    expect(screen.getByText('标签')).toBeOnTheScreen();
    expect(screen.getByText('夜间模式')).toBeOnTheScreen();
    expect(screen.queryByTestId('deep-space-reference-compass')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('deep-space-reference-time')).not.toBeOnTheScreen();

    await user.press(screen.getByTestId('deep-space-grid-quick-grid-lines'));
    expect(mockSetGridLines).toHaveBeenCalledWith({ azimuthal: true, equatorial_jnow: true });
    await user.press(screen.getByTestId('deep-space-grid-quick-night-mode'));
    expect(screen.getByTestId('deep-space-night-mode-overlay')).toBeOnTheScreen();
  });

  it('toggles all labels on quick button press and keeps the landscape enabled', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-grid-quick-toggle'));

    expect(screen.getByTestId('deep-space-grid-quick-landscape').props.accessibilityState.checked).toBe(true);
    await user.press(screen.getByTestId('deep-space-grid-quick-labels'));

    expect(mockSetSkyLayers).toHaveBeenLastCalledWith({
      dsoLabels: false,
      planetLabels: false,
      satelliteLabels: false,
      starLabels: false,
    });
    expect(mockSetSkyLayers).not.toHaveBeenCalledWith({ landscape: false });
    expect(screen.getByTestId('deep-space-grid-quick-landscape').props.accessibilityState.checked).toBe(true);
  });
});

describe('deep space quick detail sheets', () => {
  it('opens secondary detail settings sheet on long pressing quick controls', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-grid-quick-toggle'));

    // 长按网格和线条按钮，展现 6 项完整网格和线条选项
    await user.longPress(screen.getByTestId('deep-space-grid-quick-grid-lines'));
    expect(screen.getByTestId('deep-space-quick-detail-sheet')).toBeOnTheScreen();
    expect(screen.getByText('网格和线条设置')).toBeOnTheScreen();
    expect(screen.getByText('地平坐标网格 (Azimuthal)')).toBeOnTheScreen();
    expect(screen.getByText('赤道坐标网格 (JNow)')).toBeOnTheScreen();
    expect(screen.getByText('赤道坐标网格 (J2000)')).toBeOnTheScreen();
    expect(screen.getByText('黄道线 (Ecliptic)')).toBeOnTheScreen();
    expect(screen.getByText('天赤道 (Celestial Equator)')).toBeOnTheScreen();
    expect(screen.getByText('子午线 (Meridian)')).toBeOnTheScreen();

    // 细粒度切换黄道线与子午线
    await user.press(screen.getByTestId('deep-space-quick-detail-toggle-ecliptic'));
    expect(mockSetGridLines).toHaveBeenLastCalledWith({ ecliptic: true });
    await user.press(screen.getByTestId('deep-space-quick-detail-toggle-meridian'));
    expect(mockSetGridLines).toHaveBeenLastCalledWith({ meridian: true });

    // 关闭二级面板
    await user.press(screen.getByTestId('deep-space-quick-detail-close'));
    expect(screen.queryByTestId('deep-space-quick-detail-sheet')).not.toBeOnTheScreen();

    // 长按星座按钮
    await user.longPress(screen.getByTestId('deep-space-grid-quick-constellation'));
    expect(screen.getByTestId('deep-space-quick-detail-sheet')).toBeOnTheScreen();
    expect(screen.getByText('星座显示设置')).toBeOnTheScreen();
    expect(screen.getByText('星座连线')).toBeOnTheScreen();
    expect(screen.getByText('星座古典艺术画')).toBeOnTheScreen();
    expect(screen.getByText('星座名称注记')).toBeOnTheScreen();
    expect(screen.getByText('星座边界')).toBeOnTheScreen();
    expect(screen.getByText('仅显示指向星座')).toBeOnTheScreen();
  });

  it('sends alternating sky-layer commands when the same switch is tapped twice in a row', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-grid-quick-toggle'));
    await user.longPress(screen.getByTestId('deep-space-grid-quick-constellation'));

    // Regression: the toggle handler read skyLayers from a stale render closure,
    // so two rapid taps sent { false } then { false } instead of false then true.
    // Call 1 is the initial full state pushed on engine ready.
    await user.press(screen.getByTestId('deep-space-quick-detail-toggle-constellationLabels'));
    await user.press(screen.getByTestId('deep-space-quick-detail-toggle-constellationLabels'));

    expect(mockSetSkyLayers).toHaveBeenNthCalledWith(2, { constellationLabels: false });
    expect(mockSetSkyLayers).toHaveBeenNthCalledWith(3, { constellationLabels: true });
  });

  it('sends the two advanced constellation display switches to the engine', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-grid-quick-toggle'));
    await user.longPress(screen.getByTestId('deep-space-grid-quick-constellation'));

    await user.press(screen.getByTestId('deep-space-quick-detail-toggle-constellationBoundaries'));
    await user.press(screen.getByTestId('deep-space-quick-detail-toggle-constellationOnlyPointed'));

    expect(mockSetSkyLayers).toHaveBeenNthCalledWith(2, { constellationBoundaries: true });
    expect(mockSetSkyLayers).toHaveBeenNthCalledWith(3, { constellationOnlyPointed: true });
  });

  it('opens atmosphere controls with the fog switch on long pressing atmosphere button', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-grid-quick-toggle'));
    await user.longPress(screen.getByTestId('deep-space-grid-quick-atmosphere'));

    expect(screen.getByTestId('deep-space-quick-detail-sheet')).toBeOnTheScreen();
    expect(screen.getByText('大气层与空气质量设置')).toBeOnTheScreen();
    expect(screen.getByText('大气散射与消光')).toBeOnTheScreen();
    expect(screen.getByTestId('deep-space-quick-detail-toggle-fog')).toBeOnTheScreen();

    await user.press(screen.getByTestId('deep-space-quick-detail-toggle-fog'));
    expect(mockSetEnvironment).toHaveBeenLastCalledWith({ fog: false });
  });
});

describe('deep space labels detail sheet', () => {
  it('opens Stellarium labels detail sheet on long press with 4 sliders and reset button', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-grid-quick-toggle'));
    await user.longPress(screen.getByTestId('deep-space-grid-quick-labels'));

    expect(screen.getByTestId('deep-space-quick-detail-sheet')).toBeOnTheScreen();
    expect(screen.getByText('标签和注记数量')).toBeOnTheScreen();
    expect(screen.getByText('调节天体注记与标识的显示密度')).toBeOnTheScreen();
    expect(screen.getByTestId('deep-space-quick-detail-close')).toBeOnTheScreen();
    expect(screen.queryByText('‹')).not.toBeOnTheScreen();
    expect(screen.getByText('恒星')).toBeOnTheScreen();
    expect(screen.getByText('行星')).toBeOnTheScreen();
    expect(screen.getByText('深空天体')).toBeOnTheScreen();
    expect(screen.getByText('人造卫星')).toBeOnTheScreen();
    expect(screen.getByTestId('deep-space-labels-reset-button')).toBeOnTheScreen();
    expect(screen.getByText('重置数值')).toBeOnTheScreen();
    expect(screen.queryByText('星座标签')).not.toBeOnTheScreen();

    fireEvent(screen.getByTestId('deep-space-label-slider-stars'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    expect(mockSetSkyLayers).toHaveBeenLastCalledWith({
      starHintsOffset: 0.5,
      starLabels: true,
    });

    await user.press(screen.getByTestId('deep-space-labels-reset-button'));
    expect(mockSetSkyLayers).toHaveBeenLastCalledWith({
      dsoHintsOffset: 0,
      dsoLabels: true,
      planetHintsOffset: 0,
      planetLabels: true,
      satelliteHintsOffset: 0,
      satelliteLabels: true,
      starHintsOffset: 0,
      starLabels: true,
    });
    expect(mockShowDeepSpaceFeedback).toHaveBeenCalledWith({ message: '标签注记已重置', tone: 'success' });
  });

  it('resets grid lines from quick detail reset button', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-grid-quick-toggle'));
    await user.longPress(screen.getByTestId('deep-space-grid-quick-grid-lines'));

    expect(screen.getByTestId('deep-space-quick-detail-sheet')).toBeOnTheScreen();
    expect(screen.getByTestId('deep-space-quick-detail-reset')).toBeOnTheScreen();
    expect(screen.getByText('重置坐标网格')).toBeOnTheScreen();

    await user.press(screen.getByTestId('deep-space-quick-detail-reset'));
    expect(mockSetGridLines).toHaveBeenLastCalledWith({
      azimuthal: false,
      ecliptic: false,
      equator: false,
      equatorial_j2000: false,
      equatorial_jnow: false,
      meridian: false,
    });
  });

  it('resets atmosphere and air quality from quick detail reset button', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-grid-quick-toggle'));
    await user.longPress(screen.getByTestId('deep-space-grid-quick-atmosphere'));

    expect(screen.getByTestId('deep-space-quick-detail-sheet')).toBeOnTheScreen();
    expect(screen.getByTestId('deep-space-quick-detail-reset')).toBeOnTheScreen();
    expect(screen.getByText('重置大气与空气质量')).toBeOnTheScreen();

    await user.press(screen.getByTestId('deep-space-quick-detail-reset'));
    expect(mockSetSkyLayers).toHaveBeenLastCalledWith({ atmosphere: true });
    expect(mockSetEnvironment).toHaveBeenLastCalledWith({
      bortleIndex: 1,
      fog: false,
      turbidity: 0.96,
    });
  });
});

describe('deep space interactive time control', () => {
  it('opens time control bar when tapping time capsule', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-time'));
    expect(screen.getByTestId('deep-space-time-slider-sheet')).toBeOnTheScreen();
    expect(screen.getByTestId('deep-space-time-slider')).toBeOnTheScreen();
  });

  it('steps date forward and backward in time control bar', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-time'));

    await user.press(screen.getByTestId('deep-space-time-date-next'));
    expect(mockSetTime).toHaveBeenCalled();

    await user.press(screen.getByTestId('deep-space-time-date-prev'));
    expect(mockSetTime).toHaveBeenCalled();
  });

  it('steps hour forward and backward in time control bar', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-time'));

    await user.press(screen.getByTestId('deep-space-time-hour-next'));
    expect(mockSetTime).toHaveBeenCalled();

    await user.press(screen.getByTestId('deep-space-time-hour-prev'));
    expect(mockSetTime).toHaveBeenCalled();
  });

  it('returns to now and closes time control bar', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-time'));

    await user.press(screen.getByTestId('deep-space-time-now-button'));
    expect(mockSetTime).toHaveBeenCalled();
    expect(mockShowDeepSpaceFeedback).toHaveBeenCalledWith({ message: '已回到当前时间', tone: 'success' });

    await user.press(screen.getByTestId('deep-space-time-close-button'));
    expect(screen.queryByTestId('deep-space-time-slider-sheet')).not.toBeOnTheScreen();
  });

  it('advances custom time at the selected preview speed while playback is active', () => {
    jest.useFakeTimers();
    try {
      setup(<DeepSpaceMapScreen />);
      fireEvent.press(screen.getByTestId('deep-space-reference-time'));
      fireEvent.press(screen.getByTestId('deep-space-time-speed-60'));
      fireEvent.press(screen.getByTestId('deep-space-time-playback-toggle'));
      const callsBeforeAdvance = mockSetTime.mock.calls.length;

      act(() => jest.advanceTimersByTime(1000));

      expect(mockSetTime).toHaveBeenCalledTimes(callsBeforeAdvance + 1);
      expect(screen.getByTestId('deep-space-time-playback-toggle').props.accessibilityState.selected).toBe(true);
    }
    finally {
      jest.useRealTimers();
    }
  });
});

describe('deep space time state ownership', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-09T12:00:00.000Z'));
  });
  afterEach(() => {
    cleanup();
    jest.useRealTimers();
  });

  it('keeps playback and speed after closing and reopening the existing panel', () => {
    setup(<DeepSpaceMapScreen />);
    fireEvent.press(screen.getByTestId('deep-space-reference-time'));
    fireEvent.press(screen.getByTestId('deep-space-time-speed-60'));
    fireEvent.press(screen.getByTestId('deep-space-time-playback-toggle'));
    const start = Date.now();
    fireEvent.press(screen.getByTestId('deep-space-time-close-button'));
    act(() => jest.advanceTimersByTime(3000));
    expect(mockSetTime).toHaveBeenLastCalledWith(new Date(start + 180_000));
    fireEvent.press(screen.getByTestId('deep-space-reference-time'));
    expect(screen.getByTestId('deep-space-time-playback-toggle').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('deep-space-time-speed-60').props.accessibilityState.selected).toBe(true);
  });

  it('offers reverse speeds and explicit zero pause without replacing the panel', () => {
    setup(<DeepSpaceMapScreen />);
    fireEvent.press(screen.getByTestId('deep-space-reference-time'));
    for (const speed of [-60, -1, 0, 1, 10, 60, 600])
      expect(screen.getByTestId(`deep-space-time-speed-${speed}`)).toBeOnTheScreen();
    expect(screen.getByTestId('deep-space-time-playback-controls')).toHaveStyle({ flexWrap: 'wrap' });
    fireEvent.press(screen.getByTestId('deep-space-time-speed--60'));
    fireEvent.press(screen.getByTestId('deep-space-time-playback-toggle'));
    act(() => jest.advanceTimersByTime(1000));
    expect(mockSetTime).toHaveBeenLastCalledWith(new Date('2026-09-09T11:59:00.000Z'));
    fireEvent.press(screen.getByTestId('deep-space-time-speed-0'));
    const calls = mockSetTime.mock.calls.length;
    act(() => jest.advanceTimersByTime(5000));
    expect(mockSetTime).toHaveBeenCalledTimes(calls);
    fireEvent.press(screen.getByTestId('deep-space-time-now-button'));
    act(() => jest.advanceTimersByTime(1000));
    expect(mockSetTime).toHaveBeenLastCalledWith(new Date(Date.now()));
  });
});

function expectRestoreOrder() {
  const commands = [mockSetSearchCatalog, mockSetTime, mockSetLocation, mockSetSkyCulture, mockSetLandscape, mockSetSkyLayers, mockSetEnvironment, mockSetGridLines, mockSetBrightness, mockSetMagnitudeLimit, mockRestoreView];
  const order = commands.map(command => command.mock.invocationCallOrder.at(-1));
  expect(order.every(value => typeof value === 'number')).toBe(true);
  expect(order).toEqual([...order].sort((a, b) => a! - b!));
}

describe('deep space observer context restoration', () => {
  it('replays every current setting in order on ready without permission or old focus', () => {
    setup(<DeepSpaceMapScreen />);
    expectRestoreOrder();
    fireEvent.press(screen.getByTestId('deep-space-reference-time'));
    fireEvent.press(screen.getByTestId('deep-space-time-date-prev'));
    const selectedTime = mockSetTime.mock.calls.at(-1)?.[0];
    fireEvent.press(screen.getByTestId('deep-space-reference-menu'));
    fireEvent.press(screen.getByText('星空述语'));
    fireEvent.press(screen.getByTestId('deep-space-glossary-item-chinese'));
    fireEvent.press(screen.getByTestId('deep-space-glossary-use-button'));
    fireEvent.press(screen.getByTestId('deep-space-reference-menu'));
    fireEvent.press(screen.getByText('设置'));
    fireEvent.press(screen.getByTestId('deep-space-settings-location-entry'));
    fireEvent.press(screen.getByTestId('deep-space-settings-location-上海'));
    const focusCalls = mockFocusTarget.mock.calls.length;
    act(() => mockOnReady?.());
    expect(mockSetTime).toHaveBeenLastCalledWith(selectedTime);
    expect(mockSetLocation).toHaveBeenLastCalledWith(31.23, 121.47);
    expect(mockSetSkyCulture).toHaveBeenLastCalledWith('chinese');
    expect(mockSetBrightness).toHaveBeenLastCalledWith(1);
    expect(mockSetMagnitudeLimit).toHaveBeenLastCalledWith(99);
    expect(mockFocusTarget).toHaveBeenCalledTimes(focusCalls);
    expect(mockRequestLocationPermission).not.toHaveBeenCalled();
    expectRestoreOrder();
  });

  it('restores the selected last-view date on the initial engine ready', () => {
    const selectedTime = '2025-03-04T05:06:07.000Z';
    (storage.getString as jest.Mock).mockImplementation((key: string) => {
      if (key === STORAGE_KEYS.DEEP_SPACE_SETTINGS_START_TIME_POLICY)
        return 'last_view';
      if (key === STORAGE_KEYS.DEEP_SPACE_SETTINGS_LAST_VIEW_TIME)
        return selectedTime;
      return undefined;
    });
    try {
      setup(<DeepSpaceMapScreen />);
      expect(mockSetTime).toHaveBeenLastCalledWith(new Date(selectedTime));
      fireEvent.press(screen.getByTestId('deep-space-reference-time'));
      expect(screen.getByTestId('deep-space-time-date-value')).toHaveTextContent('2025年3月4日');
    }
    finally {
      (storage.getString as jest.Mock).mockReset();
    }
  });
});

describe('deep space observation tools', () => {
  it('keeps telescope and field-of-view tools separate from the left-bottom grid controls', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-menu'));
    await user.press(screen.getByText('观测工具'));
    expect(screen.getByTestId('deep-space-tools-telescope')).toBeOnTheScreen();
    expect(screen.getByTestId('deep-space-tools-fov')).toBeOnTheScreen();
    expect(screen.queryByTestId('deep-space-tools-azimuthal')).not.toBeOnTheScreen();
  });

  it('moves the virtual telescope to a typed RA and Dec coordinate', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-menu'));
    await user.press(screen.getByText('观测工具'));
    await user.press(screen.getByTestId('deep-space-tools-telescope'));
    await user.clear(screen.getByTestId('deep-space-telescope-ra-input'));
    await user.type(screen.getByTestId('deep-space-telescope-ra-input'), '5.5');
    await user.clear(screen.getByTestId('deep-space-telescope-dec-input'));
    await user.type(screen.getByTestId('deep-space-telescope-dec-input'), '-5');
    await user.press(screen.getByTestId('deep-space-telescope-goto'));
    expect(mockGotoRaDec).toHaveBeenLastCalledWith(82.5, -5);
  });

  it('shows a field frame after applying a valid optical setup', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-menu'));
    await user.press(screen.getByText('观测工具'));
    await user.press(screen.getByTestId('deep-space-tools-fov'));
    await user.press(screen.getByTestId('deep-space-fov-apply'));
    expect(screen.getByTestId('deep-space-fov-overlay')).toBeOnTheScreen();
  });

  it('removes the field frame from the observation tools', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-menu'));
    await user.press(screen.getByText('观测工具'));
    await user.press(screen.getByTestId('deep-space-tools-fov'));
    await user.press(screen.getByTestId('deep-space-fov-apply'));
    expect(screen.getByTestId('deep-space-fov-overlay')).toBeOnTheScreen();
    await user.press(screen.getByTestId('deep-space-reference-menu'));
    await user.press(screen.getByText('观测工具'));
    await user.press(screen.getByTestId('deep-space-tools-fov-clear'));
    expect(screen.queryByTestId('deep-space-fov-overlay')).not.toBeOnTheScreen();
  });

  it('applies an observer location from the settings panel', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-menu'));
    await user.press(screen.getByText('设置'));
    expect(screen.getByTestId('deep-space-settings-panel')).toBeOnTheScreen();
    await user.press(screen.getByTestId('deep-space-settings-location-entry'));
    await user.press(screen.getByTestId('deep-space-settings-location-上海'));
    expect(mockSetLocation).toHaveBeenLastCalledWith(31.23, 121.47);
  });
});

describe('deep space celestial search', () => {
  it('focuses a typed celestial target through the real engine bridge', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-search'));
    expect(screen.getByTestId('deep-space-reference-search-sheet')).toBeOnTheScreen();
    await user.type(screen.getByTestId('deep-space-map-search-input'), 'M 42');
    await user.press(screen.getByTestId('deep-space-map-search-submit'));
    await waitFor(() => expect(mockFocusTarget).toHaveBeenLastCalledWith('M 42'));
    await waitFor(() => expect(screen.queryByTestId('deep-space-reference-search-sheet')).not.toBeOnTheScreen());
  });

  it('shows real-time suggestions and navigates to target when tapped', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-search'));
    expect(screen.getByTestId('deep-space-reference-search-sheet')).toBeOnTheScreen();

    // Type Chinese keyword
    await user.type(screen.getByTestId('deep-space-map-search-input'), '织女');
    const vegaItem = await screen.findByTestId('deep-space-search-item-Vega');
    expect(vegaItem).toBeOnTheScreen();

    // Tap clear button
    await user.press(screen.getByTestId('deep-space-map-search-clear'));
    expect(screen.getByTestId('deep-space-map-search-input')).toHaveProp('value', '');

    // Type again and tap item
    await user.type(screen.getByTestId('deep-space-map-search-input'), '织女');
    await user.press(await screen.findByTestId('deep-space-search-item-Vega'));
    await waitFor(() => expect(mockFocusTarget).toHaveBeenLastCalledWith('Vega'));
  });

  it('filters celestial suggestions by category tabs', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-search'));
    await user.press(screen.getByText(translate('deep_space.search_browse')));
    await user.press(screen.getByTestId('deep-space-search-category-solar_system'));

    expect(screen.getByTestId('deep-space-search-item-NAME Mars')).toBeOnTheScreen();
    expect(screen.queryByTestId('deep-space-search-item-Vega')).not.toBeOnTheScreen();
  });

  it('moves to a Stellarium-style RA/Dec coordinate query without name lookup', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-search'));
    await user.type(screen.getByTestId('deep-space-map-search-input'), '6h45m7s 16d43m29s');
    await user.press(screen.getByTestId('deep-space-map-search-submit'));

    expect(mockGotoRaDec).toHaveBeenLastCalledWith(101.27916666666667, 16.72472222222222);
    expect(mockFocusTarget).not.toHaveBeenCalled();
    expect(screen.queryByTestId('deep-space-reference-search-sheet')).not.toBeOnTheScreen();
  });

  it('keeps the star map available when the engine cannot find a target', async () => {
    mockFocusTarget.mockResolvedValueOnce(null);
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-search'));
    await user.type(screen.getByTestId('deep-space-map-search-input'), 'M42');
    await user.press(screen.getByTestId('deep-space-map-search-submit'));
    await waitFor(() => expect(screen.getByTestId('deep-space-map-search-error')).toHaveTextContent('未找到该天体，请改用标准名称或编号'));
    expect(screen.getByTestId('deep-space-map-shell')).toBeOnTheScreen();
  });

  it('does not misreport an unrelated engine command error as a missing target', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-search'));
    act(() => mockOnCommandError?.());
    expect(screen.getByTestId('deep-space-map-shell')).toBeOnTheScreen();
    expect(screen.queryByTestId('deep-space-map-search-error')).not.toBeOnTheScreen();
    expect(mockShowDeepSpaceFeedback).toHaveBeenCalledWith(expect.objectContaining({ tone: 'danger' }));
  });
});

describe('search selection lifecycle integration', () => {
  const bootes: SelectedCelestialObject = {
    id: 'CON western Boo',
    name: '牧夫座',
    englishName: 'Boötes',
    designations: ['CON western Boo'],
    raHours: 14.7,
    decDeg: 30,
    type: 'constellation',
    typeZh: '星座',
    altDeg: 35,
    azDeg: 120,
  };

  it('shows the resolved target details and records the canonical ID in history', async () => {
    mockFocusTarget.mockResolvedValueOnce(bootes);
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-search'));
    fireEvent.changeText(screen.getByTestId('deep-space-map-search-input'), 'mufu');
    await user.press(screen.getByTestId('deep-space-search-item-CON western Boo'));
    expect(await screen.findByTestId('deep-space-object-info-sheet')).toHaveTextContent(/牧夫座/);
    await user.press(screen.getByTestId('deep-space-object-close-btn'));
    await user.press(screen.getByTestId('deep-space-reference-search'));
    await user.press(screen.getByText(translate('deep_space.search_recent')));
    expect(screen.getByTestId('deep-space-search-recent-CON western Boo')).toBeOnTheScreen();
  });

  it('ignores a cancelled result that arrives after the search sheet has reopened', async () => {
    let finish!: (object: SelectedCelestialObject | null) => void;
    mockFocusTarget.mockImplementationOnce(() => new Promise((resolve) => {
      finish = resolve;
    }));
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-search'));
    fireEvent.changeText(screen.getByTestId('deep-space-map-search-input'), 'mufu');
    fireEvent.press(screen.getByTestId('deep-space-search-item-CON western Boo'));
    await user.press(screen.getByTestId('deep-space-search-backdrop'));
    await user.press(screen.getByTestId('deep-space-reference-search'));
    await act(async () => finish(null));
    expect(screen.getByTestId('deep-space-reference-search-sheet')).toBeOnTheScreen();
    expect(screen.queryByTestId('deep-space-map-search-error')).not.toBeOnTheScreen();
  });

  it('does not let an earlier success overwrite the most recently selected object', async () => {
    let finish!: (object: SelectedCelestialObject | null) => void;
    mockFocusTarget.mockImplementationOnce(() => new Promise((resolve) => {
      finish = resolve;
    }));
    mockFocusTarget.mockResolvedValueOnce({ ...bootes, id: 'CON western Leo', name: '狮子座', englishName: 'Leo' });
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-search'));
    fireEvent.changeText(screen.getByTestId('deep-space-map-search-input'), 'mufu');
    fireEvent.press(screen.getByTestId('deep-space-search-item-CON western Boo'));
    fireEvent.changeText(screen.getByTestId('deep-space-map-search-input'), 'shizi');
    await user.press(screen.getByTestId('deep-space-search-item-CON western Leo'));
    await act(async () => finish(bootes));
    expect(await screen.findByTestId('deep-space-object-info-sheet')).toHaveTextContent(/狮子座/);
    expect(screen.queryByText('牧夫座')).not.toBeOnTheScreen();
  });
});

describe('search reason propagation', () => {
  it.each(['loading', 'culture_mismatch', 'missing_data'] as const)('keeps focus %s distinct and retries only when requested', async (reason) => {
    mockFocusTarget.mockRejectedValueOnce(new Error(`FOCUS_UNAVAILABLE:${reason}`));
    setup(<DeepSpaceMapScreen />);
    fireEvent.press(screen.getByTestId('deep-space-reference-search'));
    fireEvent.changeText(screen.getByTestId('deep-space-map-search-input'), 'Jupiter');
    fireEvent.press(screen.getByTestId('deep-space-search-item-NAME Jupiter'));
    expect(await screen.findByTestId('deep-space-map-search-error')).toHaveTextContent(translate(`deep_space.search_${reason}`));
    expect(mockSetSkyCulture).toHaveBeenLastCalledWith('western');
    fireEvent.press(screen.getByTestId('deep-space-search-retry'));
    expect(await screen.findByTestId('deep-space-object-info-sheet')).toBeOnTheScreen();
    expect(mockFocusTarget).toHaveBeenCalledTimes(2);
  });

  it.each(['timeout', 'Stellarium bridge reloaded.', 'loading'])('does not present %s as a missing object', async (message) => {
    mockFocusTarget.mockRejectedValueOnce(new Error(message));
    setup(<DeepSpaceMapScreen />);
    fireEvent.press(screen.getByTestId('deep-space-reference-search'));
    fireEvent.changeText(screen.getByTestId('deep-space-map-search-input'), 'Jupiter');
    fireEvent.press(screen.getByTestId('deep-space-search-item-NAME Jupiter'));
    expect(await screen.findByTestId('deep-space-map-search-error')).toHaveTextContent(translate('deep_space.search_failed'));
  });
});

async function flushSearchRequests() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('bounded loading metrics refresh', () => {
  const loading = (ids: string[]): Promise<TargetQueryResult[]> => Promise.resolve(ids.map(id => ({ id, available: false, reason: 'loading' })));
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    cleanup();
    mockQueryTargets.mockImplementation(async names => names.map(id => ({ id, available: true, altDeg: 42.5, vmag: 1.2 })));
    jest.useRealTimers();
  });

  it('polls a loading visible group within ten seconds then exposes an explicit retry and stops on close', async () => {
    mockQueryTargets.mockImplementation(loading);
    setup(<DeepSpaceMapScreen />);
    fireEvent.press(screen.getByTestId('deep-space-reference-search'));
    await flushSearchRequests();
    const firstCount = mockQueryTargets.mock.calls.length;
    await act(async () => jest.advanceTimersByTime(500));
    expect(mockQueryTargets).toHaveBeenCalledTimes(firstCount + 1);
    for (let tick = 0; tick < 21; tick++)
      await act(async () => jest.advanceTimersByTime(500));
    const afterDeadline = mockQueryTargets.mock.calls.length;
    expect(afterDeadline).toBeGreaterThan(firstCount);
    expect(afterDeadline - firstCount).toBeLessThanOrEqual(30);
    expect(screen.getByTestId('deep-space-search-retry')).toBeOnTheScreen();
    await act(async () => jest.advanceTimersByTime(30_000));
    expect(mockQueryTargets).toHaveBeenCalledTimes(afterDeadline);
    fireEvent.press(screen.getByTestId('deep-space-search-retry'));
    await flushSearchRequests();
    expect(mockQueryTargets).toHaveBeenCalledTimes(afterDeadline + 1);
    fireEvent.press(screen.getByTestId('deep-space-search-backdrop'));
    await act(async () => jest.advanceTimersByTime(2000));
    expect(mockQueryTargets).toHaveBeenCalledTimes(afterDeadline + 1);
  });

  it('queries a new visible group while the old request is pending and ignores the old response', async () => {
    let finishOld: (results: TargetQueryResult[]) => void = () => {};
    mockQueryTargets.mockImplementationOnce(() => new Promise((resolve) => {
      finishOld = resolve;
    }));
    setup(<DeepSpaceMapScreen />);
    fireEvent.press(screen.getByTestId('deep-space-reference-time'));
    fireEvent.press(screen.getByTestId('deep-space-time-speed-0'));
    fireEvent.press(screen.getByTestId('deep-space-reference-search'));
    fireEvent.changeText(screen.getByTestId('deep-space-map-search-input'), 'Jupiter');
    await flushSearchRequests();
    expect(mockQueryTargets).toHaveBeenCalledTimes(2);
    expect(mockQueryTargets).toHaveBeenLastCalledWith(['NAME Jupiter', 'NAME Io', 'NAME Europa', 'NAME Ganymede', 'NAME Callisto']);
    await act(async () => finishOld([{ id: 'NAME Jupiter', available: false, reason: 'loading' }]));
    await act(async () => jest.advanceTimersByTime(3000));
    expect(mockQueryTargets).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('deep-space-search-retry')).not.toBeOnTheScreen();
  });
});

describe('manual search metrics refresh', () => {
  it('keeps the visible snapshot unchanged when the observation clock advances', async () => {
    jest.useFakeTimers();
    try {
      setup(<DeepSpaceMapScreen />);
      fireEvent.press(screen.getByTestId('deep-space-reference-search'));
      await flushSearchRequests();
      const calls = mockQueryTargets.mock.calls.length;
      await act(async () => jest.advanceTimersByTime(30_000));
      expect(mockQueryTargets).toHaveBeenCalledTimes(calls);
    }
    finally {
      cleanup();
      jest.useRealTimers();
    }
  });

  it('keeps the visible snapshot until manual refresh when automatic observer coordinates change', async () => {
    let moveObserver: (value: unknown) => void = () => {};
    mockWatchPosition.mockImplementationOnce(async (_options, callback) => {
      moveObserver = callback as typeof moveObserver;
      return { remove: jest.fn() };
    });
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-menu'));
    await user.press(screen.getByText('设置'));
    await user.press(screen.getByTestId('deep-space-settings-location-entry'));
    await user.press(screen.getByTestId('deep-space-settings-auto-location-toggle'));
    await user.press(screen.getByLabelText('返回设置'));
    await user.press(screen.getByLabelText(translate('deep_space.back')));
    fireEvent.press(screen.getByTestId('deep-space-reference-search'));
    await flushSearchRequests();
    const calls = mockQueryTargets.mock.calls.length;
    await act(async () => moveObserver({ coords: { latitude: 5, longitude: 10 } }));
    expect(mockSetLocation).toHaveBeenLastCalledWith(5, 10);
    expect(mockQueryTargets).toHaveBeenCalledTimes(calls);
  });
});

describe('manual visible snapshot lifecycle', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    cleanup();
    mockQueryTargets.mockReset().mockImplementation(async names => names.map(id => ({ id, available: true, altDeg: 42.5, vmag: 1.2 })));
    jest.useRealTimers();
  });

  async function openVisibleTargets() {
    mockQueryTargets.mockResolvedValueOnce([
      { id: 'NAME Sun', available: true, altDeg: 60 },
      { id: 'NAME Moon', available: true, altDeg: 30 },
    ]);
    setup(<DeepSpaceMapScreen />);
    fireEvent.press(screen.getByTestId('deep-space-reference-search'));
    await flushSearchRequests();
    fireEvent.press(screen.getByTestId('deep-space-search-tab-visible'));
  }

  it('reuses the visible snapshot after visiting a search result instead of querying it again', async () => {
    await openVisibleTargets();
    fireEvent.changeText(screen.getByTestId('deep-space-map-search-input'), 'Jupiter');
    await flushSearchRequests();
    expect(mockQueryTargets).toHaveBeenCalledTimes(2);
    fireEvent.changeText(screen.getByTestId('deep-space-map-search-input'), '');
    await flushSearchRequests();
    expect(mockQueryTargets).toHaveBeenCalledTimes(2);
    expect(screen.getAllByTestId(/^deep-space-popular-/).map(row => row.props.testID)).toEqual(['deep-space-popular-NAME Sun', 'deep-space-popular-NAME Moon']);
  });

  it('keeps the old list during a manual refresh, rejects duplicate taps and replaces it only on completion', async () => {
    await openVisibleTargets();
    let finish: (results: TargetQueryResult[]) => void = () => {};
    mockQueryTargets.mockImplementationOnce(() => new Promise((resolve) => {
      finish = resolve;
    }));
    fireEvent.press(screen.getByTestId('deep-space-visible-refresh'));
    expect(screen.getByTestId('deep-space-visible-refresh')).toBeDisabled();
    expect(screen.getByTestId('deep-space-popular-NAME Sun')).toBeOnTheScreen();
    expect(screen.getByTestId('deep-space-popular-NAME Moon')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('deep-space-visible-refresh'));
    expect(mockQueryTargets).toHaveBeenCalledTimes(2);
    await act(async () => finish([
      { id: 'NAME Sun', available: true, altDeg: -5 },
      { id: 'NAME Moon', available: true, altDeg: 70 },
    ]));
    expect(screen.queryByTestId('deep-space-popular-NAME Sun')).not.toBeOnTheScreen();
    expect(screen.getByTestId('deep-space-popular-NAME Moon')).toBeOnTheScreen();
    expect(screen.getByTestId('deep-space-visible-refresh')).not.toBeDisabled();
  });

  it('preserves the previous snapshot and allows retry when a manual refresh fails', async () => {
    await openVisibleTargets();
    mockQueryTargets.mockRejectedValueOnce(new Error('metrics failed'));
    fireEvent.press(screen.getByTestId('deep-space-visible-refresh'));
    await flushSearchRequests();
    expect(screen.getByTestId('deep-space-popular-NAME Sun')).toBeOnTheScreen();
    expect(screen.getByTestId('deep-space-popular-NAME Moon')).toBeOnTheScreen();
    expect(screen.getByTestId('deep-space-visible-refresh')).not.toBeDisabled();
    expect(screen.getByTestId('deep-space-search-retry')).toBeOnTheScreen();
    await act(async () => jest.advanceTimersByTime(30_000));
    expect(mockQueryTargets).toHaveBeenCalledTimes(2);
    fireEvent.press(screen.getByTestId('deep-space-search-retry'));
    await flushSearchRequests();
    expect(mockQueryTargets).toHaveBeenCalledTimes(3);
  });

  it('ignores a manual refresh that resolves after closing and reopening search', async () => {
    await openVisibleTargets();
    let finishOld: (results: TargetQueryResult[]) => void = () => {};
    mockQueryTargets.mockImplementationOnce(() => new Promise((resolve) => {
      finishOld = resolve;
    }));
    fireEvent.press(screen.getByTestId('deep-space-visible-refresh'));
    fireEvent.press(screen.getByTestId('deep-space-search-backdrop'));
    mockQueryTargets.mockResolvedValueOnce([{ id: 'NAME Jupiter', available: true, altDeg: 75 }]);
    fireEvent.press(screen.getByTestId('deep-space-reference-search'));
    await flushSearchRequests();
    fireEvent.press(screen.getByTestId('deep-space-search-tab-visible'));
    expect(mockQueryTargets).toHaveBeenCalledTimes(3);
    await act(async () => finishOld([{ id: 'NAME Sun', available: true, altDeg: 80 }]));
    expect(screen.getByTestId('deep-space-popular-NAME Jupiter')).toBeOnTheScreen();
    expect(screen.queryByTestId('deep-space-popular-NAME Sun')).not.toBeOnTheScreen();
  });
});

describe('detail observing-context integration', () => {
  const object: SelectedCelestialObject = { id: 'HIP 32349', catalogId: 'Sirius', name: '天狼星', englishName: 'Sirius', designations: ['HIP 32349'], raHours: 6.75, decDeg: -16.7, altDeg: 10, azDeg: 20 };
  it('refreshes paused details after ready without focus or duplicate history and stops after close', async () => {
    setup(<DeepSpaceMapScreen />);
    fireEvent.press(screen.getByTestId('deep-space-reference-time'));
    fireEvent.press(screen.getByTestId('deep-space-time-speed-0'));
    fireEvent.press(screen.getByTestId('deep-space-time-close-button'));
    mockGetObjectInfo.mockResolvedValueOnce(object);
    await act(async () => mockOnObjectSelected?.(object));
    expect(mockGetObjectInfo).toHaveBeenLastCalledWith('HIP 32349');
    const historyWrites = (storage.set as jest.Mock).mock.calls.filter(([key]) => key === STORAGE_KEYS.DEEP_SPACE_RECENT_OBJECTS).length;
    const focusCalls = mockFocusTarget.mock.calls.length;
    mockGetObjectInfo.mockResolvedValueOnce({ ...object, altDeg: 40 });
    const reads = mockGetObjectInfo.mock.calls.length;
    await act(async () => mockOnReady?.());
    expect(mockGetObjectInfo).toHaveBeenCalledTimes(reads + 1);
    expect(mockFocusTarget).toHaveBeenCalledTimes(focusCalls);
    expect((storage.set as jest.Mock).mock.calls.filter(([key]) => key === STORAGE_KEYS.DEEP_SPACE_RECENT_OBJECTS)).toHaveLength(historyWrites);
    fireEvent.press(screen.getByTestId('deep-space-object-close-btn'));
    await act(async () => mockOnReady?.());
    expect(mockGetObjectInfo).toHaveBeenCalledTimes(reads + 1);
    fireEvent.press(screen.getByTestId('deep-space-reference-search'));
    await flushSearchRequests();
    fireEvent.press(screen.getByText(translate('deep_space.search_recent')));
    expect(screen.getByTestId('deep-space-search-recent-Sirius')).toBeOnTheScreen();
  });
});

describe('deep space air quality integration', () => {
  it('defaults air quality to Bortle 1 and cycles it through the existing stepper', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);

    expect(mockSetEnvironment).toHaveBeenCalledWith({
      bortleIndex: 1,
      cardinals: true,
      fog: true,
      turbidity: 0.96,
    });

    await user.press(screen.getByTestId('deep-space-grid-quick-toggle'));
    await user.longPress(screen.getByTestId('deep-space-grid-quick-atmosphere'));

    expect(screen.getByTestId('deep-space-quick-detail-stepper-air-quality')).toBeOnTheScreen();
    expect(screen.getByTestId('deep-space-quick-detail-stepper-air-quality-value')).toHaveTextContent('Bortle 1 · 极佳暗空');

    await user.press(screen.getByTestId('deep-space-quick-detail-stepper-air-quality-next'));
    expect(mockSetEnvironment).toHaveBeenLastCalledWith({ bortleIndex: 2 });

    await user.press(screen.getByTestId('deep-space-quick-detail-stepper-air-quality-prev'));
    expect(mockSetEnvironment).toHaveBeenLastCalledWith({ bortleIndex: 1 });
  });
});

describe('deep space landscape and environment integration', () => {
  async function openLandscapeDetail(user: ReturnType<typeof setup>['user']) {
    await user.press(screen.getByTestId('deep-space-grid-quick-toggle'));
    await user.longPress(screen.getByTestId('deep-space-grid-quick-landscape'));
  }

  it('opens the same quick detail sheet as the other controls on long pressing the quick landscape control', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await openLandscapeDetail(user);

    expect(screen.getByTestId('deep-space-quick-detail-sheet')).toBeOnTheScreen();
    expect(screen.getByText('地景设置')).toBeOnTheScreen();
    expect(screen.getByTestId('deep-space-quick-detail-toggle-landscape')).toBeOnTheScreen();
  });

  it('toggles the landscape layer from inside the quick detail sheet', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await openLandscapeDetail(user);

    await user.press(screen.getByTestId('deep-space-quick-detail-toggle-landscape'));

    expect(mockSetSkyLayers).toHaveBeenLastCalledWith({ landscape: false });
  });

  it('sends environment changes to the engine from the quick detail sheet', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await openLandscapeDetail(user);

    await user.press(screen.getByTestId('deep-space-quick-detail-toggle-cardinals'));

    expect(mockSetEnvironment).toHaveBeenCalledWith({ cardinals: false });
  });

  it('steps forward through the landscapes without leaving the sheet', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await openLandscapeDetail(user);

    expect(screen.getByTestId('deep-space-quick-detail-stepper-landscape-library-value')).toHaveTextContent('盖兰');

    await user.press(screen.getByTestId('deep-space-quick-detail-stepper-landscape-library-next'));

    expect(mockSetLandscape).toHaveBeenLastCalledWith('winterfield');
    // The sheet stays open so the observer can keep browsing.
    expect(screen.getByTestId('deep-space-quick-detail-sheet')).toBeOnTheScreen();
    expect(screen.getByTestId('deep-space-quick-detail-stepper-landscape-library-value')).toHaveTextContent('冬日原野');
  });

  it('wraps around to the last landscape when stepping backwards from the first', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await openLandscapeDetail(user);

    await user.press(screen.getByTestId('deep-space-quick-detail-stepper-landscape-library-prev'));

    expect(mockSetLandscape).toHaveBeenLastCalledWith('ocean');
  });
});

describe('deep space celestial object info integration', () => {
  const MOCK_TARGET = {
    altDeg: 35.8,
    azDeg: 120.4,
    decDeg: -5.38,
    designations: ['M 42', 'NGC 1976'],
    distanceAu: null,
    englishName: 'Orion Nebula',
    id: 'NAME Great Orion Nebula',
    name: '猎户座大星云',
    phase: null,
    raHours: 5.58,
    vmag: 4.0,
  };

  it('pops up object info sheet when an object is selected in the star map', async () => {
    setup(<DeepSpaceMapScreen />);

    act(() => mockOnObjectSelected?.(MOCK_TARGET));

    expect(await screen.findByTestId('deep-space-object-info-sheet')).toBeOnTheScreen();
    expect(screen.getByText('猎户座大星云')).toBeOnTheScreen();
    expect(screen.getByText('Orion Nebula · M 42')).toBeOnTheScreen();
  });

  it('surfaces a selected object in recent search and lets the user revisit it', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);

    act(() => mockOnObjectSelected?.(MOCK_TARGET));
    await user.press(await screen.findByTestId('deep-space-object-close-btn'));
    await user.press(screen.getByTestId('deep-space-reference-search'));
    await user.press(screen.getByText(translate('deep_space.search_recent')));
    await user.press(screen.getByTestId('deep-space-search-recent-NAME Great Orion Nebula'));

    await waitFor(() => expect(mockFocusTarget).toHaveBeenLastCalledWith('NAME Great Orion Nebula'));
  });

  it('locks onto target when center button in info sheet is tapped', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);

    act(() => mockOnObjectSelected?.(MOCK_TARGET));
    await user.press(await screen.findByTestId('deep-space-object-center-btn'));

    expect(mockPointAndLock).toHaveBeenCalledWith('NAME Great Orion Nebula');
  });

  it('opens telescope controls with a clear connection-status cue from object actions', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);

    act(() => mockOnObjectSelected?.(MOCK_TARGET));
    await user.press(await screen.findByTestId('deep-space-object-goto-btn'));

    expect(mockGotoRaDec).toHaveBeenLastCalledWith(5.58 * 15, -5.38);
    expect(mockShowDeepSpaceFeedback).toHaveBeenCalledWith({ message: '已打开望远镜控制，可检查连接后发送 GOTO', tone: 'success' });
    expect(screen.getByTestId('deep-space-tools-panel')).toBeOnTheScreen();
  });

  it('dismisses info sheet and clears engine selection on close button tap', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);

    act(() => mockOnObjectSelected?.(MOCK_TARGET));
    expect(await screen.findByTestId('deep-space-object-info-sheet')).toBeOnTheScreen();

    await user.press(screen.getByTestId('deep-space-object-close-btn'));

    expect(screen.queryByTestId('deep-space-object-info-sheet')).not.toBeOnTheScreen();
    expect(mockClearSelection).toHaveBeenCalled();
  });

  it('hides object info sheet when selection is cleared in the scene', async () => {
    setup(<DeepSpaceMapScreen />);

    act(() => mockOnObjectSelected?.(MOCK_TARGET));
    expect(await screen.findByTestId('deep-space-object-info-sheet')).toBeOnTheScreen();

    act(() => mockOnSelectionCleared?.());
    expect(screen.queryByTestId('deep-space-object-info-sheet')).not.toBeOnTheScreen();
  });
});

describe('deep space compass and azimuth controls', () => {
  it('keeps top controls clean with only menu and search buttons', () => {
    setup(<DeepSpaceMapScreen />);

    expect(screen.getByTestId('deep-space-reference-menu')).toBeOnTheScreen();
    expect(screen.getByTestId('deep-space-reference-search')).toBeOnTheScreen();
    expect(screen.queryByTestId('deep-space-compass-follow')).not.toBeOnTheScreen();
  });

  it('opens azimuth input dialog on tapping angle readout and rotates sky bearing', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);

    expect(screen.getByTestId('deep-space-reference-compass-azimuth-btn')).toBeOnTheScreen();
    await user.press(screen.getByTestId('deep-space-reference-compass-azimuth-btn'));

    expect(screen.getByTestId('deep-space-azimuth-input-dialog')).toBeOnTheScreen();
    await user.clear(screen.getByTestId('deep-space-azimuth-input'));
    await user.type(screen.getByTestId('deep-space-azimuth-input'), '135');
    await user.press(screen.getByTestId('deep-space-azimuth-confirm'));

    expect(mockSetViewBearing).toHaveBeenCalledWith(135);
    expect(mockShowDeepSpaceFeedback).toHaveBeenCalledWith({
      message: '视角已转向 135°',
      tone: 'success',
    });
    expect(screen.queryByTestId('deep-space-azimuth-input-dialog')).not.toBeOnTheScreen();
    expect(screen.getByTestId('deep-space-reference-compass-azimuth')).toHaveTextContent('135°');
  });

  it('supports quick direction presets in azimuth dialog', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);

    await user.press(screen.getByTestId('deep-space-reference-compass-azimuth-btn'));
    expect(screen.getByTestId('deep-space-azimuth-input-dialog')).toBeOnTheScreen();

    await user.press(screen.getByTestId('deep-space-azimuth-preset-90'));
    await user.press(screen.getByTestId('deep-space-azimuth-confirm'));

    expect(mockSetViewBearing).toHaveBeenCalledWith(90);
    expect(screen.queryByTestId('deep-space-azimuth-input-dialog')).not.toBeOnTheScreen();
    expect(screen.getByTestId('deep-space-reference-compass-azimuth')).toHaveTextContent('90°');
  });
});

describe('deep space view preference archive', () => {
  it('restores the archived switches and camera view when the map is reopened', () => {
    const map = installArchivedStorage();
    const archived = archivedPreferencesJson();
    map.set(STORAGE_KEYS.DEEP_SPACE_VIEW_PREFERENCES, archived);
    map.set(STORAGE_KEYS.DEEP_SPACE_VIEW_STATE, archivedViewStateJson());

    setup(<DeepSpaceMapScreen />);

    expect(mockSetSkyCulture).toHaveBeenLastCalledWith('chinese');
    expect(mockSetLandscape).toHaveBeenLastCalledWith('ocean');
    expect(mockSetGridLines).toHaveBeenLastCalledWith(expect.objectContaining({ meridian: true }));
    expect(mockSetEnvironment).toHaveBeenLastCalledWith(expect.objectContaining({ bortleIndex: 5, cardinals: false, fog: false, turbidity: 3 }));
    expect(mockSetSkyLayers).toHaveBeenLastCalledWith(expect.objectContaining({ landscape: false, starHintsOffset: 2.5, starLabels: false }));
    // The archived camera angle is replayed last, after the observation context.
    expect(mockRestoreView).toHaveBeenLastCalledWith({ altitudeDeg: 12.5, azimuthDeg: 271.2, fovDeg: 30.5 });
    expectRestoreOrder();

    expect(screen.getByTestId('deep-space-night-mode-overlay')).toBeOnTheScreen();
    expect(screen.getByTestId('deep-space-restore-culture-fab')).toBeOnTheScreen();
    // Opening the page must not overwrite the archive it just read.
    expect(map.get(STORAGE_KEYS.DEEP_SPACE_VIEW_PREFERENCES)).toBe(archived);
  });

  it('keeps the changed switches and the camera angle across a close and reopen', async () => {
    const map = installArchivedStorage();
    const { unmount, user } = setup(<DeepSpaceMapScreen />);

    await user.press(screen.getByTestId('deep-space-grid-quick-toggle'));
    await user.press(screen.getByTestId('deep-space-grid-quick-grid-lines'));
    await user.press(screen.getByTestId('deep-space-grid-quick-labels'));
    await user.press(screen.getByTestId('deep-space-grid-quick-night-mode'));
    await user.longPress(screen.getByTestId('deep-space-grid-quick-landscape'));
    await user.press(screen.getByTestId('deep-space-quick-detail-stepper-landscape-library-next'));
    await user.press(screen.getByTestId('deep-space-quick-detail-toggle-landscape'));
    act(() => mockOnViewStateChange?.({ altitudeDeg: -12.5, azimuthDeg: 271.25, fovDeg: 182.28 }));

    expect(storedJson(map, STORAGE_KEYS.DEEP_SPACE_VIEW_PREFERENCES)).toMatchObject({
      landscapeId: 'winterfield',
      nightMode: true,
    });
    expect(storedJson(map, STORAGE_KEYS.DEEP_SPACE_VIEW_STATE)).toEqual({
      state: { altitudeDeg: -12.5, azimuthDeg: 271.25, fovDeg: 182.28 },
      version: 1,
    });

    unmount();
    setup(<DeepSpaceMapScreen />);

    expect(screen.getByTestId('deep-space-night-mode-overlay')).toBeOnTheScreen();
    expect(mockSetLandscape).toHaveBeenLastCalledWith('winterfield');
    expect(mockSetGridLines).toHaveBeenLastCalledWith(expect.objectContaining({ azimuthal: true, equatorial_jnow: true }));
    expect(mockSetSkyLayers).toHaveBeenLastCalledWith(expect.objectContaining({
      dsoLabels: false,
      landscape: false,
      planetLabels: false,
      satelliteLabels: false,
      starLabels: false,
    }));
    expect(mockRestoreView).toHaveBeenLastCalledWith({ altitudeDeg: -12.5, azimuthDeg: 271.25, fovDeg: 182.28 });
  });
});

describe('deep space camera view archive', () => {
  it('archives a reported camera view without restoring it again in the same visit', () => {
    const map = installArchivedStorage();
    const { unmount } = setup(<DeepSpaceMapScreen />);
    // With no archive the scene only gets the null view that opens the channel.
    expect(mockRestoreView).toHaveBeenLastCalledWith(null);

    const restores = mockRestoreView.mock.calls.length;
    act(() => mockOnViewStateChange?.({ altitudeDeg: 0, azimuthDeg: 180, fovDeg: 182.28 }));

    expect(mockRestoreView).toHaveBeenCalledTimes(restores);
    expect(storedJson(map, STORAGE_KEYS.DEEP_SPACE_VIEW_STATE)).toEqual({
      state: { altitudeDeg: 0, azimuthDeg: 180, fovDeg: 182.28 },
      version: 1,
    });

    unmount();
    setup(<DeepSpaceMapScreen />);

    expect(mockRestoreView).toHaveBeenLastCalledWith({ altitudeDeg: 0, azimuthDeg: 180, fovDeg: 182.28 });
  });

  it('never archives a camera view outside the engine range', () => {
    const map = installArchivedStorage();
    const { unmount } = setup(<DeepSpaceMapScreen />);

    act(() => mockOnViewStateChange?.({ altitudeDeg: 10, azimuthDeg: 400, fovDeg: 40 }));

    expect(map.has(STORAGE_KEYS.DEEP_SPACE_VIEW_STATE)).toBe(false);

    unmount();
    setup(<DeepSpaceMapScreen />);

    expect(mockRestoreView).toHaveBeenLastCalledWith(null);
  });

  it('drops the archive on reset and reopens the map on its defaults', async () => {
    const map = installArchivedStorage();
    map.set(STORAGE_KEYS.DEEP_SPACE_VIEW_PREFERENCES, archivedPreferencesJson());
    map.set(STORAGE_KEYS.DEEP_SPACE_VIEW_STATE, archivedViewStateJson());
    const { unmount, user } = setup(<DeepSpaceMapScreen />);
    expect(screen.getByTestId('deep-space-night-mode-overlay')).toBeOnTheScreen();

    await user.press(screen.getByTestId('deep-space-reference-menu'));
    await user.press(screen.getByText('设置'));
    await user.press(screen.getByTestId('deep-space-settings-reset-entry'));
    await user.press(screen.getByText('确定'));

    expect(map.has(STORAGE_KEYS.DEEP_SPACE_VIEW_PREFERENCES)).toBe(false);
    expect(map.has(STORAGE_KEYS.DEEP_SPACE_VIEW_STATE)).toBe(false);
    expect(screen.queryByTestId('deep-space-night-mode-overlay')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('deep-space-restore-culture-fab')).not.toBeOnTheScreen();
    expect(mockSetSkyCulture).toHaveBeenLastCalledWith('western');
    expect(mockSetLandscape).toHaveBeenLastCalledWith('guereins');
    expect(mockSetGridLines).toHaveBeenLastCalledWith(expect.objectContaining({ meridian: false }));

    unmount();
    setup(<DeepSpaceMapScreen />);

    expect(screen.queryByTestId('deep-space-night-mode-overlay')).not.toBeOnTheScreen();
    expect(mockRestoreView).toHaveBeenLastCalledWith(null);
    expect(mockSetSkyCulture).toHaveBeenLastCalledWith('western');
    expect(mockSetLandscape).toHaveBeenLastCalledWith('guereins');
  });
});

describe('deep space centering releases the sensor', () => {
  beforeEach(() => {
    // The sky clock pushes a real one-second tick through the bridge. Freeze it
    // so "centering changed nothing" cannot race with an unrelated tick.
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-10T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function enableCompassFollowing() {
    fireEvent.press(screen.getByTestId('deep-space-reference-menu'));
    fireEvent.press(screen.getByText('设置'));
    fireEvent.press(screen.getByTestId('deep-space-settings-sensor-toggle'));
    await waitFor(() => expect(mockWatchHeading).toHaveBeenCalledTimes(1));
    fireEvent.press(screen.getByLabelText(translate('deep_space.back')));
  }

  it('stops the sensor before locking the selected object and ignores what arrives late', async () => {
    setup(<DeepSpaceMapScreen />);
    await enableCompassFollowing();

    act(() => mockOnObjectSelected?.(CENTER_TARGET));
    expect(screen.getByTestId('deep-space-object-center-btn')).toBeOnTheScreen();

    const baselines = {
      goto: mockGotoRaDec.mock.calls.length,
      location: mockSetLocation.mock.calls.length,
      removals: mockHeadingSubscription.remove.mock.calls.length,
      time: mockSetTime.mock.calls.length,
      zoom: mockZoomTo.mock.calls.length,
    };

    fireEvent.press(screen.getByTestId('deep-space-object-center-btn'));

    expect(mockPointAndLock).toHaveBeenLastCalledWith('NAME Great Orion Nebula');
    expect(mockHeadingSubscription.remove).toHaveBeenCalledTimes(baselines.removals + 1);
    // The details sheet stays open and nothing else moves the camera.
    expect(screen.getByTestId('deep-space-object-info-sheet')).toBeOnTheScreen();
    expect(mockGotoRaDec).toHaveBeenCalledTimes(baselines.goto);
    expect(mockSetLocation).toHaveBeenCalledTimes(baselines.location);
    expect(mockSetTime).toHaveBeenCalledTimes(baselines.time);
    expect(mockZoomTo).toHaveBeenCalledTimes(baselines.zoom);
    expect(screen.queryByTestId('deep-space-tools-panel')).not.toBeOnTheScreen();

    // A heading that still arrives late must not steer the view back.
    act(() => mockHeadingCallback?.({ trueHeading: 90 }));
    expect(mockSetViewBearing).not.toHaveBeenCalled();

    // An explicit time refresh still works and must not hand the view back to
    // the sensor either.
    fireEvent.press(screen.getByTestId('deep-space-reference-time'));
    fireEvent.press(screen.getByTestId('deep-space-time-now-button'));
    act(() => jest.advanceTimersByTime(1000));
    expect(mockSetTime.mock.calls.length).toBeGreaterThan(baselines.time);
    act(() => mockOnReady?.());
    expect(mockSetViewBearing).not.toHaveBeenCalled();
    expect(mockPointAndLock).toHaveBeenCalledTimes(1);
    expect(mockWatchHeading).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByTestId('deep-space-reference-menu'));
    fireEvent.press(screen.getByText('设置'));
    expect(screen.getByTestId('deep-space-settings-sensor-toggle').props.accessibilityState.checked).toBe(false);
  });

  it('stops the sensor before a search result is focused', async () => {
    setup(<DeepSpaceMapScreen />);
    await enableCompassFollowing();

    fireEvent.press(screen.getByTestId('deep-space-reference-search'));
    fireEvent.changeText(screen.getByTestId('deep-space-map-search-input'), '织女');
    const item = await screen.findByTestId('deep-space-search-item-Vega');
    const removals = mockHeadingSubscription.remove.mock.calls.length;

    fireEvent.press(item);

    await waitFor(() => expect(mockFocusTarget).toHaveBeenLastCalledWith('Vega'));
    expect(mockHeadingSubscription.remove).toHaveBeenCalledTimes(removals + 1);
    expect(mockPointAndLock).not.toHaveBeenCalled();
    expect(mockZoomTo).not.toHaveBeenCalled();

    act(() => mockHeadingCallback?.({ trueHeading: 45 }));
    expect(mockSetViewBearing).not.toHaveBeenCalled();
  });
});
