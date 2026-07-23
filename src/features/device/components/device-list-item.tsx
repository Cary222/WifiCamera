import type { Device } from '../types';
import { ActivityIndicator, Pressable, View } from 'react-native';

import Svg, { Path } from 'react-native-svg';

import { Text } from '@/components/ui';

function WifiIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm8.65-9.42a14 14 0 0 0-17.3 0l1.42 1.42a11.93 11.93 0 0 1 14.46 0l1.42-1.42ZM17.7 11.7a9 9 0 0 0-11.4 0l1.42 1.42a7 7 0 0 1 8.56 0l1.42-1.42ZM14.83 14.84a4 4 0 0 0-5.66 0l1.42 1.42a2 2 0 0 1 2.82 0l1.42-1.42Z"
        fill="#fff"
      />
    </Svg>
  );
}

export type DeviceListItemProps = {
  device: Device;
  onPress: () => void;
};

export function DeviceListItem({ device, onPress }: DeviceListItemProps) {
  const isUnavailable = device.status === 'unavailable';
  const isConnecting = device.status === 'connecting';

  return (
    <Pressable
      onPress={onPress}
      disabled={isUnavailable || isConnecting}
      className={`h-[59px] w-full flex-row items-center justify-center rounded-2xl ${
        isUnavailable ? 'opacity-40' : ''
      }`}
      style={{ backgroundColor: 'rgba(255, 255, 255, 0.2)' }}
    >
      <View className="absolute left-4 size-4 items-center justify-center">
        <WifiIcon />
      </View>
      <Text className="text-[20px] text-white">{device.name}</Text>
      {isConnecting && (
        <View className="absolute right-4">
          <ActivityIndicator size="small" color="#fff" />
        </View>
      )}
    </Pressable>
  );
}
