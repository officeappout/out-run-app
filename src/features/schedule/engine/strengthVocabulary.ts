/**
 * Strength vocabulary — ONE mapping from whatever a strength id looks like in a user's
 * data into the schedule taxonomy (ScheduleItemId), plus the leg-load notion R4 / R6b
 * need. Pure: no Firebase, no clock.
 *
 * Why (schedule advisor phase A, bug #3): `lifestyle.recurringTemplate[day]` and
 * `progression.activePrograms[].templateId` do not only hold the schedule taxonomy's own
 * ids (PLANCHE / UPPER_BODY …, written by the onboarding ScheduleStep). Real users also
 * carry the program slugs the generator uses (push / pull / legs / core / full_body …)
 * and raw Firestore program document ids (20-char hashes). The weaver only understood the
 * first kind, so a push/pull/legs user counted ZERO strength days and the seed fell back
 * to an invented UPPER_BODY.
 *
 * A raw Firestore id can only be decoded with the programs collection; callers pass a
 * `resolveSlug` for that (the client's resolveToSlug, the server's loadProgramIndex). With
 * no resolver a hash id stays unknown — never guessed.
 */
import {
  type ScheduleItemId,
  isProgramId,
  isSkillId,
} from '../types/smartSchedule.types';

export type ResolveSlug = (id: string) => string;

/** Program / skill slug (generator space) → schedule taxonomy. */
export const STRENGTH_SLUG_TO_SCHEDULE_ID: Readonly<Record<string, ScheduleItemId>> = {
  // ── skills ──
  planche: 'PLANCHE',
  front_lever: 'FRONT_LEVER',
  hspu: 'HSPU',
  handstand_pushup: 'HSPU',
  oapu: 'OAPU',
  oap: 'OAPU',
  one_arm_pullup: 'OAPU',
  muscle_up: 'MUSCLE_UP',
  handstand: 'HANDSTAND',
  // ── programs ──
  calisthenics_upper: 'UPPER_CALISTHENICS',
  upper_calisthenics: 'UPPER_CALISTHENICS',
  full_body: 'FULL_BODY',
  upper_body: 'UPPER_BODY',
  lower_body: 'LOWER_BODY',
  // ── the four base programs (push / pull / legs / core) ──
  // push / pull / core are upper-body-or-trunk days for placement purposes: no leg load,
  // no skill-specific spacing rule. legs is the lower-body day R4 / R6b read.
  push: 'UPPER_BODY',
  pull: 'UPPER_BODY',
  core: 'UPPER_BODY',
  legs: 'LOWER_BODY',
};

/** Schedule taxonomy → the generator slug it stands for (the Hebrew name lives under that slug). */
const SCHEDULE_ID_TO_SLUG: Readonly<Record<ScheduleItemId, string>> = {
  PLANCHE: 'planche',
  FRONT_LEVER: 'front_lever',
  HSPU: 'hspu',
  OAPU: 'one_arm_pullup',
  MUSCLE_UP: 'muscle_up',
  HANDSTAND: 'handstand',
  UPPER_CALISTHENICS: 'calisthenics_upper',
  FULL_BODY: 'full_body',
  UPPER_BODY: 'upper_body',
  LOWER_BODY: 'lower_body',
};

function normalizeSlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export interface StrengthIdClass {
  /** The schedule taxonomy id, or null when this id is not a strength id we know. */
  scheduleId: ScheduleItemId | null;
  /** Generator-space slug when known (push, legs, planche …). */
  slug: string | null;
}

/**
 * Classifies one stored id. Order: the schedule taxonomy itself → a known slug → the
 * resolver's slug (a raw Firestore id). Anything else (a running template id, an unknown
 * hash with no resolver) is NOT strength.
 */
export function classifyStrengthId(id: string, resolveSlug?: ResolveSlug): StrengthIdClass {
  if (typeof id !== 'string' || !id) return { scheduleId: null, slug: null };
  if (isSkillId(id) || isProgramId(id)) return { scheduleId: id, slug: SCHEDULE_ID_TO_SLUG[id] };
  const direct = STRENGTH_SLUG_TO_SCHEDULE_ID[normalizeSlug(id)];
  if (direct) return { scheduleId: direct, slug: normalizeSlug(id) };
  if (resolveSlug) {
    let resolved: string | null = null;
    try {
      resolved = resolveSlug(id);
    } catch {
      resolved = null;
    }
    if (resolved && resolved !== id) {
      const viaResolver = STRENGTH_SLUG_TO_SCHEDULE_ID[normalizeSlug(resolved)];
      if (viaResolver) return { scheduleId: viaResolver, slug: normalizeSlug(resolved) };
    }
  }
  return { scheduleId: null, slug: null };
}

export function isStrengthTemplateId(id: string, resolveSlug?: ResolveSlug): boolean {
  return classifyStrengthId(id, resolveSlug).scheduleId !== null;
}

/**
 * Strength days in a recurring template (a day counts once however many ids it holds).
 * Returns null when there is no template at all (caller falls back), 0 when a template
 * exists but carries no strength id.
 */
export function countStrengthTemplateDays(
  recurringTemplate: Partial<Record<string, string[] | undefined>> | null | undefined,
  resolveSlug?: ResolveSlug,
): number | null {
  if (!recurringTemplate || typeof recurringTemplate !== 'object') return null;
  let count = 0;
  for (const ids of Object.values(recurringTemplate)) {
    if (Array.isArray(ids) && ids.some((id) => isStrengthTemplateId(id, resolveSlug))) count++;
  }
  return count;
}

/** Only the strength ids of one template day, in stored order. */
export function strengthIdsOfDay(ids: readonly string[] | undefined, resolveSlug?: ResolveSlug): string[] {
  return (ids ?? []).filter((id) => isStrengthTemplateId(id, resolveSlug));
}

// ── Leg load (R4 / R6b) ──────────────────────────────────────────────────────

/**
 * 'heavy' = a dedicated lower-body day (legs / lower_body): R4 / R6b are ERRORs before a
 * quality or long run. 'moderate' = full body (legs are part of it): a WARN only. Upper
 * body, skills and core carry no leg load.
 */
export type LegLoad = 'heavy' | 'moderate' | 'none';

export function legLoadOf(id: ScheduleItemId): LegLoad {
  if (id === 'LOWER_BODY') return 'heavy';
  if (id === 'FULL_BODY') return 'moderate';
  return 'none';
}

/** The strongest leg load among a day's sessions. */
export function dayLegLoad(sessions: ReadonlyArray<{ skillId: ScheduleItemId }>): LegLoad {
  let best: LegLoad = 'none';
  for (const s of sessions) {
    const l = legLoadOf(s.skillId);
    if (l === 'heavy') return 'heavy';
    if (l === 'moderate') best = 'moderate';
  }
  return best;
}

// ── Hebrew names (never an internal id in user text) ────────────────────────

/** Hebrew name of a schedule taxonomy id. Kept here so every surface says the same thing. */
export const SCHEDULE_ID_NAME_HE: Readonly<Record<ScheduleItemId, string>> = {
  PLANCHE: 'פלאנץ׳',
  FRONT_LEVER: 'פרונט לבר',
  HSPU: 'שכיבות סמיכה בעמידת ידיים',
  OAPU: 'מתח ביד אחת',
  MUSCLE_UP: 'עליית כוח',
  HANDSTAND: 'עמידת ידיים',
  UPPER_CALISTHENICS: 'קליסטניקס עליון',
  FULL_BODY: 'כל הגוף',
  UPPER_BODY: 'פלג גוף עליון',
  LOWER_BODY: 'פלג גוף תחתון',
};

export function scheduleIdNameHe(id: ScheduleItemId): string {
  return SCHEDULE_ID_NAME_HE[id];
}
