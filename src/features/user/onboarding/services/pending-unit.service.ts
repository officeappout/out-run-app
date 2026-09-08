'use client';

import { collection, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, setDoc, where, type Unsubscribe } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { computeUnitId, type UnitLevel } from '@/lib/unit-id';

type PendingUnitLevel = UnitLevel;

export interface PendingUnitDoc {
  id: string;
  submittedBy: string;
  level: PendingUnitLevel;
  orgId: string | null;
  parentUnitId: string | null;
  parentUnitPath: string[];
  proposedName: string;
  computedUnitId: string;
  status: 'pending' | 'approved' | 'rejected';
  resolvedTo: string | null;
}

export interface SubmitPendingUnitInput {
  level: PendingUnitLevel;
  orgId: string | null;
  parentUnitId: string | null;
  parentUnitPath: string[];
  name: string;
}

/**
 * Creates a new pending_units doc, id'd by computePendingUnitId so a second
 * submission of the same name under the same parent lands on the SAME doc
 * (idempotent by construction) rather than a duplicate pending entry.
 * Never checks for an existing REAL sibling — that's the caller's job
 * (HierarchySearchStep's dedup-before-submit, against already-fetched
 * unitDirectory entries) so a real match never creates a pending doc at all.
 */
export async function submitPendingUnit(uid: string, input: SubmitPendingUnitInput): Promise<PendingUnitDoc> {
  const name = input.name.trim();
  if (!name) throw new Error('submitPendingUnit: name is required');

  // A Task 2 submission never has a real military designator number — a
  // soldier only ever types a name — so this always takes computeUnitId's
  // hash branch, ASCII-safe by construction (05.09.2026 fix: the previous
  // co_<parent>_<raw-hebrew-slug> convention silently never triggered
  // onUnitWrite — same root cause as Task 1's bn_u_<hebrew-slug> incident).
  const computedUnitId = computeUnitId({
    level: input.level,
    parentScope: input.level === 'company' ? input.parentUnitId : input.orgId,
    name,
  });

  const ref = doc(db, 'pending_units', computedUnitId);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    return { id: existing.id, ...(existing.data() as Omit<PendingUnitDoc, 'id'>) };
  }

  const data = {
    submittedBy: uid,
    level: input.level,
    orgId: input.orgId,
    parentUnitId: input.parentUnitId,
    parentUnitPath: input.parentUnitPath,
    proposedName: name,
    computedUnitId,
    status: 'pending' as const,
    resolvedTo: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, data);
  return { id: computedUnitId, ...data };
}

/** One-time read of the current user's own pending submissions — used by the
 *  self-heal check on load, not a live subscription (a resolution the user
 *  hasn't seen yet is fine to pick up on next load, same tolerance as the
 *  unit-league rollup's own hourly cadence). */
export async function getMyPendingUnits(uid: string): Promise<PendingUnitDoc[]> {
  const snap = await getDocs(query(collection(db, 'pending_units'), where('submittedBy', '==', uid)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PendingUnitDoc, 'id'>) }));
}

export function subscribeToMyPendingUnits(uid: string, onChange: (docs: PendingUnitDoc[]) => void): Unsubscribe {
  return onSnapshot(query(collection(db, 'pending_units'), where('submittedBy', '==', uid)), (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PendingUnitDoc, 'id'>) })));
  });
}
