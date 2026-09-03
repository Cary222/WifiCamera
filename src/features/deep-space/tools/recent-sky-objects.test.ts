import { addRecentSkyObject, loadRecentSkyObjects } from './recent-sky-objects';

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

  it('keeps a safe empty list for missing or malformed persisted data', () => {
    expect(loadRecentSkyObjects(createMemoryStorage())).toEqual([]);
    expect(loadRecentSkyObjects(createMemoryStorage('invalid json'))).toEqual([]);
  });
});
