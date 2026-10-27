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
import { makeT } from '@/lib/i18n/t';
import { onboarding } from '@/messages/ns/onboarding';

const t = makeT('he', onboarding);

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
    shortTitleHe: t('goals.routine.short'),
    shortTitleEn: 'Routine',
    longDescHe: t('goals.routine.long'),
    longDescEn: 'build and maintain a steady routine',
    tag: 'goal_routine',
  },
  {
    id: 'aesthetics',
    shortTitleHe: t('goals.aesthetics.short'),
    shortTitleEn: 'Toning',
    longDescHe: t('goals.aesthetics.long'),
    longDescEn: 'build a toned and aesthetic body',
    tag: 'goal_aesthetics',
  },
  {
    id: 'fitness',
    shortTitleHe: t('goals.fitness.short'),
    shortTitleEn: 'Health',
    longDescHe: t('goals.fitness.long'),
    longDescEn: 'maintain general fitness and long-term health',
    tag: 'goal_fitness',
  },
  {
    id: 'performance',
    shortTitleHe: t('goals.performance.short'),
    shortTitleEn: 'Performance',
    longDescHe: t('goals.performance.long'),
    longDescEn: 'improve performance in my sport',
    tag: 'goal_performance',
  },
  {
    id: 'skills',
    shortTitleHe: t('goals.skills.short'),
    shortTitleEn: 'Skills',
    longDescHe: t('goals.skills.long'),
    longDescEn: 'learn advanced exercises (pull-ups, planche, etc.)',
    tag: 'goal_skills',
  },
  {
    id: 'community',
    shortTitleHe: t('goals.community.short'),
    shortTitleEn: 'Community',
    longDescHe: t('goals.community.long'),
    longDescEn: 'meet new partners and join a local community',
    tag: 'goal_community',
  },
];

/** Run-only users: running goals (shared ids keep their tags). */
export const RUN_GOAL_OPTIONS: GoalOption[] = [
  {
    id: 'routine',
    shortTitleHe: t('goals.runRoutine.short'),
    shortTitleEn: 'Running routine',
    longDescHe: t('goals.runRoutine.long'),
    longDescEn: 'run regularly and build a routine',
    tag: 'goal_routine',
  },
  {
    id: 'fitness',
    shortTitleHe: t('goals.fitness.short'),
    shortTitleEn: 'Health',
    longDescHe: t('goals.runFitness.long'),
    longDescEn: 'stay fit and healthy for the long run',
    tag: 'goal_fitness',
  },
  {
    id: 'run_distance',
    shortTitleHe: t('goals.runDistance.short'),
    shortTitleEn: 'Run farther',
    longDescHe: t('goals.runDistance.long'),
    longDescEn: 'run longer distances',
    tag: 'goal_run_distance',
  },
  {
    id: 'run_pace',
    shortTitleHe: t('goals.runPace.short'),
    shortTitleEn: 'Run faster',
    longDescHe: t('goals.runPace.long'),
    longDescEn: 'improve my pace',
    tag: 'goal_run_pace',
  },
  {
    id: 'community',
    shortTitleHe: t('goals.community.short'),
    shortTitleEn: 'Community',
    longDescHe: t('goals.runCommunity.long'),
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
