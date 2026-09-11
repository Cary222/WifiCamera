import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { useUniwind } from 'uniwind';
import { Text } from '@/components/ui';

import { translate } from '@/lib/i18n';

import { CloseIcon } from './close-icon';
import { featureSheetStyles, featureSheetStylesLight } from './feature-sheet-styles';

type FeatureSheetProps = {
  children: React.ReactNode;
  fullScreen?: boolean;
  headerLeft?: React.ReactNode;
  onClose: () => void;
  placement?: 'bottom' | 'top';
  scrollTestID?: string;
  scrollable?: boolean;
  showCloseButton?: boolean;
  testID: string;
  title: string;
};

/**
 * The bottom-anchored card shell shared by every deep-space feature panel.
 *
 * Tapping the scrim above the card or the close button both dismiss it, so the
 * panels never need to ship their own gesture handling.
 */
export function FeatureSheet({
  children,
  fullScreen = false,
  headerLeft,
  onClose,
  placement = 'bottom',
  scrollTestID,
  scrollable = false,
  showCloseButton = true,
  testID,
  title,
}: FeatureSheetProps): React.ReactElement {
  const { theme } = useUniwind();
  const isDark = theme === 'dark';

  return (
    <View pointerEvents="box-none" style={[featureSheetStyles.featureOverlay, placement === 'top' && featureSheetStyles.featureOverlayTop]}>
      <Pressable accessibilityLabel={title} accessibilityRole="button" onPress={onClose} style={[featureSheetStyles.sheetTopScrim, placement === 'top' && featureSheetStyles.sheetTopScrimTransparent]} />
      <View style={[featureSheetStyles.featureSheet, !isDark && featureSheetStylesLight.featureSheet, scrollable && featureSheetStyles.featureSheetTall, fullScreen && featureSheetStyles.featureSheetFullScreen, placement === 'top' && featureSheetStyles.featureSheetTop]} testID={testID}>
        <View style={[featureSheetStyles.featureHeader, !isDark && featureSheetStylesLight.featureHeader]}>
          {headerLeft}
          <Text style={[featureSheetStyles.featureTitle, !isDark && featureSheetStylesLight.featureTitle]}>{title}</Text>
          {showCloseButton
            ? (
                <Pressable accessibilityLabel={translate('deep_space.back')} accessibilityRole="button" onPress={onClose} style={featureSheetStyles.featureClose}>
                  <CloseIcon color={isDark ? undefined : '#0A0B0D'} />
                </Pressable>
              )
            : headerLeft ? <View style={featureSheetStyles.featureClose} /> : null}
        </View>
        {scrollable
          ? (
              <ScrollView
                bounces={false}
                contentContainerStyle={featureSheetStyles.featureScrollContent}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                testID={scrollTestID}
              >
                {children}
              </ScrollView>
            )
          : children}
      </View>
    </View>
  );
}
