/**
 * muscle-bar.utils — shared muscle-group chip definitions for the exercise
 * library. Used by both MuscleFilterBar (top bar) and SecondaryFiltersSheet
 * (funnel sheet's own "שרירים" section) so the two stay perfectly in sync —
 * they read/write the exact same store field (filters.muscles), so showing
 * the same chip set in both places IS the two-way sync, not something built
 * on top of it.
 *
 * One chip per ALL_MUSCLE_GROUPS entry (round 4, #3) — no more folding
 * several raw groups into one "nearest region" chip. That folding (rounds
 * 2-3) both hid real groups the admin panel actually offers (e.g. glutes
 * had no chip of its own) and made "which muscles are selected" ambiguous.
 * Icons come from src/lib/muscle-icons.const.ts, the app's existing shared
 * muscle-icon map (already used by EquipmentDetailDrawer/MasterExerciseView/
 * ExerciseDetailContent) — reused rather than re-picking representative
 * icons per chip, so `core`→abs.svg and `legs`→leg.svg (distinct from
 * quads.svg) match the same visual language used elsewhere in the app.
 * `cardio` has no entry there; MUSCLE_FALLBACK_ICON covers it and `serratus`
 * (no dedicated asset for either).
 *
 * Multi-select (round 3): filters.muscles holds the UNION of every active
 * chip's `groups`. toggleMuscleChip adds/removes one chip's whole group set
 * atomically. Each chip's `groups` is now always exactly one MuscleGroup —
 * kept as an array (not a bare value) so chipIsActive/toggleMuscleChip/
 * findActiveMuscleChips don't need a second code path for the 1-vs-many
 * case; the array shape costs nothing and any future re-introduction of
 * folding wouldn't need touching these three functions.
 */

import type { MuscleGroup } from '../../core/exercise.types';
import { ALL_MUSCLE_GROUPS } from '../../core/exercise.types';
import { MUSCLE_ICON_PATHS, MUSCLE_FALLBACK_ICON } from '@/lib/muscle-icons.const';

export interface MuscleBarChip {
  key: string;
  label: string;
  icon: string;
  groups: MuscleGroup[];
}

const MUSCLE_LABELS_HE: Record<MuscleGroup, string> = {
  chest: 'חזה',
  back: 'גב',
  middle_back: 'אמצע גב',
  shoulders: 'כתפיים',
  rear_delt: 'כתף אחורית',
  abs: 'בטן',
  obliques: 'אלכסונים',
  forearms: 'אמות',
  biceps: 'דו-ראשי',
  triceps: 'תלת-ראשי',
  quads: 'ארבע-ראשי',
  hamstrings: 'המסטרינג',
  glutes: 'ישבן',
  calves: 'שוקיים',
  traps: 'טרפז',
  cardio: 'קרדיו',
  full_body: 'כל הגוף',
  core: 'ליבה',
  legs: 'רגליים',
  serratus: 'המסור',
  adductors: 'מקרבי הירך',
  hip_flexors: 'כופפי הירך',
};

export const MUSCLE_BAR_CHIPS: MuscleBarChip[] = ALL_MUSCLE_GROUPS.map((m) => ({
  key: m,
  label: MUSCLE_LABELS_HE[m],
  icon: MUSCLE_ICON_PATHS[m] ?? MUSCLE_FALLBACK_ICON,
  groups: [m],
}));

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
