/**
 * muscle-bar.utils — shared muscle-group chip definitions for the exercise
 * library. Used by both MuscleFilterBar (top bar) and SecondaryFiltersSheet
 * (funnel sheet's own "שרירים" section) so the two stay perfectly in sync —
 * they read/write the exact same store field (filters.muscles), so showing
 * the same chip set in both places IS the two-way sync, not something built
 * on top of it.
 *
 * Multi-select (round 3): filters.muscles holds the UNION of every active
 * chip's `groups`. toggleMuscleChip adds/removes one chip's whole group set
 * atomically, so the array only ever contains complete chip group-sets —
 * that's what makes chipIsActive's simple "every group present" subset
 * check unambiguous even with several chips active at once.
 *
 * Every one of the 22 raw MuscleGroup values (exercise.types.ts) is folded
 * into exactly one chip below — round 3 fix for the bar silently omitting
 * some groups. Anatomically-adjacent values without their own bar chip
 * (middle_back, rear_delt, serratus, adductors, hip_flexors, traps) fold
 * into the nearest region rather than growing the bar past a scrollable
 * handful of chips.
 */

import type { MuscleGroup } from '../../core/exercise.types';

export interface MuscleBarChip {
  key: string;
  label: string;
  icon: string;
  groups: MuscleGroup[];
}

export const MUSCLE_BAR_CHIPS: MuscleBarChip[] = [
  { key: 'chest', label: 'חזה', icon: '/icons/muscles/male/chest.svg', groups: ['chest'] },
  { key: 'back', label: 'גב', icon: '/icons/muscles/male/back.svg', groups: ['back', 'middle_back', 'traps'] },
  { key: 'shoulders', label: 'כתפיים', icon: '/icons/muscles/male/shoulders.svg', groups: ['shoulders', 'rear_delt'] },
  { key: 'core', label: 'ליבה', icon: '/icons/muscles/male/abs.svg', groups: ['core', 'abs', 'obliques', 'serratus'] },
  { key: 'arms', label: 'ידיים', icon: '/icons/muscles/male/biceps.svg', groups: ['biceps', 'triceps', 'forearms'] },
  { key: 'legs', label: 'רגליים', icon: '/icons/muscles/male/quads.svg', groups: ['legs', 'quads', 'hamstrings', 'calves', 'glutes', 'adductors', 'hip_flexors'] },
  { key: 'full_body', label: 'כל הגוף', icon: '/icons/programs/full_body.svg', groups: ['full_body'] },
  { key: 'cardio', label: 'קרדיו', icon: '/icons/programs/Run.svg', groups: ['cardio'] },
];

/** True when EVERY one of the chip's groups is present in the selection. */
export function chipIsActive(selected: MuscleGroup[], chip: MuscleBarChip): boolean {
  return chip.groups.every((g) => selected.includes(g));
}

/** Add (if inactive) or remove (if active) one chip's whole group set — union-based multi-select. */
export function toggleMuscleChip(selected: MuscleGroup[], chip: MuscleBarChip): MuscleGroup[] {
  if (chipIsActive(selected, chip)) {
    return selected.filter((m) => !chip.groups.includes(m));
  }
  return Array.from(new Set([...selected, ...chip.groups]));
}

/** Every chip currently fully selected — drives ActiveFilterChipsRow (one chip per active muscle). */
export function findActiveMuscleChips(selected: MuscleGroup[]): MuscleBarChip[] {
  return MUSCLE_BAR_CHIPS.filter((chip) => chipIsActive(selected, chip));
}
