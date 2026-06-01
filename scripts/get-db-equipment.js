#!/usr/bin/env node
'use strict';

/**
 * scripts/get-db-equipment.js
 *
 * Fetches every document from the two equipment collections used by the app
 * and writes a clean reference map to scripts/app-equipment-map.json.
 *
 *   gear_definitions  →  referenced by ExecutionMethod.gearIds
 *                        (home/improvised gear: bands, TRX, rings …)
 *                        name stored as { he, en }
 *
 *   gym_equipment     →  referenced by ExecutionMethod.equipmentIds
 *                        (fixed park / gym equipment: bars, benches …)
 *                        name stored as a flat string
 *
 * Output file format (scripts/app-equipment-map.json):
 * {
 *   "gear_definitions": { "<name_he>": "<firestoreDocId>", … },
 *   "gym_equipment":    { "<name>":    "<firestoreDocId>", … }
 * }
 *
 * Usage:
 *   node scripts/get-db-equipment.js
 */

// ── Bootstrap ─────────────────────────────────────────────────────────────────
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const fs   = require('fs');
const path = require('path');

const { initializeApp, getApps }             = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, collection, getDocs, orderBy, query } = require('firebase/firestore');

// ── Firebase config (mirrors src/lib/firebase.ts) ────────────────────────────
const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyCezG55zVQEZWCEs-lHzx_yQldg-Ej2X60',
  authDomain:        'appout-1.firebaseapp.com',
  projectId:         'appout-1',
  storageBucket:     'appout-1.firebasestorage.app',
  messagingSenderId: '371293978848',
  appId:             '1:371293978848:web:c5281b7834ecd5398b1085',
};

const OUT_PATH = path.join(__dirname, 'app-equipment-map.json');

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

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Pad a string to a given length for aligned terminal output. */
const col = (s, n) => String(s ?? '').padEnd(n, ' ');

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  get-db-equipment.js — Equipment & Gear Reference Fetcher       ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  console.log('🔥  Signing in to Firebase…');
  const db = await initFirebase();

  const result = {
    gear_definitions: {},
    gym_equipment:    {},
  };

  // ── 1. gear_definitions (gearIds — home / improvised items) ──────────────
  console.log('──────────────────────────────────────────────────────────────────');
  console.log('📦  Collection: gear_definitions  (used by ExecutionMethod.gearIds)');
  console.log('──────────────────────────────────────────────────────────────────');

  const gearSnap = await getDocs(query(collection(db, 'gear_definitions'), orderBy('name', 'asc')));

  if (gearSnap.empty) {
    console.log('   (empty)\n');
  } else {
    console.log(`   ${ col('Document ID', 30) }  ${ col('category', 14) }  ${ col('name.he', 30) }  name.en`);
    console.log(`   ${ '─'.repeat(30) }  ${ '─'.repeat(14) }  ${ '─'.repeat(30) }  ${ '─'.repeat(30) }`);

    gearSnap.docs.forEach((d) => {
      const data   = d.data();
      const nameHe = data.name?.he ?? '';
      const nameEn = data.name?.en ?? '';
      const cat    = data.category ?? '';

      console.log(`   ${ col(d.id, 30) }  ${ col(cat, 14) }  ${ col(nameHe, 30) }  ${ nameEn }`);

      // Use Hebrew name as the key (fall back to English, then doc ID)
      const mapKey = nameHe || nameEn || d.id;
      result.gear_definitions[mapKey] = d.id;
    });
    console.log('');
  }

  // ── 2. gym_equipment (equipmentIds — fixed park/gym equipment) ────────────
  console.log('──────────────────────────────────────────────────────────────────');
  console.log('🏋️  Collection: gym_equipment  (used by ExecutionMethod.equipmentIds)');
  console.log('──────────────────────────────────────────────────────────────────');

  const gymSnap = await getDocs(query(collection(db, 'gym_equipment'), orderBy('name', 'asc')));

  if (gymSnap.empty) {
    console.log('   (empty)\n');
  } else {
    console.log(`   ${ col('Document ID', 30) }  name`);
    console.log(`   ${ '─'.repeat(30) }  ${ '─'.repeat(40) }`);

    gymSnap.docs.forEach((d) => {
      const name = d.data().name ?? '';
      console.log(`   ${ col(d.id, 30) }  ${ name }`);
      result.gym_equipment[name] = d.id;
    });
    console.log('');
  }

  // ── 3. Write JSON map ─────────────────────────────────────────────────────
  fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 2) + '\n', 'utf8');

  const gearCount = Object.keys(result.gear_definitions).length;
  const gymCount  = Object.keys(result.gym_equipment).length;

  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  Done                                                           ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log(`  gear_definitions : ${ gearCount } items`);
  console.log(`  gym_equipment    : ${ gymCount } items`);
  console.log(`\n  ✅  Saved to: ${ OUT_PATH }\n`);
}

main().catch((err) => {
  console.error('\n💥  Fatal error:', err.message ?? err);
  process.exit(1);
});
