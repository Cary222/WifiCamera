import type { SkyEvent, TonightReport } from '@/features/stellarium/stellarium-service';
import * as React from 'react';

import { screen, setup } from '@/lib/test-utils';

import { CalendarPanel } from './calendar-panel';
import { loadVisualOmm, predictVisiblePasses } from './satellite-pass-service';

jest.mock('@/lib/i18n', () => ({
  translate: (key: string) => ({
    'deep_space.back': '返回',
    'deep_space.calendar_error': '计算失败',
    'deep_space.calendar_events': '活动',
    'deep_space.calendar_loading': '正在计算…',
    'deep_space.calendar_retry': '重试',
    'deep_space.calendar_tonight': '今晚',
    'deep_space.full_moon': '满月',
    'deep_space.meteor_shower': '流星雨极大',
    'deep_space.moon': '月',
    'deep_space.no_events': '该时段没有天象事件',
    'deep_space.no_planets': '今晚没有行星在地平线以上',
    'deep_space.satellite_altitude': '高程',
    'deep_space.satellite_error': '无法获取卫星轨道数据',
    'deep_space.satellite_magnitude': '星等',
    'deep_space.satellite_none': '今晚没有可见卫星经过',
    'deep_space.satellite_passes': '有卫星经过',
    'deep_space.satellite_retry': '重试',
    'deep_space.satellite_time': '时间',
    'deep_space.solar_system': '太阳系',
    'deep_space.sunrise': '日出',
    'deep_space.sunset': '日落',
  }[key] ?? key),
}));

jest.mock('./satellite-pass-service', () => ({
  ...jest.requireActual('./satellite-pass-service'),
  loadVisualOmm: jest.fn(),
  predictVisiblePasses: jest.fn(),
}));

const mockLoadVisualOmm = jest.mocked(loadVisualOmm);
const mockPredictVisiblePasses = jest.mocked(predictVisiblePasses);

const tonight: TonightReport = {
  dawnStart: '2026-08-22T03:40:00.000Z',
  duskEnd: '2026-08-21T12:10:00.000Z',
  moon: { illumination: 0.5, phase: 'first_quarter', rise: '2026-08-21T16:25:00.000Z', set: '2026-08-22T02:05:00.000Z' },
  planets: [
    { from: '2026-08-21T13:17:00.000Z', key: 'saturn', magnitude: 0.6, peakAltitudeDeg: 48, to: '2026-08-22T05:10:00.000Z' },
  ],
  sunrise: '2026-08-22T22:05:00.000Z',
  sunset: '2026-08-21T10:54:00.000Z',
};

const events: SkyEvent[] = [{ time: '2026-08-28T05:30:00.000Z', type: 'full_moon' }];

function renderCalendar() {
  const stellaRef = {
    current: {
      computeEvents: jest.fn(async () => events),
      computeTonight: jest.fn(async () => tonight),
    },
  } as never;
  return setup(
    <CalendarPanel
      city={{ latitudeDeg: 39.9, longitudeDeg: 116.41, name: '北京' }}
      clock={new Date('2026-08-21T12:00:00.000Z')}
      onClose={jest.fn()}
      stellaRef={stellaRef}
    />,
  );
}

beforeEach(() => {
  mockLoadVisualOmm.mockResolvedValue([]);
  mockPredictVisiblePasses.mockResolvedValue([
    { magnitude: 2.1, maxElevationDeg: 64, name: 'Shijian 7 LM r', noradId: 28738, peakTime: '2026-08-21T11:26:00.000Z' },
  ]);
});

describe('stellarium-faithful calendar panel', () => {
  it('matches the reference hierarchy and removes the custom time controls', async () => {
    renderCalendar();

    expect(await screen.findByText('8月 21-22, 北京')).toBeOnTheScreen();
    expect(screen.getByText('太阳系')).toBeOnTheScreen();
    expect(screen.getByTestId('deep-space-calendar-chart-grid')).toBeOnTheScreen();
    expect(screen.getByTestId('deep-space-calendar-chart-saturn-ring')).toBeOnTheScreen();
    expect(screen.getByText('21:17')).toBeOnTheScreen();
    expect(screen.queryByTestId('deep-space-calendar-forward-day')).not.toBeOnTheScreen();
    expect(screen.queryByText('北京', { exact: true })).not.toBeOnTheScreen();
  });

  it('renders the satellite pass table with fixed numeric columns', async () => {
    renderCalendar();

    expect(await screen.findByText('有卫星经过')).toBeOnTheScreen();
    expect(screen.getByText('时间')).toBeOnTheScreen();
    expect(screen.getByText('星等')).toBeOnTheScreen();
    expect(screen.getByText('高程')).toBeOnTheScreen();
    expect(screen.getByText('Shijian 7 LM r')).toBeOnTheScreen();
    expect(screen.getByText('19:26')).toBeOnTheScreen();
    expect(screen.getByText('2.1')).toBeOnTheScreen();
    expect(screen.getByText('64°')).toBeOnTheScreen();
  });

  it('uses the typography measured from the Stellarium calendar reference', async () => {
    renderCalendar();

    expect(await screen.findByText('8月 21-22, 北京')).toHaveStyle({ fontSize: 27 });
    expect(screen.getByText('太阳系')).toHaveStyle({ fontSize: 26 });
    expect(screen.getByText('有卫星经过')).toHaveStyle({ fontSize: 26 });
    expect(screen.getByText('时间')).toHaveStyle({ fontSize: 15, width: 69 });
    expect(screen.getByText('星等')).toHaveStyle({ fontSize: 15, width: 54 });
    expect(screen.getByText('高程')).toHaveStyle({ fontSize: 15, width: 48 });
    expect(screen.getByText('19:26')).toHaveStyle({ fontSize: 16, width: 69 });
  });
});
