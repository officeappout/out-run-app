'use client';

import { useCallback, useState } from 'react';
import { auth } from '@/lib/firebase';
import { useLocaleStore } from '@/store/useLocaleStore';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { firstName } from '../core/participants';
import type { TvJoinError, TvJoinResult } from '../core/types';
import { clearConnection, saveConnection, useTvPhoneStore, type TvPending } from '../phone/phone-store';
import { getTvRepo } from '../services/tv-repo';
import type { TvSessionRepo } from '../services/tv-session-repo';

export type JoinState = { phase: 'idle' } | { phase: 'joining' } | { phase: 'error'; error: TvJoinError | 'need-login' };

/**
 * Enter a code from this phone: the first phone on a free session becomes host (and attaches the
 * workout from the overview it came from), everyone else a participant.
 */
export function useTvJoin(repo: TvSessionRepo = getTvRepo()) {
  const [state, setState] = useState<JoinState>({ phase: 'idle' });
  const profile = useUserStore((s) => s.profile);
  const gender = useLocaleStore((s) => s.gender);

  const join = useCallback(
    async (code: string, pending: TvPending | null): Promise<TvJoinResult | null> => {
      const uid = auth.currentUser?.uid;
      // A name appears on a shared screen: guests (anonymous) need a real account first.
      if (!uid || auth.currentUser?.isAnonymous) {
        setState({ phase: 'error', error: 'need-login' });
        return null;
      }
      setState({ phase: 'joining' });
      const name = firstName(profile?.core?.name ?? '');
      const res = await repo.join(code, { uid, name, gender });
      if (!res.ok) {
        setState({ phase: 'error', error: res.error });
        return res;
      }
      if (res.role === 'host' && pending) {
        try {
          const sharedWorkoutId = await pending.prepareShare?.().catch(() => undefined);
          await repo.setWorkout(code, { ...pending.info, ...(sharedWorkoutId ? { sharedWorkoutId } : {}) });
        } catch {
          /* the room still works without the workout card */
        }
      }
      saveConnection(code, res.role);
      useTvPhoneStore.getState().setConnected(code, res.role);
      setState({ phase: 'idle' });
      return res;
    },
    [repo, profile?.core?.name, gender],
  );

  return { state, join, clear: () => setState({ phase: 'idle' }) };
}

/** Leave the room (participant) or end it for everyone (host), then forget it on this phone. */
export async function leaveTvSession(repo: TvSessionRepo = getTvRepo()): Promise<void> {
  const { code, role, reset } = useTvPhoneStore.getState();
  const uid = auth.currentUser?.uid;
  try {
    if (code && role === 'host') await repo.end(code);
    else if (code && uid) await repo.leave(code, uid);
  } catch {
    /* offline: the session expires on its own */
  }
  clearConnection();
  reset();
}
