import * as React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '@/components/ui';
import { translate } from '@/lib/i18n';
import { OVERLAY, useDeepSpaceOverlayTheme } from './deep-space-theme';
import { featureSheetStyles } from './feature-sheet-styles';
import { cityLabel } from './location-format';

const EXPANDED_OBSERVER_CITIES = [
  { latitudeDeg: 39.9, longitudeDeg: 116.41, name: '北京' },
  { latitudeDeg: 31.23, longitudeDeg: 121.47, name: '上海' },
  { latitudeDeg: 22.54, longitudeDeg: 114.06, name: '深圳' },
  { latitudeDeg: 23.13, longitudeDeg: 113.26, name: '广州' },
  { latitudeDeg: 30.57, longitudeDeg: 104.07, name: '成都' },
  { latitudeDeg: 34.34, longitudeDeg: 108.94, name: '西安' },
  { latitudeDeg: 30.59, longitudeDeg: 114.31, name: '武汉' },
  { latitudeDeg: 24.87, longitudeDeg: 118.68, name: '泉州' },
  { latitudeDeg: 43.83, longitudeDeg: 87.62, name: '乌鲁木齐' },
];

function CoordinateDialogContent({
  initialValue,
  kind,
  onCancel,
  onConfirm,
}: {
  initialValue: number;
  kind: 'latitude' | 'longitude';
  onCancel: () => void;
  onConfirm: (val: number) => void;
}) {
  const [text, setText] = React.useState(String(initialValue));

  const handleConfirm = () => {
    const num = Number.parseFloat(text);
    if (!Number.isNaN(num)) {
      if (kind === 'latitude' && num >= -90 && num <= 90) {
        onConfirm(num);
        return;
      }
      if (kind === 'longitude' && num >= -180 && num <= 180) {
        onConfirm(num);
        return;
      }
    }
    onCancel();
  };

  const { isDark, overlay } = useDeepSpaceOverlayTheme();
  const title = kind === 'latitude' ? translate('deep_space.location.latitude_placeholder') : translate('deep_space.location.longitude_placeholder');

  return (
    <View style={[styles.dialogCard, !isDark && { backgroundColor: overlay.drawer, borderColor: overlay.hairline }]} testID={`deep-space-settings-${kind}-modal`}>
      <Text style={[styles.dialogTitle, !isDark && { color: overlay.text }]}>{title}</Text>
      <TextInput
        accessibilityLabel={title}
        autoFocus
        keyboardType="numeric"
        onChangeText={setText}
        onSubmitEditing={handleConfirm}
        placeholder={title}
        placeholderTextColor={overlay.muted}
        returnKeyType="done"
        style={[styles.dialogInput, !isDark && { backgroundColor: overlay.card, borderColor: 'rgba(0,0,0,0.15)', color: overlay.text }]}
        testID={`deep-space-settings-${kind}-input`}
        value={text}
      />
      <View style={styles.dialogButtons}>
        <Pressable accessibilityLabel={translate('deep_space.dialog.cancel')} accessibilityRole="button" onPress={onCancel} style={styles.dialogButton}>
          <Text style={[styles.dialogButtonTextCancel, !isDark && { color: overlay.muted }]}>{translate('deep_space.dialog.cancel')}</Text>
        </Pressable>
        <Pressable
          accessibilityLabel={translate('deep_space.dialog.confirm')}
          accessibilityRole="button"
          onPress={handleConfirm}
          style={[styles.dialogButton, styles.dialogButtonPrimary]}
          testID={`deep-space-settings-${kind}-confirm`}
        >
          <Text style={styles.dialogButtonTextPrimary}>{translate('deep_space.dialog.confirm')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function CoordinateInputDialog({
  initialValue,
  kind,
  onCancel,
  onConfirm,
  visible,
}: {
  initialValue: number;
  kind: 'latitude' | 'longitude';
  onCancel: () => void;
  onConfirm: (val: number) => void;
  visible: boolean;
}): React.ReactElement {
  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={visible}>
      <View style={styles.modalOverlay}>
        {visible && (
          <CoordinateDialogContent
            initialValue={initialValue}
            key={`${kind}-${initialValue}`}
            kind={kind}
            onCancel={onCancel}
            onConfirm={onConfirm}
          />
        )}
      </View>
    </Modal>
  );
}

export function CityPickerModal({
  currentCity,
  onCancel,
  onSelect,
  visible,
}: {
  currentCity: string;
  onCancel: () => void;
  onSelect: (city: (typeof EXPANDED_OBSERVER_CITIES)[number]) => void;
  visible: boolean;
}): React.ReactElement {
  const { isDark, overlay } = useDeepSpaceOverlayTheme();
  const [customName, setCustomName] = React.useState('');

  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={visible}>
      <View style={styles.modalOverlay}>
        <View style={[styles.cityCard, !isDark && { backgroundColor: overlay.drawer, borderColor: overlay.hairline }]} testID="deep-space-settings-city-modal">
          <Text style={[styles.dialogTitle, !isDark && { color: overlay.text }]}>{translate('deep_space.location.pick_city')}</Text>
          <View style={styles.customCityRow}>
            <TextInput
              accessibilityLabel={translate('deep_space.location.custom_name')}
              onChangeText={setCustomName}
              placeholder={translate('deep_space.location.custom_name')}
              placeholderTextColor={overlay.muted}
              style={[styles.customCityInput, !isDark && { backgroundColor: overlay.card, borderColor: 'rgba(0,0,0,0.15)', color: overlay.text }]}
              testID="deep-space-settings-custom-city-input"
              value={customName}
            />
            <Pressable
              accessibilityLabel={translate('deep_space.location.apply_custom_name')}
              accessibilityRole="button"
              disabled={!customName.trim()}
              onPress={() => {
                if (customName.trim()) {
                  onSelect({ latitudeDeg: 39.9, longitudeDeg: 116.41, name: customName.trim() });
                }
              }}
              style={[styles.customCityBtn, !customName.trim() && { opacity: 0.5 }]}
              testID="deep-space-settings-custom-city-confirm"
            >
              <Text style={styles.customCityBtnText}>{translate('deep_space.location.apply')}</Text>
            </Pressable>
          </View>
          <ScrollView style={styles.cityList}>
            {EXPANDED_OBSERVER_CITIES.map(city => (
              <Pressable
                accessibilityLabel={cityLabel(city.name)}
                accessibilityRole="button"
                accessibilityState={{ selected: city.name === currentCity }}
                key={city.name}
                onPress={() => onSelect(city)}
                style={[styles.cityRow, !isDark && { borderBottomColor: overlay.hairline }]}
                testID={`deep-space-settings-city-${city.name}`}
              >
                <View style={featureSheetStyles.featureRowText}>
                  <Text style={[featureSheetStyles.featureRowLabel, !isDark && { color: overlay.text }]}>{cityLabel(city.name)}</Text>
                  <Text style={[featureSheetStyles.featureRowHint, !isDark && { color: overlay.muted }]}>{`${city.latitudeDeg.toFixed(2)}°, ${city.longitudeDeg.toFixed(2)}°`}</Text>
                </View>
                {city.name === currentCity && <Text style={featureSheetStyles.featureSelected}>✓</Text>}
              </Pressable>
            ))}
          </ScrollView>
          <Pressable accessibilityLabel={translate('deep_space.location.close')} accessibilityRole="button" onPress={onCancel} style={styles.cityCloseBtn}>
            <Text style={[styles.dialogButtonTextCancel, !isDark && { color: overlay.muted }]}>{translate('deep_space.location.close')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  cityCard: {
    backgroundColor: '#26292E',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    borderWidth: 1,
    maxHeight: '80%',
    padding: 20,
    width: 320,
  },
  cityCloseBtn: {
    alignItems: 'center',
    marginTop: 12,
    paddingVertical: 10,
  },
  cityList: {
    maxHeight: 220,
  },
  cityRow: {
    alignItems: 'center',
    borderBottomColor: OVERLAY.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 50,
    paddingHorizontal: 8,
  },
  customCityBtn: {
    backgroundColor: OVERLAY.accent,
    borderRadius: 8,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  customCityBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  customCityInput: {
    backgroundColor: '#1E2125',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    color: '#FFFFFF',
    flex: 1,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  customCityRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    marginTop: 8,
  },
  dialogButton: {
    alignItems: 'center',
    borderRadius: 8,
    minWidth: 70,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  dialogButtonPrimary: {
    backgroundColor: OVERLAY.accent,
  },
  dialogButtonTextCancel: {
    color: OVERLAY.muted,
    fontSize: 15,
  },
  dialogButtonTextPrimary: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  dialogButtons: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
    marginTop: 16,
  },
  dialogCard: {
    backgroundColor: '#26292E',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    width: 290,
  },
  dialogInput: {
    backgroundColor: '#1E2125',
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 8,
    borderWidth: 1,
    color: '#FFFFFF',
    fontSize: 16,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dialogTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    flex: 1,
    justifyContent: 'center',
  },
});
