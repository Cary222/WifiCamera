import type { CameraWebSocketStatus } from '../services/websocket-service';
import type { TxKeyPath } from '@/lib/i18n';
import { View } from 'react-native';
import { Text } from '@/components/ui';

type Props = {
  status: CameraWebSocketStatus | 'idle';
};

const STATUS_COPY: Record<Props['status'], TxKeyPath> = {
  idle: 'camera.status_idle',
  connecting: 'camera.status_connecting',
  open: 'camera.status_open',
  closed: 'camera.status_closed',
  error: 'camera.status_error',
};

export function ConnectionStatus({ status }: Props) {
  const isOnline = status === 'open';
  return (
    <View className="flex-row items-center gap-2 rounded-full bg-neutral-100 px-3 py-1.5 dark:bg-[#1A1A1A]">
      <View className={`size-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-neutral-400'}`} />
      <Text tx={STATUS_COPY[status]} className="text-sm text-neutral-600 dark:text-neutral-300" />
    </View>
  );
}
