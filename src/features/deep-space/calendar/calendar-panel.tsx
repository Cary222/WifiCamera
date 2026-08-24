import type { SatellitePass, SatellitePhotometry } from './satellite-pass-service';
import type { SkyEvent, TonightReport } from '@/features/stellarium/stellarium-service';
import type { StellariumViewHandle } from '@/features/stellarium/stellarium-view';
import * as React from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { Text } from '@/components/ui';
import { translate } from '@/lib/i18n';
import { storage } from '@/lib/storage';

import { SatellitePassList } from './satellite-pass-list';
import { loadVisualOmm, predictVisiblePasses } from './satellite-pass-service';
import photometryJson from './satellite-photometry.json';
import { SolarSystemChart } from './solar-system-chart';

export type ObserverCity = { latitudeDeg: number; longitudeDeg: number; name: string };

type CalendarResult
  = | { status: 'loading' }
    | { status: 'failed' }
    | { status: 'ready'; tonight: TonightReport; events: SkyEvent[] };

type SatelliteResult
  = | { status: 'loading' }
    | { status: 'failed' }
    | { status: 'ready'; passes: SatellitePass[] };

const MONTHS_ZH = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
const PLANET_KEYS = {
  jupiter: 'deep_space.jupiter',
  mars: 'deep_space.mars',
  mercury: 'deep_space.mercury',
  neptune: 'deep_space.neptune',
  saturn: 'deep_space.saturn',
  uranus: 'deep_space.uranus',
  venus: 'deep_space.venus',
} as const;
const EVENT_KEYS = {
  conjunction: 'deep_space.conjunction',
  first_quarter: 'deep_space.first_quarter',
  full_moon: 'deep_space.full_moon',
  last_quarter: 'deep_space.last_quarter',
  meteor_shower: 'deep_space.meteor_shower',
  new_moon: 'deep_space.new_moon',
  opposition: 'deep_space.opposition',
} as const;
const PHOTOMETRY = photometryJson as SatellitePhotometry;

function formatClockTime(iso: string | null): string {
  if (!iso)
    return '--:--';
  const date = new Date(iso);
  return `${`${date.getHours()}`.padStart(2, '0')}:${`${date.getMinutes()}`.padStart(2, '0')}`;
}

function useCalendarData(
  stellaRef: React.RefObject<StellariumViewHandle | null>,
  clock: Date,
  city: ObserverCity,
) {
  const [attempt, setAttempt] = React.useState(0);
  const day = clock.toDateString();
  const requestKey = `${day}|${city.latitudeDeg}|${city.longitudeDeg}|${attempt}`;
  const [state, setState] = React.useState<{ requestKey: string; result: CalendarResult }>({
    requestKey,
    result: { status: 'loading' },
  });

  React.useEffect(() => {
    let cancelled = false;
    const bridge = stellaRef.current;
    if (!bridge)
      return;
    const observer = { latitudeDeg: city.latitudeDeg, longitudeDeg: city.longitudeDeg };
    Promise.all([
      bridge.computeTonight(new Date(day), observer),
      bridge.computeEvents(new Date(day), 60, observer),
    ])
      .then(([tonight, events]) => {
        if (!cancelled)
          setState({ requestKey, result: { events, status: 'ready', tonight } });
      })
      .catch(() => {
        if (!cancelled)
          setState({ requestKey, result: { status: 'failed' } });
      });
    return () => {
      cancelled = true;
    };
  }, [city.latitudeDeg, city.longitudeDeg, day, requestKey, stellaRef]);

  const result = state.requestKey === requestKey ? state.result : { status: 'loading' as const };
  return { result, retry: () => setAttempt(value => value + 1) };
}

function useSatellitePasses(tonight: TonightReport | null, city: ObserverCity) {
  const [attempt, setAttempt] = React.useState(0);
  const sunset = tonight?.sunset;
  const sunrise = tonight?.sunrise;
  const requestKey = `${sunset ?? 'none'}|${sunrise ?? 'none'}|${city.latitudeDeg}|${city.longitudeDeg}|${attempt}`;
  const [state, setState] = React.useState<{ requestKey: string; result: SatelliteResult }>({
    requestKey,
    result: { status: 'loading' },
  });

  React.useEffect(() => {
    let cancelled = false;
    const task = !sunset || !sunrise
      ? Promise.resolve([])
      : loadVisualOmm({ storage }).then(records => predictVisiblePasses({
          end: new Date(sunrise),
          observer: { latitudeDeg: city.latitudeDeg, longitudeDeg: city.longitudeDeg },
          photometry: PHOTOMETRY,
          records,
          start: new Date(sunset),
        }));
    task
      .then((passes) => {
        if (!cancelled)
          setState({ requestKey, result: { passes, status: 'ready' } });
      })
      .catch(() => {
        if (!cancelled)
          setState({ requestKey, result: { status: 'failed' } });
      });
    return () => {
      cancelled = true;
    };
  }, [city.latitudeDeg, city.longitudeDeg, requestKey, sunrise, sunset]);

  const result = state.requestKey === requestKey ? state.result : { status: 'loading' as const };
  return { result, retry: () => setAttempt(value => value + 1) };
}

export function CalendarPanel({
  city,
  clock,
  onClose,
  stellaRef,
}: {
  city: ObserverCity;
  clock: Date;
  onClose: () => void;
  stellaRef: React.RefObject<StellariumViewHandle | null>;
}) {
  const [tab, setTab] = React.useState<'events' | 'tonight'>('tonight');
  const calendar = useCalendarData(stellaRef, clock, city);
  const tonight = calendar.result.status === 'ready' ? calendar.result.tonight : null;
  const satellites = useSatellitePasses(tonight, city);
  const nextDay = new Date(clock.getTime() + 86_400_000);
  const heading = `${clock.getMonth() + 1}月 ${clock.getDate()}-${nextDay.getDate()}, ${city.name}`;

  return (
    <Modal animationType="none" onRequestClose={onClose} transparent visible>
      <View style={styles.screen} testID="deep-space-calendar-panel">
        <View style={styles.header}>
          <Pressable
            accessibilityLabel={translate('deep_space.back')}
            accessibilityRole="button"
            onPress={onClose}
            style={styles.headerButton}
            testID="deep-space-calendar-close"
          >
            <BackIcon />
          </Pressable>
          <Text style={styles.headerTitle}>日历</Text>
          <View style={styles.headerButton} />
        </View>
        <View style={styles.tabs}>
          <CalendarTab active={tab === 'tonight'} label={translate('deep_space.calendar_tonight')} onPress={() => setTab('tonight')} testID="deep-space-calendar-tab-tonight" />
          <CalendarTab active={tab === 'events'} label={translate('deep_space.calendar_events')} onPress={() => setTab('events')} testID="deep-space-calendar-tab-events" />
        </View>

        {calendar.result.status === 'loading' && (
          <View style={styles.status} testID="deep-space-calendar-loading">
            <ActivityIndicator color="#5DA4FF" />
            <Text style={styles.statusText}>{translate('deep_space.calendar_loading')}</Text>
          </View>
        )}
        {calendar.result.status === 'failed' && (
          <View style={styles.status} testID="deep-space-calendar-error">
            <Text style={styles.statusText}>{translate('deep_space.calendar_error')}</Text>
            <Pressable accessibilityRole="button" onPress={calendar.retry} testID="deep-space-calendar-retry">
              <Text style={styles.retry}>{translate('deep_space.calendar_retry')}</Text>
            </Pressable>
          </View>
        )}
        {calendar.result.status === 'ready' && (
          <ScrollView bounces={false} contentContainerStyle={styles.scrollContent}>
            {tab === 'tonight'
              ? (
                  <TonightTab
                    heading={heading}
                    report={calendar.result.tonight}
                    satelliteResult={satellites.result}
                    satelliteRetry={satellites.retry}
                  />
                )
              : <EventsTab events={calendar.result.events} />}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function CalendarTab({ active, label, onPress, testID }: { active: boolean; label: string; onPress: () => void; testID: string }) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.tab, active && styles.tabActive]}
      testID={testID}
    >
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function TonightTab({
  heading,
  report,
  satelliteResult,
  satelliteRetry,
}: {
  heading: string;
  report: TonightReport;
  satelliteResult: SatelliteResult;
  satelliteRetry: () => void;
}) {
  const state = satelliteResult.status === 'failed'
    ? { retry: satelliteRetry, status: 'failed' as const }
    : satelliteResult;
  return (
    <View testID="deep-space-calendar-tonight">
      <Text style={styles.dateHeading}>{heading}</Text>
      <View style={styles.sunRow}>
        <SunStat label={translate('deep_space.sunset')} value={formatClockTime(report.sunset)} />
        <SunStat label={translate('deep_space.sunrise')} value={formatClockTime(report.sunrise)} />
      </View>
      <Text style={styles.sectionTitle}>{translate('deep_space.solar_system')}</Text>
      <SolarSystemChart report={report} />
      <SatellitePassList state={state} />
    </View>
  );
}

function SunStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.sunStat}>
      <Text style={styles.sunLabel}>{label}</Text>
      <Text style={styles.sunValue}>{value}</Text>
    </View>
  );
}

function eventLabel(event: SkyEvent): string {
  if (event.type === 'meteor_shower')
    return `${event.name ?? ''} ${translate('deep_space.meteor_shower')}`.trim();
  const eventKey = EVENT_KEYS[event.type as keyof typeof EVENT_KEYS];
  const type = eventKey ? translate(eventKey) : event.type;
  if (!event.target)
    return type;
  const planetKey = PLANET_KEYS[event.target as keyof typeof PLANET_KEYS];
  const target = planetKey ? translate(planetKey) : event.target;
  return `${target}${type}`;
}

function eventTime(event: SkyEvent): string {
  const date = new Date(event.time);
  const day = `${MONTHS_ZH[date.getMonth()]} ${date.getDate()}`;
  if (event.type === 'meteor_shower')
    return day;
  const offset = -date.getTimezoneOffset();
  const sign = offset < 0 ? '-' : '+';
  const absolute = Math.abs(offset);
  const zone = `GMT${sign}${`${Math.floor(absolute / 60)}`.padStart(2, '0')}:${`${absolute % 60}`.padStart(2, '0')}`;
  return `${day}, ${formatClockTime(event.time)} ${zone}`;
}

function EventsTab({ events }: { events: SkyEvent[] }) {
  const groups = new Map<string, SkyEvent[]>();
  for (const event of events) {
    const date = new Date(event.time);
    const key = `${MONTHS_ZH[date.getMonth()]} ${date.getFullYear()}`;
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }
  if (events.length === 0)
    return <Text style={styles.empty}>{translate('deep_space.no_events')}</Text>;
  return (
    <View testID="deep-space-calendar-events">
      {[...groups.entries()].map(([month, monthEvents]) => (
        <View key={month}>
          <Text style={styles.eventMonth}>{month}</Text>
          {monthEvents.map(event => (
            <View key={`${event.type}-${event.time}`} style={styles.eventRow}>
              <EventIcon type={event.type} />
              <View style={styles.eventText}>
                <Text style={styles.eventName}>{eventLabel(event)}</Text>
                <Text style={styles.eventTime}>{eventTime(event)}</Text>
              </View>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function BackIcon() {
  return (
    <Svg height={34} viewBox="0 0 34 34" width={34}>
      <Path d="M21 7 11 17l10 10" fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} />
    </Svg>
  );
}

function EventIcon({ type }: { type: string }) {
  if (type === 'full_moon') {
    return (
      <Svg height={30} viewBox="0 0 30 30" width={30}>
        <Circle cx={15} cy={15} fill="#F3F3F3" r={9} />
      </Svg>
    );
  }
  return (
    <Svg height={30} viewBox="0 0 30 30" width={30}>
      <Circle cx={11} cy={15} fill="#F3F3F3" r={5} />
      <Circle cx={21} cy={15} fill="#F3F3F3" r={2.5} />
      <Line stroke="#F3F3F3" strokeWidth={1.5} x1={6} x2={24} y1={22} y2={8} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  dateHeading: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 27,
    paddingHorizontal: 17,
    paddingTop: 30,
  },
  empty: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    padding: 17,
  },
  eventMonth: {
    color: 'rgba(255,255,255,0.48)',
    fontSize: 26,
    paddingHorizontal: 17,
    paddingTop: 30,
  },
  eventName: {
    color: '#F8F8F8',
    fontSize: 16,
  },
  eventRow: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 17,
    paddingVertical: 13,
  },
  eventText: {
    flex: 1,
    marginLeft: 14,
  },
  eventTime: {
    color: 'rgba(255,255,255,0.52)',
    fontSize: 12,
    marginTop: 3,
  },
  header: {
    alignItems: 'center',
    backgroundColor: '#2D3134',
    flexDirection: 'row',
    height: 48,
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  headerButton: {
    alignItems: 'center',
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '500',
  },
  retry: {
    color: '#5DA4FF',
    fontSize: 14,
    marginTop: 12,
  },
  screen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#202326',
  },
  scrollContent: {
    paddingBottom: 24,
  },
  sectionTitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 26,
    paddingHorizontal: 17,
    paddingTop: 30,
  },
  status: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  statusText: {
    color: 'rgba(255,255,255,0.58)',
    fontSize: 14,
    marginTop: 10,
  },
  sunLabel: {
    color: 'rgba(255,255,255,0.52)',
    fontSize: 11,
  },
  sunRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 42,
    paddingTop: 26,
  },
  sunStat: {
    alignItems: 'flex-end',
    marginLeft: 59,
  },
  sunValue: {
    color: '#FFFFFF',
    fontSize: 31,
    fontVariant: ['tabular-nums'],
    fontWeight: '300',
  },
  tab: {
    alignItems: 'center',
    borderBottomColor: 'transparent',
    borderBottomWidth: 2,
    flex: 1,
    justifyContent: 'center',
  },
  tabActive: {
    borderBottomColor: '#5DA4FF',
  },
  tabLabel: {
    color: 'rgba(255,255,255,0.66)',
    fontSize: 15,
  },
  tabLabelActive: {
    color: '#5DA4FF',
  },
  tabs: {
    backgroundColor: '#2D3134',
    borderBottomColor: 'rgba(0,0,0,0.35)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    height: 48,
  },
});
