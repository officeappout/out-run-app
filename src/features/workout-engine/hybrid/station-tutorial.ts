/**
 * station-tutorial — guided-mode first-time tutorial over the station welcome screen (PR-B4).
 *
 * Three coach-mark bubbles, shown ONCE PER USER, guided mode only. Pure decisions + copy here;
 * StationWelcomeScreen renders them with the reusable CoachMarks component. The seen-once flag
 * lives in onboardingPrefs (survives a hard close on native), keyed by uid.
 */
import type { AppGender } from '@/lib/utils/gendered-text';
import { defaultPlayerT, type PlayerT } from './hybrid-t';

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

export function stationTutorialSteps(gender: AppGender | null | undefined, t: PlayerT = defaultPlayerT()): StationTutorialStep[] {
  return [
    { target: COACH_TARGET_START, text: t('hybrid.tutorial.start'), finger: true },
    {
      target: COACH_TARGET_CHIPS,
      text: t('hybrid.tutorial.chips'),
      legend: [
        { icon: 'time', text: t('hybrid.tutorial.legendTime') },
        // No slash forms ("את/ה") — the unspecified gender gets neutral wording (the `other` branch).
        { icon: 'reps', text: t('hybrid.tutorial.legendReps', { gender: gender ?? 'other' }) },
      ],
    },
    // Gender-neutral for everyone (David, 15.10.2026).
    {
      target: COACH_TARGET_SKIP,
      text: t('hybrid.tutorial.skip'),
      legend: [
        { icon: 'pause', text: t('hybrid.tutorial.legendPause') },
        { icon: 'skip', text: t('hybrid.tutorial.legendSkip') },
      ],
    },
  ];
}

/** A step in the one shared tour bubble (title + one line — the 'entry' CoachMarks variant). */
export interface StationTutorialEntryStep {
  target: string;
  title: string;
  text: string;
  finger?: boolean;
}

/**
 * The same three steps in the one tour bubble style (owner 21.10: every tour looks the same —
 * title + one line, no legend rows). Used when the first-run tours are on
 * (enable_onboarding_tutorial_v1 + enable_home_v2) and by the station tour replay; flags off →
 * stationTutorialSteps above, unchanged.
 */
export function stationTutorialEntrySteps(gender: AppGender | null | undefined, t: PlayerT = defaultPlayerT()): StationTutorialEntryStep[] {
  return [
    { target: COACH_TARGET_START, title: t('hybrid.welcome.cta'), text: t('hybrid.tutorial.start'), finger: true },
    {
      target: COACH_TARGET_CHIPS,
      title: t('hybrid.tutorial.entryChipsTitle'),
      text: t('hybrid.tutorial.entryChips', { gender: gender ?? 'other' }),
    },
    { target: COACH_TARGET_SKIP, title: t('hybrid.tutorial.entrySkipTitle'), text: t('hybrid.tutorial.skip') },
  ];
}
