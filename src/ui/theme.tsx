import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

export const C = {
  bg: '#14121F',
  card: '#1C1930',
  card2: '#221E35',
  accent: '#7C5CFF',
  accentSoft: '#B9A7FF',
  text: '#F4F1FF',
  body: '#E6E1FF',
  muted: '#A9A3C7',
  faint: '#8E88AD',
  good: '#6EE7A8',
  bad: '#FF8A8A',
  gold: '#FFD166',
};

export function Screen({ children }: { children: ReactNode }) {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 48 }}>
      {children}
    </ScrollView>
  );
}

export function Card({ title, children, style }: { title?: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.card, style]}>
      {title ? <Text style={s.cardTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

export function Btn({ label, onPress, secondary, disabled }: { label: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [s.btn, secondary && s.btnSecondary, disabled && { opacity: 0.4 }, pressed && { opacity: 0.7 }]}
    >
      <Text style={[s.btnText, secondary && { color: '#D9D2FF' }]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, selected && s.chipOn]}>
      <Text style={{ color: selected ? '#FFFFFF' : C.muted, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export function Bar({ value, max, color = C.accent }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <View style={s.barTrack}>
      <View style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: 4 }} />
    </View>
  );
}

export function Row({ left, right, rightColor }: { left: string; right?: string; rightColor?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text style={[t.body, { flexShrink: 1 }]}>{left}</Text>
      {right !== undefined ? <Text style={[t.body, { color: rightColor ?? C.muted }]}>{right}</Text> : null}
    </View>
  );
}

export const t = StyleSheet.create({
  h1: { color: C.text, fontSize: 36, fontWeight: '700' },
  h2: { color: C.text, fontSize: 18, fontWeight: '600' },
  body: { color: C.body, fontSize: 15 },
  muted: { color: C.muted, fontSize: 14 },
  small: { color: C.faint, fontSize: 12 },
  error: { color: C.bad, fontSize: 14 },
});

export const inputStyle = {
  backgroundColor: C.card2,
  color: C.text,
  borderRadius: 10,
  paddingHorizontal: 12,
  paddingVertical: 10,
  fontSize: 16,
} as const;

const s = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 14, padding: 14, gap: 8 },
  cardTitle: { color: C.text, fontSize: 16, fontWeight: '600' },
  btn: { backgroundColor: C.accent, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  btnSecondary: { backgroundColor: C.card2 },
  btnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 15 },
  chip: { backgroundColor: C.card2, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  chipOn: { backgroundColor: C.accent },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: C.card2, overflow: 'hidden' },
});
