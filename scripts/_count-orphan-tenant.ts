/**
 * scripts/_count-orphan-tenant.ts — READ ONLY, throwaway.
 * Counts prod users with core.tenantId set but NO matching org affiliation
 * (id === core.tenantId, type school/company/youth_movement) — i.e. "orphan"
 * tenant bindings that get no league tab. Paginated scan; no writes.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '/Users/calisthenicsltd/Development/appout-1/.env.local' });
import * as admin from 'firebase-admin';

function init() {
  if (admin.apps.length) return;
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

const ORG_TYPES = new Set(['school', 'company', 'youth_movement']);

async function main() {
  init();
  const db = admin.firestore();

  let total = 0;
  let withTenant = 0;
  let orphans = 0;
  const orphanByType: Record<string, number> = {};
  const boundByType: Record<string, number> = {};

  let last: admin.firestore.QueryDocumentSnapshot | null = null;
  const PAGE = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q = db.collection('users').orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE);
    if (last) q = q.startAfter(last.id);
    const snap = await q.get();
    if (snap.empty) break;
    for (const d of snap.docs) {
      total++;
      const core = (d.data()?.core ?? {}) as any;
      const tid = typeof core.tenantId === 'string' ? core.tenantId.trim() : '';
      if (!tid) continue;
      withTenant++;
      const tt = core.tenantType ?? '(none)';
      boundByType[tt] = (boundByType[tt] ?? 0) + 1;
      const affs = Array.isArray(core.affiliations) ? core.affiliations : [];
      const hasOrgAff = affs.some((a: any) => a?.id === tid && ORG_TYPES.has(a?.type));
      if (!hasOrgAff) {
        orphans++;
        orphanByType[tt] = (orphanByType[tt] ?? 0) + 1;
      }
    }
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE) break;
  }

  console.log(`\n=== users scanned: ${total} ===`);
  console.log(`with core.tenantId set: ${withTenant}`);
  console.log(`  bound-by-tenantType:`, JSON.stringify(boundByType));
  console.log(`\nORPHANS (tenantId set, NO matching org affiliation): ${orphans}`);
  console.log(`  orphan-by-tenantType:`, JSON.stringify(orphanByType));
  console.log('');
  process.exit(0);
}
main().catch(e => { console.error('FAILED:', e?.message || e); process.exit(1); });
