/**
 * Art packs: a zip with pack.json and image files. Each look in a pack is a full-figure
 * image (optionally one per body tier) that replaces the drawn character. Pure
 * validation and planning here; writing the files is done by the device layer.
 *
 * pack.json:
 *   { "format": 1, "id": "my-pack", "name": "My pack",
 *     "looks": [ { "id": "ember", "name": "Ember", "rarity": "rare",
 *                  "image": "ember.png", "tiers": { "1": "ember_1.png", "5": "ember_5.png" } } ] }
 */
import { unzipSync } from 'fflate';

export const RARITIES = ['common', 'rare', 'epic', 'legendary'] as const;
export type PackRarity = (typeof RARITIES)[number];

export interface PackLook {
  id: string;
  name: string;
  rarity: PackRarity;
  /** Path inside the pack folder. */
  image: string;
  tiers?: Record<string, string>;
}

export interface PackManifest {
  format: 1;
  id: string;
  name: string;
  looks: PackLook[];
}

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 120 * 1024 * 1024;
const SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/;
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

function cleanPath(p: unknown): string | null {
  if (typeof p !== 'string') return null;
  const parts = p.replace(/\\/g, '/').split('/').filter((x) => x !== '' && x !== '.');
  if (parts.length === 0 || parts.includes('..')) return null;
  return parts.join('/');
}

export type PackValidation = { ok: true; manifest: PackManifest } | { ok: false; errors: string[] };

export function validateManifest(raw: unknown): PackValidation {
  const errors: string[] = [];
  if (typeof raw !== 'object' || raw === null) return { ok: false, errors: ['pack.json is not an object.'] };
  const m = raw as Record<string, unknown>;
  if (m.format !== 1) errors.push('"format" must be 1.');
  if (typeof m.id !== 'string' || !SLUG.test(m.id)) errors.push('"id" must be lowercase letters, digits and dashes (up to 40 characters).');
  if (typeof m.name !== 'string' || m.name.trim() === '' || m.name.length > 60) errors.push('"name" is required (up to 60 characters).');
  if (!Array.isArray(m.looks) || m.looks.length === 0) errors.push('"looks" must be a non-empty list.');
  else if (m.looks.length > 200) errors.push('A pack can hold at most 200 looks.');

  const looks: PackLook[] = [];
  const ids = new Set<string>();
  if (Array.isArray(m.looks)) {
    m.looks.slice(0, 200).forEach((l, i) => {
      const where = `looks[${i}]`;
      if (typeof l !== 'object' || l === null) return errors.push(`${where} is not an object.`);
      const o = l as Record<string, unknown>;
      const id = o.id;
      if (typeof id !== 'string' || !SLUG.test(id)) return errors.push(`${where}: "id" must be lowercase letters, digits and dashes.`);
      if (ids.has(id)) return errors.push(`${where}: duplicate id "${id}".`);
      ids.add(id);
      if (typeof o.name !== 'string' || o.name.trim() === '') errors.push(`${where}: "name" is required.`);
      if (!RARITIES.includes(o.rarity as PackRarity)) errors.push(`${where}: "rarity" must be one of ${RARITIES.join(', ')}.`);
      const image = cleanPath(o.image);
      if (!image || !IMAGE_EXT.test(image)) errors.push(`${where}: "image" must be a png, jpg or webp path inside the pack.`);
      const tiers: Record<string, string> = {};
      if (o.tiers !== undefined) {
        if (typeof o.tiers !== 'object' || o.tiers === null) errors.push(`${where}: "tiers" must be an object.`);
        else {
          for (const [k, v] of Object.entries(o.tiers)) {
            const p = cleanPath(v);
            if (!['1', '2', '3', '4', '5'].includes(k) || !p || !IMAGE_EXT.test(p)) errors.push(`${where}: tiers needs keys 1 to 5 with image paths.`);
            else tiers[k] = p;
          }
        }
      }
      if (errors.length === 0 && image) {
        looks.push({ id, name: String(o.name).trim(), rarity: o.rarity as PackRarity, image, ...(Object.keys(tiers).length ? { tiers } : {}) });
      }
    });
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, manifest: { format: 1, id: m.id as string, name: (m.name as string).trim(), looks } };
}

export interface PackFile {
  /** Path relative to the pack folder. */
  path: string;
  bytes: Uint8Array;
}

export type PackPlan = { ok: true; manifest: PackManifest; files: PackFile[] } | { ok: false; errors: string[] };

/** From the unzipped entries (path to bytes): find pack.json, validate it, and collect the image files it uses. */
export function planPackImport(entries: Record<string, Uint8Array>): PackPlan {
  const names = Object.keys(entries).filter((n) => !n.endsWith('/') && !n.startsWith('__MACOSX/'));
  const manifestPath = names.find((n) => n === 'pack.json') ?? names.find((n) => /^[^/]+\/pack\.json$/.test(n));
  if (!manifestPath) return { ok: false, errors: ['No pack.json found in the zip.'] };
  const prefix = manifestPath.slice(0, manifestPath.length - 'pack.json'.length);

  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(entries[manifestPath]));
  } catch {
    return { ok: false, errors: ['pack.json is not valid JSON.'] };
  }
  const v = validateManifest(json);
  if (!v.ok) return v;

  const wanted = new Set<string>();
  for (const l of v.manifest.looks) {
    wanted.add(l.image);
    Object.values(l.tiers ?? {}).forEach((p) => wanted.add(p));
  }
  const errors: string[] = [];
  const files: PackFile[] = [];
  let total = 0;
  for (const path of wanted) {
    const bytes = entries[prefix + path];
    if (!bytes) errors.push(`Missing file: ${path}`);
    else if (bytes.length > MAX_FILE_BYTES) errors.push(`${path} is larger than 8 MB.`);
    else {
      total += bytes.length;
      files.push({ path, bytes });
    }
  }
  if (total > MAX_TOTAL_BYTES) errors.push('The pack is larger than 120 MB.');
  return errors.length ? { ok: false, errors } : { ok: true, manifest: v.manifest, files };
}

export function planPackZip(zipBytes: Uint8Array): PackPlan {
  try {
    return planPackImport(unzipSync(zipBytes));
  } catch {
    return { ok: false, errors: ['That file is not a readable zip.'] };
  }
}

/** True if the bytes start with the zip signature. */
export function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}
