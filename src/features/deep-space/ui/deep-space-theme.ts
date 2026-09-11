import * as React from 'react';
import { useUniwind } from 'uniwind';

/**
 * Shared visual tokens for every deep-space overlay panel.
 *
 * Keeping them in one module lets the star-map screen and the feature panels
 * (landscape, tools, settings, ...) stay visually identical without copying
 * colour literals around.
 */
export const OVERLAY_DARK = {
  accent: '#2B82F6',
  accentDim: 'rgba(43, 130, 246, 0.18)',
  card: '#1E2125',
  control: 'rgba(17, 19, 22, 0.66)',
  drawer: '#26282C',
  drawerHeader: '#383B40',
  hairline: 'rgba(255, 255, 255, 0.16)',
  muted: 'rgba(255, 255, 255, 0.66)',
  purple: '#A892FF',
  text: '#FFFFFF',
  warning: '#FFB4BA',
};

export const OVERLAY_LIGHT = {
  accent: '#2B82F6',
  accentDim: 'rgba(43, 130, 246, 0.18)',
  card: '#F4F4F5',
  control: 'rgba(255, 255, 255, 0.85)',
  drawer: '#FFFFFF',
  drawerHeader: '#F4F4F5',
  hairline: 'rgba(0, 0, 0, 0.08)',
  muted: 'rgba(10, 11, 13, 0.6)',
  purple: '#7C3AED',
  text: '#0A0B0D',
  warning: '#DC2626',
};
export const OVERLAY = OVERLAY_DARK;

export function getOverlayTheme(isDark: boolean) {
  return isDark ? OVERLAY_DARK : OVERLAY_LIGHT;
}

export const DeepSpaceThemeContext = React.createContext<{
  isDark: boolean;
  overlay: typeof OVERLAY_DARK;
}>({
  isDark: true,
  overlay: OVERLAY_DARK,
});

export function useDeepSpaceOverlayTheme() {
  const ctx = React.use(DeepSpaceThemeContext);
  const { theme } = useUniwind();
  const isDark = ctx ? ctx.isDark : theme === 'dark';
  return {
    isDark,
    overlay: isDark ? OVERLAY_DARK : OVERLAY_LIGHT,
  };
}
