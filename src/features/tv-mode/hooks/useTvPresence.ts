'use client';

import { useEffect, useRef } from 'react';
import { TV_PRESENCE_MIN_GAP_MS } from '../core/constants';
import type { TvParticipantProgress } from '../phone/phone-store';
import { getTvRepo } from '../services/tv-repo';
import type { TvSessionRepo } from '../services/tv-session-repo';

/** Participant: publish own progress to own doc only, never more often than every few seconds. */
export function useTvPresence(code: string | null, uid: string | null, progress: TvParticipantProgress | null, repo: TvSessionRepo = getTvRepo()): void {
  const seq = useRef(0);
  const lastAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!code || !uid || !progress) return;
    const send = () => {
      lastAt.current = Date.now();
      seq.current += 1;
      void repo.publishPresence(code, uid, { state: progress.state, set: progress.set, totalSets: progress.totalSets, seq: seq.current }).catch(() => undefined);
    };
    const wait = lastAt.current + TV_PRESENCE_MIN_GAP_MS - Date.now();
    if (timer.current) clearTimeout(timer.current);
    if (wait <= 0) send();
    else timer.current = setTimeout(send, wait);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [code, uid, progress, repo]);
}
