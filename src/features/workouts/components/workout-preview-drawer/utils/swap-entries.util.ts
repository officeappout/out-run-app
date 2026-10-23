/**
 * swap-entries.util — the two small entry-list passes shared by every bulk location swap
 * (legacy useSwapAll loop and the enable_location_gate_v1 plan). Extracted verbatim. PURE.
 */
import type { WorkoutExercise } from '@/features/workout-engine/logic/WorkoutGenerator';

/**
 * Collapse-guard: never let omitting supplemental exercises empty a whole role block.
 * If every warm-up (or every cooldown) was omitted, restore the omitted ones for that role
 * (as-today, possibly park media) so the block still renders — warm-ups lead, cooldowns trail,
 * original relative order preserved. Mutates `newEntries` (as the inline code did).
 */
export function restoreCollapsedRoles(newEntries: WorkoutExercise[], omittedSupplemental: WorkoutExercise[]): void {
  for (const roleName of ['warmup', 'cooldown'] as const) {
    const survives = newEntries.some((e) => e.exerciseRole === roleName);
    const omittedForRole = omittedSupplemental.filter((e) => e.exerciseRole === roleName);
    if (!survives && omittedForRole.length > 0) {
      if (roleName === 'warmup') newEntries.unshift(...omittedForRole);
      else newEntries.push(...omittedForRole);
    }
  }
}

/** Two-pass superset heal: re-point pairedWith across all replacements. */
export function healPairedLinks(newEntries: WorkoutExercise[], oldToNew: Map<string, string>): WorkoutExercise[] {
  return newEntries.map((e) => {
    const link = e.pairedWith;
    if (link && oldToNew.has(link)) return { ...e, pairedWith: oldToNew.get(link)! };
    return e;
  });
}
