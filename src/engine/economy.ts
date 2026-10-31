import { CONFIG } from './config';

export type ShopKind = 'real' | 'vault' | 'steam' | 'cosmetic' | 'utility';

export interface ShopItem {
  id: string;
  name: string;
  kind: ShopKind;
  /** Dollar price for real, vault and steam items. */
  priceUsd?: number;
  /** Coin price for cosmetic and utility items. */
  priceCoins?: number;
}

export interface BudgetState {
  /** 'YYYY-MM' of the current budget month. */
  month: string;
  spentUsd: number;
  vaultUsd: number;
}

export interface Wallet {
  coins: number;
  /** Dollar value of loot vouchers held; each redemption can apply one voucher. */
  vouchersUsd: number[];
}

export function isDollarBacked(item: ShopItem): boolean {
  return item.kind === 'real' || item.kind === 'vault' || item.kind === 'steam';
}

export function priceInCoins(item: ShopItem): number {
  if (isDollarBacked(item)) return Math.round((item.priceUsd ?? 0) * CONFIG.economy.coinsPerUsd);
  return item.priceCoins ?? 0;
}

function monthIndex(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return y * 12 + (m - 1);
}

/** Move to a new month: unspent budget from each elapsed month rolls into the vault, up to the cap. */
export function rollBudget(budget: BudgetState, month: string): BudgetState {
  const elapsed = monthIndex(month) - monthIndex(budget.month);
  if (elapsed <= 0) return budget;
  const e = CONFIG.economy;
  const unspentThisMonth = Math.max(0, e.monthlyBudgetUsd - budget.spentUsd);
  const fullMonthsSkipped = (elapsed - 1) * e.monthlyBudgetUsd;
  const vaultUsd = Math.min(e.vaultCapUsd, budget.vaultUsd + unspentThisMonth + fullMonthsSkipped);
  return { month, spentUsd: 0, vaultUsd: round2(vaultUsd) };
}

export function budgetRemainingUsd(budget: BudgetState): number {
  return Math.max(0, CONFIG.economy.monthlyBudgetUsd - budget.spentUsd);
}

export type RedeemCheck = { ok: true; coinCost: number; voucherIndex: number | null } | { ok: false; reason: string };

export function checkRedeem(item: ShopItem, wallet: Wallet, budget: BudgetState): RedeemCheck {
  let coinCost = priceInCoins(item);
  let voucherIndex: number | null = null;

  if (isDollarBacked(item)) {
    const price = item.priceUsd ?? 0;
    const available = budgetRemainingUsd(budget) + (item.kind === 'vault' ? budget.vaultUsd : 0);
    if (price > available + 1e-9) {
      return { ok: false, reason: item.kind === 'vault' ? 'Not enough in this month’s budget plus the vault yet.' : 'Not enough left in this month’s budget.' };
    }
    // Apply the largest voucher that does not exceed the price.
    let best = -1;
    wallet.vouchersUsd.forEach((v, i) => {
      if (v <= price && (best === -1 || v > wallet.vouchersUsd[best])) best = i;
    });
    if (best !== -1) {
      voucherIndex = best;
      coinCost = Math.round((price - wallet.vouchersUsd[best]) * CONFIG.economy.coinsPerUsd);
    }
  }

  if (wallet.coins < coinCost) return { ok: false, reason: 'Not enough coins.' };
  return { ok: true, coinCost, voucherIndex };
}

export interface Redemption {
  wallet: Wallet;
  budget: BudgetState;
  spentFromMonthUsd: number;
  spentFromVaultUsd: number;
}

export function redeem(item: ShopItem, wallet: Wallet, budget: BudgetState): Redemption {
  const check = checkRedeem(item, wallet, budget);
  if (!check.ok) throw new Error(check.reason);

  const vouchersUsd = wallet.vouchersUsd.filter((_, i) => i !== check.voucherIndex);
  const nextWallet: Wallet = { coins: wallet.coins - check.coinCost, vouchersUsd };

  if (!isDollarBacked(item)) {
    return { wallet: nextWallet, budget, spentFromMonthUsd: 0, spentFromVaultUsd: 0 };
  }

  const price = item.priceUsd ?? 0;
  const fromMonth = Math.min(price, budgetRemainingUsd(budget));
  const fromVault = item.kind === 'vault' ? round2(price - fromMonth) : 0;
  return {
    wallet: nextWallet,
    budget: { ...budget, spentUsd: round2(budget.spentUsd + fromMonth), vaultUsd: round2(budget.vaultUsd - fromVault) },
    spentFromMonthUsd: round2(fromMonth),
    spentFromVaultUsd: fromVault,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Default catalog from the spec; prices are editable in the app. */
export const SEED_CATALOG: ShopItem[] = [
  { id: 'cocktail-home', name: 'Fix myself a cocktail', kind: 'real', priceUsd: 8 },
  { id: 'cocktail-out', name: 'Go out for a cocktail', kind: 'real', priceUsd: 22 },
  { id: 'wine', name: 'Bottle of wine', kind: 'real', priceUsd: 30 },
  { id: 'bourbon', name: 'Bottle of bourbon', kind: 'real', priceUsd: 60 },
  { id: 'hat', name: 'New hat', kind: 'real', priceUsd: 40 },
  { id: 'clothing', name: 'Piece of clothing', kind: 'real', priceUsd: 80 },
  { id: 'freeze', name: 'Streak freeze', kind: 'utility', priceCoins: 300 },
  { id: 'pause-day', name: 'Pause pass (1 day)', kind: 'utility', priceCoins: 100 },
];
