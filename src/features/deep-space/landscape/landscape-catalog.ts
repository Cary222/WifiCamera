import LANDSCAPES_DATA from '@/assets/stellar/landscapes.json';

export type LandscapeOption = {
  credit: string | null;
  descriptionZh: string;
  id: string;
  sizeMB: number;
  title: string;
  titleZh: string;
};

export const DEFAULT_LANDSCAPE_ID = 'guereins';

/**
 * `none` is not a data source: data/landscapes/zero ships no HiPS tiles, so the
 * scene hides the landscape module instead of loading anything for it.
 */
const NONE_OPTION: LandscapeOption = {
  credit: null,
  descriptionZh: '隐藏地面景观，仅保留天球视图',
  id: 'none',
  sizeMB: 0,
  title: 'No landscape',
  titleZh: '无地景',
};

export const LANDSCAPES: LandscapeOption[] = [
  NONE_OPTION,
  ...(LANDSCAPES_DATA.landscapes as LandscapeOption[]),
];

export function isKnownLandscape(id: string): boolean {
  return LANDSCAPES.some(option => option.id === id);
}
