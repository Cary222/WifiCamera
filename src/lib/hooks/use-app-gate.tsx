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
 *   2. otherwise                 -> the tab navigator
 *
 * Note: Login/auth flow has been removed. Users go directly from onboarding to main app.
 * Note: Device connection is now handled via modal on the home screen.
 */
import { useIsFirstTime } from '@/lib/hooks/use-is-first-time';

export type AppDestination
  = | { kind: 'redirect'; href: '/onboarding' }
    | { kind: 'tabs' };

export function useAppGate(): AppDestination {
  const [isFirstTime] = useIsFirstTime();

  if (isFirstTime) {
    return { kind: 'redirect', href: '/onboarding' };
  }
  return { kind: 'tabs' };
}
