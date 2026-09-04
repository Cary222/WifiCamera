import type { TonightReport } from '@/features/stellarium/stellarium-service';
import * as React from 'react';

import { act, cleanup, fireEvent, screen, setup } from '@/lib/test-utils';

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
const mockWatchHeading = jest.fn(async (_callback?: unknown) => ({ remove: jest.fn() }));
const mockWatchPosition = jest.fn(async (_options?: unknown, _callback?: unknown) => ({ remove: jest.fn() }));
const mockClearSelection = jest.fn();
const mockGotoRaDec = jest.fn();
const mockPointAndLock = jest.fn();
const mockReload = jest.fn();
const mockSearchTarget = jest.fn();
const mockSetEnvironment = jest.fn();
const mockSetGridLines = jest.fn();
const mockSetLandscape = jest.fn();
const mockSetLocation = jest.fn();
const mockSetSkyCulture = jest.fn();
const mockSetSkyLayers = jest.fn();
const mockSetTime = jest.fn();
const mockSetViewBearing = jest.fn();
const mockSetFovFrame = jest.fn();
const mockToggleConstellations = jest.fn();
const mockZoomTo = jest.fn();
const mockShowDeepSpaceFeedback = jest.fn();
let mockOnCommandError: (() => void) | undefined;
let mockOnObjectSelected: ((object: unknown) => void) | undefined;
let mockOnSelectionCleared: (() => void) | undefined;
let mockOnTargetFound: (() => void) | undefined;
let mockOnTargetNotFound: (() => void) | undefined;
let mockOnBearingChange: ((azimuthDeg: number) => void) | undefined;

jest.mock('uniwind', () => ({
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

jest.mock('@/lib/i18n', () => ({
  getLanguage: () => 'zh',
  translate: (key: string, options?: Record<string, unknown>) => {
    if (key === 'deep_space.compass_feedback_rotated' && options?.azimuth !== undefined) {
      return `视角已转向 ${options.azimuth}°`;
    }
    return ({
      'deep_space.calendar_error': '计算失败',
      'deep_space.calendar_events': '活动',
      'deep_space.calendar_loading': '正在计算…',
      'deep_space.calendar_retry': '重试',
      'deep_space.calendar_tonight': '今晚',
      'deep_space.compass_azimuth_apply': '调整视角',
      'deep_space.compass_azimuth_hint': '输入 0° ~ 360° 方位角调整星图朝向',
      'deep_space.compass_azimuth_input_placeholder': '方位角 (0-360)',
      'deep_space.compass_custom_azimuth': '设置视角方位角',
      'deep_space.compass_permission_denied': '需要位置权限才能使用真实罗盘航向',
      'deep_space.compass_preset_east': '90° 东',
      'deep_space.compass_preset_north': '0° 北',
      'deep_space.compass_preset_south': '180° 南',
      'deep_space.compass_preset_west': '270° 西',
      'deep_space.compass_start': '开启真实罗盘航向',
      'deep_space.compass_started': '正在按真实罗盘航向跟随',
      'deep_space.compass_stop': '停止罗盘航向跟随',
      'deep_space.compass_stopped': '已停止罗盘航向跟随',
      'deep_space.compass_unavailable': '当前设备无法提供罗盘航向',
      'deep_space.dawn_start': '天文晨光始',
      'deep_space.dusk_end': '天文昏影终',
      'deep_space.feedback_labels_reset': '标签注记已重置',
      'deep_space.feedback_returned_to_now': '已回到当前时间',
      'deep_space.feedback_telescope_controls': '已打开望远镜控制，可检查连接后发送 GOTO',
      'deep_space.full_moon': '满月',
      'deep_space.meteor_shower': '流星雨极大',
      'deep_space.moon': '月',
      'deep_space.moon_phase': '月相',
      'deep_space.moonrise': '月出',
      'deep_space.moonset': '月落',
      'deep_space.no_events': '该时段没有天象事件',
      'deep_space.no_planets': '今晚没有行星在地平线以上',
      'deep_space.peak_altitude': '最高',
      'deep_space.satellite_altitude': '高程',
      'deep_space.satellite_error': '无法获取卫星轨道数据',
      'deep_space.satellite_magnitude': '星等',
      'deep_space.satellite_none': '今晚没有可见卫星经过',
      'deep_space.satellite_passes': '有卫星经过',
      'deep_space.satellite_retry': '重试',
      'deep_space.satellite_time': '时间',
      'deep_space.saturn': '土星',
      'deep_space.solar_system': '太阳系',
      'deep_space.sunrise': '日出',
      'deep_space.sunset': '日落',
      'deep_space.visible_tonight': '今晚可见',
      'deep_space.waxing_gibbous': '盈凸月',
      'deep_space.atmosphere': '大气',
      'deep_space.constellation_art': '星座图',
      'deep_space.constellations': '星座连线',
      'deep_space.horizon': '地平线',
      'deep_space.layers': '图层',
      'deep_space.menu': '菜单',
      'deep_space.return_to_now': '回到当前时间',
      'deep_space.search': '搜索天体',
      'deep_space.search_not_found': '未找到该天体，请改用标准名称或编号',
      'deep_space.search_placeholder': '输入天体名称或编号',
      'deep_space.time': '时间',
    } as Record<string, string>)[key] ?? key;
  },
}));

jest.mock('@/features/deep-space/calendar/satellite-pass-service', () => ({
  loadVisualOmm: jest.fn(async () => []),
  predictVisiblePasses: jest.fn(async () => []),
}));

jest.mock('@/features/stellarium/stellarium-view', () => {
  const mockReact = require('react');
  const { View: MockView } = require('react-native');

  return {
    StellariumView: ({ onBearingChange, onCommandError, onObjectSelected, onReady, onSelectionCleared, onTargetFound, onTargetNotFound, ref }: { onBearingChange?: (azimuthDeg: number) => void; onCommandError?: () => void; onObjectSelected?: (object: unknown) => void; onReady?: () => void; onSelectionCleared?: () => void; onTargetFound?: () => void; onTargetNotFound?: () => void; ref?: unknown }) => {
      mockOnBearingChange = onBearingChange;
      mockOnCommandError = onCommandError;
      mockOnObjectSelected = onObjectSelected;
      mockOnSelectionCleared = onSelectionCleared;
      mockOnTargetFound = onTargetFound;
      mockOnTargetNotFound = onTargetNotFound;
      const readyRef = mockReact.useRef(false);
      mockReact.useImperativeHandle(ref, () => ({
        clearSelection: mockClearSelection,
        computeEvents: mockComputeEvents,
        computeTonight: mockComputeTonight,
        gotoRaDec: mockGotoRaDec,
        pointAndLock: mockPointAndLock,
        reload: mockReload,
        searchTarget: mockSearchTarget,
        setEnvironment: mockSetEnvironment,
        setFovFrame: mockSetFovFrame,
        setGridLines: mockSetGridLines,
        setLandscape: mockSetLandscape,
        setLocation: mockSetLocation,
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
  mockComputeEvents.mockClear();
  mockComputeTonight.mockClear();
  mockRequestLocationPermission.mockClear();
  mockWatchHeading.mockClear();
  mockReload.mockClear();
  mockSearchTarget.mockClear();
  mockSetEnvironment.mockClear();
  mockSetGridLines.mockClear();
  mockSetLocation.mockClear();
  mockSetSkyCulture.mockClear();
  mockSetSkyLayers.mockClear();
  mockSetTime.mockClear();
  mockSetViewBearing.mockClear();
  mockSetFovFrame.mockClear();
  mockGotoRaDec.mockClear();
  mockToggleConstellations.mockClear();
  mockZoomTo.mockClear();
  mockShowDeepSpaceFeedback.mockClear();
  mockOnBearingChange = undefined;
  mockOnCommandError = undefined;
  mockOnTargetFound = undefined;
  mockOnTargetNotFound = undefined;
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

describe('deep space calendar, tools and settings features', () => {
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
    expect(screen.getByText('1.00')).toBeOnTheScreen();

    await user.press(screen.getByTestId('deep-space-settings-advanced-back'));
    expect(screen.getByTestId('deep-space-settings-panel')).toBeOnTheScreen();
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

describe('deep space observation tools and search', () => {
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

  it('searches for a typed celestial target through the existing bridge', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-search'));
    expect(screen.getByTestId('deep-space-reference-search-sheet')).toBeOnTheScreen();
    await user.type(screen.getByTestId('deep-space-map-search-input'), 'M 42');
    await user.press(screen.getByTestId('deep-space-map-search-submit'));
    expect(mockSearchTarget).toHaveBeenLastCalledWith('M 42');
    act(() => mockOnTargetFound?.());
    expect(screen.queryByTestId('deep-space-reference-search-sheet')).not.toBeOnTheScreen();
  });

  it('moves to a Stellarium-style RA/Dec coordinate query without name lookup', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-search'));
    await user.type(screen.getByTestId('deep-space-map-search-input'), '6h45m7s 16d43m29s');
    await user.press(screen.getByTestId('deep-space-map-search-submit'));

    expect(mockGotoRaDec).toHaveBeenLastCalledWith(101.27916666666667, 16.72472222222222);
    expect(mockSearchTarget).not.toHaveBeenCalled();
    expect(screen.queryByTestId('deep-space-reference-search-sheet')).not.toBeOnTheScreen();
  });

  it('keeps the star map available when the engine cannot find a target', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-search'));
    await user.type(screen.getByTestId('deep-space-map-search-input'), 'M42');
    await user.press(screen.getByTestId('deep-space-map-search-submit'));
    act(() => mockOnTargetNotFound?.());
    expect(screen.getByTestId('deep-space-map-shell')).toBeOnTheScreen();
    expect(screen.getByTestId('deep-space-map-search-error')).toHaveTextContent('未找到该天体，请改用标准名称或编号');
  });

  it('keeps the star map available when a ready engine reports a command error', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-search'));
    act(() => mockOnCommandError?.());
    expect(screen.getByTestId('deep-space-map-shell')).toBeOnTheScreen();
    expect(screen.getByTestId('deep-space-map-search-error')).toHaveTextContent('未找到该天体，请改用标准名称或编号');
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
    await user.press(screen.getByTestId('deep-space-search-recent-NAME Great Orion Nebula'));

    expect(mockSearchTarget).toHaveBeenLastCalledWith('Great Orion Nebula');
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
