import { useNavigation } from '@react-navigation/native';
import { useLayoutEffect, useMemo } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUniwind } from 'uniwind';
import { AlbumScreen } from '@/features/home/album/album-screen';

export default function AlbumPage() {
  const navigation = useNavigation();
  const { theme } = useUniwind();
  const isDark = theme === 'dark';
  const insets = useSafeAreaInsets();

  const defaultTabBarStyle = useMemo(() => ({
    backgroundColor: isDark ? '#0A0B0D' : '#FFFFFF',
    borderTopWidth: 0.5,
    borderTopColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(10, 11, 13, 0.08)',
    paddingBottom: Math.max(insets.bottom, 8),
    paddingTop: 8,
    height: 64 + Math.max(insets.bottom, 8),
    display: 'flex' as const,
  }), [isDark, insets.bottom]);

  // Hide tab bar for full-screen album experience
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

  return (
    <View className="flex-1">
      <AlbumScreen />
    </View>
  );
}
