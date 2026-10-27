/**
 * Daily cards (engine-combination-rules.md §3, boards WeekPlan / WeekPlanPro / HomeToday): a day is a
 * row of cards scrolled sideways: workout(s), the daily steps goal, a short optional session.
 * Data-only props: the caller resolves the copy (t()) and the numbers; these components only draw.
 * Used by the schedule tutorial week (ל4) and the home "today" cards.
 */

/** 'row' = a day row of the week (ל4); 'home' = the bigger home today cards (board HomeToday). */
export type DayCardSize = 'row' | 'home';

export type TimeTone = 'morning' | 'noon' | 'evening' | 'run';

export interface WorkoutCardData {
  tone: 'strength' | 'run';
  title: string;
  subtitle?: string;
  /** "HH:MM", drawn dir="ltr". */
  time?: string;
  timeTone?: TimeTone;
  /** A public asset path (e.g. /icons/programs/full_body.svg). */
  iconSrc?: string;
  done?: boolean;
}

export interface StepsCardData {
  /** "8,000 צעדים", already formatted. */
  goalLabel: string;
  /** "2,400 עד עכשיו" / "יום תנועה". */
  subtitle?: string;
  /** 0-100. 100 = the ring shows a check. */
  pct: number;
}

export interface OptionalCardData {
  title: string;
  /** "רשות" / "התאוששות". */
  subtitle: string;
  /** A public asset path; absent = the mobility glyph. */
  iconSrc?: string;
  done?: boolean;
}
