import { getLanguage, translate } from '@/lib/i18n';

function uiLang(): 'en' | 'zh' {
  return (getLanguage() || 'zh').startsWith('zh') ? 'zh' : 'en';
}

/**
 * Canonical city names are stored in Chinese; the UI shows them in the app language.
 * Names typed by the user (or reverse-geocoded) have no key and pass through unchanged.
 */
const CITY_KEYS: Record<string, Parameters<typeof translate>[0]> = {
  北京: 'deep_space.city.beijing',
  上海: 'deep_space.city.shanghai',
  深圳: 'deep_space.city.shenzhen',
  乌鲁木齐: 'deep_space.city.urumqi',
  广州: 'deep_space.city.guangzhou',
  成都: 'deep_space.city.chengdu',
  西安: 'deep_space.city.xian',
  武汉: 'deep_space.city.wuhan',
  泉州: 'deep_space.city.quanzhou',
  当前位置: 'deep_space.location.current',
};

export function cityLabel(name: string): string {
  const key = CITY_KEYS[name];
  return key ? translate(key) : name;
}

export function formatLatitudeDMS(lat: number, lang: 'en' | 'zh' = uiLang()): string {
  const hemi = lat >= 0 ? (lang === 'zh' ? '北' : 'N') : lang === 'zh' ? '南' : 'S';
  const abs = Math.abs(lat);
  const deg = Math.floor(abs);
  const min = Math.floor((abs - deg) * 60);
  const sec = Math.round(((abs - deg) * 60 - min) * 60);
  return `${deg}° ${min}' ${sec}" ${hemi}`;
}

export function formatLongitudeDMS(lon: number, lang: 'en' | 'zh' = uiLang()): string {
  const hemi = lon >= 0 ? (lang === 'zh' ? '东' : 'E') : lang === 'zh' ? '西' : 'W';
  const abs = Math.abs(lon);
  const deg = Math.floor(abs);
  const min = Math.floor((abs - deg) * 60);
  const sec = Math.round(((abs - deg) * 60 - min) * 60);
  return `${deg}° ${min}' ${sec}" ${hemi}`;
}

export function formatUtcOffset(minutesOffset: number): string {
  const totalMinutes = -minutesOffset;
  const sign = totalMinutes >= 0 ? '+' : '-';
  const absMinutes = Math.abs(totalMinutes);
  const hours = Math.floor(absMinutes / 60);
  const mins = absMinutes % 60;
  return `${sign}${hours}:${mins.toString().padStart(2, '0')}`;
}

export function formatUtcOffsetHours(minutesOffset: number): string {
  const hours = Math.round(-minutesOffset / 60);
  return String(hours);
}
