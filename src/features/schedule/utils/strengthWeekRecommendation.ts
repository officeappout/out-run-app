/**
 * Strength week recommendation glue (enable_home_v2, journey 1 — boards
 * jr/J1-07..J1-09, sch/S-5a..S-5c).
 *
 * Pure: the user's strength seed (resolveScheduleSeed — the same seed the
 * wizard's ScheduleStep always used) + level + persona → the recommended
 * count, the engine-v2 week (buildWeek) on the chosen days, one Hebrew line
 * per day, and the onboarding-store payload with the SAME fields ScheduleStep
 * writes (trainingDays, trainingTime, scheduleDayIndices, scheduleDays,
 * recurringTemplate, scheduleGridSessions, historyFrequency).
 * The engine decides WHERE each session goes; this file only feeds it and
 * formats the result.
 */
import { buildWeek, profileOf, renderV2ReasonHe } from '../engine-v2';
import type { ScheduleEngineInput, StrengthProgramInput, TimeWindow, TrainingLevel } from '../engine-v2/types';
import { MIN_DAYS_FOR_HARD_SKILLS } from '../engine/scheduleRules';
import { classifyStrengthId, scheduleIdNameHe, STRENGTH_SLUG_TO_SCHEDULE_ID } from '../engine/strengthVocabulary';
import type { PrioritizedSkill, ProgramId, ScheduleItemId } from '../types/smartSchedule.types';
import { DAY_LETTERS_HE, RUN_TIME_PRESETS, TIME_WINDOWS } from './runWeekRecommendation';

export { DAY_LETTERS_HE };

/** Today's strength default is the evening (ScheduleStep opened on 18:00). */
export const DEFAULT_STRENGTH_WINDOW: TimeWindow = 'evening';
/** Same as ScheduleStep's RECOMMENDED_FREQUENCY. */
export const BASE_STRENGTH_FREQUENCY = 3;
export const MIN_STRENGTH_FREQUENCY = 1;
export const MAX_STRENGTH_FREQUENCY = 7;

export interface StrengthSeed {
  programs: ProgramId[];
  skills: PrioritizedSkill[];
}

// ── What the user trains ──────────────────────────────────────────────

/**
 * The main session items, in priority order — the same choice ScheduleStep's
 * buildDefaultTemplate makes: the hard skills when there are any, otherwise
 * the first program (UPPER_BODY when the seed is empty). Handstand is never a
 * main session (a free slot on every training day).
 */
export function strengthMainItems(seed: StrengthSeed): ScheduleItemId[] {
  const skills = [...seed.skills].filter((s) => s.id !== 'HANDSTAND').sort((a, b) => a.priority - b.priority);
  if (skills.length > 0) return skills.map((s) => s.id);
  return [seed.programs[0] ?? 'UPPER_BODY'];
}

export const seedHasHandstand = (seed: StrengthSeed): boolean => seed.skills.some((s) => s.id === 'HANDSTAND');

/** Engine slug of a schedule id (FULL_BODY → full_body). */
export function slugOfItem(id: ScheduleItemId): string {
  return classifyStrengthId(id).slug ?? 'upper_body';
}

/** Back from an engine slug to the schedule taxonomy (unknown → UPPER_BODY). */
export function itemOfSlug(slug: string): ScheduleItemId {
  const s = slug.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return STRENGTH_SLUG_TO_SCHEDULE_ID[s] ?? 'UPPER_BODY';
}

// ── Level ─────────────────────────────────────────────────────────────

/**
 * Program level (1…) → the engine's coarse level (only the streak comfort
 * reads it for strength-only weeks).
 */
export function strengthTrainingLevel(level: number | null | undefined): TrainingLevel {
  const l = typeof level === 'number' && Number.isFinite(level) ? level : 1;
  if (l <= 5) return 'beginner';
  if (l <= 12) return 'intermediate';
  return 'advanced';
}

// ── Q1: how many days ─────────────────────────────────────────────────

export interface StrengthFrequencyRecommendation {
  frequency: number;
  /** Short Hebrew reason when the persona moved the number ("גיל הזהב"). */
  personaNoteHe: string | null;
}

const PERSONA_FREQUENCY: Readonly<Record<string, { frequency: number; noteHe: string }>> = {
  vatikim: { frequency: 2, noteHe: 'מותאם לגיל הזהב' },
  pro_athlete: { frequency: 4, noteHe: 'מותאם לספורטאי' },
};

/**
 * Recommended training days: 3 (today's default), the persona's number when
 * it has one, and never below the hard-skill minimum (the existing
 * ERR_DAYS_MIN table — 2 skills need 3 days …).
 */
export function recommendStrengthFrequency(input: { seed: StrengthSeed; personaIds?: readonly string[] }): StrengthFrequencyRecommendation {
  let frequency = BASE_STRENGTH_FREQUENCY;
  let personaNoteHe: string | null = null;
  for (const id of input.personaIds ?? []) {
    const p = PERSONA_FREQUENCY[id];
    if (p) {
      frequency = p.frequency;
      personaNoteHe = p.noteHe;
      break;
    }
  }
  const hardSkills = input.seed.skills.filter((s) => s.id !== 'HANDSTAND').length;
  const skillMin = MIN_DAYS_FOR_HARD_SKILLS[Math.min(hardSkills, 4)] ?? 0;
  if (skillMin > frequency) {
    frequency = skillMin;
    personaNoteHe = null;
  }
  return { frequency: clampFrequency(frequency), personaNoteHe };
}

export function clampFrequency(n: number): number {
  return Math.max(MIN_STRENGTH_FREQUENCY, Math.min(MAX_STRENGTH_FREQUENCY, Math.round(n)));
}

// ── The week (engine v2) ──────────────────────────────────────────────

export interface StrengthWeekDay {
  dow: number;
  /** Schedule ids of the day, handstand first (ScheduleStep's order). */
  items: ScheduleItemId[];
  window: TimeWindow;
  minutes: number;
  /** One Hebrew line: the engine's reason, else the recovery fact. */
  reasonHe: string;
}

export interface StrengthWeekRecommendation {
  /** Training days in week order (Sunday first). */
  days: StrengthWeekDay[];
  warningsHe: string[];
  /** Ideal hours between two sessions of the main program (48 for full body). */
  recoveryHours: number;
}

/** Splits `frequency` sessions across the main items, priority first (5 over 2 → 3 + 2). */
export function distributeSessions(items: readonly ScheduleItemId[], frequency: number): number[] {
  const out = items.map(() => 0);
  for (let i = 0; i < frequency && items.length > 0; i++) out[i % items.length]++;
  return out;
}

/** Engine input for a strength-only week on `days` (one session a day). */
export function strengthEngineInput(seed: StrengthSeed, frequency: number, days: readonly number[], level: TrainingLevel): ScheduleEngineInput {
  const items = strengthMainItems(seed);
  const counts = distributeSessions(items, frequency);
  const strength: StrengthProgramInput[] = items
    .map((id, i) => ({ slug: slugOfItem(id), sessionsPerWeek: counts[i], priority: i + 1 }))
    .filter((p) => p.sessionsPerWeek > 0);
  if (seedHasHandstand(seed)) {
    strength.push({ slug: 'handstand', sessionsPerWeek: frequency, priority: strength.length + 1, freeSlot: true });
  }
  return {
    availability: { days: [...days], maxSessionsPerDay: 1, maxTrainingDays: frequency },
    strength,
    running: null,
    levels: { strength: level, running: null },
  };
}

/**
 * The days the recommendation opens with: the engine's pick for `frequency`
 * over Sunday–Friday (Saturday is never a default day — buildDefaultTemplate's
 * rule), all seven only for a seven-day week.
 */
export function recommendedStrengthDays(seed: StrengthSeed, frequency: number, level: TrainingLevel): number[] {
  const n = clampFrequency(frequency);
  const pool = n >= 7 ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4, 5];
  const week = recommendStrengthWeek({ seed, frequency: n, days: pool, level });
  const picked = week.days.map((d) => d.dow);
  return picked.length === n ? picked : pool.slice(0, n);
}

const GENERIC_REASONS = new Set(['STRENGTH_OWN_DAY', 'REST_DAY', 'NOT_AVAILABLE']);

function recoveryReasonHe(prevDow: number | null, dow: number, idealHours: number): string {
  if (prevDow == null) return 'אימון ראשון בשבוע';
  const hours = (dow - prevDow) * 24;
  return hours >= idealHours ? `${hours} שעות בין אימוני כוח` : `${hours} שעות מהאימון הקודם`;
}

export interface RecommendStrengthWeekInput {
  seed: StrengthSeed;
  frequency: number;
  /** Chosen days, 0 = Sunday. */
  days: readonly number[];
  windows?: Partial<Record<number, TimeWindow>>;
  level: TrainingLevel;
}

/** Places the strength sessions on the chosen days with schedule engine v2. */
export function recommendStrengthWeek(input: RecommendStrengthWeekInput): StrengthWeekRecommendation {
  const items = strengthMainItems(input.seed);
  const main = profileOf(slugOfItem(items[0]));
  const recoveryHours = main.idealRecoveryHours;
  const days = Array.from(new Set(input.days)).filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
  const frequency = Math.min(clampFrequency(input.frequency), days.length);
  if (days.length === 0 || frequency === 0) return { days: [], warningsHe: [], recoveryHours };

  const plan = buildWeek(strengthEngineInput(input.seed, frequency, days, input.level));
  const out: StrengthWeekDay[] = [];
  let prev: number | null = null;
  for (const day of plan.days) {
    const sessions = day.sessions.filter((s) => s.kind === 'strength' && s.slug && !s.optional);
    if (sessions.length === 0) continue;
    const ordered = [...sessions].sort((a, b) => (a.slug === 'handstand' ? -1 : b.slug === 'handstand' ? 1 : 0));
    const dayItems = Array.from(new Set(ordered.map((s) => itemOfSlug(s.slug!))));
    const mainSession = ordered.find((s) => s.slug !== 'handstand') ?? ordered[0];
    const minutes = mainSession.minutes ?? profileOf(mainSession.slug!).sessionMinutes;
    const engineReason = day.reasons.find((r) => !GENERIC_REASONS.has(r.code));
    out.push({
      dow: day.dow,
      items: dayItems,
      window: input.windows?.[day.dow] ?? DEFAULT_STRENGTH_WINDOW,
      minutes,
      reasonHe: engineReason
        ? renderV2ReasonHe(engineReason).replace(/\.$/, '')
        : recoveryReasonHe(prev, day.dow, recoveryHours),
    });
    prev = day.dow;
  }
  return { days: out, warningsHe: plan.warningsHe, recoveryHours };
}

// ── Copy ──────────────────────────────────────────────────────────────

/** "א׳ / ג׳ / ה׳" */
export function dayLettersSlashed(days: readonly number[]): string {
  return [...days].sort((a, b) => a - b).map((d) => `${DAY_LETTERS_HE[d]}׳`).join(' / ');
}

/** "א׳ ג׳ ה׳" */
export function dayLettersSpaced(days: readonly number[]): string {
  return [...days].sort((a, b) => a - b).map((d) => `${DAY_LETTERS_HE[d]}׳`).join(' ');
}

/** What a session is called in one or two words: "כוח מלא" for full body, else the program names. */
export function strengthSessionWordHe(seed: StrengthSeed): string {
  const items = strengthMainItems(seed);
  if (items.length === 1 && items[0] === 'FULL_BODY') return 'כוח מלא';
  return items.map(scheduleIdNameHe).join(' ו');
}

/** "3 ימים בשבוע · כוח מלא א׳ / ג׳ / ה׳" */
export function strengthRecommendationTitle(seed: StrengthSeed, days: readonly number[]): string {
  const n = days.length;
  const count = n === 1 ? 'יום אחד בשבוע' : `${n} ימים בשבוע`;
  return `${count} · ${strengthSessionWordHe(seed)} ${dayLettersSlashed(days)}`;
}

/** "רמה 4 · 48 שעות התאוששות בין אימונים" (+ the persona note when it moved the number). */
export function strengthWhyLine(input: { level: number | null; recoveryHours: number; personaNoteHe?: string | null }): string {
  const parts: string[] = [];
  if (typeof input.level === 'number' && input.level > 0) parts.push(`רמה ${input.level}`);
  if (input.personaNoteHe) parts.push(input.personaNoteHe);
  parts.push(`${input.recoveryHours} שעות התאוששות בין אימונים`);
  return parts.join(' · ');
}

/** "כוח · כל הגוף" */
export function strengthPlanLine(seed: StrengthSeed): string {
  const names = strengthMainItems(seed).map(scheduleIdNameHe);
  if (seedHasHandstand(seed)) names.push(scheduleIdNameHe('HANDSTAND'));
  return `כוח · ${names.join(' · ')}`;
}

/** "כל הגוף ×3" per main item, from the week. */
export function strengthItemCounts(week: StrengthWeekRecommendation): Array<{ id: ScheduleItemId; count: number }> {
  const counts = new Map<ScheduleItemId, number>();
  for (const d of week.days) {
    for (const id of d.items) if (id !== 'HANDSTAND') counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return Array.from(counts, ([id, count]) => ({ id, count }));
}

/** "3 אימוני כוח בשבוע · א׳ ג׳ ה׳ ערב" (the window only when every day shares it). */
export function strengthReminderSubtitle(week: StrengthWeekRecommendation): string {
  const n = week.days.length;
  const head = n === 1 ? 'אימון כוח אחד בשבוע' : `${n} אימוני כוח בשבוע`;
  const windows = new Set(week.days.map((d) => d.window));
  const tail = windows.size === 1 ? ` ${RUN_TIME_PRESETS[week.days[0].window].label}` : '';
  return `${head} · ${dayLettersSpaced(week.days.map((d) => d.dow))}${tail}`;
}

// ── Time of day ───────────────────────────────────────────────────────

/** Any "HH:MM" → its window (before 11:00 morning, before 16:00 noon, else evening). */
export function windowForTime(time: string | null | undefined): TimeWindow | null {
  const m = typeof time === 'string' ? /^(\d{1,2}):(\d{2})$/.exec(time) : null;
  if (!m) return null;
  const h = Number(m[1]);
  if (h < 11) return 'morning';
  if (h < 16) return 'noon';
  return 'evening';
}

/** The window most days use; a tie goes to the earliest day's window. */
export function dominantWindow(days: readonly number[], windows: Partial<Record<number, TimeWindow>>, fallback: TimeWindow): TimeWindow {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 0) return fallback;
  const count = new Map<TimeWindow, number>();
  for (const d of sorted) {
    const w = windows[d] ?? fallback;
    count.set(w, (count.get(w) ?? 0) + 1);
  }
  const max = Math.max(...Array.from(count.values()));
  for (const d of sorted) {
    const w = windows[d] ?? fallback;
    if (count.get(w) === max) return w;
  }
  return fallback;
}

/** Workout time per training day — feeds the reminder slots. */
export function strengthSessionTimes(week: StrengthWeekRecommendation): Array<{ dow: number; time: string }> {
  return week.days.map((d) => ({ dow: d.dow, time: RUN_TIME_PRESETS[d.window].time }));
}

export { TIME_WINDOWS };

// ── Write payload (onboarding store → the fields ScheduleStep writes) ──

export interface StrengthScheduleWrite {
  trainingDays: number;
  trainingTime: string;
  scheduleDayIndices: number[];
  scheduleDays: string[];
  recurringTemplate: Record<string, string[]>;
  scheduleGridSessions: Array<{ dayOfWeek: number; skillIds: string[] }>;
  historyFrequency?: string;
}

/**
 * Exactly ScheduleStep's handleContinue payload, built from the engine week:
 * the days that got a session, one "HH:MM" (the dominant window's preset),
 * the per-day template and the full 7-day grid. historyFrequency only when
 * the optional chip was answered.
 */
export function buildStrengthScheduleWrite(input: {
  week: StrengthWeekRecommendation;
  historyFrequency?: string | null;
}): StrengthScheduleWrite {
  const indices = input.week.days.map((d) => d.dow).sort((a, b) => a - b);
  const byDow = new Map(input.week.days.map((d) => [d.dow, d]));
  const windows: Partial<Record<number, TimeWindow>> = {};
  for (const d of input.week.days) windows[d.dow] = d.window;
  const recurringTemplate: Record<string, string[]> = {};
  for (const d of input.week.days) recurringTemplate[DAY_LETTERS_HE[d.dow]] = [...d.items];
  const out: StrengthScheduleWrite = {
    trainingDays: indices.length,
    trainingTime: RUN_TIME_PRESETS[dominantWindow(indices, windows, DEFAULT_STRENGTH_WINDOW)].time,
    scheduleDayIndices: indices,
    scheduleDays: indices.map((i) => DAY_LETTERS_HE[i]),
    recurringTemplate,
    scheduleGridSessions: [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dayOfWeek: dow, skillIds: [...(byDow.get(dow)?.items ?? [])] })),
  };
  if (input.historyFrequency === 'none' || input.historyFrequency === '1-2' || input.historyFrequency === '3+') {
    out.historyFrequency = input.historyFrequency;
  }
  return out;
}
