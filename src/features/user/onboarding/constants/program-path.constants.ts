/**
 * Program-path picker constants — moved verbatim out of
 * src/app/onboarding-new/program-path/page.tsx so the home-v2 view
 * (components/program-path/ProgramPathV2View.tsx) renders the exact same
 * ids, labels, groupings and order as the legacy page. App-router page files
 * can't export extra names, hence the separate module. Nothing here changed.
 */
import type { MuscleGroup } from '@/features/content/exercises/core/exercise.types';
import { isHiddenProgram } from '@/lib/hidden-programs';
import { makeT } from '@/lib/i18n/t';
import { onboarding } from '@/messages/ns/onboarding';

const t = makeT('he', onboarding);

/** Muscle icon paths — used inside chips */
export const MUSCLE_ICON_PATHS: Record<string, string> = {
  chest: '/assets/icons/muscles/chest.svg',
  back: '/assets/icons/muscles/back.svg',
  shoulders: '/assets/icons/muscles/shoulders.svg',
  biceps: '/assets/icons/muscles/biceps.svg',
  triceps: '/assets/icons/muscles/triceps.svg',
  legs: '/assets/icons/muscles/quads.svg',
  core: '/assets/icons/muscles/abs.svg',
  glutes: '/icons/muscles/glutes.svg',
};

/** Hebrew chip labels for each muscle group ID */
export const MUSCLE_CHIP_LABELS: Record<string, string> = {
  chest: t('muscle.chest'),
  back: t('muscle.back'),
  shoulders: t('muscle.shoulders'),
  biceps: t('muscle.biceps'),
  triceps: t('muscle.triceps'),
  legs: t('muscle.legs'),
  core: t('muscle.core'),
  glutes: t('muscle.glutes'),
};

/** Calisthenics skill programs — slug matches Firestore program IDs.
 *  'calisthenics_upper' is the master chip and rendered separately as full-width. */
export const SKILL_MASTER_ID = 'calisthenics_upper';

/** Every skill chip, including ones hidden for now (HIDDEN_PROGRAM_SLUGS). */
const ALL_SKILL_PROGRAMS: { id: string; nameHe: string }[] = [
  { id: 'calisthenics_upper', nameHe: t('skill.calisthenicsUpper') },
  { id: 'front_lever',        nameHe: t('skill.frontLever') },
  { id: 'muscle_up',          nameHe: t('skill.muscleUp') },
  { id: 'planche',            nameHe: t('skill.planche') },
  { id: 'handstand',          nameHe: t('skill.handstand') },
  { id: 'hspu',               nameHe: t('skill.hspu') },
  { id: 'one_arm_pullup',     nameHe: t('skill.oneArmPullup') },
];

/** The skills offered in the onboarding picker — muscle_up / handstand /
 *  human_flag are hidden until their content is refined (shared
 *  HIDDEN_PROGRAM_SLUGS). Users who already train them are unaffected. */
export const SKILL_PROGRAMS: { id: string; nameHe: string }[] = ALL_SKILL_PROGRAMS.filter(
  (s) => !isHiddenProgram(s.id),
);

/** Movement-pattern classification for the Orange Flow balance heuristic.
 *  SKILL_MASTER_ID ('calisthenics_upper') already covers both axes and is
 *  intentionally exempt from the recommendation engine. */
export const PUSH_SKILLS: ReadonlySet<string> = new Set(['planche', 'hspu', 'handstand']);
export const PULL_SKILLS: ReadonlySet<string> = new Set(['front_lever', 'one_arm_pullup', 'muscle_up']);

/** Icon paths per skill — hidden via onError when file is absent.
 *  'calisthenics_upper' (the "all elements" master chip) has no dedicated
 *  designed asset — reuses '/icons/programs/muscle.svg', the same generic
 *  icon already used for 'upper_body'/'calisthenics' elsewhere (see
 *  HeroWorkoutCard.tsx, WorkoutSelectionCarousel.tsx, and
 *  MUSCLE_FALLBACK_ICON in lib/muscle-icons.const.ts) rather than a
 *  genuinely broken path that 404s on every load (housekeeping audit). */
export const SKILL_ICON_PATHS: Record<string, string> = {
  calisthenics_upper: '/icons/programs/muscle.svg',
  front_lever:        '/icons/programs/front_lever.svg',
  muscle_up:          '/icons/programs/muscle_up_bar.svg',
  planche:            '/icons/programs/planche.svg',
  handstand:          '/icons/programs/handstand.svg',
  hspu:               '/icons/programs/hspu.svg',
  one_arm_pullup:     '/icons/programs/one_arm_pullup.svg',
};

export const MUSCLE_FOCUS_IDS: MuscleGroup[] = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'legs',
  'core',
  'glutes',
];

export type MusclePackageKey = 'pull' | 'push' | 'legs' | 'core';

/**
 * The 4 package groupings, each always rendered open with its muscle chips.
 * Source of truth is MUSCLE_TO_CATEGORY in assessment-path-config.service.ts — NOT
 * muscle-balance.ts's PUSH_MUSCLES/PULL_MUSCLES/LOWER_MUSCLES, which merges
 * legs+core+glutes into one "lower" bucket and would wrongly collapse the
 * legs/core packages into one. Muscle order within each package is fixed and
 * deterministic (never Set/Object.keys iteration) — package "select all"
 * adds muscles in this exact order, since insertion order in selectedMuscles
 * drives both slider display order (musclesToCategories) and intro copy
 * (targetArea = index 0 in assessment-visual/page.tsx).
 */
export const MUSCLE_PACKAGES: { key: MusclePackageKey; nameHe: string; muscles: MuscleGroup[] }[] = [
  { key: 'pull', nameHe: t('package.pull'), muscles: ['back', 'biceps'] },
  { key: 'push', nameHe: t('package.push'), muscles: ['shoulders', 'chest', 'triceps'] },
  { key: 'legs', nameHe: t('package.legs'), muscles: ['glutes', 'legs'] },
  { key: 'core', nameHe: t('package.core'), muscles: ['core'] },
];
