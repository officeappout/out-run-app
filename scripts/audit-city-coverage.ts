/**
 * scripts/audit-city-coverage.ts — READ-ONLY per-city data-coverage audit.
 *
 * Foundation for the "data track" (future city dashboard, per-route quality
 * certificate, learning log) — built as a reusable script specifically so
 * those later surfaces can call the exact same query/aggregation functions
 * instead of re-deriving them. See EXPORTED FUNCTIONS below.
 *
 * ZERO Firestore writes. Only .get() calls. Safe against prod.
 *
 * Collections read:
 *   - official_routes  (Route docs — the main discovery/import pipeline)
 *   - curated_routes   (Route docs — human-curated intent-based routes;
 *                        reported both combined-with and broken-out-from
 *                        official_routes, since they're genuinely different
 *                        pipelines feeding the same per-city totals)
 *   - parks            (ALL location types live here — Park docs, discriminated
 *                        by `facilityType`: gym_park | court | nature_community |
 *                        zen_spot | urban_spot | route. `facilityType==='route'`
 *                        docs are excluded from the location-inventory count —
 *                        those are legacy/unused per this audit's own findings,
 *                        see report notes; real routes live in official_routes/
 *                        curated_routes only.)
 *   - authorities       (id -> name resolution only, for display labels)
 *
 * Usage: npx tsx scripts/audit-city-coverage.ts
 * Output: prints a human-readable per-city table to stdout AND writes the
 * full structured result to scripts/output/city-coverage-audit.json
 * (overwritten each run — a stable "latest" path, not timestamped).
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}

// ── Sanity thresholds (judgment calls, named so they're easy to revisit) ───
const ABSURD_DISTANCE_KM = 30; // routes longer than this are flagged, not necessarily wrong
const MIN_VALID_PATH_POINTS = 2;
// A raw `distance` value above this is treated as "likely stored in meters,
// not km" rather than a genuinely absurd multi-hundred-km route — found live
// during this audit's own first run: official_routes.distance is stored in
// METERS for Haifa (e.g. 515, 4263) but KILOMETERS for Ashkelon (e.g. 3.88,
// 9.41) — same field, same collection, no per-doc unit marker. This
// heuristic exists to make the absurdity check meaningful again; the raw
// inconsistency itself is ALSO reported as its own metric per city
// (distanceUnitMismatch below), never silently normalized away.
const METERS_VS_KM_HEURISTIC_THRESHOLD = 100;

// ── City key resolution ─────────────────────────────────────────────────
// authorityId is the canonical grouping key (matches how every other part
// of this codebase scopes city data); the raw `city` string field is only
// a display-label fallback for the legacy docs that predate authorityId
// (axioms.md §23's own grandfather clause — this is expected, not a bug).
function cityKey(authorityId: string | undefined, city: string | undefined): string {
  if (authorityId) return `auth:${authorityId}`;
  if (city && city.trim()) return `city:${city.trim()}`;
  return 'unknown';
}

interface CityRouteStats {
  cityLabel: string;
  authorityId: string | null;
  totalRoutes: number;
  byCollection: { official: number; curated: number };
  byStatus: Record<string, number>;
  byActivity: Record<string, number>;
  bySource: Record<string, number>;
  completeness: {
    difficultyReal: number;       // has elevationGain AND maxGrade (real DEM-derived difficulty)
    difficultyFallbackOrAbsent: number; // has a difficulty value but no real DEM backing it, or no difficulty at all
    elevationDataPresent: number; // has elevationGain AND maxGrade
    elevationDataAbsent: number;
    imagePresent: number;
    imageAbsent: number;
    descriptionPresent: number;
    descriptionAbsent: number;
  };
  distanceSanity: { zeroOrInvalid: number; absurdlyLarge: number; ok: number };
  /** Count of routes whose raw distance value looks like it's stored in
   *  meters rather than km (>100) — a real, found-live unit inconsistency,
   *  not a computed/derived signal. See METERS_VS_KM_HEURISTIC_THRESHOLD. */
  distanceLikelyStoredInMeters: number;
  pointCountSanity: { tooFew: number; ok: number };
  duplicateNameClusters: Array<{ name: string; count: number }>;
}

interface CityLocationCategoryStats {
  total: number;
  withImage: number;
  withValidCoords: number;
}

interface CityLocationStats {
  cityLabel: string;
  authorityId: string | null;
  parks: CityLocationCategoryStats;
  /** Sum of gymEquipment[] length across this city's gym_park docs — see
   *  the script header + audit report for why "facilities" is interpreted
   *  as equipment COUNT, not a separate park category. */
  gymEquipmentItems: number;
  courts: CityLocationCategoryStats;
  waterFountains: CityLocationCategoryStats;
  poi: CityLocationCategoryStats; // nature_community (springs, observation points, dog parks)
  otherUrbanInfra: CityLocationCategoryStats; // urban_spot minus water_fountain — beyond what was asked, reported so nothing is silently dropped
}

function hasValidCoords(loc: { lat?: number; lng?: number } | undefined): boolean {
  if (!loc) return false;
  const { lat, lng } = loc;
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!isFinite(lat) || !isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false; // "null island" default-data smell
  return true;
}

function hasImage(doc: { image?: string; images?: string[]; imageUrl?: string }): boolean {
  return !!(doc.image || doc.imageUrl || (doc.images && doc.images.length > 0));
}

/** Exported so a future dashboard can call the exact same aggregation this
 *  script's own main() uses, without re-deriving it. */
export function auditRoutes(
  docs: Array<{ id: string; collectionName: 'official' | 'curated'; data: any }>,
  authorityNames: Map<string, string>,
): Map<string, CityRouteStats> {
  const byCity = new Map<string, CityRouteStats>();
  const namesByCity = new Map<string, Map<string, number>>();

  for (const { collectionName, data: d } of docs) {
    const authorityId: string | undefined = d.authorityId;
    const city: string | undefined = d.city;
    const key = cityKey(authorityId, city);

    if (!byCity.has(key)) {
      byCity.set(key, {
        cityLabel: authorityId ? (authorityNames.get(authorityId) || authorityId) : (city || 'ללא רשות/עיר'),
        authorityId: authorityId || null,
        totalRoutes: 0,
        byCollection: { official: 0, curated: 0 },
        byStatus: {},
        byActivity: {},
        bySource: {},
        completeness: {
          difficultyReal: 0, difficultyFallbackOrAbsent: 0,
          elevationDataPresent: 0, elevationDataAbsent: 0,
          imagePresent: 0, imageAbsent: 0,
          descriptionPresent: 0, descriptionAbsent: 0,
        },
        distanceSanity: { zeroOrInvalid: 0, absurdlyLarge: 0, ok: 0 },
        distanceLikelyStoredInMeters: 0,
        pointCountSanity: { tooFew: 0, ok: 0 },
        duplicateNameClusters: [],
      });
      namesByCity.set(key, new Map());
    }
    const stats = byCity.get(key)!;

    stats.totalRoutes++;
    stats.byCollection[collectionName]++;

    const status = d.status || (d.published === true ? 'published' : d.published === false ? 'pending' : 'unknown');
    stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;

    const activity = d.activityType || d.type || 'unknown';
    stats.byActivity[activity] = (stats.byActivity[activity] || 0) + 1;

    const source = d.source?.type || 'unknown';
    stats.bySource[source] = (stats.bySource[source] || 0) + 1;

    // Real difficulty = actually backed by DEM data (elevationGain + maxGrade
    // both present) — matches the exact hasRealDemData test
    // route-geometry-edit.service.ts's Phase 1/2 recompute already uses.
    // A difficulty VALUE existing on the doc with no DEM backing is still
    // counted as "fallback/absent" — it's either a manual pick or stale.
    const hasElevation = typeof d.elevationGain === 'number' && typeof d.maxGrade === 'number';
    if (hasElevation) stats.completeness.difficultyReal++;
    else stats.completeness.difficultyFallbackOrAbsent++;
    if (hasElevation) stats.completeness.elevationDataPresent++;
    else stats.completeness.elevationDataAbsent++;

    if (hasImage(d)) stats.completeness.imagePresent++;
    else stats.completeness.imageAbsent++;

    if (d.description && String(d.description).trim()) stats.completeness.descriptionPresent++;
    else stats.completeness.descriptionAbsent++;

    const distance = typeof d.distance === 'number' ? d.distance : 0;
    // route-geometry-edit.service.ts (this app's own current writer) stores
    // distance in KM. Some existing data does not — see
    // METERS_VS_KM_HEURISTIC_THRESHOLD's comment. Normalize with a heuristic
    // ONLY for the ok/absurd judgment below; the raw mismatch is tracked
    // separately (distanceLikelyStoredInMeters) so it's never hidden.
    const likelyMeters = distance > METERS_VS_KM_HEURISTIC_THRESHOLD;
    if (likelyMeters) stats.distanceLikelyStoredInMeters++;
    const normalizedKm = likelyMeters ? distance / 1000 : distance;
    if (!(distance > 0)) stats.distanceSanity.zeroOrInvalid++;
    else if (normalizedKm > ABSURD_DISTANCE_KM) stats.distanceSanity.absurdlyLarge++;
    else stats.distanceSanity.ok++;

    const pathLen = Array.isArray(d.path) ? d.path.length : 0;
    if (pathLen < MIN_VALID_PATH_POINTS) stats.pointCountSanity.tooFew++;
    else stats.pointCountSanity.ok++;

    const name = (d.name || '').trim();
    if (name) {
      const nm = namesByCity.get(key)!;
      nm.set(name, (nm.get(name) || 0) + 1);
    }
  }

  byCity.forEach((stats, key) => {
    const nm = namesByCity.get(key)!;
    stats.duplicateNameClusters = Array.from(nm.entries())
      .filter(([, count]) => count > 1)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  });

  return byCity;
}

/** Same reuse intent as auditRoutes — one shared aggregation function. */
export function auditLocations(
  parkDocs: Array<{ id: string; data: any }>,
  authorityNames: Map<string, string>,
): Map<string, CityLocationStats> {
  const byCity = new Map<string, CityLocationStats>();

  const emptyCat = (): CityLocationCategoryStats => ({ total: 0, withImage: 0, withValidCoords: 0 });
  const bump = (cat: CityLocationCategoryStats, d: any) => {
    cat.total++;
    if (hasImage(d)) cat.withImage++;
    if (hasValidCoords(d.location || { lat: d.lat, lng: d.lng })) cat.withValidCoords++;
  };

  for (const { data: d } of parkDocs) {
    // facilityType==='route' Park docs are a separate, apparently-unused
    // legacy representation (real routes live in official_routes/
    // curated_routes) — excluded from this location-inventory count
    // entirely rather than silently mixed in as a 7th category. Counted
    // and reported separately in main() so the number isn't just dropped.
    if (d.facilityType === 'route') continue;

    const authorityId: string | undefined = d.authorityId;
    const city: string | undefined = d.city;
    const key = cityKey(authorityId, city);

    if (!byCity.has(key)) {
      byCity.set(key, {
        cityLabel: authorityId ? (authorityNames.get(authorityId) || authorityId) : (city || 'ללא רשות/עיר'),
        authorityId: authorityId || null,
        parks: emptyCat(),
        gymEquipmentItems: 0,
        courts: emptyCat(),
        waterFountains: emptyCat(),
        poi: emptyCat(),
        otherUrbanInfra: emptyCat(),
      });
    }
    const stats = byCity.get(key)!;

    switch (d.facilityType) {
      case 'gym_park':
        bump(stats.parks, d);
        stats.gymEquipmentItems += Array.isArray(d.gymEquipment) ? d.gymEquipment.length : 0;
        break;
      case 'court':
        bump(stats.courts, d);
        break;
      case 'nature_community':
      case 'zen_spot':
        bump(stats.poi, d);
        break;
      case 'urban_spot':
        if (d.urbanType === 'water_fountain') bump(stats.waterFountains, d);
        else bump(stats.otherUrbanInfra, d);
        break;
      default:
        // No facilityType at all — still real location data, don't drop it.
        bump(stats.otherUrbanInfra, d);
    }
  }

  return byCity;
}

// ── Human-readable table rendering ──────────────────────────────────────
function pct(n: number, total: number): string {
  if (total === 0) return '—';
  return `${Math.round((n / total) * 100)}%`;
}

function printRouteTable(byCity: Map<string, CityRouteStats>) {
  console.log('\n=== A) ROUTES — per city ===\n');
  const sorted = Array.from(byCity.values()).sort((a, b) => b.totalRoutes - a.totalRoutes);
  for (const s of sorted) {
    console.log(`── ${s.cityLabel} ${s.authorityId ? `(${s.authorityId})` : '(no authorityId)'} — ${s.totalRoutes} routes ──`);
    console.log(`   collection: official=${s.byCollection.official} curated=${s.byCollection.curated}`);
    console.log(`   status: ${Object.entries(s.byStatus).map(([k, v]) => `${k}=${v}`).join(' ')}`);
    console.log(`   activity: ${Object.entries(s.byActivity).map(([k, v]) => `${k}=${v}`).join(' ')}`);
    console.log(`   source: ${Object.entries(s.bySource).map(([k, v]) => `${k}=${v}`).join(' ')}`);
    console.log(
      `   difficulty: REAL(DEM)=${s.completeness.difficultyReal} (${pct(s.completeness.difficultyReal, s.totalRoutes)})  ` +
      `fallback/absent=${s.completeness.difficultyFallbackOrAbsent} (${pct(s.completeness.difficultyFallbackOrAbsent, s.totalRoutes)})`
    );
    console.log(`   elevation data: present=${s.completeness.elevationDataPresent}  absent=${s.completeness.elevationDataAbsent}`);
    console.log(`   image: present=${s.completeness.imagePresent} (${pct(s.completeness.imagePresent, s.totalRoutes)})  absent=${s.completeness.imageAbsent}`);
    console.log(`   description: present=${s.completeness.descriptionPresent} (${pct(s.completeness.descriptionPresent, s.totalRoutes)})  absent=${s.completeness.descriptionAbsent}`);
    console.log(`   distance sanity: ok=${s.distanceSanity.ok}  zero/invalid=${s.distanceSanity.zeroOrInvalid}  absurd(>${ABSURD_DISTANCE_KM}km after unit-normalization)=${s.distanceSanity.absurdlyLarge}`);
    if (s.distanceLikelyStoredInMeters > 0) {
      console.log(`   ⚠ UNIT MISMATCH: ${s.distanceLikelyStoredInMeters}/${s.totalRoutes} routes have distance stored as METERS, not km (raw value >${METERS_VS_KM_HEURISTIC_THRESHOLD})`);
    }
    console.log(`   path-point sanity: ok=${s.pointCountSanity.ok}  too-few(<${MIN_VALID_PATH_POINTS})=${s.pointCountSanity.tooFew}`);
    if (s.duplicateNameClusters.length > 0) {
      console.log(`   duplicate-name clusters (${s.duplicateNameClusters.length}):`);
      for (const c of s.duplicateNameClusters) console.log(`     "${c.name}" × ${c.count}`);
    }
    console.log('');
  }
}

function printLocationTable(byCity: Map<string, CityLocationStats>) {
  console.log('\n=== B) LOCATION INVENTORY — per city ===\n');
  const sorted = Array.from(byCity.values()).sort(
    (a, b) => (b.parks.total + b.courts.total + b.waterFountains.total + b.poi.total) -
               (a.parks.total + a.courts.total + a.waterFountains.total + a.poi.total)
  );
  for (const s of sorted) {
    console.log(`── ${s.cityLabel} ${s.authorityId ? `(${s.authorityId})` : '(no authorityId)'} ──`);
    console.log(`   parks/gardens: ${s.parks.total}  (image=${s.parks.withImage}, valid-coords=${s.parks.withValidCoords})  — total gym-equipment items across them: ${s.gymEquipmentItems}`);
    console.log(`   sport courts: ${s.courts.total}  (image=${s.courts.withImage}, valid-coords=${s.courts.withValidCoords})`);
    console.log(`   water fountains: ${s.waterFountains.total}  (image=${s.waterFountains.withImage}, valid-coords=${s.waterFountains.withValidCoords})`);
    console.log(`   POIs (nature/community): ${s.poi.total}  (image=${s.poi.withImage}, valid-coords=${s.poi.withValidCoords})`);
    console.log(`   other urban infra (beyond the ask, reported so nothing is dropped): ${s.otherUrbanInfra.total}  (image=${s.otherUrbanInfra.withImage}, valid-coords=${s.otherUrbanInfra.withValidCoords})`);
    console.log('');
  }
}

function printGapList() {
  console.log('\n=== C) THE GAP — signals NOT yet stored per route (stated, not computed) ===\n');
  console.log('  - Street lighting (lamp posts) presence: ABSENT per-route.');
  console.log('    (Note: Park docs DO have a boolean hasLights field — a park-level signal exists,');
  console.log('     a route-level one does not. Worth checking hasLights population rate separately');
  console.log('     before assuming this needs building from zero.)');
  console.log('  - Crosswalks presence: ABSENT per-route. No field found anywhere in Route or Park.');
  console.log('  - Tree canopy / shade: ABSENT per-route.');
  console.log('    (Note: Park docs DO have isShaded/hasNaturalShade booleans — same park-vs-route');
  console.log('     gap as lighting above.)');
  console.log('  - Per-route surface composition (% sidewalk / % dedicated / % ordinary street):');
  console.log('    ABSENT as a stored field on any route doc. The DETECTOR logic to compute this');
  console.log('    exists (scripts/geo-discovery-routes.ts\'s isSidewalkLikeWay + the specialness');
  console.log('    gate) but only runs at discovery time inside that script — nothing persists a');
  console.log('    composition breakdown back onto the route doc itself. This is exactly the');
  console.log('    detector the "data track" plan intends to port into a browser-safe module.');
  console.log('');
}

async function main() {
  const db = initFb();

  console.log('Fetching authorities, official_routes, curated_routes, parks (read-only)...');
  const [authoritiesSnap, officialSnap, curatedSnap, parksSnap] = await Promise.all([
    db.collection('authorities').get(),
    db.collection('official_routes').get(),
    db.collection('curated_routes').get(),
    db.collection('parks').get(),
  ]);
  console.log(
    `Loaded: ${authoritiesSnap.size} authorities, ${officialSnap.size} official_routes, ` +
    `${curatedSnap.size} curated_routes, ${parksSnap.size} parks.\n`
  );

  const authorityNames = new Map<string, string>();
  authoritiesSnap.docs.forEach(d => authorityNames.set(d.id, (d.data() as any).name || d.id));

  const routeDocs = [
    ...officialSnap.docs.map(d => ({ id: d.id, collectionName: 'official' as const, data: d.data() })),
    ...curatedSnap.docs.map(d => ({ id: d.id, collectionName: 'curated' as const, data: d.data() })),
  ];
  const parkDocs = parksSnap.docs.map(d => ({ id: d.id, data: d.data() }));
  const legacyRouteFacilityParks = parkDocs.filter(p => (p.data as any).facilityType === 'route').length;

  const routeStats = auditRoutes(routeDocs, authorityNames);
  const locationStats = auditLocations(parkDocs, authorityNames);

  printRouteTable(routeStats);
  printLocationTable(locationStats);
  if (legacyRouteFacilityParks > 0) {
    console.log(`NOTE: ${legacyRouteFacilityParks} parks doc(s) have facilityType==='route' — excluded from`);
    console.log('the location-inventory table above (see script header for why). Flagging the count so');
    console.log('it is not silently lost.\n');
  }
  printGapList();

  const output = {
    generatedAt: new Date().toISOString(),
    thresholds: {
      absurdDistanceKm: ABSURD_DISTANCE_KM,
      minValidPathPoints: MIN_VALID_PATH_POINTS,
      metersVsKmHeuristicThreshold: METERS_VS_KM_HEURISTIC_THRESHOLD,
    },
    collectionsRead: ['authorities', 'official_routes', 'curated_routes', 'parks'],
    totals: {
      authorities: authoritiesSnap.size,
      officialRoutes: officialSnap.size,
      curatedRoutes: curatedSnap.size,
      parks: parksSnap.size,
      legacyRouteFacilityParksExcluded: legacyRouteFacilityParks,
    },
    routes: Array.from(routeStats.values()),
    locations: Array.from(locationStats.values()),
    gapListStatedNotComputed: [
      'street_lighting_per_route',
      'crosswalks_per_route',
      'tree_canopy_shade_per_route',
      'surface_composition_per_route',
    ],
  };

  const outDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'city-coverage-audit.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nStructured JSON written to: ${outPath}`);
  console.log('=== COMPLETE — read-only, no writes ===');
}

main().then(() => process.exit(0)).catch(e => { console.error('FATAL:', e); process.exit(1); });
