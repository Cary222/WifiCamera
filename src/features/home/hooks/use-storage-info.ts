import { useEffect, useState } from 'react';
import {
  getDiskUsage,
  getSdCardMountPoint,
  getStorageStatus,
} from '@/features/home/camera/services/file-service';
import { translate } from '@/lib/i18n';

export type DiskInfo = {
  /** Used space in GB, rounded to 0.1. */
  usedGB: number;
  /** Total capacity in GB, rounded to 0.1. */
  totalGB: number;
  /** Free space in GB, rounded to 0.1. */
  freeGB: number;
  /** Pre-formatted remaining label, e.g. "12.3GB"; falls back to "未检测到TF卡" or "—". */
  remainingLabel: string;
  /** Whether a valid TF card is detected and mounted. */
  hasCard: boolean;
  /** Whether the storage is ready for writes. */
  ready: boolean;
  /** Status reason from firmware (e.g. 'OK', 'NO_CARD', 'CARD_NOT_MOUNTED', 'CARD_READ_ONLY', 'CARD_FULL'). */
  reason?: string;
};

const EMPTY_INFO: DiskInfo = {
  usedGB: 0,
  totalGB: 0,
  freeGB: 0,
  remainingLabel: '—',
  hasCard: false,
  ready: false,
};

function formatDiskInfo(params: {
  used: number;
  total: number;
  free: number;
  ready: boolean;
  reason?: string;
}): DiskInfo {
  return {
    usedGB: Math.round(params.used * 10) / 10,
    totalGB: Math.round(params.total * 10) / 10,
    freeGB: Math.round(params.free * 10) / 10,
    remainingLabel: `${(Math.round(params.free * 10) / 10).toFixed(1)}GB`,
    hasCard: true,
    ready: params.ready,
    reason: params.reason,
  };
}

async function queryStorageData(): Promise<DiskInfo> {
  try {
    const status = await getStorageStatus();

    // 1. If firmware supports storage_status, follow exact status contract
    if (status) {
      if (!status.mounted || !status.mount_point || status.reason === 'NO_CARD' || status.reason === 'CARD_NOT_MOUNTED') {
        const label = status.reason === 'CARD_NOT_MOUNTED'
          ? translate('album.storage.card_not_mounted')
          : translate('album.storage.no_card');
        return {
          usedGB: 0,
          totalGB: 0,
          freeGB: 0,
          remainingLabel: label,
          hasCard: false,
          ready: false,
          reason: status.reason || 'NO_CARD',
        };
      }

      if (status.reason === 'CARD_READ_ONLY') {
        try {
          const diskInfo = await getDiskUsage(status.mount_point);
          const free = diskInfo.free ?? Math.max(0, diskInfo.total - diskInfo.used);
          return {
            ...formatDiskInfo({ used: diskInfo.used, total: diskInfo.total, free, ready: false, reason: 'CARD_READ_ONLY' }),
            remainingLabel: translate('album.storage.card_read_only'),
          };
        }
        catch {
          // fall through
        }
      }

      const diskInfo = await getDiskUsage(status.mount_point);
      const free = diskInfo.free ?? Math.max(0, diskInfo.total - diskInfo.used);
      return formatDiskInfo({ used: diskInfo.used, total: diskInfo.total, free, ready: status.ready, reason: status.reason });
    }

    // 2. Legacy firmware fallback
    const sdCard = await getSdCardMountPoint();
    if (!sdCard) {
      return {
        usedGB: 0,
        totalGB: 0,
        freeGB: 0,
        remainingLabel: translate('album.storage.no_card'),
        hasCard: false,
        ready: false,
        reason: 'NO_CARD',
      };
    }

    const diskInfo = await getDiskUsage(sdCard);
    const free = diskInfo.free ?? Math.max(0, diskInfo.total - diskInfo.used);
    return formatDiskInfo({ used: diskInfo.used, total: diskInfo.total, free, ready: true, reason: 'OK' });
  }
  catch {
    return {
      usedGB: 0,
      totalGB: 0,
      freeGB: 0,
      remainingLabel: translate('album.storage.no_card'),
      hasCard: false,
      ready: false,
      reason: 'NO_CARD',
    };
  }
}

export function useStorageInfo(isConnected: boolean, refreshKey?: number): DiskInfo {
  const [info, setInfo] = useState<DiskInfo>(EMPTY_INFO);

  useEffect(() => {
    if (!isConnected)
      return;

    let active = true;

    const fetchStorage = async () => {
      const data = await queryStorageData();
      if (active) {
        setInfo(data);
      }
    };

    void fetchStorage();
    const timer = setInterval(() => {
      void fetchStorage();
    }, 5000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [isConnected, refreshKey]);

  return isConnected ? info : EMPTY_INFO;
}
