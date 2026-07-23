/**
 * Countdown overlay displayed during timed exposures.
 *
 * Shows the remaining seconds with a circular progress ring.
 * Only renders when `isActive` is true and `seconds > 0`.
 */
import { View } from 'react-native';
import { Text } from '@/components/ui';

type Props = {
  seconds: number;
  isActive: boolean;
};

const RING_SIZE = 120;

export function CountdownDisplay({ seconds, isActive }: Props) {
  if (!isActive || seconds <= 0) {
    return null;
  }

  return (
    <View className="absolute inset-0 items-center justify-center bg-black/40">
      <View className="items-center gap-4">
        <View
          className="items-center justify-center rounded-full border-8 border-orange-500/30"
          style={{ width: RING_SIZE, height: RING_SIZE }}
        >
          <Text className="text-4xl font-bold text-orange-400">{seconds}</Text>
          <Text className="text-sm text-orange-300">s</Text>
        </View>
      </View>
    </View>
  );
}
