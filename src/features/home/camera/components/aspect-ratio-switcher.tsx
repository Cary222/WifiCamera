import type { LandscapeRatio } from '../camera-store';
import { useEffect } from 'react';
import { Pressable, useWindowDimensions } from 'react-native';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui';

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
  /** Current preview top position */
  previewTop: number;
  /** Maximum surface height (for 16:9) */
  surfaceHeight: number;
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

  const ratioValue = ratio === '4:3' ? 0.75 : RATIO_16_9;
  const previewHeight = Math.min(screenHeight, screenWidth / ratioValue);
  const spareHeight = Math.max(0, screenHeight - previewHeight);
  const topShare = ratio === '4:3' ? PREVIEW_TOP_SPARE_SHARE_4_3 : PREVIEW_TOP_SPARE_SHARE_16_9;
  const previewTop = Math.max(Math.min(insets.top, spareHeight), Math.round(spareHeight * topShare));
  const surfaceHeight = Math.min(screenHeight, screenWidth / RATIO_16_9);

  const animatedPreviewHeight = useSharedValue(previewHeight);
  const animatedPreviewTop = useSharedValue(previewTop);

  useEffect(() => {
    animatedPreviewHeight.value = withTiming(previewHeight, { duration: animationDuration });
    animatedPreviewTop.value = withTiming(previewTop, { duration: animationDuration });
  }, [animatedPreviewHeight, animatedPreviewTop, previewHeight, previewTop, animationDuration]);

  const previewStyle = useAnimatedStyle(() => ({
    top: animatedPreviewTop.value,
    height: animatedPreviewHeight.value,
  }));

  const topBarStyle = useAnimatedStyle(() => ({ top: animatedPreviewTop.value + topBarOffset }));

  return {
    previewStyle,
    topBarStyle,
    previewHeight,
    previewTop,
    surfaceHeight,
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
  cardBg = '#1F1F1F',
  activeBg = '#CBFF3C',
  className = '',
}: ToolCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={{ backgroundColor: active ? activeBg : cardBg }}
      className={`h-[92px] flex-1 items-center justify-center gap-2 rounded-2xl active:opacity-80 ${className}`}
    >
      {textOnly
        ? <Text className={`text-[21px] ${active ? 'text-black dark:text-black' : 'text-white dark:text-white'}`}>{label}</Text>
        : (
            <>
              {icon}
              <Text className={`text-[12px] ${active ? 'text-black dark:text-black' : 'text-white dark:text-white'}`}>{label}</Text>
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
  cardBg = '#1F1F1F',
  className = '',
}: AspectRatioButtonProps) {
  const ratioLabel = ratio === '4:3' ? '4:3' : '16:9';

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
