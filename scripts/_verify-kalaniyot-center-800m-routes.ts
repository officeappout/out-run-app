/**
 * David's 3-part read-only check (22.09.2026, field-test doc 28): every
 * published route within 800m of the Kalaniyot center point, the EXACT
 * distance metric resolveRouteStopsBackbone uses, and which route wins
 * today for a resident standing at the start sign.
 *
 * READ-ONLY. No writes. Run: npx tsx scripts/_verify-kalaniyot-center-800m-routes.ts
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';
import { normalizeStoredRoutePath } from '../src/features/parks/core/utils/routePath';
import { haversineMeters } from '../src/features/parks/core/services/geoUtils';

const CENTER = { lat: 31.533280, lng: 34.599028 };
const ROUTE_STOPS_MAX_START_M = 800; // start-hybrid-session.ts:540

function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}

/** Mirrors resolveRouteStopsBackbone's 'existing_route' distance metric EXACTLY
 *  (start-hybrid-session.ts:654-663): nearest-VERTEX haversine distance over the
 *  WHOLE path, not just path[0]. */
function nearestVertexDistanceMeters(pos: { lat: number; lng: number }, path: [number, number][]): number {
  let dist = Infinity;
  for (const v of path) {
    const d = haversineMeters(pos.lat, pos.lng, v[1], v[0]);
    if (d < dist) dist = d;
  }
  return dist;
}

/** Mirrors InventoryService.fetchOfficialRoutes' publishedOnly filter EXACTLY
 *  (inventory.service.ts:761): excluded ONLY when published === false. */
function isEligibleAsPublished(data: any): boolean {
  return data.published !== false;
}

async function main() {
  const db = initFb();

  // getCachedOfficialRoutes() calls fetchOfficialRoutes(undefined, true) — ALL
  // authorities network-wide, publishedOnly=true. Mirror that scope exactly.
  const allSnap = await db.collection('official_routes').get();
  const allRoutes = allSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
  console.log(`Total official_routes network-wide: ${allRoutes.length}`);

  type Ranked = { id: string; name: string; d: number; publishedEligible: boolean; rawPublished: any; points: number };
  const ranked: Ranked[] = [];
  for (const r of allRoutes) {
    const path = normalizeStoredRoutePath(r.path);
    if (path.length < 2) continue;
    const d = nearestVertexDistanceMeters(CENTER, path);
    if (d <= ROUTE_STOPS_MAX_START_M) {
      ranked.push({
        id: r.id, name: r.name, d, points: path.length,
        publishedEligible: isEligibleAsPublished(r), rawPublished: r.published,
      });
    }
  }
  ranked.sort((a, b) => a.d - b.d);

  console.log(`\n=== Q1: all routes within ${ROUTE_STOPS_MAX_START_M}m of (${CENTER.lat}, ${CENTER.lng}) ===`);
  console.log(`Found ${ranked.length}:`);
  for (const r of ranked) {
    console.log(
      `  ${r.d.toFixed(1)}m — "${r.name}" (${r.id}) — ${r.points} pts` +
      ` — published field=${JSON.stringify(r.rawPublished)} → ${r.publishedEligible ? 'ELIGIBLE (candidate)' : 'EXCLUDED (published:false)'}`,
    );
  }

  console.log(`\n=== Q2: distance metric + today's actual winner ===`);
  console.log(`Metric: nearest-VERTEX haversine distance over the WHOLE stored path (every point checked,`);
  console.log(`not just path[0]) — start-hybrid-session.ts:654-663. Cap: ${ROUTE_STOPS_MAX_START_M}m (ROUTE_STOPS_MAX_START_M, line 540).`);
  const eligible = ranked.filter((r) => r.publishedEligible);
  const winner = eligible[0] ?? null;
  if (winner) {
    console.log(`Winner TODAY (nearest eligible route): "${winner.name}" (${winner.id}) @ ${winner.d.toFixed(1)}m`);
  } else {
    console.log('No eligible route within the cap — existing_route would return null → falls back to generated_loop.');
  }

  console.log(`\n=== Q3: what would need to be hidden so ONLY the new Kalaniyot route wins ===`);
  const kalaniyotCandidates = ranked.filter((r) => (r.name ?? '').includes('כלני'));
  console.log('Kalaniyot-named candidates in range:');
  for (const r of kalaniyotCandidates) console.log(`  "${r.name}" (${r.id}) @ ${r.d.toFixed(1)}m`);
  const closerThanClosestKalaniyot = kalaniyotCandidates.length > 0
    ? eligible.filter((r) => r.d < Math.min(...kalaniyotCandidates.map((k) => k.d)) && !(r.name ?? '').includes('כלני'))
    : [];
  console.log('\nOther ELIGIBLE (published-eligible) routes currently closer than the nearest Kalaniyot candidate:');
  if (closerThanClosestKalaniyot.length === 0) {
    console.log('  (none — no other route needs hiding for the Kalaniyot candidate to win, IF it is itself eligible)');
  } else {
    for (const r of closerThanClosestKalaniyot) console.log(`  "${r.name}" (${r.id}) @ ${r.d.toFixed(1)}m — would need published:false to not outrank Kalaniyot`);
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
