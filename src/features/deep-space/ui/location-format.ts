export function formatLatitudeDMS(lat: number, lang: 'en' | 'zh' = 'zh'): string {
  const hemi = lat >= 0 ? (lang === 'zh' ? '北' : 'N') : lang === 'zh' ? '南' : 'S';
  const abs = Math.abs(lat);
  const deg = Math.floor(abs);
  const min = Math.floor((abs - deg) * 60);
  const sec = Math.round(((abs - deg) * 60 - min) * 60);
  return `${deg}° ${min}' ${sec}" ${hemi}`;
}

export function formatLongitudeDMS(lon: number, lang: 'en' | 'zh' = 'zh'): string {
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
