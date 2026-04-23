/**
 * Syncs the unitCount field on both the `tenants/{id}` and `authorities/{id}`
 * documents by counting all docs in the `tenants/{id}/units` subcollection.
 *
 * Called client-side after unit creation or JSON import.
 */

import { collection, doc, getDocs, updateDoc, serverTimestamp, getDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getAllAuthorities } from './authority.service';

export async function syncTenantUnitCount(orgId: string): Promise<number> {
  if (!orgId) return 0;

  const unitsSnap = await getDocs(collection(db, 'tenants', orgId, 'units'));
  const count = unitsSnap.size;

  const updates: Promise<void>[] = [];

  const tenantRef = doc(db, 'tenants', orgId);
  const tenantSnap = await getDoc(tenantRef);
  if (tenantSnap.exists()) {
    updates.push(
      updateDoc(tenantRef, { unitCount: count, updatedAt: serverTimestamp() }),
    );
  }

  const authRef = doc(db, 'authorities', orgId);
  const authSnap = await getDoc(authRef);
  if (authSnap.exists()) {
    updates.push(
      updateDoc(authRef, { unitCount: count, updatedAt: serverTimestamp() }),
    );
  }

  await Promise.all(updates);
  return count;
}

/**
 * Recalculates unitCount for ALL authorities in a single pass.
 * Returns a map of orgId -> count.
 */
export async function syncAllUnitCounts(): Promise<Map<string, number>> {
  const authorities = await getAllAuthorities();
  const countMap = new Map<string, number>();

  const counts = await Promise.all(
    authorities.map(async (a) => {
      try {
        const snap = await getDocs(collection(db, 'tenants', a.id, 'units'));
        return { id: a.id, count: snap.size };
      } catch {
        return { id: a.id, count: 0 };
      }
    })
  );

  const BATCH_SIZE = 490;
  let batch = writeBatch(db);
  let batchCount = 0;

  for (const { id, count } of counts) {
    countMap.set(id, count);

    const authRef = doc(db, 'authorities', id);
    batch.update(authRef, { unitCount: count, updatedAt: serverTimestamp() });
    batchCount++;

    const tenantRef = doc(db, 'tenants', id);
    batch.set(tenantRef, { unitCount: count, updatedAt: serverTimestamp() }, { merge: true });
    batchCount++;

    if (batchCount >= BATCH_SIZE) {
      await batch.commit();
      batch = writeBatch(db);
      batchCount = 0;
    }
  }

  if (batchCount > 0) await batch.commit();

  return countMap;
}
