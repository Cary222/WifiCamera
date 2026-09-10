import type { SelectedCelestialObject } from '@/features/stellarium/stellarium-service';
import type { StellariumViewHandle } from '@/features/stellarium/stellarium-view';
import { act, renderHook } from '@testing-library/react-native';
import { useSelectedObjectContext } from './use-selected-object-context';

const OBJECT: SelectedCelestialObject = { id: 'HIP 32349', catalogId: 'Sirius', name: 'Sirius', englishName: 'Sirius', designations: ['HIP 32349'], raHours: 6.75, decDeg: -16.7, altDeg: 10, azDeg: 20 };

function deferred() {
  let resolve: (object: SelectedCelestialObject | null) => void = () => {};
  let reject: (error: Error) => void = () => {};
  const promise = new Promise<SelectedCelestialObject | null>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

function createContext() {
  const getObjectInfo = jest.fn<Promise<SelectedCelestialObject | null>, [string]>();
  const setSelectedObject = jest.fn();
  const stellaRef = { current: { getObjectInfo } as unknown as StellariumViewHandle };
  const props = { contextKey: '1000:39.9:116.4:western:1', selectedObject: OBJECT as SelectedCelestialObject | null, setSelectedObject, visible: true };
  const view = renderHook((options: typeof props) => useSelectedObjectContext(stellaRef, options), { initialProps: props });
  return { ...view, getObjectInfo, props, setSelectedObject };
}

describe('selected-object context refresh', () => {
  it('queries native identity and updates details without mutating object identity', async () => {
    const { getObjectInfo, props, rerender, setSelectedObject } = createContext();
    const latest = { ...OBJECT, altDeg: 31, azDeg: 47 };
    getObjectInfo.mockResolvedValueOnce(latest);
    rerender({ ...props, contextKey: '2000:39.9:116.4:western:1' });
    await act(async () => {
      await Promise.resolve();
    });
    expect(getObjectInfo).toHaveBeenLastCalledWith('HIP 32349');
    expect(setSelectedObject).toHaveBeenLastCalledWith(latest);
  });

  it('ignores old time and observer results after a context change', async () => {
    const { getObjectInfo, props, rerender, setSelectedObject } = createContext();
    const older = deferred();
    const newer = deferred();
    getObjectInfo.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    rerender({ ...props, contextKey: '2000:39.9:116.4:western:1' });
    rerender({ ...props, contextKey: '2000:0:0:western:1' });
    await act(async () => newer.resolve({ ...OBJECT, altDeg: 50 }));
    await act(async () => older.resolve({ ...OBJECT, altDeg: -50 }));
    expect(setSelectedObject).toHaveBeenCalledTimes(1);
    expect(setSelectedObject).toHaveBeenLastCalledWith(expect.objectContaining({ altDeg: 50 }));
  });

  it('stops when hidden or closed, discards old responses and refreshes a paused scene after reload', async () => {
    const { getObjectInfo, props, rerender, setSelectedObject, unmount } = createContext();
    const older = deferred();
    getObjectInfo.mockReturnValueOnce(older.promise);
    rerender({ ...props, contextKey: '1000:39.9:116.4:western:2' });
    rerender({ ...props, visible: false });
    await act(async () => older.resolve(OBJECT));
    expect(setSelectedObject).not.toHaveBeenCalled();
    const count = getObjectInfo.mock.calls.length;
    rerender({ ...props, selectedObject: null });
    expect(getObjectInfo).toHaveBeenCalledTimes(count);
    getObjectInfo.mockResolvedValueOnce(OBJECT);
    rerender({ ...props, contextKey: '1000:39.9:116.4:western:3' });
    await act(async () => {
      await Promise.resolve();
    });
    expect(setSelectedObject).toHaveBeenLastCalledWith(OBJECT);
    unmount();
  });

  it('rejects a response for a previously selected object', async () => {
    const { getObjectInfo, props, rerender, setSelectedObject } = createContext();
    const older = deferred();
    getObjectInfo.mockReturnValueOnce(older.promise);
    rerender({ ...props, contextKey: '2000:39.9:116.4:western:1' });
    const next = { ...OBJECT, id: 'NAME Mars' };
    getObjectInfo.mockResolvedValueOnce(next);
    rerender({ ...props, selectedObject: next });
    await act(async () => older.resolve(OBJECT));
    expect(setSelectedObject).toHaveBeenCalledTimes(1);
    expect(setSelectedObject).toHaveBeenLastCalledWith(next);
  });

  it.each(['null', 'error'])('clears invalid details for a current %s response instead of showing stale metrics', async (kind) => {
    const { getObjectInfo, props, rerender, setSelectedObject } = createContext();
    const request = deferred();
    getObjectInfo.mockReturnValueOnce(request.promise);
    rerender({ ...props, contextKey: '2000:39.9:116.4:western:1' });
    await act(async () => kind === 'null' ? request.resolve(null) : request.reject(new Error('offline')));
    expect(setSelectedObject).toHaveBeenLastCalledWith(null);
  });
});
