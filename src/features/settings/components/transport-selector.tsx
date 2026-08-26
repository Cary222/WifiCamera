import type { CameraTransportPreference } from '@/features/home/camera/transport';

import { Pressable, StyleSheet, useColorScheme } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Text, View } from '@/components/ui';
import { useCameraStore } from '@/features/home/camera/camera-store';
import { translate } from '@/lib/i18n';

const OPTIONS: { value: CameraTransportPreference; label: string }[] = [
  { value: 'auto', label: 'settings.transport_auto' },
  { value: 'usb', label: 'settings.transport_usb' },
  { value: 'wifi', label: 'settings.transport_wifi' },
];

const SEGMENT_WIDTH = 62;

/**
 * Picks the link used to reach the board: auto-probe, or pin USB / WiFi.
 *
 * Pinning matters during debugging — auto mode can legitimately land on either
 * link, which makes it ambiguous which path a failure came from.
 */
export function TransportSelector({ standalone = false }: { standalone?: boolean } = {}) {
  const preference = useCameraStore.use.transportPreference();
  const transport = useCameraStore.use.transport();
  const probing = useCameraStore.use.transportProbing();
  const switchTransport = useCameraStore.use.switchTransport();
  const colorScheme = useColorScheme();

  const selectedIndex = OPTIONS.findIndex(option => option.value === preference);
  const indicatorPosition = useSharedValue(Math.max(0, selectedIndex));

  const handleSelect = (value: CameraTransportPreference) => {
    if (value === preference)
      return;
    const index = OPTIONS.findIndex(option => option.value === value);
    indicatorPosition.value = withTiming(index, {
      duration: 200,
      easing: Easing.inOut(Easing.quad),
    });
    switchTransport(value);
  };

  const indicatorStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      transform: [{ translateX: indicatorPosition.value * SEGMENT_WIDTH }],
    };
  });

  const borderColor = colorScheme === 'dark' ? '#48484880' : '#E5E7EB';
  const activeLabel = probing
    ? translate('settings.transport_probing')
    : transport === 'wifi'
      ? translate('settings.transport_wifi')
      : translate('settings.transport_usb');

  const segments = (
    <View style={[styles.container, { borderColor }]}>
      <Animated.View style={[styles.indicator, indicatorStyle]} />
      {OPTIONS.map(option => (
        <Pressable
          key={option.value}
          style={styles.button}
          onPress={() => handleSelect(option.value)}
        >
          <Text style={styles.text} tx={option.label as Parameters<typeof translate>[0]} />
        </Pressable>
      ))}
    </View>
  );

  // Inside the connection modal the label sits above the control, and each
  // link's reachability is shown so a failure points at the right cable.
  if (standalone) {
    return (
      <View>
        <View className="flex-row items-center justify-between">
          {segments}
          <TransportReachability />
        </View>
        <Text className="mt-2 text-[12px] text-white/50">
          {`${translate('settings.transport_hint')} · ${activeLabel}`}
        </Text>
      </View>
    );
  }

  return (
    <View className="mx-4 mb-5 flex-row items-center justify-between rounded-[15px] border border-neutral-200 bg-white px-5 py-4 dark:border-[#48484880] dark:bg-[#111113]">
      <View>
        <Text tx="settings.transport" className="text-[18px] text-black dark:text-white" />
        <Text className="mt-2 text-[12px] text-neutral-500 dark:text-charcoal-400">
          {`${translate('settings.transport_hint')} · ${activeLabel}`}
        </Text>
      </View>
      {segments}
    </View>
  );
}

/**
 * Live per-link reachability dots.
 *
 * Renders nothing until the first probe finishes: an unprobed link must not
 * be shown as unreachable, or the UI would blame a cable that is actually fine.
 */
function TransportReachability() {
  const reachability = useCameraStore.use.transportReachability();
  const probing = useCameraStore.use.transportProbing();

  if (probing) {
    return (
      <Text className="text-[12px] text-white/50">
        {translate('settings.transport_probing')}
      </Text>
    );
  }

  if (!reachability)
    return null;

  return (
    <View className="flex-row items-center gap-3">
      {(['usb', 'wifi'] as const).map(link => (
        <View key={link} className="flex-row items-center gap-1.5">
          <View
            style={[
              styles.dot,
              { backgroundColor: reachability[link] ? '#C8E733' : '#6B7280' },
            ]}
          />
          <Text className="text-[12px] text-white/60">
            {translate(link === 'usb' ? 'settings.transport_usb' : 'settings.transport_wifi')}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    height: 35,
    width: SEGMENT_WIDTH * 3,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: 'transparent',
    position: 'relative',
  },
  indicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SEGMENT_WIDTH,
    height: 33,
    backgroundColor: '#C8E733',
    borderRadius: 6,
  },
  button: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
