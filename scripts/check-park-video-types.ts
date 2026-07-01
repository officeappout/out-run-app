/**
 * Dry-run: count park execution methods by video field type.
 * Shows mainVideoUrl (legacy) vs previewVideo/fullTutorial (Phase 5 Bunny).
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as admin from 'firebase-admin';

function initFirebase() {
  if (admin.apps.length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (raw) { const c = JSON.parse(raw); admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id }); return; }
  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'appout-1' });
}

const PARK_LOCS = new Set(['park', 'street', 'outdoor']);
function isPark(m: any): boolean {
  if (PARK_LOCS.has(m.location ?? '')) return true;
  return (m.locationMapping ?? []).some((l: string) => PARK_LOCS.has(l));
}

async function main() {
  initFirebase();
  const db = admin.firestore();
  const snap = await db.collection('exercises').get();

  let totalParkMethods = 0;
  let hasMainVideo = 0;
  let hasPreviewVideo = 0;
  let hasFullTutorial = 0;
  let hasSomeVideo = 0;
  const samples: any[] = [];

  for (const doc of snap.docs) {
    const ex = doc.data() as any;
    const methods: any[] = ex.execution_methods ?? ex.executionMethods ?? [];
    methods.forEach((m: any, idx: number) => {
      if (!isPark(m)) return;
      totalParkMethods++;
      const hasMain = !!(m.media?.mainVideoUrl);
      const hasPreview = !!(
        m.media?.previewVideo?.he?.videoId ||
        m.media?.previewVideo?.en?.videoId ||
        ex.media?.previewVideo?.he?.videoId
      );
      const hasFull = !!(
        m.media?.fullTutorial?.he?.videoId ||
        m.media?.fullTutorial?.en?.videoId ||
        ex.media?.fullTutorial?.he?.videoId
      );
      if (hasMain) hasMainVideo++;
      if (hasPreview) hasPreviewVideo++;
      if (hasFull) hasFullTutorial++;
      if (hasMain || hasPreview || hasFull) hasSomeVideo++;
      if (samples.length < 8 && hasMain) {
        const url: string = m.media?.mainVideoUrl ?? '';
        samples.push({
          id: doc.id,
          name: ex.name?.he ?? doc.id,
          methodIdx: idx,
          loc: m.location ?? (m.locationMapping ?? []).join('+'),
          mainVideoUrl: url.substring(0, 90),
        });
      }
    });
  }

  console.log(`Total park execution methods: ${totalParkMethods}`);
  console.log(`  Has mainVideoUrl (legacy):  ${hasMainVideo}`);
  console.log(`  Has previewVideo (Phase 5): ${hasPreviewVideo}`);
  console.log(`  Has fullTutorial (Phase 5): ${hasFullTutorial}`);
  console.log(`  Has ANY video:              ${hasSomeVideo}`);
  console.log('\nSample mainVideoUrl entries:');
  console.table(samples);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
