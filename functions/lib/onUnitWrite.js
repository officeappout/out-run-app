"use strict";
/**
 * Cloud Function: onUnitWrite
 *
 * Triggers on any create/delete in tenants/{tenantId}/units/{unitId}.
 * Recounts all units in the subcollection and updates unitCount on both
 * the `tenants` and `authorities` root documents.
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
exports.onUnitWrite = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
exports.onUnitWrite = functions.firestore
    .document('tenants/{tenantId}/units/{unitId}')
    .onWrite(async (_change, context) => {
    const { tenantId } = context.params;
    const unitsSnap = await db.collection('tenants').doc(tenantId).collection('units').get();
    const count = unitsSnap.size;
    const updates = [];
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (tenantDoc.exists) {
        updates.push(db.collection('tenants').doc(tenantId).update({
            unitCount: count,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }));
    }
    const authDoc = await db.collection('authorities').doc(tenantId).get();
    if (authDoc.exists) {
        updates.push(db.collection('authorities').doc(tenantId).update({
            unitCount: count,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }));
    }
    await Promise.all(updates);
    functions.logger.info(`[onUnitWrite] Updated unitCount for ${tenantId}: ${count}`);
});
//# sourceMappingURL=onUnitWrite.js.map