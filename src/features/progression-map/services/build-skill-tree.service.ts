/**
 * build-skill-tree.service.ts — pure Skill Tree assembly.
 *
 * Collects the exercises tagged to one LEAF program, groups them by their
 * per-program level (Exercise.targetPrograms[].{programId,level} — never
 * base_movement_id, which is a different axis used only by the swap pill),
 * picks one representative per level, and fills gap rungs for empty levels
 * within the observed range.
 *
 * Side-effect-free: takes exercises + a programId as arguments, returns a
 * tree structure. No Firestore reads, no React, no hooks — matches this
 * repo's convention of keeping generation/assembly logic pure and testable
 * in isolation (this project's vitest config is node-env only, no jsdom —
 * pure functions like this are exactly what's testable here).
 */
import type { Exercise } from '@/features/content/exercises';
import type { SkillTreeData, SkillTreeRung } from '../core/types';

/**
 * Resolve an exercise's level FOR A SPECIFIC PROGRAM — never targetPrograms[0]
 * unconditionally, since an exercise's level is per-program and can differ
 * across the programs it's tagged to. Modeled on the correct existing
 * precedent (exercise-replacement.service.ts's getExerciseLevel(exercise,
 * activeProgramId)) — not imported from it, since that function lives in the
 * workout-engine/generator domain, the wrong layer for this read-only,
 * display-only feature (Law 7 domain-agnostic boundary).
 */
export function resolveLevelInProgram(exercise: Exercise, programId: string): number | null {
  const match = exercise.targetPrograms?.find((tp) => tp.programId === programId);
  if (!match) return null;
  const level = match.level;
  return typeof level === 'number' && Number.isFinite(level) && level > 0 ? level : null;
}

/**
 * Representative-per-level tie-break: sort candidates at a level by Firestore
 * document ID (lexicographic ascending), take the first.
 *
 * Why this and not something "smarter": TargetProgramRef has no field
 * signaling "canonical exercise for this level" (no isPrimary/sortOrder/
 * anything scoring spine-worthiness) — inventing a semantic preference the
 * data doesn't encode would be guessing, not reading. Raw Firestore fetch
 * order is not guaranteed stable without an explicit orderBy, which would
 * make the spine node flicker across reloads — doc ID is the cheapest field
 * guaranteed constant across every fetch.
 */
function pickRepresentative(candidates: Exercise[]): Exercise {
  return [...candidates].sort((a, b) => a.id.localeCompare(b.id))[0];
}

export function buildSkillTree(exercises: Exercise[], programId: string): SkillTreeData | null {
  const byLevel = new Map<number, Exercise[]>();

  for (const ex of exercises) {
    const level = resolveLevelInProgram(ex, programId);
    if (level === null) continue;
    const bucket = byLevel.get(level);
    if (bucket) bucket.push(ex);
    else byLevel.set(level, [ex]);
  }

  if (byLevel.size === 0) return null;

  const levels = Array.from(byLevel.keys()).sort((a, b) => a - b);
  const minLevel = levels[0];
  const maxLevel = levels[levels.length - 1];

  const rungs: SkillTreeRung[] = [];
  let exerciseCount = 0;

  for (let level = minLevel; level <= maxLevel; level++) {
    const candidates = byLevel.get(level);
    if (!candidates || candidates.length === 0) {
      rungs.push({ level, representative: null, siblingCount: 0, isGap: true });
      continue;
    }
    exerciseCount += candidates.length;
    const representative = pickRepresentative(candidates);
    rungs.push({
      level,
      representative,
      siblingCount: candidates.length - 1,
      isGap: false,
    });
  }

  return { programId, rungs, minLevel, maxLevel, exerciseCount };
}
