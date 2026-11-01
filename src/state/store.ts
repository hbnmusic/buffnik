/**
 * Storage interface for the raw inputs. Derived values (XP, level, stats) are never
 * stored: they are recomputed from these by the engine's replay.
 */
import type { BodyCompReading, DailyRecovery, Purchase } from '../engine';
import type { RawSession } from '../data/ingest';

export type SessionSource = 'hc' | 'strong' | 'manual';
export type BodySource = 'hc' | 'manual';

/** Everything in the store, for backups. */
export interface StoreDump {
  meta: Record<string, string>;
  sessions: { source: SessionSource; session: RawSession }[];
  recovery: DailyRecovery[];
  body: { source: BodySource; row: BodyCompReading }[];
  purchases: Purchase[];
}

export interface Store {
  /** Read every row. */
  dumpAll(): Promise<StoreDump>;
  /** Replace everything with the dump. */
  restoreAll(dump: StoreDump): Promise<void>;

  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;

  /** Replace Health Connect sessions that started at or after `sinceMs` with a fresh read. */
  replaceHcSessions(sinceMs: number, sessions: RawSession[]): Promise<void>;
  /** Insert or update sessions by id. */
  upsertSessions(source: Exclude<SessionSource, 'hc'>, sessions: RawSession[]): Promise<void>;
  listSessions(): Promise<RawSession[]>;
  /** Which of these ids already exist. */
  existingSessionIds(ids: string[]): Promise<Set<string>>;

  upsertRecovery(rows: DailyRecovery[]): Promise<void>;
  listRecovery(): Promise<DailyRecovery[]>;

  upsertBody(source: BodySource, rows: BodyCompReading[]): Promise<void>;
  /** One reading per date; a hand-entered reading wins over Health Connect for the same date. */
  listBody(): Promise<BodyCompReading[]>;

  addPurchase(p: Purchase): Promise<void>;
  listPurchases(): Promise<Purchase[]>;
}

export function createMemoryStore(): Store {
  const meta = new Map<string, string>();
  const sessions = new Map<string, { source: SessionSource; session: RawSession }>();
  const recovery = new Map<string, DailyRecovery>();
  const body = new Map<string, BodyCompReading>(); // key: `${date}|${source}`
  const purchases = new Map<string, Purchase>();

  return {
    async dumpAll() {
      return {
        meta: Object.fromEntries(meta),
        sessions: [...sessions.values()].map((v) => ({ source: v.source, session: v.session })),
        recovery: [...recovery.values()],
        body: [...body.entries()].map(([k, row]) => ({ source: k.split('|')[1] as BodySource, row })),
        purchases: [...purchases.values()],
      };
    },
    async restoreAll(d) {
      meta.clear();
      sessions.clear();
      recovery.clear();
      body.clear();
      purchases.clear();
      for (const [k, v] of Object.entries(d.meta)) meta.set(k, v);
      for (const s of d.sessions) sessions.set(s.session.id, s);
      for (const r of d.recovery) recovery.set(r.date, r);
      for (const b of d.body) body.set(`${b.row.date}|${b.source}`, b.row);
      for (const p of d.purchases) purchases.set(p.id, p);
    },
    async getMeta(key) {
      return meta.get(key) ?? null;
    },
    async setMeta(key, value) {
      meta.set(key, value);
    },
    async replaceHcSessions(sinceMs, list) {
      for (const [id, v] of sessions) if (v.source === 'hc' && v.session.startMs >= sinceMs) sessions.delete(id);
      for (const s of list) sessions.set(s.id, { source: 'hc', session: s });
    },
    async upsertSessions(source, list) {
      for (const s of list) sessions.set(s.id, { source, session: s });
    },
    async listSessions() {
      return [...sessions.values()].map((v) => v.session);
    },
    async existingSessionIds(ids) {
      return new Set(ids.filter((id) => sessions.has(id)));
    },
    async upsertRecovery(rows) {
      for (const r of rows) recovery.set(r.date, r);
    },
    async listRecovery() {
      return [...recovery.values()].sort((a, b) => a.date.localeCompare(b.date));
    },
    async upsertBody(source, rows) {
      for (const r of rows) body.set(`${r.date}|${source}`, r);
    },
    async listBody() {
      const dates = new Set([...body.keys()].map((k) => k.split('|')[0]));
      return [...dates].sort().map((d) => (body.get(`${d}|manual`) ?? body.get(`${d}|hc`))!);
    },
    async addPurchase(p) {
      purchases.set(p.id, p);
    },
    async listPurchases() {
      return [...purchases.values()];
    },
  };
}
