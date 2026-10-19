/**
 * Generation review — the ONLY module generator / UI code imports. Each hook is a one-line,
 * synchronous, never-throwing call: when the gate is closed (flag off on this device and not a
 * super admin) it returns immediately and nothing else happens (byte-identical behaviour).
 * Otherwise the capture worker (./logger.ts) is loaded lazily and does the work off the
 * caller's path.
 */
import type { ComposedHybridSession } from '@/features/workout-engine/hybrid/start-hybrid-session';
import type { GeneratedWorkout } from '@/features/workout-engine/logic/workout-generator.types';
import type { Route } from '@/features/parks/core/types/route.types';
import type { RunWorkout } from '@/features/workout-engine/players/running/types/run-workout.type';
import type { OutcomeStatus } from '@/lib/generation-review/types';
import { captureEnabledOnDevice } from './gate';
import type { StrengthCtx } from './adapters/strength';
import type { HybridCtx } from './adapters/hybrid';
import type { RouteCtx } from './adapters/route';
import type { Family } from './memory';

type Logger = typeof import('./logger');

function run(fn: (m: Logger) => void): void {
  try {
    if (!captureEnabledOnDevice()) return;
    import('./logger').then(fn).catch(() => {});
  } catch {
    /* never break the caller */
  }
}

export function logGeneratedWorkout(type: 'home_strength' | 'kelly_workout', workout: GeneratedWorkout | null | undefined, ctx?: StrengthCtx): void {
  if (workout) run((m) => m.logWorkout(type, workout, ctx));
}

export function logHybridShown(composed: ComposedHybridSession | null | undefined, ctx?: HybridCtx): void {
  if (composed) run((m) => m.logHybrid(composed, ctx));
}

/** Pass-through: `setRoutes(logGeneratedRoutes(result.slice(0, 3), ctx))`. */
export function logGeneratedRoutes<T extends Route[]>(routes: T, ctx?: RouteCtx): T {
  if (routes?.length) run((m) => m.logRoutes(routes, ctx));
  return routes;
}

export function logPlannedRun(w: RunWorkout | null | undefined): void {
  if (w) run((m) => m.logPlannedRun(w));
}

export function markGenerationOutcome(family: Family, status: OutcomeStatus, hint?: { exerciseIds?: string[]; routeId?: string | null }): void {
  run((m) => m.outcome(family, status, hint));
}

/** storage.service saveWorkout → the matching family's "completed". */
export function noteWorkoutSaved(workoutType: string | null | undefined): void {
  const family: Family | null =
    workoutType === 'strength' || workoutType === 'workout' ? 'strength'
      : workoutType === 'hybrid' ? 'hybrid'
        : workoutType === 'running' || workoutType === 'walking' || workoutType === 'cycling' ? 'run' : null;
  if (family) markGenerationOutcome(family, 'completed');
}

export function noteGenerationSwap(family: Family): void {
  run((m) => m.swap(family));
}
