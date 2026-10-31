import { CONFIG } from './config';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
const ORDER: Rarity[] = ['common', 'rare', 'epic', 'legendary'];

export type LootReward =
  | { type: 'coins'; amount: number }
  | { type: 'freeze' }
  | { type: 'look'; rarity: Rarity }
  | { type: 'voucher'; usd: number };

export interface LootDrop {
  rarity: Rarity;
  reward: LootReward;
}

/** Deterministic PRNG (mulberry32) so drops are reproducible from a stored seed. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rollRarity(rand: () => number, minimum: Rarity = 'common'): Rarity {
  const minIdx = ORDER.indexOf(minimum);
  const pool = ORDER.slice(minIdx);
  const weights = pool.map((r) => CONFIG.loot.rarityWeights[r]);
  const total = weights.reduce((a, b) => a + b, 0);
  let x = rand() * total;
  for (let i = 0; i < pool.length; i++) {
    x -= weights[i];
    if (x < 0) return pool[i];
  }
  return pool[pool.length - 1];
}

function rewardFor(rarity: Rarity, rand: () => number): LootReward {
  const r = rand();
  switch (rarity) {
    case 'common':
      return { type: 'coins', amount: 50 + Math.floor(r * 51) };
    case 'rare':
      if (r < 0.2) return { type: 'freeze' };
      if (r < 0.5) return { type: 'look', rarity };
      return { type: 'coins', amount: 150 };
    case 'epic':
      return r < 0.6 ? { type: 'look', rarity } : { type: 'coins', amount: 400 };
    case 'legendary':
      return r < 0.5 ? { type: 'voucher', usd: CONFIG.loot.voucherUsd } : { type: 'look', rarity };
  }
}

export interface DropContext {
  prCount: number;
  bossDefeated: 'boss' | 'final_boss' | null;
}

/**
 * Roll after a credited workout. A PR guarantees at least a rare drop; a boss
 * defeat guarantees epic, and a chapter's final boss guarantees legendary.
 */
export function rollDrop(seed: number, ctx: DropContext): LootDrop | null {
  const rand = rng(seed);
  let minimum: Rarity | null = null;
  if (ctx.bossDefeated === 'final_boss') minimum = 'legendary';
  else if (ctx.bossDefeated === 'boss') minimum = 'epic';
  else if (ctx.prCount > 0) minimum = 'rare';

  if (minimum === null && rand() >= CONFIG.loot.dropChancePerWorkout) return null;
  const rarity = rollRarity(rand, minimum ?? 'common');
  return { rarity, reward: rewardFor(rarity, rand) };
}

/** Published odds, shown in the app. */
export function dropOdds(): Record<Rarity, number> {
  const w = CONFIG.loot.rarityWeights;
  const total = w.common + w.rare + w.epic + w.legendary;
  const p = CONFIG.loot.dropChancePerWorkout;
  return {
    common: (p * w.common) / total,
    rare: (p * w.rare) / total,
    epic: (p * w.epic) / total,
    legendary: (p * w.legendary) / total,
  };
}
