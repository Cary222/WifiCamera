import { addRecentSkyObject, clearRecentSkyObjects, loadRecentSkyObjects, removeRecentSkyObject } from './recent-sky-objects';

function createMemoryStorage(initial?: string) {
  let value = initial;
  return {
    getString: jest.fn(() => value),
    set: jest.fn((_key: string, next: string) => {
      value = next;
    }),
  };
}

const SIRIUS = { id: 'NAME Sirius', name: '天狼星', typeZh: '恒星' };
const M31 = { id: 'M 31', name: '仙女座大星系', typeZh: '深空天体' };

describe('recent sky objects', () => {
  it('promotes the selected object to the top and removes duplicate ids', () => {
    const storage = createMemoryStorage();
    let recent = addRecentSkyObject(storage, SIRIUS);
    recent = addRecentSkyObject(storage, M31);
    recent = addRecentSkyObject(storage, SIRIUS);

    expect(recent).toEqual([SIRIUS, M31]);
    expect(storage.set).toHaveBeenLastCalledWith('DEEP_SPACE_RECENT_OBJECTS', JSON.stringify([SIRIUS, M31]));
  });

  it('deduplicates persisted IDs before applying the history size limit', () => {
    const storage = createMemoryStorage(JSON.stringify([SIRIUS, SIRIUS, M31, M31]));
    expect(loadRecentSkyObjects(storage)).toEqual([SIRIUS, M31]);
  });

  it('prefers a supplied catalogId for history while leaving the native engine identity intact', () => {
    const storage = createMemoryStorage();
    const object = { id: 'HIP 32349', catalogId: 'NAME Sirius', name: '天狼星', typeZh: '恒星' };
    addRecentSkyObject(storage, SIRIUS);
    expect(addRecentSkyObject(storage, object)).toEqual([SIRIUS]);
    expect(object.id).toBe('HIP 32349');
  });

  it('keeps a safe empty list for missing or malformed persisted data', () => {
    expect(loadRecentSkyObjects(createMemoryStorage())).toEqual([]);
    expect(loadRecentSkyObjects(createMemoryStorage('invalid json'))).toEqual([]);
  });

  it('removes only the requested recent object and persists the remaining order', () => {
    const storage = createMemoryStorage();
    addRecentSkyObject(storage, SIRIUS);
    addRecentSkyObject(storage, M31);
    expect(removeRecentSkyObject(storage, SIRIUS.id)).toEqual([M31]);
    expect(loadRecentSkyObjects(storage)).toEqual([M31]);
    expect(removeRecentSkyObject(storage, 'missing')).toEqual([M31]);
  });

  it('clears persisted recent objects cleanly', () => {
    const storage = createMemoryStorage();
    addRecentSkyObject(storage, SIRIUS);
    clearRecentSkyObjects(storage);
    expect(storage.set).toHaveBeenLastCalledWith('DEEP_SPACE_RECENT_OBJECTS', JSON.stringify([]));
  });
});
