import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildActivityEvents,
  buildBodyComp,
  buildDailyRecovery,
  deviceLocalDate,
  kindFromTypeName,
  strongToRaw,
  sleepMinutes,
  summarizeRecovery,
  type RawSession,
} from '../src/data/ingest';

const MIN = 60_000;
// Fixed zone so tests do not depend on the machine: UTC date.
const utcDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const T0 = Date.UTC(2026, 10, 2, 12, 0); // Mon 2026-11-02 12:00 UTC

const session = (over: Partial<RawSession> & { startMin: number; durMin: number }): RawSession => {
  const { startMin, durMin, ...rest } = over;
  return {
    id: `hc:${rest.origin ?? 'com.google.android.apps.fitness'}:${Math.random()}`,
    origin: 'com.google.android.apps.fitness',
    typeName: 'WALKING',
    startMs: T0 + startMin * MIN,
    endMs: T0 + (startMin + durMin) * MIN,
    ...rest,
  };
};

test('kinds: Health Connect exercise types map to game activity kinds', () => {
  assert.equal(kindFromTypeName('SWIMMING_POOL'), 'swim');
  assert.equal(kindFromTypeName('SWIMMING_OPEN_WATER'), 'swim');
  assert.equal(kindFromTypeName('BIKING_STATIONARY'), 'ride');
  assert.equal(kindFromTypeName('STRENGTH_TRAINING'), 'lift');
  assert.equal(kindFromTypeName('WEIGHTLIFTING'), 'lift');
  assert.equal(kindFromTypeName('HIGH_INTENSITY_INTERVAL_TRAINING'), 'class');
  assert.equal(kindFromTypeName('RUNNING_TREADMILL'), 'run');
  assert.equal(kindFromTypeName('HIKING'), 'other');
  assert.equal(kindFromTypeName('type 999'), 'other');
});

test('walks: short auto-detected walks are not workouts', () => {
  const r = buildActivityEvents([session({ startMin: 0, durMin: 12 }), session({ startMin: 300, durMin: 20 })], utcDate);
  assert.equal(r.workouts.length, 0);
  assert.equal(r.walks.length, 2);
});

test('walks: fragments within the gap merge and can reach the workout threshold', () => {
  const r = buildActivityEvents(
    [
      session({ startMin: 0, durMin: 20, distanceKm: 1.5 }),
      session({ startMin: 25, durMin: 15, distanceKm: 1 }), // 5 min gap
      session({ startMin: 45, durMin: 20, distanceKm: 1.5 }), // 5 min gap
    ],
    utcDate,
  );
  assert.equal(r.walks.length, 0);
  assert.equal(r.workouts.length, 1);
  assert.equal(r.workouts[0].kind, 'walk');
  assert.equal(r.workouts[0].durationMin, 65);
  assert.equal(r.workouts[0].distanceKm, 4);
});

test('walks: a gap longer than the limit keeps walks separate', () => {
  const r = buildActivityEvents([session({ startMin: 0, durMin: 30 }), session({ startMin: 60, durMin: 30 })], utcDate);
  assert.equal(r.walks.length, 2);
});

test('walks: the same walk from two apps is not double counted', () => {
  const r = buildActivityEvents(
    [
      session({ startMin: 0, durMin: 50, distanceKm: 4, origin: 'com.google.android.apps.fitness' }),
      session({ startMin: 1, durMin: 49, distanceKm: 4, origin: 'com.ultrahuman.android' }),
    ],
    utcDate,
  );
  assert.equal(r.workouts.length, 1);
  assert.equal(r.workouts[0].durationMin, 50);
  assert.equal(r.workouts[0].distanceKm, 4);
  assert.equal(r.workouts[0].origins.length, 2);
});

test('walks: a walk inside a swim is part of the swim', () => {
  const r = buildActivityEvents(
    [
      session({ startMin: 0, durMin: 40, typeName: 'SWIMMING_POOL', origin: 'com.ultrahuman.android' }),
      session({ startMin: 5, durMin: 30, typeName: 'WALKING' }),
    ],
    utcDate,
  );
  assert.equal(r.walks.length, 0);
  assert.deepEqual(
    r.workouts.map((w) => w.kind),
    ['swim'],
  );
});

test('dedup: the same lift from Strong and Google Fit counts once, Strong wins', () => {
  const r = buildActivityEvents(
    [
      session({ startMin: 0, durMin: 60, typeName: 'STRENGTH_TRAINING', origin: 'com.google.android.apps.fitness', id: 'hc:fit:1' }),
      session({ startMin: 2, durMin: 55, typeName: 'WEIGHTLIFTING', origin: 'io.strongapp.strong', id: 'hc:strong:1' }),
    ],
    utcDate,
  );
  assert.equal(r.workouts.length, 1);
  assert.equal(r.workouts[0].id, 'hc:strong:1');
  assert.equal(r.workouts[0].durationMin, 55);
  assert.equal(r.workouts[0].kind, 'lift');
});

test('dedup: an unlabelled session takes the kind of the labelled duplicate', () => {
  const r = buildActivityEvents(
    [
      session({ startMin: 0, durMin: 45, typeName: 'OTHER_WORKOUT', origin: 'com.strava' }),
      session({ startMin: 0, durMin: 45, typeName: 'SWIMMING_POOL', origin: 'com.ultrahuman.android' }),
    ],
    utcDate,
  );
  assert.equal(r.workouts.length, 1);
  assert.equal(r.workouts[0].kind, 'swim');
});

test('dedup: back-to-back different sessions stay separate', () => {
  const r = buildActivityEvents(
    [
      session({ startMin: 0, durMin: 40, typeName: 'SWIMMING_POOL', origin: 'com.ultrahuman.android' }),
      session({ startMin: 45, durMin: 40, typeName: 'STRENGTH_TRAINING', origin: 'io.strongapp.strong' }),
    ],
    utcDate,
  );
  assert.equal(r.workouts.length, 2);
});

test('sleep: awake and out-of-bed stages are not counted as sleep', () => {
  const start = T0;
  assert.equal(sleepMinutes({ startMs: start, endMs: start + 480 * MIN }), 480);
  assert.equal(
    sleepMinutes({
      startMs: start,
      endMs: start + 480 * MIN,
      stages: [
        { startMs: start, endMs: start + 400 * MIN, stage: 4 },
        { startMs: start + 400 * MIN, endMs: start + 430 * MIN, stage: 1 },
        { startMs: start + 430 * MIN, endMs: start + 480 * MIN, stage: 5 },
      ],
    }),
    450,
  );
});

test('recovery: sleep goes to the wake-up date, HRV is averaged, steps are carried', () => {
  const night = Date.UTC(2026, 10, 2, 3, 0); // 03:00 UTC on 11-02
  const rows = buildDailyRecovery(
    {
      sleep: [{ startMs: night - 7 * 60 * MIN, endMs: night + 60 * MIN }],
      hrv: [
        { timeMs: night, rmssdMs: 50 },
        { timeMs: night + 30 * MIN, rmssdMs: 60 },
      ],
      steps: [{ date: '2026-11-02', count: 9000 }],
    },
    utcDate,
  );
  assert.deepEqual(rows, [{ date: '2026-11-02', sleepMin: 480, hrvMs: 55, steps: 9000 }]);
});

test('body: last weigh-in of the day, with that day body fat and lean mass', () => {
  const rows = buildBodyComp(
    {
      weights: [
        { timeMs: T0, kg: 86.4 },
        { timeMs: T0 + 5 * 60 * MIN, kg: 85.9 },
        { timeMs: T0 + 24 * 60 * MIN, kg: 85.5 }, // next day
      ],
      bodyFat: [{ timeMs: T0 + 5 * 60 * MIN, pct: 21.34 }],
      leanMass: [],
    },
    utcDate,
  );
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { date: '2026-11-02', weightKg: 85.9, bodyFatPct: 21.3 });
  assert.equal(rows[1].weightKg, 85.5);
});

test('recovery summary: averages only the days that have each measurement', () => {
  const s = summarizeRecovery([
    { date: '2026-11-01', sleepMin: 420, steps: 8000 },
    { date: '2026-11-02', sleepMin: 480, hrvMs: 50, steps: 10000 },
    { date: '2026-11-03', steps: 6000 },
  ]);
  assert.deepEqual(s, { nights: 2, avgSleepMin: 450, avgHrvMs: 50, avgSteps: 8000 });
  assert.deepEqual(summarizeRecovery([]), { nights: 0, avgSleepMin: undefined, avgHrvMs: undefined, avgSteps: undefined });
});

test('walks: long but slow wandering is not a workout; a brisk walk is', () => {
  const slow = buildActivityEvents([session({ startMin: 0, durMin: 122, distanceKm: 0.79 })], utcDate);
  assert.equal(slow.workouts.length, 0);
  assert.equal(slow.walks.length, 1);
  const brisk = buildActivityEvents([session({ startMin: 0, durMin: 60, distanceKm: 5 })], utcDate);
  assert.equal(brisk.workouts.length, 1);
  const noDistance = buildActivityEvents([session({ startMin: 0, durMin: 60 })], utcDate);
  assert.equal(noDistance.workouts.length, 1);
});

// Strong CSV times are local, so build them the way the importer reads them.
const strongSession = (startedAt: string, durationMin: number) => ({
  key: `${startedAt}|Push`,
  date: startedAt.slice(0, 10),
  startedAt,
  name: 'Push',
  durationMin,
  sets: [{ exercise: 'Bench Press', weightKg: 80, reps: 5 }],
});

test('strong import: a CSV workout that Health Connect also recorded counts once and keeps its sets', () => {
  const csv = strongToRaw(strongSession('2026-11-02 12:00:00', 60))!;
  const hcStrong = { ...session({ startMin: 0, durMin: 58, typeName: 'STRENGTH_TRAINING', origin: 'io.strongapp.strong' }), startMs: csv.startMs + MIN, endMs: csv.startMs + 59 * MIN };
  const hcFit = { ...session({ startMin: 0, durMin: 60, typeName: 'STRENGTH_TRAINING' }), startMs: csv.startMs, endMs: csv.endMs };
  const r = buildActivityEvents([hcStrong, hcFit, csv], deviceLocalDate);
  assert.equal(r.workouts.length, 1);
  assert.equal(r.workouts[0].id, csv.id);
  assert.equal(r.workouts[0].sets?.length, 1);
  assert.equal(r.workouts[0].origins.length, 2);
});

test('strong import: importing the same file twice adds nothing', () => {
  const once = strongToRaw(strongSession('2026-10-30 18:05:00', 50))!;
  const r = buildActivityEvents([once, { ...once }], deviceLocalDate);
  assert.equal(r.workouts.length, 1);
});

test('strong import: unreadable start times are skipped', () => {
  assert.equal(strongToRaw(strongSession('not a date', 50)), null);
});
