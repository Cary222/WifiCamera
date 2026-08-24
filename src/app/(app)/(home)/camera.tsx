import { useNavigation } from '@react-navigation/native';
import { useGlobalSearchParams, useLocalSearchParams, useRouter } from 'expo-router';
import { useLayoutEffect, useMemo } from 'react';
import { View } from 'react-native';
import { useUniwind } from 'uniwind';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LandscapeCameraScreen } from '@/features/home/camera/landscape/landscape-camera-screen';
import { NebulaCameraScreen } from '@/features/home/camera/nebula/nebula-camera-screen';
import { PlanetCameraScreen } from '@/features/home/camera/planet/planet-camera-screen';

export default function CameraPage() {
  const navigation = useNavigation();
  const router = useRouter();
  const localParams = useLocalSearchParams<{ mode?: string }>();
  const globalParams = useGlobalSearchParams<{ mode?: string }>();
  const { theme } = useUniwind();
  const isDark = theme === 'dark';
  const insets = useSafeAreaInsets();

  const rawMode = localParams.mode || globalParams.mode;
  const mode = typeof rawMode === 'string' ? rawMode.toLowerCase() : 'landscape';

  const isNebula = mode === 'nebula';
  const isPlanet = mode === 'planet';

  const defaultTabBarStyle = useMemo(() => ({
    backgroundColor: isDark ? '#0A0B0D' : '#FFFFFF',
    borderTopWidth: 0.5,
    borderTopColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(10, 11, 13, 0.08)',
    paddingBottom: Math.max(insets.bottom, 8),
    paddingTop: 8,
    height: 64 + Math.max(insets.bottom, 8),
    display: 'flex' as const,
  }), [isDark, insets.bottom]);

  // Hide tab bar for full-screen camera experience
  useLayoutEffect(() => {
    const parent = navigation.getParent();
    if (parent) {
      parent.setOptions({ tabBarStyle: { display: 'none' } });
    }
    return () => {
      if (parent) {
        parent.setOptions({ tabBarStyle: defaultTabBarStyle });
      }
    };
  }, [navigation, defaultTabBarStyle]);

  if (isNebula) {
    return (
      <View className="flex-1">
        <NebulaCameraScreen onBack={() => router.back()} />
      </View>
    );
  }

  if (isPlanet) {
    return (
      <View className="flex-1">
        <PlanetCameraScreen onBack={() => router.back()} />
      </View>
    );
  }

  return (
    <View className="flex-1">
      <LandscapeCameraScreen onBack={() => router.back()} />
    </View>
  );
}
