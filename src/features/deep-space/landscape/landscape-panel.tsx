import type { LandscapeOption } from './landscape-catalog';
import * as React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { LANDSCAPES } from './landscape-catalog';

const TURBIDITY_PRESETS = [
  { hint: '通透夜空', label: '洁净', value: 2 },
  { hint: '常见城郊', label: '标准', value: 3 },
  { hint: '轻度霾', label: '薄雾', value: 5 },
  { hint: '城市光污染', label: '浑浊', value: 8 },
];

export type LandscapeEnvironment = {
  cardinals: boolean;
  fog: boolean;
  turbidity: number;
};

type LandscapePanelProps = {
  activeId: string;
  environment: LandscapeEnvironment;
  onClose: () => void;
  onSelect: (id: string) => void;
  onUpdateEnvironment: (patch: Partial<LandscapeEnvironment>) => void;
};

function LandscapeOptionRow({
  activeId,
  onSelect,
  option,
}: {
  activeId: string;
  onSelect: (id: string) => void;
  option: LandscapeOption;
}) {
  const isSelected = option.id === activeId;
  const hint = option.credit ? `${option.descriptionZh} · ©${option.credit}` : option.descriptionZh;

  return (
    <Pressable
      accessibilityLabel={option.titleZh}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      key={option.id}
      onPress={() => onSelect(option.id)}
      style={styles.row}
      testID={`deep-space-landscape-option-${option.id}`}
    >
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{option.titleZh}</Text>
        <Text style={styles.rowHint}>{hint}</Text>
      </View>
      {isSelected && <Text style={styles.selected}>✓</Text>}
    </Pressable>
  );
}

function SwitchRow({
  checked,
  hint,
  label,
  onToggle,
  testID,
}: {
  checked: boolean;
  hint: string;
  label: string;
  onToggle: () => void;
  testID: string;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="switch"
      accessibilityState={{ checked }}
      onPress={onToggle}
      style={styles.row}
      testID={testID}
    >
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowHint}>{hint}</Text>
      </View>
      <View style={[styles.switch, checked && styles.switchActive]}>
        <View style={[styles.knob, checked && styles.knobActive]} />
      </View>
    </Pressable>
  );
}

function TurbiditySection({
  currentTurbidity,
  onSelect,
}: {
  currentTurbidity: number;
  onSelect: (value: number) => void;
}) {
  return (
    <View style={styles.presetRow}>
      {TURBIDITY_PRESETS.map((preset) => {
        const isSelected = currentTurbidity === preset.value;
        return (
          <Pressable
            accessibilityLabel={preset.label}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            key={preset.value}
            onPress={() => onSelect(preset.value)}
            style={[styles.preset, isSelected && styles.presetActive]}
            testID={`deep-space-landscape-turbidity-${preset.value}`}
          >
            <Text style={styles.presetLabel}>{preset.label}</Text>
            <Text style={styles.presetHint}>{preset.hint}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function LandscapePanel({
  activeId,
  environment,
  onClose,
  onSelect,
  onUpdateEnvironment,
}: LandscapePanelProps): React.ReactElement {
  return (
    <View style={styles.overlay} testID="deep-space-landscape-panel">
      <Pressable accessibilityLabel="关闭地景" accessibilityRole="button" onPress={onClose} style={styles.scrim} />
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>地景与环境</Text>
          <Pressable accessibilityLabel="关闭" accessibilityRole="button" onPress={onClose} testID="deep-space-landscape-close">
            <Text style={styles.close}>✕</Text>
          </Pressable>
        </View>
        <ScrollView bounces={false} contentContainerStyle={styles.body}>
          <Text style={styles.sectionLabel}>地景</Text>
          {LANDSCAPES.map(option => (
            <LandscapeOptionRow
              activeId={activeId}
              key={option.id}
              onSelect={onSelect}
              option={option}
            />
          ))}

          <Text style={styles.sectionLabel}>环境</Text>
          <SwitchRow
            checked={environment.fog}
            hint="地平线附近的水汽与散射雾"
            label="地景雾气"
            onToggle={() => onUpdateEnvironment({ fog: !environment.fog })}
            testID="deep-space-landscape-toggle-fog"
          />
          <SwitchRow
            checked={environment.cardinals}
            hint="在地平线标注东南西北"
            label="方位基点"
            onToggle={() => onUpdateEnvironment({ cardinals: !environment.cardinals })}
            testID="deep-space-landscape-toggle-cardinals"
          />

          <Text style={styles.sectionLabel}>大气浑浊度</Text>
          <TurbiditySection
            currentTurbidity={environment.turbidity}
            onSelect={value => onUpdateEnvironment({ turbidity: value })}
          />
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: 24 },
  card: { backgroundColor: '#26282C', borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '78%', paddingHorizontal: 18, paddingTop: 16 },
  close: { color: '#FFFFFF', fontSize: 20 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 12 },
  knob: { backgroundColor: '#FFFFFF', borderRadius: 10, height: 20, marginLeft: 2, width: 20 },
  knobActive: { marginLeft: 22 },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' },
  preset: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, flex: 1, marginHorizontal: 3, paddingVertical: 10 },
  presetActive: { backgroundColor: 'rgba(43,130,246,0.28)' },
  presetHint: { color: 'rgba(255,255,255,0.55)', fontSize: 10, textAlign: 'center' },
  presetLabel: { color: '#FFFFFF', fontSize: 13, textAlign: 'center' },
  presetRow: { flexDirection: 'row', marginTop: 6 },
  row: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12 },
  rowHint: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
  rowLabel: { color: '#FFFFFF', fontSize: 15 },
  rowText: { flex: 1, paddingRight: 12 },
  scrim: { flex: 1 },
  sectionLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 16 },
  selected: { color: '#2B82F6', fontSize: 16 },
  switch: { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 13, height: 26, justifyContent: 'center', width: 46 },
  switchActive: { backgroundColor: '#2B82F6' },
  title: { color: '#FFFFFF', fontSize: 17 },
});
