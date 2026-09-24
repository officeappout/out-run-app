/**
 * scripts/bulk-upload-equipment-videos.ts
 *
 * Upload equipment demo videos from Google Drive → Bunny CDN, then write
 * the Bunny embed URL to gym_equipment/{id}.brands[brandIndex].videoUrl.
 *
 * Usage:
 *   npx tsx scripts/bulk-upload-equipment-videos.ts --limit=1   # test: first row only
 *   npx tsx scripts/bulk-upload-equipment-videos.ts             # full run
 *   npx tsx scripts/bulk-upload-equipment-videos.ts --dry-run   # Drive metadata only, no upload
 *   npx tsx scripts/bulk-upload-equipment-videos.ts --force     # overwrite existing videoUrl
 *
 * CSV columns: drive_file_id, equipment_id, brand_index, equipment_name, brand_name
 * Reads:       scripts/corpus/video-equipment-overrides.csv
 * Results:     scripts/corpus/equipment-video-results.json  (checkpoint after every row)
 *
 * The URL written to Firestore is:
 *   https://iframe.bunnycdn.com/embed/{BUNNY_LIBRARY_ID}/{bunnyVideoId}
 *
 * NOTE: EquipmentDetailDrawer.parseVideoEmbed must handle bunnycdn.com URLs
 *       for the mobile player to render an inline iframe (see the fix in that file).
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import * as admin from 'firebase-admin';
import * as fs    from 'fs';
import * as path  from 'path';
import * as https from 'https';
import { parse as csvParse } from 'csv-parse/sync';

// ── CLI flags ─────────────────────────────────────────────────────────────────

const LIMIT   = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] ?? 'Infinity', 10);
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE   = process.argv.includes('--force');

// ── Paths ─────────────────────────────────────────────────────────────────────

const CORPUS       = path.join(process.cwd(), 'scripts/corpus');
const CSV_PATH     = path.join(CORPUS, 'video-equipment-overrides.csv');
const RESULTS_PATH = path.join(CORPUS, 'equipment-video-results.json');

// ── Bunny config ──────────────────────────────────────────────────────────────

function getBunnyConfig() {
  const apiKey    = (process.env.BUNNY_API_KEY     ?? '').trim();
  const libraryId = (process.env.BUNNY_LIBRARY_ID  ?? '').trim();
  if (!apiKey || !libraryId) throw new Error('BUNNY_API_KEY / BUNNY_LIBRARY_ID not set in .env.local');
  return { apiKey, libraryId };
}

function bunnyEmbedUrl(libraryId: string, videoId: string): string {
  return `https://iframe.bunnycdn.com/embed/${libraryId}/${videoId}`;
}

// ── Firebase ──────────────────────────────────────────────────────────────────

function initFirebase() {
  if (admin.apps.length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY not set');
  const c = JSON.parse(raw);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

// ── Drive client ──────────────────────────────────────────────────────────────

async function makeDriveClient() {
  const { google } = await import('googleapis');
  const { JWT }    = await import('google-auth-library');
  const creds      = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  const auth       = new JWT({
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
        res.resume();
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

async function bunnyPoll(videoId: string, maxMinutes = 20): Promise<void> {
  const { apiKey, libraryId } = getBunnyConfig();
  const deadline = Date.now() + maxMinutes * 60_000;
  while (Date.now() < deadline) {
    const res = await fetch(
      `https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}`,
      { headers: { AccessKey: apiKey, Accept: 'application/json' } },
    );
    if (!res.ok) throw new Error(`Bunny poll: ${res.status}`);
    const j = (await res.json()) as { status: number; encodeProgress?: number };
    if (j.status === 3 || j.status === 4) return;
    if (j.status === 5) throw new Error(`Bunny encoding failed for videoId=${videoId}`);
    process.stdout.write(`\r    encoding ${j.encodeProgress ?? 0}%   `);
    await new Promise(r => setTimeout(r, 8_000));
  }
  throw new Error(`Bunny encoding timed out (${maxMinutes}min)`);
}

// ── Firestore write ───────────────────────────────────────────────────────────

async function writeEquipmentVideoUrl(
  db:          admin.firestore.Firestore,
  equipmentId: string,
  brandIndex:  number,
  videoUrl:    string,
): Promise<void> {
  const ref  = db.collection('gym_equipment').doc(equipmentId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`gym_equipment/${equipmentId} not found`);

  const data   = snap.data()!;
  const brands: any[] = Array.isArray(data.brands)
    ? data.brands.map((b: any) => ({ ...b }))
    : [];

  if (brandIndex >= brands.length) {
    throw new Error(`brandIndex=${brandIndex} out of bounds (doc has ${brands.length} brand(s))`);
  }

  const existing = brands[brandIndex]?.videoUrl;
  if (existing && !FORCE) {
    throw new Error(`SKIP: brands[${brandIndex}].videoUrl already set — use --force to overwrite`);
  }

  brands[brandIndex] = { ...brands[brandIndex], videoUrl };

  await ref.update({
    brands,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface CsvRow {
  drive_file_id:  string;
  equipment_id:   string;
  brand_index:    number;
  equipment_name: string;
  brand_name:     string;
}

interface UploadResult extends CsvRow {
  status:        'success' | 'skipped' | 'error';
  bunnyVideoId?: string;
  videoUrl?:     string;
  error?:        string;
  ts:            string;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSV not found: ${CSV_PATH}`);
    console.error('Run build-equipment-video-matches.ts first, then review the CSV.');
    process.exit(1);
  }

  const raw: CsvRow[] = (csvParse(fs.readFileSync(CSV_PATH, 'utf8'), {
    columns:          true,
    skip_empty_lines: true,
    trim:             true,
  }) as any[]).map(r => ({
    drive_file_id:  r.drive_file_id,
    equipment_id:   r.equipment_id,
    brand_index:    parseInt(r.brand_index, 10),
    equipment_name: r.equipment_name,
    brand_name:     r.brand_name,
  }));

  const rows = raw.slice(0, isFinite(LIMIT) ? LIMIT : raw.length);
  console.log(`CSV total: ${raw.length} rows | processing: ${rows.length}`);
  if (DRY_RUN) console.log('DRY-RUN — Drive metadata only, no uploads, no Firestore writes');
  if (FORCE)   console.log('FORCE — will overwrite existing videoUrl');

  const prevResults: UploadResult[] = fs.existsSync(RESULTS_PATH)
    ? JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf8'))
    : [];
  const prevSuccessIds = new Set(
    prevResults.filter(r => r.status === 'success').map(r => r.drive_file_id),
  );

  initFirebase();
  const db    = admin.firestore();
  const drive = await makeDriveClient();
  const { libraryId } = getBunnyConfig();

  const newResults: UploadResult[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const tag = `[${i + 1}/${rows.length}]`;
    console.log(`\n${tag} "${row.equipment_name}"  brand[${row.brand_index}]=${row.brand_name}`);
    console.log(`    equipmentId=${row.equipment_id}  driveFileId=${row.drive_file_id}`);

    if (prevSuccessIds.has(row.drive_file_id)) {
      console.log('  ⏭  Already uploaded (previous run)');
      continue;
    }

    const result: UploadResult = { ...row, status: 'error', ts: new Date().toISOString() };

    try {
      // ── 1. Drive metadata ─────────────────────────────────────────────────
      const meta = await drive.files.get({
        fileId:            row.drive_file_id,
        fields:            'name,size,mimeType',
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
      const slotTitle    = `equipment-${row.equipment_name}-${row.brand_name}`;
      const bunnyVideoId = await bunnyCreateSlot(slotTitle);
      console.log(`  Bunny slot: ${bunnyVideoId}`);

      // ── 3. Stream Drive → Bunny PUT ───────────────────────────────────────
      console.log(`  Uploading ${mbStr} MB to Bunny…`);
      const driveStream = (await drive.files.get(
        { fileId: row.drive_file_id, alt: 'media', supportsAllDrives: true },
        { responseType: 'stream' },
      )).data as unknown as NodeJS.ReadableStream;

      await bunnyPutStream(bunnyVideoId, driveStream, fileSize, mimeType);
      console.log('  Upload done. Polling encoding…');

      // ── 4. Poll until encoded ─────────────────────────────────────────────
      await bunnyPoll(bunnyVideoId);
      process.stdout.write('\n');
      console.log('  Encoding finished.');

      const videoUrl = bunnyEmbedUrl(libraryId, bunnyVideoId);

      // ── 5. Write to Firestore ─────────────────────────────────────────────
      await writeEquipmentVideoUrl(db, row.equipment_id, row.brand_index, videoUrl);
      console.log(`  ✅ Firestore updated  videoUrl=${videoUrl}`);

      result.status       = 'success';
      result.bunnyVideoId = bunnyVideoId;
      result.videoUrl     = videoUrl;

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.startsWith('SKIP:')) {
        console.log(`  ⏭  ${msg}`);
        result.status = 'skipped';
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
      console.log(`    "${r.equipment_name}" ${r.equipment_id}: ${r.error}`)
    );
  }

  process.exit(errors > 0 ? 1 : 0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
