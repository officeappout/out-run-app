/**
 * Protocol Processor — Strategy-pattern interface for workout protocols.
 *
 * Each protocol (antagonist superset, EMOM, pyramid, compound superset, ...)
 * implements this interface and registers itself in
 * `protocol-processor.registry.ts`.  WorkoutGenerator dispatches to the
 * matching processor instead of branching on protocol names internally.
 *
 * ISOMORPHIC: Pure TypeScript, no React hooks, no browser APIs.
 */

import type {
  WorkoutExercise,
  WorkoutGenerationContext,
  WorkoutStructure,
} from '../workout-generator.types';

export interface ProtocolResult {
  structure: WorkoutStructure;
  setType: string;
}

export interface ProtocolProcessor {
  /** Canonical protocol identifier (matches the string returned by selectProtocol) */
  readonly name: string;

  /** Returns true when this processor should run for the given protocol name */
  matches(selectedProtocol: string): boolean;

  /**
   * Apply the protocol to the exercise list.
   * Implementations may reorder, mutate (e.g., set `pairedWith`,
   * `repsSequence`, `supersetType`), or return the same array unchanged.
   */
  process(
    exercises: WorkoutExercise[],
    context: WorkoutGenerationContext,
  ): WorkoutExercise[];

  /**
   * Optional: override the workout structure when this protocol is active.
   * Returning the input structure unchanged is a no-op.
   */
  mutateStructure?(current: WorkoutStructure): WorkoutStructure;
}
