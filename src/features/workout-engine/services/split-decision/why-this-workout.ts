/**
 * "Why this workout" — one short Hebrew reason line for the workout overview
 * (enable_home_v2, owner 20.10.2026). Pure.
 *
 *   top-up (complementary sets)  → "השלמת סטים · נשארו 4"
 *   upper / pull day, no pull gear → "אין מתח בבית — דחיפה + ליבה"
 *                                    ("… משיכה בלי ציוד במקום מתח" when a gear-free pull was swapped in)
 *   a steered split day          → "היום יום עליון בתוכנית עליון / תחתון · 4 ימים בשבוע"
 *   full body                    → "יום כל הגוף · 3 ימים בשבוע"
 *   nothing to say               → null (the overview shows no line)
 */
import { DAY_FOCUS_HE, strengthDayLettersOf, type DayFocus } from './day-focus.utils';
import { recommendedSplitOfProfile, type SplitProfileSlice } from '@/features/schedule/recommendation-policy/splitOfProfile';
import { RECOMMENDATION_POLICY } from '@/features/schedule/recommendation-policy/policy.config';
import type { ResolveSlug } from '@/features/schedule/engine/strengthVocabulary';

/** How an upper / pull day without pull equipment was balanced (logic/pull-gap.utils.ts). */
export type PullGapMode = 'bodyweight_pull' | 'core' | 'push_only';

export interface WhyThisWorkoutInput {
  /** The day's focus (GeneratedWorkout.dayFocus). */
  focus?: DayFocus | null;
  /** The recommended split's Hebrew name ("עליון / תחתון"). */
  splitHe?: string | null;
  /** Strength days in the user's week. */
  strengthDaysPerWeek?: number | null;
  /** Set when the day wanted pulling but the user has no pull equipment (GeneratedWorkout.pullGap). */
  pullGap?: PullGapMode | null;
  /** false → "אין מתח כאן" (park / office) instead of "אין מתח בבית". Default home. */
  atHome?: boolean;
  /** Complementary-sets workout: sets still missing today. */
  topUpRemainingSets?: number | null;
}

const daysPart = (n: number | null | undefined): string =>
  typeof n === 'number' && n > 0 ? (n === 1 ? ' · יום אחד בשבוע' : ` · ${Math.round(n)} ימים בשבוע`) : '';

export function whyThisWorkoutHe(i: WhyThisWorkoutInput): string | null {
  const top = typeof i.topUpRemainingSets === 'number' ? Math.round(i.topUpRemainingSets) : 0;
  if (top > 0) return top === 1 ? 'השלמת סטים · נשאר סט אחד' : `השלמת סטים · נשארו ${top}`;

  if (i.pullGap && (i.focus === 'upper' || i.focus === 'pull' || i.focus === 'full' || !i.focus)) {
    const none = i.atHome === false ? 'אין מתח כאן' : 'אין מתח בבית';
    if (i.pullGap === 'bodyweight_pull') return `${none} — משיכה בלי ציוד במקום מתח`;
    return i.pullGap === 'core' ? `${none} — דחיפה + ליבה` : `${none} — היום בעיקר דחיפה`;
  }

  if (!i.focus) return null;
  if (i.focus === 'full') return `יום כל הגוף${daysPart(i.strengthDaysPerWeek)}`;
  const split = i.splitHe?.trim();
  const base = `היום יום ${DAY_FOCUS_HE[i.focus]}`;
  return split ? `${base} בתוכנית ${split}${daysPart(i.strengthDaysPerWeek)}` : `${base}${daysPart(i.strengthDaysPerWeek)}`;
}

/** The profile fields the workout-level helper reads (UserFullProfile satisfies it). */
export type WhyProfileSlice = SplitProfileSlice & {
  lifestyle?: {
    scheduleDays?: ReadonlyArray<string> | null;
    recurringTemplate?: Partial<Record<string, ReadonlyArray<string> | undefined>> | null;
  } | null;
};

/**
 * The line for a generated workout: its stamped dayFocus / pullGap + the user's
 * recommended split and strength days (the same answer the generator used). Pure.
 */
export function whyLineOfWorkout(i: {
  workout: { dayFocus?: DayFocus; pullGap?: PullGapMode } | null | undefined;
  profile: WhyProfileSlice | null | undefined;
  location?: string | null;
  resolveSlug?: ResolveSlug;
  now?: Date;
}): string | null {
  const w = i.workout;
  if (!w || (!w.dayFocus && !w.pullGap)) return null;
  let splitHe: string | null = null;
  let days: number | null = null;
  try {
    const letters = strengthDayLettersOf(i.profile?.lifestyle, i.resolveSlug);
    days = letters.length || null;
    const split = days ? recommendedSplitOfProfile(i.profile, days, i.now) : null;
    splitHe = split ? RECOMMENDATION_POLICY.splitNamesHe[split] ?? null : null;
  } catch {
    /* the line degrades to the focus alone */
  }
  return whyThisWorkoutHe({
    focus: w.dayFocus ?? null,
    splitHe,
    strengthDaysPerWeek: days,
    pullGap: w.pullGap ?? null,
    atHome: !i.location || i.location === 'home',
  });
}
