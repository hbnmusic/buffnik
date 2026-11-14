import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { looksLikeStrongShare, parseShareDate, parseStrongShare } from '../src/data/strongShare';
import { looksLikeStrongCsv } from '../src/data/strongCsv';
import { strongToRaw } from '../src/data/ingest';

const SHARE = readFileSync(new URL('./fixtures/strong-share.txt', import.meta.url), 'utf8');

test('strong share: the text from Share on one workout is recognised, and is not mistaken for a CSV', () => {
  assert.equal(looksLikeStrongShare(SHARE), true);
  assert.equal(looksLikeStrongCsv(SHARE), false);
  assert.equal(looksLikeStrongShare('hello\nthere'), false);
  assert.equal(looksLikeStrongShare('Date,Workout Name,Exercise Name,Reps\n2026-11-13 17:50:00,Push,Bench,5'), false);
});

test('strong share: reads the name, start, sets and timed cardio of a real shared workout', () => {
  const r = parseStrongShare(SHARE, 'kg');
  assert.equal(r.sessions.length, 1);
  const s = r.sessions[0];
  assert.equal(s.name, 'Afternoon Workout');
  assert.equal(s.startedAt, '2026-11-13 17:50:00');
  assert.equal(s.date, '2026-11-13');
  assert.equal(s.durationMin, 15); // Stairmaster 5:00 + Walking 10:00
  assert.equal(s.sets.length, 15);
  assert.equal(r.unit, 'lb');
  assert.equal(r.unitFromFile, true);
  // Assisted sets count as bodyweight.
  assert.deepEqual(s.sets[0], { exercise: 'Pull Up (Assisted)', weightKg: 0, reps: 6, warmup: false });
  const curl = s.sets.find((x) => x.exercise === 'Seated Leg Curl (Machine)')!;
  assert.equal(curl.weightKg, 24.95);
  assert.equal(curl.reps, 12);
  assert.equal(s.sets[s.sets.length - 1].reps, 3);
  // 15 working sets: counts even without a duration, estimated at 3 minutes a set.
  const raw = strongToRaw(s)!;
  assert.equal(raw.estimated, true);
  assert.equal(Math.round((raw.endMs - raw.startMs) / 60_000), 45);
});

test('strong share: other date styles, reps-only sets, warm-ups and kg', () => {
  assert.equal(parseShareDate('Wednesday, August 14, 2024 at 06:03'), '2024-08-14 06:03:00');
  assert.equal(parseShareDate('Saturday, November 14, 2026 at 6:03 PM'), '2026-11-14 18:03:00');
  assert.equal(parseShareDate('Saturday 14 November 2026 at 12:05 am'), '2026-11-14 00:05:00');
  assert.equal(parseShareDate('Afternoon Workout'), null);
  const r = parseStrongShare('Legs\nMonday, 15 March 2021 at 18:02\n\nSquat (Barbell)\nW: 40 kg × 10\nSet 1: 100 kg x 5\nSet 2: 102,5 kg × 5\n\nPush Up\nSet 1: 20 reps\n\nPlank\nSet 1: 1:00\n\nWorkout Notes: felt good', 'lb');
  const s = r.sessions[0];
  assert.equal(s.name, 'Legs');
  assert.equal(s.startedAt, '2021-03-15 18:02:00');
  assert.deepEqual(s.sets.map((x) => [x.weightKg, x.reps, x.warmup]), [[40, 10, true], [100, 5, false], [102.5, 5, false], [0, 20, false]]);
  assert.equal(s.durationMin, 1);
  assert.equal(r.unit, 'kg');
});
