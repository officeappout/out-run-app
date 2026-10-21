/**
 * guided-station — the "ליווי צעד-אחר-צעד" (guided) layer of a hybrid station (PR-B1).
 *
 * One station flow; the guided layer adds screens/copy on top of it. Fast mode = exactly
 * today's production behaviour (after PR-A). Pure, I/O-free (node-only vitest covers it);
 * the Firestore writes live in guided-station.service.ts.
 *
 * Persistence: users/{uid}.settings.* — the same map SettingsModal's debounced writer uses.
 *   settings.guidedStation            boolean | absent  — the user's explicit choice (absent = default ON)
 *   settings.guidedStationsCompleted  number  | absent  — stations COMPLETED in guided mode (starts at 0, no backfill)
 *   settings.guidedFastPromptAsked    boolean | absent  — "כבר הבנת? לעבור למצב מהיר" was shown once
 */
import { g, type AppGender } from '@/lib/utils/gendered-text';

export const GUIDED_SETTING_KEY = 'settings.guidedStation';
export const GUIDED_COMPLETED_COUNT_KEY = 'settings.guidedStationsCompleted';
export const GUIDED_FAST_PROMPT_ASKED_KEY = 'settings.guidedFastPromptAsked';

/** Completed guided stations after which the switch-to-fast prompt is offered (once). */
export const FAST_PROMPT_AFTER_STATIONS = 2;

export interface GuidedSettings {
  /** The user's explicit choice; undefined = never set → default ON. */
  guidedStation: boolean | undefined;
  guidedStationsCompleted: number;
  guidedFastPromptAsked: boolean;
}

/** Read the guided fields off a user profile (the doc's `settings` map). Field-guarded. */
export function readGuidedSettings(profile: unknown): GuidedSettings {
  const settings = (profile as { settings?: Record<string, unknown> } | null | undefined)?.settings;
  const choice = settings?.guidedStation;
  const count = settings?.guidedStationsCompleted;
  return {
    guidedStation: typeof choice === 'boolean' ? choice : undefined,
    guidedStationsCompleted: typeof count === 'number' && Number.isFinite(count) ? Math.max(0, count) : 0,
    guidedFastPromptAsked: settings?.guidedFastPromptAsked === true,
  };
}

/**
 * Is the guided layer on for this station? Kill-switch off → fast mode for everyone.
 * Otherwise the user's explicit choice wins; unset → ON (the default for everyone).
 */
export function resolveGuidedMode(userChoice: boolean | undefined, killSwitchEnabled: boolean): boolean {
  if (!killSwitchEnabled) return false;
  return userChoice ?? true;
}

/** A station counts as COMPLETED (not skipped / not an empty early exit) when ≥1 set was logged. */
export function isCompletedStation(log: ReadonlyArray<{ confirmedReps?: readonly unknown[] }> | undefined): boolean {
  return (log ?? []).some((e) => (e.confirmedReps?.length ?? 0) > 0);
}

/**
 * Show "כבר הבנת? לעבור למצב מהיר" on the station-complete screen? Guided users only, once
 * ever (asked flag), from the 2nd completed guided station on (the count INCLUDES the station
 * just finished). ≥ rather than === so a 2nd station that happened to be the final one (no
 * completion screen) still gets the prompt at the next opportunity.
 */
export function shouldShowFastPrompt(guided: boolean, completedCount: number, alreadyAsked: boolean): boolean {
  return guided && !alreadyAsked && completedCount >= FAST_PROMPT_AFTER_STATIONS;
}

/** Guidance line under the exercise (guided only). Reps: gendered; timed: neutral. */
export function guidanceLine(kind: 'reps' | 'time', gender: AppGender | null | undefined, reps?: string | number): string {
  if (kind === 'time') return 'ממשיכים עד שהטיימר נגמר';
  const x = reps != null && String(reps).trim() !== '' ? `${reps} ` : '';
  return g(gender, `עשה ${x}חזרות בקצב שלך, ואז לחץ סיימתי`, `עשי ${x}חזרות בקצב שלך, ואז לחצי סיימתי`);
}

/** Welcome-screen greeting (guided only). "הגעת" is spelled the same for both genders. */
export const WELCOME_GREETING = 'כל הכבוד, הגעת!';

/** Welcome-screen CTA (guided only) — one neutral form for everyone (owner gender decisions:
 *  buttons use neutral / noun forms, not "בוא/בואי נתחיל"). `gender` kept for call-site parity. */
export function welcomeCta(_gender?: AppGender | null): string {
  return 'מתחילים';
}

/** Welcome-screen type chip: Timer ("זמן") for time-based / tabata exercises, Repeat ("חזרות") for rep-counted ones. */
export function exerciseTypeChip(
  ex: { exerciseType?: 'reps' | 'time'; isTimeBased?: boolean },
  inTabata: boolean,
): 'time' | 'reps' {
  return inTabata || ex.exerciseType === 'time' || ex.isTimeBased === true ? 'time' : 'reps';
}
