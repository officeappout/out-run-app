/**
 * READ-ONLY investigation. Tests two candidate bbox-derivation approaches
 * for the 3 known-drifted Haifa routes against the classifier UNCHANGED
 * (route-composition-classify.ts), comparing to the triage script's known-
 * correct values and the currently-persisted (buggy, tight-bbox) values.
 *
 * Approach A: REGION.bbox (discovery-wiring's existing approach — a real,
 * hand-set full-city box, byte-identical to the triage script's own
 * HAIFA_BBOX for Haifa).
 * Approach B: deriveCityBbox() with a much wider margin (3km instead of
 * 550m) — tests whether a simple margin increase, with NO dependency on
 * REGIONS coverage, gets equally close. Matters because REGIONS has no
 * entry for Sderot/Tel Aviv-Yafo at all.
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';
import { fetchCityWayGrid, computeCityComposition } from './lib/route-quality-osm-fetch.node';

function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}

const HAIFA_REGION_BBOX = { latMin: 32.734, lonMin: 34.9296, latMax: 32.854, lonMax: 35.0496 };
const TARGET_IDS = ['6UiFYXMDxNo0bN5HvnxY', 'w9w374yTMFfdjWtd44s0', 'mDjtNChRBdWavQH0d9tk']; // הדר הכרמל, לואי, אריה גוראל
const KNOWN = {
  '6UiFYXMDxNo0bN5HvnxY': { name: 'שביל חיפה - הדר הכרמל', triage: 68.3, persisted: 4.4 },
  'w9w374yTMFfdjWtd44s0': { name: 'טיילת לואי', triage: 48.7, persisted: 0.3 },
  'mDjtNChRBdWavQH0d9tk': { name: 'טיילת אריה גוראל', triage: 82.1, persisted: 48.2 },
};

async function main() {
  const db = initFb();

  const targetDocs: Array<{ id: string; path: [number, number][] }> = [];
  for (const id of TARGET_IDS) {
    const doc = await db.collection('official_routes').doc(id).get();
    targetDocs.push({ id, path: doc.data()!.path.map((p: any) => [Number(p.lat), Number(p.lng)]) });
  }

  const allHaifaSnap = await db.collection('official_routes').where('city', '==', 'חיפה').get();
  const allPaths: [number, number][][] = allHaifaSnap.docs.map((d) => (d.data().path || []).map((p: any) => [Number(p.lat), Number(p.lng)]));

  console.log('=== Approach A: REGION.bbox (discovery-wiring\'s existing approach) ===');
  const bboxA = `${HAIFA_REGION_BBOX.latMin},${HAIFA_REGION_BBOX.lonMin},${HAIFA_REGION_BBOX.latMax},${HAIFA_REGION_BBOX.lonMax}`;
  console.log(`bbox: ${bboxA}`);
  const gridA = await fetchCityWayGrid(bboxA);
  console.log(`${gridA.wayCount} ways fetched (${gridA.roadWayCount} road-category).`);
  const compA = computeCityComposition(targetDocs, gridA);
  for (const t of targetDocs) {
    const c = compA.get(t.id)!;
    const k = (KNOWN as any)[t.id];
    console.log(`  [${t.id}] "${k.name}": genuine=${c.genuinePct}%  (triage=${k.triage}%, persisted=${k.persisted}%, diff-vs-triage=${Math.round((c.genuinePct - k.triage) * 10) / 10}pp)`);
  }

  console.log('\n=== Approach B: deriveCityBbox() with a 3km margin (no REGIONS dependency) ===');
  const WIDE_MARGIN_DEG = 0.03; // ~3.3km
  let latMin = Infinity, latMax = -Infinity, lonMin = Infinity, lonMax = -Infinity;
  for (const path of allPaths) for (const [lat, lng] of path) {
    latMin = Math.min(latMin, lat); latMax = Math.max(latMax, lat);
    lonMin = Math.min(lonMin, lng); lonMax = Math.max(lonMax, lng);
  }
  latMin -= WIDE_MARGIN_DEG; latMax += WIDE_MARGIN_DEG; lonMin -= WIDE_MARGIN_DEG; lonMax += WIDE_MARGIN_DEG;
  const bboxB = `${latMin},${lonMin},${latMax},${lonMax}`;
  console.log(`bbox: ${bboxB}`);
  const gridB = await fetchCityWayGrid(bboxB);
  console.log(`${gridB.wayCount} ways fetched (${gridB.roadWayCount} road-category).`);
  const compB = computeCityComposition(targetDocs, gridB);
  for (const t of targetDocs) {
    const c = compB.get(t.id)!;
    const k = (KNOWN as any)[t.id];
    console.log(`  [${t.id}] "${k.name}": genuine=${c.genuinePct}%  (triage=${k.triage}%, persisted=${k.persisted}%, diff-vs-triage=${Math.round((c.genuinePct - k.triage) * 10) / 10}pp)`);
  }

  console.log('\n=== Summary ===');
  console.log('Route | Persisted (buggy) | Triage (known-correct) | Approach A (REGION.bbox) | Approach B (wide-margin)');
  for (const t of targetDocs) {
    const k = (KNOWN as any)[t.id];
    console.log(`${k.name} | ${k.persisted}% | ${k.triage}% | ${compA.get(t.id)!.genuinePct}% | ${compB.get(t.id)!.genuinePct}%`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error('FATAL:', e); process.exit(1); });
