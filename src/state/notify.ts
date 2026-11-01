/** Local notifications on the device (expo-notifications). */
import * as Notifications from 'expo-notifications';

import type { Note, ScheduledNote } from './notifications';

const CHANNEL = 'buffnik';

export function configureNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

async function ensureChannel(): Promise<void> {
  await Notifications.setNotificationChannelAsync(CHANNEL, { name: 'Buffnik', importance: Notifications.AndroidImportance.DEFAULT });
}

export async function notificationsAllowed(): Promise<boolean> {
  return (await Notifications.getPermissionsAsync()).granted;
}

export async function requestNotificationPermission(): Promise<boolean> {
  await ensureChannel();
  return (await Notifications.requestPermissionsAsync()).granted;
}

/** Replace everything scheduled with the given plan. Does nothing if notifications are not allowed. */
export async function applySchedule(plan: ScheduledNote[]): Promise<void> {
  if (!(await notificationsAllowed())) return;
  await ensureChannel();
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const n of plan) {
    await Notifications.scheduleNotificationAsync({
      identifier: n.id,
      content: { title: n.title, body: n.body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: n.at, channelId: CHANNEL },
    });
  }
}

export async function notifyNow(notes: Note[]): Promise<void> {
  if (notes.length === 0 || !(await notificationsAllowed())) return;
  await ensureChannel();
  for (const n of notes) {
    await Notifications.scheduleNotificationAsync({ identifier: n.id, content: { title: n.title, body: n.body }, trigger: null });
  }
}
