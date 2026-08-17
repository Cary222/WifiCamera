import { StatusBar } from 'expo-status-bar';
import * as React from 'react';
import { View } from 'react-native';

import { FocusAwareStatusBar } from '@/components/ui';
import { StellariumView } from '@/features/stellarium/stellarium-view';

export default function StarMapScreen() {
  return (
    <>
      <StatusBar style="light" />
      <FocusAwareStatusBar hidden />
      <View className="flex-1 bg-black">
        <StellariumView style={{ flex: 1 }} />
      </View>
    </>
  );
}
