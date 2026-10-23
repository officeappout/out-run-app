'use client';

import { useCallback, useState } from 'react';
import { auth } from '@/lib/firebase';
import { useT } from '@/hooks/useT';
import { useLocaleStore } from '@/store/useLocaleStore';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { wide } from '@/messages/ns/wide';
import { identityOf, planJoin, type TvJoinUiError } from '../core/join-plan';
import { defaultAvatar } from '../core/participants';
import type { TvJoinResult } from '../core/types';
import { saveNickname } from '../phone/nickname-memory';
import { clearConnection, saveConnection, useTvPhoneStore, type TvPending } from '../phone/phone-store';
import { getTvRepo } from '../services/tv-repo';
import type { TvSessionRepo } from '../services/tv-session-repo';

export type JoinState = { phase: 'idle' } | { phase: 'joining' } | { phase: 'error'; error: TvJoinUiError };

/** A guest with no Firebase user yet gets an anonymous one (the app's own guest sign-in) — no sign-in wall for joiners. */
async function currentUid(): Promise<string | null> {
  if (!auth.currentUser) {
    const { signInGuest } = await import('@/lib/auth.service');
    await signInGuest();
  }
  return auth.currentUser?.uid ?? null;
}

/**
 * Enter a code from this phone. The first SIGNED-IN phone on a free session becomes host (and attaches
 * the workout from the overview it came from); everyone else — accounts and guests (nickname, Kahoot
 * style) — is a participant. A guest can never host.
 */
export function useTvJoin(repo: TvSessionRepo = getTvRepo()) {
  const [state, setState] = useState<JoinState>({ phase: 'idle' });
  const t = useT(wide);
  const profile = useUserStore((s) => s.profile);
  const gender = useLocaleStore((s) => s.gender);
  const fallbackName = t('lobby.noName');

  const join = useCallback(
    async (code: string, pending: TvPending | null, nickname = ''): Promise<TvJoinResult | null> => {
      setState({ phase: 'joining' });
      const uid = await currentUid().catch(() => null);
      if (!uid) {
        setState({ phase: 'error', error: 'unknown' });
        return null;
      }
      const identity = identityOf(auth.currentUser);
      const plan = planJoin({ identity, accountName: profile?.core?.name ?? '', nickname, fallbackName });
      if (!plan.ok) {
        setState({ phase: 'error', error: plan.error });
        return null;
      }
      const res = await repo.join(code, { uid, name: plan.name, gender, guest: plan.guest, avatar: defaultAvatar(uid) });
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
      if (plan.guest) saveNickname(plan.name);
      saveConnection(code, res.role, plan.guest ? plan.name : undefined);
      useTvPhoneStore.getState().setConnected(code, res.role);
      setState({ phase: 'idle' });
      return res;
    },
    [repo, profile?.core?.name, gender, fallbackName],
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
