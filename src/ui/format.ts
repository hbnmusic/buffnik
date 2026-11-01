import type { LootDrop } from '../engine';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const shortDate = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;

export function describeDrop(drop: LootDrop): string {
  const r = drop.reward;
  const what = r.type === 'coins' ? `${r.amount} coins` : r.type === 'freeze' ? 'a streak freeze' : r.type === 'voucher' ? `a $${r.usd} voucher` : `a ${r.rarity} look`;
  return `${drop.rarity[0].toUpperCase()}${drop.rarity.slice(1)} drop: ${what}`;
}

export const STAT_NAMES: Record<string, string> = {
  STR: 'Strength',
  END: 'Endurance',
  VIT: 'Vitality',
  AGI: 'Agility',
  PHY: 'Physique',
};

export const usd = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
