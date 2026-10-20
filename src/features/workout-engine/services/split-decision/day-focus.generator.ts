/**
 * Day focus × the home workout generator (enable_home_v2, owner 20.10.2026). Pure.
 *
 * One call from home-workout.service's shared pipeline, after the pool of domains the
 * user's active programs give (resolvedChildDomains) is known. When the caller passes
 * `splitDayFocus` (v2 users only) and the recommended split steers the day, the session
 * is restricted to the focus domains through the EXISTING strict body-area path
 * (requiredDomains + strictDomains — the builder's muscle chips use it today).
 * Off / manual / explicit domains / rest day → null → the generator runs exactly as before.
 */
import { recommendedSplitOfProfile, type SplitProfileSlice } from '@/features/schedule/recommendation-policy/splitOfProfile';
import type { ResolveSlug } from '@/features/schedule/engine/strengthVocabulary';
import {
  dayFocusOf,
  resolveDayFocus,
  strengthDayIndexOf,
  strengthDayLettersOf,
  type DayFocus,
  type ResolvedDayFocus,
} from './day-focus.utils';

export interface GeneratorDayFocusInput {
  /** HomeWorkoutOptions.splitDayFocus — the caller's enable_home_v2. */
  enabled: boolean | undefined;
  profile: (SplitProfileSlice & {
    lifestyle?: {
      scheduleDays?: ReadonlyArray<string> | null;
      recurringTemplate?: Partial<Record<string, ReadonlyArray<string> | undefined>> | null;
    } | null;
  }) | null | undefined;
  /** ISO date being generated (defaults to today). */
  selectedDate: string | undefined;
  /** The domains the active programs give for this day (resolvedChildDomains). */
  pool: readonly string[];
  isManualOverride?: boolean;
  /** The caller already asked for specific domains (builder chips / AI). */
  hasExplicitDomains?: boolean;
  isRestDay?: boolean;
  resolveSlug?: ResolveSlug;
  now?: Date;
}

export function resolveGeneratorDayFocus(i: GeneratorDayFocusInput): ResolvedDayFocus | null {
  if (!i.enabled || i.isManualOverride || i.hasExplicitDomains || i.isRestDay || !i.profile) return null;
  try {
    const letters = strengthDayLettersOf(i.profile.lifestyle, i.resolveSlug);
    if (letters.length === 0) return null;
    const date = i.selectedDate ?? (i.now ?? new Date()).toISOString().slice(0, 10);
    const index = strengthDayIndexOf(date, letters);
    if (index < 0) return null;
    const split = recommendedSplitOfProfile(i.profile, letters.length, i.now);
    return resolveDayFocus(dayFocusOf(split, index), i.pool);
  } catch {
    return null;
  }
}

/** Stamps the focus on every option's workout (the card title reads it). No focus → untouched. */
export function stampDayFocus<T extends { options: ReadonlyArray<{ result: { workout: { dayFocus?: DayFocus } } }> }>(
  trio: T,
  focus: DayFocus | null | undefined,
): T {
  if (!focus) return trio;
  for (const o of trio.options) o.result.workout.dayFocus = focus;
  return trio;
}
