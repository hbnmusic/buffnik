import { CONFIG, KM_PER_MILE, LB_PER_KG } from './config';
import { addDays, daysBetween } from './dates';
import type { ActivityEvent, BodyCompReading } from './types';

/* ------------------------------------------------------------------ */
/* Chapter: Five Boros (TD Five Boro Bike Tour)                        */
/* ------------------------------------------------------------------ */

export interface FiveBorosState {
  hp: number;
  maxHp: number;
  milestonesHitMiles: number[];
  defeated: boolean;
  defeatedOn?: string;
}

export function initFiveBoros(): FiveBorosState {
  const c = CONFIG.bosses.fiveBoros;
  return { hp: c.maxHp, maxHp: c.maxHp, milestonesHitMiles: [], defeated: false };
}

export interface BossHit {
  damage: number;
  milestones: number[];
  defeated: boolean;
}

/** Cycling sessions (Equinox classes, indoor and outdoor rides) damage the boss. */
export function hitFiveBoros(state: FiveBorosState, event: ActivityEvent): { state: FiveBorosState; hit: BossHit } {
  const c = CONFIG.bosses.fiveBoros;
  const none = { state, hit: { damage: 0, milestones: [], defeated: false } };
  if (state.defeated || event.kind !== 'ride') return none;

  const miles = (event.distanceKm ?? 0) / KM_PER_MILE;

  if (event.date === c.eventDate && miles >= c.finishingRideMiles) {
    return {
      state: { ...state, hp: 0, defeated: true, defeatedOn: event.date },
      hit: { damage: state.hp, milestones: [], defeated: true },
    };
  }

  let damage = event.durationMin * c.hpPerCyclingMinute;
  const milestones: number[] = [];
  c.milestonesMiles.forEach((m, i) => {
    if (miles >= m && !state.milestonesHitMiles.includes(m)) {
      milestones.push(m);
      damage += c.milestoneDamage[i];
    }
  });

  // Training alone can only stagger the boss; the last part falls on event day.
  const floor = Math.ceil(state.maxHp * c.staggerFloorFraction);
  const hp = Math.max(floor, state.hp - damage);
  return {
    state: { ...state, hp, milestonesHitMiles: [...state.milestonesHitMiles, ...milestones] },
    hit: { damage: state.hp - hp, milestones, defeated: false },
  };
}

export function healFiveBoros(state: FiveBorosState, fraction: number): FiveBorosState {
  if (state.defeated || fraction <= 0) return state;
  return { ...state, hp: Math.min(state.maxHp, state.hp + Math.round(state.maxHp * fraction)) };
}

/* ------------------------------------------------------------------ */
/* Chapter: The Descent (weight ladder)                                */
/* ------------------------------------------------------------------ */

export type DescentStatus = 'locked' | 'active' | 'defeated' | 'cleared_at_start';

export interface DescentBoss {
  thresholdLb: number;
  maxHp: number;
  /** Current HP, including any shield added by heals. */
  hp: number;
  /**
   * HP added by missed-week heals. Each 10 HP of shield (at 10 HP/lb) means the
   * 7-day average must go 1 lb further below the threshold to win.
   */
  shieldHp: number;
  status: DescentStatus;
  defeatedOn?: string;
}

export interface DescentState {
  bosses: DescentBoss[];
  /** 7-day average after the weekly loss cap is applied. */
  effectiveAvgLb: number;
  lastUpdate: string;
}

/** Mean weight in pounds over the `averagingDays` ending on `date`, or undefined if no readings. */
export function rollingAverageLb(readings: BodyCompReading[], date: string): number | undefined {
  const days = CONFIG.bosses.descent.averagingDays;
  const from = addDays(date, -(days - 1));
  const window = readings.filter((r) => r.date >= from && r.date <= date);
  if (window.length === 0) return undefined;
  const meanKg = window.reduce((s, r) => s + r.weightKg, 0) / window.length;
  return Math.round(meanKg * LB_PER_KG * 10) / 10;
}

/** The average that actually defeats the boss: its threshold, lowered by any shield. */
export function winningAverageLb(boss: DescentBoss): number {
  return boss.thresholdLb - boss.shieldHp / CONFIG.bosses.descent.hpPerLb;
}

function hpFor(avgLb: number, boss: DescentBoss): number {
  const hp = Math.round((avgLb - winningAverageLb(boss)) * CONFIG.bosses.descent.hpPerLb);
  return Math.min(boss.maxHp + boss.shieldHp, Math.max(0, hp));
}

/** Start the ladder from the current average. Thresholds already beaten are marked cleared without a reward. */
export function initDescent(startAvgLb: number, date: string): DescentState {
  const c = CONFIG.bosses.descent;
  let activated = false;
  const bosses: DescentBoss[] = c.thresholdsLb.map((t, i) => {
    if (startAvgLb < t) return { thresholdLb: t, maxHp: 0, hp: 0, shieldHp: 0, status: 'cleared_at_start' as const };
    if (!activated) {
      activated = true;
      const maxHp = Math.max(1, Math.round((startAvgLb - t) * c.hpPerLb));
      return { thresholdLb: t, maxHp, hp: maxHp, shieldHp: 0, status: 'active' as const };
    }
    const gap = c.thresholdsLb[i - 1] - t;
    const maxHp = Math.round(gap * c.hpPerLb);
    return { thresholdLb: t, maxHp, hp: maxHp, shieldHp: 0, status: 'locked' as const };
  });
  return { bosses, effectiveAvgLb: startAvgLb, lastUpdate: date };
}

export interface DescentUpdate {
  state: DescentState;
  defeatedThresholds: number[];
  damage: number;
}

/**
 * Apply a new 7-day average. Loss faster than the weekly cap counts only up to
 * the cap; a rebound heals the active boss by the amount regained.
 */
export function updateDescent(state: DescentState, avgLb: number, date: string): DescentUpdate {
  const c = CONFIG.bosses.descent;
  const days = Math.max(0, daysBetween(state.lastUpdate, date));
  const maxDrop = state.effectiveAvgLb * c.maxLossFractionPerWeek * (days / 7);
  const effective = Math.round(Math.max(avgLb, state.effectiveAvgLb - maxDrop) * 10) / 10;

  const bosses = state.bosses.map((b) => ({ ...b }));
  const defeatedThresholds: number[] = [];
  let damage = 0;

  let idx = bosses.findIndex((b) => b.status === 'active');
  while (idx !== -1) {
    const boss = bosses[idx];
    const before = boss.hp;
    boss.hp = hpFor(effective, boss);
    damage += Math.max(0, before - boss.hp);

    if (effective < winningAverageLb(boss)) {
      boss.status = 'defeated';
      boss.hp = 0;
      boss.defeatedOn = date;
      defeatedThresholds.push(boss.thresholdLb);
      const nextIdx = idx + 1 < bosses.length ? idx + 1 : -1;
      if (nextIdx !== -1) {
        bosses[nextIdx].status = 'active';
        bosses[nextIdx].hp = bosses[nextIdx].maxHp;
      }
      idx = nextIdx;
    } else {
      idx = -1;
    }
  }

  return { state: { bosses, effectiveAvgLb: effective, lastUpdate: date }, defeatedThresholds, damage };
}

/** A missed week adds a shield to the active boss, so it takes extra progress to win. */
export function healDescent(state: DescentState, fraction: number): DescentState {
  if (fraction <= 0) return state;
  return {
    ...state,
    bosses: state.bosses.map((b) => {
      if (b.status !== 'active') return b;
      const healed = { ...b, shieldHp: b.shieldHp + Math.round(b.maxHp * fraction) };
      return { ...healed, hp: hpFor(state.effectiveAvgLb, healed) };
    }),
  };
}
