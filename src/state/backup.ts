/**
 * Backup file: every raw input (sessions, recovery, body, purchases) and settings, as JSON.
 * Derived state is recomputed on restore. Art pack images are not included (reimport the zip);
 * the pack list is left out so a restore never points at missing images.
 */
import type { Store, StoreDump } from './store';

const EXCLUDED_META = ['packs'];

export interface BackupFile {
  app: 'buffnik';
  version: 1;
  createdAt: string;
  data: StoreDump;
}

export async function createBackup(store: Store, now = new Date()): Promise<BackupFile> {
  const data = await store.dumpAll();
  const meta = Object.fromEntries(Object.entries(data.meta).filter(([k]) => !EXCLUDED_META.includes(k)));
  return { app: 'buffnik', version: 1, createdAt: now.toISOString(), data: { ...data, meta } };
}

export const backupFileName = (now = new Date()) => `buffnik-backup-${now.toISOString().slice(0, 10)}.json`;

export type ParsedBackup = { ok: true; backup: BackupFile; summary: string } | { ok: false; reason: string };

export function parseBackup(text: string): ParsedBackup {
  let b: BackupFile;
  try {
    b = JSON.parse(text) as BackupFile;
  } catch {
    return { ok: false, reason: 'That file is not a Buffnik backup (it is not valid JSON).' };
  }
  if (b?.app !== 'buffnik' || b.version !== 1 || !b.data) return { ok: false, reason: 'That file is not a Buffnik backup.' };
  const d = b.data;
  if (typeof d.meta !== 'object' || !Array.isArray(d.sessions) || !Array.isArray(d.recovery) || !Array.isArray(d.body) || !Array.isArray(d.purchases)) {
    return { ok: false, reason: 'The backup is damaged or from a newer version.' };
  }
  return {
    ok: true,
    backup: b,
    summary: `${d.sessions.length} sessions, ${d.purchases.length} purchases, ${d.body.length} weigh-ins, made ${b.createdAt.slice(0, 10)}`,
  };
}

/** Replace everything with the backup. Keeps this install's own art pack list. */
export async function restoreBackup(store: Store, backup: BackupFile, now = new Date()): Promise<void> {
  const packs = await store.getMeta('packs');
  const meta = { ...backup.data.meta, ...(packs ? { packs } : {}), lastBackup: now.toISOString() };
  await store.restoreAll({ ...backup.data, meta });
}

export async function markBackedUp(store: Store, now = new Date()): Promise<void> {
  await store.setMeta('lastBackup', now.toISOString());
}
