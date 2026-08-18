/* eslint-disable perfectionist/sort-imports, max-lines-per-function */
import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

import { Modal, Text, useModal } from '@/components/ui';
import { WifiBandSelector } from '@/features/settings/components/wifi-band-selector';
import { translate } from '@/lib/i18n';
import { storage } from '@/lib/storage';

const cameraEquipment = require('@/assets/icons/index/CameraEquipment.png');
const powerIcon = require('@/assets/common/Power.png');

type HistoryDevice = {
  id: string;
  name: string;
  lastConnected: number;
};

type WifiDevice = {
  id: string;
  name: string;
  signalStrength: number;
};

const HISTORY_KEY = 'wifi_camera_history';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function DeviceConnectionModal({ visible, onClose }: Props) {
  const { ref, present, dismiss } = useModal();
  const [connecting, setConnecting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [availableDevices, setAvailableDevices] = useState<WifiDevice[]>([]);
  const [historyDevices, setHistoryDevices] = useState<HistoryDevice[]>([]);

  useEffect(() => {
    const loadHistory = () => {
      const historyJson = storage.getString(HISTORY_KEY);
      if (historyJson) {
        try {
          const history = JSON.parse(historyJson) as HistoryDevice[];
          setHistoryDevices(history.sort((a, b) => b.lastConnected - a.lastConnected).slice(0, 3));
        }
        catch {
          setHistoryDevices([]);
        }
      }
    };

    const startScan = () => {
      setScanning(true);
      setAvailableDevices([]);
      setTimeout(() => {
        setAvailableDevices([
          { id: 'wifi-camera-1', name: 'Wi-Fi Camera', signalStrength: 85 },
        ]);
        setScanning(false);
      }, 2000);
    };

    if (visible) {
      present();
      loadHistory();
      startScan();
    }
    else {
      dismiss();
    }
  }, [visible, present, dismiss]);

  const saveToHistory = useCallback((deviceId: string, deviceName: string) => {
    const historyJson = storage.getString(HISTORY_KEY);
    let history: HistoryDevice[] = [];
    if (historyJson) {
      try {
        history = JSON.parse(historyJson) as HistoryDevice[];
      }
      catch {
        history = [];
      }
    }
    const now = Date.now();
    const existing = history.find(d => d.id === deviceId);
    if (existing) {
      existing.lastConnected = now;
    }
    else {
      history.push({ id: deviceId, name: deviceName, lastConnected: now });
    }
    storage.set(HISTORY_KEY, JSON.stringify(history));

    const updatedHistory = JSON.parse(storage.getString(HISTORY_KEY) ?? '[]') as HistoryDevice[];
    setHistoryDevices(updatedHistory.sort((a, b) => b.lastConnected - a.lastConnected).slice(0, 3));
  }, []);

  const startScan = () => {
    setScanning(true);
    setAvailableDevices([]);
    setTimeout(() => {
      setAvailableDevices([
        { id: 'wifi-camera-1', name: 'Wi-Fi Camera', signalStrength: 85 },
      ]);
      setScanning(false);
    }, 2000);
  };

  const handleConnect = (deviceId: string, deviceName: string) => {
    setConnecting(true);
    saveToHistory(deviceId, deviceName);
    setTimeout(() => {
      setConnecting(false);
      onClose();
    }, 2000);
  };

  return (
    <Modal
      ref={ref}
      title={translate('settings.connect_camera')}
      snapPoints={['70%']}
      onDismiss={onClose}
    >
      <ScrollView className="flex-1 px-5">
        <View className="py-4">
          <Text className="mb-6 text-center text-[15px] text-white/50">
            {translate('home.connect_hint')}
          </Text>

          {/* WiFi Band Switcher */}
          <View className="mb-6">
            <Text className="mb-2 text-[14px] text-white/70">
              {translate('settings.wifi_band')}
            </Text>
            <WifiBandSelector
              standalone
              allowDisconnected
              onSwitch={() => startScan()}
            />
          </View>

          {/* History Devices */}
          {historyDevices.length > 0 && !scanning && (
            <View className="mb-6">
              <Text className="mb-3 text-[14px] text-white/70">
                {translate('home.history_devices')}
              </Text>
              {historyDevices.map(device => (
                <Pressable
                  key={device.id}
                  onPress={() => handleConnect(device.id, device.name)}
                  disabled={connecting}
                  className="mb-3 rounded-[20px] border border-neutral-200 bg-transparent p-5 active:bg-[#1A1A1A] disabled:opacity-50 dark:border-[#48484880]"
                >
                  <View className="flex-row items-center gap-4">
                    <View className="size-[60px] items-center justify-center rounded-[18px] bg-transparent">
                      <Image
                        source={cameraEquipment}
                        style={{ width: 32, height: 32 }}
                        contentFit="contain"
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="text-[18px] font-semibold text-white">
                        {device.name}
                      </Text>
                      <Text className="mt-1 text-[14px] text-white/50">
                        {translate('home.last_connected')}
                      </Text>
                    </View>
                    <View className="size-[28px] items-center justify-center rounded-full bg-[#c8e733]">
                      <Image
                        source={powerIcon}
                        style={{ width: 14, height: 14 }}
                        contentFit="contain"
                        tintColor="#2a3319"
                      />
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          )}

          {/* Scanning Status */}
          {scanning && (
            <View className="items-center py-8">
              <ActivityIndicator size="large" color="#c8e733" />
              <Text className="mt-4 text-[15px] text-white/70">
                {translate('home.scanning_devices')}
              </Text>
            </View>
          )}

          {/* Available Devices */}
          {!scanning && availableDevices.length > 0 && (
            <View className="mb-6">
              <Text className="mb-3 text-[14px] text-white/70">
                {translate('home.available_devices')}
              </Text>
              {availableDevices.map(device => (
                <Pressable
                  key={device.id}
                  onPress={() => handleConnect(device.id, device.name)}
                  disabled={connecting}
                  className="mb-3 rounded-[20px] border border-neutral-200 bg-transparent p-5 active:bg-[#1A1A1A] disabled:opacity-50 dark:border-[#48484880]"
                >
                  <View className="flex-row items-center gap-4">
                    <View className="size-[60px] items-center justify-center rounded-[18px] bg-transparent">
                      <Image
                        source={cameraEquipment}
                        style={{ width: 32, height: 32 }}
                        contentFit="contain"
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="text-[18px] font-semibold text-white">
                        {device.name}
                      </Text>
                      <Text className="mt-1 text-[14px] text-white/50">
                        {connecting ? 'Connecting...' : 'Available'}
                      </Text>
                    </View>
                    <View className="size-[28px] items-center justify-center rounded-full bg-[#c8e733]">
                      <Image
                        source={powerIcon}
                        style={{ width: 14, height: 14 }}
                        contentFit="contain"
                        tintColor="#2a3319"
                      />
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          )}

          {/* No Devices Found */}
          {!scanning && availableDevices.length === 0 && (
            <View className="items-center py-8">
              <Text className="mb-4 text-[15px] text-white/50">
                {translate('home.no_devices_found')}
              </Text>
              <Pressable
                onPress={startScan}
                className="rounded-[20px] bg-[#c8e733] px-6 py-3 active:opacity-80"
              >
                <Text className="text-[16px] font-bold text-[#2a3319]">
                  {translate('home.scan_again')}
                </Text>
              </Pressable>
            </View>
          )}

          <View className="mt-4 rounded-[15px] border border-[rgba(255,229,98,0.2)] bg-[rgba(255,229,98,0.08)] p-4">
            <Text className="text-[13px] text-[#FFE562]">
              {translate('home.connect_hint')}
            </Text>
          </View>
        </View>
      </ScrollView>
    </Modal>
  );
}
