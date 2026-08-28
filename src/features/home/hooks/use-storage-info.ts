import { useEffect, useState } from 'react';
import { getDiskUsage, getSdCardMountPoint } from '@/features/home/camera/services/file-service';

export type DiskInfo = {
  /** Used space in GB, rounded to 0.1. */
  usedGB: number;
  /** Total capacity in GB, rounded to 0.1. */
  totalGB: number;
  /** Free space in GB, rounded to 0.1. */
  freeGB: number;
  /** Pre-formatted remaining label, e.g. "12.3GB"; falls back to "—" when unknown. */
  remainingLabel: string;
};

const EMPTY_INFO: DiskInfo = {
  usedGB: 0,
  totalGB: 0,
  freeGB: 0,
  remainingLabel: '—',
};

/**
 * Fetches the camera's SD card disk usage via the `/FileCopy/get_disk_usage/`
 * HTTP API. Shared by:
 *   - Home screen's "Storage" card (shows remaining space)
 *   - Album screen's "TF card" row (shows used / total with a progress bar)
 *
 * Behaviour:
 *   - Skips the fetch when the camera is not connected.
 *   - Falls back to an unmounted-point query if the SD card lookup fails.
 *   - Returns placeholder values (`—`) until the request resolves.
 */
export function useStorageInfo(isConnected: boolean): DiskInfo {
  const [info, setInfo] = useState<DiskInfo>(EMPTY_INFO);

  useEffect(() => {
    if (!isConnected)
      return;

    let active = true;

    const format = (used: number, total: number, free: number): DiskInfo => ({
      usedGB: Math.round(used * 10) / 10,
      totalGB: Math.round(total * 10) / 10,
      freeGB: Math.round(free * 10) / 10,
      remainingLabel: `${(Math.round(free * 10) / 10).toFixed(1)}GB`,
    });

    void (async () => {
      if (!active)
        return;
      try {
        const sdCard = await getSdCardMountPoint();
        const diskInfo = await getDiskUsage(sdCard ?? undefined);
        if (!active)
          return;
        const free = diskInfo.free ?? Math.max(0, diskInfo.total - diskInfo.used);
        setInfo(format(diskInfo.used, diskInfo.total, free));
      }
      catch {
        if (!active)
          return;
        try {
          const diskInfo = await getDiskUsage();
          if (!active)
            return;
          const free = diskInfo.free ?? Math.max(0, diskInfo.total - diskInfo.used);
          setInfo(format(diskInfo.used, diskInfo.total, free));
        }
        catch {
          // Silent failure: keep the last known value (or placeholder).
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [isConnected]);

  return info;
}
