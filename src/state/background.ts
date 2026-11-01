/**
 * Background sync: Android runs this every so often (at least an hour apart here, at the
 * system's discretion) so unlock alerts can arrive when the app is closed.
 * Import this module once at startup so the task is defined before it can run.
 */
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { runSyncCycle } from './cycle';
import { openSqliteStore } from './sqliteStore';

export const SYNC_TASK = 'buffnik-sync';

TaskManager.defineTask(SYNC_TASK, async () => {
  try {
    await runSyncCycle(await openSqliteStore(), false);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundSync(): Promise<void> {
  try {
    if (!(await TaskManager.isTaskRegisteredAsync(SYNC_TASK))) {
      await BackgroundTask.registerTaskAsync(SYNC_TASK, { minimumInterval: 60 });
    }
  } catch {
    // Background work can be unavailable (battery restrictions); the app still syncs when opened.
  }
}
