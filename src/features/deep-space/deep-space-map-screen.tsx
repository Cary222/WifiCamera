import type { FieldOfViewInput } from '@/features/deep-space/tools/field-of-view';
import type { RecentSkyObject } from '@/features/deep-space/tools/recent-sky-objects';
import type { StartTimePolicy } from '@/features/deep-space/tools/use-stellarium-settings';
import type { SelectedCelestialObject, StellariumSkyLayers } from '@/features/stellarium/stellarium-service';
import type { StellariumViewHandle } from '@/features/stellarium/stellarium-view';
import * as React from 'react';
import { Animated, Easing, Image, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Polygon, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import SKY_CULTURES_DATA from '@/assets/stellar/skycultures-full.json';
import { Text } from '@/components/ui';
import { CalendarPanel } from '@/features/deep-space/calendar/calendar-panel';
import { DEFAULT_LANDSCAPE_ID, LANDSCAPES } from '@/features/deep-space/landscape/landscape-catalog';
import { ObjectInfoSheet } from '@/features/deep-space/object-info/object-info-sheet';
import { FieldOfViewOverlay } from '@/features/deep-space/tools/field-of-view-overlay';
import { FieldOfViewPanel } from '@/features/deep-space/tools/field-of-view-panel';
import { addRecentSkyObject, loadRecentSkyObjects } from '@/features/deep-space/tools/recent-sky-objects';
import { parseSkyCoordinateInput } from '@/features/deep-space/tools/sky-coordinate-input';
import { TelescopeControlPanel } from '@/features/deep-space/tools/telescope-control-panel';
import { useCompassFollowing } from '@/features/deep-space/tools/use-compass-following';
import { useObserverLocation } from '@/features/deep-space/tools/use-observer-location';
import { useStellariumSettings } from '@/features/deep-space/tools/use-stellarium-settings';
import { StellariumView } from '@/features/stellarium/stellarium-view';
import { getLanguage, translate } from '@/lib/i18n';
import { storage } from '@/lib/storage';
import { AdvancedSlider } from './ui/advanced-slider';
import { CloseIcon } from './ui/close-icon';
import { showDeepSpaceFeedback } from './ui/deep-space-feedback';
import { OVERLAY } from './ui/deep-space-theme';
import { FeatureSheet } from './ui/feature-sheet';
import { featureSheetStyles } from './ui/feature-sheet-styles';
import { formatLatitudeDMS, formatLongitudeDMS, formatUtcOffset } from './ui/location-format';
import { CityPickerModal, CoordinateInputDialog } from './ui/location-modals';
import { LocationWorldMap } from './ui/location-world-map';

const DEFAULT_SKY_LAYERS: Required<StellariumSkyLayers> = {
  atmosphere: true,
  constellationArt: true,
  constellationBoundaries: false,
  constellationLabels: true,
  constellationLines: true,
  constellationOnlyPointed: false,
  dsoHintsOffset: 0,
  dsoLabels: true,
  landscape: true,
  planetHintsOffset: 0,
  planetLabels: true,
  satelliteHintsOffset: 0,
  satelliteLabels: true,
  starHintsOffset: 0,
  starLabels: true,
};

type LabelHintValues = {
  stars: number;
  planets: number;
  dsos: number;
  satellites: number;
};

const DEFAULT_LABEL_HINTS: LabelHintValues = {
  dsos: 30,
  planets: 30,
  satellites: 30,
  stars: 30,
};

function sliderToMagOffset(value: number): number {
  return Number(((value - 30) / 10).toFixed(2));
}

function hintsOffsetToPatch(key: keyof LabelHintValues, value: number): Partial<StellariumSkyLayers> {
  const visible = value > 0;
  const offset = key === 'dsos'
    ? (value <= 30 ? Number(((value - 30) / 10).toFixed(2)) : Number((((value - 30) / 70) * 12.0).toFixed(2)))
    : sliderToMagOffset(value);
  switch (key) {
    case 'stars':
      return { starHintsOffset: offset, starLabels: visible };
    case 'planets':
      return { planetHintsOffset: offset, planetLabels: visible };
    case 'dsos':
      return { dsoHintsOffset: offset, dsoLabels: visible };
    case 'satellites':
      return { satelliteHintsOffset: offset, satelliteLabels: visible };
  }
}

function resetAllHints(): Partial<StellariumSkyLayers> {
  return {
    dsoHintsOffset: 0,
    dsoLabels: true,
    planetHintsOffset: 0,
    planetLabels: true,
    satelliteHintsOffset: 0,
    satelliteLabels: true,
    starHintsOffset: 0,
    starLabels: true,
  };
}

const DEFAULT_GRID_LINES: Record<'azimuthal' | 'ecliptic' | 'equator' | 'equatorial_j2000' | 'equatorial_jnow' | 'meridian', boolean> = {
  azimuthal: false,
  ecliptic: false,
  equator: false,
  equatorial_j2000: false,
  equatorial_jnow: false,
  meridian: false,
};

type GridLineKey = keyof typeof DEFAULT_GRID_LINES;

/**
 * The atmosphere model's own starting turbidity, read back from a live engine
 * instance. Keep this in sync with the engine rather than picking a round
 * number: seeding anything else changes the sky's colour before the user has
 * touched a single control.
 */
const DEFAULT_TURBIDITY = 0.96;

const OBSERVER_CITIES = [
  { latitudeDeg: 39.9, longitudeDeg: 116.41, name: '北京' },
  { latitudeDeg: 31.23, longitudeDeg: 121.47, name: '上海' },
  { latitudeDeg: 22.54, longitudeDeg: 114.06, name: '深圳' },
  { latitudeDeg: 43.83, longitudeDeg: 87.62, name: '乌鲁木齐' },
];

const REGION_LABELS: Record<string, string> = SKY_CULTURES_DATA.regionsZh;

const BEARING_LABELS = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
const COMPASS_MAJOR_TICKS = Array.from({ length: 12 }, (_, index) => index * 30);
const COMPASS_MINOR_TICKS = Array.from({ length: 60 }, (_, index) => index * 6).filter(angle => angle % 30 !== 0);

function bearingLabel(azimuthDeg: number): string {
  return BEARING_LABELS[Math.round(((azimuthDeg % 360) + 360) % 360 / 45) % 8];
}

function landscapeStepper(activeId: string, onSelect: (id: string) => void) {
  const index = Math.max(0, LANDSCAPES.findIndex(option => option.id === activeId));

  return {
    onStep: (delta: number) => {
      const next = (index + delta + LANDSCAPES.length) % LANDSCAPES.length;
      onSelect(LANDSCAPES[next].id);
    },
    position: `第 ${index + 1} / ${LANDSCAPES.length} 套`,
    value: LANDSCAPES[index]?.titleZh ?? activeId,
  };
}

const BORTLE_LEVELS = [
  'Bortle 1 · 极佳暗空',
  'Bortle 2 · 典型暗空',
  'Bortle 3 · 乡村暗空',
  'Bortle 4 · 乡村过渡',
  'Bortle 5 · 郊区天空',
  'Bortle 6 · 明亮郊区',
  'Bortle 7 · 城郊天空',
  'Bortle 8 · 城市天空',
  'Bortle 9 · 市中心天空',
] as const;

/** User-selected safe default: Bortle 1, the lowest skyglow / best dark sky. */
const DEFAULT_BORTLE_INDEX = 1;

function airQualityStepper(bortleIndex: number, onSelect: (next: number) => void) {
  const index = Math.min(BORTLE_LEVELS.length - 1, Math.max(0, bortleIndex - 1));

  return {
    onStep: (delta: number) => {
      const next = (index + delta + BORTLE_LEVELS.length) % BORTLE_LEVELS.length;
      onSelect(next + 1);
    },
    position: `第 ${index + 1} / ${BORTLE_LEVELS.length} 级`,
    value: BORTLE_LEVELS[index],
  };
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

type DrawerFeature = 'calendar' | 'glossary' | 'settings' | 'tools';

type ReferenceDrawerProps = {
  onClose: () => void;
  onOpen: (feature: DrawerFeature) => void;
};

type ReferenceSearchSheetProps = {
  error: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onSelectRecent: (object: RecentSkyObject) => void;
  onSubmit: () => void;
  query: string;
  recentObjects: RecentSkyObject[];
};

type DrawerFeatureOptions = {
  automaticLocation: boolean;
  currentCulture: string;
  enableAutomaticLocation: () => Promise<void>;
  observer: ReturnType<typeof useObserverLocation>['observer'];
  setCurrentCulture: (id: string) => void;
  setManualCoordinate: ReturnType<typeof useObserverLocation>['setManualCoordinate'];
  setManualObserver: ReturnType<typeof useObserverLocation>['setManualObserver'];
  stellaRef: React.RefObject<StellariumViewHandle | null>;
};

function useDrawerFeature(options: DrawerFeatureOptions) {
  const {
    automaticLocation,
    currentCulture,
    enableAutomaticLocation,
    observer,
    setCurrentCulture,
    setManualCoordinate,
    setManualObserver,
    stellaRef,
  } = options;
  const [active, setActive] = React.useState<DrawerFeature>();
  const [fieldOfView, setFieldOfView] = React.useState<FieldOfViewInput>();
  const [gridLines, setGridLines] = React.useState(DEFAULT_GRID_LINES);
  const [landscapeId, setLandscapeId] = React.useState(DEFAULT_LANDSCAPE_ID);
  // `turbidity` mirrors the engine's own default (measured: 0.96). Seeding a
  // different value here would silently re-tint the sky on first render.
  const [environment, setEnvironment] = React.useState({
    bortleIndex: DEFAULT_BORTLE_INDEX,
    cardinals: true,
    fog: true,
    turbidity: DEFAULT_TURBIDITY,
  });
  const close = () => setActive(undefined);

  const updateGridLines = React.useCallback((patch: Partial<typeof DEFAULT_GRID_LINES>) => {
    setGridLines(prev => ({ ...prev, ...patch }));
    stellaRef.current?.setGridLines?.(patch);
  }, [stellaRef]);

  const selectLandscape = React.useCallback((id: string) => {
    setLandscapeId(id);
    stellaRef.current?.setLandscape?.(id);
  }, [stellaRef]);

  const updateEnvironment = React.useCallback((patch: Partial<typeof environment>) => {
    setEnvironment(prev => ({ ...prev, ...patch }));
    stellaRef.current?.setEnvironment?.(patch);
  }, [stellaRef]);

  return {
    active,
    applyFieldOfView: (input: FieldOfViewInput) => setFieldOfView(input),
    automaticLocation,
    clearFieldOfView: () => setFieldOfView(undefined),
    close,
    currentCulture,
    enableAutomaticLocation,
    environment,
    fieldOfView,
    gridLines,
    landscapeId,
    observer,
    open: (next: DrawerFeature) => setActive(next),
    selectCity: (city: typeof OBSERVER_CITIES[number]) => setManualObserver(city),
    selectLandscape,
    selectSkyCulture: (id: string, target?: string | null) => {
      setCurrentCulture(id);
      stellaRef.current?.setSkyCulture?.(id, target ?? undefined);
      close();
    },
    setManualCoordinate,
    toggleGridLine: (key: GridLineKey) => setGridLines((prev) => {
      const patch = { [key]: !prev[key] } as Partial<typeof DEFAULT_GRID_LINES>;
      stellaRef.current?.setGridLines?.(patch);
      return { ...prev, ...patch };
    }),
    updateEnvironment,
    updateGridLines,
  };
}

function useStellariumDrawerFeature({
  currentCulture,
  setCurrentCulture,
  stellaRef,
}: {
  currentCulture: string;
  setCurrentCulture: (id: string) => void;
  stellaRef: React.RefObject<StellariumViewHandle | null>;
}) {
  const observerLocation = useObserverLocation(stellaRef);

  return useDrawerFeature({
    automaticLocation: observerLocation.automaticLocation,
    currentCulture,
    enableAutomaticLocation: observerLocation.enableAutomaticLocation,
    observer: observerLocation.observer,
    setCurrentCulture,
    setManualCoordinate: observerLocation.setManualCoordinate,
    setManualObserver: observerLocation.setManualObserver,
    stellaRef,
  });
}

type StarMapOverlayControlsProps = {
  azimuthDeg: number;
  clock: Date;
  environment: { bortleIndex: number; cardinals: boolean; fog: boolean; turbidity: number };
  gridLines: typeof DEFAULT_GRID_LINES;
  insets: { bottom: number; top: number };
  isCustomTime?: boolean;
  landscapeId: string;
  nightMode: boolean;
  onCloseTimePanel?: () => void;
  onOpenMenu: () => void;
  onOpenSearch: () => void;
  onReturnToNow: () => void;
  onSelectLandscape: (id: string) => void;
  onSetAzimuth?: (azimuthDeg: number) => void;
  onToggleGridLine: (key: GridLineKey) => void;
  onToggleNightMode: () => void;
  onToggleSkyLayer: (key: SkyLayerKey) => void;
  onToggleTimePanel?: () => void;
  onUpdateEnvironment: (patch: { bortleIndex?: number; cardinals?: boolean; fog?: boolean; turbidity?: number }) => void;
  onUpdateGridLines: (patch: Partial<typeof DEFAULT_GRID_LINES>) => void;
  onUpdateSkyLayers: (patch: Partial<typeof DEFAULT_SKY_LAYERS>) => void;
  onUpdateTime?: (date: Date) => void;
  skyLayers: typeof DEFAULT_SKY_LAYERS;
  timePanelOpen?: boolean;
};

function ActiveDetailSheet({
  activeDetail,
  control,
  insetsBottom,
  labelHints,
  onChangeHint,
  onClose,
  onResetHints,
}: {
  activeDetail: QuickControlId | null;
  control: QuickControlEntry | undefined;
  insetsBottom: number;
  labelHints: LabelHintValues;
  onChangeHint: (key: keyof LabelHintValues, val: number) => void;
  onClose: () => void;
  onResetHints: () => void;
}) {
  if (activeDetail === 'labels') {
    return (
      <LabelsControlDetailSheet
        hints={labelHints}
        insetsBottom={insetsBottom}
        onChangeHint={onChangeHint}
        onClose={onClose}
        onReset={onResetHints}
      />
    );
  }
  if (!control)
    return null;

  return (
    <QuickControlDetailSheet
      insetsBottom={insetsBottom}
      items={control.detailItems}
      onClose={onClose}
      onReset={control.onReset}
      resetLabel={control.resetLabel}
      subtitle={control.detailSubtitle}
      title={control.detailTitle}
    />
  );
}

function OverlayBottomBar({
  activeDetail,
  clock,
  controls,
  insetsBottom,
  isCustomTime,
  onLongPressControl,
  onOpenChange,
  onReturnToNow,
  onToggleTimePanel,
  quickPanelOpen,
}: {
  activeDetail: QuickControlId | null;
  clock: Date;
  controls: QuickControlEntry[];
  insetsBottom: number;
  isCustomTime: boolean;
  onLongPressControl: (id: QuickControlId) => void;
  onOpenChange: (next: boolean) => void;
  onReturnToNow: () => void;
  onToggleTimePanel?: () => void;
  quickPanelOpen: boolean;
}) {
  if (activeDetail !== null) {
    return null;
  }

  return (
    <View style={[styles.bottomControls, { paddingBottom: insetsBottom + 14 }]} pointerEvents="box-none">
      <View style={styles.leftQuickBar}>
        <GridQuickBar
          controls={controls}
          onLongPressControl={onLongPressControl}
          onOpenChange={onOpenChange}
          open={quickPanelOpen}
        />
      </View>
      <View style={styles.timeControlWrapper}>
        {!quickPanelOpen && (
          <TimeControl
            clock={clock}
            isCustomTime={isCustomTime}
            onPress={onToggleTimePanel ?? (() => {})}
            onReturnToNow={onReturnToNow}
          />
        )}
      </View>
    </View>
  );
}

function OverlaySheets({
  activeDetail,
  azimuthDeg,
  azimuthInputOpen,
  clock,
  control,
  insetsBottom,
  isCustomTime = false,
  labelHints,
  onChangeHint,
  onCloseDetail,
  onCloseInput,
  onCloseTimePanel,
  onResetHints,
  onReturnToNow,
  onSetAzimuth,
  onUpdateTime,
  timePanelOpen = false,
}: {
  activeDetail: QuickControlId | null;
  azimuthDeg: number;
  azimuthInputOpen: boolean;
  clock: Date;
  control: QuickControlEntry | undefined;
  insetsBottom: number;
  isCustomTime?: boolean;
  labelHints: LabelHintValues;
  onChangeHint: (key: keyof LabelHintValues, val: number) => void;
  onCloseDetail: () => void;
  onCloseInput: () => void;
  onCloseTimePanel?: () => void;
  onResetHints: () => void;
  onReturnToNow: () => void;
  onSetAzimuth?: (azimuthDeg: number) => void;
  onUpdateTime?: (date: Date) => void;
  timePanelOpen?: boolean;
}) {
  return (
    <>
      <ActiveDetailSheet
        activeDetail={activeDetail}
        control={control}
        insetsBottom={insetsBottom}
        labelHints={labelHints}
        onChangeHint={onChangeHint}
        onClose={onCloseDetail}
        onResetHints={onResetHints}
      />
      <CompassAzimuthDialog
        currentAzimuth={azimuthDeg}
        onApply={azimuth => onSetAzimuth?.(azimuth)}
        onClose={onCloseInput}
        visible={azimuthInputOpen}
      />
      {timePanelOpen && (
        <TimeSliderSheet
          clock={clock}
          insetsBottom={insetsBottom}
          isCustomTime={isCustomTime}
          onClose={() => onCloseTimePanel?.()}
          onReturnToNow={onReturnToNow}
          onUpdateTime={date => onUpdateTime?.(date)}
        />
      )}
    </>
  );
}

function CenteredCompass({
  azimuthDeg,
  bottom,
  onOpenInput,
  visible,
}: {
  azimuthDeg: number;
  bottom: number;
  onOpenInput: () => void;
  visible: boolean;
}) {
  if (!visible)
    return null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.compassCenterWrapper, { bottom }]}
      testID="deep-space-reference-compass-center"
    >
      <Compass azimuthDeg={azimuthDeg} onOpenInput={onOpenInput} />
    </View>
  );
}

function StarMapOverlayControls(props: StarMapOverlayControlsProps) {
  const {
    azimuthDeg,
    clock,
    insets,
    isCustomTime = false,
    onCloseTimePanel,
    onOpenMenu,
    onOpenSearch,
    onReturnToNow,
    onSetAzimuth,
    onToggleTimePanel,
    onUpdateTime,
    timePanelOpen = false,
  } = props;

  const [quickPanelOpen, setQuickPanelOpen] = React.useState(false);
  const [activeDetail, setActiveDetail] = React.useState<QuickControlId | null>(null);
  const [labelHints, setLabelHints] = React.useState<LabelHintValues>(DEFAULT_LABEL_HINTS);
  const [azimuthInputOpen, setAzimuthInputOpen] = React.useState(false);

  const controls = getQuickControls({
    environment: props.environment,
    landscapeId: props.landscapeId,
    lines: props.gridLines,
    nightMode: props.nightMode,
    onSelectLandscape: props.onSelectLandscape,
    onToggleGridLine: props.onToggleGridLine,
    onToggleNightMode: props.onToggleNightMode,
    onToggleSkyLayer: props.onToggleSkyLayer,
    onUpdateEnvironment: props.onUpdateEnvironment,
    onUpdateGridLines: props.onUpdateGridLines,
    onUpdateSkyLayers: props.onUpdateSkyLayers,
    skyLayers: props.skyLayers,
  });

  const handleReturnToNow = () => {
    onReturnToNow();
    showDeepSpaceFeedback({ message: translate('deep_space.feedback_returned_to_now'), tone: 'success' });
  };
  const currentDetailControl = controls.find(c => c.id === activeDetail);

  return (
    <View pointerEvents="box-none" style={[styles.overlay, { paddingTop: insets.top + 12 }]}>
      <TopControls onOpenMenu={onOpenMenu} onOpenSearch={onOpenSearch} />
      <View style={styles.horizonBearing} pointerEvents="none">
        <Text testID="deep-space-horizon-bearing" style={styles.horizonBearingText}>{bearingLabel(azimuthDeg)}</Text>
      </View>
      <OverlayBottomBar
        activeDetail={activeDetail}
        clock={clock}
        controls={controls}
        insetsBottom={insets.bottom}
        isCustomTime={isCustomTime}
        onLongPressControl={setActiveDetail}
        onOpenChange={(next) => {
          if (!next)
            setActiveDetail(null);
          setQuickPanelOpen(next);
        }}
        onReturnToNow={handleReturnToNow}
        onToggleTimePanel={onToggleTimePanel}
        quickPanelOpen={quickPanelOpen}
      />
      <CenteredCompass
        azimuthDeg={azimuthDeg}
        bottom={insets.bottom + 14}
        onOpenInput={() => setAzimuthInputOpen(true)}
        visible={!quickPanelOpen && activeDetail === null}
      />
      <OverlaySheets
        activeDetail={activeDetail}
        azimuthDeg={azimuthDeg}
        azimuthInputOpen={azimuthInputOpen}
        clock={clock}
        control={currentDetailControl}
        insetsBottom={insets.bottom}
        isCustomTime={isCustomTime}
        labelHints={labelHints}
        onChangeHint={(key, val) => {
          setLabelHints(prev => ({ ...prev, [key]: val }));
          props.onUpdateSkyLayers(hintsOffsetToPatch(key, val));
        }}
        onCloseDetail={() => setActiveDetail(null)}
        onCloseInput={() => setAzimuthInputOpen(false)}
        onCloseTimePanel={onCloseTimePanel}
        onResetHints={() => {
          setLabelHints(DEFAULT_LABEL_HINTS);
          props.onUpdateSkyLayers(resetAllHints());
          showDeepSpaceFeedback({ message: translate('deep_space.feedback_labels_reset'), tone: 'success' });
        }}
        onReturnToNow={handleReturnToNow}
        onSetAzimuth={onSetAzimuth}
        onUpdateTime={onUpdateTime}
        timePanelOpen={timePanelOpen}
      />
    </View>
  );
}

type QuickControlId = 'grid-lines' | 'constellation' | 'landscape' | 'atmosphere' | 'labels' | 'night-mode';

/**
 * A row inside a quick-control detail sheet.
 *
 * Rows default to switches. A `stepper` row instead cycles through a list of
 * options with ‹ › arrows, keeping the choice inside the sheet.
 */
type QuickSubItem = {
  active: boolean;
  hint: string;
  id: string;
  label: string;
  onToggle: () => void;
  stepper?: QuickStepper;
};

type QuickStepper = {
  onStep: (delta: number) => void;
  position: string;
  value: string;
};

function QuickDetailStepperRow({ item, stepper }: { item: QuickSubItem; stepper: QuickStepper }) {
  return (
    <View style={styles.quickDetailRow} testID={`deep-space-quick-detail-stepper-${item.id}`}>
      <View style={styles.quickDetailRowText}>
        <Text style={styles.quickDetailRowLabel}>{item.label}</Text>
        <Text style={styles.quickDetailRowHint}>{stepper.position}</Text>
      </View>
      <View style={styles.quickStepper}>
        <Pressable
          accessibilityLabel={`上一个${item.label}`}
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => stepper.onStep(-1)}
          style={styles.quickStepperArrow}
          testID={`deep-space-quick-detail-stepper-${item.id}-prev`}
        >
          <Text style={styles.quickStepperArrowText}>‹</Text>
        </Pressable>
        <Text
          numberOfLines={1}
          style={styles.quickStepperValue}
          testID={`deep-space-quick-detail-stepper-${item.id}-value`}
        >
          {stepper.value}
        </Text>
        <Pressable
          accessibilityLabel={`下一个${item.label}`}
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => stepper.onStep(1)}
          style={styles.quickStepperArrow}
          testID={`deep-space-quick-detail-stepper-${item.id}-next`}
        >
          <Text style={styles.quickStepperArrowText}>›</Text>
        </Pressable>
      </View>
    </View>
  );
}

function QuickDetailRow({ item }: { item: QuickSubItem }) {
  if (item.stepper)
    return <QuickDetailStepperRow item={item} stepper={item.stepper} />;

  return (
    <Pressable
      accessibilityLabel={item.label}
      accessibilityRole="switch"
      accessibilityState={{ checked: item.active }}
      onPress={item.onToggle}
      style={styles.quickDetailRow}
      testID={`deep-space-quick-detail-toggle-${item.id}`}
    >
      <View style={styles.quickDetailRowText}>
        <Text style={styles.quickDetailRowLabel}>{item.label}</Text>
        <Text style={styles.quickDetailRowHint}>{item.hint}</Text>
      </View>
      <View style={[styles.quickDetailSwitch, item.active && styles.quickDetailSwitchActive]}>
        <View style={[styles.quickDetailKnob, item.active && styles.quickDetailKnobActive]} />
      </View>
    </Pressable>
  );
}

function useLabelSliderGesture(onChange: (val: number) => void) {
  const [trackWidth, setTrackWidth] = React.useState(0);
  const [dragValue, setDragValue] = React.useState<number | null>(null);
  const trackRef = React.useRef<View>(null);
  const trackBoundsRef = React.useRef({ pageX: 0, width: 0 });
  const rafRef = React.useRef<number | null>(null);
  const latestValueRef = React.useRef(30);

  const measureTrack = React.useCallback((onMeasured?: () => void) => {
    trackRef.current?.measure((...args: number[]) => {
      const width = args[2];
      const pageX = args[4];
      if (typeof width === 'number' && width > 0 && typeof pageX === 'number') {
        trackBoundsRef.current = { pageX, width };
        setTrackWidth(width);
        onMeasured?.();
      }
    });
  }, []);

  const updateFromPageX = React.useCallback((pageX: number, isFinal = false) => {
    const { pageX: startX, width } = trackBoundsRef.current;
    if (width <= 0)
      return;
    const ratio = (pageX - startX) / width;
    const nextVal = Math.max(0, Math.min(100, Math.round(ratio * 100)));
    setDragValue(nextVal);
    latestValueRef.current = nextVal;

    if (isFinal) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      onChange(nextVal);
    }
    else if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        onChange(latestValueRef.current);
      });
    }
  }, [onChange]);

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          measureTrack(() => updateFromPageX(event.nativeEvent.pageX));
        },
        onPanResponderMove: (event) => {
          updateFromPageX(event.nativeEvent.pageX);
        },
        onPanResponderRelease: (event) => {
          updateFromPageX(event.nativeEvent.pageX, true);
          setDragValue(null);
        },
        onPanResponderTerminate: (event) => {
          updateFromPageX(event.nativeEvent.pageX, true);
          setDragValue(null);
        },
        onStartShouldSetPanResponder: () => true,
      }),
    [measureTrack, updateFromPageX],
  );

  return { dragValue, measureTrack, panResponder, setTrackWidth, trackRef, trackWidth };
}

function StellariumLabelSlider({
  label,
  onChange,
  testID,
  value,
}: {
  label: string;
  onChange: (val: number) => void;
  testID: string;
  value: number;
}) {
  const clampedValue = Math.max(0, Math.min(100, value));
  const { dragValue, measureTrack, panResponder, setTrackWidth, trackRef, trackWidth } = useLabelSliderGesture(onChange);
  const displayValue = dragValue ?? clampedValue;

  return (
    <View style={styles.labelSliderRow}>
      <Text style={styles.labelSliderText}>{label}</Text>
      <View
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        accessibilityLabel={label}
        accessibilityRole="adjustable"
        accessibilityValue={{ max: 100, min: 0, now: displayValue }}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent?.actionName === 'increment') {
            onChange(Math.min(100, displayValue + 5));
          }
          if (event.nativeEvent?.actionName === 'decrement') {
            onChange(Math.max(0, displayValue - 5));
          }
        }}
        onLayout={(e) => {
          setTrackWidth(e.nativeEvent.layout.width);
          measureTrack();
        }}
        ref={trackRef}
        style={styles.labelSliderTrackWrapper}
        testID={testID}
        {...panResponder.panHandlers}
      >
        <View pointerEvents="none" style={styles.labelSliderTrackBg}>
          <View style={[styles.labelSliderTrackActive, { width: `${displayValue}%` }]} />
        </View>
        <View
          pointerEvents="none"
          style={[
            styles.labelSliderThumb,
            { left: trackWidth > 22 ? (displayValue / 100) * (trackWidth - 22) : `${displayValue}%` },
          ]}
          testID={`${testID}-thumb`}
        />
      </View>
    </View>
  );
}

function LabelsControlDetailSheet({
  hints,
  insetsBottom,
  onChangeHint,
  onClose,
  onReset,
}: {
  hints: LabelHintValues;
  insetsBottom: number;
  onChangeHint: (key: keyof LabelHintValues, value: number) => void;
  onClose: () => void;
  onReset: () => void;
}) {
  return (
    <View pointerEvents="box-none" style={[styles.quickDetailOverlay, { paddingBottom: insetsBottom + 14 }]}>
      <Pressable accessibilityLabel="关闭设置" accessibilityRole="button" onPress={onClose} style={styles.quickDetailScrim} />
      <View style={styles.labelsDetailCard} testID="deep-space-quick-detail-sheet">
        <View style={styles.labelsDetailHeader}>
          <Pressable
            accessibilityLabel={translate('deep_space.back')}
            accessibilityRole="button"
            hitSlop={8}
            onPress={onClose}
            style={styles.labelsDetailClose}
            testID="deep-space-quick-detail-close"
          >
            <Text style={styles.labelsDetailBackText}>‹</Text>
          </Pressable>
          <Text style={styles.labelsDetailTitle}>标签和注记数量</Text>
          <Pressable
            accessibilityLabel="关闭设置"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onClose}
            style={styles.labelsDetailClose}
          >
            <CloseIcon />
          </Pressable>
        </View>

        <View style={styles.labelsDetailBody}>
          <StellariumLabelSlider
            label="恒星"
            onChange={val => onChangeHint('stars', val)}
            testID="deep-space-label-slider-stars"
            value={hints.stars}
          />
          <StellariumLabelSlider
            label="行星"
            onChange={val => onChangeHint('planets', val)}
            testID="deep-space-label-slider-planets"
            value={hints.planets}
          />
          <StellariumLabelSlider
            label="深空天体"
            onChange={val => onChangeHint('dsos', val)}
            testID="deep-space-label-slider-dsos"
            value={hints.dsos}
          />
          <StellariumLabelSlider
            label="人造卫星"
            onChange={val => onChangeHint('satellites', val)}
            testID="deep-space-label-slider-satellites"
            value={hints.satellites}
          />
        </View>

        <View style={styles.labelsDetailFooter}>
          <Pressable
            accessibilityLabel="重置数值"
            accessibilityRole="button"
            hitSlop={12}
            onPress={onReset}
            style={styles.labelsResetButton}
            testID="deep-space-labels-reset-button"
          >
            <Text style={styles.labelsResetButtonText}>重置数值</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function QuickControlDetailSheet({
  insetsBottom,
  items,
  onClose,
  onReset,
  resetLabel,
  subtitle,
  title,
}: {
  insetsBottom: number;
  items: QuickSubItem[];
  onClose: () => void;
  onReset?: () => void;
  resetLabel?: string;
  subtitle: string;
  title: string;
}) {
  return (
    <View pointerEvents="box-none" style={[styles.quickDetailOverlay, { paddingBottom: insetsBottom + 14 }]}>
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
          {items.map(item => <QuickDetailRow item={item} key={item.id} />)}
        </View>
        {onReset && (
          <View style={styles.quickDetailFooter}>
            <Pressable
              accessibilityLabel={resetLabel ?? '重置默认'}
              accessibilityRole="button"
              hitSlop={12}
              onPress={onReset}
              style={styles.quickDetailResetButton}
              testID="deep-space-quick-detail-reset"
            >
              <Text style={styles.quickDetailResetButtonText}>{resetLabel ?? '重置默认'}</Text>
            </Pressable>
          </View>
        )}
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
  onReset?: () => void;
  resetLabel?: string;
};

function getGridControls({
  lines,
  onToggleGridLine,
  onUpdateGridLines,
}: Pick<QuickControlParams, 'lines' | 'onToggleGridLine' | 'onUpdateGridLines'>): QuickControlEntry {
  const gridsActive = lines.azimuthal || lines.equatorial_jnow || lines.equatorial_j2000 || lines.ecliptic || lines.equator || lines.meridian;

  return {
    active: gridsActive,
    detailItems: [
      {
        active: lines.azimuthal,
        hint: '以地平线与天顶为基准的仰角与方位网格',
        id: 'azimuthal',
        label: '地平坐标网格 (Azimuthal)',
        onToggle: () => onToggleGridLine('azimuthal'),
      },
      {
        active: lines.equatorial_jnow,
        hint: '随天球旋转的即时天赤道与赤经赤纬网格',
        id: 'equatorial_jnow',
        label: '赤道坐标网格 (JNow)',
        onToggle: () => onToggleGridLine('equatorial_jnow'),
      },
      {
        active: lines.equatorial_j2000,
        hint: '基于 J2000.0 标准固定参考系的赤经赤纬网格',
        id: 'equatorial_j2000',
        label: '赤道坐标网格 (J2000)',
        onToggle: () => onToggleGridLine('equatorial_j2000'),
      },
      {
        active: lines.ecliptic,
        hint: '太阳在天球上的视周年运动轨迹（黄道大圆）',
        id: 'ecliptic',
        label: '黄道线 (Ecliptic)',
        onToggle: () => onToggleGridLine('ecliptic'),
      },
      {
        active: lines.equator,
        hint: '地球赤道面延伸至天球的投影（赤纬 0° 线）',
        id: 'equator',
        label: '天赤道 (Celestial Equator)',
        onToggle: () => onToggleGridLine('equator'),
      },
      {
        active: lines.meridian,
        hint: '连接天顶与正南正北地平圈点的天球大圆',
        id: 'meridian',
        label: '子午线 (Meridian)',
        onToggle: () => onToggleGridLine('meridian'),
      },
    ],
    detailSubtitle: '天球与地平参考坐标网格与基准线',
    detailTitle: '网格和线条设置',
    icon: 'grid-lines',
    id: 'grid-lines',
    label: '网格和线条',
    onPress: () => {
      if (gridsActive) {
        onUpdateGridLines({
          azimuthal: false,
          ecliptic: false,
          equator: false,
          equatorial_j2000: false,
          equatorial_jnow: false,
          meridian: false,
        });
      }
      else {
        onUpdateGridLines({
          azimuthal: true,
          equatorial_jnow: true,
        });
      }
    },
    onReset: () => onUpdateGridLines(DEFAULT_GRID_LINES),
    resetLabel: '重置坐标网格',
  };
}

function getConstellationControls({
  onToggleSkyLayer,
  onUpdateSkyLayers,
  skyLayers,
}: Pick<QuickControlParams, 'onToggleSkyLayer' | 'onUpdateSkyLayers' | 'skyLayers'>): QuickControlEntry {
  const constellationActive = skyLayers.constellationLines || skyLayers.constellationArt;

  return {
    active: constellationActive,
    detailItems: [
      {
        active: skyLayers.constellationLines,
        hint: '连接主要明亮恒星的几何线条骨架',
        id: 'constellationLines',
        label: '星座连线',
        onToggle: () => onToggleSkyLayer('constellationLines'),
      },
      {
        active: skyLayers.constellationArt,
        hint: '古典神话星图的手绘形象画像',
        id: 'constellationArt',
        label: '星座古典艺术画',
        onToggle: () => onToggleSkyLayer('constellationArt'),
      },
      {
        active: skyLayers.constellationLabels,
        hint: '在星空中标注所有星座的名称',
        id: 'constellationLabels',
        label: '星座名称注记',
        onToggle: () => onToggleSkyLayer('constellationLabels'),
      },
      {
        active: skyLayers.constellationBoundaries,
        hint: '国际天文联合会 1928 年划定的 88 星座天区界线',
        id: 'constellationBoundaries',
        label: '星座边界',
        onToggle: () => onToggleSkyLayer('constellationBoundaries'),
      },
      {
        active: skyLayers.constellationOnlyPointed,
        hint: '只绘制视野中心指向的那个星座，其余星座隐藏',
        id: 'constellationOnlyPointed',
        label: '仅显示指向星座',
        onToggle: () => onToggleSkyLayer('constellationOnlyPointed'),
      },
    ],
    detailSubtitle: '星座连线、艺术图画、名称、边界与聚焦',
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
    onReset: () => onUpdateSkyLayers({
      constellationArt: true,
      constellationBoundaries: false,
      constellationLabels: true,
      constellationLines: true,
      constellationOnlyPointed: false,
    }),
    resetLabel: '重置星座设置',
  };
}

function getAtmosphereControl({
  environment,
  onToggleSkyLayer,
  onUpdateEnvironment,
  onUpdateSkyLayers,
  skyLayers,
}: Pick<QuickControlParams, 'environment' | 'onToggleSkyLayer' | 'onUpdateEnvironment' | 'onUpdateSkyLayers' | 'skyLayers'>): QuickControlEntry {
  return {
    active: skyLayers.atmosphere,
    detailItems: [
      {
        active: skyLayers.atmosphere,
        hint: '模拟日光散射、晨昏蒙影与天光消光',
        id: 'atmosphere',
        label: '大气散射与消光',
        onToggle: () => onToggleSkyLayer('atmosphere'),
      },
      {
        active: environment.fog,
        hint: '在地景上显示雾气',
        id: 'fog',
        label: '雾',
        onToggle: () => onUpdateEnvironment({ fog: !environment.fog }),
      },
      {
        active: true,
        hint: 'Bortle 1 为最佳暗空，Bortle 9 为市中心光污染',
        id: 'air-quality',
        label: '空气质量',
        onToggle: () => {},
        stepper: airQualityStepper(environment.bortleIndex, bortleIndex => onUpdateEnvironment({ bortleIndex })),
      },
    ],
    detailSubtitle: '日照散射、晨昏蒙影、天光消光、空气质量与地景雾气',
    detailTitle: '大气层与空气质量设置',
    icon: 'atmosphere',
    id: 'atmosphere',
    label: '大气层',
    onPress: () => onToggleSkyLayer('atmosphere'),
    onReset: () => {
      onUpdateSkyLayers({ atmosphere: true });
      onUpdateEnvironment({ bortleIndex: DEFAULT_BORTLE_INDEX, fog: false, turbidity: DEFAULT_TURBIDITY });
    },
    resetLabel: '重置大气与空气质量',
  };
}

function getLabelsControl({
  onUpdateSkyLayers,
  skyLayers,
}: Pick<QuickControlParams, 'onUpdateSkyLayers' | 'skyLayers'>): QuickControlEntry {
  const labelsActive = skyLayers.planetLabels
    || skyLayers.starLabels
    || skyLayers.dsoLabels
    || skyLayers.satelliteLabels;

  return {
    active: labelsActive,
    detailItems: [],
    detailSubtitle: '',
    detailTitle: '标签',
    icon: 'labels',
    id: 'labels',
    label: '标签',
    onPress: () => {
      const next = !labelsActive;
      onUpdateSkyLayers({
        dsoLabels: next,
        planetLabels: next,
        satelliteLabels: next,
        starLabels: next,
      });
    },
  };
}

function getEnvironmentAndNightControls({
  environment,
  landscapeId,
  nightMode,
  onSelectLandscape,
  onToggleNightMode,
  onToggleSkyLayer,
  onUpdateEnvironment,
  onUpdateSkyLayers,
  skyLayers,
}: Pick<QuickControlParams, 'environment' | 'landscapeId' | 'nightMode' | 'onSelectLandscape' | 'onToggleNightMode' | 'onToggleSkyLayer' | 'onUpdateEnvironment' | 'onUpdateSkyLayers' | 'skyLayers'>): QuickControlEntry[] {
  return [
    {
      active: skyLayers.landscape,
      detailItems: [
        {
          active: skyLayers.landscape,
          hint: '显示观测地点周围的真实地表全景与遮挡',
          id: 'landscape',
          label: '地面全景景观',
          onToggle: () => onToggleSkyLayer('landscape'),
        },
        {
          active: environment.cardinals,
          hint: '显示红色的方位标示',
          id: 'cardinals',
          label: '基本点',
          onToggle: () => onUpdateEnvironment({ cardinals: !environment.cardinals }),
        },
        {
          active: true,
          hint: '',
          id: 'landscape-library',
          label: '地景',
          onToggle: () => {},
          stepper: landscapeStepper(landscapeId, onSelectLandscape),
        },
      ],
      detailSubtitle: '真实地面地景与地平线模拟',
      detailTitle: '地景设置',
      icon: 'landscape',
      id: 'landscape',
      label: '地景',
      onPress: () => onToggleSkyLayer('landscape'),
      onReset: () => {
        onUpdateSkyLayers({ landscape: true });
        onUpdateEnvironment({ cardinals: false });
        onSelectLandscape(DEFAULT_LANDSCAPE_ID);
      },
      resetLabel: '重置地景设置',
    },
    getAtmosphereControl({
      environment,
      onToggleSkyLayer,
      onUpdateEnvironment,
      onUpdateSkyLayers,
      skyLayers,
    }),
    getLabelsControl({
      onUpdateSkyLayers,
      skyLayers,
    }),
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

type QuickControlParams = {
  environment: { bortleIndex: number; cardinals: boolean; fog: boolean; turbidity: number };
  landscapeId: string;
  lines: typeof DEFAULT_GRID_LINES;
  nightMode: boolean;
  onSelectLandscape: (id: string) => void;
  onToggleNightMode: () => void;
  onToggleGridLine: (key: GridLineKey) => void;
  onToggleSkyLayer: (key: SkyLayerKey) => void;
  onUpdateEnvironment: (patch: { bortleIndex?: number; cardinals?: boolean; fog?: boolean; turbidity?: number }) => void;
  onUpdateGridLines: (patch: Partial<typeof DEFAULT_GRID_LINES>) => void;
  onUpdateSkyLayers: (patch: Partial<typeof DEFAULT_SKY_LAYERS>) => void;
  skyLayers: typeof DEFAULT_SKY_LAYERS;
};

function getQuickControls(params: QuickControlParams): QuickControlEntry[] {
  return [
    getGridControls(params),
    getConstellationControls(params),
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
  const size = 46;
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

    const coordinates = parseSkyCoordinateInput(target);
    if (coordinates) {
      stellaRef.current?.gotoRaDec?.(coordinates.raHours * 15, coordinates.decDeg);
      closeSearch();
      return;
    }

    setError(false);
    stellaRef.current?.searchTarget?.(target);
  };

  const selectRecent = (object: RecentSkyObject) => {
    setError(false);
    stellaRef.current?.searchTarget?.(object.id.replace(/^NAME\s+/, ''));
  };

  return {
    closeSearch,
    error,
    open,
    openSearch,
    query,
    selectRecent,
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

/**
 * Sky-layer state with engine mirroring. Both the patch update and the key
 * toggle compute from the LATEST state via the functional setState form: with
 * rapid taps a render-closure snapshot can be one render stale, which would
 * send the engine the wrong value and desync the switch UI from the sky.
 */
function useSkyLayers(stellaRef: React.RefObject<StellariumViewHandle | null>) {
  const [skyLayers, setSkyLayers] = React.useState(DEFAULT_SKY_LAYERS);

  const updateSkyLayers = React.useCallback((patch: Partial<typeof DEFAULT_SKY_LAYERS>) => {
    setSkyLayers((prev) => {
      const next = { ...prev, ...patch };
      stellaRef.current?.setSkyLayers?.(patch);
      return next;
    });
  }, [stellaRef]);

  const toggleSkyLayer = React.useCallback((key: SkyLayerKey) => {
    setSkyLayers((prev) => {
      const patch = { [key]: !prev[key] } as Partial<typeof DEFAULT_SKY_LAYERS>;
      stellaRef.current?.setSkyLayers?.(patch);
      return { ...prev, ...patch };
    });
  }, [stellaRef]);

  return { skyLayers, toggleSkyLayer, updateSkyLayers };
}

function useInteractiveClock(stellaRef: React.RefObject<StellariumViewHandle | null>) {
  const [clock, setClock] = React.useState(() => new Date());
  const [isCustomTime, setIsCustomTime] = React.useState(false);
  const [timePanelOpen, setTimePanelOpen] = React.useState(false);

  const updateTime = React.useCallback((nextDate: Date) => {
    setClock(nextDate);
    setIsCustomTime(true);
    stellaRef.current?.setTime?.(nextDate);
  }, [stellaRef]);

  const returnToNow = React.useCallback(() => {
    const now = new Date();
    setClock(now);
    setIsCustomTime(false);
    stellaRef.current?.setTime?.(now);
  }, [stellaRef]);

  React.useEffect(() => {
    const interval = globalThis.setInterval(() => {
      if (!isCustomTime) {
        const now = new Date();
        setClock(now);
        stellaRef.current?.setTime?.(now);
      }
    }, 60_000);
    return () => globalThis.clearInterval(interval);
  }, [isCustomTime, stellaRef]);

  return {
    clock,
    closeTimePanel: () => setTimePanelOpen(false),
    isCustomTime,
    returnToNow,
    timePanelOpen,
    toggleTimePanel: () => setTimePanelOpen(prev => !prev),
    updateTime,
  };
}

function SelectedObjectOverlay({
  drawerActive,
  drawerOpen,
  onGotoTools,
  searchOpen,
  selectedObject,
  setSelectedObject,
  stellaRef,
}: {
  drawerActive: boolean;
  drawerOpen: boolean;
  onGotoTools: () => void;
  searchOpen: boolean;
  selectedObject: SelectedCelestialObject | null;
  setSelectedObject: (obj: SelectedCelestialObject | null) => void;
  stellaRef: React.RefObject<StellariumViewHandle | null>;
}) {
  if (!selectedObject || drawerOpen || drawerActive || searchOpen)
    return null;

  return (
    <ObjectInfoSheet
      key={selectedObject.id}
      object={selectedObject}
      onCenter={obj => stellaRef.current?.pointAndLock(obj.id)}
      onClose={() => {
        setSelectedObject(null);
        stellaRef.current?.clearSelection?.();
      }}
      onGoto={(raHours, decDeg) => {
        setSelectedObject(null);
        onGotoTools();
        stellaRef.current?.gotoRaDec(raHours * 15, decDeg);
        showDeepSpaceFeedback({ message: translate('deep_space.feedback_telescope_controls'), tone: 'success' });
      }}
      onZoomIn={() => stellaRef.current?.zoomTo(15)}
      onZoomOut={() => stellaRef.current?.zoomTo(75)}
    />
  );
}

function StarMapModals({
  compassFollowing,
  currentCulture,
  drawerFeature,
  drawerOpen,
  insetsBottom,
  recentObjects,
  onResetAll,
  onToggleCompassFollowing,
  search,
  selectedObject,
  setCurrentCulture,
  setDrawerOpen,
  setSelectedObject,
  settings,
  showRestoreFab,
  stellaRef,
  timeState,
}: {
  compassFollowing: boolean;
  currentCulture: string;
  drawerFeature: ReturnType<typeof useDrawerFeature>;
  drawerOpen: boolean;
  insetsBottom: number;
  recentObjects: RecentSkyObject[];
  onResetAll?: () => void;
  onToggleCompassFollowing: () => void;
  search: ReturnType<typeof useStarMapSearch>;
  selectedObject: SelectedCelestialObject | null;
  setCurrentCulture: (c: string) => void;
  setDrawerOpen: (open: boolean) => void;
  setSelectedObject: (obj: SelectedCelestialObject | null) => void;
  settings: ReturnType<typeof useStellariumSettings>;
  showRestoreFab: boolean;
  stellaRef: React.RefObject<StellariumViewHandle | null>;
  timeState: ReturnType<typeof useInteractiveClock>;
}) {
  return (
    <>
      <RestoreCultureFlow
        currentCulture={currentCulture}
        insetsBottom={insetsBottom}
        onRestore={() => {
          setCurrentCulture('western');
          stellaRef.current?.setSkyCulture?.('western');
        }}
        showFab={showRestoreFab}
      />
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
        clock={timeState.clock}
        compassFollowing={compassFollowing}
        feature={drawerFeature}
        onPreviewCulture={id => stellaRef.current?.setSkyCulture?.(id)}
        onResetAll={onResetAll}
        onToggleCompassFollowing={onToggleCompassFollowing}
        settings={settings}
        stellaRef={stellaRef}
      />
      <SelectedObjectOverlay
        drawerActive={Boolean(drawerFeature.active)}
        drawerOpen={drawerOpen}
        onGotoTools={() => drawerFeature.open('tools')}
        searchOpen={search.open}
        selectedObject={selectedObject}
        setSelectedObject={setSelectedObject}
        stellaRef={stellaRef}
      />
      {search.open && (
        <ReferenceSearchSheet
          error={search.error}
          onChange={search.setQuery}
          onClose={search.closeSearch}
          onSelectRecent={search.selectRecent}
          onSubmit={search.submitSearch}
          query={search.query}
          recentObjects={recentObjects}
        />
      )}
    </>
  );
}

function useDeepSpaceSelection() {
  const [recentObjects, setRecentObjects] = React.useState<RecentSkyObject[]>(() => loadRecentSkyObjects(storage));
  const [selectedObject, setSelectedObject] = React.useState<SelectedCelestialObject | null>(null);

  const handleObjectSelected = React.useCallback((object: SelectedCelestialObject) => {
    setSelectedObject(object);
    const candidate: RecentSkyObject = {
      id: object.id,
      name: object.name,
      typeZh: object.typeZh ?? undefined,
    };
    setRecentObjects(prev => [candidate, ...prev.filter(item => item.id !== candidate.id)].slice(0, 6));
    addRecentSkyObject(storage, candidate);
  }, []);

  return {
    clearSelection: () => setSelectedObject(null),
    handleObjectSelected,
    recentObjects,
    selectedObject,
    setSelectedObject,
  };
}

function useDeepSpaceMapReset(
  drawerFeature: ReturnType<typeof useStellariumDrawerFeature>,
  updateSkyLayers: (layers: typeof DEFAULT_SKY_LAYERS) => void,
  settings: ReturnType<typeof useStellariumSettings>,
) {
  return React.useCallback(() => {
    updateSkyLayers(DEFAULT_SKY_LAYERS);
    drawerFeature.updateEnvironment({
      bortleIndex: DEFAULT_BORTLE_INDEX,
      cardinals: true,
      fog: true,
      turbidity: DEFAULT_TURBIDITY,
    });
    drawerFeature.selectLandscape(DEFAULT_LANDSCAPE_ID);
    drawerFeature.updateGridLines(DEFAULT_GRID_LINES);
    drawerFeature.selectCity(OBSERVER_CITIES[0]);
    settings.resetSettings();
  }, [drawerFeature, settings, updateSkyLayers]);
}

function ActiveStarMapControls({
  controlsProps,
  fullscreen,
  insetsTop,
  onExitFullscreen,
  suppressFullscreenButton,
}: {
  controlsProps: StarMapOverlayControlsProps;
  fullscreen: boolean;
  insetsTop: number;
  onExitFullscreen: () => void;
  suppressFullscreenButton: boolean;
}) {
  if (fullscreen && !suppressFullscreenButton) {
    return (
      <Pressable
        accessibilityLabel="退出全屏"
        accessibilityRole="button"
        onPress={onExitFullscreen}
        style={[styles.exitFullscreenButton, { right: 16, top: insetsTop + 16 }]}
        testID="deep-space-exit-fullscreen"
      >
        <Text style={styles.exitFullscreenText}>✕ 退出全屏</Text>
      </Pressable>
    );
  }
  return <StarMapOverlayControls {...controlsProps} />;
}

export function DeepSpaceMapScreen({ onBack: _onBack }: DeepSpaceMapScreenProps): React.ReactElement {
  const insets = useSafeAreaInsets();
  const stellaRef = React.useRef<StellariumViewHandle>(null);
  const [azimuthDeg, setAzimuthDeg] = React.useState(0);
  const [currentCulture, setCurrentCulture] = React.useState('western');
  const selection = useDeepSpaceSelection();
  const drawerFeature = useStellariumDrawerFeature({ currentCulture, setCurrentCulture, stellaRef });
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [nightMode, setNightMode] = React.useState(false);
  const { skyLayers, toggleSkyLayer, updateSkyLayers } = useSkyLayers(stellaRef);
  const { compassFollowing, toggleCompassFollowing } = useCompassFollowing(stellaRef);
  const search = useStarMapSearch(stellaRef);
  const timeState = useInteractiveClock(stellaRef);
  const settings = useStellariumSettings(stellaRef, { onReturnToNow: timeState.returnToNow });
  const handleResetAll = useDeepSpaceMapReset(drawerFeature, updateSkyLayers, settings);

  const handleSetAzimuth = React.useCallback((targetDeg: number) => {
    const normalized = Math.round(((targetDeg % 360) + 360) % 360);
    setAzimuthDeg(normalized);
    stellaRef.current?.setViewBearing(normalized);
    showDeepSpaceFeedback({
      message: translate('deep_space.compass_feedback_rotated', { azimuth: normalized }),
      tone: 'success',
    });
  }, []);

  const showRestoreFab = currentCulture !== 'western' && !drawerOpen && !drawerFeature.active && !search.open && !selection.selectedObject;

  return (
    <View testID="deep-space-map-shell" style={styles.root}>
      <StellariumView
        ref={stellaRef}
        style={styles.webView}
        onBearingChange={setAzimuthDeg}
        onReady={() => {
          stellaRef.current?.setSkyLayers?.(skyLayers);
          stellaRef.current?.setEnvironment?.(drawerFeature.environment);
          if (settings.limitMagEnabled) {
            stellaRef.current?.setMagnitudeLimit?.(settings.limitMagValue);
          }
          stellaRef.current?.setBrightness?.(settings.brightness);
        }}
        onCommandError={() => search.setError(true)}
        onObjectSelected={selection.handleObjectSelected}
        onSelectionCleared={selection.clearSelection}
        onTargetFound={search.closeSearch}
        onTargetNotFound={() => search.setError(true)}
      />
      {drawerFeature.fieldOfView && <FieldOfViewOverlay input={drawerFeature.fieldOfView} stellaRef={stellaRef} />}
      {nightMode && <View pointerEvents="none" style={styles.nightModeOverlay} testID="deep-space-night-mode-overlay" />}
      <ActiveStarMapControls
        controlsProps={{
          azimuthDeg,
          clock: timeState.clock,
          environment: drawerFeature.environment,
          gridLines: drawerFeature.gridLines,
          insets,
          isCustomTime: timeState.isCustomTime,
          landscapeId: drawerFeature.landscapeId,
          nightMode,
          onCloseTimePanel: timeState.closeTimePanel,
          onOpenMenu: () => {
            timeState.closeTimePanel();
            setDrawerOpen(true);
          },
          onOpenSearch: () => {
            timeState.closeTimePanel();
            search.openSearch(() => setDrawerOpen(false));
          },
          onReturnToNow: timeState.returnToNow,
          onSelectLandscape: drawerFeature.selectLandscape,
          onSetAzimuth: handleSetAzimuth,
          onToggleGridLine: drawerFeature.toggleGridLine,
          onToggleNightMode: () => setNightMode(value => !value),
          onToggleSkyLayer: toggleSkyLayer,
          onToggleTimePanel: timeState.toggleTimePanel,
          onUpdateEnvironment: drawerFeature.updateEnvironment,
          onUpdateGridLines: drawerFeature.updateGridLines,
          onUpdateSkyLayers: updateSkyLayers,
          onUpdateTime: timeState.updateTime,
          skyLayers,
          timePanelOpen: timeState.timePanelOpen,
        }}
        fullscreen={settings.fullscreen}
        insetsTop={insets.top}
        onExitFullscreen={() => settings.setFullscreen(false)}
        suppressFullscreenButton={drawerOpen || Boolean(drawerFeature.active) || search.open || Boolean(selection.selectedObject)}
      />
      <StarMapModals
        compassFollowing={compassFollowing}
        currentCulture={currentCulture}
        drawerFeature={drawerFeature}
        drawerOpen={drawerOpen}
        insetsBottom={insets.bottom}
        recentObjects={selection.recentObjects}
        onResetAll={handleResetAll}
        onToggleCompassFollowing={toggleCompassFollowing}
        search={search}
        selectedObject={selection.selectedObject}
        setCurrentCulture={setCurrentCulture}
        setDrawerOpen={setDrawerOpen}
        setSelectedObject={selection.setSelectedObject}
        settings={settings}
        showRestoreFab={showRestoreFab}
        stellaRef={stellaRef}
        timeState={timeState}
      />
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
  const activeCultureName = (getLanguage() || 'zh').startsWith('zh')
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
  compassFollowing,
  feature,
  onPreviewCulture,
  onResetAll,
  onToggleCompassFollowing,
  settings,
  stellaRef,
}: {
  clock: Date;
  compassFollowing: boolean;
  feature: ReturnType<typeof useDrawerFeature>;
  onPreviewCulture: (id: string) => void;
  onResetAll?: () => void;
  onToggleCompassFollowing: () => void;
  settings: ReturnType<typeof useStellariumSettings>;
  stellaRef: React.RefObject<StellariumViewHandle | null>;
}) {
  switch (feature.active) {
    case 'calendar':
      return (
        <CalendarPanel
          city={feature.observer}
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
      return (
        <SettingsPanel
          automaticLocation={feature.automaticLocation}
          compassFollowing={compassFollowing}
          observer={feature.observer}
          onClose={feature.close}
          onEnableAutomaticLocation={feature.enableAutomaticLocation}
          onManualCoordinateChange={feature.setManualCoordinate}
          onResetAll={onResetAll}
          onSelect={feature.selectCity}
          onToggleCompassFollowing={onToggleCompassFollowing}
          settings={settings}
        />
      );
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
        <View style={styles.drawerSectionDivider} />
        <ReferenceDrawerRow icon={<HelpIcon />} label="帮助与反馈" />
        <ReferenceDrawerRow icon={<ExitIcon />} label="退出" showChevron={false} />
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
  const chinese = (getLanguage() || 'zh').startsWith('zh');
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
  const chinese = (getLanguage() || 'zh').startsWith('zh');
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
    <Pressable accessibilityLabel="返回观测工具" accessibilityRole="button" onPress={() => setActiveTool('home')} style={featureSheetStyles.featureClose}>
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
      <Pressable accessibilityLabel="望远镜控制" accessibilityRole="button" onPress={() => setActiveTool('telescope')} style={featureSheetStyles.featureRow} testID="deep-space-tools-telescope">
        <View style={featureSheetStyles.featureRowText}>
          <Text style={featureSheetStyles.featureRowLabel}>望远镜控制</Text>
          <Text style={featureSheetStyles.featureRowHint}>按赤经和赤纬控制星图指向</Text>
        </View>
        <Text style={featureSheetStyles.featureSelected}>›</Text>
      </Pressable>
      <Pressable accessibilityLabel="视场模拟" accessibilityRole="button" onPress={() => setActiveTool('fov')} style={featureSheetStyles.featureRow} testID="deep-space-tools-fov">
        <View style={featureSheetStyles.featureRowText}>
          <Text style={featureSheetStyles.featureRowLabel}>视场模拟</Text>
          <Text style={featureSheetStyles.featureRowHint}>按焦距和传感器尺寸生成取景框</Text>
        </View>
        <Text style={featureSheetStyles.featureSelected}>›</Text>
      </Pressable>
      {fieldOfViewActive && (
        <Pressable accessibilityLabel="关闭视场模拟" accessibilityRole="button" onPress={onClearFieldOfView} style={featureSheetStyles.featureRow} testID="deep-space-tools-fov-clear">
          <Text style={featureSheetStyles.featureRowLabel}>关闭视场模拟</Text>
          <Text style={featureSheetStyles.featureSelected}>×</Text>
        </Pressable>
      )}
    </FeatureSheet>
  );
}

function LocationCoordinateRows({
  observer,
  onOpenCityPicker,
  onOpenLatitude,
  onOpenLongitude,
}: {
  observer: ReturnType<typeof useObserverLocation>['observer'];
  onOpenCityPicker: () => void;
  onOpenLatitude: () => void;
  onOpenLongitude: () => void;
}) {
  return (
    <>
      <Pressable
        accessibilityLabel="纬度"
        accessibilityRole="button"
        onPress={onOpenLatitude}
        style={featureSheetStyles.featureRow}
        testID="deep-space-settings-latitude-btn"
      >
        <Text style={featureSheetStyles.featureRowLabel}>纬度</Text>
        <View style={styles.locationValueRow}>
          <Text style={featureSheetStyles.featureRowHint}>{formatLatitudeDMS(observer.latitudeDeg)}</Text>
          <Text style={featureSheetStyles.featureSelected}>›</Text>
        </View>
      </Pressable>
      <Pressable
        accessibilityLabel="经度"
        accessibilityRole="button"
        onPress={onOpenLongitude}
        style={featureSheetStyles.featureRow}
        testID="deep-space-settings-longitude-btn"
      >
        <Text style={featureSheetStyles.featureRowLabel}>经度</Text>
        <View style={styles.locationValueRow}>
          <Text style={featureSheetStyles.featureRowHint}>{formatLongitudeDMS(observer.longitudeDeg)}</Text>
          <Text style={featureSheetStyles.featureSelected}>›</Text>
        </View>
      </Pressable>
      <Pressable
        accessibilityLabel="地名/城市"
        accessibilityRole="button"
        onPress={onOpenCityPicker}
        style={featureSheetStyles.featureRow}
        testID="deep-space-settings-city-btn"
      >
        <Text style={featureSheetStyles.featureRowLabel}>地名/城市:</Text>
        <View style={styles.locationValueRow}>
          <Text style={featureSheetStyles.featureRowHint}>{observer.name}</Text>
          <Text style={featureSheetStyles.featureSelected}>›</Text>
        </View>
      </Pressable>
      <View style={featureSheetStyles.featureRow}>
        <Text style={featureSheetStyles.featureRowLabel}>UTC偏移</Text>
        <Text style={featureSheetStyles.featureRowHint}>{formatUtcOffset(new Date().getTimezoneOffset())}</Text>
      </View>
    </>
  );
}

function PresetCityList({
  activeName,
  onSelect,
}: {
  activeName: string;
  onSelect: (city: typeof OBSERVER_CITIES[number]) => void;
}) {
  return (
    <>
      <Text style={featureSheetStyles.featureRowHint}>选择预置观测地点</Text>
      {OBSERVER_CITIES.map(city => (
        <Pressable
          accessibilityLabel={city.name}
          accessibilityRole="button"
          accessibilityState={{ selected: city.name === activeName }}
          key={city.name}
          onPress={() => onSelect(city)}
          style={featureSheetStyles.featureRow}
          testID={`deep-space-settings-location-${city.name}`}
        >
          <View style={featureSheetStyles.featureRowText}>
            <Text style={featureSheetStyles.featureRowLabel}>{city.name}</Text>
            <Text style={featureSheetStyles.featureRowHint}>{`${city.latitudeDeg.toFixed(2)}°, ${city.longitudeDeg.toFixed(2)}°`}</Text>
          </View>
          {city.name === activeName && <Text style={featureSheetStyles.featureSelected}>✓</Text>}
        </Pressable>
      ))}
    </>
  );
}

function SettingsLocationSheet({
  automaticLocation,
  observer,
  onBack,
  onClose,
  onEnableAutomaticLocation,
  onManualCoordinateChange,
  onSelect,
}: {
  automaticLocation: boolean;
  observer: ReturnType<typeof useObserverLocation>['observer'];
  onBack: () => void;
  onClose: () => void;
  onEnableAutomaticLocation: () => Promise<void>;
  onManualCoordinateChange: (lat: number, lon: number, name?: string) => void;
  onSelect: (city: typeof OBSERVER_CITIES[number]) => void;
}) {
  const [editingCoordinate, setEditingCoordinate] = React.useState<'latitude' | 'longitude' | null>(null);
  const [cityPickerOpen, setCityPickerOpen] = React.useState(false);

  return (
    <>
      <FeatureSheet
        headerLeft={(
          <Pressable accessibilityLabel="返回设置" accessibilityRole="button" onPress={onBack} style={featureSheetStyles.featureClose}>
            <BackIcon />
          </Pressable>
        )}
        onClose={onClose}
        placement="top"
        scrollable
        testID="deep-space-settings-panel"
        title="所在位置"
      >
        <Pressable
          accessibilityLabel="使用自动定位"
          accessibilityRole="switch"
          accessibilityState={{ checked: automaticLocation }}
          onPress={onEnableAutomaticLocation}
          style={featureSheetStyles.featureRow}
          testID="deep-space-settings-auto-location-toggle"
        >
          <Text style={featureSheetStyles.featureRowLabel}>使用自动定位</Text>
          <View style={[styles.settingsSwitchTrack, automaticLocation && styles.settingsSwitchTrackOn]}>
            <View style={[styles.settingsSwitchThumb, automaticLocation && styles.settingsSwitchThumbOn]} />
          </View>
        </Pressable>
        <LocationCoordinateRows
          observer={observer}
          onOpenCityPicker={() => setCityPickerOpen(true)}
          onOpenLatitude={() => setEditingCoordinate('latitude')}
          onOpenLongitude={() => setEditingCoordinate('longitude')}
        />
        <LocationWorldMap
          latitudeDeg={observer.latitudeDeg}
          longitudeDeg={observer.longitudeDeg}
          onSelectCoordinate={(lat, lon) => {
            onManualCoordinateChange(lat, lon, '自定义位置');
          }}
        />
        <PresetCityList activeName={observer.name} onSelect={onSelect} />
      </FeatureSheet>
      <CoordinateInputDialog
        initialValue={editingCoordinate === 'latitude' ? observer.latitudeDeg : observer.longitudeDeg}
        kind={editingCoordinate ?? 'latitude'}
        onCancel={() => setEditingCoordinate(null)}
        onConfirm={(val) => {
          if (editingCoordinate === 'latitude') {
            onManualCoordinateChange(val, observer.longitudeDeg);
          }
          else if (editingCoordinate === 'longitude') {
            onManualCoordinateChange(observer.latitudeDeg, val);
          }
          setEditingCoordinate(null);
        }}
        visible={editingCoordinate !== null}
      />
      <CityPickerModal
        currentCity={observer.name}
        onCancel={() => setCityPickerOpen(false)}
        onSelect={(city) => {
          onSelect(city);
          setCityPickerOpen(false);
        }}
        visible={cityPickerOpen}
      />
    </>
  );
}

function AdvancedStartTimeRow({
  onSelectPolicy,
  policy,
}: {
  onSelectPolicy: (p: StartTimePolicy) => void;
  policy: StartTimePolicy;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Pressable
        accessibilityLabel="开始时间"
        accessibilityRole="button"
        onPress={() => setOpen(v => !v)}
        style={featureSheetStyles.featureRow}
        testID="deep-space-settings-start-time"
      >
        <Text style={featureSheetStyles.featureRowLabel}>开始时间</Text>
        <View style={styles.advancedTimePicker}>
          <Text style={styles.advancedTimePickerText}>{policy === 'now' ? '现在' : '沿用上次查看时间'}</Text>
          <Text style={styles.advancedTimePickerArrow}>{open ? '▲' : '▼'}</Text>
        </View>
      </Pressable>
      {open && (
        <View style={styles.advancedTimePickerDropdown}>
          <Pressable
            accessibilityLabel="现在"
            accessibilityRole="button"
            onPress={() => {
              onSelectPolicy('now');
              setOpen(false);
            }}
            style={styles.advancedTimePickerOption}
            testID="deep-space-settings-start-time-now"
          >
            <Text style={[styles.advancedTimePickerOptionText, policy === 'now' && styles.advancedTimePickerOptionSelected]}>
              现在
            </Text>
            {policy === 'now' && <Text style={featureSheetStyles.featureSelected}>✓</Text>}
          </Pressable>
          <Pressable
            accessibilityLabel="沿用上次查看时间"
            accessibilityRole="button"
            onPress={() => {
              onSelectPolicy('last_view');
              setOpen(false);
            }}
            style={styles.advancedTimePickerOption}
            testID="deep-space-settings-start-time-last"
          >
            <Text style={[styles.advancedTimePickerOptionText, policy === 'last_view' && styles.advancedTimePickerOptionSelected]}>
              沿用上次查看时间
            </Text>
            {policy === 'last_view' && <Text style={featureSheetStyles.featureSelected}>✓</Text>}
          </Pressable>
        </View>
      )}
    </>
  );
}

function AdvancedLimitMagBlock({
  enabled,
  onChangeValue,
  onToggle,
  value,
}: {
  enabled: boolean;
  onChangeValue: (val: number) => void;
  onToggle: () => void;
  value: number;
}) {
  return (
    <View style={styles.advancedSliderBlock}>
      <Pressable
        accessibilityLabel="限制星等"
        accessibilityRole="switch"
        accessibilityState={{ checked: enabled }}
        onPress={onToggle}
        style={featureSheetStyles.featureRow}
        testID="deep-space-settings-limitmag-toggle"
      >
        <Text style={featureSheetStyles.featureRowLabel}>限制星等</Text>
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: 12 }}>
          {enabled && <Text style={styles.advancedBrightnessValue}>{value.toFixed(1)}</Text>}
          <View style={[styles.settingsSwitchTrack, enabled && styles.settingsSwitchTrackOn]}>
            <View style={[styles.settingsSwitchThumb, enabled && styles.settingsSwitchThumbOn]} />
          </View>
        </View>
      </Pressable>
      <AdvancedSlider
        disabled={!enabled}
        max={12.0}
        min={3.5}
        onChange={onChangeValue}
        step={0.1}
        testID="deep-space-settings-limitmag-slider"
        value={value}
      />
    </View>
  );
}

function SettingsAdvancedSheet({
  onBack,
  onClose,
  settings,
}: {
  onBack: () => void;
  onClose: () => void;
  settings: ReturnType<typeof useStellariumSettings>;
}) {
  return (
    <FeatureSheet
      headerLeft={(
        <Pressable
          accessibilityLabel="返回设置"
          accessibilityRole="button"
          onPress={onBack}
          style={featureSheetStyles.featureClose}
          testID="deep-space-settings-advanced-back"
        >
          <BackIcon />
        </Pressable>
      )}
      onClose={onClose}
      placement="top"
      testID="deep-space-settings-advanced-panel"
      title="高级的"
    >
      <AdvancedStartTimeRow onSelectPolicy={settings.setStartTimePolicy} policy={settings.startTimePolicy} />
      <Pressable
        accessibilityLabel="全屏"
        accessibilityRole="switch"
        accessibilityState={{ checked: settings.fullscreen }}
        onPress={() => settings.setFullscreen(v => !v)}
        style={featureSheetStyles.featureRow}
        testID="deep-space-settings-fullscreen-toggle"
      >
        <Text style={featureSheetStyles.featureRowLabel}>全屏</Text>
        <View style={[styles.settingsSwitchTrack, settings.fullscreen && styles.settingsSwitchTrackOn]}>
          <View style={[styles.settingsSwitchThumb, settings.fullscreen && styles.settingsSwitchThumbOn]} />
        </View>
      </Pressable>
      <AdvancedLimitMagBlock
        enabled={settings.limitMagEnabled}
        onChangeValue={settings.setLimitMagValue}
        onToggle={() => settings.setLimitMagEnabled(v => !v)}
        value={settings.limitMagValue}
      />
      <View style={styles.advancedSliderBlock}>
        <View style={featureSheetStyles.featureRow}>
          <Text style={featureSheetStyles.featureRowLabel}>亮度</Text>
          <Text style={styles.advancedBrightnessValue}>{settings.brightness.toFixed(1)}</Text>
        </View>
        <AdvancedSlider
          max={5.0}
          min={0.2}
          onChange={settings.setBrightness}
          step={0.1}
          testID="deep-space-settings-brightness-slider"
          value={settings.brightness}
        />
      </View>
    </FeatureSheet>
  );
}

function SettingsResetDialog({
  onCancel,
  onConfirm,
  visible,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  visible: boolean;
}) {
  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={visible}>
      <View style={styles.modalOverlay}>
        <View style={styles.dialogCard} testID="deep-space-settings-reset-dialog">
          <Text style={styles.dialogTitle}>重置设置</Text>
          <Text style={styles.dialogMessage}>这将重置全部设置。是否确认？</Text>
          <View style={styles.dialogButtons}>
            <Pressable accessibilityLabel="取消" accessibilityRole="button" onPress={onCancel} style={styles.dialogButton}>
              <Text style={styles.dialogButtonTextCancel}>取消</Text>
            </Pressable>
            <Pressable accessibilityLabel="确定" accessibilityRole="button" onPress={onConfirm} style={[styles.dialogButton, styles.dialogButtonPrimary]}>
              <Text style={styles.dialogButtonTextPrimary}>确定</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function SettingsRootSheet({
  compassFollowing,
  onClose,
  onOpenAdvanced,
  onOpenLocation,
  onRequestReset,
  onToggleCompassFollowing,
}: {
  compassFollowing: boolean;
  onClose: () => void;
  onOpenAdvanced: () => void;
  onOpenLocation: () => void;
  onRequestReset: () => void;
  onToggleCompassFollowing: () => void;
}) {
  return (
    <FeatureSheet onClose={onClose} placement="top" testID="deep-space-settings-panel" title="设置">
      <Pressable
        accessibilityLabel="传感器"
        accessibilityRole="switch"
        accessibilityState={{ checked: compassFollowing }}
        onPress={onToggleCompassFollowing}
        style={featureSheetStyles.featureRow}
        testID="deep-space-settings-sensor-toggle"
      >
        <View style={featureSheetStyles.featureRowText}>
          <Text style={featureSheetStyles.featureRowLabel}>传感器</Text>
          <Text style={featureSheetStyles.featureRowHint}>自动</Text>
        </View>
        <View style={[styles.settingsSwitchTrack, compassFollowing && styles.settingsSwitchTrackOn]}>
          <View style={[styles.settingsSwitchThumb, compassFollowing && styles.settingsSwitchThumbOn]} />
        </View>
      </Pressable>
      <Pressable
        accessibilityLabel="所在位置"
        accessibilityRole="button"
        onPress={onOpenLocation}
        style={featureSheetStyles.featureRow}
        testID="deep-space-settings-location-entry"
      >
        <Text style={featureSheetStyles.featureRowLabel}>所在位置</Text>
        <Text style={featureSheetStyles.featureSelected}>›</Text>
      </Pressable>
      <Pressable
        accessibilityLabel="高级的"
        accessibilityRole="button"
        onPress={onOpenAdvanced}
        style={featureSheetStyles.featureRow}
        testID="deep-space-settings-advanced-entry"
      >
        <Text style={featureSheetStyles.featureRowLabel}>高级的</Text>
        <Text style={featureSheetStyles.featureSelected}>›</Text>
      </Pressable>
      <View style={styles.settingsSectionDivider} />
      <Pressable
        accessibilityLabel="重置设置"
        accessibilityRole="button"
        onPress={onRequestReset}
        style={featureSheetStyles.featureRow}
        testID="deep-space-settings-reset-entry"
      >
        <Text style={featureSheetStyles.featureRowLabel}>重置设置</Text>
      </Pressable>
    </FeatureSheet>
  );
}

function SettingsPanel({
  automaticLocation,
  compassFollowing,
  observer,
  onClose,
  onEnableAutomaticLocation,
  onManualCoordinateChange,
  onResetAll,
  onSelect,
  onToggleCompassFollowing,
  settings,
}: {
  automaticLocation: boolean;
  compassFollowing: boolean;
  observer: ReturnType<typeof useObserverLocation>['observer'];
  onClose: () => void;
  onEnableAutomaticLocation: () => Promise<void>;
  onManualCoordinateChange: (lat: number, lon: number, name?: string) => void;
  onResetAll?: () => void;
  onSelect: (city: typeof OBSERVER_CITIES[number]) => void;
  onToggleCompassFollowing: () => void;
  settings: ReturnType<typeof useStellariumSettings>;
}) {
  const [section, setSection] = React.useState<'root' | 'location' | 'advanced'>('root');
  const [resetDialogOpen, setResetDialogOpen] = React.useState(false);

  if (section === 'location') {
    return (
      <SettingsLocationSheet
        automaticLocation={automaticLocation}
        observer={observer}
        onBack={() => setSection('root')}
        onClose={onClose}
        onEnableAutomaticLocation={onEnableAutomaticLocation}
        onManualCoordinateChange={onManualCoordinateChange}
        onSelect={onSelect}
      />
    );
  }

  if (section === 'advanced') {
    return (
      <SettingsAdvancedSheet
        onBack={() => setSection('root')}
        onClose={onClose}
        settings={settings}
      />
    );
  }

  return (
    <>
      <SettingsRootSheet
        compassFollowing={compassFollowing}
        onClose={onClose}
        onOpenAdvanced={() => setSection('advanced')}
        onOpenLocation={() => setSection('location')}
        onRequestReset={() => setResetDialogOpen(true)}
        onToggleCompassFollowing={onToggleCompassFollowing}
      />
      <SettingsResetDialog
        onCancel={() => setResetDialogOpen(false)}
        onConfirm={() => {
          setResetDialogOpen(false);
          onResetAll?.();
          settings.resetSettings();
          showDeepSpaceFeedback({ message: '已恢复默认设置', tone: 'success' });
        }}
        visible={resetDialogOpen}
      />
    </>
  );
}

function ReferenceSearchSheet({ error, onChange, onClose, onSelectRecent, onSubmit, query, recentObjects }: ReferenceSearchSheetProps) {
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
        {!query && recentObjects && recentObjects.length > 0 && (
          <View style={styles.searchRecentList}>
            <Text style={styles.searchRecentTitle}>{translate('deep_space.recent_objects')}</Text>
            {recentObjects.map(object => (
              <Pressable
                accessibilityLabel={object.name}
                accessibilityRole="button"
                key={object.id}
                onPress={() => onSelectRecent(object)}
                style={styles.searchRecentRow}
                testID={`deep-space-search-recent-${object.id}`}
              >
                <Text style={styles.searchRecentName}>{object.name}</Text>
                {object.typeZh && <Text style={styles.searchRecentType}>{object.typeZh}</Text>}
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const AZIMUTH_PRESETS = [
  { deg: 0, labelKey: 'deep_space.compass_preset_north' as const },
  { deg: 90, labelKey: 'deep_space.compass_preset_east' as const },
  { deg: 180, labelKey: 'deep_space.compass_preset_south' as const },
  { deg: 270, labelKey: 'deep_space.compass_preset_west' as const },
] as const;

function AzimuthPresetPills({
  currentValue,
  onSelect,
}: {
  currentValue: string;
  onSelect: (deg: number) => void;
}) {
  return (
    <View style={styles.azimuthPresetRow}>
      {AZIMUTH_PRESETS.map(preset => (
        <Pressable
          accessibilityLabel={translate(preset.labelKey)}
          accessibilityRole="button"
          key={preset.deg}
          onPress={() => onSelect(preset.deg)}
          style={[
            styles.azimuthPresetPill,
            Number(currentValue.trim()) === preset.deg && styles.azimuthPresetPillActive,
          ]}
          testID={`deep-space-azimuth-preset-${preset.deg}`}
        >
          <Text
            style={[
              styles.azimuthPresetText,
              Number(currentValue.trim()) === preset.deg && styles.azimuthPresetTextActive,
            ]}
          >
            {translate(preset.labelKey)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function AzimuthDialogCard({
  currentAzimuth,
  onApply,
  onClose,
}: {
  currentAzimuth: number;
  onApply: (azimuthDeg: number) => void;
  onClose: () => void;
}) {
  const [value, setValue] = React.useState(`${Math.round(((currentAzimuth % 360) + 360) % 360)}`);
  const [error, setError] = React.useState(false);

  const handleConfirm = () => {
    const trimmed = value.trim();
    const num = Number(trimmed);
    if (!trimmed || Number.isNaN(num) || num < 0 || num > 360) {
      setError(true);
      return;
    }
    setError(false);
    onApply(num);
    onClose();
  };

  return (
    <Pressable
      accessibilityLabel={translate('deep_space.compass_custom_azimuth')}
      onPress={e => e.stopPropagation()}
      style={styles.azimuthDialogCard}
      testID="deep-space-azimuth-input-dialog"
    >
      <Text style={styles.dialogTitle}>{translate('deep_space.compass_custom_azimuth')}</Text>
      <Text style={styles.dialogMessage}>{translate('deep_space.compass_azimuth_hint')}</Text>

      <View style={styles.azimuthInputRow}>
        <TextInput
          accessibilityLabel={translate('deep_space.compass_azimuth_input_placeholder')}
          autoFocus
          keyboardType="numeric"
          maxLength={5}
          onChangeText={(text) => {
            setValue(text);
            if (error)
              setError(false);
          }}
          onSubmitEditing={handleConfirm}
          placeholder="0"
          placeholderTextColor="rgba(255, 255, 255, 0.3)"
          returnKeyType="done"
          selectTextOnFocus
          style={[styles.azimuthInput, error && styles.azimuthInputError]}
          testID="deep-space-azimuth-input"
          value={value}
        />
        <Text style={styles.azimuthUnit}>°</Text>
      </View>

      {error && (
        <Text style={styles.azimuthErrorText} testID="deep-space-azimuth-error">
          {translate('deep_space.compass_azimuth_invalid')}
        </Text>
      )}

      <AzimuthPresetPills
        currentValue={value}
        onSelect={(deg) => {
          setValue(`${deg}`);
          setError(false);
        }}
      />

      <View style={styles.dialogButtons}>
        <Pressable
          accessibilityLabel="取消"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.dialogButton}
          testID="deep-space-azimuth-cancel"
        >
          <Text style={styles.dialogButtonTextCancel}>取消</Text>
        </Pressable>
        <Pressable
          accessibilityLabel={translate('deep_space.compass_azimuth_apply')}
          accessibilityRole="button"
          onPress={handleConfirm}
          style={[styles.dialogButton, styles.dialogButtonPrimary]}
          testID="deep-space-azimuth-confirm"
        >
          <Text style={styles.dialogButtonTextPrimary}>{translate('deep_space.compass_azimuth_apply')}</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

function CompassAzimuthDialog({
  currentAzimuth,
  onApply,
  onClose,
  visible,
}: {
  currentAzimuth: number;
  onApply: (azimuthDeg: number) => void;
  onClose: () => void;
  visible: boolean;
}) {
  if (!visible)
    return null;

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <Pressable onPress={onClose} style={styles.modalOverlay}>
        <AzimuthDialogCard currentAzimuth={currentAzimuth} onApply={onApply} onClose={onClose} />
      </Pressable>
    </Modal>
  );
}

function Compass({
  azimuthDeg,
  onOpenInput,
}: {
  azimuthDeg: number;
  onOpenInput?: () => void;
}) {
  const normalizedAzimuth = Math.round(((azimuthDeg % 360) + 360) % 360);

  return (
    <View testID="deep-space-reference-compass" style={styles.compass} pointerEvents="box-none">
      <View
        pointerEvents="none"
        testID="deep-space-reference-compass-rose"
        style={[styles.compassRose, { transform: [{ rotate: `-${azimuthDeg}deg` }] }]}
      >
        <Svg testID="deep-space-reference-compass-instrument" height={112} viewBox="0 0 120 120" width={112}>
          <Defs>
            <RadialGradient cx="50%" cy="34%" id="compassBezel" r="68%">
              <Stop offset="0" stopColor="#4B6176" stopOpacity={0.45} />
              <Stop offset="0.48" stopColor="#17222D" stopOpacity={0.3} />
              <Stop offset="1" stopColor="#05080D" stopOpacity={0.22} />
            </RadialGradient>
            <RadialGradient cx="50%" cy="38%" id="compassFace" r="64%">
              <Stop offset="0" stopColor="#26364A" stopOpacity={0.35} />
              <Stop offset="0.62" stopColor="#101922" stopOpacity={0.2} />
              <Stop offset="1" stopColor="#060A10" stopOpacity={0.12} />
            </RadialGradient>
            <LinearGradient id="compassNorthNeedle" x1="0" x2="0" y1="0" y2="1">
              <Stop offset="0" stopColor="#FF8A7A" />
              <Stop offset="0.48" stopColor="#E8443A" />
              <Stop offset="1" stopColor="#8F171B" />
            </LinearGradient>
            <LinearGradient id="compassSouthNeedle" x1="0" x2="0" y1="0" y2="1">
              <Stop offset="0" stopColor="#F7FBFF" />
              <Stop offset="0.55" stopColor="#A8C4DC" />
              <Stop offset="1" stopColor="#506A80" />
            </LinearGradient>
          </Defs>
          <Circle cx={60} cy={60} fill="url(#compassBezel)" r={57} stroke="rgba(255,255,255,0.34)" strokeWidth={1.2} />
          <Circle cx={60} cy={60} fill="none" r={53} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
          <Circle cx={60} cy={60} fill="url(#compassFace)" r={50} stroke="rgba(126,180,232,0.35)" strokeWidth={1.2} />
          <Circle cx={60} cy={60} fill="none" opacity={0.35} r={41} stroke="rgba(255,255,255,0.16)" strokeDasharray="2 5" strokeWidth={1} />
          <Circle cx={60} cy={60} fill="none" r={31} stroke="rgba(93,164,255,0.2)" strokeWidth={1} />
          {COMPASS_MINOR_TICKS.map(angle => (
            <Line
              key={`minor-${angle}`}
              stroke="rgba(255,255,255,0.28)"
              strokeLinecap="round"
              strokeWidth={1}
              transform={`rotate(${angle} 60 60)`}
              x1={60}
              x2={60}
              y1={10}
              y2={14}
            />
          ))}
          {COMPASS_MAJOR_TICKS.map(angle => (
            <Line
              key={`major-${angle}`}
              stroke={angle % 90 === 0 ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.56)'}
              strokeLinecap="round"
              strokeWidth={angle % 90 === 0 ? 2.2 : 1.4}
              transform={`rotate(${angle} 60 60)`}
              x1={60}
              x2={60}
              y1={8}
              y2={angle % 90 === 0 ? 18 : 16}
            />
          ))}
          <Line opacity={0.16} stroke="#FFFFFF" strokeWidth={1} x1={60} x2={60} y1={24} y2={96} />
          <Line opacity={0.16} stroke="#FFFFFF" strokeWidth={1} x1={24} x2={96} y1={60} y2={60} />
          <SvgText fill="#FFFFFF" fontSize={12} fontWeight="700" textAnchor="middle" x={60} y={29}>北</SvgText>
          <SvgText fill="rgba(255,255,255,0.72)" fontSize={11} fontWeight="600" textAnchor="middle" x={94} y={64}>东</SvgText>
          <SvgText fill="rgba(255,255,255,0.72)" fontSize={11} fontWeight="600" textAnchor="middle" x={60} y={103}>南</SvgText>
          <SvgText fill="rgba(255,255,255,0.72)" fontSize={11} fontWeight="600" textAnchor="middle" x={26} y={64}>西</SvgText>
          <Polygon fill="url(#compassNorthNeedle)" points="60,18 66,60 60,70 54,60" stroke="rgba(255,255,255,0.38)" strokeWidth={0.8} />
          <Polygon fill="url(#compassSouthNeedle)" points="60,102 66,60 60,50 54,60" stroke="rgba(5,10,16,0.42)" strokeWidth={0.8} />
          <Circle cx={60} cy={60} fill="rgba(10, 17, 24, 0.65)" r={8.5} stroke="rgba(255,255,255,0.72)" strokeWidth={1.4} />
          <Circle cx={60} cy={60} fill="#D9F0FF" r={2.6} />
        </Svg>
      </View>
      <Svg height={112} pointerEvents="none" style={styles.compassFixedOverlay} viewBox="0 0 120 120" width={112}>
        <Path d="M60 3 L68 16 H52 Z" fill="#F6FAFF" stroke="rgba(17,24,32,0.55)" strokeWidth={1} />
        <Line stroke="rgba(255,255,255,0.82)" strokeLinecap="round" strokeWidth={1.4} x1={60} x2={60} y1={16} y2={22} />
        <Path d="M28 38 C40 22, 67 17, 89 30" fill="none" stroke="rgba(255,255,255,0.24)" strokeLinecap="round" strokeWidth={3} />
      </Svg>
      <Pressable
        accessibilityHint="点击自定义输入方位角"
        accessibilityLabel={`当前方位角 ${normalizedAzimuth}度`}
        accessibilityRole="button"
        hitSlop={8}
        onPress={onOpenInput}
        style={({ pressed }) => [styles.compassReadout, pressed && styles.compassReadoutPressed]}
        testID="deep-space-reference-compass-azimuth-btn"
      >
        <Text testID="deep-space-reference-compass-azimuth" style={styles.compassAzimuthText}>
          {normalizedAzimuth}
          °
        </Text>
      </Pressable>
    </View>
  );
}

function TimeControl({
  clock,
  isCustomTime = false,
  onPress,
  onReturnToNow,
}: {
  clock: Date;
  isCustomTime?: boolean;
  onPress?: () => void;
  onReturnToNow: () => void;
}) {
  const hours = `${clock.getHours()}`.padStart(2, '0');
  const minutes = `${clock.getMinutes()}`.padStart(2, '0');
  const formattedTime = `${hours}:${minutes}`;

  return (
    <Pressable
      accessibilityHint="点击打开时间调节滑块"
      accessibilityLabel={`当前时间 ${formattedTime}`}
      accessibilityRole="button"
      hitSlop={6}
      onPress={onPress}
      style={[styles.timeControl, isCustomTime && styles.timeControlCustom]}
      testID="deep-space-reference-time"
    >
      <Pressable
        accessibilityLabel={translate('deep_space.return_to_now')}
        accessibilityRole="button"
        hitSlop={6}
        onPress={(e) => {
          e.stopPropagation();
          onReturnToNow();
        }}
        style={[styles.historyButton, isCustomTime && styles.historyButtonActive]}
      >
        <HistoryIcon active={isCustomTime} />
      </Pressable>
      <Text style={[styles.timeText, isCustomTime && styles.timeTextCustom]}>{formattedTime}</Text>
    </Pressable>
  );
}

function TimeSliderTrack({
  minutesOfDay,
  onMinutesChange,
}: {
  minutesOfDay: number;
  onMinutesChange: (mins: number) => void;
}) {
  const [width, setWidth] = React.useState(300);
  const widthRef = React.useRef(300);
  widthRef.current = width;

  const progressRatio = Math.max(0, Math.min(1, minutesOfDay / 1439));

  const updateFromX = (x: number) => {
    const w = widthRef.current || 1;
    const ratio = Math.max(0, Math.min(1, x / w));
    onMinutesChange(Math.round(ratio * 1439));
  };

  return (
    <View
      onLayout={e => setWidth(e.nativeEvent.layout.width)}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={e => updateFromX(e.nativeEvent.locationX)}
      onResponderMove={e => updateFromX(e.nativeEvent.locationX)}
      onStartShouldSetResponder={() => true}
      style={styles.timeSliderTrackContainer}
      testID="deep-space-time-slider"
    >
      <View style={styles.timeSliderRail}>
        <View style={[styles.timeSliderFill, { width: `${progressRatio * 100}%` }]} />
      </View>
      <View
        pointerEvents="none"
        style={[
          styles.timeSliderThumb,
          { left: Math.max(0, Math.min(width - 22, progressRatio * width - 11)) },
        ]}
      >
        <View style={styles.timeSliderThumbInner} />
      </View>
    </View>
  );
}

function TimeSliderHeader({
  clock,
  isCustomTime,
  onClose,
  onReturnToNow,
  onStepDate,
}: {
  clock: Date;
  isCustomTime: boolean;
  onClose: () => void;
  onReturnToNow: () => void;
  onStepDate: (deltaDays: number) => void;
}) {
  const year = clock.getFullYear();
  const month = clock.getMonth() + 1;
  const date = clock.getDate();
  const hours = `${clock.getHours()}`.padStart(2, '0');
  const minutes = `${clock.getMinutes()}`.padStart(2, '0');

  return (
    <View style={styles.timeSliderHeader}>
      <View style={styles.timeDateStepper}>
        <Pressable
          accessibilityLabel="前一天"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => onStepDate(-1)}
          style={styles.timeStepBtn}
          testID="deep-space-time-date-prev"
        >
          <Text style={styles.timeStepBtnText}>‹</Text>
        </Pressable>
        <Text style={styles.timeDateValue} testID="deep-space-time-date-value">
          {`${year}年${month}月${date}日`}
        </Text>
        <Pressable
          accessibilityLabel="后一天"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => onStepDate(1)}
          style={styles.timeStepBtn}
          testID="deep-space-time-date-next"
        >
          <Text style={styles.timeStepBtnText}>›</Text>
        </Pressable>
      </View>

      <View style={styles.timeClockBlock}>
        <Text style={styles.timeClockValue} testID="deep-space-time-clock-value">
          {`${hours}:${minutes}`}
        </Text>
      </View>

      <View style={styles.timeHeaderActions}>
        <Pressable
          accessibilityLabel={translate('deep_space.return_to_now')}
          accessibilityRole="button"
          hitSlop={6}
          onPress={onReturnToNow}
          style={[styles.timeNowButton, isCustomTime && styles.timeNowButtonActive]}
          testID="deep-space-time-now-button"
        >
          <Text style={[styles.timeNowButtonText, isCustomTime && styles.timeNowButtonTextActive]}>
            {isCustomTime ? '回到实时' : '实时'}
          </Text>
        </Pressable>

        <Pressable
          accessibilityLabel="关闭时间调节"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onClose}
          style={styles.timeCloseButton}
          testID="deep-space-time-close-button"
        >
          <CloseIcon />
        </Pressable>
      </View>
    </View>
  );
}

const TIME_PLAYBACK_SPEEDS = [1, 10, 60, 600] as const;
type TimePlaybackSpeed = (typeof TIME_PLAYBACK_SPEEDS)[number];

function TimePlaybackControls({
  isPlaying,
  onSelectSpeed,
  onTogglePlayback,
  playbackSpeed,
}: {
  isPlaying: boolean;
  onSelectSpeed: (speed: TimePlaybackSpeed) => void;
  onTogglePlayback: () => void;
  playbackSpeed: TimePlaybackSpeed;
}) {
  return (
    <View style={styles.timePlaybackRow}>
      <Pressable
        accessibilityLabel={isPlaying ? '暂停时间预览' : '播放时间预览'}
        accessibilityRole="button"
        accessibilityState={{ selected: isPlaying }}
        onPress={onTogglePlayback}
        style={[styles.timePlaybackButton, isPlaying && styles.timePlaybackButtonActive]}
        testID="deep-space-time-playback-toggle"
      >
        <Text style={[styles.timePlaybackButtonText, isPlaying && styles.timePlaybackButtonTextActive]}>
          {isPlaying ? 'Ⅱ 暂停' : '▶ 播放'}
        </Text>
      </Pressable>
      {TIME_PLAYBACK_SPEEDS.map(speed => (
        <Pressable
          accessibilityLabel={`${speed} 倍时间速度`}
          accessibilityRole="button"
          accessibilityState={{ selected: speed === playbackSpeed }}
          key={speed}
          onPress={() => onSelectSpeed(speed)}
          style={[styles.timeSpeedButton, speed === playbackSpeed && styles.timeSpeedButtonActive]}
          testID={`deep-space-time-speed-${speed}`}
        >
          <Text style={[styles.timeSpeedButtonText, speed === playbackSpeed && styles.timeSpeedButtonTextActive]}>{`${speed}×`}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function TimeHourControls({ onStepHour }: { onStepHour: (deltaHours: number) => void }) {
  return (
    <View style={styles.timeHourRow}>
      <Pressable
        accessibilityLabel="快退1小时"
        accessibilityRole="button"
        hitSlop={6}
        onPress={() => onStepHour(-1)}
        style={styles.timeHourBtn}
        testID="deep-space-time-hour-prev"
      >
        <Text style={styles.timeHourBtnText}>‹ -1小时</Text>
      </Pressable>
      <Text style={styles.timeSliderHint}>左右拖动滑块模拟星空运转</Text>
      <Pressable
        accessibilityLabel="快进1小时"
        accessibilityRole="button"
        hitSlop={6}
        onPress={() => onStepHour(1)}
        style={styles.timeHourBtn}
        testID="deep-space-time-hour-next"
      >
        <Text style={styles.timeHourBtnText}>+1小时 ›</Text>
      </Pressable>
    </View>
  );
}

function TimeSliderSheet({
  clock,
  insetsBottom,
  isCustomTime,
  onClose,
  onReturnToNow,
  onUpdateTime,
}: {
  clock: Date;
  insetsBottom: number;
  isCustomTime: boolean;
  onClose: () => void;
  onReturnToNow: () => void;
  onUpdateTime: (date: Date) => void;
}) {
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [playbackSpeed, setPlaybackSpeed] = React.useState<TimePlaybackSpeed>(1);
  const minutesOfDay = clock.getHours() * 60 + clock.getMinutes();

  React.useEffect(() => {
    if (!isPlaying) {
      return undefined;
    }

    const interval = globalThis.setInterval(() => {
      const next = new Date(clock);
      next.setSeconds(next.getSeconds() + playbackSpeed);
      onUpdateTime(next);
    }, 1000);

    return () => globalThis.clearInterval(interval);
  }, [clock, isPlaying, onUpdateTime, playbackSpeed]);

  const handleReturnToNow = () => {
    setIsPlaying(false);
    onReturnToNow();
  };

  const handleStepDate = (deltaDays: number) => {
    const next = new Date(clock);
    next.setDate(next.getDate() + deltaDays);
    onUpdateTime(next);
  };

  const handleStepHour = (deltaHours: number) => {
    const next = new Date(clock);
    next.setHours(next.getHours() + deltaHours);
    onUpdateTime(next);
  };

  const handleMinuteChange = (totalMinutes: number) => {
    const next = new Date(clock);
    next.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0);
    onUpdateTime(next);
  };

  return (
    <View pointerEvents="box-none" style={[styles.timeSliderOverlay, { paddingBottom: insetsBottom + 20 }]}>
      <Pressable accessibilityLabel="关闭时间设置" accessibilityRole="button" onPress={onClose} style={styles.timeSliderScrim} />
      <View style={styles.timeSliderCard} testID="deep-space-time-slider-sheet">
        <TimeSliderHeader
          clock={clock}
          isCustomTime={isCustomTime}
          onClose={onClose}
          onReturnToNow={handleReturnToNow}
          onStepDate={handleStepDate}
        />

        <TimeHourControls onStepHour={handleStepHour} />

        <TimePlaybackControls
          isPlaying={isPlaying}
          onSelectSpeed={setPlaybackSpeed}
          onTogglePlayback={() => setIsPlaying(value => !value)}
          playbackSpeed={playbackSpeed}
        />

        <TimeSliderTrack minutesOfDay={minutesOfDay} onMinutesChange={handleMinuteChange} />

        <View style={styles.timeTicksRow}>
          <Text style={styles.timeTickText}>00:00</Text>
          <Text style={styles.timeTickText}>06:00</Text>
          <Text style={styles.timeTickText}>12:00</Text>
          <Text style={styles.timeTickText}>18:00</Text>
          <Text style={styles.timeTickText}>24:00</Text>
        </View>
      </View>
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
    <Svg height={38} viewBox="0 0 48 48" width={38}>
      <Circle cx={24} cy={24} fill="none" r={17} stroke={color} strokeWidth={2.4} />
      <Line stroke={color} strokeWidth={2.4} x1={7} x2={41} y1={24} y2={24} />
      <Line stroke={color} strokeWidth={2.4} x1={24} x2={24} y1={7} y2={41} />
      <Path d="M24 7 C 14 13, 14 35, 24 41 M24 7 C 34 13, 34 35, 24 41" fill="none" stroke={color} strokeWidth={2.2} />
      <Path d="M9.5 16 C 16 20, 32 20, 38.5 16 M9.5 32 C 16 28, 32 28, 38.5 32" fill="none" stroke={color} strokeWidth={2.0} />
    </Svg>
  );
}

function ConstellationIcon({ active }: { active: boolean }) {
  const color = active ? '#FFFFFF' : 'rgba(255,255,255,0.44)';
  return (
    <Svg height={38} viewBox="0 0 48 48" width={38}>
      <Path
        d="M24 11 L13 35 L35 33 Z"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.6}
      />
      <Polygon fill={color} points="24,6 26,9.5 29.5,11 26,12.5 24,16 22,12.5 18.5,11 22,9.5" />
      <Polygon fill={color} points="13,30 15,33.5 18.5,35 15,36.5 13,40 11,36.5 7.5,35 11,33.5" />
      <Polygon fill={color} points="35,28 37,31.5 40.5,33 37,34.5 35,38 33,34.5 29.5,33 33,31.5" />
    </Svg>
  );
}

function LandscapeIcon({ active }: { active: boolean }) {
  const color = active ? '#FFFFFF' : 'rgba(255,255,255,0.44)';
  return (
    <Svg height={38} viewBox="0 0 48 48" width={38}>
      <Circle cx={18} cy={16} fill={color} r={6.5} />
      <Path d="M7 38 C 7 27, 29 27, 29 38 Z" fill={color} />
      <Circle cx={34} cy={22} fill={color} r={4.5} />
      <Path d="M27 38 C 27 30, 41 30, 41 38 Z" fill={color} />
    </Svg>
  );
}

function AtmosphereIcon({ active }: { active: boolean }) {
  const color = active ? '#FFFFFF' : 'rgba(255,255,255,0.44)';
  return (
    <Svg height={38} viewBox="0 0 48 48" width={38}>
      <Polygon fill={color} points="34,6 36,11 41,12 37,15 38,20 33,18 29,21 31,16 27,13 32,12" />
      <Path
        d="M13 38 L36 38 C 40 38, 42 35, 41 31 C 40 27, 36 26, 33 26 C 32 20, 24 19, 21 24 C 18 23, 13 25, 13 29 C 10 30, 9 34, 13 38 Z"
        fill={color}
      />
    </Svg>
  );
}

function LabelsIcon({ active }: { active: boolean }) {
  const color = active ? '#FFFFFF' : 'rgba(255,255,255,0.44)';
  const textColor = active ? '#14181F' : '#14181F';
  return (
    <Svg height={38} viewBox="0 0 48 48" width={38}>
      <Rect fill={color} height={20} rx={4} width={36} x={6} y={11} />
      <SvgText
        fill={textColor}
        fontSize="12"
        fontWeight="bold"
        textAnchor="middle"
        x="24"
        y="25.5"
      >
        ABC
      </SvgText>
      <Circle cx={24} cy={38} fill={color} r={3.8} />
    </Svg>
  );
}

function NightModeIcon({ active }: { active: boolean }) {
  const color = active ? '#FF5C5C' : 'rgba(255,255,255,0.44)';
  return (
    <Svg height={38} viewBox="0 0 48 48" width={38}>
      <Path
        d="M6 24 C 13 13, 35 13, 42 24 C 35 35, 13 35, 6 24 Z"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.8}
      />
      <Circle cx={24} cy={24} fill="none" r={6.8} stroke={color} strokeWidth={2.4} />
      <Circle cx={24} cy={24} fill={color} r={3.2} />
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

function BackIcon() {
  return (
    <Svg height={28} viewBox="0 0 28 28" width={28}>
      <Path d="M18 5 9 14l9 9M10 14h11" fill="none" stroke={OVERLAY.text} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} />
    </Svg>
  );
}

function HelpIcon() {
  return (
    <Svg height={26} viewBox="0 0 26 26" width={26}>
      <Circle cx={13} cy={13} fill="none" r={10} stroke={OVERLAY.text} strokeWidth={1.8} />
      <Path d="M10.2 10.3a3 3 0 1 1 5.3 1.9c-1.3 1.2-2.5 1.8-2.5 3.5" fill="none" stroke={OVERLAY.text} strokeLinecap="round" strokeWidth={1.8} />
      <Circle cx={13} cy={18.7} fill={OVERLAY.text} r={1.1} />
    </Svg>
  );
}

function ExitIcon() {
  return (
    <Svg height={26} viewBox="0 0 26 26" width={26}>
      <Line stroke={OVERLAY.text} strokeLinecap="round" strokeWidth={2} x1={5} x2={21} y1={5} y2={21} />
      <Line stroke={OVERLAY.text} strokeLinecap="round" strokeWidth={2} x1={21} x2={5} y1={5} y2={21} />
    </Svg>
  );
}

function HistoryIcon({ active = false }: { active?: boolean }) {
  const color = active ? '#93C5FD' : OVERLAY.text;
  return (
    <Svg height={29} viewBox="0 0 32 32" width={29}>
      <Path d="M9 12V6l-5 5 5 5v-4a9 9 0 1 1-1 12" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  azimuthDialogCard: {
    backgroundColor: OVERLAY.drawer,
    borderColor: OVERLAY.hairline,
    borderRadius: 16,
    borderWidth: 1,
    padding: 22,
    width: '84%',
    maxWidth: 340,
  },
  azimuthInputRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 10,
    marginTop: 6,
  },
  azimuthInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    borderWidth: 1,
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '700',
    height: 52,
    minWidth: 120,
    paddingHorizontal: 16,
    textAlign: 'center',
  },
  azimuthInputError: {
    borderColor: '#EF4444',
  },
  azimuthUnit: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 24,
    fontWeight: '600',
    marginLeft: 8,
  },
  azimuthErrorText: {
    color: '#F87171',
    fontSize: 12,
    marginBottom: 10,
    textAlign: 'center',
  },
  azimuthPresetRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 18,
    marginTop: 4,
  },
  azimuthPresetPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  azimuthPresetPillActive: {
    backgroundColor: 'rgba(74, 144, 226, 0.32)',
    borderColor: '#60A5FA',
  },
  azimuthPresetText: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 12,
    fontWeight: '600',
  },
  azimuthPresetTextActive: {
    color: '#FFFFFF',
  },
  timePlaybackButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    minWidth: 68,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  timePlaybackButtonActive: {
    backgroundColor: 'rgba(74, 144, 226, 0.32)',
    borderColor: '#60A5FA',
  },
  timePlaybackButtonText: {
    color: 'rgba(255, 255, 255, 0.68)',
    fontSize: 11,
    fontWeight: '600',
  },
  timePlaybackButtonTextActive: {
    color: '#FFFFFF',
  },
  timePlaybackRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
  },
  timeSpeedButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.045)',
    borderColor: 'rgba(255, 255, 255, 0.10)',
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minWidth: 36,
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  timeSpeedButtonActive: {
    backgroundColor: 'rgba(74, 144, 226, 0.24)',
    borderColor: '#60A5FA',
  },
  timeSpeedButtonText: {
    color: 'rgba(255, 255, 255, 0.62)',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  timeSpeedButtonTextActive: {
    color: '#BFDBFE',
  },
  searchRecentList: {
    borderTopColor: OVERLAY.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: 14,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  searchRecentName: {
    color: OVERLAY.text,
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  searchRecentRow: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 42,
  },
  searchRecentTitle: {
    color: OVERLAY.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  searchRecentType: {
    color: OVERLAY.muted,
    fontSize: 13,
    marginLeft: 12,
  },

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
  compassCenterWrapper: {
    alignItems: 'center',
    height: 146,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  timeControlWrapper: {
    alignItems: 'flex-end',
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
    backgroundColor: 'rgba(16, 20, 26, 0.94)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 24,
    borderWidth: 1,
    bottom: 58,
    elevation: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    left: 0,
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 10,
    position: 'absolute',
    shadowColor: '#000000',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 18,
    width: 288,
  },
  gridQuickMenuHighlight: {
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    height: 1,
    left: 14,
    position: 'absolute',
    right: 14,
    top: 0,
  },
  quickControlButton: {
    alignItems: 'center',
    height: 76,
    justifyContent: 'center',
    paddingHorizontal: 2,
    paddingVertical: 4,
    width: '33.33%',
  },
  quickControlButtonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.94 }],
  },
  quickControlCell: {
    alignItems: 'center',
    borderRadius: 14,
    height: '100%',
    justifyContent: 'center',
    paddingVertical: 4,
    width: '100%',
  },
  quickIconWrapper: {
    alignItems: 'center',
    height: 42,
    justifyContent: 'center',
    position: 'relative',
    width: 42,
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
    backgroundColor: 'transparent',
  },
  quickControlCellNightActive: {
    backgroundColor: 'transparent',
  },
  quickControlLabel: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
    textAlign: 'center',
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
    paddingHorizontal: 16,
    zIndex: 99,
  },
  quickDetailScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  quickDetailCard: {
    backgroundColor: 'rgba(16, 20, 26, 0.94)',
    borderColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: 24,
    borderWidth: 1,
    elevation: 24,
    maxWidth: 440,
    overflow: 'hidden',
    paddingBottom: 8,
    shadowColor: '#000000',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 20,
    width: '100%',
  },
  quickDetailHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  quickDetailTitleBlock: {
    flex: 1,
    paddingRight: 12,
  },
  quickDetailTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  quickDetailSubtitle: {
    color: 'rgba(255, 255, 255, 0.52)',
    fontSize: 11,
    marginTop: 2,
  },
  quickDetailClose: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 15,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  quickDetailDivider: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    height: 1,
    marginHorizontal: 14,
  },
  quickDetailList: {
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  quickDetailRow: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 46,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  quickStepper: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 14,
    flexDirection: 'row',
    paddingHorizontal: 2,
  },
  quickStepperArrow: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  quickStepperArrowText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '500',
    lineHeight: 24,
  },
  quickStepperValue: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    minWidth: 56,
    textAlign: 'center',
  },
  quickDetailRowText: {
    flex: 1,
    paddingRight: 14,
  },
  quickDetailRowLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  quickDetailRowHint: {
    color: 'rgba(255, 255, 255, 0.48)',
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  quickDetailSwitch: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: 12,
    height: 24,
    justifyContent: 'center',
    paddingHorizontal: 2,
    width: 40,
  },
  quickDetailSwitchActive: {
    backgroundColor: '#2B82F6',
  },
  quickDetailKnob: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    height: 20,
    width: 20,
  },
  quickDetailKnobActive: {
    alignSelf: 'flex-end',
  },
  quickDetailFooter: {
    alignItems: 'center',
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    borderTopWidth: 1,
    justifyContent: 'center',
    marginTop: 4,
    paddingTop: 6,
    paddingBottom: 4,
  },
  quickDetailResetButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  quickDetailResetButtonText: {
    color: '#88B0F5',
    fontSize: 13,
    fontWeight: '600',
  },
  nightModeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(145, 0, 0, 0.48)',
  },
  compass: {
    elevation: 4,
    height: 146,
    shadowColor: '#000000',
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    width: 112,
  },
  compassRose: {
    height: 112,
    left: 0,
    position: 'absolute',
    top: 0,
    width: 112,
  },
  compassFixedOverlay: {
    left: 0,
    position: 'absolute',
    top: 0,
  },
  compassReadout: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(6, 12, 20, 0.65)',
    borderColor: 'rgba(126, 180, 232, 0.40)',
    borderRadius: 12,
    borderWidth: 1,
    bottom: 0,
    minWidth: 54,
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    position: 'absolute',
  },
  compassReadoutPressed: {
    backgroundColor: 'rgba(56, 132, 238, 0.42)',
    borderColor: 'rgba(126, 180, 232, 0.85)',
  },
  compassAzimuthText: {
    color: '#D9F0FF',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  timeControl: {
    alignItems: 'flex-end',
    minWidth: 78,
  },
  timeControlCustom: {
    opacity: 0.95,
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
  historyButtonActive: {
    backgroundColor: 'rgba(43, 130, 246, 0.85)',
    borderColor: 'rgba(167, 206, 255, 0.75)',
    borderWidth: 1,
  },
  timeText: {
    color: OVERLAY.text,
    fontSize: 24,
    fontVariant: ['tabular-nums'],
    fontWeight: '300',
    letterSpacing: 0.4,
  },
  timeTextCustom: {
    color: '#93C5FD',
    fontWeight: '600',
  },
  timeSliderOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    zIndex: 98,
  },
  timeSliderScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  timeSliderCard: {
    backgroundColor: 'rgba(20, 24, 30, 0.94)',
    borderColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 22,
    borderWidth: 1,
    elevation: 24,
    maxWidth: 440,
    overflow: 'hidden',
    paddingBottom: 14,
    paddingHorizontal: 16,
    paddingTop: 12,
    shadowColor: '#000000',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 20,
    width: '100%',
  },
  timeSliderHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  timeDateStepper: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 14,
    flexDirection: 'row',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  timeStepBtn: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    width: 24,
  },
  timeStepBtnText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '400',
  },
  timeDateValue: {
    color: '#E0E8F2',
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 4,
  },
  timeClockBlock: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeClockValue: {
    color: '#FFFFFF',
    fontSize: 20,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  timeHeaderActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  timeNowButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
    borderColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  timeNowButtonActive: {
    backgroundColor: 'rgba(43, 130, 246, 0.85)',
    borderColor: 'rgba(167, 206, 255, 0.75)',
  },
  timeNowButtonText: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 11.5,
    fontWeight: '600',
  },
  timeNowButtonTextActive: {
    color: '#FFFFFF',
  },
  timeCloseButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  timeHourRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 2,
  },
  timeHourBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  timeHourBtnText: {
    color: '#93C5FD',
    fontSize: 11,
    fontWeight: '500',
  },
  timeSliderHint: {
    color: 'rgba(255, 255, 255, 0.40)',
    fontSize: 10.5,
  },
  timeSliderTrackContainer: {
    height: 32,
    justifyContent: 'center',
    marginVertical: 2,
    position: 'relative',
    width: '100%',
  },
  timeSliderRail: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 4,
    height: 6,
    overflow: 'hidden',
    width: '100%',
  },
  timeSliderFill: {
    backgroundColor: '#3B82F6',
    borderRadius: 4,
    height: '100%',
  },
  timeSliderThumb: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#3B82F6',
    borderRadius: 11,
    borderWidth: 2,
    elevation: 4,
    height: 22,
    justifyContent: 'center',
    position: 'absolute',
    shadowColor: '#000000',
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    top: 5,
    width: 22,
  },
  timeSliderThumbInner: {
    backgroundColor: '#3B82F6',
    borderRadius: 3.5,
    height: 7,
    width: 7,
  },
  timeTicksRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingHorizontal: 2,
  },
  timeTickText: {
    color: 'rgba(255, 255, 255, 0.42)',
    fontSize: 10,
    fontVariant: ['tabular-nums'],
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
  drawerSectionDivider: {
    backgroundColor: OVERLAY.hairline,
    height: StyleSheet.hairlineWidth,
  },
  settingsSectionDivider: {
    backgroundColor: OVERLAY.hairline,
    height: StyleSheet.hairlineWidth,
  },
  settingsSwitchThumb: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    height: 24,
    left: 2,
    position: 'absolute',
    top: 2,
    width: 24,
  },
  settingsSwitchThumbOn: {
    left: 26,
  },
  settingsSwitchTrack: {
    backgroundColor: '#51565D',
    borderRadius: 20,
    height: 28,
    width: 52,
  },
  settingsSwitchTrackOn: {
    backgroundColor: '#4F6B9F',
  },
  advancedBrightnessValue: {
    color: '#83B4FF',
    fontSize: 16,
    fontWeight: '600',
  },
  advancedSliderBlock: {
    borderBottomColor: OVERLAY.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 14,
  },
  advancedSliderFill: {
    backgroundColor: '#64A6FF',
    borderRadius: 3,
    height: '100%',
  },
  advancedSliderRow: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  advancedSliderThumb: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    height: 20,
    marginLeft: -10,
    marginTop: -7,
    position: 'absolute',
    top: '50%',
    width: 20,
  },
  advancedSliderTrack: {
    backgroundColor: '#353941',
    borderRadius: 3,
    height: 6,
    position: 'relative',
    width: '100%',
  },
  advancedTimePicker: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  advancedTimePickerArrow: {
    color: OVERLAY.muted,
    fontSize: 12,
  },
  advancedTimePickerText: {
    color: OVERLAY.text,
    fontSize: 15,
  },
  locationValueRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  advancedTimePickerDropdown: {
    backgroundColor: '#26292E',
    borderBottomColor: OVERLAY.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingVertical: 4,
  },
  advancedTimePickerOption: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  advancedTimePickerOptionSelected: {
    color: '#83B4FF',
    fontWeight: '600',
  },
  advancedTimePickerOptionText: {
    color: OVERLAY.text,
    fontSize: 15,
  },
  exitFullscreenButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(20, 23, 28, 0.75)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    position: 'absolute',
    zIndex: 10,
  },
  exitFullscreenText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
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
  featureValue: {
    color: OVERLAY.text,
    fontSize: 18,
    paddingHorizontal: 20,
    paddingTop: 16,
    textAlign: 'center',
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
  labelsDetailCard: {
    backgroundColor: 'rgba(16, 20, 26, 0.94)',
    borderColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: 24,
    borderWidth: 1,
    elevation: 24,
    maxWidth: 440,
    overflow: 'hidden',
    paddingBottom: 14,
    paddingHorizontal: 20,
    paddingTop: 14,
    shadowColor: '#000000',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 20,
    width: '100%',
  },
  labelsDetailHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  labelsDetailClose: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 15,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  labelsDetailBackText: {
    color: '#FFFFFF',
    fontSize: 22,
    lineHeight: 24,
    textAlign: 'center',
  },
  labelsDetailTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  labelsDetailHeaderPlaceholder: {
    height: 30,
    width: 30,
  },
  labelsDetailBody: {
    gap: 14,
    marginBottom: 16,
  },
  labelSliderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 44,
  },
  labelSliderText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
    width: 72,
  },
  labelSliderTrackWrapper: {
    flex: 1,
    height: 36,
    justifyContent: 'center',
    position: 'relative',
  },
  labelSliderTrackBg: {
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 3,
    height: 6,
    overflow: 'hidden',
    width: '100%',
  },
  labelSliderTrackActive: {
    backgroundColor: '#88B0F5',
    borderRadius: 3,
    height: '100%',
  },
  labelSliderThumb: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(0, 0, 0, 0.15)',
    borderRadius: 11,
    borderWidth: 0.5,
    elevation: 4,
    height: 22,
    position: 'absolute',
    shadowColor: '#000000',
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    top: 7,
    width: 22,
  },
  labelsDetailFooter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
  },
  labelsResetButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  labelsResetButtonText: {
    color: '#88B0F5',
    fontSize: 16,
    fontWeight: '600',
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
