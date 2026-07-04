/** Canonical muscle-group icon paths (male silhouette SVGs).
 *  Single source of truth — imported by EquipmentDetailDrawer,
 *  MasterExerciseView, and ExerciseDetailContent.
 *  Note: onboarding/program-path uses a separate /assets/icons/muscles/ set. */
export const MUSCLE_ICON_PATHS: Record<string, string> = {
  chest:      '/icons/muscles/male/chest.svg',
  back:       '/icons/muscles/male/back.svg',
  shoulders:  '/icons/muscles/male/shoulders.svg',
  biceps:     '/icons/muscles/male/biceps.svg',
  triceps:    '/icons/muscles/male/triceps.svg',
  forearms:   '/icons/muscles/male/forearms.svg',
  traps:      '/icons/muscles/male/traps.svg',
  lats:       '/icons/muscles/male/back.svg',
  upper_back: '/icons/muscles/male/back.svg',
  quads:      '/icons/muscles/male/quads.svg',
  hamstrings: '/icons/muscles/male/hamstrings.svg',
  glutes:     '/icons/muscles/male/glutes.svg',
  calves:     '/icons/muscles/male/calves.svg',
  core:       '/icons/muscles/male/abs.svg',
  abs:        '/icons/muscles/male/abs.svg',
  obliques:   '/icons/muscles/male/obliques.svg',
  legs:       '/icons/programs/leg.svg',
  full_body:  '/icons/programs/full_body.svg',
};

export const MUSCLE_FALLBACK_ICON = '/icons/programs/muscle.svg';
