import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replay, type GameInputs } from '../src/engine';
import { detectEvents, planSchedule, seenFrom, type ScheduleContext } from '../src/state/notifications';
import { DEFAULT_SETTINGS, loadSettings, parseTime, saveSettings } from '../src/state/settings';
import { createMemoryStore } from '../src/state/store';

// Wednesday 2026-11-04, 10:00 local.
const NOW = new Date(2026, 10, 4, 10, 0, 0);
const ctx = (over: Partial<ScheduleContext> = {}): ScheduleContext => ({
  now: NOW,
  today: '2026-11-04',
  credited: 0,
  required: 2,
  trainedToday: false,
  level: 3,
  coins: 500,
  daysSinceBackup: 5,
  ...over,
});

test('settings: defaults, partial saved values, and time parsing', async () => {
  const store = createMemoryStore();
  assert.deepEqual(await loadSettings(store), DEFAULT_SETTINGS);
  await saveSettings(store, { ...DEFAULT_SETTINGS, maxHr: 190, notifications: { ...DEFAULT_SETTINGS.notifications, dailyNudge: false } });
  const s = await loadSettings(store);
  assert.equal(s.maxHr, 190);
  assert.equal(s.notifications.dailyNudge, false);
  assert.equal(s.notifications.weeklySummary, true);
  assert.deepEqual(parseTime('7:05', [18, 0]), [7, 5]);
  assert.deepEqual(parseTime('25:00', [18, 0]), [18, 0]);
});

test('schedule: nudges for the next days, a Sunday summary, and no nagging once on target', () => {
  const plan = planSchedule(DEFAULT_SETTINGS, ctx());
  const nudges = plan.filter((p) => p.id.startsWith('nudge'));
  assert.equal(nudges.length, 7); // today 18:00 is still ahead
  assert.ok(nudges.every((p) => p.at.getHours() === 18));
  const weekly = plan.find((p) => p.id === 'weekly')!;
  assert.equal(weekly.at.getDay(), 0);
  assert.equal(weekly.at.getHours(), 19);

  // Target met: no more nudges until the next week starts (Mon 11-09, offset 5).
  const met = planSchedule(DEFAULT_SETTINGS, ctx({ credited: 2 })).filter((p) => p.id.startsWith('nudge'));
  assert.deepEqual(met.map((p) => p.id), ['nudge-5', 'nudge-6']);
  assert.ok(met.every((p) => p.body.includes('new week')));

  // Already trained today: skip today's nudge.
  assert.equal(planSchedule(DEFAULT_SETTINGS, ctx({ trainedToday: true })).some((p) => p.id === 'nudge-0'), false);
});

test('schedule: toggles turn notifications off, and the backup reminder only appears when due', () => {
  const off = { ...DEFAULT_SETTINGS, notifications: { ...DEFAULT_SETTINGS.notifications, dailyNudge: false, weeklySummary: false, backupReminder: false } };
  assert.deepEqual(planSchedule(off, ctx({ daysSinceBackup: null })), []);
  assert.equal(planSchedule(DEFAULT_SETTINGS, ctx({ daysSinceBackup: 5 })).some((p) => p.id === 'backup'), false);
  assert.equal(planSchedule(DEFAULT_SETTINGS, ctx({ daysSinceBackup: 40 })).some((p) => p.id === 'backup'), true);
  assert.equal(planSchedule(DEFAULT_SETTINGS, ctx({ daysSinceBackup: null })).some((p) => p.id === 'backup'), true);
});

const baseInputs: GameInputs = { startDate: '2026-11-02', today: '2026-11-03', activities: [], recovery: [], body: [], purchases: [] };
const swim = (date: string, id: string, durationMin = 120) => ({ id, kind: 'swim' as const, date, durationMin, origins: ['t'] });

test('events: the first run sets a silent baseline, then new unlocks are announced once', () => {
  const before = replay(baseInputs);
  const first = detectEvents(null, before);
  assert.deepEqual(first.notes, []);

  const after = replay({ ...baseInputs, activities: [swim('2026-11-03', 'a'), swim('2026-11-03', 'b', 119), { id: 'c', kind: 'ride' as const, date: '2026-11-03', durationMin: 120, distanceKm: 40, origins: ['t'] }] });
  const { notes, seen } = detectEvents(first.seen, after);
  assert.ok(notes.some((n) => n.title.startsWith('Level')), 'three long sessions should level up');
  const again = detectEvents(seen, after);
  assert.deepEqual(again.notes, []); // nothing new the second time
  assert.deepEqual(seenFrom(after), seen);
});

test('events: a missed week is announced with its cost', () => {
  const rides = [{ id: 'r1', kind: 'ride' as const, date: '2026-11-03', durationMin: 60, origins: ['t'] }, { id: 'r2', kind: 'ride' as const, date: '2026-11-04', durationMin: 60, origins: ['t'] }];
  const week2 = replay({ ...baseInputs, today: '2026-11-10', activities: rides });
  const week3 = replay({ ...baseInputs, today: '2026-11-16', activities: rides });
  const { notes } = detectEvents(seenFrom(week2), week3);
  const missed = notes.find((n) => n.title === 'Week missed');
  assert.ok(missed);
  assert.match(missed!.body, /250 coins/);
});
