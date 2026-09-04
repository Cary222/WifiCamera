import { StyleSheet } from 'react-native';

import { OVERLAY } from './deep-space-theme';

/**
 * Layout for the shared feature sheet and the rows that live inside it.
 *
 * Panels import these directly so a navigation row in one panel lines up with
 * a switch row in another.
 */
export const featureSheetStyles = StyleSheet.create({
  featureClose: {
    alignItems: 'center',
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  featureHeader: {
    alignItems: 'center',
    borderBottomColor: OVERLAY.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 62,
    paddingHorizontal: 20,
  },
  featureOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  featureOverlayTop: {
    justifyContent: 'flex-start',
  },
  featureRow: {
    alignItems: 'center',
    borderBottomColor: OVERLAY.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: 20,
  },
  featureRowHint: {
    color: OVERLAY.muted,
    fontSize: 12,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  featureRowLabel: {
    color: OVERLAY.text,
    fontSize: 16,
  },
  featureRowText: {
    flex: 1,
  },
  featureScrollContent: {
    paddingBottom: 40,
  },
  featureSelected: {
    color: '#83B4FF',
    fontSize: 16,
    fontWeight: '700',
  },
  featureSheet: {
    backgroundColor: OVERLAY.drawer,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 28,
  },
  featureSheetTall: {
    maxHeight: '82%',
  },
  featureSheetTop: {
    alignSelf: 'stretch',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    paddingBottom: 0,
  },
  featureSheetFullScreen: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    height: '100%',
    paddingBottom: 0,
  },
  featureTitle: {
    color: OVERLAY.text,
    flex: 1,
    fontSize: 19,
    fontWeight: '500',
    textAlign: 'center',
  },
  sheetTopScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  sheetTopScrimTransparent: {
    backgroundColor: 'transparent',
  },
});
