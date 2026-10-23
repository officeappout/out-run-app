'use client';

import { useEffect, useRef, useState } from 'react';
import { TV_MIRROR_MIN_GAP_MS } from '../core/constants';
import { advanceRunnerMirror, mirrorForWrite, startRunnerMirror, type RunnerMirrorState } from '../core/runner-mirror';
import type { RunnerSnapshot } from '../core/runner-snapshot';
import type { TvMirror, TvTimer } from '../core/types';
import { mirrorReducer } from '../core/mirror';

/**
 * Turns a player's snapshots into the mirror the TV shows: only real changes make a new mirror (a tick of the
 * player's own clock does not), the first change goes out at once and the rest are coalesced to one write per
 * `gapMs`. `onEnd` gets a "done" mirror when the player unmounts after having published something.
 */
export function useTvRunnerMirror(
  snapshot: RunnerSnapshot | null,
  opts: { gapMs?: number; now?: () => number; onEnd?: (done: TvMirror) => void } = {},
): TvMirror | null {
  const { gapMs = TV_MIRROR_MIN_GAP_MS, now = Date.now } = opts;
  const [out, setOut] = useState<TvMirror | null>(null);
  const state = useRef<RunnerMirrorState | null>(null);
  const written = useRef<{ timerSetAtMs: number; timer: TvTimer } | null>(null);
  const lastFlush = useRef(Number.NEGATIVE_INFINITY);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);
  const published = useRef(false);
  const onEnd = useRef(opts.onEnd);
  onEnd.current = opts.onEnd;

  useEffect(() => {
    const flush = () => {
      timeout.current = null;
      if (!state.current || !dirty.current) return;
      dirty.current = false;
      lastFlush.current = now();
      const w = mirrorForWrite(state.current, lastFlush.current, written.current);
      written.current = w.written;
      published.current = true;
      setOut(w.mirror);
    };
    if (!snapshot) return;
    const t = now();
    const prev = state.current ?? startRunnerMirror(t);
    const next = advanceRunnerMirror(prev, snapshot, t);
    if (state.current && next === prev) return;
    state.current = next;
    dirty.current = true;
    const wait = lastFlush.current + gapMs - t;
    if (wait <= 0) {
      if (timeout.current) clearTimeout(timeout.current);
      flush();
    } else if (!timeout.current) {
      timeout.current = setTimeout(flush, wait);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot]);

  useEffect(
    () => () => {
      if (timeout.current) clearTimeout(timeout.current);
      if (published.current && state.current && state.current.mirror.phase !== 'done') {
        onEnd.current?.(mirrorReducer(state.current.mirror, { type: 'done' }));
      }
    },
    [],
  );

  return out;
}
