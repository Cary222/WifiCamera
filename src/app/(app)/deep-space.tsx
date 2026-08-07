import { useRouter } from 'expo-router';
import * as React from 'react';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useUniwind } from 'uniwind';
import { FocusAwareStatusBar, Text } from '@/components/ui';
import { ArrowLeft } from '@/components/ui/icons';
import { useCameraStore } from '@/features/camera/camera-store';
import { StellariumOverlay } from '@/features/stellarium/stellarium-overlay';
import { translate } from '@/lib/i18n';

/**
 * Deep Space screen — camera + Stellarium integration.
 *
 * Three view states:
 *   shooting  — camera preview + exposure/gain controls
 *   stellarium — full-screen Stellarium WebView overlay
 *   plan       — shooting plan (placeholder)
 *
 * Bottom action bar: [🔭 Resolve] [🌐 Star Map] [📋 Plan]
 */
export default function DeepSpaceScreen() {
  const { theme } = useUniwind();
  const isDark = theme === 'dark';
  const router = useRouter();

  const [view, setView] = useState<'shooting' | 'stellarium' | 'plan'>('shooting');

  const handleStellaClose = () => {
    setView('shooting');
  };

  return (
    <>
      <FocusAwareStatusBar />
      <View className={`flex-1 ${isDark ? 'bg-black' : 'bg-white'}`}>
        {/* Top: back button + title */}
        <View className="flex-row items-center gap-3 px-4 pt-12 pb-3">
          <Pressable
            onPress={() => router.back()}
            className="rounded-full bg-white/10 p-2"
          >
            <View
              style={{
                width: 10,
                height: 10,
                borderLeftWidth: 1.5,
                borderBottomWidth: 1.5,
                borderColor: 'white',
                transform: [{ rotate: '45deg' }],
              }}
            />
          </Pressable>
          <Text className="text-lg font-semibold text-white">
            {translate('deep_space.title')}
          </Text>
        </View>

        {/* Main content area */}
        <View className="flex-1 px-5 pb-4">
          {view === 'shooting' && (
            <View className="flex-1 items-center justify-center rounded-2xl bg-neutral-900">
              <Text className="text-neutral-500">{translate('deep_space.shooting_hint')}</Text>
            </View>
          )}

          {view === 'plan' && (
            <View className="flex-1 items-center justify-center rounded-2xl bg-neutral-100 dark:bg-neutral-900">
              <Text className="text-neutral-500">{translate('deep_space.plan_hint')}</Text>
            </View>
          )}
        </View>

        {/* Bottom action bar */}
        <View className="flex-row border-t border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <ActionBarButton
            icon="🔭"
            label={translate('deep_space.resolve')}
            active={false}
            onPress={() => {}}
          />
          <ActionBarButton
            icon="🌐"
            label={translate('deep_space.star_map')}
            active={view === 'stellarium'}
            onPress={() => setView('stellarium')}
          />
          <ActionBarButton
            icon="📋"
            label={translate('deep_space.plan')}
            active={view === 'plan'}
            onPress={() => setView('plan')}
          />
        </View>
      </View>

      {/* Stellarium overlay — rendered above everything */}
      <StellariumOverlay
        visible={view === 'stellarium'}
        onClose={handleStellaClose}
      />
    </>
  );
}

function ActionBarButton({
  icon,
  label,
  active,
  onPress,
}: {
  icon: string;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 items-center gap-1 py-2 ${
        active ? 'opacity-100' : 'opacity-60'
      }`}
    >
      <Text className="text-xl">{icon}</Text>
      <Text
        className={`text-xs ${
          active ? 'font-semibold text-orange-500' : 'text-neutral-500 dark:text-neutral-400'
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
