/**
 * Shared visual tokens for every deep-space overlay panel.
 *
 * Keeping them in one module lets the star-map screen and the feature panels
 * (landscape, tools, settings, ...) stay visually identical without copying
 * colour literals around.
 */
export const OVERLAY = {
  accent: '#2B82F6',
  accentDim: 'rgba(43, 130, 246, 0.18)',
  control: 'rgba(17, 19, 22, 0.66)',
  drawer: '#26282C',
  drawerHeader: '#383B40',
  hairline: 'rgba(255, 255, 255, 0.16)',
  muted: 'rgba(255, 255, 255, 0.66)',
  purple: '#A892FF',
  text: '#FFFFFF',
  warning: '#FFB4BA',
};
