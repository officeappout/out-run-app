/**
 * Run week recommendation glue (enable_home_v2, journeys J2 / S-5d..S-5f).
 *
 * Pure: run slots + chosen days + time-of-day windows → the engine-v2 week
 * (buildWeek), the one-line recommendation ("3 ריצות: איכות · … · ארוכה
 * בשישי"), the day-selection rules and the onboarding-store write payload.
 * The engine decides WHERE each slot goes (long run on the chosen long-run
 * day, else the last free day — config LONG_RUN_DEFAULT_RULE); this file
 * only feeds it and formats the result.
 */
import { buildWeek } from '../engine-v2';
import { dayNameHe } from '../engine-v2/reasonsV2';
import { RUNNING_SLOT_NAME_HE } from '../engine/runningRules';
import type { RunSlot, TimeWindow, TrainingLevel } from '../engine-v2/types';
import { pickRunDaysAvoidingStrength } from '@/lib/running-schedule-smart-defaults';
import { hasStrengthTrack } from '@/lib/track-ownership';

export const DAY_LETTERS_HE = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'] as const;

/**
 * Time-of-day presets — the same three the running step and the schedule
 * builder already offer (a preset is just the "HH:MM" string they save).
 */
export const RUN_TIME_PRESETS: Record<TimeWindow, { label: string; time: string }> = {
  morning: { label: 'בוקר', time: '07:00' },
  noon: { label: 'צהריים', time: '12:30' },
  evening: { label: 'ערב', time: '19:00' },
};
export const TIME_WINDOWS: readonly TimeWindow[] = ['morning', 'noon', 'evening'];
/** Today's default run time is 07:00 (morning). */
export const DEFAULT_RUN_WINDOW: TimeWindow = 'morning';

/** Short slot words for the one-line recommendation and the day tiles. */
export const RUN_SLOT_SHORT_HE: Record<RunSlot, string> = {
  quality_primary: 'איכות',
  quality_secondary: 'איכות נוספת',
  long_run: 'ארוכה',
  easy_run: 'קלה',
  recovery: 'התאוששות',
};

/** Full slot names — the app's one Hebrew vocabulary for slot types. */
export const runSlotNameHe = (slot: RunSlot): string => RUNNING_SLOT_NAME_HE[slot];

export function windowOfTime(time: string | null | undefined): TimeWindow | null {
  if (!time) return null;
  return TIME_WINDOWS.find((w) => RUN_TIME_PRESETS[w].time === time) ?? null;
}

export interface RunWeekDay {
  dow: number;
  slot: RunSlot;
  window: TimeWindow;
  /** The engine's own Hebrew reason for this day, when it has one. */
  reasonHe: string | null;
}

export interface RunWeekRecommendation {
  /** Run days in week order (Sunday first). */
  days: RunWeekDay[];
  longRunDow: number | null;
  warningsHe: string[];
}

export interface RecommendRunWeekInput {
  /** Week-1 run slots, any order (firstWeekRunSlots). */
  slots: RunSlot[];
  /** Chosen run days, 0 = Sunday. */
  days: number[];
  windows?: Partial<Record<number, TimeWindow>>;
  preferredLongRunDay?: number | null;
  level: TrainingLevel;
  targetDistance: string;
}

/** Places the week-1 runs on the chosen days with schedule engine v2. */
export function recommendRunWeek(input: RecommendRunWeekInput): RunWeekRecommendation {
  const days = Array.from(new Set(input.days)).filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
  if (days.length === 0 || input.slots.length === 0) return { days: [], longRunDow: null, warningsHe: [] };

  const plan = buildWeek({
    availability: {
      days,
      maxSessionsPerDay: 1,
      maxTrainingDays: days.length,
      preferredLongRunDay: input.preferredLongRunDay ?? null,
    },
    strength: [],
    running: { level: input.level, targetDistance: input.targetDistance, sessions: input.slots.map((slot) => ({ slot })) },
    levels: { strength: null, running: input.level },
  });

  const out: RunWeekDay[] = [];
  for (const day of plan.days) {
    const run = day.sessions.find((s) => s.kind === 'run' && s.slot && !s.optional);
    if (!run?.slot) continue;
    out.push({
      dow: day.dow,
      slot: run.slot,
      window: input.windows?.[day.dow] ?? DEFAULT_RUN_WINDOW,
      reasonHe: day.reasonsHe[0] ?? null,
    });
  }
  return {
    days: out,
    longRunDow: out.find((d) => d.slot === 'long_run')?.dow ?? null,
    warningsHe: plan.warningsHe,
  };
}

/** "3 ריצות: איכות · איכות נוספת · ארוכה בשישי" (day order). */
export function recommendationTitle(rec: RunWeekRecommendation): string {
  if (rec.days.length === 0) return '';
  const parts = rec.days.map((d) =>
    d.slot === 'long_run' ? `${RUN_SLOT_SHORT_HE.long_run} ב${dayNameHe(d.dow)}` : RUN_SLOT_SHORT_HE[d.slot],
  );
  return `${rec.days.length} ריצות: ${parts.join(' · ')}`;
}

/** "א׳ ג׳ ו׳" */
export function dayLettersLine(days: number[]): string {
  return [...days].sort((a, b) => a - b).map((d) => `${DAY_LETTERS_HE[d]}׳`).join(' ');
}

// ── Selection rules ───────────────────────────────────────────────────

/** Default run days for a frequency, avoiding known strength days. */
export function defaultRunDays(frequency: number, strengthDays: number[] = []): number[] {
  return pickRunDaysAvoidingStrength(frequency, strengthDays);
}

/**
 * A new frequency keeps the current days when they already match it,
 * otherwise re-picks the defaults (the running step's own rule).
 */
export function daysForFrequency(current: number[], frequency: number, strengthDays: number[] = []): number[] {
  return current.length === frequency ? current : defaultRunDays(frequency, strengthDays);
}

/**
 * Tap a day: on → off (never below one day); off → on, and when the week is
 * already full the most recently added day gives way (the running step's
 * own rule). Keeps insertion order so "most recent" stays meaningful.
 */
export function toggleRunDay(selected: number[], day: number, frequency: number): number[] {
  if (selected.includes(day)) {
    return selected.length <= 1 ? selected : selected.filter((d) => d !== day);
  }
  return selected.length >= frequency ? [...selected.slice(0, -1), day] : [...selected, day];
}

/**
 * The single "HH:MM" the profile keeps (lifestyle.reminders.runningTime):
 * the most used window; a tie goes to the window of the earliest run day.
 */
export function dominantRunWindow(days: number[], windows: Partial<Record<number, TimeWindow>>): TimeWindow {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 0) return DEFAULT_RUN_WINDOW;
  const count = new Map<TimeWindow, number>();
  for (const d of sorted) {
    const w = windows[d] ?? DEFAULT_RUN_WINDOW;
    count.set(w, (count.get(w) ?? 0) + 1);
  }
  const max = Math.max(...Array.from(count.values()));
  for (const d of sorted) {
    const w = windows[d] ?? DEFAULT_RUN_WINDOW;
    if (count.get(w) === max) return w;
  }
  return DEFAULT_RUN_WINDOW;
}

/** "ערב 19:00 · שישי בוקר 07:00" — the main window, then the days that differ. */
export function timesLine(days: number[], windows: Partial<Record<number, TimeWindow>>): string {
  const main = dominantRunWindow(days, windows);
  const parts = [`${RUN_TIME_PRESETS[main].label} ${RUN_TIME_PRESETS[main].time}`];
  for (const d of [...days].sort((a, b) => a - b)) {
    const w = windows[d] ?? DEFAULT_RUN_WINDOW;
    if (w !== main) parts.push(`${dayNameHe(d)} ${RUN_TIME_PRESETS[w].label} ${RUN_TIME_PRESETS[w].time}`);
  }
  return parts.join(' · ');
}

// ── Write payload (onboarding store → onboarding-sync, existing fields) ──

export interface RunSignupScheduleWrite {
  runningWeeklyFrequency: number;
  runningScheduleDays: string[];
  runningScheduleDayIndices: number[];
  runningScheduleTime: string;
  scheduleDays: string[];
  runningScheduleDaysSource: 'user-chosen';
}

/**
 * Same fields the running step's signup save always wrote (frequency, day
 * letters, indices, one time, strength ∪ run days) — marked 'user-chosen'
 * because this is now a real choice, not the silent default.
 */
export function buildRunScheduleWrite(input: {
  days: number[];
  windows: Partial<Record<number, TimeWindow>>;
  strengthDayLetters: string[];
}): RunSignupScheduleWrite {
  const indices = Array.from(new Set(input.days)).sort((a, b) => a - b);
  const letters = indices.map((i) => DAY_LETTERS_HE[i]);
  return {
    runningWeeklyFrequency: indices.length,
    runningScheduleDays: letters,
    runningScheduleDayIndices: indices,
    runningScheduleTime: RUN_TIME_PRESETS[dominantRunWindow(indices, input.windows)].time,
    scheduleDays: Array.from(new Set([...input.strengthDayLetters, ...letters])),
    runningScheduleDaysSource: 'user-chosen',
  };
}

/** Run time per chosen day — feeds the reminder slots. */
export function runSessionTimes(days: number[], windows: Partial<Record<number, TimeWindow>>): Array<{ dow: number; time: string }> {
  return [...days].sort((a, b) => a - b).map((dow) => ({ dow, time: RUN_TIME_PRESETS[windows[dow] ?? DEFAULT_RUN_WINDOW].time }));
}

// ── Routing hook ──────────────────────────────────────────────────────

export type RunScheduleStepMode = 'run_only' | 'add_track';

/**
 * A runner who already trains strength must not get the run-only week: the
 * "add track" combined week (S-6b, J3-05) takes over. See
 * ADD_TRACK_COMBINED_WEEK_ROUTE in the running-schedule page.
 */
export function runScheduleStepMode(profile: Parameters<typeof hasStrengthTrack>[0]): RunScheduleStepMode {
  return hasStrengthTrack(profile) ? 'add_track' : 'run_only';
}
