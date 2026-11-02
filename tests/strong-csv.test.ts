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

test('strong csv: newer exports put the unit in the header (Duration (sec), Weight (kg))', () => {
  const csv = [
    '"Workout #";"Date";"Workout Name";"Duration (sec)";"Exercise Name";"Set Order";"Weight (kg)";"Reps";"RPE";"Distance (meters)";"Seconds";"Notes";"Workout Notes"',
    '"1";"2026-11-01 21:00:00";"Chest";"300";"Bench Press (Barbell)";"1";"100.0";"10";"";"";"";"";""',
    '"1";"2026-11-01 21:00:00";"Chest";"300";"Bench Press (Barbell)";"2";"100.0";"8";"";"";"";"";""',
  ].join('\n');
  const r = parseStrongCsv(csv, 'lb'); // the caller's choice is overridden by the header
  assert.equal(r.unit, 'kg');
  assert.equal(r.unitFromFile, true);
  assert.equal(r.sessions.length, 1);
  assert.equal(r.sessions[0].durationMin, 5);
  assert.equal(r.sessions[0].sets[0].weightKg, 100);
  assert.equal(r.withoutDuration, 0);
});

test('strong csv: a file with no usable duration is reported', () => {
  const none = 'Date,Workout Name,Exercise Name,Set Order,Weight,Reps\n2026-11-01 21:00:00,Push,Bench,1,135,8';
  const r = parseStrongCsv(none, 'lb');
  assert.equal(r.unitFromFile, false);
  assert.equal(r.unit, 'lb');
  assert.equal(r.withoutDuration, 1);
});

test('strong csv: bare numbers and clock durations', () => {
  assert.equal(parseDurationMin('300', 'sec'), 5);
  assert.equal(parseDurationMin('45', 'min'), 45);
  assert.equal(parseDurationMin('45'), 45); // no hint: small numbers are minutes
  assert.equal(parseDurationMin('2700'), 45); // no hint: large numbers are seconds
  assert.equal(parseDurationMin('1:05:00'), 65);
});
