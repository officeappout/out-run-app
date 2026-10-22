/**
 * scripts/routes-nationwide/park-loops.ts — NATIONWIDE-PLAN.md W5 (offline).
 * Loops around BIG parks (owner: Sportek, Park HaYarkon — not fitness parks)
 * for one authority, from the local Geofabrik PBF. DRY-RUN ONLY in this wave:
 * it prints and saves the proposed loops (summary.json + loops.geojson);
 * writing them is the nationwide runner's job (its park_loops stage), which
 * goes through buildValidatedDoc + create-only like every other source.
 *
 *   npx tsx scripts/routes-nationwide/park-loops.ts --relation=<OSM admin relation id> [--authority=<id>] [--city=<name>]
 *   … --anchors="פארק הירקון,ספורטק"   # calibration: report whether each anchor park got a loop
 *
 * Sources per park, in order: an existing route that already circles it
 * (known, read-only from official_routes when --authority is given) → the
 * boundary walked on real paths (perimeter) → GraphHopper via-points inside
 * (inner; needs GRAPHHOPPER_URL + invoker key — otherwise reported blocked).
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as fs from 'fs';
import * as path from 'path';
import { buildPathIndex, loopsForPark, parkLoopDoc, pointInRing, selectBigParks, type LngLat } from '../../src/lib/park-loops';
import { buildValidatedDoc } from '../../src/lib/route-collections/validate';
import { assertOsmium, ensureIsraelPbf, extractPilot, fetchAdminBoundary, pbfTimestamp } from '../trails/lib/pilot-osm.node';
import { PRODUCTION_PROJECT, flagValue, listOfficialRoutesPage, openTarget } from '../trails/lib/trails-apply.node';
import { ghViaRouterFromEnv } from './lib/gh-via-router.node';
import { fitnessStations, walkableLines } from './lib/authority-osm.node';

const argv = process.argv.slice(2);
const RELATION = Number(flagValue(argv, 'relation') ?? 0);
const AUTHORITY = flagValue(argv, 'authority');
const CITY = flagValue(argv, 'city') ?? '';
const ANCHORS = (flagValue(argv, 'anchors') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const OUT = flagValue(argv, 'out') ?? path.join('scripts', 'output', `park-loops-${RELATION}-${new Date().toISOString().slice(0, 10)}`);

async function main() {
  if (!RELATION) throw new Error('usage: --relation=<OSM admin_level relation id> [--authority=<id> --city=<name>] [--anchors="a,b"]');
  assertOsmium();
  const pbf = await ensureIsraelPbf();
  const work = path.join(OUT, 'work');
  fs.mkdirSync(work, { recursive: true });
  const boundary = await fetchAdminBoundary(pbf, RELATION, work);
  const bRings = ((boundary.geometry.type === 'Polygon' ? [boundary.geometry.coordinates] : boundary.geometry.coordinates) as LngLat[][][]).map((p) => p[0]);
  const all = bRings.flat();
  const m = 0.01;
  const bbox = { minLng: Math.min(...all.map((p) => p[0])) - m, minLat: Math.min(...all.map((p) => p[1])) - m, maxLng: Math.max(...all.map((p) => p[0])) + m, maxLat: Math.max(...all.map((p) => p[1])) + m };
  const ex = await extractPilot(pbf, bbox, work);
  const name = CITY || boundary.tags['name:he'] || boundary.tags.name || String(RELATION);
  console.log(`AREA: ${name} (relation ${RELATION}) · OSM ${pbfTimestamp(pbf) ?? '?'}`);

  // Parks whose (first) outer ring centre lies inside the authority boundary.
  const sel = selectBigParks(ex.areas as any);
  const parks = sel.parks.filter((p) => {
    const r = p.rings[0];
    const c: LngLat = [r.reduce((s, q) => s + q[0], 0) / r.length, r.reduce((s, q) => s + q[1], 0) / r.length];
    return bRings.some((br) => pointInRing(c, br));
  });
  console.log(`parks: ${sel.considered} named park polygons (after same-name merge) → ${sel.parks.length} big → ${parks.length} inside the boundary`);

  const lines = walkableLines(ex);
  const paths = buildPathIndex(lines);
  const fitness = fitnessStations(path.join(work, 'pilot.osm.pbf'), work);
  console.log(`walkable ways: ${lines.length} · fitness stations: ${fitness.length}`);

  let existing: Array<{ id: string; name: string; coords: LngLat[] }> = [];
  let known = new Set<string>();
  if (AUTHORITY) {
    const target = await openTarget(PRODUCTION_PROJECT);
    // All routes, not only this authority's: some cities' routes carry no authorityId
    // (Tel Aviv's pilot routes, e.g. "הקפת פארק המסילה"). The park geometry decides.
    console.log('TARGET (read-only): official_routes (name + path), for known loops');
    let after: string | null = null;
    for (;;) {
      const page = await listOfficialRoutesPage(target.db, { afterId: after, pageSize: 500, authorityId: null });
      for (const r of page) {
        const raw = Array.isArray(r.data?.path) ? (r.data.path as any[]) : [];
        existing.push({ id: r.id, name: String(r.data?.name ?? ''), coords: raw.map((p) => (Array.isArray(p) ? [p[0], p[1]] : [p.lng, p.lat]) as LngLat) });
      }
      if (page.length < 500) break;
      after = page[page.length - 1].id;
    }
    known = new Set([AUTHORITY]);
    console.log(`existing routes: ${existing.length}`);
  }

  const router = ghViaRouterFromEnv();
  console.log(`GraphHopper: ${router ? 'configured' : 'NOT configured — inner loops blocked (needs GRAPHHOPPER_URL + invoker key / GH deploy)'}`);

  const results = [];
  const docs: Array<{ id: string; name: string; km: number; kind: string; park: string; fitnessStops: number; valid: string }> = [];
  const features: unknown[] = [];
  for (const park of parks) {
    const r = await loopsForPark(park, { paths, existing, fitness, router });
    results.push({ park: { id: park.id, name: park.name, areaDunam: Math.round(park.areaM2 / 1000), perimeterKm: Math.round(park.perimeterM / 100) / 10 }, loops: r.loops.map((l) => ({ kind: l.kind, km: Math.round(l.lengthM / 100) / 10, evidence: l.evidence, fitnessStops: l.fitnessStops.length })), notes: r.notes });
    console.log(`  ${park.name} (${Math.round(park.areaM2 / 1000)} dunam): ${r.loops.map((l) => `${l.kind} ${(l.lengthM / 1000).toFixed(1)} km${l.fitnessStops.length ? ` +${l.fitnessStops.length} fitness` : ''}`).join(', ') || '—'}${r.notes.length ? `  [${r.notes.join(' · ')}]` : ''}`);
    for (const l of r.loops) {
      features.push({ type: 'Feature', properties: { park: park.name, kind: l.kind }, geometry: { type: 'LineString', coordinates: l.coords } });
      if (l.kind === 'known') continue;
      const d = parkLoopDoc(l, { authorityId: AUTHORITY ?? 'unresolved', city: name, osmSnapshot: pbfTimestamp(pbf), importBatchId: `park-loops-${RELATION}` });
      let valid = 'not checked (no --authority)';
      if (AUTHORITY) {
        try { buildValidatedDoc('official_routes', d.data, { mode: 'create', knownAuthorityIds: known }); valid = 'ok'; } catch (e) { valid = (e as Error).message; }
      }
      docs.push({ id: d.id, name: String(d.data.name), km: Number(d.data.distance), kind: l.kind, park: park.name, fitnessStops: l.fitnessStops.length, valid });
    }
  }
  if (ANCHORS.length) {
    console.log('\nCalibration anchors:');
    for (const a of ANCHORS) {
      const hit = results.find((x) => x.park.name.includes(a));
      console.log(`  ${a}: ${hit ? `${hit.park.name} — ${hit.loops.length ? hit.loops.map((l) => `${l.kind} ${l.km} km`).join(', ') : `no loop (${hit.notes.join(' · ')})`}` : 'not selected as a big park (check name / size)'}`);
    }
  }
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ area: name, relation: RELATION, parks: results, proposedDocs: docs }, null, 2));
  fs.writeFileSync(path.join(OUT, 'loops.geojson'), JSON.stringify({ type: 'FeatureCollection', features }));
  console.log(`\nproposed new loops: ${docs.length} · summary: ${path.join(OUT, 'summary.json')} · map: loops.geojson\nDry run only — nothing written.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
