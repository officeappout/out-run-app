/**
 * DIAGNOSTIC — David's item 1 (20.09.2026): of the 72 OSM amenity candidates
 * found by extract-osm-amenities-tlv.ts's dry-run on Sderot, how many are
 * actually within 180m (resolveRouteStops' default match radius) of the
 * REAL Sderot walking route path — broken down by category?
 *
 * That script only reports aggregate counts in dry-run mode (no per-candidate
 * coordinates), so this is an independent, read-only cross-reference: mirrors
 * its exact Overpass query (same tags, same bbox source — Sderot's real route
 * geometry, not the city-wide boundary) and its exact tag→category mapping,
 * then measures each candidate's real distance to the route using the
 * already-proven geoUtils primitives. No writes, no Firestore mutation.
 *
 * Run: npx tsx scripts/_verify-osm-amenities-within-180m-of-sderot-route.ts
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';
import { crossTrackDistanceMeters } from '../src/features/parks/core/services/geoUtils';
import { normalizeStoredRoutePath } from '../src/features/parks/core/utils/routePath';

function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}

// Mirrors extract-osm-amenities-tlv.ts's fetchAmenityElements query verbatim
// (same tags, same element shapes) — see that file's fetchAmenityElements
// for the source this was copied from.
// Mirrors extract-osm-amenities-tlv.ts's OVERPASS_ENDPOINTS + fetchOverpassOnce
// exactly (same 3-mirror fallback, same required User-Agent — overpass-api.de
// 429s/406s requests without one).
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
async function fetchOverpass(query: string): Promise<any> {
  const body = 'data=' + encodeURIComponent(query);
  let lastErr: unknown;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'OUT-OutRun-app (field-test verification, read-only; office@appout.co.il)',
        },
        body,
      });
      if (!res.ok) throw new Error(`Overpass HTTP ${res.status} from ${endpoint}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      console.warn(`  (${endpoint} failed, trying next mirror) ${(e as Error).message}`);
    }
  }
  throw lastErr;
}

type Category = 'court' | 'bench' | 'drinking_water' | 'fitness_station' | 'crossing' | 'dog_park';

// Mirrors classifyElement's exact tag→category mapping (extract-osm-amenities-tlv.ts:311-327).
function classify(tags: Record<string, string> | undefined): Category | null {
  if (!tags) return null;
  if (tags.leisure === 'pitch') return 'court';
  if (tags.amenity === 'bench') return 'bench';
  if (tags.amenity === 'drinking_water') return 'drinking_water';
  if (tags.leisure === 'fitness_station') return 'fitness_station';
  if (tags.highway === 'crossing') return 'crossing';
  if (tags.leisure === 'dog_park') return 'dog_park';
  return null;
}

function elementPoint(el: any): { lat: number; lng: number } | null {
  if (typeof el.lat === 'number' && typeof el.lon === 'number') return { lat: el.lat, lng: el.lon };
  if (el.center && typeof el.center.lat === 'number' && typeof el.center.lon === 'number') return { lat: el.center.lat, lng: el.center.lon };
  return null;
}

const MATCH_RADIUS_M = 180; // resolveRouteStops' DEFAULT_MATCH_RADIUS_M

async function main() {
  const db = initFb();

  const routeDoc = await db.collection('official_routes').doc('YVx4pgJjOOXR8j497pPF').get();
  const routePath = normalizeStoredRoutePath(routeDoc.data()!.path);
  console.log(`Sderot walking route: ${routePath.length} points`);

  // Tight bbox around the route itself + 300m padding — sufficient for a
  // 180m match radius; simpler and more directly on-point than reproducing
  // the production script's whole-city-routes margin.
  const lats = routePath.map((p) => p[1]);
  const lngs = routePath.map((p) => p[0]);
  const PAD_DEG = 300 / 111_000; // ~300m in degrees latitude, close enough for longitude at this latitude too
  const bbox = {
    latMin: Math.min(...lats) - PAD_DEG,
    latMax: Math.max(...lats) + PAD_DEG,
    lonMin: Math.min(...lngs) - PAD_DEG,
    lonMax: Math.max(...lngs) + PAD_DEG,
  };
  console.log('Bbox (route + 300m pad):', bbox);

  const query = `
[out:json][timeout:60];
(
  node["leisure"="pitch"](${bbox.latMin},${bbox.lonMin},${bbox.latMax},${bbox.lonMax});
  way["leisure"="pitch"](${bbox.latMin},${bbox.lonMin},${bbox.latMax},${bbox.lonMax});
  node["amenity"="bench"](${bbox.latMin},${bbox.lonMin},${bbox.latMax},${bbox.lonMax});
  node["amenity"="drinking_water"](${bbox.latMin},${bbox.lonMin},${bbox.latMax},${bbox.lonMax});
  node["leisure"="fitness_station"](${bbox.latMin},${bbox.lonMin},${bbox.latMax},${bbox.lonMax});
  way["leisure"="fitness_station"](${bbox.latMin},${bbox.lonMin},${bbox.latMax},${bbox.lonMax});
  node["highway"="crossing"](${bbox.latMin},${bbox.lonMin},${bbox.latMax},${bbox.lonMax});
  node["leisure"="dog_park"](${bbox.latMin},${bbox.lonMin},${bbox.latMax},${bbox.lonMax});
  way["leisure"="dog_park"](${bbox.latMin},${bbox.lonMin},${bbox.latMax},${bbox.lonMax});
);
out center tags;
`.trim();

  console.log('\nQuerying Overpass (read-only public API, same query shape as extract-osm-amenities-tlv.ts)...');
  const json = await fetchOverpass(query);
  const elements: any[] = json.elements ?? [];
  console.log(`Raw elements in route+300m bbox: ${elements.length}`);

  const byCategory: Record<Category, { total: number; within180: number }> = {
    court: { total: 0, within180: 0 },
    bench: { total: 0, within180: 0 },
    drinking_water: { total: 0, within180: 0 },
    fitness_station: { total: 0, within180: 0 },
    crossing: { total: 0, within180: 0 },
    dog_park: { total: 0, within180: 0 },
  };

  const within180Details: Array<{ category: Category; name: string | null; distM: number; osmId: string }> = [];

  for (const el of elements) {
    const cat = classify(el.tags);
    if (!cat) continue;
    const point = elementPoint(el);
    if (!point) continue;
    byCategory[cat].total++;
    const distM = crossTrackDistanceMeters(point, routePath);
    if (Number.isFinite(distM) && distM <= MATCH_RADIUS_M) {
      byCategory[cat].within180++;
      within180Details.push({ category: cat, name: el.tags?.name ?? null, distM: Math.round(distM), osmId: `${el.type}_${el.id}` });
    }
  }

  console.log('\n=== Within 180m of the actual route path, by category ===');
  for (const [cat, counts] of Object.entries(byCategory)) {
    console.log(`  ${cat}: ${counts.within180} within 180m (of ${counts.total} in the route+300m bbox)`);
  }

  console.log('\n=== Individual matches within 180m ===');
  within180Details.sort((a, b) => a.distM - b.distM);
  for (const d of within180Details) {
    console.log(`  [${d.category}] ${d.name ?? '(unnamed)'} — ${d.distM}m — osmId=${d.osmId}`);
  }

  const total180 = within180Details.length;
  console.log(`\nTotal within 180m of the route: ${total180}`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
