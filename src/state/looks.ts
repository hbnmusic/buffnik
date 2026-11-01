/** The look catalog (drawn starters plus imported art packs) and what the player owns. */
import { STARTER_LOOKS, itemCoinPrice, lookCoinPrice, ownedLookIds, resolveLooks, type Look, type LookEvent } from '../engine';
import type { Purchase } from '../engine';
import type { PackManifest } from '../data/packs';
import type { Store } from './store';

export const lookItemId = (lookId: string) => `look:${lookId}`;
export const packLookId = (packId: string, lookId: string) => `${packId}:${lookId}`;

export async function loadPacks(store: Store): Promise<PackManifest[]> {
  const raw = await store.getMeta('packs');
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as PackManifest[];
    return Array.isArray(list) ? list.filter((p) => p && typeof p.id === 'string' && Array.isArray(p.looks)) : [];
  } catch {
    return [];
  }
}

export async function savePacks(store: Store, packs: PackManifest[]): Promise<void> {
  await store.setMeta('packs', JSON.stringify(packs));
}

/** Adds a pack, replacing an earlier version of the same pack id. */
export async function addPack(store: Store, manifest: PackManifest): Promise<void> {
  const packs = (await loadPacks(store)).filter((p) => p.id !== manifest.id);
  await savePacks(store, [...packs, manifest]);
}

export async function removePack(store: Store, packId: string): Promise<void> {
  await savePacks(store, (await loadPacks(store)).filter((p) => p.id !== packId));
}

/** Pack looks look like any other look to the rest of the game; their images replace the drawn figure. */
export function buildCatalog(packs: PackManifest[]): Look[] {
  const fromPacks: Look[] = packs.flatMap((p) =>
    p.looks.map((l) => ({
      id: packLookId(p.id, l.id),
      name: l.name,
      rarity: l.rarity,
      style: 'tee' as const,
      primary: '#8A93A6',
      secondary: '#3B4258',
      accent: '#C9CFDD',
      accessory: 'none' as const,
      ...(l.slot ? { slot: l.slot } : {}),
      ...(l.starter ? { starter: true } : {}),
      pack: { packId: p.id, image: l.image, ...(l.tiers ? { tiers: l.tiers } : {}) },
    })),
  );
  return [...STARTER_LOOKS, ...fromPacks];
}

export function lookEvents(drops: { date: string; rarity: LookEvent['rarity']; eventId: string }[], purchases: Purchase[]): LookEvent[] {
  return [
    ...drops.map((d) => ({ date: d.date, kind: 'drop' as const, eventId: d.eventId, rarity: d.rarity })),
    ...purchases
      .filter((p) => p.itemId.startsWith('look:'))
      .map((p) => ({ date: p.date, kind: 'purchase' as const, eventId: p.id, lookId: p.itemId.slice('look:'.length) })),
  ];
}

export { itemCoinPrice, lookCoinPrice, ownedLookIds, resolveLooks };
