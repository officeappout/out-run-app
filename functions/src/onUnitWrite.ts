/**
 * Cloud Function: onUnitWrite
 *
 * Triggers on any create/delete in tenants/{tenantId}/units/{unitId}.
 * Recounts all units in the subcollection and updates unitCount on both
 * the `tenants` and `authorities` root documents.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

export const onUnitWrite = functions.firestore
  .document('tenants/{tenantId}/units/{unitId}')
  .onWrite(async (_change, context) => {
    const { tenantId } = context.params;

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
    functions.logger.info(`[onUnitWrite] Updated unitCount for ${tenantId}: ${count}`);
  });
