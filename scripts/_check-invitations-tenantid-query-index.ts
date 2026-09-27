/**
 * READ-ONLY, PRODUCTION. No writes.
 *
 * Slice B (officer-invitation-flow, §13.34/§13.37) proposes extending
 * getInvitationsByAuthority() to also run
 * where('tenantId','==',X).orderBy('createdAt','desc') on admin_invitations
 * — the SAME shape (one equality filter + orderBy on a different field) as
 * the EXISTING where('authorityId','==',X).orderBy('createdAt','desc')
 * query already live in that function, which has no entry in
 * firestore.indexes.json and has run in production without one.
 *
 * Per the standing rule (§13.30): verify the real query against production
 * before merging, don't reason from documented Firestore index rules alone.
 * The emulator does not reliably enforce composite-index requirements, so
 * this runs against production with a throwaway sentinel value (0 expected
 * matches) and, if that succeeds, a real tenantId value known to exist.
 */
import * as admin from 'firebase-admin';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!key?.project_id) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

async function main() {
  try {
    const snap = await db.collection('admin_invitations')
      .where('tenantId', '==', 'throwaway-sentinel-tenant-id')
      .orderBy('createdAt', 'desc')
      .get();
    console.log('✅ [sentinel tenantId, 0 expected matches] Query succeeded. Matched docs:', snap.size);
  } catch (err: any) {
    console.log('❌ [sentinel tenantId + orderBy] Query FAILED (composite index missing):', err?.code, err?.message);
  }

  // Fallback shape: equality filter alone, no orderBy — client sorts after
  // merging with the authorityId-branch results instead of asking Firestore
  // to sort a filtered set that needs a composite index it doesn't have.
  try {
    const snap = await db.collection('admin_invitations')
      .where('tenantId', '==', 'throwaway-sentinel-tenant-id')
      .get();
    console.log('✅ [sentinel tenantId, NO orderBy] Query succeeded. Matched docs:', snap.size);
  } catch (err: any) {
    console.log('❌ [sentinel tenantId, NO orderBy] Query FAILED:', err?.code, err?.message);
    process.exit(1);
  }

  // Second pass: a real tenantId known (from §13.34 finding 5) to exist on
  // at least one real admin_invitations doc — proves the query also
  // succeeds when it actually matches a document, not just when empty.
  try {
    const real = await db.collection('admin_invitations')
      .where('role', '==', 'tenant_owner')
      .limit(1)
      .get();
    if (real.empty) {
      console.log('⚠️  No real tenant_owner invitation found to test a non-empty match — sentinel-only result stands.');
      return;
    }
    const tenantId = real.docs[0].data().tenantId;
    if (!tenantId) {
      console.log('⚠️  Real tenant_owner invitation found but has no tenantId field — cannot test non-empty match.');
      return;
    }
    const tenantIdWithOrderBy = await db.collection('admin_invitations')
      .where('tenantId', '==', tenantId)
      .orderBy('createdAt', 'desc')
      .get()
      .then((s) => s.size)
      .catch((err: any) => { console.log('❌ [real tenantId + orderBy] Query FAILED (composite index missing):', err?.code, err?.message); return null; });
    if (tenantIdWithOrderBy !== null) {
      console.log(`✅ [real tenantId + orderBy, >=1 expected match] Query succeeded. Matched docs: ${tenantIdWithOrderBy}`);
    }

    const snap2 = await db.collection('admin_invitations')
      .where('tenantId', '==', tenantId)
      .get();
    console.log(`✅ [real tenantId, NO orderBy, >=1 expected match] Query succeeded. Matched docs: ${snap2.size}`);
  } catch (err: any) {
    console.log('❌ [real tenantId, NO orderBy] Query FAILED:', err?.code, err?.message);
    process.exit(1);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
