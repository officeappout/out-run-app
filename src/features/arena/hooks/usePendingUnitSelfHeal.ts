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
  // Plain local snapshot, kept in sync across loop iterations below (not a
  // Firestore doc) — so a second resolved doc in the same pass sees the
  // first iteration's write without a redundant re-read.
  const decl: { orgId?: string; unitId?: string; unitPathIds?: string[] } = declSnap.data() ?? {};

  for (const p of resolved) {
    const resolvedTo = p.resolvedTo as string;

    if (p.level === 'brigade') {
      if (decl.orgId === resolvedTo) continue; // already self-healed
      await updateDoc(declRef, { orgId: resolvedTo, updatedAt: serverTimestamp() });
      decl.orgId = resolvedTo;
      continue;
    }

    // battalion/company: REBUILD unitPathIds fresh from the pending doc's
    // own known parent chain (p.parentUnitId for a company, none for a
    // battalion — same convention selectEntry's onChange already uses) —
    // never append onto whatever the declaration already had.
    //
    // 07.09.2026 — appending was the actual bug, confirmed against real
    // production data: a user who changed units (company A -> company H)
    // ended up with BOTH ids in unitPathIds (["battalion","companyA",
    // "companyH"]), because the old append-based write only ever ADDED the
    // newly-resolved id and never dropped the stale sibling from a PRIOR
    // affiliation. getDeclaredCounts (military-declared.service.ts) counts
    // a declaration under every id in unitPathIds — correct for a genuine
    // ancestor chain, but it silently double-counted this one person under
    // two different (sibling) companies as a result. selectEntry's own
    // onChange (HierarchySearchStep.tsx) was checked and does NOT have this
    // bug — it already rebuilds unitPathIds fresh from the current drilling
    // session's breadcrumb every time, never merged with a prior value.
    const freshUnitPathIds = p.level === 'company' && p.parentUnitId
      ? [p.parentUnitId, resolvedTo]
      : [resolvedTo];
    const alreadyHealed = decl.unitId === resolvedTo
      && Array.isArray(decl.unitPathIds)
      && decl.unitPathIds.length === freshUnitPathIds.length
      && decl.unitPathIds.every((id, i) => id === freshUnitPathIds[i]);
    if (alreadyHealed) continue;
    await updateDoc(declRef, { unitId: resolvedTo, unitPathIds: freshUnitPathIds, updatedAt: serverTimestamp() });
    decl.unitId = resolvedTo;
    decl.unitPathIds = freshUnitPathIds;
  }
}
