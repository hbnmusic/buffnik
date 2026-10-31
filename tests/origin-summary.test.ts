import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeOrigins, invertConstants, originLabel } from '../src/data/originSummary';

test('origins: counts records per app, most first, with friendly names', () => {
  const rows = summarizeOrigins([
    { metadata: { dataOrigin: 'io.strongapp.strong' } },
    { metadata: { dataOrigin: 'com.ultrahuman.android' } },
    { metadata: { dataOrigin: 'com.ultrahuman.android' } },
    { metadata: {} },
  ]);
  assert.deepEqual(
    rows.map((r) => [r.label, r.count]),
    [
      ['Ultrahuman', 2],
      ['Strong', 1],
      ['Unknown app', 1],
    ],
  );
});

test('origins: exercise sessions are broken down by type', () => {
  const name = invertConstants({ SWIMMING_POOL: 74, BIKING_STATIONARY: 9 });
  const rows = summarizeOrigins(
    [
      { metadata: { dataOrigin: 'com.ultrahuman.android' }, exerciseType: 74 },
      { metadata: { dataOrigin: 'com.ultrahuman.android' }, exerciseType: 74 },
      { metadata: { dataOrigin: 'com.ultrahuman.android' }, exerciseType: 9 },
    ],
    name,
  );
  assert.deepEqual(rows[0].detail, { 'swimming pool': 2, 'biking stationary': 1 });
  assert.equal(name(999), 'type 999');
});

test('origins: unknown packages show their package name', () => {
  assert.equal(originLabel('com.example.scale'), 'com.example.scale');
});
