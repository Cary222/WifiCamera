import type { CameraTransportPreference } from '@/features/home/camera/transport';

import { View } from 'react-native';
import { SegmentedControl, Text } from '@/components/ui';
import { useCameraStore } from '@/features/home/camera/camera-store';
import { translate } from '@/lib/i18n';

const OPTIONS = [
  { value: 'auto', labelTx: 'settings.transport_auto' },
  { value: 'usb', labelTx: 'settings.transport_usb' },
  { value: 'wifi', labelTx: 'settings.transport_wifi' },
] as const satisfies readonly { value: CameraTransportPreference; labelTx: 'settings.transport_auto' | 'settings.transport_usb' | 'settings.transport_wifi' }[];

/**
 * Picks the link used to reach the board: auto-probe, or pin USB / WiFi.
 *
 * Pinning matters during debugging — auto mode can legitimately land on either
 * link, which makes it ambiguous which path a failure came from.
 */
export function TransportSelector({ standalone = false }: { standalone?: boolean } = {}) {
  const preference = useCameraStore.use.transportPreference();
  const transport = useCameraStore.use.transport();
  const probing = useCameraStore.use.transportProbing();
  const switchTransport = useCameraStore.use.switchTransport();

  const handleSelect = (value: CameraTransportPreference) => {
    if (value !== preference)
      switchTransport(value);
  };

  const activeLabel = probing
    ? translate('settings.transport_probing')
    : transport === 'wifi'
      ? translate('settings.transport_wifi')
      : translate('settings.transport_usb');

  const segments = (
    <SegmentedControl<CameraTransportPreference>
      options={OPTIONS}
      value={preference}
      onChange={handleSelect}
      variant="neutral-fixed"
      segmentPixelWidth={62}
    />
  );

  if (standalone) {
    return (
      <View>
        <View className="flex-row items-center justify-between">
          {segments}
          <TransportReachability />
        </View>
        <Text className="mt-2 text-[12px] text-white/50">
          {`${translate('settings.transport_hint')} · ${activeLabel}`}
        </Text>
      </View>
    );
  }

  return (
    <View className="mx-4 mb-5 flex-row items-center justify-between rounded-[15px] border border-neutral-200 bg-white px-5 py-4 dark:border-[#48484880] dark:bg-[#111113]">
      <View>
        <Text tx="settings.transport" className="text-[18px] text-black dark:text-white" />
        <Text className="mt-2 text-[12px] text-neutral-500 dark:text-charcoal-400">
          {`${translate('settings.transport_hint')} · ${activeLabel}`}
        </Text>
      </View>
      {segments}
    </View>
  );
}

/**
 * Live per-link reachability dots.
 *
 * Renders nothing until the first probe finishes: an unprobed link must not
 * be shown as unreachable, or the UI would blame a cable that is actually fine.
 */
function TransportReachability() {
  const reachability = useCameraStore.use.transportReachability();
  const probing = useCameraStore.use.transportProbing();

  if (probing) {
    return (
      <Text className="text-[12px] text-white/50">
        {translate('settings.transport_probing')}
      </Text>
    );
  }

  if (!reachability)
    return null;

  return (
    <View className="flex-row items-center gap-3">
      {(['usb', 'wifi'] as const).map(link => (
        <View key={link} className="flex-row items-center gap-1.5">
          <View
            style={[
              { width: 8, height: 8, borderRadius: 4 },
              { backgroundColor: reachability[link] ? '#C8E733' : '#6B7280' },
            ]}
          />
          <Text className="text-[12px] text-white/60">
            {translate(link === 'usb' ? 'settings.transport_usb' : 'settings.transport_wifi')}
          </Text>
        </View>
      ))}
    </View>
  );
}
