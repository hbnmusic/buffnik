/**
 * Parser for the text Strong sends when you tap Share on one workout, for example:
 *
 *   Bro Back Day 3
 *   Wednesday, August 14, 2024 at 06:03
 *
 *   Incline Curl (Dumbbell)
 *   Set 1: 25 lb × 15
 *   Set 2: 6 reps
 *   Set 3: 0:50
 *
 *   Workout Notes: 4:1:1 tempo
 *   https://strong.app.link/...
 *
 * The text names the workout, its start, and each set; it has no duration, so only timed sets (cardio, planks)
 * count toward the length. Assisted sets ("-70 lb") count as bodyweight. Pure TypeScript, unit tested.
 */
import { LB_PER_KG } from '../engine/config';
import type { StrengthSet } from '../engine/types';
import type { ParseResult, StrongSession, WeightUnit } from './strongCsv';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** A set line: "Set 1: 25 lb × 15", "W: 45 kg x 10", "Set 2: 6 reps", "Set 3: 0:50". */
const SET_LINE = /^\s*(set\s*\d+|[wdf]\d*|warm[- ]?up(?:\s*set)?|drop(?:\s*set)?|failure)\s*:\s*(.+)$/i;
const WEIGHTED = /([+-]?\d+(?:[.,]\d+)?)\s*(kg|kgs|lb|lbs)\s*[×xX*]\s*(\d+)/;
const REPS_ONLY = /^(\d+)\s*reps?\b/i;

const pad = (n: number) => String(n).padStart(2, '0');

/** "Wednesday, August 14, 2024 at 06:03", "Saturday 14 November 2026 at 6:03 PM" -> '2026-11-14 18:03:00'. */
export function parseShareDate(line: string): string | null {
  const s = line.toLowerCase();
  const monthMatch = s.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?/);
  const year = s.match(/\b(19|20)\d{2}\b/);
  let y: number;
  let mo: number;
  let d: number;
  if (monthMatch && year) {
    mo = MONTHS.indexOf(monthMatch[1]) + 1;
    y = Number(year[0]);
    // The day is the 1-2 digit number next to the month name (before or after it).
    const after = s.slice(monthMatch.index! + monthMatch[0].length).match(/^\s*(\d{1,2})(?:st|nd|rd|th)?\b/);
    const before = s.slice(0, monthMatch.index).match(/\b(\d{1,2})(?:st|nd|rd|th)?\.?\s*(?:de\s+)?$/);
    const day = after?.[1] ?? before?.[1];
    if (!day) return null;
    d = Number(day);
  } else {
    const iso = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (!iso) return null;
    y = Number(iso[1]);
    mo = Number(iso[2]);
    d = Number(iso[3]);
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;

  let hh = 12;
  let mm = 0;
  const time = s.match(/\b(\d{1,2})[:.h](\d{2})\s*(a\.?m\.?|p\.?m\.?)?/);
  if (time) {
    hh = Number(time[1]);
    mm = Number(time[2]);
    const ampm = time[3]?.[0];
    if (ampm === 'p' && hh < 12) hh += 12;
    if (ampm === 'a' && hh === 12) hh = 0;
    if (hh > 23 || mm > 59) return null;
  }
  return `${y}-${pad(mo)}-${pad(d)} ${pad(hh)}:${pad(mm)}:00`;
}

/** Quick check for the shared-workout text, before importing. */
export function looksLikeStrongShare(text: string): boolean {
  const lines = text.split(/\r?\n/).slice(0, 6);
  const hasDate = lines.some((l) => parseShareDate(l) !== null);
  return hasDate && text.split(/\r?\n/).some((l) => SET_LINE.test(l));
}

const isLink = (l: string) => /^\s*(https?:\/\/|www\.)/i.test(l) || /strong\.app\.link/i.test(l);
const isNote = (l: string) => /^\s*(workout\s+)?notes?\s*:/i.test(l);

/**
 * One shared workout as a session in the same shape as a CSV import, so the two de-duplicate.
 * Weights are converted to kg using the unit on each line; `unit` is only used if a line has none.
 */
export function parseStrongShare(text: string, unit: WeightUnit = 'lb'): ParseResult {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).map((l) => l.trim());
  const firstLines = lines.filter((l) => l !== '').slice(0, 4);
  const dateIdx = firstLines.findIndex((l) => parseShareDate(l) !== null);
  if (dateIdx === -1) throw new Error('This shared workout has no date Buffnik can read.');
  const startedAt = parseShareDate(firstLines[dateIdx])!;
  const name = (dateIdx > 0 ? firstLines[0] : 'Workout').slice(0, 80) || 'Workout';

  const sets: StrengthSet[] = [];
  let exercise = '';
  let skipped = 0;
  let unitSeen: WeightUnit | null = null;
  let pastHeader = false;
  let timedMin = 0;
  for (const line of lines) {
    if (line === '') continue;
    if (!pastHeader) {
      if (line === firstLines[dateIdx]) pastHeader = true;
      continue;
    }
    if (isLink(line) || isNote(line)) continue;
    const m = line.match(SET_LINE);
    if (!m) {
      exercise = line;
      continue;
    }
    if (!exercise) {
      skipped++;
      continue;
    }
    const label = m[1].toLowerCase();
    const body = m[2];
    const warmup = /^w/.test(label) || /warm/i.test(body);
    const w = body.match(WEIGHTED);
    if (w) {
      const lineUnit: WeightUnit = w[2].toLowerCase().startsWith('kg') ? 'kg' : 'lb';
      unitSeen ??= lineUnit;
      const value = Math.max(0, parseFloat(w[1].replace(',', '.')));
      const kg = lineUnit === 'lb' ? value / LB_PER_KG : value;
      sets.push({ exercise, weightKg: Math.round(kg * 100) / 100, reps: Number(w[3]), warmup });
      continue;
    }
    const r = body.match(REPS_ONLY);
    if (r) {
      sets.push({ exercise, weightKg: 0, reps: Number(r[1]), warmup });
      continue;
    }
    // Timed sets (cardio, planks) carry no strength set, as in the CSV import, but their minutes are real
    // training time, so they set a floor for the workout's length.
    const t = body.match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?\b/);
    if (t) timedMin += t[3] !== undefined ? Number(t[1]) * 60 + Number(t[2]) + Number(t[3]) / 60 : Number(t[1]) + Number(t[2]) / 60;
  }

  const session: StrongSession = { key: `${startedAt}|${name}`, date: startedAt.slice(0, 10), startedAt, name, durationMin: Math.round(timedMin * 10) / 10, sets };
  return { sessions: [session], skippedRows: skipped, unit: unitSeen ?? unit, unitFromFile: unitSeen !== null, withoutDuration: 1 };
}
