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
import { PLANET_ROI_PRESETS, usePlanetCapture } from './use-planet-capture';

const BRAND = '#CBFF3C';
const CARD_BG = '#141518';
const SHEET_BG = '#141416';
const PILL_BG = 'rgba(34, 42, 54, 0.72)';

type MeteringMode = 'center' | 'target' | 'matrix';
type AspectRatio = '4:3' | '16:9' | 'full';

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function PlanetCameraScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width, height } = useWindowDimensions();

  const connectionStatus = useCameraStore.use.connectionStatus();
  const newestCameraJpgUrl = useCameraStore.use.newestCameraJpgUrl();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [meteringMode, setMeteringMode] = useState<MeteringMode>('matrix');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('4:3');
  const [countdownSeconds, setCountdownSeconds] = useState<number>(0);
  const [captureMode, setCaptureMode] = useState<'photo' | 'video'>('video');
  const [roiPreset, setRoiPreset] = useState<RoiPreset>(PLANET_ROI_PRESETS[0]);
  const [roiSheetOpen, setRoiSheetOpen] = useState(false);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);

  const format: PlanetFormat = 'ser8';
  const exposure = 0.008;
  const gain = 120;

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

  const switchMode = (target: 'landscape' | 'nebula') => {
    setModeMenuOpen(false);
    router.replace(`/camera?mode=${target}` as never);
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

        <Pressable
          onPress={() => setModeMenuOpen(true)}
          style={{ backgroundColor: PILL_BG }}
          className="h-8 flex-row items-center gap-1.5 rounded-full px-3.5 active:opacity-70"
        >
          <Text className="text-[12px] font-medium text-white">行星视频</Text>
          {drawerOpen ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
        </Pressable>

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
              {`REC ${formatClock(recordingSeconds)} · ${writtenFrames} 帧`}
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
        {drawerOpen
          ? (
              /* Quick Settings Panel (Drawer Open State) */
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
          : (
              /* Shutter Button (Normal State) */
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

          {/* Hamburger Menu Button */}
          <Pressable
            onPress={() => setDrawerOpen(prev => !prev)}
            style={{
              borderColor: drawerOpen ? BRAND : 'rgba(255, 255, 255, 0.22)',
              borderWidth: 1.5,
              backgroundColor: '#141518',
            }}
            className="size-[58px] items-center justify-center rounded-full active:opacity-70"
          >
            <SheetMenuIcon color={drawerOpen ? BRAND : '#FFF'} size={24} />
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

      {/* Mode Switch Menu Modal */}
      <Modal
        visible={modeMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setModeMenuOpen(false)}
      >
        <Pressable
          className="flex-1 items-center justify-center bg-black/60 px-6"
          onPress={() => setModeMenuOpen(false)}
        >
          <View className="w-full max-w-[320px] rounded-2xl p-5" style={{ backgroundColor: SHEET_BG }}>
            <Text className="mb-3 text-center text-base font-bold text-white">选择拍摄模式</Text>
            <View className="gap-2">
              <Pressable
                onPress={() => switchMode('landscape')}
                className="items-center rounded-xl bg-[#1F1F1F] p-3.5 active:opacity-75"
              >
                <Text className="text-sm text-white">风景模式</Text>
              </Pressable>
              <Pressable
                onPress={() => switchMode('nebula')}
                className="items-center rounded-xl bg-[#1F1F1F] p-3.5 active:opacity-75"
              >
                <Text className="text-sm text-white">星空模式</Text>
              </Pressable>
              <Pressable
                onPress={() => setModeMenuOpen(false)}
                style={{ backgroundColor: BRAND }}
                className="items-center rounded-xl p-3.5 active:opacity-75"
              >
                <Text className="text-sm font-bold text-black">行星视频（当前）</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
