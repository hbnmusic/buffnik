import { CONFIG } from './config';
import { workingTonnageKg } from './prs';
import type { ActivityEvent, ActivityKind, DailyRecovery, XpBreakdown } from './types';

const EMPTY: XpBreakdown = { progression: 0, volume: 0, intensity: 0, variety: 0, recovery: 0, total: 0 };

function weighted(raw: Omit<XpBreakdown, 'total'>): XpBreakdown {
  const w = CONFIG.weights;
  const out = {
    progression: Math.round(raw.progression * w.progression),
    volume: Math.round(raw.volume * w.volume),
    intensity: Math.round(raw.intensity * w.intensity),
    variety: Math.round(raw.variety * w.variety),
    recovery: Math.round(raw.recovery * w.recovery),
  };
  return { ...out, total: out.progression + out.volume + out.intensity + out.variety + out.recovery };
}

/** Manual entries follow the same rule as synced ones (fully credited). */
export function isCredited(event: ActivityEvent): boolean {
  return event.durationMin >= CONFIG.minCreditedMinutes;
}

export interface WorkoutContext {
  /** Activity kinds already credited earlier in the same week. */
  kindsEarlierThisWeek: ReadonlySet<ActivityKind>;
  /** Number of PRs set in this workout (from prs.applySets). */
  prCount: number;
}

export function scoreWorkout(event: ActivityEvent, ctx: WorkoutContext): XpBreakdown {
  if (!isCredited(event)) return EMPTY;
  const p = CONFIG.points;

  const minutes = Math.min(event.durationMin, p.volumeMinuteCap) * p.volumePerMinute;
  const tonnage = event.sets ? (workingTonnageKg(event.sets) / 1000) * p.volumePerTonneLifted : 0;
  const distance = (event.distanceKm ?? 0) * (p.volumePerKm[event.kind] ?? 0);

  const zone = (event.zone3PlusMin ?? 0) * p.intensityPerZone3Minute;
  const rpe = event.rpe !== undefined ? Math.max(0, event.rpe - 5) * p.intensityPerRpeAbove5 : 0;

  return weighted({
    progression: ctx.prCount * p.progressionPerPr,
    volume: minutes + tonnage + distance,
    intensity: zone + rpe,
    variety: ctx.kindsEarlierThisWeek.has(event.kind) ? 0 : p.varietyNewKindInWeek,
    recovery: 0,
  });
}

export interface RecoveryBaselines {
  sleepMin?: number;
  hrvMs?: number;
}

/**
 * Daily recovery XP. Sleep counts if within 30 minutes of the personal
 * baseline; HRV counts if at or above baseline. A rest day following a
 * training day earns a small bonus.
 */
export function scoreRecoveryDay(day: DailyRecovery, base: RecoveryBaselines, restDayAfterTraining: boolean): XpBreakdown {
  const p = CONFIG.points;
  let raw = 0;
  if (day.sleepMin !== undefined && base.sleepMin !== undefined && day.sleepMin >= base.sleepMin - 30) raw += p.recoverySleepOk;
  if (day.hrvMs !== undefined && base.hrvMs !== undefined && day.hrvMs >= base.hrvMs) raw += p.recoveryHrvOk;
  if (restDayAfterTraining) raw += p.recoveryRestDay;
  return weighted({ progression: 0, volume: 0, intensity: 0, variety: 0, recovery: raw });
}

export function addXp(a: XpBreakdown, b: XpBreakdown): XpBreakdown {
  return {
    progression: a.progression + b.progression,
    volume: a.volume + b.volume,
    intensity: a.intensity + b.intensity,
    variety: a.variety + b.variety,
    recovery: a.recovery + b.recovery,
    total: a.total + b.total,
  };
}

export function xpToNextLevel(level: number): number {
  const { base, step } = CONFIG.levelCurve;
  return base + step * (level - 1);
}

export interface LevelInfo {
  level: number;
  xpIntoLevel: number;
  xpForNext: number;
}

export function levelFromXp(totalXp: number): LevelInfo {
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalXp));
  while (remaining >= xpToNextLevel(level)) {
    remaining -= xpToNextLevel(level);
    level += 1;
  }
  return { level, xpIntoLevel: remaining, xpForNext: xpToNextLevel(level) };
}

export function coinsForXp(xp: number): number {
  return Math.round(Math.max(0, xp) * CONFIG.coinsPerXp);
}

export const EMPTY_XP = EMPTY;
