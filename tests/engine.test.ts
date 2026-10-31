import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  weekStart,
  monthKey,
  estimateOneRepMax,
  applySets,
  scoreWorkout,
  scoreRecoveryDay,
  addXp,
  levelFromXp,
  coinsForXp,
  EMPTY_XP,
  initialStats,
  applyWorkout,
  computePhy,
  buildTier,
  type ActivityEvent,
  type ActivityKind,
} from '../src/engine';

const ev = (over: Partial<ActivityEvent>): ActivityEvent => ({
  id: 'x',
  kind: 'other',
  date: '2026-11-02',
  durationMin: 45,
  origins: ['test'],
  ...over,
});

test('dates: week starts on Monday, across month boundaries', () => {
  assert.equal(weekStart('2026-11-01'), '2026-10-26'); // Sunday → previous Monday
  assert.equal(weekStart('2026-11-02'), '2026-11-02'); // Monday
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(monthKey('2026-11-15'), '2026-11');
});

test('prs: Epley estimate and limits', () => {
  assert.equal(estimateOneRepMax(100, 1), 100);
  assert.ok(Math.abs((estimateOneRepMax(100, 5) ?? 0) - 116.667) < 0.01);
  assert.equal(estimateOneRepMax(100, 15), null);
  assert.equal(estimateOneRepMax(0, 5), null);
});

test('prs: history import sets baselines without reporting PRs', () => {
  const imported = applySets({}, [{ exercise: 'Bench Press (Barbell)', weightKg: 80, reps: 5 }], true);
  assert.equal(imported.prs.length, 0);
  assert.ok(imported.book['bench press (barbell)'] > 0);

  const same = applySets(imported.book, [{ exercise: 'Bench Press (Barbell)', weightKg: 80, reps: 5 }]);
  assert.equal(same.prs.length, 0);

  const heavier = applySets(imported.book, [
    { exercise: 'bench press (barbell)', weightKg: 120, reps: 1, warmup: true },
    { exercise: 'Bench Press (Barbell)', weightKg: 82.5, reps: 5 },
  ]);
  assert.equal(heavier.prs.length, 1);
  assert.equal(heavier.prs[0].exercise, 'bench press (barbell)');
});

test('prs: the first time an exercise appears is a baseline, not a PR', () => {
  const r = applySets({}, [{ exercise: 'Squat', weightKg: 100, reps: 5 }]);
  assert.equal(r.prs.length, 0);
});

test('xp: sessions under 20 minutes earn nothing', () => {
  const xp = scoreWorkout(ev({ kind: 'swim', durationMin: 15 }), { kindsEarlierThisWeek: new Set(), prCount: 0 });
  assert.deepEqual(xp, EMPTY_XP);
});

test('xp: swim scoring applies category weights', () => {
  const xp = scoreWorkout(ev({ kind: 'swim', durationMin: 45, distanceKm: 1.5, zone3PlusMin: 10 }), {
    kindsEarlierThisWeek: new Set(),
    prCount: 0,
  });
  assert.equal(xp.volume, (45 + 1.5 * 10) * 2);
  assert.equal(xp.intensity, 10 * 1.5 * 2);
  assert.equal(xp.variety, 20);
  assert.equal(xp.progression, 0);
  assert.equal(xp.total, 120 + 30 + 20);
});

test('xp: progression is the heaviest-weighted category', () => {
  const xp = scoreWorkout(ev({ kind: 'lift', durationMin: 20 }), { kindsEarlierThisWeek: new Set(['lift']), prCount: 1 });
  assert.equal(xp.progression, 120);
  assert.ok(xp.progression > xp.volume);
});

test('calibration: a good 3-workout week with one PR earns about a level and 800–1,000 coins', () => {
  const kinds = new Set<ActivityKind>();
  let total = EMPTY_XP;
  const workouts: [ActivityEvent, number][] = [
    [ev({ kind: 'lift', durationMin: 60, sets: Array.from({ length: 20 }, () => ({ exercise: 'Squat', weightKg: 60, reps: 5 })) }), 1],
    [ev({ kind: 'swim', durationMin: 45, distanceKm: 1.5, zone3PlusMin: 10 }), 0],
    [ev({ kind: 'ride', durationMin: 45, zone3PlusMin: 20 }), 0],
  ];
  for (const [w, prs] of workouts) {
    total = addXp(total, scoreWorkout(w, { kindsEarlierThisWeek: kinds, prCount: prs }));
    kinds.add(w.kind);
  }
  for (let d = 0; d < 7; d++) {
    total = addXp(total, scoreRecoveryDay({ date: '2026-11-02', sleepMin: 450, hrvMs: d < 4 ? 60 : 40 }, { sleepMin: 450, hrvMs: 50 }, d < 3));
  }
  assert.ok(total.total >= 600 && total.total <= 900, `week XP ${total.total}`);
  const coins = coinsForXp(total.total);
  assert.ok(coins >= 800 && coins <= 1000, `week coins ${coins}`);
  assert.equal(levelFromXp(total.total).level, 2);
});

test('levels: curve thresholds', () => {
  assert.deepEqual(levelFromXp(0), { level: 1, xpIntoLevel: 0, xpForNext: 600 });
  assert.equal(levelFromXp(599).level, 1);
  assert.equal(levelFromXp(600).level, 2);
  assert.equal(levelFromXp(600 + 675).level, 3);
  assert.equal(levelFromXp(600 + 675).xpForNext, 750);
});

test('stats: lifting raises STR, cardio raises END, new kinds raise AGI', () => {
  const s0 = initialStats();
  const lift = applyWorkout(s0, ev({ kind: 'lift', durationMin: 60 }), 2, true);
  assert.equal(lift.stats.STR, 10 + 0.5 + 2);
  assert.deepEqual(lift.trained.sort(), ['AGI', 'STR']);
  const swim = applyWorkout(s0, ev({ kind: 'swim', durationMin: 50 }), 0, false);
  assert.equal(swim.stats.END, 11);
  assert.deepEqual(swim.trained, ['END']);
});

test('stats: PHY follows body composition relative to baseline', () => {
  const base = { date: '2026-11-01', weightKg: 88, bodyFatPct: 24, leanMassKg: 66 };
  assert.equal(computePhy(base, { bodyFatPct: 24, leanMassKg: 66 }), 10);
  assert.equal(computePhy(base, { bodyFatPct: 21, leanMassKg: 67 }), 10 + 3 * 4 + 1 * 3);
  assert.equal(computePhy(undefined, undefined), 10);
});

test('stats: build tier rises with STR and PHY', () => {
  assert.equal(buildTier(initialStats()), 1);
  assert.equal(buildTier({ ...initialStats(), STR: 30, PHY: 20 }), 2);
  assert.equal(buildTier({ ...initialStats(), STR: 90, PHY: 80 }), 5);
});
