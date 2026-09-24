// Read-only investigation script — SPEC-07 reopening, Task 3 sizing (17.09.2026).
// Measures the REAL gzip size of a proposed parkId -> equipment-ids catalog,
// built from every published park with a non-empty gymEquipment array.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { gzipSync } from 'zlib';

const serviceAccount = JSON.parse(readFileSync('secrets/firebase-admin.json', 'utf-8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  const snap = await db.collection('parks').get();
  const catalog: Record<string, string[]> = {};
  let publishedTotal = 0;
  let withEquipment = 0;

  for (const doc of snap.docs) {
    const d = doc.data();
    const published = d.published ?? (d.contentStatus === 'published');
    if (!published) continue;
    publishedTotal++;
    const gymEquipment = Array.isArray(d.gymEquipment) ? d.gymEquipment : [];
    const ids = gymEquipment
      .map((eq: any) => eq?.equipmentId)
      .filter((id: any) => typeof id === 'string' && id.length > 0);
    if (ids.length > 0) {
      catalog[doc.id] = ids;
      withEquipment++;
    }
  }

  const json = JSON.stringify(catalog);
  const raw = Buffer.byteLength(json, 'utf-8');
  const gz = gzipSync(json, { level: 9 }).length;

  console.log(JSON.stringify({
    publishedParksTotal: publishedTotal,
    parksWithEquipment: withEquipment,
    rawBytes: raw,
    rawKB: (raw / 1024).toFixed(1),
    gzipBytes: gz,
    gzipKB: (gz / 1024).toFixed(1),
  }, null, 2));

  // Also measure a normalized-array variant shape: [{id, gear: [...]}] — same
  // data, array-of-objects instead of a keyed map, in case that shape matters.
  const asArray = Object.entries(catalog).map(([id, gear]) => ({ id, gear }));
  const jsonArr = JSON.stringify(asArray);
  const gzArr = gzipSync(jsonArr, { level: 9 }).length;
  console.log('array-shape variant: raw', Buffer.byteLength(jsonArr, 'utf-8'), 'gzip', gzArr, `(${(gzArr/1024).toFixed(1)}KB)`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
