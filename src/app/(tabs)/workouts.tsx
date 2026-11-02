import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { CONFIG, type ActivityEvent } from '@/engine';
import { originLabel } from '@/data/originSummary';
import { useGame } from '@/state/GameProvider';
import { shortDate } from '@/ui/format';
import { Btn, C, Card, inputStyle, Row, Screen, t } from '@/ui/theme';

function WorkoutCard({ w, editable }: { w: ActivityEvent; editable: boolean }) {
  const { setWorkoutLength } = useGame();
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const tooShort = w.durationMin < CONFIG.minCreditedMinutes;
  const workingSets = w.sets ? w.sets.filter((s) => !s.warmup).length : 0;
  const note = tooShort
    ? `Not counted: under ${CONFIG.minCreditedMinutes} minutes.${editable ? ' Tap to set how long it really took.' : ''}`
    : w.edited
      ? 'Length set by you.'
      : w.estimated
        ? `Length estimated from ${workingSets} working sets. Tap to change it.`
        : null;

  const save = async (value: number | null) => {
    setError(null);
    setBusy(true);
    try {
      await setWorkoutLength(w.id, value);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      disabled={!editable}
      onPress={() => {
        setMinutes(String(w.durationMin));
        setOpen((v) => !v);
      }}
    >
      <Card>
        <Row left={`${w.kind[0].toUpperCase()}${w.kind.slice(1)} · ${w.durationMin} min`} right={shortDate(w.date)} />
        <Text style={t.small}>
          {[w.distanceKm ? `${w.distanceKm} km` : null, w.sets ? `${w.sets.length} sets` : null, w.zone3PlusMin ? `${w.zone3PlusMin} min hard` : null, w.manual ? 'logged by hand' : w.origins.map(originLabel).join(' + ')]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        {note && <Text style={[t.small, tooShort && { color: C.gold }]}>{note}</Text>}
        {open && (
          <View style={{ gap: 8, marginTop: 4 }}>
            <Text style={t.small}>How long did it take (minutes)?</Text>
            <TextInput style={inputStyle} value={minutes} onChangeText={setMinutes} keyboardType="decimal-pad" placeholder="45" placeholderTextColor={C.faint} />
            {error && <Text style={t.error}>{error}</Text>}
            <Btn label="Save length" onPress={() => save(parseFloat(minutes.replace(',', '.')))} disabled={busy} />
            {w.edited && <Btn label="Back to the recorded length" onPress={() => save(null)} secondary disabled={busy} />}
          </View>
        )}
      </Card>
    </Pressable>
  );
}

export default function Workouts() {
  const { loaded } = useGame();
  if (!loaded) return <Screen><Text style={t.muted}>Loading…</Text></Screen>;

  const counted = loaded.workouts.filter((w) => w.date >= loaded.startDate);
  const history = loaded.workouts.filter((w) => w.date < loaded.startDate);

  return (
    <Screen>
      {counted.length === 0 && <Text style={t.muted}>No workouts yet this game. Sync, import from Strong, or log one.</Text>}
      {counted.length > 0 && (
        <Text style={t.small}>
          A workout counts when it lasts {CONFIG.minCreditedMinutes} minutes or more. Tap a workout to set its real length.
        </Text>
      )}
      {counted.slice(0, 100).map((w) => <WorkoutCard key={w.id} w={w} editable />)}
      {history.length > 0 && (
        <>
          <Text style={[t.h2, { marginTop: 8 }]}>Before the game started</Text>
          <Text style={t.small}>These earn no XP. Lifts here set your PR baselines.</Text>
          {history.slice(0, 50).map((w) => <WorkoutCard key={w.id} w={w} editable={false} />)}
        </>
      )}
      <Text style={t.small}>{loaded.walks.length} short or slow walks are not counted as workouts. They feed steps and recovery.</Text>
    </Screen>
  );
}
