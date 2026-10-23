'use client';

import { useMemo, useRef } from 'react';
import { createRunnerControls, type RunnerActions } from '../core/runner-controls';
import { progressFromSnapshot } from '../core/runner-progress';
import type { RunnerSnapshot } from '../core/runner-snapshot';
import type { TvMirror } from '../core/types';
import { getTvRepo } from '../services/tv-repo';
import { useTvPhoneStore } from '../phone/phone-store';
import { useTvRunnerBridge } from './useTvRunnerBridge';
import { useTvRunnerMirror } from './useTvRunnerMirror';

/** The host's last word: the TV shows the finish screen instead of freezing on the last exercise. */
function publishDone(done: TvMirror): void {
  const { code, role } = useTvPhoneStore.getState();
  if (role === 'host' && code) void getTvRepo().writeMirror(code, done, true).catch(() => undefined);
}

/**
 * A player's whole TV hookup: `snapshot` (memoise it on its fields) → throttled mirror for the TV, `actions` →
 * the phone remote, own progress → the friends row. Mount it only while a TV session exists.
 */
export function useTvRunner(snapshot: RunnerSnapshot | null, actions: RunnerActions): void {
  const role = useTvPhoneStore((s) => s.role);
  const together = useTvPhoneStore((s) => s.others > 0);
  const live = useMemo(() => (snapshot ? { ...snapshot, together } : null), [snapshot, together]);
  const mirror = useTvRunnerMirror(role === 'host' ? live : null, { onEnd: publishDone });

  const ref = useRef(actions);
  ref.current = actions;
  const hasPrev = !!actions.prev;
  const hasSkip = !!actions.skipExercise;
  const controls = useMemo(
    () =>
      role === 'host'
        ? createRunnerControls({
            togglePause: () => ref.current.togglePause(),
            next: () => ref.current.next(),
            ...(hasPrev ? { prev: () => ref.current.prev?.() } : {}),
            ...(hasSkip ? { skipExercise: () => ref.current.skipExercise?.() } : {}),
          })
        : null,
    [role, hasPrev, hasSkip],
  );

  const phase = live?.phase;
  const set = live?.setIndex;
  const total = live?.setCount;
  const progress = useMemo(
    () => (role === 'participant' && phase ? progressFromSnapshot({ phase, setIndex: set ?? 1, setCount: total ?? 1 }) : null),
    [role, phase, set, total],
  );

  useTvRunnerBridge({ mirror, controls, progress });
}
