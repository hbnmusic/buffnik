import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LB_PER_KG, replay, type ActivityEvent, type GameInputs, type Purchase } from '../src/engine';

const START = '2026-11-02'; // a Monday

const act = (over: Partial<ActivityEvent> & { date: string }): ActivityEvent => ({
  id: `a-${over.date}-${over.kind ?? 'other'}`,
  kind: 'swim',
  durationMin: 45,
  origins: ['test'],
  ...over,
});

const inputs = (over: Partial<GameInputs>): GameInputs => ({
  startDate: START,
  today: '2026-11-08',
  activities: [],
  recovery: [],
  body: [],
  purchases: [],
  ...over,
});

const bench = (kg: number) => [{ exercise: 'Bench Press', weightKg: kg, reps: 5 }];

test('replay: a new game starts at level 1 with nothing earned', () => {
  const s = replay(inputs({}));
  assert.equal(s.level.level, 1);
  assert.equal(s.totalXp, 0);
  assert.equal(s.coins, 0);
  assert.equal(s.thisWeek.required, 2);
});

test('replay: history before the start date earns no XP but sets the PR baseline', () => {
  const history = act({ date: '2026-10-20', kind: 'lift', durationMin: 60, sets: bench(80) });
  const before = replay(inputs({ activities: [history] }));
  assert.equal(before.totalXp, 0);
  assert.ok(before.prBook['bench press']);

  // Matching the old best is no PR; beating it is.
  const same = replay(inputs({ activities: [history, act({ id: 'x', date: '2026-11-03', kind: 'lift', sets: bench(80) })] }));
  const heavier = replay(inputs({ activities: [history, act({ id: 'y', date: '2026-11-03', kind: 'lift', sets: bench(85) })] }));
  assert.equal(same.breakdown.progression, 0);
  assert.equal(heavier.breakdown.progression, 120); // 1 PR x 40 points x weight 3
  assert.ok(heavier.totalXp > same.totalXp);
});

test('replay: two credited workouts make an on-target week and start a streak', () => {
  const s = replay(
    inputs({
      today: '2026-11-09',
      activities: [act({ date: '2026-11-03' }), act({ date: '2026-11-05', kind: 'lift' })],
    }),
  );
  assert.deepEqual(
    s.weeks.map((w) => w.outcome),
    ['on_target'],
  );
  assert.equal(s.streakWeeks, 1);
  assert.ok(s.totalXp > 0 && s.coins > 0);
  assert.equal(s.thisWeek.weekStart, '2026-11-09');
  assert.equal(s.thisWeek.credited, 0);
});

test('replay: sessions under the minimum length earn nothing and do not count', () => {
  const s = replay(inputs({ today: '2026-11-09', activities: [act({ date: '2026-11-03', durationMin: 10 }), act({ id: 'b', date: '2026-11-04', durationMin: 15 })] }));
  assert.equal(s.totalXp, 0);
  assert.equal(s.weeks[0].outcome, 'missed');
});

test('replay: a missed week takes coins and lets the boss recover', () => {
  const rides = [act({ id: 'r1', date: '2026-11-03', kind: 'ride', durationMin: 60 }), act({ id: 'r2', date: '2026-11-04', kind: 'ride', durationMin: 60 })];
  const onTarget = replay(inputs({ today: '2026-11-09', activities: rides }));
  assert.equal(onTarget.fiveBoros.hp, 880);

  // Week 2 has nothing, so it is missed once week 3 starts.
  const missed = replay(inputs({ today: '2026-11-16', activities: rides }));
  assert.deepEqual(
    missed.weeks.map((w) => [w.outcome, w.coinPenalty]),
    [
      ['on_target', 0],
      ['missed', 250],
    ],
  );
  assert.equal(missed.fiveBoros.hp, 980);
  assert.equal(missed.coins, onTarget.coins - 250);
});

test('replay: purchases spend coins and budget, and pause passes shrink the target', () => {
  const rides = [act({ id: 'r1', date: '2026-11-03', kind: 'ride', durationMin: 60 }), act({ id: 'r2', date: '2026-11-04', kind: 'ride', durationMin: 60 })];
  const cocktail: Purchase = { id: 'p1', date: '2026-11-06', itemId: 'cocktail-out', name: 'Go out for a cocktail', kind: 'real', coinCost: 220, usdFromMonth: 22, usdFromVault: 0 };
  const base = replay(inputs({ activities: rides }));
  const bought = replay(inputs({ activities: rides, purchases: [cocktail] }));
  assert.equal(base.coins - bought.coins, 220);
  assert.equal(bought.budget.spentUsd, 22);

  const pass = (i: number): Purchase => ({ id: `pp${i}`, date: '2026-11-02', itemId: 'pause-day', name: 'Pause pass', kind: 'utility', coinCost: 0, usdFromMonth: 0, usdFromVault: 0, coverDate: `2026-11-0${3 + i}` });
  const paused = replay(inputs({ purchases: [pass(0), pass(1), pass(2), pass(3)] }));
  assert.equal(paused.thisWeek.pausedDays, 4);
  assert.equal(paused.thisWeek.required, 1); // ceil(2 x 3 / 7)
});

test('replay: the weight ladder starts from the first weigh-in and a boss falls when the 7-day average crosses its line', () => {
  const kg = (lb: number) => lb / LB_PER_KG;
  const s = replay(
    inputs({
      today: '2026-11-16',
      body: [
        { date: '2026-11-02', weightKg: kg(191) },
        { date: '2026-11-16', weightKg: kg(188) },
      ],
    }),
  );
  assert.ok(s.descent);
  assert.deepEqual(s.defeats.map((d) => d.boss), ['Descent 190 lb']);
  assert.equal(s.descent!.bosses.find((b) => b.thresholdLb === 190)!.status, 'defeated');
  assert.ok(s.drops.length >= 1); // a boss defeat guarantees a drop
});

test('replay: the same inputs always give the same state', () => {
  const i = inputs({ today: '2026-11-16', activities: [act({ date: '2026-11-03' }), act({ id: 'z', date: '2026-11-10', kind: 'lift', sets: bench(60) })] });
  assert.deepEqual(replay(i), replay(i));
});
