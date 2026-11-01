/**
 * Looks (full outfits) and how they are unlocked. A look is owned if it is a starter,
 * was bought, or dropped as loot. Loot picks are deterministic: the same drop always
 * gives the same look, so replaying the game never changes the wardrobe.
 */
import { CONFIG } from './config';
import type { Rarity } from './loot';
import { hashSeed } from './replay';

export type LookStyle = 'tee' | 'tank' | 'hoodie' | 'jersey' | 'jacket' | 'gi' | 'armor' | 'robe' | 'suit';
export type Accessory = 'none' | 'headband' | 'glasses' | 'cape' | 'scarf';

export interface Look {
  id: string;
  name: string;
  rarity: Rarity;
  style: LookStyle;
  /** Main garment colour, bottoms colour, accent colour (trim, belt, armour highlights). */
  primary: string;
  secondary: string;
  accent: string;
  accessory: Accessory;
  starter?: boolean;
  /** Set for looks from an imported art pack: images replace the drawn figure. */
  pack?: { packId: string; image: string; tiers?: Record<string, string> };
}

const L = (
  id: string,
  name: string,
  rarity: Rarity,
  style: LookStyle,
  primary: string,
  secondary: string,
  accent: string,
  accessory: Accessory = 'none',
  starter = false,
): Look => ({ id, name, rarity, style, primary, secondary, accent, accessory, ...(starter ? { starter: true } : {}) });

export const STARTER_LOOKS: Look[] = [
  L('gym-tee', 'Gym Tee', 'common', 'tee', '#8A93A6', '#3B4258', '#C9CFDD', 'none', true),
  L('navy-tee', 'Navy Tee', 'common', 'tee', '#2F4B8F', '#232A45', '#7FA0E8', 'none', true),
  L('red-tank', 'Red Tank', 'common', 'tank', '#D9534F', '#2B2B3A', '#FFB4AE', 'none', true),
  L('trail-hoodie', 'Trail Hoodie', 'common', 'hoodie', '#3E8E6B', '#2C3345', '#8FE0B9'),
  L('clean-white', 'Clean White', 'common', 'tee', '#E9E6F5', '#4A4F6A', '#FFFFFF'),
  L('blackout-tank', 'Blackout Tank', 'common', 'tank', '#22222B', '#3A3A4A', '#7C5CFF'),
  L('court-jersey', 'Court Jersey', 'common', 'jersey', '#E8B930', '#2A2A3A', '#FFF1B8'),
  L('night-hoodie', 'Night Hoodie', 'common', 'hoodie', '#6A4CD6', '#2A2540', '#B9A7FF'),
  L('dojo-gi', 'Dojo Gi', 'rare', 'gi', '#F1EEF8', '#2B2B3A', '#1B1B1B', 'headband'),
  L('track-jacket', 'Track Jacket', 'rare', 'jacket', '#1FA59B', '#23303D', '#B8FFF6'),
  L('sunrise-singlet', 'Sunrise Singlet', 'rare', 'tank', '#F08A3C', '#2C2A3D', '#FFD9B0', 'headband'),
  L('crimson-hoodie', 'Crimson Hoodie', 'rare', 'hoodie', '#B3263E', '#2A2233', '#FF9DB0', 'scarf'),
  L('harbor-jersey', 'Harbor Jersey', 'rare', 'jersey', '#2F7DD1', '#1F2A40', '#BFE0FF'),
  L('neon-tee', 'Neon Tee', 'rare', 'tee', '#E64FA8', '#2B2340', '#FFC2E6', 'glasses'),
  L('steel-plate', 'Steel Plate', 'epic', 'armor', '#9AA7BD', '#4B566B', '#F2C14E'),
  L('indigo-robe', 'Indigo Robe', 'epic', 'robe', '#3A3FA8', '#252A66', '#9DA3FF', 'scarf'),
  L('midnight-suit', 'Midnight Suit', 'epic', 'suit', '#1B1D2E', '#12131F', '#C7A8FF', 'glasses'),
  L('crimson-gi', 'Crimson Gi', 'epic', 'gi', '#C23B3B', '#2B1F2B', '#FFD27A', 'cape'),
  L('golden-champion', 'Golden Champion', 'legendary', 'armor', '#F2C14E', '#7A5A1E', '#FFF3C4', 'cape'),
  L('aurora-mantle', 'Aurora Mantle', 'legendary', 'robe', '#7C5CFF', '#2E7D7A', '#7FFFE0', 'cape'),
];

export function lookCoinPrice(rarity: Rarity): number {
  return CONFIG.economy.lookCoinPrices[rarity];
}

export interface LookEvent {
  date: string;
  /** A loot drop that rolled a look of this rarity, or a purchase of a specific look. */
  kind: 'drop' | 'purchase';
  /** Stable id: the drop's event id, or the purchase id. */
  eventId: string;
  rarity?: Rarity;
  lookId?: string;
}

const ORDER: Rarity[] = ['common', 'rare', 'epic', 'legendary'];

/** Ids of every look the player owns, given the catalog and what has happened, in order. */
export function ownedLookIds(catalog: Look[], events: LookEvent[]): string[] {
  const owned = new Set(catalog.filter((l) => l.starter).map((l) => l.id));
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date) || a.eventId.localeCompare(b.eventId));

  for (const e of sorted) {
    if (e.kind === 'purchase') {
      if (e.lookId && catalog.some((l) => l.id === e.lookId)) owned.add(e.lookId);
      continue;
    }
    if (!e.rarity) continue;
    // Prefer the rolled rarity, then lower ones, then higher, so a drop is never wasted while looks remain.
    const start = ORDER.indexOf(e.rarity);
    const tryOrder = [...ORDER.slice(0, start + 1).reverse(), ...ORDER.slice(start + 1)];
    for (const rarity of tryOrder) {
      const pool = catalog.filter((l) => l.rarity === rarity && !owned.has(l.id)).sort((a, b) => a.id.localeCompare(b.id));
      if (pool.length > 0) {
        owned.add(pool[hashSeed(e.eventId) % pool.length].id);
        break;
      }
    }
  }
  return catalog.filter((l) => owned.has(l.id)).map((l) => l.id);
}
