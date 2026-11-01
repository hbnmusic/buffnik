/** Phone side of sheet import: load any image format as pixels, and write preview thumbnails. */
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { decodePng, encodePng, type Rgba } from './sheet/png';
import type { Piece } from './sheet/slicer';

const MAX_SIDE = 2048;

/** Any image the phone can open (PNG, JPEG, WebP, HEIC) as RGBA pixels, scaled down to at most 2048 px. */
export async function loadSheetImage(uri: string): Promise<Rgba> {
  const source = uri.startsWith('/') ? `file://${uri}` : uri;
  const ref = await ImageManipulator.manipulate(source, { maxWidth: MAX_SIDE, maxHeight: MAX_SIDE }).renderAsync();
  const saved = await ref.saveAsync({ format: SaveFormat.PNG });
  return decodePng(await new File(saved.uri).bytes());
}

export const pieceKey = (p: Piece) => (p.kind === 'item' ? `item-${p.number}` : p.kind === 'outfit' ? `outfit-${p.outfit}` : 'character');

/** Write each piece to the cache so the preview can show it. Returns file URIs by piece key. */
export function writePreviews(pieces: Piece[], run: number): Record<string, string> {
  const dir = new Directory(Paths.cache, 'sheet-preview');
  if (dir.exists) dir.delete();
  dir.create({ intermediates: true, overwrite: true });
  const uris: Record<string, string> = {};
  for (const p of pieces) {
    // The run number keeps the image cache from showing a previous cut.
    const f = new File(dir, `${pieceKey(p)}-${run}.png`);
    f.create({ overwrite: true });
    f.write(encodePng(p.image));
    uris[pieceKey(p)] = f.uri;
  }
  return uris;
}
