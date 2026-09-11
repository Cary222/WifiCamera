import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useUniwind } from 'uniwind';
import { Text } from '@/components/ui';
import { ChevronDownIcon, ChevronLeftIcon, ChevronUpIcon } from '../landscape/landscape-icons';

const PILL_BG = 'rgba(34,42,54,0.72)';

export function CameraBackButton({ onBack, isDark = true }: { onBack: () => void; isDark?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPress={onBack}
      style={{ backgroundColor: isDark ? PILL_BG : 'rgba(0, 0, 0, 0.06)' }}
      className="size-9 items-center justify-center rounded-full active:opacity-70"
    >
      <ChevronLeftIcon size={20} color={isDark ? '#FFF' : '#000'} />
    </Pressable>
  );
}

type CameraTopBarProps = {
  title: string;
  onBack: () => void;
  onTitlePress: () => void;
  expanded: boolean;
  disabled?: boolean;
  rightContent?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function CameraTopBar({
  title,
  onBack,
  onTitlePress,
  expanded,
  disabled = false,
  rightContent,
  style,
  isDark: explicitIsDark,
}: CameraTopBarProps & { isDark?: boolean }) {
  const { theme } = useUniwind();
  const isDark = explicitIsDark ?? (theme === 'dark');

  return (
    <Animated.View className="absolute inset-x-0 flex-row items-center px-4" style={[style, { zIndex: 10, elevation: 10 }]}>
      <View className="size-9">
        <CameraBackButton isDark={isDark} onBack={onBack} />
      </View>

      <View pointerEvents="box-none" className="absolute inset-x-0 items-center">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={title}
          onPress={onTitlePress}
          disabled={disabled}
          style={{ backgroundColor: isDark ? PILL_BG : 'rgba(0, 0, 0, 0.08)' }}
          className="h-8 flex-row items-center gap-1.5 rounded-full px-3.5 active:opacity-70 disabled:opacity-40"
        >
          <Text className={`text-[12px] font-medium ${isDark ? 'text-white' : 'text-black'}`}>{title}</Text>
          {expanded ? <ChevronDownIcon color={isDark ? '#FFF' : '#000'} size={14} /> : <ChevronUpIcon color={isDark ? '#FFF' : '#000'} size={14} />}
        </Pressable>
      </View>

      <View className="ml-auto items-end justify-center">
        {rightContent}
      </View>
    </Animated.View>
  );
}
