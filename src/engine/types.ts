export type StatKey = 'STR' | 'END' | 'VIT' | 'AGI' | 'PHY';
export const STAT_KEYS: readonly StatKey[] = ['STR', 'END', 'VIT', 'AGI', 'PHY'];

export type ActivityKind = 'swim' | 'ride' | 'run' | 'walk' | 'lift' | 'class' | 'other';

export interface StrengthSet {
  exercise: string;
  weightKg: number;
  reps: number;
  warmup?: boolean;
}

/** One merged workout, after dedup across sources. Dates are local 'YYYY-MM-DD'. */
export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  date: string;
  durationMin: number;
  distanceKm?: number;
  zone3PlusMin?: number;
  rpe?: number;
  sets?: StrengthSet[];
  manual?: boolean;
  /** The length was estimated from the logged sets because the app's own timer ran short. */
  estimated?: boolean;
  /** The length was set by hand on the Workouts tab. */
  edited?: boolean;
  origins: string[];
}

/** One day of recovery data from the ring (and phone steps). */
export interface DailyRecovery {
  date: string;
  sleepMin?: number;
  hrvMs?: number;
  steps?: number;
}

export interface BodyCompReading {
  date: string;
  weightKg: number;
  bodyFatPct?: number;
  leanMassKg?: number;
}

export type Stats = Record<StatKey, number>;

export interface XpBreakdown {
  progression: number;
  volume: number;
  intensity: number;
  variety: number;
  recovery: number;
  total: number;
}
