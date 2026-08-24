import * as React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '@/components/ui';

type TelescopeControlPanelProps = {
  onGoto: (raHours: number, decDeg: number) => void;
};

const STEPS = [0.1, 1, 5];

function readCoordinate(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function TelescopeControlPanel({ onGoto }: TelescopeControlPanelProps): React.ReactElement {
  const [ra, setRa] = React.useState('0');
  const [dec, setDec] = React.useState('0');
  const [step, setStep] = React.useState(1);
  const raHours = readCoordinate(ra);
  const decDeg = readCoordinate(dec);
  const valid = raHours !== null && decDeg !== null && raHours >= 0 && raHours <= 24 && decDeg >= -90 && decDeg <= 90;

  const move = (raDeltaHours: number, decDeltaDeg: number) => {
    if (!valid || raHours === null || decDeg === null)
      return;
    const nextRa = ((raHours + raDeltaHours) % 24 + 24) % 24;
    const nextDec = Math.max(-90, Math.min(90, decDeg + decDeltaDeg));
    setRa(String(Number(nextRa.toFixed(3))));
    setDec(String(Number(nextDec.toFixed(3))));
    onGoto(nextRa, nextDec);
  };

  return (
    <View style={styles.content}>
      <Text style={styles.description}>控制星图指向；尚未连接实体赤道仪。</Text>
      <View style={styles.coordinateRow}>
        <CoordinateInput label="赤经 RA（小时）" onChangeText={setRa} testID="deep-space-telescope-ra-input" value={ra} />
        <CoordinateInput label="赤纬 Dec（°）" onChangeText={setDec} testID="deep-space-telescope-dec-input" value={dec} />
      </View>
      {!valid && <Text style={styles.error}>RA 应在 0–24 小时，Dec 应在 -90–90°。</Text>}
      <View style={styles.stepRow}>
        <Text style={styles.stepLabel}>步进</Text>
        {STEPS.map(value => (
          <Pressable
            accessibilityLabel={`${value} 度步进`}
            accessibilityRole="button"
            key={value}
            onPress={() => setStep(value)}
            style={[styles.stepButton, step === value && styles.stepButtonActive]}
          >
            <Text style={[styles.stepText, step === value && styles.stepTextActive]}>
              {value}
              °
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.pad}>
        <DirectionButton label="北" onPress={() => move(0, step)} />
        <View style={styles.padRow}>
          <DirectionButton label="西" onPress={() => move(-step / 15, 0)} />
          <Pressable accessibilityLabel="转到坐标" accessibilityRole="button" disabled={!valid} onPress={() => valid && onGoto(raHours as number, decDeg as number)} style={[styles.gotoButton, !valid && styles.gotoButtonDisabled]} testID="deep-space-telescope-goto">
            <Text style={styles.gotoText}>转到</Text>
          </Pressable>
          <DirectionButton label="东" onPress={() => move(step / 15, 0)} />
        </View>
        <DirectionButton label="南" onPress={() => move(0, -step)} />
      </View>
    </View>
  );
}

function CoordinateInput({ label, onChangeText, testID, value }: { label: string; onChangeText: (value: string) => void; testID: string; value: string }) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput accessibilityLabel={label} keyboardType="numbers-and-punctuation" onChangeText={onChangeText} selectTextOnFocus style={styles.input} testID={testID} value={value} />
    </View>
  );
}

function DirectionButton({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable accessibilityLabel={`${label}向微调`} accessibilityRole="button" onPress={onPress} style={styles.directionButton}><Text style={styles.directionText}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  content: { gap: 16, padding: 20 },
  coordinateRow: { flexDirection: 'row', gap: 12 },
  description: { color: 'rgba(255,255,255,0.64)', fontSize: 13, lineHeight: 19 },
  directionButton: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.11)', borderRadius: 24, height: 48, justifyContent: 'center', width: 58 },
  directionText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  error: { color: '#FFB4BA', fontSize: 12 },
  gotoButton: { alignItems: 'center', backgroundColor: '#2B82F6', borderRadius: 24, height: 48, justifyContent: 'center', width: 80 },
  gotoButtonDisabled: { opacity: 0.45 },
  gotoText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  input: { backgroundColor: 'rgba(255,255,255,0.10)', borderColor: 'rgba(255,255,255,0.18)', borderRadius: 10, borderWidth: 1, color: '#FFFFFF', fontSize: 17, height: 46, paddingHorizontal: 12 },
  inputGroup: { flex: 1, gap: 6 },
  inputLabel: { color: 'rgba(255,255,255,0.72)', fontSize: 12 },
  pad: { alignItems: 'center', gap: 8, marginTop: 2 },
  padRow: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  stepButton: { borderColor: 'rgba(255,255,255,0.22)', borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  stepButtonActive: { backgroundColor: 'rgba(43,130,246,0.28)', borderColor: '#2B82F6' },
  stepLabel: { color: 'rgba(255,255,255,0.72)', fontSize: 13, marginRight: 4 },
  stepRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  stepText: { color: 'rgba(255,255,255,0.78)', fontSize: 13 },
  stepTextActive: { color: '#FFFFFF', fontWeight: '700' },
});
