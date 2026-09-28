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
import type { DisplaySegment, SkillTreeData, SkillTreeRung } from '../core/types';

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
 * A candidate's difficulty proxy: the LOWEST level across ALL its OTHER
 * targetPrograms entries (any other program, not only composite/isMaster
 * ones) — lower = more beginner-appropriate.
 *
 * Round 10 tried gating this on Program.isMaster (a "broad/composite
 * program" concept) — reverted (round 11) because it silently no-opped
 * against real Firestore data: the concrete reported example (מתח-יד-אחת
 * level 1 should prefer the Pull-L10 candidate over the Pull-L11 one)
 * never flipped, because משיכה isn't reliably flagged isMaster=true in
 * production, so the isMaster-gated proxy came back Infinity for every
 * candidate and the tie-break silently fell through to plain doc-ID order
 * — passing in the unit test (synthetic isMaster data) while doing nothing
 * against live data. Dropping the isMaster gate entirely removes that
 * failure mode: ANY other targetPrograms entry counts as a difficulty
 * signal now, so the rule can never again be silently defeated by a
 * program-flagging inconsistency this feature doesn't control.
 *
 * Exercises within one leaf-program level are routinely cross-tagged to
 * OTHER programs too (targetPrograms has no uniqueness constraint —
 * confirmed structurally, and flagged in Phase 0/1's own planning docs),
 * and any such level is a genuine difficulty signal the leaf program's OWN
 * level (the thing being grouped by) can't provide, since every candidate
 * at a leaf level is level-tied there BY DEFINITION.
 *
 * Returns +Infinity when a candidate has no OTHER targetPrograms entry at
 * all — sorts it LAST among candidates that do have one, but never breaks
 * the tie-break entirely: doc-ID order still decides among several
 * Infinity-proxy candidates.
 */
export function difficultyProxy(exercise: Exercise, programId: string): number {
  const otherLevels = (exercise.targetPrograms ?? [])
    .filter((tp) => tp.programId !== programId)
    .map((tp) => tp.level)
    .filter((level): level is number => typeof level === 'number' && Number.isFinite(level));
  return otherLevels.length > 0 ? Math.min(...otherLevels) : Number.POSITIVE_INFINITY;
}

/**
 * Representative-per-level tie-break: among candidates at the same level,
 * prefer the most beginner-appropriate one — lowest difficultyProxy() first
 * (its lowest level across any OTHER program it's tagged to) — then fall
 * back to Firestore document ID (lexicographic ascending) as the final,
 * always-deterministic tie-break.
 *
 * Why doc ID as the LAST resort and not the primary rule anymore:
 * TargetProgramRef has no field signaling "canonical exercise for this
 * level" on its own (no isPrimary/sortOrder), so an arbitrary pick was
 * previously the only option — but a lower level elsewhere IS a real,
 * data-backed difficulty signal when present, and picking the harder of
 * two candidates at "level 1" (confirmed live example: מתח-יד-אחת level
 * 1 showing a Pull-L11 exercise as its representative when a Pull-L10
 * exercise was also available) undermines the entire point of a
 * beginner-first ladder. Doc ID still settles ties the proxy itself can't
 * (no other program tag, or an identical proxy level) — cheap,
 * deterministic, guaranteed constant across every fetch, same as before.
 */
function pickRepresentative(candidates: Exercise[], programId: string): Exercise {
  return [...candidates].sort((a, b) => {
    const proxyA = difficultyProxy(a, programId);
    const proxyB = difficultyProxy(b, programId);
    // Compare by value, not by subtracting — Infinity - Infinity is NaN, which
    // Array.sort treats as "unordered" and silently ignores, breaking the doc-ID
    // fallback for the (common) case where NEITHER candidate has any other
    // targetPrograms entry. Guard this explicitly rather than relying on
    // subtraction (found and fixed as a real bug in round 10).
    if (proxyA !== proxyB) return proxyA - proxyB;
    return a.id.localeCompare(b.id);
  })[0];
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
    const representative = pickRepresentative(candidates, programId);
    rungs.push({
      level,
      representative,
      siblingCount: candidates.length - 1,
      isGap: false,
    });
  }

  return { programId, rungs, minLevel, maxLevel, exerciseCount };
}

/**
 * Collapse consecutive gap rungs into one compact display segment (e.g.
 * "רמות 2–4") instead of rendering one blank segment per empty level — the
 * founder's explicit visual-polish ask: a large empty void reads as broken,
 * a single labeled pill reads as "nothing here on purpose."
 */
export function groupRungsForDisplay(rungs: SkillTreeRung[]): DisplaySegment[] {
  const segments: DisplaySegment[] = [];

  for (const rung of rungs) {
    if (!rung.isGap) {
      segments.push({ type: 'node', rung });
      continue;
    }
    const last = segments[segments.length - 1];
    if (last?.type === 'gap' && last.toLevel === rung.level - 1) {
      last.toLevel = rung.level;
    } else {
      segments.push({ type: 'gap', fromLevel: rung.level, toLevel: rung.level });
    }
  }

  return segments;
}
