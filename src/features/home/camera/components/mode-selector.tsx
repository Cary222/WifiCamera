/**
 * Camera mode switcher — RAW / STREAM / DEEP.
 *
 * Three tabs mapped to the camera operating modes:
 *   raw    — FITS long-exposure capture
 *   stream — live daylight preview / recording
 *   deep   — deep-sky stacking workflow
 */
import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui';

export type CameraMode = 'raw' | 'stream' | 'deep';

type Props = {
  mode: CameraMode;
  onModeChange: (mode: CameraMode) => void;
};

const TABS: { key: CameraMode; labelTx: 'camera.mode_raw' | 'camera.mode_stream' | 'camera.mode_deep' }[] = [
  { key: 'raw', labelTx: 'camera.mode_raw' },
  { key: 'stream', labelTx: 'camera.mode_stream' },
  { key: 'deep', labelTx: 'camera.mode_deep' },
];

const INDICATOR_POSITIONS: Record<CameraMode, number> = {
  raw: 0,
  stream: 33,
  deep: 66,
};

export function ModeSelector({ mode, onModeChange }: Props) {
  const handlePress = useCallback(
    (key: CameraMode) => {
      if (key !== mode) {
        onModeChange(key);
      }
    },
    [mode, onModeChange],
  );

  return (
    <View className="overflow-hidden rounded-2xl bg-neutral-100 dark:bg-[#1A1A1A]">
      <View className="relative h-12 p-1.5">
        <View
          className="absolute top-1.5 w-[33%] rounded-xl bg-primary-500"
          style={[StyleSheet.absoluteFillObject, { top: 6, bottom: 6, left: `${INDICATOR_POSITIONS[mode]}%` }]}
        />

        <View className="relative flex h-full flex-row">
          {TABS.map((tab) => {
            const active = tab.key === mode;
            return (
              <Pressable
                key={tab.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                className="flex-1 items-center justify-center"
                onPress={() => handlePress(tab.key)}
              >
                <Text
                  className={`text-sm font-semibold ${
                    active ? 'text-white' : 'text-neutral-500 dark:text-neutral-400'
                  }`}
                  tx={tab.labelTx}
                />
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}
