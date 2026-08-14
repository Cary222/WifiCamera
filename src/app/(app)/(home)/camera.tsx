import { useNavigation } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useLayoutEffect } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from '@/components/ui/icons';
import { CameraScreen } from '@/features/home/camera/camera-screen';
import { LandscapeCameraScreen } from '@/features/home/camera/landscape/landscape-camera-screen';
import { NebulaCameraScreen } from '@/features/home/camera/nebula/nebula-camera-screen';

export default function CameraPage() {
  const navigation = useNavigation();
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const insets = useSafeAreaInsets();
  const isLandscape = mode === 'landscape';
  const isNebula = mode === 'nebula';

  // Hide tab bar for full-screen camera experience
  useLayoutEffect(() => {
    const parent = navigation.getParent();
    if (parent) {
      parent.setOptions({ tabBarStyle: { display: 'none' } });
    }
    return () => {
      if (parent) {
        parent.setOptions({ tabBarStyle: { display: 'flex' } });
      }
    };
  }, [navigation]);

  if (isLandscape) {
    return (
      <View className="flex-1">
        <LandscapeCameraScreen onBack={() => router.back()} />
      </View>
    );
  }

  if (isNebula) {
    return (
      <View className="flex-1">
        <NebulaCameraScreen onBack={() => router.back()} />
      </View>
    );
  }

  return (
    <View className="flex-1">
      <CameraScreen />

      {/* Floating back button for the legacy camera page. */}
      <Pressable
        onPress={() => navigation.goBack()}
        className="absolute left-4 active:opacity-70"
        style={{ top: insets.top + 8 }}
      >
        <View className="size-10 items-center justify-center rounded-full bg-black/50 dark:bg-white/20">
          <ArrowLeft size={20} color="#FFFFFF" />
        </View>
      </Pressable>
    </View>
  );
}
