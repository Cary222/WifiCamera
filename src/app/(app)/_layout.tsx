import { Redirect, SplashScreen, Tabs } from 'expo-router';
import * as React from 'react';
import { useCallback, useEffect } from 'react';

import {
  Camera as CameraIcon,
  Image as ImageIcon,
  Settings as SettingsIcon,
} from '@/components/ui/icons';
import { useAuthStore as useAuth } from '@/features/auth/use-auth-store';
import { useAppGate } from '@/lib/hooks/use-app-gate';

export default function TabLayout() {
  const status = useAuth.use.status();
  const gate = useAppGate();

  const hideSplash = useCallback(async () => {
    await SplashScreen.hideAsync();
  }, []);
  useEffect(() => {
    if (status !== 'idle') {
      const timer = setTimeout(() => {
        hideSplash();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [hideSplash, status]);

  if (gate.kind === 'redirect') {
    return <Redirect href={gate.href} />;
  }

  return (
    <Tabs>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Camera',
          headerShown: false,
          tabBarIcon: ({ color }) => <CameraIcon color={color} />,
          tabBarButtonTestID: 'camera-tab',
        }}
      />

      <Tabs.Screen
        name="album"
        options={{
          title: 'Album',
          headerShown: false,
          tabBarIcon: ({ color }) => <ImageIcon color={color} />,
          tabBarButtonTestID: 'album-tab',
        }}
      />

      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          headerShown: false,
          tabBarIcon: ({ color }) => <SettingsIcon color={color} />,
          tabBarButtonTestID: 'settings-tab',
        }}
      />
    </Tabs>
  );
}
