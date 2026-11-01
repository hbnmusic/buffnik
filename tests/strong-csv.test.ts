import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStrongCsv, parseDurationMin, detectDelimiter } from '../src/data/strongCsv';

const CSV = [
  'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE',
  '2026-10-28 18:05:00,"Push, Day A",1h 5m,Bench Press (Barbell),W,95,10,0,0,,,',
  '2026-10-28 18:05:00,"Push, Day A",1h 5m,Bench Press (Barbell),1,185,5,0,0,"felt ""strong""",,8',
  '2026-10-28 18:05:00,"Push, Day A",1h 5m,Bench Press (Barbell),2,185,5,0,0,,,',
  '2026-10-28 18:05:00,"Push, Day A",1h 5m,Rowing (Machine),1,0,0,2000,480,,,',
  '2026-10-30 07:30:00,Legs,45m,Squat (Barbell),1,225,5,0,0,,,',
  'not-a-date,Legs,45m,Squat (Barbell),1,225,5,0,0,,,',
].join('\n');

test('strong csv: groups rows into sessions and converts pounds to kg', () => {
  const { sessions, skippedRows } = parseStrongCsv(CSV, 'lb');
  assert.equal(sessions.length, 2);
  assert.equal(skippedRows, 1);
  const push = sessions[0];
  assert.equal(push.name, 'Push, Day A');
  assert.equal(push.date, '2026-10-28');
  assert.equal(push.durationMin, 65);
  assert.equal(push.sets.length, 3); // rowing row has no reps
  assert.equal(push.sets[0].warmup, true);
  assert.equal(push.sets[1].weightKg, 83.91);
  assert.equal(sessions[1].durationMin, 45);
});

test('strong csv: semicolon exports are detected', () => {
  const semi = CSV.replace(/"Push, Day A"/g, 'Push').replace(/,/g, ';');
  assert.equal(detectDelimiter(semi.split('\n')[0]), ';');
  assert.equal(parseStrongCsv(semi, 'kg').sessions.length, 2);
});

test('strong csv: rejects files that are not Strong exports', () => {
  assert.throws(() => parseStrongCsv('a,b,c\n1,2,3', 'kg'), /Strong export/);
});

test('strong csv: duration formats', () => {
  assert.equal(parseDurationMin('1h 5m'), 65);
  assert.equal(parseDurationMin('45m'), 45);
  assert.equal(parseDurationMin('2h'), 120);
  assert.equal(parseDurationMin('30s'), 0.5);
  assert.equal(parseDurationMin(''), 0);
});

test('strong csv: recognises a Strong export from its header', async () => {
  const { looksLikeStrongCsv } = await import('../src/data/strongCsv');
  assert.equal(looksLikeStrongCsv('Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps\n2026-11-03 09:00:00,Push,1h,Bench,1,100,5'), true);
  assert.equal(looksLikeStrongCsv('﻿Date;Workout Name;Exercise Name;Reps'), true);
  assert.equal(looksLikeStrongCsv('hello there'), false);
  assert.equal(looksLikeStrongCsv(''), false);
});
