/**
 * advance-registry — protocol key → advance head
 * (protocol-blocks Stage 1b, 11.07.2026).
 *
 * TWO PROTOCOL CLASSES (design decision, 10.07):
 * - exercise-scoped (straight/superset/pyramid): coexist inside one segment,
 *   so the key is derived PER EXERCISE from its legacy markers. A future
 *   explicit segment.protocol (Stage 1c) is metadata for summary/UI only.
 * - block-scoped (tabata/emom/amrap, Stages 2-3): one clock owns the whole
 *   segment — segment.protocol IS the dispatch key. They register here when
 *   they land; resolution order will be: explicit segment.protocol →
 *   per-exercise legacy derivation → straight.
 */
import type { AdvanceExercise, AdvanceStrategy } from './advance-strategy.types';
import { straightAdvance } from './straight.advance';
import { supersetAdvance } from './superset.advance';
import { pyramidAdvance } from './pyramid.advance';

export type ExerciseProtocolKey = 'straight' | 'superset' | 'pyramid';

const REGISTRY: Record<ExerciseProtocolKey, AdvanceStrategy> = {
  straight: straightAdvance,
  superset: supersetAdvance,
  pyramid: pyramidAdvance,
};

/**
 * Legacy derivation — mirrors what the monolith checked inline:
 * pairedWith → superset; pyramidSequence → pyramid; else straight.
 * Old plans in sessionStorage carry no protocol field, so this stays the
 * fallback forever (resolveStrategy contract from the approved plan).
 */
export function resolveExerciseProtocol(ex: AdvanceExercise | null | undefined): ExerciseProtocolKey {
  if (ex?.pairedWith) return 'superset';
  if (ex?.pyramidSequence) return 'pyramid';
  return 'straight';
}

export function resolveAdvanceStrategy(ex: AdvanceExercise | null | undefined): AdvanceStrategy {
  return REGISTRY[resolveExerciseProtocol(ex)];
}
