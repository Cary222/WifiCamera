/* eslint-disable max-lines-per-function */

import type { LandscapeCaptureMode, LandscapeRatio } from '../camera-store';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui';
import { translate } from '@/lib/i18n';
import { useCameraStore } from '../camera-store';
import { PreviewSurface, useLandscapeCameraPreview } from '../components/native-camera-preview';
import { getImage } from '../services/file-service';

import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronUpIcon,
  CloseIcon,
  CountdownIcon,
  ResetIcon,
  SheetMenuIcon,
  StopwatchIcon,
  WatermarkFlaskIcon,
} from './landscape-icons';
import { LandscapeRuler } from './landscape-ruler';

const BRAND = '#CBFF3C';
const SHEET_BG = '#141414';
const CARD_BG = '#1F1F1F';
const BOTTOM_BAR_BG = '#0A0A0A';
const PILL_BG = 'rgba(34,42,54,0.72)';
const PREVIEW_PILL_BG = 'rgba(34,42,54,0.38)';

const RATIO_16_9 = 0.5625;
/** Shutter diameter as a share of screen width, from the 402pt design board. */
const SHUTTER_SIZE_RATIO = 0.1890547263681592;
const SHUTTER_BORDER_RATIO = 0.043478260869565216;
const SHUTTER_BOTTOM_GAP = 32;
const BOTTOM_BAR_HEIGHT = 78;
/** Spare vertical space given to the top black bar, matching stock camera apps. */
const PREVIEW_TOP_SPARE_SHARE_16_9 = 0.25;
const PREVIEW_TOP_SPARE_SHARE_4_3 = 0.35;

const SHUTTER_VALUES = [
  0.001,
  0.00125,
  0.0016,
  0.002,
  0.0025,
  0.0033,
  0.004,
  0.005,
  0.0067,
  0.008,
  0.01,
  0.0125,
  0.0167,
  0.02,
  0.025,
  0.033,
  0.04,
  0.05,
  0.067,
  0.08,
  0.1,
  0.125,
  0.167,
  0.2,
  0.25,
  0.33,
  0.5,
  0.67,
  1,
];
const GAIN_VALUES = Array.from({ length: 41 }, (_, index) => index * 3);
const EV_VALUES = [-3, -2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3];
const WB_VALUES = [0, 2800, 3200, 3800, 4500, 5200, 5800, 6500, 7200, 8000];
const COUNT_VALUES = Array.from({ length: 50 }, (_, index) => index + 1);
const INTERVAL_VALUES = Array.from({ length: 61 }, (_, index) => index);
const COUNTDOWN_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 30];

function formatShutter(value: number): string {
  return value >= 1 ? `${value}` : `1/${Math.round(1 / value)}`;
}

type ToolCardProps = {
  icon?: React.ReactNode;
  label: string;
  active: boolean;
  textOnly?: boolean;
  onPress: () => void;
};

function ToolCard({ icon, label, active, textOnly, onPress }: ToolCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={{ backgroundColor: active ? BRAND : CARD_BG }}
      className="h-[92px] flex-1 items-center justify-center gap-2 rounded-2xl active:opacity-80"
    >
      {textOnly
        ? <Text className={`text-[21px] ${active ? 'text-black' : 'text-white'}`}>{label}</Text>
        : (
            <>
              {icon}
              <Text className={`text-[12px] ${active ? 'text-black' : 'text-white'}`}>{label}</Text>
            </>
          )}
    </Pressable>
  );
}

type ParamCardProps = {
  title: string;
  value: string;
  active: boolean;
  onPress: () => void;
};

function ParamCard({ title, value, active, onPress }: ParamCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={{ backgroundColor: active ? BRAND : CARD_BG }}
      className="h-[80px] flex-1 items-center justify-center gap-1 rounded-2xl active:opacity-80"
    >
      <Text className={`text-[12px] ${active ? 'text-black' : 'text-white'}`}>{title}</Text>
      <Text className={`text-[17px] ${active ? 'font-medium text-black' : 'text-white'}`}>{value}</Text>
    </Pressable>
  );
}

type ManualParam = 'wb' | 'shutter' | 'gain' | 'ev';

export function LandscapeCameraScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const connectionStatus = useCameraStore.use.connectionStatus();
  const lastCommandError = useCameraStore.use.lastCommandError();
  const newestCameraJpgUrl = useCameraStore.use.newestCameraJpgUrl();
  const newestStreamJpgUrl = useCameraStore.use.newestStreamJpgUrl();
  const shutterMode = useCameraStore.use.landscapeShutterMode();
  const captureMode = useCameraStore.use.landscapeCaptureMode();
  const captureState = useCameraStore.use.landscapeCaptureState();
  const countdownRemaining = useCameraStore.use.landscapeCountdownRemaining();
  const autoMode = useCameraStore.use.landscapeAutoMode();
  const manualExposure = useCameraStore.use.landscapeManualExposure();
  const manualGain = useCameraStore.use.landscapeManualGain();
  const whiteBalance = useCameraStore.use.landscapeWhiteBalance();
  const ev = useCameraStore.use.landscapeEv();
  const watermark = useCameraStore.use.landscapeWatermark();
  const ratio = useCameraStore.use.landscapeRatio();
  const timerPlan = useCameraStore.use.landscapeTimerPlan();
  const repeatState = useCameraStore.use.landscapeRepeatState();
  const repeatCurrent = useCameraStore.use.landscapeRepeatCurrent();
  const recordingState = useCameraStore.use.landscapeRecordingState();

  const setShutterMode = useCameraStore.use.setLandscapeShutterMode();
  const setCaptureMode = useCameraStore.use.setLandscapeCaptureMode();
  const setTimerPlan = useCameraStore.use.setLandscapeTimerPlan();
  const setWatermark = useCameraStore.use.setLandscapeWatermark();
  const setRatio = useCameraStore.use.setLandscapeRatio();
  const changeStreamingSetting = useCameraStore.use.changeStreamingSetting();
  const changeWhiteBalance = useCameraStore.use.changeWhiteBalance();
  const changeEv = useCameraStore.use.changeEv();
  const startLandscapeCapture = useCameraStore.use.startLandscapeCapture();
  const startLandscapeCountdown = useCameraStore.use.startLandscapeCountdown();
  const cancelLandscapeTimerCapture = useCameraStore.use.cancelLandscapeTimerCapture();
  const startLandscapeRepeat = useCameraStore.use.startLandscapeRepeat();
  const cancelLandscapeRepeat = useCameraStore.use.cancelLandscapeRepeat();
  const startLandscapeRecording = useCameraStore.use.startLandscapeRecording();
  const stopLandscapeRecording = useCameraStore.use.stopLandscapeRecording();

  // Preview geometry: the viewport is edge-to-edge and its height follows the
  // selected aspect ratio; leftover space is split 25/75 (16:9) or 35/65 (4:3).
  const ratioValue = ratio === '4:3' ? 0.75 : RATIO_16_9;
  const previewHeight = Math.min(screenHeight, screenWidth / ratioValue);
  const spareHeight = Math.max(0, screenHeight - previewHeight);
  const topShare = ratio === '16:9' ? PREVIEW_TOP_SPARE_SHARE_16_9 : PREVIEW_TOP_SPARE_SHARE_4_3;
  const previewTop = Math.max(Math.min(insets.top, spareHeight), Math.round(spareHeight * topShare));
  // The video surface keeps its maximum size so the ratio animation never
  // resizes it (resizing mid-animation stutters the stream on Android).
  const surfaceHeight = Math.min(screenHeight, screenWidth / RATIO_16_9);

  const animatedPreviewHeight = useSharedValue(previewHeight);
  const animatedPreviewTop = useSharedValue(previewTop);

  useEffect(() => {
    animatedPreviewHeight.value = withTiming(previewHeight, { duration: 220 });
    animatedPreviewTop.value = withTiming(previewTop, { duration: 220 });
  }, [animatedPreviewHeight, animatedPreviewTop, previewHeight, previewTop]);

  const previewStyle = useAnimatedStyle(() => ({
    top: animatedPreviewTop.value,
    height: animatedPreviewHeight.value,
  }));
  const topBarStyle = useAnimatedStyle(() => ({ top: animatedPreviewTop.value + 12 }));

  const shutterSize = Math.round(screenWidth * SHUTTER_SIZE_RATIO);
  const shutterBorder = Math.max(3, Math.round(shutterSize * SHUTTER_BORDER_RATIO));
  const shutterInner = shutterSize - 2 * shutterBorder - 2;

  const [sheetTarget, setSheetTarget] = useState<'tools' | 'manual'>('tools');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [burstOpen, setBurstOpen] = useState(false);
  const [activeParam, setActiveParam] = useState<ManualParam>('shutter');
  const [timedShootOn, setTimedShootOn] = useState(false);
  const [countdownOn, setCountdownOn] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState(3);
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);

  const { previewState, stream } = useLandscapeCameraPreview({
    mode: autoMode ? 'auto' : 'manual',
    manualExposure,
    manualGain,
  });

  const isConnected = connectionStatus === 'open';
  const isPro = shutterMode === 'pro';
  const isCapturing = captureState === 'capturing';
  const isCountingDown = captureState === 'countdown';
  const isRepeating = repeatState !== 'idle';
  const isRecording = recordingState === 'recording';
  const isRecordingBusy = recordingState === 'starting' || recordingState === 'processing';
  const latestJpgPath = newestStreamJpgUrl || newestCameraJpgUrl;

  useEffect(() => {
    let cancelled = false;
    if (!latestJpgPath)
      return;
    getImage(latestJpgPath)
      .then(uri => !cancelled && setThumbnailUri(uri))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [latestJpgPath]);

  const paramValues = useMemo(() => ({
    wb: whiteBalance === 0 ? 'AUTO' : `${whiteBalance}K`,
    shutter: formatShutter(manualExposure),
    gain: `${manualGain}dB`,
    ev: `${ev}`,
  }), [whiteBalance, ev, manualExposure, manualGain]);

  const handleShutterPress = useCallback(() => {
    if (isCountingDown)
      return cancelLandscapeTimerCapture();
    if (isRepeating)
      return cancelLandscapeRepeat();
    if (captureMode !== 'video') {
      if (timedShootOn)
        return startLandscapeRepeat();
      if (countdownOn)
        return startLandscapeCountdown(countdownSeconds);
      return startLandscapeCapture();
    }
    if (isRecording)
      return stopLandscapeRecording();
    if (!isRecordingBusy)
      startLandscapeRecording();
  }, [
    isCountingDown,
    isRepeating,
    captureMode,
    isRecording,
    isRecordingBusy,
    timedShootOn,
    countdownOn,
    countdownSeconds,
    cancelLandscapeTimerCapture,
    cancelLandscapeRepeat,
    stopLandscapeRecording,
    startLandscapeRecording,
    startLandscapeRepeat,
    startLandscapeCountdown,
    startLandscapeCapture,
  ]);

  const handleRatioPress = useCallback(() => {
    setRatio(ratio === '16:9' ? '4:3' : '16:9');
  }, [ratio, setRatio]);

  const ratioLabel: LandscapeRatio = ratio === '16:9' ? '16:9' : '4:3';
  const shutterDisabled = isCapturing || isRepeating || isRecordingBusy;

  return (
    <View className="flex-1" style={{ backgroundColor: '#000' }}>
      <Animated.View
        className="absolute left-0 items-center justify-center overflow-hidden bg-black"
        style={[{ width: screenWidth }, previewStyle]}
      >
        <PreviewSurface
          stream={stream}
          previewState={previewState}
          width={screenWidth}
          height={surfaceHeight}
        />
      </Animated.View>

      {watermark && (
        <View className="absolute left-5" style={{ top: insets.top + 96 }}>
          <Text className="text-base font-semibold text-white/85">SVBONY</Text>
        </View>
      )}

      <Animated.View
        className="absolute inset-x-0 flex-row items-center justify-between px-4"
        style={topBarStyle}
      >
        <Pressable
          onPress={onBack}
          style={{ backgroundColor: PREVIEW_PILL_BG }}
          className="size-[36px] items-center justify-center rounded-full active:opacity-70"
        >
          <ChevronLeftIcon />
        </Pressable>

        <Pressable
          onPress={() => setSheetTarget(current => (current === 'tools' ? 'manual' : 'tools'))}
          style={{ backgroundColor: PREVIEW_PILL_BG }}
          className="h-[36px] flex-row items-center gap-1.5 rounded-full px-3.5 active:opacity-80"
        >
          <Text className="text-[13px] text-white">{translate('landscape.title')}</Text>
          {sheetTarget === 'tools' ? <ChevronDownIcon /> : <ChevronUpIcon />}
        </Pressable>

        <Pressable
          onPress={() => {
            const next = isPro ? 'auto' : 'pro';
            setShutterMode(next);
            if (next === 'auto')
              setSheetOpen(false);
          }}
          disabled={shutterDisabled}
          style={{ backgroundColor: PREVIEW_PILL_BG }}
          className="h-[30px] min-w-[62px] items-center justify-center rounded-full px-3 active:opacity-80"
        >
          <Text className="text-[13px] text-white">{isPro ? 'M' : 'AUTO'}</Text>
        </Pressable>
      </Animated.View>

      {(isCapturing || isCountingDown || isRepeating || isRecording || isRecordingBusy || !isConnected) && (
        <View className="absolute inset-x-0 items-center" style={{ top: insets.top + 56 }}>
          <View className="rounded-full bg-black/70 px-4 py-1.5">
            <Text className="text-xs text-white">
              {isConnected
                ? isRepeating
                  ? `${translate('landscape.repeat_progress')} ${repeatCurrent}/${timerPlan.count}`
                  : isCountingDown
                    ? `${countdownRemaining}s`
                    : translate('landscape.capturing')
                : translate('landscape.connecting')}
            </Text>
          </View>
        </View>
      )}

      {isCountingDown && (
        <View className="absolute inset-0 items-center justify-center">
          <Text className="text-[88px] font-light text-white">{countdownRemaining}</Text>
        </View>
      )}

      {!sheetOpen && (
        <View
          className="absolute inset-x-0 items-center"
          style={{ bottom: insets.bottom + BOTTOM_BAR_HEIGHT + SHUTTER_BOTTOM_GAP }}
        >
          <Pressable
            onPress={handleShutterPress}
            disabled={!isConnected}
            className="items-center justify-center rounded-full active:opacity-80"
            style={{
              width: shutterSize,
              height: shutterSize,
              borderRadius: shutterSize / 2,
              borderColor: BRAND,
              borderWidth: shutterBorder,
            }}
          >
            <View
              className="rounded-full"
              style={{
                width: captureMode === 'video' && isRecording ? shutterInner * 0.46 : shutterInner,
                height: captureMode === 'video' && isRecording ? shutterInner * 0.46 : shutterInner,
                borderRadius: captureMode === 'video' && isRecording ? 8 : shutterInner / 2,
                backgroundColor: captureMode === 'video' && isRecording
                  ? '#FF3B30'
                  : shutterDisabled ? 'rgba(255,255,255,0.6)' : '#FFFFFF',
              }}
            />
          </Pressable>
        </View>
      )}

      {sheetOpen && (
        <View
          className="absolute inset-x-0 rounded-t-[26px]"
          style={{ bottom: insets.bottom + 96, backgroundColor: SHEET_BG }}
        >
          {sheetTarget === 'tools' && !burstOpen && (
            <View className="flex-row gap-3 p-4">
              <ToolCard
                icon={<StopwatchIcon color={timedShootOn ? '#111' : '#FFF'} disabled={!timedShootOn} />}
                label={translate('landscape.timed_shoot')}
                active={timedShootOn}
                onPress={() => {
                  setTimedShootOn(value => !value);
                  setBurstOpen(true);
                }}
              />
              <ToolCard
                icon={<CountdownIcon color={countdownOn ? '#111' : '#FFF'} disabled={!countdownOn} />}
                label={translate('landscape.countdown')}
                active={countdownOn}
                onPress={() => {
                  setCountdownOn(value => !value);
                  setBurstOpen(true);
                }}
              />
              <ToolCard label={ratioLabel} textOnly active={false} onPress={handleRatioPress} />
              <ToolCard
                icon={<WatermarkFlaskIcon color={watermark ? '#111' : '#FFF'} disabled={!watermark} />}
                label={translate('landscape.watermark')}
                active={watermark}
                onPress={() => setWatermark(!watermark)}
              />
            </View>
          )}

          {sheetTarget === 'manual' && !burstOpen && (
            <View className="px-4 pt-4 pb-5">
              <View className="flex-row gap-3">
                <ParamCard
                  title={translate('landscape.white_balance')}
                  value={paramValues.wb}
                  active={activeParam === 'wb'}
                  onPress={() => setActiveParam('wb')}
                />
                <ParamCard
                  title={translate('landscape.shutter')}
                  value={paramValues.shutter}
                  active={activeParam === 'shutter'}
                  onPress={() => setActiveParam('shutter')}
                />
                <ParamCard
                  title={translate('landscape.gain')}
                  value={paramValues.gain}
                  active={activeParam === 'gain'}
                  onPress={() => setActiveParam('gain')}
                />
                <ParamCard
                  title={translate('landscape.ev')}
                  value={paramValues.ev}
                  active={activeParam === 'ev'}
                  onPress={() => setActiveParam('ev')}
                />
              </View>

              <View className="mt-4">
                {activeParam === 'shutter' && (
                  <LandscapeRuler
                    label=""
                    values={SHUTTER_VALUES}
                    value={manualExposure}
                    formatValue={value => `${formatShutter(value)} s`}
                    formatTick={(value, index) => (index % 5 === 0 ? formatShutter(value) : null)}
                    onChange={value => changeStreamingSetting(value, manualGain)}
                  />
                )}
                {activeParam === 'gain' && (
                  <LandscapeRuler
                    label=""
                    values={GAIN_VALUES}
                    value={manualGain}
                    formatValue={value => `${value} dB`}
                    formatTick={(value, index) => (index % 5 === 0 ? `${value}` : null)}
                    onChange={value => changeStreamingSetting(manualExposure, value)}
                  />
                )}
                {activeParam === 'wb' && (
                  <LandscapeRuler
                    label=""
                    values={WB_VALUES}
                    value={whiteBalance}
                    formatValue={value => (value === 0 ? 'AUTO' : `${value}K`)}
                    formatTick={(value, index) => (index % 2 === 0 ? (value === 0 ? 'A' : `${value / 1000}K`) : null)}
                    onChange={changeWhiteBalance}
                  />
                )}
                {activeParam === 'ev' && (
                  <LandscapeRuler
                    label=""
                    values={EV_VALUES}
                    value={ev}
                    formatValue={value => `${value}`}
                    formatTick={(value, index) => (index % 2 === 0 ? `${value}` : null)}
                    onChange={changeEv}
                  />
                )}
              </View>
            </View>
          )}

          {burstOpen && (
            <View className="px-4 pt-4 pb-5">
              <View className="flex-row items-center justify-between">
                <Pressable
                  onPress={() => setBurstOpen(false)}
                  style={{ backgroundColor: PILL_BG }}
                  className="size-11 items-center justify-center rounded-full active:opacity-70"
                >
                  <CloseIcon />
                </Pressable>
                <Text className="text-[16px] text-white">{translate('landscape.timed_repeat')}</Text>
                <Pressable
                  onPress={() => {
                    setTimerPlan({ count: 3, interval: 3 });
                    setCountdownSeconds(3);
                  }}
                  className="size-11 items-center justify-center rounded-full active:opacity-70"
                >
                  <ResetIcon />
                </Pressable>
              </View>

              <View className="mt-4 gap-4">
                {timedShootOn && (
                  <>
                    <LandscapeRuler
                      label={translate('landscape.count')}
                      values={COUNT_VALUES}
                      value={timerPlan.count}
                      formatValue={value => `${value}${translate('landscape.count_unit')}`}
                      onChange={value => setTimerPlan({ ...timerPlan, count: value })}
                    />
                    <LandscapeRuler
                      label={translate('landscape.interval')}
                      values={INTERVAL_VALUES}
                      value={timerPlan.interval}
                      formatValue={value => `${value}s`}
                      onChange={value => setTimerPlan({ ...timerPlan, interval: value })}
                    />
                  </>
                )}
                {countdownOn && (
                  <LandscapeRuler
                    label={translate('landscape.countdown')}
                    values={COUNTDOWN_VALUES}
                    value={countdownSeconds}
                    formatValue={value => `${value}s`}
                    onChange={setCountdownSeconds}
                  />
                )}
              </View>
            </View>
          )}
        </View>
      )}

      <View
        className="absolute inset-x-0 bottom-0 flex-row items-center justify-between px-5"
        style={{ backgroundColor: BOTTOM_BAR_BG, paddingBottom: insets.bottom + 12, paddingTop: 12 }}
      >
        <Pressable className="size-[54px] overflow-hidden rounded-full bg-white/10 active:opacity-70">
          {thumbnailUri
            ? <Image source={{ uri: thumbnailUri }} style={{ width: 54, height: 54 }} contentFit="cover" />
            : <View className="size-[54px] rounded-full bg-white/10" />}
        </Pressable>

        <View className="h-[40px] flex-row items-center rounded-full border border-white/22 px-1">
          {(['photo', 'video'] as LandscapeCaptureMode[]).map((mode) => {
            const active = captureMode === mode;
            return (
              <Pressable
                key={mode}
                disabled={shutterDisabled || isCountingDown}
                onPress={() => setCaptureMode(mode)}
                style={active ? { backgroundColor: BRAND } : undefined}
                className="h-[32px] min-w-[60px] items-center justify-center rounded-full"
              >
                <Text className={`text-[13px] ${active ? 'font-medium text-black' : 'text-white'}`}>
                  {mode === 'photo' ? translate('landscape.photo') : translate('landscape.video')}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={() => setSheetOpen((open) => {
            if (open)
              return false;
            setBurstOpen(false);
            return true;
          })}
          disabled={!isPro}
          className="size-[54px] items-center justify-center rounded-full active:opacity-70"
          style={{
            borderColor: isPro
              ? sheetOpen ? BRAND : 'rgba(255,255,255,0.35)'
              : 'rgba(255,255,255,0.16)',
            borderWidth: 1.6,
            opacity: isPro ? 1 : 0.45,
          }}
        >
          <SheetMenuIcon color={sheetOpen && isPro ? BRAND : '#FFFFFF'} />
        </Pressable>
      </View>

      {lastCommandError && (
        <View className="absolute inset-x-0 items-center" style={{ bottom: insets.bottom + 220 }}>
          <View className="rounded-full bg-black/70 px-4 py-1.5">
            <Text className="text-xs text-red-300">{lastCommandError}</Text>
          </View>
        </View>
      )}
    </View>
  );
}
