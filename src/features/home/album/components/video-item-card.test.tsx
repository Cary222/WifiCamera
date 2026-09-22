import type { VideoMediaItem } from '../types';
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as React from 'react';
import { Alert } from 'react-native';
import * as albumService from '../services/album-service';
import { VideoItemCard } from './video-item-card';

jest.mock('../services/album-service', () => ({
  downloadSerFile: jest.fn(),
  formatBytes: (b: number) => `${b} B`,
}));

const mockSerItem: VideoMediaItem = {
  id: 'ser-1',
  name: 'planet_jupiter.ser',
  path: '/mnt/sdcard/Videos/planet_jupiter.ser',
  kind: 'ser',
  size: 50000000,
  mtime: 1790056009,
  downloadable: true,
  timestamp: '2026-09-22 13:46:49',
};

const mockNotFinalizedSerItem: VideoMediaItem = {
  ...mockSerItem,
  id: 'ser-unfinalized',
  downloadable: false,
};

const mockMp4Item: VideoMediaItem = {
  id: 'mp4-1',
  name: 'landscape_01.mp4',
  path: '/mnt/sdcard/Videos/landscape_01.mp4',
  kind: 'mp4',
  size: 15000000,
  mtime: 1790056000,
  videoUrl: 'http://camera/get_video?path=landscape_01.mp4',
  timestamp: '2026-09-22 13:46:40',
};

describe('videoItemCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('renders MP4 item with play indicator and triggers onPlayPress when tapped', () => {
    const onPlayPress = jest.fn();
    render(<VideoItemCard item={mockMp4Item} onPlayPress={onPlayPress} />);

    expect(screen.getByText('landscape_01.mp4')).toBeTruthy();
    expect(screen.getByText('MP4')).toBeTruthy();

    fireEvent.press(screen.getByTestId('video-card-mp4-1'));
    expect(onPlayPress).toHaveBeenCalledWith(mockMp4Item);
  });

  it('renders SER item with SER badge and download button', () => {
    render(<VideoItemCard item={mockSerItem} />);

    expect(screen.getByText('planet_jupiter.ser')).toBeTruthy();
    expect(screen.getByText('SER')).toBeTruthy();
    expect(screen.getByText('下载')).toBeTruthy();
  });

  it('shows unfinalized alert when tapping SER with downloadable=false', () => {
    render(<VideoItemCard item={mockNotFinalizedSerItem} />);

    expect(screen.getByText('未收尾')).toBeTruthy();
    fireEvent.press(screen.getByTestId('video-card-ser-unfinalized'));

    expect(Alert.alert).toHaveBeenCalledWith('提示', expect.stringContaining('文件尚未完成或不可用'));
    expect(albumService.downloadSerFile).not.toHaveBeenCalled();
  });
});
