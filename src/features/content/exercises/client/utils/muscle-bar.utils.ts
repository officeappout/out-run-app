/**
 * muscle-bar.utils — shared muscle-group chip definitions for the exercise
 * library. Used by both MuscleFilterBar (top bar) and SecondaryFiltersSheet
 * (funnel sheet's own "שרירים" section) so the two stay perfectly in sync —
 * they read/write the exact same store field (filters.muscles), so showing
 * the same chip set in both places IS the two-way sync, not something built
 * on top of it.
 *
 * Each chip maps to a SET of underlying MuscleGroup values (not a 1:1 enum
 * match) because the data model has no single tag for some of them — e.g.
 * "ידיים" means biceps ∪ triceps ∪ forearms. See exercise.types.ts's
 * MuscleGroup union for the full raw list this groups from.
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
  { key: 'back', label: 'גב', icon: '/icons/muscles/male/back.svg', groups: ['back', 'middle_back'] },
  { key: 'shoulders', label: 'כתפיים', icon: '/icons/muscles/male/shoulders.svg', groups: ['shoulders', 'rear_delt'] },
  { key: 'core', label: 'ליבה', icon: '/icons/muscles/male/abs.svg', groups: ['core', 'abs', 'obliques'] },
  { key: 'arms', label: 'ידיים', icon: '/icons/muscles/male/biceps.svg', groups: ['biceps', 'triceps', 'forearms'] },
  { key: 'legs', label: 'רגליים', icon: '/icons/muscles/male/quads.svg', groups: ['legs', 'quads', 'hamstrings', 'calves', 'glutes'] },
];

export function sameMuscleSet(a: MuscleGroup[], b: MuscleGroup[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((m) => setA.has(m));
}

/** Find the bar chip (if any) whose group set matches the given selection exactly. */
export function findMatchingMuscleChip(selected: MuscleGroup[]): MuscleBarChip | null {
  if (selected.length === 0) return null;
  return MUSCLE_BAR_CHIPS.find((chip) => sameMuscleSet(selected, chip.groups)) ?? null;
}
