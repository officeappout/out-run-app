/**
 * Cloud Function: onUnitWrite
 *
 * Triggers on any create/delete in tenants/{tenantId}/units/{unitId}.
 * Recounts all units in the subcollection and updates unitCount on both
 * the `tenants` and `authorities` root documents.
 *
 * Phase 3a (02.09.2026) also extends this trigger to keep `unitDirectory`
 * (a read-only public search index — see docs/research/
 * military-persona-unified-architecture.md, §3a) in sync with this
 * subcollection. `unitDirectory` is the ONLY place a self-declaring user
 * with no verified tenant relationship can browse unit names — reading
 * `tenants/{tenantId}/units` directly requires `hasTenant(tenantId)`
 * (firestore.rules), which such a user by definition doesn't have.
 * `unitDirectory` entries contain name/level/parentId/orgId/armType/
 * statusCategory ONLY — never people, never membership.
 */

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// tenants/{orgId}/units/{unitId} IDs are only unique WITHIN a tenant's
// subcollection (unit-import.service.ts's `slug_${4-char-random}`) — two
// different brigades could theoretically mint the same raw unitId. The
// composite directoryId below is what keeps unitDirectory collision-free.
function directoryIdForUnit(tenantId: string, unitId: string): string {
  return `${tenantId}__${unitId}`;
}

function levelForUnitPath(unitPath: unknown): 'battalion' | 'company' | 'platoon' {
  const depth = Array.isArray(unitPath) ? unitPath.length : 1;
  if (depth <= 1) return 'battalion';
  if (depth === 2) return 'company';
  return 'platoon'; // documented fallback — no unit in production goes past company today
}

export const onUnitWrite = onDocumentWritten(
  'tenants/{tenantId}/units/{unitId}',
  async (event) => {
    const { tenantId, unitId } = event.params;

    const unitsSnap = await db.collection('tenants').doc(tenantId).collection('units').get();
    const count = unitsSnap.size;

    const updates: Promise<any>[] = [];

    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (tenantDoc.exists) {
      updates.push(
        db.collection('tenants').doc(tenantId).update({
          unitCount: count,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }),
      );
    }

    const authDoc = await db.collection('authorities').doc(tenantId).get();
    if (authDoc.exists) {
      updates.push(
        db.collection('authorities').doc(tenantId).update({
          unitCount: count,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }),
      );
    }

    await Promise.all(updates);
    logger.info(`[onUnitWrite] Updated unitCount for ${tenantId}: ${count}`);

    // ── unitDirectory sync (Phase 3a) ──────────────────────────────────
    const directoryId = directoryIdForUnit(tenantId, unitId);
    const afterExists = event.data?.after?.exists ?? false;

    if (!afterExists) {
      await db.collection('unitDirectory').doc(directoryId).delete().catch(() => {
        // Already absent — fine, deletes are idempotent here.
      });
      logger.info(`[onUnitWrite] Deleted unitDirectory entry ${directoryId}`);
      return;
    }

    const unitData = event.data!.after.data() as Record<string, unknown>;
    const name = typeof unitData.name === 'string' ? unitData.name.trim() : '';

    if (!name) {
      // Skip-rule: never publish an unnamed entry into a collection every
      // unauthenticated client can read. Matches the orphan-org lesson
      // from the org-data-integrity work (tenants/TUOYvWWA9b8XetYfT6OA).
      await db.collection('unitDirectory').doc(directoryId).delete().catch(() => {});
      logger.warn(`[onUnitWrite] Skipping unitDirectory sync for ${directoryId} — no name`);
      return;
    }

    const authorityData = authDoc.exists ? (authDoc.data() as Record<string, unknown>) : {};
    const parentUnitId = typeof unitData.parentUnitId === 'string' ? unitData.parentUnitId : null;

    await db.collection('unitDirectory').doc(directoryId).set({
      name,
      parentId: parentUnitId ? directoryIdForUnit(tenantId, parentUnitId) : tenantId,
      level: levelForUnitPath(unitData.unitPath),
      orgId: tenantId,
      unitId,
      armType: typeof authorityData.armType === 'string' ? authorityData.armType : null,
      statusCategory: typeof authorityData.statusCategory === 'string' ? authorityData.statusCategory : null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    logger.info(`[onUnitWrite] Synced unitDirectory entry ${directoryId}`);
  },
);
