/**
 * timed-store — the bridge that keeps the timed engine's 200 ms tick OUT of
 * the strength player root (pure, framework-free).
 *
 *   TimedRuntime (a leaf that renders null) owns the engine hook, re-renders
 *   per tick and `publish`es a snapshot here;
 *   the timed card / list / mini bar subscribe (useSyncExternalStore) and are
 *   the only subtrees that re-render per tick;
 *   StrengthRunner keeps one stable store object + stable `actions`, so its
 *   own render is never driven by the clock.
 */
import type { TimedView } from '@/features/workout-engine/engines/timed/timed.selectors';
import type { TimedBlockResult } from '@/features/workout-engine/engines/timed/timed-result';
import type { TimedBlockSpec, TimedState } from '@/features/workout-engine/engines/timed/timed.types';
import type { ExerciseResultLog } from '../../hooks/useWorkoutStateMachine';
import type { TimedPrompt } from '../logic/timed-prompt';

export interface TimedSnapshot {
  spec: TimedBlockSpec;
  state: TimedState;
  view: TimedView;
  prompt: TimedPrompt | null;
  /** "פינישר" in a mixed workout, else null. */
  prefix: string | null;
  /** Final result once the block is done. */
  result: TimedBlockResult | null;
  /** Live distance of a run item (metres). */
  runDistanceM: number;
}

export interface TimedActions {
  start: () => void;
  itemDone: () => void;
  answerPrompt: (reps: number) => void;
  skipPrompt: () => void;
  /** Early exit: stop the block now and return its rows (empty when it never started). */
  finishNow: () => ExerciseResultLog[];
}

export interface TimedStore {
  getSnapshot: () => TimedSnapshot | null;
  subscribe: (listener: () => void) => () => void;
  /** Runtime only. Notifies only when the snapshot object changed. */
  publish: (snapshot: TimedSnapshot | null) => void;
  /** Stable object — safe to hand to effects / OS media controls. */
  actions: TimedActions;
  /** Runtime only: route the stable `actions` to the live implementation. */
  bindActions: (impl: TimedActions | null) => void;
}

const NO_ACTIONS: TimedActions = {
  start: () => {},
  itemDone: () => {},
  answerPrompt: () => {},
  skipPrompt: () => {},
  finishNow: () => [],
};

export function createTimedStore(): TimedStore {
  let snapshot: TimedSnapshot | null = null;
  let impl: TimedActions = NO_ACTIONS;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    publish: (next) => {
      if (next === snapshot) return;
      snapshot = next;
      listeners.forEach((l) => l());
    },
    actions: {
      start: () => impl.start(),
      itemDone: () => impl.itemDone(),
      answerPrompt: (reps) => impl.answerPrompt(reps),
      skipPrompt: () => impl.skipPrompt(),
      finishNow: () => impl.finishNow(),
    },
    bindActions: (next) => {
      impl = next ?? NO_ACTIONS;
    },
  };
}
