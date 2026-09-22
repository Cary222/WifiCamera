import { renderHook, waitFor } from '@testing-library/react-native';
import {
  getDiskUsage,
  getStorageStatus,
} from '@/features/home/camera/services/file-service';
import { useStorageInfo } from './use-storage-info';

jest.mock('@/features/home/camera/services/file-service', () => ({
  getDiskUsage: jest.fn(),
  getSdCardMountPoint: jest.fn(),
  getStorageStatus: jest.fn(),
}));

describe('useStorageInfo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns placeholder when not connected', () => {
    const { result } = renderHook(() => useStorageInfo(false));
    expect(result.current).toEqual({
      usedGB: 0,
      totalGB: 0,
      freeGB: 0,
      remainingLabel: '—',
      hasCard: false,
      ready: false,
    });
    expect(getStorageStatus).not.toHaveBeenCalled();
    expect(getDiskUsage).not.toHaveBeenCalled();
  });

  it('handles NO_CARD without calling unparameterized getDiskUsage and shows no card label', async () => {
    (getStorageStatus as jest.Mock).mockResolvedValueOnce({
      mounted: false,
      ready: false,
      reason: 'NO_CARD',
      mount_point: null,
    });

    const { result } = renderHook(() => useStorageInfo(true));

    await waitFor(() => {
      expect(result.current.hasCard).toBe(false);
      expect(result.current.ready).toBe(false);
      expect(result.current.remainingLabel).toBe('未检测到TF卡');
      expect(result.current.totalGB).toBe(0);
    });

    expect(getDiskUsage).not.toHaveBeenCalled();
  });

  it('handles CARD_READ_ONLY status with read-only label and non-ready state', async () => {
    (getStorageStatus as jest.Mock).mockResolvedValueOnce({
      mounted: true,
      ready: false,
      reason: 'CARD_READ_ONLY',
      mount_point: '/mnt/sdcard',
    });
    (getDiskUsage as jest.Mock).mockResolvedValueOnce({
      used: 10.0,
      total: 32.0,
      free: 22.0,
    });

    const { result } = renderHook(() => useStorageInfo(true));

    await waitFor(() => {
      expect(result.current.hasCard).toBe(true);
      expect(result.current.ready).toBe(false);
      expect(result.current.remainingLabel).toBe('TF卡只读，无法保存');
      expect(result.current.totalGB).toBe(32.0);
    });

    expect(getDiskUsage).toHaveBeenCalledWith('/mnt/sdcard');
  });

  it('updates capacity and remaining space for healthy mounted TF card', async () => {
    (getStorageStatus as jest.Mock).mockResolvedValueOnce({
      mounted: true,
      ready: true,
      reason: 'OK',
      mount_point: '/mnt/sdcard',
    });
    (getDiskUsage as jest.Mock).mockResolvedValueOnce({
      used: 3.12,
      total: 32.0,
      free: 28.88,
    });

    const { result } = renderHook(() => useStorageInfo(true));

    await waitFor(() => {
      expect(result.current.hasCard).toBe(true);
      expect(result.current.ready).toBe(true);
      expect(result.current.totalGB).toBe(32);
      expect(result.current.freeGB).toBe(28.9);
      expect(result.current.remainingLabel).toBe('28.9GB');
    });

    expect(getDiskUsage).toHaveBeenCalledWith('/mnt/sdcard');
  });

  it('clears capacity immediately on error instead of retaining stale capacity', async () => {
    (getStorageStatus as jest.Mock).mockRejectedValueOnce(new Error('Network disconnected'));

    const { result } = renderHook(() => useStorageInfo(true));

    await waitFor(() => {
      expect(result.current.hasCard).toBe(false);
      expect(result.current.ready).toBe(false);
      expect(result.current.totalGB).toBe(0);
      expect(result.current.remainingLabel).toBe('未检测到TF卡');
    });

    expect(getDiskUsage).not.toHaveBeenCalled();
  });
});
