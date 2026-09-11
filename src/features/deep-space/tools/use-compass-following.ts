import type { StellariumViewHandle } from '@/features/stellarium/stellarium-view';
import * as Location from 'expo-location';
import * as React from 'react';
import { translate } from '@/lib/i18n';
import { showDeepSpaceFeedback } from '../ui/deep-space-feedback';
import { resolveCompassHeading } from './compass-heading';

export function useCompassFollowing(stellaRef: React.RefObject<StellariumViewHandle | null>) {
  const subscription = React.useRef<Location.LocationSubscription | null>(null);
  // Every start owns a generation. Stopping (or a newer start) bumps it and
  // invalidates whatever is still awaiting a permission prompt, a heading watch
  // or a queued heading callback; nothing late may steer the view again.
  const generation = React.useRef(0);
  const [compassFollowing, setCompassFollowing] = React.useState(false);

  const stopCompassFollowing = React.useCallback(() => {
    generation.current += 1;
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
    generation.current += 1;
    const startGeneration = generation.current;
    const isCurrent = () => generation.current === startGeneration;
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!isCurrent())
        return;
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        showDeepSpaceFeedback({ message: translate('deep_space.compass_permission_denied'), tone: 'danger' });
        return;
      }
      const nextSubscription = await Location.watchHeadingAsync((heading) => {
        if (!isCurrent())
          return;
        stellaRef.current?.setViewBearing(resolveCompassHeading(heading));
      });
      if (!isCurrent()) {
        // The user stopped (or started again) while the watch was still pending:
        // drop it instead of leaving a live sensor subscription.
        nextSubscription.remove();
        return;
      }
      // Defensive: never keep two watches even if an earlier one slipped through.
      subscription.current?.remove();
      subscription.current = nextSubscription;
      setCompassFollowing(true);
      showDeepSpaceFeedback({ message: translate('deep_space.compass_started'), tone: 'success' });
    }
    catch {
      if (isCurrent())
        showDeepSpaceFeedback({ message: translate('deep_space.compass_unavailable'), tone: 'danger' });
    }
  }, [compassFollowing, stellaRef, stopCompassFollowing]);

  return { compassFollowing, toggleCompassFollowing, stopCompassFollowing };
}
