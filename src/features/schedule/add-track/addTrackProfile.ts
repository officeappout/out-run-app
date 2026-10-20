/**
 * Add track (enable_home_v2, journeys J3 / J4, boards S-6b / S-6c) — the user's EXISTING
 * week, read from the fields the app already keeps. Pure (no Firebase, no clock).
 *
 *  - strength days: lifestyle.recurringTemplate letters that hold a strength id (the
 *    unified strength vocabulary, so slugs / raw program ids count too). A user with no
 *    strength id in the template falls back to lifestyle.scheduleDays minus the run days,
 *    trained with their first active strength program.
 *  - run days: the running plan's current week (weaverInput.buildRunningSide — the same
 *    slot ↔ day mapping the schedule builder reads). No plan week yet → running.scheduleDays
 *    with the plan's usual slot mix, placed by engine v2 (recommendRunWeek).
 */
import { DAY_LETTERS } from '../types/smartSchedule.types';
import { classifyStrengthId, isStrengthTemplateId, type ResolveSlug } from '../engine/strengthVocabulary';
import { buildRunningSide, resolveRunningLevel, type WeaverInputProfile } from '../engine/weaverInput';
import { isLongRunDay, isQualityDay, type RunningWeekDay } from '../engine/runningRules';
import { recommendRunWeek } from '../utils/runWeekRecommendation';
import type { RunSlot, TrainingLevel } from '../engine-v2/types';

export type AddedTrack = 'running' | 'strength';

export interface ExistingStrengthDay {
  dow: number;
  /** Generator slug the engine places by (push, legs, full_body …). */
  slug: string;
  /** The stored strength ids of that day (moved together with the session). */
  ids: string[];
}

export interface ExistingRunDay {
  dow: number;
  slot: RunSlot;
}

const letterIndex = (l: string) => (DAY_LETTERS as readonly string[]).indexOf(l);

/** Strength ids of the user's active programs (fallback content for a day with no stored id). */
export function activeStrengthProgramIds(profile: WeaverInputProfile | null | undefined, resolveSlug?: ResolveSlug): string[] {
  const out: string[] = [];
  for (const p of profile?.progression?.activePrograms ?? []) {
    const id = p.templateId ?? p.id ?? '';
    if (id && isStrengthTemplateId(id, resolveSlug) && !out.includes(id)) out.push(id);
  }
  return out;
}

/** Slug of a stored strength id (falls back to a neutral full body — never a guessed skill). */
export function slugOfStrengthId(id: string, resolveSlug?: ResolveSlug): string {
  return classifyStrengthId(id, resolveSlug).slug ?? 'full_body';
}

export function existingStrengthDays(
  profile: WeaverInputProfile | null | undefined,
  resolveSlug?: ResolveSlug,
  /** false = template only (a runner adding strength: scheduleDays are their run days). */
  fallbackToScheduleDays = true,
): ExistingStrengthDay[] {
  const template = profile?.lifestyle?.recurringTemplate ?? {};
  const out: ExistingStrengthDay[] = [];
  DAY_LETTERS.forEach((letter, dow) => {
    const ids = (template[letter] ?? []).filter((id) => isStrengthTemplateId(id, resolveSlug));
    if (ids.length) out.push({ dow, slug: slugOfStrengthId(ids[0], resolveSlug), ids });
  });
  if (out.length || !fallbackToScheduleDays) return out;

  // No strength id in the template: lifestyle.scheduleDays (strength ∪ run letters) minus run days.
  const runLetters = new Set(profile?.running?.scheduleDays ?? []);
  const programIds = activeStrengthProgramIds(profile, resolveSlug);
  if (programIds.length === 0) return [];
  const slug = slugOfStrengthId(programIds[0], resolveSlug);
  for (const letter of profile?.lifestyle?.scheduleDays ?? []) {
    const dow = letterIndex(letter);
    if (dow < 0 || runLetters.has(letter) || out.some((d) => d.dow === dow)) continue;
    out.push({ dow, slug, ids: [programIds[0]] });
  }
  return out.sort((a, b) => a.dow - b.dow);
}

/** The plan's usual slot mix for a weekly frequency (only used when no plan week exists). */
export function defaultRunSlots(count: number): RunSlot[] {
  if (count <= 1) return ['easy_run'];
  if (count === 2) return ['quality_primary', 'long_run'];
  if (count === 3) return ['quality_primary', 'easy_run', 'long_run'];
  return ['quality_primary', 'easy_run', 'quality_secondary', 'long_run', ...Array<RunSlot>(Math.max(0, count - 4)).fill('easy_run')];
}

/** Slot of one plan day: slotType when recorded, else long / quality / easy by category. */
export function slotOfRunningDay(day: RunningWeekDay, qualitySeen: number): RunSlot {
  if (day.slotType) return day.slotType;
  if (isLongRunDay(day)) return 'long_run';
  if (isQualityDay(day)) return qualitySeen === 0 ? 'quality_primary' : 'quality_secondary';
  return 'easy_run';
}

export function existingRunDays(profile: WeaverInputProfile | null | undefined, asOfDate: Date): ExistingRunDay[] {
  if (!profile?.running?.isUnlocked) return [];
  const { existingWeek } = buildRunningSide(profile, true, asOfDate);
  const out: ExistingRunDay[] = [];
  let quality = 0;
  for (const day of existingWeek) {
    if (day.category === null) continue;
    const slot = slotOfRunningDay(day, quality);
    if (slot === 'quality_primary' || slot === 'quality_secondary') quality++;
    out.push({ dow: day.dayOfWeek, slot });
  }
  if (out.length) return out;

  const days = (profile.running.scheduleDays ?? []).map(letterIndex).filter((d) => d >= 0);
  if (days.length === 0) return [];
  const rec = recommendRunWeek({
    slots: defaultRunSlots(days.length),
    days,
    level: resolveRunningLevel(profile.running),
    targetDistance: profile.running.generatedProgramTemplate?.targetDistance ?? '5k',
  });
  return rec.days.map((d) => ({ dow: d.dow, slot: d.slot }));
}

/** "HH:MM" or null. */
export function validTime(v: unknown): string | null {
  return typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v) ? v : null;
}

export interface AddTrackTimesProfile {
  lifestyle?: { trainingTime?: unknown; reminders?: { runningTime?: unknown } | null } | null;
}

/**
 * The times the user already gave (asked once, never again here): runs at
 * lifestyle.reminders.runningTime, strength at lifestyle.trainingTime; each falls back to
 * the other, then to the run step's default morning 07:00.
 */
export function knownTimes(profile: AddTrackTimesProfile | null | undefined): { run: string; strength: string } {
  const run = validTime(profile?.lifestyle?.reminders?.runningTime);
  const strength = validTime(profile?.lifestyle?.trainingTime);
  return { run: run ?? strength ?? '07:00', strength: strength ?? run ?? '07:00' };
}

export type { TrainingLevel };
