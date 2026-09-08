import type { WorkoutCategory } from '@/features/workout-engine/core/types/running.types';

/**
 * Single source of truth for a running workout category's Hebrew label —
 * extracted (05.09.2026) because 5 independent files each hand-maintained
 * their own copy (SmartWeeklySchedule.tsx, AgendaDayCard.tsx,
 * NextRunWorkoutCard.tsx, running-metadata.service.ts, branding.utils.ts),
 * all loosely typed as `Record<string, string>` instead of
 * `Record<WorkoutCategory, string>` — so none of them were ever checked
 * against the canonical `WorkoutCategory` union (running.types.ts) by the
 * compiler. All 5 agreed with each other on values, but all 5 also carried
 * a 12th key, `recovery`, that isn't a member of `WorkoutCategory` at all —
 * confirmed (05.09.2026) via a repo-wide grep for any writer that sets a
 * running category to `'recovery'` or any consumer that checks for it:
 * zero hits. `'recovery'` is a real value of the unrelated `RunZoneType`
 * (pace-zone, not category) and of `WeekSlot.slotType` — never of
 * `WorkoutCategory` — so it never had a live entry to label in the first
 * place; keeping it here would still be a real 12th key nothing produces.
 *
 * Typed as `Record<WorkoutCategory, string>` so the compiler forces
 * coverage of exactly the 11 real categories, no more, no less — adding a
 * category to `running.types.ts` without updating this file is now a type
 * error instead of a silent missing label.
 *
 * Deliberately just the lookup table — each of the 5 call sites keeps its
 * own existing fallback/wrapper logic around it (some fall back to the raw
 * category string for an unrecognized value, one falls back to a fixed
 * generic phrase, one falls back to `undefined`) rather than being unified
 * here, since those differ per site and changing them would be a real
 * behavior change, not a dedup.
 */
export const RUNNING_WORKOUT_CATEGORY_LABELS_HE: Record<WorkoutCategory, string> = {
  easy_run: 'ריצה קלה',
  long_run: 'ריצה ארוכה',
  short_intervals: 'אינטרוולים קצרים',
  long_intervals: 'אינטרוולים ארוכים',
  fartlek_easy: 'פארטלק קל',
  fartlek_structured: 'פארטלק מובנה',
  tempo: 'ריצת טמפו',
  hill_long: 'עליות ארוכות',
  hill_short: 'עליות קצרות',
  hill_sprints: 'ספרינט עליות',
  strides: 'סטריידים',
};
