/**
 * 3-way exact match: Tracking Sheet × Firestore exercises × Drive files
 *
 * Logic:
 *   Sheet Col A (exercise name) = canonical name David uses
 *   Drive filename (strip .mp4) ≈ same canonical name
 *   Firestore name_he ≈ same canonical name
 *
 *   Match step 1: sheet_name == drive_filename (exact, normalised)
 *   Match step 2: sheet_name == firestore_name_he (exact, normalised)
 *   Both must hit → record is fully resolved
 *
 *   NO fuzzy. Items that almost-match go to *-weak.json for David to review.
 *
 * Outputs:
 *   scripts/corpus/matched-from-sheet.json        → ready for upload script
 *   scripts/corpus/sheet-unmatched-drive.json     → sheet name has no Drive file
 *   scripts/corpus/sheet-unmatched-firestore.json → sheet name has no Firestore match
 *   scripts/corpus/drive-orphans.json             → Drive file not in sheet
 *
 * Usage:
 *   npx tsx scripts/sheet-to-exercise-match.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// ── helpers ──────────────────────────────────────────────────────────────────

function norm(s: string): string {
  return s
    .replace(/\.(mp4|mov|avi|mkv)$/i, '')   // strip extension
    .replace(/’|‘|'/g, "'")        // curly apostrophe → straight
    .replace(/׳/g, "'")                 // Hebrew geresh → straight
    .replace(/״/g, '"')                 // Hebrew gershayim → "
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// ── load inputs ───────────────────────────────────────────────────────────────

const CORPUS = path.join(process.cwd(), 'scripts/corpus');

interface ExRow {
  exerciseId: string;
  name_he: string;
  name_en: string;
  methodIndex: number;
  location: string;
  shortBunnyVideoId: string;
}
const exercises: ExRow[] = JSON.parse(fs.readFileSync(path.join(CORPUS, 'park-exercises-need-fullTutorial.json'), 'utf8'));

interface DriveFile {
  id: string;
  name: string;
  folder: string;
}
const driveAll: DriveFile[] = JSON.parse(fs.readFileSync(path.join(CORPUS, 'drive-ready-videos.json'), 'utf8'));
const driveVideos = driveAll.filter(f => /\.(mp4|mov)$/i.test(f.name));

// ── parse tracking sheet ──────────────────────────────────────────────────────

// We already have the downloaded XLSX
async function parseSheet(): Promise<{ name: string; status: string; sheet: string }[]> {
  const XLSX = await import('xlsx');
  const buf = fs.readFileSync(path.join(CORPUS, 'tracking-sheet.xlsx'));
  const wb = XLSX.read(buf, { type: 'buffer' });

  // Sheets that contain park-relevant exercises
  // Sheet structure: Col A = exercise name, Col D or E or F = status
  const CONTENT_SHEETS: { name: string; nameCol: number; statusCol: number }[] = [
    { name: 'פלג גוף עליון+קליסטניקס', nameCol: 0, statusCol: 5 }, // F = "העלאה לאפליקציה"
    { name: 'פל גוף תחתון',             nameCol: 0, statusCol: 4 }, // E = "העלאה לאפליקציה"
    { name: 'עמידות ידיים',              nameCol: 0, statusCol: 4 }, // E = "העלאה לאפליקציה"
    { name: 'תרגילי מתקנים',             nameCol: 0, statusCol: 4 }, // E = "העלאה לאפליקציה"
  ];

  const entries: { name: string; status: string; sheet: string }[] = [];

  for (const def of CONTENT_SHEETS) {
    const ws = wb.Sheets[def.name];
    if (!ws) continue;
    const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // Skip header row (row 0)
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const name = String(r[def.nameCol] ?? '').trim();
      const status = String(r[def.statusCol] ?? '').trim();
      if (!name) continue;
      entries.push({ name, status, sheet: def.name });
    }
  }

  return entries;
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const sheetEntries = await parseSheet();
  console.log(`Sheet entries parsed: ${sheetEntries.length}`);

  // Filter to exercises that have a video ready (either uploaded or ready to upload)
  const readyStatuses = new Set([
    'עלה לאפליקציה',
    'מוכן להעלאה לאפליקציה',
  ]);
  // Partial match: any status that STARTS WITH one of the above
  const readyEntries = sheetEntries.filter(e =>
    [...readyStatuses].some(s => e.status.startsWith(s)) || e.status.includes('עלה לאפליקציה')
  );
  console.log(`  With "ready" video status: ${readyEntries.length}`);

  // Build lookup maps (normalised)
  const driveByNorm = new Map<string, DriveFile[]>();
  for (const f of driveVideos) {
    const k = norm(f.name);
    if (!driveByNorm.has(k)) driveByNorm.set(k, []);
    driveByNorm.get(k)!.push(f);
  }

  const exByNorm = new Map<string, ExRow[]>();
  for (const ex of exercises) {
    const k = norm(ex.name_he);
    if (!exByNorm.has(k)) exByNorm.set(k, []);
    exByNorm.get(k)!.push(ex);
  }

  // ── 3-way match ──────────────────────────────────────────────────────────────
  const matched: any[] = [];
  const unmatchedDrive: any[] = [];    // sheet entry → no Drive file
  const unmatchedFirestore: any[] = []; // sheet entry + Drive file → no Firestore entry
  const usedDriveIds = new Set<string>();
  const usedExKeys = new Set<string>();

  for (const entry of readyEntries) {
    const nEntry = norm(entry.name);

    const driveFiles = driveByNorm.get(nEntry) ?? [];
    const exRows = exByNorm.get(nEntry) ?? [];

    if (!driveFiles.length) {
      unmatchedDrive.push({ sheetName: entry.name, sheetNorm: nEntry, sheet: entry.sheet, status: entry.status });
      continue;
    }
    if (!exRows.length) {
      // Has Drive file but no Firestore park exercise — might be home/other category
      unmatchedFirestore.push({
        sheetName: entry.name,
        sheetNorm: nEntry,
        sheet: entry.sheet,
        driveFiles: driveFiles.map(f => ({ id: f.id, name: f.name, folder: f.folder })),
      });
      continue;
    }

    // Full 3-way match
    for (const ex of exRows) {
      const key = `${ex.exerciseId}:${ex.methodIndex}`;
      for (const f of driveFiles) {
        usedDriveIds.add(f.id);
        usedExKeys.add(key);
        matched.push({
          sheetName: entry.name,
          sheetStatus: entry.status,
          sheet: entry.sheet,
          driveFileId: f.id,
          driveFileName: f.name,
          driveFolder: f.folder,
          isDriveDup: driveFiles.length > 1,
          exerciseId: ex.exerciseId,
          name_he: ex.name_he,
          methodIndex: ex.methodIndex,
          location: ex.location,
          shortBunnyVideoId: ex.shortBunnyVideoId,
        });
      }
    }
  }

  // Drive files not referenced by any sheet entry
  const driveOrphans = driveVideos.filter(f => !usedDriveIds.has(f.id));
  // Exercises with no sheet+drive match
  const exOrphans = exercises.filter(ex => !usedExKeys.has(`${ex.exerciseId}:${ex.methodIndex}`));

  // ── write outputs ─────────────────────────────────────────────────────────────
  fs.writeFileSync(path.join(CORPUS, 'matched-from-sheet.json'),
    JSON.stringify(matched, null, 2));
  fs.writeFileSync(path.join(CORPUS, 'sheet-unmatched-drive.json'),
    JSON.stringify(unmatchedDrive, null, 2));
  fs.writeFileSync(path.join(CORPUS, 'sheet-unmatched-firestore.json'),
    JSON.stringify(unmatchedFirestore, null, 2));
  fs.writeFileSync(path.join(CORPUS, 'drive-orphans.json'),
    JSON.stringify(driveOrphans, null, 2));
  fs.writeFileSync(path.join(CORPUS, 'exercise-orphans.json'),
    JSON.stringify(exOrphans, null, 2));

  console.log('\n── Results ──────────────────────────────────────────────────');
  console.log(`  Sheet "ready" entries:                ${readyEntries.length}`);
  console.log(`  ✅ 3-way matched (sheet+drive+db):    ${matched.length}`);
  console.log(`     of which: isDriveDup=true:         ${matched.filter(m=>m.isDriveDup).length}`);
  console.log(`  ⚠️  Sheet name found in Drive only:    ${unmatchedFirestore.length}`);
  console.log(`  ❌ Sheet name → no Drive file:         ${unmatchedDrive.length}`);
  console.log(`  ❌ Drive file not in sheet:            ${driveOrphans.length}`);
  console.log(`  ❌ Firestore ex not in sheet or Drive: ${exOrphans.length}`);
  console.log('');
  console.log('  Saved: matched-from-sheet.json');
  console.log('  Saved: sheet-unmatched-drive.json');
  console.log('  Saved: sheet-unmatched-firestore.json');
  console.log('  Saved: drive-orphans.json');
  console.log('  Saved: exercise-orphans.json');

  if (matched.length > 0) {
    console.log('\n── Sample matches (first 20) ────────────────────────────────');
    console.table(
      matched.slice(0, 20).map(m => ({
        sheet: m.sheetName,
        drive: m.driveFileName,
        exercise: m.name_he,
        exerciseId: m.exerciseId.substring(0, 10),
        dup: m.isDriveDup ? '⚠️' : '',
      }))
    );
  }
}

main().catch(e => { console.error(e.message ?? e); process.exit(1); });
