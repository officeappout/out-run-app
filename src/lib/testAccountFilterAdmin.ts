/**
 * testAccountFilterAdmin.ts — Admin-SDK counterpart to testAccountFilter.ts,
 * for routes that only need a NUMBER (not the actual docs) and can use
 * cheap count() aggregation queries instead of a full collection scan.
 *
 * isMockData and isTestData are guaranteed disjoint — mark-test-accounts.ts's
 * protection rules never mark an already-isMockData doc — so straight
 * subtraction (not inclusion-exclusion) is correct. Firestore's `!=` would
 * wrongly exclude every doc where the field is simply absent (the vast
 * majority of real residents never set either flag), so this counts the
 * two exclusion sets with positive `== true` filters and subtracts them,
 * same pattern already established in city-summary/route.ts before this
 * file existed.
 */
import type { Query } from 'firebase-admin/firestore';

export async function countExcludingTestAndMock(baseQuery: Query): Promise<number> {
  const [totalSnap, mockSnap, testSnap] = await Promise.all([
    baseQuery.count().get(),
    baseQuery.where('core.isMockData', '==', true).count().get(),
    baseQuery.where('core.isTestData', '==', true).count().get(),
  ]);
  return totalSnap.data().count - mockSnap.data().count - testSnap.data().count;
}
