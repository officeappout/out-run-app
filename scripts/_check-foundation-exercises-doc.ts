/**
 * VERIFICATION (23.09.2026, Slice 2a post-deploy check) — read-only.
 * Confirms system_config/foundation_exercises reads back whatever David
 * saved via the admin picker on production. No writes.
 *
 * Run: npx tsx scripts/_check-foundation-exercises-doc.ts
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';

const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
const db = admin.firestore();

async function main() {
  const snap = await db.collection('system_config').doc('foundation_exercises').get();
  if (!snap.exists) {
    console.log('system_config/foundation_exercises does not exist yet.');
    return;
  }
  const data = snap.data()!;
  console.log('Doc exists. Contents:');
  console.log(JSON.stringify(data, null, 2));

  const packages = ['pull', 'push', 'legs', 'core'] as const;
  for (const pkg of packages) {
    const ids: string[] = Array.isArray(data[pkg]) ? data[pkg] : [];
    if (ids.length === 0) {
      console.log(`${pkg}: (empty)`);
      continue;
    }
    const names = await Promise.all(
      ids.map(async (id) => {
        const exDoc = await db.collection('exercises').doc(id).get();
        const name = exDoc.exists ? exDoc.data()?.name?.he : null;
        return `${id}${name ? ` (${name})` : ' [not found in exercises collection]'}`;
      })
    );
    console.log(`${pkg}: ${names.join(', ')}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
