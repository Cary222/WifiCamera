/* eslint-disable max-lines-per-function */
import type { AppLogEntry } from '@/lib/app-logger';

import { useState, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { FocusAwareStatusBar, ScreenHeader, Text } from '@/components/ui';
import { appLogger } from '@/lib/app-logger';

type ClipboardModule = {
  setStringAsync: (text: string) => Promise<boolean>;
};

type SharingModule = {
  isAvailableAsync: () => Promise<boolean>;
  shareAsync: (
    url: string,
    options?: { dialogTitle?: string; mimeType?: string; UTI?: string },
  ) => Promise<void>;
};

function getClipboard(): ClipboardModule | null {
  try {
    return require('expo-clipboard');
  }
  catch {
    return null;
  }
}

function getSharing(): SharingModule | null {
  try {
    return require('expo-sharing');
  }
  catch {
    return null;
  }
}

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
    case 'error':
      return 'text-red-400';
    case 'warn':
      return 'text-amber-400';
    case 'info':
      return 'text-[#C8E733]';
    default:
      return 'text-sky-400';
  }
}

export default function DiagnosticLogScreen() {
  const entries = useSyncExternalStore(
    appLogger.subscribe,
    appLogger.getSnapshot,
    appLogger.getSnapshot,
  );
  const [feedback, setFeedback] = useState<string>();
  const [isExporting, setIsExporting] = useState(false);

  const copyLogs = async () => {
    try {
      const Clipboard = getClipboard();
      if (!Clipboard) {
        setFeedback('当前环境不支持剪贴板');
        return;
      }
      await Clipboard.setStringAsync(appLogger.getExportText());
      setFeedback('日志已复制');
    }
    catch (error) {
      appLogger.error('DIAGNOSTIC', '复制诊断日志失败', error);
      setFeedback('复制失败，请重试');
    }
  };

  const shareLogs = async () => {
    setIsExporting(true);
    try {
      const Sharing = getSharing();
      if (!Sharing || !(await Sharing.isAvailableAsync())) {
        setFeedback('当前设备不支持系统分享');
        return;
      }
      const uri = await appLogger.createExportFile();
      await Sharing.shareAsync(uri, {
        dialogTitle: '导出诊断日志',
        mimeType: 'text/plain',
        UTI: 'public.plain-text',
      });
      setFeedback('已打开系统分享面板');
    }
    catch (error) {
      appLogger.error('DIAGNOSTIC', '导出诊断日志失败', error);
      setFeedback('导出失败，请重试');
    }
    finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <FocusAwareStatusBar />
      <View className="flex-1 bg-white dark:bg-[#090A0C]">
        <ScreenHeader title="开发诊断日志" />
        <View className="px-5 pb-3">
          <Text className="text-sm text-neutral-500 dark:text-neutral-400">
            保留最近 500 条操作与链路记录，错误日志会安全轮转保存
          </Text>
          <View className="mt-3 flex-row gap-2">
            <Pressable
              testID="diagnostic-copy-button"
              accessibilityRole="button"
              accessibilityLabel="复制诊断日志"
              onPress={copyLogs}
              className="rounded-lg border border-neutral-300 px-3 py-2 active:opacity-70 dark:border-neutral-600"
            >
              <Text className="text-xs text-neutral-700 dark:text-white">
                复制日志
              </Text>
            </Pressable>
            <Pressable
              testID="diagnostic-share-button"
              accessibilityRole="button"
              accessibilityLabel="导出分享诊断日志"
              disabled={isExporting}
              onPress={shareLogs}
              className="rounded-lg bg-[#C8E733] px-3 py-2 active:opacity-70 disabled:opacity-50"
            >
              <Text className="text-xs font-medium text-black">
                {isExporting ? '导出中…' : '导出分享'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="清空诊断日志"
              onPress={() => {
                appLogger.clear();
                setFeedback('日志已清空');
              }}
              className="rounded-lg border border-neutral-300 px-3 py-2 active:opacity-70 dark:border-neutral-600"
            >
              <Text className="text-xs text-neutral-700 dark:text-white">
                清空
              </Text>
            </Pressable>
          </View>
          {feedback && (
            <Text className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
              {feedback}
            </Text>
          )}
        </View>
        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: 32 }}
        >
          {entries.length === 0
            ? (
                <Text className="pt-8 text-center text-sm text-neutral-400">
                  尚无日志
                </Text>
              )
            : (
                [...entries].reverse().map(entry => (
                  <View
                    key={entry.id}
                    className="mb-2 rounded-xl bg-neutral-100 p-3 dark:bg-[#161719]"
                  >
                    <View className="flex-row items-center gap-2">
                      <Text className="font-mono text-xs text-neutral-500">
                        {formatTimestamp(entry.timestamp)}
                      </Text>
                      <Text
                        className={`font-mono text-xs font-bold ${levelColor(entry.level)}`}
                      >
                        [
                        {entry.scope}
                        ]
                      </Text>
                      <Text className="font-mono text-xs text-neutral-500">
                        {entry.level.toUpperCase()}
                      </Text>
                    </View>
                    <Text className="mt-1 text-sm text-black dark:text-white">
                      {entry.message}
                    </Text>
                    {entry.details && (
                      <Text className="mt-1 font-mono text-xs text-neutral-500 dark:text-neutral-400">
                        {entry.details}
                      </Text>
                    )}
                  </View>
                ))
              )}
        </ScrollView>
      </View>
    </>
  );
}
