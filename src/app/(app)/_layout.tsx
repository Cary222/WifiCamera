import { Redirect, SplashScreen, Tabs } from 'expo-router';
import * as React from 'react';
import { useCallback, useEffect, useMemo } from 'react';
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

function renderTabBarLabel(label: string, isDark: boolean) {
  return ({ focused }: { focused: boolean }) => (
    <Text
      style={{
        color: isDark
          ? (focused ? '#FFFFFF' : 'rgba(255, 255, 255, 0.55)')
          : (focused ? '#0A0B0D' : 'rgba(10, 11, 13, 0.55)'),
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
      void hideSplash();
    }, 1000);
    return () => clearTimeout(timer);
  }, [hideSplash]);

  // Stable screenOptions — object identity is preserved across re-renders
  // unless theme or insets change, preventing unnecessary tab bar re-mounts
  // that could cause style flicker during Uniwind / Zustand re-render cascades.
  const screenOptions = useMemo(() => ({
    headerShown: false,
    tabBarStyle: {
      backgroundColor: isDark ? '#0A0B0D' : '#FFFFFF',
      borderTopWidth: 0.5,
      borderTopColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(10, 11, 13, 0.08)',
      paddingBottom: Math.max(insets.bottom, 8),
      paddingTop: 8,
      height: 64 + Math.max(insets.bottom, 8),
    },
  }), [isDark, insets.bottom]);

  if (gate.kind === 'redirect') {
    return <Redirect href={gate.href} />;
  }

  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen
        name="(home)"
        options={{
          title: translate('home.title'),
          tabBarIcon: ({ focused }) => <HomeFilled focused={focused} />,
          tabBarLabel: renderTabBarLabel(translate('home.title'), isDark),
          tabBarButtonTestID: 'home-tab',
        }}
      />

      <Tabs.Screen
        name="(deep-space)"
        options={{
          title: translate('deep_space.title'),
          tabBarIcon: ({ focused }) => <StarmapFilled focused={focused} />,
          tabBarLabel: renderTabBarLabel(translate('deep_space.title'), isDark),
          tabBarButtonTestID: 'deep-space-tab',
        }}
      />

      <Tabs.Screen
        name="(settings)"
        options={{
          title: translate('settings.title'),
          tabBarIcon: ({ focused }) => <SettingsFilled focused={focused} />,
          tabBarLabel: renderTabBarLabel(translate('settings.title'), isDark),
          tabBarButtonTestID: 'settings-tab',
        }}
      />
    </Tabs>
  );
}
