/**
 * scripts/migrate-park-photos.ts
 *
 * Full migration: FTP → Bunny Storage → Firestore imageUrl
 * for all 569 parks in OUT_parks_photos_manifest.csv
 *
 * Strategy:
 *   - Match: Firestore parks WHERE externalSourceId == old_parkid (100% match confirmed)
 *   - Upload to Bunny: appout-images/parks/{old_parkid}.{ext}
 *   - Write Firestore: park.imageUrl = CDN URL (merge: true, updatedAt = serverTimestamp)
 *   - Checkpoint after each success → idempotent re-runs skip completed rows
 *   - Duplicate identifiers (placeholders) → skipped, reported at end
 *
 * Usage:
 *   npx tsx scripts/migrate-park-photos.ts          # full run
 *   npx tsx scripts/migrate-park-photos.ts --dry-run # skip Firestore writes
 *
 * Checkpoint: scripts/corpus/park-photos-results.json
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import * as admin from 'firebase-admin';
import * as ftp from 'basic-ftp';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parse as csvParse } from 'csv-parse/sync';

// ── CLI ───────────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run');

// ── Paths ─────────────────────────────────────────────────────────────────────

const MANIFEST_PATH =
  '/Users/calisthenicsltd/Library/Application Support/Claude/local-agent-mode-sessions/58b7ccf9-481f-4e3b-92db-b6ae7e893461/32e4c48b-5975-40f1-8331-16fcf914e4d9/local_40ed8f8d-3f39-4bb5-b4ae-1853930df99e/outputs/OUT_parks_photos_manifest.csv';

const CHECKPOINT_PATH = path.join(process.cwd(), 'scripts/corpus/park-photos-results.json');

// ── Types ─────────────────────────────────────────────────────────────────────

interface ManifestRow {
  old_parkid: string;
  park_title: string;
  muniid: string;
  lat: string;
  lng: string;
  dominant_companyid: string;
  image_identifier: string;
  ftp_path: string;
  orig_filename: string;
  ext: string;
}

interface CheckpointEntry {
  status: 'done' | 'failed' | 'skipped_placeholder';
  url?: string;
  docId?: string;
  error?: string;
  ts: string;
}

type Checkpoint = Record<string, CheckpointEntry>;

// ── Checkpoint ────────────────────────────────────────────────────────────────

function loadCheckpoint(): Checkpoint {
  if (!fs.existsSync(CHECKPOINT_PATH)) return {};
  return JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8'));
}

function saveCheckpoint(cp: Checkpoint): void {
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(cp, null, 2));
}

// ── Firebase Admin ────────────────────────────────────────────────────────────

function initFirebase() {
  if (admin.apps.length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY not set');
  const c = JSON.parse(raw);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

// ── Bunny Storage ─────────────────────────────────────────────────────────────

function getBunnyConfig() {
  const zone      = (process.env.BUNNY_STORAGE_ZONE      ?? '').trim();
  const accessKey = (process.env.BUNNY_STORAGE_ACCESSKEY ?? '').trim();
  const pullZone  = (process.env.BUNNY_STORAGE_PULLZONE  ?? '').trim();
  if (!zone || !accessKey || !pullZone)
    throw new Error('BUNNY_STORAGE_ZONE / BUNNY_STORAGE_ACCESSKEY / BUNNY_STORAGE_PULLZONE not set');
  return { zone, accessKey, pullZone };
}

async function uploadToBunny(buffer: Buffer, storagePath: string, mimeType: string): Promise<string> {
  const { zone, accessKey, pullZone } = getBunnyConfig();
  const res = await fetch(`https://storage.bunnycdn.com/${zone}/${storagePath}`, {
    method:  'PUT',
    headers: { AccessKey: accessKey, 'Content-Type': mimeType },
    body:    buffer,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Bunny PUT ${res.status}: ${text}`);
  }
  return `https://${pullZone}/${storagePath}`;
}

// ── FTP ───────────────────────────────────────────────────────────────────────

async function downloadFromFtp(filename: string): Promise<Buffer> {
  const host = (process.env.FTP_HOST ?? '').trim();
  const port = parseInt(process.env.FTP_PORT ?? '21', 10);
  const user = (process.env.FTP_USER ?? '').trim();
  const pass = (process.env.FTP_PASS ?? '').trim();
  if (!host || !user || !pass) throw new Error('FTP credentials not set');

  const client = new ftp.Client();
  client.ftp.verbose = false;
  const tmpFile = path.join(os.tmpdir(), `park_migrate_${Date.now()}_${Math.random().toString(36).slice(2)}.tmp`);

  try {
    await client.access({ host, port, user, password: pass, secure: false });
    await client.downloadTo(tmpFile, filename);
  } finally {
    client.close();
  }

  const buf = fs.readFileSync(tmpFile);
  fs.unlinkSync(tmpFile);
  return buf;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extToMime(ext: string): string {
  const e = ext.toLowerCase().replace(/^\./, '');
  if (e === 'png')  return 'image/png';
  if (e === 'webp') return 'image/webp';
  if (e === 'gif')  return 'image/gif';
  return 'image/jpeg';
}

function progressBar(done: number, total: number, width = 30): string {
  const filled = Math.round((done / total) * width);
  return '[' + '█'.repeat(filled) + '░'.repeat(width - filled) + `] ${done}/${total}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (DRY_RUN) console.log('\n⚠️  DRY-RUN mode — Firestore will NOT be updated\n');

  initFirebase();
  const db = admin.firestore();

  // 1. Load manifest
  const raw = fs.readFileSync(MANIFEST_PATH, 'utf8').replace(/^﻿/, '');
  const rows: ManifestRow[] = csvParse(raw, { columns: true, skip_empty_lines: true });
  console.log(`📄 Manifest: ${rows.length} rows`);

  // 2. Detect placeholder duplicates (same identifier → multiple parks)
  const identifierCount = new Map<string, number>();
  for (const r of rows) identifierCount.set(r.image_identifier, (identifierCount.get(r.image_identifier) ?? 0) + 1);
  const placeholderIdentifiers = new Set([...identifierCount.entries()].filter(([, n]) => n > 1).map(([id]) => id));
  const placeholderRows = rows.filter(r => placeholderIdentifiers.has(r.image_identifier));
  const workRows        = rows.filter(r => !placeholderIdentifiers.has(r.image_identifier));
  console.log(`   Unique photos to migrate: ${workRows.length}`);
  console.log(`   Placeholder duplicates (skipped): ${placeholderRows.length} rows, ${placeholderIdentifiers.size} identifiers`);

  // 3. Load Firestore externalSourceId → docId map
  console.log('\n🔗 Loading Firestore park index...');
  const snap = await db.collection('parks').get();
  const extIdToDocId = new Map<string, string>();
  for (const doc of snap.docs) {
    const extId = doc.data().externalSourceId;
    if (extId) extIdToDocId.set(String(extId).trim(), doc.id);
  }
  console.log(`   Parks with externalSourceId: ${extIdToDocId.size}/${snap.size}`);

  // 4. Load checkpoint
  const cp = loadCheckpoint();
  const alreadyDone   = workRows.filter(r => cp[r.old_parkid]?.status === 'done').length;
  const alreadyFailed = workRows.filter(r => cp[r.old_parkid]?.status === 'failed').length;
  console.log(`\n📦 Checkpoint: ${Object.keys(cp).length} entries loaded (${alreadyDone} done, ${alreadyFailed} prev-failed)`);

  // Pre-mark placeholders in checkpoint
  for (const r of placeholderRows) {
    if (!cp[r.old_parkid]) {
      cp[r.old_parkid] = { status: 'skipped_placeholder', ts: new Date().toISOString() };
    }
  }
  saveCheckpoint(cp);

  // 5. Process work rows
  console.log(`\n🚀 Starting migration${DRY_RUN ? ' [DRY-RUN]' : ''}...\n`);

  const stats = { uploaded: 0, updated: 0, skipped: 0, failed: 0 };
  const failures: { parkid: string; title: string; error: string }[] = [];

  for (let i = 0; i < workRows.length; i++) {
    const row = workRows[i];
    const { old_parkid, park_title, ftp_path, ext } = row;

    // Skip if already done
    if (cp[old_parkid]?.status === 'done') {
      stats.skipped++;
      continue;
    }

    // Find Firestore docId
    const docId = extIdToDocId.get(old_parkid);
    if (!docId) {
      const err = `No Firestore doc for externalSourceId=${old_parkid}`;
      console.log(`  ❌ [${i + 1}/${workRows.length}] ${park_title} — ${err}`);
      cp[old_parkid] = { status: 'failed', error: err, ts: new Date().toISOString() };
      saveCheckpoint(cp);
      stats.failed++;
      failures.push({ parkid: old_parkid, title: park_title, error: err });
      continue;
    }

    process.stdout.write(`  [${i + 1}/${workRows.length}] ${park_title.slice(0, 35).padEnd(35)} `);

    try {
      // a. FTP download
      const filename = ftp_path.split('/').pop()!;
      const buffer   = await downloadFromFtp(filename);

      // b. Bunny upload
      const cleanExt    = ext.toLowerCase().replace(/^\./, '');
      const storagePath = `parks/${old_parkid}.${cleanExt}`;
      const publicUrl   = await uploadToBunny(buffer, storagePath, extToMime(cleanExt));
      stats.uploaded++;

      // c. Firestore update
      if (!DRY_RUN) {
        await db.collection('parks').doc(docId).update({
          imageUrl:  publicUrl,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        stats.updated++;
      }

      cp[old_parkid] = { status: 'done', url: publicUrl, docId, ts: new Date().toISOString() };
      saveCheckpoint(cp);

      console.log(`✅ ${publicUrl.split('/').pop()}`);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      console.log(`❌ ${err.slice(0, 80)}`);
      cp[old_parkid] = { status: 'failed', error: err, docId, ts: new Date().toISOString() };
      saveCheckpoint(cp);
      stats.failed++;
      failures.push({ parkid: old_parkid, title: park_title, error: err });
    }
  }

  // 6. Final report
  console.log('\n' + '═'.repeat(60));
  console.log('  MIGRATION REPORT');
  console.log('═'.repeat(60));
  console.log(`  Total manifest rows:       ${rows.length}`);
  console.log(`  Placeholder (skipped):     ${placeholderRows.length}`);
  console.log(`  Work rows:                 ${workRows.length}`);
  console.log(`  ✅ Uploaded to Bunny:      ${stats.uploaded}`);
  console.log(`  ✅ Firestore updated:      ${DRY_RUN ? '0 (dry-run)' : stats.updated}`);
  console.log(`  ⏭  Already done (skipped): ${stats.skipped}`);
  console.log(`  ❌ Failed:                 ${stats.failed}`);

  if (placeholderRows.length > 0) {
    console.log(`\n⚠️  Placeholder details (${placeholderIdentifiers.size} shared identifiers):`);
    for (const id of placeholderIdentifiers) {
      const parks = rows.filter(r => r.image_identifier === id).map(r => `${r.old_parkid}/${r.park_title}`);
      console.log(`   ${id.slice(0, 20)}...  → ${parks.join(' | ')}`);
    }
  }

  if (failures.length > 0) {
    console.log(`\n❌ Failure details:`);
    for (const f of failures) {
      console.log(`   parkid=${f.parkid} "${f.title}" — ${f.error}`);
    }
  }

  console.log('\n✅ Done. Checkpoint saved to:', CHECKPOINT_PATH);
  console.log('   Re-run to retry failed rows (done rows are skipped).\n');
}

main().catch(e => { console.error('\n❌ Fatal:', e.message); process.exit(1); });
