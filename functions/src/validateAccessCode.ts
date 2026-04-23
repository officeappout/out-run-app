/**
 * validateAccessCode — Callable Cloud Function (v2 API)
 *
 * Client calls via `httpsCallable(functions, 'validateAccessCode')({ code })`.
 * Explicitly pins to us-central1 to match the client SDK default.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

interface AccessCodeDoc {
  code: string;
  tenantId: string;
  unitId: string;
  unitPath: string[];
  tenantType: 'municipal' | 'educational' | 'military';
  onboardingPath: string;
  isActive: boolean;
  usageCount: number;
  maxUses: number;
  expiresAt: admin.firestore.Timestamp | null;
}

export const validateAccessCode = onCall(
  {
    cors: true,
    region: 'us-central1',
    // App Check enforcement (Ashkelon Req. 22.1).
    enforceAppCheck: true,
  },
  async (request) => {
    logger.info('[validateAccessCode] Function invoked');

    try {
      // ── Step 1: Auth check ──
      if (!request.auth) {
        logger.warn('[validateAccessCode] No auth context');
        throw new HttpsError('unauthenticated', 'Must be signed in to validate an access code.');
      }

      const uid = request.auth.uid;
      logger.info('[validateAccessCode] Authenticated uid:', uid);

      // ── Step 2: Input validation ──
      // PII / credential hygiene: never dump request.data — it contains
      // the access code itself, which is a bearer credential. We log
      // only the normalized code length and the validation outcome.
      const rawCode = request.data?.code;
      logger.info(
        '[validateAccessCode] Code received (len=%d)',
        typeof rawCode === 'string' ? rawCode.length : 0,
      );

      if (!rawCode || typeof rawCode !== 'string' || rawCode.trim().length === 0) {
        throw new HttpsError('invalid-argument', 'Access code is required.');
      }

      const normalizedCode = rawCode.trim().toUpperCase();

      // ── Step 3: Lookup — doc-ID first, then field query ──
      let codeRef = db.collection('access_codes').doc(normalizedCode);
      let snap = await codeRef.get();

      if (!snap.exists) {
        logger.info('[validateAccessCode] Doc-ID lookup miss, trying field query');
        const q = await db
          .collection('access_codes')
          .where('code', '==', normalizedCode)
          .limit(1)
          .get();

        if (!q.empty) {
          snap = q.docs[0];
          codeRef = snap.ref;
          // Log opaque doc id only — never the code value.
          logger.info('[validateAccessCode] Found via field query (docId len=%d)', snap.id.length);
        } else {
          // Do not echo the failed code into logs.
          logger.warn('[validateAccessCode] Code not found');
          throw new HttpsError('not-found', 'Access code not found.');
        }
      } else {
        logger.info('[validateAccessCode] Found via doc-ID lookup');
      }

      // ── Step 4: Validate & transact ──
      const result = await db.runTransaction(async (tx) => {
        const freshSnap = await tx.get(codeRef);
        if (!freshSnap.exists) {
          throw new HttpsError('not-found', 'Access code document disappeared during transaction.');
        }

        const codeDoc = freshSnap.data() as AccessCodeDoc;
        // Log only non-credential metadata. Never log codeDoc.code.
        logger.info('[validateAccessCode] Code metadata: %j', {
          tenantId: codeDoc.tenantId,
          unitId: codeDoc.unitId,
          tenantType: codeDoc.tenantType,
          isActive: codeDoc.isActive,
          usageCount: codeDoc.usageCount,
          maxUses: codeDoc.maxUses,
          hasExpiry: !!codeDoc.expiresAt,
        });

        if (!codeDoc.isActive) {
          throw new HttpsError('failed-precondition', 'This access code is no longer active.');
        }
        if (codeDoc.expiresAt && codeDoc.expiresAt.toDate() < new Date()) {
          throw new HttpsError('failed-precondition', 'This access code has expired.');
        }
        if (codeDoc.maxUses > 0 && codeDoc.usageCount >= codeDoc.maxUses) {
          throw new HttpsError('resource-exhausted', 'This access code has reached its maximum number of uses.');
        }

        // Fetch user display name (best-effort)
        let displayName = '';
        try {
          const userSnap = await tx.get(db.collection('users').doc(uid));
          if (userSnap.exists) {
            const userData = userSnap.data();
            displayName = userData?.core?.name || userData?.displayName || '';
          }
        } catch (e) {
          logger.warn('[validateAccessCode] Could not fetch displayName:', e);
        }

        // Update code usage
        tx.update(codeRef, {
          usageCount: admin.firestore.FieldValue.increment(1),
          lastUsedByUid: uid,
          lastUsedByDisplayName: displayName || uid,
          lastUsedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Switch user to the code's organization
        const userRef = db.collection('users').doc(uid);
        tx.set(
          userRef,
          {
            core: {
              tenantId: codeDoc.tenantId || '',
              unitId: codeDoc.unitId || '',
              unitPath: codeDoc.unitPath || [],
              tenantType: codeDoc.tenantType || 'municipal',
            },
          },
          { merge: true }
        );

        logger.info('[validateAccessCode] Transaction success — switched user', uid,
          'to tenant:', codeDoc.tenantId, 'unit:', codeDoc.unitId);

        return {
          tenantId: codeDoc.tenantId || '',
          unitId: codeDoc.unitId || '',
          unitPath: codeDoc.unitPath || [],
          tenantType: codeDoc.tenantType || 'municipal',
          onboardingPath: codeDoc.onboardingPath || 'MUNICIPAL_JOIN',
        };
      });

      logger.info('[validateAccessCode] Validation success (uid=%s)', uid);
      return result;
    } catch (err: any) {
      if (err instanceof HttpsError) {
        logger.warn('[validateAccessCode] HttpsError:', err.code, err.message);
        throw err;
      }
      logger.error('[validateAccessCode] Unexpected error:', err?.message, err?.stack);
      throw new HttpsError('internal', err?.message || 'Internal error validating access code.');
    }
  }
);
