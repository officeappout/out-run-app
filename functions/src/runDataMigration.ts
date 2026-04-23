/**
 * runDataMigration — One-time admin-only migration to fix Hebrew document IDs.
 *
 * Scans tenants and units for Hebrew chars in doc IDs, creates clean
 * English replacements, and updates all access_codes + users references.
 *
 * SECURITY (Fortress Phase, Apr 2026):
 *   The previous implementation was a public HTTPS endpoint protected only
 *   by a hardcoded secret query parameter (`?secret=dudu2026`). That string
 *   was committed to source control and shipped to anyone who cloned the
 *   repo — anyone with the URL could wipe and rename every tenant.
 *
 *   This version is a Callable function that:
 *     1. Requires a valid Firebase ID Token (no anonymous calls).
 *     2. Verifies the caller is an admin via three independent paths:
 *          a. Custom Claim `admin === true` (forward-compat with future
 *             setCustomUserClaims migration), OR
 *          b. Hardcoded root admin email match (mirror of firestore.rules
 *             `isRootAdmin()`), OR
 *          c. `users/{uid}.role == 'admin'` or any of the
 *             `core.is*Admin` flags (mirror of `checkUserRole`).
 *     3. Logs every invocation with the calling uid for audit.
 *
 * Usage (browser console, signed in as an admin):
 *   const { httpsCallable } = await import('firebase/functions');
 *   const fns = (await import('firebase/functions')).getFunctions();
 *   await httpsCallable(fns, 'runDataMigration')({ dryRun: true });
 *
 * IMPORTANT: Remove this function entirely after the migration is complete.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const HEBREW_REGEX = /[\u0590-\u05FF]/;
const ROOT_ADMIN_EMAIL_REGEX = /^(david|office)@appout\.co\.il$/i;

function hasHebrew(s: string): boolean {
  return HEBREW_REGEX.test(s);
}

function toEnglishId(hebrewId: string, prefix: string): string {
  const stripped = hebrewId
    .replace(/[\u0590-\u05FF]+/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
  const suffix = Math.random().toString(36).substring(2, 8);
  return stripped ? `${prefix}_${stripped}_${suffix}` : `${prefix}_${suffix}`;
}

interface LogEntry {
  type: string;
  oldId: string;
  newId: string;
}

interface MigrationPayload {
  dryRun?: boolean;
}

interface MigrationResult {
  ok: true;
  dryRun: boolean;
  tenantsRenamed: number;
  unitsRenamed: number;
  log: LogEntry[];
  output: string;
}

/**
 * Verify that the caller has admin privileges.
 *
 * Throws HttpsError on failure so the function aborts before doing any work.
 * Accepts any request shape with `auth?.{uid, token}` (the v2 callable shape).
 */
async function requireAdmin(auth: { uid: string; token?: Record<string, any> } | undefined): Promise<string> {
  if (!auth) {
    throw new HttpsError('unauthenticated', 'Sign-in required to run data migration.');
  }
  const { uid, token } = auth;

  // Path A: custom claim (the preferred long-term mechanism)
  if (token?.admin === true) {
    return uid;
  }

  // Path B: hardcoded root admin email (mirror of firestore.rules isRootAdmin)
  const email: string | undefined = token?.email;
  if (email && ROOT_ADMIN_EMAIL_REGEX.test(email)) {
    return uid;
  }

  // Path C: Firestore-doc admin flags (mirror of auth.service.checkUserRole)
  try {
    const userSnap = await db.collection('users').doc(uid).get();
    const data = userSnap.data();
    const core = data?.core ?? {};
    const isAdmin =
      data?.role === 'admin' ||
      core.role === 'admin' ||
      core.role === 'system_admin' ||
      core.isSuperAdmin === true ||
      core.isSystemAdmin === true ||
      core.isVerticalAdmin === true ||
      core.isTenantOwner === true;
    if (isAdmin) return uid;
  } catch (err) {
    logger.warn('[runDataMigration] Failed to read user doc for admin check:', err);
  }

  throw new HttpsError('permission-denied', 'Admin role required to run data migration.');
}

export const runDataMigration = onCall<MigrationPayload, Promise<MigrationResult>>(
  {
    cors: true,
    region: 'us-central1',
    timeoutSeconds: 540,
    memory: '512MiB',
    // App Check enforcement (Ashkelon Req. 22.1).
    enforceAppCheck: true,
  },
  async (request) => {
    const adminUid = await requireAdmin(request.auth);
    const dryRun = request.data?.dryRun === true;

    const log: LogEntry[] = [];
    const output: string[] = [];

    const print = (msg: string) => {
      output.push(msg);
      logger.info(msg);
    };

    print(dryRun ? '=== DRY RUN (no writes) ===' : '=== LIVE MIGRATION ===');
    print(`Invoked by admin uid=${adminUid}`);

    try {
      // ─── 1. Migrate tenant doc IDs ──────────────────────────────
      print('\n📦 Scanning tenants...');
      const tenantsSnap = await db.collection('tenants').get();
      print(`   Found ${tenantsSnap.size} tenant(s) total.`);

      for (const tenantDoc of tenantsSnap.docs) {
        if (!hasHebrew(tenantDoc.id)) continue;

        const newTenantId = toEnglishId(tenantDoc.id, 'tenant');
        print(`\n  ✏️  tenant "${tenantDoc.id}" → "${newTenantId}"`);
        log.push({ type: 'tenant', oldId: tenantDoc.id, newId: newTenantId });

        if (dryRun) continue;

        // Copy tenant doc
        await db.collection('tenants').doc(newTenantId).set(tenantDoc.data()!);

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
          if (!hasHebrew(unitDoc.id)) continue;

          const newUnitId = toEnglishId(unitDoc.id, 'unit');
          print(`  ✏️  ${tenantDoc.id}/units/"${unitDoc.id}" → "${newUnitId}"`);
          log.push({ type: 'unit', oldId: unitDoc.id, newId: newUnitId });

          if (dryRun) continue;

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
      const tenantsRenamed = log.filter(m => m.type === 'tenant').length;
      const unitsRenamed = log.filter(m => m.type === 'unit').length;
      print(`  Tenants renamed: ${tenantsRenamed}`);
      print(`  Units renamed:   ${unitsRenamed}`);

      if (log.length > 0) {
        print('\nRename log:');
        log.forEach(m => print(`  ${m.type}: "${m.oldId}" → "${m.newId}"`));
      } else {
        print('\n  No Hebrew IDs found — nothing to migrate.');
      }

      if (dryRun && log.length > 0) {
        print('\nRun WITHOUT dryRun to apply changes.');
      }

      return {
        ok: true,
        dryRun,
        tenantsRenamed,
        unitsRenamed,
        log,
        output: output.join('\n'),
      };
    } catch (err: any) {
      print(`\n❌ Migration failed: ${err.message}`);
      logger.error('[runDataMigration] Migration error:', err);
      throw new HttpsError('internal', err?.message || 'Migration failed.', {
        partialOutput: output.join('\n'),
      });
    }
  },
);
