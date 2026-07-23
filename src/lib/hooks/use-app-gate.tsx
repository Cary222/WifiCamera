/**
 * Single decision point for the root navigation gate.
 *
 * `(app)/_layout.tsx` calls this hook to know what to render for the current
 * app session. Returning a discriminated union (`{ kind, ... }`) instead of
 * a bare `href` keeps the gate extensible — a future condition (e.g. paid
 * subscription, region restriction, new-feature tooltip) is just one more
 * `if` here plus a new `AppDestination` variant. The layout itself stays
 * layout-only (no business logic, no direct store reads beyond what's
 * declared below).
 *
 * Gate priority (first match wins):
 *   1. First launch              -> /onboarding
 *   2. Signed out                -> /login
 *   3. No bound device           -> /device-setup
 *   4. otherwise                 -> the tab navigator
 */
import { useAuthStore } from '@/features/auth/use-auth-store';
import { useBoundDeviceId } from '@/features/device/use-device-store';
import { useIsFirstTime } from '@/lib/hooks/use-is-first-time';

export type AppDestination
  = | { kind: 'redirect'; href: '/onboarding' | '/login' | '/device-setup' }
    | { kind: 'tabs' };

export function useAppGate(): AppDestination {
  const status = useAuthStore.use.status();
  const [isFirstTime] = useIsFirstTime();
  const [boundDeviceId] = useBoundDeviceId();

  if (isFirstTime) {
    return { kind: 'redirect', href: '/onboarding' };
  }
  if (status === 'signOut') {
    return { kind: 'redirect', href: '/login' };
  }
  if (boundDeviceId === undefined) {
    return { kind: 'redirect', href: '/device-setup' };
  }
  return { kind: 'tabs' };
}
