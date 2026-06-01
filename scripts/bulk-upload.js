#!/usr/bin/env node
'use strict';

/**
 * scripts/bulk-upload.js
 *
 * Production bulk-upload pipeline.
 *
 * For every video file found in TARGET_DIR, looks up its filename in
 * scripts/mapping.json, uploads to Bunny CDN via TUS, then patches the
 * matching Firestore exercise's `home` execution method with the returned
 * Bunny metadata — touching ONLY `media.previewVideo.he`.
 *
 * Equipment / gear / requiredGearType fields are intentionally NEVER written
 * in Phase 1. Those will be handled in a separate step.
 *
 * ─── Usage ────────────────────────────────────────────────────────────────
 *
 *   Test mode (stop after the FIRST successful upload — verify in admin panel):
 *     node scripts/bulk-upload.js --test
 *
 *   Full production run:
 *     node scripts/bulk-upload.js
 *
 * ─── Prerequisites ─────────────────────────────────────────────────────────
 *   .env.local must contain:
 *     FIREBASE_ADMIN_EMAIL, FIREBASE_ADMIN_PASSWORD
 *     BUNNY_API_KEY, BUNNY_LIBRARY_ID, BUNNY_CDN_HOSTNAME
 */

// ── 0. Bootstrap ──────────────────────────────────────────────────────────────
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
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
} = require('firebase/firestore');

// ── Constants ──────────────────────────────────────────────────────────────────

const BUNNY_API_BASE     = 'https://video.bunnycdn.com';
const BUNNY_TUS_ENDPOINT = 'https://video.bunnycdn.com/tusupload';

const PROJECT_ROOT = path.resolve(__dirname, '..');

/** Directory containing the raw video files from the camera session. */
const TARGET_DIR = '/Users/calisthenicsltd/Downloads/צילומים בבית 07-04 2';

/** Semantic map: filename → Firestore exercise ID. */
const MAPPING_PATH = path.join(__dirname, 'mapping.json');

const TEST_MODE = process.argv.includes('--test');

/** Extensions accepted as video files (case-insensitive). */
const VIDEO_EXTS = new Set(['.mp4', '.mov']);

/** Firebase client config — public values, mirrors src/lib/firebase.ts. */
const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyCezG55zVQEZWCEs-lHzx_yQldg-Ej2X60',
  authDomain:        'appout-1.firebaseapp.com',
  projectId:         'appout-1',
  storageBucket:     'appout-1.firebasestorage.app',
  messagingSenderId: '371293978848',
  appId:             '1:371293978848:web:c5281b7834ecd5398b1085',
};

// ── 1. Env validation ──────────────────────────────────────────────────────────

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
  })
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length > 0) {
    console.error('\n❌  Missing required env vars:');
    missing.forEach(k => console.error(`     • ${k}`));
    console.error('\n   Add them to .env.local and re-run.\n');
    process.exit(1);
  }

  return e;
}

// ── 2. Firebase ────────────────────────────────────────────────────────────────

async function initFirebase(email, password) {
  const app = getApps().length === 0
    ? initializeApp(FIREBASE_CONFIG)
    : getApps()[0];

  await signInWithEmailAndPassword(getAuth(app), email, password);
  console.log(`   ✓ Signed in as ${email}`);

  return getFirestore(app);
}

// ── 3. Mapping loader ──────────────────────────────────────────────────────────

/**
 * Load mapping.json and build TWO lookup structures:
 *   exact   — original filename → exerciseId   (fastest)
 *   lower   — lowercased filename → exerciseId (case-insensitive fallback)
 *
 * This handles macOS/Windows case differences and any accidental
 * capitalisation mismatches between the JSON keys and the real filenames.
 */
function loadMapping() {
  if (!fs.existsSync(MAPPING_PATH)) {
    console.error(`❌  Mapping file not found: ${MAPPING_PATH}`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(MAPPING_PATH, 'utf8'));

  const exact = new Map();  // original case → exerciseId
  const lower = new Map();  // lower-cased   → exerciseId  (fallback)

  for (const [filename, exerciseId] of Object.entries(raw)) {
    exact.set(filename, exerciseId);
    // For duplicated lowercase keys (two files differ only by case) keep first.
    if (!lower.has(filename.toLowerCase())) {
      lower.set(filename.toLowerCase(), exerciseId);
    }
  }

  return { exact, lower, total: exact.size };
}

/**
 * Resolve a disk filename to its Firestore exercise ID.
 * Returns null when the file is intentionally not mapped.
 */
function resolveExerciseId(filename, mapping) {
  // 1. Exact match (cheapest)
  if (mapping.exact.has(filename)) return mapping.exact.get(filename);

  // 2. Case-insensitive match (handles .MOV vs .mov, extra capitalisation)
  const key = filename.toLowerCase();
  if (mapping.lower.has(key)) return mapping.lower.get(key);

  return null;
}

// ── 4. Bunny helpers ───────────────────────────────────────────────────────────

function buildTusSignature(libraryId, apiKey, expirationUnix, videoId) {
  const msg = `${libraryId}${apiKey}${expirationUnix}${videoId}`;
  return crypto.createHash('sha256').update(msg).digest('hex');
}

async function createBunnySlot(env, title) {
  const res = await fetch(`${BUNNY_API_BASE}/library/${env.bunnyLibraryId}/videos`, {
    method: 'POST',
    headers: {
      AccessKey: env.bunnyApiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ title }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Bunny create-slot failed: ${res.status} — ${body}`);
  }

  return (await res.json()).guid;
}

/**
 * Upload a local file to Bunny via TUS (resumable, 50 MB chunks).
 * Uses a ReadStream — never loads the full file into RAM.
 */
async function uploadViaTus(env, videoId, filePath) {
  return new Promise((resolve, reject) => {
    const fileSize   = fs.statSync(filePath).size;
    const fileStream = fs.createReadStream(filePath);

    const expirationUnix = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
    const signature = buildTusSignature(
      env.bunnyLibraryId, env.bunnyApiKey, expirationUnix, videoId,
    );

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
      metadata: {
        filetype: 'video/mp4',
        title:    path.basename(filePath),
      },
      onError: (err) => {
        process.stdout.write('\n');
        reject(new Error(`TUS error: ${err.message ?? err}`));
      },
      onProgress: (uploaded, total) => {
        const pct   = total > 0 ? Math.floor((uploaded / total) * 100) : 0;
        const mbUp  = (uploaded / 1_000_000).toFixed(1);
        const mbTot = (total   / 1_000_000).toFixed(1);
        process.stdout.write(
          `\r     ⬆   ${String(pct).padStart(3)}%  ${mbUp} / ${mbTot} MB   `,
        );
      },
      onSuccess: () => {
        process.stdout.write('\n');
        resolve();
      },
    });

    upload.start();
  });
}

/**
 * Poll until Bunny's encoder finishes (status 3 or 4), times out, or fails.
 *
 * Status codes: 0 Queued · 1 Processing · 2 Encoding · 3 Finished
 *               4 Resolution Finished · 5 Failed · 6/7 PresignedUpload
 */
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
      if (!res.ok) {
        process.stdout.write(`\r     ⚠   Status check HTTP ${res.status} — retrying…`);
        continue;
      }
      json = await res.json();
    } catch {
      process.stdout.write('\r     ⚠   Network blip — retrying…');
      continue;
    }

    const status   = json.status ?? -1;
    const progress = json.encodeProgress ?? 0;

    if (status === 3 || status === 4) {
      process.stdout.write('\n');
      return { durationSeconds: typeof json.length === 'number' ? json.length : undefined };
    }

    if (status === 5) {
      process.stdout.write('\n');
      throw new Error(`Bunny encoding FAILED (status=5) for videoId=${videoId}`);
    }

    const label = {
      0: 'Queued', 1: 'Processing', 2: 'Encoding',
      6: 'Upload received', 7: 'Upload done',
    }[status] ?? `status=${status}`;
    process.stdout.write(
      `\r     ⏳  ${label}${progress > 0 ? ` ${progress}%` : ''}…       `,
    );
  }

  process.stdout.write('\n');
  throw new Error(`Encoding timed out after ${timeoutMs / 1_000}s`);
}

// ── 5. Firestore patch — READ → MODIFY → WRITE ─────────────────────────────────

/**
 * Safe Read-Modify-Write on a single exercise document.
 *
 * Phase 1 rules — what this function WILL write:
 *   ✅  execution_methods[home].media.previewVideo.he   ← Bunny video ref
 *
 * Phase 1 rules — what this function will NEVER touch:
 *   ❌  Any method where location !== 'home'
 *   ❌  gearIds, equipmentIds, requiredGearType, lifestyleTags, specificCues, …
 *   ❌  Any existing field not listed above (full spread-preservation)
 *
 * Branch logic:
 *   Home method FOUND  → spread the existing object, only replace media.previewVideo.he
 *   Home method ABSENT → push a brand-new minimal entry; never clobber other locations
 */
async function patchHomePreviewVideo(db, exerciseId, videoId, env, durationSeconds) {
  const docRef = doc(db, 'exercises', exerciseId);
  const snap   = await getDoc(docRef);

  if (!snap.exists()) {
    throw new Error(`Exercise document "${exerciseId}" not found in Firestore.`);
  }

  const data = snap.data();

  const hasSnakeCase = Array.isArray(data.execution_methods);
  const hasCamelCase = Array.isArray(data.executionMethods);

  // Read from snake_case first (the field the admin editor reads/writes),
  // then fall back to camelCase (legacy alias).
  // Shallow-copy every element so we never accidentally mutate snap data.
  const methods = hasSnakeCase
    ? data.execution_methods.map(m => ({ ...m }))
    : hasCamelCase
      ? data.executionMethods.map(m => ({ ...m }))
      : [];

  /** ExternalVideo object the app reads from `previewVideo.he`. */
  const externalVideo = {
    videoId,
    provider:     'bunny',
    thumbnailUrl: `https://${env.bunnyCdnHostname}/${videoId}/thumbnail.jpg`,
    updatedAt:    new Date().toISOString(),
    ...(typeof durationSeconds === 'number' ? { durationSeconds } : {}),
  };

  // The real discriminator between methods is locationMapping (e.g. ["home"] vs ["park"]),
  // not the root `location` field which can be shared across methods.
  const homeMethodIndex = methods.findIndex(m => m.locationMapping?.includes('home'));

  if (homeMethodIndex !== -1) {
    // Home method EXISTS — spread all its existing fields, only overwrite
    // media.previewVideo.he. Park/gym/street entries are untouched.
    const existing = methods[homeMethodIndex];
    methods[homeMethodIndex] = {
      ...existing,
      media: {
        ...(existing.media ?? {}),
        previewVideo: {
          ...((existing.media?.previewVideo) ?? {}),
          he: externalVideo,
        },
      },
    };
  } else {
    // Home method ABSENT — push a schema-consistent skeleton.
    methods.push({
      location:         'home',
      locationMapping:  ['home'],
      requiredGearType: 'improvised',
      gearIds:          [],
      equipmentIds:     [],
      media: {
        previewVideo: {
          he: externalVideo,
        },
      },
    });
  }

  await updateDoc(docRef, {
    execution_methods: methods,
    updatedAt: serverTimestamp(),
  });

  // Return the resolved index so the caller can log it (-1 means a new entry was pushed).
  return homeMethodIndex === -1 ? methods.length - 1 : homeMethodIndex;
}

// ── 6. Progress logger ─────────────────────────────────────────────────────────

function pad(n, total) {
  return String(n).padStart(String(total).length, ' ');
}

// ── 7. Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  bulk-upload.js — Production Batch Video Upload                 ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log(`  Mode       : ${TEST_MODE ? '🧪 TEST — stop after first successful upload' : '⚡ FULL RUN'}`);
  console.log(`  Source dir : ${TARGET_DIR}`);
  console.log(`  Mapping    : ${MAPPING_PATH}`);
  console.log('');

  // ── Validate env ─────────────────────────────────────────────────────────
  const env = loadEnv();

  // ── Load mapping ──────────────────────────────────────────────────────────
  const mapping = loadMapping();
  console.log(`  Mapping has ${mapping.total} entries`);

  // ── Scan target directory ─────────────────────────────────────────────────
  if (!fs.existsSync(TARGET_DIR)) {
    console.error(`\n❌  Target directory not found:\n   ${TARGET_DIR}\n`);
    process.exit(1);
  }

  const allEntries = fs.readdirSync(TARGET_DIR, { withFileTypes: true });
  const videoFiles = allEntries
    .filter(e => e.isFile() && VIDEO_EXTS.has(path.extname(e.name).toLowerCase()))
    .map(e => e.name)
    .sort();                    // deterministic order for logging

  console.log(`  Found ${videoFiles.length} video file(s) in source directory`);

  const mappedFiles   = videoFiles.filter(f => resolveExerciseId(f, mapping) !== null);
  const unmappedFiles = videoFiles.filter(f => resolveExerciseId(f, mapping) === null);

  console.log(`  Mapped  : ${mappedFiles.length} will be uploaded`);
  console.log(`  Unmapped: ${unmappedFiles.length} will be skipped`);
  console.log('');

  // ── Firebase sign-in ──────────────────────────────────────────────────────
  console.log('🔥  Signing in to Firebase…');
  const db = await initFirebase(env.firebaseEmail, env.firebasePassword);
  console.log('');

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = {
    skipped:   0,
    uploaded:  0,
    failed:    0,
    startTime: Date.now(),
  };

  const total = videoFiles.length;

  // ── Main loop ─────────────────────────────────────────────────────────────
  for (let i = 0; i < videoFiles.length; i++) {
    const filename   = videoFiles[i];
    const filePath   = path.join(TARGET_DIR, filename);
    const fileNum    = `[${pad(i + 1, total)}/${total}]`;
    const exerciseId = resolveExerciseId(filename, mapping);
    const fileSizeMB = (fs.statSync(filePath).size / 1_000_000).toFixed(1);

    // ── Skip unmapped files ─────────────────────────────────────────────────
    if (!exerciseId) {
      console.log(`${fileNum} [SKIP] "${filename}"`);
      stats.skipped++;
      continue;
    }

    console.log(`${fileNum} 📹  "${filename}" (${fileSizeMB} MB)`);
    console.log(`          → Exercise ID : ${exerciseId}`);

    try {
      // ── Create Bunny slot ───────────────────────────────────────────────
      const slotTitle = `exercise — home — preview — he — ${exerciseId}`;
      const videoId   = await createBunnySlot(env, slotTitle);
      console.log(`     🐰  Bunny slot  : ${videoId}`);

      // ── TUS upload ─────────────────────────────────────────────────────
      await uploadViaTus(env, videoId, filePath);
      console.log(`     ✓  Upload done`);

      // ── Poll encoding ───────────────────────────────────────────────────
      console.log('     ⏳  Waiting for Bunny encoding…');
      const { durationSeconds } = await pollUntilFinished(env, videoId);
      console.log(
        `     ✓  Encoding done${typeof durationSeconds === 'number' ? ` (${durationSeconds}s)` : ''}`,
      );

      // ── Patch Firestore ─────────────────────────────────────────────────
      const homeIdx = await patchHomePreviewVideo(db, exerciseId, videoId, env, durationSeconds);
      console.log(`     ✓  [FIRESTORE] Home method updated at index ${homeIdx} — videoId: ${videoId}`);

      stats.uploaded++;

      // ── Test mode: exit after first success ─────────────────────────────
      if (TEST_MODE) {
        console.log(`\n🧪  TEST MODE — stopping after first successful upload.`);
        console.log(`   Open the admin panel, find exercise ${exerciseId}, and verify`);
        console.log(`   the previewVideo.he field contains videoId: "${videoId}"\n`);
        break;
      }

      console.log('');
    } catch (err) {
      stats.failed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`     ✗  FAILED: ${msg}`);

      if (TEST_MODE) {
        // In test mode a failure is fatal — we need clean confirmation.
        console.error('\n💥  Test mode: aborting on first error.\n');
        process.exit(1);
      }

      console.log('     → Continuing to next file…\n');
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - stats.startTime) / 1000 / 60).toFixed(1);

  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  Run Summary                                                    ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log(`  Uploaded : ${stats.uploaded}`);
  console.log(`  Skipped  : ${stats.skipped}  (not in mapping.json)`);
  console.log(`  Failed   : ${stats.failed}`);
  console.log(`  Duration : ${elapsed} min`);

  if (stats.failed === 0) {
    console.log('\n  ✅  All mapped files processed successfully.\n');
  } else {
    console.log(`\n  ⚠   ${stats.failed} file(s) failed — check the log above for details.\n`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\n💥  Fatal error:', err instanceof Error ? err.message : String(err));
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
