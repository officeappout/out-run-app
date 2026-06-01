#!/usr/bin/env node
'use strict';

/**
 * scripts/test-single-upload.js
 *
 * PoC: Scans src/test_video/ for exactly ONE .mp4 file, fuzzy-matches it against
 * every exercise in the Firestore `exercises` collection using Dice's Coefficient,
 * uploads to Bunny CDN via TUS, then patches the exercise's "home" execution
 * method with the returned video metadata.
 *
 * Auth strategy: Firebase client SDK + signInWithEmailAndPassword.
 * No service account, no firebase-admin, no firebase-key.json needed.
 *
 * ─── Usage ──────────────────────────────────────────────────────────────────
 *
 *   Dry run (match only — no uploads, no Firestore changes):
 *     node scripts/test-single-upload.js --dry-run
 *
 *   Live run (upload previewVideo.he slot):
 *     node scripts/test-single-upload.js
 *
 *   Live run (upload fullTutorial.he slot):
 *     node scripts/test-single-upload.js --slot=tutorial
 *
 * ─── Prerequisites ───────────────────────────────────────────────────────────
 *   .env.local must contain:
 *     FIREBASE_ADMIN_EMAIL, FIREBASE_ADMIN_PASSWORD
 *     BUNNY_API_KEY, BUNNY_LIBRARY_ID, BUNNY_CDN_HOSTNAME
 *
 *   Place exactly ONE .mp4 file in:
 *     src/test_video/
 */

// ── 0. Bootstrap — load env ───────────────────────────────────────────────────
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const tus    = require('tus-js-client');

// Firebase client SDK — CJS imports (Firebase v9+ ships CJS builds)
const { initializeApp, getApps }          = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
} = require('firebase/firestore');

// ── Constants ──────────────────────────────────────────────────────────────────

const BUNNY_API_BASE     = 'https://video.bunnycdn.com';
const BUNNY_TUS_ENDPOINT = 'https://video.bunnycdn.com/tusupload';

const PROJECT_ROOT   = path.resolve(__dirname, '..');
const TEST_VIDEO_DIR = path.join(PROJECT_ROOT, 'src', 'test_video');

const DRY_RUN = process.argv.includes('--dry-run');
const SLOT    = (process.argv.find(a => a.startsWith('--slot=')) ?? '').split('=')[1] ?? 'preview';

/**
 * Firebase client config — mirrors src/lib/firebase.ts exactly.
 * These are public, non-secret values safe to commit.
 */
const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyCezG55zVQEZWCEs-lHzx_yQldg-Ej2X60',
  authDomain:        'appout-1.firebaseapp.com',
  projectId:         'appout-1',
  storageBucket:     'appout-1.firebasestorage.app',
  messagingSenderId: '371293978848',
  appId:             '1:371293978848:web:c5281b7834ecd5398b1085',
};

/**
 * Minimum Dice score to accept a match.
 * 0.40 = 40% bigram overlap — safe for partial Hebrew names.
 * Substring matches are boosted to 0.70 automatically.
 */
const MATCH_THRESHOLD = 0.40;

/**
 * Words that commonly appear in local filenames but NOT in Firestore exercise
 * names — strip these before comparing.
 */
const NOISE_WORDS = new Set([
  // Hebrew location / label noise
  'בית', 'פארק', 'חוץ', 'משרד', 'רחוב', 'ספריה', 'שדה',
  // Hebrew edition noise
  'סופי', 'עותק', 'גרסה', 'וידאו', 'חדש', 'ישן',
  // English noise
  'final', 'copy', 'version', 'video', 'home', 'park', 'new', 'old',
  'exercise', 'workout',
]);

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

// ── 2. Firebase client SDK init ────────────────────────────────────────────────

/**
 * Initialize the Firebase app + auth + Firestore, then sign in with the
 * admin account stored in .env.local.  No service account or firebase-admin
 * needed — the client SDK is sufficient for scripts with known credentials.
 */
async function initFirebase(email, password) {
  const app = getApps().length === 0
    ? initializeApp(FIREBASE_CONFIG)
    : getApps()[0];

  const auth = getAuth(app);
  const db   = getFirestore(app);

  console.log(`   Signing in as ${email}…`);
  await signInWithEmailAndPassword(auth, email, password);
  console.log('   ✓ Signed in');

  return db;
}

// ── 3. Fuzzy matching ──────────────────────────────────────────────────────────

/**
 * Normalize a Hebrew exercise name for comparison:
 *   - strip punctuation (Hebrew ״׳ + ASCII .,-()\/ etc.)
 *   - remove standalone digit tokens
 *   - lowercase
 *   - remove noise words (location labels, edition suffixes)
 *   - collapse extra whitespace
 */
function normalize(str) {
  if (!str) return '';
  let s = str.replace(/[״׳'".,\-_()[\]{}\\/|#@!?:;+*~`^]+/g, ' ');
  s = s.replace(/(?<!\S)\d+(?!\S)/g, ' ');
  const tokens = s
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w && !NOISE_WORDS.has(w.toLowerCase()));
  return tokens.join(' ').trim().toLowerCase();
}

/**
 * Dice's Coefficient — bigram string similarity [0, 1].
 * 1.0 = identical strings, 0.0 = completely different.
 * Works correctly with Unicode/Hebrew characters (BMP code points).
 */
function diceCoefficient(a, b) {
  if (!a || !b)          return 0;
  if (a === b)           return 1;
  if (a.length < 2 || b.length < 2) return 0;

  function bigrams(str) {
    const counts = new Map();
    for (let i = 0; i < str.length - 1; i++) {
      const bg = str.slice(i, i + 2);
      counts.set(bg, (counts.get(bg) ?? 0) + 1);
    }
    return counts;
  }

  const biA = bigrams(a);
  const biB = bigrams(b);

  let shared = 0;
  for (const [key, countA] of biA) {
    shared += Math.min(countA, biB.get(key) ?? 0);
  }

  return (2 * shared) / ((a.length - 1) + (b.length - 1));
}

/**
 * Find the best Firestore exercise match for a given local filename stem.
 *
 * Scoring priority:
 *   1. Substring containment → score boosted to ≥ 0.70
 *   2. Dice coefficient on Hebrew name
 *   3. Dice coefficient on English name (fallback)
 */
function findBestMatch(stem, exercises) {
  const query = normalize(stem);
  console.log(`     Normalized query : "${query}"`);

  let best      = null;
  let bestScore = -1;
  let bestRaw   = '';

  for (const ex of exercises) {
    const heName = normalize(ex.name?.he ?? '');
    const enName = normalize(ex.name?.en ?? '');

    for (const [lang, norm] of [['he', heName], ['en', enName]]) {
      if (!norm) continue;

      let score = diceCoefficient(query, norm);

      // Substring bonus — one name fully contains the other
      if (query && norm && (norm.includes(query) || query.includes(norm))) {
        score = Math.max(score, 0.70);
      }

      if (score > bestScore) {
        bestScore = score;
        best      = ex;
        bestRaw   = lang === 'he' ? (ex.name?.he ?? ex.id) : (ex.name?.en ?? ex.id);
      }
    }
  }

  return { match: best, score: bestScore, matchedName: bestRaw };
}

// ── 4. Bunny helpers ───────────────────────────────────────────────────────────

/**
 * Build the TUS authorization signature Bunny expects.
 * sha256(libraryId + apiKey + expirationTime + videoId)
 * Docs: https://docs.bunny.net/reference/tus-resumable-uploads
 */
function buildTusSignature(libraryId, apiKey, expirationUnix, videoId) {
  const msg = `${libraryId}${apiKey}${expirationUnix}${videoId}`;
  return crypto.createHash('sha256').update(msg).digest('hex');
}

/** Create an empty video slot in the Bunny library → returns videoId (GUID). */
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

  const json = await res.json();
  return json.guid;
}

/**
 * Upload a local file to Bunny via TUS (resumable, chunked).
 * Uses a ReadStream so large files are never fully loaded into RAM.
 * chunkSize: 50 MB — Bunny recommends chunks ≥ 5 MB.
 */
async function uploadViaTus(env, videoId, filePath) {
  return new Promise((resolve, reject) => {
    const fileSize   = fs.statSync(filePath).size;
    const fileStream = fs.createReadStream(filePath);

    const expirationUnix = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
    const signature = buildTusSignature(
      env.bunnyLibraryId,
      env.bunnyApiKey,
      expirationUnix,
      videoId,
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
        title:    path.basename(filePath, '.mp4'),
      },
      onError: (err) => {
        process.stdout.write('\n');
        reject(new Error(`TUS upload error: ${err.message ?? err}`));
      },
      onProgress: (uploaded, total) => {
        const pct    = total > 0 ? Math.floor((uploaded / total) * 100) : 0;
        const mbUp   = (uploaded / 1_000_000).toFixed(1);
        const mbTot  = (total   / 1_000_000).toFixed(1);
        process.stdout.write(`\r  ⬆   Uploading... ${String(pct).padStart(3)}%  (${mbUp} / ${mbTot} MB)   `);
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
 * Poll Bunny's encoding status until finished, failed, or timed out.
 *
 * Status codes:
 *   0 Queued  1 Processing  2 Encoding  3 Finished
 *   4 Resolution Finished  5 Failed  6/7 PresignedUpload (transient)
 */
async function pollUntilFinished(env, videoId, opts = {}) {
  const { intervalMs = 5_000, timeoutMs = 15 * 60 * 1_000 } = opts;
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
        process.stdout.write(`\r  ⚠   Status check HTTP ${res.status} — retrying…`);
        continue;
      }
      json = await res.json();
    } catch {
      process.stdout.write('\r  ⚠   Network error during status check — retrying…');
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
      throw new Error(`Bunny encoding FAILED for video ${videoId} (status=5)`);
    }

    const label = {
      0: 'Queued', 1: 'Processing', 2: 'Encoding',
      6: 'Upload received', 7: 'Upload done',
    }[status] ?? `status=${status}`;
    process.stdout.write(`\r  ⏳  ${label}${progress > 0 ? ` ${progress}%` : ''}…       `);
  }

  process.stdout.write('\n');
  throw new Error(`Encoding timed out after ${timeoutMs / 1_000}s`);
}

// ── 5. Firestore update ────────────────────────────────────────────────────────

/**
 * Find (or create) the `home` execution method on an exercise document and
 * write the Bunny ExternalVideo reference to `media.{field}.he`.
 *
 * @param {string} slot  'preview' → media.previewVideo.he
 *                       'tutorial' → media.fullTutorial.he
 */
async function patchExerciseHomeMethod(db, exerciseId, videoId, env, slot, durationSeconds) {
  const docRef = doc(db, 'exercises', exerciseId);
  const snap   = await getDoc(docRef);

  if (!snap.exists()) {
    throw new Error(`Exercise document "${exerciseId}" not found in Firestore.`);
  }

  const data    = snap.data();
  const methods = Array.isArray(data.execution_methods)
    ? [...data.execution_methods]
    : Array.isArray(data.executionMethods)
      ? [...data.executionMethods]
      : [];

  const externalVideo = {
    videoId,
    provider: 'bunny',
    thumbnailUrl: `https://${env.bunnyCdnHostname}/${videoId}/thumbnail.jpg`,
    ...(typeof durationSeconds === 'number' ? { durationSeconds } : {}),
  };

  const mediaField = slot === 'tutorial' ? 'fullTutorial' : 'previewVideo';

  let idx = methods.findIndex(m => m.location === 'home');

  if (idx === -1) {
    console.log('\n     ⚠   No "home" execution method found — creating one.');
    methods.push({ location: 'home', requiredGearType: 'user_gear', gearIds: [], media: {} });
    idx = methods.length - 1;
  }

  const method    = { ...methods[idx] };
  const prevMedia = method.media ?? {};
  const prevField = prevMedia[mediaField] ?? {};

  method.media = { ...prevMedia, [mediaField]: { ...prevField, he: externalVideo } };
  methods[idx] = method;

  await updateDoc(docRef, {
    execution_methods: methods,
    updatedAt: serverTimestamp(),
  });
}

// ── 6. Main ────────────────────────────────────────────────────────────────────

async function main() {
  const slotLabel = SLOT === 'tutorial' ? 'fullTutorial.he' : 'previewVideo.he';

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  test-single-upload — Smart Fuzzy Upload PoC Script           ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(`  Mode      : ${DRY_RUN ? '🔍 DRY RUN  (no Bunny upload, no Firestore writes)' : '⚡ LIVE'}`);
  console.log(`  Target    : execution_methods[home].media.${slotLabel}`);
  console.log(`  Threshold : ${Math.round(MATCH_THRESHOLD * 100)}% Dice similarity`);
  console.log(`  Video dir : ${TEST_VIDEO_DIR}`);
  console.log('');

  // ── Step 1: Validate env vars ─────────────────────────────────────────────
  const env = loadEnv();
  console.log('✓  Env vars loaded');
  console.log(`   Firebase project : ${FIREBASE_CONFIG.projectId}`);
  console.log(`   Bunny library    : ${env.bunnyLibraryId}`);
  console.log(`   CDN hostname     : ${env.bunnyCdnHostname}`);
  console.log('');

  // ── Step 2: Find the .mp4 file ────────────────────────────────────────────
  if (!fs.existsSync(TEST_VIDEO_DIR)) {
    console.error(`❌  src/test_video/ directory not found.`);
    console.error(`   mkdir -p src/test_video && cp /path/to/video.mp4 src/test_video/\n`);
    process.exit(1);
  }

  const mp4Files = fs.readdirSync(TEST_VIDEO_DIR, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.toLowerCase().endsWith('.mp4'))
    .map(e => e.name);

  if (mp4Files.length === 0) {
    console.error('❌  No .mp4 file found in src/test_video/\n');
    process.exit(1);
  }
  if (mp4Files.length > 1) {
    console.error(`❌  Found ${mp4Files.length} .mp4 files — place exactly ONE:`);
    mp4Files.forEach(f => console.error(`     • ${f}`));
    console.error('');
    process.exit(1);
  }

  const filename   = mp4Files[0];
  const filePath   = path.join(TEST_VIDEO_DIR, filename);
  const stem       = path.basename(filename, '.mp4');
  const fileSizeMB = (fs.statSync(filePath).size / 1_000_000).toFixed(2);

  console.log(`📹  Found video`);
  console.log(`   Filename : ${filename}`);
  console.log(`   Stem     : "${stem}"`);
  console.log(`   Size     : ${fileSizeMB} MB`);
  console.log('');

  // ── Step 3: Firebase sign-in ──────────────────────────────────────────────
  console.log('🔥  Initializing Firebase…');
  const db = await initFirebase(env.firebaseEmail, env.firebasePassword);
  console.log('');

  // ── Step 4: Load exercises ────────────────────────────────────────────────
  console.log('📚  Loading exercises from Firestore…');
  const snapshot  = await getDocs(collection(db, 'exercises'));
  const exercises = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`   ${exercises.length} exercises loaded.`);

  // ── Dump exercise list to firestore_exercises.txt ─────────────────────────
  const dumpPath = path.join(PROJECT_ROOT, 'firestore_exercises.txt');
  const lines = exercises
    .slice()
    .sort((a, b) => (a.name?.he ?? '').localeCompare(b.name?.he ?? '', 'he'))
    .map(ex => {
      const he = ex.name?.he ?? '';
      const en = ex.name?.en ?? '';
      return `${ex.id}  |  ${he}${en ? `  (${en})` : ''}`;
    });
  fs.writeFileSync(dumpPath, lines.join('\n') + '\n', 'utf8');
  console.log(`   ✓ Saved to firestore_exercises.txt (${lines.length} entries)`);
  console.log('');

  // ── Step 5: Fuzzy match ───────────────────────────────────────────────────
  console.log('🔍  Running fuzzy match…');
  const { match, score, matchedName } = findBestMatch(stem, exercises);
  const scorePercent = Math.round(score * 100);

  if (!match || score < MATCH_THRESHOLD) {
    console.log(`\n[SKIP] No confident match found for "${filename}".`);
    console.log(`       Best score : ${scorePercent}% (threshold: ${Math.round(MATCH_THRESHOLD * 100)}%)`);
    if (match) console.log(`       Closest    : "${match.name?.he ?? match.id}" at ${scorePercent}%`);
    console.log('\n  Tip: rename the file to more closely match the Hebrew exercise name.\n');
    process.exit(0);
  }

  console.log('');
  console.log(`[MATCH FOUND - Score: ${scorePercent}%]`);
  console.log(`   Local file      : "${filename}"`);
  console.log(`   → Exercise name : "${matchedName}"`);
  console.log(`   → Exercise ID   : ${match.id}`);

  const currentMethods = match.execution_methods ?? match.executionMethods ?? [];
  const homeMethod     = currentMethods.find(m => m.location === 'home');
  if (homeMethod) {
    const existing = homeMethod.media?.[SLOT === 'tutorial' ? 'fullTutorial' : 'previewVideo']?.he;
    if (existing?.videoId) {
      console.log(`   ⚠  Already has ${slotLabel}: ${existing.videoId} — will REPLACE`);
    } else {
      console.log(`   Home method exists — will set ${slotLabel}`);
    }
  } else {
    console.log(`   No "home" method yet — will be created automatically`);
  }

  // ── Dry run stops here ────────────────────────────────────────────────────
  if (DRY_RUN) {
    console.log(`\n[DRY RUN] Stopping here. Remove --dry-run to execute the upload.\n`);
    process.exit(0);
  }

  console.log('');

  // ── Step 6: Create Bunny video slot ───────────────────────────────────────
  const uploadTitle = `exercise — ${matchedName} — ${SLOT === 'tutorial' ? 'tutorial' : 'preview'} — he`;
  console.log('🐰  Creating Bunny video slot…');
  const videoId = await createBunnySlot(env, uploadTitle);
  console.log(`   videoId : ${videoId}`);
  console.log(`   title   : ${uploadTitle}`);
  console.log('');

  // ── Step 7: TUS upload ────────────────────────────────────────────────────
  console.log('⬆   Starting TUS upload (50 MB chunks → Bunny CDN)…');
  await uploadViaTus(env, videoId, filePath);
  console.log('   Upload complete.');
  console.log('');

  // ── Step 8: Poll encoding ─────────────────────────────────────────────────
  console.log('⏳  Waiting for Bunny encoding to finish…');
  const { durationSeconds } = await pollUntilFinished(env, videoId);
  console.log(`   ✓ Encoding done${typeof durationSeconds === 'number' ? ` (${durationSeconds}s)` : ''}`);
  console.log(`   Thumbnail : https://${env.bunnyCdnHostname}/${videoId}/thumbnail.jpg`);
  console.log(`   Embed     : https://iframe.mediadelivery.net/embed/${env.bunnyLibraryId}/${videoId}`);
  console.log('');

  // ── Step 9: Update Firestore ──────────────────────────────────────────────
  console.log('📝  Patching Firestore exercise document…');
  await patchExerciseHomeMethod(db, match.id, videoId, env, SLOT, durationSeconds);
  console.log(`   ✓ Updated exercise "${matchedName}" (${match.id})`);
  console.log(`   Field : execution_methods[home].media.${slotLabel}`);
  console.log(`   Value : { videoId: "${videoId}", provider: "bunny", … }`);

  console.log('\n✅  Done — video is live on Bunny CDN and linked in Firestore.\n');
}

main().catch(err => {
  console.error('\n💥  Fatal error:', err instanceof Error ? err.message : String(err));
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
