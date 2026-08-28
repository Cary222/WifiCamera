import type { TxKeyPath } from '@/lib/i18n';
import { SegmentedControl } from '@/components/ui/segmented-control';

export type CameraMode = 'photo' | 'video';

export type CameraModeSwitcherProps = {
  mode: CameraMode;
  onChange: (mode: CameraMode) => void;
  isCapturing?: boolean;
  isRecording?: boolean;
  variant?: 'capsule-lg';
  segmentPixelWidth?: number;
  photoLabel?: string;
  photoLabelTx?: TxKeyPath;
  videoLabel?: string;
  videoLabelTx?: TxKeyPath;
  capturingLabelTx?: TxKeyPath;
  stopLabelTx?: TxKeyPath;
  disabled?: boolean;
  className?: string;
  testID?: string;
};

export function CameraModeSwitcher({
  mode,
  onChange,
  isCapturing = false,
  isRecording = false,
  variant = 'capsule-lg',
  segmentPixelWidth = 72,
  photoLabel,
  photoLabelTx = 'camera.photo',
  videoLabel,
  videoLabelTx = 'camera.video',
  capturingLabelTx = 'camera.capturing',
  stopLabelTx = 'camera.stop',
  disabled = false,
  className,
  testID,
}: CameraModeSwitcherProps) {
  return (
    <SegmentedControl<CameraMode>
      options={[
        {
          value: 'photo',
          label: photoLabel,
          labelTx: isCapturing ? capturingLabelTx : photoLabelTx,
          disabled,
        },
        {
          value: 'video',
          label: videoLabel,
          labelTx: isRecording ? stopLabelTx : videoLabelTx,
          disabled,
        },
      ]}
      value={mode}
      onChange={onChange}
      variant={variant}
      segmentPixelWidth={segmentPixelWidth}
      className={className}
      testID={testID}
    />
  );
}
