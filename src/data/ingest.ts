/**
 * Pure conversion of Health Connect records into engine inputs. No native imports,
 * so everything here is unit tested. healthConnect.ts reads the records and calls this.
 */
import { CONFIG } from '../engine/config';
import type { ActivityEvent, ActivityKind, BodyCompReading, DailyRecovery, StrengthSet } from '../engine/types';
import type { StrongSession } from './strongCsv';

export interface RawSession {
  /** Full, stable id of the resulting event, e.g. 'hc:com.strava:abc' or 'strong:2026-10-30 18:05:00|Push'. */
  id: string;
  /** Package name of the app that wrote it. */
  origin: string;
  /** Health Connect exercise type constant name, e.g. 'SWIMMING_POOL'. */
  typeName: string;
  startMs: number;
  endMs: number;
  distanceKm?: number;
  /** Logged sets, when the source has them (Strong). */
  sets?: StrengthSet[];
}

export type LocalDate = (ms: number) => string;

/** Local calendar date of an instant, in the device's time zone. */
export const deviceLocalDate: LocalDate = (ms) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export function kindFromTypeName(typeName: string): ActivityKind {
  const n = typeName.toLowerCase().replace(/_/g, ' ');
  if (n.startsWith('swimming')) return 'swim';
  if (n.startsWith('biking')) return 'ride'; // includes stationary bikes (spin classes)
  if (n.startsWith('running')) return 'run';
  if (n.startsWith('walking')) return 'walk';
  if (['strength training', 'weightlifting', 'calisthenics'].includes(n)) return 'lift';
  if (['exercise class', 'high intensity interval training', 'boot camp', 'pilates', 'yoga', 'dancing'].includes(n)) return 'class';
  return 'other';
}

interface Working {
  id: string;
  kind: ActivityKind;
  startMs: number;
  endMs: number;
  distanceKm?: number;
  sets?: StrengthSet[];
  origins: string[];
  primaryOrigin: string;
}

const MIN_MS = 60_000;

function priority(origin: string): number {
  const i = (CONFIG.ingest.originPriority as readonly string[]).indexOf(origin);
  return i === -1 ? CONFIG.ingest.originPriority.length : i;
}

function overlapMs(a: Working, b: Working): number {
  return Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs);
}

function union(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])];
}

/** Join walk fragments that touch or sit within the merge gap. */
function mergeWalks(items: Working[]): Working[] {
  const walks = items.filter((w) => w.kind === 'walk').sort((a, b) => a.startMs - b.startMs);
  const others = items.filter((w) => w.kind !== 'walk');
  const gapMs = CONFIG.ingest.walkMergeGapMinutes * MIN_MS;
  const merged: Working[] = [];
  for (const w of walks) {
    const last = merged[merged.length - 1];
    if (last && w.startMs - last.endMs <= gapMs) {
      // Overlapping fragments from two different apps describe the same steps, so their distance is not summed.
      const sameSteps = w.startMs < last.endMs && !w.origins.every((o) => last.origins.includes(o));
      if (!sameSteps && w.distanceKm !== undefined) last.distanceKm = (last.distanceKm ?? 0) + w.distanceKm;
      last.endMs = Math.max(last.endMs, w.endMs);
      last.origins = union(last.origins, w.origins);
    } else {
      merged.push({ ...w, origins: [...w.origins] });
    }
  }
  return [...others, ...merged];
}

/** Collapse the same non-walk session recorded by more than one app. */
function dedupOverlapping(items: Working[]): Working[] {
  // Same app: the record that carries logged sets wins, then the longer one.
  const sorted = [...items].sort(
    (a, b) =>
      priority(a.primaryOrigin) - priority(b.primaryOrigin) ||
      Number(!!b.sets) - Number(!!a.sets) ||
      b.endMs - b.startMs - (a.endMs - a.startMs),
  );
  const kept: Working[] = [];
  for (const w of sorted) {
    const dup = kept.find((k) => {
      if (k.kind !== w.kind && k.kind !== 'other' && w.kind !== 'other') return false;
      const shorter = Math.min(k.endMs - k.startMs, w.endMs - w.startMs);
      return shorter > 0 && overlapMs(k, w) >= CONFIG.ingest.overlapFraction * shorter;
    });
    if (dup) {
      dup.origins = union(dup.origins, w.origins);
      if (dup.kind === 'other' && w.kind !== 'other') dup.kind = w.kind;
      if (dup.distanceKm === undefined) dup.distanceKm = w.distanceKm;
      if (!dup.sets && w.sets) dup.sets = w.sets;
    } else {
      kept.push({ ...w, origins: [...w.origins] });
    }
  }
  return kept;
}

/** A merged walk counts as a workout if it is long enough and brisk enough. Walks with no distance are judged on length alone. */
function isWalkWorkout(e: ActivityEvent): boolean {
  if (e.durationMin < CONFIG.ingest.walkWorkoutMinMinutes) return false;
  if (e.distanceKm === undefined || CONFIG.ingest.walkWorkoutMinKmh <= 0) return true;
  return e.distanceKm / (e.durationMin / 60) >= CONFIG.ingest.walkWorkoutMinKmh;
}

export interface SessionResult {
  /** Sessions that count toward the weekly target, XP and bosses. */
  workouts: ActivityEvent[];
  /** Walks that are too short or too slow to be workouts. They feed steps and recovery only. */
  walks: ActivityEvent[];
}

/**
 * Merge, dedup and classify raw sessions. Rules:
 *  1. Same non-walk session from two apps counts once (higher-priority app wins).
 *  2. A walk that mostly overlaps another session is part of that session and is dropped.
 *  3. Walk fragments within the merge gap become one walk.
 *  4. A merged walk is a workout only if it is long enough and brisk enough.
 */
export function buildActivityEvents(raw: RawSession[], localDate: LocalDate = deviceLocalDate): SessionResult {
  const items: Working[] = raw
    .filter((r) => r.endMs > r.startMs)
    .map((r) => ({
      id: r.id,
      kind: kindFromTypeName(r.typeName),
      startMs: r.startMs,
      endMs: r.endMs,
      distanceKm: r.distanceKm,
      sets: r.sets,
      origins: [r.origin],
      primaryOrigin: r.origin,
    }));

  const nonWalks = dedupOverlapping(items.filter((i) => i.kind !== 'walk'));
  const walks = items.filter((i) => i.kind === 'walk').filter((w) => {
    const dur = w.endMs - w.startMs;
    return !nonWalks.some((n) => overlapMs(n, w) >= CONFIG.ingest.overlapFraction * dur);
  });
  const all = mergeWalks([...nonWalks, ...walks]);

  const toEvent = (w: Working): ActivityEvent => ({
    id: w.id,
    kind: w.kind,
    date: localDate(w.startMs),
    durationMin: Math.round((w.endMs - w.startMs) / MIN_MS),
    ...(w.distanceKm !== undefined ? { distanceKm: Math.round(w.distanceKm * 100) / 100 } : {}),
    ...(w.sets ? { sets: w.sets } : {}),
    origins: w.origins,
  });

  const workouts: ActivityEvent[] = [];
  const shortWalks: ActivityEvent[] = [];
  for (const w of [...all].sort((a, b) => a.startMs - b.startMs)) {
    const e = toEvent(w);
    if (w.kind === 'walk' && !isWalkWorkout(e)) shortWalks.push(e);
    else workouts.push(e);
  }
  return { workouts, walks: shortWalks };
}

export interface RawSleep {
  startMs: number;
  endMs: number;
  stages?: { startMs: number; endMs: number; stage: number }[];
}

/** Minutes asleep: the session length, minus awake and out-of-bed stages when stages exist. */
export function sleepMinutes(s: RawSleep): number {
  const total = (s.endMs - s.startMs) / MIN_MS;
  if (!s.stages || s.stages.length === 0) return Math.round(total);
  const excluded = CONFIG.ingest.sleepExcludedStages as readonly number[];
  const away = s.stages.filter((st) => excluded.includes(st.stage)).reduce((sum, st) => sum + (st.endMs - st.startMs) / MIN_MS, 0);
  return Math.max(0, Math.round(total - away));
}

export interface RecoveryInput {
  sleep: RawSleep[];
  hrv: { timeMs: number; rmssdMs: number }[];
  steps: { date: string; count: number }[];
}

/** One row per local date. A night's sleep belongs to the date you woke up. */
export function buildDailyRecovery(input: RecoveryInput, localDate: LocalDate = deviceLocalDate): DailyRecovery[] {
  const byDate = new Map<string, DailyRecovery>();
  const row = (date: string) => {
    let r = byDate.get(date);
    if (!r) byDate.set(date, (r = { date }));
    return r;
  };
  for (const s of input.sleep) {
    const r = row(localDate(s.endMs));
    r.sleepMin = (r.sleepMin ?? 0) + sleepMinutes(s);
  }
  const hrvByDate = new Map<string, number[]>();
  for (const h of input.hrv) {
    const d = localDate(h.timeMs);
    hrvByDate.set(d, [...(hrvByDate.get(d) ?? []), h.rmssdMs]);
  }
  for (const [d, values] of hrvByDate) row(d).hrvMs = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  for (const s of input.steps) row(s.date).steps = s.count;
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export interface BodyInput {
  weights: { timeMs: number; kg: number }[];
  bodyFat: { timeMs: number; pct: number }[];
  leanMass: { timeMs: number; kg: number }[];
}

/** One reading per local date: the last weigh-in of the day, with that day's body fat and lean mass. */
export function buildBodyComp(input: BodyInput, localDate: LocalDate = deviceLocalDate): BodyCompReading[] {
  const lastPerDate = <T extends { timeMs: number }>(items: T[]) => {
    const m = new Map<string, T>();
    for (const it of items) {
      const d = localDate(it.timeMs);
      const cur = m.get(d);
      if (!cur || it.timeMs > cur.timeMs) m.set(d, it);
    }
    return m;
  };
  const fat = lastPerDate(input.bodyFat);
  const lean = lastPerDate(input.leanMass);
  const out: BodyCompReading[] = [];
  for (const [date, w] of lastPerDate(input.weights)) {
    const f = fat.get(date);
    const l = lean.get(date);
    out.push({
      date,
      weightKg: Math.round(w.kg * 100) / 100,
      ...(f ? { bodyFatPct: Math.round(f.pct * 10) / 10 } : {}),
      ...(l ? { leanMassKg: Math.round(l.kg * 100) / 100 } : {}),
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export interface RecoverySummary {
  nights: number;
  avgSleepMin?: number;
  avgHrvMs?: number;
  avgSteps?: number;
}

/** Averages over the days that have each measurement. */
export function summarizeRecovery(rows: DailyRecovery[]): RecoverySummary {
  const avg = (values: number[]) => (values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : undefined);
  const sleep = rows.flatMap((r) => (r.sleepMin !== undefined ? [r.sleepMin] : []));
  return {
    nights: sleep.length,
    avgSleepMin: avg(sleep),
    avgHrvMs: avg(rows.flatMap((r) => (r.hrvMs !== undefined ? [r.hrvMs] : []))),
    avgSteps: avg(rows.flatMap((r) => (r.steps !== undefined ? [r.steps] : []))),
  };
}

/** Local time as exported by Strong ('2026-10-30 18:05:00') in the device's time zone. */
function parseLocalTime(text: string): number {
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return NaN;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0).getTime();
}

/** A Strong CSV workout as a raw session, so it de-duplicates against Health Connect like any other source. */
export function strongToRaw(s: StrongSession): RawSession | null {
  const startMs = parseLocalTime(s.startedAt);
  if (Number.isNaN(startMs)) return null;
  return {
    id: `strong:${s.key}`,
    origin: 'io.strongapp.strong',
    typeName: 'STRENGTH_TRAINING',
    startMs,
    endMs: startMs + Math.max(s.durationMin, 1) * MIN_MS,
    sets: s.sets,
  };
}
