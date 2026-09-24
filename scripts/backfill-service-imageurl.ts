/**
 * Backfill media.imageUrl for the 'service' execution method.
 *
 * The service preview uploader wrote only media.previewVideo.he (+thumbnailUrl) and NO
 * imageUrl. The swap-all "complete-media" gate (methodHasCompleteMedia, exercise.types.ts)
 * requires video AND image, so service methods are rejected from the workout-level location
 * switcher. This sets media.imageUrl = previewVideo.he.thumbnailUrl so they pass.
 *
 * ADDITIVE & SCOPED: touches ONLY the method whose location==='service' (or
 * locationMapping includes 'service'), ONLY when its media.imageUrl is empty, and ONLY
 * when a previewVideo.he.thumbnailUrl exists. park/home/other methods are never touched.
 *
 * Usage:
 *   npx tsx scripts/backfill-service-imageurl.ts            # DRY-RUN (default, no writes)
 *   npx tsx scripts/backfill-service-imageurl.ts --dry-run  # explicit dry-run
 *   npx tsx scripts/backfill-service-imageurl.ts --apply    # write to Firestore
 *
 * Target set: exercise_ids from scripts/corpus/upload-results-service.json (status=success).
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;

const RESULTS_PATH = path.join(process.cwd(), 'scripts/corpus/upload-results-service.json');

function initFirebase() {
  if (admin.apps.length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY not set');
  const c = JSON.parse(raw);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

function findServiceMethodIndex(methods: any[]): number {
  return methods.findIndex((m: any) => {
    const lm = Array.isArray(m?.locationMapping) ? m.locationMapping : [];
    return lm.includes('service') || m?.location === 'service';
  });
}

function isEmpty(v: any): boolean {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

interface Row { exercise_id: string; exercise_name: string; status: string }

async function main() {
  if (!fs.existsSync(RESULTS_PATH)) {
    console.error(`Not found: ${RESULTS_PATH} — run bulk-upload-preview-service.ts first`);
    process.exit(1);
  }
  const results: Row[] = JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf8'));
  const ids = [...new Set(results.filter(r => r.status === 'success').map(r => r.exercise_id))];
  console.log(`Target service exercises (from results, success): ${ids.length}`);
  console.log(DRY_RUN ? 'DRY-RUN — no writes' : '⚠️ APPLY — writing media.imageUrl to Firestore');

  initFirebase();
  const db = admin.firestore();

  const counts = { willWrite: 0, skipHasImage: 0, skipNoService: 0, skipNoThumb: 0, missingDoc: 0 };
  const samples: any[] = [];

  for (const id of ids) {
    const snap = await db.collection('exercises').doc(id).get();
    if (!snap.exists) { counts.missingDoc++; continue; }
    const data = snap.data()!;
    const methods: any[] = (data.execution_methods ?? data.executionMethods ?? []).map((m: any) => ({ ...m }));
    const idx = findServiceMethodIndex(methods);
    if (idx === -1) { counts.skipNoService++; continue; }

    const media = methods[idx]?.media ?? {};
    const thumb = media?.previewVideo?.he?.thumbnailUrl;

    if (!isEmpty(media.imageUrl)) { counts.skipHasImage++; continue; }   // never overwrite
    if (isEmpty(thumb))          { counts.skipNoThumb++; continue; }     // nothing to copy from

    counts.willWrite++;
    if (samples.length < 2) {
      samples.push({ id, name: data.name?.he, serviceIdx: idx, currentImageUrl: media.imageUrl ?? '(absent)', newImageUrl: thumb });
    }

    if (APPLY) {
      const newMedia = { ...media, imageUrl: thumb };
      methods[idx] = { ...methods[idx], media: newMedia };
      await db.collection('exercises').doc(id).update({
        execution_methods: methods,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }

  console.log('\n── Summary ──────────────────────────────────────────────');
  console.log(`  ✍️  ${APPLY ? 'wrote' : 'WOULD write'} imageUrl:        ${counts.willWrite}`);
  console.log(`  ⏭  skip (imageUrl already set):     ${counts.skipHasImage}`);
  console.log(`  ⏭  skip (no service method):        ${counts.skipNoService}`);
  console.log(`  ⏭  skip (no preview thumbnail):     ${counts.skipNoThumb}`);
  console.log(`  ❓ missing doc:                      ${counts.missingDoc}`);

  console.log('\n── Sample (first 2 to write) ────────────────────────────');
  samples.forEach(s => console.log(`  ${s.name} (${s.id}) method[${s.serviceIdx}]: imageUrl ${s.currentImageUrl} → ${s.newImageUrl}`));

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
