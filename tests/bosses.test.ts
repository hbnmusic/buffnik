import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initFiveBoros,
  hitFiveBoros,
  healFiveBoros,
  initDescent,
  updateDescent,
  healDescent,
  rollingAverageLb,
  winningAverageLb,
  KM_PER_MILE,
  LB_PER_KG,
  type ActivityEvent,
} from '../src/engine';

const ride = (date: string, durationMin: number, miles?: number): ActivityEvent => ({
  id: `${date}-${durationMin}`,
  kind: 'ride',
  date,
  durationMin,
  distanceKm: miles === undefined ? undefined : miles * KM_PER_MILE,
  origins: ['test'],
});

test('five boros: a 45-minute cycling class deals 45 damage', () => {
  const { state, hit } = hitFiveBoros(initFiveBoros(), ride('2026-11-04', 45));
  assert.equal(hit.damage, 45);
  assert.equal(state.hp, 955);
});

test('five boros: long-ride milestones add damage once each', () => {
  let s = initFiveBoros();
  const first = hitFiveBoros(s, ride('2027-03-14', 90, 21));
  assert.deepEqual(first.hit.milestones, [10, 20]);
  assert.equal(first.hit.damage, 90 + 50 + 100);
  s = first.state;
  const again = hitFiveBoros(s, ride('2027-03-21', 90, 21));
  assert.deepEqual(again.hit.milestones, []);
  assert.equal(again.hit.damage, 90);
});

test('five boros: training only staggers the boss; event day finishes it', () => {
  let s = initFiveBoros();
  for (let i = 0; i < 30; i++) s = hitFiveBoros(s, ride('2027-04-01', 60)).state;
  assert.equal(s.hp, 100);
  assert.equal(s.defeated, false);
  const notEnough = hitFiveBoros(s, ride('2027-05-02', 120, 25));
  assert.equal(notEnough.state.defeated, false);
  const done = hitFiveBoros(s, ride('2027-05-02', 240, 40));
  assert.equal(done.state.defeated, true);
  assert.equal(done.state.hp, 0);
});

test('five boros: non-cycling sessions do nothing; missed weeks heal it', () => {
  const s = initFiveBoros();
  const swim = hitFiveBoros(s, { ...ride('2026-11-04', 45), kind: 'swim' });
  assert.equal(swim.hit.damage, 0);
  const hurt = hitFiveBoros(s, ride('2026-11-04', 300)).state;
  assert.equal(healFiveBoros(hurt, 0.1).hp, 800);
});

test('descent: rolling average uses the last 7 days', () => {
  const kg = (lb: number) => lb / LB_PER_KG;
  const readings = [
    { date: '2026-10-20', weightKg: kg(200) },
    { date: '2026-10-27', weightKg: kg(196) },
    { date: '2026-11-01', weightKg: kg(194) },
  ];
  assert.equal(rollingAverageLb(readings, '2026-11-01'), 195);
  assert.equal(rollingAverageLb(readings, '2026-09-01'), undefined);
});

test('descent: thresholds already beaten at the start are cleared without reward', () => {
  const s = initDescent(187, '2026-11-01');
  assert.deepEqual(s.bosses.map((b) => b.status), ['cleared_at_start', 'active', 'locked', 'locked', 'locked']);
  assert.equal(s.bosses[1].maxHp, 20);
});

test('descent: loss faster than 1% of body weight per week counts only up to the cap', () => {
  const s = initDescent(196, '2026-11-01');
  assert.equal(s.bosses[0].maxHp, 60);
  const u = updateDescent(s, 191, '2026-11-08');
  assert.equal(u.state.effectiveAvgLb, 194);
  assert.equal(u.damage, 20);
  assert.equal(u.state.bosses[0].hp, 40);
});

test('descent: crossing a threshold defeats the boss and activates the next', () => {
  let s = initDescent(191, '2026-11-01');
  s = updateDescent(s, 190.5, '2026-11-08').state;
  const u = updateDescent(s, 189.8, '2026-11-15');
  assert.deepEqual(u.defeatedThresholds, [190]);
  assert.equal(u.state.bosses[0].status, 'defeated');
  assert.equal(u.state.bosses[1].status, 'active');
  assert.equal(u.state.bosses[1].maxHp, 50);
  // 189.8 lb is already 0.2 lb into the 185 boss's 5 lb gap.
  assert.equal(u.state.bosses[1].hp, 48);
});

test('descent: a rebound heals the active boss', () => {
  let s = initDescent(193, '2026-11-01');
  s = updateDescent(s, 192, '2026-11-08').state;
  const u = updateDescent(s, 192.6, '2026-11-15');
  assert.equal(u.state.bosses[0].hp, 26);
});

test('descent: a missed-week shield means going further below the threshold', () => {
  let s = initDescent(195, '2026-11-01');
  s = healDescent(s, 0.1);
  assert.equal(s.bosses[0].shieldHp, 5);
  assert.equal(winningAverageLb(s.bosses[0]), 189.5);
  assert.equal(s.bosses[0].hp, 55);
  s = updateDescent(s, 193.1, '2026-11-08').state;
  s = updateDescent(s, 191.2, '2026-11-15').state;
  s = updateDescent(s, 189.8, '2026-11-22').state;
  assert.equal(s.bosses[0].status, 'active');
  const u = updateDescent(s, 189.4, '2026-11-29');
  assert.deepEqual(u.defeatedThresholds, [190]);
});
