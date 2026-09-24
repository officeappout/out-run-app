/**
 * Bulk-upload fullTutorial.he for park exercises.
 *
 * For each row in video-fulltutorial-overrides.csv:
 *   1. Stream video from Google Drive (service account, Shared Drive)
 *   2. Create Bunny video slot
 *   3. PUT stream to Bunny (server-side, no public URL needed)
 *   4. Poll until encoding finished
 *   5. Write fullTutorial.he to exercises/{id}.execution_methods[idx].media
 *
 * Usage:
 *   npx tsx scripts/bulk-upload-fullTutorial.ts --limit=5   # test: first 5 rows
 *   npx tsx scripts/bulk-upload-fullTutorial.ts              # full run (all rows)
 *   npx tsx scripts/bulk-upload-fullTutorial.ts --dry-run    # Drive metadata only
 *   npx tsx scripts/bulk-upload-fullTutorial.ts --force      # overwrite existing fullTutorial.he
 *
 * CSV columns: drive_file_id,exercise_id,method_index,exercise_name,location
 * Results: scripts/corpus/upload-results.json (checkpoint after every row)
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import * as admin from 'firebase-admin';
import * as fs   from 'fs';
import * as path from 'path';
import * as https from 'https';
import { parse as csvParse } from 'csv-parse/sync';

// ── CLI flags ─────────────────────────────────────────────────────────────────

const LIMIT   = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] ?? 'Infinity', 10);
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE   = process.argv.includes('--force');

// ── Paths ─────────────────────────────────────────────────────────────────────

const CORPUS       = path.join(process.cwd(), 'scripts/corpus');
const CSV_PATH     = path.join(CORPUS, 'video-fulltutorial-overrides.csv');
const RESULTS_PATH = path.join(CORPUS, 'upload-results.json');

// ── Bunny config (from env) ───────────────────────────────────────────────────

function getBunnyConfig() {
  const apiKey     = (process.env.BUNNY_API_KEY     ?? '').trim();
  const libraryId  = (process.env.BUNNY_LIBRARY_ID  ?? '').trim();
  const cdnHost    = (process.env.BUNNY_CDN_HOSTNAME ?? 'vz-b17872ab-7a7.b-cdn.net').trim();
  if (!apiKey || !libraryId) throw new Error('BUNNY_API_KEY / BUNNY_LIBRARY_ID not set in .env.local');
  return { apiKey, libraryId, cdnHost };
}

// ── Firebase init ─────────────────────────────────────────────────────────────

function initFirebase() {
  if (admin.apps.length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY not set');
  const c = JSON.parse(raw);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

// ── Drive client (SA as itself — Shared Drive access) ─────────────────────────

async function makeDriveClient() {
  const { google }   = await import('googleapis');
  const { JWT }      = await import('google-auth-library');
  const creds        = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  const auth         = new JWT({
    email:  creds.client_email,
    key:    creds.private_key,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  return google.drive({ version: 'v3', auth });
}

// ── Bunny helpers ─────────────────────────────────────────────────────────────

async function bunnyCreateSlot(title: string): Promise<string> {
  const { apiKey, libraryId } = getBunnyConfig();
  const res = await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos`, {
    method:  'POST',
    headers: { AccessKey: apiKey, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`Bunny create: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { guid: string }).guid;
}

/** Stream a Node.js Readable directly into Bunny via HTTP PUT (no memory buffer). */
function bunnyPutStream(
  videoId:  string,
  stream:   NodeJS.ReadableStream,
  fileSize: number,
  mimeType: string,
): Promise<void> {
  const { apiKey, libraryId } = getBunnyConfig();
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'video.bunnycdn.com',
      path:     `/library/${libraryId}/videos/${videoId}`,
      method:   'PUT',
      headers:  {
        'AccessKey':      apiKey,
        'Content-Type':   mimeType.startsWith('video/') ? mimeType : 'video/mp4',
        'Content-Length': fileSize,
      },
    }, res => {
      if ((res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300) {
        res.resume(); // consume and discard
        resolve();
      } else {
        let body = '';
        res.on('data', (c: string) => (body += c));
        res.on('end', () => reject(new Error(`Bunny PUT ${res.statusCode}: ${body}`)));
      }
    });
    req.on('error', reject);
    stream.pipe(req);
  });
}

async function bunnyPoll(
  videoId:    string,
  maxMinutes: number = 20,
): Promise<void> {
  const { apiKey, libraryId } = getBunnyConfig();
  const deadline = Date.now() + maxMinutes * 60_000;

  while (Date.now() < deadline) {
    const res = await fetch(
      `https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}`,
      { headers: { AccessKey: apiKey, Accept: 'application/json' } },
    );
    if (!res.ok) throw new Error(`Bunny poll: ${res.status}`);
    const j = (await res.json()) as { status: number; encodeProgress?: number };

    // 3 = finished, 4 = resolution finished, 5 = failed
    if (j.status === 3 || j.status === 4) return;
    if (j.status === 5) throw new Error(`Bunny encoding failed for videoId=${videoId}`);

    const pct = j.encodeProgress ?? 0;
    process.stdout.write(`\r    encoding ${pct}%   `);
    await new Promise(r => setTimeout(r, 8_000));
  }
  throw new Error(`Bunny encoding timed out (${maxMinutes}min)`);
}

// ── Firestore pre-check ───────────────────────────────────────────────────────

async function getExistingBunnyId(
  db:          admin.firestore.Firestore,
  exerciseId:  string,
  methodIndex: number,
): Promise<string | null> {
  const snap = await db.collection('exercises').doc(exerciseId).get();
  if (!snap.exists) return null;
  const data    = snap.data()!;
  const methods: any[] = data.execution_methods ?? data.executionMethods ?? [];
  return methods[methodIndex]?.media?.fullTutorial?.he?.videoId ?? null;
}

// ── Firestore write ───────────────────────────────────────────────────────────

async function writeFullTutorialHe(
  db:           admin.firestore.Firestore,
  exerciseId:   string,
  methodIndex:  number,
  bunnyVideoId: string,
  thumbnailUrl: string,
): Promise<void> {
  const ref  = db.collection('exercises').doc(exerciseId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`Exercise doc ${exerciseId} not found`);

  const data    = snap.data()!;
  // Firestore stores the field as execution_methods (snake_case)
  const methods: any[] = (data.execution_methods ?? data.executionMethods ?? []).map((m: any) => ({ ...m }));

  if (methodIndex >= methods.length) {
    throw new Error(`methodIndex=${methodIndex} out of bounds (doc has ${methods.length} methods)`);
  }

  const existing = methods[methodIndex]?.media?.fullTutorial?.he?.videoId;
  if (existing && !FORCE) {
    throw new Error(`SKIP: fullTutorial.he already set to bunnyId=${existing} — use --force to overwrite`);
  }

  const media = { ...(methods[methodIndex]?.media ?? {}) };
  media.fullTutorial = {
    ...(media.fullTutorial ?? {}),
    he: { videoId: bunnyVideoId, provider: 'bunny', thumbnailUrl },
  };
  methods[methodIndex] = { ...methods[methodIndex], media };

  await ref.update({
    execution_methods: methods,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface CsvRow {
  drive_file_id: string;
  exercise_id:   string;
  method_index:  number;
  exercise_name: string;
  location:      string;
}

interface UploadResult extends CsvRow {
  status:       'success' | 'skipped' | 'error';
  bunnyVideoId?: string;
  thumbnailUrl?: string;
  error?:        string;
  ts:            string;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Validate inputs
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSV not found: ${CSV_PATH}`);
    process.exit(1);
  }

  const raw: CsvRow[] = (csvParse(fs.readFileSync(CSV_PATH, 'utf8'), {
    columns:           true,
    skip_empty_lines:  true,
    trim:              true,
  }) as any[]).map(r => ({
    drive_file_id: r.drive_file_id,
    exercise_id:   r.exercise_id,
    method_index:  parseInt(r.method_index, 10),
    exercise_name: r.exercise_name,
    location:      r.location,
  }));

  const rows = raw.slice(0, isFinite(LIMIT) ? LIMIT : raw.length);
  console.log(`CSV total: ${raw.length} rows | processing: ${rows.length}`);
  if (DRY_RUN) console.log('DRY-RUN — no uploads, no Firestore writes');
  if (FORCE)   console.log('FORCE — will overwrite existing fullTutorial.he');

  // Load previous results for idempotency
  const prevResults: UploadResult[] = fs.existsSync(RESULTS_PATH)
    ? JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf8'))
    : [];
  const prevSuccessIds = new Set(
    prevResults.filter(r => r.status === 'success').map(r => `${r.exercise_id}:${r.method_index}`),
  );

  initFirebase();
  const db    = admin.firestore();
  const drive = await makeDriveClient();

  const newResults: UploadResult[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const tag = `[${i + 1}/${rows.length}]`;
    console.log(`\n${tag} "${row.exercise_name}"  ex=${row.exercise_id} method=${row.method_index}`);

    if (prevSuccessIds.has(`${row.exercise_id}:${row.method_index}`)) {
      console.log('  ⏭  Already uploaded (previous run)');
      continue;
    }

    const result: UploadResult = { ...row, status: 'error', ts: new Date().toISOString() };

    try {
      // ── 0. Firestore pre-check — skip Drive+Bunny if video already set ────
      let shouldProcess = true;
      if (!FORCE) {
        const existing = await getExistingBunnyId(db, row.exercise_id, row.method_index);
        if (existing) {
          console.log(`  ⏭  fullTutorial.he already in Firestore (bunnyId=${existing}) — skipping Drive`);
          result.status       = 'success';
          result.bunnyVideoId = existing;
          shouldProcess = false;
        }
      }

      if (shouldProcess) {
      // ── 1. Drive metadata ─────────────────────────────────────────────────
      const meta = await drive.files.get({
        fileId:          row.drive_file_id,
        fields:          'name,size,mimeType',
        supportsAllDrives: true,
      });
      const fileSize = parseInt(meta.data.size ?? '0', 10);
      const mimeType = meta.data.mimeType ?? 'video/mp4';
      const mbStr    = (fileSize / 1_048_576).toFixed(1);
      console.log(`  Drive: "${meta.data.name}"  ${mbStr} MB  ${mimeType}`);
      if (fileSize === 0) throw new Error('Drive file size is 0 — metadata issue or wrong fileId');

      if (DRY_RUN) {
        result.status = 'skipped';
        result.error  = 'dry-run';
        newResults.push(result);
        continue;
      }

      // ── 2. Create Bunny slot ──────────────────────────────────────────────
      const bunnyVideoId = await bunnyCreateSlot(row.exercise_name);
      console.log(`  Bunny slot: ${bunnyVideoId}`);

      // ── 3. Stream Drive → Bunny PUT ───────────────────────────────────────
      console.log(`  Uploading ${mbStr} MB to Bunny…`);
      const driveStream = (await drive.files.get(
        { fileId: row.drive_file_id, alt: 'media', supportsAllDrives: true },
        { responseType: 'stream' },
      )).data as unknown as NodeJS.ReadableStream;

      await bunnyPutStream(bunnyVideoId, driveStream, fileSize, mimeType);
      console.log(`  Upload done. Polling encoding…`);

      // ── 4. Poll until encoded ─────────────────────────────────────────────
      await bunnyPoll(bunnyVideoId);
      process.stdout.write('\n');
      console.log('  Encoding finished.');

      const { cdnHost } = getBunnyConfig();
      const thumbnailUrl = `https://${cdnHost}/${bunnyVideoId}/thumbnail.jpg`;

      // ── 5. Write to Firestore ─────────────────────────────────────────────
      await writeFullTutorialHe(db, row.exercise_id, row.method_index, bunnyVideoId, thumbnailUrl);
      console.log('  ✅ Firestore updated');

      result.status       = 'success';
      result.bunnyVideoId = bunnyVideoId;
      result.thumbnailUrl = thumbnailUrl;
      } // end if (shouldProcess)

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.startsWith('SKIP:')) {
        // Firestore was set between pre-check and write (race — rare); data is correct
        console.log(`  ⏭  ${msg} (orphan Bunny slot created)`);
        result.status = 'success';
      } else {
        console.error(`  ❌ ${msg}`);
        result.status = 'error';
      }
      result.error = msg;
    }

    newResults.push(result);

    // Checkpoint after every row
    const allResults = [...prevResults, ...newResults];
    fs.writeFileSync(RESULTS_PATH, JSON.stringify(allResults, null, 2));
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const all     = [...prevResults, ...newResults];
  const success = all.filter(r => r.status === 'success').length;
  const skipped = all.filter(r => r.status === 'skipped').length;
  const errors  = all.filter(r => r.status === 'error').length;

  console.log('\n── Summary ──────────────────────────────────────────────────');
  console.log(`  ✅ Success: ${success}`);
  console.log(`  ⏭  Skipped: ${skipped}`);
  console.log(`  ❌ Errors:  ${errors}`);
  console.log(`  Results:   ${RESULTS_PATH}`);

  if (errors > 0) {
    console.log('\n  Failed rows:');
    all.filter(r => r.status === 'error').forEach(r =>
      console.log(`    ${r.exercise_id} "${r.exercise_name}": ${r.error}`)
    );
  }

  process.exit(errors > 0 ? 1 : 0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
