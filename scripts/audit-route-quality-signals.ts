/**
 * scripts/audit-route-quality-signals.ts — STAGE 1 of the quality-certificate
 * v1 (surface composition + lighting). READ-ONLY: fetches all official_routes
 * + curated_routes, computes both signals per route via the pure classifiers
 * in scripts/lib/route-composition-classify.ts and
 * scripts/lib/route-lighting-classify.ts, and prints a report. Writes NOTHING
 * to Firestore — no --apply flag exists on this script by design; persistence
 * is Stage 2, a separate script, gated on explicit approval.
 *
 * Per-city bbox is derived from the union of that city's OWN route paths
 * (+ margin), not from geo-discovery-routes.ts's REGIONS table — REGIONS
 * only covers 3 of the 5 cities that actually have routes (confirmed live:
 * misses שדרות and תל אביב-יפו entirely), so deriving from data keeps this
 * script correct regardless of REGIONS' coverage.
 *
 * Usage: npx tsx scripts/audit-route-quality-signals.ts
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';
import { LampPoint, buildLampGrid, classifyLighting } from './lib/route-lighting-classify';
import { overpass, deriveCityBbox, fetchCityWayGrid, computeCityComposition } from './lib/route-quality-osm-fetch.node';

function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}

interface RouteDoc { id: string; collection: string; name: string; city: string; distance: number; path: [number, number][]; activityType?: string; routeShape?: string; }

async function main() {
  const db = initFb();

  console.log('Fetching all official_routes + curated_routes …');
  const [officialSnap, curatedSnap] = await Promise.all([
    db.collection('official_routes').get(),
    db.collection('curated_routes').get(),
  ]);
  const routes: RouteDoc[] = [];
  for (const [snap, coll] of [[officialSnap, 'official_routes'], [curatedSnap, 'curated_routes']] as const) {
    for (const d of snap.docs) {
      const data: any = d.data();
      const path: [number, number][] = Array.isArray(data.path) ? data.path.map((p: any) => [Number(p.lat), Number(p.lng)]) : [];
      routes.push({ id: d.id, collection: coll, name: data.name || '(unnamed)', city: data.city || '(none)', distance: data.distance, path, activityType: data.activityType, routeShape: data.routeShape });
    }
  }
  console.log(`Loaded ${routes.length} total routes (${officialSnap.size} official + ${curatedSnap.size} curated).\n`);

  const byCity = new Map<string, RouteDoc[]>();
  for (const r of routes) {
    if (!byCity.has(r.city)) byCity.set(r.city, []);
    byCity.get(r.city)!.push(r);
  }

  type ComputedRow = {
    id: string; collection: string; name: string; city: string; distance: number;
    sidewalkPct: number; genuinePct: number; ordinaryPct: number; otherPct: number; unmatchedPct: number;
    lighting: { status: string; litCoveragePct: number | null; isLit: boolean | null };
    skipped?: string;
  };
  const allRows: ComputedRow[] = [];
  const cityStats: Array<{ city: string; count: number; wayCount: number; lampCount: number; skipped: number }> = [];

  for (const [city, cityRoutes] of Array.from(byCity.entries())) {
    console.log(`\n=== ${city} (${cityRoutes.length} routes) ===`);
    const validRoutes = cityRoutes.filter(r => r.path.length >= 2);
    const skippedNoPath = cityRoutes.length - validRoutes.length;
    if (validRoutes.length === 0) {
      console.log(`  No routes with a usable path — skipping.`);
      for (const r of cityRoutes) allRows.push({ id: r.id, collection: r.collection, name: r.name, city, distance: r.distance, sidewalkPct: 0, genuinePct: 0, ordinaryPct: 0, otherPct: 0, unmatchedPct: 0, lighting: { status: 'unknown' as const, litCoveragePct: null, isLit: null }, skipped: 'no usable path (<2 points)' });
      cityStats.push({ city, count: cityRoutes.length, wayCount: 0, lampCount: 0, skipped: cityRoutes.length });
      continue;
    }

    const { bboxStr } = deriveCityBbox(validRoutes.map(r => r.path));
    console.log(`  bbox (derived from ${validRoutes.length} route paths + margin): ${bboxStr}`);

    console.log(`  Fetching highway ways …`);
    const grid = await fetchCityWayGrid(bboxStr);
    console.log(`  ${grid.wayCount} ways fetched (${grid.roadWayCount} road-category for sidewalk-parallel check).`);

    console.log(`  Fetching street_lamp nodes …`);
    const lampData = await overpass(`[out:json][timeout:180];node["highway"="street_lamp"](${bboxStr});out;`);
    const lamps: LampPoint[] = (lampData.elements || []).filter((e: any) => e.type === 'node').map((e: any) => ({ lat: e.lat, lng: e.lon }));
    console.log(`  ${lamps.length} street_lamp nodes fetched.`);
    const lampGrid = buildLampGrid(lamps);
    const cityHasLampData = lamps.length > 0;

    const compositionByRouteId = computeCityComposition(validRoutes.map(r => ({ id: r.id, path: r.path })), grid);
    for (const r of validRoutes) {
      const comp = compositionByRouteId.get(r.id)!;
      const lighting = classifyLighting(r.path, lampGrid, cityHasLampData);
      allRows.push({
        id: r.id, collection: r.collection, name: r.name, city, distance: r.distance,
        sidewalkPct: comp.sidewalkPct, genuinePct: comp.genuinePct, ordinaryPct: comp.ordinaryPct, otherPct: comp.otherPct, unmatchedPct: comp.unmatchedPct,
        lighting,
      });
    }
    for (const r of cityRoutes.filter((x: RouteDoc) => x.path.length < 2)) {
      allRows.push({ id: r.id, collection: r.collection, name: r.name, city, distance: r.distance, sidewalkPct: 0, genuinePct: 0, ordinaryPct: 0, otherPct: 0, unmatchedPct: 0, lighting: { status: 'unknown', litCoveragePct: null, isLit: null }, skipped: 'no usable path (<2 points)' });
    }
    cityStats.push({ city, count: cityRoutes.length, wayCount: grid.wayCount, lampCount: lamps.length, skipped: skippedNoPath });
  }

  require('fs').writeFileSync('/tmp/quality-cert-stage1-results.json', JSON.stringify(allRows, null, 2));

  console.log('\n\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  PER-CITY DISTRIBUTION                                      ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  for (const stat of cityStats) {
    const rows = allRows.filter(r => r.city === stat.city && !r.skipped);
    const avg = (f: (r: ComputedRow) => number) => rows.length ? Math.round((rows.reduce((s, r) => s + f(r), 0) / rows.length) * 10) / 10 : 0;
    const litCount = rows.filter(r => r.lighting.isLit === true).length;
    const unlitCount = rows.filter(r => r.lighting.isLit === false).length;
    const unknownCount = rows.filter(r => r.lighting.status === 'unknown').length;
    console.log(`\n${stat.city} — ${stat.count} routes (${stat.skipped} skipped, ${stat.wayCount} ways fetched, ${stat.lampCount} lamp nodes fetched)`);
    console.log(`  Composition avg: sidewalk=${avg(r => r.sidewalkPct)}%  dedicated=${avg(r => r.genuinePct)}%  ordinary=${avg(r => r.ordinaryPct)}%  other/unmatched=${avg(r => r.otherPct + r.unmatchedPct)}%`);
    console.log(`  Lighting: lit=${litCount}  unlit=${unlitCount}  unknown=${unknownCount}`);
  }

  console.log('\n\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  SAMPLE (plausibility check)                                ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  const computable = allRows.filter(r => !r.skipped);
  const sampleSize = Math.min(10, computable.length);
  const step = Math.max(1, Math.floor(computable.length / sampleSize));
  const sample: ComputedRow[] = [];
  for (let i = 0; i < computable.length && sample.length < sampleSize; i += step) sample.push(computable[i]);
  for (const r of sample) {
    console.log(`\n[${r.collection}/${r.id}] "${r.name}" (${r.city}, ${r.distance}km)`);
    console.log(`  sidewalk=${r.sidewalkPct}%  dedicated=${r.genuinePct}%  ordinary=${r.ordinaryPct}%  other=${r.otherPct}%  unmatched=${r.unmatchedPct}%`);
    console.log(`  lighting: ${r.lighting.status}` + (r.lighting.status === 'computed' ? ` — coverage=${r.lighting.litCoveragePct}% isLit=${r.lighting.isLit}` : ' (no OSM lamp data in this city)'));
  }

  console.log('\n\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  UN-COMPUTABLE ROUTES                                       ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  const skipped = allRows.filter(r => r.skipped);
  if (skipped.length === 0) console.log('  (none — every route had a usable path)');
  else for (const r of skipped) console.log(`  [${r.collection}/${r.id}] "${r.name}" (${r.city}) — ${r.skipped}`);

  console.log('\n=== COMPLETE — read-only, no Firestore writes ===');
}
main().then(() => process.exit(0)).catch(e => { console.error('FATAL:', e); process.exit(1); });
