/**
 * Bulk-upload previewVideo.he for the "service" (מילואים / צבא) execution method.
 *
 * Variant of bulk-upload-fullTutorial.ts. Two behavioural differences:
 *   • Target field   = execution_methods[].media.previewVideo.he   (NOT fullTutorial.he)
 *   • Method selector = FIND-OR-CREATE by location === 'service'    (NOT a fixed method_index)
 *
 * For each row in video-service-preview-overrides.csv:
 *   1. Stream video from Google Drive (service account, Shared Drive)
 *   2. Create Bunny video slot
 *   3. PUT stream to Bunny (server-side, no public URL needed)
 *   4. Poll until encoding finished
 *   5. Find the exercise's `service` method (or CREATE one), then write
 *      previewVideo.he = { videoId, provider:'bunny', thumbnailUrl }
 *
 * Usage:
 *   npx tsx scripts/bulk-upload-preview-service.ts --dry-run          # plan only — reads, no writes/uploads
 *   npx tsx scripts/bulk-upload-preview-service.ts --dry-run --limit=10
 *   npx tsx scripts/bulk-upload-preview-service.ts --confirm-stage0   # REAL run (requires Stage-0 merged)
 *   npx tsx scripts/bulk-upload-preview-service.ts --confirm-stage0 --force   # overwrite existing previewVideo.he
 *
 * ⚠️ A real (non-dry-run) run is REFUSED unless --confirm-stage0 is passed, because the
 *    Admin SDK bypasses sanitizeExecutionMethodForSave + Firestore rules: writing a
 *    location='service' method before 'service' is added to ExecutionLocation / VALID_LOCATIONS
 *    / EXECUTION_LOCATION_LABELS (Stage 0) would persist a method the app can't render.
 *
 * CSV columns: drive_file_id,exercise_id,exercise_name,location,match_type
 * Results: scripts/corpus/upload-results-service.json (checkpoint after every row)
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import * as admin from 'firebase-admin';
import * as fs   from 'fs';
import * as path from 'path';
import * as https from 'https';
import { parse as csvParse } from 'csv-parse/sync';

// ── The new execution method ──────────────────────────────────────────────────

const SERVICE_LOCATION = 'service';

// ── CLI flags ─────────────────────────────────────────────────────────────────

const LIMIT          = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] ?? 'Infinity', 10);
const DRY_RUN        = process.argv.includes('--dry-run');
const FORCE          = process.argv.includes('--force');
const CONFIRM_STAGE0 = process.argv.includes('--confirm-stage0');

// ── Paths ─────────────────────────────────────────────────────────────────────

const CORPUS       = path.join(process.cwd(), 'scripts/corpus');
const CSV_PATH     = path.join(CORPUS, 'video-service-preview-overrides.csv');
const RESULTS_PATH = path.join(CORPUS, 'upload-results-service.json');

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

// ── Bunny helpers (identical to bulk-upload-fullTutorial.ts) ───────────────────

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

async function bunnyPoll(videoId: string, maxMinutes: number = 20): Promise<void> {
  const { apiKey, libraryId } = getBunnyConfig();
  const deadline = Date.now() + maxMinutes * 60_000;

  while (Date.now() < deadline) {
    const res = await fetch(
      `https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}`,
      { headers: { AccessKey: apiKey, Accept: 'application/json' } },
    );
    if (!res.ok) throw new Error(`Bunny poll: ${res.status}`);
    const j = (await res.json()) as { status: number; encodeProgress?: number };

    if (j.status === 3 || j.status === 4) return;      // finished
    if (j.status === 5) throw new Error(`Bunny encoding failed for videoId=${videoId}`);

    const pct = j.encodeProgress ?? 0;
    process.stdout.write(`\r    encoding ${pct}%   `);
    await new Promise(r => setTimeout(r, 8_000));
  }
  throw new Error(`Bunny encoding timed out (${maxMinutes}min)`);
}

// ── find-or-create by location === 'service' ──────────────────────────────────

/** Index of the method whose locationMapping (SoT) or scalar location is 'service'; -1 if none. */
function findServiceMethodIndex(methods: any[]): number {
  return methods.findIndex((m: any) => {
    const lm = Array.isArray(m?.locationMapping) ? m.locationMapping : [];
    return lm.includes(SERVICE_LOCATION) || m?.location === SERVICE_LOCATION;
  });
}

/** Minimal, save-validator-shaped skeleton for a newly created `service` method. */
function buildServiceMethod(exerciseName: string) {
  return {
    methodName:       { he: exerciseName },     // cosmetic — refine in admin later
    location:         SERVICE_LOCATION,          // scalar (app re-syncs to locationMapping[0] on next save)
    locationMapping:  [SERVICE_LOCATION],        // source of truth
    requiredGearType: 'user_gear',
    gearIds:          [],
    equipmentIds:     [],
    lifestyleTags:    [],
    media:            {},                         // previewVideo.he added by the write path
  };
}

interface RowPlan {
  docExists:    boolean;
  action:       'create' | 'update' | 'skip' | 'missing-doc';
  methodIndex:  number;   // resolved index (existing or -1 when it would be appended)
  existingId?:  string;   // previewVideo.he.videoId already present
  methodCount:  number;
}

/** Read-only: what WOULD happen for this exercise (used by dry-run + as pre-check). */
async function planRow(db: admin.firestore.Firestore, exerciseId: string): Promise<RowPlan> {
  const snap = await db.collection('exercises').doc(exerciseId).get();
  if (!snap.exists) return { docExists: false, action: 'missing-doc', methodIndex: -1, methodCount: 0 };

  const data = snap.data()!;
  const methods: any[] = data.execution_methods ?? data.executionMethods ?? [];
  const idx = findServiceMethodIndex(methods);

  if (idx === -1) {
    return { docExists: true, action: 'create', methodIndex: -1, methodCount: methods.length };
  }
  const existingId = methods[idx]?.media?.previewVideo?.he?.videoId;
  if (existingId && !FORCE) {
    return { docExists: true, action: 'skip', methodIndex: idx, existingId, methodCount: methods.length };
  }
  return { docExists: true, action: 'update', methodIndex: idx, existingId, methodCount: methods.length };
}

// ── Firestore write (real run only) ───────────────────────────────────────────

async function writeServicePreviewHe(
  db:           admin.firestore.Firestore,
  exerciseId:   string,
  exerciseName: string,
  bunnyVideoId: string,
  thumbnailUrl: string,
): Promise<'created' | 'updated'> {
  const ref  = db.collection('exercises').doc(exerciseId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`Exercise doc ${exerciseId} not found`);

  const data    = snap.data()!;
  const methods: any[] = (data.execution_methods ?? data.executionMethods ?? []).map((m: any) => ({ ...m }));

  let idx  = findServiceMethodIndex(methods);
  let mode: 'created' | 'updated';

  if (idx === -1) {
    methods.push(buildServiceMethod(exerciseName));
    idx  = methods.length - 1;
    mode = 'created';
  } else {
    const existing = methods[idx]?.media?.previewVideo?.he?.videoId;
    if (existing && !FORCE) {
      throw new Error(`SKIP: previewVideo.he already set to bunnyId=${existing} — use --force to overwrite`);
    }
    mode = 'updated';
  }

  const media = { ...(methods[idx]?.media ?? {}) };
  media.previewVideo = {
    ...(media.previewVideo ?? {}),
    he: { videoId: bunnyVideoId, provider: 'bunny', thumbnailUrl },
  };
  // Durability: mirror the Bunny thumbnail into imageUrl so the method passes the swap-all
  // complete-media gate (methodHasCompleteMedia = video AND image). Only when currently empty.
  if (!media.imageUrl || (typeof media.imageUrl === 'string' && media.imageUrl.trim() === '')) {
    media.imageUrl = thumbnailUrl;
  }
  methods[idx] = { ...methods[idx], media };

  await ref.update({
    execution_methods: methods,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return mode;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface CsvRow {
  drive_file_id: string;
  exercise_id:   string;
  exercise_name: string;
  location:      string;
  match_type?:   string;
}

interface UploadResult extends CsvRow {
  status:        'success' | 'skipped' | 'error';
  action?:       RowPlan['action'] | 'created' | 'updated';
  bunnyVideoId?: string;
  thumbnailUrl?: string;
  driveName?:    string;
  driveMB?:      string;
  error?:        string;
  ts:            string;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSV not found: ${CSV_PATH}`);
    process.exit(1);
  }

  // Safety gate: refuse a REAL run unless Stage-0 is confirmed merged.
  if (!DRY_RUN && !CONFIRM_STAGE0) {
    console.error(
      '\n⛔ Refusing real run.\n' +
      '   Pass --dry-run to preview, or --confirm-stage0 once `service` is merged into\n' +
      '   ExecutionLocation / VALID_LOCATIONS / EXECUTION_LOCATION_LABELS (Stage 0).\n' +
      '   Admin SDK bypasses save-validation — writing an unregistered location persists\n' +
      '   a method the app cannot render.\n'
    );
    process.exit(1);
  }

  const raw: CsvRow[] = (csvParse(fs.readFileSync(CSV_PATH, 'utf8'), {
    columns:          true,
    skip_empty_lines: true,
    trim:             true,
  }) as any[]).map(r => ({
    drive_file_id: r.drive_file_id,
    exercise_id:   r.exercise_id,
    exercise_name: r.exercise_name,
    location:      r.location,
    match_type:    r.match_type,
  }));

  const rows = raw.slice(0, isFinite(LIMIT) ? LIMIT : raw.length);
  console.log(`CSV total: ${raw.length} rows | processing: ${rows.length}`);
  console.log(`Target: previewVideo.he · method: find-or-create location='${SERVICE_LOCATION}'`);
  if (DRY_RUN) console.log('DRY-RUN — reads only, NO Bunny uploads, NO Firestore writes');
  if (FORCE)   console.log('FORCE — will overwrite existing previewVideo.he');

  // Warn about duplicate exercise_ids in the CSV (each service method holds one previewVideo).
  const seen = new Map<string, number>();
  raw.forEach(r => seen.set(r.exercise_id, (seen.get(r.exercise_id) ?? 0) + 1));
  const dups = [...seen.entries()].filter(([, n]) => n > 1);
  if (dups.length) {
    console.log(`\n⚠️  ${dups.length} exercise_id(s) appear >1× in CSV (dedupe before real run):`);
    dups.forEach(([id, n]) => console.log(`    ${id} ×${n}`));
  }

  const prevResults: UploadResult[] = fs.existsSync(RESULTS_PATH)
    ? JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf8'))
    : [];
  const prevSuccessIds = new Set(
    prevResults.filter(r => r.status === 'success').map(r => `${r.exercise_id}:${SERVICE_LOCATION}`),
  );

  initFirebase();
  const db    = admin.firestore();
  const drive = await makeDriveClient();

  const newResults: UploadResult[] = [];
  const planCounts = { create: 0, update: 0, skip: 0, 'missing-doc': 0, 'drive-error': 0 };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const tag = `[${i + 1}/${rows.length}]`;
    const fz  = row.match_type === 'fuzzy' ? ' 🔶fuzzy' : '';
    console.log(`\n${tag} "${row.exercise_name}"${fz}  ex=${row.exercise_id}`);

    if (prevSuccessIds.has(`${row.exercise_id}:${SERVICE_LOCATION}`)) {
      console.log('  ⏭  Already uploaded (previous run)');
      continue;
    }

    const result: UploadResult = { ...row, status: 'error', ts: new Date().toISOString() };

    try {
      // ── 1. Firestore plan (find-or-create service method) ─────────────────
      const plan = await planRow(db, row.exercise_id);
      result.action = plan.action;

      if (plan.action === 'missing-doc') {
        planCounts['missing-doc']++;
        throw new Error(`Exercise doc ${row.exercise_id} not found`);
      }
      if (plan.action === 'skip') {
        console.log(`  ⏭  service method already has previewVideo.he (bunnyId=${plan.existingId}) — skipping`);
        planCounts.skip++;
        result.status = 'success';
        result.bunnyVideoId = plan.existingId;
        newResults.push(result);
        continue;
      }
      const planLabel = plan.action === 'create'
        ? `CREATE new service method (doc has ${plan.methodCount} method(s))`
        : `UPDATE existing service method [index ${plan.methodIndex}]`;
      console.log(`  Plan: ${planLabel}`);

      // ── 2. Drive metadata (validate the file is reachable) ────────────────
      const meta = await drive.files.get({
        fileId:            row.drive_file_id,
        fields:            'name,size,mimeType',
        supportsAllDrives: true,
      });
      const fileSize = parseInt(meta.data.size ?? '0', 10);
      const mimeType = meta.data.mimeType ?? 'video/mp4';
      const mbStr    = (fileSize / 1_048_576).toFixed(1);
      result.driveName = meta.data.name ?? undefined;
      result.driveMB   = mbStr;
      console.log(`  Drive: "${meta.data.name}"  ${mbStr} MB  ${mimeType}`);
      if (fileSize === 0) throw new Error('Drive file size is 0 — metadata issue or wrong fileId');

      planCounts[plan.action as 'create' | 'update']++;

      if (DRY_RUN) {
        result.status = 'skipped';
        result.error  = 'dry-run';
        newResults.push(result);
        continue;
      }

      // ── 3. Create Bunny slot ──────────────────────────────────────────────
      const bunnyVideoId = await bunnyCreateSlot(`${row.exercise_name} (service)`);
      console.log(`  Bunny slot: ${bunnyVideoId}`);

      // ── 4. Stream Drive → Bunny PUT ───────────────────────────────────────
      console.log(`  Uploading ${mbStr} MB to Bunny…`);
      const driveStream = (await drive.files.get(
        { fileId: row.drive_file_id, alt: 'media', supportsAllDrives: true },
        { responseType: 'stream' },
      )).data as unknown as NodeJS.ReadableStream;

      await bunnyPutStream(bunnyVideoId, driveStream, fileSize, mimeType);
      console.log('  Upload done. Polling encoding…');

      // ── 5. Poll until encoded ─────────────────────────────────────────────
      await bunnyPoll(bunnyVideoId);
      process.stdout.write('\n');
      console.log('  Encoding finished.');

      const { cdnHost } = getBunnyConfig();
      const thumbnailUrl = `https://${cdnHost}/${bunnyVideoId}/thumbnail.jpg`;

      // ── 6. Write to Firestore (find-or-create) ────────────────────────────
      const mode = await writeServicePreviewHe(db, row.exercise_id, row.exercise_name, bunnyVideoId, thumbnailUrl);
      console.log(`  ✅ Firestore ${mode} (previewVideo.he set)`);

      result.status       = 'success';
      result.action       = mode;
      result.bunnyVideoId = bunnyVideoId;
      result.thumbnailUrl = thumbnailUrl;

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.startsWith('SKIP:')) {
        console.log(`  ⏭  ${msg} (orphan Bunny slot created)`);
        result.status = 'success';
      } else {
        console.error(`  ❌ ${msg}`);
        result.status = 'error';
        if (msg.includes('not found') || msg.includes('File not found') || msg.includes('size is 0')) {
          planCounts['drive-error']++;
        }
      }
      result.error = msg;
    }

    newResults.push(result);

    // Checkpoint after every row (dry-run writes to the same results file — harmless preview log)
    if (!DRY_RUN) {
      fs.writeFileSync(RESULTS_PATH, JSON.stringify([...prevResults, ...newResults], null, 2));
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n── Plan summary ─────────────────────────────────────────────');
  console.log(`  🆕 would CREATE service method: ${planCounts.create}`);
  console.log(`  ✏️  would UPDATE service method: ${planCounts.update}`);
  console.log(`  ⏭  SKIP (already has preview):  ${planCounts.skip}`);
  console.log(`  ❓ missing exercise doc:         ${planCounts['missing-doc']}`);
  console.log(`  ❌ Drive error (unreachable/0B): ${planCounts['drive-error']}`);

  if (!DRY_RUN) {
    const all     = [...prevResults, ...newResults];
    const success = all.filter(r => r.status === 'success').length;
    const errors  = all.filter(r => r.status === 'error').length;
    console.log('\n── Run summary ──────────────────────────────────────────────');
    console.log(`  ✅ Success: ${success}`);
    console.log(`  ❌ Errors:  ${errors}`);
    console.log(`  Results:   ${RESULTS_PATH}`);
  } else {
    console.log('\nDRY-RUN complete — nothing uploaded, nothing written.');
  }

  const errorRows = newResults.filter(r => r.status === 'error');
  if (errorRows.length) {
    console.log('\n  Rows needing attention:');
    errorRows.forEach(r => console.log(`    ${r.exercise_id} "${r.exercise_name}": ${r.error}`));
  }

  process.exit(errorRows.length > 0 && !DRY_RUN ? 1 : 0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
