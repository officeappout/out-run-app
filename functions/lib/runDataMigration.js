"use strict";
/**
 * runDataMigration — One-time HTTP function to fix Hebrew document IDs.
 *
 * Scans tenants and units for Hebrew chars in doc IDs, creates clean
 * English replacements, and updates all access_codes + users references.
 *
 * Protected by a secret query parameter.
 *
 * Usage (after deploy):
 *   curl "https://<region>-<project>.cloudfunctions.net/runDataMigration?secret=dudu2026"
 *   curl "...?secret=dudu2026&dryRun=true"   # preview only
 *
 * IMPORTANT: Remove this function after the migration is complete.
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
exports.runDataMigration = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
const MIGRATION_SECRET = 'dudu2026';
const HEBREW_REGEX = /[\u0590-\u05FF]/;
function hasHebrew(s) {
    return HEBREW_REGEX.test(s);
}
function toEnglishId(hebrewId, prefix) {
    const stripped = hebrewId
        .replace(/[\u0590-\u05FF]+/g, '')
        .replace(/[^a-z0-9]/gi, '')
        .toLowerCase();
    const suffix = Math.random().toString(36).substring(2, 8);
    return stripped ? `${prefix}_${stripped}_${suffix}` : `${prefix}_${suffix}`;
}
exports.runDataMigration = functions
    .runWith({ timeoutSeconds: 300, memory: '512MB' })
    .https.onRequest(async (req, res) => {
    var _a, _b;
    const secret = req.query.secret || ((_a = req.body) === null || _a === void 0 ? void 0 : _a.secret);
    if (secret !== MIGRATION_SECRET) {
        res.status(403).send('Unauthorized');
        return;
    }
    const dryRun = (req.query.dryRun || ((_b = req.body) === null || _b === void 0 ? void 0 : _b.dryRun)) === 'true';
    const log = [];
    const output = [];
    const print = (msg) => {
        output.push(msg);
        functions.logger.info(msg);
    };
    print(dryRun ? '=== DRY RUN (no writes) ===' : '=== LIVE MIGRATION ===');
    try {
        // ─── 1. Migrate tenant doc IDs ──────────────────────────────
        print('\n📦 Scanning tenants...');
        const tenantsSnap = await db.collection('tenants').get();
        print(`   Found ${tenantsSnap.size} tenant(s) total.`);
        for (const tenantDoc of tenantsSnap.docs) {
            if (!hasHebrew(tenantDoc.id))
                continue;
            const newTenantId = toEnglishId(tenantDoc.id, 'tenant');
            print(`\n  ✏️  tenant "${tenantDoc.id}" → "${newTenantId}"`);
            log.push({ type: 'tenant', oldId: tenantDoc.id, newId: newTenantId });
            if (dryRun)
                continue;
            // Copy tenant doc
            await db.collection('tenants').doc(newTenantId).set(tenantDoc.data());
            // Copy units sub-collection (rename Hebrew unit IDs too)
            const unitsSnap = await db
                .collection('tenants').doc(tenantDoc.id)
                .collection('units').get();
            for (const unitDoc of unitsSnap.docs) {
                let unitNewId = unitDoc.id;
                if (hasHebrew(unitDoc.id)) {
                    unitNewId = toEnglishId(unitDoc.id, 'unit');
                    print(`    ✏️  unit "${unitDoc.id}" → "${unitNewId}"`);
                    log.push({ type: 'unit', oldId: unitDoc.id, newId: unitNewId });
                }
                const unitData = { ...unitDoc.data() };
                if (unitData.parentUnitId && hasHebrew(unitData.parentUnitId)) {
                    const oldParent = unitData.parentUnitId;
                    unitData.parentUnitId = toEnglishId(oldParent, 'unit');
                    print(`      🔗 parentUnitId "${oldParent}" → "${unitData.parentUnitId}"`);
                }
                await db
                    .collection('tenants').doc(newTenantId)
                    .collection('units').doc(unitNewId)
                    .set(unitData);
                // Update access_codes referencing old unitId
                if (hasHebrew(unitDoc.id)) {
                    const codesSnap = await db.collection('access_codes')
                        .where('unitId', '==', unitDoc.id).get();
                    for (const codeDoc of codesSnap.docs) {
                        print(`      🔑 access_code "${codeDoc.id}" unitId → "${unitNewId}"`);
                        await codeDoc.ref.update({ unitId: unitNewId });
                    }
                    const usersSnap = await db.collection('users')
                        .where('core.unitId', '==', unitDoc.id).get();
                    for (const userDoc of usersSnap.docs) {
                        print(`      👤 user "${userDoc.id}" unitId → "${unitNewId}"`);
                        await userDoc.ref.update({ 'core.unitId': unitNewId });
                    }
                }
            }
            // Update access_codes referencing old tenantId
            const tenantCodesSnap = await db.collection('access_codes')
                .where('tenantId', '==', tenantDoc.id).get();
            for (const codeDoc of tenantCodesSnap.docs) {
                print(`    🔑 access_code "${codeDoc.id}" tenantId → "${newTenantId}"`);
                await codeDoc.ref.update({ tenantId: newTenantId });
            }
            // Update users referencing old tenantId
            const tenantUsersSnap = await db.collection('users')
                .where('core.tenantId', '==', tenantDoc.id).get();
            for (const userDoc of tenantUsersSnap.docs) {
                print(`    👤 user "${userDoc.id}" tenantId → "${newTenantId}"`);
                await userDoc.ref.update({ 'core.tenantId': newTenantId });
            }
            // Update authorities referencing old tenantId
            const authSnap = await db.collection('authorities')
                .where('tenantId', '==', tenantDoc.id).get();
            for (const authDoc of authSnap.docs) {
                print(`    🏛️  authority "${authDoc.id}" tenantId → "${newTenantId}"`);
                await authDoc.ref.update({ tenantId: newTenantId });
            }
            // Delete old tenant doc + units sub-collection
            const oldUnitsSnap = await db
                .collection('tenants').doc(tenantDoc.id)
                .collection('units').get();
            for (const oldUnit of oldUnitsSnap.docs) {
                await oldUnit.ref.delete();
            }
            await tenantDoc.ref.delete();
            print(`  ✅ Deleted old tenant "${tenantDoc.id}"`);
        }
        // ─── 2. Units inside non-Hebrew tenants ─────────────────────
        print('\n📦 Scanning units within English-ID tenants...');
        const freshTenantsSnap = await db.collection('tenants').get();
        for (const tenantDoc of freshTenantsSnap.docs) {
            const unitsSnap = await db
                .collection('tenants').doc(tenantDoc.id)
                .collection('units').get();
            for (const unitDoc of unitsSnap.docs) {
                if (!hasHebrew(unitDoc.id))
                    continue;
                const newUnitId = toEnglishId(unitDoc.id, 'unit');
                print(`  ✏️  ${tenantDoc.id}/units/"${unitDoc.id}" → "${newUnitId}"`);
                log.push({ type: 'unit', oldId: unitDoc.id, newId: newUnitId });
                if (dryRun)
                    continue;
                const data = { ...unitDoc.data() };
                if (data.parentUnitId && hasHebrew(data.parentUnitId)) {
                    data.parentUnitId = toEnglishId(data.parentUnitId, 'unit');
                }
                await db
                    .collection('tenants').doc(tenantDoc.id)
                    .collection('units').doc(newUnitId)
                    .set(data);
                const codesSnap = await db.collection('access_codes')
                    .where('unitId', '==', unitDoc.id).get();
                for (const codeDoc of codesSnap.docs) {
                    await codeDoc.ref.update({ unitId: newUnitId });
                }
                const usersSnap = await db.collection('users')
                    .where('core.unitId', '==', unitDoc.id).get();
                for (const userDoc of usersSnap.docs) {
                    await userDoc.ref.update({ 'core.unitId': newUnitId });
                }
                await unitDoc.ref.delete();
            }
        }
        // ─── Summary ────────────────────────────────────────────────
        print('\n══════════════════════════════════════════');
        print(`${dryRun ? 'Preview' : 'Migration'} complete.`);
        print(`  Tenants renamed: ${log.filter(m => m.type === 'tenant').length}`);
        print(`  Units renamed:   ${log.filter(m => m.type === 'unit').length}`);
        if (log.length > 0) {
            print('\nRename log:');
            log.forEach(m => print(`  ${m.type}: "${m.oldId}" → "${m.newId}"`));
        }
        else {
            print('\n  No Hebrew IDs found — nothing to migrate.');
        }
        if (dryRun && log.length > 0) {
            print('\nRun WITHOUT dryRun=true to apply changes.');
        }
        res.status(200).send(`<pre>${output.join('\n')}</pre>`);
    }
    catch (err) {
        print(`\n❌ Migration failed: ${err.message}`);
        functions.logger.error('Migration error:', err);
        res.status(500).send(`<pre>${output.join('\n')}\n\n❌ ERROR: ${err.message}</pre>`);
    }
});
//# sourceMappingURL=runDataMigration.js.map