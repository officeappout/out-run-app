'use client';

import { useEffect, useRef } from 'react';
import { TV_HEARTBEAT_MS } from '../core/constants';
import { timerChanged } from '../core/mirror';
import type { TvMirror } from '../core/types';
import { getTvRepo } from '../services/tv-repo';
import type { TvSessionRepo } from '../services/tv-session-repo';

/** Host: stamp liveness every few seconds (server time) so the TV can tell "quiet" from "gone". */
export function useTvHostHeartbeat(code: string | null, enabled: boolean, repo: TvSessionRepo = getTvRepo()): void {
  useEffect(() => {
    if (!code || !enabled) return;
    const beat = () => void repo.beat(code).catch(() => undefined);
    beat();
    const id = setInterval(beat, TV_HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [code, enabled, repo]);
}

/** Host: push every new mirror snapshot; the timer's server anchor is re-stamped only when the clock changed. */
export function useTvMirrorPublisher(code: string | null, mirror: TvMirror | null, enabled: boolean, repo: TvSessionRepo = getTvRepo()): void {
  const last = useRef<TvMirror | null>(null);
  useEffect(() => {
    if (!code || !enabled || !mirror) return;
    if (last.current && mirror.seq === last.current.seq) return;
    const restamp = timerChanged(last.current, mirror);
    last.current = mirror;
    void repo.writeMirror(code, mirror, restamp).catch(() => {
      last.current = null; // retry the full snapshot on the next change
    });
  }, [code, mirror, enabled, repo]);
}
