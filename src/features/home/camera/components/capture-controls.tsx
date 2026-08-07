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

export function CaptureControls({ cameraStatus, connected, onCapture, onRepeat, onStop }: Props) {
  const active = cameraStatus !== 'idle';
  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <Text tx="camera.status_label" className="text-sm text-neutral-500 dark:text-neutral-400" />
        <Text className="font-semibold text-black dark:text-white">{cameraStatus}</Text>
      </View>
      {active
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
                disabled={!connected}
                onPress={onCapture}
                testID="camera-capture"
              />
              <Button
                label={translate('camera.repeat')}
                variant="outline"
                disabled={!connected}
                onPress={onRepeat}
                testID="camera-repeat"
              />
            </View>
          )}
    </View>
  );
}
