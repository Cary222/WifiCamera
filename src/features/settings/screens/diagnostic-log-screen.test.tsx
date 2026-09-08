/* eslint-disable react/no-unnecessary-use-prefix */
import { cleanup, screen, setup } from '@/lib/test-utils';

const mockSetStringAsync = jest.fn(async () => undefined);
const mockIsAvailableAsync = jest.fn(async () => true);
const mockShareAsync = jest.fn(async () => undefined);
const mockCreateExportFile = jest.fn(async () => 'file:///cache/wificamera-diagnostic.log');
const mockGetExportText = jest.fn(() => '2026-09-04T10:00:00.000Z ERROR [WS] 连接失败');
const mockClear = jest.fn();
const mockLogError = jest.fn();
const mockEntries = [{
  id: 1,
  timestamp: Date.parse('2026-09-04T10:00:00.000Z'),
  level: 'error' as const,
  scope: 'WS',
  message: '连接失败',
}];

jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  return {
    ...actual,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});
jest.mock('expo-clipboard', () => ({ setStringAsync: mockSetStringAsync }));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: mockIsAvailableAsync,
  shareAsync: mockShareAsync,
}));
jest.mock('@/lib/app-logger', () => ({
  appLogger: {
    subscribe: () => () => undefined,
    getSnapshot: () => mockEntries,
    clear: mockClear,
    error: mockLogError,
    getExportText: mockGetExportText,
    createExportFile: mockCreateExportFile,
  },
}));

const DiagnosticLogScreen = require('./diagnostic-log-screen').default;

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

describe('diagnostic log screen', () => {
  it('copies formatted diagnostics to the clipboard', async () => {
    const { user } = setup(<DiagnosticLogScreen />);

    await user.press(screen.getByTestId('diagnostic-copy-button'));

    expect(mockGetExportText).toHaveBeenCalledTimes(1);
    expect(mockSetStringAsync).toHaveBeenCalledWith('2026-09-04T10:00:00.000Z ERROR [WS] 连接失败');
    expect(screen.getByText('日志已复制')).toBeOnTheScreen();
  });

  it('creates and shares the diagnostic log file', async () => {
    const { user } = setup(<DiagnosticLogScreen />);

    await user.press(screen.getByTestId('diagnostic-share-button'));

    expect(mockCreateExportFile).toHaveBeenCalledTimes(1);
    expect(mockShareAsync).toHaveBeenCalledWith('file:///cache/wificamera-diagnostic.log', {
      dialogTitle: '导出诊断日志',
      mimeType: 'text/plain',
      UTI: 'public.plain-text',
    });
    expect(screen.getByText('已打开系统分享面板')).toBeOnTheScreen();
  });
});
