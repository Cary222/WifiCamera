import type { AppLogEntry } from '@/lib/app-logger';

import { useSyncExternalStore } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { FocusAwareStatusBar, ScreenHeader, Text } from '@/components/ui';
import { appLogger } from '@/lib/app-logger';

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function levelColor(level: AppLogEntry['level']): string {
  switch (level) {
    case 'error': return 'text-red-400';
    case 'warn': return 'text-amber-400';
    case 'info': return 'text-[#C8E733]';
    default: return 'text-sky-400';
  }
}

export default function DiagnosticLogScreen() {
  const entries = useSyncExternalStore(appLogger.subscribe, appLogger.getSnapshot, appLogger.getSnapshot);

  return (
    <>
      <FocusAwareStatusBar />
      <View className="flex-1 bg-white dark:bg-[#090A0C]">
        <ScreenHeader title="开发诊断日志" />
        <View className="flex-row items-center justify-between px-5 pb-3">
          <Text className="text-sm text-neutral-500 dark:text-neutral-400">保留最近 500 条操作与链路记录</Text>
          <Pressable
            onPress={appLogger.clear}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 active:opacity-70 dark:border-neutral-600"
          >
            <Text className="text-xs text-neutral-700 dark:text-white">清空</Text>
          </Pressable>
        </View>
        <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 32 }}>
          {entries.length === 0
            ? <Text className="pt-8 text-center text-sm text-neutral-400">尚无日志</Text>
            : [...entries].reverse().map(entry => (
                <View key={entry.id} className="mb-2 rounded-xl bg-neutral-100 p-3 dark:bg-[#161719]">
                  <View className="flex-row items-center gap-2">
                    <Text className="font-mono text-xs text-neutral-500">{formatTimestamp(entry.timestamp)}</Text>
                    <Text className={`font-mono text-xs font-bold ${levelColor(entry.level)}`}>
                      [
                      {entry.scope}
                      ]
                    </Text>
                    <Text className="font-mono text-xs text-neutral-500">{entry.level.toUpperCase()}</Text>
                  </View>
                  <Text className="mt-1 text-sm text-black dark:text-white">{entry.message}</Text>
                  {entry.details && <Text className="mt-1 font-mono text-xs text-neutral-500 dark:text-neutral-400">{entry.details}</Text>}
                </View>
              ))}
        </ScrollView>
      </View>
    </>
  );
}
