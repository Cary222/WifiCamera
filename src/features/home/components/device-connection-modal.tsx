/* eslint-disable perfectionist/sort-imports, max-lines-per-function */
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from 'react-native';

import { Modal, Text, useModal } from '@/components/ui';
import { WifiBandSelector } from '@/features/settings/components/wifi-band-selector';
import { useCameraStore } from '@/features/home/camera/camera-store';
import { translate } from '@/lib/i18n';
import { getItem, setItem, storage } from '@/lib/storage';
import { STORAGE_KEYS } from '@/lib/storage-keys';

const cameraEquipment = require('@/assets/icons/index/CameraEquipment.png');
const powerIcon = require('@/assets/common/Power.png');

type HistoryDevice = {
  id: string;
  name: string;
  lastConnected: number;
  ip?: string;
};

type WifiDevice = {
  id: string;
  name: string;
  signalStrength: number;
  ip?: string;
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
  const [cameraIp, setCameraIp] = useState('');
  const [showIpInput, setShowIpInput] = useState(false);

  const initTransport = useCameraStore.use.initTransport();
  const connectionStatus = useCameraStore.use.connectionStatus();
  const connectingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load saved WiFi camera IP on mount
  useEffect(() => {
    const savedIp = getItem<string>(STORAGE_KEYS.WIFI_CAMERA_IP);
    if (savedIp) {
      setCameraIp(savedIp);
    }
  }, []);

  // Keep onClose ref updated
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Auto-close modal when connection is established, with timeout fallback
  useEffect(() => {
    if (!visible || !connectingRef.current)
      return;

    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (connectionStatus === 'open') {
      // Connection successful
      connectingRef.current = false;
      setConnecting(false);
      onCloseRef.current();
      return;
    }

    // Timeout fallback: if still not connected after 15s, give up
    timeoutRef.current = setTimeout(() => {
      if (connectingRef.current) {
        connectingRef.current = false;
        setConnecting(false);
      }
    }, 15_000);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [connectionStatus, visible]);

  const startScan = () => {
    setScanning(true);
    setAvailableDevices([]);

    // Save the camera IP before initiating transport
    if (cameraIp.trim()) {
      setItem(STORAGE_KEYS.WIFI_CAMERA_IP, cameraIp.trim());
    }

    void initTransport();
    setTimeout(() => {
      setAvailableDevices([
        { id: 'wifi-camera-1', name: 'Wi-Fi Camera', signalStrength: 85 },
      ]);
      setScanning(false);
    }, 2000);
  };

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

  const handleConnect = (deviceId: string, deviceName: string) => {
    console.log('[MODAL]', '=== handleConnect 被调用 ===', { deviceId, deviceName, cameraIp });
    setConnecting(true);
    connectingRef.current = true;
    saveToHistory(deviceId, deviceName);

    // Save the camera IP before connecting
    if (cameraIp.trim()) {
      setItem(STORAGE_KEYS.WIFI_CAMERA_IP, cameraIp.trim());
    }

    console.log('[MODAL]', '调用 initTransport 开始连接');
    void initTransport();
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

          {/* WiFi Camera IP Input */}
          <View className="mb-6">
            <Text className="mb-2 text-[14px] text-white/70">
              WiFi Camera IP
            </Text>
            <View className="flex-row items-center gap-2">
              <TextInput
                className="flex-1 rounded-[12px] border border-neutral-200 bg-transparent px-4 py-3 text-[16px] text-white dark:border-[#48484880]"
                placeholder="192.168.1.1"
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={cameraIp}
                onChangeText={setCameraIp}
                keyboardType="numbers-and-punctuation"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable
                onPress={() => {
                  setShowIpInput(!showIpInput);
                  if (!showIpInput && cameraIp.trim()) {
                    setItem(STORAGE_KEYS.WIFI_CAMERA_IP, cameraIp.trim());
                  }
                }}
                className="rounded-[12px] bg-[#c8e733] px-4 py-3"
              >
                <Text className="text-[14px] font-semibold text-[#2a3319]">
                  {showIpInput ? 'Save' : 'Edit'}
                </Text>
              </Pressable>
            </View>
            {showIpInput && (
              <Text className="mt-2 text-[12px] text-white/50">
                Enter the IP address shown on your camera display
              </Text>
            )}
          </View>

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
