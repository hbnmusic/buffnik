/**
 * Pure helpers for the diagnostics screen: which app wrote which Health
 * Connect records. Kept free of native imports so they are unit tested.
 */

export const KNOWN_ORIGINS: Record<string, string> = {
  'com.ultrahuman.android': 'Ultrahuman',
  'com.fitbit.FitbitMobile': 'Google Health (Fitbit)',
  'com.google.android.apps.fitness': 'Google Fit',
  'com.google.android.apps.healthdata': 'Health Connect',
  'com.strava': 'Strava',
  'io.strongapp.strong': 'Strong',
  'com.buffnik.app': 'Buffnik',
};

export function originLabel(pkg: string | undefined): string {
  if (!pkg) return 'Unknown app';
  return KNOWN_ORIGINS[pkg] ?? pkg;
}

export interface OriginCount {
  origin: string;
  label: string;
  count: number;
  /** For exercise sessions: count per exercise type name. */
  detail?: Record<string, number>;
}

export interface MinimalRecord {
  metadata?: { dataOrigin?: string };
  exerciseType?: number;
}

/** Count records per writing app, most records first. */
export function summarizeOrigins(records: MinimalRecord[], exerciseTypeName?: (t: number) => string): OriginCount[] {
  const byOrigin = new Map<string, OriginCount>();
  for (const r of records) {
    const origin = r.metadata?.dataOrigin ?? 'unknown';
    let entry = byOrigin.get(origin);
    if (!entry) {
      entry = { origin, label: originLabel(r.metadata?.dataOrigin), count: 0 };
      byOrigin.set(origin, entry);
    }
    entry.count += 1;
    if (exerciseTypeName && typeof r.exerciseType === 'number') {
      const name = exerciseTypeName(r.exerciseType);
      entry.detail = entry.detail ?? {};
      entry.detail[name] = (entry.detail[name] ?? 0) + 1;
    }
  }
  return [...byOrigin.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Turn a constants object like { SWIMMING_POOL: 74 } into a number → readable name lookup. */
export function invertConstants(constants: Record<string, number>): (n: number) => string {
  const map = new Map<number, string>();
  for (const [key, value] of Object.entries(constants)) {
    map.set(value, key.toLowerCase().replace(/_/g, ' '));
  }
  return (n) => map.get(n) ?? `type ${n}`;
}
