#!/usr/bin/env node
'use strict';

/**
 * scripts/create-new-exercises.js
 *
 * Phase 3 — Create skeleton Firestore documents for brand-new home exercises.
 *
 * Source of truth: scripts/master_excel_map.json → `new_exercises` array.
 * Only files explicitly listed there are processed. Everything else is silently
 * skipped (those belong to existing DB documents handled in Phase 1 & 2).
 *
 * For each matched file the script:
 *   1. Cleans the filename into a Hebrew exercise name.
 *   2. Applies Phase 2 gear keyword detection.
 *   3. Uploads the video to Bunny CDN.
 *   4. Creates a brand-new `exercises` document with `draft: true` and two
 *      execution method skeletons (park skeleton + home with video & gear).
 *
 * ─── Usage ────────────────────────────────────────────────────────────────
 *   Preview (print full numbered list — NO uploads or Firestore writes):
 *     node scripts/create-new-exercises.js --test
 *
 *   Full production run:
 *     node scripts/create-new-exercises.js
 *
 * ─── Prerequisites ─────────────────────────────────────────────────────────
 *   .env.local: FIREBASE_ADMIN_EMAIL, FIREBASE_ADMIN_PASSWORD,
 *               BUNNY_API_KEY, BUNNY_LIBRARY_ID, BUNNY_CDN_HOSTNAME
 */

// ── Bootstrap ─────────────────────────────────────────────────────────────────
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const tus    = require('tus-js-client');

const { initializeApp, getApps }             = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} = require('firebase/firestore');

// ── Constants ─────────────────────────────────────────────────────────────────

const BUNNY_API_BASE     = 'https://video.bunnycdn.com';
const BUNNY_TUS_ENDPOINT = 'https://video.bunnycdn.com/tusupload';

const TARGET_DIR       = '/Users/calisthenicsltd/Downloads/צילומים בבית 07-04 2';
const EXCEL_MAP_PATH   = path.join(__dirname, 'master_excel_map.json');
const TEST_MODE        = process.argv.includes('--test');
const VIDEO_EXTS       = new Set(['.mp4', '.mov']);

const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyCezG55zVQEZWCEs-lHzx_yQldg-Ej2X60',
  authDomain:        'appout-1.firebaseapp.com',
  projectId:         'appout-1',
  storageBucket:     'appout-1.firebasestorage.app',
  messagingSenderId: '371293978848',
  appId:             '1:371293978848:web:c5281b7834ecd5398b1085',
};

// ── Env validation ────────────────────────────────────────────────────────────

function loadEnv() {
  const e = {
    firebaseEmail:    (process.env.FIREBASE_ADMIN_EMAIL    ?? '').trim(),
    firebasePassword: (process.env.FIREBASE_ADMIN_PASSWORD ?? '').trim(),
    bunnyApiKey:      (process.env.BUNNY_API_KEY           ?? '').trim(),
    bunnyLibraryId:   (process.env.BUNNY_LIBRARY_ID        ?? '').trim(),
    bunnyCdnHostname: (process.env.BUNNY_CDN_HOSTNAME      ?? '').trim(),
  };

  const missing = Object.entries({
    FIREBASE_ADMIN_EMAIL:    e.firebaseEmail,
    FIREBASE_ADMIN_PASSWORD: e.firebasePassword,
    BUNNY_API_KEY:           e.bunnyApiKey,
    BUNNY_LIBRARY_ID:        e.bunnyLibraryId,
    BUNNY_CDN_HOSTNAME:      e.bunnyCdnHostname,
  }).filter(([, v]) => !v).map(([k]) => k);

  if (missing.length) {
    console.error('\n❌  Missing required env vars:');
    missing.forEach(k => console.error(`     • ${k}`));
    console.error('\n   Add them to .env.local and re-run.\n');
    process.exit(1);
  }
  return e;
}

// ── Firebase auth ─────────────────────────────────────────────────────────────

async function initFirebase(email, password) {
  const app = getApps().length === 0
    ? initializeApp(FIREBASE_CONFIG)
    : getApps()[0];
  await signInWithEmailAndPassword(getAuth(app), email, password);
  console.log(`   ✓ Signed in as ${email}`);
  return getFirestore(app);
}

// ── Firestore duplication guard ───────────────────────────────────────────────

/**
 * Returns true when an exercise with the same Hebrew name already exists.
 * MUST query `name.he` (dot notation) — `name` is a Map { he, en }, so
 * querying the root field directly always returns zero results.
 */
async function exerciseNameExists(db, hebrewName) {
  const snap = await getDocs(
    query(collection(db, 'exercises'), where('name.he', '==', hebrewName)),
  );
  return !snap.empty;
}

// ── Name cleaning ─────────────────────────────────────────────────────────────

/**
 * Strip extension and trailing location noise from a filename.
 *
 * "פיסטול סקוואט שלילי שמאל - בית.MOV"  →  "פיסטול סקוואט שלילי שמאל"
 * "גליל בטן אקצנטרי.MOV"                →  "גליל בטן אקצנטרי"
 * "עותק של פיסטול סקוואט שלילי שמאל - בית.MOV" → "עותק של פיסטול סקוואט שלילי שמאל"
 */
function cleanName(filename) {
  return path.basename(filename, path.extname(filename))
    // " - בית", " -בית", "- בית", " ביץ" (typo in source), bare " בית"
    .replace(/\s*-?\s*בי[תץ]\s*$/u, '')
    .replace(/[\s\-]+$/u, '')
    .trim();
}

// ── Gear detection (Phase 2 keyword rules) ────────────────────────────────────

const GEAR_RULES = [
  // user_gear
  { keywords: ['trx', 'רצועות'],          id: 'i9SmtXFmalgRLlw2GBWG', name: 'רצועות TRX',     type: 'user_gear'  },
  { keywords: ['טבעות'],                  id: '9HVoe7t0PmaP5YJOYAlv', name: 'טבעות',           type: 'user_gear'  },
  { keywords: ['גומיה', 'גומייה'],         id: 'I1K30JehaxSx8dlBOZyd', name: 'גומיית התנגדות', type: 'user_gear'  },
  // improvised
  { keywords: ['כיסא', 'כיסאות', 'כיסה'], id: 'h3oFM4Xe6FE63OQzfh8x', name: 'כיסא',           type: 'improvised' },
  { keywords: ['ספה'],                    id: 'OaZayoaaymWdxKIhQAqH', name: 'ספה',             type: 'improvised' },
  { keywords: ['מתח', 'תלייה'],           id: '5Rkhxawxj8EwC4spTXVM', name: 'מתח לדלת',       type: 'improvised' },
  { keywords: ['תיק'],                    id: 'kp7fek6IloLYhKmUs0VU', name: 'תיק גב',          type: 'improvised' },
  { keywords: ['מכנס'],                   id: 'lN2j9TmDdLg1ckVRiXsV', name: 'מכנסיים',         type: 'improvised' },
  { keywords: ['שרפר', 'שרפרף'],          id: 'vtVGRrEytS4LZ2fg8rb1', name: 'שרפרף',           type: 'improvised' },
];

function detectGear(filename) {
  const lower     = filename.toLowerCase();
  const matched   = new Map(); // id → { name, type }
  let   hasUserGear = false;

  for (const rule of GEAR_RULES) {
    if (rule.keywords.some(kw => lower.includes(kw))) {
      if (!matched.has(rule.id)) {
        matched.set(rule.id, { name: rule.name, type: rule.type });
        if (rule.type === 'user_gear') hasUserGear = true;
      }
    }
  }

  return {
    gearIds:          Array.from(matched.keys()),
    gearNames:        Array.from(matched.values()).map(v => v.name),
    requiredGearType: hasUserGear ? 'user_gear' : 'improvised',
  };
}

// ── Bunny helpers (identical to bulk-upload.js) ───────────────────────────────

function buildTusSignature(libraryId, apiKey, expirationUnix, videoId) {
  return crypto
    .createHash('sha256')
    .update(`${libraryId}${apiKey}${expirationUnix}${videoId}`)
    .digest('hex');
}

async function createBunnySlot(env, title) {
  const res = await fetch(`${BUNNY_API_BASE}/library/${env.bunnyLibraryId}/videos`, {
    method:  'POST',
    headers: { AccessKey: env.bunnyApiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body:    JSON.stringify({ title }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Bunny create-slot failed: ${res.status} — ${body}`);
  }
  return (await res.json()).guid;
}

async function uploadViaTus(env, videoId, filePath) {
  return new Promise((resolve, reject) => {
    const fileSize       = fs.statSync(filePath).size;
    const fileStream     = fs.createReadStream(filePath);
    const expirationUnix = Math.floor(Date.now() / 1000) + 86400;
    const signature      = buildTusSignature(env.bunnyLibraryId, env.bunnyApiKey, expirationUnix, videoId);

    const upload = new tus.Upload(fileStream, {
      endpoint:    BUNNY_TUS_ENDPOINT,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      chunkSize:   50 * 1024 * 1024,
      uploadSize:  fileSize,
      headers: {
        AuthorizationSignature: signature,
        AuthorizationExpire:    String(expirationUnix),
        VideoId:                videoId,
        LibraryId:              env.bunnyLibraryId,
      },
      metadata:   { filetype: 'video/mp4', title: path.basename(filePath) },
      onError:    (err) => { process.stdout.write('\n'); reject(new Error(`TUS: ${err.message ?? err}`)); },
      onProgress: (up, tot) => {
        const pct = tot > 0 ? Math.floor((up / tot) * 100) : 0;
        process.stdout.write(`\r     ⬆   ${String(pct).padStart(3)}%  ${(up/1e6).toFixed(1)} / ${(tot/1e6).toFixed(1)} MB   `);
      },
      onSuccess: () => { process.stdout.write('\n'); resolve(); },
    });
    upload.start();
  });
}

async function pollUntilFinished(env, videoId, opts = {}) {
  const { intervalMs = 5_000, timeoutMs = 20 * 60 * 1_000 } = opts;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, intervalMs));
    let json;
    try {
      const res = await fetch(
        `${BUNNY_API_BASE}/library/${env.bunnyLibraryId}/videos/${videoId}`,
        { headers: { AccessKey: env.bunnyApiKey, Accept: 'application/json' } },
      );
      if (!res.ok) { process.stdout.write(`\r     ⚠   HTTP ${res.status} — retrying…`); continue; }
      json = await res.json();
    } catch { process.stdout.write('\r     ⚠   Network blip — retrying…'); continue; }

    const status   = json.status   ?? -1;
    const progress = json.encodeProgress ?? 0;

    if (status === 3 || status === 4) {
      process.stdout.write('\n');
      return { durationSeconds: typeof json.length === 'number' ? json.length : undefined };
    }
    if (status === 5) {
      process.stdout.write('\n');
      throw new Error(`Bunny encoding FAILED (status=5) for videoId=${videoId}`);
    }

    const label = { 0:'Queued', 1:'Processing', 2:'Encoding', 6:'Upload received', 7:'Upload done' }[status] ?? `status=${status}`;
    process.stdout.write(`\r     ⏳  ${label}${progress > 0 ? ` ${progress}%` : ''}…       `);
  }

  process.stdout.write('\n');
  throw new Error(`Encoding timed out after ${timeoutMs / 1000}s`);
}

// ── Skeleton document builder ─────────────────────────────────────────────────

function buildSkeletonDoc(hebrewName, bunnyVideoId, bunnyCdnHostname, gearIds, requiredGearType) {
  const now          = new Date().toISOString();
  const thumbnailUrl = `https://${bunnyCdnHostname}/${bunnyVideoId}/thumbnail.jpg`;

  return {
    name:              { he: hebrewName, en: '' },
    draft:             true,
    createdAt:         serverTimestamp(),
    updatedAt:         serverTimestamp(),
    requiredLocations: ['park', 'home'],

    execution_methods: [
      // Index 0 — Park skeleton (empty, to be filled later)
      {
        location:          'home',
        locationMapping:   ['park'],
        methodName:        { he: `${hebrewName} בפארק`, en: '' },
        explanationStatus: 'missing',
        requiredGearType:  'user_gear',
        gearIds:           [],
        equipmentIds:      [],
        media: {
          mainVideoUrl:         null,
          imageUrl:             null,
          videoDurationSeconds: null,
        },
      },
      // Index 1 — Home: video + gear tags applied
      {
        location:          'home',
        locationMapping:   ['home'],
        methodName:        { he: `${hebrewName} בבית`, en: '' },
        explanationStatus: 'missing',
        requiredGearType,
        gearIds,
        equipmentIds:      [],
        media: {
          imageUrl:             null,
          videoDurationSeconds: null,
          mainVideoUrl:         null,
          previewVideo: {
            he: {
              videoId:      bunnyVideoId,
              provider:     'bunny',
              thumbnailUrl,
              updatedAt:    now,
            },
          },
        },
      },
    ],
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a lookup Set from master_excel_map.json (exact + lowercase keys). */
function loadExcelSet() {
  if (!fs.existsSync(EXCEL_MAP_PATH)) {
    console.error(`❌  master_excel_map.json not found: ${EXCEL_MAP_PATH}`);
    process.exit(1);
  }
  const { new_exercises } = JSON.parse(fs.readFileSync(EXCEL_MAP_PATH, 'utf8'));
  if (!Array.isArray(new_exercises)) {
    console.error('❌  master_excel_map.json must have a "new_exercises" array.');
    process.exit(1);
  }
  // Store both exact and lowercase for case-insensitive matching against real filenames
  const exact = new Set(new_exercises);
  const lower = new Set(new_exercises.map(f => f.toLowerCase()));
  return { exact, lower, list: new_exercises };
}

/** Resolve a disk filename against the excel set. Returns true if it should be processed. */
function isInExcel(filename, excelSet) {
  return excelSet.exact.has(filename) || excelSet.lower.has(filename.toLowerCase());
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  create-new-exercises.js — Phase 3: New Exercise Creation       ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log(`  Mode       : ${TEST_MODE ? '🧪 PREVIEW — full list, NO uploads or Firestore writes' : '⚡ FULL RUN'}`);
  console.log(`  Source dir : ${TARGET_DIR}\n`);

  const env      = loadEnv();
  const excelSet = loadExcelSet();

  console.log(`  master_excel_map.json : ${excelSet.list.length} exercises listed\n`);

  // ════════════════════════════════════════════════════════════════════════════
  // TEST / PREVIEW — pure local computation, no network calls
  // ════════════════════════════════════════════════════════════════════════════
  if (TEST_MODE) {
    // Scan disk so we can flag which excel entries are missing from the folder
    const diskFiles = fs.existsSync(TARGET_DIR)
      ? new Set(fs.readdirSync(TARGET_DIR).map(f => f.toLowerCase()))
      : new Set();

    console.log('🧪  PREVIEW — exercises that WILL be created:\n');
    console.log('─'.repeat(70));

    let count = 0;
    for (const filename of excelSet.list) {
      count++;
      const name              = cleanName(filename);
      const { gearIds, gearNames, requiredGearType } = detectGear(filename);
      const onDisk            = diskFiles.has(filename.toLowerCase());
      const gearNote          = gearNames.length > 0
        ? `[${requiredGearType}: ${gearNames.join(' + ')}]`
        : '[bodyweight]';
      const diskFlag          = onDisk ? '' : '  ⚠️  FILE NOT FOUND ON DISK';

      const idx = String(count).padStart(String(excelSet.list.length).length, ' ');
      console.log(`  ${idx}.  ${name}  ${gearNote}${diskFlag}`);
    }

    console.log('─'.repeat(70));
    console.log(`\n  Total exercises to create : ${excelSet.list.length}`);

    const missingFromDisk = excelSet.list.filter(
      f => !diskFiles.has(f.toLowerCase()),
    );
    if (missingFromDisk.length > 0) {
      console.log(`\n  ⚠️   ${missingFromDisk.length} file(s) listed in JSON but not found on disk:`);
      missingFromDisk.forEach(f => console.log(`       • ${f}`));
    }

    console.log('\n  ℹ️   Run without --test to execute uploads and create all documents.\n');
    return;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // FULL RUN
  // ════════════════════════════════════════════════════════════════════════════

  if (!fs.existsSync(TARGET_DIR)) {
    console.error(`❌  Source directory not found:\n   ${TARGET_DIR}`);
    process.exit(1);
  }

  // Scan directory: keep only video files that are in the excel list (skip IMG_*)
  const allFiles = fs.readdirSync(TARGET_DIR, { withFileTypes: true });
  const toProcess = allFiles
    .filter(e =>
      e.isFile() &&
      VIDEO_EXTS.has(path.extname(e.name).toLowerCase()) &&
      !e.name.startsWith('IMG_') &&
      isInExcel(e.name, excelSet),
    )
    .map(e => e.name)
    .sort();

  console.log(`  Files matched from excel map : ${toProcess.length}`);

  if (toProcess.length === 0) {
    console.log('\n  ✅  No matching files found in source directory.\n');
    return;
  }

  // Warn about any excel entries missing from disk
  const diskSet = new Set(allFiles.map(e => e.name.toLowerCase()));
  const missingFromDisk = excelSet.list.filter(f => !diskSet.has(f.toLowerCase()));
  if (missingFromDisk.length > 0) {
    console.log(`\n  ⚠️   ${missingFromDisk.length} excel file(s) not found in source dir (will be skipped):`);
    missingFromDisk.forEach(f => console.log(`       • ${f}`));
    console.log('');
  }

  console.log('\n🔥  Signing in to Firebase…');
  const db = await initFirebase(env.firebaseEmail, env.firebasePassword);
  console.log('');

  const stats = { created: 0, skipped: 0, errors: 0, startTime: Date.now() }; // skipped = already in Firestore
  const total  = toProcess.length;
  const pad    = n => String(n).padStart(String(total).length, ' ');

  for (let i = 0; i < toProcess.length; i++) {
    const filename     = toProcess[i];
    const filePath     = path.join(TARGET_DIR, filename);
    const fileSizeMB   = (fs.statSync(filePath).size / 1_000_000).toFixed(1);
    const fileNum      = `[${pad(i + 1)}/${total}]`;
    const exerciseName = cleanName(filename);
    const { gearIds, gearNames, requiredGearType } = detectGear(filename);

    console.log(`${fileNum} 📹  "${filename}" (${fileSizeMB} MB)`);
    console.log(`          → Name : "${exerciseName}"`);

    try {
      // ── Duplication guard ─────────────────────────────────────────────────
      // Query name.he — NOT name (which is a Map and never equals a string).
      const alreadyExists = await exerciseNameExists(db, exerciseName);
      if (alreadyExists) {
        console.log(`     [SKIP - ALREADY EXISTS] "${exerciseName}" already in Firestore. Skipping.\n`);
        stats.skipped++;
        continue;
      }

      // ── Bunny upload ──────────────────────────────────────────────────────
      const slotTitle = `exercise — home — preview — he — new — ${exerciseName}`;
      const videoId   = await createBunnySlot(env, slotTitle);
      console.log(`     🐰  Bunny slot  : ${videoId}`);

      await uploadViaTus(env, videoId, filePath);
      console.log('     ✓  Upload done');

      console.log('     ⏳  Waiting for Bunny encoding…');
      const { durationSeconds } = await pollUntilFinished(env, videoId);
      console.log(`     ✓  Encoding done${typeof durationSeconds === 'number' ? ` (${durationSeconds}s)` : ''}`);

      // Create Firestore document
      const skeletonDoc = buildSkeletonDoc(
        exerciseName, videoId, env.bunnyCdnHostname, gearIds, requiredGearType,
      );
      const docRef = await addDoc(collection(db, 'exercises'), skeletonDoc);
      const gearLabel = gearNames.length > 0 ? gearNames.join(', ') : 'bodyweight';
      console.log(`     ✓  [FIRESTORE] Created "${exerciseName}" → ID: ${docRef.id}  [${gearLabel}]\n`);

      stats.created++;

    } catch (err) {
      stats.errors++;
      console.error(`     ✗  FAILED: ${err.message ?? err}`);
      console.log('     → Continuing to next file…\n');
    }
  }

  // Summary
  const elapsed = ((Date.now() - stats.startTime) / 60000).toFixed(1);
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  Run Summary                                                    ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log(`  Created  : ${stats.created}`);
  console.log(`  Skipped  : ${stats.skipped}  (already in Firestore — name.he match)`);
  console.log(`  Errors   : ${stats.errors}`);
  console.log(`  Duration : ${elapsed} min`);
  console.log(stats.errors === 0
    ? '\n  ✅  All exercises created successfully.\n'
    : '\n  ⚠️   Some files failed — check logs above.\n');
}

main().catch(err => {
  console.error('\n💥  Fatal error:', err instanceof Error ? err.message : String(err));
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
