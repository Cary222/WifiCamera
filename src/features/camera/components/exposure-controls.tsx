/**
 * Manual exposure time and gain slider controls.
 *
 * Provides two rows of preset step buttons for fine-grained control:
 * - Exposure time: 1, 5, 10, 30, 60, 120 s
 * - Gain: 0, 10, 20, 30, 40, 50 dB
 */
import type { ViewProps } from 'react-native';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui';

// ---------------------------------------------------------------------------
// Step button grid
// ---------------------------------------------------------------------------

const EXPOSURE_STEPS = [1, 5, 10, 30, 60, 120] as const;
const GAIN_STEPS = [0, 10, 20, 30, 40, 50] as const;

type StepButtonProps = {
  value: number;
  unit: string;
  active: boolean;
  disabled: boolean;
  onPress: () => void;
};

function StepButton({ value, unit, active, disabled, onPress }: StepButtonProps) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      className={`rounded-lg px-3 py-1.5 ${
        active ? 'bg-primary-500' : 'bg-neutral-200 dark:bg-[#2C2C2C]'
      } ${disabled ? 'opacity-40' : ''}`}
    >
      <Text
        className={`text-sm font-medium ${
          active ? 'text-white' : 'text-neutral-600 dark:text-neutral-300'
        }`}
      >
        {value}
        {unit}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Progress track
// ---------------------------------------------------------------------------

type ProgressTrackProps = {
  progress: number; // 0..1
  disabled: boolean;
};

function ProgressTrack({ progress, disabled: _disabled }: ProgressTrackProps) {
  return (
    <View className="relative h-8 w-full items-center justify-center">
      <View className="absolute h-1.5 w-full rounded-full bg-neutral-200 dark:bg-[#2C2C2C]" />
      <View
        className="absolute h-1.5 rounded-full bg-primary-500"
        style={{ width: `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%` }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export type ExposureControlsProps = ViewProps & {
  exposureTime: number;
  gain: number;
  onExposureChange: (value: number) => void;
  onGainChange: (value: number) => void;
  disabled?: boolean;
};

export function ExposureControls({
  exposureTime,
  gain,
  onExposureChange,
  onGainChange,
  disabled = false,
  ...rest
}: ExposureControlsProps) {
  const exposureProgress = (exposureTime - 1) / (120 - 1);
  const gainProgress = gain / 50;

  return (
    <View className="rounded-2xl bg-neutral-50 p-5 dark:bg-[#1A1A1A]" {...rest}>
      {/* Exposure Time */}
      <View className="mb-6">
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-sm text-neutral-600 dark:text-neutral-300">
            Exposure Time
          </Text>
          <Text className="font-semibold text-black dark:text-white">
            {exposureTime}
            s
          </Text>
        </View>
        <View className="flex-row flex-wrap gap-2">
          {EXPOSURE_STEPS.map(step => (
            <StepButton
              key={step}
              value={step}
              unit="s"
              active={exposureTime === step}
              disabled={disabled}
              onPress={() => onExposureChange(step)}
            />
          ))}
        </View>
        <View className="mt-3">
          <ProgressTrack progress={exposureProgress} disabled={disabled} />
        </View>
      </View>

      {/* Gain */}
      <View>
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-sm text-neutral-600 dark:text-neutral-300">Gain</Text>
          <Text className="font-semibold text-black dark:text-white">
            {gain}
            dB
          </Text>
        </View>
        <View className="flex-row flex-wrap gap-2">
          {GAIN_STEPS.map(step => (
            <StepButton
              key={step}
              value={step}
              unit="dB"
              active={gain === step}
              disabled={disabled}
              onPress={() => onGainChange(step)}
            />
          ))}
        </View>
        <View className="mt-3">
          <ProgressTrack progress={gainProgress} disabled={disabled} />
        </View>
      </View>
    </View>
  );
}
