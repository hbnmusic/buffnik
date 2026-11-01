/** SQLite implementation of Store (on the phone). Rows are JSON documents keyed by id or date. */
import * as SQLite from 'expo-sqlite';

import type { BodyCompReading, DailyRecovery, Purchase } from '../engine';
import type { RawSession } from '../data/ingest';
import type { Store } from './store';

const SCHEMA = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, source TEXT NOT NULL, start_ms INTEGER NOT NULL, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS recovery (date TEXT PRIMARY KEY, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS body (date TEXT NOT NULL, source TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY (date, source));
CREATE TABLE IF NOT EXISTS purchases (id TEXT PRIMARY KEY, date TEXT NOT NULL, json TEXT NOT NULL);
`;

export async function openSqliteStore(): Promise<Store> {
  const db = await SQLite.openDatabaseAsync('buffnik.db');
  await db.execAsync(SCHEMA);

  const docs = async <T,>(sql: string, ...params: (string | number)[]): Promise<T[]> =>
    (await db.getAllAsync<{ json: string }>(sql, ...params)).map((r) => JSON.parse(r.json) as T);

  return {
    async getMeta(key) {
      const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', key);
      return row?.value ?? null;
    },
    async setMeta(key, value) {
      await db.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', key, value);
    },

    async replaceHcSessions(sinceMs, sessions) {
      await db.withTransactionAsync(async () => {
        await db.runAsync("DELETE FROM sessions WHERE source = 'hc' AND start_ms >= ?", sinceMs);
        for (const s of sessions) {
          await db.runAsync('INSERT OR REPLACE INTO sessions (id, source, start_ms, json) VALUES (?, ?, ?, ?)', s.id, 'hc', s.startMs, JSON.stringify(s));
        }
      });
    },
    async upsertSessions(source, sessions) {
      await db.withTransactionAsync(async () => {
        for (const s of sessions) {
          await db.runAsync('INSERT OR REPLACE INTO sessions (id, source, start_ms, json) VALUES (?, ?, ?, ?)', s.id, source, s.startMs, JSON.stringify(s));
        }
      });
    },
    listSessions: () => docs<RawSession>('SELECT json FROM sessions ORDER BY start_ms'),
    async existingSessionIds(ids) {
      const found = new Set<string>();
      for (const id of ids) {
        if (await db.getFirstAsync('SELECT 1 FROM sessions WHERE id = ?', id)) found.add(id);
      }
      return found;
    },

    async upsertRecovery(rows) {
      await db.withTransactionAsync(async () => {
        for (const r of rows) await db.runAsync('INSERT OR REPLACE INTO recovery (date, json) VALUES (?, ?)', r.date, JSON.stringify(r));
      });
    },
    listRecovery: () => docs<DailyRecovery>('SELECT json FROM recovery ORDER BY date'),

    async upsertBody(source, rows) {
      await db.withTransactionAsync(async () => {
        for (const r of rows) await db.runAsync('INSERT OR REPLACE INTO body (date, source, json) VALUES (?, ?, ?)', r.date, source, JSON.stringify(r));
      });
    },
    // 'manual' sorts after 'hc', so it wins when both exist for a date.
    async listBody() {
      const rows = await db.getAllAsync<{ date: string; json: string }>('SELECT date, json FROM body ORDER BY date, source');
      const byDate = new Map<string, BodyCompReading>();
      for (const r of rows) byDate.set(r.date, JSON.parse(r.json) as BodyCompReading);
      return [...byDate.values()];
    },

    async addPurchase(p) {
      await db.runAsync('INSERT OR REPLACE INTO purchases (id, date, json) VALUES (?, ?, ?)', p.id, p.date, JSON.stringify(p));
    },
    listPurchases: () => docs<Purchase>('SELECT json FROM purchases ORDER BY date, id'),
  };
}
