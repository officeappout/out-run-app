/**
 * Drive → Bunny dry-run for park exercises.
 *
 * Phase 1 (discover):  list all items the SA can see → find the park folder
 * Phase 2 (match):     list .mp4 files → normalize → match vs exercise names
 * Phase 3 (upload):    NOT here — runs only after David approves matched.json
 *
 * Usage:
 *   # Discover folders the SA can see:
 *   npx tsx scripts/drive-park-dry-run.ts --discover
 *
 *   # Full dry-run once folder ID is known:
 *   npx tsx scripts/drive-park-dry-run.ts --folder-id=<id>
 *
 * Output (match mode):
 *   scripts/corpus/drive-matched.json       videoId+name → exerciseId+methodIndex
 *   scripts/corpus/drive-unmatched.json     Drive files with no match
 *   scripts/corpus/exercise-unmatched.json  Exercise names with no Drive file
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';

// ── Auth (SA as itself — no impersonation, shared folder access) ─────────────

async function getDriveClientAsSA() {
  const { google } = await import('googleapis');
  const { JWT } = await import('google-auth-library');

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY not set');
  const creds = JSON.parse(raw) as { client_email: string; private_key: string };

  const auth = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    // NO subject — acting as the SA itself, not impersonating a user
  });

  return google.drive({ version: 'v3', auth });
}

// ── Drive helpers ────────────────────────────────────────────────────────────

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  parents?: string[];
}

async function listAll(drive: any, query: string, fields: string): Promise<DriveFile[]> {
  const results: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const res: any = await drive.files.list({
      q: query,
      fields: `nextPageToken, files(${fields})`,
      pageSize: 1000,
      pageToken,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });
    results.push(...(res.data.files ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return results;
}

// ── Name normalisation ───────────────────────────────────────────────────────

function normalise(raw: string): string {
  return raw
    .replace(/\.mp4$/i, '')          // strip extension
    .replace(/\.mov$/i, '')
    .replace(/_/g, ' ')              // underscores → spaces
    .replace(/-/g, ' ')              // hyphens → spaces (common in HE filenames)
    .replace(/\s+/g, ' ')            // collapse whitespace
    .trim()
    .toLowerCase();
}

// Levenshtein distance (for fuzzy fallback)
function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

// ── Load Firestore exercise data ─────────────────────────────────────────────

interface ExRow {
  exerciseId: string;
  name_he: string;
  name_en: string;
  methodIndex: number;
  location: string;
  shortBunnyVideoId: string;
}

function loadExercises(): ExRow[] {
  const p = path.join(process.cwd(), 'scripts/corpus/park-exercises-need-fullTutorial.json');
  if (!fs.existsSync(p)) throw new Error(`Missing ${p} — run export-park-exercises-need-fullTutorial.ts first`);
  return JSON.parse(fs.readFileSync(p, 'utf8')) as ExRow[];
}

// ── DISCOVER mode ────────────────────────────────────────────────────────────

async function discover(drive: any) {
  console.log('── Discovering items shared with SA ────────────────────────');

  // Items shared with this SA
  const shared = await listAll(drive, 'sharedWithMe = true', 'id, name, mimeType, parents');
  console.log(`\nShared with SA (${shared.length} items):`);
  shared.forEach(f => console.log(`  [${f.mimeType === 'application/vnd.google-apps.folder' ? 'DIR' : 'FILE'}] ${f.name}  (id: ${f.id})`));

  // Also list SA's own root
  const ownRoot = await listAll(drive, "'root' in parents", 'id, name, mimeType');
  if (ownRoot.length) {
    console.log(`\nSA root (${ownRoot.length} items):`);
    ownRoot.forEach(f => console.log(`  [${f.mimeType.includes('folder') ? 'DIR' : 'FILE'}] ${f.name}  (id: ${f.id})`));
  }

  console.log('\nRe-run with --folder-id=<id> once you identify the park folder.');
}

// ── LIST all .mp4 in folder (recursive) ─────────────────────────────────────

async function listMp4sRecursive(drive: any, folderId: string): Promise<DriveFile[]> {
  // First pass: all video files directly under folderId
  const files = await listAll(
    drive,
    `'${folderId}' in parents and (mimeType contains 'video' or name contains '.mp4' or name contains '.mov')`,
    'id, name, mimeType, size'
  );

  // Also check one level of subfolders (in case videos are grouped)
  const subFolders = await listAll(
    drive,
    `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder'`,
    'id, name'
  );

  if (subFolders.length) {
    console.log(`  Found ${subFolders.length} subfolder(s) — scanning each…`);
    for (const sf of subFolders) {
      const sub = await listAll(
        drive,
        `'${sf.id}' in parents and (mimeType contains 'video' or name contains '.mp4' or name contains '.mov')`,
        'id, name, mimeType, size'
      );
      files.push(...sub);
    }
  }

  return files;
}

// ── MATCH mode ───────────────────────────────────────────────────────────────

interface MatchedRow {
  driveFileId: string;
  driveFileName: string;
  normalised: string;
  matchType: 'exact' | 'fuzzy';
  fuzzyDistance?: number;
  exerciseId: string;
  name_he: string;
  methodIndex: number;
  location: string;
  shortBunnyVideoId: string;
}

interface UnmatchedDriveRow {
  driveFileId: string;
  driveFileName: string;
  normalised: string;
  closestExercise?: string;
  closestDistance?: number;
}

async function matchMode(drive: any, folderId: string) {
  console.log(`\n── Listing .mp4 files in folder ${folderId} ────────────────`);
  const driveFiles = await listMp4sRecursive(drive, folderId);
  console.log(`  Found ${driveFiles.length} video file(s) in Drive`);

  const exercises = loadExercises();
  console.log(`  Exercise targets: ${exercises.length} methods (${new Set(exercises.map(e => e.name_he)).size} unique names)`);

  // Build normalised → exercise map (first match wins if duplicate names)
  const exByNorm = new Map<string, ExRow>();
  for (const ex of exercises) {
    const n = normalise(ex.name_he);
    if (!exByNorm.has(n)) exByNorm.set(n, ex);
  }

  const matched: MatchedRow[] = [];
  const unmatchedDrive: UnmatchedDriveRow[] = [];
  const usedExerciseIds = new Set<string>();

  for (const f of driveFiles) {
    const norm = normalise(f.name);

    // 1. Exact match
    if (exByNorm.has(norm)) {
      const ex = exByNorm.get(norm)!;
      matched.push({
        driveFileId: f.id,
        driveFileName: f.name,
        normalised: norm,
        matchType: 'exact',
        exerciseId: ex.exerciseId,
        name_he: ex.name_he,
        methodIndex: ex.methodIndex,
        location: ex.location,
        shortBunnyVideoId: ex.shortBunnyVideoId,
      });
      usedExerciseIds.add(`${ex.exerciseId}:${ex.methodIndex}`);
      continue;
    }

    // 2. Fuzzy fallback (Levenshtein ≤ 3 chars)
    let bestDist = Infinity;
    let bestEx: ExRow | null = null;
    for (const [exNorm, ex] of exByNorm) {
      const d = lev(norm, exNorm);
      if (d < bestDist) { bestDist = d; bestEx = ex; }
    }

    if (bestEx && bestDist <= 3) {
      matched.push({
        driveFileId: f.id,
        driveFileName: f.name,
        normalised: norm,
        matchType: 'fuzzy',
        fuzzyDistance: bestDist,
        exerciseId: bestEx.exerciseId,
        name_he: bestEx.name_he,
        methodIndex: bestEx.methodIndex,
        location: bestEx.location,
        shortBunnyVideoId: bestEx.shortBunnyVideoId,
      });
      usedExerciseIds.add(`${bestEx.exerciseId}:${bestEx.methodIndex}`);
    } else {
      unmatchedDrive.push({
        driveFileId: f.id,
        driveFileName: f.name,
        normalised: norm,
        closestExercise: bestEx?.name_he,
        closestDistance: bestDist === Infinity ? undefined : bestDist,
      });
    }
  }

  // Exercises with no Drive file
  const exerciseUnmatched = exercises.filter(
    ex => !usedExerciseIds.has(`${ex.exerciseId}:${ex.methodIndex}`)
  );

  // ── Output ──────────────────────────────────────────────────────────────────
  const outDir = path.join(process.cwd(), 'scripts/corpus');
  fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(path.join(outDir, 'drive-matched.json'), JSON.stringify(matched, null, 2));
  fs.writeFileSync(path.join(outDir, 'drive-unmatched.json'), JSON.stringify(unmatchedDrive, null, 2));
  fs.writeFileSync(path.join(outDir, 'exercise-unmatched.json'), JSON.stringify(exerciseUnmatched, null, 2));

  console.log('\n── Results ──────────────────────────────────────────────────');
  console.log(`  Drive files found:            ${driveFiles.length}`);
  console.log(`  ✅ Matched (exact):            ${matched.filter(m => m.matchType === 'exact').length}`);
  console.log(`  🔶 Matched (fuzzy, dist≤3):   ${matched.filter(m => m.matchType === 'fuzzy').length}`);
  console.log(`  ❌ Drive file NO match:        ${unmatchedDrive.length}`);
  console.log(`  ❌ Exercise NO Drive file:     ${exerciseUnmatched.length}`);
  console.log('');
  console.log('  Saved: scripts/corpus/drive-matched.json');
  console.log('  Saved: scripts/corpus/drive-unmatched.json');
  console.log('  Saved: scripts/corpus/exercise-unmatched.json');

  if (unmatchedDrive.length > 0) {
    console.log('\n── Drive files with NO exercise match (first 15) ───────────');
    console.table(unmatchedDrive.slice(0, 15).map(r => ({
      fileName: r.driveFileName,
      closest: r.closestExercise ?? '—',
      dist: r.closestDistance ?? '—',
    })));
  }

  if (matched.filter(m => m.matchType === 'fuzzy').length > 0) {
    console.log('\n── Fuzzy matches — review these ────────────────────────────');
    console.table(
      matched.filter(m => m.matchType === 'fuzzy').map(r => ({
        driveFile: r.driveFileName,
        exercise: r.name_he,
        dist: r.fuzzyDistance,
      }))
    );
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  const isDiscover = process.argv.includes('--discover');
  const folderArg = process.argv.find(a => a.startsWith('--folder-id='))?.split('=')[1];

  if (!isDiscover && !folderArg) {
    console.error('Usage:\n  --discover              list items shared with SA\n  --folder-id=<id>        run full dry-run match');
    process.exit(1);
  }

  const drive = await getDriveClientAsSA();

  if (isDiscover) {
    await discover(drive);
  } else {
    await matchMode(drive, folderArg!);
  }

  process.exit(0);
}

main().catch(e => {
  console.error('Error:', e.message ?? e);
  process.exit(1);
});
