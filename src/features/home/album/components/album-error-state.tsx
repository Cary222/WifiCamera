import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui';
import { translate } from '@/lib/i18n';

type Props = {
  /** Optional error message shown above the retry button */
  message?: string;
  onRetry?: () => void;
};

/**
 * Inline error state for the album screen.
 */
export function AlbumErrorState({ message, onRetry }: Props) {
  return (
    <View className="flex-1 items-center justify-center bg-[#090a0c] px-6 py-12">
      <Text className="text-center text-[14px] font-normal text-white">
        {message ?? translate('album.load_error')}
      </Text>
      {onRetry
        ? (
            <Pressable
              onPress={onRetry}
              className="mt-4 rounded-[10px] bg-[#1A1A1A] px-5 py-2 active:opacity-70"
            >
              <Text className="text-[14px] font-medium text-white">
                {translate('album.retry')}
              </Text>
            </Pressable>
          )
        : null}
    </View>
  );
}
