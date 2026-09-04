import type { StellariumViewHandle } from '@/features/stellarium/stellarium-view';
import * as Location from 'expo-location';
import * as React from 'react';

export type ObserverLocation = {
  latitudeDeg: number;
  longitudeDeg: number;
  name: string;
  source: 'automatic' | 'manual';
};

type ManualObserverLocation = Omit<ObserverLocation, 'source'>;

export const DEFAULT_OBSERVER_LOCATION: ObserverLocation = {
  latitudeDeg: 39.9,
  longitudeDeg: 116.41,
  name: '北京',
  source: 'manual',
};

function observerFromCoordinates(coords: Location.LocationObjectCoords): ObserverLocation {
  return {
    latitudeDeg: coords.latitude,
    longitudeDeg: coords.longitude,
    name: '当前位置',
    source: 'automatic',
  };
}

export function useObserverLocation(stellaRef: React.RefObject<StellariumViewHandle | null>) {
  const subscription = React.useRef<Location.LocationSubscription | null>(null);
  const [automaticLocation, setAutomaticLocation] = React.useState(false);
  const [observer, setObserver] = React.useState<ObserverLocation>(DEFAULT_OBSERVER_LOCATION);

  const applyObserver = React.useCallback((next: ObserverLocation) => {
    setObserver(next);
    stellaRef.current?.setLocation?.(next.latitudeDeg, next.longitudeDeg);
  }, [stellaRef]);

  const stopAutomaticLocation = React.useCallback(() => {
    subscription.current?.remove();
    subscription.current = null;
    setAutomaticLocation(false);
  }, []);

  const setManualObserver = React.useCallback((next: ManualObserverLocation) => {
    stopAutomaticLocation();
    applyObserver({ ...next, source: 'manual' });
  }, [applyObserver, stopAutomaticLocation]);

  const enableAutomaticLocation = React.useCallback(async () => {
    if (automaticLocation)
      return;
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== Location.PermissionStatus.GRANTED)
      return;
    try {
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      applyObserver(observerFromCoordinates(position.coords));
      subscription.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced },
        positionUpdate => applyObserver(observerFromCoordinates(positionUpdate.coords)),
      );
      setAutomaticLocation(true);
    }
    catch {
      stopAutomaticLocation();
    }
  }, [applyObserver, automaticLocation, stopAutomaticLocation]);

  React.useEffect(() => stopAutomaticLocation, [stopAutomaticLocation]);

  return {
    automaticLocation,
    enableAutomaticLocation,
    observer,
    setManualObserver,
    stopAutomaticLocation,
  };
}
