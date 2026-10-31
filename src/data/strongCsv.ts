/**
 * Parser for Strong's workout export (Settings → Export Strong Data → CSV).
 * Pure TypeScript so it is unit tested without a device.
 *
 * Expected columns (order may vary): Date, Workout Name, Duration,
 * Exercise Name, Set Order, Weight, Reps, Distance, Seconds, Notes,
 * Workout Notes, RPE. The delimiter (comma or semicolon) is detected from
 * the header row.
 */
import { LB_PER_KG } from '../engine/config';
import type { StrengthSet } from '../engine/types';

export type WeightUnit = 'kg' | 'lb';

export interface StrongSession {
  /** Stable key: start timestamp + workout name. */
  key: string;
  /** Local date 'YYYY-MM-DD'. */
  date: string;
  /** Local start time as exported, e.g. '2026-10-30 18:05:00'. */
  startedAt: string;
  name: string;
  durationMin: number;
  sets: StrengthSet[];
}

export function detectDelimiter(headerLine: string): ',' | ';' {
  const commas = (headerLine.match(/,/g) ?? []).length;
  const semis = (headerLine.match(/;/g) ?? []).length;
  return semis > commas ? ';' : ',';
}

/** RFC 4180-style splitting with quoted fields and escaped quotes. */
export function parseCsv(text: string, delimiter: ',' | ';'): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^﻿/, '');

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

/** Durations look like '1h 5m', '45m', '1h', or '50s'. */
export function parseDurationMin(raw: string): number {
  const s = raw.trim().toLowerCase();
  if (s === '') return 0;
  let minutes = 0;
  const h = s.match(/(\d+(?:\.\d+)?)\s*h/);
  const m = s.match(/(\d+(?:\.\d+)?)\s*m(?!s)/);
  const sec = s.match(/(\d+(?:\.\d+)?)\s*s/);
  if (h) minutes += parseFloat(h[1]) * 60;
  if (m) minutes += parseFloat(m[1]);
  if (sec) minutes += parseFloat(sec[1]) / 60;
  if (!h && !m && !sec && /^\d+(\.\d+)?$/.test(s)) minutes = parseFloat(s);
  return Math.round(minutes * 10) / 10;
}

function num(raw: string | undefined): number {
  if (raw === undefined) return 0;
  const n = parseFloat(raw.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export interface ParseResult {
  sessions: StrongSession[];
  skippedRows: number;
}

export function parseStrongCsv(text: string, unit: WeightUnit): ParseResult {
  const firstLine = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0] ?? '';
  const rows = parseCsv(text, detectDelimiter(firstLine));
  if (rows.length === 0) return { sessions: [], skippedRows: 0 };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const iDate = col('date');
  const iName = col('workout name');
  const iDur = col('duration');
  const iEx = col('exercise name');
  const iOrder = col('set order');
  const iWeight = col('weight');
  const iReps = col('reps');
  if (iDate === -1 || iEx === -1 || iReps === -1) {
    throw new Error('This does not look like a Strong export (missing Date, Exercise Name or Reps columns).');
  }

  const toKg = unit === 'lb' ? 1 / LB_PER_KG : 1;
  const byKey = new Map<string, StrongSession>();
  let skipped = 0;

  for (const r of rows.slice(1)) {
    const startedAt = (r[iDate] ?? '').trim();
    const date = startedAt.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      skipped++;
      continue;
    }
    const name = iName === -1 ? 'Workout' : (r[iName] ?? '').trim() || 'Workout';
    const key = `${startedAt}|${name}`;
    let session = byKey.get(key);
    if (!session) {
      session = { key, date, startedAt, name, durationMin: iDur === -1 ? 0 : parseDurationMin(r[iDur] ?? ''), sets: [] };
      byKey.set(key, session);
    }

    const exercise = (r[iEx] ?? '').trim();
    const reps = Math.round(num(r[iReps]));
    if (!exercise || reps <= 0) continue; // cardio or empty rows carry no strength set
    const order = iOrder === -1 ? '' : (r[iOrder] ?? '').trim().toUpperCase();
    session.sets.push({
      exercise,
      weightKg: Math.round(num(iWeight === -1 ? '0' : r[iWeight]) * toKg * 100) / 100,
      reps,
      warmup: order === 'W',
    });
  }

  const sessions = [...byKey.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  return { sessions, skippedRows: skipped };
}
