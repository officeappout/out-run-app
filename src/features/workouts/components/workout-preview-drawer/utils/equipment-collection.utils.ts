/**
 * Equipment + muscle aggregation utilities for WorkoutPreviewDrawer.
 *
 * Both functions are pure aggregators that scan an exercise list once
 * and return capped, deduplicated arrays for badge rendering.
 */
import type { WorkoutExercise as EngineWorkoutExercise } from '@/features/workout-engine/logic/WorkoutGenerator';
import {
  normalizeGearId,
  resolveEquipmentLabel,
} from '@/features/workout-engine/shared/utils/gear-mapping.utils';
import type { EquipmentEntry } from '../types';

/** Collect unique equipment entries (canonical ID + Hebrew label) from exercises */
export function collectEquipment(exercises: EngineWorkoutExercise[]): EquipmentEntry[] {
  const seenNorms = new Set<string>();
  const seenLabels = new Set<string>();
  const result: EquipmentEntry[] = [];
  for (const ex of exercises) {
    const method = ex.method;
    const ids: string[] = [
      ...(method?.gearIds ?? []),
      ...(method?.equipmentIds ?? []),
    ];
    for (const id of ids) {
      if (!id) continue;
      // Normalise immediately so Firestore doc IDs (e.g. '9HVoe7t0PmaP5YJOYAlv')
      // resolve to their canonical key ('pullup_bar'). DrawerEquipmentBadge then
      // receives the canonical key and can always resolve the SVG path.
      const norm = normalizeGearId(id);
      if (norm === 'bodyweight' || norm === 'none' || norm === 'unknown_gear') continue;
      if (seenNorms.has(norm)) continue;
      seenNorms.add(norm);
      const label = resolveEquipmentLabel(norm);
      if (seenLabels.has(label)) continue;
      seenLabels.add(label);
      result.push({ id: norm, label });
    }
  }

  return result.slice(0, 6);
}

/** Collect unique primary muscles from main exercises (excludes warmup/cooldown) */
export function collectMuscles(exercises: EngineWorkoutExercise[]): string[] {
  const seen = new Set<string>();
  for (const ex of exercises) {
    const role = ex.exercise.exerciseRole;
    if (role === 'warmup' || role === 'cooldown') continue;
    if (ex.exercise.primaryMuscle) seen.add(ex.exercise.primaryMuscle);
  }
  return Array.from(seen).slice(0, 6);
}
