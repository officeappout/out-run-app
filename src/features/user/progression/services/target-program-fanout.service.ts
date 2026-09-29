/**
 * target-program-fanout.service.ts — Progression System v2, Phase 2.
 *
 * Pure logic extracted OUT of progression.service.ts specifically so it's
 * unit-testable: progression.service.ts imports from
 * '@/features/content/programs' (the barrel), which transitively pulls in
 * JSX-bearing files (program-icon.util.tsx) — this repo's vitest config is
 * node-env only, no jsdom, so anything that imports progression.service.ts
 * as a VALUE (not just a type) fails to parse under vitest. These 3
 * functions have no such dependency, so they live here instead, following
 * the same "extract for testability" convention as
 * build-skill-tree.service.ts.
 *
 * ProgramSlugMap is duplicated here (not imported from progression.service.ts)
 * — the identical 3-field shape is small enough to duplicate rather than
 * cross-import and risk re-introducing the same barrel-import problem this
 * file exists to avoid (this engagement's established convention: tiny
 * shapes get duplicated, non-trivial algorithms get cross-imported).
 */
import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import type { Program } from '@/features/content/programs/core/program.types';
import type { WorkoutExerciseResult } from '../../core/types/progression.types';
import type { ProgramState } from '@/features/progression-map/services/program-gating.service';

export interface ProgramSlugMap {
  idToSlug: Map<string, string>;
  slugToId: Map<string, string>;
  idToProgram: Map<string, Program>;
}

/**
 * Detect candidate linked/target programs from an exercise's REAL
 * Exercise.targetPrograms tags — replaces the old exercise.programLevels-
 * based detection, which depended on a client-constructed field whose
 * `level` was discarded at generation time and was hardcoded EMPTY on the
 * fallback/retry path (see Phase 2's recon report — that path silently
 * credited nothing, not an error, just dead).
 *
 * Mirrors classifyExerciseToChild's Tier-1 targetPrograms→slug resolution
 * (same slugMap, same "skip master slugs" rule) but COLLECTS every match
 * across every exercise instead of single-selecting — this is fan-out
 * detection, not child classification.
 *
 * `masterSlugs` is passed in (rather than importing KNOWN_MASTER_PROGRAMS
 * from progression.service.ts) for the same reason ProgramSlugMap is
 * duplicated above — avoids a value-import back into the barrel-tainted
 * module.
 */
export function detectTargetProgramsFromExercises(
  exercises: WorkoutExerciseResult[],
  exerciseLookup: Map<string, Exercise>,
  excludeSlugs: Set<string>,
  slugMap: ProgramSlugMap | null,
  masterSlugs: Set<string>,
): Set<string> {
  const candidates = new Set<string>();
  if (!slugMap) return candidates; // can't resolve raw ids to slugs — fail closed, no candidates

  for (const exercise of exercises) {
    const fsExercise = exerciseLookup.get(exercise.exerciseId);
    if (!fsExercise?.targetPrograms?.length) continue;

    for (const tp of fsExercise.targetPrograms) {
      const slug = slugMap.idToSlug.get(tp.programId);
      if (!slug) continue; // unresolvable raw id — skip, don't guess
      if (masterSlugs.has(slug)) continue; // never treat a master program as a linked candidate
      if (excludeSlugs.has(slug)) continue;
      candidates.add(slug);
    }
  }

  return candidates;
}

/**
 * Calculate volume contribution per linked program — how many exercises in
 * the session are really tagged (Exercise.targetPrograms, resolved to slug
 * via slugMap) to this program. Replaces the old programLevels-membership
 * check, same reasoning as detectTargetProgramsFromExercises above.
 */
export function calculateVolumeContribution(
  exercises: WorkoutExerciseResult[],
  linkedProgramSlug: string,
  exerciseLookup: Map<string, Exercise>,
  slugMap: ProgramSlugMap | null,
): number {
  const totalExerciseCount = exercises.length;
  if (totalExerciseCount === 0 || !slugMap) return 0;

  let linkedExerciseCount = 0;
  for (const exercise of exercises) {
    const fsExercise = exerciseLookup.get(exercise.exerciseId);
    const tagged = fsExercise?.targetPrograms?.some(
      (tp) => slugMap.idToSlug.get(tp.programId) === linkedProgramSlug,
    );
    if (tagged) linkedExerciseCount++;
  }

  return linkedExerciseCount / totalExerciseCount;
}

/**
 * The product decision baked into Progression v2 Phase 2: only these 3
 * getProgramState outcomes are eligible for workout-completion fan-out
 * credit. locked_prereq / needs_assessment / locked_pro are never credited.
 * Extracted as its own predicate so the credit-eligibility rule is
 * independently unit-testable without touching Firestore.
 */
export function isCreditableProgramState(state: ProgramState): boolean {
  return state === 'active' || state === 'tracked' || state === 'available';
}
