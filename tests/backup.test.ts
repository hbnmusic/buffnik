import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBackup, markBackedUp, parseBackup, restoreBackup } from '../src/state/backup';
import { loadGame, logWeight, logWorkout, buy } from '../src/state/service';
import { createMemoryStore } from '../src/state/store';

async function seeded() {
  const store = createMemoryStore();
  const today = '2026-11-10';
  for (let i = 0; i < 3; i++) await logWorkout(store, { kind: 'run', date: today, durationMin: 90, distanceKm: 15 });
  await logWeight(store, today, 190);
  await buy(store, 'cocktail-home', today);
  await store.setMeta('settings', JSON.stringify({ maxHr: 190 }));
  await store.setMeta('packs', '[{"id":"x"}]');
  return { store, today };
}

test('backup: round trip rebuilds the same game', async () => {
  const { store, today } = await seeded();
  const before = await loadGame(store, today);
  const file = await createBackup(store, new Date('2026-11-10T20:00:00Z'));
  const text = JSON.stringify(file);

  const parsed = parseBackup(text);
  assert.equal(parsed.ok, true);
  const fresh = createMemoryStore();
  if (parsed.ok) await restoreBackup(fresh, parsed.backup, new Date('2026-11-11T00:00:00Z'));
  const after = await loadGame(fresh, today);

  assert.equal(after.state.totalXp, before.state.totalXp);
  assert.equal(after.state.coins, before.state.coins);
  assert.equal(after.workouts.length, before.workouts.length);
  assert.equal(after.latestWeightLb, before.latestWeightLb);
  assert.equal(after.settings.maxHr, 190);
  assert.equal(after.startDate, before.startDate);
});

test('backup: pack list is not carried over, but the installed one is kept; restore replaces old data', async () => {
  const { store } = await seeded();
  const file = await createBackup(store);
  assert.equal('packs' in file.data.meta, false);

  const other = createMemoryStore();
  await other.setMeta('packs', '[{"id":"mine"}]');
  await logWorkout(other, { kind: 'swim', date: '2026-11-09', durationMin: 40 });
  await restoreBackup(other, file);
  assert.equal(await other.getMeta('packs'), '[{"id":"mine"}]');
  const sessions = await other.listSessions();
  assert.ok(sessions.every((s) => s.typeName !== 'SWIMMING_POOL')); // the swim from before the restore is gone
});

test('backup: bad files give clear reasons', () => {
  assert.equal(parseBackup('nope').ok, false);
  assert.equal(parseBackup('{"app":"other"}').ok, false);
  assert.equal(parseBackup(JSON.stringify({ app: 'buffnik', version: 1, createdAt: 'x', data: { meta: {} } })).ok, false);
});

test('backup: marking a backup resets the reminder clock', async () => {
  const store = createMemoryStore();
  assert.equal((await loadGame(store, '2026-11-10')).daysSinceBackup, null);
  await markBackedUp(store, new Date());
  assert.equal((await loadGame(store, '2026-11-10')).daysSinceBackup, 0);
});
