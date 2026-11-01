/** Writes an art pack's images to app storage. The pure checks are in packs.ts. */
import { Directory, File, Paths } from 'expo-file-system';

import { planPackZip, type PackFile, type PackManifest } from './packs';

/** Write files into the pack's folder. `replace` clears the folder first (a re-imported zip); adding a sheet keeps earlier files. */
export function writePackFiles(packId: string, files: PackFile[], replace: boolean): void {
  const dir = new Directory(Paths.document, 'packs', packId);
  if (replace && dir.exists) dir.delete();
  dir.create({ intermediates: true, overwrite: true });
  for (const f of files) {
    const file = new File(dir, ...f.path.split('/'));
    file.create({ intermediates: true, overwrite: true });
    file.write(f.bytes);
  }
}

export async function installPackFromZip(uri: string): Promise<PackManifest> {
  const bytes = await new File(uri).bytes();
  const plan = planPackZip(bytes);
  if (!plan.ok) throw new Error(plan.errors.slice(0, 6).join('\n'));
  writePackFiles(plan.manifest.id, plan.files, true);
  return plan.manifest;
}

export function deletePackFiles(packId: string): void {
  const dir = new Directory(Paths.document, 'packs', packId);
  if (dir.exists) dir.delete();
}
