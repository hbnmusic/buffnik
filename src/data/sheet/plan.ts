/**
 * Turn sliced pieces plus the text list from Gemini into an art pack: a manifest and image files.
 * Pure; the device layer writes the files and stores the manifest.
 */
import { GEAR_SLOTS, type GearSlot } from '../../engine/wardrobe';
import { RARITIES, validateManifest, type PackFile, type PackLook, type PackManifest, type PackRarity } from '../packs';
import { encodePng } from './png';
import { DEFAULT_SLICE, sliceSheet, type Piece, type SliceOptions, type SliceResult } from './slicer';

export interface ListedItem {
  number: number;
  name: string;
  slot?: GearSlot;
  rarity?: PackRarity;
}

export interface SheetList {
  character?: string;
  outfits: { name: string; rarity?: PackRarity }[];
  items: ListedItem[];
}

const SLOT_WORDS: Record<string, GearSlot> = {
  head: 'head', hat: 'head', helmet: 'head', hair: 'head',
  face: 'face', mask: 'face', eyes: 'face',
  body: 'body', torso: 'body', chest: 'body', clothing: 'body', top: 'body', legs: 'body', pants: 'body',
  hands: 'hands', hand: 'hands', gloves: 'hands', arms: 'hands',
  feet: 'feet', foot: 'feet', shoes: 'feet', boots: 'feet',
  back: 'back', cape: 'back',
  weapon: 'weapon', weapons: 'weapon', tool: 'weapon',
  accessory: 'accessory', accessories: 'accessory', jewelry: 'accessory', jewellery: 'accessory', prop: 'accessory', other: 'accessory',
};

const normSlot = (s: string): GearSlot | undefined => SLOT_WORDS[s.trim().toLowerCase().replace(/[^a-z]/g, '')];
const normRarity = (s: string): PackRarity | undefined => {
  const r = s.trim().toLowerCase().replace(/[^a-z]/g, '');
  return (RARITIES as readonly string[]).includes(r) ? (r as PackRarity) : undefined;
};

/** Parse the reply Gemini was asked to give. Lines it cannot read are ignored. */
export function parseSheetList(text: string): SheetList {
  const out: SheetList = { outfits: [], items: [] };
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.replace(/^[\s>*`]+|[\s*`]+$/g, '').replace(/\*\*/g, '');
    if (!line) continue;
    line = line.replace(/^(\d{1,3})[.):]\s+/, '$1 | '); // "3. Name" -> "3 | Name"
    let cells = line.split(/\s*[|\t]\s*/).map((c) => c.trim());
    const head = cells[0].toLowerCase();
    if (head === 'character' && cells[1]) out.character = cells[1];
    else if (head === 'outfit' && cells[1]) out.outfits.push({ name: cells[1], rarity: cells[2] ? normRarity(cells[2]) : undefined });
    else if (/^\d{1,3}$/.test(cells[0]) && cells[1]) {
      // "12 | Name - slot - rarity" is read like the pipe form.
      if (cells.length === 2) cells = [cells[0], ...cells[1].split(/\s+[-–—]\s+/).map((c) => c.trim())];
      out.items.push({ number: Number(cells[0]), name: cells[1], slot: cells[2] ? normSlot(cells[2]) : undefined, rarity: cells[3] ? normRarity(cells[3]) : undefined });
    }
  }
  return out;
}

const slug = (s: string, max: number) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '');

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/** Spread items over rarities (60 / 25 / 10 / 5) when the list did not say. Stable for the same pack and item. */
export function defaultRarity(seed: string): PackRarity {
  const r = hash(seed) % 100;
  return r < 60 ? 'common' : r < 85 ? 'rare' : r < 95 ? 'epic' : 'legendary';
}

export interface PlanOptions {
  packId: string;
  packName: string;
  list: SheetList;
  /** Item numbers to leave out (deleted in the preview). */
  skipItems?: number[];
  /** Outfit numbers (1-based) to leave out. */
  skipOutfits?: number[];
  skipCharacter?: boolean;
  /** The pack so far, when adding another sheet to it. */
  existing?: PackManifest;
}

export interface SheetPlan {
  manifest: PackManifest;
  /** Files to write for this sheet (earlier sheets' files are already on the device). */
  files: PackFile[];
  added: { character: boolean; outfits: number; items: number };
  /** Id of the base character look, if this sheet added one. */
  baseLookId?: string;
  baseLookName?: string;
}

export type SheetPlanResult = { ok: true; plan: SheetPlan } | { ok: false; errors: string[] };

export function planSheetPack(pieces: Piece[], o: PlanOptions): SheetPlanResult {
  const existing = o.existing?.looks ?? [];
  const taken = new Set(existing.map((l) => l.id));
  const sheetNo = 1 + Math.max(0, ...existing.map((l) => Number(l.image.match(/^s(\d+)\//)?.[1] ?? 0)));
  const dir = `s${sheetNo}`;
  const unique = (base: string): string => {
    let id = base;
    for (let n = 2; taken.has(id); n++) id = `${base.slice(0, 36)}-${n}`;
    taken.add(id);
    return id;
  };

  const looks: PackLook[] = [];
  const files: PackFile[] = [];
  const added = { character: false, outfits: 0, items: 0 };
  let baseLookId: string | undefined;
  let baseLookName: string | undefined;
  const png = (p: Piece, path: string) => files.push({ path, bytes: encodePng(p.image) });

  for (const p of pieces) {
    if (p.kind === 'character' && !o.skipCharacter) {
      const id = unique('base');
      const name = o.list.character ?? o.packName;
      png(p, `${dir}/base.png`);
      looks.push({ id, name, rarity: 'common', image: `${dir}/base.png`, starter: true });
      added.character = true;
      baseLookId = id;
      baseLookName = name;
    } else if (p.kind === 'outfit' && !(o.skipOutfits ?? []).includes(p.outfit)) {
      const listed = o.list.outfits[p.outfit - 1];
      const name = listed?.name ?? `Outfit ${p.outfit}`;
      const id = unique(`outfit-${sheetNo}-${p.outfit}-${slug(name, 16)}`.replace(/-+$/, ''));
      png(p, `${dir}/outfit-${p.outfit}.png`);
      looks.push({ id, name, rarity: listed?.rarity ?? 'rare', image: `${dir}/outfit-${p.outfit}.png` });
      added.outfits++;
    } else if (p.kind === 'item' && !(o.skipItems ?? []).includes(p.number)) {
      const listed = o.list.items.find((i) => i.number === p.number);
      const name = listed?.name ?? `Item ${p.number}`;
      const num = String(p.number).padStart(2, '0');
      const id = unique(`i${sheetNo}-${num}-${slug(name, 20)}`.replace(/-+$/, ''));
      png(p, `${dir}/item-${num}.png`);
      looks.push({
        id,
        name,
        rarity: listed?.rarity ?? defaultRarity(`${o.packId}:${sheetNo}:${p.number}`),
        image: `${dir}/item-${num}.png`,
        slot: listed?.slot ?? 'accessory',
      });
      added.items++;
    }
  }
  if (looks.length === 0) return { ok: false, errors: ['Nothing to import: every piece was removed.'] };

  const manifest: PackManifest = { format: 1, id: o.packId, name: o.existing?.name ?? o.packName, looks: [...existing, ...looks] };
  const v = validateManifest(manifest);
  if (!v.ok) return v;
  return { ok: true, plan: { manifest: v.manifest, files, added, baseLookId, baseLookName } };
}

export { GEAR_SLOTS };

/** How the list lines up with what was found, in words. Empty when everything matches. */
export function listWarnings(list: SheetList, pieces: Piece[]): string[] {
  const out: string[] = [];
  const items = pieces.filter((p) => p.kind === 'item').length;
  const outfits = pieces.filter((p) => p.kind === 'outfit').length;
  if (list.items.length === 0) out.push('No item list was pasted, so items are named "Item 1", "Item 2" and so on and treated as accessories.');
  else if (list.items.length !== items) out.push(`The list has ${list.items.length} items but ${items} pieces were found. Names follow the list numbers in reading order, so check the preview.`);
  if (list.outfits.length > 0 && list.outfits.length !== outfits) out.push(`The list has ${list.outfits.length} outfits but ${outfits} were found.`);
  return out;
}

/** Merge distances tried by auto mode, from the most joined to none. */
export const AUTO_GAPS = [DEFAULT_SLICE.mergeGap, 0.003, 0];

/**
 * Cut the sheet at each merge distance and keep the cut whose piece counts best match the pasted list
 * (items, and outfits when listed). On a tie the more joined cut wins, so parts of one item stay together.
 * With no list there is nothing to compare against, so the finest cut is used: generated sheets usually
 * leave less space between items than asked for. Returns the merge distance used.
 */
export function sliceAuto(img: Parameters<typeof sliceSheet>[0], list: SheetList, opt: Partial<SliceOptions> = {}): { result: SliceResult; gap: number } {
  if (list.items.length === 0) return { result: sliceSheet(img, { ...opt, mergeGap: 0 }), gap: 0 };
  let best: { result: SliceResult; gap: number; miss: number } | null = null;
  for (const gap of AUTO_GAPS) {
    const result = sliceSheet(img, { ...opt, mergeGap: gap });
    const items = result.pieces.filter((p) => p.kind === 'item').length;
    const outfits = result.pieces.filter((p) => p.kind === 'outfit').length;
    const miss = Math.abs(items - list.items.length) + (list.outfits.length > 0 ? Math.abs(outfits - list.outfits.length) : 0);
    if (!best || miss < best.miss) best = { result, gap, miss };
    if (miss === 0) break;
  }
  return { result: best!.result, gap: best!.gap };
}
