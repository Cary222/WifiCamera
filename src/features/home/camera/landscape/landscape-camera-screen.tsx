/* eslint-disable max-lines-per-function */

import { Image as NImage } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUniwind } from 'uniwind';
import { Text } from '@/components/ui';
import { translate } from '@/lib/i18n';
import { useCameraStore } from '../camera-store';
import {
  AspectRatioButton,
  ToolCard,
  useAspectRatioAnimation,
} from '../components';
import { CameraBottomBar } from '../components/camera-bottom-bar';
import { CameraTopBar } from '../components/camera-top-bar';
import {
  PreviewSurface,
  useLandscapeCameraPreview,
} from '../components/native-camera-preview';
import { formatGain } from '../gain-code';
import { getImage } from '../services/file-service';
import { formatShutter, SHUTTER_VALUES } from '../shutter-values';
import {
  CloseIcon,
  CountdownIcon,
  ResetIcon,
  SheetMenuIcon,
  StopwatchIcon,
  WatermarkFlaskIcon,
} from './landscape-icons';
import { LandscapeRuler } from './landscape-ruler';

const watermarkLogo = require('@/assets/common/watermark_white.png') as number;

const BRAND = '#CBFF3C';
const SHEET_BG = '#141414';
const CARD_BG = '#1F1F1F';
const PILL_BG = 'rgba(34,42,54,0.72)';
/** Shutter diameter as a share of screen width, from the 402pt design board. */
const SHUTTER_SIZE_RATIO = 0.1890547263681592;
const SHUTTER_BORDER_RATIO = 0.043478260869565216;
const SHUTTER_BOTTOM_GAP = 32;
const BOTTOM_BAR_HEIGHT = 78;

const GAIN_VALUES = Array.from({ length: 101 }, (_, index) => index);
const EV_VALUES = [-3, -2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3];
const WB_VALUES = [0, 2800, 3200, 3800, 4500, 5200, 5800, 6500, 7200, 8000];
const COUNT_VALUES = Array.from({ length: 50 }, (_, index) => index + 1);
const INTERVAL_VALUES = Array.from({ length: 61 }, (_, index) => index);
const COUNTDOWN_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 30];

type ParamCardProps = {
  title: string;
  value: string;
  active: boolean;
  onPress: () => void;
};

function ParamCard({ title, value, active, onPress }: ParamCardProps) {
  const { theme } = useUniwind();
  const isDark = theme === 'dark';
  const cardBg = isDark ? CARD_BG : '#F4F4F5';

  return (
    <Pressable
      onPress={onPress}
      style={{ backgroundColor: active ? BRAND : cardBg }}
      className="h-[80px] flex-1 items-center justify-center gap-1 rounded-2xl active:opacity-80"
    >
      <Text
        className={`text-[12px] ${active ? 'text-black dark:text-black' : 'text-neutral-500 dark:text-white/60'}`}
      >
        {title}
      </Text>
      <Text
        className={`text-[17px] ${active ? 'font-medium text-black dark:text-black' : 'text-black dark:text-white'}`}
      >
        {value}
      </Text>
    </Pressable>
  );
}

type ManualParam = 'wb' | 'shutter' | 'gain' | 'ev';

export function LandscapeCameraScreen({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();

  const cameraStatus = useCameraStore.use.cameraStatus();
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
  const isApplyingRatio = useCameraStore.use.landscapeApplyingRatio();
  const timerPlan = useCameraStore.use.landscapeTimerPlan();
  const repeatState = useCameraStore.use.landscapeRepeatState();
  const repeatCurrent = useCameraStore.use.landscapeRepeatCurrent();
  const recordingState = useCameraStore.use.landscapeRecordingState();

  const setShutterMode = useCameraStore.use.setLandscapeShutterMode();
  const setCaptureMode = useCameraStore.use.setLandscapeCaptureMode();
  const setTimerPlan = useCameraStore.use.setLandscapeTimerPlan();
  const setWatermark = useCameraStore.use.setLandscapeWatermark();
  const setRatio = useCameraStore.use.setLandscapeSensorRatio();
  const changeStreamingSetting = useCameraStore.use.changeStreamingSetting();
  const changeWhiteBalance = useCameraStore.use.changeWhiteBalance();
  const changeEv = useCameraStore.use.changeEv();
  const startLandscapeCapture = useCameraStore.use.startLandscapeCapture();
  const startLandscapeCountdown = useCameraStore.use.startLandscapeCountdown();
  const cancelLandscapeTimerCapture
    = useCameraStore.use.cancelLandscapeTimerCapture();
  const startLandscapeRepeat = useCameraStore.use.startLandscapeRepeat();
  const cancelLandscapeRepeat = useCameraStore.use.cancelLandscapeRepeat();
  const startLandscapeRecording = useCameraStore.use.startLandscapeRecording();
  const stopLandscapeRecording = useCameraStore.use.stopLandscapeRecording();

  // Use the shared aspect ratio animation hook
  const {
    previewStyle,
    topBarStyle,
    surfaceHeight,
    surfaceWidth,
    rotation,
    scale,
  } = useAspectRatioAnimation(ratio, 220, 12);

  const shutterSize = Math.round(screenWidth * SHUTTER_SIZE_RATIO);
  const shutterBorder = Math.max(
    3,
    Math.round(shutterSize * SHUTTER_BORDER_RATIO),
  );
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
  const isRecordingBusy
    = recordingState === 'starting' || recordingState === 'processing';
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

  const paramValues = useMemo(
    () => ({
      wb: whiteBalance === 0 ? 'AUTO' : `${whiteBalance}K`,
      shutter: formatShutter(manualExposure),
      gain: formatGain(manualGain),
      ev: ev > 0 ? `+${ev}` : `${ev}`,
    }),
    [whiteBalance, ev, manualExposure, manualGain],
  );

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
    setRatio(ratio === '4:3' ? '16:9' : '4:3');
  }, [ratio, setRatio]);

  const { theme } = useUniwind();
  const isDark = theme === 'dark';
  const shutterDisabled
    = isCapturing
      || isRepeating
      || isRecordingBusy
      || isApplyingRatio
      || cameraStatus === 'error'
      || cameraStatus === 'unknown'
      || cameraStatus === 'closed'
      || cameraStatus === 'starting'
      || cameraStatus === 'stopping';

  return (
    <View
      className="flex-1"
      style={{ backgroundColor: isDark ? '#000' : '#F9FAFB' }}
    >
      <Animated.View
        className="absolute items-center justify-center overflow-hidden"
        style={[
          previewStyle as any,
          { backgroundColor: isDark ? '#000' : '#F9FAFB' },
        ]}
      >
        <PreviewSurface
          stream={stream}
          previewState={previewState}
          width={surfaceWidth}
          height={surfaceHeight}
          rotation={rotation}
          scale={scale}
          objectFit="contain"
        />
        {watermark && (
          <View
            pointerEvents="none"
            className="absolute inset-x-0 bottom-4 items-center justify-center"
          >
            <NImage
              source={watermarkLogo}
              style={{ width: 140, height: 14, opacity: 0.88 }}
              contentFit="contain"
            />
          </View>
        )}
      </Animated.View>

      <CameraTopBar
        title={translate('landscape.title')}
        onBack={onBack}
        onTitlePress={() =>
          setSheetTarget(current =>
            current === 'tools' ? 'manual' : 'tools',
          )}
        expanded={sheetTarget === 'tools'}
        isDark={isDark}
        style={topBarStyle as any}
        rightContent={(
          <Pressable
            onPress={() => {
              const next = isPro ? 'auto' : 'pro';
              setShutterMode(next);
              if (next === 'auto')
                setSheetOpen(false);
            }}
            disabled={shutterDisabled}
            style={{
              backgroundColor: isDark
                ? 'rgba(34,42,54,0.72)'
                : 'rgba(0, 0, 0, 0.08)',
            }}
            className="h-[30px] min-w-[62px] items-center justify-center rounded-full px-3 active:opacity-80"
          >
            <Text
              className={`text-[13px] ${isDark ? 'text-white' : 'text-black'}`}
            >
              {isPro ? 'M' : 'AUTO'}
            </Text>
          </Pressable>
        )}
      />

      {(isCapturing
        || isCountingDown
        || isRepeating
        || isRecording
        || isRecordingBusy
        || isApplyingRatio
        || !isConnected
        || cameraStatus === 'error'
        || cameraStatus === 'starting'
        || cameraStatus === 'stopping') && (
        <View
          className="absolute inset-x-0 items-center"
          style={{ top: insets.top + 56, zIndex: 10, elevation: 10 }}
        >
          <View className="rounded-full bg-black/70 px-4 py-1.5">
            <Text className="text-xs text-white">
              {isConnected
                ? isRepeating
                  ? `${translate('landscape.repeat_progress')} ${repeatCurrent}/${timerPlan.count}`
                  : isCountingDown
                    ? `${countdownRemaining}s`
                    : isApplyingRatio
                      ? '切换画幅中…'
                      : cameraStatus === 'error'
                        ? '相机异常'
                        : cameraStatus === 'starting'
                          ? '启动中…'
                          : cameraStatus === 'stopping'
                            ? '停止中…'
                            : translate('landscape.capturing')
                : translate('landscape.connecting')}
            </Text>
          </View>
        </View>
      )}

      {isCountingDown && (
        <View className="absolute inset-0 items-center justify-center">
          <Text className="text-[88px] font-light text-white">
            {countdownRemaining}
          </Text>
        </View>
      )}

      {!sheetOpen && (
        <View
          className="absolute inset-x-0 items-center"
          style={{
            bottom: insets.bottom + BOTTOM_BAR_HEIGHT + SHUTTER_BOTTOM_GAP,
          }}
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
                width:
                  captureMode === 'video' && isRecording
                    ? shutterInner * 0.46
                    : shutterInner,
                height:
                  captureMode === 'video' && isRecording
                    ? shutterInner * 0.46
                    : shutterInner,
                borderRadius:
                  captureMode === 'video' && isRecording ? 8 : shutterInner / 2,
                backgroundColor:
                  captureMode === 'video' && isRecording
                    ? '#FF3B30'
                    : shutterDisabled
                      ? isDark
                        ? 'rgba(255,255,255,0.6)'
                        : 'rgba(0,0,0,0.3)'
                      : '#FFFFFF',
              }}
            />
          </Pressable>
        </View>
      )}

      {sheetOpen && (
        <View
          className="absolute inset-x-0 rounded-t-[26px]"
          style={{
            bottom: insets.bottom + 96,
            backgroundColor: isDark ? SHEET_BG : '#FFFFFF',
            borderTopWidth: isDark ? 0 : 1,
            borderTopColor: 'rgba(0, 0, 0, 0.08)',
          }}
        >
          {sheetTarget === 'tools' && !burstOpen && (
            <View className="flex-row gap-3 p-4">
              <ToolCard
                icon={(
                  <StopwatchIcon
                    color={timedShootOn ? '#111' : isDark ? '#FFF' : '#222'}
                    disabled={!timedShootOn}
                  />
                )}
                label={translate('landscape.timed_shoot')}
                active={timedShootOn}
                cardBg={isDark ? CARD_BG : '#F4F4F5'}
                onPress={() => {
                  setTimedShootOn(true);
                  setBurstOpen(true);
                }}
              />
              <ToolCard
                icon={(
                  <CountdownIcon
                    color={countdownOn ? '#111' : isDark ? '#FFF' : '#222'}
                    disabled={!countdownOn}
                  />
                )}
                label={translate('landscape.countdown')}
                active={countdownOn}
                cardBg={isDark ? CARD_BG : '#F4F4F5'}
                onPress={() => {
                  setCountdownOn(true);
                  setBurstOpen(true);
                }}
              />
              <AspectRatioButton
                ratio={ratio}
                onPress={handleRatioPress}
                cardBg={isDark ? CARD_BG : '#F4F4F5'}
              />
              <ToolCard
                icon={(
                  <WatermarkFlaskIcon
                    color={watermark ? '#111' : isDark ? '#FFF' : '#222'}
                    disabled={!watermark}
                  />
                )}
                label={translate('landscape.watermark')}
                cardBg={isDark ? CARD_BG : '#F4F4F5'}
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
                    formatTick={(value, index) =>
                      index % 5 === 0 ? formatShutter(value) : null}
                    onChange={value =>
                      changeStreamingSetting(value, manualGain)}
                  />
                )}
                {activeParam === 'gain' && (
                  <LandscapeRuler
                    label=""
                    values={GAIN_VALUES}
                    value={manualGain}
                    formatValue={formatGain}
                    formatTick={(value, index) =>
                      index % 10 === 0 ? String(value) : null}
                    onChange={value =>
                      changeStreamingSetting(manualExposure, value)}
                  />
                )}
                {activeParam === 'wb' && (
                  <LandscapeRuler
                    label=""
                    values={WB_VALUES}
                    value={whiteBalance}
                    formatValue={value =>
                      value === 0 ? 'AUTO' : `${value}K`}
                    formatTick={(value, index) =>
                      index % 2 === 0
                        ? value === 0
                          ? 'A'
                          : `${value / 1000}K`
                        : null}
                    onChange={changeWhiteBalance}
                  />
                )}
                {activeParam === 'ev' && (
                  <View className="gap-2">
                    <LandscapeRuler
                      label=""
                      values={EV_VALUES}
                      value={ev}
                      formatValue={value => (value > 0 ? `+${value}` : `${value}`)}
                      formatTick={(value, index) =>
                        index % 2 === 0
                          ? value > 0
                            ? `+${value}`
                            : `${value}`
                          : null}
                      onChange={changeEv}
                    />
                    <View className="items-center justify-center py-1">
                      <Text className="text-[12px] text-neutral-400 dark:text-white/60">
                        {translate('landscape.ev_linkage_feedback', {
                          shutter: paramValues.shutter,
                          gain: paramValues.gain,
                          defaultValue: `当前联动快门: ${paramValues.shutter} · 增益: ${paramValues.gain}`,
                        })}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            </View>
          )}

          {burstOpen && (
            <View className="px-4 pt-4 pb-5">
              <View className="flex-row items-center justify-between">
                <Pressable
                  onPress={() => setBurstOpen(false)}
                  style={{
                    backgroundColor: isDark ? PILL_BG : 'rgba(0, 0, 0, 0.06)',
                  }}
                  className="size-11 items-center justify-center rounded-full active:opacity-70"
                >
                  <CloseIcon color={isDark ? undefined : '#0A0B0D'} />
                </Pressable>
                <Text
                  className={`text-[16px] ${isDark ? 'text-white' : 'text-black'}`}
                >
                  {translate('landscape.timed_repeat')}
                </Text>
                <Pressable
                  onPress={() => {
                    setTimerPlan({ count: 3, interval: 3 });
                    setCountdownSeconds(3);
                  }}
                  style={{
                    backgroundColor: isDark ? PILL_BG : 'rgba(0, 0, 0, 0.06)',
                  }}
                  className="size-11 items-center justify-center rounded-full active:opacity-70"
                >
                  <ResetIcon color={isDark ? undefined : '#0A0B0D'} />
                </Pressable>
              </View>

              <View className="mt-4 gap-4">
                <LandscapeRuler
                  label={translate('landscape.count')}
                  values={COUNT_VALUES}
                  value={timerPlan.count}
                  formatValue={value =>
                    `${value}${translate('landscape.count_unit')}`}
                  onChange={(value) => {
                    setTimedShootOn(true);
                    setTimerPlan({ ...timerPlan, count: value });
                  }}
                />
                <LandscapeRuler
                  label={translate('landscape.interval')}
                  values={INTERVAL_VALUES}
                  value={timerPlan.interval}
                  formatValue={value => `${value}s`}
                  onChange={(value) => {
                    setTimedShootOn(true);
                    setTimerPlan({ ...timerPlan, interval: value });
                  }}
                />
                <LandscapeRuler
                  label={translate('landscape.countdown')}
                  values={COUNTDOWN_VALUES}
                  value={countdownSeconds}
                  formatValue={value => `${value}s`}
                  onChange={(value) => {
                    setCountdownOn(true);
                    setCountdownSeconds(value);
                  }}
                />
              </View>
            </View>
          )}
        </View>
      )}

      <CameraBottomBar
        captureMode={captureMode}
        onCaptureModeChange={mode => setCaptureMode(mode)}
        thumbnailUri={thumbnailUri}
        onThumbnailPress={() => router.push('/album' as never)}
        isRecording={isRecording}
        rightButton={(
          <SheetMenuIcon
            color={sheetOpen && isPro ? BRAND : isDark ? '#FFFFFF' : '#0A0B0D'}
          />
        )}
        rightButtonActive={sheetOpen && isPro}
        onRightButtonPress={() => {
          if (!isPro) {
            setShutterMode('pro');
            setSheetTarget('manual');
            setSheetOpen(true);
            setBurstOpen(false);
            return;
          }
          setSheetOpen((open) => {
            if (open)
              return false;
            setBurstOpen(false);
            return true;
          });
        }}
        rightButtonDisabled={false}
      />

      {lastCommandError && (
        <View
          pointerEvents="box-none"
          className="absolute inset-x-0 items-center"
          style={{ bottom: insets.bottom + 220 }}
        >
          <View className="rounded-full bg-black/70 px-4 py-1.5">
            <Text className="text-xs text-red-300">{lastCommandError}</Text>
          </View>
        </View>
      )}
    </View>
  );
}
