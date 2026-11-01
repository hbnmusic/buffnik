/** Phone side of backups: write the file, hand it to the share sheet (Drive, Files...), and pick one to restore. */
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { backupFileName, createBackup, markBackedUp, parseBackup, restoreBackup, type BackupFile } from './backup';
import type { Store } from './store';

export async function exportBackup(store: Store): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('This phone has no share sheet available.');
  const now = new Date();
  const file = new File(Paths.cache, backupFileName(now));
  file.create({ overwrite: true });
  file.write(JSON.stringify(await createBackup(store, now)));
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save your Buffnik backup (choose Drive)', UTI: 'public.json' });
  await markBackedUp(store, now);
}

export interface PickedBackup {
  summary: string;
  apply: () => Promise<void>;
}

/** Let the user pick a backup file. Returns null if they cancel; throws with a readable message if the file is not a backup. */
export async function pickBackup(store: Store): Promise<PickedBackup | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', 'application/octet-stream'], copyToCacheDirectory: true });
  if (res.canceled) return null;
  const parsed = parseBackup(await new File(res.assets[0].uri).text());
  if (!parsed.ok) throw new Error(parsed.reason);
  const backup: BackupFile = parsed.backup;
  return { summary: parsed.summary, apply: () => restoreBackup(store, backup) };
}
