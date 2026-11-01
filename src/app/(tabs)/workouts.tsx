import { Text } from 'react-native';

import { originLabel } from '@/data/originSummary';
import { useGame } from '@/state/GameProvider';
import { shortDate } from '@/ui/format';
import { Card, Row, Screen, t } from '@/ui/theme';

export default function Workouts() {
  const { loaded } = useGame();
  if (!loaded) return <Screen><Text style={t.muted}>Loading…</Text></Screen>;

  const counted = loaded.workouts.filter((w) => w.date >= loaded.startDate);
  const history = loaded.workouts.filter((w) => w.date < loaded.startDate);
  const show = (w: (typeof counted)[number]) => (
    <Card key={w.id}>
      <Row left={`${w.kind[0].toUpperCase()}${w.kind.slice(1)} · ${w.durationMin} min`} right={shortDate(w.date)} />
      <Text style={t.small}>
        {[w.distanceKm ? `${w.distanceKm} km` : null, w.sets ? `${w.sets.length} sets` : null, w.zone3PlusMin ? `${w.zone3PlusMin} min hard` : null, w.manual ? 'logged by hand' : w.origins.map(originLabel).join(' + ')]
          .filter(Boolean)
          .join(' · ')}
      </Text>
    </Card>
  );

  return (
    <Screen>
      {counted.length === 0 && <Text style={t.muted}>No workouts yet this game. Sync, import from Strong, or log one.</Text>}
      {counted.slice(0, 100).map(show)}
      {history.length > 0 && (
        <>
          <Text style={[t.h2, { marginTop: 8 }]}>Before the game started</Text>
          <Text style={t.small}>These earn no XP. Lifts here set your PR baselines.</Text>
          {history.slice(0, 50).map(show)}
        </>
      )}
      <Text style={t.small}>{loaded.walks.length} short or slow walks are not counted as workouts. They feed steps and recovery.</Text>
    </Screen>
  );
}
