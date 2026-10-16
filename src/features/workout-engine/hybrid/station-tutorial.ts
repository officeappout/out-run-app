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

/** Icon keys for a bubble's legend — StationWelcomeScreen maps them to the lucide icons the
 *  chips / player show (no emoji in copy: design language v2 §6). */
export type StationTutorialIcon = 'time' | 'reps' | 'pause' | 'skip';

export interface StationTutorialStep {
  target: string;
  text: string;
  /** CSS tapping finger on the target. */
  finger?: boolean;
  /** Icon + text rows under the bubble text (rendered with the real icons, not glyphs in copy). */
  legend?: { icon: StationTutorialIcon; text: string }[];
}

export function stationTutorialSteps(gender: AppGender | null | undefined): StationTutorialStep[] {
  return [
    { target: COACH_TARGET_START, text: 'כשמוכנים, לוחצים כאן', finger: true },
    {
      target: COACH_TARGET_CHIPS,
      text: 'כל תרגיל מסומן לפי הסוג שלו',
      legend: [
        { icon: 'time', text: 'זמן: אנחנו סופרים' },
        {
          icon: 'reps',
          text: g(
            gender,
            'חזרות: אתה סופר ולוחץ סיימתי',
            'חזרות: את סופרת ולוחצת סיימתי',
            // No slash forms ("את/ה") — the unspecified gender gets neutral wording.
            'חזרות: סופרים ולוחצים סיימתי',
          ),
        },
      ],
    },
    // Gender-neutral for everyone (David, 15.10.2026).
    {
      target: COACH_TARGET_SKIP,
      text: 'בכל רגע אפשר לעצור או לדלג על תרגיל או על כל התחנה',
      legend: [
        { icon: 'pause', text: 'עצירה' },
        { icon: 'skip', text: 'דילוג' },
      ],
    },
  ];
}
