/**
 * DRY-RUN ONLY — prints the exact backfill plan for the 9 `parks` docs
 * missing both `published` and `contentStatus` (found by the Sderot pilot
 * audit, 23.09.2026). Does NOT write anything. Companion write script runs
 * only after separate explicit approval.
 */
import * as admin from 'firebase-admin';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!key?.project_id) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing — use --env-file=.env.local'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

async function main() {
  const snap = await db.collection('parks').get();
  const targets = snap.docs.filter((doc) => {
    const d = doc.data();
    return d.published === undefined && d.contentStatus === undefined;
  });

  console.log(`Found ${targets.length} park doc(s) matching the signature (published===undefined && contentStatus===undefined).\n`);
  console.log('Planned write per doc: { published: true, contentStatus: "published" }  (merge, no other fields touched)\n');

  for (const doc of targets) {
    const d = doc.data();
    console.log({
      id: doc.id,
      city: d.city || null,
      authorityId: d.authorityId || null,
      neighborhoodId: d.neighborhoodId || null,
      status: d.status ?? null,
      createdAt: d.createdAt?.toDate?.() ?? d.createdAt ?? null,
      hasImage: !!(d.image || d.imageUrl || (Array.isArray(d.images) && d.images[0])),
    });
  }
}

main().catch((err) => { console.error('Script failed:', err); process.exit(1); });
