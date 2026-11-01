/** User settings, stored as one JSON document in the Store's meta table. */
import type { Store } from './store';

export interface Settings {
  notifications: {
    dailyNudge: boolean;
    /** 'HH:MM', 24-hour, local time. */
    dailyNudgeTime: string;
    weeklySummary: boolean;
    /** Sent on Sundays. */
    weeklySummaryTime: string;
    unlocks: boolean;
    backupReminder: boolean;
  };
  /** Used to estimate heart-rate zones for intensity XP. */
  maxHr: number;
  /** Steam vanity name, profile link or 64-bit id, for the wishlist. */
  steamId: string;
}

export const DEFAULT_SETTINGS: Settings = {
  notifications: {
    dailyNudge: true,
    dailyNudgeTime: '18:00',
    weeklySummary: true,
    weeklySummaryTime: '19:00',
    unlocks: true,
    backupReminder: true,
  },
  maxHr: 185,
  steamId: 'acowfromspace',
};

export async function loadSettings(store: Store): Promise<Settings> {
  const raw = await store.getMeta('settings');
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const saved = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...saved, notifications: { ...DEFAULT_SETTINGS.notifications, ...saved.notifications } };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(store: Store, settings: Settings): Promise<void> {
  await store.setMeta('settings', JSON.stringify(settings));
}

/** 'HH:MM' to [hour, minute]; falls back to the given default if malformed. */
export function parseTime(text: string, fallback: [number, number]): [number, number] {
  const m = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return fallback;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? [h, min] : fallback;
}
