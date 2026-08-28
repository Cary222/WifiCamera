import type { ImageSourcePropType } from 'react-native';
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

export const LANDSCAPE_THUMBNAILS: Record<string, ImageSourcePropType> = {
  champagne_castle: require('@/assets/stellar/data/landscapes/champagne_castle/Norder0/Allsky.webp'),
  garching: require('@/assets/stellar/data/landscapes/garching/Norder0/Allsky.webp'),
  guereins: require('@/assets/stellar/data/landscapes/guereins/Norder0/Allsky.webp'),
  kloppenheim: require('@/assets/stellar/data/landscapes/kloppenheim/Norder0/Allsky.webp'),
  ocean: require('@/assets/stellar/data/landscapes/ocean/Norder0/Allsky.webp'),
  winterfield: require('@/assets/stellar/data/landscapes/winterfield/Norder0/Allsky.webp'),
};

export const LANDSCAPES: LandscapeOption[] = [
  ...(LANDSCAPES_DATA.landscapes as LandscapeOption[]),
];

export function isKnownLandscape(id: string): boolean {
  return LANDSCAPES.some(option => option.id === id);
}
