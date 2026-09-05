'use client';

import { useEffect } from 'react';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { getMyPendingUnits } from '@/features/user/onboarding/services/pending-unit.service';

/**
 * "Reject with redirect" and "approve" both resolve a pending_units doc to a
 * real target unit (resolvedTo) — this is the one place that reacts to
 * either, on the user's own device, no admin-side reassignment script:
 * one document, one user, at a time. A rejection with NO resolvedTo needs
 * no write at all — the user's real declaration was never touched while the
 * submission sat pending (only the parent level they already had), so
 * "falling back one level" is already their current state.
 *
 * One-time check on mount/login, not a live listener — a resolution the
 * user hasn't seen yet is fine to pick up on next load (same staleness
 * tolerance the unit-league rollup's own hourly cadence already has).
 */
export function usePendingUnitSelfHeal(): void {
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      if (!user) return;
      selfHeal(user.uid).catch((err) => console.error('[usePendingUnitSelfHeal]', err));
    });
    return unsub;
  }, []);
}

async function selfHeal(uid: string): Promise<void> {
  const pending = await getMyPendingUnits(uid);
  const resolved = pending.filter((p) => p.status === 'approved' && p.resolvedTo);
  if (resolved.length === 0) return;

  const declRef = doc(db, 'military_declarations', uid);
  const declSnap = await getDoc(declRef);
  const decl = declSnap.data() ?? {};
  const currentUnitPathIds: string[] = Array.isArray(decl.unitPathIds) ? decl.unitPathIds : [];

  for (const p of resolved) {
    const resolvedTo = p.resolvedTo as string;

    if (p.level === 'brigade') {
      if (decl.orgId === resolvedTo) continue; // already self-healed
      await updateDoc(declRef, { orgId: resolvedTo, updatedAt: serverTimestamp() });
      continue;
    }

    // battalion/company: append to unitPathIds (own real orgId/parent chain
    // was never touched while pending — it's already correct), set unitId
    // to the newly-resolved deepest level. Mutate currentUnitPathIds in
    // place so a second resolved doc in this same pass sees the update.
    if (currentUnitPathIds.includes(resolvedTo) && decl.unitId === resolvedTo) continue; // already self-healed
    if (!currentUnitPathIds.includes(resolvedTo)) currentUnitPathIds.push(resolvedTo);
    await updateDoc(declRef, { unitId: resolvedTo, unitPathIds: currentUnitPathIds, updatedAt: serverTimestamp() });
  }
}
