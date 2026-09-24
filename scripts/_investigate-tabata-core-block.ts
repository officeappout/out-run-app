/**
 * ONE-OFF, read-only. David's Round-1 Stage-1 ask: raw Firestore data for the
 * exercises suspected of leaking into the core tabata block, + a live trace of
 * hasExplicitCoreLevel + the actual buildCoreTabataBlock filter chain.
 * No writes. Delete after the investigation.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '/Users/calisthenicsltd/Development/appout-1/.env.local' });
import * as admin from 'firebase-admin';
function init() {
  if (admin.apps.length) return;
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

const NAMES = ['הליכות דוב', 'הליכות זחל', 'הליכת סרטן', 'סמוך קום מתחילים', 'סמוך קום'];

async function main() {
  init();
  const db = admin.firestore();
  const snap = await db.collection('exercises').get();
  const matches: any[] = [];
  snap.forEach((doc) => {
    const d = doc.data();
    const he = (d.name && (d.name.he || d.name)) || '';
    if (NAMES.some((n) => he === n || he.includes(n))) {
      matches.push({ id: doc.id, ...d });
    }
  });
  console.log(`Found ${matches.length} matching exercises:\n`);
  for (const ex of matches) {
    console.log('='.repeat(80));
    console.log(`id=${ex.id}  name.he="${ex.name?.he ?? ex.name}"`);
    console.log('targetPrograms:', JSON.stringify(ex.targetPrograms ?? null));
    console.log('tags:', JSON.stringify(ex.tags ?? null));
    console.log('movementGroup:', ex.movementGroup ?? null);
    console.log('primaryMuscle:', ex.primaryMuscle ?? null);
    console.log('exerciseRole:', ex.exerciseRole ?? null);
    console.log('symmetry:', ex.symmetry ?? null);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
