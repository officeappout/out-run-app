/**
 * scripts/upload-equipment-additions.ts
 *
 * Uploads 8 equipment media additions/corrections.
 * Same pipeline as bulk-upload-equipment-master:
 *   video  → Bunny Stream (library 640043)
 *   image  → Bunny Storage (zone appout-images)
 *   then   → updates gym_equipment.brands[] by brandId
 *
 * Flags:
 *   --sample   run row 1 only (dry-preview of Drive metadata + IDs)
 *   --row=N    run only row N (1-based)
 *   --dry-run  log Drive metadata, no uploads, no Firestore writes
 *   --force    overwrite brand slots that already have a URL (needed for the
 *              Urbanics אופני-ספינינג replacement)
 *
 * Checkpoint: scripts/corpus/equipment-additions-results.json
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import * as admin from 'firebase-admin';
import * as fs    from 'fs';
import * as path  from 'path';
import * as https from 'https';

// ── CLI flags ─────────────────────────────────────────────────────────────────

const SAMPLE   = process.argv.includes('--sample');
const DRY_RUN  = process.argv.includes('--dry-run');
const FORCE    = process.argv.includes('--force');
const ROW_FILTER = (() => {
  const a = process.argv.find(a => a.startsWith('--row='));
  return a ? parseInt(a.split('=')[1], 10) : null;
})();

// ── Inline data ───────────────────────────────────────────────────────────────

interface Row {
  equipment_name: string;
  equipment_id:   string;        // pre-resolved from Firestore export
  brand:          string;
  brandId:        string;
  video_drive_id: string;
  video_file:     string;
  image_drive_id: string;        // empty = skip image (keep existing)
  image_file:     string;
  forceOverwrite: boolean;       // overwrite even if URL already set
}

const ROWS: Row[] = [
  {
    equipment_name: 'סקוואט כנגד מכונה',
    equipment_id:   'eiaTxyrI7HouRN2UNwyu',
    brand:          'Ludos',
    brandId:        'MfLM9AKpHz2p7YYQIAoH',
    video_drive_id: '1h42VWpCcbeX4fF_L29W9i522QssxQ9Ks',
    video_file:     'סקאווט.mp4',
    image_drive_id: '1a8Hi9IuugltWe3hPKn00b6b4pybiCWlA',
    image_file:     'סקוואט.jpg',
    forceOverwrite: false,
  },
  {
    equipment_name: 'סקי רחיפה',
    equipment_id:   'cmCFwJwELvRZuoeoJdEy',
    brand:          'Ludos',
    brandId:        'MfLM9AKpHz2p7YYQIAoH',
    video_drive_id: '1_CCYVbrcKSIJTROG7J8SdmxRllM9SPAO',
    video_file:     'סקי קרוסטריינר.mp4',
    image_drive_id: '1c0tbZ4mh-5HPFOTOdzBjg2Z-zi1ki7Vx',
    image_file:     'סקי קרוסטריינר.jpg',
    forceOverwrite: false,
  },
  {
    equipment_name: 'מאמן שרירי בטן ואגן',
    equipment_id:   '2Kt12YhP8fdaRqNnsPiX',
    brand:          'Ludos',
    brandId:        'MfLM9AKpHz2p7YYQIAoH',
    video_drive_id: '1_B0eZwyK48r1t5hzKtgJ1IfzivYJ6Mre',
    video_file:     'מאמן שרירי אגן ואלכסונים',
    image_drive_id: '',           // video only — keep existing Urbanics image
    image_file:     '',
    forceOverwrite: false,
  },
  {
    equipment_name: 'מדרגות אימון',         // CSV: "מדרגה" → resolved to DB name
    equipment_id:   'pKh30gGIGOKFcgLET2Fn',
    brand:          'Ludos',
    brandId:        'MfLM9AKpHz2p7YYQIAoH',
    video_drive_id: '1CZmnS3QEilAqMPRvgPkTh3glzW2bM0Y_',
    video_file:     'מדרגות קפיצה.mp4',
    image_drive_id: '1l6uLBrjjrX20Bjcs0sjLYnopTjmuhYBc',
    image_file:     'מדרגות קפיצה.jpg',
    forceOverwrite: false,
  },
  {
    equipment_name: 'אגן והאלכסונים',
    equipment_id:   'FqFlaNZ02dlAQcXmhjOP',
    brand:          'Ludos',
    brandId:        'MfLM9AKpHz2p7YYQIAoH',
    video_drive_id: '1OqRN3E86Xyb0D96iELWYsWXJXgJ6vBA-',
    video_file:     'הנעת אגן.mp4',
    image_drive_id: '1-nh9py2i4gXhQPOvtfm7CQqL48yOEY_J',
    image_file:     'הנעת אגן.jpg',
    forceOverwrite: false,
  },
  {
    equipment_name: 'מיטת עליית בטן',
    equipment_id:   'InKr0xUxeVBlg370WaTm',
    brand:          'Ludos',
    brandId:        'MfLM9AKpHz2p7YYQIAoH',
    video_drive_id: '14a0B4o2O5G0Z5-5DYHBZRrVJLDysIwjz',
    video_file:     'כפיפות בטן.mp4',
    image_drive_id: '10NJb2XW-YNJSleHBTwuV3FfaohaB8j0G',
    image_file:     'כפיפות בטן.jpg',
    forceOverwrite: false,
  },
  {
    equipment_name: 'אופניים בישיבה במכונה',
    equipment_id:   'BZQqMXv2V6GuTRVu5Af5',
    brand:          'Ludos',
    brandId:        'MfLM9AKpHz2p7YYQIAoH',
    video_drive_id: '1qB8z20EbgaMpQMhReKRi6BBgaR2QdHY4',
    video_file:     'אופניים',
    image_drive_id: '',           // video only — keep existing Urbanics image
    image_file:     '',
    forceOverwrite: false,
  },
  {
    // REPLACE: Urbanics אופני ספינינג had wrong video (showed hand-bikes).
    // New Drive file UBX-289 is the correct spinning-bike footage.
    equipment_name: 'אופני ספינינג',
    equipment_id:   'vfUYnolmjtv7JLlI70rb',
    brand:          'Urbanics',
    brandId:        'LfKL3h2NBrZXp4E8w56G',
    video_drive_id: '1tGRtcc2PAchWF-p002OhSO0R5Ljo_eJS',
    video_file:     'UBX-289.mp4',
    image_drive_id: '1Oy8ej9sU4259FvsuMHQ_wGxjtxh9l9ZB',
    image_file:     'UBX-289.jpg',
    forceOverwrite: true,        // must replace the existing (wrong) video URL
  },
];

// ── Firebase ──────────────────────────────────────────────────────────────────

function initFirebase() {
  if (admin.apps.length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY not set');
  const c = JSON.parse(raw);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

// ── Drive ─────────────────────────────────────────────────────────────────────

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

// ── Bunny Stream ──────────────────────────────────────────────────────────────

function getBunnyStream() {
  const apiKey    = (process.env.BUNNY_API_KEY    ?? '').trim();
  const libraryId = (process.env.BUNNY_LIBRARY_ID ?? '').trim();
  if (!apiKey || !libraryId) throw new Error('BUNNY_API_KEY / BUNNY_LIBRARY_ID not set');
  return { apiKey, libraryId };
}

function bunnyEmbedUrl(libraryId: string, videoId: string) {
  return `https://iframe.bunnycdn.com/embed/${libraryId}/${videoId}`;
}

async function bunnyCreateSlot(title: string): Promise<string> {
  const { apiKey, libraryId } = getBunnyStream();
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
  const { apiKey, libraryId } = getBunnyStream();
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'video.bunnycdn.com',
      path:     `/library/${libraryId}/videos/${videoId}`,
      method:   'PUT',
      headers:  {
        AccessKey:        apiKey,
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
  const { apiKey, libraryId } = getBunnyStream();
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

// ── Bunny Storage ─────────────────────────────────────────────────────────────

function getBunnyStorage() {
  const zone      = (process.env.BUNNY_STORAGE_ZONE      ?? '').trim();
  const accessKey = (process.env.BUNNY_STORAGE_ACCESSKEY ?? '').trim();
  const pullZone  = (process.env.BUNNY_STORAGE_PULLZONE  ?? '').trim();
  if (!zone || !accessKey || !pullZone)
    throw new Error('BUNNY_STORAGE_ZONE / BUNNY_STORAGE_ACCESSKEY / BUNNY_STORAGE_PULLZONE not set');
  return { zone, accessKey, pullZone };
}

async function uploadImageToBunny(
  equipmentId: string,
  brandId:     string,
  buffer:      Buffer,
  mimeType:    string,
): Promise<string> {
  const { zone, accessKey, pullZone } = getBunnyStorage();
  const ext         = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
  const storagePath = `equipment/${equipmentId}/${brandId}.${ext}`;
  const uploadUrl   = `https://storage.bunnycdn.com/${zone}/${storagePath}`;

  const res = await fetch(uploadUrl, {
    method:  'PUT',
    headers: { AccessKey: accessKey, 'Content-Type': mimeType },
    body:    buffer,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Bunny Storage PUT ${res.status}: ${text}`);
  }
  return `https://${pullZone}/${storagePath}`;
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

  const brands: any[] = Array.isArray(snap.data()!.brands)
    ? (snap.data()!.brands as any[]).map((b: any) => ({ ...b }))
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
    console.log(`     ➕ New brand slot added (${brandName} not found in brands[])`);
  }

  await ref.update({ brands, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
}

// ── Checkpoint ────────────────────────────────────────────────────────────────

const CHECKPOINT_PATH = path.join(process.cwd(), 'scripts/corpus/equipment-additions-results.json');

interface Result {
  checkpoint_key: string;
  equipment_id:   string;
  equipment_name: string;
  brand:          string;
  status:         'success' | 'skipped' | 'error';
  videoUrl?:      string;
  imageUrl?:      string;
  error?:         string;
  ts:             string;
}

function loadCheckpoint(): Result[] {
  return fs.existsSync(CHECKPOINT_PATH)
    ? JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8'))
    : [];
}

function saveCheckpoint(prev: Result[], next: Result[]) {
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify([...prev, ...next], null, 2));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Equipment additions upload — ${ROWS.length} rows total`);
  if (SAMPLE)            console.log('  --sample: row 1 only');
  if (ROW_FILTER !== null) console.log(`  --row=${ROW_FILTER}`);
  if (DRY_RUN)           console.log('  --dry-run: no uploads');
  if (FORCE)             console.log('  --force: overwrite existing URLs');

  const active = ROWS.filter((_, i) => {
    if (SAMPLE) return i === 0;
    if (ROW_FILTER !== null) return i + 1 === ROW_FILTER;
    return true;
  });

  console.log(`Processing ${active.length} row(s)\n`);

  const prev    = loadCheckpoint();
  const doneKeys = new Set(prev.filter(r => r.status === 'success').map(r => r.checkpoint_key));

  initFirebase();
  const db    = admin.firestore();
  const drive = await makeDriveClient();
  const { libraryId } = getBunnyStream();

  const next: Result[] = [];

  for (let i = 0; i < active.length; i++) {
    const row = active[i];
    const tag = `[${i + 1}/${active.length}]`;
    const key = `${row.equipment_id}:${row.brandId}`;

    console.log(`${tag} "${row.equipment_name}" [${row.brand}]`);
    console.log(`    eq=${row.equipment_id}  brandId=${row.brandId}`);
    if (row.forceOverwrite) console.log('    ⚠️  FORCE-OVERWRITE (replacement row)');

    const shouldSkip = doneKeys.has(key) && !FORCE && !row.forceOverwrite;
    if (shouldSkip) {
      console.log('  ⏭  Already done (checkpoint) — use --force to redo\n');
      continue;
    }

    const result: Result = {
      checkpoint_key: key,
      equipment_id:   row.equipment_id,
      equipment_name: row.equipment_name,
      brand:          row.brand,
      status:         'error',
      ts:             new Date().toISOString(),
    };

    try {
      let videoUrl: string | undefined;
      let imageUrl: string | undefined;

      // ── Video ───────────────────────────────────────────────────────────────
      if (row.video_drive_id) {
        const meta = await drive.files.get({
          fileId: row.video_drive_id, fields: 'name,size,mimeType', supportsAllDrives: true,
        });
        const fileSize = parseInt(meta.data.size ?? '0', 10);
        const mimeType = meta.data.mimeType ?? 'video/mp4';
        console.log(`  📹 Drive: "${meta.data.name}"  ${(fileSize / 1_048_576).toFixed(1)} MB  (${mimeType})`);
        if (fileSize === 0) throw new Error('Video Drive file size is 0');

        if (!DRY_RUN) {
          const slotTitle    = `eq-${row.equipment_name}-${row.brand}`;
          const bunnyVideoId = await bunnyCreateSlot(slotTitle);
          console.log(`     Bunny slot: ${bunnyVideoId}`);

          const driveStream = (await drive.files.get(
            { fileId: row.video_drive_id, alt: 'media', supportsAllDrives: true },
            { responseType: 'stream' },
          )).data as unknown as NodeJS.ReadableStream;

          await bunnyPutStream(bunnyVideoId, driveStream, fileSize, mimeType);
          console.log('     Upload done. Polling encoding…');
          await bunnyPoll(bunnyVideoId);
          process.stdout.write('\n');

          videoUrl = bunnyEmbedUrl(libraryId, bunnyVideoId);
          console.log(`     ✅ videoUrl: ${videoUrl}`);
        }
      } else {
        console.log('  📹 No video_drive_id — keeping existing');
      }

      // ── Image ────────────────────────────────────────────────────────────────
      if (row.image_drive_id) {
        const imgMeta = await drive.files.get({
          fileId: row.image_drive_id, fields: 'name,size,mimeType', supportsAllDrives: true,
        });
        const imgSize = parseInt(imgMeta.data.size ?? '0', 10);
        const imgMime = imgMeta.data.mimeType ?? 'image/jpeg';
        console.log(`  🖼️  Drive: "${imgMeta.data.name}"  ${(imgSize / 1_048_576).toFixed(1)} MB`);
        if (imgSize === 0) throw new Error('Image Drive file size is 0');

        if (!DRY_RUN) {
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

          imageUrl = await uploadImageToBunny(
            row.equipment_id, row.brandId, Buffer.concat(chunks), imgMime,
          );
          console.log(`     ✅ imageUrl: ${imageUrl}`);
        }
      } else {
        console.log('  🖼️  No image_drive_id — keeping existing');
      }

      // ── Firestore ────────────────────────────────────────────────────────────
      if (!DRY_RUN && (videoUrl || imageUrl)) {
        await updateBrand(db, row.equipment_id, row.brandId, row.brand, videoUrl, imageUrl);
        console.log(`  ✅ Firestore updated  video=${videoUrl ? '✓' : '—'}  image=${imageUrl ? '✓' : '—'}`);
      } else if (DRY_RUN) {
        console.log('  ⏭  dry-run — Firestore not written');
      } else {
        console.log('  ⚠️  No files — Firestore not updated');
      }

      result.status   = DRY_RUN ? 'skipped' : 'success';
      result.videoUrl = videoUrl;
      result.imageUrl = imageUrl;
      if (DRY_RUN) result.error = 'dry-run';

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message
        : typeof err === 'object' && err !== null
          ? ((err as any).message ?? (err as any).code ?? JSON.stringify(err))
          : String(err);
      console.error(`  ❌ ${msg}`);
      result.status = 'error';
      result.error  = msg;
    }

    next.push(result);
    saveCheckpoint(prev, next);
    console.log();
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const all     = [...prev, ...next];
  const success = all.filter(r => r.status === 'success').length;
  const errors  = all.filter(r => r.status === 'error').length;

  console.log('── Summary ─────────────────────────────────────────────────');
  console.log(`  ✅ Success: ${success}`);
  console.log(`  ❌ Errors:  ${errors}`);
  console.log(`  Checkpoint: ${CHECKPOINT_PATH}`);

  if (errors > 0) {
    all.filter(r => r.status === 'error').forEach(r =>
      console.log(`  ❌ [${r.brand}] "${r.equipment_name}": ${r.error}`)
    );
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
