import { STORAGE_KEYS } from '@/lib/storage-keys';

type StringStorage = {
  getString: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
};

function loadFavoriteIds(storage: StringStorage): string[] {
  const rawValue = storage.getString(STORAGE_KEYS.DEEP_SPACE_FAVORITE_OBJECT_IDS);
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  }
  catch {
    return [];
  }
}

export function isFavoriteSkyObject(storage: StringStorage, objectId: string): boolean {
  return loadFavoriteIds(storage).includes(objectId);
}

export function toggleFavoriteSkyObject(storage: StringStorage, objectId: string): boolean {
  const favorites = loadFavoriteIds(storage);
  const isFavorite = favorites.includes(objectId);
  const next = isFavorite ? favorites.filter(id => id !== objectId) : [objectId, ...favorites];
  storage.set(STORAGE_KEYS.DEEP_SPACE_FAVORITE_OBJECT_IDS, JSON.stringify(next));
  return !isFavorite;
}
