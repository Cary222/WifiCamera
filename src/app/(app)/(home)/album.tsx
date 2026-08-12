import { useNavigation } from '@react-navigation/native';
import { useLayoutEffect } from 'react';
import { View } from 'react-native';
import { AlbumScreen } from '@/features/home/album/album-screen';

export default function AlbumPage() {
  const navigation = useNavigation();

  // Hide tab bar for full-screen album experience
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
      <AlbumScreen />
    </View>
  );
}
