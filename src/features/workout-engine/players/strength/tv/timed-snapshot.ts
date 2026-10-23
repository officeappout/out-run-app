/**
 * timed-snapshot — the AMRAP / EMOM / Tabata engine's view (home v2 timed blocks) as a RunnerSnapshot.
 * Pure: the engine's own TimedView already holds the clock, this only renames it.
 */
import { IDLE_SNAPSHOT_TIMER, type RunnerSnapshot } from '@/features/tv-mode/core/runner-snapshot';
import type { TvMedia, TvPhase, TvTimer } from '@/features/tv-mode/core/types';
import type { TimedSnapshot } from '../timed/state/timed-store';

export interface TimedFacts {
  snapshot: TimedSnapshot;
  segmentIndex: number;
  /** Player-level pause (the engine also reports its own). */
  paused: boolean;
  /** Media for a block item (looked up from the plan's exercises by the caller). */
  mediaFor: (exerciseId: string | undefined, imageUrl: string | undefined) => TvMedia | undefined;
}

export function buildTimedSnapshot({ snapshot, segmentIndex, paused, mediaFor }: TimedFacts): RunnerSnapshot {
  const { spec, view } = snapshot;
  const items = spec.items;
  const cur = view.current;
  const idx = cur ? Math.max(0, items.findIndex((i) => i.key === cur.key)) : 0;
  const next = view.next;
  const enginePaused = view.status === 'paused' || view.phase === 'paused';
  const running = view.status === 'running';

  let phase: TvPhase = 'idle';
  if (view.phase === 'work' || view.phase === 'aerobic' || view.phase === 'awaiting_partial' || view.phase === 'paused') phase = 'work';
  else if (view.phase === 'rest') phase = 'rest';

  let timer: TvTimer = IDLE_SNAPSHOT_TIMER;
  if (view.status !== 'idle' && view.status !== 'done' && view.status !== 'awaiting_partial') {
    timer =
      spec.format === 'amrap'
        ? { dir: 'down', baseMs: view.remainingMs, running, totalMs: view.totalMs }
        : { dir: 'down', baseMs: view.phaseRemainingMs, running, totalMs: view.phaseRemainingMs + view.phaseElapsedMs };
  }
  const rounds = view.roundsTotal ?? Math.max(1, view.round);
  return {
    exerciseKey: `timed:${segmentIndex}:${cur?.key ?? 'none'}`,
    exerciseIndex: idx,
    exerciseCount: items.length,
    exerciseId: cur?.exerciseId,
    exerciseName: cur?.name ?? '',
    nextExerciseName: next?.name || undefined,
    media: cur ? mediaFor(cur.exerciseId, cur.imageUrl) : undefined,
    nextMedia: next ? mediaFor(next.exerciseId, next.imageUrl) : undefined,
    mode: spec.format,
    setIndex: Math.min(Math.max(1, view.round), rounds),
    setCount: rounds,
    ...(cur?.targetReps ? { repsMin: cur.targetReps, repsMax: cur.targetReps } : {}),
    ...(cur?.targetHoldSec ? { holdSec: cur.targetHoldSec } : {}),
    phase,
    paused: paused || enginePaused,
    timer,
    together: false,
  };
}
