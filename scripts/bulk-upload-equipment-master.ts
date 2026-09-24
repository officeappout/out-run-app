/**
 * scripts/bulk-upload-equipment-master.ts
 *
 * Reads OUT-upload-master.csv and for each (equipment, brand) pair:
 *   1. Resolves gym_equipment doc by ID, or by name-match, or creates if needs_create=TRUE
 *   2. Downloads video from Drive → uploads to Bunny Stream → stores embed URL
 *   3. Downloads image from Drive → uploads to Firebase Storage → stores public URL
 *   4. Updates gym_equipment.brands[] by brandId (never overwrites other brands)
 *   5. Checkpoints after each pair (idempotent)
 *
 * Usage:
 *   npx tsx scripts/bulk-upload-equipment-master.ts --page=3   # test: page_idx=3 only
 *   npx tsx scripts/bulk-upload-equipment-master.ts --dry-run  # Drive metadata only
 *   npx tsx scripts/bulk-upload-equipment-master.ts            # full run
 *   npx tsx scripts/bulk-upload-equipment-master.ts --force    # overwrite existing URLs
 *
 * Images go to Firebase Storage (no Bunny Storage credentials configured).
 * Videos go to Bunny Stream (library 640043).
 *
 * Checkpoint key: `${resolvedEquipmentId}:${brandId}`
 * Checkpoint file: scripts/corpus/equipment-master-results.json
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

const PAGE_FILTER = (() => {
  const a = process.argv.find(a => a.startsWith('--page='));
  return a ? parseInt(a.split('=')[1], 10) : null;
})();
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE   = process.argv.includes('--force');

// ── Config ────────────────────────────────────────────────────────────────────

const CORPUS         = path.join(process.cwd(), 'scripts/corpus');
const CSV_PATH       = path.join(CORPUS, 'OUT-upload-master.csv');
const RESULTS_PATH   = path.join(CORPUS, 'equipment-master-results.json');

// ── Firebase init ─────────────────────────────────────────────────────────────

function initFirebase() {
  if (admin.apps.length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY not set');
  const c = JSON.parse(raw);
  admin.initializeApp({
    credential: admin.credential.cert(c),
    projectId:  c.project_id,
  });
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
  return google.drive({ version: 'v3', auth }) as any;
}

// ── Bunny Stream helpers ──────────────────────────────────────────────────────

function getBunnyConfig() {
  const apiKey    = (process.env.BUNNY_API_KEY    ?? '').trim();
  const libraryId = (process.env.BUNNY_LIBRARY_ID ?? '').trim();
  if (!apiKey || !libraryId) throw new Error('BUNNY_API_KEY / BUNNY_LIBRARY_ID not set');
  return { apiKey, libraryId };
}

function bunnyEmbedUrl(libraryId: string, videoId: string) {
  return `https://iframe.bunnycdn.com/embed/${libraryId}/${videoId}`;
}

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
        res.resume(); resolve();
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
    if (j.status === 5) throw new Error(`Bunny encoding failed for ${videoId}`);
    process.stdout.write(`\r    encoding ${j.encodeProgress ?? 0}%   `);
    await new Promise(r => setTimeout(r, 8_000));
  }
  throw new Error(`Bunny encoding timed out (${maxMinutes}min)`);
}

// ── Bunny Storage image upload ────────────────────────────────────────────────

function getBunnyStorageConfig() {
  const zone      = (process.env.BUNNY_STORAGE_ZONE       ?? '').trim();
  const accessKey = (process.env.BUNNY_STORAGE_ACCESSKEY  ?? '').trim();
  const pullZone  = (process.env.BUNNY_STORAGE_PULLZONE   ?? '').trim();
  if (!zone || !accessKey || !pullZone) {
    throw new Error('BUNNY_STORAGE_ZONE / BUNNY_STORAGE_ACCESSKEY / BUNNY_STORAGE_PULLZONE not set');
  }
  return { zone, accessKey, pullZone };
}

async function uploadImageToBunny(
  equipmentId: string,
  brandId:     string,
  buffer:      Buffer,
  mimeType:    string,
): Promise<string> {
  const { zone, accessKey, pullZone } = getBunnyStorageConfig();
  const ext      = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
  const storagePath = `equipment/${equipmentId}/${brandId}.${ext}`;
  const uploadUrl   = `https://storage.bunnycdn.com/${zone}/${storagePath}`;

  const res = await fetch(uploadUrl, {
    method:  'PUT',
    headers: {
      AccessKey:      accessKey,
      'Content-Type': mimeType,
    },
    body: buffer,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Bunny Storage PUT ${res.status}: ${text}`);
  }

  return `https://${pullZone}/${storagePath}`;
}

// ── Equipment resolution ──────────────────────────────────────────────────────

function normalise(s: string): string {
  return s
    .replace(/[\s\-–—\/\(\)]/g, '')
    .replace(/במכונה|מכונה|מתקן|בישיבה|ב?שכיבה/g, '')
    .toLowerCase()
    .trim();
}

function nameSimilarity(a: string, b: string): number {
  const na = normalise(a);
  const nb = normalise(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  // word overlap
  const wa = new Set(na.split(''));
  const wb = new Set(nb.split(''));
  const inter = [...wa].filter(c => wb.has(c)).length;
  return inter / Math.max(wa.size, wb.size);
}

async function resolveEquipment(
  db:           admin.firestore.Firestore,
  csvId:        string,
  name:         string,
  needsCreate:  boolean,
  brandId:      string,
  brandName:    string,
): Promise<string> {
  // 1. Try exact doc ID (if not "NEW")
  if (csvId && csvId !== 'NEW') {
    const snap = await db.collection('gym_equipment').doc(csvId).get();
    if (snap.exists) return csvId;
    console.log(`    ⚠️  equipment_id ${csvId} not found in Firestore — falling back to name search`);
  }

  // 2. Name search
  const allSnap = await db.collection('gym_equipment').get();
  let bestId    = '';
  let bestScore = 0;
  for (const d of allSnap.docs) {
    const score = nameSimilarity(name, d.data().name ?? '');
    if (score > bestScore) { bestScore = score; bestId = d.id; }
  }

  if (bestScore >= 0.85) {
    const existingName = (await db.collection('gym_equipment').doc(bestId).get()).data()?.name;
    console.log(`    🔍 name-match: "${name}" → "${existingName}" (score=${bestScore.toFixed(2)}) id=${bestId}`);
    return bestId;
  }

  // 3. Create new document
  if (!needsCreate) {
    throw new Error(`No match for "${name}" (best=${bestScore.toFixed(2)}) and needs_create is not TRUE`);
  }

  const newRef = db.collection('gym_equipment').doc();
  await newRef.set({
    name,
    type:               'reps',
    recommendedLevel:   1,
    isFunctional:       false,
    muscleGroups:       [],
    brands:             [{ brandName, brandId }],
    createdAt:          admin.firestore.FieldValue.serverTimestamp(),
    updatedAt:          admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log(`    ✨ Created new gym_equipment "${name}" → ${newRef.id}`);
  return newRef.id;
}

// ── Firestore brand update ────────────────────────────────────────────────────

async function updateBrand(
  db:          admin.firestore.Firestore,
  equipmentId: string,
  brandId:     string,
  brandName:   string,
  videoUrl?:   string,
  imageUrl?:   string,
): Promise<void> {
  const ref  = db.collection('gym_equipment').doc(equipmentId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`gym_equipment/${equipmentId} not found`);

  const data   = snap.data()!;
  const brands: any[] = Array.isArray(data.brands)
    ? data.brands.map((b: any) => ({ ...b }))
    : [];

  const idx = brands.findIndex((b: any) => b.brandId === brandId || b.brandName === brandName);

  if (idx >= 0) {
    if (videoUrl) brands[idx] = { ...brands[idx], videoUrl };
    if (imageUrl) brands[idx] = { ...brands[idx], imageUrl };
  } else {
    const entry: any = { brandName, brandId };
    if (videoUrl) entry.videoUrl = videoUrl;
    if (imageUrl) entry.imageUrl = imageUrl;
    brands.push(entry);
  }

  await ref.update({
    brands,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface CsvRow {
  page_idx:       number;
  equipment_id:   string;
  equipment_name: string;
  needs_create:   boolean;
  brand:          string;
  brandId:        string;
  code:           string;
  video_drive_id: string;
  image_drive_id: string;
  video_file:     string;
  image_file:     string;
}

interface Result {
  checkpoint_key: string;
  equipment_id:   string;
  equipment_name: string;
  brand:          string;
  code:           string;
  status:         'success' | 'skipped' | 'error';
  videoUrl?:      string;
  imageUrl?:      string;
  error?:         string;
  ts:             string;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const raw: CsvRow[] = (csvParse(fs.readFileSync(CSV_PATH, 'utf8'), {
    columns: true, skip_empty_lines: true, trim: true, relax_column_count: true,
  }) as any[]).map(r => ({
    page_idx:       parseInt(r.page_idx, 10),
    equipment_id:   r.equipment_id?.trim() ?? '',
    equipment_name: r.equipment_name?.trim() ?? '',
    needs_create:   r.needs_create?.trim().toUpperCase() === 'TRUE',
    brand:          r.brand?.trim() ?? '',
    brandId:        r.brandId?.trim() ?? '',
    code:           r.code?.trim() ?? '',
    video_drive_id: r.video_drive_id?.trim() ?? '',
    image_drive_id: r.image_drive_id?.trim() ?? '',
    video_file:     r.video_file?.trim() ?? '',
    image_file:     r.image_file?.trim() ?? '',
  }));

  const rows = PAGE_FILTER !== null
    ? raw.filter(r => r.page_idx === PAGE_FILTER)
    : raw;

  console.log(`CSV total: ${raw.length} rows | processing: ${rows.length}`);
  if (PAGE_FILTER !== null) console.log(`  Filter: page_idx=${PAGE_FILTER}`);
  if (DRY_RUN) console.log('  DRY-RUN — no uploads, no Firestore writes');
  if (FORCE)   console.log('  FORCE — will overwrite existing URLs');

  const prevResults: Result[] = fs.existsSync(RESULTS_PATH)
    ? JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf8'))
    : [];
  const doneKeys = new Set(
    prevResults.filter(r => r.status === 'success').map(r => r.checkpoint_key),
  );

  initFirebase();
  const db    = admin.firestore();
  const drive = await makeDriveClient();
  const { libraryId } = getBunnyConfig();

  const newResults: Result[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const tag = `[${i + 1}/${rows.length}]`;

    // Resolve equipment doc first (needed for checkpoint key)
    let resolvedId: string;
    try {
      resolvedId = await resolveEquipment(
        db, row.equipment_id, row.equipment_name, row.needs_create, row.brandId, row.brand,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`\n${tag} ❌ RESOLVE FAIL "${row.equipment_name}": ${msg}`);
      newResults.push({
        checkpoint_key: `${row.equipment_id}:${row.brandId}`,
        equipment_id:   row.equipment_id,
        equipment_name: row.equipment_name,
        brand:          row.brand,
        code:           row.code,
        status:         'error',
        error:          msg,
        ts:             new Date().toISOString(),
      });
      saveCheckpoint(prevResults, newResults);
      continue;
    }

    const key = `${resolvedId}:${row.brandId}`;
    console.log(`\n${tag} "${row.equipment_name}" [${row.brand}] code=${row.code}`);
    console.log(`    eq=${resolvedId}  brandId=${row.brandId}`);

    if (doneKeys.has(key) && !FORCE) {
      console.log(`  ⏭  Already done (checkpoint)`);
      continue;
    }

    const result: Result = {
      checkpoint_key: key,
      equipment_id:   resolvedId,
      equipment_name: row.equipment_name,
      brand:          row.brand,
      code:           row.code,
      status:         'error',
      ts:             new Date().toISOString(),
    };

    try {
      let videoUrl: string | undefined;
      let imageUrl: string | undefined;

      // ── Video ──────────────────────────────────────────────────────────────
      if (row.video_drive_id) {
        const meta = await drive.files.get({
          fileId: row.video_drive_id, fields: 'name,size,mimeType', supportsAllDrives: true,
        });
        const fileSize = parseInt(meta.data.size ?? '0', 10);
        const mimeType = meta.data.mimeType ?? 'video/mp4';
        const mbStr    = (fileSize / 1_048_576).toFixed(1);
        console.log(`  📹 Drive video: "${meta.data.name}"  ${mbStr} MB`);

        if (fileSize === 0) throw new Error('Video Drive file size is 0');

        if (!DRY_RUN) {
          const slotTitle    = `eq-${row.equipment_name}-${row.brand}-${row.code}`;
          const bunnyVideoId = await bunnyCreateSlot(slotTitle);
          console.log(`     Bunny slot: ${bunnyVideoId}`);

          const driveStream = (await drive.files.get(
            { fileId: row.video_drive_id, alt: 'media', supportsAllDrives: true },
            { responseType: 'stream' },
          )).data as unknown as NodeJS.ReadableStream;

          await bunnyPutStream(bunnyVideoId, driveStream, fileSize, mimeType);
          console.log('     Upload done. Polling…');
          await bunnyPoll(bunnyVideoId);
          process.stdout.write('\n');

          videoUrl = bunnyEmbedUrl(libraryId, bunnyVideoId);
          console.log(`     videoUrl: ${videoUrl}`);
        }
      } else {
        console.log('  📹 No video_drive_id — skipping video');
      }

      // ── Image ──────────────────────────────────────────────────────────────
      if (row.image_drive_id) {
        const imgMeta = await drive.files.get({
          fileId: row.image_drive_id, fields: 'name,size,mimeType', supportsAllDrives: true,
        });
        const imgSize = parseInt(imgMeta.data.size ?? '0', 10);
        const imgMime = imgMeta.data.mimeType ?? 'image/jpeg';
        const imgMb   = (imgSize / 1_048_576).toFixed(1);
        console.log(`  🖼️  Drive image: "${imgMeta.data.name}"  ${imgMb} MB`);

        if (imgSize === 0) throw new Error('Image Drive file size is 0');

        if (!DRY_RUN) {
          // Buffer image in memory (images are small)
          const imgStream = (await drive.files.get(
            { fileId: row.image_drive_id, alt: 'media', supportsAllDrives: true },
            { responseType: 'stream' },
          )).data as unknown as NodeJS.ReadableStream;

          const chunks: Buffer[] = [];
          await new Promise<void>((resolve, reject) => {
            imgStream.on('data', (c: Buffer) => chunks.push(c));
            imgStream.on('end', resolve);
            imgStream.on('error', reject);
          });
          const imgBuffer = Buffer.concat(chunks);

          imageUrl = await uploadImageToBunny(resolvedId, row.brandId, imgBuffer, imgMime);
          console.log(`     imageUrl: ${imageUrl}`);
        }
      } else {
        console.log('  🖼️  No image_drive_id — skipping image');
      }

      // ── Firestore update ───────────────────────────────────────────────────
      if (!DRY_RUN && (videoUrl || imageUrl)) {
        await updateBrand(db, resolvedId, row.brandId, row.brand, videoUrl, imageUrl);
        console.log(`  ✅ Firestore updated  videoUrl=${videoUrl ? '✓' : '—'}  imageUrl=${imageUrl ? '✓' : '—'}`);
      } else if (DRY_RUN) {
        console.log('  ⏭  dry-run — skipping Firestore write');
      } else {
        console.log('  ⚠️  No files uploaded — Firestore not updated');
      }

      result.status   = DRY_RUN ? 'skipped' : 'success';
      result.videoUrl = videoUrl;
      result.imageUrl = imageUrl;
      if (DRY_RUN) result.error = 'dry-run';

    } catch (err: unknown) {
      let msg: string;
      if (err instanceof Error) {
        msg = err.message;
      } else if (typeof err === 'object' && err !== null) {
        const e = err as Record<string, unknown>;
        msg = (e['message'] as string) ?? (e['code'] as string) ?? JSON.stringify(err);
      } else {
        msg = String(err);
      }
      console.error(`  ❌ ${msg}`);
      result.status = 'error';
      result.error  = msg;
    }

    newResults.push(result);
    saveCheckpoint(prevResults, newResults);
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
      console.log(`    [${r.brand}] "${r.equipment_name}" (${r.equipment_id}): ${r.error}`)
    );
  }
  process.exit(errors > 0 ? 1 : 0);
}

function saveCheckpoint(prev: Result[], next: Result[]) {
  fs.writeFileSync(RESULTS_PATH, JSON.stringify([...prev, ...next], null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
