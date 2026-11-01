/** The shop catalog: editable treats stored in meta, plus the cached Steam wishlist as dollar-backed items. */
import { SEED_CATALOG, type ShopItem, type ShopKind } from '../engine';
import { steamItemId, type SteamGame } from '../data/steam';
import type { Store } from './store';

export const EDITABLE_KINDS: ShopKind[] = ['real', 'vault'];

export async function loadCatalog(store: Store): Promise<ShopItem[]> {
  const raw = await store.getMeta('catalog');
  if (!raw) return SEED_CATALOG;
  try {
    const list = JSON.parse(raw) as ShopItem[];
    if (!Array.isArray(list)) return SEED_CATALOG;
    // Utilities always exist, whatever was saved.
    const missing = SEED_CATALOG.filter((s) => s.kind === 'utility' && !list.some((i) => i.id === s.id));
    return [...list, ...missing];
  } catch {
    return SEED_CATALOG;
  }
}

export async function saveCatalog(store: Store, items: ShopItem[]): Promise<void> {
  await store.setMeta('catalog', JSON.stringify(items));
}

export function addTreat(items: ShopItem[], name: string, priceUsd: number, kind: 'real' | 'vault', id: string): ShopItem[] {
  const n = name.trim();
  if (!n) throw new Error('Give the treat a name.');
  if (!(priceUsd > 0)) throw new Error('Enter a price above zero.');
  if (items.some((i) => i.id === id)) throw new Error('That item already exists.');
  return [...items.filter((i) => i.kind !== 'utility'), { id, name: n, kind, priceUsd: Math.round(priceUsd * 100) / 100 }, ...items.filter((i) => i.kind === 'utility')];
}

export function updateTreat(items: ShopItem[], id: string, patch: { name?: string; priceUsd?: number; kind?: 'real' | 'vault' }): ShopItem[] {
  if (patch.priceUsd !== undefined && !(patch.priceUsd > 0)) throw new Error('Enter a price above zero.');
  return items.map((i) => (i.id === id && EDITABLE_KINDS.includes(i.kind) ? { ...i, ...patch, ...(patch.priceUsd !== undefined ? { priceUsd: Math.round(patch.priceUsd * 100) / 100 } : {}) } : i));
}

export function removeTreat(items: ShopItem[], id: string): ShopItem[] {
  return items.filter((i) => !(i.id === id && EDITABLE_KINDS.includes(i.kind)));
}

export interface SteamCache {
  fetchedAt: string;
  games: SteamGame[];
  problem: string | null;
  unpriced: number;
}

export async function loadSteamCache(store: Store): Promise<SteamCache | null> {
  const raw = await store.getMeta('steamCache');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SteamCache;
  } catch {
    return null;
  }
}

export async function saveSteamCache(store: Store, c: SteamCache): Promise<void> {
  await store.setMeta('steamCache', JSON.stringify(c));
}

export function steamItems(games: SteamGame[]): ShopItem[] {
  return games.map((g) => ({ id: steamItemId(g.appid), name: g.name, kind: 'steam' as const, priceUsd: g.priceUsd }));
}
