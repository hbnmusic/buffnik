import { CONFIG } from './config';
import { decayStats } from './stats';
import type { StatKey, Stats } from './types';
import { STAT_KEYS } from './types';

export interface WeekInput {
  /** Monday of the week being settled. */
  weekStart: string;
  creditedWorkouts: number;
  /** Stats that had qualifying input this week. */
  trainedStats: StatKey[];
  /** Days of this week (0–7) covered by a pause pass. */
  pausedDays: number;
}

export interface WeekState {
  stats: Stats;
  coins: number;
  freezes: number;
  weeksOnTargetStreak: number;
  /** Consecutive settled weeks with no input, per stat. */
  idleWeeks: Record<StatKey, number>;
}

export type WeekOutcome = 'on_target' | 'frozen' | 'paused' | 'missed';

export interface Settlement {
  state: WeekState;
  outcome: WeekOutcome;
  requiredWorkouts: number;
  bonusXp: number;
  coinPenalty: number;
  decayed: StatKey[];
  /** Fraction of max HP that every active boss heals. */
  bossHealFraction: number;
  freezeUsed: boolean;
  freezeEarned: boolean;
}

export function initialWeekState(stats: Stats): WeekState {
  return {
    stats,
    coins: 0,
    freezes: 0,
    weeksOnTargetStreak: 0,
    idleWeeks: { STR: 0, END: 0, VIT: 0, AGI: 0, PHY: 0 },
  };
}

/** A pause shrinks the target in proportion to the days it covers. */
export function requiredWorkouts(pausedDays: number): number {
  const days = Math.min(7, Math.max(0, pausedDays));
  return Math.ceil((CONFIG.week.targetWorkouts * (7 - days)) / 7);
}

export function settleWeek(state: WeekState, input: WeekInput): Settlement {
  const w = CONFIG.week;
  const required = requiredWorkouts(input.pausedDays);
  const trained = new Set(input.trainedStats);

  const base: Settlement = {
    state: { ...state, idleWeeks: { ...state.idleWeeks } },
    outcome: 'on_target',
    requiredWorkouts: required,
    bonusXp: 0,
    coinPenalty: 0,
    decayed: [],
    bossHealFraction: 0,
    freezeUsed: false,
    freezeEarned: false,
  };

  // A fully paused week changes nothing.
  if (required === 0) {
    return { ...base, outcome: 'paused' };
  }

  const s = base.state;
  for (const k of STAT_KEYS) s.idleWeeks[k] = trained.has(k) ? 0 : s.idleWeeks[k] + 1;

  if (input.creditedWorkouts >= required) {
    base.outcome = input.pausedDays > 0 ? 'paused' : 'on_target';
    if (input.creditedWorkouts > w.targetWorkouts) base.bonusXp = w.bonusWorkoutXp;
    s.weeksOnTargetStreak += 1;
    if (s.weeksOnTargetStreak % w.freezeEveryNWeeksOnTarget === 0 && s.freezes < w.maxBankedFreezes) {
      s.freezes += 1;
      base.freezeEarned = true;
    }
  } else if (s.freezes > 0) {
    base.outcome = 'frozen';
    s.freezes -= 1;
    base.freezeUsed = true;
  } else {
    base.outcome = 'missed';
    s.weeksOnTargetStreak = 0;
    base.coinPenalty = Math.min(s.coins, w.missedWeekCoinPenalty);
    s.coins -= base.coinPenalty;
    base.bossHealFraction = w.missedWeekBossHealFraction;
    const untrained = STAT_KEYS.filter((k) => !trained.has(k) && k !== 'PHY');
    s.stats = decayStats(s.stats, untrained, w.missedWeekStatDecay);
    base.decayed = untrained;
    return base;
  }

  // Outside a missed week, only long-idle stats decay, and more gently.
  const idle = STAT_KEYS.filter((k) => k !== 'PHY' && s.idleWeeks[k] >= w.idleWeeksBeforeDecay);
  if (idle.length > 0) {
    s.stats = decayStats(s.stats, idle, w.idleStatDecay);
    base.decayed = idle;
  }
  return base;
}
