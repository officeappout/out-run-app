/**
 * scripts/probe-media-verify.ts — READ ONLY, throwaway.
 * Current state of the 3 Part-A write targets + the inherit-source exercise media.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import * as admin from 'firebase-admin';
function initFirebase() {
  if (admin.apps.length) return;
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}
const TARGETS = ['מקבילים ארוכים', 'רצועות חתירה TRX', 'רצועות חתירה מתכווננות'];
async function main() {
  initFirebase();
  const db = admin.firestore();
  const geq = await db.collection('gym_equipment').get();
  for (const d of geq.docs) {
    const g = d.data() as any;
    if (!TARGETS.includes(g.name)) continue;
    console.log(`\n■ ${g.name}  (docId=${d.id})  iconKey=${g.iconKey ?? '-'}`);
    for (const b of (g.brands ?? [])) {
      console.log(`   ${b.brandName}/${b.brandId}`);
      console.log(`     imageUrl: ${b.imageUrl || '(empty)'}`);
      console.log(`     videoUrl: ${b.videoUrl || '(empty)'}`);
    }
  }
  // exercise "חתירה בזווית 60" media (inherit source)
  console.log('\n══ exercise "חתירה בזווית 60" ══');
  const ex = await db.collection('exercises').get();
  for (const d of ex.docs) {
    const e = d.data() as any;
    const nm = e?.content?.name?.he ?? e?.name?.he ?? e?.name ?? '';
    if (!String(nm).includes('חתירה בזווית 60') && !String(nm).includes('חתירה בזווית')) continue;
    console.log(`\n  ▸ "${nm}" (id=${d.id})`);
    console.log(`    ex.media: image=${e.media?.imageUrl || '-'}  video=${e.media?.videoUrl || '-'}`);
    const ms = e.execution_methods || e.executionMethods || [];
    ms.forEach((m: any, i: number) => {
      const img = m?.media?.imageUrl || '-';
      const vid = m?.media?.mainVideoUrl || m?.media?.videoUrl || '-';
      if (img !== '-' || vid !== '-') console.log(`    method[${i}] loc=${m.location}: image=${img}  video=${vid}`);
    });
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
