/**
 * scripts/dryrun-park-photo.ts — DRY RUN (no Firestore writes)
 *
 * Single-row test for the parks photo migration:
 *   1. Download one file from FTP
 *   2. Upload to Bunny Storage at parks/{old_parkid}.{ext}
 *   3. Print the public CDN URL — stops here, no Firestore write
 *
 * Usage: npx tsx scripts/dryrun-park-photo.ts
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import * as ftp from 'basic-ftp';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parse as csvParse } from 'csv-parse/sync';

// ── Config ────────────────────────────────────────────────────────────────────

const MANIFEST_PATH =
  '/Users/calisthenicsltd/Library/Application Support/Claude/local-agent-mode-sessions/58b7ccf9-481f-4e3b-92db-b6ae7e893461/32e4c48b-5975-40f1-8331-16fcf914e4d9/local_40ed8f8d-3f39-4bb5-b4ae-1853930df99e/outputs/OUT_parks_photos_manifest.csv';

const TARGET_OLD_PARKID = '13'; // "פארק המסילה - תל אביב"

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
  const uploadUrl = `https://storage.bunnycdn.com/${zone}/${storagePath}`;

  console.log(`  PUT ${uploadUrl}`);
  const res = await fetch(uploadUrl, {
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

// ── FTP download ──────────────────────────────────────────────────────────────

async function downloadFromFtp(remotePath: string): Promise<Buffer> {
  const host = (process.env.FTP_HOST ?? '').trim();
  const port = parseInt(process.env.FTP_PORT ?? '21', 10);
  const user = (process.env.FTP_USER ?? '').trim();
  const pass = (process.env.FTP_PASS ?? '').trim();

  if (!host || !user || !pass) throw new Error('FTP_HOST / FTP_USER / FTP_PASS not set');

  const client = new ftp.Client();
  client.ftp.verbose = false;

  // Files live directly in FTP root — the ftp_path from the CSV includes
  // a full server path (/home/backend/...) that doesn't match the FTP mount point.
  // The actual remote filename is just the basename.
  const basename = remotePath.split('/').pop()!;

  const tmpFile = path.join(os.tmpdir(), `park_dryrun_${Date.now()}.tmp`);

  try {
    await client.access({ host, port, user, password: pass, secure: false });
    console.log(`  FTP connected → downloading /${basename}`);
    await client.downloadTo(tmpFile, basename);
  } finally {
    client.close();
  }

  const buf = fs.readFileSync(tmpFile);
  fs.unlinkSync(tmpFile);
  return buf;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Find the target row in manifest
  const raw = fs.readFileSync(MANIFEST_PATH, 'utf8').replace(/^﻿/, '');
  const rows: Record<string, string>[] = csvParse(raw, { columns: true, skip_empty_lines: true });
  const row = rows.find(r => String(r.old_parkid).trim() === TARGET_OLD_PARKID);
  if (!row) throw new Error(`old_parkid=${TARGET_OLD_PARKID} not found in manifest`);

  console.log(`\n🎯 Target: old_parkid=${row.old_parkid} — ${row.park_title}`);
  console.log(`   FTP path:     ${row.ftp_path}`);
  console.log(`   Extension:    ${row.ext}`);
  console.log(`   Identifier:   ${row.image_identifier}`);

  // 2. Download from FTP
  console.log('\n📥 Downloading from FTP...');
  const buffer = await downloadFromFtp(row.ftp_path);
  console.log(`   Downloaded: ${buffer.length.toLocaleString()} bytes`);

  // 3. Upload to Bunny Storage
  const ext         = row.ext.toLowerCase().replace(/^\./, '');
  const mimeType    = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  const storagePath = `parks/${row.old_parkid}.${ext}`;

  console.log(`\n☁️  Uploading to Bunny Storage → ${storagePath}`);
  const publicUrl = await uploadToBunny(buffer, storagePath, mimeType);

  // 4. Result — no Firestore write
  console.log(`\n✅ DRY-RUN COMPLETE (Firestore NOT touched)`);
  console.log(`\n   Public URL: ${publicUrl}\n`);
  console.log(`   Verify by opening in browser. If correct → approve full run.`);
}

main().catch(e => { console.error('\n❌', e.message); process.exit(1); });
