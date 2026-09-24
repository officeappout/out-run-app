/**
 * ONE-OFF, read-only. Pulls raw Firestore data for the specific "core_members"
 * names appearing inside mixed tabata blocks, to check whether they carry
 * hiit_friendly + a real core level (which would make them corePool
 * candidates too, contradicting the "corePool is always empty" finding) or
 * whether the snapshot's domain='core' column (movementGroup-derived) is
 * counting something hasExplicitCoreLevel would reject. No writes.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '/Users/calisthenicsltd/Development/appout-1/.env.local' });
import * as admin from 'firebase-admin';
function init() {
  if (admin.apps.length) return;
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

const NAMES = [
  'כפיפות בטן חצי טווח', 'כפיפות בטן', 'קראנץ', 'פינגווינים', 'מטפס הרים',
  'אופניים', 'עליות רגליים בשכיבה', 'מספרים בשכיבה', 'מספריים אופקיים בשכיבה',
  'כפיפות בטן אלכוסונים', 'ספר ברכיים כפופת', 'החזקת הולו באדי', 'פלאנק',
  'גליל בטן אקצנטרי', 'עליות ברכיים כפופות בתלייה', 'עליות מספרים בשכיבה',
  'כפיפות ברכיים בתלייה אלכסונים',
];

async function main() {
  init();
  const db = admin.firestore();
  const snap = await db.collection('exercises').get();
  const seen = new Set<string>();
  snap.forEach((doc) => {
    const d = doc.data();
    const he = (d.name && (d.name.he || d.name)) || '';
    if (NAMES.includes(he) && !seen.has(he)) {
      seen.add(he);
      const coreTp = (d.targetPrograms ?? []).find((t: any) => t.programId === 'core');
      console.log(`"${he}" [${doc.id}]  tags=${JSON.stringify(d.tags ?? [])}  movementGroup=${d.movementGroup ?? null}  targetPrograms.core=${coreTp ? JSON.stringify(coreTp) : 'NONE'}`);
    }
  });
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
