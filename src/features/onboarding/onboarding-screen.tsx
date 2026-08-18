import { useRouter } from 'expo-router';
import * as React from 'react';

import {
  Button,
  FocusAwareStatusBar,
  Image,
  SafeAreaView,
  Text,
  View,
} from '@/components/ui';
import { useAuthStore } from '@/features/auth/use-auth-store';
import { useIsFirstTime } from '@/lib/hooks';

const WELCOME_BG = require('../../../assets/welcomebackground.png');

export function OnboardingScreen() {
  const [_, setIsFirstTime] = useIsFirstTime();
  const signIn = useAuthStore.use.signIn();
  const router = useRouter();
  return (
    <View className="relative size-full bg-black">
      <FocusAwareStatusBar hidden />
      <Image
        source={WELCOME_BG}
        className="absolute inset-0 size-full"
        contentFit="cover"
      />
      <View className="flex-1 items-center justify-center px-6">
        <Text
          className="text-center text-7xl font-bold tracking-widest text-white"
          style={{
            textShadowColor: 'rgba(0, 0, 0, 0.6)',
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 12,
          }}
        >
          STAR
        </Text>
      </View>
      <SafeAreaView className="pb-6">
        <Button
          label="Let's Get Started "
          onPress={() => {
            setIsFirstTime(false);
            // 自动设置为已登录状态，无需真实 token
            signIn({ access: 'auto-signin', refresh: 'auto-signin' });
            router.replace('/');
          }}
        />
      </SafeAreaView>
    </View>
  );
}
