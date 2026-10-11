/**
 * READ-ONLY — confirms whether the real Sderot manager's account is
 * actually in authorities/CdiRk1QP5UrUGSbGjCkU.managerIds.
 *
 * Context: managerIds currently holds 3 entries already confirmed wrong
 * (demo-sderot-uid = a hardcoded demo placeholder from seed-sderot-demo.ts,
 * SvDlkHnYMteRyik1Ae76GVFjNjD3 = a real but unrelated military user,
 * iBVGoHX0OsficAXaR0sSNv8Z2et2 = unidentified). David identified the real
 * manager as evgeny7106@gmail.com ("זיו שדרות", shown "מאושר" in the
 * panel). This script finds that account's uid and checks membership.
 *
 * No writes anywhere in this file.
 *
 * Usage:
 *   npx tsx scripts/_verify-sderot-manager-uid.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as admin from 'firebase-admin';

const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!rawKey) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY not set (checked .env.local via dotenv, then process.env).'); process.exit(1); }
const key = JSON.parse(rawKey);
if (!key?.project_id) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY present but missing project_id — check the JSON value.'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();
const fbAuth = admin.auth();

const MANAGER_EMAIL = 'evgeny7106@gmail.com';
const SDEROT_AUTHORITY_ID = 'CdiRk1QP5UrUGSbGjCkU';

async function main() {
  console.log(`=== Looking up Firebase Auth account for ${MANAGER_EMAIL} ===`);
  let uid: string;
  try {
    const userRecord = await fbAuth.getUserByEmail(MANAGER_EMAIL);
    uid = userRecord.uid;
    console.log('uid:', uid);
    console.log('displayName:', userRecord.displayName ?? '(none)');
    console.log('disabled:', userRecord.disabled);
    console.log('providerData:', userRecord.providerData.map((p) => p.providerId));
  } catch (err: any) {
    console.error(`❌ No Firebase Auth account found for ${MANAGER_EMAIL}:`, err.message);
    process.exit(1);
  }

  console.log(`\n=== users/${uid} — Firestore profile ===`);
  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists) {
    console.log('⚠️  No users/{uid} document exists for this uid.');
  } else {
    const core = (userSnap.data()?.core ?? {}) as Record<string, any>;
    console.log('core.name:', core.name ?? '(absent)');
    console.log('core.email:', core.email ?? '(absent)');
    console.log('core.isApproved:', core.isApproved ?? '(absent)');
    console.log('core.authorityId:', core.authorityId ?? '(absent)');
    console.log('core.isSuperAdmin:', core.isSuperAdmin ?? '(absent)');
  }

  console.log(`\n=== authorities/${SDEROT_AUTHORITY_ID}.managerIds ===`);
  const authSnap = await db.collection('authorities').doc(SDEROT_AUTHORITY_ID).get();
  if (!authSnap.exists) {
    console.error('❌ Sderot authority doc does not exist at this id.');
    process.exit(1);
  }
  const managerIds: string[] = authSnap.data()?.managerIds ?? [];
  console.log('Current managerIds:', managerIds);

  const isPresent = managerIds.includes(uid);
  console.log(`\n=== RESULT ===`);
  console.log(`Manager uid:        ${uid}`);
  console.log(`Present in managerIds: ${isPresent ? 'YES' : 'NO'}`);
  if (!isPresent) {
    console.log('→ Confirmed: this uid is missing from managerIds. That is the root cause.');
  } else {
    console.log('→ His uid IS already present. The empty panel has a different cause — do not stop here.');
  }
}

main().catch((err) => { console.error('Script failed:', err); process.exit(1); });
