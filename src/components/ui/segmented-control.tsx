import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import type { TxKeyPath } from '@/lib/i18n';
import { useCallback, useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Text } from './text';

export type SegmentedOption<T extends string> = {
  value: T;
  label?: string;
  labelTx?: TxKeyPath;
  disabled?: boolean;
};

export type SegmentedControlProps<T extends string> = {
  options: readonly SegmentedOption<T>[] | SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  variant?: 'neutral-fixed' | 'capsule-lg';
  /** Override the indicator background color. */
  indicatorColor?: string;
  /** Fixed pixel width for each segment. When set, all segments are exactly this wide. */
  segmentPixelWidth?: number;
  className?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  indicatorClassName?: string;
  optionClassName?: string;
  textClassName?: string;
  testID?: string;
};

const INDICATOR_DURATION = 220;

type VariantConfig = {
  rootClass: string;
  trackClass: string;
  optionClass: string;
  textClass: string;
  indicatorClass: string;
};

const VARIANT_CONFIG: Record<NonNullable<SegmentedControlProps<string>['variant']>, VariantConfig> = {
  'neutral-fixed': {
    rootClass: 'flex-row overflow-hidden rounded-lg bg-transparent',
    trackClass: 'flex-1',
    optionClass: 'flex-1 justify-center items-center',
    textClass: 'text-[12px] font-semibold text-white',
    indicatorClass: 'absolute inset-y-1 rounded-md',
  },
  'capsule-lg': {
    rootClass: 'overflow-hidden rounded-full border p-1 px-1.5',
    trackClass: 'px-0',
    optionClass: 'h-[38px] px-6 justify-center items-center',
    textClass: 'text-[14px]',
    indicatorClass: 'absolute inset-y-0 rounded-full',
  },
};

const VARIANT_ACTIVE_TEXT: Record<NonNullable<SegmentedControlProps<string>['variant']>, string> = {
  'neutral-fixed': 'font-semibold text-white',
  'capsule-lg': 'font-bold text-black dark:text-black text-[12px]',
};

const VARIANT_INACTIVE_TEXT: Record<NonNullable<SegmentedControlProps<string>['variant']>, string> = {
  'neutral-fixed': 'font-semibold text-white',
  'capsule-lg': 'font-medium text-white dark:text-white text-[12px]',
};

const VARIANT_INDICATOR_BG: Record<NonNullable<SegmentedControlProps<string>['variant']>, string> = {
  'neutral-fixed': '#C8E732',
  'capsule-lg': '#CBFF3C',
};

const VARIANT_ROOT_HEIGHT: Record<NonNullable<SegmentedControlProps<string>['variant']>, string> = {
  'neutral-fixed': 'h-[35px]',
  'capsule-lg': 'h-12 bg-[#141518]',
};

const VARIANT_PX_WIDTH: Record<NonNullable<SegmentedControlProps<string>['variant']>, number | null> = {
  'neutral-fixed': 186,
  'capsule-lg': null,
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  variant = 'capsule-lg',
  indicatorColor,
  segmentPixelWidth,
  className = '',
  style,
  accessibilityLabel,
  indicatorClassName = '',
  optionClassName = '',
  textClassName = '',
  testID,
}: SegmentedControlProps<T>) {
  const variantConfig = VARIANT_CONFIG[variant];
  const activeIndex = Math.max(0, options.findIndex(option => option.value === value));
  const segmentCount = Math.max(options.length, 1);
  const indicatorPosition = useSharedValue(activeIndex);
  const trackWidth = useSharedValue(0);

  const fixedSegmentWidth = segmentPixelWidth ?? VARIANT_PX_WIDTH[variant];

  useEffect(() => {
    indicatorPosition.value = withTiming(activeIndex, {
      duration: INDICATOR_DURATION,
      easing: Easing.inOut(Easing.quad),
    });
  }, [activeIndex, indicatorPosition]);

  const handleTrackLayout = useCallback((event: LayoutChangeEvent) => {
    // eslint-disable-next-line react-hooks/immutability
    trackWidth.value = event.nativeEvent.layout.width;
  }, [trackWidth]);

  const indicatorStyle = useAnimatedStyle(() => {
    const segmentWidth = fixedSegmentWidth ?? trackWidth.value / segmentCount;
    return {
      transform: [{ translateX: indicatorPosition.value * segmentWidth }],
      width: segmentWidth,
    };
  });

  const resolvedIndicatorBg = indicatorColor ?? VARIANT_INDICATOR_BG[variant];
  const rootClass = `${VARIANT_ROOT_HEIGHT[variant]} ${variantConfig.rootClass} ${className}`.trim();

  if (options.length === 0)
    return null;

  return (
    <View
      className={rootClass}
      style={[
        fixedSegmentWidth ? { width: fixedSegmentWidth * segmentCount } : undefined,
        style,
      ]}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <View onLayout={handleTrackLayout} className={`relative flex-1 flex-row items-center ${variantConfig.trackClass}`}>
        <Animated.View
          pointerEvents="none"
          className={`${variantConfig.indicatorClass} ${indicatorClassName}`.trim()}
          style={[{ backgroundColor: resolvedIndicatorBg }, indicatorStyle]}
        />
        {options.map((option) => {
          const isActive = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => {
                if (!isActive && !option.disabled)
                  onChange(option.value);
              }}
              disabled={option.disabled}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive, disabled: option.disabled }}
              className={`z-10 flex-1 ${variantConfig.optionClass} disabled:opacity-40 ${optionClassName}`}
            >
              <Text
                className={`${variantConfig.textClass} ${isActive ? VARIANT_ACTIVE_TEXT[variant] : VARIANT_INACTIVE_TEXT[variant]} ${textClassName}`}
                tx={option.labelTx}
              >
                {option.labelTx ? undefined : option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
