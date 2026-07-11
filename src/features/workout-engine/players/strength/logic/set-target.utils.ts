/**
 * set-target.utils — the SINGLE source of truth for per-set/step resolution
 * (protocol-blocks Stage 0, 11.07.2026).
 *
 * Before this module the same lookups lived in THREE places
 * (usePyramidManager, useExerciseLog.autoSaveTargetReps, and the
 * useExerciseDerivedValues look-ahead), with two real user-facing bugs:
 *   • repetition pyramids (repsSequence, no pyramidSequence) auto-logged the
 *     wrong baseline from set 2 on — autoSave never consulted repsSequence;
 *   • per-step media (videoSrc/name/imageUrl) drifted between consumers —
 *     the wrong-video-per-step family of symptoms.
 *
 * resolvePyramidStep returns the FULL step object (targets AND
 * name/videoSrc/imageUrl) so every consumer — logging, display, look-ahead,
 * media — derives from the same resolution. Pure, isomorphic, no 'use client'.
 */
import type { PyramidStep } from '@/features/workout-engine/logic/workout-generator.types';

/** Strip the round multiplier prefix: "3x8" → "8", "3x6-8" → "6-8". */
export function stripRoundPrefix(reps: string | undefined | null): string {
  if (!reps) return '';
  return reps.replace(/^\d+\s*[xX×]\s*/, '');
}

/**
 * The unified per-step lookup. Returns the FULL step (targets + per-step
 * name/videoSrc/imageUrl) or null when the exercise has no pyramidSequence
 * or the index is out of range.
 */
export function resolvePyramidStep(exercise: unknown, setIndex: number): PyramidStep | null {
  const seq = (exercise as { pyramidSequence?: PyramidStep[] })?.pyramidSequence;
  if (!seq || seq.length === 0) return null;
  return seq[setIndex] ?? null;
}

export interface SetTarget {
  reps: number | null;
  hold: number | null;
  source: 'pyramid' | 'repsSequence' | 'repsString' | 'none';
  /** Present only for source==='pyramid' — the full step for media/name overrides. */
  step: PyramidStep | null;
}

/**
 * Unified target precedence for a given set index:
 *   pyramidSequence step → repsSequence[setIndex] → stripped reps-string → none.
 * (Fixes the repetition-pyramid logging bug: repsSequence was previously
 * skipped by the auto-save path.)
 */
export function resolveSetTarget(exercise: unknown, setIndex: number): SetTarget {
  const step = resolvePyramidStep(exercise, setIndex);
  if (step) {
    return {
      reps: typeof step.targetReps === 'number' ? step.targetReps : null,
      hold: typeof step.targetHold === 'number' ? step.targetHold : null,
      source: 'pyramid',
      step,
    };
  }

  const repsSeq = (exercise as { repsSequence?: number[] })?.repsSequence;
  if (repsSeq && repsSeq.length > 0 && setIndex < repsSeq.length) {
    return { reps: repsSeq[setIndex], hold: null, source: 'repsSequence', step: null };
  }

  const stripped = stripRoundPrefix((exercise as { reps?: string })?.reps);
  if (stripped) {
    const match = stripped.match(/(\d+)/);
    if (match) return { reps: parseInt(match[1], 10), hold: null, source: 'repsString', step: null };
  }

  return { reps: null, hold: null, source: 'none', step: null };
}

/**
 * Effective set count for an exercise.
 * Sequence length is authoritative when a sequence exists — a desync between
 * the explicit `sets` field and the sequence previously either orphaned tail
 * sets (step === null → wrong targets) or silently truncated the pyramid.
 * Preserves the legacy behavior exactly for non-sequence exercises
 * (sets>1 → sets, else "Nx…" prefix parse, else 1).
 */
export function effectiveSetsForExercise(exercise: unknown): number {
  if (!exercise) return 1;
  const ex = exercise as { pyramidSequence?: unknown[]; repsSequence?: unknown[]; sets?: unknown; reps?: string };

  const seqLen = ex.pyramidSequence?.length ?? ex.repsSequence?.length ?? null;
  const explicitSets = typeof ex.sets === 'number' && ex.sets > 1 ? ex.sets : null;

  if (seqLen && seqLen > 0) {
    if (explicitSets !== null && explicitSets !== seqLen) {
      console.warn(
        `[set-target] sets(${explicitSets}) disagrees with sequence length(${seqLen}) — sequence wins`,
      );
    }
    return seqLen;
  }

  if (explicitSets !== null) return explicitSets;
  const m = ex.reps?.match(/^(\d+)\s*[xX×]/);
  if (m) return parseInt(m[1], 10);
  return 1;
}
