import type { FieldOfViewInput } from '@/features/deep-space/tools/field-of-view';
import type { StellariumSkyLayers } from '@/features/stellarium/stellarium-service';
import type { StellariumViewHandle } from '@/features/stellarium/stellarium-view';
import * as React from 'react';
import { Animated, Easing, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path, Polygon, Rect } from 'react-native-svg';
import SKY_CULTURES_DATA from '@/assets/stellar/skycultures-full.json';
import { Text } from '@/components/ui';
import { CalendarPanel } from '@/features/deep-space/calendar/calendar-panel';
import { FieldOfViewOverlay } from '@/features/deep-space/tools/field-of-view-overlay';
import { FieldOfViewPanel } from '@/features/deep-space/tools/field-of-view-panel';
import { TelescopeControlPanel } from '@/features/deep-space/tools/telescope-control-panel';
import { StellariumView } from '@/features/stellarium/stellarium-view';
import { getLanguage, translate } from '@/lib/i18n';

const OVERLAY = {
  accent: '#2B82F6',
  accentDim: 'rgba(43, 130, 246, 0.18)',
  control: 'rgba(17, 19, 22, 0.66)',
  drawer: '#26282C',
  drawerHeader: '#383B40',
  hairline: 'rgba(255, 255, 255, 0.16)',
  muted: 'rgba(255, 255, 255, 0.66)',
  purple: '#A892FF',
  text: '#FFFFFF',
  warning: '#FFB4BA',
};

const DEFAULT_SKY_LAYERS: Required<StellariumSkyLayers> = {
  atmosphere: true,
  constellationArt: true,
  constellationLabels: true,
  constellationLines: true,
  landscape: true,
};

const DEFAULT_GRID_LINES: Record<'azimuthal' | 'equatorial_jnow' | 'meridian', boolean> = {
  azimuthal: false,
  equatorial_jnow: false,
  meridian: false,
};

type GridLineKey = keyof typeof DEFAULT_GRID_LINES;

const OBSERVER_CITIES = [
  { latitudeDeg: 39.9, longitudeDeg: 116.41, name: '北京' },
  { latitudeDeg: 31.23, longitudeDeg: 121.47, name: '上海' },
  { latitudeDeg: 22.54, longitudeDeg: 114.06, name: '深圳' },
  { latitudeDeg: 43.83, longitudeDeg: 87.62, name: '乌鲁木齐' },
];

const REGION_LABELS: Record<string, string> = SKY_CULTURES_DATA.regionsZh;

const BEARING_LABELS = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];

function bearingLabel(azimuthDeg: number): string {
  return BEARING_LABELS[Math.round(((azimuthDeg % 360) + 360) % 360 / 45) % 8];
}

type SkyLayerKey = keyof typeof DEFAULT_SKY_LAYERS;

type DeepSpaceMapScreenProps = {
  onBack?: () => void;
};

type IconButtonProps = {
  accessibilityLabel: string;
  children: React.ReactNode;
  onPress: () => void;
  testID: string;
};

type LayerPanelProps = {
  layers: typeof DEFAULT_SKY_LAYERS;
  onToggle: (key: SkyLayerKey) => void;
};

type DrawerFeature = 'calendar' | 'glossary' | 'settings' | 'tools';

type ReferenceDrawerProps = {
  onClose: () => void;
  onOpen: (feature: DrawerFeature) => void;
};

type ReferenceSearchSheetProps = {
  error: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  query: string;
};

type DrawerFeatureOptions = {
  currentCulture: string;
  setCurrentCulture: (id: string) => void;
  stellaRef: React.RefObject<StellariumViewHandle | null>;
};

function useDrawerFeature(options: DrawerFeatureOptions) {
  const { currentCulture, setCurrentCulture, stellaRef } = options;
  const [active, setActive] = React.useState<DrawerFeature>();
  const [activeCity, setActiveCity] = React.useState(OBSERVER_CITIES[0].name);
  const [fieldOfView, setFieldOfView] = React.useState<FieldOfViewInput>();
  const [gridLines, setGridLines] = React.useState(DEFAULT_GRID_LINES);
  const close = () => setActive(undefined);

  const updateGridLines = React.useCallback((patch: Partial<typeof DEFAULT_GRID_LINES>) => {
    setGridLines(prev => ({ ...prev, ...patch }));
    stellaRef.current?.setGridLines?.(patch);
  }, [stellaRef]);

  return {
    active,
    activeCity,
    applyFieldOfView: (input: FieldOfViewInput) => setFieldOfView(input),
    clearFieldOfView: () => setFieldOfView(undefined),
    close,
    currentCulture,
    fieldOfView,
    gridLines,
    open: (next: DrawerFeature) => setActive(next),
    selectCity: (city: typeof OBSERVER_CITIES[number]) => {
      setActiveCity(city.name);
      stellaRef.current?.setLocation?.(city.latitudeDeg, city.longitudeDeg);
    },
    selectSkyCulture: (id: string, target?: string | null) => {
      setCurrentCulture(id);
      stellaRef.current?.setSkyCulture?.(id, target ?? undefined);
      close();
    },
    toggleGridLine: (key: GridLineKey) => updateGridLines({ [key]: !gridLines[key] }),
    updateGridLines,
  };
}

function StarMapOverlayControls({
  azimuthDeg,
  clock,
  gridLines,
  insets,
  nightMode,
  onOpenLayers,
  onOpenMenu,
  onOpenSearch,
  onReturnToNow,
  onToggleNightMode,
  onUpdateGridLines,
  onUpdateSkyLayers,
  skyLayers,
}: {
  azimuthDeg: number;
  clock: Date;
  gridLines: typeof DEFAULT_GRID_LINES;
  insets: { bottom: number; top: number };
  nightMode: boolean;
  onOpenLayers: () => void;
  onOpenMenu: () => void;
  onOpenSearch: () => void;
  onReturnToNow: () => void;
  onToggleNightMode: () => void;
  onUpdateGridLines: (patch: Partial<typeof DEFAULT_GRID_LINES>) => void;
  onUpdateSkyLayers: (patch: Partial<typeof DEFAULT_SKY_LAYERS>) => void;
  skyLayers: typeof DEFAULT_SKY_LAYERS;
}) {
  const [quickPanelOpen, setQuickPanelOpen] = React.useState(false);
  const [activeDetail, setActiveDetail] = React.useState<QuickControlId | null>(null);

  const controls = getQuickControls({
    lines: gridLines,
    nightMode,
    onToggleNightMode,
    onUpdateGridLines,
    onUpdateSkyLayers,
    skyLayers,
  });

  const currentDetailControl = controls.find(c => c.id === activeDetail);

  return (
    <View pointerEvents="box-none" style={[styles.overlay, { paddingTop: insets.top + 12 }]}>
      <TopControls onOpenMenu={onOpenMenu} onOpenSearch={onOpenSearch} />
      <View style={styles.horizonBearing} pointerEvents="none">
        <Text testID="deep-space-horizon-bearing" style={styles.horizonBearingText}>{bearingLabel(azimuthDeg)}</Text>
      </View>
      <View style={[styles.bottomControls, { paddingBottom: insets.bottom + 14 }]} pointerEvents="box-none">
        <View style={styles.leftQuickBar}>
          <GridQuickBar
            controls={controls}
            onLongPressControl={setActiveDetail}
            onOpenChange={(next) => {
              if (!next)
                setActiveDetail(null);
              setQuickPanelOpen(next);
            }}
            open={quickPanelOpen}
          />
          {!quickPanelOpen && (
            <IconButton
              accessibilityLabel={translate('deep_space.layers')}
              onPress={onOpenLayers}
              testID="deep-space-reference-layers"
            >
              <LayersIcon />
            </IconButton>
          )}
        </View>
        {!quickPanelOpen && <Compass azimuthDeg={azimuthDeg} />}
        {!quickPanelOpen && <TimeControl clock={clock} onReturnToNow={onReturnToNow} />}
      </View>
      {currentDetailControl && (
        <QuickControlDetailSheet
          items={currentDetailControl.detailItems}
          onClose={() => setActiveDetail(null)}
          subtitle={currentDetailControl.detailSubtitle}
          title={currentDetailControl.detailTitle}
        />
      )}
    </View>
  );
}

type QuickControlId = 'grid-lines' | 'constellation' | 'landscape' | 'atmosphere' | 'labels' | 'night-mode';

type QuickSubItem = {
  active: boolean;
  hint: string;
  id: string;
  label: string;
  onToggle: () => void;
};

function QuickControlDetailSheet({
  items,
  onClose,
  subtitle,
  title,
}: {
  items: QuickSubItem[];
  onClose: () => void;
  subtitle: string;
  title: string;
}) {
  return (
    <View pointerEvents="box-none" style={styles.quickDetailOverlay}>
      <Pressable accessibilityLabel="关闭设置" accessibilityRole="button" onPress={onClose} style={styles.quickDetailScrim} />
      <View style={styles.quickDetailCard} testID="deep-space-quick-detail-sheet">
        <View style={styles.quickDetailHeader}>
          <View style={styles.quickDetailTitleBlock}>
            <Text style={styles.quickDetailTitle}>{title}</Text>
            <Text style={styles.quickDetailSubtitle}>{subtitle}</Text>
          </View>
          <Pressable
            accessibilityLabel={translate('deep_space.back')}
            accessibilityRole="button"
            onPress={onClose}
            style={styles.quickDetailClose}
            testID="deep-space-quick-detail-close"
          >
            <CloseIcon />
          </Pressable>
        </View>
        <View style={styles.quickDetailDivider} />
        <View style={styles.quickDetailList}>
          {items.map(item => (
            <Pressable
              accessibilityLabel={item.label}
              accessibilityRole="switch"
              accessibilityState={{ checked: item.active }}
              key={item.id}
              onPress={item.onToggle}
              style={styles.quickDetailRow}
              testID={`deep-space-quick-detail-toggle-${item.id}`}
            >
              <View style={styles.quickDetailRowText}>
                <Text style={styles.quickDetailRowLabel}>{item.label}</Text>
                <Text style={styles.quickDetailRowHint}>{item.hint}</Text>
              </View>
              <View style={[styles.layerSwitch, item.active && styles.layerSwitchActive]}>
                <View style={[styles.layerKnob, item.active && styles.layerKnobActive]} />
              </View>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

type QuickControlEntry = {
  active: boolean;
  detailItems: QuickSubItem[];
  detailSubtitle: string;
  detailTitle: string;
  icon: 'grid-lines' | 'constellation' | 'landscape' | 'atmosphere' | 'labels' | 'night';
  id: QuickControlId;
  label: string;
  onPress: () => void;
};

function getGridAndConstellationControls({
  lines,
  onUpdateGridLines,
  onUpdateSkyLayers,
  skyLayers,
}: {
  lines: typeof DEFAULT_GRID_LINES;
  onUpdateGridLines: (patch: Partial<typeof DEFAULT_GRID_LINES>) => void;
  onUpdateSkyLayers: (patch: Partial<typeof DEFAULT_SKY_LAYERS>) => void;
  skyLayers: typeof DEFAULT_SKY_LAYERS;
}): QuickControlEntry[] {
  const gridsActive = lines.azimuthal && lines.equatorial_jnow;
  const constellationActive = skyLayers.constellationLines || skyLayers.constellationArt;

  return [
    {
      active: gridsActive,
      detailItems: [
        {
          active: lines.azimuthal,
          hint: '以地平线与天顶为基准的仰角与方位网格',
          id: 'azimuthal',
          label: '地平坐标网格 (Azimuthal)',
          onToggle: () => onUpdateGridLines({ azimuthal: !lines.azimuthal }),
        },
        {
          active: lines.equatorial_jnow,
          hint: '随天球旋转的即时天赤道与赤经赤纬网格',
          id: 'equatorial_jnow',
          label: '赤道坐标网格 (JNow)',
          onToggle: () => onUpdateGridLines({ equatorial_jnow: !lines.equatorial_jnow }),
        },
        {
          active: lines.meridian,
          hint: '连接天顶与正南正北地平圈的天球大圆',
          id: 'meridian',
          label: '子午线 (Meridian)',
          onToggle: () => onUpdateGridLines({ meridian: !lines.meridian }),
        },
      ],
      detailSubtitle: '天球与地平参考坐标网格',
      detailTitle: '网格和线条设置',
      icon: 'grid-lines',
      id: 'grid-lines',
      label: '网格和线条',
      onPress: () => {
        const next = !gridsActive;
        onUpdateGridLines({
          azimuthal: next,
          equatorial_jnow: next,
        });
      },
    },
    {
      active: constellationActive,
      detailItems: [
        {
          active: skyLayers.constellationLines,
          hint: '连接主要明亮恒星的几何线条骨架',
          id: 'constellationLines',
          label: '星座连线',
          onToggle: () => onUpdateSkyLayers({ constellationLines: !skyLayers.constellationLines }),
        },
        {
          active: skyLayers.constellationArt,
          hint: '古典神话星图的手绘形象画像',
          id: 'constellationArt',
          label: '星座古典艺术画',
          onToggle: () => onUpdateSkyLayers({ constellationArt: !skyLayers.constellationArt }),
        },
        {
          active: skyLayers.constellationLabels,
          hint: '在星空中标注所有星座的名称',
          id: 'constellationLabels',
          label: '星座名称注记',
          onToggle: () => onUpdateSkyLayers({ constellationLabels: !skyLayers.constellationLabels }),
        },
      ],
      detailSubtitle: '星座几何连线、艺术图画与名称',
      detailTitle: '星座显示设置',
      icon: 'constellation',
      id: 'constellation',
      label: '星座',
      onPress: () => {
        const next = !constellationActive;
        onUpdateSkyLayers({
          constellationArt: next,
          constellationLines: next,
        });
      },
    },
  ];
}

function getEnvironmentAndNightControls({
  nightMode,
  onToggleNightMode,
  onUpdateSkyLayers,
  skyLayers,
}: {
  nightMode: boolean;
  onToggleNightMode: () => void;
  onUpdateSkyLayers: (patch: Partial<typeof DEFAULT_SKY_LAYERS>) => void;
  skyLayers: typeof DEFAULT_SKY_LAYERS;
}): QuickControlEntry[] {
  return [
    {
      active: skyLayers.landscape,
      detailItems: [
        {
          active: skyLayers.landscape,
          hint: '显示观测地点周围的真实地表全景与遮挡',
          id: 'landscape',
          label: '地面全景景观',
          onToggle: () => onUpdateSkyLayers({ landscape: !skyLayers.landscape }),
        },
      ],
      detailSubtitle: '真实地面地景与地平线模拟',
      detailTitle: '地景设置',
      icon: 'landscape',
      id: 'landscape',
      label: '地景',
      onPress: () => onUpdateSkyLayers({ landscape: !skyLayers.landscape }),
    },
    {
      active: skyLayers.atmosphere,
      detailItems: [
        {
          active: skyLayers.atmosphere,
          hint: '模拟日光散射、晨昏蒙影与天光消光',
          id: 'atmosphere',
          label: '大气散射光',
          onToggle: () => onUpdateSkyLayers({ atmosphere: !skyLayers.atmosphere }),
        },
      ],
      detailSubtitle: '日照散射与大气环境模拟',
      detailTitle: '大气层设置',
      icon: 'atmosphere',
      id: 'atmosphere',
      label: '大气层',
      onPress: () => onUpdateSkyLayers({ atmosphere: !skyLayers.atmosphere }),
    },
    {
      active: skyLayers.constellationLabels,
      detailItems: [
        {
          active: skyLayers.constellationLabels,
          hint: '标注星空中各星座的中文与英文名称',
          id: 'constellationLabels',
          label: '星座标签',
          onToggle: () => onUpdateSkyLayers({ constellationLabels: !skyLayers.constellationLabels }),
        },
      ],
      detailSubtitle: '天体与星座标识注记',
      detailTitle: '标签设置',
      icon: 'labels',
      id: 'labels',
      label: '标签',
      onPress: () => onUpdateSkyLayers({ constellationLabels: !skyLayers.constellationLabels }),
    },
    {
      active: nightMode,
      detailItems: [
        {
          active: nightMode,
          hint: '过滤全屏蓝绿光波长，保护暗夜视网膜暗适应能力',
          id: 'nightMode',
          label: '暗适应天文红光',
          onToggle: onToggleNightMode,
        },
      ],
      detailSubtitle: '天文观测暗适应红光保护',
      detailTitle: '夜间模式设置',
      icon: 'night',
      id: 'night-mode',
      label: '夜间模式',
      onPress: onToggleNightMode,
    },
  ];
}

function getQuickControls(params: {
  lines: typeof DEFAULT_GRID_LINES;
  nightMode: boolean;
  onToggleNightMode: () => void;
  onUpdateGridLines: (patch: Partial<typeof DEFAULT_GRID_LINES>) => void;
  onUpdateSkyLayers: (patch: Partial<typeof DEFAULT_SKY_LAYERS>) => void;
  skyLayers: typeof DEFAULT_SKY_LAYERS;
}): QuickControlEntry[] {
  return [
    ...getGridAndConstellationControls(params),
    ...getEnvironmentAndNightControls(params),
  ];
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function LongPressProgressRing({
  color,
  progress,
}: {
  color: string;
  progress: Animated.Value;
}) {
  const size = 52;
  const strokeWidth = 2.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const strokeDashoffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  return (
    <View pointerEvents="none" style={styles.progressRingWrapper} testID="deep-space-quick-progress-ring">
      <Svg height={size} style={styles.progressRingSvg} viewBox={`0 0 ${size} ${size}`} width={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke="rgba(255, 255, 255, 0.12)"
          strokeWidth={strokeWidth}
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke={color}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          strokeWidth={strokeWidth}
        />
      </Svg>
    </View>
  );
}

function QuickControlButton({
  control,
  onLongPress,
}: {
  control: QuickControlEntry;
  onLongPress: () => void;
}) {
  const [pressing, setPressing] = React.useState(false);
  const progressAnim = React.useRef(new Animated.Value(0)).current;
  const longPressedRef = React.useRef(false);

  const handlePressIn = () => {
    longPressedRef.current = false;
    setPressing(true);
    progressAnim.setValue(0);
    Animated.timing(progressAnim, {
      duration: 400,
      easing: Easing.linear,
      toValue: 1,
      useNativeDriver: false,
    }).start();
  };

  const handlePressOut = () => {
    setPressing(false);
    Animated.timing(progressAnim, {
      duration: 80,
      toValue: 0,
      useNativeDriver: false,
    }).start();
  };

  const handleLongPress = () => {
    longPressedRef.current = true;
    onLongPress();
  };

  const handlePress = () => {
    if (!longPressedRef.current) {
      control.onPress();
    }
  };

  const ringColor = control.id === 'night-mode' ? '#FF5C5C' : '#64A6FF';

  return (
    <Pressable
      accessibilityHint="长按进入细分设置"
      accessibilityLabel={control.label}
      accessibilityRole="switch"
      accessibilityState={{ checked: control.active }}
      delayLongPress={400}
      hitSlop={6}
      key={control.id}
      onLongPress={handleLongPress}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={({ pressed }) => [
        styles.quickControlButton,
        pressed && styles.quickControlButtonPressed,
      ]}
      testID={`deep-space-grid-quick-${control.id}`}
    >
      <View
        style={[
          styles.quickControlCell,
          control.active && styles.quickControlCellActive,
          control.id === 'night-mode' && control.active && styles.quickControlCellNightActive,
        ]}
      >
        <View style={styles.quickIconWrapper}>
          <QuickControlIcon active={control.active} kind={control.icon} />
          {pressing && <LongPressProgressRing color={ringColor} progress={progressAnim} />}
        </View>
        <Text
          style={[
            styles.quickControlLabel,
            control.active && styles.quickControlLabelActive,
            control.id === 'night-mode' && control.active && styles.quickControlLabelNightActive,
          ]}
        >
          {control.label}
        </Text>
      </View>
    </Pressable>
  );
}

function GridQuickBar({
  controls,
  onLongPressControl,
  onOpenChange,
  open,
}: {
  controls: QuickControlEntry[];
  onLongPressControl: (id: QuickControlId) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <View style={styles.gridQuickBar}>
      {open && (
        <View style={styles.gridQuickMenu} testID="deep-space-grid-quick-panel">
          <View style={styles.gridQuickMenuHighlight} />
          {controls.map(control => (
            <QuickControlButton
              control={control}
              key={control.id}
              onLongPress={() => onLongPressControl(control.id)}
            />
          ))}
        </View>
      )}
      <Pressable
        accessibilityLabel="星图叠加"
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => onOpenChange(!open)}
        style={[styles.gridQuickButton, open && styles.gridQuickButtonActive]}
        testID="deep-space-grid-quick-toggle"
      >
        <GridIcon />
      </Pressable>
    </View>
  );
}

function useStarMapSearch(stellaRef: React.RefObject<StellariumViewHandle | null>) {
  const [error, setError] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');

  const openSearch = (onCloseOthers: () => void) => {
    onCloseOthers();
    setError(false);
    setOpen(true);
  };

  const closeSearch = () => {
    setError(false);
    setOpen(false);
    setQuery('');
  };

  const submitSearch = () => {
    const target = query.trim();
    if (!target)
      return;
    setError(false);
    stellaRef.current?.searchTarget?.(target);
  };

  return {
    closeSearch,
    error,
    open,
    openSearch,
    query,
    setError,
    setQuery,
    submitSearch,
  };
}

function RestoreCultureFlow({
  currentCulture,
  insetsBottom,
  onRestore,
  showFab,
}: {
  currentCulture: string;
  insetsBottom: number;
  onRestore: () => void;
  showFab: boolean;
}) {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  return (
    <>
      {showFab && (
        <Pressable
          accessibilityLabel="恢复默认天空文化"
          accessibilityRole="button"
          onPress={() => setDialogOpen(true)}
          style={[styles.restoreCultureFab, { bottom: insetsBottom + 84 }]}
          testID="deep-space-restore-culture-fab"
        >
          <GlossaryIcon />
        </Pressable>
      )}
      <RestoreCultureDialog
        currentCulture={currentCulture}
        onCancel={() => setDialogOpen(false)}
        onConfirm={() => {
          onRestore();
          setDialogOpen(false);
        }}
        visible={dialogOpen}
      />
    </>
  );
}

export function DeepSpaceMapScreen({ onBack: _onBack }: DeepSpaceMapScreenProps): React.ReactElement {
  const insets = useSafeAreaInsets();
  const stellaRef = React.useRef<StellariumViewHandle>(null);
  const [azimuthDeg, setAzimuthDeg] = React.useState(0);
  const [clock, setClock] = React.useState(() => new Date());
  const [currentCulture, setCurrentCulture] = React.useState('western');
  const drawerFeature = useDrawerFeature({ currentCulture, setCurrentCulture, stellaRef });
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [layersOpen, setLayersOpen] = React.useState(false);
  const [nightMode, setNightMode] = React.useState(false);
  const [skyLayers, setSkyLayers] = React.useState(DEFAULT_SKY_LAYERS);
  const search = useStarMapSearch(stellaRef);

  React.useEffect(() => {
    const interval = globalThis.setInterval(() => setClock(new Date()), 60_000);
    return () => globalThis.clearInterval(interval);
  }, []);

  const updateSkyLayers = React.useCallback((patch: Partial<typeof DEFAULT_SKY_LAYERS>) => {
    setSkyLayers((prev) => {
      const next = { ...prev, ...patch };
      stellaRef.current?.setSkyLayers?.(patch);
      return next;
    });
  }, []);

  const toggleLayer = (key: SkyLayerKey) => updateSkyLayers({ [key]: !skyLayers[key] });
  const showRestoreFab = currentCulture !== 'western' && !drawerOpen && !drawerFeature.active && !search.open && !layersOpen;

  return (
    <View testID="deep-space-map-shell" style={styles.root}>
      <StellariumView
        ref={stellaRef}
        style={styles.webView}
        onBearingChange={setAzimuthDeg}
        onReady={() => stellaRef.current?.setSkyLayers?.(skyLayers)}
        onCommandError={() => search.setError(true)}
        onTargetFound={search.closeSearch}
        onTargetNotFound={() => search.setError(true)}
      />
      {drawerFeature.fieldOfView && <FieldOfViewOverlay input={drawerFeature.fieldOfView} stellaRef={stellaRef} />}
      {nightMode && <View pointerEvents="none" style={styles.nightModeOverlay} testID="deep-space-night-mode-overlay" />}
      <StarMapOverlayControls
        azimuthDeg={azimuthDeg}
        clock={clock}
        gridLines={drawerFeature.gridLines}
        insets={insets}
        nightMode={nightMode}
        onOpenLayers={() => {
          setDrawerOpen(false);
          setLayersOpen(value => !value);
        }}
        onOpenMenu={() => {
          setLayersOpen(false);
          setDrawerOpen(true);
        }}
        onOpenSearch={() => search.openSearch(() => {
          setDrawerOpen(false);
          setLayersOpen(false);
        })}
        onReturnToNow={() => setClock(new Date())}
        onToggleNightMode={() => setNightMode(value => !value)}
        onUpdateGridLines={drawerFeature.updateGridLines}
        onUpdateSkyLayers={updateSkyLayers}
        skyLayers={skyLayers}
      />
      <RestoreCultureFlow
        currentCulture={currentCulture}
        insetsBottom={insets.bottom}
        onRestore={() => {
          setCurrentCulture('western');
          stellaRef.current?.setSkyCulture?.('western');
        }}
        showFab={showRestoreFab}
      />
      {layersOpen && <LayerPanel layers={skyLayers} onToggle={toggleLayer} />}
      {drawerOpen && (
        <ReferenceDrawer
          onClose={() => setDrawerOpen(false)}
          onOpen={(next) => {
            setDrawerOpen(false);
            drawerFeature.open(next);
          }}
        />
      )}
      <FeaturePanels
        clock={clock}
        feature={drawerFeature}
        onPreviewCulture={id => stellaRef.current?.setSkyCulture?.(id)}
        stellaRef={stellaRef}
      />
      {search.open && (
        <ReferenceSearchSheet
          error={search.error}
          onChange={search.setQuery}
          onClose={search.closeSearch}
          onSubmit={search.submitSearch}
          query={search.query}
        />
      )}
    </View>
  );
}

function RestoreCultureDialog({
  currentCulture,
  onCancel,
  onConfirm,
  visible,
}: {
  currentCulture: string;
  onCancel: () => void;
  onConfirm: () => void;
  visible: boolean;
}) {
  const activeCultureObj = SKY_CULTURES_DATA.cultures.find(c => c.id === currentCulture);
  const activeCultureName = getLanguage() === 'zh'
    ? (activeCultureObj?.titleZh ?? activeCultureObj?.title ?? currentCulture)
    : (activeCultureObj?.title ?? currentCulture);

  return (
    <Modal animationType="fade" transparent visible={visible}>
      <View style={styles.modalOverlay}>
        <View style={styles.dialogCard} testID="deep-space-restore-culture-dialog">
          <Text style={styles.dialogTitle}>
            天空文化：
            {activeCultureName}
          </Text>
          <Text style={styles.dialogMessage}>你想回到默认的天空文化（西方）吗？</Text>
          <View style={styles.dialogButtons}>
            <Pressable
              accessibilityLabel="取消"
              accessibilityRole="button"
              onPress={onCancel}
              style={styles.dialogButton}
              testID="deep-space-restore-culture-cancel"
            >
              <Text style={styles.dialogButtonTextCancel}>取消</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="确定"
              accessibilityRole="button"
              onPress={onConfirm}
              style={[styles.dialogButton, styles.dialogButtonPrimary]}
              testID="deep-space-restore-culture-confirm"
            >
              <Text style={styles.dialogButtonTextPrimary}>OK</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function TopControls({ onOpenMenu, onOpenSearch }: { onOpenMenu: () => void; onOpenSearch: () => void }) {
  return (
    <View style={styles.topControls}>
      <IconButton accessibilityLabel={translate('deep_space.menu')} onPress={onOpenMenu} testID="deep-space-reference-menu">
        <MenuIcon />
      </IconButton>
      <IconButton accessibilityLabel={translate('deep_space.search')} onPress={onOpenSearch} testID="deep-space-reference-search">
        <SearchIcon />
      </IconButton>
    </View>
  );
}

function FeaturePanels({
  clock,
  feature,
  onPreviewCulture,
  stellaRef,
}: {
  clock: Date;
  feature: ReturnType<typeof useDrawerFeature>;
  onPreviewCulture: (id: string) => void;
  stellaRef: React.RefObject<StellariumViewHandle | null>;
}) {
  switch (feature.active) {
    case 'calendar':
      return (
        <CalendarPanel
          city={OBSERVER_CITIES.find(city => city.name === feature.activeCity) ?? OBSERVER_CITIES[0]}
          clock={clock}
          onClose={feature.close}
          stellaRef={stellaRef}
        />
      );
    case 'glossary':
      return (
        <GlossaryPanel
          currentCulture={feature.currentCulture}
          onClose={feature.close}
          onPreviewCulture={onPreviewCulture}
          onSelect={feature.selectSkyCulture}
        />
      );
    case 'settings':
      return <SettingsPanel activeCity={feature.activeCity} onClose={feature.close} onSelect={feature.selectCity} />;
    case 'tools':
      return (
        <ToolsPanel
          fieldOfViewActive={Boolean(feature.fieldOfView)}
          onApplyFieldOfView={feature.applyFieldOfView}
          onClearFieldOfView={feature.clearFieldOfView}
          onClose={feature.close}
          onGoto={(raHours, decDeg) => stellaRef.current?.gotoRaDec(raHours * 15, decDeg)}
        />
      );
    default:
      return null;
  }
}

function IconButton({ accessibilityLabel, children, onPress, testID }: IconButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      hitSlop={10}
      onPress={onPress}
      style={styles.iconButton}
      testID={testID}
    >
      {children}
    </Pressable>
  );
}

function LayerPanel({ layers, onToggle }: LayerPanelProps) {
  return (
    <View testID="deep-space-reference-layers-panel" style={styles.layerPanel}>
      <LayerToggle active={layers.landscape} label={translate('deep_space.horizon')} onPress={() => onToggle('landscape')} testID="deep-space-layer-landscape" />
      <LayerToggle active={layers.atmosphere} label={translate('deep_space.atmosphere')} onPress={() => onToggle('atmosphere')} testID="deep-space-layer-atmosphere" />
      <LayerToggle active={layers.constellationArt} label={translate('deep_space.constellation_art')} onPress={() => onToggle('constellationArt')} testID="deep-space-layer-constellation-art" />
      <LayerToggle active={layers.constellationLines} label={translate('deep_space.constellations')} onPress={() => onToggle('constellationLines')} testID="deep-space-layer-constellation-lines" />
    </View>
  );
}

function LayerToggle({ active, label, onPress, testID }: { active: boolean; label: string; onPress: () => void; testID: string }) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="switch"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={styles.layerRow}
      testID={testID}
    >
      <Text style={styles.layerLabel}>{label}</Text>
      <View style={[styles.layerSwitch, active && styles.layerSwitchActive]}>
        <View style={[styles.layerKnob, active && styles.layerKnobActive]} />
      </View>
    </Pressable>
  );
}

function ReferenceDrawer({ onClose, onOpen }: ReferenceDrawerProps) {
  return (
    <View style={styles.drawerOverlay}>
      <Pressable accessibilityLabel={translate('deep_space.menu')} accessibilityRole="button" onPress={onClose} style={styles.drawerScrim} />
      <View testID="deep-space-reference-drawer" style={styles.drawer}>
        <View style={styles.drawerHeader}>
          <Pressable
            accessibilityLabel={translate('deep_space.menu')}
            accessibilityRole="button"
            onPress={onClose}
            style={styles.drawerBack}
            testID="deep-space-reference-drawer-close"
          >
            <CloseIcon />
          </Pressable>
          <Text style={styles.drawerTitle}>{translate('deep_space.menu')}</Text>
        </View>
        <ReferenceDrawerRow icon={<GlossaryIcon />} label="星空述语" onPress={() => onOpen('glossary')} />
        <ReferenceDrawerRow icon={<CalendarIcon />} label="日历" onPress={() => onOpen('calendar')} />
        <ReferenceDrawerRow icon={<ObservationIcon />} label="观测工具" onPress={() => onOpen('tools')} />
        <ReferenceDrawerRow icon={<SettingsIcon />} label="设置" onPress={() => onOpen('settings')} />
      </View>
    </View>
  );
}

function ReferenceDrawerRow({ icon, label, onPress, showChevron = true }: { icon: React.ReactNode; label: string; onPress?: () => void; showChevron?: boolean }) {
  const content = (
    <>
      <View style={styles.drawerRowIcon}>{icon}</View>
      <Text style={styles.drawerRowLabel}>{label}</Text>
      {showChevron && <Text style={styles.drawerChevron}>›</Text>}
    </>
  );
  if (!onPress)
    return <View style={styles.drawerRow}>{content}</View>;
  return (
    <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={styles.drawerRow}>
      {content}
    </Pressable>
  );
}

function FeatureSheet({
  children,
  headerLeft,
  onClose,
  scrollable = false,
  testID,
  title,
}: {
  children: React.ReactNode;
  headerLeft?: React.ReactNode;
  onClose: () => void;
  scrollable?: boolean;
  testID: string;
  title: string;
}) {
  return (
    <View pointerEvents="box-none" style={styles.featureOverlay}>
      <Pressable accessibilityLabel={title} accessibilityRole="button" onPress={onClose} style={styles.sheetTopScrim} />
      <View testID={testID} style={[styles.featureSheet, scrollable && styles.featureSheetTall]}>
        <View style={styles.featureHeader}>
          {headerLeft}
          <Text style={styles.featureTitle}>{title}</Text>
          <Pressable accessibilityLabel={translate('deep_space.back')} accessibilityRole="button" onPress={onClose} style={styles.featureClose}>
            <CloseIcon />
          </Pressable>
        </View>
        {scrollable
          ? (
              <ScrollView
                bounces={false}
                contentContainerStyle={styles.featureScrollContent}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
              >
                {children}
              </ScrollView>
            )
          : children}
      </View>
    </View>
  );
}

function GlossaryHero({
  chinese,
  culture,
  isUsing,
  onSelect,
}: {
  chinese: boolean;
  culture: (typeof SKY_CULTURES_DATA.cultures)[number];
  isUsing: boolean;
  onSelect: (id: string, target?: string | null) => void;
}) {
  const displayName = chinese ? (culture.titleZh ?? culture.title) : culture.title;
  const regionName = chinese ? (REGION_LABELS[culture.region] ?? culture.region) : culture.region;

  return (
    <View style={styles.glossaryDetailHero}>
      <View style={styles.glossaryDetailHeroText}>
        <Text style={styles.glossaryDetailTitle}>{displayName}</Text>
        <Text style={styles.glossaryDetailRegion}>{regionName}</Text>
      </View>
      <Pressable
        accessibilityLabel={isUsing ? '已在使用中' : '使用该天空文化'}
        accessibilityRole="button"
        disabled={isUsing}
        onPress={() => onSelect(culture.id, culture.highlight)}
        style={[styles.glossaryUseButton, isUsing && styles.glossaryUseButtonDisabled]}
        testID="deep-space-glossary-use-button"
      >
        <Text style={[styles.glossaryUseButtonText, isUsing && styles.glossaryUseButtonTextDisabled]}>
          {isUsing ? '已使用' : '使用'}
        </Text>
      </Pressable>
    </View>
  );
}

function GlossarySections({
  chinese,
  sections,
}: {
  chinese: boolean;
  sections: (typeof SKY_CULTURES_DATA.cultures)[number]['sections'];
}) {
  return (
    <View style={styles.detailSections}>
      {sections.map((section) => {
        const heading = chinese ? (section.headingZh || section.heading) : section.heading;
        const sKey = `sec-${section.heading || 'lead'}`;
        return (
          <View key={sKey} style={styles.sectionBlock}>
            {heading ? <Text style={styles.sectionHeading}>{heading}</Text> : null}
            {section.blocks.map((block) => {
              if (block.type === 'paragraph' && 'text' in block && typeof block.text === 'string') {
                const text = chinese ? (block.textZh || block.text) : block.text;
                const pKey = `p-${sKey}-${block.text.length}-${block.text.slice(0, 8)}`;
                return (
                  <Text key={pKey} style={styles.sectionParagraph}>
                    {text}
                  </Text>
                );
              }
              if (block.type === 'image' && 'image' in block && typeof block.image === 'string') {
                const caption = chinese ? (block.captionZh || block.caption) : block.caption;
                const imgKey = `img-${sKey}-${block.image}`;
                return (
                  <View key={imgKey} style={styles.imageBlock}>
                    <View style={styles.imageContainer}>
                      <Text style={styles.imagePlaceholderText}>
                        [插图:
                        {block.image}
                        ]
                      </Text>
                    </View>
                    {caption ? <Text style={styles.imageCaption}>{caption}</Text> : null}
                  </View>
                );
              }
              return null;
            })}
          </View>
        );
      })}
    </View>
  );
}

function cultureThumbnailUri(culture: (typeof SKY_CULTURES_DATA.cultures)[number]): string | undefined {
  if (!culture.thumbnail || Platform.OS !== 'android')
    return undefined;
  return `asset:/stellar/data/skycultures/${culture.id}/${culture.thumbnail}`;
}

function GlossaryDetail({
  culture,
  currentCulture,
  onBack,
  onClose,
  onSelect,
}: {
  culture: (typeof SKY_CULTURES_DATA.cultures)[number];
  currentCulture: string;
  onBack: () => void;
  onClose: () => void;
  onSelect: (id: string, target?: string | null) => void;
}) {
  const chinese = getLanguage() === 'zh';
  const isUsing = culture.id === currentCulture;

  return (
    <View style={styles.glossaryDetailScreen} testID={`deep-space-glossary-detail-${culture.id}`}>
      <View style={styles.glossaryDetailHeader}>
        <Pressable
          accessibilityLabel="返回列表"
          accessibilityRole="button"
          onPress={onBack}
          style={styles.glossaryDetailHeaderButton}
          testID="deep-space-glossary-back-to-list"
        >
          <Text style={styles.glossaryDetailBack}>‹</Text>
        </Pressable>
        <Text style={styles.glossaryDetailHeaderTitle}>星空述语</Text>
        <Pressable
          accessibilityLabel={translate('deep_space.back')}
          accessibilityRole="button"
          onPress={onClose}
          style={styles.glossaryDetailHeaderButton}
        >
          <CloseIcon />
        </Pressable>
      </View>
      <View style={styles.glossaryDetailPanel}>
        <View style={styles.glossaryDetailHandle} />
        <ScrollView bounces={false} contentContainerStyle={styles.glossaryDetailScroll}>
          <GlossaryHero
            chinese={chinese}
            culture={culture}
            isUsing={isUsing}
            onSelect={onSelect}
          />
          <GlossarySections chinese={chinese} sections={culture.sections} />
        </ScrollView>
      </View>
    </View>
  );
}

function GlossaryCultureCard({
  chinese,
  culture,
  current,
  onPress,
}: {
  chinese: boolean;
  culture: (typeof SKY_CULTURES_DATA.cultures)[number];
  current: boolean;
  onPress: () => void;
}) {
  const [showImage, setShowImage] = React.useState(true);
  const title = chinese ? (culture.titleZh ?? culture.title) : culture.title;
  const intro = chinese ? (culture.introZh ?? culture.intro) : culture.intro;
  const thumbnail = cultureThumbnailUri(culture);

  return (
    <Pressable
      accessibilityLabel={title}
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.glossaryReferenceCard, current && styles.glossaryReferenceCardActive]}
      testID={`deep-space-glossary-item-${culture.id}`}
    >
      {thumbnail && showImage && (
        <Image
          onError={() => setShowImage(false)}
          resizeMode="cover"
          source={{ uri: thumbnail }}
          style={styles.glossaryReferenceImage}
          testID={`deep-space-glossary-image-${culture.id}`}
        />
      )}
      <View style={styles.glossaryReferenceCardText}>
        <Text style={styles.glossaryReferenceTitle}>{title}</Text>
        <Text numberOfLines={3} style={styles.glossaryReferenceIntro}>{intro}</Text>
      </View>
    </Pressable>
  );
}

function GlossaryPanel({
  currentCulture,
  onClose,
  onPreviewCulture,
  onSelect,
}: {
  currentCulture: string;
  onClose: () => void;
  onPreviewCulture: (id: string) => void;
  onSelect: (id: string, target?: string | null) => void;
}) {
  const chinese = getLanguage() === 'zh';
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const detailCulture = detailId ? SKY_CULTURES_DATA.cultures.find(culture => culture.id === detailId) : null;

  const openDetail = (id: string) => {
    setDetailId(id);
    // Browsing previews the culture but deliberately keeps the current view.
    onPreviewCulture(id);
  };

  if (detailCulture) {
    return (
      <Modal animationType="none" onRequestClose={onClose} transparent visible>
        <GlossaryDetail
          culture={detailCulture}
          currentCulture={currentCulture}
          onBack={() => setDetailId(null)}
          onClose={onClose}
          onSelect={onSelect}
        />
      </Modal>
    );
  }

  return (
    <Modal animationType="none" onRequestClose={onClose} transparent visible>
      <View style={styles.glossaryScreen} testID="deep-space-glossary-panel">
        <View style={styles.glossaryHeader}>
          <Pressable
            accessibilityLabel={translate('deep_space.back')}
            accessibilityRole="button"
            onPress={onClose}
            style={styles.glossaryHeaderButton}
            testID="deep-space-glossary-close"
          >
            <Text style={styles.glossaryHeaderBack}>‹</Text>
          </Pressable>
          <Text style={styles.glossaryHeaderTitle}>星空述语</Text>
          <View style={styles.glossaryHeaderButton} />
        </View>
        <ScrollView bounces={false} contentContainerStyle={styles.glossaryListContent}>
          {SKY_CULTURES_DATA.cultures.map(culture => (
            <GlossaryCultureCard
              chinese={chinese}
              culture={culture}
              current={culture.id === currentCulture}
              key={culture.id}
              onPress={() => openDetail(culture.id)}
            />
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

function ToolsPanel({
  fieldOfViewActive,
  onApplyFieldOfView,
  onClearFieldOfView,
  onClose,
  onGoto,
}: {
  fieldOfViewActive: boolean;
  onApplyFieldOfView: (input: FieldOfViewInput) => void;
  onClearFieldOfView: () => void;
  onClose: () => void;
  onGoto: (raHours: number, decDeg: number) => void;
}) {
  const [activeTool, setActiveTool] = React.useState<'home' | 'telescope' | 'fov'>('home');
  const backButton = (
    <Pressable accessibilityLabel="返回观测工具" accessibilityRole="button" onPress={() => setActiveTool('home')} style={styles.featureClose}>
      <Text style={styles.toolBack}>‹</Text>
    </Pressable>
  );

  if (activeTool === 'telescope') {
    return (
      <FeatureSheet headerLeft={backButton} onClose={onClose} testID="deep-space-telescope-panel" title="望远镜控制">
        <TelescopeControlPanel onGoto={onGoto} />
      </FeatureSheet>
    );
  }
  if (activeTool === 'fov') {
    return (
      <FeatureSheet headerLeft={backButton} onClose={onClose} testID="deep-space-fov-panel" title="视场模拟">
        <FieldOfViewPanel
          onApply={(input) => {
            onApplyFieldOfView(input);
            onClose();
          }}
        />
      </FeatureSheet>
    );
  }
  return (
    <FeatureSheet onClose={onClose} testID="deep-space-tools-panel" title="观测工具">
      <Pressable accessibilityLabel="望远镜控制" accessibilityRole="button" onPress={() => setActiveTool('telescope')} style={styles.featureRow} testID="deep-space-tools-telescope">
        <View style={styles.featureRowText}>
          <Text style={styles.featureRowLabel}>望远镜控制</Text>
          <Text style={styles.featureRowHint}>按赤经和赤纬控制星图指向</Text>
        </View>
        <Text style={styles.featureSelected}>›</Text>
      </Pressable>
      <Pressable accessibilityLabel="视场模拟" accessibilityRole="button" onPress={() => setActiveTool('fov')} style={styles.featureRow} testID="deep-space-tools-fov">
        <View style={styles.featureRowText}>
          <Text style={styles.featureRowLabel}>视场模拟</Text>
          <Text style={styles.featureRowHint}>按焦距和传感器尺寸生成取景框</Text>
        </View>
        <Text style={styles.featureSelected}>›</Text>
      </Pressable>
      {fieldOfViewActive && (
        <Pressable accessibilityLabel="关闭视场模拟" accessibilityRole="button" onPress={onClearFieldOfView} style={styles.featureRow} testID="deep-space-tools-fov-clear">
          <Text style={styles.featureRowLabel}>关闭视场模拟</Text>
          <Text style={styles.featureSelected}>×</Text>
        </Pressable>
      )}
    </FeatureSheet>
  );
}

function SettingsPanel({ activeCity, onClose, onSelect }: { activeCity: string; onClose: () => void; onSelect: (city: typeof OBSERVER_CITIES[number]) => void }) {
  return (
    <FeatureSheet onClose={onClose} testID="deep-space-settings-panel" title="设置">
      <Text style={styles.featureRowHint}>观测地点</Text>
      {OBSERVER_CITIES.map(city => (
        <Pressable
          accessibilityLabel={city.name}
          accessibilityRole="button"
          accessibilityState={{ selected: city.name === activeCity }}
          key={city.name}
          onPress={() => onSelect(city)}
          style={styles.featureRow}
          testID={`deep-space-settings-location-${city.name}`}
        >
          <View style={styles.featureRowText}>
            <Text style={styles.featureRowLabel}>{city.name}</Text>
            <Text style={styles.featureRowHint}>{`${city.latitudeDeg.toFixed(2)}°, ${city.longitudeDeg.toFixed(2)}°`}</Text>
          </View>
          {city.name === activeCity && <Text style={styles.featureSelected}>✓</Text>}
        </Pressable>
      ))}
    </FeatureSheet>
  );
}

function ReferenceSearchSheet({ error, onChange, onClose, onSubmit, query }: ReferenceSearchSheetProps) {
  return (
    <View testID="deep-space-reference-search-sheet" style={styles.searchOverlay}>
      <Pressable accessibilityLabel={translate('deep_space.search')} accessibilityRole="button" onPress={onClose} style={styles.searchScrim} />
      <View style={styles.searchSheet}>
        <View style={styles.searchBar}>
          <Pressable accessibilityLabel={translate('deep_space.menu')} accessibilityRole="button" onPress={onClose} style={styles.searchBack}>
            <Text style={styles.searchBackText}>‹</Text>
          </Pressable>
          <TextInput
            accessibilityLabel={translate('deep_space.search')}
            autoFocus
            onChangeText={onChange}
            onSubmitEditing={onSubmit}
            placeholder={translate('deep_space.search_placeholder')}
            placeholderTextColor={OVERLAY.muted}
            returnKeyType="search"
            style={styles.searchInput}
            testID="deep-space-map-search-input"
            value={query}
          />
          <Pressable accessibilityLabel={translate('deep_space.search')} accessibilityRole="button" onPress={onSubmit} style={styles.searchSubmit} testID="deep-space-map-search-submit">
            <SearchIcon color={OVERLAY.text} size={24} />
          </Pressable>
        </View>
        {error && (
          <Text testID="deep-space-map-search-error" style={styles.searchError}>
            {translate('deep_space.search_not_found')}
          </Text>
        )}
      </View>
    </View>
  );
}

function Compass({ azimuthDeg }: { azimuthDeg: number }) {
  return (
    <View testID="deep-space-reference-compass" style={styles.compass} pointerEvents="none">
      <View testID="deep-space-reference-compass-rose" style={[styles.compassRose, { transform: [{ rotate: `-${azimuthDeg}deg` }] }]}>
        <Svg height={84} viewBox="0 0 84 84" width={84}>
          <Circle cx={42} cy={42} fill="rgba(20, 22, 25, 0.46)" r={34} stroke="rgba(255,255,255,0.72)" strokeWidth={1.5} />
          <Line stroke="rgba(255,255,255,0.8)" strokeWidth={1.5} x1={42} x2={42} y1={10} y2={74} />
          <Line stroke="rgba(255,255,255,0.8)" strokeWidth={1.5} x1={10} x2={74} y1={42} y2={42} />
          <Polygon fill="#F4F4F4" points="42,14 48,42 42,50 36,42" />
          <Polygon fill="#DA665A" points="42,70 48,42 42,34 36,42" />
        </Svg>
        <Text style={[styles.compassLabel, styles.compassNorth]}>北</Text>
        <Text style={[styles.compassLabel, styles.compassWest]}>西</Text>
        <Text style={[styles.compassLabel, styles.compassEast]}>东</Text>
      </View>
    </View>
  );
}

function TimeControl({ clock, onReturnToNow }: { clock: Date; onReturnToNow: () => void }) {
  const hours = `${clock.getHours()}`.padStart(2, '0');
  const minutes = `${clock.getMinutes()}`.padStart(2, '0');
  const formattedTime = `${hours}:${minutes}`;

  return (
    <View testID="deep-space-reference-time" style={styles.timeControl}>
      <Pressable
        accessibilityLabel={translate('deep_space.return_to_now')}
        accessibilityRole="button"
        onPress={onReturnToNow}
        style={styles.historyButton}
      >
        <HistoryIcon />
      </Pressable>
      <Text style={styles.timeText}>{formattedTime}</Text>
    </View>
  );
}

function MenuIcon() {
  return (
    <Svg height={31} viewBox="0 0 32 32" width={31}>
      <Line stroke={OVERLAY.text} strokeLinecap="round" strokeWidth={2.5} x1={6} x2={26} y1={9} y2={9} />
      <Line stroke={OVERLAY.text} strokeLinecap="round" strokeWidth={2.5} x1={6} x2={26} y1={16} y2={16} />
      <Line stroke={OVERLAY.text} strokeLinecap="round" strokeWidth={2.5} x1={6} x2={26} y1={23} y2={23} />
    </Svg>
  );
}

function SearchIcon({ color = OVERLAY.text, size = 31 }: { color?: string; size?: number }) {
  return (
    <Svg height={size} viewBox="0 0 32 32" width={size}>
      <Circle cx={14} cy={14} fill="none" r={8} stroke={color} strokeWidth={2.5} />
      <Line stroke={color} strokeLinecap="round" strokeWidth={2.5} x1={20} x2={27} y1={20} y2={27} />
    </Svg>
  );
}

function LayersIcon() {
  return (
    <Svg height={35} viewBox="0 0 36 36" width={35}>
      <Path d="M7 11 18 5l11 6-11 6z" fill="rgba(255,255,255,0.9)" />
      <Path d="m9 17 9 5 9-5" fill="none" stroke="rgba(255,255,255,0.86)" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} />
      <Path d="m9 23 9 5 9-5" fill="none" stroke="rgba(255,255,255,0.86)" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} />
    </Svg>
  );
}

function GridIcon() {
  return (
    <Svg height={22} viewBox="0 0 24 24" width={22}>
      <Rect fill={OVERLAY.text} height={3.6} rx={0.9} width={3.6} x={4} y={4} />
      <Rect fill={OVERLAY.text} height={3.6} rx={0.9} width={3.6} x={10.2} y={4} />
      <Rect fill={OVERLAY.text} height={3.6} rx={0.9} width={3.6} x={16.4} y={4} />
      <Rect fill={OVERLAY.text} height={3.6} rx={0.9} width={3.6} x={4} y={10.2} />
      <Rect fill={OVERLAY.text} height={3.6} rx={0.9} width={3.6} x={10.2} y={10.2} />
      <Rect fill={OVERLAY.text} height={3.6} rx={0.9} width={3.6} x={16.4} y={10.2} />
      <Rect fill={OVERLAY.text} height={3.6} rx={0.9} width={3.6} x={4} y={16.4} />
      <Rect fill={OVERLAY.text} height={3.6} rx={0.9} width={3.6} x={10.2} y={16.4} />
      <Rect fill={OVERLAY.text} height={3.6} rx={0.9} width={3.6} x={16.4} y={16.4} />
    </Svg>
  );
}

function GridLinesIcon({ active }: { active: boolean }) {
  const color = active ? '#FFFFFF' : 'rgba(255,255,255,0.44)';
  return (
    <Svg height={46} viewBox="0 0 48 48" width={46}>
      <Circle cx={24} cy={24} fill="none" r={16} stroke={color} strokeWidth={1.5} />
      <Path d="M8 24 C 13 18, 35 18, 40 24" fill="none" stroke={color} strokeWidth={1.4} />
      <Path d="M8 24 C 13 30, 35 30, 40 24" fill="none" opacity={0.55} stroke={color} strokeWidth={1.2} />
      <Path d="M24 8 C 15 14, 15 34, 24 40" fill="none" stroke={color} strokeWidth={1.4} />
      <Path d="M24 8 C 33 14, 33 34, 24 40" fill="none" stroke={color} strokeWidth={1.4} />
      <Line stroke={color} strokeWidth={1.4} x1={24} x2={24} y1={8} y2={40} />
      <Circle cx={24} cy={8} fill={color} r={1.6} />
      <Circle cx={24} cy={40} fill={color} r={1.6} />
      <Circle cx={24} cy={24} fill={color} r={1.8} />
    </Svg>
  );
}

function ConstellationIcon({ active }: { active: boolean }) {
  const color = active ? '#FFFFFF' : 'rgba(255,255,255,0.44)';
  return (
    <Svg height={46} viewBox="0 0 48 48" width={46}>
      <Path
        d="M12 20 L13 32 L22 34 L24 23 Z M24 23 L31 22 L37 26 L42 33"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.4}
      />
      <Circle cx={12} cy={20} fill={color} r={2.4} />
      <Circle cx={13} cy={32} fill={color} r={2.2} />
      <Circle cx={22} cy={34} fill={color} r={2.0} />
      <Circle cx={24} cy={23} fill={color} r={2.2} />
      <Circle cx={31} cy={22} fill={color} r={2.0} />
      <Circle cx={37} cy={26} fill={color} r={2.2} />
      <Circle cx={42} cy={33} fill={color} r={2.5} />
      <Circle cx={12} cy={20} fill="none" opacity={0.35} r={4.5} stroke={color} strokeWidth={1} />
      <Circle cx={42} cy={33} fill="none" opacity={0.35} r={4.5} stroke={color} strokeWidth={1} />
      <Circle cx={28} cy={13} fill={color} opacity={0.4} r={1.2} />
    </Svg>
  );
}

function LandscapeIcon({ active }: { active: boolean }) {
  const color = active ? '#FFFFFF' : 'rgba(255,255,255,0.44)';
  return (
    <Svg height={46} viewBox="0 0 48 48" width={46}>
      <Path
        d="M6 34 L15 24 L23 31 L32 19 L42 34"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
      />
      <Line stroke={color} strokeLinecap="round" strokeWidth={1.5} x1={5} x2={43} y1={36} y2={36} />
      <Path d="M30 19 A2.5 2.5 0 0 1 34 19" fill="none" stroke={color} strokeWidth={1.3} />
      <Path d="M12 36 L12 30 M10 33 L12 30 L14 33 M10.5 31.5 L12 29 L13.5 31.5" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} />
      <Path d="M21 36 L21 32 M19.5 34.5 L21 32 L22.5 34.5" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} />
      <Path d="M15 12 A 4.5 4.5 0 0 0 19 16.5 A 5.5 5.5 0 0 1 15 12 Z" fill={color} opacity={0.85} />
    </Svg>
  );
}

function AtmosphereIcon({ active }: { active: boolean }) {
  const color = active ? '#FFFFFF' : 'rgba(255,255,255,0.44)';
  return (
    <Svg height={46} viewBox="0 0 48 48" width={46}>
      <Line stroke={color} strokeLinecap="round" strokeWidth={1.5} x1={6} x2={42} y1={36} y2={36} />
      <Path d="M18 36 A6 6 0 0 1 30 36 Z" fill={color} opacity={0.9} />
      <Line stroke={color} strokeLinecap="round" strokeWidth={1.3} x1={24} x2={24} y1={26} y2={22} />
      <Line stroke={color} strokeLinecap="round" strokeWidth={1.3} x1={17} x2={15} y1={28} y2={25} />
      <Line stroke={color} strokeLinecap="round" strokeWidth={1.3} x1={31} x2={33} y1={28} y2={25} />
      <Path d="M8 36 C 10 16, 38 16, 40 36" fill="none" opacity={0.4} stroke={color} strokeDasharray="3 3" strokeWidth={1.3} />
      <Path d="M11 36 C 13 21, 35 21, 37 36" fill="none" opacity={0.75} stroke={color} strokeWidth={1.4} />
      <Path d="M26 32 C 28 30, 33 30, 37 32" fill="none" opacity={0.65} stroke={color} strokeLinecap="round" strokeWidth={1.3} />
    </Svg>
  );
}

function LabelsIcon({ active }: { active: boolean }) {
  const color = active ? '#FFFFFF' : 'rgba(255,255,255,0.44)';
  return (
    <Svg height={46} viewBox="0 0 48 48" width={46}>
      <Circle cx={13} cy={30} fill={color} r={2.2} />
      <Line opacity={0.7} stroke={color} strokeLinecap="round" strokeWidth={1.2} x1={13} x2={13} y1={24} y2={36} />
      <Line opacity={0.7} stroke={color} strokeLinecap="round" strokeWidth={1.2} x1={7} x2={19} y1={30} y2={30} />
      <Path d="M15 28 L21 21 L26 21" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.4} />
      <Rect fill="none" height={16} rx={3.5} stroke={color} strokeWidth={1.4} width={18} x={25} y={11} />
      <Path d="M29 23 L31.5 15.5 L34 23 M29.8 21 L33.2 21" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} />
      <Path d="M37 20 A 1.8 1.8 0 1 0 39.5 22 L39.5 18" fill="none" stroke={color} strokeLinecap="round" strokeWidth={1.1} />
    </Svg>
  );
}

function NightModeIcon({ active }: { active: boolean }) {
  const color = active ? '#FF5C5C' : 'rgba(255,255,255,0.44)';
  return (
    <Svg height={46} viewBox="0 0 48 48" width={46}>
      <Path d="M7 24 C 12 16, 26 16, 31 24 C 26 32, 12 32, 7 24 Z" fill="none" stroke={color} strokeLinejoin="round" strokeWidth={1.5} />
      <Circle cx={19} cy={24} fill="none" r={4.5} stroke={color} strokeWidth={1.3} />
      <Circle cx={19} cy={24} fill={color} r={2} />
      <Path d="M33 13 A 6 6 0 0 1 39 19 A 7 7 0 0 0 33 13 Z" fill={color} opacity={0.85} />
    </Svg>
  );
}

function QuickControlIcon({ active, kind }: { active: boolean; kind: 'grid-lines' | 'constellation' | 'landscape' | 'atmosphere' | 'labels' | 'night' }) {
  switch (kind) {
    case 'grid-lines':
      return <GridLinesIcon active={active} />;
    case 'constellation':
      return <ConstellationIcon active={active} />;
    case 'landscape':
      return <LandscapeIcon active={active} />;
    case 'atmosphere':
      return <AtmosphereIcon active={active} />;
    case 'labels':
      return <LabelsIcon active={active} />;
    case 'night':
      return <NightModeIcon active={active} />;
  }
}

function CloseIcon() {
  return (
    <Svg height={26} viewBox="0 0 26 26" width={26}>
      <Line stroke={OVERLAY.text} strokeLinecap="round" strokeWidth={2} x1={6} x2={20} y1={6} y2={20} />
      <Line stroke={OVERLAY.text} strokeLinecap="round" strokeWidth={2} x1={20} x2={6} y1={6} y2={20} />
    </Svg>
  );
}

function GlossaryIcon() {
  return (
    <Svg height={26} viewBox="0 0 26 26" width={26}>
      <Path d="M4 20 20 4" fill="none" stroke={OVERLAY.text} strokeLinecap="round" strokeWidth={1.8} />
      <Polygon fill={OVERLAY.text} points="20,4 21,10 15,9" />
      <Path d="M6 6.5 7.6 8.1M9 4l0 3M4.5 9l3 0" fill="none" stroke={OVERLAY.text} strokeLinecap="round" strokeWidth={1.6} />
    </Svg>
  );
}

function CalendarIcon() {
  return (
    <Svg height={26} viewBox="0 0 26 26" width={26}>
      <Path d="M4.5 6.5h17v15h-17z" fill="none" stroke={OVERLAY.text} strokeLinejoin="round" strokeWidth={1.8} />
      <Line stroke={OVERLAY.text} strokeLinecap="round" strokeWidth={1.8} x1={8} x2={8} y1={3.5} y2={7.5} />
      <Line stroke={OVERLAY.text} strokeLinecap="round" strokeWidth={1.8} x1={18} x2={18} y1={3.5} y2={7.5} />
      <Circle cx={13} cy={15} fill={OVERLAY.text} r={2.6} />
    </Svg>
  );
}

function ObservationIcon() {
  return (
    <Svg height={26} viewBox="0 0 26 26" width={26}>
      <Path d="M4 8V4h4M22 8V4h-4M4 18v4h4M22 18v4h-4" fill="none" stroke={OVERLAY.text} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} />
      <Circle cx={13} cy={13} fill="none" r={4.6} stroke={OVERLAY.text} strokeWidth={1.8} />
      <Circle cx={13} cy={13} fill={OVERLAY.text} r={1.8} />
    </Svg>
  );
}

function SettingsIcon() {
  return (
    <Svg height={26} viewBox="0 0 26 26" width={26}>
      <Circle cx={13} cy={13} fill="none" r={3.4} stroke={OVERLAY.text} strokeWidth={1.8} />
      <Path d="M13 3v3M13 20v3M3 13h3M20 13h3M6 6l2.1 2.1M17.9 17.9 20 20M20 6l-2.1 2.1M8.1 17.9 6 20" fill="none" stroke={OVERLAY.text} strokeLinecap="round" strokeWidth={1.8} />
    </Svg>
  );
}

function HistoryIcon() {
  return (
    <Svg height={29} viewBox="0 0 32 32" width={29}>
      <Path d="M9 12V6l-5 5 5 5v-4a9 9 0 1 1-1 12" fill="none" stroke={OVERLAY.text} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#05070B',
    flex: 1,
  },
  webView: {
    backgroundColor: 'transparent',
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    paddingHorizontal: 18,
  },
  topControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  iconButton: {
    alignItems: 'center',
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  horizonBearing: {
    bottom: 142,
    left: 44,
    position: 'absolute',
  },
  horizonBearingText: {
    color: '#D9413C',
    fontSize: 18,
    fontWeight: '700',
  },
  bottomControls: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  leftQuickBar: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 8,
  },
  gridQuickBar: {
    alignItems: 'flex-start',
    position: 'relative',
  },
  gridQuickButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(20, 24, 30, 0.85)',
    borderColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 24,
    borderWidth: 1,
    elevation: 6,
    height: 48,
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    width: 48,
  },
  gridQuickButtonActive: {
    backgroundColor: 'rgba(43, 130, 246, 0.85)',
    borderColor: 'rgba(167, 206, 255, 0.75)',
  },
  gridQuickMenu: {
    backgroundColor: 'rgba(18, 22, 28, 0.90)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 22,
    borderWidth: 1,
    bottom: 58,
    elevation: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    left: -10,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 12,
    position: 'absolute',
    shadowColor: '#000000',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 20,
    width: 356,
  },
  gridQuickMenuHighlight: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    height: 1,
    left: 20,
    position: 'absolute',
    right: 20,
    top: 0,
  },
  quickControlButton: {
    alignItems: 'center',
    height: 88,
    justifyContent: 'center',
    paddingHorizontal: 3,
    paddingVertical: 3,
    width: '33.333333%',
  },
  quickControlButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
  quickControlCell: {
    alignItems: 'center',
    borderRadius: 14,
    height: '100%',
    justifyContent: 'center',
    width: '100%',
  },
  quickIconWrapper: {
    alignItems: 'center',
    height: 48,
    justifyContent: 'center',
    position: 'relative',
    width: 48,
  },
  progressRingWrapper: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressRingSvg: {
    transform: [{ rotate: '-90deg' }],
  },
  quickControlCellActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: StyleSheet.hairlineWidth,
  },
  quickControlCellNightActive: {
    backgroundColor: 'rgba(235, 60, 60, 0.16)',
    borderColor: 'rgba(255, 90, 90, 0.35)',
    borderWidth: StyleSheet.hairlineWidth,
  },
  quickControlLabel: {
    color: 'rgba(255, 255, 255, 0.46)',
    fontSize: 13,
    fontWeight: '400',
    letterSpacing: 0.3,
    marginTop: 5,
  },
  quickControlLabelActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  quickControlLabelNightActive: {
    color: '#FF6B6B',
    fontWeight: '600',
  },
  quickDetailOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 72,
    paddingHorizontal: 16,
    zIndex: 99,
  },
  quickDetailScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  quickDetailCard: {
    backgroundColor: 'rgba(20, 24, 30, 0.95)',
    borderColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 24,
    borderWidth: 1,
    elevation: 20,
    maxWidth: 440,
    overflow: 'hidden',
    paddingBottom: 8,
    shadowColor: '#000000',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    width: '100%',
  },
  quickDetailHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
  },
  quickDetailTitleBlock: {
    flex: 1,
    paddingRight: 12,
  },
  quickDetailTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  quickDetailSubtitle: {
    color: 'rgba(255, 255, 255, 0.52)',
    fontSize: 12,
    marginTop: 3,
  },
  quickDetailClose: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  quickDetailDivider: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    height: 1,
    marginHorizontal: 16,
  },
  quickDetailList: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  quickDetailRow: {
    alignItems: 'center',
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  quickDetailRowText: {
    flex: 1,
    paddingRight: 16,
  },
  quickDetailRowLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  quickDetailRowHint: {
    color: 'rgba(255, 255, 255, 0.48)',
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  nightModeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(145, 0, 0, 0.48)',
  },
  compass: {
    alignItems: 'center',
    height: 92,
    justifyContent: 'center',
    marginLeft: 12,
  },
  compassRose: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  compassLabel: {
    color: OVERLAY.text,
    fontSize: 10,
    fontWeight: '700',
    position: 'absolute',
  },
  compassNorth: {
    top: 0,
  },
  compassWest: {
    left: -4,
    top: 38,
  },
  compassEast: {
    right: -4,
    top: 38,
  },
  timeControl: {
    alignItems: 'flex-end',
    minWidth: 78,
  },
  historyButton: {
    alignItems: 'center',
    backgroundColor: OVERLAY.control,
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    marginBottom: 8,
    width: 44,
  },
  timeText: {
    color: OVERLAY.text,
    fontSize: 24,
    fontVariant: ['tabular-nums'],
    fontWeight: '300',
    letterSpacing: 0.4,
  },
  restoreCultureFab: {
    alignItems: 'center',
    backgroundColor: 'rgba(38, 40, 44, 0.88)',
    borderColor: OVERLAY.accent,
    borderRadius: 24,
    borderWidth: 1.5,
    elevation: 6,
    height: 48,
    justifyContent: 'center',
    position: 'absolute',
    right: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    width: 48,
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    padding: 24,
  },
  dialogCard: {
    backgroundColor: OVERLAY.drawer,
    borderColor: OVERLAY.hairline,
    borderRadius: 14,
    borderWidth: 1,
    padding: 22,
    width: '85%',
  },
  dialogTitle: {
    color: OVERLAY.text,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 8,
  },
  dialogMessage: {
    color: OVERLAY.muted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  dialogButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  dialogButton: {
    borderRadius: 8,
    marginLeft: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  dialogButtonPrimary: {
    backgroundColor: OVERLAY.accent,
  },
  dialogButtonTextCancel: {
    color: OVERLAY.muted,
    fontSize: 15,
    fontWeight: '600',
  },
  dialogButtonTextPrimary: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  layerPanel: {
    backgroundColor: 'rgba(30, 32, 36, 0.94)',
    borderColor: OVERLAY.hairline,
    borderRadius: 14,
    borderWidth: 1,
    bottom: 102,
    left: 18,
    position: 'absolute',
    width: 208,
  },
  layerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: 14,
  },
  layerLabel: {
    color: OVERLAY.text,
    fontSize: 14,
  },
  layerSwitch: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 14,
    height: 28,
    justifyContent: 'center',
    paddingHorizontal: 3,
    width: 48,
  },
  layerSwitchActive: {
    backgroundColor: 'rgba(194, 218, 255, 0.75)',
  },
  layerKnob: {
    backgroundColor: '#FFFFFF',
    borderRadius: 11,
    height: 22,
    width: 22,
  },
  layerKnobActive: {
    alignSelf: 'flex-end',
  },
  drawerOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
  },
  drawerScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  drawer: {
    backgroundColor: OVERLAY.drawer,
    height: '100%',
    width: '54%',
  },
  drawerHeader: {
    alignItems: 'center',
    backgroundColor: OVERLAY.drawerHeader,
    flexDirection: 'row',
    height: 106,
    paddingHorizontal: 14,
  },
  drawerBack: {
    alignItems: 'center',
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  drawerRowIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    width: 26,
  },
  drawerTitle: {
    color: OVERLAY.text,
    flex: 1,
    fontSize: 23,
    fontWeight: '500',
    marginRight: 48,
    textAlign: 'center',
  },
  drawerRow: {
    alignItems: 'center',
    borderBottomColor: OVERLAY.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 64,
    paddingHorizontal: 22,
  },
  drawerRowLabel: {
    color: OVERLAY.text,
    flex: 1,
    fontSize: 16,
  },
  drawerChevron: {
    color: OVERLAY.muted,
    fontSize: 28,
  },
  searchOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  featureOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  sheetTopScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  featureSheetTall: {
    maxHeight: '82%',
  },
  featureScrollContent: {
    paddingBottom: 40,
  },
  glossaryRegion: {
    color: OVERLAY.muted,
    fontSize: 22,
    paddingBottom: 8,
    paddingTop: 22,
    textAlign: 'center',
  },
  glossaryCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'transparent',
    borderRadius: 12,
    borderWidth: 1.5,
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 16,
  },
  glossaryCardActive: {
    borderColor: OVERLAY.accent,
  },
  glossaryCardContent: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  glossaryCardText: {
    flex: 1,
    paddingRight: 8,
  },
  glossaryThumbWrapper: {
    alignItems: 'center',
    height: 56,
    justifyContent: 'center',
    marginLeft: 8,
    width: 56,
  },
  glossaryThumbPlaceholder: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  glossaryThumbText: {
    color: OVERLAY.muted,
    fontSize: 22,
  },
  glossaryTitle: {
    color: OVERLAY.text,
    fontSize: 19,
    fontWeight: '700',
    marginBottom: 6,
  },
  glossaryIntro: {
    color: OVERLAY.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  // 详情页样式
  detailBackBtn: {
    alignItems: 'center',
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  detailBackArrow: {
    color: OVERLAY.text,
    fontSize: 26,
    fontWeight: '300',
  },
  detailHero: {
    alignItems: 'center',
    borderBottomColor: OVERLAY.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  detailHeroText: {
    flex: 1,
    paddingRight: 10,
  },
  detailTitle: {
    color: OVERLAY.text,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  detailRegion: {
    color: OVERLAY.purple,
    fontSize: 13,
    fontWeight: '600',
  },
  detailActions: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  detailNavBtn: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    marginRight: 8,
    width: 36,
  },
  detailNavText: {
    color: OVERLAY.text,
    fontSize: 20,
    fontWeight: '400',
  },
  applyButton: {
    backgroundColor: OVERLAY.accent,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  applyButtonDisabled: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  applyButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  applyButtonTextDisabled: {
    color: OVERLAY.muted,
  },
  glossaryScreen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#202326',
    zIndex: 20,
  },
  glossaryHeader: {
    alignItems: 'center',
    backgroundColor: '#303337',
    flexDirection: 'row',
    height: 72,
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  glossaryHeaderButton: {
    alignItems: 'center',
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  glossaryHeaderBack: {
    color: '#FFFFFF',
    fontSize: 42,
    fontWeight: '200',
    lineHeight: 44,
  },
  glossaryHeaderTitle: {
    color: '#FFFFFF',
    fontSize: 23,
    fontWeight: '600',
  },
  glossaryListContent: {
    paddingBottom: 28,
    paddingTop: 8,
  },
  glossaryReferenceCard: {
    backgroundColor: '#2D3033',
    borderColor: 'transparent',
    borderRadius: 18,
    borderWidth: 1.5,
    justifyContent: 'center',
    marginHorizontal: 12,
    marginVertical: 7,
    minHeight: 130,
    overflow: 'hidden',
  },
  glossaryReferenceCardActive: {
    backgroundColor: '#30353A',
    borderColor: '#82B2FF',
  },
  glossaryReferenceImage: {
    bottom: 0,
    opacity: 0.32,
    position: 'absolute',
    right: 0,
    top: 0,
    width: '48%',
  },
  glossaryReferenceCardText: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    width: '78%',
  },
  glossaryReferenceTitle: {
    color: '#FFFFFF',
    fontSize: 23,
    fontWeight: '700',
    marginBottom: 7,
  },
  glossaryReferenceIntro: {
    color: 'rgba(255,255,255,0.74)',
    fontSize: 15,
    lineHeight: 22,
  },
  glossaryDetailScreen: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 21,
  },
  glossaryDetailHeader: {
    alignItems: 'center',
    backgroundColor: 'rgba(14, 16, 18, 0.94)',
    flexDirection: 'row',
    height: 72,
    justifyContent: 'space-between',
    left: 0,
    paddingHorizontal: 12,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  glossaryDetailHeaderButton: {
    alignItems: 'center',
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  glossaryDetailHeaderTitle: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '600',
  },
  glossaryDetailBack: {
    color: '#FFFFFF',
    fontSize: 42,
    fontWeight: '200',
    lineHeight: 44,
  },
  glossaryDetailPanel: {
    backgroundColor: '#2A2D30',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '60%',
    minHeight: '42%',
    overflow: 'hidden',
  },
  glossaryDetailHandle: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.42)',
    borderRadius: 2,
    height: 4,
    marginBottom: 5,
    marginTop: 10,
    width: 42,
  },
  glossaryDetailScroll: {
    paddingBottom: 34,
  },
  glossaryDetailHero: {
    alignItems: 'center',
    borderBottomColor: 'rgba(255,255,255,0.12)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  glossaryDetailHeroText: {
    flex: 1,
    paddingRight: 14,
  },
  glossaryDetailTitle: {
    color: '#FFFFFF',
    fontSize: 23,
    fontWeight: '700',
  },
  glossaryDetailRegion: {
    color: '#83B4FF',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 5,
  },
  glossaryUseButton: {
    backgroundColor: '#4F94E8',
    borderRadius: 20,
    minWidth: 70,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  glossaryUseButtonDisabled: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  glossaryUseButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  glossaryUseButtonTextDisabled: {
    color: 'rgba(255,255,255,0.52)',
  },
  detailSections: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  sectionBlock: {
    marginBottom: 16,
  },
  sectionHeading: {
    color: OVERLAY.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 12,
  },
  sectionParagraph: {
    color: OVERLAY.muted,
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 10,
  },
  imageBlock: {
    alignItems: 'center',
    marginVertical: 12,
  },
  imageContainer: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: OVERLAY.hairline,
    borderRadius: 8,
    borderWidth: 1,
    height: 140,
    justifyContent: 'center',
    width: '100%',
  },
  imagePlaceholderText: {
    color: OVERLAY.muted,
    fontSize: 12,
  },
  imageCaption: {
    color: OVERLAY.muted,
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 6,
    textAlign: 'center',
  },
  featureSheet: {
    backgroundColor: OVERLAY.drawer,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 28,
  },
  featureHeader: {
    alignItems: 'center',
    borderBottomColor: OVERLAY.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 62,
    paddingHorizontal: 20,
  },
  featureTitle: {
    color: OVERLAY.text,
    flex: 1,
    fontSize: 19,
    fontWeight: '500',
    textAlign: 'center',
  },
  featureClose: {
    alignItems: 'center',
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  featureValue: {
    color: OVERLAY.text,
    fontSize: 18,
    paddingHorizontal: 20,
    paddingTop: 16,
    textAlign: 'center',
  },
  featureRow: {
    alignItems: 'center',
    borderBottomColor: OVERLAY.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: 20,
  },
  featureRowText: {
    flex: 1,
  },
  featureRowLabel: {
    color: OVERLAY.text,
    fontSize: 16,
  },
  featureRowHint: {
    color: OVERLAY.muted,
    fontSize: 12,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  featureSelected: {
    color: '#83B4FF',
    fontSize: 16,
    fontWeight: '700',
  },
  toolBack: {
    color: OVERLAY.text,
    fontSize: 30,
    fontWeight: '300',
    lineHeight: 32,
  },
  toolSectionTitle: {
    color: OVERLAY.muted,
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  searchScrim: {
    ...StyleSheet.absoluteFillObject,
  },
  searchSheet: {
    backgroundColor: 'rgba(15, 17, 20, 0.96)',
    borderBottomColor: OVERLAY.hairline,
    borderBottomWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  searchBar: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 56,
  },
  searchBack: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  searchBackText: {
    color: OVERLAY.text,
    fontSize: 34,
    fontWeight: '300',
    lineHeight: 36,
  },
  searchInput: {
    color: OVERLAY.text,
    flex: 1,
    fontSize: 18,
    paddingHorizontal: 12,
  },
  searchSubmit: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  searchError: {
    color: OVERLAY.warning,
    fontSize: 13,
    paddingBottom: 12,
    paddingHorizontal: 12,
  },
});
