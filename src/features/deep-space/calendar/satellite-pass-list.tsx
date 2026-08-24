import type { SatellitePass } from './satellite-pass-service';
import * as React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { Text } from '@/components/ui';
import { translate } from '@/lib/i18n';

type SatellitePassState
  = | { status: 'loading' }
    | { status: 'ready'; passes: SatellitePass[] }
    | { status: 'failed'; retry: () => void };

function clockTime(iso: string): string {
  const date = new Date(iso);
  return `${`${date.getHours()}`.padStart(2, '0')}:${`${date.getMinutes()}`.padStart(2, '0')}`;
}

function SatelliteIcon() {
  return (
    <Svg height={26} viewBox="0 0 32 32" width={26}>
      <Rect fill="#FFFFFF" height={8} rx={1.5} transform="rotate(45 16 16)" width={8} x={12} y={12} />
      <Path d="M4 8l7-4 5 5-7 4zm12 15 7-4 5 5-7 4z" fill="#FFFFFF" />
      <Path d="m10 10 4 4m4 4 4 4" stroke="#202326" strokeWidth={1.2} />
    </Svg>
  );
}

function LoadingRows() {
  return (
    <View accessibilityLabel={translate('deep_space.calendar_loading')}>
      {[0, 1, 2].map(index => (
        <View key={index} style={styles.loadingRow}>
          <View style={styles.loadingIcon} />
          <View style={styles.loadingName} />
          <View style={styles.loadingValue} />
          <View style={styles.loadingValue} />
          <View style={styles.loadingValue} />
        </View>
      ))}
    </View>
  );
}

export function SatellitePassList({ state }: { state: SatellitePassState }) {
  return (
    <View style={styles.section}>
      <Text style={styles.title}>{translate('deep_space.satellite_passes')}</Text>
      <View style={styles.headerRow}>
        <View style={styles.nameColumn} />
        <Text style={[styles.headerText, styles.timeColumn]}>{translate('deep_space.satellite_time')}</Text>
        <Text style={[styles.headerText, styles.magnitudeColumn]}>{translate('deep_space.satellite_magnitude')}</Text>
        <Text style={[styles.headerText, styles.altitudeColumn]}>{translate('deep_space.satellite_altitude')}</Text>
      </View>
      {state.status === 'loading' && <LoadingRows />}
      {state.status === 'failed' && (
        <View style={styles.messageBox}>
          <Text style={styles.message}>{translate('deep_space.satellite_error')}</Text>
          <Pressable accessibilityRole="button" onPress={state.retry} testID="deep-space-calendar-satellite-retry">
            <Text style={styles.retry}>{translate('deep_space.satellite_retry')}</Text>
          </Pressable>
        </View>
      )}
      {state.status === 'ready' && state.passes.length === 0 && (
        <Text style={styles.message}>{translate('deep_space.satellite_none')}</Text>
      )}
      {state.status === 'ready' && state.passes.map(pass => (
        <View key={`${pass.noradId}-${pass.peakTime}`} style={styles.row} testID={`deep-space-calendar-satellite-${pass.noradId}`}>
          <View style={styles.nameColumn}>
            <SatelliteIcon />
            <Text numberOfLines={1} style={styles.name}>{pass.name}</Text>
          </View>
          <Text style={[styles.value, styles.timeColumn]}>{clockTime(pass.peakTime)}</Text>
          <Text style={[styles.value, styles.magnitudeColumn]}>{pass.magnitude.toFixed(1)}</Text>
          <Text style={[styles.value, styles.altitudeColumn]}>{`${Math.round(pass.maxElevationDeg)}°`}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  altitudeColumn: {
    textAlign: 'left',
    width: 48,
  },
  headerRow: {
    alignItems: 'center',
    borderBottomColor: 'rgba(255,255,255,0.18)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    marginHorizontal: 17,
    minHeight: 32,
  },
  headerText: {
    color: 'rgba(255,255,255,0.52)',
    fontSize: 15,
  },
  loadingIcon: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    height: 24,
    width: 24,
  },
  loadingName: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4,
    flex: 1,
    height: 15,
    marginLeft: 12,
  },
  loadingRow: {
    alignItems: 'center',
    borderBottomColor: 'rgba(255,255,255,0.16)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    height: 40,
    marginHorizontal: 17,
  },
  loadingValue: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 4,
    height: 14,
    marginLeft: 14,
    width: 46,
  },
  magnitudeColumn: {
    textAlign: 'left',
    width: 54,
  },
  message: {
    color: 'rgba(255,255,255,0.58)',
    fontSize: 14,
    paddingHorizontal: 17,
    paddingVertical: 20,
  },
  messageBox: {
    alignItems: 'flex-start',
  },
  name: {
    color: '#F8F8F8',
    flex: 1,
    fontSize: 16,
    marginLeft: 10,
  },
  nameColumn: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    minWidth: 0,
  },
  retry: {
    color: '#5DA4FF',
    fontSize: 14,
    paddingBottom: 18,
    paddingHorizontal: 17,
  },
  row: {
    alignItems: 'center',
    borderBottomColor: 'rgba(255,255,255,0.18)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    height: 40,
    marginHorizontal: 17,
  },
  section: {
    paddingBottom: 34,
  },
  timeColumn: {
    textAlign: 'left',
    width: 69,
  },
  title: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 26,
    paddingHorizontal: 17,
    paddingTop: 34,
  },
  value: {
    color: '#F8F8F8',
    fontSize: 16,
    fontVariant: ['tabular-nums'],
  },
});
