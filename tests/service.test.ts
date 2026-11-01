import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyHealthData, buy, importStrong, loadGame, logWeight, logWorkout } from '../src/state/service';
import { createMemoryStore } from '../src/state/store';
import type { RawSession } from '../src/data/ingest';

const TODAY = '2026-11-03';
const local = (date: string, h: number, m = 0) => {
  const [y, mo, d] = date.split('-').map(Number);
  return new Date(y, mo - 1, d, h, m).getTime();
};

const CSV = `Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE
2026-11-03 09:00:00,Push,1h,Bench Press,1,135,8,0,0,,,
2026-11-03 09:00:00,Push,1h,Bench Press,2,145,6,0,0,,,
2026-10-20 09:00:00,Pull,50m,Barbell Row,1,115,8,0,0,,,
`;

test('service: the game starts on first run and stays there', async () => {
  const store = createMemoryStore();
  const first = await loadGame(store, '2026-11-01');
  assert.equal(first.startDate, '2026-11-01');
  const later = await loadGame(store, '2026-11-20');
  assert.equal(later.startDate, '2026-11-01');
});

test('service: importing a Strong CSV adds workouts, and importing it again adds nothing', async () => {
  const store = createMemoryStore();
  await loadGame(store, '2026-11-01'); // game starts 11-01, so the 10-20 workout is history
  const first = await importStrong(store, CSV, 'lb', TODAY);
  assert.equal(first.inFile, 2);
  assert.equal(first.added, 2);
  assert.equal(first.beforeStart, 1);

  const again = await importStrong(store, CSV, 'lb', TODAY);
  assert.equal(again.added, 0);
  assert.equal(again.alreadyImported, 2);

  const g = await loadGame(store, TODAY);
  assert.equal(g.workouts.length, 2);
  assert.ok(g.state.totalXp > 0); // the 11-03 workout counts; the 10-20 one only set a baseline
});

test('service: a Strong workout that Health Connect also recorded counts once', async () => {
  const store = createMemoryStore();
  await loadGame(store, '2026-11-01');
  const hc: RawSession = {
    id: 'hc:com.google.android.apps.fitness:1',
    origin: 'com.google.android.apps.fitness',
    typeName: 'STRENGTH_TRAINING',
    startMs: local('2026-11-03', 9, 2),
    endMs: local('2026-11-03', 10, 1),
  };
  await applyHealthData(store, { fromMs: local('2026-10-01', 0), sessions: [hc], recovery: [], body: [] });
  const summary = await importStrong(store, CSV, 'lb', TODAY);
  assert.equal(summary.matchedHealthConnect, 1);
  const g = await loadGame(store, TODAY);
  assert.equal(g.workouts.filter((w) => w.date === '2026-11-03').length, 1);
  assert.ok(g.workouts.find((w) => w.date === '2026-11-03')!.sets);
});

test('service: syncing again replaces Health Connect sessions instead of piling up', async () => {
  const store = createMemoryStore();
  await loadGame(store, '2026-11-01');
  const swim = (id: string, startMs: number): RawSession => ({ id, origin: 'com.ultrahuman.android', typeName: 'SWIMMING_POOL', startMs, endMs: startMs + 45 * 60_000 });
  const from = local('2026-10-01', 0);
  await applyHealthData(store, { fromMs: from, sessions: [swim('hc:u:1', local('2026-11-02', 18))], recovery: [], body: [] });
  await applyHealthData(store, { fromMs: from, sessions: [swim('hc:u:1', local('2026-11-02', 18)), swim('hc:u:2', local('2026-11-03', 18))], recovery: [], body: [] });
  assert.equal((await loadGame(store, TODAY)).workouts.length, 2);
});

test('service: manual workouts and weigh-ins are credited and drive the game', async () => {
  const store = createMemoryStore();
  await loadGame(store, '2026-11-01');
  await logWorkout(store, { kind: 'walk', date: '2026-11-02', durationMin: 30 }); // a short manual walk still counts
  await logWorkout(store, { kind: 'swim', date: '2026-11-02', durationMin: 40 });
  await logWeight(store, '2026-11-03', 188.4);
  const g = await loadGame(store, TODAY);
  assert.equal(g.workouts.length, 2);
  assert.equal(g.latestWeightLb, 188.4);
  assert.ok(g.state.descent);
  await assert.rejects(() => logWeight(store, TODAY, 12), /wrong/);
});

test('service: buying spends coins and budget, and refuses what you cannot afford', async () => {
  const store = createMemoryStore();
  await loadGame(store, '2026-11-01');
  const poor = await buy(store, 'wine', TODAY);
  assert.equal(poor.ok, false);

  // Earn enough coins: many long swims.
  for (let d = 2; d <= 3; d++) {
    await logWorkout(store, { kind: 'swim', date: `2026-11-0${d}`, durationMin: 120 });
    await logWorkout(store, { kind: 'ride', date: `2026-11-0${d}`, durationMin: 120, distanceKm: 40 });
  }
  const before = await loadGame(store, TODAY);
  assert.ok(before.state.coins >= 80);
  const r = await buy(store, 'cocktail-home', TODAY); // $8 = 80 coins
  assert.equal(r.ok, true);
  const after = await loadGame(store, TODAY);
  assert.ok(after.state.coins <= before.state.coins - 80 + 1);
  assert.equal(after.state.budget.spentUsd, 8);
});

test('service: the weight unit of the last Strong import is remembered for one-tap imports', async () => {
  const store = createMemoryStore();
  assert.equal((await loadGame(store, '2026-11-01')).strongUnit, 'lb');
  await importStrong(store, CSV, 'kg', TODAY);
  assert.equal((await loadGame(store, TODAY)).strongUnit, 'kg');
});

test('service: re-importing in the other unit corrects the sets instead of duplicating', async () => {
  const store = createMemoryStore();
  await loadGame(store, '2026-11-01');
  await importStrong(store, CSV, 'lb', TODAY);
  await importStrong(store, CSV, 'kg', TODAY);
  const g = await loadGame(store, TODAY);
  assert.equal(g.workouts.filter((w) => w.date === '2026-11-03').length, 1);
  assert.equal(g.workouts.find((w) => w.date === '2026-11-03')!.sets![0].weightKg, 135); // read as kg this time
});
