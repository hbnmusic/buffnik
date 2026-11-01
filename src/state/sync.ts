/** Reads Health Connect and stores the result. Device only (native module). */
import { availability, connect, grantedTypes, readHealthSnapshot, READ_TYPES } from '../data/healthConnect';
import { applyHealthData } from './service';
import type { Store } from './store';

export type SyncOutcome = { ok: true; message: string } | { ok: false; message: string };

const WINDOW_DAYS = 35;

export async function syncFromHealthConnect(store: Store, askPermission: boolean): Promise<SyncOutcome> {
  try {
    const status = await availability();
    if (status === 'unavailable') return { ok: false, message: 'Health Connect is not available on this phone.' };
    if (status === 'needs_update') return { ok: false, message: 'Health Connect needs an update from the Play Store.' };

    let granted = new Set(await grantedTypes());
    if (READ_TYPES.some((t) => !granted.has(t)) && askPermission) {
      await connect();
      granted = new Set(await grantedTypes());
    }
    if (!READ_TYPES.some((t) => granted.has(t))) {
      return { ok: false, message: 'Allow Buffnik to read Health Connect to sync your workouts, sleep and weight.' };
    }

    const snap = await readHealthSnapshot(WINDOW_DAYS);
    const workoutsFailed = snap.errors.some((e) => e.startsWith('Workouts'));
    await applyHealthData(store, {
      fromMs: Date.parse(snap.from),
      sessions: workoutsFailed ? null : snap.sessions,
      recovery: snap.recovery,
      body: snap.body,
    });
    return snap.errors.length
      ? { ok: true, message: `Synced, but some data could not be read: ${snap.errors.join('; ')}` }
      : { ok: true, message: 'Synced with Health Connect.' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
