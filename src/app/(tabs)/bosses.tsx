import { Text } from 'react-native';

import { CONFIG, daysBetween, winningAverageLb } from '@/engine';
import { useGame } from '@/state/GameProvider';
import { shortDate } from '@/ui/format';
import { Bar, C, Card, Row, Screen, t } from '@/ui/theme';

export default function Bosses() {
  const { loaded } = useGame();
  if (!loaded) return <Screen><Text style={t.muted}>Loading…</Text></Screen>;
  const { state, today } = loaded;
  const fb = state.fiveBoros;
  const cfg = CONFIG.bosses.fiveBoros;
  const days = daysBetween(today, cfg.eventDate);

  return (
    <Screen>
      <Card title="Five Boros">
        <Text style={t.muted}>
          {fb.defeated ? 'Defeated.' : days >= 0 ? `The tour is on ${shortDate(cfg.eventDate)}, ${days} days away.` : 'The tour date has passed.'}
        </Text>
        <Bar value={fb.hp} max={fb.maxHp} color={C.bad} />
        <Row left="Boss HP" right={`${fb.hp} / ${fb.maxHp}`} />
        <Text style={t.small}>
          Every minute on a bike (outdoors or in a class) deals 1 damage. Rides of {cfg.milestonesMiles.join(', ')} miles add bonus hits. Training alone leaves it at {Math.round(cfg.staggerFloorFraction * 100)}% HP; the finishing blow is the tour itself, a {cfg.finishingRideMiles}+ mile ride on the day.
        </Text>
        {fb.milestonesHitMiles.length > 0 && <Text style={t.small}>Milestones hit: {fb.milestonesHitMiles.join(', ')} miles.</Text>}
      </Card>

      <Card title="The Descent">
        {!state.descent ? (
          <Text style={t.muted}>Log a weigh-in to start the ladder. The boss HP follows your 7-day average weight.</Text>
        ) : (
          <>
            <Row left="7-day average" right={`${state.descent.effectiveAvgLb} lb`} />
            {state.descent.bosses.map((b) => (
              <Card key={b.thresholdLb} style={{ backgroundColor: C.card2 }}>
                <Row
                  left={`Below ${b.thresholdLb} lb`}
                  right={b.status === 'defeated' ? 'Defeated' : b.status === 'cleared_at_start' ? 'Already there' : b.status === 'active' ? 'Fighting' : 'Locked'}
                  rightColor={b.status === 'defeated' ? C.good : b.status === 'active' ? C.gold : C.faint}
                />
                {b.status === 'active' && (
                  <>
                    <Bar value={b.hp} max={b.maxHp + b.shieldHp} color={C.bad} />
                    <Text style={t.small}>
                      Win when the 7-day average is under {winningAverageLb(b).toFixed(1)} lb.
                      {b.shieldHp > 0 ? ' Missed weeks added a shield.' : ''}
                    </Text>
                  </>
                )}
              </Card>
            ))}
          </>
        )}
      </Card>

      {state.defeats.length > 0 && (
        <Card title="Defeated">
          {state.defeats.map((d) => (
            <Row key={`${d.boss}-${d.date}`} left={d.boss} right={shortDate(d.date)} />
          ))}
        </Card>
      )}
    </Screen>
  );
}
