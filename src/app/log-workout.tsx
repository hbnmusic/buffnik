import { router } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { addDays, KM_PER_MILE, type ActivityKind } from '@/engine';
import { useGame } from '@/state/GameProvider';
import { Btn, C, Card, Chip, inputStyle, Screen, t } from '@/ui/theme';

const KINDS: { kind: ActivityKind; label: string }[] = [
  { kind: 'swim', label: 'Swim' },
  { kind: 'lift', label: 'Lift' },
  { kind: 'ride', label: 'Ride' },
  { kind: 'run', label: 'Run' },
  { kind: 'walk', label: 'Walk' },
  { kind: 'class', label: 'Class' },
  { kind: 'other', label: 'Other' },
];

export default function LogWorkout() {
  const { loaded, addWorkout } = useGame();
  const [kind, setKind] = useState<ActivityKind>('swim');
  const [daysAgo, setDaysAgo] = useState(0);
  const [minutes, setMinutes] = useState('');
  const [distance, setDistance] = useState('');
  const [miles, setMiles] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const hasDistance = kind === 'ride' || kind === 'run' || kind === 'walk';

  const save = async () => {
    if (!loaded) return;
    setError(null);
    setBusy(true);
    try {
      const d = parseFloat(distance.replace(',', '.'));
      await addWorkout({
        kind,
        date: addDays(loaded.today, -daysAgo),
        durationMin: parseFloat(minutes.replace(',', '.')),
        ...(hasDistance && d > 0 ? { distanceKm: miles ? d * KM_PER_MILE : d } : {}),
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Card title="What">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {KINDS.map((k) => (
            <Chip key={k.kind} label={k.label} selected={kind === k.kind} onPress={() => setKind(k.kind)} />
          ))}
        </View>
      </Card>
      <Card title="When">
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {['Today', 'Yesterday', '2 days ago'].map((label, i) => (
            <Chip key={label} label={label} selected={daysAgo === i} onPress={() => setDaysAgo(i)} />
          ))}
        </View>
      </Card>
      <Card title="How long (minutes)">
        <TextInput style={inputStyle} value={minutes} onChangeText={setMinutes} keyboardType="decimal-pad" placeholder="45" placeholderTextColor={C.faint} />
      </Card>
      {hasDistance && (
        <Card title="Distance (optional)">
          <TextInput style={inputStyle} value={distance} onChangeText={setDistance} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={C.faint} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip label="Miles" selected={miles} onPress={() => setMiles(true)} />
            <Chip label="Kilometers" selected={!miles} onPress={() => setMiles(false)} />
          </View>
        </Card>
      )}
      <Text style={t.small}>Workouts you log by hand are credited in full, including short walks.</Text>
      {error && <Text style={t.error}>{error}</Text>}
      <Btn label="Save" onPress={save} disabled={busy || !loaded} />
    </Screen>
  );
}
