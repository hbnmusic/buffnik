import { Link, Stack } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CONFIG, initialStats, levelFromXp, STAT_KEYS } from '@/engine';

/** Placeholder home screen: proves the engine runs on the device. Real screens come next. */
export default function Home() {
  const level = levelFromXp(0);
  const stats = initialStats();

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Buffnik' }} />
      <Text style={styles.level}>Level {level.level}</Text>
      <Text style={styles.sub}>
        {level.xpIntoLevel} / {level.xpForNext} XP · target {CONFIG.week.targetWorkouts} workouts this week
      </Text>
      <View style={styles.stats}>
        {STAT_KEYS.map((k) => (
          <View key={k} style={styles.stat}>
            <Text style={styles.statKey}>{k}</Text>
            <Text style={styles.statValue}>{stats[k]}</Text>
          </View>
        ))}
      </View>
      <Link href="/diagnostics" asChild>
        <Pressable style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}>
          <Text style={styles.buttonText}>Check data sources</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12, backgroundColor: '#14121F' },
  level: { color: '#F4F1FF', fontSize: 40, fontWeight: '700' },
  sub: { color: '#A9A3C7', fontSize: 15 },
  stats: { flexDirection: 'row', gap: 8, marginTop: 16 },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: '#221E35' },
  statKey: { color: '#A9A3C7', fontSize: 12, letterSpacing: 1 },
  statValue: { color: '#F4F1FF', fontSize: 20, fontWeight: '600' },
  button: { marginTop: 24, backgroundColor: '#7C5CFF', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 16 },
});
