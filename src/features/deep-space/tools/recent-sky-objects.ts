import { STORAGE_KEYS } from '@/lib/storage-keys';

export type RecentSkyObject = {
  id: string;
  name: string;
  typeZh?: string;
};

type StringStorage = {
  getString: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
};

const MAX_RECENT_OBJECTS = 6;

function isRecentSkyObject(value: unknown): value is RecentSkyObject {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record.id === 'string' && typeof record.name === 'string' && (record.typeZh === undefined || typeof record.typeZh === 'string');
}

export function loadRecentSkyObjects(storage: StringStorage): RecentSkyObject[] {
  const rawValue = storage.getString(STORAGE_KEYS.DEEP_SPACE_RECENT_OBJECTS);
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isRecentSkyObject).slice(0, MAX_RECENT_OBJECTS);
  }
  catch {
    return [];
  }
}

export function addRecentSkyObject(storage: StringStorage, object: RecentSkyObject): RecentSkyObject[] {
  const next = [object, ...loadRecentSkyObjects(storage).filter(item => item.id !== object.id)].slice(0, MAX_RECENT_OBJECTS);
  storage.set(STORAGE_KEYS.DEEP_SPACE_RECENT_OBJECTS, JSON.stringify(next));
  return next;
}
