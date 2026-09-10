import type { StellariumViewHandle } from '@/features/stellarium/stellarium-view';
import * as Location from 'expo-location';
import * as React from 'react';
import { translate } from '@/lib/i18n';
import { storage } from '@/lib/storage';
import { STORAGE_KEYS } from '@/lib/storage-keys';

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

function isValidObserver(value: unknown): value is ObserverLocation {
  if (!value || typeof value !== 'object')
    return false;
  const next = value as ObserverLocation;
  return Number.isFinite(next.latitudeDeg) && Math.abs(next.latitudeDeg) <= 90
    && Number.isFinite(next.longitudeDeg) && Math.abs(next.longitudeDeg) <= 180
    && typeof next.name === 'string'
    && (next.source === 'automatic' || next.source === 'manual')
    && (next.altitudeM === undefined || Number.isFinite(next.altitudeM));
}

function loadObserver(): ObserverLocation {
  try {
    const saved = storage.getString(STORAGE_KEYS.DEEP_SPACE_SETTINGS_OBSERVER);
    const observer: unknown = saved ? JSON.parse(saved) : null;
    if (isValidObserver(observer))
      return observer;
  }
  catch { /* Ignore damaged storage rather than moving the observer to invalid coordinates. */ }
  return DEFAULT_OBSERVER_LOCATION;
}

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
async function fetchStellariumGeoIpLocation(controller: AbortController): Promise<ObserverLocation | null> {
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch('https://freegeoip.stellarium.org/json/', {
      signal: controller.signal,
    });
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
    // GPS fallback can fail offline; retain the chosen observer.
  }
  finally {
    clearTimeout(timer);
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
  isCurrent: () => boolean,
): Promise<Location.LocationSubscription | null> {
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  const geocodedName = await resolveGeocodeName(position.coords.latitude, position.coords.longitude);
  const initialName = geocodedName ?? '当前位置';
  if (!isCurrent())
    return null;
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

async function resolveAutomaticObserver(onUpdate: (obs: ObserverLocation) => void, isCurrent: () => boolean, controller: AbortController) {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!isCurrent() || permission.status !== Location.PermissionStatus.GRANTED)
    return null;
  try {
    if (typeof Location.getLastKnownPositionAsync === 'function') {
      const lastKnown = await Location.getLastKnownPositionAsync().catch(() => null);
      if (lastKnown?.coords)
        onUpdate(observerFromCoordinates(lastKnown.coords));
    }
    if (!isCurrent())
      return null;
    const subscription = await startGpsTracking(onUpdate, isCurrent);
    return { subscription };
  }
  catch {
    if (!isCurrent())
      return null;
    const geoObserver = await fetchStellariumGeoIpLocation(controller);
    if (geoObserver && isValidObserver(geoObserver)) {
      onUpdate(geoObserver);
      return { subscription: null };
    }
    return null;
  }
}

export function useObserverLocation(stellaRef: React.RefObject<StellariumViewHandle | null>) {
  const subscription = React.useRef<Location.LocationSubscription | null>(null);
  const session = React.useRef(0);
  const requestController = React.useRef<AbortController | null>(null);
  const automaticActive = React.useRef(false);
  const [automaticLocation, setAutomaticLocation] = React.useState(false);
  const [observer, setObserver] = React.useState(loadObserver);

  const applyObserver = React.useCallback((next: ObserverLocation) => {
    if (!isValidObserver(next))
      return;
    setObserver(next);
    storage.set(STORAGE_KEYS.DEEP_SPACE_SETTINGS_OBSERVER, JSON.stringify(next));
    stellaRef.current?.setLocation?.(next.latitudeDeg, next.longitudeDeg);
  }, [stellaRef]);

  const clearAutomaticLocation = React.useCallback(() => {
    session.current += 1;
    automaticActive.current = false;
    requestController.current?.abort();
    requestController.current = null;
    subscription.current?.remove();
    subscription.current = null;
  }, []);
  const stopAutomaticLocation = React.useCallback(() => {
    clearAutomaticLocation();
    setAutomaticLocation(false);
  }, [clearAutomaticLocation]);

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
    if (automaticActive.current)
      return;
    automaticActive.current = true;
    const request = ++session.current;
    const isCurrent = () => request === session.current;
    const controller = new AbortController();
    requestController.current = controller;
    setAutomaticLocation(true);
    const result = await resolveAutomaticObserver((next) => {
      if (isCurrent())
        applyObserver(next);
    }, isCurrent, controller).catch(() => null);
    if (!isCurrent()) {
      result?.subscription?.remove();
      return;
    }
    if (!result) {
      stopAutomaticLocation();
      return;
    }
    subscription.current = result.subscription;
  }, [applyObserver, stopAutomaticLocation]);

  const toggleAutomaticLocation = React.useCallback(async () => {
    if (automaticLocation) {
      stopAutomaticLocation();
    }
    else {
      await enableAutomaticLocation();
    }
  }, [automaticLocation, enableAutomaticLocation, stopAutomaticLocation]);

  React.useEffect(() => clearAutomaticLocation, [clearAutomaticLocation]);

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
