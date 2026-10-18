'use client';

/**
 * useAiEntitlement — UI-ONLY view of "may this user use AI?" (OUT AI Phase 0).
 *
 * Mirrors the server gate (src/lib/ai/verify-ai-request.server.ts) so screens can hide or
 * show AI entry points, using the same pure resolver (canUseAi). It decides NOTHING: every AI
 * route re-checks auth, age, flags, entitlement, budget and rate limit on the server. Never
 * use this to skip a server call's error handling.
 *
 * Reads the real flag values (no super-admin override — the server ignores it too) and the
 * signed-in user's own entitlements/{uid} doc (owner-readable per firestore.rules).
 *
 * Usage: const { canUseAi, loading } = useAiEntitlement(user?.uid, profile?.core?.ageGroup === 'adult');
 */

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useFeatureFlags } from './useFeatureFlags';
import { canUseAi, type AiEntitlementDoc } from '@/lib/ai/ai-entitlement';

export function useAiEntitlement(
  uid: string | null | undefined,
  isAdult: boolean,
): { canUseAi: boolean; entitlement: AiEntitlementDoc | null; loading: boolean } {
  const { flags, loading: flagsLoading } = useFeatureFlags();
  const [entitlement, setEntitlement] = useState<AiEntitlementDoc | null>(null);
  const [entLoading, setEntLoading] = useState<boolean>(!!uid);

  useEffect(() => {
    if (!uid) {
      setEntitlement(null);
      setEntLoading(false);
      return;
    }
    setEntLoading(true);
    const unsubscribe = onSnapshot(
      doc(db, 'entitlements', uid),
      (snap) => {
        setEntitlement(snap.exists() ? (snap.data() as AiEntitlementDoc) : null);
        setEntLoading(false);
      },
      () => {
        // Fail closed in the UI too: no entitlement shown on a read error.
        setEntitlement(null);
        setEntLoading(false);
      },
    );
    return unsubscribe;
  }, [uid]);

  const allowed =
    !!uid &&
    isAdult &&
    canUseAi({
      flags: { aiCoachEnabled: flags.aiCoachEnabled, aiCoachFreeForAll: flags.aiCoachFreeForAll },
      entitlement,
    });

  return { canUseAi: allowed, entitlement, loading: flagsLoading || entLoading };
}
