/**
 * Recurring day — what the user's recurring template plans for ONE date.
 *
 * The ONE rule set behind:
 *   - the client hydrate (services/userSchedule.service.ts hydrateFromTemplate),
 *     which WRITES a userSchedule day doc the first time the app shows a day;
 *   - the server training reminder (functions/src/trainingReminderScheduler.ts),
 *     which computes today's planned sessions VIRTUALLY (nothing written) for
 *     a user who has no day doc yet — the reminder must not depend on the
 *     user having opened that day in the app (push-lifecycle audit, gap 4).
 * Cloud Functions read it via functions/src/shared/recurring-day.core.ts, a
 * committed byte-for-byte mirror that functions/scripts/vendor-copy-geo-discovery.js
 * rewrites on every functions build (a root vitest pins it).
 *
 * KEEP THIS FILE IMPORT-FREE AND PURE: it is mirrored into Cloud Functions.
 */

/** Sunday-first Hebrew day letters, the keys of lifestyle.recurringTemplate. */
export const RECURRING_DAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'] as const;

/** Start time of a template-generated session when the user set no time. */
export const DEFAULT_RECURRING_START_TIME = '07:00';

export type RecurringTemplateLike = Partial<Record<string, string[] | null | undefined>>;

export interface RecurringReminderTimes {
  runningTime?: string | null;
  strengthTime?: string | null;
}

/** The category a template session is (the reminder's @אימון label). */
export type RecurringSessionCategory = 'strength' | 'cardio';

export interface RecurringSession {
  programId: string;
  startTime: string;
  category: RecurringSessionCategory;
}

export type RecurringDayPlan =
  | { kind: 'none' } // the weekday is not in the template (nothing planned)
  | { kind: 'rest' } // the template marks the weekday as rest (empty list)
  | { kind: 'training'; sessions: RecurringSession[] };

/** Minimal shape of an existing userSchedule entry (client type or raw Firestore map). */
export interface RecurringExistingEntry {
  type?: unknown;
  source?: unknown;
  override?: unknown;
}

/** 'YYYY-MM-DD' → its Hebrew day letter. Calendar arithmetic only (noon UTC), no time zone. */
export function dayLetterOfDateKey(dateKey: string): string {
  return RECURRING_DAY_LETTERS[new Date(`${dateKey}T12:00:00Z`).getUTCDay()];
}

/**
 * Start time of a template session. Template sessions are strength-program
 * assignments (and the running bridge's own id), so strengthTime wins, then
 * runningTime, then 07:00 — exactly hydrateFromTemplate's rule since 05.10.
 */
export function recurringStartTime(reminders?: RecurringReminderTimes | null): string {
  const s = reminders?.strengthTime;
  if (typeof s === 'string' && s) return s;
  const r = reminders?.runningTime;
  if (typeof r === 'string' && r) return r;
  return DEFAULT_RECURRING_START_TIME;
}

/** What the template plans for `dateKey` (ignores any existing day doc — see templateSessionsToMaterialize). */
export function recurringDayPlan(
  template: RecurringTemplateLike | null | undefined,
  dateKey: string,
  reminders?: RecurringReminderTimes | null,
  /**
   * users/{uid}.running.activeProgram.programId — the running bridge seeds the
   * running days with this id, so a session with it is a run ('cardio').
   */
  runningProgramId?: string | null,
): RecurringDayPlan {
  const ids = template?.[dayLetterOfDateKey(dateKey)];
  if (!Array.isArray(ids)) return { kind: 'none' };
  const programIds = ids.filter((x): x is string => typeof x === 'string' && x.length > 0);
  if (programIds.length === 0) return { kind: 'rest' };
  const startTime = recurringStartTime(reminders);
  return {
    kind: 'training',
    sessions: programIds.map((programId) => ({
      programId,
      startTime,
      category: runningProgramId && programId === runningProgramId ? 'cardio' : 'strength',
    })),
  };
}

/**
 * hydrateFromTemplate's guard on an existing day doc: a user's explicit
 * override or manual rest blocks the template for that date, and a day that
 * already holds recurring entries was hydrated before.
 */
export function existingDayBlocksTemplate(entries: ReadonlyArray<RecurringExistingEntry> | null | undefined): boolean {
  if (!entries || entries.length === 0) return false;
  return entries.some(
    (e) => e?.override === true || (e?.type === 'rest' && e?.source !== 'recurring') || e?.source === 'recurring',
  );
}

/**
 * The template sessions that are planned for `dateKey` but not in the day
 * doc yet (`existingEntries` = that doc's entries, or null when there is no
 * doc). Empty when the doc blocks the template, the weekday is rest, or the
 * template has nothing for it.
 */
export function templateSessionsToMaterialize(
  template: RecurringTemplateLike | null | undefined,
  dateKey: string,
  existingEntries: ReadonlyArray<RecurringExistingEntry> | null | undefined,
  reminders?: RecurringReminderTimes | null,
  runningProgramId?: string | null,
): RecurringSession[] {
  if (existingDayBlocksTemplate(existingEntries)) return [];
  const plan = recurringDayPlan(template, dateKey, reminders, runningProgramId);
  return plan.kind === 'training' ? plan.sessions : [];
}
