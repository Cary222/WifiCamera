import type { LongExposureConfig } from '../camera-store';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui';

type Props = {
  configs: LongExposureConfig[];
  selectedId: number;
  onSelect: (config: LongExposureConfig) => void;
};

export function ExposurePresets({ configs, selectedId, onSelect }: Props) {
  return (
    <View className="gap-3">
      <Text tx="camera.presets" className="text-sm font-semibold text-neutral-700 dark:text-neutral-200" />
      <View className="flex-row flex-wrap gap-2">
        {configs.map((config) => {
          const selected = config.id === selectedId;
          return (
            <Pressable
              key={config.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className={`rounded-xl border px-4 py-3 ${selected
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30'
                : 'border-neutral-200 bg-white dark:border-[#2C2C2C] dark:bg-[#1A1A1A]'}`}
              onPress={() => onSelect(config)}
            >
              <Text className={`font-semibold ${selected ? 'text-primary-600' : 'text-black dark:text-white'}`}>
                {config.name}
              </Text>
              <Text className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                {config.exposure_time}
                s · Gain
                {config.gain}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
