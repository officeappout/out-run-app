/**
 * station-tutorial — guided-mode first-time tutorial over the station welcome screen (PR-B4).
 *
 * Three coach-mark bubbles, shown ONCE PER USER, guided mode only. Pure decisions + copy here;
 * StationWelcomeScreen renders them with the reusable CoachMarks component. The seen-once flag
 * lives in onboardingPrefs (survives a hard close on native), keyed by uid.
 */
import { g, type AppGender } from '@/lib/utils/gendered-text';

/** Coach-mark target ids (`data-coach="…"` on the welcome screen / station layer). */
export const COACH_TARGET_START = 'station-start';
export const COACH_TARGET_CHIPS = 'station-chip';
export const COACH_TARGET_SKIP = 'station-skip';

/** onboardingPrefs key for "this user has seen the station tutorial". */
export function stationTutorialSeenKey(uid: string | null | undefined): string {
  return `guided_station_tutorial_seen:${uid || 'anon'}`;
}

/** Show the tutorial? Guided mode only, and only until the user has seen (or skipped) it. */
export function shouldShowStationTutorial(guided: boolean, seenValue: string | null | undefined): boolean {
  return guided && !seenValue;
}

export interface StationTutorialStep {
  target: string;
  text: string;
  /** CSS tapping finger on the target. */
  finger?: boolean;
}

export function stationTutorialSteps(gender: AppGender | null | undefined): StationTutorialStep[] {
  return [
    { target: COACH_TARGET_START, text: 'כשמוכנים, לוחצים כאן', finger: true },
    {
      target: COACH_TARGET_CHIPS,
      text: g(
        gender,
        '⏱ = על זמן, אנחנו סופרים · 🔁 = על חזרות, אתה סופר ולוחץ סיימתי',
        '⏱ = על זמן, אנחנו סופרים · 🔁 = על חזרות, את סופרת ולוחצת סיימתי',
        '⏱ = על זמן, אנחנו סופרים · 🔁 = על חזרות, את/ה סופר/ת ולוחץ/ת סיימתי',
      ),
    },
    {
      target: COACH_TARGET_SKIP,
      text: g(
        gender,
        '⏸ בכל רגע תוכל לעצור, ⏭ ולדלג על תרגיל או על כל התחנה',
        '⏸ בכל רגע תוכלי לעצור, ⏭ ולדלג על תרגיל או על כל התחנה',
        '⏸ בכל רגע אפשר לעצור, ⏭ ולדלג על תרגיל או על כל התחנה',
      ),
    },
  ];
}
