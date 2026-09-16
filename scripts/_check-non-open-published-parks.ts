// Read-only investigation script — SPEC-07 migration precondition check (17.09.2026).
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('secrets/firebase-admin.json', 'utf-8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  const snap = await db.collection('parks').get();
  const statusCounts: Record<string, number> = {};
  const nonOpenPublished: { id: string; name: string; status: string }[] = [];

  for (const doc of snap.docs) {
    const d = doc.data();
    const published = d.published ?? (d.contentStatus === 'published');
    const status = d.status ?? '(missing)';
    if (published) {
      statusCounts[status] = (statusCounts[status] ?? 0) + 1;
      if (status !== 'open') {
        nonOpenPublished.push({ id: doc.id, name: d.name, status });
      }
    }
  }

  console.log(JSON.stringify({ statusCountsAmongPublished: statusCounts, nonOpenPublishedCount: nonOpenPublished.length, nonOpenPublishedSample: nonOpenPublished.slice(0, 10) }, null, 2));
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
