import { useGlobalSearchParams, useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';
import { LandscapeCameraScreen } from '@/features/home/camera/landscape/landscape-camera-screen';
import { NebulaCameraScreen } from '@/features/home/camera/nebula/nebula-camera-screen';
import { PlanetCameraScreen } from '@/features/home/camera/planet/planet-camera-screen';

export default function CameraPage() {
  const router = useRouter();
  const localParams = useLocalSearchParams<{ mode?: string }>();
  const globalParams = useGlobalSearchParams<{ mode?: string }>();

  const rawMode = localParams.mode || globalParams.mode;
  const mode = typeof rawMode === 'string' ? rawMode.toLowerCase() : 'landscape';

  const isNebula = mode === 'nebula';
  const isPlanet = mode === 'planet';
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
