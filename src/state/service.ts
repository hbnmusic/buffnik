/**
 * App logic over a Store: sync, imports, manual entries, shopping, and building the game state.
 * Pure apart from the Store, so it is tested with the in-memory store.
 */
import {
  CONFIG,
  LB_PER_KG,
  SEED_CATALOG,
  addDays,
  checkRedeem,
  redeem,
  replay,
  type ActivityEvent,
  type ActivityKind,
  type BodyCompReading,
  type DailyRecovery,
  type GameInputs,
  type GameState,
  type Purchase,
  type ShopItem,
} from '../engine';
import { buildActivityEvents, deviceLocalDate, strongToRaw, type RawSession } from '../data/ingest';
import { parseStrongCsv, type WeightUnit } from '../data/strongCsv';
import type { Store } from './store';

export const todayLocal = () => deviceLocalDate(Date.now());

export interface Loaded {
  startDate: string;
  today: string;
  state: GameState;
  /** Workouts that count, newest first. */
  workouts: ActivityEvent[];
  /** Walks that do not count as workouts. */
  walks: ActivityEvent[];
  latestWeightLb?: number;
  lastSync: string | null;
}

/** The game starts on the day the app first runs; everything earlier is baseline only. */
export async function ensureStartDate(store: Store, today: string): Promise<string> {
  const existing = await store.getMeta('startDate');
  if (existing) return existing;
  await store.setMeta('startDate', today);
  return today;
}

export async function loadGame(store: Store, today = todayLocal()): Promise<Loaded> {
  const startDate = await ensureStartDate(store, today);
  const [sessions, recovery, body, purchases, lastSync] = await Promise.all([
    store.listSessions(),
    store.listRecovery(),
    store.listBody(),
    store.listPurchases(),
    store.getMeta('lastSync'),
  ]);
  const { workouts, walks } = buildActivityEvents(sessions);
  const inputs: GameInputs = { startDate, today, activities: workouts, recovery, body, purchases };
  const latest = body[body.length - 1];
  return {
    startDate,
    today,
    state: replay(inputs),
    workouts: [...workouts].reverse(),
    walks: [...walks].reverse(),
    latestWeightLb: latest ? Math.round(latest.weightKg * LB_PER_KG * 10) / 10 : undefined,
    lastSync,
  };
}

export interface HealthData {
  /** Start of the window that was read, as epoch ms. */
  fromMs: number;
  /** null when the read failed: stored sessions are then left alone rather than wiped. */
  sessions: RawSession[] | null;
  recovery: DailyRecovery[];
  body: BodyCompReading[];
}

export async function applyHealthData(store: Store, data: HealthData, now = Date.now()): Promise<void> {
  if (data.sessions) await store.replaceHcSessions(data.fromMs, data.sessions);
  await store.upsertRecovery(data.recovery);
  await store.upsertBody('hc', data.body);
  await store.setMeta('lastSync', new Date(now).toISOString());
}

export interface StrongImportSummary {
  /** Workouts in the file. */
  inFile: number;
  /** Workouts not imported before. */
  added: number;
  /** Workouts already imported earlier (re-importing is harmless). */
  alreadyImported: number;
  /** Imported workouts that Health Connect also recorded and that now count once. */
  matchedHealthConnect: number;
  /** Workouts dated before the game started: they set PR baselines but earn no XP. */
  beforeStart: number;
  skippedRows: number;
}

export async function importStrong(store: Store, csvText: string, unit: WeightUnit, today = todayLocal()): Promise<StrongImportSummary> {
  const parsed = parseStrongCsv(csvText, unit);
  const raws = parsed.sessions.flatMap((s) => {
    const r = strongToRaw(s);
    return r ? [r] : [];
  });
  const existing = await store.existingSessionIds(raws.map((r) => r.id));
  await store.upsertSessions('strong', raws);

  const startDate = await ensureStartDate(store, today);
  const { workouts } = buildActivityEvents(await store.listSessions());
  const importedIds = new Set(raws.map((r) => r.id));
  const matched = workouts.filter((w) => importedIds.has(w.id) && w.origins.some((o) => o !== 'io.strongapp.strong')).length;

  return {
    inFile: parsed.sessions.length,
    added: raws.filter((r) => !existing.has(r.id)).length,
    alreadyImported: existing.size,
    matchedHealthConnect: matched,
    beforeStart: parsed.sessions.filter((s) => s.date < startDate).length,
    skippedRows: parsed.skippedRows,
  };
}

const TYPE_FOR_KIND: Record<ActivityKind, string> = {
  swim: 'SWIMMING_POOL',
  ride: 'BIKING',
  run: 'RUNNING',
  walk: 'WALKING',
  lift: 'STRENGTH_TRAINING',
  class: 'EXERCISE_CLASS',
  other: 'OTHER_WORKOUT',
};

export interface ManualWorkout {
  kind: ActivityKind;
  date: string;
  durationMin: number;
  distanceKm?: number;
}

function localTime(date: string, hour: number): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, hour, 0, 0).getTime();
}

/** A hand-entered workout. Fully credited; placed at a free slot in the day so it never merges with another. */
export async function logWorkout(store: Store, w: ManualWorkout): Promise<void> {
  if (!(w.durationMin > 0)) throw new Error('Enter how long it lasted.');
  const sameDay = (await store.listSessions()).filter((s) => s.manual && deviceLocalDate(s.startMs) === w.date).length;
  const startMs = localTime(w.date, 5 + (sameDay % 8) * 2);
  await store.upsertSessions('manual', [
    {
      id: `manual:${Date.now()}:${sameDay}`,
      origin: 'com.buffnik.app',
      typeName: TYPE_FOR_KIND[w.kind],
      startMs,
      endMs: startMs + w.durationMin * 60_000,
      ...(w.distanceKm ? { distanceKm: w.distanceKm } : {}),
      manual: true,
    },
  ]);
}

export async function logWeight(store: Store, date: string, weightLb: number, bodyFatPct?: number): Promise<void> {
  if (!(weightLb > 50 && weightLb < 600)) throw new Error('That weight looks wrong. Enter it in pounds.');
  await store.upsertBody('manual', [
    { date, weightKg: Math.round((weightLb / LB_PER_KG) * 100) / 100, ...(bodyFatPct ? { bodyFatPct } : {}) },
  ]);
}

export type BuyResult = { ok: true; purchase: Purchase } | { ok: false; reason: string };

export function catalog(): ShopItem[] {
  return SEED_CATALOG;
}

export async function buy(store: Store, itemId: string, today = todayLocal()): Promise<BuyResult> {
  const item = catalog().find((i) => i.id === itemId);
  if (!item) return { ok: false, reason: 'Unknown item.' };

  const { state } = await loadGame(store, today);
  if (item.id === 'freeze' && state.freezes >= CONFIG.week.maxBankedFreezes) {
    return { ok: false, reason: `You already hold the maximum of ${CONFIG.week.maxBankedFreezes} freezes.` };
  }
  const check = checkRedeem(item, state.wallet, state.budget);
  if (!check.ok) return { ok: false, reason: check.reason };
  const r = redeem(item, state.wallet, state.budget);

  let coverDate: string | undefined;
  if (item.id === 'pause-day') {
    const covered = new Set((await store.listPurchases()).flatMap((p) => (p.coverDate ? [p.coverDate] : [])));
    coverDate = today;
    while (covered.has(coverDate)) coverDate = addDays(coverDate, 1);
  }

  const purchase: Purchase = {
    id: `p-${Date.now()}`,
    date: today,
    itemId: item.id,
    name: item.name,
    kind: item.kind,
    coinCost: check.coinCost,
    usdFromMonth: r.spentFromMonthUsd,
    usdFromVault: r.spentFromVaultUsd,
    ...(check.voucherIndex !== null ? { voucherUsd: state.wallet.vouchersUsd[check.voucherIndex] } : {}),
    ...(coverDate ? { coverDate } : {}),
  };
  await store.addPurchase(purchase);
  return { ok: true, purchase };
}
