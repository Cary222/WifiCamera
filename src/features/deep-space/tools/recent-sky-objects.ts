import { STORAGE_KEYS } from '@/lib/storage-keys';

export type RecentSkyObject = {
  id: string;
  catalogId?: string;
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

function canonicalRecentObject(object: RecentSkyObject): RecentSkyObject {
  const id = typeof object.catalogId === 'string' && object.catalogId.trim() ? object.catalogId : object.id;
  return { id, name: object.name, ...(object.typeZh !== undefined ? { typeZh: object.typeZh } : {}) };
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

    const seen = new Set<string>();
    return parsed.filter(isRecentSkyObject).map(canonicalRecentObject).filter((object) => {
      if (seen.has(object.id))
        return false;
      seen.add(object.id);
      return true;
    }).slice(0, MAX_RECENT_OBJECTS);
  }
  catch {
    return [];
  }
}

export function addRecentSkyObject(storage: StringStorage, object: RecentSkyObject): RecentSkyObject[] {
  const candidate = canonicalRecentObject(object);
  const next = [candidate, ...loadRecentSkyObjects(storage).filter(item => item.id !== candidate.id)].slice(0, MAX_RECENT_OBJECTS);
  storage.set(STORAGE_KEYS.DEEP_SPACE_RECENT_OBJECTS, JSON.stringify(next));
  return next;
}

export function removeRecentSkyObject(storage: StringStorage, id: string): RecentSkyObject[] {
  const next = loadRecentSkyObjects(storage).filter(item => item.id !== id);
  storage.set(STORAGE_KEYS.DEEP_SPACE_RECENT_OBJECTS, JSON.stringify(next));
  return next;
}

export function clearRecentSkyObjects(storage: StringStorage): void {
  storage.set(STORAGE_KEYS.DEEP_SPACE_RECENT_OBJECTS, JSON.stringify([]));
}
