import { isFavoriteSkyObject, toggleFavoriteSkyObject } from './favorite-sky-objects';

function createMemoryStorage(initial?: string) {
  let value = initial;
  return {
    getString: jest.fn(() => value),
    set: jest.fn((_key: string, next: string) => {
      value = next;
    }),
  };
}

describe('favorite sky objects', () => {
  it('adds an object id and reports the new favorite state', () => {
    const storage = createMemoryStorage();

    expect(toggleFavoriteSkyObject(storage, 'NAME Sirius')).toBe(true);
    expect(isFavoriteSkyObject(storage, 'NAME Sirius')).toBe(true);
  });

  it('removes an existing object id without disturbing other favorites', () => {
    const storage = createMemoryStorage('["M 31","NAME Sirius"]');

    expect(toggleFavoriteSkyObject(storage, 'NAME Sirius')).toBe(false);
    expect(isFavoriteSkyObject(storage, 'NAME Sirius')).toBe(false);
    expect(isFavoriteSkyObject(storage, 'M 31')).toBe(true);
  });

  it('falls back to an empty list for malformed persisted data', () => {
    const storage = createMemoryStorage('bad json');

    expect(isFavoriteSkyObject(storage, 'NAME Sirius')).toBe(false);
  });
});
