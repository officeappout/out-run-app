'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ServerClock } from '../core/clock';
import { applyCommand, INITIAL_LOCAL, type TvLocalState } from '../core/commands';
import { deriveTvScreen, type TvScreen } from '../core/connection';
import { newerMirror } from '../core/mirror';
import { orderParticipants } from '../core/participants';
import type { TvParticipant, TvSession } from '../core/types';
import { getTvRepo } from '../services/tv-repo';
import type { TvSessionRepo } from '../services/tv-session-repo';
import { useNow } from './useNow';

export interface TvSessionView {
  session: TvSession | null;
  participants: TvParticipant[];
  screen: TvScreen;
  local: TvLocalState;
  /** Best estimate of the server clock, ms. */
  serverNow: number;
  error: boolean;
}

/**
 * The TV side: subscribes to its session doc + participants, learns the server clock from
 * the host heartbeat and applies host commands once. The TV never writes.
 */
export function useTvSessionView(code: string | null, repo: TvSessionRepo = getTvRepo()): TvSessionView {
  const [session, setSession] = useState<TvSession | null>(null);
  const [participants, setParticipants] = useState<TvParticipant[]>([]);
  const [local, setLocal] = useState<TvLocalState>(INITIAL_LOCAL);
  const [error, setError] = useState(false);
  const clock = useRef(new ServerClock());
  const lastBeat = useRef<number | null>(null);
  const now = useNow(250);

  useEffect(() => {
    if (!code) return;
    setSession(null);
    setParticipants([]);
    setLocal(INITIAL_LOCAL);
    setError(false);
    clock.current = new ServerClock();
    lastBeat.current = null;

    const offSession = repo.subscribeSession(
      code,
      (next) => {
        if (next?.hostBeatAtMs != null && next.hostBeatAtMs !== lastBeat.current) {
          lastBeat.current = next.hostBeatAtMs;
          clock.current.sample(next.hostBeatAtMs, Date.now());
        }
        setSession((prev) => (next ? { ...next, mirror: newerMirror(prev?.mirror ?? null, next.mirror) } : null));
        setLocal((prev) => applyCommand(prev, next?.cmd));
      },
      () => setError(true),
    );
    const offParts = repo.subscribeParticipants(code, setParticipants, () => setError(true));
    return () => {
      offSession();
      offParts();
    };
  }, [code, repo]);

  const serverNow = clock.current.now(now);
  const ordered = useMemo(() => orderParticipants(participants, session?.hostUid ?? null), [participants, session?.hostUid]);
  const screen = deriveTvScreen(session, serverNow);
  return { session, participants: ordered, screen, local: { ...local, ended: local.ended || screen === 'ended' }, serverNow, error };
}
