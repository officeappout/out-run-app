'use client';

/**
 * TimedRuntime — runs the engine for the current timed block and renders
 * nothing. Being a leaf, its per-tick re-render costs nothing to the rest of
 * the strength player (see state/timed-store.ts).
 */
import type { UseTimedRuntimeInput } from '../hooks/useTimedRuntime';
import { useTimedRuntime } from '../hooks/useTimedRuntime';

export default function TimedRuntime(props: UseTimedRuntimeInput) {
  useTimedRuntime(props);
  return null;
}
