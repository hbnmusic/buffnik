/**
 * One full cycle: sync Health Connect, rebuild the game, announce new unlocks, reschedule reminders.
 * Used by the app on start/resume and by the background task.
 */
import { loadGame, scheduleContext, type Loaded } from './service';
import { detectEvents, planSchedule, seenFrom, type Seen } from './notifications';
import { applySchedule, notifyNow } from './notify';
import type { Store } from './store';
import { syncFromHealthConnect, type SyncOutcome } from './sync';

async function readSeen(store: Store): Promise<Seen | null> {
  const raw = await store.getMeta('seen');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Seen;
  } catch {
    return null;
  }
}

/** Announce what is new (if `announce`), record it as seen, and refresh the reminder schedule. */
export async function announceAndSchedule(store: Store, loaded: Loaded, announce: boolean): Promise<void> {
  try {
    const { notes, seen } = detectEvents(await readSeen(store), loaded.state);
    if (announce && loaded.settings.notifications.unlocks) await notifyNow(notes);
    await store.setMeta('seen', JSON.stringify(announce ? seen : seenFrom(loaded.state)));
    await applySchedule(planSchedule(loaded.settings, scheduleContext(loaded)));
  } catch {
    // Notifications are a convenience; never let them break syncing.
  }
}

export async function runSyncCycle(store: Store, askPermission: boolean): Promise<{ outcome: SyncOutcome; loaded: Loaded }> {
  const outcome = await syncFromHealthConnect(store, askPermission);
  const loaded = await loadGame(store);
  await announceAndSchedule(store, loaded, true);
  return { outcome, loaded };
}
