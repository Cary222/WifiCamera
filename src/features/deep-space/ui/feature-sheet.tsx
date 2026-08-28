import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Text } from '@/components/ui';
import { translate } from '@/lib/i18n';

import { CloseIcon } from './close-icon';
import { featureSheetStyles } from './feature-sheet-styles';

type FeatureSheetProps = {
  children: React.ReactNode;
  headerLeft?: React.ReactNode;
  onClose: () => void;
  scrollTestID?: string;
  scrollable?: boolean;
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
  headerLeft,
  onClose,
  scrollTestID,
  scrollable = false,
  testID,
  title,
}: FeatureSheetProps): React.ReactElement {
  return (
    <View pointerEvents="box-none" style={featureSheetStyles.featureOverlay}>
      <Pressable accessibilityLabel={title} accessibilityRole="button" onPress={onClose} style={featureSheetStyles.sheetTopScrim} />
      <View style={[featureSheetStyles.featureSheet, scrollable && featureSheetStyles.featureSheetTall]} testID={testID}>
        <View style={featureSheetStyles.featureHeader}>
          {headerLeft}
          <Text style={featureSheetStyles.featureTitle}>{title}</Text>
          <Pressable accessibilityLabel={translate('deep_space.back')} accessibilityRole="button" onPress={onClose} style={featureSheetStyles.featureClose}>
            <CloseIcon />
          </Pressable>
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
