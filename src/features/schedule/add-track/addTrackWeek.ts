/**
 * Add track — the combined week (enable_home_v2, journeys J3 / J4, boards S-6b / S-6c).
 *
 * Engine v2 decides everything: the existing week goes in as `existing` (mode 'add_track':
 * keep it, move only what a hard rule forces and say why; mode 'add_only': nothing moves,
 * the new track goes only into free days). This file feeds the engine and turns its week
 * + diff into rows ("חדש" / "נשאר" / "הוזז: … · כי …") and the one-line recommendation.
 * Pure.
 */
import { buildWeek, defaultTrainingDays, saturdayMarked } from '../engine-v2';
import { refKey, refNameHe } from '../engine-v2/diff';
import { slugNameHe } from '../engine-v2/programProfiles';
import type {
  DiffEntry,
  PlacedSession,
  RunSlot,
  SchedulePriority,
  ScheduleEngineInput,
  SessionRef,
  TrainingLevel,
  WeekPlan,
} from '../engine-v2/types';
import type { AddedTrack, ExistingRunDay, ExistingStrengthDay } from './addTrackProfile';

export interface AddTrackInput {
  added: AddedTrack;
  existingStrength: ExistingStrengthDay[];
  existingRuns: ExistingRunDay[];
  /** J4: the new strength program (slug + sessions a week). */
  newStrength?: { slug: string; sessionsPerWeek: number } | null;
  /** J3: week-1 run slots of the new plan. */
  newRunSlots?: RunSlot[] | null;
  runLevel: TrainingLevel;
  strengthLevel?: TrainingLevel | null;
  targetDistance: string;
  /**
   * Shabbat (owner 20.10.2026): the user marked Saturday free. Saturday is also open when
   * the existing week already trains on it (they marked it before). Otherwise the engine
   * never puts a session there.
   */
  allowSaturday?: boolean;
}

export type AddTrackSessionStatus = 'new' | 'kept' | 'moved';

export interface AddTrackSessionView {
  kind: 'run' | 'strength';
  slot?: RunSlot;
  slug?: string;
  nameHe: string;
  status: AddTrackSessionStatus;
  /** Where a moved session came from. */
  fromDow?: number;
  /** "נשאר כמו שהיה" / the engine's reason / "הוזז: … · כי …". */
  noteHe: string | null;
}

export interface AddTrackDayView {
  dow: number;
  sessions: AddTrackSessionView[];
}

export interface AddTrackWeekView {
  days: AddTrackDayView[];
  /** "נוסיף 3 ריצות ונזיז אימון אחד" */
  titleHe: string;
  newCount: number;
  movedCount: number;
  warningsHe: string[];
  plan: WeekPlan;
}

// ── Priority (the builder's aerobic ↔ strength control) ─────────────────

/** The first track wins by default: it was there first (boards: "כוח קודם (התחלת בכוח)"). */
export function presetPriority(added: AddedTrack): SchedulePriority {
  return added === 'running' ? 'strength_first' : 'run_first';
}

/** AerobicStrengthSlider share (0.30 … 0.70) → engine priority. */
export function priorityFromShare(share: number): SchedulePriority {
  if (share <= 0.4) return 'strength_first';
  if (share >= 0.6) return 'run_first';
  return 'balanced';
}

/** The slider position of a priority (ends = the preset, middle = balanced). */
export function shareOfPriority(priority: SchedulePriority): number {
  return priority === 'strength_first' ? 0.3 : priority === 'run_first' ? 0.7 : 0.5;
}

const PRIORITY_HE: Record<SchedulePriority, string> = {
  run_first: 'ריצה קודם',
  balanced: 'מאוזן',
  strength_first: 'כוח קודם',
  skill: 'מאוזן',
};

/** "כוח קודם (התחלת בכוח) · אפשר לשנות במחוון" */
export function priorityLineHe(priority: SchedulePriority, added: AddedTrack): string {
  const preset = priority === presetPriority(added);
  const origin = added === 'running' ? 'התחלת בכוח' : 'התחלת בריצה';
  return `${PRIORITY_HE[priority]}${preset ? ` (${origin})` : ''} · אפשר לשנות במחוון`;
}

const PRIORITY_HELPER_HE: Record<SchedulePriority, string> = {
  strength_first: 'כוח קודם: הכוח שומר על הימים שלו, הריצות נכנסות סביבו',
  balanced: 'מאוזן: שניהם נכנסים, אימון כפול רק ביום איכות',
  run_first: 'ריצה קודם: האיכות והארוכה מוגנות, הכוח נכנס סביבן',
  skill: 'מאוזן: שניהם נכנסים, אימון כפול רק ביום איכות',
};

/** The line under the priority slider. */
export const priorityHelperHe = (priority: SchedulePriority): string => PRIORITY_HELPER_HE[priority];

// ── Engine input ──────────────────────────────────────────────────────

/** The days the combined week may use: Sun–Fri, plus Saturday when marked / already used. */
export function addTrackOpenDays(i: AddTrackInput): number[] {
  const used = [...i.existingStrength.map((d) => d.dow), ...i.existingRuns.map((d) => d.dow)];
  return defaultTrainingDays(i.allowSaturday === true || saturdayMarked(used));
}

export function addTrackEngineInput(i: AddTrackInput, priority: SchedulePriority, keepOnly: boolean): ScheduleEngineInput {
  const existingDays: Partial<Record<number, SessionRef[]>> = {};
  const push = (dow: number, r: SessionRef) => (existingDays[dow] = [...(existingDays[dow] ?? []), r]);
  for (const d of i.existingStrength) push(d.dow, { kind: 'strength', slug: d.slug });
  for (const d of i.existingRuns) push(d.dow, { kind: 'run', slot: d.slot });

  // Strength programs: the existing days grouped by slug (+ the new program for J4).
  const bySlug = new Map<string, number>();
  for (const d of i.existingStrength) bySlug.set(d.slug, (bySlug.get(d.slug) ?? 0) + 1);
  if (i.added === 'strength' && i.newStrength && i.newStrength.sessionsPerWeek > 0) {
    bySlug.set(i.newStrength.slug, (bySlug.get(i.newStrength.slug) ?? 0) + i.newStrength.sessionsPerWeek);
  }
  const strength = Array.from(bySlug.entries()).map(([slug, sessionsPerWeek], idx) => ({ slug, sessionsPerWeek, priority: idx + 1 }));

  const runSlots: RunSlot[] = [
    ...i.existingRuns.map((d) => d.slot),
    ...(i.added === 'running' ? i.newRunSlots ?? [] : []),
  ];
  const longRun = i.existingRuns.find((d) => d.slot === 'long_run');
  const sessions = strength.reduce((n, p) => n + p.sessionsPerWeek, 0) + runSlots.length;

  return {
    // Every open day (Saturday only when marked); one day per session where it can (maxTrainingDays).
    availability: {
      days: addTrackOpenDays(i),
      maxSessionsPerDay: 2,
      maxTrainingDays: Math.min(addTrackOpenDays(i).length, Math.max(1, sessions)),
      preferredLongRunDay: longRun?.dow ?? null,
    },
    strength,
    running: runSlots.length
      ? { level: i.runLevel, targetDistance: i.targetDistance, sessions: runSlots.map((slot) => ({ slot })) }
      : null,
    priority,
    levels: { strength: i.strengthLevel ?? (strength.length ? 'intermediate' : null), running: runSlots.length ? i.runLevel : null },
    existing: { mode: keepOnly ? 'add_only' : 'add_track', days: existingDays, source: 'user' },
  };
}

// ── View ──────────────────────────────────────────────────────────────

const isMain = (s: PlacedSession) => (s.kind === 'run' || s.kind === 'strength') && !s.optional;
const refOfPlaced = (s: PlacedSession): SessionRef | null =>
  s.kind === 'run' && s.slot ? { kind: 'run', slot: s.slot } : s.kind === 'strength' && s.slug ? { kind: 'strength', slug: s.slug } : null;

function takeDiff(pool: DiffEntry[], dow: number, ref: SessionRef): DiffEntry | null {
  const k = refKey(ref);
  const i = pool.findIndex((e) => e.toDow === dow && e.status !== 'removed' && refKey(e.session) === k);
  return i >= 0 ? pool.splice(i, 1)[0] : null;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);

export function addTrackTitleHe(added: AddedTrack, newCount: number, movedCount: number): string {
  if (newCount === 0) return added === 'running' ? 'אין יום פנוי לריצה בשבוע הזה' : 'אין יום פנוי לכוח בשבוע הזה';
  if (added === 'running') {
    const add = `נוסיף ${plural(newCount, 'ריצה אחת', 'ריצות')}`;
    return movedCount ? `${add} ונזיז ${plural(movedCount, 'אימון אחד', 'אימונים')}` : `${add} סביב השבוע שלך`;
  }
  const add = `נוסיף ${plural(newCount, 'אימון כוח אחד', 'אימוני כוח')}`;
  return movedCount ? `${add} ונזיז ${plural(movedCount, 'ריצה אחת', 'ריצות')}` : `${add} סביב הריצות`;
}

export function buildAddTrackWeek(i: AddTrackInput, priority: SchedulePriority, keepOnly: boolean): AddTrackWeekView {
  const plan = buildWeek(addTrackEngineInput(i, priority, keepOnly));
  const pool = [...plan.diff];
  let newCount = 0;
  let movedCount = 0;
  const days: AddTrackDayView[] = plan.days.map((day) => {
    const sessions: AddTrackSessionView[] = [];
    for (const s of day.sessions) {
      if (!isMain(s)) continue;
      const ref = refOfPlaced(s);
      if (!ref) continue;
      const entry = takeDiff(pool, day.dow, ref);
      // A session with no diff entry is a free slot the engine added (handstand / mobility):
      // new when it belongs to the added track, otherwise part of the user's week.
      const addedKind = i.added === 'running' ? 'run' : 'strength';
      const status: AddTrackSessionStatus = entry
        ? (entry.status as AddTrackSessionStatus)
        : ref.kind === addedKind
          ? 'new'
          : 'kept';
      if (status === 'new') newCount++;
      if (status === 'moved') movedCount++;
      sessions.push({
        kind: ref.kind,
        slot: ref.kind === 'run' ? ref.slot : undefined,
        slug: ref.kind === 'strength' ? ref.slug : undefined,
        nameHe: ref.kind === 'strength' ? slugNameHe(ref.slug) : refNameHe(ref),
        status,
        fromDow: status === 'moved' ? entry?.fromDow : undefined,
        noteHe: status === 'kept' ? 'נשאר כמו שהיה' : status === 'moved' ? entry!.labelHe : day.reasonsHe[0] ?? null,
      });
    }
    return { dow: day.dow, sessions };
  });
  return {
    days,
    titleHe: addTrackTitleHe(i.added, newCount, movedCount),
    newCount,
    movedCount,
    warningsHe: plan.warningsHe,
    plan,
  };
}

