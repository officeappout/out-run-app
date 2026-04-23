"use strict";
/**
 * Pillar 3 — Cloud Function: onGroupMemberWrite
 *
 * Triggered on any write to community_groups/{groupId}/members/{uid}.
 *
 * Two jobs:
 *  1. Keep memberCount on the parent group in sync.
 *  2. Activate group (isActive = true) when memberCount >= minimumMembers.
 *
 * Anti-ghost scheduled function (deleteZombieGroups) runs once per day
 * and deletes groups where isActive=false and createdAt < 24h ago.
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
exports.deleteZombieGroups = exports.onGroupMemberWrite = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
// ─── onGroupMemberWrite ───────────────────────────────────────────────────────
exports.onGroupMemberWrite = functions.firestore
    .document('community_groups/{groupId}/members/{uid}')
    .onWrite(async (_change, context) => {
    var _a;
    const { groupId } = context.params;
    const groupRef = db.doc(`community_groups/${groupId}`);
    const membersSnap = await db
        .collection(`community_groups/${groupId}/members`)
        .get();
    const count = membersSnap.size;
    const groupSnap = await groupRef.get();
    if (!groupSnap.exists)
        return null;
    const group = groupSnap.data();
    const minimumMembers = (_a = group.minimumMembers) !== null && _a !== void 0 ? _a : 1;
    const updates = {
        memberCount: count,
        currentParticipants: count,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (!group.isActive && count >= minimumMembers) {
        updates.isActive = true;
        console.log(`[onGroupMemberWrite] Activating group ${groupId} (${count}/${minimumMembers} members)`);
    }
    return groupRef.update(updates);
});
// ─── deleteZombieGroups ───────────────────────────────────────────────────────
/**
 * Runs every day at 03:00 UTC.
 * Deletes community groups that are still inactive 24 hours after creation.
 * This prevents orphaned "ghost" groups from cluttering the DB.
 */
exports.deleteZombieGroups = functions.pubsub
    .schedule('0 3 * * *')
    .timeZone('UTC')
    .onRun(async () => {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const zombies = await db
        .collection('community_groups')
        .where('isActive', '==', false)
        .where('createdAt', '<', cutoff)
        .get();
    if (zombies.empty) {
        console.log('[deleteZombieGroups] No zombie groups found.');
        return null;
    }
    const batch = db.batch();
    zombies.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    console.log(`[deleteZombieGroups] Deleted ${zombies.size} zombie groups.`);
    return null;
});
//# sourceMappingURL=onGroupMemberWrite.js.map