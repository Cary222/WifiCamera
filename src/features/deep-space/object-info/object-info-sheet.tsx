import type { ObjectInfoSheetProps } from './object-info-types';
import * as React from 'react';

import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui';
import { formatAzAlt, formatDec, formatDistance, formatRa } from './object-info-types';

function formatSubtitle(name: string, englishName: string, designations: string[]): string {
  const secondary = designations.filter(d => d !== name && d !== englishName && !d.startsWith('NAME '));
  const prefix = englishName && englishName !== name ? englishName : '';
  if (prefix && secondary.length > 0) {
    return `${prefix} · ${secondary[0]}`;
  }
  if (prefix) {
    return prefix;
  }
  return secondary.length > 0 ? secondary[0] : '';
}

function ObjectParamGrid({
  azAltStr,
  distanceStr,
  object,
}: {
  azAltStr: string;
  distanceStr: string | null;
  object: ObjectInfoSheetProps['object'];
}) {
  return (
    <View style={styles.grid}>
      {typeof object.vmag === 'number'
        ? (
            <View style={styles.gridCell}>
              <Text style={styles.cellLabel}>视星等 (vmag)</Text>
              <Text style={styles.cellValue}>{object.vmag.toFixed(2)}</Text>
            </View>
          )
        : null}

      {distanceStr
        ? (
            <View style={styles.gridCell}>
              <Text style={styles.cellLabel}>距离</Text>
              <Text style={styles.cellValue}>{distanceStr}</Text>
            </View>
          )
        : null}

      <View style={styles.gridCell}>
        <Text style={styles.cellLabel}>赤经 (RA J2000)</Text>
        <Text style={styles.cellValue}>{formatRa(object.raHours)}</Text>
      </View>

      <View style={styles.gridCell}>
        <Text style={styles.cellLabel}>赤纬 (Dec J2000)</Text>
        <Text style={styles.cellValue}>{formatDec(object.decDeg)}</Text>
      </View>

      <View style={[styles.gridCell, styles.gridCellWide]}>
        <Text style={styles.cellLabel}>地平坐标 (Az / Alt)</Text>
        <Text style={styles.cellValue}>{azAltStr}</Text>
      </View>

      {typeof object.phase === 'number'
        ? (
            <View style={styles.gridCell}>
              <Text style={styles.cellLabel}>相位 / 照亮比例</Text>
              <Text style={styles.cellValue}>{`${Math.round(object.phase * 100)}%`}</Text>
            </View>
          )
        : null}
    </View>
  );
}

function ObjectActionButtons({
  object,
  onCenter,
  onGoto,
  onZoomIn,
}: {
  object: ObjectInfoSheetProps['object'];
  onCenter: ObjectInfoSheetProps['onCenter'];
  onGoto: ObjectInfoSheetProps['onGoto'];
  onZoomIn: ObjectInfoSheetProps['onZoomIn'];
}) {
  return (
    <View style={styles.actionRow}>
      <Pressable
        accessibilityLabel="居中追踪"
        accessibilityRole="button"
        onPress={() => onCenter(object)}
        style={[styles.actionBtn, styles.actionBtnPrimary]}
        testID="deep-space-object-center-btn"
      >
        <Text style={styles.actionBtnTextPrimary}>居中追踪</Text>
      </Pressable>

      <Pressable
        accessibilityLabel="放大视角"
        accessibilityRole="button"
        onPress={() => onZoomIn(object)}
        style={styles.actionBtn}
        testID="deep-space-object-zoom-btn"
      >
        <Text style={styles.actionBtnText}>放大视角</Text>
      </Pressable>

      {onGoto
        ? (
            <Pressable
              accessibilityLabel="望远镜指向"
              accessibilityRole="button"
              onPress={() => onGoto(object.raHours, object.decDeg)}
              style={styles.actionBtn}
              testID="deep-space-object-goto-btn"
            >
              <Text style={styles.actionBtnText}>指向望远镜</Text>
            </Pressable>
          )
        : null}
    </View>
  );
}

export function ObjectInfoSheet({
  object,
  onCenter,
  onClose,
  onGoto,
  onZoomIn,
}: ObjectInfoSheetProps): React.ReactElement {
  const subtitle = formatSubtitle(object.name, object.englishName, object.designations);
  const distanceStr = formatDistance(object.distanceAu);
  const azAltStr = formatAzAlt(object.azDeg, object.altDeg);

  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <View style={styles.card} testID="deep-space-object-info-sheet">
        <View style={styles.header}>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>{object.name}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          <Pressable
            accessibilityLabel="关闭天体信息"
            accessibilityRole="button"
            onPress={onClose}
            style={styles.closeBtn}
            testID="deep-space-object-close-btn"
          >
            <Text style={styles.closeIcon}>✕</Text>
          </Pressable>
        </View>

        <View style={styles.divider} />

        <ObjectParamGrid azAltStr={azAltStr} distanceStr={distanceStr} object={object} />
        <ObjectActionButtons object={object} onCenter={onCenter} onGoto={onGoto} onZoomIn={onZoomIn} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actionBtn: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 10,
    flex: 1,
    marginHorizontal: 4,
    paddingVertical: 10,
  },
  actionBtnPrimary: {
    backgroundColor: '#2B82F6',
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  actionBtnTextPrimary: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  card: {
    backgroundColor: '#26282C',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 24,
    paddingHorizontal: 16,
    paddingTop: 16,
    width: '100%',
  },
  cellLabel: {
    color: 'rgba(255, 255, 255, 0.52)',
    fontSize: 11,
    marginBottom: 2,
  },
  cellValue: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  closeBtn: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  closeIcon: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 16,
  },
  divider: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    height: StyleSheet.hairlineWidth,
    marginVertical: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridCell: {
    paddingVertical: 6,
    width: '50%',
  },
  gridCellWide: {
    width: '100%',
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  overlay: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 40,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    marginTop: 2,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  titleBlock: {
    flex: 1,
    paddingRight: 8,
  },
});
