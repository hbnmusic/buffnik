/** Writes an art pack's images to app storage. The pure checks are in packs.ts. */
import { Directory, File, Paths } from 'expo-file-system';

import { planPackZip, type PackManifest } from './packs';

export async function installPackFromZip(uri: string): Promise<PackManifest> {
  const bytes = await new File(uri).bytes();
  const plan = planPackZip(bytes);
  if (!plan.ok) throw new Error(plan.errors.slice(0, 6).join('\n'));

  const dir = new Directory(Paths.document, 'packs', plan.manifest.id);
  if (dir.exists) dir.delete();
  dir.create({ intermediates: true, overwrite: true });
  for (const f of plan.files) {
    const file = new File(dir, ...f.path.split('/'));
    file.create({ intermediates: true, overwrite: true });
    file.write(f.bytes);
  }
  return plan.manifest;
}

export function deletePackFiles(packId: string): void {
  const dir = new Directory(Paths.document, 'packs', packId);
  if (dir.exists) dir.delete();
}
