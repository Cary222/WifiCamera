import type { LongExposureConfig } from '../camera-store';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { Text } from '@/components/ui';

type Props = {
  configs: LongExposureConfig[];
  selectedId: number;
  onSelect: (config: LongExposureConfig) => void;
};

export function ExposurePresets({ configs, selectedId, onSelect }: Props) {
  const { width } = useWindowDimensions();
  // Calculate card width: (screen width - horizontal padding - gap) / 2
  // px-5 = 20px each side = 40px total, gap-3 = 12px
  const cardWidth = (width - 40 - 12) / 2;

  return (
    <View className="gap-3">
      <Text tx="camera.presets" className="text-sm font-semibold text-neutral-700 dark:text-neutral-200" />
      <View className="flex-row flex-wrap justify-between gap-3">
        {configs.map((config) => {
          const selected = config.id === selectedId;
          const selectedStyle = 'border-primary-500 bg-primary-50 dark:bg-primary-900/30';
          const unselectedStyle = 'border-neutral-200 bg-white dark:border-[#2C2C2C] dark:bg-[#1A1A1A]';
          return (
            <Pressable
              key={config.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={{ width: cardWidth }}
              className={`rounded-xl border px-4 py-3 ${selected ? selectedStyle : unselectedStyle}`}
              onPress={() => onSelect(config)}
            >
              <Text className={selected ? 'font-semibold text-primary-600' : 'font-semibold text-black dark:text-white'}>
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
