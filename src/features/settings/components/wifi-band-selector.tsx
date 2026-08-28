import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, useColorScheme } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Text, View } from '@/components/ui';
import { useCameraStore } from '@/features/home/camera/camera-store';

type Props = {
  /** Standalone mode: show only the switcher without wrapper card */
  standalone?: boolean;
  /** Callback when band is switched */
  onSwitch?: (is5G: boolean) => void;
  /** Disable connection requirement (for modal usage) */
  allowDisconnected?: boolean;
};

/**
 * Reusable WiFi band selector (2.4GHz / 5GHz) with animated indicator.
 *
 * @example
 * // Settings screen (full card with labels)
 * <WifiBandSelector />
 *
 * @example
 * // Modal (standalone switcher only)
 * <WifiBandSelector standalone allowDisconnected onSwitch={() => startScan()} />
 */
export function WifiBandSelector({ standalone = false, onSwitch, allowDisconnected = false }: Props) {
  const wifiBand = useCameraStore.use.wifiBand();
  const setWifiBand = useCameraStore.use.setWifiBand();
  const connectionStatus = useCameraStore.use.connectionStatus();
  const sendInstruction = useCameraStore.use.sendInstruction();
  const setShowConnectionModal = useCameraStore.use.setShowConnectionModal();
  const [switching, setSwitching] = useState(false);
  const colorScheme = useColorScheme();

  const isConnected = connectionStatus === 'open';
  const is5G = wifiBand === true;
  const isDisabled = (!allowDisconnected && !isConnected) || switching;
  const isDark = colorScheme === 'dark';

  const indicatorPosition = useSharedValue(is5G ? 1 : 0);

  // Sync indicator position when wifiBand changes externally (including null)
  useEffect(() => {
    const targetValue = is5G ? 1 : 0;
    indicatorPosition.value = withTiming(targetValue, {
      duration: 200,
      easing: Easing.inOut(Easing.quad),
    });
  }, [is5G]);

  // Cleanup switching state after timeout
  useEffect(() => {
    if (!switching)
      return;

    const timer = setTimeout(() => {
      setSwitching(false);
    }, 8000);

    return () => clearTimeout(timer);
  }, [switching]);

  const handleSwitch = useCallback((to5G: boolean) => {
    if (isDisabled || is5G === to5G)
      return;

    setWifiBand(to5G);

    if (isConnected) {
      sendInstruction('switch_wifi_band', [to5G ? 1 : 0]);
      setShowConnectionModal(true);
      setSwitching(true);
    }

    onSwitch?.(to5G);
  }, [isDisabled, is5G, isConnected, onSwitch, sendInstruction, setShowConnectionModal, setWifiBand, indicatorPosition]);

  const indicatorStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      transform: [{ translateX: indicatorPosition.value * 66.5 }],
    };
  });

  const borderColor = isDark ? '#48484880' : '#E5E7EB';

  const switcherElement = (
    <View style={[styles.container, { borderColor, opacity: isDisabled ? 0.4 : 1 }]}>
      <Animated.View style={[styles.indicator, indicatorStyle]} />
      <Pressable
        style={styles.button}
        onPress={() => handleSwitch(false)}
        disabled={isDisabled}
      >
        <Text style={styles.text}>2.4GHz</Text>
      </Pressable>
      <Pressable
        style={styles.button}
        onPress={() => handleSwitch(true)}
        disabled={isDisabled}
      >
        <Text style={styles.text}>5GHz</Text>
      </Pressable>
    </View>
  );

  if (standalone) {
    return switcherElement;
  }

  return (
    <View className="mx-4 mb-5 flex-row items-center justify-between rounded-[15px] border border-neutral-200 bg-white px-5 py-4 dark:border-[#48484880] dark:bg-[#111113]">
      <View>
        <Text tx="settings.wifi_band" className="text-[18px] text-black dark:text-white" />
        <Text tx="settings.wifi_band_hint" className="mt-2 text-[12px] text-neutral-500 dark:text-charcoal-400" />
      </View>
      {switcherElement}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    height: 35,
    width: 136,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: 'transparent',
    position: 'relative',
  },
  indicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 68,
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
});
