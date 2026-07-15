/**
 * scripts/probe-gym-badge-media.ts — READ ONLY, throwaway (do not commit).
 * Dumps each gym_equipment item's badge-media fields + Urbanics brand code, so we
 * can see exactly what is missing and match it to Drive files.
 * Usage: npx tsx scripts/probe-gym-badge-media.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import * as admin from 'firebase-admin';

function initFirebase() {
  if (admin.apps.length) return;
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}
const has = (v: any) => (v && String(v).trim().length > 0 ? 'Y' : '·');

async function main() {
  initFirebase();
  const db = admin.firestore();
  const snap = await db.collection('gym_equipment').get();
  console.log('doc keys sample:', Object.keys(snap.docs[0].data()).join(', '), '\n');
  const rows = snap.docs.map((d) => {
    const g = d.data() as any;
    const brands = Array.isArray(g.brands) ? g.brands : [];
    const brandStr = brands
      .map((b: any) => `${b.brandName ?? '?'}/${b.brandId ?? b.code ?? b.sku ?? '?'}[img:${has(b.imageUrl)} vid:${has(b.videoUrl)}]`)
      .join(' , ');
    return {
      name: g.name ?? '?',
      icon: g.iconKey ?? '-',
      topImg: has(g.imageUrl ?? g.media?.imageUrl),
      topVid: has(g.videoUrl ?? g.media?.videoUrl),
      brands: brandStr || '(none)',
    };
  });
  for (const r of rows) {
    console.log(`${(r.name + '').padEnd(32).slice(0, 32)} icon=${(r.icon + '').padEnd(18)} topImg:${r.topImg} topVid:${r.topVid}  brands: ${r.brands}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
