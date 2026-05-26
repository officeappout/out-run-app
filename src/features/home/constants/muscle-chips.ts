/**
 * Shared muscle-chip configuration used by WorkoutBuilderScreen and
 * UserWorkoutAdjuster.  Each chip has a UI id, Hebrew label, emoji (fallback),
 * svgPath (anatomical icon from /public/icons/muscles/male/), a group tag for
 * UI layout, and a list of workout-engine domain strings.
 *
 * Groups:
 *   'primary'   — 6 main muscles shown in the first scroll row
 *   'secondary' — smaller/supporting muscles in the second row
 *   'aggregate' — synthetic full/upper/lower-body chips used only for
 *                 program→chip auto-selection (not shown in the manual picker)
 */

export interface MuscleChip {
  id: string;
  label: string;
  /** Emoji shown when svgPath fails to load. */
  emoji: string;
  /** Anatomical SVG path (public/icons/muscles/male/ or programs/). */
  svgPath: string;
  /** UI grouping for the two-row layout. */
  group: 'primary' | 'secondary' | 'aggregate';
  domains: string[];
}

// Canonical chip IDs for each domain group (used for aggregate detection)
const UPPER_CHIPS = ['chest', 'shoulders', 'triceps', 'back', 'biceps', 'forearms', 'traps'] as const;
const LOWER_CHIPS = ['quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'hip_flexors', 'abs', 'obliques'] as const;
const ALL_CHIPS   = [...UPPER_CHIPS, ...LOWER_CHIPS] as const;

export const MUSCLE_CHIPS: MuscleChip[] = [
  // ── Primary row ──────────────────────────────────────────────────────────
  { id: 'chest',       label: 'חזה',         emoji: '💪', svgPath: '/icons/muscles/male/chest.svg',       group: 'primary',   domains: ['push'] },
  { id: 'back',        label: 'גב',          emoji: '🏋️', svgPath: '/icons/muscles/male/back.svg',        group: 'primary',   domains: ['pull'] },
  { id: 'shoulders',   label: 'כתפיים',      emoji: '🏋️', svgPath: '/icons/muscles/male/shoulders.svg',   group: 'primary',   domains: ['push'] },
  { id: 'quads',       label: 'ארבע ראשי',   emoji: '🦵', svgPath: '/icons/muscles/male/quads.svg',       group: 'primary',   domains: ['legs'] },
  { id: 'glutes',      label: 'ישבן',        emoji: '🍑', svgPath: '/icons/muscles/male/glutes.svg',      group: 'primary',   domains: ['legs'] },
  { id: 'abs',         label: 'בטן',         emoji: '🔥', svgPath: '/icons/muscles/male/abs.svg',         group: 'primary',   domains: ['core'] },
  // ── Secondary row ─────────────────────────────────────────────────────────
  { id: 'biceps',      label: 'דו ראשי',     emoji: '💪', svgPath: '/icons/muscles/male/biceps.svg',      group: 'secondary', domains: ['pull'] },
  { id: 'triceps',     label: 'תלת ראשי',    emoji: '💪', svgPath: '/icons/muscles/male/triceps.svg',     group: 'secondary', domains: ['push'] },
  { id: 'hamstrings',  label: 'המסטרינג',    emoji: '🦵', svgPath: '/icons/muscles/male/hamstrings.svg',  group: 'secondary', domains: ['legs'] },
  { id: 'calves',      label: 'שוקיים',      emoji: '🦵', svgPath: '/icons/muscles/male/calves.svg',      group: 'secondary', domains: ['legs'] },
  { id: 'forearms',    label: 'אמות',        emoji: '💪', svgPath: '/icons/muscles/male/forearms.svg',    group: 'secondary', domains: ['pull'] },
  { id: 'traps',       label: 'טרפז',        emoji: '🏋️', svgPath: '/icons/muscles/male/traps.svg',       group: 'secondary', domains: ['pull'] },
  { id: 'adductors',   label: 'מקרבי ירך',   emoji: '🦵', svgPath: '/icons/muscles/male/adductors.svg',   group: 'secondary', domains: ['legs'] },
  { id: 'obliques',    label: 'אלכסונים',    emoji: '🔥', svgPath: '/icons/muscles/male/obliques.svg',    group: 'secondary', domains: ['core'] },
  { id: 'hip_flexors', label: 'כופפי ירך',   emoji: '🦵', svgPath: '/icons/muscles/male/hip_flexors.svg', group: 'secondary', domains: ['legs'] },
  // ── Aggregate (auto-selection only — not shown in manual picker) ──────────
  { id: 'upper_body',  label: 'פלג גוף עליון', emoji: '💪', svgPath: '/icons/muscles/male/chest.svg',  group: 'aggregate', domains: ['push', 'pull'] },
  { id: 'lower_body',  label: 'פלג גוף תחתון', emoji: '🦵', svgPath: '/icons/muscles/male/quads.svg',  group: 'aggregate', domains: ['legs', 'core'] },
  { id: 'full_body',   label: 'כל הגוף',        emoji: '🏃', svgPath: '/icons/programs/full_body.svg', group: 'aggregate', domains: ['push', 'pull', 'legs', 'core'] },
];

/**
 * Maps program IDs / domain strings (from UserActiveProgram.focusDomains)
 * to the individual chip IDs they should activate.
 *
 * Domain keys (push/pull/legs/core) expand to their full muscle set.
 * Individual muscle IDs pass through unchanged (identity mapping).
 * Aggregate program IDs map to the union of their constituent muscles.
 */
const PROG_TO_CHIPS: Record<string, string[]> = {
  // Workout-engine domain → all relevant muscle chips
  push:  ['chest', 'shoulders', 'triceps'],
  pull:  ['back',  'biceps',    'forearms', 'traps'],
  legs:  ['quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'hip_flexors'],
  core:  ['abs',   'obliques'],
  // Aggregate program IDs
  upper_body:        ['chest', 'shoulders', 'triceps', 'back', 'biceps', 'forearms', 'traps'],
  lower_body:        ['quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'hip_flexors', 'abs', 'obliques'],
  full_body:         [...ALL_CHIPS],
  calisthenics_upper:['chest', 'shoulders', 'triceps', 'back', 'biceps', 'forearms', 'traps'],
  // Calisthenics skill tracks — biomechanical primary movers
  planche:            ['chest', 'shoulders', 'triceps'],
  front_lever:        ['back', 'biceps', 'forearms', 'traps'],
  handstand:          ['shoulders', 'triceps', 'abs', 'obliques'],
  handstand_pushup:   ['shoulders', 'triceps', 'chest'],
  muscle_up:          ['back', 'chest', 'biceps', 'triceps', 'shoulders', 'forearms', 'traps'],
  back_lever:         ['back', 'chest', 'biceps', 'forearms'],
  one_arm_pullup:     ['back', 'biceps', 'forearms', 'traps'],
  human_flag:         ['shoulders', 'back', 'abs', 'obliques'],
  // Individual muscle IDs — identity pass-through
  chest: ['chest'],  shoulders: ['shoulders'],  triceps:    ['triceps'],
  back:  ['back'],   biceps:    ['biceps'],      forearms:   ['forearms'],  traps: ['traps'],
  quads: ['quads'],  hamstrings:['hamstrings'],  glutes:     ['glutes'],
  calves:['calves'], adductors: ['adductors'],   hip_flexors:['hip_flexors'],
  abs:   ['abs'],    obliques:  ['obliques'],
};

/**
 * Given a program's focusDomains array (may contain domain strings or program
 * IDs), return the INDIVIDUAL chip IDs to highlight in the UI.
 *
 * Always resolves to individual chips (primary/secondary groups) so they
 * appear highlighted in the muscle rows.  Aggregate chip IDs (full_body,
 * upper_body, lower_body) are expanded back to their constituent muscles
 * so nothing is silently swallowed.
 */
export function domainsToChipIds(focusDomains: string[]): string[] {
  if (!focusDomains.length) return [];

  // Expand all inputs through PROG_TO_CHIPS; aggregate IDs in PROG_TO_CHIPS
  // already map to their full individual chip lists, so no further expansion needed.
  const chipSet = new Set<string>(
    focusDomains.flatMap(d => PROG_TO_CHIPS[d] ?? [d]),
  );

  // Filter to only individual (primary/secondary) chips so aggregates never
  // leak into the result — they are not rendered in the manual picker rows.
  const individualIds = new Set(
    MUSCLE_CHIPS.filter(c => c.group !== 'aggregate').map(c => c.id),
  );

  return [...chipSet].filter(id => individualIds.has(id));
}
