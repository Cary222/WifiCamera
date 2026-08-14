/* eslint-disable max-lines-per-function */

import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RTCView } from 'react-native-webrtc';
import { Text } from '@/components/ui';
import { useCameraStore } from '../camera-store';
import { useLandscapeCameraPreview } from '../components/native-camera-preview';
import { getCameraBaseUrl } from '../config';
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronUpIcon,
  CountdownIcon,
  SheetMenuIcon,
  StopwatchIcon,
  WatermarkFlaskIcon,
} from '../landscape/landscape-icons';
import { LandscapeRuler } from '../landscape/landscape-ruler';
import { formatDecCoordinate, formatRaCoordinate, formatSolveElapsed } from './solve-format';
import { useNebulaCapture } from './use-nebula-capture';
import { usePlateSolve } from './use-plate-solve';

const BRAND = '#CBFF3C';
const CARD_BG = '#1F1F1F';
const SHEET_BG = '#141414';
const PILL_BG = 'rgba(34,42,54,0.38)';
const SHUTTER_SIZE_RATIO = 0.1890547263681592;
const SHUTTER_BORDER_RATIO = 0.043478260869565216;

const SHUTTER_VALUES = [0.001, 0.00125, 0.0016, 0.002, 0.0025, 0.0033, 0.004, 0.005, 0.0067, 0.008, 0.01, 0.0125, 0.0167, 0.02, 0.025, 0.033, 0.04, 0.05, 0.067, 0.08, 0.1, 0.125, 0.167, 0.2, 0.25, 0.33, 0.5, 0.67, 1];
const GAIN_VALUES = Array.from({ length: 41 }, (_, index) => index * 3);
const COUNT_VALUES = Array.from({ length: 50 }, (_, index) => index + 1);
const INTERVAL_VALUES = Array.from({ length: 61 }, (_, index) => index);
const COUNTDOWN_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 30];

function formatShutter(value: number) {
  return value >= 1 ? `${value}` : `1/${Math.round(1 / value)}`;
}

function ToolCard({ label, active, onPress, icon }: { label: string; active: boolean; onPress: () => void; icon?: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} style={{ backgroundColor: active ? BRAND : CARD_BG }} className="h-[92px] flex-1 items-center justify-center gap-2 rounded-2xl active:opacity-80">
      {icon}
      <Text className={`text-[12px] ${active ? 'text-black' : 'text-white'}`}>{label}</Text>
    </Pressable>
  );
}

function SolveResultRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row gap-3">
      <Text className="w-[58px] text-xs text-white/50">{label}</Text>
      <Text className="flex-1 text-xs text-white">{value}</Text>
    </View>
  );
}

export function NebulaCameraScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const connectionStatus = useCameraStore.use.connectionStatus();
  const lastCommandError = useCameraStore.use.lastCommandError();
  const newestCameraJpgUrl = useCameraStore.use.newestCameraJpgUrl();
  const recordingState = useCameraStore.use.landscapeRecordingState();
  const startRecording = useCameraStore.use.startLandscapeRecording();
  const stopRecording = useCameraStore.use.stopLandscapeRecording();
  const sendCommand = useCameraStore.use.sendCommand();

  const [sheetTarget, setSheetTarget] = useState<'manual' | 'tools'>('manual');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [exposure, setExposure] = useState(0.008);
  const [gain, setGain] = useState(6);
  const [autoStretch, setAutoStretch] = useState(true);
  const [watermark, setWatermark] = useState(false);
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [countdownEnabled, setCountdownEnabled] = useState(false);
  const [timerPlan, setTimerPlan] = useState({ count: 3, interval: 3 });
  const [countdown, setCountdown] = useState(3);
  const [captureMode, setCaptureMode] = useState<'photo' | 'video'>('photo');
  const [focusAssist, setFocusAssist] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const { previewState, stream } = useLandscapeCameraPreview();
  const { captureState, countdownRemaining, repeatTotal, capture, startCountdown, cancel } = useNebulaCapture({ exposure, gain });
  const { solveState, result: solveResult, solve, dismissResult } = usePlateSolve();

  const previewHeight = Math.min(height, width / 0.75);
  const spare = Math.max(0, height - previewHeight);
  const topShare = 0.35;
  const previewTop = Math.max(Math.min(insets.top, spare), Math.round(spare * topShare));
  const surfaceHeight = Math.min(height, width / 0.5625);
  const shutterSize = Math.round(width * SHUTTER_SIZE_RATIO);
  const shutterBorder = Math.max(3, Math.round(shutterSize * SHUTTER_BORDER_RATIO));
  const shutterInner = shutterSize - shutterBorder * 2 - 2;

  const isConnected = connectionStatus === 'open';
  const isCapturing = captureState === 'capturing';
  const isCountdown = captureState === 'countdown';
  const isRecording = recordingState === 'recording';
  const recordingBusy = recordingState === 'starting' || recordingState === 'processing';
  const isSolving = solveState !== 'idle';

  const imageUrl = useMemo(() => {
    if (!newestCameraJpgUrl)
      return null;
    const imagePath = newestCameraJpgUrl.replace(/\.fits$/i, '_preview.jpg');
    return `${getCameraBaseUrl()}/get_image?path=${encodeURIComponent(imagePath)}`;
  }, [newestCameraJpgUrl]);

  useEffect(() => {
    if (connectionStatus === 'open') {
      sendCommand({ device_name: 'main_camera', instruction: 'set_stretch', params: [autoStretch ? 1 : 0], id: `APP-NEB-STRETCH-${Date.now().toString(36)}` });
    }
  }, [autoStretch, connectionStatus, sendCommand]);

  useEffect(() => {
    if (!notice)
      return;
    const timer = setTimeout(() => setNotice(null), 2000);
    return () => clearTimeout(timer);
  }, [notice]);

  const shutter = () => {
    if (!isConnected)
      return;
    if (isCapturing || isCountdown)
      return cancel();
    if (captureMode === 'video') {
      if (isRecording)
        stopRecording();
      else if (!recordingBusy)
        startRecording();
      return;
    }
    const options = timerEnabled ? timerPlan : {};
    if (countdownEnabled)
      startCountdown(countdown, options);
    else capture(options);
  };

  const status = !isConnected
    ? '设备未连接'
    : solveState === 'saving'
      ? '正在保存当前帧原图至 SD 卡…'
      : solveState === 'solving'
        ? '正在生成 FITS 并匹配星表…'
        : isRecording
          ? '录像中'
          : recordingBusy
            ? '生成视频中'
            : isCapturing ? (repeatTotal > 1 ? `定时拍摄 ${repeatTotal} 张` : '拍摄中') : null;

  return (
    <View className="flex-1 bg-black">
      <View className="absolute left-0 items-center justify-center overflow-hidden bg-black" style={{ width, top: previewTop, height: previewHeight }}>
        {stream
          ? <RTCView streamURL={stream.toURL()} objectFit="cover" mirror={false} style={{ width, height: surfaceHeight }} />
          : <Text className="text-sm text-white/40">{previewState === 'error' ? '相机预览连接失败' : '相机预览连接中'}</Text>}
      </View>

      {watermark && <View className="absolute left-5" style={{ top: previewTop + 96 }}><Text className="text-base font-semibold text-white/85">SVBONY</Text></View>}

      <View className="absolute inset-x-0 flex-row items-center px-4" style={{ top: previewTop + 12 }}>
        <View className="flex-1 items-start"><Pressable onPress={onBack} style={{ backgroundColor: PILL_BG }} className="size-8 items-center justify-center rounded-full"><ChevronLeftIcon size={20} /></Pressable></View>
        <Pressable onPress={() => setSheetTarget(value => value === 'manual' ? 'tools' : 'manual')} style={{ backgroundColor: PILL_BG }} className="h-8 flex-row items-center gap-1 rounded-full px-3">
          <Text className="text-[11px] text-white">星空模式</Text>
          {sheetTarget === 'manual' ? <ChevronDownIcon size={14} /> : <ChevronUpIcon size={14} />}
        </Pressable>
        <View className="flex-1 items-end"><Pressable disabled={isSolving} onPress={() => solve()} style={{ backgroundColor: isSolving ? BRAND : PILL_BG }} className="h-7 min-w-[52px] items-center justify-center rounded-full px-3 active:opacity-80"><Text className={`text-[11px] ${isSolving ? 'text-black' : 'text-white'}`}>{isSolving ? '解析中…' : '解析'}</Text></Pressable></View>
      </View>

      <Pressable onPress={() => setFocusAssist(value => !value)} style={{ top: previewTop + 56, backgroundColor: focusAssist ? BRAND : PILL_BG }} className="absolute left-4 h-8 flex-row items-center gap-1 rounded-full px-2.5"><Text className={`text-[11px] ${focusAssist ? 'text-black' : 'text-white'}`}>对焦辅助</Text></Pressable>

      {(status || notice) && <View className="absolute inset-x-0 items-center" style={{ top: previewTop + 108 }}><View className="rounded-full bg-black/55 px-4 py-1.5"><Text className="text-xs text-white">{notice ?? status}</Text></View></View>}

      {solveResult && (
        <View className="absolute inset-x-4 rounded-2xl p-4" style={{ top: previewTop + 144, backgroundColor: SHEET_BG }}>
          <View className="mb-3 flex-row items-center justify-between">
            <Text className={`text-sm font-semibold ${solveResult.success ? 'text-[#CBFF3C]' : 'text-red-300'}`}>
              {solveResult.success ? '解析成功' : '解析失败'}
            </Text>
            <Pressable onPress={dismissResult} className="rounded-full bg-white/10 px-2 py-1 active:opacity-80"><Text className="text-xs text-white">关闭</Text></Pressable>
          </View>
          {solveResult.success
            ? (
                <View className="gap-1.5">
                  <SolveResultRow label="赤经" value={formatRaCoordinate(solveResult.ra ?? Number.NaN)} />
                  <SolveResultRow label="赤纬" value={formatDecCoordinate(solveResult.dec ?? Number.NaN)} />
                  <SolveResultRow label="旋转角" value={solveResult.orientation === null ? '--' : `${solveResult.orientation.toFixed(4)}°（东偏北）`} />
                  <SolveResultRow label="像素尺度" value={solveResult.pixelScale === null ? '--' : `${solveResult.pixelScale.toFixed(4)}″/px`} />
                  <SolveResultRow label="视场" value={solveResult.fieldWidth === null || solveResult.fieldHeight === null ? '--' : `${solveResult.fieldWidth.toFixed(4)}° × ${solveResult.fieldHeight.toFixed(4)}°`} />
                  <SolveResultRow label="用时" value={formatSolveElapsed(solveResult.elapsedMs)} />
                </View>
              )
            : <Text className="text-xs/5 text-white/80">{solveResult.error}</Text>}
        </View>
      )}
      {!sheetOpen && (
        <View className="absolute inset-x-0 items-center" style={{ bottom: insets.bottom + 110 }}>
          <Pressable
            onPress={shutter}
            disabled={!isConnected}
            className="items-center justify-center rounded-full"
            style={{
              width: shutterSize,
              height: shutterSize,
              borderRadius: shutterSize / 2,
              borderColor: BRAND,
              borderWidth: shutterBorder,
            }}
          >
            <View
              className="items-center justify-center rounded-full"
              style={{
                width: captureMode === 'video' && isRecording ? shutterInner * 0.46 : shutterInner,
                height: captureMode === 'video' && isRecording ? shutterInner * 0.46 : shutterInner,
                borderRadius: captureMode === 'video' && isRecording ? 8 : shutterInner / 2,
                backgroundColor: captureMode === 'video' && isRecording ? '#FF3B30' : '#FFFFFF',
              }}
            >
              {isCountdown && <Text className="text-[32px] font-semibold text-black">{countdownRemaining}</Text>}
            </View>
          </Pressable>
        </View>
      )}

      {sheetOpen && (
        <View className="absolute inset-x-0 rounded-t-[26px] p-4" style={{ bottom: insets.bottom + 96, backgroundColor: SHEET_BG }}>
          {sheetTarget === 'manual'
            ? (
                <View className="gap-4">
                  <LandscapeRuler label="快门" values={SHUTTER_VALUES} value={exposure} formatValue={value => `${formatShutter(value)} s`} formatTick={(value, index) => index % 5 === 0 ? formatShutter(value) : null} onChange={setExposure} />
                  <LandscapeRuler label="增益" values={GAIN_VALUES} value={gain} formatValue={value => `${value}dB`} formatTick={(value, index) => index % 5 === 0 ? `${value}` : null} onChange={setGain} />
                </View>
              )
            : (
                <View className="gap-4">
                  <View className="flex-row gap-3">
                    <ToolCard icon={<StopwatchIcon color={timerEnabled ? '#111' : '#FFF'} />} label="定时拍摄" active={timerEnabled} onPress={() => setTimerEnabled(value => !value)} />
                    <ToolCard icon={<CountdownIcon color={countdownEnabled ? '#111' : '#FFF'} />} label="倒计时" active={countdownEnabled} onPress={() => setCountdownEnabled(value => !value)} />
                    <ToolCard icon={<WatermarkFlaskIcon color={watermark ? '#111' : '#FFF'} />} label="水印" active={watermark} onPress={() => setWatermark(value => !value)} />
                  </View>
                  <Pressable onPress={() => setAutoStretch(value => !value)} style={{ backgroundColor: autoStretch ? BRAND : CARD_BG }} className="h-[70px] items-center justify-center rounded-2xl">
                    <Text className={autoStretch ? 'text-black' : 'text-white'}>
                      拍照成片自动拉伸：
                      {autoStretch ? '开启' : '关闭'}
                    </Text>
                  </Pressable>
                  {timerEnabled && (
                    <>
                      <LandscapeRuler label="张数" values={COUNT_VALUES} value={timerPlan.count} formatValue={value => `${value}张`} onChange={value => setTimerPlan(plan => ({ ...plan, count: value }))} />
                      <LandscapeRuler label="间隔" values={INTERVAL_VALUES} value={timerPlan.interval} formatValue={value => `${value}s`} onChange={value => setTimerPlan(plan => ({ ...plan, interval: value }))} />
                    </>
                  )}
                  {countdownEnabled && <LandscapeRuler label="倒计时" values={COUNTDOWN_VALUES} value={countdown} formatValue={value => `${value}s`} onChange={setCountdown} />}
                </View>
              )}
        </View>
      )}

      <View className="absolute inset-x-0 bottom-0 flex-row items-center justify-between bg-[#0A0A0A] px-5" style={{ paddingBottom: insets.bottom + 12, paddingTop: 12 }}>
        <Pressable className="size-[54px] overflow-hidden rounded-full bg-white/10">{imageUrl ? <Image source={{ uri: imageUrl }} style={{ width: 54, height: 54 }} contentFit="cover" /> : <View className="size-[54px] rounded-full bg-white/10" />}</Pressable>
        <View className="h-[40px] flex-row items-center rounded-full border border-white/22 px-1">{(['photo', 'video'] as const).map(mode => <Pressable key={mode} onPress={() => setCaptureMode(mode)} style={captureMode === mode ? { backgroundColor: BRAND } : undefined} className="h-[32px] min-w-[60px] items-center justify-center rounded-full"><Text className={`text-[13px] ${captureMode === mode ? 'font-medium text-black' : 'text-white'}`}>{mode === 'photo' ? '拍照' : '视频'}</Text></Pressable>)}</View>
        <Pressable onPress={() => setSheetOpen(value => !value)} className="size-[54px] items-center justify-center rounded-full border border-white/35"><SheetMenuIcon color={sheetOpen ? BRAND : '#FFFFFF'} /></Pressable>
      </View>
      {lastCommandError && lastCommandError !== 'see data' && <View className="absolute inset-x-0 items-center" style={{ bottom: insets.bottom + 220 }}><View className="rounded-full bg-black/70 px-4 py-1.5"><Text className="text-xs text-red-300">{lastCommandError}</Text></View></View>}
    </View>
  );
}
