import type { FieldOfViewInput } from './field-of-view';
import * as React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '@/components/ui';
import { translate } from '@/lib/i18n';
import { calculateFieldOfView, formatAngularSize } from './field-of-view';

const SENSOR_PRESETS = [
  { heightMm: 24, id: 'full-frame', label: translate('deep_space.fov_panel.full_frame'), widthMm: 36 },
  { heightMm: 15.6, id: 'aps-c', label: 'APS-C', widthMm: 23.5 },
  { heightMm: 13, id: 'micro-four-thirds', label: 'M4/3', widthMm: 17.3 },
  { heightMm: 24, id: 'custom', label: translate('deep_space.fov_panel.custom'), widthMm: 36 },
] as const;

type FieldOfViewPanelProps = {
  onApply: (input: FieldOfViewInput) => void;
};

function numberValue(value: string): number {
  return Number(value);
}

export function FieldOfViewPanel({ onApply }: FieldOfViewPanelProps): React.ReactElement {
  const [focalLength, setFocalLength] = React.useState('500');
  const [multiplier, setMultiplier] = React.useState('1');
  const [presetId, setPresetId] = React.useState<(typeof SENSOR_PRESETS)[number]['id']>('full-frame');
  const preset = SENSOR_PRESETS.find(item => item.id === presetId) ?? SENSOR_PRESETS[0];
  const [sensorWidth, setSensorWidth] = React.useState(String(preset.widthMm));
  const [sensorHeight, setSensorHeight] = React.useState(String(preset.heightMm));
  const input = {
    focalLengthMm: numberValue(focalLength),
    multiplier: numberValue(multiplier),
    sensorHeightMm: numberValue(sensorHeight),
    sensorWidthMm: numberValue(sensorWidth),
  };
  const field = calculateFieldOfView(input);
  const isCustom = preset.id === 'custom';

  const selectPreset = (id: (typeof SENSOR_PRESETS)[number]['id']) => {
    const next = SENSOR_PRESETS.find(item => item.id === id) ?? SENSOR_PRESETS[0];
    setPresetId(id);
    if (id !== 'custom') {
      setSensorWidth(String(next.widthMm));
      setSensorHeight(String(next.heightMm));
    }
  };

  return (
    <View style={styles.content}>
      <View style={styles.row}>
        <NumberInput label={translate('deep_space.fov_panel.focal_length')} onChangeText={setFocalLength} testID="deep-space-fov-focal-length" value={focalLength} />
        <NumberInput label={translate('deep_space.fov_panel.magnification')} onChangeText={setMultiplier} testID="deep-space-fov-multiplier" value={multiplier} />
      </View>
      <View style={styles.presetRow}>
        {SENSOR_PRESETS.map(item => (
          <Pressable accessibilityLabel={item.label} accessibilityRole="button" key={item.id} onPress={() => selectPreset(item.id)} style={[styles.preset, presetId === item.id && styles.presetActive]}>
            <Text style={[styles.presetText, presetId === item.id && styles.presetTextActive]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.row}>
        <NumberInput editable={isCustom} label={translate('deep_space.fov_panel.sensor_width')} onChangeText={setSensorWidth} testID="deep-space-fov-sensor-width" value={sensorWidth} />
        <NumberInput editable={isCustom} label={translate('deep_space.fov_panel.sensor_height')} onChangeText={setSensorHeight} testID="deep-space-fov-sensor-height" value={sensorHeight} />
      </View>
      {field
        ? (
            <View style={styles.summary}>
              <Result label={translate('deep_space.fov_panel.horizontal')} value={formatAngularSize(field.horizontalDeg)} />
              <Result label={translate('deep_space.fov_panel.vertical')} value={formatAngularSize(field.verticalDeg)} />
              <Result label={translate('deep_space.fov_panel.diagonal')} value={formatAngularSize(field.diagonalDeg)} />
              <Text style={styles.effectiveFocal}>
                {translate('deep_space.fov_panel.effective_focal')}
                {' '}
                {field.effectiveFocalLengthMm.toFixed(1)}
                {' mm'}
              </Text>
            </View>
          )
        : <Text style={styles.error}>{translate('deep_space.fov_panel.invalid')}</Text>}
      <Pressable accessibilityLabel={translate('deep_space.fov_panel.apply')} accessibilityRole="button" disabled={!field} onPress={() => field && onApply(input)} style={[styles.apply, !field && styles.applyDisabled]} testID="deep-space-fov-apply">
        <Text style={styles.applyText}>{translate('deep_space.fov_panel.apply_to_map')}</Text>
      </Pressable>
    </View>
  );
}

function NumberInput({ editable = true, label, onChangeText, testID, value }: { editable?: boolean; label: string; onChangeText: (value: string) => void; testID: string; value: string }) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput editable={editable} keyboardType="decimal-pad" onChangeText={onChangeText} selectTextOnFocus style={[styles.input, !editable && styles.inputReadOnly]} testID={testID} value={value} />
    </View>
  );
}

function Result({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.result}>
      <Text style={styles.resultLabel}>{label}</Text>
      <Text style={styles.resultValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  apply: { alignItems: 'center', backgroundColor: '#2B82F6', borderRadius: 12, justifyContent: 'center', minHeight: 48 },
  applyDisabled: { opacity: 0.45 },
  applyText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  content: { gap: 16, padding: 20 },
  effectiveFocal: { color: 'rgba(255,255,255,0.58)', fontSize: 12, marginTop: 2 },
  error: { color: '#FFB4BA', fontSize: 13 },
  input: { backgroundColor: 'rgba(255,255,255,0.10)', borderColor: 'rgba(255,255,255,0.18)', borderRadius: 10, borderWidth: 1, color: '#FFFFFF', fontSize: 17, height: 46, paddingHorizontal: 12 },
  inputGroup: { flex: 1, gap: 6 },
  inputLabel: { color: 'rgba(255,255,255,0.72)', fontSize: 12 },
  inputReadOnly: { opacity: 0.65 },
  preset: { borderColor: 'rgba(255,255,255,0.22)', borderRadius: 16, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7 },
  presetActive: { backgroundColor: 'rgba(43,130,246,0.28)', borderColor: '#2B82F6' },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  presetText: { color: 'rgba(255,255,255,0.78)', fontSize: 12 },
  presetTextActive: { color: '#FFFFFF', fontWeight: '700' },
  result: { flex: 1, gap: 4 },
  resultLabel: { color: 'rgba(255,255,255,0.58)', fontSize: 11 },
  resultValue: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 12 },
  summary: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 14 },
});
