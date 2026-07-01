/**
 * Export park exercises that have mainVideoUrl (short, legacy Bunny)
 * but NO fullTutorial (long video) in any slot.
 *
 * Usage:
 *   npx tsx scripts/export-park-exercises-need-fullTutorial.ts
 *
 * Output: scripts/corpus/park-exercises-need-fullTutorial.json
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

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

// Extract Bunny videoId from legacy URL: .../play_360p.mp4 or .../play_720p.mp4
function extractBunnyVideoId(url: string): string | null {
  const match = url.match(/b-cdn\.net\/([a-f0-9-]{36})\//);
  return match?.[1] ?? null;
}

interface Row {
  exerciseId: string;
  name_he: string;
  name_en: string;
  methodIndex: number;
  location: string;
  shortVideoUrl: string;           // existing mainVideoUrl (short)
  shortBunnyVideoId: string;       // extracted from URL
  hasFullTutorialHe: boolean;
  hasFullTutorialEn: boolean;
  hasPreviewPhase5: boolean;       // already migrated to Phase 5?
}

async function main() {
  initFirebase();
  const db = admin.firestore();
  console.log('Fetching exercises…');
  const snap = await db.collection('exercises').get();
  console.log(`  Total: ${snap.size}`);

  const rows: Row[] = [];
  let parkTotal = 0;
  let skippedNoVideo = 0;

  for (const doc of snap.docs) {
    const ex = doc.data() as any;
    const methods: any[] = ex.execution_methods ?? ex.executionMethods ?? [];

    methods.forEach((m: any, idx: number) => {
      if (!isPark(m)) return;
      parkTotal++;

      const mainUrl: string = m.media?.mainVideoUrl ?? '';
      if (!mainUrl) { skippedNoVideo++; return; }

      const hasFull = !!(
        m.media?.fullTutorial?.he?.videoId ||
        m.media?.fullTutorial?.en?.videoId ||
        ex.media?.fullTutorial?.he?.videoId ||
        ex.media?.fullTutorial?.en?.videoId
      );
      const hasPreviewPhase5 = !!(
        m.media?.previewVideo?.he?.videoId ||
        m.media?.previewVideo?.en?.videoId ||
        ex.media?.previewVideo?.he?.videoId
      );

      rows.push({
        exerciseId: doc.id,
        name_he: ex.name?.he ?? doc.id,
        name_en: ex.name?.en ?? '',
        methodIndex: idx,
        location: m.locationMapping?.join('+') ?? m.location ?? 'park',
        shortVideoUrl: mainUrl,
        shortBunnyVideoId: extractBunnyVideoId(mainUrl) ?? '',
        hasFullTutorialHe: !!(m.media?.fullTutorial?.he?.videoId ?? ex.media?.fullTutorial?.he?.videoId),
        hasFullTutorialEn: !!(m.media?.fullTutorial?.en?.videoId ?? ex.media?.fullTutorial?.en?.videoId),
        hasPreviewPhase5,
      });
    });
  }

  const needsLong = rows.filter(r => !r.hasFullTutorialHe);
  const alreadyDone = rows.filter(r => r.hasFullTutorialHe);

  console.log(`\n── Summary ──────────────────────────────────────────────────`);
  console.log(`  Park execution methods total:         ${parkTotal}`);
  console.log(`  Has mainVideoUrl (short):             ${rows.length}`);
  console.log(`  → Already has fullTutorial.he:        ${alreadyDone.length}`);
  console.log(`  → MISSING fullTutorial.he (target):   ${needsLong.length}`);
  console.log(`  → Already on Phase 5 previewVideo:    ${rows.filter(r => r.hasPreviewPhase5).length}`);

  const outDir = path.join(process.cwd(), 'scripts/corpus');
  fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, 'park-exercises-need-fullTutorial.json');
  fs.writeFileSync(outPath, JSON.stringify(needsLong, null, 2), 'utf8');
  console.log(`\n  ✅ Saved ${needsLong.length} rows → ${outPath}`);

  // Also export as simple name list for Drive matching
  const nameListPath = path.join(outDir, 'park-exercises-names.txt');
  const names = [...new Set(needsLong.map(r => r.name_he))].sort();
  fs.writeFileSync(nameListPath, names.join('\n'), 'utf8');
  console.log(`  ✅ Saved name list (${names.length} unique) → ${nameListPath}`);

  console.log('\n── First 15 exercises ──────────────────────────────────────');
  console.table(
    needsLong.slice(0, 15).map(r => ({
      exerciseId: r.exerciseId.substring(0, 10),
      name_he: r.name_he,
      loc: r.location,
      shortBunnyId: r.shortBunnyVideoId.substring(0, 8) + '…',
    }))
  );

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
