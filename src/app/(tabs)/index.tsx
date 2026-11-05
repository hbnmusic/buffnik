import { router } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { CONFIG } from '@/engine';
import { activeCharacter } from '@/state/characters';
import { CharacterView } from '@/ui/CharacterView';
import { wornGear } from '@/ui/gearPlacement';
import { useGame } from '@/state/GameProvider';
import { describeDrop, shortDate, STAT_NAMES } from '@/ui/format';
import { Bar, Btn, C, Card, Row, Screen, t } from '@/ui/theme';

export default function Home() {
  const { loaded, error, syncing, syncMessage, sync } = useGame();

  if (error) {
    return (
      <Screen>
        <Text style={t.error}>Could not open the database: {error}</Text>
      </Screen>
    );
  }
  if (!loaded) {
    return (
      <Screen>
        <ActivityIndicator color={C.accentSoft} style={{ marginTop: 48 }} />
      </Screen>
    );
  }

  const { state, workouts } = loaded;
  const { level, thisWeek } = state;
  const hero = activeCharacter(loaded.characters);
  const heroLook = loaded.lookCatalog.find((l) => l.id === hero.lookId) ?? loaded.lookCatalog[0];
  const empty = workouts.length === 0 && state.totalXp === 0;

  return (
    <Screen>
      <Card>
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          <Pressable onPress={() => router.push('/character')}>
            <CharacterView character={hero} look={heroLook} tier={state.buildTier} width={92} gear={wornGear(hero.gear, hero.fit, loaded.lookCatalog)} />
          </Pressable>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={t.h1}>Level {level.level}</Text>
            <Text style={[t.h2, { color: C.gold }]}>{state.coins.toLocaleString()} coins</Text>
          </View>
        </View>
        <Bar value={level.xpIntoLevel} max={level.xpForNext} />
        <Text style={t.muted}>
          {level.xpIntoLevel} / {level.xpForNext} XP · {state.totalXp.toLocaleString()} XP total
        </Text>
      </Card>

      <Card title="This week">
        <Row left={`Workouts: ${thisWeek.credited} of ${thisWeek.required}`} right={thisWeek.credited >= thisWeek.required ? 'On target' : ''} rightColor={C.good} />
        <Bar value={thisWeek.credited} max={Math.max(1, thisWeek.required)} color={thisWeek.credited >= thisWeek.required ? C.good : C.accent} />
        <Text style={t.small}>
          {state.streakWeeks} week streak · {state.freezes} of {CONFIG.week.maxBankedFreezes} freezes
          {thisWeek.pausedDays > 0 ? ` · ${thisWeek.pausedDays} paused days` : ''}
        </Text>
      </Card>

      {empty && (
        <Card>
          <Text style={t.body}>Nothing counted yet. Sync Health Connect, import a Strong CSV, or log a workout to start earning XP.</Text>
          <Text style={t.small}>The game started on {shortDate(loaded.startDate)}. Earlier workouts only set your lifting records.</Text>
        </Card>
      )}

      <Card title={`Stats · build tier ${state.buildTier}`}>
        {(Object.keys(STAT_NAMES) as (keyof typeof STAT_NAMES)[]).map((k) => (
          <View key={k} style={{ gap: 4 }}>
            <Row left={STAT_NAMES[k]} right={state.stats[k as 'STR'].toFixed(1)} />
            <Bar value={state.stats[k as 'STR']} max={100} color={C.accentSoft} />
          </View>
        ))}
      </Card>

      {state.drops.length > 0 && (
        <Card title="Latest loot">
          {[...state.drops]
            .reverse()
            .slice(0, 3)
            .map((d) => (
              <Row key={d.eventId} left={describeDrop(d.drop)} right={shortDate(d.date)} />
            ))}
        </Card>
      )}

      <Btn label={syncing ? 'Syncing…' : 'Sync Health Connect'} onPress={() => sync(true)} disabled={syncing} />
      {syncMessage && <Text style={t.small}>{syncMessage}</Text>}
      <Btn label="Log a workout" onPress={() => router.push('/log-workout')} secondary />
      <Btn label="Log your weight" onPress={() => router.push('/log-weight')} secondary />
      <Btn label="Import from Strong" onPress={() => router.push('/import-strong')} secondary />
      <Btn label="Data sources" onPress={() => router.push('/diagnostics')} secondary />
      <Btn label="Settings" onPress={() => router.push('/settings')} secondary />
      <Text style={t.small}>Last synced: {loaded.lastSync ? new Date(loaded.lastSync).toLocaleString() : 'never'}</Text>
    </Screen>
  );
}
