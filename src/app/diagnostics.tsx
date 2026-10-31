import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { availability, connect, diagnose, openHealthConnectSettings, type HcAvailability, type TypeSummary } from '@/data/healthConnect';

const LABELS: Record<string, string> = {
  ExerciseSession: 'Workouts',
  Distance: 'Distance',
  HeartRate: 'Heart rate',
  RestingHeartRate: 'Resting heart rate',
  HeartRateVariabilityRmssd: 'HRV',
  SleepSession: 'Sleep',
  Steps: 'Steps',
  Weight: 'Weight',
  BodyFat: 'Body fat',
  LeanBodyMass: 'Lean mass',
};

/** Shows which app wrote which kind of data in the last 30 days. */
export default function Diagnostics() {
  const [hc, setHc] = useState<HcAvailability | null>(null);
  const [rows, setRows] = useState<TypeSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setRows(await diagnose(30));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    availability()
      .then((a) => {
        setHc(a);
        if (a === 'available') return run();
      })
      .catch((e) => setError(String(e)));
  }, [run]);

  const onConnect = async () => {
    setBusy(true);
    setError(null);
    try {
      await connect();
      await run();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const anyMissing = rows?.some((r) => !r.granted) ?? true;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Data sources' }} />
      <Text style={styles.intro}>Which apps wrote data to Health Connect in the last 30 days.</Text>

      {hc && hc !== 'available' && (
        <Text style={styles.error}>
          {hc === 'needs_update' ? 'Health Connect needs an update.' : 'Health Connect is not available on this phone.'}
        </Text>
      )}

      {hc === 'available' && (
        <View style={styles.buttons}>
          {anyMissing && <Button label="Allow Buffnik to read Health Connect" onPress={onConnect} />}
          <Button label="Refresh" onPress={run} secondary />
          <Button label="Health Connect settings" onPress={openHealthConnectSettings} secondary />
        </View>
      )}

      {busy && <ActivityIndicator color="#B9A7FF" style={{ marginVertical: 16 }} />}
      {error && <Text style={styles.error}>{error}</Text>}

      {rows?.map((r) => (
        <View key={r.recordType} style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>{LABELS[r.recordType] ?? r.recordType}</Text>
            <Text style={styles.cardCount}>{r.granted ? `${r.total}` : 'not allowed'}</Text>
          </View>
          {r.error && <Text style={styles.error}>{r.error}</Text>}
          {r.granted && r.total === 0 && !r.error && <Text style={styles.muted}>No records</Text>}
          {r.origins.map((o) => (
            <View key={o.origin} style={styles.originRow}>
              <Text style={styles.origin}>{o.label}</Text>
              <Text style={styles.originCount}>{o.count}</Text>
              {o.detail && (
                <Text style={styles.detail}>
                  {Object.entries(o.detail)
                    .sort((a, b) => b[1] - a[1])
                    .map(([name, n]) => `${name} ×${n}`)
                    .join(' · ')}
                </Text>
              )}
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

function Button({ label, onPress, secondary }: { label: string; onPress: () => void; secondary?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.buttonSecondary, pressed && { opacity: 0.7 }]}>
      <Text style={[styles.buttonText, secondary && styles.buttonTextSecondary]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#14121F' },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  intro: { color: '#A9A3C7', fontSize: 14 },
  buttons: { gap: 8 },
  button: { backgroundColor: '#7C5CFF', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  buttonSecondary: { backgroundColor: '#221E35' },
  buttonText: { color: '#FFFFFF', fontWeight: '600' },
  buttonTextSecondary: { color: '#D9D2FF' },
  card: { backgroundColor: '#1C1930', borderRadius: 12, padding: 12, gap: 6 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between' },
  cardTitle: { color: '#F4F1FF', fontSize: 16, fontWeight: '600' },
  cardCount: { color: '#A9A3C7' },
  originRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingTop: 4 },
  origin: { color: '#E6E1FF' },
  originCount: { color: '#E6E1FF', fontVariant: ['tabular-nums'] },
  detail: { color: '#8E88AD', fontSize: 12, width: '100%' },
  muted: { color: '#8E88AD' },
  error: { color: '#FF8A8A' },
});
