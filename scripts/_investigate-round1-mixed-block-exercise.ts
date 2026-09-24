/**
 * ONE-OFF, read-only. Round-1 measurement shows 3/13 tabata blocks still
 * "mixed" per the snapshot's domain column (movementGroup-derived), and all
 * 3 share the exact same non-core member: "מספרים בשכיבה"
 * (ovwmeDEgpucFfaVQGpR7). Hypothesis: this exercise has a real
 * targetPrograms[core] level (so it correctly passes hasExplicitCoreLevel
 * and enters corePool) but is missing movementGroup (so build-snapshot.ts's
 * MG_TO_DOMAIN-derived `domain` column reads null) — same class of gap as
 * the earlier bear-crawls investigation, inverted. No writes.
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
  const doc = await db.collection('exercises').doc('ovwmeDEgpucFfaVQGpR7').get();
  const d = doc.data();
  console.log('id:', doc.id);
  console.log('name.he:', d?.name?.he ?? d?.name);
  console.log('movementGroup:', d?.movementGroup ?? null);
  console.log('targetPrograms:', JSON.stringify(d?.targetPrograms ?? null));
  console.log('tags:', JSON.stringify(d?.tags ?? null));
  console.log('exerciseRole:', d?.exerciseRole ?? null);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
