#!/usr/bin/env npx tsx
/**
 * scripts/import-neighborhoods-tier2-gaponly-firestore-fix.ts
 *
 * Firestore coordinate fix for the 11 Tier-2 gap-only cities (Lod, Ra'anana,
 * Ramla, Rosh HaAyin, Hod HaSharon, Kiryat Gat, Nahariya, Afula, Kiryat Ata,
 * Eilat, Nes Ziona), found while auditing existing Firestore `authorities`
 * child docs for the same class of bug caught in Modi'in
 * (import-neighborhoods-modiin-reconcile.ts).
 *
 * FINDING: 10 of 11 cities' existing Firestore docs have broken
 * `coordinates` — either the Jerusalem placeholder (31.7683, 35.2137) or a
 * single identical value shared across every neighborhood in that city
 * (Ra'anana, Afula, Hod HaSharon, Ramla, Lod: all child docs pinned to the
 * exact same point — the live "every neighborhood lands on one spot" bug,
 * baked directly into Firestore data, not just the picker's static file).
 * All values below are the same real GIS/OSM/landmark-sourced coordinates
 * already added to location-constants.ts in this pass.
 *
 * NOT touched: אילת/גנים (ei-ganim) — left with its placeholder value,
 * matching the parked status in location-constants.ts (no confident single
 * coordinate exists — OSM splits it into two ~640m-apart areas).
 *
 * NOT touched: two duplicate EMPTY authority docs found during the audit —
 * קריית גת (HmabG1kdRgrMsHdpHkOj) and קרית אתא (XBKcBcOJameV06NR7DUU), both
 * 0 children, alongside their populated counterparts (lfdFHzo43oS7GN8qRHpM
 * and Sy2VFerWiFXNuddMkVld respectively). Structural duplicate-authority
 * cleanup is out of scope here — flagged for David.
 *
 * Idempotent — matches by (parentAuthorityId, name), updates only the
 * `coordinates` field + `updatedAt`. Safe to re-run.
 *
 * Usage:
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-tier2-gaponly-firestore-fix.ts --dry-run
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-tier2-gaponly-firestore-fix.ts
 */

import * as admin from 'firebase-admin';

const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!rawKey) {
  console.error('❌  FIREBASE_SERVICE_ACCOUNT_KEY not set');
  process.exit(1);
}
const key = JSON.parse(rawKey);
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
}
const db = admin.firestore();

const DRY_RUN = process.argv.includes('--dry-run');

interface CoordFix {
  authorityId: string;
  cityLabel: string;
  name: string;
  lat: number;
  lon: number;
}

const FIXES: CoordFix[] = [
  // ─── רעננה (2P5ALaQsigsGSaijvuHB) ───
  { authorityId: '2P5ALaQsigsGSaijvuHB', cityLabel: 'רעננה', name: 'שכונת 2005', lat: 32.1804272, lon: 34.8586295 },
  { authorityId: '2P5ALaQsigsGSaijvuHB', cityLabel: 'רעננה', name: 'לב הפארק', lat: 32.1930793, lon: 34.8512530 },
  { authorityId: '2P5ALaQsigsGSaijvuHB', cityLabel: 'רעננה', name: 'נווה זמר', lat: 32.1952720, lon: 34.8661562 },
  { authorityId: '2P5ALaQsigsGSaijvuHB', cityLabel: 'רעננה', name: 'מרכז העיר', lat: 32.1798045, lon: 34.8764788 },

  // ─── עפולה (EATz52e1LSFuI7Zb54HM) ───
  { authorityId: 'EATz52e1LSFuI7Zb54HM', cityLabel: 'עפולה', name: 'רובע יזרעאל', lat: 32.6150000, lon: 35.3101000 },
  { authorityId: 'EATz52e1LSFuI7Zb54HM', cityLabel: 'עפולה', name: 'מרכז העיר', lat: 32.6063729, lon: 35.2880813 },
  { authorityId: 'EATz52e1LSFuI7Zb54HM', cityLabel: 'עפולה', name: 'עפולה עילית', lat: 32.6334607, lon: 35.3247177 },
  { authorityId: 'EATz52e1LSFuI7Zb54HM', cityLabel: 'עפולה', name: 'גבעת המורה', lat: 32.6253550, lon: 35.3274969 },

  // ─── נס ציונה (FkpprOJE3RX7AWopI3Gh) ───
  { authorityId: 'FkpprOJE3RX7AWopI3Gh', cityLabel: 'נס ציונה', name: 'ארגמן', lat: 31.9299800, lon: 34.7865341 },
  { authorityId: 'FkpprOJE3RX7AWopI3Gh', cityLabel: 'נס ציונה', name: 'שמורת מליבו', lat: 31.9240436, lon: 34.7831274 },
  { authorityId: 'FkpprOJE3RX7AWopI3Gh', cityLabel: 'נס ציונה', name: 'לב המושבה', lat: 31.9266788, lon: 34.8115544 },

  // ─── הוד השרון (HmYsVbx1GnOGCba3zPiL) ───
  { authorityId: 'HmYsVbx1GnOGCba3zPiL', cityLabel: 'הוד השרון', name: 'הפארק הירוק', lat: 32.1325000, lon: 34.8886111 },
  { authorityId: 'HmYsVbx1GnOGCba3zPiL', cityLabel: 'הוד השרון', name: 'רמתיים', lat: 32.1574803, lon: 34.8854895 },
  { authorityId: 'HmYsVbx1GnOGCba3zPiL', cityLabel: 'הוד השרון', name: 'מגדיאל', lat: 32.1608935, lon: 34.9040760 },
  { authorityId: 'HmYsVbx1GnOGCba3zPiL', cityLabel: 'הוד השרון', name: 'מתחם 1200', lat: 32.1700045, lon: 34.9020123 },

  // ─── קרית אתא (Sy2VFerWiFXNuddMkVld) — the populated doc, not the empty duplicate ───
  { authorityId: 'Sy2VFerWiFXNuddMkVld', cityLabel: 'קרית אתא', name: 'גבעת רם', lat: 32.8005991, lon: 35.1343018 },
  { authorityId: 'Sy2VFerWiFXNuddMkVld', cityLabel: 'קרית אתא', name: 'מרכז העיר', lat: 32.8120000, lon: 35.1147000 },
  { authorityId: 'Sy2VFerWiFXNuddMkVld', cityLabel: 'קרית אתא', name: 'גבעת טל', lat: 32.8066398, lon: 35.1388184 },

  // ─── ראש העין (f3PMiSHCMNejf4xvdmHT) ───
  { authorityId: 'f3PMiSHCMNejf4xvdmHT', cityLabel: 'ראש העין', name: 'פסגות אפק', lat: 32.0876738, lon: 34.9710220 },
  { authorityId: 'f3PMiSHCMNejf4xvdmHT', cityLabel: 'ראש העין', name: 'נווה אפק', lat: 32.0964470, lon: 34.9766380 },
  { authorityId: 'f3PMiSHCMNejf4xvdmHT', cityLabel: 'ראש העין', name: 'גבעת טל', lat: 32.0961997, lon: 34.9621599 },
  { authorityId: 'f3PMiSHCMNejf4xvdmHT', cityLabel: 'ראש העין', name: 'העיר הוותיקה', lat: 32.0936797, lon: 34.9571607 },

  // ─── נהריה (k3dBx2Ml6xhiH5mIO6e1) ───
  { authorityId: 'k3dBx2Ml6xhiH5mIO6e1', cityLabel: 'נהריה', name: 'מרכז העיר', lat: 33.0049493, lon: 35.0988288 },
  { authorityId: 'k3dBx2Ml6xhiH5mIO6e1', cityLabel: 'נהריה', name: 'נהריה הירוקה', lat: 33.0064819, lon: 35.1091779 },
  { authorityId: 'k3dBx2Ml6xhiH5mIO6e1', cityLabel: 'נהריה', name: 'עין שרה', lat: 32.9925530, lon: 35.0950523 },

  // ─── קרית גת (lfdFHzo43oS7GN8qRHpM) — the populated doc, not the empty duplicate ───
  { authorityId: 'lfdFHzo43oS7GN8qRHpM', cityLabel: 'קרית גת', name: 'כרמי גת', lat: 31.6290203, lon: 34.7724283 },

  // ─── רמלה (nl0pyUe31vU4tZKZgoNP) ───
  { authorityId: 'nl0pyUe31vU4tZKZgoNP', cityLabel: 'רמלה', name: 'קרית האומנים', lat: 31.9168763, lon: 34.8709461 },
  { authorityId: 'nl0pyUe31vU4tZKZgoNP', cityLabel: 'רמלה', name: 'נאות שמיר', lat: 31.9305826, lon: 34.8495711 },
  { authorityId: 'nl0pyUe31vU4tZKZgoNP', cityLabel: 'רמלה', name: 'מרכז העיר', lat: 31.9314905, lon: 34.8686640 },

  // ─── לוד (qWF0GzsDubBFAauycGzM) ───
  { authorityId: 'qWF0GzsDubBFAauycGzM', cityLabel: 'לוד', name: 'מרכז העיר', lat: 31.9555870, lon: 34.8963330 },
  { authorityId: 'qWF0GzsDubBFAauycGzM', cityLabel: 'לוד', name: 'גני אביב', lat: 31.9593257, lon: 34.8812522 },
  { authorityId: 'qWF0GzsDubBFAauycGzM', cityLabel: 'לוד', name: 'גני יער', lat: 31.9452721, lon: 34.9038083 },
  { authorityId: 'qWF0GzsDubBFAauycGzM', cityLabel: 'לוד', name: 'נווה זית', lat: 31.9464799, lon: 34.8841361 },

  // ─── אילת (t9OykBnyxxCAvfMdViKZ) — גנים intentionally excluded, still parked ───
  { authorityId: 't9OykBnyxxCAvfMdViKZ', cityLabel: 'אילת', name: 'שחמון', lat: 29.5475669, lon: 34.9357898 },
  { authorityId: 't9OykBnyxxCAvfMdViKZ', cityLabel: 'אילת', name: 'ערבה', lat: 29.5616661, lon: 34.9441794 },
];

async function main() {
  console.log(`── ${DRY_RUN ? 'DRY RUN — ' : ''}Tier-2 gap-only Firestore coordinate fix: ${FIXES.length} docs across 10 cities ──`);

  let fixed = 0;
  let notFound = 0;

  for (const fix of FIXES) {
    const snap = await db.collection('authorities')
      .where('parentAuthorityId', '==', fix.authorityId)
      .where('name', '==', fix.name)
      .limit(1)
      .get();

    if (snap.empty) {
      console.log(`⚠️  NOT FOUND: [${fix.cityLabel}] ${fix.name}`);
      notFound++;
      continue;
    }

    const doc = snap.docs[0];
    if (DRY_RUN) {
      const before = doc.data().coordinates;
      console.log(`  WOULD FIX: [${fix.cityLabel}] ${fix.name} — ${before?.lat},${before?.lng} → ${fix.lat},${fix.lon}`);
    } else {
      await doc.ref.update({
        coordinates: { lat: fix.lat, lng: fix.lon },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`✓  FIXED: [${fix.cityLabel}] ${fix.name}`);
    }
    fixed++;
  }

  console.log(`\n${DRY_RUN ? 'Would fix' : 'Fixed'}: ${fixed}, Not found: ${notFound}`);
}

main().catch((err) => {
  console.error('💥', err);
  process.exit(1);
});
