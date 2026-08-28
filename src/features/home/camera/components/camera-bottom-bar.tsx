import type { ReactNode } from 'react';
import type { CameraMode } from './camera-mode-switcher';
import { Image } from 'expo-image';
import { useCallback } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraModeSwitcher } from './camera-mode-switcher';

const BRAND = '#CBFF3C';
const BOTTOM_BAR_BG = '#0A0A0A';

export type CameraBottomBarProps = {
  /** Current capture mode */
  captureMode: CameraMode;
  /** Callback when capture mode changes */
  onCaptureModeChange: (mode: CameraMode) => void;
  /** URL or URI for the thumbnail image */
  thumbnailUri?: string | null;
  /** Callback when thumbnail is pressed */
  onThumbnailPress?: () => void;
  /** Whether the camera is currently capturing a photo */
  isCapturing?: boolean;
  /** Whether the camera is currently recording a video */
  isRecording?: boolean;
  /** Right action button (e.g., settings/menu button) */
  rightButton?: ReactNode;
  /** Whether the right button should show active state */
  rightButtonActive?: boolean;
  /** Callback when right button is pressed */
  onRightButtonPress?: () => void;
  /** Whether the right button is disabled */
  rightButtonDisabled?: boolean;
  /** Custom class name for the container */
  className?: string;
};

export function CameraBottomBar({
  captureMode,
  onCaptureModeChange,
  thumbnailUri,
  onThumbnailPress,
  isCapturing = false,
  isRecording = false,
  rightButton,
  rightButtonActive = false,
  onRightButtonPress,
  rightButtonDisabled = false,
  className = '',
}: CameraBottomBarProps) {
  const insets = useSafeAreaInsets();

  const handleThumbnailPress = useCallback(() => {
    onThumbnailPress?.();
  }, [onThumbnailPress]);

  const handleRightButtonPress = useCallback(() => {
    onRightButtonPress?.();
  }, [onRightButtonPress]);

  return (
    <View
      className={`absolute inset-x-0 bottom-0 flex-row items-center justify-between px-5 ${className}`.trim()}
      style={{
        backgroundColor: BOTTOM_BAR_BG,
        paddingBottom: insets.bottom + 12,
        paddingTop: 12,
      }}
    >
      {/* Left: Thumbnail/Album Button */}
      <Pressable
        onPress={handleThumbnailPress}
        disabled={!onThumbnailPress}
        className="size-[54px] items-center justify-center overflow-hidden rounded-full bg-white/10 active:opacity-70"
      >
        {thumbnailUri
          ? (
              <Image
                source={{ uri: thumbnailUri }}
                style={{ width: 54, height: 54 }}
                contentFit="cover"
              />
            )
          : (
              <View className="size-[54px] rounded-full bg-white/10" />
            )}
      </Pressable>

      {/* Center: Mode Switcher */}
      <CameraModeSwitcher
        mode={captureMode}
        onChange={onCaptureModeChange}
        variant="capsule-lg"
        isCapturing={isCapturing}
        isRecording={isRecording}
      />

      {/* Right: Custom Action Button */}
      {rightButton && (
        <Pressable
          onPress={handleRightButtonPress}
          disabled={rightButtonDisabled}
          className="size-[54px] items-center justify-center rounded-full active:opacity-70"
          style={{
            borderColor: rightButtonActive ? BRAND : 'rgba(255, 255, 255, 0.35)',
            borderWidth: 1.6,
            opacity: rightButtonDisabled ? 0.45 : 1,
          }}
        >
          {rightButton}
        </Pressable>
      )}
    </View>
  );
}
