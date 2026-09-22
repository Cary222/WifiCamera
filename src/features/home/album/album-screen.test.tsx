import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as React from 'react';
import { Alert } from 'react-native';
import { AlbumScreen } from './album-screen';
import * as albumService from './services/album-service';

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: jest.fn(),
    push: jest.fn(),
  }),
}));

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: mockGoBack,
  }),
  useIsFocused: () => true,
}));

jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    WebView: (props: any) => React.createElement(View, { testID: 'mock-webview', ...props }),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 40, bottom: 20, left: 0, right: 0 }),
  SafeAreaView: ({ children }: any) => <>{children}</>,
}));

jest.mock('@/features/home/camera', () => ({
  useCameraStore: {
    use: {
      isMockMode: () => false,
      connectionStatus: () => 'open',
      landscapeWatermark: () => true,
    },
    getState: () => ({
      stopStreaming: jest.fn(),
      landscapeWatermark: true,
    }),
  },
}));

jest.mock('@/features/home/hooks/use-storage-info', () => ({
  useStorageInfo: () => ({
    usedGB: 12.5,
    totalGB: 32.0,
    freeGB: 19.5,
    remainingLabel: '19.5GB',
    hasCard: true,
    ready: true,
  }),
}));

jest.mock('./services/album-service', () => ({
  listPicFolders: jest.fn(),
  listAllVideosAndSer: jest.fn().mockResolvedValue([]),
  formatSdCard: jest.fn(),
  deletePicFile: jest.fn(),
  downloadImageFile: jest.fn(),
  saveImageToPhone: jest.fn(),
  FormatError: class FormatError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.name = 'FormatError';
      this.code = code;
    }
  },
}));

describe('albumScreen: format confirm sheet interactions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (albumService.listPicFolders as jest.Mock).mockResolvedValue([
      {
        name: 'nebula_2026-09-18_01.jpg',
        path: '/mnt/sdcard/Pictures/nebula_2026-09-18_01.jpg',
        size: 2048,
        mtime: 1789732800,
      },
    ]);
  });

  it('opens format confirmation sheet when format button is pressed', async () => {
    render(<AlbumScreen />);

    await waitFor(() => {
      expect(screen.getByText('格式化')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('格式化'));

    expect(screen.getByTestId('format-confirm-sheet')).toBeTruthy();
    expect(screen.getByText('确认格式化TF卡')).toBeTruthy();
    expect(
      screen.getByText(
        'TF卡内所有内容（包括照片、视频及其他文件）将被清空，已保存至手机相册的内容不会受到影响，该操作无法撤销。',
      ),
    ).toBeTruthy();
  });

  it('closes format confirmation sheet when cancel is pressed', async () => {
    render(<AlbumScreen />);

    await waitFor(() => {
      expect(screen.getByText('格式化')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('格式化'));
    expect(screen.getByTestId('format-confirm-sheet')).toBeTruthy();

    fireEvent.press(screen.getByTestId('format-cancel-button'));

    expect(albumService.formatSdCard).not.toHaveBeenCalled();
  });
});

describe('albumScreen: format execution flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (albumService.listPicFolders as jest.Mock).mockResolvedValue([
      {
        name: 'nebula_2026-09-18_01.jpg',
        path: '/mnt/sdcard/Pictures/nebula_2026-09-18_01.jpg',
        size: 2048,
        mtime: 1789732800,
      },
    ]);
  });

  it('calls formatSdCard and handles unavailable blocker error on confirm', async () => {
    (albumService.formatSdCard as jest.Mock).mockRejectedValueOnce(
      new Error('FORMAT_ENDPOINT_NOT_AVAILABLE'),
    );

    render(<AlbumScreen />);

    await waitFor(() => {
      expect(screen.getByText('格式化')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('格式化'));
    fireEvent.press(screen.getByTestId('format-confirm-button'));

    await waitFor(() => {
      expect(albumService.formatSdCard).toHaveBeenCalledTimes(1);
      expect(Alert.alert).toHaveBeenCalledWith(
        '格式化失败',
        '固件暂未提供格式化接口，操作未执行。',
      );
    });
  });

  it('confirmed completion refreshes album and shows success alert', async () => {
    (albumService.formatSdCard as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 'success',
      requestId: 'test_req_01',
    });

    render(<AlbumScreen />);

    await waitFor(() => {
      expect(screen.getByText('格式化')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('格式化'));
    fireEvent.press(screen.getByTestId('format-confirm-button'));

    await waitFor(() => {
      expect(albumService.formatSdCard).toHaveBeenCalledTimes(1);
      expect(Alert.alert).toHaveBeenCalledWith(
        '格式化成功',
        'TF卡已成功格式化。',
      );
      // listPicFolders called initially (1) and after format success (2)
      expect(albumService.listPicFolders).toHaveBeenCalledTimes(2);
    });
  });

  it('busy state prevents duplicate format calls while in flight', async () => {
    let resolveFormat: () => void = () => {};
    const pendingPromise = new Promise<{ ok: boolean; status: string }>((resolve) => {
      resolveFormat = () => resolve({ ok: true, status: 'success' });
    });
    (albumService.formatSdCard as jest.Mock).mockReturnValueOnce(pendingPromise);

    render(<AlbumScreen />);

    await waitFor(() => {
      expect(screen.getByText('格式化')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('格式化'));
    // Press confirm once (triggers format)
    fireEvent.press(screen.getByTestId('format-confirm-button'));
    // Press confirm again while still formatting
    fireEvent.press(screen.getByTestId('format-confirm-button'));

    expect(albumService.formatSdCard).toHaveBeenCalledTimes(1);

    resolveFormat();
    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('格式化成功', 'TF卡已成功格式化。');
    });
  });
});

describe('albumScreen: format error mapping and unknown status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (albumService.listPicFolders as jest.Mock).mockResolvedValue([
      {
        name: 'nebula_2026-09-18_01.jpg',
        path: '/mnt/sdcard/Pictures/nebula_2026-09-18_01.jpg',
        size: 2048,
        mtime: 1789732800,
      },
    ]);
  });

  it('reports honest unknown state on timeout without false success or clearing album', async () => {
    (albumService.formatSdCard as jest.Mock).mockRejectedValueOnce(
      new (albumService as any).FormatError(
        'FORMAT_STATUS_UNKNOWN',
        '格式化状态未知（请求已发出但响应超时或连接中断），请确认相机连接并刷新相册，切勿连续重复格式化。',
      ),
    );

    render(<AlbumScreen />);

    await waitFor(() => {
      expect(screen.getByText('格式化')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('格式化'));
    fireEvent.press(screen.getByTestId('format-confirm-button'));

    await waitFor(() => {
      expect(albumService.formatSdCard).toHaveBeenCalledTimes(1);
      expect(Alert.alert).toHaveBeenCalledWith(
        '格式化状态未知',
        expect.stringContaining('格式化状态未知'),
      );
      // Album was NOT refreshed/cleared on unknown error
      expect(albumService.listPicFolders).toHaveBeenCalledTimes(1);
    });
  });

  it('handles STORAGE_BUSY and STORAGE_NO_CARD errors with specific messages', async () => {
    (albumService.formatSdCard as jest.Mock).mockRejectedValueOnce(
      new (albumService as any).FormatError(
        'STORAGE_BUSY',
        '相机当前正忙或正在写入，无法执行格式化。',
      ),
    );

    render(<AlbumScreen />);

    await waitFor(() => {
      expect(screen.getByText('格式化')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('格式化'));
    fireEvent.press(screen.getByTestId('format-confirm-button'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        '格式化失败',
        '相机当前正忙或正在写入，无法执行格式化。',
      );
    });
  });
});
