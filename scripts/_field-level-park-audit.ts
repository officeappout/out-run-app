// Read-only investigation script — SPEC-07 reopening, Task 2 field-level audit (17.09.2026).
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('secrets/firebase-admin.json', 'utf-8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  // 1. Full field dump of the known equipped+tagged park.
  const doc = await db.collection('parks').doc('V7aVC8sIVUNRnlQdT61C').get();
  const d = doc.data()!;
  console.log('=== V7aVC8sIVUNRnlQdT61C — ALL TOP-LEVEL FIELDS ===');
  for (const key of Object.keys(d).sort()) {
    const val = d[key];
    const type = Array.isArray(val) ? `array[${val.length}]` : typeof val;
    const preview = Array.isArray(val)
      ? JSON.stringify(val.slice(0, 2))
      : (typeof val === 'object' && val !== null ? JSON.stringify(val).slice(0, 200) : JSON.stringify(val));
    console.log(`  ${key}: ${type} = ${preview}`);
  }

  // 2. Field-presence frequency across a broader sample (published parks).
  console.log('\n=== FIELD PRESENCE ACROSS SAMPLE ===');
  const snap = await db.collection('parks').limit(60).get();
  const fieldCounts: Record<string, number> = {};
  const fieldNonEmptyCounts: Record<string, number> = {};
  let total = 0;
  for (const doc of snap.docs) {
    total++;
    const data = doc.data();
    for (const key of Object.keys(data)) {
      fieldCounts[key] = (fieldCounts[key] ?? 0) + 1;
      const v = data[key];
      const nonEmpty = Array.isArray(v) ? v.length > 0 : (v !== null && v !== undefined && v !== '');
      if (nonEmpty) fieldNonEmptyCounts[key] = (fieldNonEmptyCounts[key] ?? 0) + 1;
    }
  }
  console.log(`Sampled ${total} docs.`);
  for (const key of Object.keys(fieldCounts).sort()) {
    console.log(`  ${key}: present=${fieldCounts[key]}/${total}, non-empty=${fieldNonEmptyCounts[key] ?? 0}/${total}`);
  }
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
