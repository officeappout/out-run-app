'use client';

/**
 * useGroupMembershipReconciliation
 *
 * Runs once per login session (keyed on uid) after the user store hydrates.
 * Two jobs:
 *
 * Job A — fix missing groupIds in users.social.groupIds:
 *   Queries community_groups where createdBy === uid.  Any groupId present
 *   in the query but missing from social.groupIds is added via the
 *   group-membership API (dual-writes users + user_memberships atomically).
 *
 * Job B — backfill user_memberships/{uid}:
 *   Calls /api/social/sync-user-memberships so the lean membership document
 *   (read by Firestore Rules instead of the >1 MiB user doc) exists and is
 *   in sync with users.social.groupIds.  Idempotent — a no-op once in sync.
 *   This fixes the root cause of PERMISSION-DENIED for owners with large
 *   user profiles: Rules get(users/{uid}) silently returns null when the doc
 *   exceeds ~1 MiB, making hasAny(groupIds) = false even when the field is set.
 *
 * Three-layer defence:
 *   1. session-start guard (useWorkoutPresence) — immediate, scoped to active session.
 *   2. this hook (Job A + B)                   — login-time sweep, all created groups.
 *   3. POST /api/social/reconcile-group-membership — admin-triggered bulk fix.
 */

import { useEffect, useRef } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { auth } from '@/lib/firebase';
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
      // ── Job A: fix missing groupIds in users.social.groupIds ────────────────
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
            `all ${snap.docs.length} created group(s) present in social.groupIds`,
          );
        } else {
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
        }
      } catch (err) {
        console.error('[GroupReconciliation] Job A (community_groups query) failed:', err);
      }

      // ── Job B: backfill user_memberships/{uid} ──────────────────────────────
      // Ensures the lean doc used by Firestore Rules get() exists and is in sync.
      // Safe to call every login — the endpoint is idempotent (set+merge).
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) {
          console.warn('[GroupReconciliation] Job B skipped — no auth token');
          return;
        }

        const res = await fetch('/api/social/sync-user-memberships', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const { synced } = await res.json() as { synced: number };
          console.info(
            `[GroupReconciliation] Job B ✓ user_memberships synced — ${synced} groupId(s)`,
          );
        } else {
          const body = await res.json().catch(() => ({})) as { error?: string };
          console.error(
            '[GroupReconciliation] Job B ✗ sync-user-memberships failed:',
            body?.error ?? res.status,
          );
        }
      } catch (err) {
        console.error('[GroupReconciliation] Job B (sync-user-memberships) failed:', err);
      }
    })();
  }, [uid, hasHydrated]);
}
