#!/usr/bin/env node
'use strict';

/**
 * scripts/tag-equipment.js
 *
 * Phase 2 — Equipment & Gear Tagging for Home exercises.
 *
 * For every exercise in mapping.json, the script:
 *  1. Scans the filename for gear keywords.
 *  2. Finds the execution method where locationMapping includes 'home'.
 *  3. Writes ONLY gearIds + requiredGearType onto that method.
 *     → All other fields (media, locationMapping, specificCues, …) are untouched.
 *
 * Multiple filenames that map to the same Firestore ID are merged: their
 * detected gear IDs are unioned so no equipment is lost.
 *
 * ─── Usage ────────────────────────────────────────────────────────────────
 *   Dry-run (inspect first exercise, NO writes to Firestore):
 *     node scripts/tag-equipment.js --test
 *
 *   Full production run:
 *     node scripts/tag-equipment.js
 */

// ── Bootstrap ─────────────────────────────────────────────────────────────────
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const fs   = require('fs');
const path = require('path');

const { initializeApp, getApps }             = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const {
  getFirestore,
  doc,
  getDoc,
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

const MAPPING_PATH = path.join(__dirname, 'mapping.json');
const TEST_MODE    = process.argv.includes('--test');

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

// ── Keyword → gear rule table ─────────────────────────────────────────────────
//
//  type 'user_gear'  = professional portable equipment
//  type 'improvised' = household furniture / everyday objects
//
//  requiredGearType resolution:
//    ANY user_gear match  →  'user_gear'
//    otherwise            →  'improvised'  (including pure bodyweight)

const GEAR_RULES = [
  // ── user_gear ──────────────────────────────────────────────────────────────
  {
    keywords: ['trx', 'רצועות'],
    id:       'i9SmtXFmalgRLlw2GBWG',
    name:     'רצועות TRX',
    type:     'user_gear',
  },
  {
    keywords: ['טבעות'],
    id:       '9HVoe7t0PmaP5YJOYAlv',
    name:     'טבעות',
    type:     'user_gear',
  },
  {
    keywords: ['גומיה', 'גומייה'],
    id:       'I1K30JehaxSx8dlBOZyd',
    name:     'גומיית התנגדות',
    type:     'user_gear',
  },
  // ── improvised ─────────────────────────────────────────────────────────────
  {
    keywords: ['כיסא', 'כיסאות', 'כיסה'],
    id:       'h3oFM4Xe6FE63OQzfh8x',
    name:     'כיסא',
    type:     'improvised',
  },
  {
    keywords: ['ספה'],
    id:       'OaZayoaaymWdxKIhQAqH',
    name:     'ספה',
    type:     'improvised',
  },
  {
    keywords: ['מתח', 'תלייה'],
    id:       '5Rkhxawxj8EwC4spTXVM',
    name:     'מתח לדלת',
    type:     'improvised',
  },
  {
    keywords: ['תיק'],
    id:       'kp7fek6IloLYhKmUs0VU',
    name:     'תיק גב',
    type:     'improvised',
  },
  {
    keywords: ['מכנס'],
    id:       'lN2j9TmDdLg1ckVRiXsV',
    name:     'מכנסיים',
    type:     'improvised',
  },
  {
    keywords: ['שרפר', 'שרפרף'],
    id:       'vtVGRrEytS4LZ2fg8rb1',
    name:     'שרפרף',
    type:     'improvised',
  },
];

// ── Gear detection ─────────────────────────────────────────────────────────────

/**
 * Scan a single filename and return the matched gear IDs, display names,
 * and the resolved requiredGearType.
 */
function detectGear(filename) {
  const lower      = filename.toLowerCase();
  const matchedIds  = new Map(); // id → { name, type }
  let   hasUserGear = false;

  for (const rule of GEAR_RULES) {
    if (rule.keywords.some(kw => lower.includes(kw))) {
      if (!matchedIds.has(rule.id)) {
        matchedIds.set(rule.id, { name: rule.name, type: rule.type });
        if (rule.type === 'user_gear') hasUserGear = true;
      }
    }
  }

  return {
    gearIds:          Array.from(matchedIds.keys()),
    gearNames:        Array.from(matchedIds.values()).map(v => v.name),
    requiredGearType: hasUserGear ? 'user_gear' : 'improvised',
  };
}

// ── Build per-exercise plan ────────────────────────────────────────────────────

/**
 * Group mapping entries by exercise ID, merging gear detections from every
 * filename that points to the same document.
 *
 * requiredGearType is upgraded to 'user_gear' as soon as any filename for
 * that exercise triggers a user_gear rule.
 */
function buildPlan(mapping) {
  // exerciseId → { gearIds: Set<string>, gearNames: Set<string>, requiredGearType }
  const byId = new Map();

  for (const [filename, exerciseId] of Object.entries(mapping)) {
    const { gearIds, gearNames, requiredGearType } = detectGear(filename);

    if (!byId.has(exerciseId)) {
      byId.set(exerciseId, {
        gearIds:          new Set(),
        gearNames:        new Set(),
        requiredGearType: 'improvised',
      });
    }

    const entry = byId.get(exerciseId);
    gearIds.forEach(id  => entry.gearIds.add(id));
    gearNames.forEach(n  => entry.gearNames.add(n));
    if (requiredGearType === 'user_gear') entry.requiredGearType = 'user_gear';
  }

  return Array.from(byId.entries()).map(([exerciseId, entry]) => ({
    exerciseId,
    gearIds:          Array.from(entry.gearIds),
    gearNames:        Array.from(entry.gearNames),
    requiredGearType: entry.requiredGearType,
  }));
}

// ── Firestore patch ────────────────────────────────────────────────────────────

/**
 * Read-Modify-Write: only gearIds + requiredGearType on the home method.
 * Returns the resolved index, or null if the exercise/home-method is absent.
 *
 * When dryRun is true the function prints the would-be payload and skips updateDoc.
 */
async function tagHomeMethod(db, exerciseId, gearIds, requiredGearType, dryRun) {
  const docRef = doc(db, 'exercises', exerciseId);
  const snap   = await getDoc(docRef);

  if (!snap.exists()) {
    console.warn(`   ⚠️  [SKIP] Exercise "${exerciseId}" not found in Firestore`);
    return null;
  }

  const data = snap.data();

  // Prefer snake_case (admin-written field); fall back to camelCase legacy.
  const methods = Array.isArray(data.execution_methods)
    ? data.execution_methods.map(m => ({ ...m }))
    : Array.isArray(data.executionMethods)
      ? data.executionMethods.map(m => ({ ...m }))
      : [];

  // locationMapping is the real discriminator — never trust the root `location` field alone.
  const homeIdx = methods.findIndex(m => m.locationMapping?.includes('home'));

  if (homeIdx === -1) {
    console.warn(`   ⚠️  [SKIP] Exercise "${exerciseId}" has no home method in execution_methods`);
    return null;
  }

  // Spread-safe: only overwrite gearIds + requiredGearType; everything else preserved.
  methods[homeIdx] = {
    ...methods[homeIdx],
    gearIds,
    requiredGearType,
  };

  if (dryRun) {
    console.log('\n🔍 [DRY-RUN] Full modified execution_methods array that WOULD be sent to Firestore:');
    console.log(JSON.stringify(methods, null, 2));
    console.log('──────────────────────────────────────────────────────────────────\n');
    return homeIdx;
  }

  await updateDoc(docRef, {
    execution_methods: methods,
    updatedAt:         serverTimestamp(),
  });

  return homeIdx;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  tag-equipment.js — Phase 2: Home Gear Tagging                 ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log(`  Mode : ${TEST_MODE ? '🧪 DRY-RUN — first exercise printed, NO Firestore writes' : '⚡ FULL RUN'}\n`);

  if (!fs.existsSync(MAPPING_PATH)) {
    console.error(`❌  mapping.json not found at ${MAPPING_PATH}`);
    process.exit(1);
  }

  const mapping = JSON.parse(fs.readFileSync(MAPPING_PATH, 'utf8'));
  const plan    = buildPlan(mapping);

  console.log(`  mapping.json   : ${Object.keys(mapping).length} filename entries`);
  console.log(`  Unique exercises: ${plan.length}\n`);

  console.log('🔥  Signing in to Firebase…');
  const db = await initFirebase();

  const stats = { tagged: 0, skipped: 0, errors: 0 };

  for (const { exerciseId, gearIds, gearNames, requiredGearType } of plan) {
    const label = gearNames.length > 0 ? gearNames.join(', ') : 'none — bodyweight';

    try {
      if (TEST_MODE) {
        console.log(`🧪  DRY-RUN — Exercise : ${exerciseId}`);
        console.log(`   gearIds          : [${gearIds.join(', ')}]`);
        console.log(`   gearNames        : ${label}`);
        console.log(`   requiredGearType : ${requiredGearType}`);
      }

      const homeIdx = await tagHomeMethod(db, exerciseId, gearIds, requiredGearType, TEST_MODE);

      if (homeIdx === null) {
        stats.skipped++;
      } else if (!TEST_MODE) {
        console.log(`  ✓ [GEAR TAGGED] Assigned [${label}] and requiredGearType=${requiredGearType} for Exercise ID: ${exerciseId}`);
        stats.tagged++;
      }

      if (TEST_MODE) {
        console.log('🧪  TEST MODE — stopping after first exercise. Nothing was written to Firestore.\n');
        break;
      }

    } catch (err) {
      console.error(`  ❌  [ERROR] "${exerciseId}": ${err.message ?? err}`);
      stats.errors++;
    }
  }

  if (!TEST_MODE) {
    console.log('\n╔══════════════════════════════════════════════════════════════════╗');
    console.log('║  Run Summary                                                    ║');
    console.log('╚══════════════════════════════════════════════════════════════════╝');
    console.log(`  Tagged  : ${stats.tagged}`);
    console.log(`  Skipped : ${stats.skipped}  (no home method or document missing)`);
    console.log(`  Errors  : ${stats.errors}`);
    console.log(stats.errors === 0
      ? '\n  ✅  All exercises tagged successfully.\n'
      : '\n  ⚠️   Some exercises failed — check logs above.\n');
  }
}

main().catch((err) => {
  console.error('\n💥  Fatal error:', err.message ?? err);
  process.exit(1);
});
