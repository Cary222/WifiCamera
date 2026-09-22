import type { PhotoItem } from '../types';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Sharing from 'expo-sharing';
import * as React from 'react';
import { Alert } from 'react-native';
import * as albumService from '../services/album-service';
import { ImageViewer } from './image-viewer';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 40, bottom: 20, left: 0, right: 0 }),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

jest.mock('../services/album-service', () => ({
  deletePicFile: jest.fn(),
  downloadImageFile: jest.fn(),
  saveImageToPhone: jest.fn(),
}));

const mockItem: PhotoItem = {
  id: 'photo-1',
  target: '星云拍摄',
  exposure: '30s',
  gain: 'G130',
  timestamp: '2026-09-18 12:00:00',
  path: '/mnt/sdcard/Pictures/nebula_01.jpg',
  previewUrl: 'http://192.168.1.1:8999/get_image?path=%2Fmnt%2Fsdcard%2FPictures%2Fnebula_01.jpg',
};

describe('imageViewer rendering', () => {
  const onClose = jest.fn();
  const onDeleted = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('renders top bar with back button, target name and timestamp', () => {
    render(
      <ImageViewer
        item={mockItem}
        onClose={onClose}
        onDeleted={onDeleted}
      />,
    );

    expect(screen.getByTestId('viewer-top-bar')).toBeTruthy();
    expect(screen.getByTestId('viewer-back-button')).toBeTruthy();
    expect(screen.getByTestId('viewer-target')).toBeTruthy();
    expect(screen.getByText('星云拍摄')).toBeTruthy();
    expect(screen.getByTestId('viewer-timestamp')).toBeTruthy();
    expect(screen.getByText('2026-09-18 12:00:00')).toBeTruthy();
  });

  it('renders bottom toolbar with download, delete and share buttons', () => {
    render(
      <ImageViewer
        item={mockItem}
        onClose={onClose}
        onDeleted={onDeleted}
      />,
    );

    expect(screen.getByTestId('viewer-bottom-toolbar')).toBeTruthy();
    expect(screen.getByTestId('viewer-download-button')).toBeTruthy();
    expect(screen.getByTestId('viewer-delete-button')).toBeTruthy();
    expect(screen.getByTestId('viewer-share-button')).toBeTruthy();
  });

  it('calls onClose when back button is pressed', () => {
    render(
      <ImageViewer
        item={mockItem}
        onClose={onClose}
        onDeleted={onDeleted}
      />,
    );

    fireEvent.press(screen.getByTestId('viewer-back-button'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders watermark at bottom of preview when image is loaded', () => {
    render(
      <ImageViewer
        item={mockItem}
        onClose={onClose}
        onDeleted={onDeleted}
      />,
    );

    expect(screen.queryByTestId('viewer-watermark')).toBeFalsy();
    const image = screen.getByText('正在加载原图…');
    expect(image).toBeTruthy();

    const expoImage = screen.UNSAFE_getByType(require('expo-image').Image);
    fireEvent(expoImage, 'loadEnd');

    expect(screen.getByTestId('viewer-watermark')).toBeTruthy();
  });
});

describe('imageViewer actions', () => {
  const onClose = jest.fn();
  const onDeleted = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('prompts delete confirmation and cancels when cancel is chosen', () => {
    render(
      <ImageViewer
        item={mockItem}
        onClose={onClose}
        onDeleted={onDeleted}
      />,
    );

    fireEvent.press(screen.getByTestId('viewer-delete-button'));

    expect(Alert.alert).toHaveBeenCalledWith(
      '确认删除照片',
      '删除后该照片将从TF卡中永久移除，无法恢复。',
      expect.any(Array),
    );

    expect(albumService.deletePicFile).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('executes delete, closes viewer and notifies onDeleted on confirmation', async () => {
    (albumService.deletePicFile as jest.Mock).mockResolvedValueOnce(undefined);

    render(
      <ImageViewer
        item={mockItem}
        onClose={onClose}
        onDeleted={onDeleted}
      />,
    );

    fireEvent.press(screen.getByTestId('viewer-delete-button'));

    const alertCalls = (Alert.alert as jest.Mock).mock.calls;
    const buttons = alertCalls[0][2];
    const confirmButton = buttons.find((b: { style?: string }) => b.style === 'destructive');

    await act(async () => {
      await confirmButton.onPress();
    });

    expect(albumService.deletePicFile).toHaveBeenCalledWith(mockItem.path);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onDeleted).toHaveBeenCalledWith(mockItem);
  });

  it('handles save to phone and triggers saveImageToPhone', async () => {
    (albumService.saveImageToPhone as jest.Mock).mockResolvedValueOnce('file:///saved.jpg');

    render(
      <ImageViewer
        item={mockItem}
        onClose={onClose}
        onDeleted={onDeleted}
      />,
    );

    fireEvent.press(screen.getByTestId('viewer-download-button'));

    await waitFor(() => {
      expect(albumService.saveImageToPhone).toHaveBeenCalledWith({
        previewUrl: mockItem.previewUrl,
        path: mockItem.path,
        watermark: true,
      });
    });
  });

  it('handles share action when sharing is available', async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValueOnce(true);
    (albumService.downloadImageFile as jest.Mock).mockResolvedValueOnce('file:///cached.jpg');
    (Sharing.shareAsync as jest.Mock).mockResolvedValueOnce(undefined);

    render(
      <ImageViewer
        item={mockItem}
        onClose={onClose}
        onDeleted={onDeleted}
      />,
    );

    fireEvent.press(screen.getByTestId('viewer-share-button'));

    await waitFor(() => {
      expect(Sharing.isAvailableAsync).toHaveBeenCalled();
      expect(albumService.downloadImageFile).toHaveBeenCalledWith({
        previewUrl: mockItem.previewUrl,
        path: mockItem.path,
      });
      expect(Sharing.shareAsync).toHaveBeenCalledWith(
        'file:///cached.jpg',
        expect.objectContaining({ dialogTitle: '星云拍摄' }),
      );
    });
  });
});
