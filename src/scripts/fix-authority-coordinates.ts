/**
 * fix-authority-coordinates.ts
 *
 * Updates Firestore `authorities` documents that still have the
 * Jerusalem fallback coordinates { lat: 31.7683, lng: 35.2137 }.
 *
 * Reads:  Firebase client SDK (authorities are publicly readable).
 * Writes: Firestore REST API + admin ID token (authorities require isAdmin()).
 *
 * ── How to get your ID token ──────────────────────────────────────────────
 * 1. Open the app in Chrome while logged in as admin (david@appout.co.il).
 * 2. Open DevTools → Console and run:
 *      const { getAuth } = await import('firebase/auth');
 *      copy(await getAuth().currentUser.getIdToken(true));
 * 3. This copies the token to your clipboard.
 * 4. Add to .env.local:  FIREBASE_ID_TOKEN=<paste here>
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Run:
 *   node --env-file=.env.local ./node_modules/.bin/tsx src/scripts/fix-authority-coordinates.ts
 */

import * as https from 'https';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';

// ── Firebase project ──────────────────────────────────────────
const PROJECT_ID = 'appout-1';
const FS_BASE    = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// ── REST write helper ─────────────────────────────────────────
function httpsPatch(url: string, body: string, token: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'Authorization': `Bearer ${token}`,
        },
      },
      res => {
        let raw = '';
        res.on('data', c => { raw += c as string; });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 300)}`));
          } else {
            resolve();
          }
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function patchCoords(docId: string, coords: { lat: number; lng: number }, token: string): Promise<void> {
  const url  = `${FS_BASE}/authorities/${docId}?updateMask.fieldPaths=coordinates`;
  const body = JSON.stringify({
    fields: {
      coordinates: {
        mapValue: {
          fields: {
            lat: { doubleValue: coords.lat },
            lng: { doubleValue: coords.lng },
          },
        },
      },
    },
  });
  await httpsPatch(url, body, token);
}

// ── Coordinate map ────────────────────────────────────────────
// Keys match the `name` field stored in Firestore authority docs.

const CITY_COORDINATES: Record<string, { lat: number; lng: number }> = {
  // ─── Cities ───────────────────────────────────────────────
  'ירושלים':              { lat: 31.7683, lng: 35.2137 },
  'תל אביב-יפו':          { lat: 32.0853, lng: 34.7818 },
  'תל אביב':              { lat: 32.0853, lng: 34.7818 },
  'חיפה':                 { lat: 32.7940, lng: 34.9896 },
  'ראשון לציון':           { lat: 31.9730, lng: 34.7925 },
  'פתח תקווה':             { lat: 32.0841, lng: 34.8878 },
  'אשדוד':                { lat: 31.8044, lng: 34.6553 },
  'נתניה':                { lat: 32.3226, lng: 34.8533 },
  'באר שבע':              { lat: 31.2518, lng: 34.7913 },
  'חולון':                { lat: 32.0108, lng: 34.7799 },
  'בני ברק':              { lat: 32.0838, lng: 34.8339 },
  'רמת גן':               { lat: 32.0707, lng: 34.8238 },
  'אשקלון':               { lat: 31.6688, lng: 34.5743 },
  'רחובות':               { lat: 31.8928, lng: 34.8113 },
  'בת ים':                { lat: 32.0233, lng: 34.7503 },
  'בית שמש':              { lat: 31.7469, lng: 34.9908 },
  'כפר סבא':              { lat: 32.1789, lng: 34.9077 },
  'הרצליה':               { lat: 32.1663, lng: 34.8439 },
  'חדרה':                 { lat: 32.4369, lng: 34.9189 },
  'מודיעין-מכבים-רעות':   { lat: 31.8966, lng: 35.0091 },
  'מודיעין':              { lat: 31.8966, lng: 35.0091 },
  'לוד':                  { lat: 31.9516, lng: 34.8953 },
  'רעננה':                { lat: 32.1840, lng: 34.8706 },
  'רמלה':                 { lat: 31.9295, lng: 34.8745 },
  'ראש העין':              { lat: 32.0963, lng: 34.9578 },
  'הוד השרון':             { lat: 32.1531, lng: 34.8960 },
  'קרית גת':              { lat: 31.6100, lng: 34.7642 },
  'נהריה':                { lat: 33.0053, lng: 35.0950 },
  'עפולה':                { lat: 32.6079, lng: 35.2893 },
  'קרית אתא':             { lat: 32.8129, lng: 35.1138 },
  'יבנה':                 { lat: 31.8794, lng: 34.7432 },
  'אילת':                 { lat: 29.5577, lng: 34.9519 },
  'נס ציונה':              { lat: 31.9267, lng: 34.7982 },
  'שדרות':                { lat: 31.5245, lng: 34.5966 },
  'אופקים':               { lat: 31.3120, lng: 34.6220 },
  'נתיבות':               { lat: 31.4200, lng: 34.5880 },
  'רהט':                  { lat: 31.3926, lng: 34.7543 },
  'נצרת':                 { lat: 32.6996, lng: 35.3035 },
  'אום אל-פחם':           { lat: 32.5229, lng: 35.1526 },
  'טמרה':                 { lat: 32.8607, lng: 35.1991 },
  'סח\'נין':              { lat: 32.8688, lng: 35.3024 }, // ASCII apostrophe fallback
  'סח׳נין':              { lat: 32.8688, lng: 35.3024 }, // Hebrew geresh U+05F3 (Firestore exact)
  'יקנעם עילית':          { lat: 32.6598, lng: 35.1017 },
  'ערד':                  { lat: 31.2562, lng: 35.2135 },
  'דימונה':               { lat: 31.0694, lng: 35.0326 },
  'קרית שמונה':           { lat: 33.2072, lng: 35.5700 },
  'טבריה':                { lat: 32.7940, lng: 35.5307 },
  'צפת':                  { lat: 32.9647, lng: 35.4960 },
  'יוקנעם עילית':          { lat: 32.6567, lng: 35.1073 },
  'גבעת שמואל':           { lat: 32.0789, lng: 34.8495 },
  'מגדל העמק':            { lat: 32.6752, lng: 35.2414 },
  'טירת כרמל':            { lat: 32.7608, lng: 34.9696 },
  'טייבה':                { lat: 32.3588, lng: 34.9987 },
  'אלעד':                 { lat: 32.0534, lng: 34.9511 },
  'ביתר עילית':           { lat: 31.6946, lng: 35.1196 },
  'קרית ים':              { lat: 32.8490, lng: 35.0694 },
  'זכרון יעקב':           { lat: 32.5706, lng: 34.9542 },
  'קרית ביאליק':          { lat: 32.8312, lng: 35.0888 },
  'כפר יונה':             { lat: 32.3170, lng: 34.9379 },
  'כרמיאל':               { lat: 32.9139, lng: 35.2975 },
  'קרית מוצקין':          { lat: 32.8370, lng: 35.0794 },
  'קרית אונו':            { lat: 32.0608, lng: 34.8556 },
  'מכבים':               { lat: 31.8850, lng: 34.9750 },
  'נהריה הירוקה':        { lat: 33.0080, lng: 35.0980 },
  'העיר הוותיקה':        { lat: 31.7767, lng: 35.2297 },
  // ─── Local councils ───────────────────────────────────────
  'גן יבנה':              { lat: 31.7910, lng: 34.7060 },
  'גדרה':                 { lat: 31.8100, lng: 34.7780 },
  'מבשרת ציון':           { lat: 31.8040, lng: 35.1530 },
  'שוהם':                 { lat: 31.9972, lng: 34.9516 },
  'קדימה-צורן':           { lat: 32.2770, lng: 34.9120 },
};

// Doc-ID fallback for names that can't be matched reliably due to
// encoding differences (e.g. Hebrew geresh vs ASCII apostrophe).
const DOC_ID_COORDINATES: Record<string, { lat: number; lng: number }> = {
  'KasrflPQ70BA3YYNxqVG': { lat: 32.8688, lng: 35.3024 }, // סח׳נין
  'Uk7aGIl1VKRq0bVuvq7q': { lat: 32.6598, lng: 35.1017 }, // יקנעם עילית
};

const JERUSALEM_LAT = 31.7683;
const JERUSALEM_LNG = 35.2137;
const TOLERANCE     = 0.0001;

function isJerusalemFallback(coords: { lat: number; lng: number }): boolean {
  return (
    Math.abs(coords.lat - JERUSALEM_LAT) < TOLERANCE &&
    Math.abs(coords.lng - JERUSALEM_LNG) < TOLERANCE
  );
}

async function main(): Promise<void> {
  const idToken = process.env.FIREBASE_ID_TOKEN;
  if (!idToken) {
    console.error('❌  FIREBASE_ID_TOKEN is not set in .env.local');
    console.error('    See instructions at the top of this file.');
    process.exit(1);
  }

  console.log('🔍  Loading authorities collection…');
  const snap = await getDocs(collection(db, 'authorities'));
  console.log(`    Total documents: ${snap.size}\n`);

  let updated  = 0;
  let skipped  = 0;
  const notFound: string[] = [];

  for (const docSnap of snap.docs) {
    const data   = docSnap.data();
    const coords = data.coordinates as { lat: number; lng: number } | undefined;

    // Skip docs that already have real coordinates
    if (!coords || !isJerusalemFallback(coords)) {
      skipped++;
      continue;
    }

    const name      = (data.name ?? '') as string;
    // Doc-ID lookup takes priority to handle encoding mismatches
    const newCoords = DOC_ID_COORDINATES[docSnap.id] ?? CITY_COORDINATES[name];

    if (!newCoords) {
      notFound.push(`${docSnap.id} — "${name}" (type: ${data.type ?? '?'})`);
      continue;
    }

    await patchCoords(docSnap.id, newCoords, idToken);
    updated++;
    console.log(`  ✅  ${name} → ${newCoords.lat}, ${newCoords.lng}`);
  }

  console.log('\n══════════════════════════════════════════════════════');
  console.log(`  ✅  Updated:   ${updated}`);
  console.log(`  ⏭️   Skipped:   ${skipped} (already have real coords)`);
  console.log(`  ⚠️   Not found: ${notFound.length}`);
  console.log('══════════════════════════════════════════════════════');

  if (notFound.length) {
    console.log('\n── Names not in map (manual review) ─────────────────');
    notFound.forEach(s => console.log(' ', s));
    console.log('\nAdd matching entries to CITY_COORDINATES if needed.');
  }
}

main().catch(err => {
  console.error('\n❌  Fatal:', err);
  process.exit(1);
});
