/**
 * Date helpers for local calendar dates in 'YYYY-MM-DD' form. The engine never
 * looks at the clock or time zones; callers convert device time to local dates.
 */

const DAY_MS = 86_400_000;

function toUtc(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return fromUtc(toUtc(date) + days * DAY_MS);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** Monday of the week containing `date`. */
export function weekStart(date: string): string {
  const dow = new Date(toUtc(date)).getUTCDay(); // 0 = Sunday
  const offset = (dow + 6) % 7;
  return addDays(date, -offset);
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function isValidDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && fromUtc(toUtc(date)) === date;
}
