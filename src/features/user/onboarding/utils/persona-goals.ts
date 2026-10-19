/**
 * Goal chips on the persona screen ("מה המטרות שלך? (עד 2)") and when to ask.
 *
 * 19.10.2026 (owner-approved audit fix §3.1): the goal is already asked at
 * signup — strength users answer program-path ("מה הכי בא לך להשיג?"), runners
 * answer q_run_goal ("מה המטרה שלך?"). A user who finished either signup has
 * the track in the profile, so the persona screen asks persona only. If the
 * goal must still be asked for a run-only user, they get running goals, not
 * the strength-centric list (חיטוב, "מתח, פלאנץ'").
 *
 * Goal ids feed track-mapper.service.ts's GOAL_TO_TRACK — a new id here needs
 * a row there.
 */

import { hasRunningTrack, hasStrengthTrack } from '@/lib/track-ownership';

export interface GoalOption {
  id: string;
  /** Short title for the chips. */
  shortTitleHe: string;
  shortTitleEn: string;
  /** Long description for the mad-libs sentence. */
  longDescHe: string;
  longDescEn: string;
  tag: string;
}

export const GOAL_OPTIONS: GoalOption[] = [
  {
    id: 'routine',
    shortTitleHe: 'שגרה קבועה',
    shortTitleEn: 'Routine',
    longDescHe: 'להתמיד ולבנות שגרה קבועה',
    longDescEn: 'build and maintain a steady routine',
    tag: 'goal_routine',
  },
  {
    id: 'aesthetics',
    shortTitleHe: 'חיטוב ואסתטיקה',
    shortTitleEn: 'Toning',
    longDescHe: 'לבנות גוף חטוב ואסתטי',
    longDescEn: 'build a toned and aesthetic body',
    tag: 'goal_aesthetics',
  },
  {
    id: 'fitness',
    shortTitleHe: 'כושר ובריאות',
    shortTitleEn: 'Health',
    longDescHe: 'לשמור על כושר כללי ובריאות לטווח ארוך',
    longDescEn: 'maintain general fitness and long-term health',
    tag: 'goal_fitness',
  },
  {
    id: 'performance',
    shortTitleHe: 'שיפור ביצועים',
    shortTitleEn: 'Performance',
    longDescHe: 'להשתפר בביצועים בענף הספורט שלי',
    longDescEn: 'improve performance in my sport',
    tag: 'goal_performance',
  },
  {
    id: 'skills',
    shortTitleHe: 'מיומנות מתקדמת',
    shortTitleEn: 'Skills',
    longDescHe: "ללמוד תרגילים מתקדמים (מתח, פלאנץ' וכו')",
    longDescEn: 'learn advanced exercises (pull-ups, planche, etc.)',
    tag: 'goal_skills',
  },
  {
    id: 'community',
    shortTitleHe: 'קהילה',
    shortTitleEn: 'Community',
    longDescHe: 'להכיר שותפים חדשים ולהצטרף לקהילה מקומית',
    longDescEn: 'meet new partners and join a local community',
    tag: 'goal_community',
  },
];

/** Run-only users: running goals (shared ids keep their tags). */
export const RUN_GOAL_OPTIONS: GoalOption[] = [
  {
    id: 'routine',
    shortTitleHe: 'שגרת ריצה קבועה',
    shortTitleEn: 'Running routine',
    longDescHe: 'לרוץ בקביעות ולבנות שגרה',
    longDescEn: 'run regularly and build a routine',
    tag: 'goal_routine',
  },
  {
    id: 'fitness',
    shortTitleHe: 'כושר ובריאות',
    shortTitleEn: 'Health',
    longDescHe: 'לשמור על כושר ובריאות לטווח ארוך',
    longDescEn: 'stay fit and healthy for the long run',
    tag: 'goal_fitness',
  },
  {
    id: 'run_distance',
    shortTitleHe: 'לרוץ רחוק יותר',
    shortTitleEn: 'Run farther',
    longDescHe: 'לרוץ מרחקים ארוכים יותר',
    longDescEn: 'run longer distances',
    tag: 'goal_run_distance',
  },
  {
    id: 'run_pace',
    shortTitleHe: 'לשפר קצב',
    shortTitleEn: 'Run faster',
    longDescHe: 'לשפר את הקצב שלי',
    longDescEn: 'improve my pace',
    tag: 'goal_run_pace',
  },
  {
    id: 'community',
    shortTitleHe: 'קהילה',
    shortTitleEn: 'Community',
    longDescHe: 'להכיר שותפים לריצה ולהצטרף לקהילה מקומית',
    longDescEn: 'meet running partners and join a local community',
    tag: 'goal_community',
  },
];

export const ALL_GOAL_OPTIONS: GoalOption[] = [
  ...GOAL_OPTIONS,
  ...RUN_GOAL_OPTIONS.filter((r) => !GOAL_OPTIONS.some((g) => g.id === r.id)),
];

type GoalProfileInput = Parameters<typeof hasStrengthTrack>[0] & {
  running?: { isUnlocked?: unknown; currentGoal?: unknown } | null;
};

export interface PersonaGoalMode {
  /** False when signup already captured the goal → persona only. */
  askGoals: boolean;
  options: GoalOption[];
}

export function resolvePersonaGoalMode(profile: GoalProfileInput | null | undefined): PersonaGoalMode {
  const strength = hasStrengthTrack(profile);
  const running = hasRunningTrack(profile as { running?: { isUnlocked?: unknown } } | null | undefined);
  const runGoal = profile?.running?.currentGoal;
  const runningGoalCaptured = running && typeof runGoal === 'string' && runGoal.length > 0;
  return {
    askGoals: !(strength || runningGoalCaptured),
    options: running && !strength ? RUN_GOAL_OPTIONS : GOAL_OPTIONS,
  };
}
