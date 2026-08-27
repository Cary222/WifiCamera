import type { SelectedCelestialObject } from '@/features/stellarium/stellarium-service';

export function formatRa(hours: number): string {
  const normalized = ((hours % 24) + 24) % 24;
  const h = Math.floor(normalized);
  const m = Math.floor((normalized - h) * 60);
  const s = Math.round(((normalized - h) * 60 - m) * 60);
  return `${h}h ${m}m ${s}s`;
}

export function formatDec(deg: number): string {
  const sign = deg >= 0 ? '+' : '-';
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const m = Math.floor((abs - d) * 60);
  const s = Math.round(((abs - d) * 60 - m) * 60);
  return `${sign}${d}° ${m}' ${s}"`;
}

export function formatAzAlt(azDeg?: number | null, altDeg?: number | null): string {
  if (typeof azDeg !== 'number' || typeof altDeg !== 'number') {
    return '地平以下 / 未知';
  }
  const az = ((azDeg % 360) + 360) % 360;
  return `方位 ${az.toFixed(1)}° / 仰角 ${altDeg.toFixed(1)}°`;
}

export function formatDistance(distanceAu?: number | null): string | null {
  if (typeof distanceAu !== 'number' || distanceAu <= 0) {
    return null;
  }
  if (distanceAu < 0.01) {
    // 换算成千米
    const km = Math.round(distanceAu * 149597870.7);
    return `${km.toLocaleString()} km`;
  }
  if (distanceAu > 63241) {
    // 换算成光年 (1 ly ≈ 63241 AU)
    const ly = (distanceAu / 63241).toFixed(1);
    return `${ly} 光年`;
  }
  return `${distanceAu.toFixed(2)} AU`;
}

export type ObjectInfoSheetProps = {
  object: SelectedCelestialObject;
  onCenter: (object: SelectedCelestialObject) => void;
  onClose: () => void;
  onGoto?: (raHours: number, decDeg: number) => void;
  onZoomIn: (object: SelectedCelestialObject) => void;
};
