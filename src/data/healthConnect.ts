/**
 * Health Connect adapter. Reads only; Buffnik never writes health data.
 */
import {
  ExerciseType,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  openHealthConnectSettings,
  readRecords,
  requestPermission,
  SdkAvailabilityStatus,
  type Permission,
  type RecordType,
} from 'react-native-health-connect';

import { invertConstants, summarizeOrigins, type OriginCount } from './originSummary';

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

export interface TypeSummary {
  recordType: ReadType;
  granted: boolean;
  total: number;
  origins: OriginCount[];
  error?: string;
}

/** For each record type: which apps wrote records in the last `days` days. */
export async function diagnose(days = 30, now = new Date()): Promise<TypeSummary[]> {
  await initialize();
  const granted = new Set(await grantedTypes());
  const startTime = new Date(now.getTime() - days * 86_400_000).toISOString();
  const endTime = now.toISOString();

  const out: TypeSummary[] = [];
  for (const recordType of READ_TYPES) {
    if (!granted.has(recordType)) {
      out.push({ recordType, granted: false, total: 0, origins: [] });
      continue;
    }
    try {
      const records: { metadata?: { dataOrigin?: string }; exerciseType?: number }[] = [];
      let pageToken: string | undefined;
      for (let page = 0; page < 10; page++) {
        const res = await readRecords(recordType, {
          timeRangeFilter: { operator: 'between', startTime, endTime },
          pageSize: 1000,
          pageToken,
        });
        records.push(...(res.records as typeof records));
        pageToken = res.pageToken || undefined;
        if (!pageToken) break;
      }
      out.push({
        recordType,
        granted: true,
        total: records.length,
        origins: summarizeOrigins(records, recordType === 'ExerciseSession' ? exerciseName : undefined),
      });
    } catch (e) {
      out.push({ recordType, granted: true, total: 0, origins: [], error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}
