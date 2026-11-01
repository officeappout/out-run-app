/**
 * scripts/migrate-authorities-crm-private.ts — security fix (01.11.2026): move the sales CRM
 * fields (contacts, activityLog, tasks, financials, documents) off the world-readable
 * authorities/{id} doc into the admin-only authorities/{id}/crm_private/main.
 *
 *   npx tsx --env-file=.env.local scripts/migrate-authorities-crm-private.ts           # DRY RUN (default): reads only
 *   npx tsx --env-file=.env.local scripts/migrate-authorities-crm-private.ts --apply   # write
 *   options: --id=<authorityId> (one authority)
 *
 * Run ONLY after the code + firestore.rules that read crm_private are deployed (the code falls
 * back to the legacy main-doc copy until then, so the order is safe).
 *
 * Per authority with any legacy CRM key: merge-write the keys into crm_private/main — a field that
 * already exists there is newer (the new code writes there) and is NEVER overwritten — then delete
 * the keys from the main doc with FieldValue.delete(). Both writes happen in one transaction per
 * authority (re-reads both docs, so a concurrent CRM edit is never clobbered).
 * Idempotent: a second run finds no legacy keys. Output: ids, field names and counts only (no
 * contact names / notes). Credentials: FIREBASE_SERVICE_ACCOUNT_KEY (JSON) from .env.local.
 */
import * as admin from 'firebase-admin';
import {
  AUTHORITY_CRM_FIELDS,
  CRM_PRIVATE_DOC_ID,
  CRM_PRIVATE_SUBCOLLECTION,
  planCrmMigration,
} from '../src/features/admin/services/authority-crm';

const APPLY = process.argv.includes('--apply');
const ONLY_ID = process.argv.find((a) => a.startsWith('--id='))?.split('=')[1] ?? null;

function init(): admin.firestore.Firestore {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY missing (run with --env-file=.env.local)');
    const c = JSON.parse(raw);
    admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  }
  return admin.firestore();
}

const sizeOf = (v: unknown) => (Array.isArray(v) ? `${v.length} items` : v && typeof v === 'object' ? 'object' : typeof v);

async function main() {
  const db = init();
  console.log(`[migrate-authorities-crm-private] mode=${APPLY ? 'APPLY' : 'DRY-RUN'}${ONLY_ID ? ` id=${ONLY_ID}` : ''}`);

  const docs = ONLY_ID
    ? [await db.collection('authorities').doc(ONLY_ID).get()].filter((d) => d.exists)
    : (await db.collection('authorities').get()).docs;

  const totals = { authorities: docs.length, withLegacy: 0, fieldsMoved: 0, fieldsKeptPrivate: 0, written: 0 };
  const perField: Record<string, number> = Object.fromEntries(AUTHORITY_CRM_FIELDS.map((f) => [f, 0]));

  for (const snap of docs) {
    const main = (snap.data() ?? {}) as Record<string, unknown>;
    if (!AUTHORITY_CRM_FIELDS.some((f) => main[f] !== undefined)) continue;

    const privRef = snap.ref.collection(CRM_PRIVATE_SUBCOLLECTION).doc(CRM_PRIVATE_DOC_ID);
    const priv = await privRef.get();
    const plan = planCrmMigration(main, priv.exists ? ((priv.data() ?? {}) as Record<string, unknown>) : null);

    totals.withLegacy += 1;
    totals.fieldsMoved += Object.keys(plan.toWrite).length;
    totals.fieldsKeptPrivate += plan.keptPrivate.length;
    for (const f of plan.toDelete) perField[f] += 1;

    const moved = Object.entries(plan.toWrite).map(([f, v]) => `${f}(${sizeOf(v)})`).join(', ') || '-';
    const kept = plan.keptPrivate.length ? ` | private already newer: ${plan.keptPrivate.join(', ')}` : '';
    console.log(`  ${snap.id}: move ${moved}${kept} | delete from main: ${plan.toDelete.join(', ')}`);

    if (!APPLY) continue;
    await db.runTransaction(async (tx) => {
      const [m, p] = await tx.getAll(snap.ref, privRef);
      if (!m.exists) return;
      const fresh = planCrmMigration((m.data() ?? {}) as Record<string, unknown>, p.exists ? ((p.data() ?? {}) as Record<string, unknown>) : null);
      if (fresh.toDelete.length === 0) return;
      if (Object.keys(fresh.toWrite).length > 0) tx.set(privRef, fresh.toWrite, { merge: true });
      tx.update(snap.ref, Object.fromEntries(fresh.toDelete.map((f) => [f, admin.firestore.FieldValue.delete()])));
    });
    totals.written += 1;
  }

  console.log('\n[migrate-authorities-crm-private] totals', JSON.stringify(totals));
  console.log('[migrate-authorities-crm-private] authorities per legacy field', JSON.stringify(perField));
  if (!APPLY) console.log('DRY-RUN: nothing written. Re-run with --apply to migrate.');
}

main().catch((err) => {
  console.error('[migrate-authorities-crm-private] failed', err);
  process.exit(1);
});
