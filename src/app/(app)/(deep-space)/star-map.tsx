import { StatusBar } from 'expo-status-bar';
import * as React from 'react';
import { View } from 'react-native';

import { FocusAwareStatusBar } from '@/components/ui';
import { DeepSpaceMapScreen } from '@/features/deep-space/deep-space-map-screen';

export default function StarMapScreen() {
  return (
    <>
      <StatusBar style="light" />
      <FocusAwareStatusBar hidden />
      <View className="flex-1 bg-[#050A14]">
        <DeepSpaceMapScreen />
      </View>
    </>
  );
}
