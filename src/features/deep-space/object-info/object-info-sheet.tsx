import type { ObjectInfoSheetProps } from './object-info-types';
import * as React from 'react';
import { PanResponder, Platform, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Mask, Path, Rect, Stop } from 'react-native-svg';
import { Text } from '@/components/ui';
import {
  estimateConstellation,
  formatAltPrecision,
  formatAzPrecision,
  formatDecPrecision,
  formatDistanceStellarium,
  formatHourAngle,
  formatPhase,
  formatRaPrecision,
  formatSize,
} from './object-info-types';

function PlanetMoonAvatar({ phase }: { phase?: number | null }) {
  const phaseVal = typeof phase === 'number' ? Math.max(0, Math.min(1, phase)) : 0.5;
  return (
    <View style={styles.avatarWrapper}>
      <Svg height={48} viewBox="0 0 48 48" width={48}>
        <Circle cx={24} cy={24} fill="#7A7670" r={22} />
        <Mask id="phaseMask">
          <Rect fill="#000000" height={48} width={48} x={0} y={0} />
          <Circle cx={24} cy={24} fill="#FFFFFF" r={22} />
        </Mask>
        <Path
          d={`M 24 2 A 22 22 0 0 1 24 46 A ${Math.abs(phaseVal - 0.5) * 44} 22 0 0 ${phaseVal >= 0.5 ? 1 : 0} 24 2 Z`}
          fill="#FFF1D0"
        />
      </Svg>
    </View>
  );
}

function StarAvatar() {
  return (
    <View style={styles.avatarWrapper}>
      <Svg height={48} viewBox="0 0 48 48" width={48}>
        <Defs>
          <LinearGradient id="starGlow" x1="0%" x2="100%" y1="0%" y2="100%">
            <Stop offset="0%" stopColor="#93C5FD" stopOpacity={0.8} />
            <Stop offset="100%" stopColor="#3B82F6" stopOpacity={0.4} />
          </LinearGradient>
        </Defs>
        <Circle cx={24} cy={24} fill="url(#starGlow)" r={20} />
        <Circle cx={24} cy={24} fill="#FFFFFF" r={7} />
        <Line stroke="#FFFFFF" strokeLinecap="round" strokeWidth={2} x1={24} x2={24} y1={6} y2={42} />
        <Line stroke="#FFFFFF" strokeLinecap="round" strokeWidth={2} x1={6} x2={42} y1={24} y2={24} />
      </Svg>
    </View>
  );
}

function ObjectAvatar({
  name,
  phase,
  type,
}: {
  name: string;
  phase?: number | null;
  type?: string;
}) {
  const isMoonOrPlanet = type === 'planet' || type === 'moon' || ['金星', '水星', '月球', '火星'].includes(name);

  if (isMoonOrPlanet && typeof phase === 'number') {
    return <PlanetMoonAvatar phase={phase} />;
  }

  if (type === 'star') {
    return <StarAvatar />;
  }

  return (
    <View style={styles.avatarWrapper}>
      <Svg height={48} viewBox="0 0 48 48" width={48}>
        <Circle cx={24} cy={24} fill="#3B4252" r={22} />
        <Circle cx={24} cy={24} fill="#81A1C1" opacity={0.6} r={14} />
        <Circle cx={24} cy={24} fill="#ECEFF4" r={5} />
      </Svg>
    </View>
  );
}

function PageStepper({
  onNext,
  onPrev,
}: {
  onNext: () => void;
  onPrev: () => void;
}) {
  return (
    <View style={styles.stepperPill} testID="deep-space-object-page-stepper">
      <Pressable
        accessibilityLabel="上一页"
        accessibilityRole="button"
        hitSlop={6}
        onPress={onPrev}
        style={styles.stepperArrowBtn}
        testID="deep-space-object-page-prev"
      >
        <Text style={styles.stepperArrowText}>‹</Text>
      </Pressable>
      <Pressable
        accessibilityLabel="下一页"
        accessibilityRole="button"
        hitSlop={6}
        onPress={onNext}
        style={styles.stepperArrowBtn}
        testID="deep-space-object-page-next"
      >
        <Text style={styles.stepperArrowText}>›</Text>
      </Pressable>
    </View>
  );
}

function CoordinatePage({
  object,
  onNextPage,
  onPrevPage,
}: {
  object: ObjectInfoSheetProps['object'];
  onNextPage: () => void;
  onPrevPage: () => void;
}) {
  const raStr = formatRaPrecision(object.raHours);
  const decStr = formatDecPrecision(object.decDeg);
  const azStr = formatAzPrecision(object.azDeg);
  const altStr = formatAltPrecision(object.altDeg);
  const haStr = formatHourAngle(object.hourAngleHours);
  const raJ2000Str = formatRaPrecision(object.raJ2000Hours ?? object.raHours);
  const decJ2000Str = formatDecPrecision(object.decJ2000Deg ?? object.decDeg);

  return (
    <View style={styles.dataPage} testID="deep-space-object-coords-page">
      <View style={styles.dataRow}>
        <Text style={styles.dataLabel}>RA/Dec</Text>
        <View style={styles.dataValueWithStepper}>
          <Text style={styles.dataValue}>{`${raStr}   ${decStr}`}</Text>
          <PageStepper onNext={onNextPage} onPrev={onPrevPage} />
        </View>
      </View>

      <View style={styles.dataRow}>
        <Text style={styles.dataLabel}>Az/Alt</Text>
        <Text style={styles.dataValue}>{`${azStr}   ${altStr}`}</Text>
      </View>

      <View style={styles.dataRow}>
        <Text style={styles.dataLabel}>时角</Text>
        <Text style={styles.dataValue}>{haStr}</Text>
      </View>

      <View style={styles.dataRow}>
        <Text style={styles.dataLabel}>RA/Dec (J2000)</Text>
        <Text style={styles.dataValue}>{`${raJ2000Str}   ${decJ2000Str}`}</Text>
      </View>
    </View>
  );
}

function PhysicalPage({
  object,
  onNextPage,
  onPrevPage,
}: {
  object: ObjectInfoSheetProps['object'];
  onNextPage: () => void;
  onPrevPage: () => void;
}) {
  const constellation = object.constellationZh || estimateConstellation(object.raHours, object.decDeg);
  const vmagStr = typeof object.vmag === 'number' ? (object.vmag > 0 ? `${object.vmag.toFixed(2)}` : object.vmag.toFixed(2)) : '--';
  const distStr = formatDistanceStellarium(object.distanceAu);
  const phaseStr = formatPhase(object.phase);
  const sizeStr = formatSize(object.sizeArcsec);

  return (
    <View style={styles.dataPage} testID="deep-space-object-physical-page">
      <View style={styles.dataRow}>
        <Text style={styles.dataLabel}>星座</Text>
        <View style={styles.dataValueWithStepper}>
          <Text style={styles.dataValue}>{constellation}</Text>
          <PageStepper onNext={onNextPage} onPrev={onPrevPage} />
        </View>
      </View>

      <View style={styles.dataRow}>
        <Text style={styles.dataLabel}>星等</Text>
        <Text style={styles.dataValue}>{vmagStr}</Text>
      </View>

      <View style={styles.dataRow}>
        <Text style={styles.dataLabel}>距离</Text>
        <Text style={styles.dataValue}>{distStr}</Text>
      </View>

      <View style={styles.dataRow}>
        <Text style={styles.dataLabel}>阶段</Text>
        <Text style={styles.dataValue}>{phaseStr}</Text>
      </View>

      <View style={styles.dataRow}>
        <Text style={styles.dataLabel}>直径</Text>
        <Text style={styles.dataValue}>{sizeStr}</Text>
      </View>
    </View>
  );
}

function formatSubtitle(name: string, englishName: string, designations: string[]): string {
  const secondary = (designations || []).filter(d => d !== name && d !== englishName && !d.startsWith('NAME '));
  const prefix = englishName && englishName !== name ? englishName : '';
  if (prefix && secondary.length > 0) {
    return `${prefix} · ${secondary[0]}`;
  }
  if (prefix) {
    return prefix;
  }
  return secondary.length > 0 ? secondary[0] : '';
}

function ObjectHeader({
  object,
  onZoomIn,
  onZoomOut,
}: {
  object: ObjectInfoSheetProps['object'];
  onZoomIn: (object: ObjectInfoSheetProps['object']) => void;
  onZoomOut?: (object: ObjectInfoSheetProps['object']) => void;
}) {
  const subtitleFromDesig = formatSubtitle(object.name, object.englishName, object.designations);
  const displaySubtitle = object.typeZh || subtitleFromDesig || '天体';

  return (
    <View style={styles.header}>
      <ObjectAvatar name={object.name} phase={object.phase} type={object.type} />

      <View style={styles.titleBlock}>
        <Text numberOfLines={1} style={styles.title}>{object.name}</Text>
        <Text numberOfLines={1} style={styles.subtitle}>{displaySubtitle}</Text>
      </View>

      <View style={styles.zoomControlBlock}>
        <View style={styles.zoomButtonsRow}>
          <Pressable
            accessibilityLabel="缩小视角"
            accessibilityRole="button"
            hitSlop={6}
            onPress={() => (onZoomOut ? onZoomOut(object) : onZoomIn(object))}
            style={styles.zoomCircleBtn}
            testID="deep-space-object-zoom-out-btn"
          >
            <Svg height={16} viewBox="0 0 16 16" width={16}>
              <Line stroke="#FFFFFF" strokeLinecap="round" strokeWidth={2.4} x1={3} x2={13} y1={8} y2={8} />
            </Svg>
          </Pressable>

          <Pressable
            accessibilityLabel="放大视角"
            accessibilityRole="button"
            hitSlop={6}
            onPress={() => onZoomIn(object)}
            style={styles.zoomCircleBtn}
            testID="deep-space-object-zoom-btn"
          >
            <Svg height={16} viewBox="0 0 16 16" width={16}>
              <Line stroke="#FFFFFF" strokeLinecap="round" strokeWidth={2.4} x1={3} x2={13} y1={8} y2={8} />
              <Line stroke="#FFFFFF" strokeLinecap="round" strokeWidth={2.4} x1={8} x2={8} y1={3} y2={13} />
            </Svg>
          </Pressable>
        </View>
        <Text style={styles.zoomLabel}>缩放</Text>
      </View>
    </View>
  );
}

function ObjectActionPills({
  liked,
  object,
  onCenter,
  onClose,
  onGoto,
  onToggleLike,
  onZoomIn,
}: {
  liked: boolean;
  object: ObjectInfoSheetProps['object'];
  onCenter: (object: ObjectInfoSheetProps['object']) => void;
  onClose: () => void;
  onGoto?: (raHours: number, decDeg: number) => void;
  onToggleLike: () => void;
  onZoomIn: (object: ObjectInfoSheetProps['object']) => void;
}) {
  return (
    <View style={styles.actionPillsRow}>
      <Pressable
        accessibilityLabel="可见度"
        accessibilityRole="button"
        onPress={() => onCenter(object)}
        style={styles.pillButton}
        testID="deep-space-object-center-btn"
      >
        <Svg height={16} viewBox="0 0 16 16" width={16}>
          <Circle cx={8} cy={8} fill="none" r={6.5} stroke="#7BA7F7" strokeWidth={1.8} />
          <Circle cx={8} cy={8} fill="#7BA7F7" r={2.5} />
        </Svg>
        <Text style={styles.pillButtonText}>可见度</Text>
      </Pressable>

      <Pressable
        accessibilityLabel="3D视角"
        accessibilityRole="button"
        onPress={() => onZoomIn(object)}
        style={styles.pillButton}
        testID="deep-space-object-3d-btn"
      >
        <Svg height={16} viewBox="0 0 16 16" width={16}>
          <Circle cx={8} cy={8} fill="none" r={6.5} stroke="#7BA7F7" strokeWidth={1.6} />
          <Path d="M 2 8 C 4 4, 12 4, 14 8 C 12 12, 4 12, 2 8 Z" fill="none" stroke="#7BA7F7" strokeWidth={1.2} />
        </Svg>
        <Text style={styles.pillButtonText}>3D</Text>
      </Pressable>

      <Pressable
        accessibilityLabel="收藏"
        accessibilityRole="button"
        onPress={onToggleLike}
        style={styles.heartButton}
        testID="deep-space-object-like-btn"
      >
        <Svg height={18} viewBox="0 0 24 24" width={18}>
          <Path
            d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
            fill={liked ? '#EF4444' : 'none'}
            stroke={liked ? '#EF4444' : '#FFFFFF'}
            strokeWidth={2}
          />
        </Svg>
      </Pressable>

      {onGoto && (
        <Pressable
          accessibilityLabel="望远镜指向"
          accessibilityRole="button"
          onPress={() => onGoto(object.raHours, object.decDeg)}
          style={styles.gotoPillButton}
          testID="deep-space-object-goto-btn"
        >
          <Text style={styles.gotoPillButtonText}>指向望远镜</Text>
        </Pressable>
      )}

      <Pressable
        accessibilityLabel="关闭天体信息"
        accessibilityRole="button"
        hitSlop={8}
        onPress={onClose}
        style={styles.closeRoundBtn}
        testID="deep-space-object-close-btn"
      >
        <Text style={styles.closeRoundBtnText}>✕</Text>
      </Pressable>
    </View>
  );
}

export function ObjectInfoSheet({
  object,
  onCenter,
  onClose,
  onGoto,
  onZoomIn,
  onZoomOut,
}: ObjectInfoSheetProps): React.ReactElement {
  const [page, setPage] = React.useState(0);
  const [liked, setLiked] = React.useState(false);

  const handleNextPage = () => setPage(p => (p + 1) % 2);
  const handlePrevPage = () => setPage(p => (p - 1 + 2) % 2);

  const panResponder = React.useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dx) > 20 && Math.abs(gestureState.dy) < 20,
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -30) {
          handleNextPage();
        }
        else if (gestureState.dx > 30) {
          handlePrevPage();
        }
      },
    }),
  ).current;

  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <View style={styles.card} testID="deep-space-object-info-sheet">
        <View style={styles.handleBar} />
        <ObjectHeader object={object} onZoomIn={onZoomIn} onZoomOut={onZoomOut} />
        <ObjectActionPills
          liked={liked}
          object={object}
          onCenter={onCenter}
          onClose={onClose}
          onGoto={onGoto}
          onToggleLike={() => setLiked(v => !v)}
          onZoomIn={onZoomIn}
        />
        <View style={styles.divider} />
        <View style={styles.dataPagesContainer} {...panResponder.panHandlers}>
          {page === 0
            ? <CoordinatePage object={object} onNextPage={handleNextPage} onPrevPage={handlePrevPage} />
            : <PhysicalPage object={object} onNextPage={handleNextPage} onPrevPage={handlePrevPage} />}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actionPillsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  avatarWrapper: {
    alignItems: 'center',
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  card: {
    backgroundColor: 'rgba(30, 34, 40, 0.96)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    elevation: 24,
    overflow: 'hidden',
    paddingBottom: Platform.OS === 'ios' ? 28 : 20,
    paddingHorizontal: 18,
    paddingTop: 8,
    shadowColor: '#000000',
    shadowOffset: { height: -6, width: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    width: '100%',
  },
  closeRoundBtn: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    marginLeft: 'auto',
    width: 36,
  },
  closeRoundBtnText: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 14,
  },
  dataLabel: {
    color: 'rgba(255, 255, 255, 0.58)',
    fontSize: 14,
    fontWeight: '400',
    width: 110,
  },
  dataPage: {
    gap: 8,
  },
  dataPagesContainer: {
    minHeight: 140,
  },
  dataRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 28,
  },
  dataValue: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  dataValueWithStepper: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  divider: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    height: StyleSheet.hairlineWidth,
    marginVertical: 12,
  },
  gotoPillButton: {
    alignItems: 'center',
    backgroundColor: '#2B82F6',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  gotoPillButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  handleBar: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.26)',
    borderRadius: 2.5,
    height: 4.5,
    marginBottom: 10,
    marginTop: 2,
    width: 36,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heartButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 90,
  },
  pillButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  pillButtonText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '500',
  },
  stepperArrowBtn: {
    alignItems: 'center',
    height: 24,
    justifyContent: 'center',
    width: 22,
  },
  stepperArrowText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 16,
    fontWeight: '600',
  },
  stepperPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderRadius: 14,
    flexDirection: 'row',
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  subtitle: {
    color: '#7BA7F7',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 2,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  titleBlock: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  zoomButtonsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  zoomCircleBtn: {
    alignItems: 'center',
    borderColor: '#FFFFFF',
    borderRadius: 17,
    borderWidth: 1.8,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  zoomControlBlock: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomLabel: {
    color: 'rgba(255, 255, 255, 0.44)',
    fontSize: 11,
    marginTop: 3,
    textAlign: 'center',
  },
});
