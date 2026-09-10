import type { SelectedCelestialObject } from '@/features/stellarium/stellarium-service';
import type { StellariumViewHandle } from '@/features/stellarium/stellarium-view';
import * as React from 'react';

type SelectedObjectContextOptions = {
  /** Exact observing time, coordinates, culture and ready/reload generation. */
  contextKey: string;
  selectedObject: SelectedCelestialObject | null;
  setSelectedObject: (object: SelectedCelestialObject | null) => void;
  visible: boolean;
};

/** Read-only detail refresh: never selects, focuses or writes recent history. */
export function useSelectedObjectContext(
  stellaRef: React.RefObject<StellariumViewHandle | null>,
  { contextKey, selectedObject, setSelectedObject, visible }: SelectedObjectContextOptions,
) {
  const objectId = selectedObject?.id;
  const catalogId = selectedObject?.catalogId;
  React.useEffect(() => {
    if (!visible || !objectId)
      return;
    let active = true;
    const request = stellaRef.current?.getObjectInfo?.(objectId);
    request?.then((object) => {
      if (!active)
        return;
      if (object && object.id !== objectId)
        return;
      setSelectedObject(object ? { ...object, catalogId: object.catalogId ?? catalogId } : null);
    }).catch(() => {
      if (active)
        setSelectedObject(null);
    });
    return () => {
      active = false;
    };
  }, [catalogId, contextKey, objectId, setSelectedObject, stellaRef, visible]);
}
