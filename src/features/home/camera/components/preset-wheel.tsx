import type { LongExposureConfig } from '../camera-store';

import { Pressable, ScrollView, View } from 'react-native';
import { Text } from '@/components/ui';

type PresetWheelProps = {
  configs: LongExposureConfig[];
  selectedId: number;
  onSelect: (config: LongExposureConfig) => void;
};

/** Horizontal scrollable preset wheel — migrated from old app's WheelSelectorHorizon. */
export function PresetWheel({ configs, selectedId, onSelect }: PresetWheelProps) {
  if (!configs.length)
    return null;

  return (
    <View>
      <Text tx="camera.presets" className="mb-3 text-sm text-neutral-500 dark:text-neutral-400" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10 }}
      >
        {configs.map((config) => {
          const isSelected = config.id === selectedId;
          return (
            <Pressable
              key={config.id}
              onPress={() => onSelect(config)}
              className={`rounded-2xl px-4 py-3 ${
                isSelected
                  ? 'bg-orange-500'
                  : 'bg-neutral-100 dark:bg-[#1A1A1A]'
              }`}
            >
              <Text
                className={`text-sm font-medium ${
                  isSelected ? 'text-white dark:text-white' : 'text-black dark:text-black'
                }`}
              >
                {config.name}
              </Text>
              <Text
                className={`mt-0.5 text-xs ${
                  isSelected ? 'text-orange-100' : 'text-neutral-400'
                }`}
              >
                {config.exposure_time}
                s ·
                {config.gain}
                dB
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
