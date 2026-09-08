import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * Reads from military_declarations (self-declared, unverified) — deliberately
 * NOT core.unitId/core.tenantId (verified, requires a real access code, which
 * nothing issues today). Shared by the units list page (per-unit + brigade
 * totals) and the unit detail page (member roster) — same underlying data,
 * two different shapes, one query pattern (05.09.2026, David's panel review).
 */

export interface DeclaredCounts {
  brigadeTotal: number;
  byUnitId: Record<string, number>;
}

/** All declarations under a brigade, counted per unit (any status — regular/
 *  career/reserve can all declare a unit, unlike the reservist-only unit-league). */
export async function getDeclaredCounts(orgId: string): Promise<DeclaredCounts> {
  const snap = await getDocs(query(collection(db, 'military_declarations'), where('orgId', '==', orgId)));
  const byUnitId: Record<string, number> = {};
  snap.forEach((d) => {
    const data = d.data();
    const unitPathIds: string[] = Array.isArray(data.unitPathIds) ? data.unitPathIds : [];
    unitPathIds.forEach((uid) => { byUnitId[uid] = (byUnitId[uid] ?? 0) + 1; });
  });
  return { brigadeTotal: snap.size, byUnitId };
}

/** UIDs of every user who declared this specific unit (battalion or company —
 *  military_declarations/{uid}'s OWN doc id IS the uid, no separate field). */
export async function getDeclaredMemberUids(unitId: string): Promise<string[]> {
  const snap = await getDocs(query(collection(db, 'military_declarations'), where('unitPathIds', 'array-contains', unitId)));
  return snap.docs.map((d) => d.id);
}
