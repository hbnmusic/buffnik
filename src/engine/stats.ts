import { CONFIG } from './config';
import type { ActivityEvent, BodyCompReading, DailyRecovery, StatKey, Stats } from './types';
import { STAT_KEYS } from './types';

const CARDIO_KINDS = new Set(['swim', 'ride', 'run', 'walk', 'class']);

export function initialStats(): Stats {
  const s = CONFIG.stats.start;
  return { STR: s, END: s, VIT: s, AGI: s, PHY: s };
}

function clampStat(v: number): number {
  return Math.min(CONFIG.stats.max, Math.max(1, Math.round(v * 100) / 100));
}

export interface StatUpdate {
  stats: Stats;
  trained: StatKey[];
}

export function applyWorkout(stats: Stats, event: ActivityEvent, prCount: number, isNewKindThisWeek: boolean): StatUpdate {
  const c = CONFIG.stats;
  const next = { ...stats };
  const trained = new Set<StatKey>();

  if (event.kind === 'lift' || (event.sets && event.sets.length > 0)) {
    next.STR += c.strPerLiftSession + prCount * c.strPerPr;
    trained.add('STR');
  }
  if (CARDIO_KINDS.has(event.kind)) {
    next.END += event.durationMin * c.endPerCardioMinute;
    trained.add('END');
  }
  if (isNewKindThisWeek) {
    next.AGI += c.agiPerNewKind;
    trained.add('AGI');
  }

  for (const k of STAT_KEYS) next[k] = clampStat(next[k]);
  return { stats: next, trained: [...trained] };
}

export function applyRecoveryDay(stats: Stats, day: DailyRecovery, baselineSleepMin?: number): StatUpdate {
  const c = CONFIG.stats;
  const next = { ...stats };
  const trained = new Set<StatKey>();

  if (day.sleepMin !== undefined && baselineSleepMin !== undefined && day.sleepMin >= baselineSleepMin - 30) {
    next.VIT += c.vitPerGoodSleepDay;
    trained.add('VIT');
  }
  if ((day.steps ?? 0) >= c.agiActiveDaySteps) {
    next.AGI += c.agiPerActiveDay;
    trained.add('AGI');
  }

  for (const k of STAT_KEYS) next[k] = clampStat(next[k]);
  return { stats: next, trained: [...trained] };
}

/**
 * PHY is derived from body composition relative to the starting baseline,
 * using smoothed values, so it moves with real trends rather than single readings.
 */
export function computePhy(baseline: BodyCompReading | undefined, current: Partial<BodyCompReading> | undefined): number {
  const c = CONFIG.stats;
  if (!baseline || !current) return c.start;
  let phy = c.start;
  if (baseline.bodyFatPct !== undefined && current.bodyFatPct !== undefined) {
    phy += (baseline.bodyFatPct - current.bodyFatPct) * c.phyPerPctBodyFatLost;
  }
  if (baseline.leanMassKg !== undefined && current.leanMassKg !== undefined) {
    phy += (current.leanMassKg - baseline.leanMassKg) * c.phyPerKgLeanGained;
  }
  return clampStat(phy);
}

/** Multiply the given stats by (1 - fraction). PHY is derived from data and never decays here. */
export function decayStats(stats: Stats, keys: StatKey[], fraction: number): Stats {
  const next = { ...stats };
  for (const k of keys) {
    if (k === 'PHY') continue;
    next[k] = clampStat(next[k] * (1 - fraction));
  }
  return next;
}

/** Body build tier 1–5 for the character art, from STR and PHY. */
export function buildTier(stats: Stats): number {
  const score = (stats.STR + stats.PHY) / 2;
  const t = CONFIG.buildTierThresholds;
  let tier = 1;
  for (let i = 1; i < t.length; i++) if (score >= t[i]) tier = i + 1;
  return tier;
}
