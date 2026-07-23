import { useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { ActivityIndicator, FocusAwareStatusBar, Text } from '@/components/ui';
import { translate } from '@/lib/i18n';

import { DeviceListItem } from '../components/device-list-item';
import { SectionHeader } from '../components/section-header';
import { useBoundDeviceId, useDeviceStore } from '../use-device-store';

export function DeviceListScreen() {
  const router = useRouter();
  const devices = useDeviceStore.use.devices();
  const isScanning = useDeviceStore.use.isScanning();
  const scan = useDeviceStore.use.scan();
  const connectDevice = useDeviceStore.use.connect();
  const [, setBoundDeviceIdAction] = useBoundDeviceId();

  React.useEffect(() => {
    scan();
  }, [scan]);

  const handleConnect = async (deviceId: string) => {
    await connectDevice(deviceId);
    setBoundDeviceIdAction(deviceId);
  };

  const justConnected = devices.find(d => d.status === 'connected');
  React.useEffect(() => {
    if (justConnected) {
      router.push('/device-setup/connected');
    }
  }, [justConnected, router]);

  const available = devices.filter(
    d => d.status === 'available' || d.status === 'connecting',
  );
  const other = devices.filter(
    d => d.status === 'unavailable' || d.status === 'connected',
  );

  return (
    <>
      <FocusAwareStatusBar />
      <View className="flex-1 bg-black">
        <Text
          tx="device.discover_title"
          className="mt-16 text-center text-[26px] text-white"
        />
        <Text
          tx="device.scanning"
          className="mt-3 text-center text-base text-white"
        />

        <ScrollView
          className="mt-5 flex-1"
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {isScanning
            ? (
                <View className="mt-10 items-center">
                  <ActivityIndicator size="large" color="#FF8F1C" />
                </View>
              )
            : (
                <>
                  {available.length > 0 && (
                    <View className="mx-5 mt-4 rounded-2xl bg-[#E4E4E433] px-4 py-5">
                      <SectionHeader title={translate('device.section_available')} />
                      <View className="mt-3 gap-3">
                        {available.map(device => (
                          <DeviceListItem
                            key={device.id}
                            device={device}
                            onPress={() => handleConnect(device.id)}
                          />
                        ))}
                      </View>
                    </View>
                  )}

                  {other.length > 0 && (
                    <View className="mx-5 mt-5 rounded-2xl bg-[#E4E4E433] px-4 py-5">
                      <SectionHeader title={translate('device.section_other')} />
                      <View className="mt-3 gap-3">
                        {other.map(device => (
                          <DeviceListItem
                            key={device.id}
                            device={device}
                            onPress={() => {}}
                          />
                        ))}
                      </View>
                    </View>
                  )}
                </>
              )}
        </ScrollView>

        <View className="items-center pb-6">
          <Pressable hitSlop={10}>
            <Text
              tx="device.not_found"
              className="text-xs font-semibold text-white"
            />
          </Pressable>
        </View>
      </View>
    </>
  );
}
