'use client';

/**
 * useGroupMembershipReconciliation
 *
 * Runs once per login session (keyed on uid) after the user store hydrates.
 * Queries community_groups where createdBy === uid and compares the results
 * against social.groupIds.  Any groupId present in the query but missing from
 * social.groupIds is fixed via /api/social/group-membership (Admin SDK write).
 *
 * Root cause being fixed:
 *   createGroup calls updateSocialGroupIds inside a non-throwing catch block.
 *   If that API call fails at creation time, social.groupIds never gets the
 *   groupId → creator gets PERMISSION-DENIED on all group-mode presence reads.
 *
 * Two-layer defence:
 *   1. session-start guard (useWorkoutPresence) — immediate fix at session open.
 *   2. this hook                                — login-time fix for older records.
 *
 * Firestore rule for community_groups: allow read if isAuthenticated() (line 920)
 * so the query by createdBy works for any logged-in user.
 */

import { useEffect, useRef } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { updateSocialGroupIds } from '@/features/arena/services/group.service';

export function useGroupMembershipReconciliation(): void {
  const uid = useUserStore((s) => s.profile?.id);
  const hasHydrated = useUserStore((s) => s._hasHydrated);

  // Prevent double-run under React StrictMode double-invoke and across re-renders.
  const hasRanFor = useRef<string | null>(null);

  useEffect(() => {
    if (!hasHydrated || !uid) return;
    if (hasRanFor.current === uid) return;
    hasRanFor.current = uid;

    // Snapshot groupIds at effect run time (login) — don't re-read inside the
    // async fn so we don't race against a concurrent profile refresh.
    const storedGroupIds: string[] =
      useUserStore.getState().profile?.social?.groupIds ?? [];

    void (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'community_groups'), where('createdBy', '==', uid)),
        );

        const missing = snap.docs
          .map((d) => d.id)
          .filter((id) => !storedGroupIds.includes(id));

        if (missing.length === 0) {
          console.info(
            `[GroupReconciliation] uid=${uid}: ` +
            `all ${snap.docs.length} created group(s) already in social.groupIds — nothing to fix`,
          );
          return;
        }

        console.info(
          `[GroupReconciliation] uid=${uid}: ` +
          `${missing.length} groupId(s) missing from social.groupIds — fixing:`,
          missing,
        );

        let fixedCount = 0;
        for (const groupId of missing) {
          try {
            await updateSocialGroupIds(uid, groupId, 'join');
            console.info(`[GroupReconciliation] ✓ fixed groupId=${groupId}`);
            fixedCount++;
          } catch (err) {
            console.error(`[GroupReconciliation] ✗ failed groupId=${groupId}:`, err);
          }
        }

        if (fixedCount > 0) {
          useUserStore.getState().refreshProfile().catch(() => {});
        }
      } catch (err) {
        console.error('[GroupReconciliation] query failed:', err);
      }
    })();
  }, [uid, hasHydrated]);
}
