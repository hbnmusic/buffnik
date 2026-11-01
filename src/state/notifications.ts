/**
 * Decides which notifications to schedule and which to send now. Pure: the device
 * layer (notify.ts) schedules what this returns.
 */
import type { GameState } from '../engine';
import { describeDrop } from '../ui/format';
import { parseTime, type Settings } from './settings';

export interface Note {
  id: string;
  title: string;
  body: string;
}

export interface ScheduledNote extends Note {
  at: Date;
}

export interface ScheduleContext {
  now: Date;
  /** Local date 'YYYY-MM-DD' of `now`. */
  today: string;
  credited: number;
  required: number;
  trainedToday: boolean;
  level: number;
  coins: number;
  /** Days since the last backup file was made, or null if never. */
  daysSinceBackup: number | null;
}

const DAY_MS = 86_400_000;

function atLocalTime(base: Date, dayOffset: number, [h, m]: [number, number]): Date {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset, h, m, 0, 0);
  return d;
}

/** Everything that should be scheduled from now on. The caller cancels the old schedule first. */
export function planSchedule(settings: Settings, ctx: ScheduleContext): ScheduledNote[] {
  const out: ScheduledNote[] = [];
  const n = settings.notifications;
  const todayDow = ctx.now.getDay(); // 0 = Sunday
  const daysLeftThisWeek = (7 - todayDow) % 7; // offset of this Sunday; weeks run Monday to Sunday
  const onTarget = ctx.credited >= ctx.required;

  if (n.dailyNudge) {
    const time = parseTime(n.dailyNudgeTime, [18, 0]);
    for (let i = 0; i < 7; i++) {
      const at = atLocalTime(ctx.now, i, time);
      if (at.getTime() <= ctx.now.getTime()) continue;
      if (i === 0 && ctx.trainedToday) continue;
      const inThisWeek = i <= daysLeftThisWeek;
      if (inThisWeek && onTarget) continue; // no nagging once the week's target is met
      out.push({
        id: `nudge-${i}`,
        at,
        title: 'Buffnik',
        body: inThisWeek
          ? `${ctx.credited} of ${ctx.required} workouts this week. A swim or a lift today?`
          : 'A new week. Get your first workout in.',
      });
    }
  }

  if (n.weeklySummary) {
    const time = parseTime(n.weeklySummaryTime, [19, 0]);
    let at = atLocalTime(ctx.now, daysLeftThisWeek, time);
    if (at.getTime() <= ctx.now.getTime()) at = new Date(at.getTime() + 7 * DAY_MS);
    out.push({
      id: 'weekly',
      at,
      title: 'Your week in Buffnik',
      body: `${ctx.credited} of ${ctx.required} workouts. Level ${ctx.level}, ${ctx.coins.toLocaleString()} coins. Open the app for the full summary.`,
    });
  }

  if (n.backupReminder && (ctx.daysSinceBackup === null || ctx.daysSinceBackup >= 30)) {
    out.push({
      id: 'backup',
      at: atLocalTime(ctx.now, 3, [12, 0]),
      title: 'Back up Buffnik',
      body: 'Save a backup file to Drive so a lost phone does not cost you your progress.',
    });
  }
  return out;
}

/** What was already announced, so each unlock is announced once. */
export interface Seen {
  level: number;
  dropIds: string[];
  defeats: number;
  weeks: number;
}

export function seenFrom(state: GameState): Seen {
  return { level: state.level.level, dropIds: state.drops.map((d) => d.eventId), defeats: state.defeats.length, weeks: state.weeks.length };
}

/**
 * Compare the state with what was last announced. With no previous record the
 * current state becomes the baseline silently.
 */
export function detectEvents(seen: Seen | null, state: GameState): { notes: Note[]; seen: Seen } {
  const next = seenFrom(state);
  if (!seen) return { notes: [], seen: next };
  const notes: Note[] = [];

  if (state.level.level > seen.level) {
    notes.push({ id: `level-${state.level.level}`, title: `Level ${state.level.level}`, body: 'You levelled up.' });
  }
  const known = new Set(seen.dropIds);
  for (const d of state.drops.filter((x) => !known.has(x.eventId))) {
    notes.push({ id: `drop-${d.eventId}`, title: 'Loot', body: describeDrop(d.drop) });
  }
  if (state.defeats.length > seen.defeats) {
    notes.push({ id: `boss-${state.defeats.length}`, title: 'Boss defeated', body: state.defeats[0].boss });
  }
  for (const w of state.weeks.slice(seen.weeks)) {
    if (w.outcome === 'missed') notes.push({ id: `week-${w.weekStart}`, title: 'Week missed', body: `Only ${w.creditedWorkouts} of ${w.required} workouts. It cost ${w.coinPenalty} coins and the bosses healed.` });
    else if (w.outcome === 'on_target') notes.push({ id: `week-${w.weekStart}`, title: 'Week on target', body: `${w.creditedWorkouts} workouts. Streak: ${state.streakWeeks} weeks.` });
    else if (w.outcome === 'frozen') notes.push({ id: `week-${w.weekStart}`, title: 'Freeze used', body: 'A streak freeze covered a missed week.' });
  }
  return { notes, seen: next };
}
