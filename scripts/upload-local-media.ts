/**
 * Local Media Uploader — Unified Migration Script
 *
 * Reads CSVs + local ./out-files/ folder, uploads images & videos to
 * Firebase Storage, and patches the corresponding Firestore documents.
 *
 * Usage:
 *   1. Place serviceAccountKey.json in the project root
 *      (Firebase Console → Project Settings → Service Accounts → Generate New Private Key)
 *   2. Place CSV files (parks.csv, equipment.csv, park_equipment.csv, files.csv) in the root
 *   3. Place the media folder at ./out-files/
 *   4. Run:  npx tsx scripts/upload-local-media.ts
 */

import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

// ─── Configuration ───────────────────────────────────────────────────────────

const PROJECT_ROOT = path.resolve(__dirname, '..');
const MEDIA_DIR = path.join(PROJECT_ROOT, 'out-files');
const SERVICE_ACCOUNT_PATH = path.join(PROJECT_ROOT, 'serviceAccountKey.json');

const STORAGE_BUCKET = 'appout-1.firebasestorage.app';

const CSV_PATHS = {
  parks: path.join(PROJECT_ROOT, 'parks.csv'),
  equipment: path.join(PROJECT_ROOT, 'equipment.csv'),
  junction: path.join(PROJECT_ROOT, 'park_equipment.csv'),
  files: path.join(PROJECT_ROOT, 'files.csv'),
};

const NULL_VALUES = new Set(['NULL', 'null', 'undefined', 'nil', '', 'NaN']);
const OLD_PATH_PREFIX = '/home/backend/out-local-files/upload-files/';

const BRAND_MAP: Record<string, string> = {
  '8': 'Ludos',
  '9': 'Urbanics',
};

// ─── Firebase Init ───────────────────────────────────────────────────────────

function initFirebase() {
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error(
      '\n❌  serviceAccountKey.json not found in project root.\n' +
      '    → Firebase Console → Project Settings → Service Accounts → Generate New Private Key\n' +
      '    → Save the JSON file as: serviceAccountKey.json\n',
    );
    process.exit(1);
  }

  const sa = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf-8'));

  admin.initializeApp({
    credential: admin.credential.cert(sa),
    storageBucket: STORAGE_BUCKET,
  });

  return {
    db: admin.firestore(),
    bucket: admin.storage().bucket(),
  };
}

// ─── CSV Helpers ─────────────────────────────────────────────────────────────

type CsvRow = Record<string, string>;

function readCsv(filePath: string): CsvRow[] {
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠  CSV not found: ${filePath}`);
    return [];
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  // Strip BOM
  const clean = raw.replace(/^\uFEFF/, '');
  return parse(clean, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as CsvRow[];
}

function col(row: CsvRow, ...candidates: string[]): string {
  for (const c of candidates) {
    const v = row[c];
    if (v !== undefined && !NULL_VALUES.has(v.trim())) return v.trim();
  }
  // Case-insensitive fallback
  const lowerCandidates = candidates.map((c) => c.toLowerCase());
  for (const key of Object.keys(row)) {
    const cleanKey = key.replace(/^\uFEFF/, '').trim().toLowerCase();
    if (lowerCandidates.includes(cleanKey)) {
      const v = row[key];
      if (v !== undefined && !NULL_VALUES.has(v.trim())) return v.trim();
    }
  }
  return '';
}

function isNull(val: string | undefined): boolean {
  if (!val) return true;
  return NULL_VALUES.has(val.trim());
}

// ─── File Discovery ──────────────────────────────────────────────────────────

let fileIndex: Map<string, string> | null = null;

/**
 * Recursively index all files in MEDIA_DIR by their basename (lowercase).
 * Returns a map: lowercased filename → absolute path.
 * For duplicates, first found wins.
 */
function buildFileIndex(): Map<string, string> {
  if (fileIndex) return fileIndex;
  console.log(`\n📂  Indexing ${MEDIA_DIR} ...`);
  fileIndex = new Map();
  let count = 0;

  function walk(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        const key = entry.name.toLowerCase();
        if (!fileIndex!.has(key)) {
          fileIndex!.set(key, full);
        }
        count++;
      }
    }
  }

  if (!fs.existsSync(MEDIA_DIR)) {
    console.error(`❌  Media directory not found: ${MEDIA_DIR}`);
    return fileIndex;
  }

  walk(MEDIA_DIR);
  console.log(`   Indexed ${count} files, ${fileIndex.size} unique basenames.\n`);
  return fileIndex;
}

/**
 * Resolve a filename/path from CSV to a local file in out-files.
 * Tries multiple strategies: exact basename, stripped prefix, id-based.
 */
function findLocalFile(rawPath: string): string | null {
  if (!rawPath || isNull(rawPath)) return null;
  const idx = buildFileIndex();

  // Strategy 1: Use the raw basename
  let basename = path.basename(rawPath).toLowerCase();
  if (idx.has(basename)) return idx.get(basename)!;

  // Strategy 2: Strip OLD_PATH_PREFIX and try
  let cleaned = rawPath;
  if (cleaned.startsWith(OLD_PATH_PREFIX)) {
    cleaned = cleaned.slice(OLD_PATH_PREFIX.length);
  }
  if (cleaned.startsWith('/')) cleaned = cleaned.slice(1);
  basename = path.basename(cleaned).toLowerCase();
  if (idx.has(basename)) return idx.get(basename)!;

  // Strategy 3: Try the full relative path segments
  const segments = cleaned.replace(/\\/g, '/').split('/');
  for (let i = segments.length - 1; i >= 0; i--) {
    const candidate = segments.slice(i).join('/').toLowerCase();
    // Try as exact path under MEDIA_DIR
    const exact = path.join(MEDIA_DIR, ...segments.slice(i));
    if (fs.existsSync(exact)) return exact;
  }

  return null;
}

// ─── Upload Helper ───────────────────────────────────────────────────────────

function guessMime(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    '.bmp': 'image/bmp', '.mp4': 'video/mp4', '.m4v': 'video/mp4',
    '.mov': 'video/quicktime', '.webm': 'video/webm', '.avi': 'video/x-msvideo',
  };
  return map[ext] ?? 'application/octet-stream';
}

function isAlreadyMigrated(url: string | undefined): boolean {
  if (!url) return false;
  return url.includes('firebasestorage.googleapis.com') || url.includes('storage.googleapis.com');
}

async function uploadFile(
  bucket: any,
  localPath: string,
  storagePath: string,
): Promise<string> {
  const file = bucket.file(storagePath);
  await bucket.upload(localPath, {
    destination: storagePath,
    metadata: { contentType: guessMime(localPath) },
  });
  await file.makePublic();
  return `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('   Local Media Uploader — Unified Migration');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Validate inputs
  for (const [label, p] of Object.entries(CSV_PATHS)) {
    if (label === 'files' && !fs.existsSync(p)) {
      console.warn(`⚠  ${label}.csv not found (optional) — skipping video cross-reference`);
      continue;
    }
    if (!fs.existsSync(p)) {
      console.error(`❌  Required CSV missing: ${p}`);
      process.exit(1);
    }
  }

  const { db, bucket } = initFirebase();

  // ── Parse CSVs ──
  console.log('📄  Parsing CSVs...');
  const parkRows = readCsv(CSV_PATHS.parks);
  const equipmentRows = readCsv(CSV_PATHS.equipment);
  const junctionRows = readCsv(CSV_PATHS.junction);
  const fileRows = readCsv(CSV_PATHS.files);

  console.log(`   parks.csv:          ${parkRows.length} rows`);
  console.log(`   equipment.csv:      ${equipmentRows.length} rows`);
  console.log(`   park_equipment.csv: ${junctionRows.length} rows`);
  console.log(`   files.csv:          ${fileRows.length} rows`);

  if (equipmentRows.length > 0) {
    console.log(`   equipment columns:  [${Object.keys(equipmentRows[0]).join(', ')}]`);
  }
  if (junctionRows.length > 0) {
    console.log(`   junction columns:   [${Object.keys(junctionRows[0]).join(', ')}]`);
  }
  if (fileRows.length > 0) {
    console.log(`   files columns:      [${Object.keys(fileRows[0]).join(', ')}]`);
  }

  // ── Build file index ──
  buildFileIndex();

  // ── Build files.csv ID → path map ──
  const fileById = new Map<string, string>();
  for (const row of fileRows) {
    const id = String(row.id ?? '').trim();
    if (!id || isNull(id)) continue;
    const rawUrl = col(row, 'url', 'file_url', 'fileurl', 'path', 'image', 'file', 'link');
    if (!rawUrl) continue;
    fileById.set(id, rawUrl);
  }
  console.log(`\n   fileById index:     ${fileById.size} entries`);

  // ── Build junction companyId map (equipmentId → companyId) ──
  const junctionCompanyId = new Map<string, string>();
  for (const row of junctionRows) {
    const eid = col(row, 'equipmentid', 'EquipmentId', 'equipment_id');
    if (!eid) continue;
    if (!junctionCompanyId.has(eid)) {
      const cid = col(row, 'companyid', 'CompanyId', 'CompanyID', 'company_id');
      if (cid) junctionCompanyId.set(eid, cid.replace(/\.0$/, ''));
    }
  }
  console.log(`   junctionCompanyId:  ${junctionCompanyId.size} entries`);

  // ── Load existing Firestore equipment (externalSourceId → docId) ──
  console.log('\n🔗  Loading existing Firestore documents...');
  const eqByExtId = new Map<string, string>();
  const eqSnapshot = await db.collection('gym_equipment').get();
  for (const doc of eqSnapshot.docs) {
    const extId = doc.data().externalSourceId;
    if (extId) eqByExtId.set(String(extId), doc.id);
  }
  console.log(`   gym_equipment docs: ${eqSnapshot.size} (${eqByExtId.size} with externalSourceId)`);

  const parkByExtId = new Map<string, string>();
  const parkSnapshot = await db.collection('parks').get();
  for (const doc of parkSnapshot.docs) {
    const extId = doc.data().externalSourceId;
    if (extId) parkByExtId.set(String(extId), doc.id);
  }
  console.log(`   parks docs:         ${parkSnapshot.size} (${parkByExtId.size} with externalSourceId)`);

  // ── Counters ──
  const stats = {
    eqTotal: equipmentRows.length,
    eqImagesUploaded: 0,
    eqImagesSkipped: 0,
    eqImagesMissing: 0,
    eqVideosUploaded: 0,
    eqVideosSkipped: 0,
    eqVideosMissing: 0,
    eqNotInFirestore: 0,
    parkTotal: parkRows.length,
    parkImagesUploaded: 0,
    parkImagesSkipped: 0,
    parkImagesMissing: 0,
    parkNotInFirestore: 0,
    errors: 0,
  };

  // ═════════════════════════════════════════════════════════════════════════
  // PHASE A: Equipment Media Migration
  // ═════════════════════════════════════════════════════════════════════════

  console.log('\n══════════════════════════════════════════════════════');
  console.log('  Phase A: Equipment Media Migration');
  console.log('══════════════════════════════════════════════════════\n');

  for (let i = 0; i < equipmentRows.length; i++) {
    const row = equipmentRows[i];
    const csvId = String(row.id ?? '').trim();
    if (!csvId) continue;

    const name = col(row, 'title', 'name', 'Title', 'Name') || `ID:${csvId}`;
    const prefix = `[Equipment ${i + 1}/${equipmentRows.length}]`;

    // Find Firestore doc
    const firestoreId = eqByExtId.get(csvId);
    if (!firestoreId) {
      stats.eqNotInFirestore++;
      continue;
    }

    // Read current doc
    const docRef = db.collection('gym_equipment').doc(firestoreId);
    const docSnap = await docRef.get();
    if (!docSnap.exists) continue;
    const docData = docSnap.data()!;
    const brands: any[] = docData.brands ?? [];

    // Resolve companyId for brand matching
    const companyIdFromEq = col(row, 'companyid', 'CompanyId', 'CompanyID', 'company_id');
    const companyIdFromJunction = junctionCompanyId.get(csvId) ?? '';
    const companyId = (companyIdFromEq || companyIdFromJunction).replace(/\.0$/, '');
    const brandName = BRAND_MAP[companyId] || 'Imported';

    // Find brand index
    let brandIdx = brands.findIndex((b: any) => b.brandName === brandName);
    if (brandIdx < 0) brandIdx = 0;
    if (brands.length === 0) {
      brands.push({ brandName, imageUrl: '', videoUrl: '' });
      brandIdx = 0;
    }

    let needsUpdate = false;

    // ── Image ──
    const imageRaw = col(row, 'image', 'Image', 'IMAGE', 'photo', 'Photo');
    if (imageRaw && !isAlreadyMigrated(brands[brandIdx]?.imageUrl)) {
      const localFile = findLocalFile(imageRaw);
      if (localFile) {
        const ext = path.extname(localFile).toLowerCase() || '.jpg';
        const storagePath = `equipment/${firestoreId}/image${ext}`;
        try {
          console.log(`${prefix} ⬆ Uploading image for "${name}"...`);
          const url = await uploadFile(bucket, localFile, storagePath);
          brands[brandIdx].imageUrl = url;
          needsUpdate = true;
          stats.eqImagesUploaded++;
        } catch (err) {
          console.error(`${prefix} ❌ Image upload failed: ${(err as Error).message}`);
          stats.errors++;
        }
      } else {
        stats.eqImagesMissing++;
      }
    } else if (isAlreadyMigrated(brands[brandIdx]?.imageUrl)) {
      stats.eqImagesSkipped++;
    } else {
      stats.eqImagesMissing++;
    }

    // ── Video ──
    const mediaIdRaw = col(row, 'media', 'Media', 'MEDIA', 'mediaid', 'media_id')
      || col(row, 'additionalmuscles', 'AdditionalMuscles', 'additional_muscles');

    if (mediaIdRaw && !isAlreadyMigrated(brands[brandIdx]?.videoUrl)) {
      const mediaIds = mediaIdRaw.split(',').map((s) => s.trim()).filter((s) => s && !NULL_VALUES.has(s));
      let videoLocalPath: string | null = null;

      for (const mid of mediaIds) {
        const filePath = fileById.get(mid);
        if (filePath) {
          videoLocalPath = findLocalFile(filePath);
          if (videoLocalPath) break;
        }
      }

      if (videoLocalPath) {
        const ext = path.extname(videoLocalPath).toLowerCase() || '.mp4';
        const storagePath = `equipment/${firestoreId}/video${ext}`;
        try {
          console.log(`${prefix} ⬆ Uploading video for "${name}"...`);
          const url = await uploadFile(bucket, videoLocalPath, storagePath);
          brands[brandIdx].videoUrl = url;
          needsUpdate = true;
          stats.eqVideosUploaded++;
        } catch (err) {
          console.error(`${prefix} ❌ Video upload failed: ${(err as Error).message}`);
          stats.errors++;
        }
      } else {
        if (mediaIds.length > 0) {
          console.warn(`${prefix} ⚠ Video file not found locally for "${name}" (media IDs: ${mediaIds.join(',')})`);
        }
        stats.eqVideosMissing++;
      }
    } else if (isAlreadyMigrated(brands[brandIdx]?.videoUrl)) {
      stats.eqVideosSkipped++;
    } else {
      stats.eqVideosMissing++;
    }

    // ── Firestore Update ──
    if (needsUpdate) {
      try {
        await docRef.update({ brands, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      } catch (err) {
        console.error(`${prefix} ❌ Firestore update failed: ${(err as Error).message}`);
        stats.errors++;
      }
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // PHASE B: Park Image Migration
  // ═════════════════════════════════════════════════════════════════════════

  console.log('\n══════════════════════════════════════════════════════');
  console.log('  Phase B: Park Image Migration');
  console.log('══════════════════════════════════════════════════════\n');

  for (let i = 0; i < parkRows.length; i++) {
    const row = parkRows[i];
    const csvId = String(row.id ?? '').trim();
    if (!csvId) continue;

    const name = col(row, 'title', 'name', 'Title', 'Name') || `ID:${csvId}`;
    const prefix = `[Park ${i + 1}/${parkRows.length}]`;

    // Find Firestore doc
    const firestoreId = parkByExtId.get(csvId);
    if (!firestoreId) {
      stats.parkNotInFirestore++;
      continue;
    }

    // Read current doc
    const docRef = db.collection('parks').doc(firestoreId);
    const docSnap = await docRef.get();
    if (!docSnap.exists) continue;
    const docData = docSnap.data()!;

    // Check if already migrated
    const existingImage = docData.image || docData.imageUrl || '';
    if (isAlreadyMigrated(existingImage)) {
      stats.parkImagesSkipped++;
      continue;
    }

    // Get image filename from CSV
    const imageRaw = col(row, 'image', 'Image', 'IMAGE', 'photo', 'Photo');
    if (!imageRaw) {
      stats.parkImagesMissing++;
      continue;
    }

    const localFile = findLocalFile(imageRaw);
    if (!localFile) {
      stats.parkImagesMissing++;
      continue;
    }

    const ext = path.extname(localFile).toLowerCase() || '.jpg';
    const storagePath = `parks/${firestoreId}/image${ext}`;

    try {
      console.log(`${prefix} ⬆ Uploading image for "${name}"...`);
      const url = await uploadFile(bucket, localFile, storagePath);

      const updateData: Record<string, any> = {
        image: url,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      // Also update the images array if it exists
      const existingImages: string[] = docData.images ?? [];
      const hasNonFirebaseImages = existingImages.some((img: string) => !isAlreadyMigrated(img));
      if (hasNonFirebaseImages || existingImages.length === 0) {
        const firebaseImages = existingImages.filter((img: string) => isAlreadyMigrated(img));
        updateData.images = [url, ...firebaseImages];
      }

      await docRef.update(updateData);
      stats.parkImagesUploaded++;
    } catch (err) {
      console.error(`${prefix} ❌ Upload failed: ${(err as Error).message}`);
      stats.errors++;
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Summary
  // ═════════════════════════════════════════════════════════════════════════

  console.log('\n══════════════════════════════════════════════════════');
  console.log('  Migration Complete — Summary');
  console.log('══════════════════════════════════════════════════════\n');

  console.log('  Equipment:');
  console.log(`    Total rows:          ${stats.eqTotal}`);
  console.log(`    Images uploaded:     ${stats.eqImagesUploaded}`);
  console.log(`    Images skipped:      ${stats.eqImagesSkipped} (already in Firebase)`);
  console.log(`    Images missing:      ${stats.eqImagesMissing} (no local file)`);
  console.log(`    Videos uploaded:     ${stats.eqVideosUploaded}`);
  console.log(`    Videos skipped:      ${stats.eqVideosSkipped} (already in Firebase)`);
  console.log(`    Videos missing:      ${stats.eqVideosMissing} (no local file)`);
  console.log(`    Not in Firestore:    ${stats.eqNotInFirestore}`);
  console.log('');
  console.log('  Parks:');
  console.log(`    Total rows:          ${stats.parkTotal}`);
  console.log(`    Images uploaded:     ${stats.parkImagesUploaded}`);
  console.log(`    Images skipped:      ${stats.parkImagesSkipped} (already in Firebase)`);
  console.log(`    Images missing:      ${stats.parkImagesMissing} (no local file)`);
  console.log(`    Not in Firestore:    ${stats.parkNotInFirestore}`);
  console.log('');
  console.log(`  Errors:                ${stats.errors}`);
  console.log('');

  if (stats.errors === 0) {
    console.log('  ✅  All done — no errors!');
  } else {
    console.log(`  ⚠  Completed with ${stats.errors} error(s). Check the log above.`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('\n💥 Unhandled error:', err);
  process.exit(1);
});
