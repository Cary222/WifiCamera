/**
 * Camera preview area.
 *
 * Renders one of three states:
 * - streamingInProgress: black placeholder with a "Live" badge (STREAM mode)
 * - newestCameraJpgUrl: the latest camera JPEG preview image
 * - fallback: dark placeholder with a camera icon
 *
 * Maintains 16:9 aspect ratio with rounded corners.
 */
import { View } from 'react-native';
import { Image, Text } from '@/components/ui';

type Props = {
  newestCameraJpgUrl: string | null;
  streamingInProgress: boolean;
};

export function PreviewArea({ newestCameraJpgUrl, streamingInProgress }: Props) {
  return (
    <View className="overflow-hidden rounded-2xl bg-black">
      <View className="w-full" style={{ aspectRatio: 16 / 9 }}>
        {streamingInProgress
          ? (
              <View className="flex-1 items-center justify-center bg-black">
                <View className="absolute top-4 left-4 flex-row items-center gap-1.5 rounded-full bg-red-600 px-3 py-1">
                  <View className="size-2 animate-pulse rounded-full bg-white" />
                  <Text className="text-xs font-semibold text-white">LIVE</Text>
                </View>
                <Text className="text-neutral-500">Streaming...</Text>
              </View>
            )
          : newestCameraJpgUrl
            ? (
                <Image
                  source={{ uri: newestCameraJpgUrl }}
                  className="flex-1"
                  contentFit="contain"
                  alt="Camera preview"
                />
              )
            : (
                <View className="flex-1 items-center justify-center bg-[#111]">
                  <Text className="mb-2 text-4xl text-neutral-600">📷</Text>
                  <Text tx="camera.preview_waiting" className="text-sm text-neutral-500" />
                </View>
              )}
      </View>
    </View>
  );
}
