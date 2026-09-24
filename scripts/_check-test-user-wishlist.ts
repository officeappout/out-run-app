/**
 * VERIFICATION (23.09.2026, Slice 2b post-completion check) — read-only.
 * Confirms progression.exerciseWishlist landed on the real test user's doc
 * after a full onboarding completion on preview.
 *
 * Run: npx tsx scripts/_check-test-user-wishlist.ts <uid>
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';

const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
const db = admin.firestore();

async function main() {
  const uid = process.argv[2];
  if (!uid) { console.log('Usage: npx tsx scripts/_check-test-user-wishlist.ts <uid>'); return; }
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) { console.log('User doc does not exist:', uid); return; }
  const data = snap.data()!;
  console.log('exerciseWishlist:', JSON.stringify(data.progression?.exerciseWishlist ?? null, null, 2));
  console.log('muscleFocusIds:', JSON.stringify(data.progression?.muscleFocusIds ?? null));
  console.log('activePrograms:', JSON.stringify(data.progression?.activePrograms ?? null, null, 2));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
