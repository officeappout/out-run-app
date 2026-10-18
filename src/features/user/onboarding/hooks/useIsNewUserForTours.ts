'use client';

/**
 * useIsNewUserForTours — the first-run tours are for NEW users only (owner, 18.10.2026).
 * Account age from Firebase Auth `metadata.creationTime` (≤ 14 days → new); if that's missing,
 * fall back to Gate 1 (`hasEverTrained` — never trained → new). Returns null while unknown.
 * `enabled` false → no work at all (no Firestore read), returns null.
 */
import { useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';
import { useUserStore } from '../../identity/store/useUserStore';
import { hasEverTrained } from '../services/entry-router-gate1.service';
import { isNewUserForTours, toCreationMs } from '../services/first-run-tour';

export function useIsNewUserForTours(enabled: boolean): boolean | null {
  const uid = useUserStore((s) => s.profile?.id);
  const workoutCount = useUserStore((s) => s.profile?.progression?.workoutCount);
  const [isNew, setIsNew] = useState<boolean | null>(null);

  useEffect(() => {
    if (!enabled || !uid) { setIsNew(null); return; }
    const authUser = auth.currentUser;
    const createdAtMs = authUser && authUser.uid === uid ? toCreationMs(authUser.metadata?.creationTime) : null;
    const direct = isNewUserForTours({ createdAtMs, nowMs: Date.now(), everTrained: null });
    if (direct !== null) { setIsNew(direct); return; }
    let alive = true;
    void hasEverTrained(uid, workoutCount).then((trained) => {
      if (alive) setIsNew(isNewUserForTours({ createdAtMs: null, nowMs: Date.now(), everTrained: trained }));
    });
    return () => { alive = false; };
  }, [enabled, uid, workoutCount]);

  return isNew;
}
