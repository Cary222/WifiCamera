import type { StellariumViewHandle } from '@/features/stellarium/stellarium-view';
import * as Location from 'expo-location';
import * as React from 'react';
import { translate } from '@/lib/i18n';

export type ObserverLocation = {
  altitudeM?: number;
  latitudeDeg: number;
  longitudeDeg: number;
  name: string;
  source: 'automatic' | 'manual';
};

type ManualObserverLocation = Omit<ObserverLocation, 'source'>;

export const DEFAULT_OBSERVER_LOCATION: ObserverLocation = {
  altitudeM: 0,
  latitudeDeg: 39.9,
  longitudeDeg: 116.41,
  name: '北京',
  source: 'manual',
};

async function resolveGeocodeName(latitude: number, longitude: number): Promise<string | null> {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (results && results.length > 0) {
      const place = results[0];
      const city = place.city || place.subregion || place.district || place.name;
      const country = place.country;
      if (city && country)
        return `${city}, ${country}`;
      if (city)
        return city;
    }
  }
  catch {
    // ignore
  }
  return null;
}

/**
 * Stellarium's official GeoIP fallback service:
 * Used by Stellarium when device GPS / Google Play Services are unavailable
 */
async function fetchStellariumGeoIpLocation(): Promise<ObserverLocation | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch('https://freegeoip.stellarium.org/json/', {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (typeof data.latitude === 'number' && typeof data.longitude === 'number') {
        const label = data.city && data.country_name ? `${data.city}, ${data.country_name}` : data.city ?? '当前位置';
        return {
          altitudeM: 0,
          latitudeDeg: Number(data.latitude.toFixed(4)),
          longitudeDeg: Number(data.longitude.toFixed(4)),
          name: label,
          source: 'automatic',
        };
      }
    }
  }
  catch {
    // ignore
  }
  return null;
}

function observerFromCoordinates(coords: Location.LocationObjectCoords, name = '当前位置'): ObserverLocation {
  return {
    ...(coords.altitude != null ? { altitudeM: Math.round(coords.altitude) } : {}),
    latitudeDeg: coords.latitude,
    longitudeDeg: coords.longitude,
    name,
    source: 'automatic',
  };
}

async function startGpsTracking(
  onUpdate: (obs: ObserverLocation) => void,
): Promise<Location.LocationSubscription | null> {
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  const geocodedName = await resolveGeocodeName(position.coords.latitude, position.coords.longitude);
  const initialName = geocodedName ?? '当前位置';
  onUpdate(observerFromCoordinates(position.coords, initialName));

  return Location.watchPositionAsync(
    { accuracy: Location.Accuracy.Balanced },
    (positionUpdate) => {
      onUpdate(observerFromCoordinates(positionUpdate.coords, initialName));
      void resolveGeocodeName(positionUpdate.coords.latitude, positionUpdate.coords.longitude).then((updateName) => {
        if (updateName) {
          onUpdate(observerFromCoordinates(positionUpdate.coords, updateName));
        }
      });
    },
  );
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

  const setManualCoordinate = React.useCallback((latitudeDeg: number, longitudeDeg: number, name?: string) => {
    setManualObserver({
      altitudeM: observer.altitudeM ?? 0,
      latitudeDeg,
      longitudeDeg,
      name: name ?? (observer.name === '当前位置' ? translate('deep_space.settings.custom_location') : observer.name),
    });
  }, [observer.altitudeM, observer.name, setManualObserver]);

  const enableAutomaticLocation = React.useCallback(async () => {
    if (automaticLocation)
      return;
    setAutomaticLocation(true);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status === Location.PermissionStatus.GRANTED) {
        if (typeof Location.getLastKnownPositionAsync === 'function') {
          const lastKnown = await Location.getLastKnownPositionAsync().catch(() => null);
          if (lastKnown?.coords)
            applyObserver(observerFromCoordinates(lastKnown.coords, '当前位置'));
        }
        subscription.current = await startGpsTracking(applyObserver);
        return;
      }
    }
    catch {
      // ignore GPS failure and run GeoIP
    }

    const geoObs = await fetchStellariumGeoIpLocation();
    if (geoObs)
      applyObserver(geoObs);
  }, [applyObserver, automaticLocation]);

  const toggleAutomaticLocation = React.useCallback(async () => {
    if (automaticLocation) {
      stopAutomaticLocation();
    }
    else {
      await enableAutomaticLocation();
    }
  }, [automaticLocation, enableAutomaticLocation, stopAutomaticLocation]);

  React.useEffect(() => stopAutomaticLocation, [stopAutomaticLocation]);

  return {
    automaticLocation,
    enableAutomaticLocation,
    observer,
    setManualCoordinate,
    setManualObserver,
    stopAutomaticLocation,
    toggleAutomaticLocation,
  };
}
