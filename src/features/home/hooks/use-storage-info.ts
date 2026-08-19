import { useEffect, useState } from 'react';
import { getDiskUsage, getSdCardMountPoint } from '@/features/home/camera/services/file-service';

export function useStorageInfo(isConnected: boolean) {
  const [storageRemaining, setStorageRemaining] = useState<string>('—');

  useEffect(() => {
    if (!isConnected)
      return;

    let active = true;

    void (async () => {
      if (!active)
        return;
      try {
        const sdCard = await getSdCardMountPoint();
        const diskInfo = await getDiskUsage(sdCard ?? undefined);
        if (!active)
          return;
        const remaining = diskInfo.free ?? Math.max(0, diskInfo.total - diskInfo.used);
        setStorageRemaining(`${remaining.toFixed(1)}GB`);
      }
      catch {
        if (!active)
          return;
        try {
          const diskInfo = await getDiskUsage();
          if (!active)
            return;
          const remaining = diskInfo.free ?? Math.max(0, diskInfo.total - diskInfo.used);
          setStorageRemaining(`${remaining.toFixed(1)}GB`);
        }
        catch {
          if (active)
            setStorageRemaining('—');
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [isConnected]);

  return storageRemaining;
}
