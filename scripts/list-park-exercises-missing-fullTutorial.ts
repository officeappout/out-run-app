/**
 * Dry-run: list park exercises that have previewVideo (short) but no fullTutorial (long).
 *
 * Usage:
 *   npx tsx scripts/list-park-exercises-missing-fullTutorial.ts
 *
 * Output: console table + scripts/corpus/park-exercises-need-fullTutorial.json
 *
 * Prerequisites: .env.local with FIREBASE_SERVICE_ACCOUNT_KEY or FIREBASE_PROJECT_ID.
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

// ── Firebase init ────────────────────────────────────────────────────────────

function initFirebase() {
  if (admin.apps.length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (raw) {
    const cred = JSON.parse(raw);
    admin.initializeApp({ credential: admin.credential.cert(cred), projectId: cred.project_id });
    return;
  }
  // Fallback: Application Default Credentials (gcloud auth)
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID ?? 'appout-1',
  });
}

// ── Types (minimal) ──────────────────────────────────────────────────────────

interface ExternalVideo { videoId: string; provider: string }
type LocalizedVideo = { he?: ExternalVideo; en?: ExternalVideo };

interface MethodMedia {
  mainVideoUrl?: string | null;
  previewVideo?: LocalizedVideo;
  fullTutorial?: LocalizedVideo;
}

interface ExecutionMethod {
  location?: string;
  locationMapping?: string[];
  media?: MethodMedia;
}

interface Exercise {
  id: string;
  name?: { he?: string; en?: string } | string;
  media?: {
    previewVideo?: LocalizedVideo;
    fullTutorial?: LocalizedVideo;
  };
  execution_methods?: ExecutionMethod[];
  executionMethods?: ExecutionMethod[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const PARK_LOCATIONS = new Set(['park', 'street', 'outdoor']);

function isParkMethod(m: ExecutionMethod): boolean {
  if (PARK_LOCATIONS.has(m.location ?? '')) return true;
  return (m.locationMapping ?? []).some(l => PARK_LOCATIONS.has(l));
}

function hasPreview(video?: LocalizedVideo): boolean {
  return !!(video?.he?.videoId || video?.en?.videoId);
}

function hasFullTutorial(video?: LocalizedVideo): boolean {
  return !!(video?.he?.videoId || video?.en?.videoId);
}

function exName(ex: Exercise): string {
  if (!ex.name) return ex.id;
  if (typeof ex.name === 'string') return ex.name;
  return ex.name.he ?? ex.name.en ?? ex.id;
}

// ── Main ─────────────────────────────────────────────────────────────────────

interface Row {
  exerciseId: string;
  name_he: string;
  methodIndex: number;
  location: string;
  hasPreviewHe: boolean;
  hasPreviewEn: boolean;
  hasFullTutorialHe: boolean;
  hasFullTutorialEn: boolean;
  mainVideoUrl: string;
}

async function main() {
  initFirebase();
  const db = admin.firestore();

  console.log('Fetching exercises collection…');
  const snap = await db.collection('exercises').get();
  console.log(`  Total exercises: ${snap.size}`);

  const rows: Row[] = [];

  for (const doc of snap.docs) {
    const ex = { id: doc.id, ...doc.data() } as Exercise;
    const methods: ExecutionMethod[] = ex.execution_methods ?? ex.executionMethods ?? [];

    methods.forEach((m, idx) => {
      if (!isParkMethod(m)) return;

      // Determine preview presence (method-level OR exercise-level fallback)
      const methodPreview = m.media?.previewVideo;
      const exPreview = ex.media?.previewVideo;
      const effectivePreview: LocalizedVideo = {
        he: methodPreview?.he ?? exPreview?.he,
        en: methodPreview?.en ?? exPreview?.en,
      };

      // Only include if has at least one preview video
      if (!hasPreview(effectivePreview)) return;

      // Determine fullTutorial presence
      const methodFull = m.media?.fullTutorial;
      const exFull = ex.media?.fullTutorial;
      const effectiveFull: LocalizedVideo = {
        he: methodFull?.he ?? exFull?.he,
        en: methodFull?.en ?? exFull?.en,
      };

      rows.push({
        exerciseId: ex.id,
        name_he: exName(ex),
        methodIndex: idx,
        location: m.locationMapping?.join('+') ?? m.location ?? 'park',
        hasPreviewHe: !!effectivePreview.he?.videoId,
        hasPreviewEn: !!effectivePreview.en?.videoId,
        hasFullTutorialHe: !!effectiveFull.he?.videoId,
        hasFullTutorialEn: !!effectiveFull.en?.videoId,
        mainVideoUrl: m.media?.mainVideoUrl ?? '',
      });
    });
  }

  // Split into "missing fullTutorial.he" vs "complete"
  const needsLong = rows.filter(r => !r.hasFullTutorialHe);
  const alreadyHas = rows.filter(r => r.hasFullTutorialHe);

  console.log('\n── Summary ──────────────────────────────────────────────────');
  console.log(`  Park methods with previewVideo:       ${rows.length}`);
  console.log(`  ✅ Already has fullTutorial.he:       ${alreadyHas.length}`);
  console.log(`  ⚠️  Missing fullTutorial.he (target): ${needsLong.length}`);

  // Save full results
  const outDir = path.join(process.cwd(), 'scripts/corpus');
  fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, 'park-exercises-need-fullTutorial.json');
  fs.writeFileSync(outPath, JSON.stringify(needsLong, null, 2), 'utf8');
  console.log(`\n  Saved: ${outPath}`);

  // Also save "already complete" for reference
  const donePath = path.join(outDir, 'park-exercises-already-have-fullTutorial.json');
  fs.writeFileSync(donePath, JSON.stringify(alreadyHas, null, 2), 'utf8');
  console.log(`  Saved: ${donePath}`);

  // Print first 20 rows as preview
  console.log('\n── First 20 exercises needing fullTutorial ──────────────────');
  console.table(
    needsLong.slice(0, 20).map(r => ({
      exerciseId: r.exerciseId,
      name_he: r.name_he,
      methodIndex: r.methodIndex,
      location: r.location,
      previewHe: r.hasPreviewHe ? '✅' : '–',
    }))
  );

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
