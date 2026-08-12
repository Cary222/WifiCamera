import * as React from 'react';
import { View } from 'react-native';
/**
 * SafeAreaPage — 全局页面包装组件，自动处理顶部安全距离。
 *
 * 使用方式：
 *   <SafeAreaPage>
 *     <YourContent />
 *   </SafeAreaPage>
 *
 * 组件内部通过 `useSafeAreaInsets` 获取设备顶部安全距离，
 * 自动在顶部添加对应高度的 padding，无需手动计算。
 *
 * 底部安全距离由外部根据需要自行处理。
 */
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function SafeAreaPage({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View className={className} style={{ paddingTop: insets.top }}>
      {children}
    </View>
  );
}
