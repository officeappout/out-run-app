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
import { makeLiveT } from '@/lib/i18n/live-t';
import { onboarding } from '@/messages/ns/onboarding';

const t = makeLiveT(onboarding);

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
    get shortTitleHe() { return t('goals.routine.short'); },
    shortTitleEn: 'Routine',
    get longDescHe() { return t('goals.routine.long'); },
    longDescEn: 'build and maintain a steady routine',
    tag: 'goal_routine',
  },
  {
    id: 'aesthetics',
    get shortTitleHe() { return t('goals.aesthetics.short'); },
    shortTitleEn: 'Toning',
    get longDescHe() { return t('goals.aesthetics.long'); },
    longDescEn: 'build a toned and aesthetic body',
    tag: 'goal_aesthetics',
  },
  {
    id: 'fitness',
    get shortTitleHe() { return t('goals.fitness.short'); },
    shortTitleEn: 'Health',
    get longDescHe() { return t('goals.fitness.long'); },
    longDescEn: 'maintain general fitness and long-term health',
    tag: 'goal_fitness',
  },
  {
    id: 'performance',
    get shortTitleHe() { return t('goals.performance.short'); },
    shortTitleEn: 'Performance',
    get longDescHe() { return t('goals.performance.long'); },
    longDescEn: 'improve performance in my sport',
    tag: 'goal_performance',
  },
  {
    id: 'skills',
    get shortTitleHe() { return t('goals.skills.short'); },
    shortTitleEn: 'Skills',
    get longDescHe() { return t('goals.skills.long'); },
    longDescEn: 'learn advanced exercises (pull-ups, planche, etc.)',
    tag: 'goal_skills',
  },
  {
    id: 'community',
    get shortTitleHe() { return t('goals.community.short'); },
    shortTitleEn: 'Community',
    get longDescHe() { return t('goals.community.long'); },
    longDescEn: 'meet new partners and join a local community',
    tag: 'goal_community',
  },
];

/** Run-only users: running goals (shared ids keep their tags). */
export const RUN_GOAL_OPTIONS: GoalOption[] = [
  {
    id: 'routine',
    get shortTitleHe() { return t('goals.runRoutine.short'); },
    shortTitleEn: 'Running routine',
    get longDescHe() { return t('goals.runRoutine.long'); },
    longDescEn: 'run regularly and build a routine',
    tag: 'goal_routine',
  },
  {
    id: 'fitness',
    get shortTitleHe() { return t('goals.fitness.short'); },
    shortTitleEn: 'Health',
    get longDescHe() { return t('goals.runFitness.long'); },
    longDescEn: 'stay fit and healthy for the long run',
    tag: 'goal_fitness',
  },
  {
    id: 'run_distance',
    get shortTitleHe() { return t('goals.runDistance.short'); },
    shortTitleEn: 'Run farther',
    get longDescHe() { return t('goals.runDistance.long'); },
    longDescEn: 'run longer distances',
    tag: 'goal_run_distance',
  },
  {
    id: 'run_pace',
    get shortTitleHe() { return t('goals.runPace.short'); },
    shortTitleEn: 'Run faster',
    get longDescHe() { return t('goals.runPace.long'); },
    longDescEn: 'improve my pace',
    tag: 'goal_run_pace',
  },
  {
    id: 'community',
    get shortTitleHe() { return t('goals.community.short'); },
    shortTitleEn: 'Community',
    get longDescHe() { return t('goals.runCommunity.long'); },
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
