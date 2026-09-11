import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { Alert } from 'react-native';

import SettingsScreen from './settings-screen';

const mockGetUpdate = jest.fn();
const mockDownload = jest.fn();
const mockInstall = jest.fn();
const mockShowConnection = jest.fn();
const mockPresent = jest.fn();
let mockSerial: { SN: string; hardware: string } | null = {
  SN: 'SN123',
  hardware: 'camera-pro',
};

jest.mock('env', () => ({ EXPO_PUBLIC_VERSION: '1.2.0' }), { virtual: true });
jest.mock('expo-updates', () => ({ isEnabled: false }));
jest.mock('uniwind', () => ({ useUniwind: () => ({ theme: 'dark' }) }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 20, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/lib/i18n', () => ({
  translate: (key: string, params?: { version?: string }) => {
    const zh = require('@/translations/zh.json');
    const text = key
      .split('.')
      .reduce((value: any, part: string) => value[part], zh);
    return params?.version ? text.replace('{{version}}', params.version) : text;
  },
  useSelectedLanguage: () => ({ language: 'zh', setLanguage: jest.fn() }),
}));
jest.mock('@/lib/hooks/use-selected-theme', () => ({
  useSelectedTheme: () => ({
    selectedTheme: 'dark',
    setSelectedTheme: jest.fn(),
  }),
}));
jest.mock('@/components/ui', () => {
  const React = require('react');
  const RN = require('react-native');
  const { translate } = require('@/lib/i18n');
  return {
    View: RN.View,
    Pressable: RN.Pressable,
    ScrollView: RN.ScrollView,
    Text: ({ tx, children, ...props }: any) => (
      <RN.Text {...props}>{tx ? translate(tx) : children}</RN.Text>
    ),
    FocusAwareStatusBar: () => null,
    useModal: () => ({
      ref: React.useRef(null),
      present: mockPresent,
      dismiss: jest.fn(),
    }),
    Options: () => null,
  };
});
jest.mock('@/components/ui/icons', () => ({ ArrowRight: () => null }));
jest.mock('@gorhom/bottom-sheet', () => ({
  BottomSheetBackdrop: () => null,
  BottomSheetModal: ({ children }: any) => children,
  BottomSheetScrollView: ({ children }: any) => children,
  BottomSheetView: ({ children }: any) => children,
}));
jest.mock('@/features/home/camera/camera-store', () => ({
  useCameraStore: {
    use: {
      serial: () => mockSerial,
      version: () => ({ server: '1.0.8' }),
      connectionStatus: () => 'closed',
      powerLevel: () => null,
      setShowConnectionModal: () => mockShowConnection,
    },
  },
}));
jest.mock('./services/ota-service', () => ({
  getFirmwareUpdate: (...args: unknown[]) => mockGetUpdate(...args),
  downloadFirmwarePackage: (...args: unknown[]) => mockDownload(...args),
  installFirmwarePackage: (...args: unknown[]) => mockInstall(...args),
  formatFirmwareVersion: (v: string) =>
    `V${v.replace(/^(?:WifiCamera\.)?v?/i, '')}`,
}));

function showSettings() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <SettingsScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSerial = { SN: 'SN123', hardware: 'camera-pro' };
  mockGetUpdate
    .mockReset()
    .mockResolvedValue({ version: '1.1.8', file_name: 'camera.tar' });
  mockDownload.mockReset().mockResolvedValue('file:///camera.tar');
  mockInstall.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

it('renders the design groups and opens the shared connection modal without changing frequency', async () => {
  showSettings();
  expect(screen.getByText('拍摄模式')).toBeTruthy();
  expect(screen.getByText('设备信息')).toBeTruthy();
  expect(screen.getByText('常用设置')).toBeTruthy();
  expect(screen.getByText('语言')).toBeTruthy();
  expect(screen.getByText('主题')).toBeTruthy();
  expect(screen.getByText('隐私声明')).toBeTruthy();
  expect(screen.queryByText('Wi-Fi 设置')).toBeNull();
  fireEvent.press(screen.getByText('连接设置'));
  expect(mockShowConnection).toHaveBeenCalledWith(true);
  expect(mockDownload).not.toHaveBeenCalled();
  await screen.findByText('立即更新');
});

it('shows version transition and opens download dialog on 立即更新', async () => {
  showSettings();
  expect(await screen.findByText('立即更新')).toBeTruthy();
  expect(screen.getByText('V 1.0.8')).toBeTruthy();
  expect(screen.getByText('→')).toBeTruthy();
  expect(screen.getByText('V 1.1.8')).toBeTruthy();
  fireEvent.press(screen.getByText('立即更新'));
  expect(
    await screen.findByText('检测到设备有最新固件版本 V1.1.8，是否立即下载'),
  ).toBeTruthy();
  fireEvent.press(screen.getByText('取消'));
  expect(mockDownload).not.toHaveBeenCalled();
});

it('downloads and proceeds to update completion flow', async () => {
  showSettings();
  fireEvent.press(await screen.findByText('立即更新'));
  fireEvent.press(screen.getByText('立即下载'));
  expect(await screen.findByText('固件下载完成，是否立即更新')).toBeTruthy();
  expect(mockDownload).toHaveBeenCalledTimes(1);
  const updateButtons = screen.getAllByText('立即更新');
  fireEvent.press(updateButtons[updateButtons.length - 1]);
  expect(
    await screen.findByText('当前设备已经更新到最新固件版本'),
  ).toBeTruthy();
  expect(mockInstall).toHaveBeenCalledTimes(1);
});

it('shows 检查更新 and already latest dialog when device is up to date', async () => {
  mockGetUpdate.mockResolvedValue(null);
  showSettings();
  await waitFor(() => expect(screen.getAllByText('检查更新')).toHaveLength(3));
  expect(screen.getByText('V 1.0.8')).toBeTruthy();
  expect(screen.queryByText('→')).toBeNull();
  fireEvent.press(screen.getByText('设备固件'));
  expect(
    await screen.findByText('检测到设备当前已经是最新的版本'),
  ).toBeTruthy();
  fireEvent.press(screen.getByText('确认'));
});

it('handles check failure gracefully and shows already latest dialog', async () => {
  mockGetUpdate.mockRejectedValue(new Error('network'));
  showSettings();
  await waitFor(() => expect(screen.getAllByText('检查更新')).toHaveLength(3));
  fireEvent.press(screen.getByText('设备固件'));
  expect(
    await screen.findByText('检测到设备当前已经是最新的版本'),
  ).toBeTruthy();
});

it('requires device information and does not query a placeholder device', () => {
  mockSerial = null;
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  showSettings();
  fireEvent.press(screen.getByText('设备固件'));
  expect(alert).toHaveBeenCalledWith(
    '无设备信息',
    '未找到设备信息，请先连接相机。',
  );
  expect(mockGetUpdate).not.toHaveBeenCalled();
  alert.mockRestore();
});
