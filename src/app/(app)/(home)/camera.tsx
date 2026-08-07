import { useNavigation } from '@react-navigation/native';
import { useLayoutEffect } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from '@/components/ui/icons';
import { CameraScreen } from '@/features/home/camera/camera-screen';

export default function CameraPage() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

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

  return (
    <View className="flex-1">
      <CameraScreen />

      {/* Floating back button */}
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
