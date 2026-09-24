/**
 * scripts/probe-park-match.ts — READ ONLY
 *
 * Checks how many parks in Firestore have externalSourceId set,
 * and cross-references 3 sample old_parkids from the manifest.
 *
 * Usage: npx tsx scripts/probe-park-match.ts
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import { parse as csvParse } from 'csv-parse/sync';

// ── Firebase init ─────────────────────────────────────────────────────────────

function initFirebase() {
  if (admin.apps.length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY not set');
  const c = JSON.parse(raw);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

// ── Main ──────────────────────────────────────────────────────────────────────

const MANIFEST_PATH =
  '/Users/calisthenicsltd/Library/Application Support/Claude/local-agent-mode-sessions/58b7ccf9-481f-4e3b-92db-b6ae7e893461/32e4c48b-5975-40f1-8331-16fcf914e4d9/local_40ed8f8d-3f39-4bb5-b4ae-1853930df99e/outputs/OUT_parks_photos_manifest.csv';

async function main() {
  initFirebase();
  const db = admin.firestore();

  // 1. Load manifest
  const raw = fs.readFileSync(MANIFEST_PATH, 'utf8').replace(/^﻿/, '');
  const rows: Record<string, string>[] = csvParse(raw, { columns: true, skip_empty_lines: true });
  console.log(`\n📄 Manifest rows: ${rows.length}`);

  // 2. Scan Firestore parks collection
  console.log('\n🔍 Scanning Firestore parks collection...');
  const snap = await db.collection('parks').get();
  const total = snap.size;

  // Build externalSourceId → docId map
  const extIdMap = new Map<string, string>();
  for (const doc of snap.docs) {
    const extId = doc.data().externalSourceId;
    if (extId) extIdMap.set(String(extId).trim(), doc.id);
  }

  console.log(`\n📊 Firestore parks total:          ${total}`);
  console.log(`   With externalSourceId:           ${extIdMap.size}`);
  console.log(`   Without externalSourceId:        ${total - extIdMap.size}`);

  // 3. Cross-reference manifest against Firestore
  let matched = 0;
  let unmatched = 0;
  const unmatchedSamples: string[] = [];

  for (const row of rows) {
    const oldId = String(row.old_parkid).trim();
    if (extIdMap.has(oldId)) {
      matched++;
    } else {
      unmatched++;
      if (unmatchedSamples.length < 10) unmatchedSamples.push(`${oldId} (${row.park_title})`);
    }
  }

  const matchRate = ((matched / rows.length) * 100).toFixed(1);
  console.log(`\n🎯 Manifest match rate: ${matched}/${rows.length} (${matchRate}%)`);
  console.log(`   Not found in Firestore: ${unmatched}`);

  // 4. Show 3 specific samples
  const samples = rows.slice(0, 3);
  console.log('\n🔬 3 sample lookups:');
  for (const row of samples) {
    const oldId = String(row.old_parkid).trim();
    const docId = extIdMap.get(oldId);
    if (docId) {
      const parkData = snap.docs.find(d => d.id === docId)?.data();
      console.log(`  old_parkid=${oldId} → ✅ docId=${docId}  name="${parkData?.name ?? '?'}"`);
    } else {
      console.log(`  old_parkid=${oldId} → ❌ NOT FOUND  title="${row.park_title}"`);
    }
  }

  // 5. Show unmatched sample
  if (unmatched > 0) {
    console.log(`\n⚠️  Sample unmatched (up to 10):`);
    for (const s of unmatchedSamples) console.log(`    ${s}`);
  }

  console.log('\n✅ Done (read-only — no writes performed)\n');
}

main().catch(e => { console.error(e); process.exit(1); });
