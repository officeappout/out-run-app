/**
 * The lifestyle fields LifestyleWizard's final submit writes to users/{uid}
 * (19.10.2026, owner-approved audit fix — audit-lifestyle-wizard.md §3.5/§3.6).
 *
 * The rule: write only what the user actually answered in THIS wizard session.
 *
 * - `lifestyle.scheduleDays` — only when the user finished the strength
 *   schedule screen (ScheduleStep) in this session. The running screen saves
 *   its own days (completeRunningScheduleFirstChoice merges them into
 *   lifestyle.scheduleDays itself), so the running branch never writes them
 *   here. Before this fix the submit always wrote the in-memory onboarding
 *   store's value, which is [] in a later session or the signup's stale
 *   default right after signup — a dual-track user could lose strength days.
 *   When written, the user's running days are kept (union), never dropped.
 * - `lifestyle.trainingHistory` — only when the history question was answered
 *   (it used to be written as 'none' for every runner, who is never asked).
 * - `settings.calendarSync` — only when the user saw the toggle (strength
 *   schedule screen). It used to default to true for runners, who never see it.
 * - `lifestyle.lifestyleTags` — persona (+ goal) tags from this session. When
 *   the goal question was skipped (goal already captured at signup), the
 *   profile's existing goal_* tags are kept instead of being wiped.
 *
 * Pure — no Firebase. The component adds personas/timestamps/status fields.
 */

export interface LifestyleWizardFinalWriteInput {
  /** True only when ScheduleStep's Continue ran in this wizard session. */
  strengthScheduleEdited: boolean;
  /** Days from the onboarding store (ScheduleStep's choice). */
  editedScheduleDays: string[] | undefined;
  /** ScheduleStep's history answer ('' / undefined = not answered). */
  historyFrequency: string | undefined;
  /** ScheduleStep's calendar toggle value (only meaningful when edited). */
  calendarSyncEnabled: boolean | undefined;
  /**
   * enable_home_v2: the shared reminders step showed its calendar toggle in
   * THIS session (any track) — its value is then written even when the
   * strength schedule screen was not shown. Flag off never sets it.
   */
  calendarSyncAnswered?: boolean;
  /** Persona + goal tags collected in this session. */
  sessionLifestyleTags: string[] | undefined;
  /** True when the goal question was not shown (captured at signup). */
  goalsSkipped: boolean;
  /** The profile's current values (may be stale; only used to keep data). */
  existingLifestyleTags: string[] | undefined;
  existingRunningScheduleDays: string[] | undefined;
}

export interface LifestyleWizardFinalWrite {
  lifestyle: {
    lifestyleTags: string[];
    trainingHistory?: string;
    scheduleDays?: string[];
  };
  settings?: { calendarSync: boolean };
}

const VALID_HISTORY = new Set(['none', '1-2', '3+']);

const DAY_ORDER = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

function uniq(list: string[]): string[] {
  return Array.from(new Set(list));
}

/** Unique Hebrew day letters in week order (unknown values kept, at the end). */
function mergeDays(list: string[]): string[] {
  const rank = (d: string) => {
    const i = DAY_ORDER.indexOf(d);
    return i === -1 ? DAY_ORDER.length : i;
  };
  return uniq(list).sort((a, b) => rank(a) - rank(b));
}

export function buildLifestyleWizardFinalWrite(
  input: LifestyleWizardFinalWriteInput,
): LifestyleWizardFinalWrite {
  const sessionTags = Array.isArray(input.sessionLifestyleTags) ? input.sessionLifestyleTags : [];
  const keptGoalTags =
    input.goalsSkipped && !sessionTags.some((t) => t.startsWith('goal_'))
      ? (input.existingLifestyleTags ?? []).filter((t) => typeof t === 'string' && t.startsWith('goal_'))
      : [];

  const out: LifestyleWizardFinalWrite = {
    lifestyle: { lifestyleTags: uniq([...sessionTags, ...keptGoalTags]) },
  };

  if (input.calendarSyncAnswered && typeof input.calendarSyncEnabled === 'boolean') {
    out.settings = { calendarSync: input.calendarSyncEnabled };
  }

  if (!input.strengthScheduleEdited) return out;

  const edited = Array.isArray(input.editedScheduleDays) ? input.editedScheduleDays : [];
  // An empty edit is not a choice (ScheduleStep can't continue with 0 days) —
  // never let it erase what's stored.
  if (edited.length > 0) {
    const runningDays = Array.isArray(input.existingRunningScheduleDays) ? input.existingRunningScheduleDays : [];
    out.lifestyle.scheduleDays = mergeDays([...edited, ...runningDays]);
  }
  if (input.historyFrequency && VALID_HISTORY.has(input.historyFrequency)) {
    out.lifestyle.trainingHistory = input.historyFrequency;
  }
  if (typeof input.calendarSyncEnabled === 'boolean') {
    out.settings = { calendarSync: input.calendarSyncEnabled };
  }
  return out;
}
