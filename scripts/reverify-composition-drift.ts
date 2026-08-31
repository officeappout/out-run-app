/**
 * scripts/reverify-composition-drift.ts — READ-ONLY (no writes; ends with a
 * dry-run diff only). Re-verifies qualitySignals.composition for the 3
 * Haifa routes whose persisted values disagreed sharply (>15pp genuinePct)
 * with a fresh triage recompute (scripts/_haifa-full-triage.ts,
 * 31.08.2026): שביל חיפה - הדר הכרמל, טיילת לואי, טיילת אריה גוראל.
 *
 * Tests David's own hypothesis (Overpass mirror variance on stitched
 * routes) empirically: fetches the SAME city-wide way grid (identical bbox
 * derivation to the original backfill — scripts/lib/route-quality-osm-
 * fetch.node.ts's deriveCityBbox/fetchCityWayGrid, NOT the triage script's
 * separate hand-set bbox) THREE separate times, each a full independent
 * Overpass round-trip through the mirror/retry list, and compares the 3
 * runs' composition results for just these 3 routes. If the 3 runs agree
 * closely with each other, the persisted value's drift is NOT explained by
 * run-to-run mirror noise (points to a different cause — e.g. real OSM
 * data change since the original backfill, or a systematic bbox-scoping
 * difference vs. the triage's own wider hand-set bbox). If the 3 runs
 * disagree with EACH OTHER, that confirms genuine mirror-to-mirror
 * variance for these specific (stitched/complex) routes.
 *
 * Picks the run with the LOWEST combined otherPct+unmatchedPct (highest
 * way-match coverage) per route as the "most complete" result, per
 * David's "stable/higher-coverage" instruction — then prints a before
 * (persisted) / after (proposed) diff. Writes NOTHING.
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';
import { deriveCityBbox, fetchCityWayGrid, computeCityComposition } from './lib/route-quality-osm-fetch.node';

function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}

const TARGET_IDS = ['6UiFYXMDxNo0bN5HvnxY', 'w9w374yTMFfdjWtd44s0', 'mDjtNChRBdWavQH0d9tk']; // הדר הכרמל, לואי, אריה גוראל
const NUM_RUNS = 3;

async function main() {
  const db = initFb();
  console.log('=== Composition drift re-verification — READ-ONLY, no writes ===\n');

  const targets: Array<{ id: string; name: string; path: [number, number][]; persisted: any }> = [];
  for (const id of TARGET_IDS) {
    const doc = await db.collection('official_routes').doc(id).get();
    const data = doc.data()!;
    targets.push({
      id, name: data.name,
      path: data.path.map((p: any) => [Number(p.lat), Number(p.lng)]),
      persisted: data.qualitySignals?.composition,
    });
  }

  // Same bbox derivation the original composition backfill used — needs
  // ALL 77 Haifa routes' paths (not just the 3 targets) to reproduce the
  // exact same fetch scope, since the bbox is a union over the whole city.
  const allHaifaSnap = await db.collection('official_routes').where('city', '==', 'חיפה').get();
  const allPaths: [number, number][][] = allHaifaSnap.docs.map((d) => (d.data().path || []).map((p: any) => [Number(p.lat), Number(p.lng)]));
  const { bboxStr } = deriveCityBbox(allPaths);
  console.log(`bbox (same derivation as the original backfill): ${bboxStr}\n`);

  const runs: Array<Map<string, { sidewalkPct: number; genuinePct: number; ordinaryPct: number; otherPct: number; unmatchedPct: number; wayCount: number }>> = [];

  for (let run = 1; run <= NUM_RUNS; run++) {
    console.log(`--- Run ${run}/${NUM_RUNS}: fetching city-wide way grid ---`);
    const grid = await fetchCityWayGrid(bboxStr);
    console.log(`  ${grid.wayCount} ways fetched (${grid.roadWayCount} road-category).`);
    const comp = computeCityComposition(targets.map((t) => ({ id: t.id, path: t.path })), grid);
    const runResult = new Map<string, { sidewalkPct: number; genuinePct: number; ordinaryPct: number; otherPct: number; unmatchedPct: number; wayCount: number }>();
    for (const t of targets) {
      const c = comp.get(t.id)!;
      runResult.set(t.id, { sidewalkPct: c.sidewalkPct, genuinePct: c.genuinePct, ordinaryPct: c.ordinaryPct, otherPct: c.otherPct, unmatchedPct: c.unmatchedPct, wayCount: grid.wayCount });
      console.log(`  [${t.id}] "${t.name}": sidewalk=${c.sidewalkPct}% genuine=${c.genuinePct}% ordinary=${c.ordinaryPct}% other=${c.otherPct}% unmatched=${c.unmatchedPct}%`);
    }
    runs.push(runResult);
    console.log('');
  }

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  STABILITY ACROSS RUNS                                       ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  for (const t of targets) {
    const values = runs.map((r) => r.get(t.id)!);
    const genuineSpread = Math.max(...values.map((v) => v.genuinePct)) - Math.min(...values.map((v) => v.genuinePct));
    console.log(`\n[${t.id}] "${t.name}"`);
    console.log(`  way counts across runs: ${values.map((v) => v.wayCount).join(', ')}`);
    console.log(`  genuinePct across runs: ${values.map((v) => v.genuinePct + '%').join(', ')}  (spread: ${Math.round(genuineSpread * 10) / 10}pp)`);
    console.log(`  ${genuineSpread <= 5 ? 'STABLE across re-runs — drift is NOT run-to-run mirror noise.' : 'UNSTABLE across re-runs — consistent with mirror-to-mirror variance.'}`);
  }

  console.log('\n\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  PROPOSED CORRECTION (dry-run — NOT applied)                ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  for (const t of targets) {
    const values = runs.map((r) => r.get(t.id)!);
    // "Higher-coverage" = lowest other+unmatched, i.e. most of the route's length got matched to a real way.
    const best = values.reduce((a, b) => (a.otherPct + a.unmatchedPct <= b.otherPct + b.unmatchedPct ? a : b));
    const bestRunIndex = values.indexOf(best) + 1;
    console.log(`\n[${t.id}] "${t.name}"`);
    console.log(`  PERSISTED (current):  sidewalk=${t.persisted.sidewalkPct}%  genuine=${t.persisted.genuinePct}%  ordinary=${t.persisted.ordinaryPct}%  other=${t.persisted.otherPct}%`);
    console.log(`  PROPOSED (run ${bestRunIndex}, most complete — ${Math.round((100 - best.otherPct - best.unmatchedPct) * 10) / 10}% matched): sidewalk=${best.sidewalkPct}%  genuine=${best.genuinePct}%  ordinary=${best.ordinaryPct}%  other=${Math.round((best.otherPct + best.unmatchedPct) * 10) / 10}%`);
    console.log(`  Change: genuinePct ${t.persisted.genuinePct}% -> ${best.genuinePct}% (${best.genuinePct > t.persisted.genuinePct ? '+' : ''}${Math.round((best.genuinePct - t.persisted.genuinePct) * 10) / 10}pp)`);
  }

  console.log('\n=== COMPLETE — read-only, nothing written. Re-run with an --apply script only after explicit review. ===');
}

main().then(() => process.exit(0)).catch((e) => { console.error('FATAL:', e); process.exit(1); });
