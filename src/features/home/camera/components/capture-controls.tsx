import type { CameraStatus } from '../camera-store';
import { View } from 'react-native';
import { Button, Text } from '@/components/ui';
import { translate } from '@/lib/i18n';

type Props = {
  cameraStatus: CameraStatus;
  connected: boolean;
  onCapture: () => void;
  onRepeat: () => void;
  onStop: () => void;
};

export function CaptureControls({
  cameraStatus,
  connected,
  onCapture,
  onRepeat,
  onStop,
}: Props) {
  const isBusy
    = cameraStatus === 'in_repeat'
      || cameraStatus === 'in_exposure'
      || cameraStatus === 'recording'
      || cameraStatus === 'stopping';
  const canCapture
    = connected && (cameraStatus === 'idle' || cameraStatus === 'in_streaming');
  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <Text
          tx="camera.status_label"
          className="text-sm text-neutral-500 dark:text-neutral-400"
        />
        <Text className="font-semibold text-black dark:text-white">
          {cameraStatus}
        </Text>
      </View>
      {isBusy
        ? (
            <Button
              label={translate('camera.stop')}
              variant="destructive"
              disabled={!connected}
              onPress={onStop}
              testID="camera-stop"
            />
          )
        : (
            <View className="gap-2">
              <Button
                label={translate('camera.capture')}
                size="lg"
                disabled={!canCapture}
                onPress={onCapture}
                testID="camera-capture"
              />
              <Button
                label={translate('camera.repeat')}
                variant="outline"
                disabled={!canCapture}
                onPress={onRepeat}
                testID="camera-repeat"
              />
            </View>
          )}
    </View>
  );
}
