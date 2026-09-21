import type { LandscapeRatio } from "../camera-store";
import { useEffect } from "react";
import { Pressable, useWindowDimensions } from "react-native";
import {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUniwind } from "uniwind";
import { Text } from "@/components/ui";

const RATIO_16_9 = 0.5625;
const PREVIEW_TOP_SPARE_SHARE_16_9 = 0.25;
const PREVIEW_TOP_SPARE_SHARE_4_3 = 0.35;

export type AspectRatioAnimationResult = {
  /** Animated style for the preview container */
  previewStyle: ReturnType<typeof useAnimatedStyle>;
  /** Animated style for the top bar */
  topBarStyle: ReturnType<typeof useAnimatedStyle>;
  /** Current preview height */
  previewHeight: number;
  /** Current preview width */
  previewWidth: number;
  /** Current preview top position */
  previewTop: number;
  /** Current preview left position */
  previewLeft: number;
  /** Height to render inside the video surface (RTCView) */
  surfaceHeight: number;
  /** Width to render inside the video surface (RTCView) */
  surfaceWidth: number;
  /** Video rotation in degrees (90 in portrait for 16:9->9:16 / 4:3->3:4, 0 in landscape) */
  rotation: number;
  /** Video proportional scale factor to eliminate letterbox/pillarbox */
  scale: number;
  /** Whether the device is currently in portrait orientation */
  isPortrait: boolean;
};

/**
 * Hook that provides animated aspect ratio switching logic for Landscape & Nebula modes
 * Returns animation styles and geometry values for preview and top bar
 *
 * @note Planet mode has its own separate layout logic and should NOT use this hook
 */
export function useAspectRatioAnimation(
  ratio: LandscapeRatio,
  animationDuration = 220,
  topBarOffset = 12,
): AspectRatioAnimationResult {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const isPortrait = screenHeight >= screenWidth;

  let previewWidth: number;
  let previewHeight: number;
  let previewTop: number;
  let previewLeft: number;
  let surfaceWidth: number;
  let surfaceHeight: number;
  let rotation: number;
  let scale: number;

  if (isPortrait) {
    // In portrait orientation:
    // 16:9 ratio inverts to 9:16; 4:3 ratio inverts to 3:4 to fill the vertical screen.
    // Stream from board is 16:9 (or 4:3) horizontal. Rotating 90deg maps it to 9:16 (or 3:4).
    rotation = 90;
    scale = 1;
    // 竖屏下：16:9 画幅映射为 9:16（宽 390，高 693.33）；4:3 画幅映射为 3:4（宽 390，高 520）。
    // ratio === '4:3' 时，verticalRatio 应为 3/4 (0.75)；ratio === '16:9' 时，为 9/16 (0.5625)。
    const verticalRatio = ratio === '4:3' ? 3 / 4 : 9 / 16;
    previewWidth = screenWidth;
    previewHeight = Math.min(
      screenHeight,
      Math.round(previewWidth / verticalRatio),
    );
    previewLeft = 0;

    const spareHeight = Math.max(0, screenHeight - previewHeight);
    const topShare =
      ratio === '4:3'
        ? PREVIEW_TOP_SPARE_SHARE_4_3
        : PREVIEW_TOP_SPARE_SHARE_16_9;
    previewTop = Math.max(insets.top, Math.round(spareHeight * topShare));

    // RTCView 内部渲染的是横向视频流。在旋转 90 度呈竖屏时：
    // 内部 RTCView 的未旋转宽度即为旋转后的视觉高度（previewHeight），
    // 内部 RTCView 的未旋转高度即为旋转后的视觉宽度（previewWidth）。
    surfaceWidth = previewHeight;
    surfaceHeight = previewWidth;
  } else {
    // In landscape orientation:
    // 16:9 and 4:3 are displayed horizontally without rotation.
    rotation = 0;
    scale = 1;
    const horizontalRatio = ratio === "4:3" ? 4 / 3 : 16 / 9;
    previewHeight = Math.min(
      screenHeight,
      Math.round(screenWidth / horizontalRatio),
    );
    previewWidth = Math.round(previewHeight * horizontalRatio);
    if (previewWidth > screenWidth) {
      previewWidth = screenWidth;
      previewHeight = Math.round(previewWidth / horizontalRatio);
    }

    const spareHeight = Math.max(0, screenHeight - previewHeight);
    previewTop = Math.max(insets.top, Math.round(spareHeight / 2));
    previewLeft = Math.max(0, Math.round((screenWidth - previewWidth) / 2));

    surfaceWidth = screenWidth;
    surfaceHeight = Math.min(
      screenHeight,
      Math.round(screenWidth * RATIO_16_9),
    );
  }

  const animatedPreviewHeight = useSharedValue(previewHeight);
  const animatedPreviewWidth = useSharedValue(previewWidth);
  const animatedPreviewTop = useSharedValue(previewTop);
  const animatedPreviewLeft = useSharedValue(previewLeft);

  useEffect(() => {
    animatedPreviewHeight.value = withTiming(previewHeight, {
      duration: animationDuration,
    });
    animatedPreviewWidth.value = withTiming(previewWidth, {
      duration: animationDuration,
    });
    animatedPreviewTop.value = withTiming(previewTop, {
      duration: animationDuration,
    });
    animatedPreviewLeft.value = withTiming(previewLeft, {
      duration: animationDuration,
    });
  }, [
    animatedPreviewHeight,
    animatedPreviewWidth,
    animatedPreviewTop,
    animatedPreviewLeft,
    previewHeight,
    previewWidth,
    previewTop,
    previewLeft,
    animationDuration,
  ]);

  const previewStyle = useAnimatedStyle(() => ({
    top: animatedPreviewTop.value,
    left: animatedPreviewLeft.value,
    width: animatedPreviewWidth.value,
    height: animatedPreviewHeight.value,
  }));

  const topBarStyle = useAnimatedStyle(() => ({
    top: insets.top + topBarOffset,
  }));

  return {
    previewStyle,
    topBarStyle,
    previewHeight,
    previewWidth,
    previewTop,
    previewLeft,
    surfaceHeight,
    surfaceWidth,
    rotation,
    scale,
    isPortrait,
  };
}

type ToolCardProps = {
  /** Icon to display (optional) */
  icon?: React.ReactNode;
  /** Label text */
  label: string;
  /** Whether the button is in active state */
  active: boolean;
  /** Whether to show only text without icon (larger font) */
  textOnly?: boolean;
  /** Callback when button is pressed */
  onPress: () => void;
  /** Background color for inactive state */
  cardBg?: string;
  /** Background color for active state */
  activeBg?: string;
  /** Custom class name */
  className?: string;
};

/**
 * Standard tool card button used in Landscape & Nebula modes
 * Based on Landscape mode design (h-92px, rounded-2xl)
 *
 * @example
 * // With icon
 * <ToolCard
 *   icon={<StopwatchIcon />}
 *   label="定时拍摄"
 *   active={timerOn}
 *   onPress={() => setTimerOn(!timerOn)}
 * />
 *
 * // Text only (for aspect ratio)
 * <ToolCard
 *   label="4:3"
 *   textOnly
 *   active={false}
 *   onPress={handleRatioPress}
 * />
 */
export function ToolCard({
  icon,
  label,
  active,
  textOnly = false,
  onPress,
  cardBg,
  activeBg = "#CBFF3C",
  className = "",
}: ToolCardProps) {
  const { theme } = useUniwind();
  const isDark = theme === "dark";
  const resolvedCardBg = cardBg ?? (isDark ? "#1F1F1F" : "#F4F4F5");

  return (
    <Pressable
      onPress={onPress}
      style={{ backgroundColor: active ? activeBg : resolvedCardBg }}
      className={`h-[92px] flex-1 items-center justify-center gap-2 rounded-2xl active:opacity-80 ${className}`}
    >
      {textOnly ? (
        <Text
          className={`text-[21px] ${active ? "text-black dark:text-black" : "text-black dark:text-white"}`}
        >
          {label}
        </Text>
      ) : (
        <>
          {icon}
          <Text
            className={`text-[12px] ${active ? "text-black dark:text-black" : "text-black dark:text-white"}`}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

type AspectRatioButtonProps = {
  /** Current aspect ratio (4:3 or 16:9) */
  ratio: LandscapeRatio;
  /** Callback when ratio button is pressed */
  onPress: () => void;
  /** Background color for inactive state */
  cardBg?: string;
  /** Custom class name */
  className?: string;
};

/**
 * Convenient wrapper around ToolCard for aspect ratio switching
 *
 * @example
 * <AspectRatioButton
 *   ratio={ratio}
 *   onPress={() => setRatio(ratio === '4:3' ? '16:9' : '4:3')}
 * />
 */
export function AspectRatioButton({
  ratio,
  onPress,
  cardBg = "#1F1F1F",
  className = "",
}: AspectRatioButtonProps) {
  const ratioLabel = ratio === "4:3" ? "4:3" : "16:9";

  return (
    <ToolCard
      label={ratioLabel}
      textOnly
      active={false}
      onPress={onPress}
      cardBg={cardBg}
      className={className}
    />
  );
}
