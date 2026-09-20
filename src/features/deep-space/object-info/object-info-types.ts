import type { SelectedCelestialObject } from '@/features/stellarium/stellarium-service';
import { translate } from '@/lib/i18n';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isLatitude(deg?: number | null): deg is number {
  return isFiniteNumber(deg) && Math.abs(deg) <= 90;
}

function normalizePeriod(value: number, period: number): number {
  return ((value % period) + period) % period;
}

function coordinateSign(value: number): string {
  return value < 0 || Object.is(value, -0) ? '-' : '+';
}

function splitSexagesimal(value: number, precision: number, period?: number) {
  const scale = 10 ** precision;
  const normalized = period ? normalizePeriod(value, period) : Math.abs(value);
  // Round once before splitting so seconds and minutes carry together.
  const rounded = Math.round(normalized * 3600 * scale);
  const ticks = period ? rounded % (period * 3600 * scale) : rounded;
  return {
    major: Math.floor(ticks / (3600 * scale)),
    minutes: Math.floor(ticks / (60 * scale)) % 60,
    seconds: (ticks % (60 * scale)) / scale,
  };
}

export function formatRa(hours?: number | null): string {
  if (!isFiniteNumber(hours)) {
    return '--';
  }
  const { major, minutes, seconds } = splitSexagesimal(hours, 0, 24);
  return `${major}h ${minutes}m ${seconds}s`;
}

export function formatRaPrecision(hours?: number | null): string {
  if (!isFiniteNumber(hours)) {
    return '--';
  }
  const { major, minutes, seconds } = splitSexagesimal(hours, 1, 24);
  const h = String(major).padStart(2, '0');
  const m = String(minutes).padStart(2, '0');
  const s = seconds.toFixed(1).padStart(4, '0');
  return `${h}h  ${m}m  ${s}s`;
}

export function formatDec(deg?: number | null): string {
  if (!isLatitude(deg)) {
    return '--';
  }
  const { major, minutes, seconds } = splitSexagesimal(deg, 0);
  return `${coordinateSign(deg)}${major}° ${minutes}' ${seconds}"`;
}

export function formatDecPrecision(deg?: number | null): string {
  if (!isLatitude(deg)) {
    return '--';
  }
  const { major, minutes, seconds } = splitSexagesimal(deg, 1);
  const d = String(major).padStart(2, '0');
  const m = String(minutes).padStart(2, '0');
  const s = seconds.toFixed(1).padStart(4, '0');
  return `${coordinateSign(deg)}${d}°  ${m}'  ${s}"`;
}

export function formatHourAngle(hours?: number | null): string {
  return formatRaPrecision(hours);
}

export function formatAzPrecision(azDeg?: number | null): string {
  if (!isFiniteNumber(azDeg)) {
    return '--';
  }
  const { major, minutes, seconds } = splitSexagesimal(azDeg, 1, 360);
  const d = String(major).padStart(3, '0');
  const m = String(minutes).padStart(2, '0');
  const s = seconds.toFixed(1).padStart(4, '0');
  return `${d}°  ${m}'  ${s}"`;
}

export function formatAltPrecision(altDeg?: number | null): string {
  return formatDecPrecision(altDeg);
}

export function formatAzAlt(azDeg?: number | null, altDeg?: number | null): string {
  if (!isFiniteNumber(azDeg) || !isLatitude(altDeg)) {
    return '--';
  }
  const az = (Math.round(normalizePeriod(azDeg, 360) * 10) % 3600) / 10;
  const alt = Object.is(altDeg, -0) ? '-0.0' : altDeg.toFixed(1);
  return translate('deep_space.object.az_alt', { alt, az: az.toFixed(1) });
}

export function formatDistance(distanceAu?: number | null): string {
  if (!isFiniteNumber(distanceAu) || distanceAu <= 0) {
    return '--';
  }
  if (distanceAu < 0.01) {
    const km = Math.round(distanceAu * 149597870.7);
    return `${km.toLocaleString()} km`;
  }
  if (distanceAu > 63241) {
    const ly = (distanceAu / 63241).toFixed(1);
    return translate('deep_space.object.light_years', { ly });
  }
  return `${distanceAu.toFixed(2)} AU`;
}

export function formatDistanceStellarium(distanceAu?: number | null): string {
  if (!isFiniteNumber(distanceAu) || distanceAu <= 0) {
    return '--';
  }
  if (distanceAu < 0.01) {
    const km = Math.round(distanceAu * 149597870.7);
    return `${km} km`;
  }
  if (distanceAu > 63241) {
    const ly = (distanceAu / 63241).toFixed(2);
    return translate('deep_space.object.light_years', { ly });
  }
  return `${distanceAu.toFixed(2)} AU`;
}

export function isValidPhase(phase?: number | null): phase is number {
  return isFiniteNumber(phase) && phase >= 0 && phase <= 1;
}

export function formatPhase(phase?: number | null): string {
  return isValidPhase(phase) ? phase.toFixed(2) : '--';
}

export function formatSize(sizeArcsec?: number | null): string {
  if (!isFiniteNumber(sizeArcsec) || sizeArcsec <= 0) {
    return '--';
  }
  if (Number(sizeArcsec.toFixed(2)) >= 60) {
    const minutes = Math.floor(sizeArcsec / 60);
    const tenths = Math.round((sizeArcsec % 60) * 10);
    const m = minutes + Math.floor(tenths / 600);
    const s = ((tenths % 600) / 10).toFixed(1);
    return `${m}' ${s}"`;
  }
  return `${sizeArcsec.toFixed(2)}"`;
}

const CONSTELLATIONS_APPROX: Array<{ key: Parameters<typeof translate>[0]; raMin: number; raMax: number; decMin: number; decMax: number }> = [
  { key: 'deep_space.constellation.virgo', raMin: 11.5, raMax: 15.2, decMin: -22, decMax: 14 },
  { key: 'deep_space.constellation.leo', raMin: 9.3, raMax: 12.0, decMin: -6, decMax: 33 },
  { key: 'deep_space.constellation.ursa_major', raMin: 8.5, raMax: 14.5, decMin: 28, decMax: 73 },
  { key: 'deep_space.constellation.taurus', raMin: 3.4, raMax: 6.0, decMin: -1, decMax: 31 },
  { key: 'deep_space.constellation.gemini', raMin: 5.9, raMax: 8.2, decMin: 10, decMax: 35 },
  { key: 'deep_space.constellation.orion', raMin: 4.7, raMax: 6.4, decMin: -11, decMax: 23 },
  { key: 'deep_space.constellation.andromeda', raMin: 22.9, raMax: 2.6, decMin: 21, decMax: 53 },
  { key: 'deep_space.constellation.cygnus', raMin: 19.1, raMax: 22.1, decMin: 27, decMax: 61 },
  { key: 'deep_space.constellation.lyra', raMin: 18.2, raMax: 19.5, decMin: 25, decMax: 48 },
  { key: 'deep_space.constellation.aquila', raMin: 18.7, raMax: 20.7, decMin: -12, decMax: 19 },
  { key: 'deep_space.constellation.scorpius', raMin: 15.8, raMax: 17.9, decMin: -46, decMax: -8 },
  { key: 'deep_space.constellation.sagittarius', raMin: 17.7, raMax: 20.5, decMin: -45, decMax: -11 },
  { key: 'deep_space.constellation.pegasus', raMin: 21.2, raMax: 0.3, decMin: 2, decMax: 36 },
  { key: 'deep_space.constellation.cassiopeia', raMin: 22.9, raMax: 3.3, decMin: 46, decMax: 77 },
  { key: 'deep_space.constellation.perseus', raMin: 1.5, raMax: 4.8, decMin: 30, decMax: 59 },
  { key: 'deep_space.constellation.canis_major', raMin: 6.1, raMax: 7.5, decMin: -33, decMax: -11 },
  { key: 'deep_space.constellation.canis_minor', raMin: 7.1, raMax: 8.2, decMin: 0, decMax: 13 },
  { key: 'deep_space.constellation.auriga', raMin: 4.6, raMax: 7.5, decMin: 27, decMax: 56 },
  { key: 'deep_space.constellation.aries', raMin: 1.7, raMax: 3.5, decMin: 10, decMax: 31 },
  { key: 'deep_space.constellation.pisces', raMin: 22.8, raMax: 2.1, decMin: -7, decMax: 34 },
  { key: 'deep_space.constellation.aquarius', raMin: 20.6, raMax: 23.9, decMin: -25, decMax: 3 },
  { key: 'deep_space.constellation.capricornus', raMin: 20.1, raMax: 21.9, decMin: -28, decMax: -8 },
  { key: 'deep_space.constellation.libra', raMin: 14.3, raMax: 16.1, decMin: -30, decMax: 0 },
  { key: 'deep_space.constellation.cancer', raMin: 7.9, raMax: 9.4, decMin: 6, decMax: 33 },
];

export function estimateConstellation(raHours: number, decDeg: number): string {
  const match = CONSTELLATIONS_APPROX.find((c) => {
    const inRa = c.raMin <= c.raMax
      ? (raHours >= c.raMin && raHours <= c.raMax)
      : (raHours >= c.raMin || raHours <= c.raMax);
    const inDec = decDeg >= c.decMin && decDeg <= c.decMax;
    return inRa && inDec;
  });
  return translate(match ? match.key : 'deep_space.object.sky_region');
}

export type ObjectInfoSheetProps = {
  object: SelectedCelestialObject;
  onCenter: (object: SelectedCelestialObject) => void;
  onClose: () => void;
  onZoomIn: (object: SelectedCelestialObject) => void;
  onZoomOut?: (object: SelectedCelestialObject) => void;
};
