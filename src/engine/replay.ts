/**
 * Computes the whole game state from the raw inputs (workouts, recovery days,
 * weigh-ins, purchases), day by day. Nothing derived is ever stored, so a rule
 * change in CONFIG simply recomputes everything, and the same inputs always give
 * the same state. Pure: the caller passes `today`.
 */
import { CONFIG } from './config';
import { addDays, monthKey, weekStart } from './dates';
import { applySets, type PrBook } from './prs';
import { rollBudget, type BudgetState, type ShopKind, type Wallet } from './economy';
import { rollDrop, type LootDrop, type Rarity } from './loot';
import {
  healDescent,
  healFiveBoros,
  hitFiveBoros,
  initDescent,
  initFiveBoros,
  rollingAverageLb,
  updateDescent,
  type DescentState,
  type FiveBorosState,
} from './bosses';
import { applyRecoveryDay, applyWorkout, buildTier, computePhy, initialStats } from './stats';
import type { ActivityEvent, ActivityKind, BodyCompReading, DailyRecovery, StatKey, Stats, XpBreakdown } from './types';
import { initialWeekState, requiredWorkouts, settleWeek, type WeekOutcome, type WeekState } from './week';
import { addXp, coinsForXp, EMPTY_XP, isCredited, levelFromXp, scoreRecoveryDay, scoreWorkout, type LevelInfo } from './xp';

/** A shop purchase as it happened. Amounts are recorded at purchase time so later rule changes do not rewrite history. */
export interface Purchase {
  id: string;
  /** Local date 'YYYY-MM-DD'. */
  date: string;
  itemId: string;
  name: string;
  kind: ShopKind;
  coinCost: number;
  usdFromMonth: number;
  usdFromVault: number;
  /** Dollar value of the loot voucher used, if any. */
  voucherUsd?: number;
  /** For pause passes: the day covered. */
  coverDate?: string;
}

export interface GameInputs {
  /** First day that earns anything. Workouts before it only set PR baselines. */
  startDate: string;
  today: string;
  activities: ActivityEvent[];
  recovery: DailyRecovery[];
  body: BodyCompReading[];
  purchases: Purchase[];
}

export interface DropRecord {
  date: string;
  eventId: string;
  drop: LootDrop;
}

export interface WeekRecord {
  weekStart: string;
  outcome: WeekOutcome;
  creditedWorkouts: number;
  required: number;
  bonusXp: number;
  coinPenalty: number;
}

export interface ThisWeek {
  weekStart: string;
  credited: number;
  required: number;
  kinds: ActivityKind[];
  pausedDays: number;
}

export interface GameState {
  totalXp: number;
  breakdown: XpBreakdown;
  level: LevelInfo;
  coins: number;
  stats: Stats;
  buildTier: number;
  freezes: number;
  streakWeeks: number;
  thisWeek: ThisWeek;
  weeks: WeekRecord[];
  prBook: PrBook;
  drops: DropRecord[];
  looks: { date: string; rarity: Rarity; eventId: string }[];
  wallet: Wallet;
  budget: BudgetState;
  fiveBoros: FiveBorosState;
  descent: DescentState | null;
  /** Dates (newest first) on which a boss was defeated, with the boss name. */
  defeats: { date: string; boss: string }[];
}

/** FNV-1a, so every workout id maps to a fixed loot seed. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const RECOVERY_BASELINE_DAYS = 14;

function mean(values: number[]): number | undefined {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined;
}

export function replay(inputs: GameInputs): GameState {
  const { startDate, today } = inputs;

  const activities = [...inputs.activities].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const recovery = [...inputs.recovery].sort((a, b) => a.date.localeCompare(b.date));
  const body = [...inputs.body].sort((a, b) => a.date.localeCompare(b.date));
  const purchases = [...inputs.purchases].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  // Before the start date, workouts only set PR baselines: history never earns XP.
  let prBook: PrBook = {};
  for (const a of activities) {
    if (a.date < startDate && a.sets && a.sets.length > 0) prBook = applySets(prBook, a.sets, true).book;
  }

  const activitiesByDate = new Map<string, ActivityEvent[]>();
  for (const a of activities) {
    if (a.date < startDate || a.date > today) continue;
    activitiesByDate.set(a.date, [...(activitiesByDate.get(a.date) ?? []), a]);
  }
  const recoveryByDate = new Map(recovery.map((r) => [r.date, r]));
  const bodyDates = new Set(body.map((b) => b.date));
  const purchasesByDate = new Map<string, Purchase[]>();
  for (const p of purchases) purchasesByDate.set(p.date, [...(purchasesByDate.get(p.date) ?? []), p]);
  const pausedDates = new Set(purchases.flatMap((p) => (p.coverDate ? [p.coverDate] : [])));
  const pausedDaysInWeek = (ws: string) => {
    let n = 0;
    for (let i = 0; i < 7; i++) if (pausedDates.has(addDays(ws, i))) n++;
    return n;
  };

  const bodyBaseline = body[0];
  const firstSettledWeek = weekStart(startDate) === startDate ? startDate : addDays(weekStart(startDate), 7);

  let week: WeekState = initialWeekState(initialStats());
  let xp: XpBreakdown = EMPTY_XP;
  let bonusXp = 0;
  let fiveBoros = initFiveBoros();
  let descent: DescentState | null = null;
  let budget: BudgetState = { month: monthKey(startDate), spentUsd: 0, vaultUsd: 0 };
  let vouchers: number[] = [];
  const drops: DropRecord[] = [];
  const looks: { date: string; rarity: Rarity; eventId: string }[] = [];
  const defeats: { date: string; boss: string }[] = [];
  const weeks: WeekRecord[] = [];

  let weekStartDate = weekStart(startDate);
  let credited = 0;
  let kinds = new Set<ActivityKind>();
  let trained = new Set<StatKey>();
  let trainedYesterday = false;

  const applyDrop = (date: string, eventId: string, drop: LootDrop | null) => {
    if (!drop) return;
    drops.push({ date, eventId, drop });
    const r = drop.reward;
    if (r.type === 'coins') week = { ...week, coins: week.coins + r.amount };
    else if (r.type === 'freeze') week = { ...week, freezes: Math.min(CONFIG.week.maxBankedFreezes, week.freezes + 1) };
    else if (r.type === 'look') looks.push({ date, rarity: r.rarity, eventId });
    else vouchers = [...vouchers, r.usd];
  };

  for (let d = startDate; d <= today; d = addDays(d, 1)) {
    // A new week begins: settle the one that just ended.
    if (weekStart(d) !== weekStartDate) {
      if (weekStartDate >= firstSettledWeek) {
        const pausedDays = pausedDaysInWeek(weekStartDate);
        const s = settleWeek(week, { weekStart: weekStartDate, creditedWorkouts: credited, trainedStats: [...trained], pausedDays });
        week = s.state;
        bonusXp += s.bonusXp;
        week = { ...week, coins: week.coins + coinsForXp(s.bonusXp) };
        if (s.bossHealFraction > 0) {
          fiveBoros = healFiveBoros(fiveBoros, s.bossHealFraction);
          if (descent) descent = healDescent(descent, s.bossHealFraction);
        }
        weeks.push({
          weekStart: weekStartDate,
          outcome: s.outcome,
          creditedWorkouts: credited,
          required: s.requiredWorkouts,
          bonusXp: s.bonusXp,
          coinPenalty: s.coinPenalty,
        });
      }
      weekStartDate = weekStart(d);
      credited = 0;
      kinds = new Set();
      trained = new Set();
    }

    budget = rollBudget(budget, monthKey(d));

    // Workouts.
    let trainedToday = false;
    for (const a of activitiesByDate.get(d) ?? []) {
      if (!isCredited(a)) continue;
      const prRes = applySets(prBook, a.sets ?? []);
      prBook = prRes.book;
      const prCount = prRes.prs.length;
      const isNewKind = !kinds.has(a.kind);

      const score = scoreWorkout(a, { kindsEarlierThisWeek: kinds, prCount });
      xp = addXp(xp, score);
      week = { ...week, coins: week.coins + coinsForXp(score.total) };

      const u = applyWorkout(week.stats, a, prCount, isNewKind);
      week = { ...week, stats: u.stats };
      u.trained.forEach((k) => trained.add(k));
      kinds.add(a.kind);
      credited += 1;
      trainedToday = true;

      const boss = hitFiveBoros(fiveBoros, a);
      fiveBoros = boss.state;
      if (boss.hit.defeated) defeats.push({ date: d, boss: 'Five Boros' });
      applyDrop(d, a.id, rollDrop(hashSeed(a.id), { prCount, bossDefeated: boss.hit.defeated ? 'final_boss' : null }));
    }

    // Recovery: sleep and HRV against a rolling personal baseline, plus a rest-day bonus.
    const rec = recoveryByDate.get(d);
    const restDay = !trainedToday && trainedYesterday;
    if (rec || restDay) {
      const prior = recovery.filter((r) => r.date < d).slice(-RECOVERY_BASELINE_DAYS);
      const base = {
        sleepMin: mean(prior.flatMap((r) => (r.sleepMin !== undefined ? [r.sleepMin] : []))),
        hrvMs: mean(prior.flatMap((r) => (r.hrvMs !== undefined ? [r.hrvMs] : []))),
      };
      const day = rec ?? { date: d };
      const score = scoreRecoveryDay(day, base, restDay);
      xp = addXp(xp, score);
      week = { ...week, coins: week.coins + coinsForXp(score.total) };
      if (rec) {
        const u = applyRecoveryDay(week.stats, rec, base.sleepMin);
        week = { ...week, stats: u.stats };
        u.trained.forEach((k) => trained.add(k));
      }
    }

    // Weigh-ins: the 7-day average drives the Descent boss ladder; body composition drives PHY.
    if (bodyDates.has(d)) {
      const avg = rollingAverageLb(body, d);
      if (avg !== undefined) {
        if (!descent) {
          descent = initDescent(avg, d);
        } else {
          const u = updateDescent(descent, avg, d);
          descent = u.state;
          const last = CONFIG.bosses.descent.thresholdsLb[CONFIG.bosses.descent.thresholdsLb.length - 1];
          for (const t of u.defeatedThresholds) {
            defeats.push({ date: d, boss: `Descent ${t} lb` });
            applyDrop(d, `descent-${t}`, rollDrop(hashSeed(`descent-${t}`), { prCount: 0, bossDefeated: t === last ? 'final_boss' : 'boss' }));
          }
        }
      }
      const latest = body.filter((b) => b.date <= d).slice(-1)[0];
      week = { ...week, stats: { ...week.stats, PHY: computePhy(bodyBaseline, latest) } };
    }

    // Purchases happen after the day's earnings.
    for (const p of purchasesByDate.get(d) ?? []) {
      week = { ...week, coins: Math.max(0, week.coins - p.coinCost) };
      budget = {
        ...budget,
        spentUsd: Math.round((budget.spentUsd + p.usdFromMonth) * 100) / 100,
        vaultUsd: Math.round((budget.vaultUsd - p.usdFromVault) * 100) / 100,
      };
      if (p.voucherUsd !== undefined) {
        const i = vouchers.indexOf(p.voucherUsd);
        if (i !== -1) vouchers = vouchers.filter((_, j) => j !== i);
      }
      if (p.itemId === 'freeze') week = { ...week, freezes: Math.min(CONFIG.week.maxBankedFreezes, week.freezes + 1) };
    }

    trainedYesterday = trainedToday;
  }

  const totalXp = xp.total + bonusXp;
  const thisWeekPaused = pausedDaysInWeek(weekStartDate);
  return {
    totalXp,
    breakdown: xp,
    level: levelFromXp(totalXp),
    coins: Math.max(0, Math.round(week.coins)),
    stats: week.stats,
    buildTier: buildTier(week.stats),
    freezes: week.freezes,
    streakWeeks: week.weeksOnTargetStreak,
    thisWeek: { weekStart: weekStartDate, credited, required: requiredWorkouts(thisWeekPaused), kinds: [...kinds], pausedDays: thisWeekPaused },
    weeks,
    prBook,
    drops,
    looks,
    wallet: { coins: Math.max(0, Math.round(week.coins)), vouchersUsd: vouchers },
    budget,
    fiveBoros,
    descent,
    defeats: defeats.reverse(),
  };
}
