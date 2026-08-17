/* eslint-disable max-lines-per-function */

import type { PlanetFormat, RoiPreset } from './use-planet-capture';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Modal, Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui';
import { useCameraStore } from '../camera-store';
import { PreviewSurface, useLandscapeCameraPreview } from '../components/native-camera-preview';
import { getCameraBaseUrl } from '../config';
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronUpIcon,
  CloseIcon,
  CountdownIcon,
  MeteringIcon,
  SheetMenuIcon,
} from '../landscape/landscape-icons';
import { LandscapeRuler } from '../landscape/landscape-ruler';
import { PLANET_ROI_PRESETS, usePlanetCapture } from './use-planet-capture';

const BRAND = '#CBFF3C';
const CARD_BG = '#141518';
const SHEET_BG = '#141416';
const PILL_BG = 'rgba(34, 42, 54, 0.72)';
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
type AspectRatio = '4:3' | '16:9' | 'full';

function ParamCard({ label, value, active, onPress }: {
  label: string;
  value: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: active ? BRAND : CARD_BG,
        borderColor: active ? BRAND : 'rgba(255, 255, 255, 0.12)',
      }}
      className="h-[74px] flex-1 items-center justify-center rounded-2xl border active:opacity-80"
    >
      <Text className={`text-[12px] ${active ? 'font-medium text-black/75' : 'text-white/55'}`}>
        {label}
      </Text>
      <Text className={`mt-1.5 text-[17px] font-bold ${active ? 'text-black' : 'text-white'}`}>
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
  const [meteringMode, setMeteringMode] = useState<MeteringMode>('matrix');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('4:3');
  const [countdownSeconds, setCountdownSeconds] = useState<number>(0);

  // Common ROI and Capture State
  const [roiPreset, setRoiPreset] = useState<RoiPreset>(PLANET_ROI_PRESETS[0]);
  const [captureMode, setCaptureMode] = useState<'photo' | 'video'>('video');
  const [roiSheetOpen, setRoiSheetOpen] = useState(false);

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
    actionError,
    capturePhoto,
    startRecording,
    stopRecording,
    dismissError,
  } = usePlanetCapture({ exposure, gain, format, roiPreset });

  const isConnected = connectionStatus === 'open';
  const isVideoRecording = captureMode === 'video' && isRecording;

  const imageUrl = useMemo(() => {
    if (!newestCameraJpgUrl)
      return null;
    const imagePath = newestCameraJpgUrl.replace(/\.fits$/i, '_preview.jpg');
    return `${getCameraBaseUrl()}/get_image?path=${encodeURIComponent(imagePath)}`;
  }, [newestCameraJpgUrl]);

  const handleShutter = () => {
    if (!isConnected)
      return;
    if (captureMode === 'photo') {
      void capturePhoto();
      return;
    }
    if (isRecording)
      void stopRecording();
    else void startRecording();
  };

  const handleCaptureModePress = (mode: 'photo' | 'video') => {
    if (captureMode !== mode) {
      setCaptureMode(mode);
      return;
    }
    handleShutter();
  };

  const surfaceHeight = Math.min(height, width / 0.5625);

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

      {/* 2. Top Bar */}
      <View
        className="absolute inset-x-0 flex-row items-center justify-between px-4"
        style={{ top: insets.top + 10 }}
      >
        <Pressable
          onPress={onBack}
          style={{ backgroundColor: PILL_BG }}
          className="size-9 items-center justify-center rounded-full active:opacity-70"
        >
          <ChevronLeftIcon size={20} />
        </Pressable>

        {/* Top Capsule: Toggles arrow direction (down ⌵ <-> up ⌃) */}
        <Pressable
          onPress={() => {
            setArrowDirection(prev => (prev === 'down' ? 'up' : 'down'));
          }}
          style={{ backgroundColor: PILL_BG }}
          className="h-8 flex-row items-center gap-1.5 rounded-full px-3.5 active:opacity-70"
        >
          <Text className="text-[12px] font-medium text-white">行星视频</Text>
          {arrowDirection === 'down' ? <ChevronDownIcon size={14} /> : <ChevronUpIcon size={14} />}
        </Pressable>

        {/* Top-Right: ROI Specs */}
        <Pressable
          onPress={() => setRoiSheetOpen(true)}
          className="items-end justify-center py-1 active:opacity-70"
        >
          <Text className="text-[13px] font-medium tracking-wide text-white/90">
            {`${roiPreset.resolution}  ${roiPreset.fps}fps`}
          </Text>
        </Pressable>
      </View>

      {/* 3. Recording Indicator */}
      {isRecording && (
        <View className="absolute inset-x-0 items-center" style={{ top: insets.top + 58 }}>
          <View className="flex-row items-center gap-2 rounded-full bg-red-600/90 px-3.5 py-1">
            <View className="size-2 rounded-full bg-white" />
            <Text className="text-xs font-bold text-white">
              {`REC ${formatClock(recordingSeconds)}${containerFormat === 'mp4' ? '' : ` · ${writtenFrames} 帧`}`}
            </Text>
          </View>
        </View>
      )}

      {/* 4. Action Error Toast */}
      {actionError && (
        <Pressable
          onPress={dismissError}
          className="absolute inset-x-0 items-center"
          style={{ top: insets.top + 98 }}
        >
          <View className="rounded-full border border-red-500/40 bg-black/80 px-4 py-1.5">
            <Text className="text-xs text-red-300">{actionError}</Text>
          </View>
        </Pressable>
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
                          label="曝光时间"
                          value={formatExposure(exposure)}
                          active={activeParamCard === 'exposure'}
                          onPress={() => setActiveParamCard('exposure')}
                        />
                        <ParamCard
                          label="增益"
                          value={`${gain}`}
                          active={activeParamCard === 'gain'}
                          onPress={() => setActiveParamCard('gain')}
                        />
                        <ParamCard
                          label="格式"
                          value={formatCardLabel}
                          active={activeParamCard === 'format'}
                          onPress={() => setActiveParamCard('format')}
                        />
                      </View>

                      {/* Row 2: Dynamic Adjustment Area (Ruler / Formats) */}
                      <View className="mt-4 min-h-[52px] justify-center">
                        {activeParamCard === 'format' && (
                          <View className="flex-row items-center gap-3">
                            {/* Container Pill (MP4 / SER) */}
                            <View
                              style={{ backgroundColor: PILL_GROUP_BG, borderColor: 'rgba(255, 255, 255, 0.14)' }}
                              className="h-[44px] flex-row items-center rounded-full border p-1"
                            >
                              {(['mp4', 'ser'] as const).map((item) => {
                                const selected = containerFormat === item;
                                return (
                                  <Pressable
                                    key={item}
                                    onPress={() => setContainerFormat(item)}
                                    disabled={isRecording}
                                    style={{ backgroundColor: selected ? BRAND : 'transparent' }}
                                    className="h-[34px] min-w-[56px] items-center justify-center rounded-full px-3"
                                  >
                                    <Text
                                      className={`text-[13px] ${
                                        selected ? 'font-bold text-black' : 'font-medium text-white'
                                      }`}
                                    >
                                      {item.toUpperCase()}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </View>

                            {/* Bit Depth Pill (8-bit / 12-bit / 16-bit) */}
                            <View
                              style={{
                                backgroundColor: PILL_GROUP_BG,
                                borderColor: 'rgba(255, 255, 255, 0.14)',
                                opacity: containerFormat === 'ser' ? 1 : 0.35,
                              }}
                              className="h-[44px] flex-1 flex-row items-center rounded-full border p-1"
                            >
                              {(['8-bit', '12-bit', '16-bit'] as const).map((depth) => {
                                const selected = containerFormat === 'ser' && bitDepth === depth;
                                return (
                                  <Pressable
                                    key={depth}
                                    onPress={() => {
                                      if (containerFormat === 'ser')
                                        setBitDepth(depth);
                                    }}
                                    disabled={isRecording || containerFormat !== 'ser'}
                                    style={{ backgroundColor: selected ? BRAND : 'transparent' }}
                                    className="h-[34px] flex-1 items-center justify-center rounded-full"
                                  >
                                    <Text
                                      className={`text-[13px] ${
                                        selected ? 'font-bold text-black' : 'font-medium text-white'
                                      }`}
                                    >
                                      {depth}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                          </View>
                        )}

                        {activeParamCard === 'exposure' && (
                          <View className="w-full items-center py-1">
                            <LandscapeRuler
                              label="快门"
                              values={EXPOSURE_VALUES}
                              value={exposure}
                              formatValue={value => formatExposure(value)}
                              formatTick={(value, index) => (index % 5 === 0 ? formatExposure(value) : null)}
                              onChange={setExposure}
                            />
                          </View>
                        )}

                        {activeParamCard === 'gain' && (
                          <View className="w-full items-center py-1">
                            <LandscapeRuler
                              label="增益"
                              values={GAIN_VALUES}
                              value={gain}
                              formatValue={value => `${value}dB`}
                              formatTick={(value, index) => (index % 5 === 0 ? `${value}` : null)}
                              onChange={setGain}
                            />
                          </View>
                        )}
                      </View>
                    </View>
                  )
                : (
                    /* ─── 图三：快捷设置面板 (Arrow Up State) ─── */
                    <View className="mb-2">
                      {/* Row 1: 测光模式 */}
                      <View className="mb-3.5 flex-row items-center justify-between px-1">
                        <View className="flex-row items-center gap-2.5">
                          <MeteringIcon color="#FFF" size={24} />
                          <Text className="text-[15px] font-normal text-white">测光模式</Text>
                        </View>

                        <View
                          style={{ backgroundColor: '#141518', borderColor: 'rgba(255, 255, 255, 0.14)' }}
                          className="h-[38px] flex-row items-center rounded-full border p-1"
                        >
                          {(['center', 'target', 'matrix'] as const).map((modeKey) => {
                            const selected = meteringMode === modeKey;
                            const label = modeKey === 'center' ? '中心' : modeKey === 'target' ? '目标' : '全画面';
                            return (
                              <Pressable
                                key={modeKey}
                                onPress={() => setMeteringMode(modeKey)}
                                style={{ backgroundColor: selected ? BRAND : 'transparent' }}
                                className="h-[28px] min-w-[52px] items-center justify-center rounded-full px-3"
                              >
                                <Text
                                  className={`text-[13px] ${
                                    selected ? 'font-bold text-black' : 'font-normal text-white'
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
                            setAspectRatio(prev => (prev === '4:3' ? '16:9' : prev === '16:9' ? 'full' : '4:3'));
                          }}
                          style={{ backgroundColor: CARD_BG, borderColor: 'rgba(255, 255, 255, 0.12)' }}
                          className="h-[76px] flex-1 items-center justify-center rounded-2xl border active:opacity-75"
                        >
                          <Text className="text-[18px] font-normal text-white">
                            {aspectRatio === 'full' ? '全幅' : aspectRatio}
                          </Text>
                        </Pressable>

                        {/* Card 2: Countdown Timer */}
                        <Pressable
                          onPress={() => {
                            setCountdownSeconds(prev => (prev === 0 ? 3 : prev === 3 ? 5 : prev === 5 ? 10 : 0));
                          }}
                          style={{ backgroundColor: CARD_BG, borderColor: 'rgba(255, 255, 255, 0.12)' }}
                          className="h-[76px] flex-1 items-center justify-center rounded-2xl border active:opacity-75"
                        >
                          <CountdownIcon color="#FFF" size={24} disabled={countdownSeconds === 0} />
                          <Text className="mt-1 text-[11px] font-normal text-white/70">
                            {countdownSeconds > 0 ? `${countdownSeconds}s` : '倒计时'}
                          </Text>
                        </Pressable>

                        {/* Card 3: Resolution */}
                        <Pressable
                          onPress={() => setRoiSheetOpen(true)}
                          style={{ backgroundColor: CARD_BG, borderColor: 'rgba(255, 255, 255, 0.12)' }}
                          className="h-[76px] flex-1 items-center justify-center rounded-2xl border active:opacity-75"
                        >
                          <Text className="text-[18px] font-normal text-white">
                            {roiPreset.resolution}
                          </Text>
                        </Pressable>

                        {/* Card 4: Frame Rate */}
                        <Pressable
                          onPress={() => setRoiSheetOpen(true)}
                          style={{ backgroundColor: CARD_BG, borderColor: 'rgba(255, 255, 255, 0.12)' }}
                          className="h-[76px] flex-1 items-center justify-center rounded-2xl border active:opacity-75"
                        >
                          <Text className="text-[18px] font-normal text-white">
                            {`${roiPreset.fps}fps`}
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
                  disabled={!isConnected || isCapturing}
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
                    style={{
                      width: isVideoRecording ? 28 : 62,
                      height: isVideoRecording ? 28 : 62,
                      borderRadius: isVideoRecording ? 6 : 31,
                      backgroundColor: isVideoRecording ? '#FF3B30' : '#FFFFFF',
                    }}
                  />
                </Pressable>
              </View>
            )}

        {/* Row 3: Bottom Action Bar */}
        <View className="flex-row items-center justify-between px-1">
          {/* Album Button */}
          <Pressable
            onPress={() => router.push('/album' as never)}
            className="size-[58px] items-center justify-center overflow-hidden rounded-full border border-white/20 bg-[#1A1A1D] active:opacity-70"
          >
            {imageUrl
              ? (
                  <Image
                    source={{ uri: imageUrl }}
                    style={{ width: 58, height: 58 }}
                    contentFit="cover"
                  />
                )
              : (
                  <View className="size-[58px] items-center justify-center rounded-full bg-white/10">
                    <Text className="text-[11px] text-white/60">相册</Text>
                  </View>
                )}
          </Pressable>

          {/* Capture Mode Toggle Capsule (拍照 | 视频) */}
          <View
            style={{ backgroundColor: CARD_BG, borderColor: 'rgba(255, 255, 255, 0.16)' }}
            className="h-[48px] flex-row items-center rounded-full border p-1 px-1.5"
          >
            <Pressable
              onPress={() => handleCaptureModePress('photo')}
              disabled={isRecording}
              style={{ backgroundColor: captureMode === 'photo' ? BRAND : 'transparent' }}
              className="h-[38px] min-w-[70px] items-center justify-center rounded-full px-4 active:opacity-80"
            >
              <Text
                className={`text-[14px] ${
                  captureMode === 'photo' ? 'font-bold text-black' : 'font-medium text-white'
                }`}
              >
                {isCapturing ? '拍摄中' : '拍照'}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => handleCaptureModePress('video')}
              style={{ backgroundColor: captureMode === 'video' ? BRAND : 'transparent' }}
              className="h-[38px] min-w-[70px] items-center justify-center rounded-full px-4 active:opacity-80"
            >
              <Text
                className={`text-[14px] ${
                  captureMode === 'video' ? 'font-bold text-black' : 'font-medium text-white'
                }`}
              >
                {isRecording ? '停止' : '视频'}
              </Text>
            </Pressable>
          </View>

          {/* Hamburger Menu Button (Toggles Panel Open/Closed) */}
          <Pressable
            onPress={() => setIsPanelOpen(prev => !prev)}
            style={{
              borderColor: isPanelOpen ? BRAND : 'rgba(255, 255, 255, 0.22)',
              borderWidth: 1.5,
              backgroundColor: '#141518',
            }}
            className="size-[58px] items-center justify-center rounded-full active:opacity-70"
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
              <Text className="text-base font-bold text-white">ROI 硬件裁切与帧率</Text>
              <Pressable
                onPress={() => setRoiSheetOpen(false)}
                className="size-8 items-center justify-center rounded-full bg-white/10 active:opacity-80"
              >
                <CloseIcon size={16} />
              </Pressable>
            </View>

            <View className="gap-2.5">
              {PLANET_ROI_PRESETS.map((preset) => {
                const selected = roiPreset.key === preset.key;
                return (
                  <Pressable
                    key={preset.key}
                    onPress={() => {
                      setRoiPreset(preset);
                      setRoiSheetOpen(false);
                    }}
                    disabled={isRecording}
                    style={{ backgroundColor: selected ? BRAND : CARD_BG }}
                    className="flex-row items-center justify-between rounded-xl px-4 py-3.5 active:opacity-80"
                  >
                    <View>
                      <Text className={`text-sm font-bold ${selected ? 'text-black' : 'text-white'}`}>
                        {preset.label}
                      </Text>
                      <Text className={`mt-0.5 text-xs ${selected ? 'text-black/70' : 'text-white/50'}`}>
                        {`最高 ${preset.fps} FPS`}
                      </Text>
                    </View>
                    <View className={`rounded-full px-2.5 py-1 ${selected ? 'bg-black/20' : 'bg-white/10'}`}>
                      <Text className={`text-xs font-semibold ${selected ? 'text-black' : 'text-white'}`}>
                        {preset.resolution}
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
