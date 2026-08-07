import { Redirect, SplashScreen, Tabs } from 'expo-router';
import * as React from 'react';
import { useCallback, useEffect } from 'react';
import { Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUniwind } from 'uniwind';

import {
  HomeFilled,
  SettingsFilled,
  StarmapFilled,
} from '@/components/ui/icons';
import { useAppGate } from '@/lib/hooks/use-app-gate';
import { translate } from '@/lib/i18n';

function renderTabBarLabel(label: string) {
  return ({ focused }: { focused: boolean }) => (
    <Text
      style={{
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: focused ? 'bold' : '100',
      }}
    >
      {label}
    </Text>
  );
}

export default function TabLayout() {
  const gate = useAppGate();
  const { theme } = useUniwind();
  const isDark = theme === 'dark';
  const insets = useSafeAreaInsets();

  const hideSplash = useCallback(async () => {
    await SplashScreen.hideAsync();
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      hideSplash();
    }, 1000);
    return () => clearTimeout(timer);
  }, [hideSplash]);

  if (gate.kind === 'redirect') {
    return <Redirect href={gate.href} />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: isDark ? '#0A0B0D' : '#FFFFFF',
          borderTopWidth: 0,
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 8,
          height: 64 + Math.max(insets.bottom, 8),
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: translate('home.title'),
          headerShown: false,
          tabBarIcon: ({ focused }) => <HomeFilled focused={focused} />,
          tabBarLabel: renderTabBarLabel(translate('home.title')),
          tabBarButtonTestID: 'home-tab',
        }}
      />

      <Tabs.Screen
        name="deep-space"
        options={{
          title: translate('deep_space.title'),
          headerShown: false,
          tabBarIcon: ({ focused }) => <StarmapFilled focused={focused} />,
          tabBarLabel: renderTabBarLabel(translate('deep_space.title')),
          tabBarButtonTestID: 'deep-space-tab',
        }}
      />

      <Tabs.Screen
        name="camera"
        options={{
          href: null,
          headerShown: false,
        }}
      />

      <Tabs.Screen
        name="album"
        options={{
          href: null,
          headerShown: false,
        }}
      />

      <Tabs.Screen
        name="settings"
        options={{
          title: translate('settings.title'),
          headerShown: false,
          tabBarIcon: ({ focused }) => <SettingsFilled focused={focused} />,
          tabBarLabel: renderTabBarLabel(translate('settings.title')),
          tabBarButtonTestID: 'settings-tab',
        }}
      />
    </Tabs>
  );
}
