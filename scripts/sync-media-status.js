#!/usr/bin/env node
'use strict';

/**
 * scripts/sync-media-status.js
 *
 * Global Database Sanitizer — syncs Bunny media fields and workflow status
 * across EVERY exercise document in Firestore.
 *
 * For each exercise that has a valid Bunny videoId in the home method's
 * previewVideo.he block the script writes:
 *
 *   ROOT DOCUMENT
 *     media.imageUrl                           ← Bunny thumbnail (fixes list-view badge)
 *
 *   HOME EXECUTION METHOD  (matched via locationMapping.includes('home'))
 *     media.imageUrl                           ← thumbnail (lights accordion image icon)
 *     media.bunnyVideoId_mainVideoUrl          ← videoId   (used by camera-icon check)
 *     media.mainVideoUrl                       ← stream URL (lights accordion video icon)
 *     workflow.uploaded / filmed / edited      ← true (turns row green)
 *
 * Exercises without a home method or without a videoId are silently skipped.
 *
 * ─── Usage ────────────────────────────────────────────────────────────────
 *   Dry-run (scan ALL docs, print what WOULD be written — NO Firestore writes):
 *     node scripts/sync-media-status.js --test
 *
 *   Full production run:
 *     node scripts/sync-media-status.js
 */

// ── Bootstrap ─────────────────────────────────────────────────────────────────
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const { initializeApp, getApps }             = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const {
  getFirestore,
  collection,
  doc,
  getDocs,
  updateDoc,
  serverTimestamp,
} = require('firebase/firestore');

// ── Config ────────────────────────────────────────────────────────────────────

const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyCezG55zVQEZWCEs-lHzx_yQldg-Ej2X60',
  authDomain:        'appout-1.firebaseapp.com',
  projectId:         'appout-1',
  storageBucket:     'appout-1.firebasestorage.app',
  messagingSenderId: '371293978848',
  appId:             '1:371293978848:web:c5281b7834ecd5398b1085',
};

/** Stream URL template — same CDN hostname used by the app. */
const STREAM_URL = (videoId) =>
  `https://vz-b17872ab-7a7.b-cdn.net/${videoId}/play_360p.mp4`;

const TEST_MODE = process.argv.includes('--test');

// ── Env check ─────────────────────────────────────────────────────────────────
const email    = (process.env.FIREBASE_ADMIN_EMAIL    ?? '').trim();
const password = (process.env.FIREBASE_ADMIN_PASSWORD ?? '').trim();

if (!email || !password) {
  console.error('\n❌  Missing FIREBASE_ADMIN_EMAIL or FIREBASE_ADMIN_PASSWORD in .env.local\n');
  process.exit(1);
}

// ── Firebase auth ─────────────────────────────────────────────────────────────
async function initFirebase() {
  const app = getApps().length === 0
    ? initializeApp(FIREBASE_CONFIG)
    : getApps()[0];
  await signInWithEmailAndPassword(getAuth(app), email, password);
  console.log(`   ✓ Signed in as ${email}\n`);
  return getFirestore(app);
}

// ── Workflow payload ──────────────────────────────────────────────────────────
function buildWorkflow() {
  const now = new Date().toISOString();
  return {
    uploaded:   true,
    filmed:     true,
    edited:     true,
    audio:      false,
    audioAt:    null,
    uploadedAt: now,
    filmedAt:   now,
    editedAt:   now,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  sync-media-status.js — Global DB Sanitizer                    ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log(`  Mode : ${TEST_MODE ? '🧪 DRY-RUN — scan all docs, NO Firestore writes' : '⚡ FULL RUN — writing to Firestore'}\n`);

  console.log('🔥  Signing in to Firebase…');
  const db = await initFirebase();

  // ── Fetch every exercise ──────────────────────────────────────────────────
  console.log('📥  Fetching all exercises from Firestore…');
  const allSnap = await getDocs(collection(db, 'exercises'));
  const total   = allSnap.size;
  console.log(`   ✓ ${total} documents fetched\n`);

  const stats = {
    synced:        0,
    skipped:       0,   // no home method or no videoId
    errors:        0,
    wouldSync:     0,   // test-mode counter
  };

  const pad = n => String(n).padStart(String(total).length, ' ');

  for (let i = 0; i < allSnap.docs.length; i++) {
    const docSnap      = allSnap.docs[i];
    const data         = docSnap.data();
    const exerciseName = data.name?.he ?? data.name ?? docSnap.id;
    const fileNum      = `[${pad(i + 1)}/${total}]`;

    // ── Resolve execution_methods array ──────────────────────────────────
    const rawMethods = Array.isArray(data.execution_methods)
      ? data.execution_methods
      : Array.isArray(data.executionMethods)
        ? data.executionMethods
        : [];

    if (rawMethods.length === 0) {
      stats.skipped++;
      continue;
    }

    // ── Pass 1: check every method for a videoId ──────────────────────────
    // Track the thumbnail of the first video-enabled method for the root field.
    let rootThumbnail    = null;
    let videoMethodCount = 0;

    for (const m of rawMethods) {
      const vid = m?.media?.previewVideo?.he?.videoId ?? null;
      if (vid) {
        videoMethodCount++;
        if (!rootThumbnail) rootThumbnail = m.media.previewVideo.he.thumbnailUrl ?? null;
      }
    }

    // Skip documents that have no video in any method at all
    if (videoMethodCount === 0) {
      stats.skipped++;
      continue;
    }

    // ── TEST MODE: just log intent, no write ──────────────────────────────
    if (TEST_MODE) {
      stats.wouldSync++;
      console.log(`${fileNum} [TEST] Would sync: "${exerciseName}"  (ID: ${docSnap.id})  — ${videoMethodCount} method(s) with video`);
      console.log(`         root media.imageUrl → "${rootThumbnail ?? '(null)'}"`);
      continue;
    }

    // ── FULL RUN: loop every method, sync whichever has a videoId ─────────
    try {
      // Shallow-clone the array (spread each element to avoid mutating snap data)
      const methods  = rawMethods.map(m => ({ ...m }));
      const workflow = buildWorkflow();
      let   syncedMethodCount = 0;

      for (let j = 0; j < methods.length; j++) {
        const videoId = methods[j]?.media?.previewVideo?.he?.videoId ?? null;
        if (!videoId) continue;   // this method has no video — leave it untouched

        const thumbnailUrl = methods[j].media.previewVideo.he.thumbnailUrl ?? null;
        const mainVideoUrl = STREAM_URL(videoId);

        methods[j] = {
          ...methods[j],
          workflow,
          media: {
            ...(methods[j].media ?? {}),
            ...(thumbnailUrl ? { imageUrl: thumbnailUrl }            : {}),
            bunnyVideoId_mainVideoUrl: videoId,
            mainVideoUrl,
          },
        };

        syncedMethodCount++;
      }

      await updateDoc(doc(db, 'exercises', docSnap.id), {
        ...(rootThumbnail ? { 'media.imageUrl': rootThumbnail } : {}),
        execution_methods: methods,
        updatedAt:         serverTimestamp(),
      });

      console.log(`${fileNum} ✓  "${exerciseName}"  — ${syncedMethodCount} method(s) synced  (${docSnap.id})`);
      stats.synced++;

    } catch (err) {
      stats.errors++;
      console.error(`${fileNum} ✗  "${exerciseName}": ${err.message ?? err}`);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  Run Summary                                                    ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');

  if (TEST_MODE) {
    console.log(`  Would sync : ${stats.wouldSync}`);
    console.log(`  Skipped    : ${stats.skipped}  (no home method or no videoId)`);
    console.log('\n  ℹ️   Run without --test to execute the writes.\n');
  } else {
    console.log(`  Synced  : ${stats.synced}`);
    console.log(`  Skipped : ${stats.skipped}  (no home method or no videoId)`);
    console.log(`  Errors  : ${stats.errors}`);
    console.log(stats.errors === 0
      ? '\n  ✅  All exercises synced successfully.\n'
      : '\n  ⚠️   Some exercises failed — check logs above.\n');
  }
}

main().catch(err => {
  console.error('\n💥  Fatal error:', err instanceof Error ? err.message : String(err));
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
