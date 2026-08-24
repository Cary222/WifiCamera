import type { TonightReport } from '@/features/stellarium/stellarium-service';
import * as React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';

import { Text } from '@/components/ui';
import { translate } from '@/lib/i18n';

const LABEL_WIDTH = 131;
const EDGE_MS = 3_600_000;
const BODY_COLORS: Record<string, string> = {
  jupiter: '#D8B1B3',
  mars: '#E79478',
  mercury: '#B3B5B7',
  moon: '#F7F7F5',
  neptune: '#4D70C5',
  saturn: '#EAD6A4',
  uranus: '#5CB4C2',
  venus: '#F5E6C6',
};
const PLANET_KEYS = {
  jupiter: 'deep_space.jupiter',
  mars: 'deep_space.mars',
  mercury: 'deep_space.mercury',
  neptune: 'deep_space.neptune',
  saturn: 'deep_space.saturn',
  uranus: 'deep_space.uranus',
  venus: 'deep_space.venus',
} as const;

type ChartWindow = {
  dawnStart: number;
  duskEnd: number;
  end: number;
  start: number;
  sunrise: number;
  sunset: number;
};

type ChartRow = { color: string; from: number; key: string; label: string; to: number };

function formatClockTime(value: number): string {
  const date = new Date(value);
  return `${`${date.getHours()}`.padStart(2, '0')}:${`${date.getMinutes()}`.padStart(2, '0')}`;
}

function resolveWindow(report: TonightReport): ChartWindow | null {
  const sunset = Date.parse(report.sunset ?? '');
  const sunrise = Date.parse(report.sunrise ?? '');
  if (!Number.isFinite(sunset) || !Number.isFinite(sunrise) || sunrise <= sunset)
    return null;
  const duskEnd = Date.parse(report.duskEnd ?? '');
  const dawnStart = Date.parse(report.dawnStart ?? '');
  return {
    dawnStart: Number.isFinite(dawnStart) ? dawnStart : sunrise,
    duskEnd: Number.isFinite(duskEnd) ? duskEnd : sunset,
    end: sunrise + EDGE_MS,
    start: sunset - EDGE_MS,
    sunrise,
    sunset,
  };
}

function chartRows(report: TonightReport): ChartRow[] {
  const rows: ChartRow[] = [];
  if (report.moon.rise || report.moon.set) {
    rows.push({
      color: BODY_COLORS.moon,
      from: Date.parse(report.moon.rise ?? ''),
      key: 'moon',
      label: translate('deep_space.moon'),
      to: Date.parse(report.moon.set ?? ''),
    });
  }
  for (const planet of report.planets) {
    rows.push({
      color: BODY_COLORS[planet.key] ?? '#FFFFFF',
      from: Date.parse(planet.from),
      key: planet.key,
      label: PLANET_KEYS[planet.key as keyof typeof PLANET_KEYS]
        ? translate(PLANET_KEYS[planet.key as keyof typeof PLANET_KEYS])
        : planet.key,
      to: Date.parse(planet.to),
    });
  }
  return rows;
}

function BodyGlyph({ bodyKey, color, illumination }: { bodyKey: string; color: string; illumination: number }) {
  if (bodyKey === 'saturn') {
    return (
      <Svg height={28} testID="deep-space-calendar-chart-saturn-ring" viewBox="0 0 34 32" width={30}>
        <Ellipse cx={17} cy={17} fill="none" rx={15} ry={5} stroke={color} strokeWidth={2.2} transform="rotate(-28 17 17)" />
        <Circle cx={17} cy={16} fill={color} r={9} />
        <Path d="M4 21c7 3 19-2 26-9" fill="none" stroke="#202326" strokeWidth={2.2} />
      </Svg>
    );
  }
  if (bodyKey === 'moon' || bodyKey === 'venus') {
    const lit = bodyKey === 'venus' ? 0.52 : Math.max(0.05, Math.min(0.95, illumination));
    const radiusX = Math.max(1, Math.abs(lit - 0.5) * 18);
    return (
      <Svg height={26} viewBox="0 0 30 30" width={26}>
        <Circle cx={15} cy={15} fill="rgba(255,255,255,0.26)" r={11} />
        <Path
          d={`M15 4a11 11 0 0 1 0 22a${radiusX} 11 0 0 ${lit < 0.5 ? 1 : 0} 0 -22z`}
          fill={color}
        />
      </Svg>
    );
  }
  return (
    <Svg height={26} viewBox="0 0 30 30" width={26}>
      <Circle cx={15} cy={15} fill={color} r={11} />
    </Svg>
  );
}

function Grid({ percent, window }: { percent: (time: number) => number; window: ChartWindow }) {
  const lines: { key: string; left: number; major: boolean }[] = [];
  const first = new Date(window.start);
  first.setMinutes(0, 0, 0);
  for (let time = first.getTime(); time <= window.end; time += 30 * 60_000) {
    if (time < window.start)
      continue;
    lines.push({ key: `${time}`, left: percent(time), major: new Date(time).getMinutes() === 0 });
  }
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="deep-space-calendar-chart-grid">
      {lines.map(line => (
        <View
          key={line.key}
          style={[
            styles.gridLine,
            line.major ? styles.gridLineMajor : styles.gridLineMinor,
            { left: `${line.left}%` },
          ]}
        />
      ))}
    </View>
  );
}

function Bands({ percent, window }: { percent: (time: number) => number; window: ChartWindow }) {
  const bands = [
    [window.start, window.sunset, '#57ABED'],
    [window.sunset, window.duskEnd, '#365B77'],
    [window.duskEnd, window.dawnStart, '#090D10'],
    [window.dawnStart, window.sunrise, '#365B77'],
    [window.sunrise, window.end, '#57ABED'],
  ] as const;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {bands.map(([from, to, color]) => {
        const left = percent(from);
        return (
          <View
            key={`${from}-${to}`}
            style={[styles.band, { backgroundColor: color, left: `${left}%`, width: `${percent(to) - left}%` }]}
          />
        );
      })}
    </View>
  );
}

function VisibilityBar({ percent, row, window }: { percent: (time: number) => number; row: ChartRow; window: ChartWindow }) {
  const from = Number.isFinite(row.from) ? row.from : window.start;
  const to = Number.isFinite(row.to) ? row.to : window.end;
  const segments = to > from ? [[from, to]] : [[window.start, to], [from, window.end]];
  return (
    <>
      {segments.map(([segmentFrom, segmentTo]) => {
        const left = percent(segmentFrom);
        const width = percent(segmentTo) - left;
        if (width <= 0)
          return null;
        return (
          <View key={`${row.key}-${segmentFrom}`} style={[styles.barWrap, { left: `${left}%`, width: `${width}%` }]}>
            <View style={[styles.bar, { backgroundColor: row.color }]} />
            <Text
              numberOfLines={1}
              style={[styles.barTime, left > 80 ? styles.barTimeEnd : styles.barTimeStart]}
            >
              {formatClockTime(segmentFrom)}
            </Text>
          </View>
        );
      })}
    </>
  );
}

export function SolarSystemChart({ report }: { report: TonightReport }) {
  const window = resolveWindow(report);
  if (!window)
    return <Text style={styles.empty}>{translate('deep_space.no_planets')}</Text>;
  const span = window.end - window.start;
  const percent = (time: number) => Math.min(100, Math.max(0, (time - window.start) / span * 100));
  const rows = chartRows(report);
  const axisLabels: { label: string; left: number }[] = [];
  const first = new Date(window.start);
  first.setMinutes(0, 0, 0);
  for (let time = first.getTime(); time <= window.end; time += 3_600_000) {
    if (time >= window.start && new Date(time).getHours() % 2 === 0)
      axisLabels.push({ label: `${new Date(time).getHours()}`, left: percent(time) });
  }

  return (
    <View style={styles.root} testID="deep-space-calendar-chart">
      <View style={styles.axisRow}>
        <View style={styles.labelSpacer} />
        <View style={styles.axisTrack}>
          {axisLabels.map(item => (
            <Text key={`${item.left}`} style={[styles.axisLabel, { left: `${item.left}%` }]}>{item.label}</Text>
          ))}
        </View>
      </View>
      <View style={styles.rows}>
        <View pointerEvents="none" style={styles.backgroundRow}>
          <View style={styles.labelSpacer} />
          <View style={styles.trackBackground}>
            <Bands percent={percent} window={window} />
            <Grid percent={percent} window={window} />
          </View>
        </View>
        {rows.map(row => (
          <View key={row.key} style={styles.row} testID={`deep-space-calendar-chart-${row.key}`}>
            <View style={styles.rowLabel}>
              <BodyGlyph bodyKey={row.key} color={row.color} illumination={report.moon.illumination} />
              <Text numberOfLines={1} style={styles.rowName}>{row.label}</Text>
            </View>
            <View style={styles.track}>
              <VisibilityBar percent={percent} row={row} window={window} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  axisLabel: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 10,
    position: 'absolute',
    transform: [{ translateX: -5 }],
  },
  axisRow: {
    flexDirection: 'row',
    height: 24,
  },
  axisTrack: {
    flex: 1,
  },
  backgroundRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
  },
  band: {
    bottom: 0,
    position: 'absolute',
    top: 0,
  },
  bar: {
    borderRadius: 4,
    height: 8,
  },
  barTime: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 10,
    fontVariant: ['tabular-nums'],
    position: 'absolute',
    top: 11,
    width: 46,
  },
  barTimeEnd: {
    right: 0,
    textAlign: 'right',
  },
  barTimeStart: {
    left: 0,
  },
  barWrap: {
    justifyContent: 'center',
    position: 'absolute',
  },
  empty: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    paddingHorizontal: 17,
    paddingVertical: 20,
  },
  gridLine: {
    borderLeftWidth: 1,
    bottom: 0,
    position: 'absolute',
    top: 0,
  },
  gridLineMajor: {
    borderLeftColor: 'rgba(255,255,255,0.17)',
    borderStyle: 'dashed',
  },
  gridLineMinor: {
    borderLeftColor: 'rgba(255,255,255,0.07)',
    borderStyle: 'dashed',
  },
  labelSpacer: {
    width: LABEL_WIDTH,
  },
  root: {
    marginHorizontal: 17,
    marginTop: 8,
  },
  row: {
    alignItems: 'center',
    borderTopColor: 'rgba(255,255,255,0.14)',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    height: 40,
  },
  rowLabel: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    width: LABEL_WIDTH,
  },
  rowName: {
    color: '#F8F8F8',
    flexShrink: 1,
    fontSize: 17,
  },
  rows: {
    position: 'relative',
  },
  track: {
    flex: 1,
    justifyContent: 'center',
  },
  trackBackground: {
    borderRadius: 10,
    flex: 1,
    overflow: 'hidden',
  },
});
