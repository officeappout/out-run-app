/**
 * Gendered copy — one rule for the whole app (owner decisions 21.10.2026,
 * docs/copy/GENDER-INVENTORY.md §9):
 *
 *   male   → the masculine form
 *   female → the feminine form
 *   other  → NEUTRAL (unknown gender, or the user chose "other"). Never the masculine form,
 *            never a slash form. Usually plural/"we" ("נסו שוב", "יוצאים לאימון", "בואו…").
 *
 * The same rule holds in the catalogs: a `{gender, select, …}` message spells out
 * `male {…}` and keeps `other {…}` neutral (see __tests__/gender-select-rule.test.ts).
 * In code that is not extracted yet, use pickGendered() with the gender from useUiGender()
 * (client) or a neutral string when the gender is not known at all (server, services).
 *
 * The gender itself is resolved once, in LocaleSync: the profile's core.gender, or
 * during onboarding the gender picked on the identity screen (resolveUiGender below).
 */
import { genderArg, type Gender } from './core/i18n-core';

export interface GenderedText {
  male: string;
  female: string;
  /** Neutral: what a user of unknown / "other" gender sees. */
  other: string;
}

/** Picks the form for `gender` (anything that is not 'male' | 'female' reads `other`). */
export function pickGendered(gender: unknown, text: GenderedText): string {
  return text[genderArg(gender)];
}

/** sessionStorage key the onboarding identity screen writes the picked gender to. */
export const ONBOARDING_GENDER_KEY = 'onboarding_personal_gender';

/**
 * The gender t() and pickGendered() use. The profile wins as soon as it holds a gender
 * (including an explicit 'other'); before that — onboarding, where the gender lives only in
 * sessionStorage until the profile is saved — the onboarding pick is used.
 */
export function resolveUiGender(profileGender: unknown, onboardingGender: unknown): Gender {
  if (typeof profileGender === 'string' && profileGender !== '') return genderArg(profileGender);
  return genderArg(onboardingGender);
}

/** Reads the onboarding pick; null on the server or when storage is blocked. */
export function readOnboardingGender(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(ONBOARDING_GENDER_KEY);
  } catch {
    return null;
  }
}

/** Event LocaleSync listens to, for a writer that wants the new gender applied at once. */
export const ONBOARDING_GENDER_EVENT = 'out:onboarding-gender';

/**
 * Copy shared by several screens. Hebrew only on purpose: these strings live in code that
 * is not extracted to a catalog yet; a later extraction PR moves them as they are.
 */
export const GENDERED_COPY = {
  startWorkout: { male: 'התחל אימון', female: 'התחילי אימון', other: 'יוצאים לאימון' },
  resumeWorkout: { male: 'המשך אימון', female: 'המשיכי אימון', other: 'ממשיכים באימון' },
  pauseWorkout: { male: 'השהה אימון', female: 'השהי אימון', other: 'השהיית אימון' },
  stopWorkout: { male: 'הפסק אימון', female: 'הפסיקי אימון', other: 'הפסקת אימון' },
  retry: { male: 'נסה שוב', female: 'נסי שוב', other: 'נסו שוב' },
  retryLater: { male: 'נסה שוב מאוחר יותר', female: 'נסי שוב מאוחר יותר', other: 'נסו שוב מאוחר יותר' },
} as const satisfies Record<string, GenderedText>;
