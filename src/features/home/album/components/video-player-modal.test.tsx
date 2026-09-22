import type { VideoMediaItem } from '../types';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Sharing from 'expo-sharing';
import * as React from 'react';
import { Alert } from 'react-native';
import * as albumService from '../services/album-service';
import { VideoPlayerModal } from './video-player-modal';

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 40, bottom: 20, left: 0, right: 0 }),
}));

jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    WebView: (props: any) => React.createElement(View, { testID: 'mock-video-webview', ...props }),
  };
});

jest.mock('../services/album-service', () => ({
  downloadImageFile: jest.fn(),
  saveVideoToPhone: jest.fn(),
}));

const mockMp4Item: VideoMediaItem = {
  id: 'mp4-1',
  name: 'landscape_video.mp4',
  path: '/mnt/sdcard/Videos/landscape_video.mp4',
  kind: 'mp4',
  size: 25000000,
  mtime: 1790056000,
  videoUrl: 'http://camera/get_video?path=landscape_video.mp4',
  timestamp: '2026-09-22 13:46:40',
};

describe('videoPlayerModal', () => {
  const onClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('renders video player modal with back button, filename and webview player', () => {
    render(<VideoPlayerModal item={mockMp4Item} onClose={onClose} />);

    expect(screen.getByText('landscape_video.mp4')).toBeTruthy();
    expect(screen.getByTestId('video-viewer-back-button')).toBeTruthy();
    expect(screen.getByTestId('video-webview-player')).toBeTruthy();
    expect(screen.getByTestId('video-download-button')).toBeTruthy();
    expect(screen.getByTestId('video-share-button')).toBeTruthy();

    fireEvent.press(screen.getByTestId('video-viewer-back-button'));
    expect(onClose).toHaveBeenCalled();
  });

  it('triggers saveVideoToPhone when save button is pressed', async () => {
    (albumService.saveVideoToPhone as jest.Mock).mockResolvedValueOnce('file:///saved.mp4');

    render(<VideoPlayerModal item={mockMp4Item} onClose={onClose} />);
    fireEvent.press(screen.getByTestId('video-download-button'));

    await waitFor(() => {
      expect(albumService.saveVideoToPhone).toHaveBeenCalledWith({
        videoUrl: mockMp4Item.videoUrl,
        path: mockMp4Item.path,
      });
    });
  });

  it('triggers Sharing.shareAsync when share button is pressed and sharing is available', async () => {
    (albumService.downloadImageFile as jest.Mock).mockResolvedValueOnce('file:///cached.mp4');
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValueOnce(true);
    (Sharing.shareAsync as jest.Mock).mockResolvedValueOnce(undefined);

    render(<VideoPlayerModal item={mockMp4Item} onClose={onClose} />);
    fireEvent.press(screen.getByTestId('video-share-button'));

    await waitFor(() => {
      expect(albumService.downloadImageFile).toHaveBeenCalled();
    });
  });
});
