import type { StellariumViewHandle } from '@/features/stellarium/stellarium-view';
import * as Location from 'expo-location';
import * as React from 'react';
import { translate } from '@/lib/i18n';
import { showDeepSpaceFeedback } from '../ui/deep-space-feedback';
import { resolveCompassHeading } from './compass-heading';

export function useCompassFollowing(stellaRef: React.RefObject<StellariumViewHandle | null>) {
  const subscription = React.useRef<Location.LocationSubscription | null>(null);
  const [compassFollowing, setCompassFollowing] = React.useState(false);
  const stopCompassFollowing = React.useCallback(() => {
    subscription.current?.remove();
    subscription.current = null;
    setCompassFollowing(false);
  }, []);

  React.useEffect(() => stopCompassFollowing, [stopCompassFollowing]);

  const toggleCompassFollowing = React.useCallback(async () => {
    if (compassFollowing) {
      stopCompassFollowing();
      showDeepSpaceFeedback({ message: translate('deep_space.compass_stopped'), tone: 'success' });
      return;
    }
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        showDeepSpaceFeedback({ message: translate('deep_space.compass_permission_denied'), tone: 'danger' });
        return;
      }
      subscription.current = await Location.watchHeadingAsync((heading) => {
        stellaRef.current?.setViewBearing(resolveCompassHeading(heading));
      });
      setCompassFollowing(true);
      showDeepSpaceFeedback({ message: translate('deep_space.compass_started'), tone: 'success' });
    }
    catch {
      showDeepSpaceFeedback({ message: translate('deep_space.compass_unavailable'), tone: 'danger' });
    }
  }, [compassFollowing, stellaRef, stopCompassFollowing]);

  return { compassFollowing, toggleCompassFollowing };
}
