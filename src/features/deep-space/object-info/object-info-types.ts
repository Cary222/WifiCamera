import type { SelectedCelestialObject } from '@/features/stellarium/stellarium-service';

export function formatRa(hours: number): string {
  const normalized = ((hours % 24) + 24) % 24;
  const h = Math.floor(normalized);
  const m = Math.floor((normalized - h) * 60);
  const s = Math.round(((normalized - h) * 60 - m) * 60);
  return `${h}h ${m}m ${s}s`;
}

export function formatRaPrecision(hours: number): string {
  const normalized = ((hours % 24) + 24) % 24;
  const h = String(Math.floor(normalized)).padStart(2, '0');
  const totalM = (normalized - Math.floor(normalized)) * 60;
  const m = String(Math.floor(totalM)).padStart(2, '0');
  const s = ((totalM - Math.floor(totalM)) * 60).toFixed(1).padStart(4, '0');
  return `${h}h  ${m}m  ${s}s`;
}

export function formatDec(deg: number): string {
  const sign = deg >= 0 ? '+' : '-';
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const m = Math.floor((abs - d) * 60);
  const s = Math.round(((abs - d) * 60 - m) * 60);
  return `${sign}${d}° ${m}' ${s}"`;
}

export function formatDecPrecision(deg: number): string {
  const sign = deg >= 0 ? '+' : '-';
  const abs = Math.abs(deg);
  const d = String(Math.floor(abs)).padStart(2, '0');
  const totalM = (abs - Math.floor(abs)) * 60;
  const m = String(Math.floor(totalM)).padStart(2, '0');
  const s = ((totalM - Math.floor(totalM)) * 60).toFixed(1).padStart(4, '0');
  return `${sign}${d}°  ${m}'  ${s}"`;
}

export function formatHourAngle(hours?: number | null): string {
  if (typeof hours !== 'number') {
    return '--';
  }
  const normalized = ((hours % 24) + 24) % 24;
  const h = String(Math.floor(normalized)).padStart(2, '0');
  const totalM = (normalized - Math.floor(normalized)) * 60;
  const m = String(Math.floor(totalM)).padStart(2, '0');
  const s = ((totalM - Math.floor(totalM)) * 60).toFixed(1).padStart(4, '0');
  return `${h}h  ${m}m  ${s}s`;
}

export function formatAzPrecision(azDeg?: number | null): string {
  if (typeof azDeg !== 'number') {
    return '--';
  }
  const az = ((azDeg % 360) + 360) % 360;
  const d = String(Math.floor(az)).padStart(3, '0');
  const totalM = (az - Math.floor(az)) * 60;
  const m = String(Math.floor(totalM)).padStart(2, '0');
  const s = ((totalM - Math.floor(totalM)) * 60).toFixed(1).padStart(4, '0');
  return `${d}°  ${m}'  ${s}"`;
}

export function formatAltPrecision(altDeg?: number | null): string {
  if (typeof altDeg !== 'number') {
    return '--';
  }
  const sign = altDeg >= 0 ? '+' : '-';
  const abs = Math.abs(altDeg);
  const d = String(Math.floor(abs)).padStart(2, '0');
  const totalM = (abs - Math.floor(abs)) * 60;
  const m = String(Math.floor(totalM)).padStart(2, '0');
  const s = ((totalM - Math.floor(totalM)) * 60).toFixed(1).padStart(4, '0');
  return `${sign}${d}°  ${m}'  ${s}"`;
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
    const km = Math.round(distanceAu * 149597870.7);
    return `${km.toLocaleString()} km`;
  }
  if (distanceAu > 63241) {
    const ly = (distanceAu / 63241).toFixed(1);
    return `${ly} 光年`;
  }
  return `${distanceAu.toFixed(2)} AU`;
}

export function formatDistanceStellarium(distanceAu?: number | null): string {
  if (typeof distanceAu !== 'number' || distanceAu <= 0) {
    return '--';
  }
  if (distanceAu < 0.01) {
    const km = Math.round(distanceAu * 149597870.7);
    return `${km} km`;
  }
  if (distanceAu > 63241) {
    const ly = (distanceAu / 63241).toFixed(2);
    return `${ly} 光年`;
  }
  return `${distanceAu.toFixed(2)} AU`;
}

export function formatPhase(phase?: number | null): string {
  if (typeof phase !== 'number') {
    return '--';
  }
  return phase.toFixed(2);
}

export function formatSize(sizeArcsec?: number | null): string {
  if (typeof sizeArcsec !== 'number' || sizeArcsec <= 0) {
    return '--';
  }
  if (sizeArcsec >= 60) {
    const m = Math.floor(sizeArcsec / 60);
    const s = (sizeArcsec % 60).toFixed(1);
    return `${m}' ${s}"`;
  }
  return `${sizeArcsec.toFixed(2)}"`;
}

const CONSTELLATIONS_APPROX: Array<{ name: string; raMin: number; raMax: number; decMin: number; decMax: number }> = [
  { name: '室女座', raMin: 11.5, raMax: 15.2, decMin: -22, decMax: 14 },
  { name: '狮子座', raMin: 9.3, raMax: 12.0, decMin: -6, decMax: 33 },
  { name: '大熊座', raMin: 8.5, raMax: 14.5, decMin: 28, decMax: 73 },
  { name: '金牛座', raMin: 3.4, raMax: 6.0, decMin: -1, decMax: 31 },
  { name: '双子座', raMin: 5.9, raMax: 8.2, decMin: 10, decMax: 35 },
  { name: '猎户座', raMin: 4.7, raMax: 6.4, decMin: -11, decMax: 23 },
  { name: '仙女座', raMin: 22.9, raMax: 2.6, decMin: 21, decMax: 53 },
  { name: '天鹅座', raMin: 19.1, raMax: 22.1, decMin: 27, decMax: 61 },
  { name: '天琴座', raMin: 18.2, raMax: 19.5, decMin: 25, decMax: 48 },
  { name: '天鹰座', raMin: 18.7, raMax: 20.7, decMin: -12, decMax: 19 },
  { name: '天蝎座', raMin: 15.8, raMax: 17.9, decMin: -46, decMax: -8 },
  { name: '人马座', raMin: 17.7, raMax: 20.5, decMin: -45, decMax: -11 },
  { name: '飞马座', raMin: 21.2, raMax: 0.3, decMin: 2, decMax: 36 },
  { name: '仙后座', raMin: 22.9, raMax: 3.3, decMin: 46, decMax: 77 },
  { name: '英仙座', raMin: 1.5, raMax: 4.8, decMin: 30, decMax: 59 },
  { name: '大犬座', raMin: 6.1, raMax: 7.5, decMin: -33, decMax: -11 },
  { name: '小犬座', raMin: 7.1, raMax: 8.2, decMin: 0, decMax: 13 },
  { name: '御夫座', raMin: 4.6, raMax: 7.5, decMin: 27, decMax: 56 },
  { name: '白羊座', raMin: 1.7, raMax: 3.5, decMin: 10, decMax: 31 },
  { name: '双鱼座', raMin: 22.8, raMax: 2.1, decMin: -7, decMax: 34 },
  { name: '宝瓶座', raMin: 20.6, raMax: 23.9, decMin: -25, decMax: 3 },
  { name: '摩羯座', raMin: 20.1, raMax: 21.9, decMin: -28, decMax: -8 },
  { name: '天秤座', raMin: 14.3, raMax: 16.1, decMin: -30, decMax: 0 },
  { name: '巨蟹座', raMin: 7.9, raMax: 9.4, decMin: 6, decMax: 33 },
];

export function estimateConstellation(raHours: number, decDeg: number): string {
  const match = CONSTELLATIONS_APPROX.find((c) => {
    const inRa = c.raMin <= c.raMax
      ? (raHours >= c.raMin && raHours <= c.raMax)
      : (raHours >= c.raMin || raHours <= c.raMax);
    const inDec = decDeg >= c.decMin && decDeg <= c.decMax;
    return inRa && inDec;
  });
  return match ? match.name : '星空天区';
}

export type ObjectInfoSheetProps = {
  object: SelectedCelestialObject;
  onCenter: (object: SelectedCelestialObject) => void;
  onClose: () => void;
  onGoto?: (raHours: number, decDeg: number) => void;
  onZoomIn: (object: SelectedCelestialObject) => void;
  onZoomOut?: (object: SelectedCelestialObject) => void;
};
