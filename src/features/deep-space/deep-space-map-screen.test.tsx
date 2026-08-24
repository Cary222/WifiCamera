import type { TonightReport } from '@/features/stellarium/stellarium-service';
import * as React from 'react';

import { act, cleanup, screen, setup } from '@/lib/test-utils';

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
const mockReload = jest.fn();
const mockSearchTarget = jest.fn();
const mockSetGridLines = jest.fn();
const mockSetLocation = jest.fn();
const mockSetSkyCulture = jest.fn();
const mockSetSkyLayers = jest.fn();
const mockSetTime = jest.fn();
const mockSetFovFrame = jest.fn();
const mockGotoRaDec = jest.fn();
const mockToggleConstellations = jest.fn();
const mockZoomTo = jest.fn();
let mockOnCommandError: (() => void) | undefined;
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

jest.mock('@/components/ui', () => {
  const { Text } = require('react-native');
  return {
    FocusAwareStatusBar: () => null,
    Text,
  };
});

jest.mock('@/lib/i18n', () => ({
  getLanguage: () => 'zh',
  translate: (key: string) => ({
    'deep_space.calendar_error': '计算失败',
    'deep_space.calendar_events': '活动',
    'deep_space.calendar_loading': '正在计算…',
    'deep_space.calendar_retry': '重试',
    'deep_space.calendar_tonight': '今晚',
    'deep_space.dawn_start': '天文晨光始',
    'deep_space.dusk_end': '天文昏影终',
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
  }[key] ?? key),
}));

jest.mock('@/features/deep-space/calendar/satellite-pass-service', () => ({
  loadVisualOmm: jest.fn(async () => []),
  predictVisiblePasses: jest.fn(async () => []),
}));

jest.mock('@/features/stellarium/stellarium-view', () => {
  const mockReact = require('react');
  const { View: MockView } = require('react-native');

  return {
    StellariumView: ({ onBearingChange, onCommandError, onReady, onTargetFound, onTargetNotFound, ref }: { onBearingChange?: (azimuthDeg: number) => void; onCommandError?: () => void; onReady?: () => void; onTargetFound?: () => void; onTargetNotFound?: () => void; ref?: unknown }) => {
      mockOnBearingChange = onBearingChange;
      mockOnCommandError = onCommandError;
      mockOnTargetFound = onTargetFound;
      mockOnTargetNotFound = onTargetNotFound;
      const readyRef = mockReact.useRef(false);
      mockReact.useImperativeHandle(ref, () => ({
        computeEvents: mockComputeEvents,
        computeTonight: mockComputeTonight,
        gotoRaDec: mockGotoRaDec,
        reload: mockReload,
        searchTarget: mockSearchTarget,
        setFovFrame: mockSetFovFrame,
        setGridLines: mockSetGridLines,
        setLocation: mockSetLocation,
        setSkyCulture: mockSetSkyCulture,
        setSkyLayers: mockSetSkyLayers,
        setTime: mockSetTime,
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
  mockReload.mockClear();
  mockSearchTarget.mockClear();
  mockSetGridLines.mockClear();
  mockSetLocation.mockClear();
  mockSetSkyCulture.mockClear();
  mockSetSkyLayers.mockClear();
  mockSetTime.mockClear();
  mockSetFovFrame.mockClear();
  mockGotoRaDec.mockClear();
  mockToggleConstellations.mockClear();
  mockZoomTo.mockClear();
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
    expect(screen.getByTestId('deep-space-reference-layers')).toBeOnTheScreen();
    expect(screen.getByTestId('deep-space-reference-compass')).toBeOnTheScreen();
    expect(screen.getByTestId('deep-space-reference-time')).toBeOnTheScreen();
    expect(screen.queryByTestId('deep-space-map-title-pill')).not.toBeOnTheScreen();
  });

  it('rotates the compass and names the bearing reported by the engine', () => {
    setup(<DeepSpaceMapScreen />);

    act(() => mockOnBearingChange?.(90));
    expect(screen.getByTestId('deep-space-reference-compass-rose')).toHaveStyle({ transform: [{ rotate: '-90deg' }] });
    expect(screen.getByTestId('deep-space-horizon-bearing')).toHaveTextContent('东');
  });

  it('keeps the compass pointing north until the engine reports a bearing', () => {
    setup(<DeepSpaceMapScreen />);
    expect(screen.getByTestId('deep-space-reference-compass-rose')).toHaveStyle({ transform: [{ rotate: '-0deg' }] });
    expect(screen.getByTestId('deep-space-horizon-bearing')).toHaveTextContent('北');
  });

  it('opens a layer panel and toggles the native landscape layer', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-layers'));
    expect(screen.getByTestId('deep-space-reference-layers-panel')).toBeOnTheScreen();
    await user.press(screen.getByTestId('deep-space-layer-landscape'));
    expect(mockSetSkyLayers).toHaveBeenLastCalledWith({ landscape: false });
  });

  it('opens the reference-style drawer from the menu control', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-menu'));
    expect(screen.getByTestId('deep-space-reference-drawer')).toBeOnTheScreen();
  });

  it('lists only the four working drawer entries', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-reference-menu'));
    expect(screen.getByText('星空述语')).toBeOnTheScreen();
    expect(screen.getByText('日历')).toBeOnTheScreen();
    expect(screen.getByText('观测工具')).toBeOnTheScreen();
    expect(screen.getByText('设置')).toBeOnTheScreen();
    expect(screen.queryByText('帮助与反馈')).not.toBeOnTheScreen();
    expect(screen.queryByText('退出')).not.toBeOnTheScreen();
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

  it('opens secondary detail settings sheet on long pressing quick controls', async () => {
    const { user } = setup(<DeepSpaceMapScreen />);
    await user.press(screen.getByTestId('deep-space-grid-quick-toggle'));

    // 长按网格和线条按钮
    await user.longPress(screen.getByTestId('deep-space-grid-quick-grid-lines'));
    expect(screen.getByTestId('deep-space-quick-detail-sheet')).toBeOnTheScreen();
    expect(screen.getByText('网格和线条设置')).toBeOnTheScreen();
    expect(screen.getByText('地平坐标网格 (Azimuthal)')).toBeOnTheScreen();
    expect(screen.getByText('赤道坐标网格 (JNow)')).toBeOnTheScreen();
    expect(screen.getByText('子午线 (Meridian)')).toBeOnTheScreen();

    // 细粒度切换子午线
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
