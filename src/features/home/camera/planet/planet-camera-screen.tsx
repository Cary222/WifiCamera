/* eslint-disable max-lines-per-function */

import type { AspectRatio } from './preview-layout';
import type { PlanetFormat, RoiPreset } from './use-planet-capture';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SegmentedControl, Text } from '@/components/ui';
import { translate } from '@/lib/i18n';
import { useCameraStore } from '../camera-store';
import { CameraModeSwitcher } from '../components/camera-mode-switcher';
import { CameraTopBar } from '../components/camera-top-bar';
import { PreviewSurface, useLandscapeCameraPreview } from '../components/native-camera-preview';
import { getCameraBaseUrl } from '../config';
import {
  CloseIcon,
  CountdownIcon,
  MeteringIcon,
  SheetMenuIcon,
} from '../landscape/landscape-icons';
import { LandscapeRuler } from '../landscape/landscape-ruler';
import {
  getEffectiveSensorRoi,
  getPreviewSurfaceHeightForRoi,
  isNativeSensorAspectRatio,
} from './preview-layout';
import { PLANET_ROI_PRESETS, usePlanetCapture } from './use-planet-capture';
import { useShutterCountdown } from './use-shutter-countdown';

const BRAND = '#CBFF3C';
const CARD_BG = '#141518';
const SHEET_BG = '#141416';
const PILL_GROUP_BG = '#141518';

const EXPOSURE_VALUES = [
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
const GAIN_VALUES = Array.from({ length: 81 }, (_, index) => index * 3);

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

function ParamCard({ label, value, active, disabled = false, onPress }: {
  label: string;
  value: string;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        backgroundColor: active ? BRAND : CARD_BG,
        borderColor: active ? BRAND : 'rgba(255, 255, 255, 0.12)',
      }}
      className="h-[74px] flex-1 items-center justify-center rounded-2xl border active:opacity-80 disabled:opacity-40"
    >
      <Text className={`text-[12px] ${active ? 'font-medium text-black/75 dark:text-black/75' : 'text-white/55 dark:text-white/55'}`}>
        {label}
      </Text>
      <Text className={`mt-1.5 text-[17px] font-bold ${active ? 'text-black dark:text-black' : 'text-white dark:text-white'}`}>
        {value}
      </Text>
    </Pressable>
  );
}

export function PlanetCameraScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width, height } = useWindowDimensions();

  const connectionStatus = useCameraStore.use.connectionStatus();
  const newestCameraJpgUrl = useCameraStore.use.newestCameraJpgUrl();
  const latestVideoName = useCameraStore.use.landscapeLatestVideoName();

  // Top capsule arrow direction: 'down' (图二) <-> 'up' (图三)
  const [arrowDirection, setArrowDirection] = useState<ArrowDirection>('down');
  // Bottom panel open/closed state
  const [isPanelOpen, setIsPanelOpen] = useState(true);

  // Fig 2 state (Param Controls)
  const [activeParamCard, setActiveParamCard] = useState<ActiveParamCard>('gain');
  const [exposure, setExposure] = useState(0.008);
  const [gain, setGain] = useState(6);
  const [containerFormat, setContainerFormat] = useState<ContainerFormat>('ser');
  const [bitDepth, setBitDepth] = useState<BitDepth>('8-bit');

  // Fig 3 state (Quick Settings)
  // 板端尚未提供测光模式指令，先固定为全画面并禁用切换。
  const meteringMode: MeteringMode = 'matrix';
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('full');
  const [countdownSeconds, setCountdownSeconds] = useState<number>(0);

  // Common ROI and Capture State
  const [roiPreset, setRoiPreset] = useState<RoiPreset>(PLANET_ROI_PRESETS[0]);
  const [captureMode, setCaptureMode] = useState<'photo' | 'video'>('video');
  const [roiSheetOpen, setRoiSheetOpen] = useState(false);
  const activeRoiPreset = useMemo(
    () => aspectRatio === '16:9' && !isNativeSensorAspectRatio(roiPreset, '16:9')
      ? PLANET_ROI_PRESETS[0]
      : roiPreset,
    [aspectRatio, roiPreset],
  );
  const selectableRoiPresets = useMemo(
    () => aspectRatio === '16:9'
      ? PLANET_ROI_PRESETS.filter(preset => isNativeSensorAspectRatio(preset, '16:9'))
      : PLANET_ROI_PRESETS,
    [aspectRatio],
  );

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

  const { previewState, stream } = useLandscapeCameraPreview();
  const {
    isRecording,
    recordingSeconds,
    writtenFrames,
    isCapturing,
    isApplyingRoi,
    effectiveRoi,
    capturePhoto,
    startRecording,
    stopRecording,
    dismissError,
  } = usePlanetCapture({ exposure, gain, format, roiPreset: activeRoiPreset, aspectRatio });

  const isConnected = connectionStatus === 'open';
  const isVideoRecording = captureMode === 'video' && isRecording;

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

  const countdown = useShutterCountdown({ seconds: countdownSeconds, onFire: runShutter });
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

  const settingsDisabled = isRecording || isCapturing || isApplyingRoi || countdownRemaining > 0;
  const surfaceHeight = useMemo(
    () => getPreviewSurfaceHeightForRoi(effectiveRoi, width, height),
    [effectiveRoi, height, width],
  );

  return (
    <View className="flex-1 bg-black">
      {/* 1. Camera Viewport */}
      <View className="flex-1 items-center justify-center overflow-hidden bg-black">
        <PreviewSurface
          stream={stream}
          previewState={previewState}
          width={width}
          height={surfaceHeight}
        />
      </View>

      <CameraTopBar
        title={translate('planet.mode_title')}
        onBack={handleBack}
        onTitlePress={() => setArrowDirection(prev => (prev === 'down' ? 'up' : 'down'))}
        expanded={arrowDirection === 'down'}
        disabled={settingsDisabled}
        style={{ top: insets.top + 10 }}
        rightContent={(
          <Pressable
            onPress={() => setRoiSheetOpen(true)}
            disabled={settingsDisabled}
            className="items-end justify-center py-1 active:opacity-70 disabled:opacity-40"
          >
            <Text className="text-[11px] font-medium tracking-wide text-white/90">
              {`${effectiveRoi.width}×${effectiveRoi.height}  ${activeRoiPreset.fps}fps`}
            </Text>
          </Pressable>
        )}
      />

      {/* 3. Recording / ROI Indicator */}
      {isApplyingRoi && (
        <View className="absolute inset-x-0 items-center" style={{ top: insets.top + 58 }}>
          <View className="rounded-full bg-black/75 px-3.5 py-1">
            <Text className="text-xs font-medium text-white">{translate('planet.switching_roi')}</Text>
          </View>
        </View>
      )}
      {isRecording && (
        <View className="absolute inset-x-0 items-center" style={{ top: insets.top + 58 }}>
          <View className="flex-row items-center gap-2 rounded-full bg-red-600/90 px-3.5 py-1">
            <View className="size-2 rounded-full bg-white" />
            <Text className="text-xs font-bold text-white">
              {`REC ${formatClock(recordingSeconds)}${containerFormat === 'mp4' ? '' : ` · ${writtenFrames} ${translate('planet.frames')}`}`}
            </Text>
          </View>
        </View>
      )}

      {/* 5. Bottom Control Container */}
      <View
        className="absolute inset-x-0 bottom-0 bg-[#0A0A0A] px-4 pt-3"
        style={{ paddingBottom: Math.max(insets.bottom, 16) + 6 }}
      >
        {isPanelOpen
          ? (
              arrowDirection === 'down'
                ? (
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
                          value={`${gain}`}
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
                              onChange={value => setContainerFormat(value as 'mp4' | 'ser')}
                              variant="capsule-lg"
                              className="h-[44px]"
                              style={{
                                backgroundColor: PILL_GROUP_BG,
                                borderColor: 'rgba(255, 255, 255, 0.14)',
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
                                backgroundColor: PILL_GROUP_BG,
                                borderColor: 'rgba(255, 255, 255, 0.14)',
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
                              formatTick={(value, index) => (index % 5 === 0 ? formatExposure(value) : null)}
                              onChange={(value) => {
                                if (!settingsDisabled)
                                  setExposure(value);
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
                              formatValue={value => `${value}dB`}
                              formatTick={(value, index) => (index % 5 === 0 ? `${value}` : null)}
                              onChange={(value) => {
                                if (!settingsDisabled)
                                  setGain(value);
                              }}
                            />
                          </View>
                        )}
                      </View>
                    </View>
                  )
                : (
                    /* ─── 图三：快捷设置面板 (Arrow Up State) ─── */
                    <View className="mb-2">
                      {/* Row 1: 测光模式（板端暂无对应指令，置灰待接入） */}
                      <View className="mb-3.5 flex-row items-center justify-between px-1" style={{ opacity: 0.4 }}>
                        <View className="flex-row items-center gap-2.5">
                          <MeteringIcon color="#FFF" size={24} />
                          <Text className="text-[15px] font-normal text-white">{translate('planet.metering_mode')}</Text>
                        </View>

                        <View
                          style={{ backgroundColor: '#141518', borderColor: 'rgba(255, 255, 255, 0.14)' }}
                          className="h-[38px] flex-row items-center rounded-full border p-1"
                        >
                          {(['center', 'target', 'matrix'] as const).map((modeKey) => {
                            const selected = meteringMode === modeKey;
                            const label = modeKey === 'center'
                              ? translate('planet.label_metering_center')
                              : modeKey === 'target'
                                ? translate('planet.label_metering_target')
                                : translate('planet.label_metering_matrix');
                            return (
                              <Pressable
                                key={modeKey}
                                disabled
                                style={{ backgroundColor: selected ? BRAND : 'transparent' }}
                                className="h-[28px] min-w-[52px] items-center justify-center rounded-full px-3"
                              >
                                <Text
                                  className={`text-[13px] ${
                                    selected ? 'font-bold text-black dark:text-black' : 'font-normal text-white dark:text-white'
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
                            const next = aspectRatio === '4:3' ? '16:9' : aspectRatio === '16:9' ? 'full' : '4:3';
                            if (next === '16:9' && !isNativeSensorAspectRatio(roiPreset, '16:9'))
                              setRoiPreset(PLANET_ROI_PRESETS[0]);
                            setAspectRatio(next);
                          }}
                          disabled={settingsDisabled}
                          style={{ backgroundColor: CARD_BG, borderColor: 'rgba(255, 255, 255, 0.12)' }}
                          className="h-[76px] flex-1 items-center justify-center rounded-2xl border active:opacity-75 disabled:opacity-40"
                        >
                          <Text className="text-[18px] font-normal text-white">
                            {aspectRatio === 'full' ? translate('planet.aspect_full') : aspectRatio}
                          </Text>
                        </Pressable>

                        {/* Card 2: Countdown Timer */}
                        <Pressable
                          onPress={() => {
                            setCountdownSeconds(prev => (prev === 0 ? 3 : prev === 3 ? 5 : prev === 5 ? 10 : 0));
                          }}
                          disabled={settingsDisabled}
                          style={{ backgroundColor: CARD_BG, borderColor: 'rgba(255, 255, 255, 0.12)' }}
                          className="h-[76px] flex-1 items-center justify-center rounded-2xl border active:opacity-75 disabled:opacity-40"
                        >
                          <CountdownIcon color="#FFF" size={24} disabled={countdownSeconds === 0} />
                          <Text className="mt-1 text-[11px] font-normal text-white/70">
                            {countdownSeconds > 0 ? `${countdownSeconds}s` : translate('planet.countdown_label')}
                          </Text>
                        </Pressable>

                        {/* Card 3: Resolution */}
                        <Pressable
                          onPress={() => setRoiSheetOpen(true)}
                          disabled={settingsDisabled}
                          style={{ backgroundColor: CARD_BG, borderColor: 'rgba(255, 255, 255, 0.12)' }}
                          className="h-[76px] flex-1 items-center justify-center rounded-2xl border active:opacity-75 disabled:opacity-40"
                        >
                          <Text className="text-[13px] font-normal text-white">
                            {`${effectiveRoi.width}×${effectiveRoi.height}`}
                          </Text>
                        </Pressable>

                        {/* Card 4: Frame Rate */}
                        <Pressable
                          onPress={() => setRoiSheetOpen(true)}
                          disabled={settingsDisabled}
                          style={{ backgroundColor: CARD_BG, borderColor: 'rgba(255, 255, 255, 0.12)' }}
                          className="h-[76px] flex-1 items-center justify-center rounded-2xl border active:opacity-75 disabled:opacity-40"
                        >
                          <Text className="text-[18px] font-normal text-white">
                            {`${activeRoiPreset.fps}fps`}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  )
            )
          : (
              /* ─── 常规快门态 (Panel Closed State) ─── */
              <View className="items-center justify-center py-5">
                <Pressable
                  onPress={handleShutter}
                  disabled={!isConnected || isCapturing || isApplyingRoi || previewState !== 'live'}
                  className="items-center justify-center rounded-full active:opacity-80"
                  style={{
                    width: 76,
                    height: 76,
                    borderRadius: 38,
                    borderColor: BRAND,
                    borderWidth: 3.5,
                    backgroundColor: 'transparent',
                  }}
                >
                  <View
                    className="items-center justify-center"
                    style={{
                      width: isVideoRecording ? 28 : 62,
                      height: isVideoRecording ? 28 : 62,
                      borderRadius: isVideoRecording ? 6 : 31,
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

        {/* Row 3: Bottom Action Bar */}
        <View className="flex-row items-center justify-between px-1">
          {/* Album Button */}
          <Pressable
            onPress={() => router.push('/album' as never)}
            className="size-[54px] items-center justify-center overflow-hidden rounded-full bg-white/10 active:opacity-70"
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
                  <View className="size-[54px] rounded-full bg-white/10" />
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
              borderColor: isPanelOpen ? BRAND : 'rgba(255, 255, 255, 0.22)',
              borderWidth: 1.6,
            }}
            className="size-[54px] items-center justify-center rounded-full active:opacity-70"
          >
            <SheetMenuIcon color={isPanelOpen ? BRAND : '#FFF'} size={24} />
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
            style={{ backgroundColor: SHEET_BG, paddingBottom: insets.bottom + 20 }}
          >
            <View className="mb-4 flex-row items-center justify-between">
              <Text className="text-base font-bold text-white">{translate('planet.framing')}</Text>
              <Pressable
                onPress={() => setRoiSheetOpen(false)}
                className="size-8 items-center justify-center rounded-full bg-white/10 active:opacity-80"
              >
                <CloseIcon size={16} />
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
                    style={{ backgroundColor: selected ? BRAND : CARD_BG }}
                    className="flex-row items-center justify-between rounded-xl px-4 py-3.5 active:opacity-80"
                  >
                    <View>
                      <Text className={`text-sm font-bold ${selected ? 'text-black dark:text-black' : 'text-white dark:text-white'}`}>
                        {`${presetRoi.width}×${presetRoi.height}`}
                      </Text>
                      <Text className={`mt-0.5 text-xs ${selected ? 'text-black/70 dark:text-black/70' : 'text-white/50 dark:text-white/50'}`}>
                        {translate('planet.roi_text', { fps: preset.fps })}
                      </Text>
                    </View>
                    <View className={`rounded-full px-2.5 py-1 ${selected ? 'bg-black/20' : 'bg-white/10'}`}>
                      <Text className={`text-xs font-semibold ${selected ? 'text-black dark:text-black' : 'text-white dark:text-white'}`}>
                        {translate('planet.roi_summary', { aspect: aspectRatio === 'full' ? translate('planet.aspect_full') : aspectRatio, fps: preset.fps })}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
