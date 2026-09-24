/**
 * scripts/_audit-access-code-tenant-type.ts — READ ONLY, throwaway.
 * Scans every access_codes doc and cross-references its stamped tenantType
 * against the ACTUAL type of the org it points at (authorities.type /
 * tenants.type / tenants.tenantType), to find mismatches like the one
 * found on access_codes/MUN-KHPUEK (tenantType:"municipal" for a military
 * org). No writes.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '/Users/calisthenicsltd/Development/appout-1/.env.local' });
import * as admin from 'firebase-admin';

function init() {
  if (admin.apps.length) return;
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

async function main() {
  init();
  const db = admin.firestore();

  const codesSnap = await db.collection('access_codes').get();
  console.log(`total access_codes: ${codesSnap.size}`);

  const tenantCache = new Map<string, { tenantType: string | null; authorityType: string | null; hasAnyType: boolean }>();

  async function resolveActualType(tenantId: string) {
    if (tenantCache.has(tenantId)) return tenantCache.get(tenantId)!;
    const tDoc = await db.collection('tenants').doc(tenantId).get();
    const aDoc = await db.collection('authorities').doc(tenantId).get();
    const t = tDoc.exists ? (tDoc.data() as any) : null;
    const a = aDoc.exists ? (aDoc.data() as any) : null;
    const resolvedTenantType = t?.tenantType ?? t?.type ?? null;
    const resolvedAuthorityVertical = a?.vertical ?? a?.tenantType ?? null;
    const result = {
      tenantType: resolvedTenantType,
      authorityType: resolvedAuthorityVertical,
      hasAnyType: !!(t?.tenantType || t?.type || a?.vertical || a?.tenantType),
    };
    tenantCache.set(tenantId, result);
    return result;
  }

  const mismatches: any[] = [];
  const unclassified: any[] = [];
  const clean: any[] = [];

  for (const doc of codesSnap.docs) {
    const c: any = doc.data();
    if (!c.tenantId) {
      console.log(`  [SKIP] ${doc.id}: no tenantId field`);
      continue;
    }
    const actual = await resolveActualType(c.tenantId);
    const row = { code: doc.id, tenantId: c.tenantId, stampedTenantType: c.tenantType, resolvedTenantType: actual.tenantType, resolvedAuthorityVertical: actual.authorityType, usageCount: c.usageCount, isActive: c.isActive, label: c.label };
    if (!actual.hasAnyType) {
      unclassified.push(row);
    } else {
      const actualBest = actual.tenantType ?? actual.authorityType;
      if (actualBest && actualBest !== c.tenantType) mismatches.push(row);
      else clean.push(row);
    }
  }

  console.log(`\n=== CLEAN (stamped tenantType matches resolved org type): ${clean.length} ===`);

  console.log(`\n=== MISMATCHES (stamped tenantType does NOT match resolved org type): ${mismatches.length} ===`);
  mismatches.forEach((m) => console.log(' ', JSON.stringify(m)));

  console.log(`\n=== UNCLASSIFIED (org has no type/tenantType/vertical field at all — the residual live gap): ${unclassified.length} ===`);
  unclassified.forEach((m) => console.log(' ', JSON.stringify(m)));

  process.exit(0);
}
main().catch((e) => {
  console.error('FAILED:', e?.message || e);
  process.exit(1);
});
