import type { StrengthSet } from './types';

/** Epley estimated one-rep max. Sets above 12 reps are too far from a max to estimate. */
export function estimateOneRepMax(weightKg: number, reps: number): number | null {
  if (weightKg <= 0 || reps <= 0 || reps > 12) return null;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

export function normalizeExercise(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Best estimated 1RM per exercise, in kg. */
export type PrBook = Record<string, number>;

export interface PrResult {
  book: PrBook;
  prs: { exercise: string; previous: number | null; next: number }[];
}

/**
 * Update the PR book with one session's sets. When `baselineOnly` is true
 * (history import), the book is updated but no PRs are reported, so imported
 * history never earns XP.
 */
export function applySets(book: PrBook, sets: StrengthSet[], baselineOnly = false): PrResult {
  const next: PrBook = { ...book };
  const bestThisSession: Record<string, number> = {};

  for (const set of sets) {
    if (set.warmup) continue;
    const e1rm = estimateOneRepMax(set.weightKg, set.reps);
    if (e1rm === null) continue;
    const key = normalizeExercise(set.exercise);
    bestThisSession[key] = Math.max(bestThisSession[key] ?? 0, e1rm);
  }

  const prs: PrResult['prs'] = [];
  for (const [exercise, best] of Object.entries(bestThisSession)) {
    const previous = next[exercise] ?? null;
    if (previous === null || best > previous + 1e-9) {
      next[exercise] = best;
      // A first-ever entry for an exercise sets a baseline; it is not a PR.
      if (!baselineOnly && previous !== null) {
        prs.push({ exercise, previous, next: best });
      }
    }
  }

  return { book: next, prs };
}

export function workingTonnageKg(sets: StrengthSet[]): number {
  return sets.reduce((sum, s) => (s.warmup ? sum : sum + Math.max(0, s.weightKg) * Math.max(0, s.reps)), 0);
}
