/**
 * Health Connect adapter. Reads only; Buffnik never writes health data.
 */
import {
  aggregateGroupByPeriod,
  aggregateRecord,
  ExerciseType,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  openHealthConnectSettings,
  readRecords,
  requestPermission,
  SdkAvailabilityStatus,
  type Permission,
  type RecordResult,
  type RecordType,
} from 'react-native-health-connect';

import type { ActivityEvent, BodyCompReading, DailyRecovery } from '../engine/types';
import { buildActivityEvents, buildBodyComp, buildDailyRecovery, type RawSession, type RawSleep } from './ingest';
import { invertConstants, originLabel, summarizeOrigins, type OriginCount } from './originSummary';

/** Record types Buffnik reads, in the order the diagnostics screen shows them. */
export const READ_TYPES = [
  'ExerciseSession',
  'Distance',
  'HeartRate',
  'RestingHeartRate',
  'HeartRateVariabilityRmssd',
  'SleepSession',
  'Steps',
  'Weight',
  'BodyFat',
  'LeanBodyMass',
] as const satisfies readonly RecordType[];

export type ReadType = (typeof READ_TYPES)[number];

export const READ_PERMISSIONS: Permission[] = READ_TYPES.map((recordType) => ({ accessType: 'read', recordType }));

export type HcAvailability = 'available' | 'needs_update' | 'unavailable';

export async function availability(): Promise<HcAvailability> {
  const status = await getSdkStatus();
  if (status === SdkAvailabilityStatus.SDK_AVAILABLE) return 'available';
  if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) return 'needs_update';
  return 'unavailable';
}

export async function connect(): Promise<string[]> {
  const ok = await initialize();
  if (!ok) throw new Error('Health Connect could not be initialised.');
  // History lets Buffnik read past the default window, for Strong/PR baselines and weight averages.
  const granted = await requestPermission([...READ_PERMISSIONS, { accessType: 'read', recordType: 'ReadHealthDataHistory' }]);
  return granted.map((p) => p.recordType);
}

export async function grantedTypes(): Promise<string[]> {
  await initialize();
  const granted = await getGrantedPermissions();
  return granted.filter((p) => p.accessType === 'read').map((p) => p.recordType);
}

export { openHealthConnectSettings };

const exerciseName = invertConstants(ExerciseType as unknown as Record<string, number>);

const DAY_MS = 86_400_000;

/** Read every page of a record type in a time range, up to maxPages x 1000 records. */
async function readAll<T extends RecordType>(
  recordType: T,
  startTime: string,
  endTime: string,
  maxPages: number,
): Promise<{ records: RecordResult<T>[]; truncated: boolean }> {
  const records: RecordResult<T>[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const res = await readRecords(recordType, {
      timeRangeFilter: { operator: 'between', startTime, endTime },
      pageSize: 1000,
      pageToken,
    });
    records.push(...res.records);
    pageToken = res.pageToken || undefined;
    if (!pageToken) return { records, truncated: false };
  }
  return { records, truncated: true };
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export interface TypeSummary {
  recordType: ReadType;
  granted: boolean;
  total: number;
  /** True when there were more records than the diagnostics read, so `total` is a floor. */
  truncated: boolean;
  origins: OriginCount[];
  /** Health Connect's own de-duplicated total for steps and distance. */
  dedupNote?: string;
  error?: string;
}

/** Health Connect merges overlapping records from several apps, so this is the number to trust. */
async function dedupNote(recordType: ReadType, startTime: string, endTime: string): Promise<string | undefined> {
  const timeRangeFilter = { operator: 'between', startTime, endTime } as const;
  if (recordType === 'Steps') {
    const r = await aggregateRecord({ recordType: 'Steps', timeRangeFilter });
    return `De-duplicated by Health Connect: ${Math.round(r.COUNT_TOTAL).toLocaleString()} steps (from ${r.dataOrigins.map(originLabel).join(', ') || 'no app'})`;
  }
  if (recordType === 'Distance') {
    const r = await aggregateRecord({ recordType: 'Distance', timeRangeFilter });
    return `De-duplicated by Health Connect: ${Math.round(r.DISTANCE.inKilometers).toLocaleString()} km (from ${r.dataOrigins.map(originLabel).join(', ') || 'no app'})`;
  }
  return undefined;
}

/** For each record type: which apps wrote records in the last `days` days. */
export async function diagnose(days = 30, now = new Date()): Promise<TypeSummary[]> {
  await initialize();
  const granted = new Set(await grantedTypes());
  const startTime = new Date(now.getTime() - days * DAY_MS).toISOString();
  const endTime = now.toISOString();

  const out: TypeSummary[] = [];
  for (const recordType of READ_TYPES) {
    if (!granted.has(recordType)) {
      out.push({ recordType, granted: false, total: 0, truncated: false, origins: [] });
      continue;
    }
    try {
      const { records, truncated } = await readAll(recordType, startTime, endTime, 10);
      const summary: TypeSummary = {
        recordType,
        granted: true,
        total: records.length,
        truncated,
        origins: summarizeOrigins(records, recordType === 'ExerciseSession' ? exerciseName : undefined),
      };
      try {
        summary.dedupNote = await dedupNote(recordType, startTime, endTime);
      } catch {
        // The aggregate is an extra; the raw counts above still stand.
      }
      out.push(summary);
    } catch (e) {
      out.push({ recordType, granted: true, total: 0, truncated: false, origins: [], error: errorText(e) });
    }
  }
  return out;
}

export interface HealthSnapshot {
  from: string;
  to: string;
  workouts: ActivityEvent[];
  /** Short walks: they feed steps and recovery but are not workouts. */
  walks: ActivityEvent[];
  recovery: DailyRecovery[];
  body: BodyCompReading[];
  /** Anything that failed to read, by record type. */
  errors: string[];
}

async function distanceKm(startTime: string, endTime: string): Promise<number | undefined> {
  try {
    const r = await aggregateRecord({ recordType: 'Distance', timeRangeFilter: { operator: 'between', startTime, endTime } });
    return r.DISTANCE.inKilometers > 0 ? r.DISTANCE.inKilometers : undefined;
  } catch {
    return undefined;
  }
}

/** Read the last `days` days of Health Connect data and turn it into what the game counts. */
export async function readHealthSnapshot(days = 30, now = new Date()): Promise<HealthSnapshot> {
  await initialize();
  const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
  const startTime = startDay.toISOString();
  const endTime = now.toISOString();
  const errors: string[] = [];
  const attempt = async <T,>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      errors.push(`${label}: ${errorText(e)}`);
      return fallback;
    }
  };

  const sessions = await attempt<RawSession[]>(
    'Workouts',
    async () => {
      const { records } = await readAll('ExerciseSession', startTime, endTime, 20);
      const raw: RawSession[] = records.map((r) => ({
        id: r.metadata?.id ?? r.startTime,
        origin: r.metadata?.dataOrigin ?? 'unknown',
        typeName: exerciseName(r.exerciseType),
        startMs: Date.parse(r.startTime),
        endMs: Date.parse(r.endTime),
      }));
      for (let i = 0; i < records.length; i += 10) {
        const batch = records.slice(i, i + 10);
        const dists = await Promise.all(batch.map((r) => distanceKm(r.startTime, r.endTime)));
        dists.forEach((d, j) => (raw[i + j].distanceKm = d));
      }
      return raw;
    },
    [],
  );

  const sleep = await attempt<RawSleep[]>(
    'Sleep',
    async () => {
      const { records } = await readAll('SleepSession', startTime, endTime, 5);
      return records.map((r) => ({
        startMs: Date.parse(r.startTime),
        endMs: Date.parse(r.endTime),
        stages: r.stages?.map((s) => ({ startMs: Date.parse(s.startTime), endMs: Date.parse(s.endTime), stage: s.stage })),
      }));
    },
    [],
  );

  const hrv = await attempt(
    'HRV',
    async () => {
      const { records } = await readAll('HeartRateVariabilityRmssd', startTime, endTime, 20);
      return records.map((r) => ({ timeMs: Date.parse(r.time), rmssdMs: r.heartRateVariabilityMillis }));
    },
    [] as { timeMs: number; rmssdMs: number }[],
  );

  const steps = await attempt(
    'Steps',
    async () => {
      const groups = await aggregateGroupByPeriod({
        recordType: 'Steps',
        timeRangeFilter: { operator: 'between', startTime, endTime },
        timeRangeSlicer: { period: 'DAYS', length: 1 },
      });
      return groups.map((g) => ({ date: g.startTime.slice(0, 10), count: Math.round(g.result.COUNT_TOTAL) }));
    },
    [] as { date: string; count: number }[],
  );

  const weights = await attempt(
    'Weight',
    async () => (await readAll('Weight', startTime, endTime, 5)).records.map((r) => ({ timeMs: Date.parse(r.time), kg: r.weight.inKilograms })),
    [] as { timeMs: number; kg: number }[],
  );
  const bodyFat = await attempt(
    'Body fat',
    async () => (await readAll('BodyFat', startTime, endTime, 5)).records.map((r) => ({ timeMs: Date.parse(r.time), pct: r.percentage })),
    [] as { timeMs: number; pct: number }[],
  );
  const leanMass = await attempt(
    'Lean mass',
    async () => (await readAll('LeanBodyMass', startTime, endTime, 5)).records.map((r) => ({ timeMs: Date.parse(r.time), kg: r.mass.inKilograms })),
    [] as { timeMs: number; kg: number }[],
  );

  const { workouts, walks } = buildActivityEvents(sessions);
  return {
    from: startTime,
    to: endTime,
    workouts,
    walks,
    recovery: buildDailyRecovery({ sleep, hrv, steps }),
    body: buildBodyComp({ weights, bodyFat, leanMass }),
    errors,
  };
}
