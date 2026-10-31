import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initialStats,
  initialWeekState,
  settleWeek,
  requiredWorkouts,
  priceInCoins,
  checkRedeem,
  redeem,
  rollBudget,
  rollDrop,
  dropOdds,
  CONFIG,
  type WeekState,
  type WeekInput,
  type ShopItem,
} from '../src/engine';

const week = (over: Partial<WeekInput> = {}): WeekInput => ({
  weekStart: '2026-11-02',
  creditedWorkouts: 2,
  trainedStats: ['STR', 'END', 'VIT', 'AGI'],
  pausedDays: 0,
  ...over,
});

function stateWith(over: Partial<WeekState>): WeekState {
  return { ...initialWeekState(initialStats()), ...over };
}

test('week: hitting the target builds the streak; a third workout earns bonus XP', () => {
  const r = settleWeek(stateWith({ coins: 500 }), { ...week({ creditedWorkouts: 3 }), trainedStats: ['STR', 'END'] });
  assert.equal(r.outcome, 'on_target');
  assert.equal(r.bonusXp, 100);
  assert.equal(r.state.weeksOnTargetStreak, 1);
  assert.equal(r.state.coins, 500);
});

test('week: every 4th on-target week earns a freeze, up to 3 banked', () => {
  let s = stateWith({});
  let earned = 0;
  for (let i = 0; i < 16; i++) {
    const r = settleWeek(s, { ...week(), trainedStats: ['STR', 'END', 'VIT', 'AGI'] });
    if (r.freezeEarned) earned++;
    s = r.state;
  }
  assert.equal(earned, 3);
  assert.equal(s.freezes, 3);
});

test('week: a missed week uses a freeze if one is banked', () => {
  const r = settleWeek(stateWith({ freezes: 1, coins: 400, weeksOnTargetStreak: 5 }), { ...week({ creditedWorkouts: 1 }), trainedStats: ['STR'] });
  assert.equal(r.outcome, 'frozen');
  assert.equal(r.state.freezes, 0);
  assert.equal(r.state.coins, 400);
  assert.equal(r.state.weeksOnTargetStreak, 5);
  assert.equal(r.bossHealFraction, 0);
});

test('week: a missed week without a freeze decays untrained stats, deducts coins and heals bosses', () => {
  const s = stateWith({ coins: 400, weeksOnTargetStreak: 3 });
  const r = settleWeek(s, { ...week({ creditedWorkouts: 1 }), trainedStats: ['STR', 'VIT'] });
  assert.equal(r.outcome, 'missed');
  assert.equal(r.coinPenalty, 250);
  assert.equal(r.state.coins, 150);
  assert.equal(r.state.weeksOnTargetStreak, 0);
  assert.equal(r.bossHealFraction, 0.1);
  assert.deepEqual(r.decayed.sort(), ['AGI', 'END']);
  assert.equal(r.state.stats.END, 9.5);
  assert.equal(r.state.stats.STR, 10);
  assert.equal(r.state.stats.PHY, 10);
});

test('week: the coin penalty never takes the balance below zero', () => {
  const r = settleWeek(stateWith({ coins: 100 }), { ...week({ creditedWorkouts: 0 }), trainedStats: [] });
  assert.equal(r.coinPenalty, 100);
  assert.equal(r.state.coins, 0);
});

test('week: a pause shrinks the target; a full-week pause changes nothing', () => {
  assert.equal(requiredWorkouts(0), 2);
  assert.equal(requiredWorkouts(4), 1);
  assert.equal(requiredWorkouts(7), 0);
  const s = stateWith({ coins: 300 });
  const full = settleWeek(s, { ...week({ creditedWorkouts: 0, pausedDays: 7 }), trainedStats: [] });
  assert.equal(full.outcome, 'paused');
  assert.deepEqual(full.state, { ...s, idleWeeks: { ...s.idleWeeks } });
  const partial = settleWeek(s, { ...week({ creditedWorkouts: 1, pausedDays: 4 }), trainedStats: ['END'] });
  assert.equal(partial.outcome, 'paused');
  assert.equal(partial.coinPenalty, 0);
});

test('week: a stat idle for 2+ weeks decays gently even in on-target weeks', () => {
  let s = stateWith({});
  s = settleWeek(s, { ...week(), trainedStats: ['STR', 'VIT', 'AGI'] }).state; // END idle 1
  const r = settleWeek(s, { ...week(), trainedStats: ['STR', 'VIT', 'AGI'] }); // END idle 2
  assert.deepEqual(r.decayed, ['END']);
  assert.equal(r.state.stats.END, 9.8);
});

const wine: ShopItem = { id: 'wine', name: 'Bottle of wine', kind: 'real', priceUsd: 30 };
const watch: ShopItem = { id: 'watch', name: 'New watch', kind: 'vault', priceUsd: 900 };

test('economy: dollar items cost 10 coins per dollar', () => {
  assert.equal(priceInCoins(wine), 300);
  assert.equal(priceInCoins({ id: 'f', name: 'Freeze', kind: 'utility', priceCoins: 300 }), 300);
});

test('economy: real rewards need coins and room in the month’s budget', () => {
  const budget = { month: '2026-11', spentUsd: 480, vaultUsd: 0 };
  const r = checkRedeem(wine, { coins: 1000, vouchersUsd: [] }, budget);
  assert.equal(r.ok, false);
  const ok = redeem(wine, { coins: 1000, vouchersUsd: [] }, { ...budget, spentUsd: 100 });
  assert.equal(ok.wallet.coins, 700);
  assert.equal(ok.budget.spentUsd, 130);
});

test('economy: vault items draw on the month first, then the vault', () => {
  const r = redeem(watch, { coins: 9000, vouchersUsd: [] }, { month: '2026-11', spentUsd: 200, vaultUsd: 700 });
  assert.equal(r.spentFromMonthUsd, 300);
  assert.equal(r.spentFromVaultUsd, 600);
  assert.equal(r.budget.vaultUsd, 100);
  assert.equal(r.wallet.coins, 0);
});

test('economy: unspent budget rolls into the vault up to the cap', () => {
  const b = rollBudget({ month: '2026-11', spentUsd: 200, vaultUsd: 0 }, '2026-12');
  assert.deepEqual(b, { month: '2026-12', spentUsd: 0, vaultUsd: 300 });
  const skipped = rollBudget({ month: '2026-11', spentUsd: 0, vaultUsd: 900 }, '2027-02');
  assert.equal(skipped.vaultUsd, CONFIG.economy.vaultCapUsd);
  assert.equal(rollBudget(b, '2026-12'), b);
});

test('economy: a loot voucher lowers the coin cost but still uses the budget', () => {
  const r = redeem(wine, { coins: 100, vouchersUsd: [25] }, { month: '2026-11', spentUsd: 0, vaultUsd: 0 });
  assert.equal(r.wallet.coins, 50);
  assert.deepEqual(r.wallet.vouchersUsd, []);
  assert.equal(r.budget.spentUsd, 30);
});

test('loot: drops are deterministic from the seed', () => {
  assert.deepEqual(rollDrop(42, { prCount: 0, bossDefeated: null }), rollDrop(42, { prCount: 0, bossDefeated: null }));
});

test('loot: PRs guarantee rare or better; final bosses guarantee legendary', () => {
  for (let seed = 1; seed < 300; seed++) {
    const pr = rollDrop(seed, { prCount: 1, bossDefeated: null });
    assert.ok(pr && pr.rarity !== 'common');
    const fin = rollDrop(seed, { prCount: 0, bossDefeated: 'final_boss' });
    assert.equal(fin?.rarity, 'legendary');
  }
});

test('loot: observed drop rate matches the published odds', () => {
  let drops = 0;
  const n = 20000;
  for (let seed = 0; seed < n; seed++) if (rollDrop(seed * 7919 + 13, { prCount: 0, bossDefeated: null })) drops++;
  const odds = dropOdds();
  const published = odds.common + odds.rare + odds.epic + odds.legendary;
  assert.ok(Math.abs(published - CONFIG.loot.dropChancePerWorkout) < 1e-9);
  assert.ok(Math.abs(drops / n - published) < 0.02, `observed ${drops / n}`);
});
