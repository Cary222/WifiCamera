/* eslint-disable max-lines-per-function */

import type { LandscapeRatio } from '../camera-store';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui';
import { translate } from '@/lib/i18n';
import { useCameraStore } from '../camera-store';
import { AspectRatioButton, ToolCard, useAspectRatioAnimation } from '../components';
import { CameraBottomBar } from '../components/camera-bottom-bar';
import { CameraTopBar } from '../components/camera-top-bar';
import { PreviewSurface, useLandscapeCameraPreview } from '../components/native-camera-preview';
import { getCameraBaseUrl } from '../config';
import {
  CloseIcon,
  CountdownIcon,
  ResetIcon,
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
const EV_VALUES = [-3, -2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3];
const WB_VALUES = [0, 2800, 3200, 3800, 4500, 5200, 5800, 6500, 7200, 8000];
const COUNT_VALUES = Array.from({ length: 50 }, (_, index) => index + 1);
const INTERVAL_VALUES = Array.from({ length: 61 }, (_, index) => index);
const COUNTDOWN_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 30];

function formatShutter(value: number) {
  return value >= 1 ? `${value}` : `1/${Math.round(1 / value)}`;
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
      <Text className={`text-[12px] ${active ? 'text-black dark:text-black' : 'text-white dark:text-white'}`}>{title}</Text>
      <Text className={`text-[17px] ${active ? 'font-medium text-black dark:text-black' : 'text-white dark:text-white'}`}>{value}</Text>
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
  const { width } = useWindowDimensions();
  const connectionStatus = useCameraStore.use.connectionStatus();
  const lastCommandError = useCameraStore.use.lastCommandError();
  const newestCameraJpgUrl = useCameraStore.use.newestCameraJpgUrl();
  const recordingState = useCameraStore.use.landscapeRecordingState();
  const startRecording = useCameraStore.use.startLandscapeRecording();
  const stopRecording = useCameraStore.use.stopLandscapeRecording();
  const landscapeRatio = useCameraStore.use.landscapeRatio();
  const setLandscapeSensorRatio = useCameraStore.use.setLandscapeSensorRatio();
  const changeStreamingSetting = useCameraStore.use.changeStreamingSetting();
  const changeWhiteBalance = useCameraStore.use.changeWhiteBalance();
  const changeEv = useCameraStore.use.changeEv();
  const sendCommand = useCameraStore.use.sendCommand();

  const [sheetTarget, setSheetTarget] = useState<'manual' | 'tools'>('manual');
  const [sheetOpen, setSheetOpen] = useState(true);
  const [burstOpen, setBurstOpen] = useState(false);
  const [activeParam, setActiveParam] = useState<'wb' | 'shutter' | 'gain' | 'ev'>('shutter');
  const [exposure, setExposure] = useState(0.008);
  const [gain, setGain] = useState(6);
  const [whiteBalance, setWhiteBalance] = useState(0);
  const [ev, setEv] = useState(0);
  const [autoStretch, setAutoStretch] = useState(true);
  const [watermark, setWatermark] = useState(false);
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [countdownEnabled, setCountdownEnabled] = useState(false);
  const [timerPlan, setTimerPlan] = useState({ count: 3, interval: 3 });
  const [countdown, setCountdown] = useState(3);
  const [captureMode, setCaptureMode] = useState<'photo' | 'video'>('photo');
  const [focusAssist, setFocusAssist] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const paramValues = useMemo(() => ({
    wb: whiteBalance === 0 ? 'AUTO' : `${whiteBalance}K`,
    shutter: formatShutter(exposure),
    gain: `${gain}dB`,
    ev: `${ev}`,
  }), [whiteBalance, exposure, gain, ev]);

  const { previewState, stream } = useLandscapeCameraPreview();
  const { captureState, countdownRemaining, repeatTotal, capture, startCountdown, cancel } = useNebulaCapture({ exposure, gain });
  const { solveState, result: solveResult, solve, dismissResult } = usePlateSolve();

  // Nebula always works with a 4:3 or 16:9 framing, never the full-frame
  // default used by other landscape flows.
  const nebulaRatio: LandscapeRatio = landscapeRatio === '16:9' ? '16:9' : '4:3';
  useEffect(() => {
    if (landscapeRatio === 'full')
      setLandscapeSensorRatio('4:3');
  }, [landscapeRatio, setLandscapeSensorRatio]);

  // Use the shared aspect ratio animation hook
  const { previewStyle, surfaceHeight, previewTop } = useAspectRatioAnimation(nebulaRatio, 220, 12);

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
            : isCountdown
              ? `${countdownRemaining}s`
              : isCapturing ? (repeatTotal > 1 ? `定时拍摄 ${repeatTotal} 张` : '拍摄中') : null;

  return (
    <View className="flex-1 bg-black">
      <Animated.View
        className="absolute right-0 left-0 overflow-hidden bg-black"
        style={[previewStyle as any, { width }]}
      >
        <PreviewSurface
          stream={stream}
          previewState={previewState}
          width={width}
          height={surfaceHeight}
        />

        <CameraTopBar
          title={translate('nebula.mode_title')}
          onBack={onBack}
          onTitlePress={() => setSheetTarget(value => value === 'manual' ? 'tools' : 'manual')}
          expanded={sheetTarget !== 'manual'}
          style={{ top: insets.top + 10 }}
          rightContent={(
            <Pressable
              disabled={isSolving}
              onPress={() => solve()}
              style={{ backgroundColor: isSolving ? BRAND : PILL_BG }}
              className="h-7 min-w-[52px] items-center justify-center rounded-full px-3 active:opacity-80"
            >
              <Text className={`text-[11px] ${isSolving ? 'text-black dark:text-black' : 'text-white dark:text-white'}`}>
                {isSolving ? translate('nebula.resolve_in_progress') : translate('nebula.resolve')}
              </Text>
            </Pressable>
          )}
        />

        <Pressable
          onPress={() => setFocusAssist(value => !value)}
          className="absolute left-4 h-8 flex-row items-center gap-1 rounded-full px-2.5 active:opacity-80"
          style={{
            top: insets.top + 56,
            backgroundColor: focusAssist ? BRAND : PILL_BG,
          }}
          accessibilityRole="button"
        >
          <Text className={`text-[11px] ${focusAssist ? 'text-black dark:text-black' : 'text-white dark:text-white'}`}>
            {translate('nebula.focus_assist')}
          </Text>
        </Pressable>

        {watermark && <View className="absolute top-24 left-5"><Text className="text-base font-semibold text-white/85">SVBONY</Text></View>}
      </Animated.View>

      {(status || notice) && <View className="absolute inset-x-0 items-center" style={{ top: insets.top + 108 }}><View className="rounded-full bg-black/55 px-4 py-1.5"><Text className="text-xs text-white">{notice ?? status}</Text></View></View>}

      {/* Full-screen countdown overlay, same interaction as landscape mode. */}
      {isCountdown && (
        <View className="absolute inset-0 items-center justify-center">
          <Text className="text-[88px] font-light text-white">{countdownRemaining}</Text>
        </View>
      )}

      {solveResult && (
        <View className="absolute inset-x-4 rounded-2xl p-4" style={{ top: previewTop + 144, backgroundColor: SHEET_BG }}>
          <View className="mb-3 flex-row items-center justify-between">
            <Text className={`text-sm font-semibold ${solveResult.success ? 'text-[#CBFF3C]' : 'text-red-300'}`}>
              {solveResult.success ? translate('nebula.resolve_success') : translate('nebula.resolve_failed')}
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
            />
          </Pressable>
        </View>
      )}

      {sheetOpen && (
        <View className="absolute inset-x-0 rounded-t-[26px] p-4" style={{ bottom: insets.bottom + 96, backgroundColor: SHEET_BG }}>
          {sheetTarget === 'manual' && !burstOpen
            ? (
                <View className="gap-4">
                  <View className="flex-row gap-3">
                    <ParamCard
                      title={translate('nebula.white_balance')}
                      value={paramValues.wb}
                      active={activeParam === 'wb'}
                      onPress={() => setActiveParam('wb')}
                    />
                    <ParamCard
                      title={translate('nebula.shutter')}
                      value={paramValues.shutter}
                      active={activeParam === 'shutter'}
                      onPress={() => setActiveParam('shutter')}
                    />
                    <ParamCard
                      title={translate('nebula.gain')}
                      value={paramValues.gain}
                      active={activeParam === 'gain'}
                      onPress={() => setActiveParam('gain')}
                    />
                    <ParamCard
                      title={translate('nebula.ev')}
                      value={paramValues.ev}
                      active={activeParam === 'ev'}
                      onPress={() => setActiveParam('ev')}
                    />
                  </View>

                  <View className="mt-1">
                    {activeParam === 'shutter' && (
                      <LandscapeRuler
                        label=""
                        values={SHUTTER_VALUES}
                        value={exposure}
                        formatValue={value => `${formatShutter(value)} s`}
                        formatTick={(value, index) => (index % 5 === 0 ? formatShutter(value) : null)}
                        onChange={(value) => {
                          setExposure(value);
                          changeStreamingSetting(value, gain);
                        }}
                      />
                    )}
                    {activeParam === 'gain' && (
                      <LandscapeRuler
                        label=""
                        values={GAIN_VALUES}
                        value={gain}
                        formatValue={value => `${value} dB`}
                        formatTick={(value, index) => (index % 5 === 0 ? `${value}` : null)}
                        onChange={(value) => {
                          setGain(value);
                          changeStreamingSetting(exposure, value);
                        }}
                      />
                    )}
                    {activeParam === 'wb' && (
                      <LandscapeRuler
                        label=""
                        values={WB_VALUES}
                        value={whiteBalance}
                        formatValue={value => (value === 0 ? 'AUTO' : `${value}K`)}
                        formatTick={(value, index) => (index % 2 === 0 ? (value === 0 ? 'A' : `${value / 1000}K`) : null)}
                        onChange={(value) => {
                          setWhiteBalance(value);
                          changeWhiteBalance(value);
                        }}
                      />
                    )}
                    {activeParam === 'ev' && (
                      <LandscapeRuler
                        label=""
                        values={EV_VALUES}
                        value={ev}
                        formatValue={value => `${value}`}
                        formatTick={(value, index) => (index % 2 === 0 ? `${value}` : null)}
                        onChange={(value) => {
                          setEv(value);
                          changeEv(value);
                        }}
                      />
                    )}
                  </View>
                </View>
              )
            : !burstOpen
                ? (
                    <View className="gap-4">
                      <View className="flex-row gap-3">
                        <ToolCard
                          icon={<StopwatchIcon color={timerEnabled ? '#111' : '#FFF'} />}
                          label="定时拍摄"
                          active={timerEnabled}
                          onPress={() => {
                            setTimerEnabled(value => !value);
                            setBurstOpen(true);
                          }}
                        />
                        <ToolCard
                          icon={<CountdownIcon color={countdownEnabled ? '#111' : '#FFF'} />}
                          label="倒计时"
                          active={countdownEnabled}
                          onPress={() => {
                            setCountdownEnabled(value => !value);
                            setBurstOpen(true);
                          }}
                        />
                        <AspectRatioButton ratio={nebulaRatio} onPress={() => setLandscapeSensorRatio(nebulaRatio === '4:3' ? '16:9' : '4:3')} cardBg={CARD_BG} />
                        <ToolCard icon={<WatermarkFlaskIcon color={watermark ? '#111' : '#FFF'} />} label={translate('nebula.watermark')} active={watermark} onPress={() => setWatermark(value => !value)} />
                      </View>
                      <Pressable onPress={() => setAutoStretch(value => !value)} style={{ backgroundColor: autoStretch ? BRAND : CARD_BG }} className="h-[70px] items-center justify-center rounded-2xl">
                        <Text className={autoStretch ? 'text-black dark:text-black' : 'text-white dark:text-white'}>
                          {translate('nebula.auto_stretch')}
                          {autoStretch ? translate('nebula.auto_stretch_on') : translate('nebula.auto_stretch_off')}
                        </Text>
                      </Pressable>
                    </View>
                  )
                : null}
          {burstOpen && (
            <View className="gap-4">
              <View className="flex-row items-center justify-between">
                <Pressable
                  onPress={() => setBurstOpen(false)}
                  style={{ backgroundColor: PILL_BG }}
                  className="size-11 items-center justify-center rounded-full active:opacity-70"
                >
                  <CloseIcon />
                </Pressable>
                <Text className="text-[16px] text-white">定时拍摄</Text>
                <Pressable
                  onPress={() => {
                    setTimerPlan({ count: 3, interval: 3 });
                    setCountdown(3);
                  }}
                  className="size-11 items-center justify-center rounded-full active:opacity-70"
                >
                  <ResetIcon />
                </Pressable>
              </View>
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

      <CameraBottomBar
        captureMode={captureMode}
        onCaptureModeChange={mode => setCaptureMode(mode)}
        thumbnailUri={imageUrl}
        isCapturing={isCapturing}
        isRecording={isRecording}
        rightButton={<SheetMenuIcon color={sheetOpen ? BRAND : '#FFFFFF'} />}
        rightButtonActive={sheetOpen}
        onRightButtonPress={() => setSheetOpen((open) => {
          if (open)
            return false;
          setBurstOpen(false);
          return true;
        })}
      />
      {lastCommandError && lastCommandError !== 'see data' && <View className="absolute inset-x-0 items-center" style={{ bottom: insets.bottom + 220 }}><View className="rounded-full bg-black/70 px-4 py-1.5"><Text className="text-xs text-red-300">{lastCommandError}</Text></View></View>}
    </View>
  );
}
