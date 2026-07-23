import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';

import { FocusAwareStatusBar, Text } from '@/components/ui';
import { useCameraStore } from './camera-store';
import { CaptureControls } from './components/capture-controls';
import { ConnectionStatus } from './components/connection-status';
import { ExposurePresets } from './components/exposure-presets';

export function CameraScreen() {
  const router = useRouter();
  const cameraStatus = useCameraStore.use.cameraStatus();
  const connectionStatus = useCameraStore.use.connectionStatus();
  const exposureConfigs = useCameraStore.use.exposureConfigs();
  const currentExposureConfig = useCameraStore.use.currentExposureConfig();
  const requestCameraStatus = useCameraStore.use.requestCameraStatus();
  const setCurrentExposureConfig = useCameraStore.use.setCurrentExposureConfig();
  const setGain = useCameraStore.use.setGain();
  const startExposure = useCameraStore.use.startExposure();
  const startRepeatExposure = useCameraStore.use.startRepeatExposure();
  const abortExposure = useCameraStore.use.abortExposure();
  const stopRepeatExposure = useCameraStore.use.stopRepeatExposure();
  const connected = connectionStatus === 'open';

  useEffect(() => {
    if (connected) {
      requestCameraStatus();
    }
  }, [connected, requestCameraStatus]);

  const handleSelectPreset = (config: typeof currentExposureConfig) => {
    if (!connected) return;
    setCurrentExposureConfig(config);
    setGain(config.gain);
  };

  const handleStop = () => {
    if (cameraStatus === 'in_repeat') {
      stopRepeatExposure();
    }
    else {
      abortExposure();
    }
  };

  return (
    <>
      <FocusAwareStatusBar />
      <View className="flex-1 bg-white dark:bg-black">
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-6 px-5 pt-5 pb-8">
            <View className="flex-row items-center justify-between">
              <View>
                <Text tx="camera.title" className="text-2xl font-bold text-black dark:text-white" />
                <Text tx="camera.subtitle" className="mt-1 text-sm text-neutral-500 dark:text-neutral-400" />
              </View>
              <ConnectionStatus status={connectionStatus} />
            </View>

            <View className="rounded-2xl bg-neutral-100 p-5 dark:bg-[#1A1A1A]">
              <Text tx="camera.current_preset" className="text-sm text-neutral-500 dark:text-neutral-400" />
              <Text className="mt-2 text-3xl font-bold text-black dark:text-white">
                {currentExposureConfig.name}
              </Text>
              <View className="mt-4 flex-row gap-8">
                <View>
                  <Text tx="camera.exposure_time" className="text-xs text-neutral-500 dark:text-neutral-400" />
                  <Text className="mt-1 text-lg font-semibold text-black dark:text-white">
                    {currentExposureConfig.exposure_time}
                    s
                  </Text>
                </View>
                <View>
                  <Text tx="camera.gain" className="text-xs text-neutral-500 dark:text-neutral-400" />
                  <Text className="mt-1 text-lg font-semibold text-black dark:text-white">
                    {currentExposureConfig.gain}
                  </Text>
                </View>
              </View>
            </View>

            <ExposurePresets
              configs={exposureConfigs}
              selectedId={currentExposureConfig.id}
              onSelect={handleSelectPreset}
            />

            <CaptureControls
              cameraStatus={cameraStatus}
              connected={connected}
              onCapture={startExposure}
              onRepeat={() => startRepeatExposure(3)}
              onStop={handleStop}
            />

            {!connected && (
              <Pressable
                onPress={() => router.push('/device-setup')}
                className="gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 active:opacity-80"
              >
                <Text tx="camera.not_connected" className="font-semibold text-amber-800" />
                <Text tx="camera.not_connected_hint" className="text-sm text-amber-700" />
              </Pressable>
            )}
          </View>
        </ScrollView>
      </View>
    </>
  );
}
