/* eslint-disable max-lines-per-function */

import type { AspectRatio } from './preview-layout';
import type { PlanetFormat, RoiPreset } from './use-planet-capture';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, useWindowDimensions, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUniwind } from 'uniwind';
import { SegmentedControl, Text } from '@/components/ui';
import { translate } from '@/lib/i18n';
import { useCameraStore } from '../camera-store';
import { useAspectRatioAnimation } from '../components/aspect-ratio-switcher';
import { CameraModeSwitcher } from '../components/camera-mode-switcher';
import { CameraTopBar } from '../components/camera-top-bar';
import {
  PreviewSurface,
  useLandscapeCameraPreview,
} from '../components/native-camera-preview';
import { getCameraBaseUrl } from '../config';
import { formatGain } from '../gain-code';
import {
  CloseIcon,
  CountdownIcon,
  MeteringIcon,
  SheetMenuIcon,
} from '../landscape/landscape-icons';
import { LandscapeRuler } from '../landscape/landscape-ruler';
import { SHUTTER_VALUES } from '../shutter-values';
import {
  createCustomRoiPreset,
  getEffectiveSensorRoi,
  getRenderedAspectRatio,
  QUICK_CUSTOM_ROI_SIZES,
} from './preview-layout';
import { PLANET_ROI_PRESETS, usePlanetCapture } from './use-planet-capture';
import { useShutterCountdown } from './use-shutter-countdown';

const BRAND = '#CBFF3C';
const CARD_BG = '#141518';
const SHEET_BG = '#141416';
const PILL_GROUP_BG = '#141518';

const EXPOSURE_VALUES = SHUTTER_VALUES;
const GAIN_VALUES = Array.from({ length: 101 }, (_, index) => index);

function formatExposure(value: number): string {
  if (value < 0.01)
    return `${Math.round(value * 1000)}ms`;
  if (value >= 1)
    return `${value}s`;
  return `1/${Math.round(1 / value)}s`;
}

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

type ArrowDirection = 'down' | 'up';
type ActiveParamCard = 'exposure' | 'gain' | 'format';
type ContainerFormat = 'mp4' | 'ser';
type BitDepth = '8-bit' | '12-bit' | '16-bit';
type MeteringMode = 'center' | 'target' | 'matrix';

function ParamCard({
  label,
  value,
  active,
  disabled = false,
  onPress,
}: {
  label: string;
  value: string;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { theme } = useUniwind();
  const isDark = theme === 'dark';
  const cardBg = isDark ? CARD_BG : '#F4F4F5';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        backgroundColor: active ? BRAND : cardBg,
        borderColor: active
          ? BRAND
          : isDark
            ? 'rgba(255, 255, 255, 0.12)'
            : 'rgba(0, 0, 0, 0.08)',
      }}
      className="h-[74px] flex-1 items-center justify-center rounded-2xl border active:opacity-80 disabled:opacity-40"
    >
      <Text
        className={`text-[12px] ${active ? 'font-medium text-black dark:text-black' : 'text-neutral-500 dark:text-white/55'}`}
      >
        {label}
      </Text>
      <Text
        className={`mt-1.5 text-[17px] font-bold ${active ? 'text-black dark:text-black' : 'text-black dark:text-white'}`}
      >
        {value}
      </Text>
    </Pressable>
  );
}

export function PlanetCameraScreen({ onBack }: { onBack: () => void }) {
  const { theme } = useUniwind();
  const isDark = theme === 'dark';
  const cardBg = isDark ? CARD_BG : '#F4F4F5';
  const sheetBg = isDark ? SHEET_BG : '#FFFFFF';
  const pillGroupBg = isDark ? PILL_GROUP_BG : 'rgba(0, 0, 0, 0.05)';
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();

  const connectionStatus = useCameraStore.use.connectionStatus();
  const newestCameraJpgUrl = useCameraStore.use.newestCameraJpgUrl();
  const latestVideoName = useCameraStore.use.landscapeLatestVideoName();

  // Top capsule arrow direction: 'down' (图二) <-> 'up' (图三)
  const [arrowDirection, setArrowDirection] = useState<ArrowDirection>('down');
  // Bottom panel open/closed state
  const [videoDimensions, setVideoDimensions] = useState<{ streamURL: string; width: number; height: number } | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(true);

  // Fig 2 state (Param Controls)
  const [activeParamCard, setActiveParamCard]
    = useState<ActiveParamCard>('gain');
  const [exposure, setExposure] = useState(0.008);
  const [gain, setGain] = useState(10);
  const [containerFormat, setContainerFormat]
    = useState<ContainerFormat>('ser');
  const [bitDepth, setBitDepth] = useState<BitDepth>('8-bit');

  // Fig 3 state (Quick Settings)
  // 板端尚未提供测光模式指令，先固定为全画面并禁用切换。
  const meteringMode: MeteringMode = 'matrix';
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [countdownSeconds, setCountdownSeconds] = useState<number>(0);

  // Common ROI and Capture State
  const [roiPreset, setRoiPreset] = useState<RoiPreset>(PLANET_ROI_PRESETS[0]);
  const [customWidth, setCustomWidth] = useState<number>(1280);
  const [customHeight, setCustomHeight] = useState<number>(720);
  const [showCustomEditor, setShowCustomEditor] = useState<boolean>(false);
  const [captureMode, setCaptureMode] = useState<'photo' | 'video'>('video');
  const [roiSheetOpen, setRoiSheetOpen] = useState(false);
  const activeRoiPreset = roiPreset;
  const selectableRoiPresets = PLANET_ROI_PRESETS;

  const format: PlanetFormat = useMemo(() => {
    if (containerFormat === 'mp4')
      return 'mp4';
    if (bitDepth === '16-bit')
      return 'ser16';
    if (bitDepth === '12-bit')
      return 'ser12';
    return 'ser8';
  }, [containerFormat, bitDepth]);

  const formatCardLabel = useMemo(() => {
    if (containerFormat === 'mp4')
      return 'MP4';
    return `SER ${bitDepth}`;
  }, [containerFormat, bitDepth]);

  const {
    isRecording,
    recordingSeconds,
    writtenFrames,
    recordingFps,
    isCapturing,
    isApplyingRoi,
    roiSequence,
    effectiveRoi,
    capturePhoto,
    startRecording,
    stopRecording,
    dismissError,
    applyStreamingSetting,
  } = usePlanetCapture({
    exposure,
    gain,
    format,
    roiPreset: activeRoiPreset,
    aspectRatio,
  });

  const { previewState, stream, actualFps } = useLandscapeCameraPreview({
    mode: 'manual',
    manualExposure: exposure,
    manualGain: gain,
    reconnectKey: roiSequence,
  });

  const isConnected = connectionStatus === 'open';
  const isVideoRecording = captureMode === 'video' && isRecording;

  const currentFps = isRecording && recordingFps != null ? recordingFps : actualFps;
  const fpsText = useMemo(() => {
    if (currentFps === null || Number.isNaN(currentFps))
      return '-- fps';
    return `${currentFps.toFixed(1)}fps`;
  }, [currentFps]);

  const imageUrl = useMemo(() => {
    if (newestCameraJpgUrl) {
      const imagePath = newestCameraJpgUrl.replace(/\.fits$/i, '_preview.jpg');
      return `${getCameraBaseUrl()}/get_image?path=${encodeURIComponent(imagePath)}`;
    }
    if (latestVideoName) {
      const thumbPath = `/mnt/sdcard/Videos/${latestVideoName.replace(/\.mp4$/i, '_thumb.jpg')}`;
      return `${getCameraBaseUrl()}/get_image?path=${encodeURIComponent(thumbPath)}`;
    }
    return null;
  }, [newestCameraJpgUrl, latestVideoName]);

  const runShutter = useCallback(() => {
    if (captureMode === 'photo') {
      void capturePhoto();
      return;
    }
    if (isRecording)
      void stopRecording();
    else void startRecording();
  }, [captureMode, capturePhoto, isRecording, startRecording, stopRecording]);

  const countdown = useShutterCountdown({
    seconds: countdownSeconds,
    onFire: runShutter,
  });
  const countdownRemaining = countdown.remaining;

  const handleShutter = () => {
    if (!isConnected || isApplyingRoi || previewState !== 'live')
      return;
    // 停止录制不该被倒计时延迟，只有开始拍摄才走倒计时。
    if (isRecording && !countdown.isRunning()) {
      runShutter();
      return;
    }
    if (!countdown.start())
      runShutter();
  };

  const handleBack = useCallback(() => {
    countdown.cancel();
    if (isRecording)
      void stopRecording();
    onBack();
  }, [countdown, isRecording, onBack, stopRecording]);

  const handleCaptureModePress = (mode: 'photo' | 'video') => {
    if (captureMode !== mode) {
      countdown.cancel();
      setCaptureMode(mode);
      return;
    }
    handleShutter();
  };

  const settingsDisabled
    = isRecording || isCapturing || isApplyingRoi || countdownRemaining > 0;
  // Match Landscape/Nebula viewport geometry while retaining the hardware ROI
  // for capture and stream reconnection.
  const {
    previewStyle,
    topBarStyle,
    surfaceWidth,
    surfaceHeight,
    rotation,
    scale,
  } = useAspectRatioAnimation(
    videoDimensions && videoDimensions.streamURL === stream?.toURL()
      ? getRenderedAspectRatio(videoDimensions.width, videoDimensions.height, aspectRatio)
      : aspectRatio,
    220,
    12,
  );
  const shutterSize = Math.round(screenWidth * 0.1890547263681592);
  const shutterBorder = Math.max(3, Math.round(shutterSize * 0.043478260869565216));
  const shutterInner = shutterSize - 2 * shutterBorder - 2;
  return (
    <View
      className="flex-1"
      style={{ backgroundColor: isDark ? '#000' : '#F9FAFB' }}
    >
      {/* 1. Camera Viewport */}
      <Animated.View
        className="absolute items-center justify-center overflow-hidden"
        style={[
          previewStyle as any,
          { backgroundColor: isDark ? '#000' : '#F9FAFB' },
        ]}
      >
        <PreviewSurface
          key={`planet-preview-${aspectRatio}-${effectiveRoi.width}x${effectiveRoi.height}-${surfaceWidth}x${surfaceHeight}`}
          stream={stream}
          previewState={previewState}
          width={surfaceWidth}
          height={surfaceHeight}
          rotation={rotation}
          scale={scale}
          objectFit="contain"
          onVideoDimensionsChange={({ width, height }) => {
            const streamURL = stream?.toURL();
            if (streamURL) {
              setVideoDimensions(previous =>
                previous?.streamURL === streamURL && previous.width === width && previous.height === height
                  ? previous
                  : { streamURL, width, height });
            }
          }}
        />
      </Animated.View>

      <CameraTopBar
        title={translate('planet.mode_title')}
        onBack={handleBack}
        onTitlePress={() =>
          setArrowDirection(prev => (prev === 'down' ? 'up' : 'down'))}
        expanded={arrowDirection === 'down'}
        disabled={settingsDisabled}
        isDark={isDark}
        style={topBarStyle as any}
        rightContent={(
          <Pressable
            onPress={() => setRoiSheetOpen(true)}
            disabled={settingsDisabled}
            className="items-end justify-center py-1 active:opacity-70 disabled:opacity-40"
          >
            <Text
              className={`text-[11px] font-medium tracking-wide ${isDark ? 'text-white/90' : 'text-neutral-700'}`}
            >
              {`${effectiveRoi.width}×${effectiveRoi.height}  ${fpsText}`}
            </Text>
          </Pressable>
        )}
      />

      {/* 3. Recording / ROI Indicator */}
      {isApplyingRoi && (
        <View
          className="absolute inset-x-0 items-center"
          style={{ top: insets.top + 58 }}
        >
          <View className="rounded-full bg-black/75 px-3.5 py-1">
            <Text className="text-xs font-medium text-white">
              {translate('planet.switching_roi')}
            </Text>
          </View>
        </View>
      )}
      {isRecording && (
        <View
          className="absolute inset-x-0 items-center"
          style={{ top: insets.top + 58 }}
        >
          <View className="flex-row items-center gap-2 rounded-full bg-red-600/90 px-3.5 py-1">
            <View className="size-2 rounded-full bg-white" />
            <Text className="text-xs font-bold text-white">
              {`REC ${formatClock(recordingSeconds)}${containerFormat === 'mp4' ? '' : ` · ${writtenFrames} ${translate('planet.frames')}`}`}
            </Text>
          </View>
        </View>
      )}

      {!isPanelOpen && (
        <View
          className="absolute inset-x-0 items-center"
          style={{ bottom: insets.bottom + 110 }}
        >
          <Pressable
            onPress={handleShutter}
            disabled={!isConnected || isCapturing || isApplyingRoi || previewState !== 'live'}
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
              className="items-center justify-center"
              style={{
                width: isVideoRecording ? shutterInner * 0.46 : shutterInner,
                height: isVideoRecording ? shutterInner * 0.46 : shutterInner,
                borderRadius: isVideoRecording ? 8 : shutterInner / 2,
                backgroundColor: isVideoRecording ? '#FF3B30' : '#FFFFFF',
              }}
            >
              {countdownRemaining > 0 && (
                <Text className="text-[26px] font-bold text-black">
                  {countdownRemaining}
                </Text>
              )}
            </View>
          </Pressable>
        </View>
      )}
      {/* 5. Bottom Control Container */}
      <View
        className={`absolute inset-x-0 bottom-0 ${isDark ? 'bg-[#0A0A0A]' : 'border-t border-neutral-200 bg-white'} px-4 pt-3`}
        style={{ paddingBottom: Math.max(insets.bottom, 16) + 6 }}
      >
        {isPanelOpen && arrowDirection === 'down' && (
          /* ─── 图二：参数调节面板 (Arrow Down State) ─── */
          <View className="mb-2">
            {/* Row 1: Parameter Cards */}
            <View className="flex-row gap-2.5">
              <ParamCard
                label={translate('planet.exposure')}
                value={formatExposure(exposure)}
                active={activeParamCard === 'exposure'}
                disabled={settingsDisabled}
                onPress={() => setActiveParamCard('exposure')}
              />
              <ParamCard
                label={translate('planet.gain')}
                value={formatGain(gain)}
                active={activeParamCard === 'gain'}
                disabled={settingsDisabled}
                onPress={() => setActiveParamCard('gain')}
              />
              <ParamCard
                label={translate('planet.format')}
                value={formatCardLabel}
                active={activeParamCard === 'format'}
                disabled={settingsDisabled}
                onPress={() => setActiveParamCard('format')}
              />
            </View>

            {/* Row 2: Dynamic Adjustment Area (Ruler / Formats) */}
            <View className="mt-4 min-h-[52px] justify-center">
              {activeParamCard === 'format' && (
                <View className="flex-row items-center gap-3">
                  {/* Container Format Segmented Control (MP4 / SER) */}
                  <SegmentedControl
                    options={[
                      { value: 'mp4', label: 'MP4' },
                      { value: 'ser', label: 'SER' },
                    ]}
                    value={containerFormat}
                    onChange={value =>
                      setContainerFormat(value as 'mp4' | 'ser')}
                    variant="capsule-lg"
                    segmentPixelWidth={64}
                    className="h-[44px]"
                    style={{
                      backgroundColor: pillGroupBg,
                      borderColor: isDark
                        ? 'rgba(255, 255, 255, 0.14)'
                        : 'rgba(0, 0, 0, 0.08)',
                    }}
                  />

                  {/* Bit Depth Segmented Control (8-bit / 12-bit / 16-bit) */}
                  <SegmentedControl
                    options={[
                      { value: '8-bit', label: '8-bit' },
                      { value: '12-bit', label: '12-bit' },
                      { value: '16-bit', label: '16-bit' },
                    ]}
                    value={bitDepth}
                    onChange={value => setBitDepth(value as BitDepth)}
                    variant="capsule-lg"
                    className="h-[44px] flex-1"
                    style={{
                      backgroundColor: pillGroupBg,
                      borderColor: isDark
                        ? 'rgba(255, 255, 255, 0.14)'
                        : 'rgba(0, 0, 0, 0.08)',
                      opacity: containerFormat === 'ser' ? 1 : 0.35,
                    }}
                  />
                </View>
              )}

              {activeParamCard === 'exposure' && (
                <View className="w-full items-center py-1">
                  <LandscapeRuler
                    label={translate('planet.shutter')}
                    values={EXPOSURE_VALUES}
                    value={exposure}
                    formatValue={value => formatExposure(value)}
                    formatTick={(value, index) =>
                      index % 5 === 0 ? formatExposure(value) : null}
                    onChange={(value) => {
                      if (!settingsDisabled) {
                        setExposure(value);
                        applyStreamingSetting(value, gain, true);
                      }
                    }}
                  />
                </View>
              )}

              {activeParamCard === 'gain' && (
                <View className="w-full items-center py-1">
                  <LandscapeRuler
                    label={translate('planet.gain')}
                    values={GAIN_VALUES}
                    value={gain}
                    formatValue={formatGain}
                    formatTick={(value, index) =>
                      index % 10 === 0 ? String(value) : null}
                    onChange={(value) => {
                      if (!settingsDisabled) {
                        setGain(value);
                        applyStreamingSetting(exposure, value, true);
                      }
                    }}
                  />
                </View>
              )}
            </View>
          </View>
        )}

        {isPanelOpen && arrowDirection === 'up' && (
          /* ─── 图三：快捷设置面板 (Arrow Up State) ─── */
          <View className="mb-2">
            {/* Row 1: 测光模式（板端暂无对应指令，置灰待接入） */}
            <View
              className="mb-3.5 flex-row items-center justify-between px-1"
              style={{ opacity: 0.4 }}
            >
              <View className="flex-row items-center gap-2.5">
                <MeteringIcon color={isDark ? '#FFF' : '#222'} size={24} />
                <Text
                  className={`text-[15px] font-normal ${isDark ? 'text-white' : 'text-black'}`}
                >
                  {translate('planet.metering_mode')}
                </Text>
              </View>

              <View
                style={{
                  backgroundColor: pillGroupBg,
                  borderColor: isDark
                    ? 'rgba(255, 255, 255, 0.14)'
                    : 'rgba(0, 0, 0, 0.08)',
                }}
                className="h-[38px] flex-row items-center rounded-full border p-1"
              >
                {(['center', 'target', 'matrix'] as const).map((modeKey) => {
                  const selected = meteringMode === modeKey;
                  const label
                    = modeKey === 'center'
                      ? translate('planet.label_metering_center')
                      : modeKey === 'target'
                        ? translate('planet.label_metering_target')
                        : translate('planet.label_metering_matrix');
                  return (
                    <Pressable
                      key={modeKey}
                      disabled
                      style={{
                        backgroundColor: selected ? BRAND : 'transparent',
                      }}
                      className="h-[28px] min-w-[52px] items-center justify-center rounded-full px-3"
                    >
                      <Text
                        className={`text-[13px] ${
                          selected
                            ? 'font-bold text-black dark:text-black'
                            : isDark
                              ? 'font-normal text-white'
                              : 'font-normal text-neutral-600'
                        }`}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Row 2: 4 Square Cards */}
            <View className="mb-4 flex-row gap-2.5">
              {/* Card 1: Aspect Ratio */}
              <Pressable
                onPress={() => {
                  countdown.cancel();
                  dismissError();
                  const next: AspectRatio = aspectRatio === '16:9' ? '4:3' : '16:9';
                  setAspectRatio(next);
                }}
                disabled={settingsDisabled}
                style={{
                  backgroundColor: cardBg,
                  borderColor: isDark
                    ? 'rgba(255, 255, 255, 0.12)'
                    : 'rgba(0, 0, 0, 0.08)',
                }}
                className="h-[76px] flex-1 items-center justify-center rounded-2xl border active:opacity-75 disabled:opacity-40"
              >
                <Text
                  className={`text-[18px] font-normal ${isDark ? 'text-white' : 'text-black'}`}
                >
                  {aspectRatio}
                </Text>
              </Pressable>

              {/* Card 2: Countdown Timer */}
              <Pressable
                onPress={() => {
                  setCountdownSeconds(prev =>
                    prev === 0 ? 3 : prev === 3 ? 5 : prev === 5 ? 10 : 0,
                  );
                }}
                disabled={settingsDisabled}
                style={{
                  backgroundColor: cardBg,
                  borderColor: isDark
                    ? 'rgba(255, 255, 255, 0.12)'
                    : 'rgba(0, 0, 0, 0.08)',
                }}
                className="h-[76px] flex-1 items-center justify-center rounded-2xl border active:opacity-75 disabled:opacity-40"
              >
                <CountdownIcon
                  color={
                    countdownSeconds === 0
                      ? isDark
                        ? 'rgba(255,255,255,0.4)'
                        : 'rgba(0,0,0,0.3)'
                      : isDark
                        ? '#FFF'
                        : '#000'
                  }
                  size={24}
                  disabled={countdownSeconds === 0}
                />
                <Text
                  className={`mt-1 text-[11px] font-normal ${isDark ? 'text-white/70' : 'text-neutral-500'}`}
                >
                  {countdownSeconds > 0
                    ? `${countdownSeconds}s`
                    : translate('planet.countdown_label')}
                </Text>
              </Pressable>

              {/* Card 3: Resolution */}
              <Pressable
                onPress={() => setRoiSheetOpen(true)}
                disabled={settingsDisabled}
                style={{
                  backgroundColor: cardBg,
                  borderColor: isDark
                    ? 'rgba(255, 255, 255, 0.12)'
                    : 'rgba(0, 0, 0, 0.08)',
                }}
                className="h-[76px] flex-1 items-center justify-center rounded-2xl border active:opacity-75 disabled:opacity-40"
              >
                <Text
                  className={`text-[13px] font-normal ${isDark ? 'text-white' : 'text-black'}`}
                >
                  {`${effectiveRoi.width}×${effectiveRoi.height}`}
                </Text>
              </Pressable>

              {/* Card 4: Frame Rate */}
              <Pressable
                onPress={() => setRoiSheetOpen(true)}
                disabled={settingsDisabled}
                style={{
                  backgroundColor: cardBg,
                  borderColor: isDark
                    ? 'rgba(255, 255, 255, 0.12)'
                    : 'rgba(0, 0, 0, 0.08)',
                }}
                className="h-[76px] flex-1 items-center justify-center rounded-2xl border active:opacity-75 disabled:opacity-40"
              >
                <Text
                  className={`text-[18px] font-normal ${isDark ? 'text-white' : 'text-black'}`}
                >
                  {fpsText}
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Row 3: Bottom Action Bar */}
        <View className="flex-row items-center justify-between px-1">
          {/* Album Button */}
          <Pressable
            onPress={() => router.push('/album' as never)}
            className={`size-[54px] items-center justify-center overflow-hidden rounded-full active:opacity-70 ${isDark ? 'bg-white/10' : 'bg-neutral-100'}`}
          >
            {imageUrl
              ? (
                  <Image
                    source={{ uri: imageUrl }}
                    style={{ width: 54, height: 54 }}
                    contentFit="cover"
                  />
                )
              : (
                  <View
                    className={`size-[54px] rounded-full ${isDark ? 'bg-white/10' : 'bg-neutral-200'}`}
                  />
                )}
          </Pressable>

          {/* Capture Mode Toggle Capsule (拍照 | 视频) */}
          <CameraModeSwitcher
            mode={captureMode}
            onChange={mode => handleCaptureModePress(mode)}
            variant="capsule-lg"
            isCapturing={isCapturing}
            isRecording={isRecording}
          />

          {/* Hamburger Menu Button (Toggles Panel Open/Closed) */}
          <Pressable
            onPress={() => setIsPanelOpen(prev => !prev)}
            style={{
              borderColor: isPanelOpen
                ? BRAND
                : isDark
                  ? 'rgba(255, 255, 255, 0.22)'
                  : 'rgba(0, 0, 0, 0.15)',
              borderWidth: 1.6,
              backgroundColor: isDark ? 'transparent' : '#F4F4F5',
            }}
            className="size-[54px] items-center justify-center rounded-full active:opacity-70"
          >
            <SheetMenuIcon
              color={isPanelOpen ? BRAND : isDark ? '#FFF' : '#000'}
              size={24}
            />
          </Pressable>
        </View>
      </View>

      {/* ROI Modal Sheet */}
      <Modal
        visible={roiSheetOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setRoiSheetOpen(false)}
      >
        <View className="flex-1 justify-end bg-black/60">
          <View
            className="rounded-t-[26px] p-5"
            style={{
              backgroundColor: sheetBg,
              paddingBottom: insets.bottom + 20,
            }}
          >
            <View className="mb-4 flex-row items-center justify-between">
              <Text
                className={`text-base font-bold ${isDark ? 'text-white' : 'text-black'}`}
              >
                {translate('planet.framing')}
              </Text>
              <Pressable
                onPress={() => setRoiSheetOpen(false)}
                className={`size-8 items-center justify-center rounded-full active:opacity-80 ${isDark ? 'bg-white/10' : 'bg-neutral-100'}`}
              >
                <CloseIcon color={isDark ? undefined : '#0A0B0D'} size={16} />
              </Pressable>
            </View>

            <View className="gap-2.5">
              {selectableRoiPresets.map((preset) => {
                const selected = activeRoiPreset.key === preset.key;
                const presetRoi = getEffectiveSensorRoi(preset, aspectRatio);
                return (
                  <Pressable
                    key={preset.key}
                    onPress={() => {
                      countdown.cancel();
                      dismissError();
                      setRoiPreset(preset);
                      setRoiSheetOpen(false);
                    }}
                    disabled={settingsDisabled}
                    style={{
                      backgroundColor: selected
                        ? BRAND
                        : isDark
                          ? CARD_BG
                          : '#F4F4F5',
                    }}
                    className="flex-row items-center justify-between rounded-xl px-4 py-3.5 active:opacity-80"
                  >
                    <View>
                      <Text
                        className={`text-sm font-bold ${selected ? 'text-black dark:text-black' : isDark ? 'text-white' : 'text-black'}`}
                      >
                        {`${presetRoi.width}×${presetRoi.height}`}
                      </Text>
                      <Text
                        className={`mt-0.5 text-xs ${selected ? 'text-black/70 dark:text-black/70' : isDark ? 'text-white/50' : 'text-neutral-500'}`}
                      >
                        {translate(preset.descriptionKey as never) || preset.resolution}
                      </Text>
                    </View>
                    <View
                      className={`rounded-full px-2.5 py-1 ${selected ? 'bg-black/20' : 'bg-white/10'}`}
                    >
                      <Text
                        className={`text-xs font-semibold ${selected ? 'text-black dark:text-black' : 'text-white dark:text-white'}`}
                      >
                        {aspectRatio}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}

              {/* Custom Crop Card */}
              {(() => {
                const isCustomSelected = activeRoiPreset.key.startsWith('custom_');
                const customEffective = isCustomSelected
                  ? getEffectiveSensorRoi(activeRoiPreset, aspectRatio)
                  : { width: customWidth, height: customHeight };
                return (
                  <View
                    style={{
                      backgroundColor: isCustomSelected
                        ? (isDark ? 'rgba(203, 255, 60, 0.15)' : 'rgba(203, 255, 60, 0.25)')
                        : isDark
                          ? CARD_BG
                          : '#F4F4F5',
                      borderColor: isCustomSelected ? BRAND : 'transparent',
                      borderWidth: isCustomSelected ? 1.5 : 0,
                    }}
                    className="rounded-xl p-3.5"
                  >
                    <Pressable
                      onPress={() => setShowCustomEditor(prev => !prev)}
                      className="flex-row items-center justify-between"
                    >
                      <View>
                        <Text
                          className={`text-sm font-bold ${isDark ? 'text-white' : 'text-black'}`}
                        >
                          {translate('planet.roi_custom')}
                        </Text>
                        <Text
                          className={`mt-0.5 text-xs ${isDark ? 'text-white/60' : 'text-neutral-500'}`}
                        >
                          {`${customEffective.width}×${customEffective.height}`}
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-2">
                        {isCustomSelected && (
                          <View className="rounded-full bg-[#CBFF3C] px-2 py-0.5">
                            <Text className="text-[10px] font-bold text-black">
                              当前使用
                            </Text>
                          </View>
                        )}
                        <Text className={`text-xs ${isDark ? 'text-white/50' : 'text-neutral-400'}`}>
                          {showCustomEditor ? '收起 ▲' : '调整 ▼'}
                        </Text>
                      </View>
                    </Pressable>

                    {showCustomEditor && (
                      <View className="mt-3 border-t border-white/10 pt-3">
                        {/* 快捷推荐尺寸 */}
                        <Text className={`mb-1.5 text-[11px] font-medium ${isDark ? 'text-white/50' : 'text-neutral-500'}`}>
                          {translate('planet.roi_quick_presets')}
                        </Text>
                        <View className="mb-3 flex-row flex-wrap gap-2">
                          {QUICK_CUSTOM_ROI_SIZES.map(size => (
                            <Pressable
                              key={size.label}
                              onPress={() => {
                                setCustomWidth(size.width);
                                setCustomHeight(size.height);
                              }}
                              className={`rounded-lg px-2.5 py-1 ${customWidth === size.width && customHeight === size.height ? 'bg-[#CBFF3C]' : isDark ? 'bg-white/10' : 'bg-neutral-200'}`}
                            >
                              <Text
                                className={`text-xs ${customWidth === size.width && customHeight === size.height ? 'font-bold text-black' : isDark ? 'text-white' : 'text-black'}`}
                              >
                                {size.label}
                              </Text>
                            </Pressable>
                          ))}
                        </View>

                        {/* 宽度步进调节 */}
                        <View className="mb-2 flex-row items-center justify-between">
                          <Text className={`text-xs ${isDark ? 'text-white/70' : 'text-neutral-600'}`}>
                            {`${translate('planet.roi_width')} (128~1920)`}
                          </Text>
                          <View className="flex-row items-center gap-2">
                            <Pressable
                              onPress={() => setCustomWidth(w => Math.max(128, w - 16))}
                              className={`size-7 items-center justify-center rounded-md ${isDark ? 'bg-white/15' : 'bg-neutral-200'}`}
                            >
                              <Text className={`text-sm font-bold ${isDark ? 'text-white' : 'text-black'}`}>-16</Text>
                            </Pressable>
                            <Text className={`min-w-[48px] text-center font-bold ${isDark ? 'text-white' : 'text-black'}`}>
                              {customWidth}
                            </Text>
                            <Pressable
                              onPress={() => setCustomWidth(w => Math.min(1920, w + 16))}
                              className={`size-7 items-center justify-center rounded-md ${isDark ? 'bg-white/15' : 'bg-neutral-200'}`}
                            >
                              <Text className={`text-sm font-bold ${isDark ? 'text-white' : 'text-black'}`}>+16</Text>
                            </Pressable>
                          </View>
                        </View>

                        {/* 高度步进调节 */}
                        <View className="mb-3 flex-row items-center justify-between">
                          <Text className={`text-xs ${isDark ? 'text-white/70' : 'text-neutral-600'}`}>
                            {`${translate('planet.roi_height')} (96~1080)`}
                          </Text>
                          <View className="flex-row items-center gap-2">
                            <Pressable
                              onPress={() => setCustomHeight(h => Math.max(96, h - 8))}
                              className={`size-7 items-center justify-center rounded-md ${isDark ? 'bg-white/15' : 'bg-neutral-200'}`}
                            >
                              <Text className={`text-sm font-bold ${isDark ? 'text-white' : 'text-black'}`}>-8</Text>
                            </Pressable>
                            <Text className={`min-w-[48px] text-center font-bold ${isDark ? 'text-white' : 'text-black'}`}>
                              {customHeight}
                            </Text>
                            <Pressable
                              onPress={() => setCustomHeight(h => Math.min(1080, h + 8))}
                              className={`size-7 items-center justify-center rounded-md ${isDark ? 'bg-white/15' : 'bg-neutral-200'}`}
                            >
                              <Text className={`text-sm font-bold ${isDark ? 'text-white' : 'text-black'}`}>+8</Text>
                            </Pressable>
                          </View>
                        </View>

                        {/* 应用按钮 */}
                        <Pressable
                          onPress={() => {
                            countdown.cancel();
                            dismissError();
                            const customPreset = createCustomRoiPreset(customWidth, customHeight);
                            setRoiPreset(customPreset);
                            setRoiSheetOpen(false);
                          }}
                          disabled={settingsDisabled}
                          className="items-center justify-center rounded-xl bg-[#CBFF3C] py-2.5 active:opacity-80"
                        >
                          <Text className="text-sm font-bold text-black">
                            {translate('planet.roi_apply')}
                          </Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                );
              })()}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
