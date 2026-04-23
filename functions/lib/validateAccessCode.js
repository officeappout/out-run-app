"use strict";
/**
 * validateAccessCode — Callable Cloud Function (v2 API)
 *
 * Client calls via `httpsCallable(functions, 'validateAccessCode')({ code })`.
 * Explicitly pins to us-central1 to match the client SDK default.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateAccessCode = void 0;
const https_1 = require("firebase-functions/v2/https");
const firebase_functions_1 = require("firebase-functions");
const admin = __importStar(require("firebase-admin"));
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
exports.validateAccessCode = (0, https_1.onCall)({
    cors: true,
    region: 'us-central1',
}, async (request) => {
    var _a;
    firebase_functions_1.logger.info('[validateAccessCode] Function invoked');
    try {
        // ── Step 1: Auth check ──
        if (!request.auth) {
            firebase_functions_1.logger.warn('[validateAccessCode] No auth context');
            throw new https_1.HttpsError('unauthenticated', 'Must be signed in to validate an access code.');
        }
        const uid = request.auth.uid;
        firebase_functions_1.logger.info('[validateAccessCode] Authenticated uid:', uid);
        // ── Step 2: Input validation ──
        const rawCode = (_a = request.data) === null || _a === void 0 ? void 0 : _a.code;
        firebase_functions_1.logger.info('[validateAccessCode] Raw input:', JSON.stringify(request.data));
        if (!rawCode || typeof rawCode !== 'string' || rawCode.trim().length === 0) {
            throw new https_1.HttpsError('invalid-argument', 'Access code is required.');
        }
        const normalizedCode = rawCode.trim().toUpperCase();
        firebase_functions_1.logger.info('[validateAccessCode] Normalized code:', normalizedCode);
        // ── Step 3: Lookup — doc-ID first, then field query ──
        let codeRef = db.collection('access_codes').doc(normalizedCode);
        let snap = await codeRef.get();
        if (!snap.exists) {
            firebase_functions_1.logger.info('[validateAccessCode] Doc-ID lookup miss, trying field query...');
            const q = await db
                .collection('access_codes')
                .where('code', '==', normalizedCode)
                .limit(1)
                .get();
            if (!q.empty) {
                snap = q.docs[0];
                codeRef = snap.ref;
                firebase_functions_1.logger.info('[validateAccessCode] Found via field query, docId:', snap.id);
            }
            else {
                firebase_functions_1.logger.warn('[validateAccessCode] Code not found anywhere:', normalizedCode);
                throw new https_1.HttpsError('not-found', 'Access code not found.');
            }
        }
        else {
            firebase_functions_1.logger.info('[validateAccessCode] Found via doc-ID lookup');
        }
        // ── Step 4: Validate & transact ──
        const result = await db.runTransaction(async (tx) => {
            var _a;
            const freshSnap = await tx.get(codeRef);
            if (!freshSnap.exists) {
                throw new https_1.HttpsError('not-found', 'Access code document disappeared during transaction.');
            }
            const codeDoc = freshSnap.data();
            firebase_functions_1.logger.info('[validateAccessCode] Code data:', JSON.stringify({
                code: codeDoc.code,
                tenantId: codeDoc.tenantId,
                unitId: codeDoc.unitId,
                tenantType: codeDoc.tenantType,
                isActive: codeDoc.isActive,
                usageCount: codeDoc.usageCount,
                maxUses: codeDoc.maxUses,
                hasExpiry: !!codeDoc.expiresAt,
            }));
            if (!codeDoc.isActive) {
                throw new https_1.HttpsError('failed-precondition', 'This access code is no longer active.');
            }
            if (codeDoc.expiresAt && codeDoc.expiresAt.toDate() < new Date()) {
                throw new https_1.HttpsError('failed-precondition', 'This access code has expired.');
            }
            if (codeDoc.maxUses > 0 && codeDoc.usageCount >= codeDoc.maxUses) {
                throw new https_1.HttpsError('resource-exhausted', 'This access code has reached its maximum number of uses.');
            }
            // Fetch user display name (best-effort)
            let displayName = '';
            try {
                const userSnap = await tx.get(db.collection('users').doc(uid));
                if (userSnap.exists) {
                    const userData = userSnap.data();
                    displayName = ((_a = userData === null || userData === void 0 ? void 0 : userData.core) === null || _a === void 0 ? void 0 : _a.name) || (userData === null || userData === void 0 ? void 0 : userData.displayName) || '';
                }
            }
            catch (e) {
                firebase_functions_1.logger.warn('[validateAccessCode] Could not fetch displayName:', e);
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
            tx.set(userRef, {
                core: {
                    tenantId: codeDoc.tenantId || '',
                    unitId: codeDoc.unitId || '',
                    unitPath: codeDoc.unitPath || [],
                    tenantType: codeDoc.tenantType || 'municipal',
                },
            }, { merge: true });
            firebase_functions_1.logger.info('[validateAccessCode] Transaction success — switched user', uid, 'to tenant:', codeDoc.tenantId, 'unit:', codeDoc.unitId);
            return {
                tenantId: codeDoc.tenantId || '',
                unitId: codeDoc.unitId || '',
                unitPath: codeDoc.unitPath || [],
                tenantType: codeDoc.tenantType || 'municipal',
                onboardingPath: codeDoc.onboardingPath || 'MUNICIPAL_JOIN',
            };
        });
        firebase_functions_1.logger.info('[validateAccessCode] Returning result for code:', normalizedCode);
        return result;
    }
    catch (err) {
        if (err instanceof https_1.HttpsError) {
            firebase_functions_1.logger.warn('[validateAccessCode] HttpsError:', err.code, err.message);
            throw err;
        }
        firebase_functions_1.logger.error('[validateAccessCode] Unexpected error:', err === null || err === void 0 ? void 0 : err.message, err === null || err === void 0 ? void 0 : err.stack);
        throw new https_1.HttpsError('internal', (err === null || err === void 0 ? void 0 : err.message) || 'Internal error validating access code.');
    }
});
//# sourceMappingURL=validateAccessCode.js.map