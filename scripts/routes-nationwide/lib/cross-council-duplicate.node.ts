/**
 * Cross-authority duplicate check for the nationwide runner (owner 22.10.2026).
 * Logic lives in src/lib/routes-nationwide/cross-council.ts (tested); this file
 * only supplies the read-only Firestore reader (single-field equality query).
 */
import type { Firestore } from 'firebase-admin/firestore';
import { makeCrossCouncilDuplicate } from '../../../src/lib/routes-nationwide';
import { readOfficialRoutesByName } from '../../lib/route-collections-read.node';

export function crossCouncilDuplicate(db: Firestore, authorityId: string, authorityName: string) {
  return makeCrossCouncilDuplicate({ readByName: (name) => readOfficialRoutesByName(db, name, authorityId), authorityName });
}
