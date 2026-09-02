/**
 * scripts/geo-discovery-routes.ts — GEO-DISCOVERY, step 1 (boundary-parameterized)
 *
 * Generalises the (previously TLV-embedded) OSM route discovery+enrichment probe
 * into a REGION-parameterized ingester. Discovers good running/walking routes from
 * OpenStreetMap inside a named region boundary, enriches them (DEM elevation, loop
 * detection), filters artifacts, and writes them to `official_routes` as
 * status:'pending' / published:false — so they appear in the Approval Center and
 * NEVER enter the live generator before David approves them.
 *
 * Sources (all "good for running/walking"):
 *   trail    — marked route relations (route=hiking|foot|walking) clipped to the
 *              region → e.g. שביל ישראל, שבילי רמת הנדיב. A relation-line
 *              exceeding LEN_TRAIL_MAX is not just discarded: any individually-
 *              NAMED member way is rescued and re-offered to the segment/loop
 *              pipeline below (see "relation-rejection rescue"), so a short,
 *              locally-special way isn't silently swallowed by its parent
 *              trail's own length cap.
 *   park     — NEW: named leisure=park/garden polygons (way or relation) inside
 *              the region → a perimeter loop tracing the park's own real OSM
 *              boundary ring (never a synthetic circle). See buildLoop() below
 *              for why this is a real trace and not a reuse of the live app's
 *              generator (checked, infeasible: Firebase-client entanglement,
 *              and it has zero polygon awareness anyway).
 *   loop     — closed footway/path/track ways (start≈end) — loops are PREFERRED
 *   segment  — NAMED footway/path/track/pedestrian/cycleway ways, PLUS named
 *              living_street/residential/service/tertiary/unclassified ways
 *              ("street-based promenades stay continuous" — a promenade tagged
 *              as an ordinary street is no longer invisible to discovery).
 *              Same-named and geometrically-adjacent fragments are STITCHED
 *              into one continuous candidate before length/name filtering —
 *              see "promenade stitching" below — instead of being emitted as
 *              separate, shorter, easily-length-filtered stubs.
 *
 * Promenade stitching (two passes, before length/name filters apply):
 *   pass 1 — same-name: every standalone named way sharing an exact `name` tag
 *            is greedily chained (stitchWithIds, SAME_NAME_GAP_M) into one or
 *            more continuous lines.
 *   pass 2 — geometric continuity, across DIFFERENT names: pass 1's results
 *            (plus any unmerged singly-named way) are chained again, ignoring
 *            name, purely by endpoint proximity — a tighter gap tolerance
 *            (CROSS_NAME_GAP_M) than pass 1, and only within a compatible tag
 *            family (foot/track/street/bicycle), since cross-name merging
 *            carries real false-positive risk. The canonical name of a
 *            cross-name merge is the LONGEST constituent segment's real name;
 *            every constituent way id is preserved on `source.sourceWayIds`
 *            for traceability. A stitched candidate's `source.externalId` is
 *            deterministic — `osm:stitched/<sorted way ids>` — so re-running
 *            discovery against unchanged OSM data always regenerates the same
 *            id, never a duplicate (stitch()/stitchWithIds' greedy chaining is
 *            input-order-sensitive, and Overpass mirror response order isn't
 *            guaranteed stable run-to-run).
 *
 * Filters:
 *   - drops steps / escalators (highway=steps, conveying=*) — routes are not stairs
 *   - drops access=private / foot=no / indoor ways
 *   - drops artifacts: geometry sitting over water or inside a building polygon
 *   - length window per source (see LEN_* below) — LEN_SEG_MIN_NAMED (50m) applies
 *     to named NON-LOOP segments/promenades specifically; LOOP candidates (park or
 *     otherwise) keep LEN_LOOP_MIN (400m) regardless of naming — a loop is a
 *     different length regime by nature, not a "specialness" question.
 *   - every standalone-way candidate (loop or not) must carry a real OSM name —
 *     no anonymous filler loops (a bare unnamed closed way used to be exempt from
 *     the named-only rule; that exemption is removed). Trail-RELATION candidates
 *     are a deliberate, stated exception — a relation is already real, human-
 *     mapped, officially-classified evidence of "specialness" even without a
 *     `name` tag (Israel's paint-color-marked-trail convention), so an unnamed
 *     trail relation still gets the existing generic fallback name rather than
 *     being dropped.
 *
 * Enrichment: elevationGain + maxGrade via Mapbox Terrain-RGB DEM, routeShape ('loop' when geometrically closed, omitted otherwise).
 * Idempotent: keyed on source.externalId — re-runs UPDATE, never duplicate.
 * Does NOT broadcast to street_segments (pending routes stay out of the generator).
 *
 * Usage:
 *   npx tsx scripts/geo-discovery-routes.ts --region=zichron --dry-run   # discover + print, no write
 *   npx tsx scripts/geo-discovery-routes.ts --region=zichron             # write pending docs
 *   npx tsx scripts/geo-discovery-routes.ts --region=zichron --delete    # remove this region's batch
 *
 * Adding a region = one entry in REGIONS below (boundary as a parameter). That is
 * the whole point of this step: nothing here is hardcoded to a single city.
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as zlib from 'zlib'; import * as https from 'https'; import * as admin from 'firebase-admin';
import { mapOsmSurfaceToType } from '../src/lib/route-collections/surface-type';
import { fetchCityWayGrid, type CityWayGrid } from './lib/route-quality-osm-fetch.node';
import { computeRouteComposition, type WayCategory } from './lib/route-composition-classify';
import { computeRouteLighting } from './lib/route-lighting-street-segments.node';
import { validateCityRegistration } from '../src/lib/city-registrations';

// ─────────────────────────────── CLI + region config ───────────────────────────────
const DRY = process.argv.includes('--dry-run');
const DELETE = process.argv.includes('--delete');
const ROUNDTRIPS = process.argv.includes('--roundtrips'); // add Mapbox foot round-trip loops
const SKIP_OSM = process.argv.includes('--skip-osm');      // skip Overpass discovery (round-trips only)
const regionArg = (process.argv.find(a => a.startsWith('--region=')) || '--region=zichron').split('=')[1];

interface Region {
  key: string;
  label: string;        // city label persisted on each route
  /** Overpass area selector body (e.g. an admin boundary by wikidata) — the primary boundary. */
  areaWikidata?: string;
  /** Wikidata id of the real admin boundary, used ONLY as a post-discovery clipping
   *  filter — deliberately decoupled from areaWikidata. Using the admin area as
   *  Overpass DISCOVERY SCOPE collapses marked-trail RELATION matching (Overpass's
   *  area-vs-bbox relation-containment semantics differ for relations that only
   *  partially cross the boundary — confirmed empirically on Haifa: 51→0
   *  trail-relations when areaWikidata was used for both). Optional — a region
   *  without this field simply gets no boundary clip (fail-open, same as every
   *  region before this field existed). */
  boundaryClipWikidata?: string;
  /** Extra bounding boxes to also sweep (e.g. an adjacent nature park not in the admin area). */
  extraBboxes?: Array<{ latMin: number; lonMin: number; latMax: number; lonMax: number }>;
  /** Overall bbox that encloses the whole region — used for DEM tiles + blocking-polygon fetch. */
  bbox: { latMin: number; lonMin: number; latMax: number; lonMax: number };
  /** Named anchor points for the Mapbox round-trip source (--roundtrips). Loops are also
   *  generated around every `parks` gym whose coords fall inside this region's bbox. */
  roundTripAnchors?: Array<{ key: string; label: string; lat: number; lng: number }>;
  batchId: string;
  /** Additive (Stage A, city-orchestrator plan, 02.09.2026) — replaces the old
   *  `REGION.label === 'חיפה'` literal check at the discovery-time lighting gate
   *  below. Undefined on every existing in-file REGIONS entry (none sets it),
   *  so the call site's `?? (REGION.label === 'חיפה')` fallback preserves
   *  today's exact behavior for all of them — this field only takes effect for
   *  a region resolved from `city_registrations` (src/lib/city-registrations.ts). */
  computeLighting?: boolean;
}

const REGIONS: Record<string, Region> = {
  // זכרון יעקב (admin boundary rel/1392828, wikidata Q198399) + רמת הנדיב (nature park,
  // just south of the town — outside the admin area, swept via an explicit bbox).
  zichron: {
    key: 'zichron',
    label: 'זכרון יעקב',
    areaWikidata: 'Q198399',
    extraBboxes: [{ latMin: 32.530, lonMin: 34.910, latMax: 32.578, lonMax: 34.970 }], // Ramat HaNadiv
    bbox: { latMin: 32.530, lonMin: 34.900, latMax: 32.600, lonMax: 34.985 },
    batchId: 'zichron-geodiscovery-2026-07-10',
  },
  // אשקלון — full municipal boundary (rel/1376782, wikidata Q60956, admin_level 8).
  // Whole city: coast promenade + marina, national park, and every neighbourhood are
  // all inside the admin area, so no extra bbox is needed. The bbox below is the
  // nominatim bounding box of the boundary (used for DEM tiles + blocking polygons).
  ashkelon: {
    key: 'ashkelon',
    label: 'אשקלון',
    areaWikidata: 'Q60956',
    bbox: { latMin: 31.619, lonMin: 34.492, latMax: 31.719, lonMax: 34.615 },
    batchId: 'ashkelon-geodiscovery-2026-07-22',
  },

  // ── אשקלון by neighbourhood — smaller, focused bboxes (Overpass returns more, 504s less).
  // All keep label 'אשקלון' so the persisted `city` stays consistent; only the batchId differs,
  // so each neighbourhood batch is reviewable/deletable on its own. bboxes ≈ 2km, from Nominatim.
  // Overlap between adjacent boxes is harmless: a shared way is upserted once (by externalId).
  'ashkelon-marina': {   // מרינה + טיילת החוף (coastal strip)
    key: 'ashkelon-marina', label: 'אשקלון',
    extraBboxes: [{ latMin: 31.665, lonMin: 34.548, latMax: 31.690, lonMax: 34.562 }],
    bbox: { latMin: 31.665, lonMin: 34.548, latMax: 31.690, lonMax: 34.562 },
    batchId: 'ashkelon-marina-2026-07-22',
  },
  'ashkelon-afridar': {  // אפרידר (Nominatim place=neighbourhood 31.6775,34.5673)
    key: 'ashkelon-afridar', label: 'אשקלון',
    extraBboxes: [{ latMin: 31.6675, lonMin: 34.5573, latMax: 31.6875, lonMax: 34.5773 }],
    bbox: { latMin: 31.6675, lonMin: 34.5573, latMax: 31.6875, lonMax: 34.5773 },
    batchId: 'ashkelon-afridar-2026-07-22',
  },
  'ashkelon-barnea': {   // ברנע / גני ברנע (Nominatim 31.6835,34.5805)
    key: 'ashkelon-barnea', label: 'אשקלון',
    extraBboxes: [{ latMin: 31.6735, lonMin: 34.5705, latMax: 31.6935, lonMax: 34.5905 }],
    bbox: { latMin: 31.6735, lonMin: 34.5705, latMax: 31.6935, lonMax: 34.5905 },
    batchId: 'ashkelon-barnea-2026-07-22',
  },
  'ashkelon-neve-yam': { // נווה ים (south, by Tel Ashkelon / שביל החומה, ~31.650,34.533)
    key: 'ashkelon-neve-yam', label: 'אשקלון',
    extraBboxes: [{ latMin: 31.640, lonMin: 34.525, latMax: 31.660, lonMax: 34.543 }],
    bbox: { latMin: 31.640, lonMin: 34.525, latMax: 31.660, lonMax: 34.543 },
    batchId: 'ashkelon-neve-yam-2026-07-22',
  },
  'ashkelon-national-park': { // גן לאומי אשקלון (real protected_area bbox)
    key: 'ashkelon-national-park', label: 'אשקלון',
    extraBboxes: [{ latMin: 31.6438, lonMin: 34.5335, latMax: 31.6718, lonMax: 34.5568 }],
    bbox: { latMin: 31.6438, lonMin: 34.5335, latMax: 31.6718, lonMax: 34.5568 },
    batchId: 'ashkelon-national-park-2026-07-22',
  },
  'ashkelon-sderot-yerushalayim': { // שדרות ירושלים (north segment, עיר ימים ~31.702,34.581)
    key: 'ashkelon-sderot-yerushalayim', label: 'אשקלון',
    extraBboxes: [{ latMin: 31.6924, lonMin: 34.5710, latMax: 31.7080, lonMax: 34.5910 }],
    bbox: { latMin: 31.6924, lonMin: 34.5710, latMax: 31.7080, lonMax: 34.5910 },
    batchId: 'ashkelon-sderot-yerushalayim-2026-07-22',
  },
  'ashkelon-park': {     // פארק אשקלון — ⚠ ambiguous in OSM; boxed on central הסיטי area
    key: 'ashkelon-park', label: 'אשקלון',
    extraBboxes: [{ latMin: 31.6666, lonMin: 34.5470, latMax: 31.6866, lonMax: 34.5640 }],
    bbox: { latMin: 31.6666, lonMin: 34.5470, latMax: 31.6866, lonMax: 34.5640 },
    batchId: 'ashkelon-park-2026-07-22',
  },

  // Dedicated batch for the Mapbox foot round-trip loops (run with --roundtrips --skip-osm).
  // bbox = whole city (for park-anchor filtering + DEM + blocking polygons). Anchors below +
  // every `parks` gym inside the city bbox, each × 3/5/10 km.
  'ashkelon-roundtrips': {
    key: 'ashkelon-roundtrips', label: 'אשקלון',
    bbox: { latMin: 31.619, lonMin: 34.492, latMax: 31.719, lonMax: 34.615 },
    roundTripAnchors: [
      { key: 'marina', label: 'מרינה אשקלון', lat: 31.6826, lng: 34.5559 },
      { key: 'promenade', label: 'טיילת אשקלון', lat: 31.6670, lng: 34.5490 },
      { key: 'national-park', label: 'גן לאומי אשקלון', lat: 31.6577, lng: 34.5444 },
    ],
    batchId: 'ashkelon-roundtrip-2026-07-22',
  },

  // חיפה — full municipal boundary (rel/1387888, wikidata Q41621, admin_level 8).
  // Discovery scope is bbox-only (areaWikidata deliberately NOT set — see
  // boundaryClipWikidata's doc comment on the Region interface: using the admin
  // area as discovery scope collapses marked-trail relation matching). bbox
  // matches scripts/map-city.ts's CITY_CONFIGS.haifa exactly (estimated ±0.06°
  // around the authority's center — no existing route/segment geometry to derive
  // a tighter one from as of 19.08.2026). boundaryClipWikidata drives the
  // post-discovery clip only, dropping real-but-out-of-bounds candidates (e.g.
  // שוויצריה הקטנה / Little Switzerland, ~2km outside the real boundary).
  haifa: {
    key: 'haifa',
    label: 'חיפה',
    extraBboxes: [{ latMin: 32.734, lonMin: 34.9296, latMax: 32.854, lonMax: 35.0496 }],
    bbox: { latMin: 32.734, lonMin: 34.9296, latMax: 32.854, lonMax: 35.0496 },
    boundaryClipWikidata: 'Q41621',
    batchId: 'haifa-geodiscovery-2026-08-19',
  },
};

// Declared (not initialized) here, at module scope, so every function below
// that closes over REGION keeps compiling against a plain `Region` type —
// exactly as before this stage — rather than `Region | undefined`, which
// would force a defensive `!` or null-check onto every one of the ~30 call
// sites throughout this file for no behavioral reason. Actually assigned by
// resolveRegion() below, called as the very first line of main() — nothing
// that reads REGION is ever invoked before main() starts (confirmed: every
// other function in this file is a declaration, not top-level executed
// code). This is a real, load-bearing assumption, not just a convenience —
// don't add any top-level (module-scope, outside a function body) code that
// reads REGION above main()'s own resolution call.
let REGION: Region;

// In-file REGIONS always wins on any key collision (checked first) — zero
// behavior change for any of the 11 hand-tuned entries, since this fallback
// branch is structurally unreachable for them. Only a regionArg that ISN'T
// an in-file key ever reaches the city_registrations lookup (Stage A, city-
// orchestrator plan, 02.09.2026). A real async function (not top-level
// await, which this project's tsconfig doesn't enable — see main()'s own
// call site) so this compiles cleanly without any tsconfig change.
async function resolveRegion(): Promise<Region> {
  const found = REGIONS[regionArg];
  if (found) return found;
  const db = initFb();
  const doc = await db.collection('city_registrations').doc(regionArg).get();
  if (doc.exists) {
    try {
      const resolved = validateCityRegistration({ ...doc.data(), key: regionArg });
      console.log(`📍 Loaded region "${regionArg}" from city_registrations (not in-file REGIONS).`);
      return resolved;
    } catch (err) {
      console.error(`❌ city_registrations/${regionArg} failed validation: ${(err as Error).message}`);
      process.exit(1);
    }
  }
  console.error(`Unknown region "${regionArg}". Known in-file: ${Object.keys(REGIONS).join(', ')}. Also checked city_registrations/${regionArg} — not found.`);
  process.exit(1);
}

// Length windows (meters) per source.
// LEN_TRAIL_MIN raised 400 -> 600 (23.08.2026, Haifa drop-audit): every trail-relation
// candidate is BY CONSTRUCTION a marked-trail member (that's the discovery mechanism
// itself, see the route~ query below) — so under the finalized recreational-quality gate
// (RECREATIONAL_* below), a trail candidate's "recreational character" test is always
// unconditionally satisfied, and the ONLY variable is this length floor. Confirmed by
// hand-auditing all 39 Haifa trail-relation candidates (see
// .claude/knowledge/city-mapping-learnings.md): 600m correctly drops the 412m
// "שביל חיפה - הדר עליון ורמת הדר" fragment (a real stub of a much longer relation) while
// keeping its other 3 genuine fragments (1221m/1411m/5361m) and 32/39 overall.
const LEN_TRAIL_MIN = 600, LEN_TRAIL_MAX = 25000;
const LEN_LOOP_MIN = 400, LEN_LOOP_MAX = 15000;
const LEN_SEG_MIN = 500, LEN_SEG_MAX = 12000;
// Named non-loop segments/promenades (post-stitching) get a much lower floor
// than the general LEN_SEG_MIN — filters true noise (a several-meter OSM
// stub) without dropping a real, short, famous promenade (e.g. a ~288m
// named promenade that LEN_SEG_MIN would otherwise silently drop). Deliberately
// NOT applied to loop-kind candidates (see LEN_LOOP_MIN) — a loop is a
// different length regime by nature. Starting number, flagged for review —
// not derived from data (Stage 7 plan, item C).
const LEN_SEG_MIN_NAMED = 50;
const LOOP_CLOSE_M = 60; // start↔end within this ⇒ a loop
// Stitching gap tolerances (meters) — also starting numbers, flagged for
// review (Stage 7 plan, item B). Same-name merges are lower-risk (both
// fragments already share a real name) than cross-name geometric-continuity
// merges (higher false-positive risk — a wrong-direction street crossing
// could chain two unrelated nearby paths), hence the tighter cross-name gap.
const SAME_NAME_GAP_M = 100;
const CROSS_NAME_GAP_M = 35;
// Quality-over-quantity refinement (21.08.2026, per instruction): a short
// named way (below the OLD LEN_SEG_MIN=500 floor — the new territory item C
// opened up) is only kept if it's near a genuine special feature — a park/
// garden polygon (already fetched for item A) or the coastline. Without
// this, the low floor surfaces both real short promenades (Louis, 292m,
// beside the Bahai Gardens) AND ~80 ordinary named walkways between
// buildings (a real Israeli OSM addressing convention) at the same length
// scale — no length threshold alone separates them. Starting number, not
// derived — flagged for review, same as every other threshold in this file.
const SPECIALNESS_RADIUS_M = 150;
// Second refinement (21.08.2026): "within radius of ANY named park/garden"
// was still too loose, verified live — Haifa has many small pocket gardens
// between apartment blocks, so ordinary residential walkways (כורש 181m,
// אוליפנט 209m, בן זכאי 116m, פרישמן 65m) sat near one without being a real
// promenade. Fix: only a park/garden ring whose OWN area clears this
// threshold counts as a specialness signal — a genuinely significant park
// (the Bahai Gardens, beside Louis Promenade) vs. a tiny pocket garden.
// Starting number, not derived — flagged for review, same discipline as
// every other threshold in this file. Coastline proximity is unaffected
// (a line has no area to threshold).
const MIN_PARK_AREA_M2 = 5000; // ~0.5 hectare

// ─── Recreational-quality gate (23.08.2026, Haifa drop-audit) ───────────────────────
// REPLACES the specialness-below-LEN_SEG_MIN rule above for named non-loop segments
// (and, via LEN_TRAIL_MIN above, sets the trail-relation floor too — same gate, one
// finalized rule for both capabilities). That older rule was both too permissive
// (anything >=500m passed unconditionally, no matter how ordinary — flagged live:
// "שביל חיפה - הדר עליון ורמת הדר" 412m, plain named residential streets with 0%
// dedicated infra) and too narrow (didn't apply to trail-relation candidates at all,
// which had no length floor beyond LEN_TRAIL_MIN's original 400m and no composition
// test whatsoever). Read-only investigation audited all 53 Haifa named-segment
// candidates + all 39 trail-relation candidates by hand before this was codified —
// see .claude/knowledge/city-mapping-learnings.md. Result on that data: 64/92 KEEP
// (32/53 named-segment, 32/39 trail-relation).
//
// KEEP a candidate only if BOTH:
//  1. Recreational character: see the sidewalk-hole fix below (27.08.2026) — this
//     used to be a 3-way OR (dedicated>=50% OR marked-trail-member OR
//     special-adjacent+dedicated>=20%); that whole test is now RECREATIONAL_MAJORITY_MIN_FRAC.
//  2. Length: >= RECREATIONAL_LENGTH_FLOOR_TRAIL_M if a marked-trail member (NO exemption
//     for trail membership — a 412m trail fragment is still just 412m), else
//     >= RECREATIONAL_LENGTH_FLOOR_STANDALONE_M.
// Every threshold here is a David-approved number from the audit, not a first guess —
// flagged for review the same as every other constant in this file, but with real
// evidence behind it (the audit's borderline-case table) rather than none.
const RECREATIONAL_DEDICATED_HIGHWAY = new Set(['footway', 'path', 'pedestrian', 'cycleway', 'steps']);
const RECREATIONAL_ORDINARY_HIGHWAY = new Set(['residential', 'tertiary', 'service', 'living_street', 'unclassified']);
const RECREATIONAL_LENGTH_FLOOR_STANDALONE_M = 800;
const RECREATIONAL_LENGTH_FLOOR_TRAIL_M = 600;

// ─── Sidewalk-hole fix (27.08.2026, David-directed) ─────────────────────────────────
// Read-only investigation (prior session) found the gate above counted footway=sidewalk
// (a road-side pedestrian strip, not a real promenade) as "dedicated infra" at face
// value — validated live: way/325283597 (מרכז הכרמל) is OSM-tagged footway=sidewalk
// (also caught geometrically: runs within SIDEWALK_PROXIMITY_M of, and bearing-parallel
// to, a road for most of its length) yet passed the old dedicated-frac test outright.
// A detector (tag signal footway=sidewalk / is_sidepath=yes, OR the geometric parallel-
// to-road test) was cross-validated both directions against known cases (flags the
// sidewalk; does NOT flag five known-genuine טיילת קרית אליעזר legs) before being wired
// in below — see .claude/knowledge/city-mapping-learnings.md.
//
// This REPLACES the OLD 3-way OR test (dedicated>=50% OR marked-trail-member OR
// special-adjacent+dedicated>=20%) with ONE unified, stricter rule, applied to BOTH
// named-segment AND trail-relation candidates — no exemption survives for either
// (a "trail" that's 61% sidewalk isn't a real route, per instruction; "majority
// sidewalk+street drops" is unconditional, so the old low-bar special-adjacency
// escape is retired too, not just patched):
//   genuine-recreational length — dedicated infra EXCLUDING sidewalk-like footways,
//   PLUS (named-segment candidates only) any way that's independently a member of
//   some OTHER marked-trail relation even under a non-dedicated tag (a trail-relation
//   candidate's own ways are ALL its own relation's members by construction, so this
//   bonus would be vacuous there — it gets no bonus, just its raw composition) — must
//   be >= RECREATIONAL_MAJORITY_MIN_FRAC of the candidate's total length. Sidewalk-like
//   footway length and ordinary-street length both count AGAINST.
const SIDEWALK_PROXIMITY_M = 15;
const SIDEWALK_ANGLE_DEG = 30;
const SIDEWALK_FRACTION_THRESHOLD = 0.6;
const ROAD_REFERENCE_HIGHWAY = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'living_street', 'unclassified', 'service']);
const RECREATIONAL_MAJORITY_MIN_FRAC = 0.5;

// ─────────────────────────────── geometry helpers ───────────────────────────────
const R = 6371000;
const hav = (a: number[], b: number[]) => { const p1 = a[0] * Math.PI / 180, p2 = b[0] * Math.PI / 180, dp = (b[0] - a[0]) * Math.PI / 180, dl = (b[1] - a[1]) * Math.PI / 180; return 2 * R * Math.asin(Math.sqrt(Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2)); };
const pathLen = (pts: number[][]) => pts.reduce((s, _, i) => i ? s + hav(pts[i - 1], pts[i]) : 0, 0);
// Sidewalk-hole fix geometry: compass bearing a→b, and the 0-90° difference between two
// bearings treating a line as undirected (a road and a sidewalk running "parallel" may be
// digitized in opposite directions in OSM, so 170° apart is just as parallel as 10°).
function bearingDeg(a: number[], b: number[]): number {
  const la1 = a[0] * Math.PI / 180, la2 = b[0] * Math.PI / 180, dLo = (b[1] - a[1]) * Math.PI / 180;
  const y = Math.sin(dLo) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLo);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
function angleDiffMod180(a: number, b: number): number { const d = Math.abs(a - b) % 180; return d > 90 ? 180 - d : d; }
const bboxOf = (pts: number[][]) => ({ minLat: Math.min(...pts.map(p => p[0])), maxLat: Math.max(...pts.map(p => p[0])), minLng: Math.min(...pts.map(p => p[1])), maxLng: Math.max(...pts.map(p => p[1])) });
// internal [lat,lng] → persisted {lng,lat} objects (Firestore forbids nested arrays;
// matches official_routes.path — normalizeStoredRoutePath reads it back).
const toPath = (pts: number[][]) => pts.map(p => ({ lng: p[1], lat: p[0] }));
const inBbox = (p: number[], b: Region['bbox']) => p[0] >= b.latMin && p[0] <= b.latMax && p[1] >= b.lonMin && p[1] <= b.lonMax;
function inPoly(p: number[], poly: number[][]): boolean {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const yi = poly[i][0], xi = poly[i][1], yj = poly[j][0], xj = poly[j][1];
    if (((yi > p[0]) !== (yj > p[0])) && (p[1] < (xj - xi) * (p[0] - yi) / (yj - yi) + xi)) ins = !ins;
  }
  return ins;
}
const wayGeom = (e: any): number[][] => (e.geometry || []).map((p: any) => [p.lat, p.lon]);
// OSM `name` tags on different fragments of the SAME real promenade sometimes
// disagree only in whitespace — found live in this exact run: two of three
// Kiryat Eliezer promenade fragments use U+00A0 (non-breaking space) between
// words, the third uses a plain space, so exact-string matching silently
// treated them as different names and only 2/3 fragments stitched together.
// Collapse any whitespace run (including nbsp) to a single plain space before
// using a name as a same-name-stitching grouping key or promenade-name lookup
// — the DISPLAYED name benefits from this too (an invisible nbsp reads
// identically to a space either way).
const normalizeName = (name: string): string => name
  // Zero-width RTL/LTR/joiner marks (U+200B-U+200F, U+FEFF) — real for
  // mixed-direction Hebrew OSM tags, same class of invisible-character bug
  // as the whitespace/nbsp case below (an independent code review,
  // 21.08.2026, flagged this as the same failure mode, not yet covered).
  .replace(/[​-‏﻿]+/g, '')
  .replace(/\s+/g, ' ') // \s already covers U+00A0 (nbsp) per the ECMAScript spec
  .trim();

// ─────────────────────────────── Overpass ───────────────────────────────
const MIRRORS = ['https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass-api.de/api/interpreter'];
async function overpass(q: string): Promise<any> {
  for (let a = 0; a < 6; a++) for (const m of MIRRORS) {
    try {
      const buf: Buffer = await new Promise((res, rej) => {
        const req = https.request(m, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'OUT/1.0 (office@appout.co.il)' } }, r => { const b: Buffer[] = []; r.on('data', d => b.push(d)); r.on('end', () => r.statusCode === 200 ? res(Buffer.concat(b)) : rej(new Error('HTTP ' + r.statusCode))); });
        req.on('error', rej); req.setTimeout(190000, () => req.destroy(new Error('socket timeout'))); req.write('data=' + encodeURIComponent(q)); req.end();
      });
      return JSON.parse(buf.toString());
    } catch (e: any) { console.error(`  overpass ${m.split('/')[2]} → ${e.message}, retry…`); await new Promise(r => setTimeout(r, 6000)); }
  }
  throw new Error('overpass failed (all mirrors)');
}
// Region selector: an area (from wikidata) written to .rgn, PLUS any extra bboxes.
// Returns { areaDecl, forEach(bodyFn) } so each query targets the whole region.
function regionSelectors(): { decl: string; scopes: string[] } {
  const decl = REGION.areaWikidata ? `area["wikidata"="${REGION.areaWikidata}"]->.rgn;` : '';
  const scopes: string[] = [];
  if (REGION.areaWikidata) scopes.push('(area.rgn)');
  for (const bb of REGION.extraBboxes || []) scopes.push(`(${bb.latMin},${bb.lonMin},${bb.latMax},${bb.lonMax})`);
  return { decl, scopes };
}

// ─────────────────────────────── Mapbox Terrain-RGB DEM ───────────────────────────────
const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
const Z = 14, nTiles = 2 ** Z;
const lon2gx = (lo: number) => (lo + 180) / 360 * 256 * nTiles;
const lat2gy = (la: number) => { const r = la * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 256 * nTiles; };
function decodePNG(buf: Buffer) {
  let p = 8, W = 0, H = 0, ct = 0; const idat: Buffer[] = [];
  while (p < buf.length) { const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len); if (type === 'IHDR') { W = data.readUInt32BE(0); H = data.readUInt32BE(4); ct = data[9]; } else if (type === 'IDAT') idat.push(data); else if (type === 'IEND') break; p += 12 + len; }
  const raw = zlib.inflateSync(Buffer.concat(idat)); const ch = ct === 6 ? 4 : ct === 2 ? 3 : ct === 0 ? 1 : 4; const stride = W * ch; const out = Buffer.alloc(H * stride); let pos = 0;
  for (let y = 0; y < H; y++) { const ft = raw[pos++]; for (let x = 0; x < stride; x++) { const rv = raw[pos++]; const a = x >= ch ? out[y * stride + x - ch] : 0, b = y > 0 ? out[(y - 1) * stride + x] : 0, c = (x >= ch && y > 0) ? out[(y - 1) * stride + x - ch] : 0; let v = rv; if (ft === 1) v = rv + a; else if (ft === 2) v = rv + b; else if (ft === 3) v = rv + ((a + b) >> 1); else if (ft === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v = rv + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); } out[y * stride + x] = v & 0xff; } }
  return { width: W, height: H, ch, data: out };
}
const fetchBuf = (url: string): Promise<Buffer> => new Promise((res, rej) => { const req = https.get(url, r => { if (r.statusCode !== 200) { r.resume(); return rej(new Error('HTTP ' + r.statusCode)); } const b: Buffer[] = []; r.on('data', d => b.push(d)); r.on('end', () => res(Buffer.concat(b))); }); req.on('error', rej); req.setTimeout(30000, () => req.destroy(new Error('socket timeout'))); });
const tiles = new Map<string, ReturnType<typeof decodePNG>>();
async function loadTiles() {
  if (!TOKEN) { console.warn('  ⚠ no NEXT_PUBLIC_MAPBOX_TOKEN — DEM enrichment skipped (elevationGain=0)'); return; }
  const b = REGION.bbox;
  const txMin = Math.floor(lon2gx(b.lonMin) / 256), txMax = Math.floor(lon2gx(b.lonMax) / 256), tyMin = Math.floor(lat2gy(b.latMax) / 256), tyMax = Math.floor(lat2gy(b.latMin) / 256);
  for (let tx = txMin; tx <= txMax; tx++) for (let ty = tyMin; ty <= tyMax; ty++) { try { tiles.set(`${tx}_${ty}`, decodePNG(await fetchBuf(`https://api.mapbox.com/v4/mapbox.terrain-rgb/${Z}/${tx}/${ty}.pngraw?access_token=${TOKEN}`))); } catch {} }
}
function pxElev(ix: number, iy: number): number | null { const tx = Math.floor(ix / 256), ty = Math.floor(iy / 256), t = tiles.get(`${tx}_${ty}`); if (!t) return null; const idx = ((iy - ty * 256) * t.width + (ix - tx * 256)) * t.ch; return -10000 + (t.data[idx] * 65536 + t.data[idx + 1] * 256 + t.data[idx + 2]) * 0.1; }
function elevAt(lon: number, lat: number): number | null { const gx = lon2gx(lon), gy = lat2gy(lat), x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0; const e00 = pxElev(x0, y0), e10 = pxElev(x0 + 1, y0), e01 = pxElev(x0, y0 + 1), e11 = pxElev(x0 + 1, y0 + 1); if (e00 == null || e10 == null || e01 == null || e11 == null) return e00; return e00 * (1 - fx) * (1 - fy) + e10 * fx * (1 - fy) + e01 * (1 - fx) * fy + e11 * fx * fy; }
// DEM elevation profile → total ascent + max local grade over a polyline.
function demProfile(pts: number[][]): { gainM: number; maxGrade: number } | null {
  if (!tiles.size) return null;
  const STEP = 15; const rs: number[][] = [pts[0]]; let acc = 0;
  for (let i = 1; i < pts.length; i++) { let from = pts[i - 1], segLen = hav(from, pts[i]); while (acc + segLen >= STEP) { const t = (STEP - acc) / segLen; const np = [from[0] + (pts[i][0] - from[0]) * t, from[1] + (pts[i][1] - from[1]) * t]; rs.push(np); from = np; segLen = hav(from, pts[i]); acc = 0; } acc += segLen; }
  const el = rs.map(p => elevAt(p[1], p[0])); if (el.some(e => e == null)) return null;
  const sm = (el as number[]).map((_, i) => { const w = [el[i - 1], el[i], el[i + 1]].filter(x => x != null) as number[]; return w.reduce((a, b) => a + b, 0) / w.length; });
  let gain = 0, maxG = 0; for (let i = 1; i < sm.length; i++) { const d = sm[i] - sm[i - 1]; if (d > 0) gain += d; maxG = Math.max(maxG, d / STEP); }
  return { gainM: +gain.toFixed(1), maxGrade: +(maxG * 100).toFixed(1) };
}

// ─────────────────────────────── discovery ───────────────────────────────
type Candidate = {
  externalId: string; osmName: string | null; kind: 'trail' | 'loop' | 'segment' | 'park';
  pts: number[][]; lengthM: number; isLoop: boolean; surface: 'road' | 'trail'; highway?: string; relRef?: string;
  sourceName?: string; // overrides source.name (round-trips → 'Mapbox Round-Trip (foot)'); OSM → default
  // Individual OSM way refs ("way/<id>") merged into this candidate by the
  // same-name/geometric-continuity stitching passes, or by the relation-
  // rejection rescue path — undefined for a plain single-way/single-relation
  // candidate (no behavior change there). Written TOP-LEVEL on the Firestore
  // doc, NOT nested under `source` (`source` itself isn't schema-validated
  // as a nested object) — see RouteFieldsSchema.sourceWayIds (schemas.ts)
  // and the top-level Route.sourceWayIds field (route.types.ts, sibling of
  // Route.source, not inside it).
  sourceWayIds?: string[];
  // Raw OSM surface=* tag, when available — only the standalone/loop/segment
  // branch below has direct way-tag access; trail-relation-derived and
  // Mapbox-round-trip candidates have none (undefined, never guessed).
  // Mapped to the granular SurfaceType in buildRouteDoc via mapOsmSurfaceToType.
  osmSurface?: string;
  // Broad bicycle-infrastructure detection (19.08.2026, standard for every region,
  // not a fallback): set when highway=cycleway (dedicated way), bicycle=designated|
  // yes on a footway/path (shared/permitted-cycling path), segregated=yes (shared
  // foot/bike path), OR the way was fetched via the dedicated road-bike-lane query
  // (cycleway=lane|track|opposite_lane|opposite_track / cycleway:left|right=* — a
  // lane painted onto an ordinary street). Length/name floor deliberately left
  // as-is for these candidates (same 500-12000m + named-only bar as every other
  // segment) — real dedicated cycleway fragments that are unnamed or individually
  // short (a common OSM way-splitting pattern) are correctly NOT surfaced by this
  // floor; confirmed via direct Overpass query against Haifa's real Bat Galim /
  // Hulda Gurevich promenade cycleway. Deferred, not silently dropped — see the
  // Haifa runbook's Part A for the concrete example.
  isBicycle?: boolean;
};

// Stitch relation member ways (that intersect the region) into ordered polylines by
// greedily chaining nearest endpoints. Splits into separate lines where a gap is large
// (the trail leaves + re-enters the region). Each returned line is one local segment.
function stitch(ways: number[][][], gapM = 80): number[][][] {
  const segs = ways.filter(w => w.length >= 2);
  if (!segs.length) return [];
  const used = new Array(segs.length).fill(false);
  const out: number[][][] = [];
  let curIdx = 0;
  while (used.some(u => !u)) {
    let start = used.findIndex(u => !u); used[start] = true;
    let line = segs[start].slice();
    let extended = true;
    while (extended) {
      extended = false;
      const tail = line[line.length - 1], head = line[0];
      let best = -1, bestD = gapM, bestRev = false, atTail = true;
      for (let i = 0; i < segs.length; i++) {
        if (used[i]) continue;
        const s = segs[i], a = s[0], b = s[s.length - 1];
        const dTA = hav(tail, a), dTB = hav(tail, b), dHA = hav(head, a), dHB = hav(head, b);
        const m = Math.min(dTA, dTB, dHA, dHB);
        if (m < bestD) { bestD = m; best = i; if (m === dTA) { atTail = true; bestRev = false; } else if (m === dTB) { atTail = true; bestRev = true; } else if (m === dHA) { atTail = false; bestRev = true; } else { atTail = false; bestRev = false; } }
      }
      if (best >= 0) { used[best] = true; const s = bestRev ? segs[best].slice().reverse() : segs[best].slice(); if (atTail) line = line.concat(s); else line = s.concat(line); extended = true; }
    }
    out.push(line);
    curIdx++;
    if (curIdx > 5000) break;
  }
  return out;
}

// Same greedy nearest-endpoint chaining as stitch() above, but also tracks
// which input item(s) contributed to each output line — needed for the
// promenade-stitching passes' `sourceWayIds` provenance and for the
// relation-rejection rescue's per-line (not per-relation) way lookup.
// stitch() itself is left untouched — still used unmodified for trail-
// relation members and the admin-boundary ring — so this is purely additive.
function stitchWithIds<T>(items: Array<{ pts: number[][]; id: T }>, gapM: number): Array<{ pts: number[][]; ids: T[] }> {
  const segs = items.filter(it => it.pts.length >= 2);
  if (!segs.length) return [];
  const used = new Array(segs.length).fill(false);
  const out: Array<{ pts: number[][]; ids: T[] }> = [];
  let curIdx = 0;
  while (used.some(u => !u)) {
    let start = used.findIndex(u => !u); used[start] = true;
    let line = segs[start].pts.slice();
    let ids: T[] = [segs[start].id];
    let extended = true;
    while (extended) {
      extended = false;
      const tail = line[line.length - 1], head = line[0];
      let best = -1, bestD = gapM, bestRev = false, atTail = true;
      for (let i = 0; i < segs.length; i++) {
        if (used[i]) continue;
        const s = segs[i].pts, a = s[0], b = s[s.length - 1];
        const dTA = hav(tail, a), dTB = hav(tail, b), dHA = hav(head, a), dHB = hav(head, b);
        const m = Math.min(dTA, dTB, dHA, dHB);
        if (m < bestD) { bestD = m; best = i; if (m === dTA) { atTail = true; bestRev = false; } else if (m === dTB) { atTail = true; bestRev = true; } else if (m === dHA) { atTail = false; bestRev = true; } else { atTail = false; bestRev = false; } }
      }
      if (best >= 0) {
        used[best] = true;
        const s = bestRev ? segs[best].pts.slice().reverse() : segs[best].pts.slice();
        if (atTail) { line = line.concat(s); ids.push(segs[best].id); } else { line = s.concat(line); ids = [segs[best].id, ...ids]; }
        extended = true;
      }
    }
    out.push({ pts: line, ids });
    curIdx++;
    if (curIdx > 5000) break;
  }
  return out;
}

async function discover(): Promise<{ candidates: Candidate[]; blockPolys: { poly: number[][]; label: string }[]; stats: any }> {
  const { decl, scopes } = regionSelectors();
  const stats: any = { relations: 0, relLines: 0, relRescued: 0, ways: 0, loops: 0, segments: 0, stitchedSameName: 0, stitchedCrossName: 0, parks: 0 };

  // Sidewalk-hole fix: road reference network + detector, fetched/defined FIRST —
  // needed by BOTH the trail-relation gate (below, step 1) and the named-segment gate
  // (step 2, further down), so it must be ready before either runs.
  const roadSegGrid = buildSegGrid(await fetchRoadReferenceSegments(REGION.bbox));
  const sidewalkMemo = new Map<number, boolean>();
  function isSidewalkLikeWay(id: number, footwayTag: string | undefined, isSidepath: boolean, pts: number[][], lenM: number): boolean {
    if (sidewalkMemo.has(id)) return sidewalkMemo.get(id)!;
    let flagged = footwayTag === 'sidewalk' || isSidepath;
    if (!flagged && lenM > 0 && pts.length >= 2) {
      const SAMPLE_SPACING_M = 10;
      let parallelLen = 0;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const segLen = hav(a, b); if (!segLen) continue;
        const wayBearing = bearingDeg(a, b);
        const steps = Math.max(1, Math.round(segLen / SAMPLE_SPACING_M));
        for (let s = 0; s < steps; s++) {
          const f = (s + 0.5) / steps;
          const p = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
          let best = Infinity, bestBearing = 0;
          for (const rs of nearbySegGrid(p, roadSegGrid)) {
            const { distM } = pointToSegDistAndFrac(p, rs.a, rs.b);
            if (distM < best) { best = distM; bestBearing = bearingDeg(rs.a, rs.b); }
          }
          const sampleLen = segLen / steps;
          if (best <= SIDEWALK_PROXIMITY_M && angleDiffMod180(wayBearing, bestBearing) <= SIDEWALK_ANGLE_DEG) parallelLen += sampleLen;
        }
      }
      flagged = (parallelLen / lenM) >= SIDEWALK_FRACTION_THRESHOLD;
    }
    sidewalkMemo.set(id, flagged);
    return flagged;
  }
  // Per-way "does this length count toward genuine recreational content" test — shared
  // by the trail-relation gate and the named-segment gate. `isTrailMemberElsewhere` bonus
  // is only meaningful for named-segment candidates — see the sidewalk-hole-fix header
  // comment above RECREATIONAL_MAJORITY_MIN_FRAC for why a trail-relation candidate's OWN
  // ways never get it (it would be vacuous — they're all its own relation's members).
  // The sidewalk test is scoped to dedicated-tagged (footway-family) ways ONLY, and — when
  // it fires — disqualifies the way OUTRIGHT, without falling through to the trail-bonus.
  // Caught live: a real, ground-truth-confirmed OSM footway=sidewalk way on Louis
  // Promenade (the exact motivating example for this whole fix) is ALSO a member of a
  // marked-trail relation (real hiking/foot routes commonly detour through a city via its
  // sidewalks where no dedicated path exists) — an earlier version of this function fell
  // through to the bonus for a disqualified-by-sidewalk way, silently re-crediting the
  // very sidewalk this fix exists to exclude. The test is deliberately NOT run against
  // non-footway-family ways (residential/track/etc.) — an ordinary street running near a
  // bigger road is normal street geometry, not a disguised sidewalk, and must stay
  // eligible for the trail-bonus on its own terms.
  function isGenuineRecreationalWay(id: number, highway: string | undefined, footwayTag: string | undefined, isSidepath: boolean, pts: number[][], lenM: number, isTrailMemberElsewhere: boolean): boolean {
    const isDedicatedTag = !!highway && RECREATIONAL_DEDICATED_HIGHWAY.has(highway);
    if (isDedicatedTag) return !isSidewalkLikeWay(id, footwayTag, isSidepath, pts, lenM);
    return isTrailMemberElsewhere;
  }

  type RawWay = { id: number; name: string; pts: number[][]; highway: string; osmSurface?: string; isBicycle: boolean; footwayTag?: string; isSidepath?: boolean };
  // Named member ways rescued from a trail-relation line that exceeded
  // LEN_TRAIL_MAX (item D) — fed into the SAME same-name/geometric-continuity
  // stitching pipeline as standalone ways below, so a rescue doesn't just
  // re-fragment the relation into disconnected named stubs.
  const rescuedRawWays: RawWay[] = [];

  // 1) marked route relations (hiking/foot/walking) intersecting the region → clip members.
  console.log('discovering marked trails (route relations) …');
  const relParts = scopes.map(sc => `rel["route"~"^(hiking|foot|walking|running)$"]${sc};`).join('');
  const relData = await overpass(`[out:json][timeout:180];${decl}(${relParts})->.r;.r out tags;(.r;>;);out geom;`);
  const relTags = new Map<number, any>();
  const relMembersByRel = new Map<number, Array<{ id: number; pts: number[][] }>>();
  // Overpass returns the relation (with members list) + member ways (with geometry + tags).
  const wayById = new Map<number, number[][]>();
  const wayTagsById = new Map<number, any>(); // needed for item D's rescue (named member-way lookup)
  for (const e of relData.elements) { if (e.type === 'way' && e.geometry) { wayById.set(e.id, wayGeom(e)); wayTagsById.set(e.id, e.tags || {}); } }
  for (const e of relData.elements) {
    if (e.type !== 'relation') continue;
    relTags.set(e.id, e.tags || {});
    const memberWays: Array<{ id: number; pts: number[][] }> = [];
    for (const m of e.members || []) if (m.type === 'way' && wayById.has(m.ref)) {
      const g = wayById.get(m.ref)!;
      // clip: keep member ways that actually touch the region (any point in overall bbox)
      if (g.some(p => inBbox(p, REGION.bbox))) memberWays.push({ id: m.ref, pts: g });
    }
    if (memberWays.length) relMembersByRel.set(e.id, memberWays);
  }
  stats.relations = relMembersByRel.size;

  const candidates: Candidate[] = [];
  const seenWayIds = new Set<number>(); // way ids consumed by a trail relation → don't re-emit as standalone
  // item D: way ids that ended up in a KEPT trail line (any relation) — a way
  // can be a member of multiple overlapping relations (Haifa's wadi network);
  // if one relation's line is rejected (rescuing this way) while ANOTHER
  // relation's line containing the SAME way is kept, the rescue must not
  // re-add it — its geometry is already present in the kept trail candidate.
  // Independent code review (21.08.2026) caught this as a gap in the
  // original rescue-dedup (which only prevented double-RESCUE, not
  // rescue-overlapping-a-kept-line). Populated across the whole relation
  // loop below, applied once, after it finishes (rescue order vs. a later
  // relation's keep can't be known mid-loop).
  const keptTrailWayIds = new Set<number>();
  for (const [relId, memberWays] of Array.from(relMembersByRel)) {
    for (const m of (relData.elements.find((e: any) => e.type === 'relation' && e.id === relId)?.members || [])) if (m.type === 'way') seenWayIds.add(m.ref);
    const tags = relTags.get(relId) || {};
    const lines = stitchWithIds(memberWays, 80); // same default gapM as the original stitch()
    let part = 0;
    for (const line of lines) {
      const L = pathLen(line.pts);
      if (L > LEN_TRAIL_MAX) {
        // item D: rescue individually-named member ways FROM THIS REJECTED LINE
        // ONLY (not the whole relation — a sibling line from the same relation
        // may already be kept, and rescuing its ways too would duplicate them).
        for (const wid of line.ids) {
          const mt = wayTagsById.get(wid) || {};
          if (mt.name) rescuedRawWays.push({ id: wid, name: normalizeName(mt.name), pts: wayById.get(wid)!, highway: mt.highway, osmSurface: mt.surface, isBicycle: false, footwayTag: mt.footway, isSidepath: mt.is_sidepath === 'yes' });
        }
        stats.relRescued++;
        continue;
      }
      if (L < LEN_TRAIL_MIN) continue;
      // Sidewalk-hole fix: no marked-trail-membership exemption anymore (that was the
      // OLD gate's "markedTrail" unconditional pass) — a trail candidate's own
      // composition (dedicated infra EXCLUDING sidewalk-like footways) must clear the
      // same majority bar as a named segment. No trail-bonus here (last arg `false`):
      // every way in `line.ids` is already a member of THIS relation by construction,
      // so an "is this way a trail member" bonus would be vacuous for this loop.
      let trailGenuineLen = 0, trailTotalLen = 0;
      for (const wid of line.ids) {
        const wt = wayTagsById.get(wid) || {};
        const wpts = wayById.get(wid) || [];
        const wlen = pathLen(wpts);
        trailTotalLen += wlen;
        if (isGenuineRecreationalWay(wid, wt.highway, wt.footway, wt.is_sidepath === 'yes', wpts, wlen, false)) trailGenuineLen += wlen;
      }
      const trailMajorityFrac = trailTotalLen > 0 ? trailGenuineLen / trailTotalLen : 0;
      if (trailMajorityFrac < RECREATIONAL_MAJORITY_MIN_FRAC) { stats.recreationalGateDropped = (stats.recreationalGateDropped || 0) + 1; continue; }
      const isLoop = hav(line.pts[0], line.pts[line.pts.length - 1]) < LOOP_CLOSE_M && L > LEN_LOOP_MIN;
      candidates.push({ externalId: `osm:rel/${relId}${lines.length > 1 ? `#${part}` : ''}`, osmName: tags.name || null, kind: 'trail', pts: line.pts, lengthM: Math.round(L), isLoop, surface: 'trail', relRef: `rel/${relId}` });
      for (const wid of line.ids) keptTrailWayIds.add(wid);
      part++; stats.relLines++;
    }
  }

  // 1.5) NEW, moved earlier (21.08.2026, quality-over-quantity refinement) —
  // park/garden rings + coastline points, fetched now instead of at the end,
  // because the short-named-way specialness gate below (step 2's final
  // classification) needs them as input. buildParkLoopCandidates(parkRings)
  // is still called at the very end (step 3), reusing these same rings — no
  // second fetch.
  const parkRings = await fetchParkGardenRings(decl, scopes);
  const coastlinePts = await fetchCoastlinePoints(REGION.bbox);
  // Second refinement: only a SIGNIFICANT park/garden (area ≥ MIN_PARK_AREA_M2)
  // counts as a specialness signal — see that constant's own comment. Logged
  // so the real computed areas (not just the pass/fail outcome) are visible
  // for tuning review, not just asserted.
  const significantParkRings = parkRings.filter(pr => ringAreaM2(pr.ring) >= MIN_PARK_AREA_M2);
  console.log(`  park/garden rings: ${parkRings.length} named, ${significantParkRings.length} clear the ${MIN_PARK_AREA_M2}m² significance threshold: ${significantParkRings.map(pr => pr.name).join(', ') || '(none)'}`);
  stats.parkRingsTotal = parkRings.length; stats.parkRingsSignificant = significantParkRings.length;

  // 2) standalone NAMED footway/path/track/pedestrian/cycleway ways (the
  // proven-safe vocabulary, unchanged) PLUS — "street-based promenades stay
  // continuous", item B, NARROWLY scoped — named living_street/residential/
  // service/tertiary/unclassified ways, but ONLY when a way's name EXACTLY
  // MATCHES the name of an already-real pedestrian-tagged way found in the
  // SAME fetch. A first implementation admitted ANY named street-type way
  // unconditionally and was caught live in this exact dry-run: combined with
  // item C's low named-segment floor, it flooded Haifa with ~640 ordinary
  // named residential streets (e.g. a bare 51m "סלים ג'ובראן" block) — real
  // named streets, but not promenades, and not what this stage exists to
  // surface. The fix: a street-type way only ever joins as a same-named
  // CONTINUATION of a genuine footway/path/pedestrian/track/cycleway
  // promenade (e.g. a promenade that briefly changes OSM highway tag at one
  // intersection) — never as an independently-viable candidate on its own,
  // which is what let ordinary streets in before. Every NAMED standalone
  // candidate must clear item F's bar — but see the UNNAMED bridge-way
  // collection just below: an unnamed footway/path/pedestrian/track way is
  // now also collected, not to become its own candidate (F's "no anonymous
  // junk" guarantee still holds — see the pass-2 discard rule), but to let
  // pass 2 bridge a real physical gap between two named promenades whose OSM
  // tagging happens to break at an unnamed connector segment (found live:
  // Louis Promenade → an unnamed ~200m pedestrian connector → Panorama
  // Promenade — two different real names, previously never joined).
  console.log('discovering standalone paths / loops (footway|path|track|pedestrian|cycleway) + same-named street continuations + unnamed bridge connectors …');
  const wayParts = scopes.map(sc =>
    `way["highway"~"^(footway|path|track|pedestrian|cycleway)$"]["highway"!~"steps"]${sc};` +
    `way["highway"~"^(living_street|residential|service|tertiary|unclassified)$"]["name"]${sc};`
  ).join('');
  const wayData = await overpass(`[out:json][timeout:180];${decl}(${wayParts})->.w;.w out geom tags;`);
  stats.ways = wayData.elements.filter((e: any) => e.type === 'way').length;
  const PRIMARY_HIGHWAY_RE = /^(footway|path|track|pedestrian|cycleway)$/;
  const primaryRawWays: RawWay[] = [];
  const streetTypeRawWays: RawWay[] = [];
  type BridgeWay = { id: number; pts: number[][]; highway: string; osmSurface?: string; isBicycle: boolean; footwayTag?: string; isSidepath?: boolean };
  const bridgeRawWays: BridgeWay[] = []; // unnamed primary-family ways — connector-only, see pass-2 discard rule below
  const seenStandaloneWayIds = new Set<number>(); // item B: avoid double-discovery vs the bike-lane query below
  for (const e of wayData.elements) {
    if (e.type !== 'way' || !e.geometry || e.geometry.length < 2) continue;
    if (seenWayIds.has(e.id)) continue; // already covered by a trail relation
    const t = e.tags || {};
    if (t.conveying && t.conveying !== 'no') continue;         // escalator / moving walkway
    // Canonical stairs model (Stage 0, route-enrichment-pipeline plan): stairs
    // are never route candidates. OSM-derived stairs live exclusively in
    // climb_segments (type:'stairs', scripts/write-climb-segments-tlv.ts).
    if (t.highway === 'steps') continue;                      // stairs are not routes
    if (t.access === 'private' || t.foot === 'no' || t.foot === 'private') continue;
    if (t.indoor === 'yes' || t.tunnel === 'building_passage') continue;
    const isBicycle = t.highway === 'cycleway' || t.bicycle === 'designated' || t.bicycle === 'yes' || t.segregated === 'yes';
    const isPrimary = PRIMARY_HIGHWAY_RE.test(t.highway);
    if (!t.name) {
      // item F still holds unconditionally: an unnamed way is NEVER its own
      // candidate. Street-type ways were already Overpass-query-filtered to
      // named-only (["name"] in the query itself), so only an unnamed
      // PRIMARY-family way can reach here — kept ONLY as bridge material for
      // pass 2 (see the discard rule there), never added to seenStandaloneWayIds
      // (a bridge way never independently survives, so it never needs to
      // shadow the bike-lane query the way a real standalone candidate does).
      if (isPrimary) bridgeRawWays.push({ id: e.id, pts: wayGeom(e), highway: t.highway, osmSurface: t.surface, isBicycle, footwayTag: t.footway, isSidepath: t.is_sidepath === 'yes' });
      continue;
    }
    const raw: RawWay = { id: e.id, name: normalizeName(t.name), pts: wayGeom(e), highway: t.highway, osmSurface: t.surface, isBicycle, footwayTag: t.footway, isSidepath: t.is_sidepath === 'yes' };
    (isPrimary ? primaryRawWays : streetTypeRawWays).push(raw);
    seenStandaloneWayIds.add(e.id);
  }
  const promenadeNames = new Set(primaryRawWays.map(w => w.name));
  const rawWays: RawWay[] = [...primaryRawWays, ...streetTypeRawWays.filter(w => promenadeNames.has(w.name))];
  // item D: rescued relation-member ways join the same stitching pipeline.
  // Deduplicate by way id — a way can be a member of MULTIPLE overlapping
  // trail relations (a real, common OSM pattern for Haifa's wadi network,
  // where one physical path segment is shared by several regional hiking
  // routes); if two or more of those relations each get rejected for
  // LEN_TRAIL_MAX, the SAME way was rescued once per rejecting relation.
  // Caught live in this exact dry-run: without this dedup, a doubly-rescued
  // way got stitched into its own candidate twice, geometrically doubling
  // back over itself (e.g. "osm:stitched/35014061+35014061+1470987339" — a
  // real way id appearing twice) — a genuine geometry bug, not cosmetic.
  const rawWayIdsSoFar = new Set(rawWays.map(w => w.id));
  for (const w of rescuedRawWays) {
    if (rawWayIdsSoFar.has(w.id)) continue;
    if (keptTrailWayIds.has(w.id)) continue; // already present in a kept trail candidate — don't duplicate its geometry
    rawWayIdsSoFar.add(w.id); rawWays.push(w);
  }

  // Pass 1 — same-name stitching (item B): every raw way sharing an exact
  // `name` tag is greedily chained into one or more continuous lines. A name
  // with only one way is a trivial pass-through (no merge needed).
  const byName = new Map<string, RawWay[]>();
  for (const w of rawWays) { const arr = byName.get(w.name) || []; arr.push(w); byName.set(w.name, arr); }
  // `name: string | null` — null marks a bridge-only group (from an unnamed
  // primary-family way, see the collection loop above). A bridge group must
  // NEVER become its own final candidate — only ever absorbed into a real
  // named chain during pass 2 — see the discard rule there.
  type StitchedGroup = { name: string | null; ids: number[]; pts: number[][]; highway: string; osmSurface?: string; isBicycle: boolean };
  const pass1: StitchedGroup[] = [];
  for (const [name, ways] of Array.from(byName)) {
    const lines = stitchWithIds(ways.map(w => ({ pts: w.pts, id: w.id })), SAME_NAME_GAP_M);
    for (const line of lines) {
      if (line.ids.length > 1) stats.stitchedSameName++;
      const rep = ways.find(w => w.id === line.ids[0])!;
      pass1.push({ name, ids: line.ids, pts: line.pts, highway: rep.highway, osmSurface: rep.osmSurface, isBicycle: line.ids.every(id => ways.find(w => w.id === id)!.isBicycle) });
    }
  }
  function tagFamily(highway: string, isBicycle: boolean): string {
    if (isBicycle) return 'bicycle';
    if (highway === 'footway' || highway === 'path' || highway === 'pedestrian') return 'foot';
    if (highway === 'track') return 'track';
    return 'street'; // living_street/residential/service/tertiary/unclassified
  }

  // Bridge merging (item B, Louis+Panorama fix) — PAIRWISE, not pooled.
  // First attempt fed every unnamed primary-family way into the SAME
  // multi-item pool as pass-1 groups and ran the general greedy stitcher
  // over it — live result: Louis Promenade ballooned to 2058m/35 ways
  // (should have been ~2, Louis+Panorama) because several independently-
  // eligible bridges near Mount Carmel's dense promenade network let the
  // stitcher chain through an entire local footpath cluster, not just
  // bridge the one verified real gap. A length-budget-with-fallback second
  // attempt then regressed the good Louis+Panorama pairing too, because the
  // budget check ran on the WHOLE connected component (bridge+group+bridge+
  // group+...), not the specific pair — the fallback threw out everything
  // in that component when ANY part of it went over budget.
  //
  // Fix: evaluate each unnamed bridge way INDIVIDUALLY, direct-endpoint-only
  // — does bridge endpoint A sit within CROSS_NAME_GAP_M of EXACTLY ONE
  // pass-1 group's endpoint, and bridge endpoint B of a DIFFERENT pass-1
  // group's endpoint? If so, merge those two SPECIFIC groups through the
  // bridge and nothing else. A bridge can never act as a link in a longer
  // chain (no other bridges are ever considered in the same check), and two
  // unrelated named clusters can never merge just because some third
  // unrelated bridge happens to be nearby. This is a structural guarantee,
  // not a length-based judgment call — no MAX_BRIDGE_TOTAL_M constant
  // needed. Ambiguous cases (an endpoint touching 0, 2+, or the SAME group
  // on both ends) are skipped, not guessed.
  function orientToEnd(pts: number[][], endpointIsHead: boolean, wantEndpointLast: boolean): number[][] {
    const alreadyLast = !endpointIsHead;
    return (alreadyLast === wantEndpointLast) ? pts : pts.slice().reverse();
  }
  let bridged: StitchedGroup[] = pass1.slice();
  for (const bw of bridgeRawWays) {
    const bStart = bw.pts[0], bEnd = bw.pts[bw.pts.length - 1];
    // For each bridge endpoint, find every (groupIndex, isHead) match within tolerance.
    const matchesFor = (p: number[]) => {
      const out: Array<{ idx: number; isHead: boolean }> = [];
      for (let i = 0; i < bridged.length; i++) {
        const g = bridged[i];
        if (hav(p, g.pts[0]) < CROSS_NAME_GAP_M) out.push({ idx: i, isHead: true });
        else if (hav(p, g.pts[g.pts.length - 1]) < CROSS_NAME_GAP_M) out.push({ idx: i, isHead: false });
      }
      return out;
    };
    const atStart = matchesFor(bStart), atEnd = matchesFor(bEnd);
    if (atStart.length !== 1 || atEnd.length !== 1) continue; // ambiguous (0 or 2+ touches) — skip
    const mA = atStart[0], mB = atEnd[0];
    if (mA.idx === mB.idx) continue; // both bridge ends touch the SAME group — not a real bridge between two things
    const groupA = bridged[mA.idx], groupB = bridged[mB.idx];
    if (tagFamily(groupA.highway, groupA.isBicycle) !== tagFamily(groupB.highway, groupB.isBicycle)) continue; // compatible-family rule still applies
    const aPts = orientToEnd(groupA.pts, mA.isHead, true);   // A's matching end becomes its LAST point
    const bridgePts = hav(aPts[aPts.length - 1], bStart) <= hav(aPts[aPts.length - 1], bEnd) ? bw.pts : bw.pts.slice().reverse();
    const bPts = orientToEnd(groupB.pts, mB.isHead, false);  // B's matching end becomes its FIRST point
    const merged: StitchedGroup = {
      name: pathLen(groupB.pts) > pathLen(groupA.pts) ? groupB.name : groupA.name, // longer real constituent's name
      ids: [...groupA.ids, bw.id, ...groupB.ids],
      pts: [...aPts, ...bridgePts, ...bPts],
      highway: pathLen(groupB.pts) > pathLen(groupA.pts) ? groupB.highway : groupA.highway,
      osmSurface: pathLen(groupB.pts) > pathLen(groupA.pts) ? groupB.osmSurface : groupA.osmSurface,
      isBicycle: groupA.isBicycle && groupB.isBicycle,
    };
    // Replace both consumed groups with the single merged one.
    bridged = bridged.filter((_, i) => i !== mA.idx && i !== mB.idx);
    bridged.push(merged);
    stats.bridgedPairs = (stats.bridgedPairs || 0) + 1;
  }

  // Pass 2 — geometric-continuity stitching, ACROSS different names (item B):
  // the (possibly bridge-merged) named groups are chained again purely by
  // endpoint proximity — a DIRECT zero-or-near-zero gap between two
  // different-named real promenades, e.g. a genuine coastal run where one
  // named stretch's OSM way happens to end exactly where the next begins,
  // no connector needed. This pass never sees unnamed bridge material —
  // that's fully handled above — so it needs no discard rule of its own.
  // Canonical name of a merge = the LONGEST constituent segment's real name.
  const families = new Map<string, StitchedGroup[]>();
  for (const g of bridged) { const f = tagFamily(g.highway, g.isBicycle); const arr = families.get(f) || []; arr.push(g); families.set(f, arr); }
  const pass2: StitchedGroup[] = [];
  for (const [, groups] of Array.from(families)) {
    const lines = stitchWithIds(groups.map(g => ({ pts: g.pts, id: g })), CROSS_NAME_GAP_M);
    for (const line of lines) {
      if (line.ids.length === 1) { pass2.push(line.ids[0]); continue; }
      stats.stitchedCrossName++;
      const longest = line.ids.reduce((a, b) => pathLen(b.pts) > pathLen(a.pts) ? b : a);
      pass2.push({ name: longest.name, ids: line.ids.flatMap(g => g.ids), pts: line.pts, highway: longest.highway, osmSurface: longest.osmSurface, isBicycle: line.ids.every(g => g.isBicycle) });
    }
  }

  // Lookups for the recreational-quality gate below — built from data already fetched
  // above (RawWay.highway/footway tags from the standalone-ways fetch; relation
  // membership from step 1's trail-relation fetch), no extra Overpass calls.
  type WayInfo = { highway: string; pts: number[][]; lenM: number; footwayTag?: string; isSidepath?: boolean };
  const wayInfoById = new Map<number, WayInfo>();
  for (const w of rawWays) wayInfoById.set(w.id, { highway: w.highway, pts: w.pts, lenM: pathLen(w.pts), footwayTag: w.footwayTag, isSidepath: w.isSidepath });
  for (const w of bridgeRawWays) wayInfoById.set(w.id, { highway: w.highway, pts: w.pts, lenM: pathLen(w.pts), footwayTag: w.footwayTag, isSidepath: w.isSidepath });
  const anyTrailRelationMemberWayIds = new Set<number>();
  for (const [, memberWays] of Array.from(relMembersByRel)) for (const m of memberWays) anyTrailRelationMemberWayIds.add(m.id);

  // Final classification of the (possibly stitched) named candidates: loop vs
  // segment, computed AFTER stitching (a promenade merged from several
  // fragments might now close back on itself) — item C's length floor split.
  for (const g of pass2) {
    const L = pathLen(g.pts);
    const isLoopG = hav(g.pts[0], g.pts[g.pts.length - 1]) < LOOP_CLOSE_M && L > LEN_LOOP_MIN;
    const surface: 'road' | 'trail' = (g.highway === 'pedestrian' || g.osmSurface === 'paved' || g.osmSurface === 'asphalt') ? 'road' : 'trail';
    if (isLoopG) {
      if (L < LEN_LOOP_MIN || L > LEN_LOOP_MAX) continue; // loops keep the unchanged floor regardless of naming
    } else {
      if (L < LEN_SEG_MIN_NAMED || L > LEN_SEG_MAX) continue; // absolute noise floor (a several-meter OSM tagging glitch) — unchanged, unrelated to recreational quality.
      // Recreational-quality gate — see RECREATIONAL_MAJORITY_MIN_FRAC's header comment
      // (sidewalk-hole fix, 27.08.2026) for the full rationale. Composition is
      // length-weighted across this candidate's real constituent ways — dedicated
      // infra EXCLUDING sidewalk-like footways, plus a per-way bonus for a way that's
      // independently a real marked-trail-relation member even under a non-dedicated tag.
      const markedTrail = g.ids.some(id => anyTrailRelationMemberWayIds.has(id));
      let genuineLen = 0, totalLen = 0;
      for (const wid of g.ids) {
        const info = wayInfoById.get(wid);
        const wlen = info?.lenM ?? 0;
        totalLen += wlen;
        if (info && isGenuineRecreationalWay(wid, info.highway, info.footwayTag, !!info.isSidepath, info.pts, wlen, anyTrailRelationMemberWayIds.has(wid))) genuineLen += wlen;
      }
      const majorityFrac = totalLen > 0 ? genuineLen / totalLen : 0;
      const lengthFloor = markedTrail ? RECREATIONAL_LENGTH_FLOOR_TRAIL_M : RECREATIONAL_LENGTH_FLOOR_STANDALONE_M;
      if (majorityFrac < RECREATIONAL_MAJORITY_MIN_FRAC || L < lengthFloor) { stats.recreationalGateDropped = (stats.recreationalGateDropped || 0) + 1; continue; }
    }
    const stitched = g.ids.length > 1;
    const externalId = stitched ? `osm:stitched/${[...g.ids].sort((a, b) => a - b).join('+')}` : `osm:way/${g.ids[0]}`;
    candidates.push({
      externalId, osmName: g.name, kind: isLoopG ? 'loop' : 'segment',
      pts: g.pts, lengthM: Math.round(L), isLoop: isLoopG, surface,
      highway: g.highway, osmSurface: g.osmSurface, isBicycle: g.isBicycle,
      ...(stitched ? { sourceWayIds: g.ids.map(id => `way/${id}`) } : {}),
    });
    if (isLoopG) stats.loops++; else stats.segments++;
  }

  // 2b) road bike lanes: cycleway=lane|track|opposite_lane|opposite_track, or
  // cycleway:left/right=* (a lane painted onto an ordinary street, not a
  // dedicated way) — a separate highway-type universe (residential/primary/
  // secondary/etc.) not covered by the footway|path|track|pedestrian|cycleway
  // fetch above, so this is its own dedicated Overpass query.
  console.log('discovering road bike lanes (cycleway=lane|track|opposite_lane|opposite_track or cycleway:left/right) …');
  const bikeLaneParts = scopes.map(sc => `way["cycleway"~"^(lane|track|opposite_lane|opposite_track)$"]${sc};way["cycleway:left"]${sc};way["cycleway:right"]${sc};`).join('');
  const bikeLaneData = await overpass(`[out:json][timeout:180];${decl}(${bikeLaneParts})->.bl;.bl out geom tags;`);
  stats.bikeLaneWays = bikeLaneData.elements.filter((e: any) => e.type === 'way').length;
  for (const e of bikeLaneData.elements) {
    if (e.type !== 'way' || !e.geometry || e.geometry.length < 2) continue;
    if (seenWayIds.has(e.id)) continue;
    if (seenStandaloneWayIds.has(e.id)) continue; // item B: already discovered via the broadened standalone-way query
    const t = e.tags || {};
    if (!t.name) continue; // same named-only bar as standalone segments — street name counts as a name
    const pts = wayGeom(e);
    const L = pathLen(pts);
    if (L < LEN_SEG_MIN || L > LEN_SEG_MAX) continue;
    const isLoop = hav(pts[0], pts[pts.length - 1]) < LOOP_CLOSE_M && L > LEN_LOOP_MIN;
    candidates.push({ externalId: `osm:way/${e.id}`, osmName: t.name, kind: isLoop ? 'loop' : 'segment', pts, lengthM: Math.round(L), isLoop, surface: 'road', highway: t.highway, osmSurface: t.surface, isBicycle: true });
    stats.bikeLaneSegments = (stats.bikeLaneSegments || 0) + 1;
  }

  // 3) NEW — named park/garden-anchored perimeter loops (item A), built from
  // `parkRings` (fetched early, step 1.5, so the specialness gate above
  // could use them too — no second fetch here) — but the LOOP GEOMETRY itself
  // (22.08.2026 rewrite) now comes from a real walkable-way graph, not the
  // park polygon boundary. See buildParkLoopCandidate's own header comment
  // for why (investigation found 0/21 Haifa park loops traced a continuous
  // real path under the old "ring = polygon" construction).
  const walkableGraph = await fetchWalkableGraphForRings(parkRings);
  const { candidates: parkCandidates, reports: parkReports } = buildParkLoopCandidates(parkRings, walkableGraph);
  candidates.push(...parkCandidates);
  stats.parks = parkCandidates.length;

  console.log(`\n── park-loop rebuild ("הקפת X") — polygon perimeter vs. real walkable-graph loop ──`);
  console.log('Name'.padEnd(38) + 'OldPerim'.padStart(10) + 'NewLength'.padStart(11) + '  Verdict'.padStart(9) + '  MaxDistFromPoly'.padStart(18) + '  Coverage%'.padStart(12) + '  LongestRun%'.padStart(14) + '  Reason');
  for (const r of parkReports) {
    console.log(
      r.name.padEnd(38) +
      `${r.oldPerimeterM}m`.padStart(10) +
      (r.newLengthM != null ? `${r.newLengthM}m`.padStart(11) : '—'.padStart(11)) +
      `  ${r.verdict}`.padStart(9) +
      (r.maxDistFromPolygonM != null ? `${r.maxDistFromPolygonM}m`.padStart(18) : '—'.padStart(18)) +
      (r.verdict === 'KEPT' ? `${r.coveragePct}%`.padStart(12) : '—'.padStart(12)) +
      (r.verdict === 'KEPT' ? `${r.longestRunPct}%`.padStart(14) : '—'.padStart(14)) +
      (r.reason ? `  ${r.reason}` : '')
    );
  }
  const parkKeptCount = parkReports.filter(r => r.verdict === 'KEPT').length;
  console.log(`\n${parkKeptCount}/${parkReports.length} park loops survive as genuine walkable "הקפת" candidates; ${parkReports.length - parkKeptCount} dropped (no polygon fallback, no synthetic geometry).`);

  // 4) blocking polygons (water + buildings) for artifact filtering.
  const blockPolys = await fetchBlockPolys(REGION.bbox);
  return { candidates, blockPolys, stats };
}

// ─────────────────── park/garden-anchored loops (item A, new) ───────────────────
// Fetches every NAMED leisure=park/garden polygon (way or relation) inside the
// region and emits ONE perimeter-loop Candidate per park: the ring's own
// OSM-mapped boundary vertices, used directly as route geometry — never a
// synthetic circle. Checked and confirmed infeasible/inapplicable to reuse the
// live app's own loop generator (route-generator.service.ts's generateLoopRoutes):
// it can't be imported into a Node/Admin-SDK script (hard Firebase-CLIENT-SDK
// dependency for its waypoint fetch + a 'use client' DEM-tile loader), and even
// if it could be, it has zero polygon/perimeter awareness — like buildLoop()
// below, it's fundamentally "synthetic anchor + Mapbox Directions," never a
// real boundary trace. Structural template mirrors fetchAdminBoundaryPoly
// (below) — same query shape, same stitch()-for-ring-assembly, same
// role!=='inner' outer-only member filtering (single-outer-ring only, no true
// multipolygon/hole support — a known, carried-forward simplification, same as
// fetchAdminBoundaryPoly's own).
// Split into a ring-fetch phase and a candidate-build phase (21.08.2026):
// the raw rings are now ALSO needed earlier, as the park-proximity input to
// the short-named-way specialness gate — not just to build park loop
// candidates at the end. fetchParkGardenRings returns every named ring
// found (unfiltered by loop-closure/length); buildParkLoopCandidates applies
// those filters afterward, same logic as before, just no longer coupled to
// the fetch itself.
async function fetchParkGardenRings(decl: string, scopes: string[]): Promise<Array<{ ref: string; name: string; ring: number[][] }>> {
  console.log('discovering named parks/gardens (leisure=park|garden) …');
  const parts = scopes.map(sc => `way["leisure"~"^(park|garden)$"]["name"]${sc};relation["leisure"~"^(park|garden)$"]["name"]${sc};`).join('');
  const data = await overpass(`[out:json][timeout:180];${decl}(${parts})->.p;.p out tags;(.p;>;);out geom;`);
  const wayById = new Map<number, number[][]>();
  for (const e of data.elements) if (e.type === 'way' && e.geometry) wayById.set(e.id, wayGeom(e));
  const out: Array<{ ref: string; name: string; ring: number[][] }> = [];
  const seenRefs = new Set<string>();
  for (const e of data.elements) {
    if (e.type === 'way') {
      const t = e.tags || {};
      if (!t.name || !e.geometry || e.geometry.length < 3) continue;
      const ref = `way/${e.id}`;
      if (seenRefs.has(ref)) continue; seenRefs.add(ref);
      out.push({ ref, name: t.name, ring: wayGeom(e) });
    } else if (e.type === 'relation') {
      const t = e.tags || {};
      if (!t.name) continue;
      const outerWays: number[][][] = [];
      for (const m of e.members || []) if (m.type === 'way' && m.role !== 'inner' && wayById.has(m.ref)) outerWays.push(wayById.get(m.ref)!);
      if (!outerWays.length) continue;
      const rings = stitch(outerWays, 80);
      if (!rings.length) continue;
      const ring = rings.reduce((a, b) => b.length > a.length ? b : a);
      const ref = `rel/${e.id}`;
      if (seenRefs.has(ref)) continue; seenRefs.add(ref);
      out.push({ ref, name: t.name, ring });
    }
  }
  return out;
}

// buildParkLoopCandidates/buildParkLoopCandidate are defined further below, alongside the
// walkable-graph rebuild machinery they depend on (22.08.2026 rewrite — see that block's own
// header comment for why the polygon-ring approach was replaced).

// Coastline (natural=coastline ways) — the second specialness signal for the
// short-named-way gate (a real promenade along the shore, e.g. Bat Galim/Hof
// HaCarmel-style, should survive even if a specific short fragment isn't
// itself beside a park). Lines, not polygons — collected as raw vertices for
// a coarse point-proximity check, matching this file's existing precision
// level (inPoly/artifactReason are also point-based, not true segment-
// distance tests).
async function fetchCoastlinePoints(b: Region['bbox']): Promise<number[][]> {
  console.log('fetching coastline (natural=coastline) for the short-way specialness signal …');
  const bb = `${b.latMin},${b.lonMin},${b.latMax},${b.lonMax}`;
  const data = await overpass(`[out:json][timeout:90];way["natural"="coastline"](${bb});out geom;`);
  const pts: number[][] = [];
  for (const e of data.elements) if (e.type === 'way' && e.geometry) for (const p of e.geometry) pts.push([p.lat, p.lon]);
  return pts;
}

// ─── Sidewalk-hole fix: road reference network ───────────────────────────────────────
// Flat road segments (geometry only, no routing graph needed) used purely as the
// "is this footway running alongside a road" reference for the sidewalk detector below.
// A simple bbox query, same precision level as fetchCoastlinePoints above — the
// prototype detector this was validated against (city-mapping investigation) used the
// same bbox-wide fetch and confirmed correct both directions (flags a known-tagged
// sidewalk, does not flag known-genuine standalone promenade legs).
type RoadSeg = { a: number[]; b: number[] };
async function fetchRoadReferenceSegments(b: Region['bbox']): Promise<RoadSeg[]> {
  console.log('fetching road network (sidewalk-adjacency reference) …');
  const bb = `${b.latMin},${b.lonMin},${b.latMax},${b.lonMax}`;
  const hwRe = Array.from(ROAD_REFERENCE_HIGHWAY).join('|');
  const data = await overpass(`[out:json][timeout:180];way["highway"~"^(${hwRe})$"](${bb});out geom;`);
  const segs: RoadSeg[] = [];
  for (const e of data.elements) {
    if (e.type !== 'way' || !e.geometry || e.geometry.length < 2) continue;
    const pts = wayGeom(e);
    for (let i = 1; i < pts.length; i++) segs.push({ a: pts[i - 1], b: pts[i] });
  }
  console.log(`  ${segs.length} road segments loaded for the parallel-to-road test.`);
  return segs;
}
function buildSegGrid(segs: RoadSeg[]): Map<string, RoadSeg[]> {
  const grid = new Map<string, RoadSeg[]>();
  for (const s of segs) {
    for (const p of [s.a, s.b]) {
      const k = graphGridKey(p);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k)!.push(s);
    }
  }
  return grid;
}
function nearbySegGrid(p: number[], grid: Map<string, RoadSeg[]>): RoadSeg[] {
  const [la, lo] = [Math.floor(p[0] / GRAPH_GRID_DEG), Math.floor(p[1] / GRAPH_GRID_DEG)];
  const seen = new Set<RoadSeg>();
  for (let da = -1; da <= 1; da++) for (let dob = -1; dob <= 1; dob++) {
    const bucket = grid.get(`${la + da}:${lo + dob}`);
    if (bucket) for (const s of bucket) seen.add(s);
  }
  return Array.from(seen);
}

// Planar-approximation polygon area (shoelace formula, after projecting
// lat/lng to local meters via a flat equirectangular approximation centered
// on the ring's own latitude) — same precision level as this file's other
// geometry (haversine distances, ray-cast point-in-polygon): good enough at
// city scale to distinguish a real park from a pocket garden, not survey-
// grade. Used only for the MIN_PARK_AREA_M2 specialness-gate threshold.
function ringAreaM2(ring: number[][]): number {
  if (ring.length < 3) return 0;
  const lat0 = ring[0][0];
  const mPerDegLat = 111320, mPerDegLng = 111320 * Math.cos(lat0 * Math.PI / 180);
  const xy = ring.map(p => [p[1] * mPerDegLng, p[0] * mPerDegLat]);
  let area = 0;
  for (let i = 0; i < xy.length; i++) { const [x1, y1] = xy[i], [x2, y2] = xy[(i + 1) % xy.length]; area += x1 * y2 - x2 * y1; }
  return Math.abs(area) / 2;
}

// The specialness gate itself: true if ANY point of a candidate's path sits
// within SPECIALNESS_RADIUS_M of a SIGNIFICANT park/garden ring (area ≥
// MIN_PARK_AREA_M2 — pre-filtered by the caller, not every named park/
// garden) or a coastline vertex. Applied ONLY to named non-loop candidates
// below the OLD LEN_SEG_MIN floor (see the final classification loop) —
// named ways above that floor, and all loops, are unaffected.
function isNearSpecialFeature(pts: number[][], significantParkRings: Array<{ ring: number[][] }>, coastlinePts: number[][]): boolean {
  for (const p of pts) {
    for (const pr of significantParkRings) for (const rp of pr.ring) if (hav(p, rp) < SPECIALNESS_RADIUS_M) return true;
    for (const cp of coastlinePts) if (hav(p, cp) < SPECIALNESS_RADIUS_M) return true;
  }
  return false;
}

// ─────────────── park loop rebuild — real walkable-graph routing (22.08.2026) ───────────────
// Replaces the old "ring = park polygon boundary" construction. Investigation (read-only POC)
// confirmed 0/21 Haifa park-loop candidates traced a continuous real path — even the ones that
// scored 100% "near some walkable way" turned out to graze a dense mesh of many short,
// disconnected fragments, because a leisure=park|garden polygon is a land-use boundary, not a
// routable way. Fix: build the loop from an actual node graph of nearby walkable ways, snap a
// downsampled set of polygon anchor points onto it, and Dijkstra between consecutive anchors.
// Drop the candidate outright if any leg can't be resolved on real ways — no polygon fallback,
// matching this file's existing "no anonymous filler, no synthetic geometry" principle.
//
// SECOND PASS (22.08.2026, same day) — a follow-up read-only audit found the FIRST pass's own
// gates were themselves imprecise, not just the old polygon construction: the 1.3x-perimeter
// ratio gate conflated "real defect" with "a real sidewalk legitimately runs outside the grass
// boundary it borders" (present in ALL 7 audited ratio-rejections); every one of those 7 also
// had genuine Dijkstra-per-leg backtracking baked into its length (9.5%-55% of the assembled
// distance was literal out-and-back into a dead-end spur); the 28m snap tolerance rejected two
// real, legitimate walkable ways sitting 10-13m past it; and "no path between anchors" turned
// out to be simply the wrong label — every audited "no path" pair WAS graph-connected, just
// only reachable via a large detour (9x-65x the straight-line gap), not a hard disconnect.
// Gates revised accordingly: backtrack-trim at construction, distance-from-polygon as the
// primary acceptance gate, a looser post-trim length-ratio backstop, segment-based snapping
// (not just nearest-existing-node) at a wider tolerance, and an explicit per-leg detour-ratio
// check with an honest message. See that audit's own findings for the full per-park evidence.
const MIN_ANCHOR_SPACING_M = 35; // unchanged — 30-40m per spec, decimates the polygon to a handful of anchor points.
const ANCHOR_SNAP_TOLERANCE_M = 42; // was 28m — audit found two real, legitimate walkable ways at 38m/41m, just past the old tolerance.
const MAX_DIST_FROM_POLYGON_M = 90; // NEW primary gate (replaces the length-ratio as primary) — audit found all 7 ratio-rejected parks actually stay within 35-75m of their real polygon; this tests containment directly instead of conflating it with a length comparison a real sidewalk fails by design.
const MAX_LOOP_LENGTH_RATIO = 1.7; // demoted to a loose backstop, applied AFTER backtrack-trimming — was 1.3x as the primary gate, which is too strict once you account for real (longer-than-the-grass-edge) sidewalks.
const DIJKSTRA_NODE_CAP = 20000; // hard backstop against a pathological search on a sparse/disconnected local network — should never bind in practice at park scale.
const DIJKSTRA_BASE_BOUND_M = 850; // was a flat 600m floor — modest bump to resolve genuine near-miss legs (audit found some real detours just over the old 600m).
const MAX_LEG_DETOUR_RATIO = 7; // NEW — a leg whose real graph distance is a wild multiple of its straight-line anchor gap isn't a real local perimeter continuation. This is the actual mechanism behind Bucket B's "no path" drops (all were graph-connected, just via 9x-65x detours) — now caught explicitly, with an honest reason instead of a false "no path" message.

interface WalkGraphEdge { to: number; distM: number; wayId: number }
interface WalkGraph { nodeCoord: Map<number, number[]>; adj: Map<number, WalkGraphEdge[]>; grid: Map<string, number[]>; nextVirtualId: { n: number } }

interface ParkLoopReport {
  name: string; oldPerimeterM: number; newLengthM: number | null;
  verdict: 'KEPT' | 'DROPPED'; reason?: string;
  coveragePct?: number; longestRunPct?: number; distinctWays?: number; runs?: number;
  maxDistFromPolygonM?: number;
}

const GRAPH_GRID_DEG = 0.0006; // ~60-65m cells at Haifa's latitude — coarse spatial prefilter, same precision level as this file's other geometry.
function graphGridKey(p: number[]): string { return `${Math.floor(p[0] / GRAPH_GRID_DEG)}:${Math.floor(p[1] / GRAPH_GRID_DEG)}`; }

// Fetches the walkable-way node graph once for the union bbox of every park ring in this
// region (padded) — one combined Overpass call for all parks, not one per park. Same
// vocabulary as this file's own standalone-segment fetch (footway|path|track|pedestrian|
// cycleway|living_street|residential|service|tertiary|unclassified) PLUS steps — a human
// can walk stairs even though this file's routing engine deliberately excludes them from
// routable segments elsewhere (osm-segment-importer.ts's own "never route someone onto a
// staircase" comment is about the LIVE generator's routing UX, not human walkability).
async function fetchWalkableGraphForRings(parkRings: Array<{ ring: number[][] }>): Promise<WalkGraph> {
  const nodeCoord = new Map<number, number[]>();
  const adj = new Map<number, WalkGraphEdge[]>();
  const grid = new Map<string, number[]>();
  const nextVirtualId = { n: 0 }; // shared counter for snap-time virtual (segment-split) nodes — negative ids, never collide with real (positive) OSM node ids.
  if (!parkRings.length) return { nodeCoord, adj, grid, nextVirtualId };

  const PAD_DEG = 0.0015; // ~150-165m padding around the combined bbox.
  let latMin = Infinity, latMax = -Infinity, lonMin = Infinity, lonMax = -Infinity;
  for (const p of parkRings) for (const pt of p.ring) {
    latMin = Math.min(latMin, pt[0]); latMax = Math.max(latMax, pt[0]);
    lonMin = Math.min(lonMin, pt[1]); lonMax = Math.max(lonMax, pt[1]);
  }
  latMin -= PAD_DEG; latMax += PAD_DEG; lonMin -= PAD_DEG; lonMax += PAD_DEG;
  console.log(`fetching walkable-way graph for ${parkRings.length} park perimeter(s) (footway|path|track|pedestrian|cycleway|steps|living_street|residential|service|tertiary|unclassified) …`);
  const bb = `${latMin},${lonMin},${latMax},${lonMax}`;
  const data = await overpass(`[out:json][timeout:150];(way["highway"~"^(footway|path|track|pedestrian|cycleway|steps|living_street|residential|service|tertiary|unclassified)$"](${bb}););out geom;`);

  const addEdge = (a: number, b: number, distM: number, wayId: number) => {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a)!.push({ to: b, distM, wayId });
  };
  let wayCount = 0;
  for (const e of data.elements) {
    if (e.type !== 'way' || !e.geometry || !e.nodes || e.geometry.length !== e.nodes.length || e.geometry.length < 2) continue;
    wayCount++;
    for (let i = 1; i < e.nodes.length; i++) {
      const nA = e.nodes[i - 1], nB = e.nodes[i];
      const pA = [e.geometry[i - 1].lat, e.geometry[i - 1].lon], pB = [e.geometry[i].lat, e.geometry[i].lon];
      if (!nodeCoord.has(nA)) { nodeCoord.set(nA, pA); const k = graphGridKey(pA); if (!grid.has(k)) grid.set(k, []); grid.get(k)!.push(nA); }
      if (!nodeCoord.has(nB)) { nodeCoord.set(nB, pB); const k = graphGridKey(pB); if (!grid.has(k)) grid.set(k, []); grid.get(k)!.push(nB); }
      const d = hav(pA, pB);
      if (d === 0) continue;
      addEdge(nA, nB, d, e.id); addEdge(nB, nA, d, e.id);
    }
  }
  console.log(`  graph: ${wayCount} ways, ${nodeCoord.size} nodes, ${adj.size} nodes with edges.`);
  return { nodeCoord, adj, grid, nextVirtualId };
}

// Decimates a closed ring to ~spacingM-spaced anchor points (pure distance-based, not
// Douglas-Peucker — spec asks for "drop vertices closer than X apart", not shape-preserving
// simplification). Always keeps the first vertex; drops a trailing anchor that would land
// too close to the first (avoids a near-zero final leg).
function downsampleRing(ring: number[][], spacingM: number): number[][] {
  if (!ring.length) return [];
  const out = [ring[0]];
  for (let i = 1; i < ring.length; i++) if (hav(out[out.length - 1], ring[i]) >= spacingM) out.push(ring[i]);
  if (out.length > 1 && hav(out[out.length - 1], out[0]) < spacingM) out.pop();
  return out;
}

// Nearest point in local-planar meters, projected onto a segment [a,b] — returns both the
// distance and the interpolation fraction t (0 = at a, 1 = at b), so a caller can either just
// measure distance or actually place a point along the segment.
function pointToSegDistAndFrac(p: number[], a: number[], b: number[]): { distM: number; t: number } {
  const refLat = a[0];
  const mLat = 111320, mLon = 111320 * Math.cos(refLat * Math.PI / 180);
  const toXY = (q: number[]): [number, number] => [q[1] * mLon, q[0] * mLat];
  const [px, py] = toXY(p), [ax, ay] = toXY(a), [bx, by] = toXY(b);
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return { distM: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)), t };
}

// Nearest point on the nearest walkable EDGE (segment), not the nearest existing OSM node —
// a real precision fix independent of the tolerance value (audit found a 20m-by-segment vs.
// 29m-by-node discrepancy on a real anchor: OSM nodes only sit at bends/intersections, sparser
// than the way's own path, so node-only snapping understates how close a walkable way really
// is). A snap that lands strictly between two nodes gets a VIRTUAL node inserted at the exact
// projected point, splitting that edge into two — so Dijkstra can start/end exactly where the
// anchor actually meets the path, not rounded to the nearest existing vertex. The virtual
// node's two split edges are added alongside (not replacing) the original edge — routing
// between any OTHER pair of nodes is unaffected; this only gives the anchor itself an exact
// entry point.
function snapToGraphSegment(p: number[], graph: WalkGraph): { nodeId: number; distM: number } | null {
  const [la, lo] = [Math.floor(p[0] / GRAPH_GRID_DEG), Math.floor(p[1] / GRAPH_GRID_DEG)];
  const nearbyNodes = new Set<number>();
  for (let da = -1; da <= 1; da++) for (let dob = -1; dob <= 1; dob++) {
    const bucket = graph.grid.get(`${la + da}:${lo + dob}`);
    if (bucket) for (const id of bucket) nearbyNodes.add(id);
  }
  let bestDist = Infinity, bestA: number | null = null, bestB: number | null = null, bestWayId = 0, bestT = 0;
  const seenEdges = new Set<string>();
  for (const nodeId of Array.from(nearbyNodes)) {
    for (const edge of graph.adj.get(nodeId) || []) {
      const a = nodeId, b = edge.to;
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (seenEdges.has(key)) continue; seenEdges.add(key);
      const { distM, t } = pointToSegDistAndFrac(p, graph.nodeCoord.get(a)!, graph.nodeCoord.get(b)!);
      if (distM < bestDist) { bestDist = distM; bestA = a; bestB = b; bestWayId = edge.wayId; bestT = t; }
    }
  }
  if (bestA === null) return null;
  if (bestT <= 0.02) return { nodeId: bestA, distM: bestDist };
  if (bestT >= 0.98) return { nodeId: bestB!, distM: bestDist };

  const pa = graph.nodeCoord.get(bestA)!, pb = graph.nodeCoord.get(bestB!)!;
  const projected = [pa[0] + (pb[0] - pa[0]) * bestT, pa[1] + (pb[1] - pa[1]) * bestT];
  const vid = -(++graph.nextVirtualId.n);
  graph.nodeCoord.set(vid, projected);
  const distAB = hav(pa, pb), distToA = distAB * bestT, distToB = distAB * (1 - bestT);
  const addEdge = (x: number, y: number, d: number, w: number) => { if (!graph.adj.has(x)) graph.adj.set(x, []); graph.adj.get(x)!.push({ to: y, distM: d, wayId: w }); };
  addEdge(vid, bestA, distToA, bestWayId); addEdge(bestA, vid, distToA, bestWayId);
  addEdge(vid, bestB!, distToB, bestWayId); addEdge(bestB!, vid, distToB, bestWayId);
  return { nodeId: vid, distM: bestDist };
}

// Dijkstra between two graph nodes, bounded by maxDistM (both a correctness bound — no point
// routing 2km to close a 40m gap — and a performance backstop). Simple array-backed binary
// heap; this is a one-shot dry-run script, not hot-path production code. Returns the ordered
// node-id path plus, for each traversed edge, which OSM way it came from (for the continuity
// audit in buildParkLoopCandidate below) — or null if no path resolves within the bound.
function dijkstraPath(graph: WalkGraph, from: number, to: number, maxDistM: number): { nodeIds: number[]; edgeWayIds: number[]; distM: number } | null {
  if (from === to) return { nodeIds: [from], edgeWayIds: [], distM: 0 };
  const dist = new Map<number, number>([[from, 0]]);
  const prev = new Map<number, { node: number; wayId: number }>();
  const heap: [number, number][] = [[0, from]]; // [distance, nodeId]
  const siftDown = (i: number) => { const n = heap.length; while (true) { let s = i, l = 2 * i + 1, r = 2 * i + 2; if (l < n && heap[l][0] < heap[s][0]) s = l; if (r < n && heap[r][0] < heap[s][0]) s = r; if (s === i) break; [heap[i], heap[s]] = [heap[s], heap[i]]; i = s; } };
  const siftUp = (i: number) => { while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[i], heap[p]] = [heap[p], heap[i]]; i = p; } };
  const push = (d: number, n: number) => { heap.push([d, n]); siftUp(heap.length - 1); };
  const pop = (): [number, number] | undefined => { if (!heap.length) return undefined; const top = heap[0]; const last = heap.pop()!; if (heap.length) { heap[0] = last; siftDown(0); } return top; };

  let visited = 0;
  while (heap.length) {
    const top = pop()!; const [d, node] = top;
    if (d > (dist.get(node) ?? Infinity)) continue; // stale heap entry
    if (node === to) break;
    if (d > maxDistM || ++visited > DIJKSTRA_NODE_CAP) return null;
    for (const edge of graph.adj.get(node) || []) {
      const nd = d + edge.distM;
      if (nd < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, nd);
        prev.set(edge.to, { node, wayId: edge.wayId });
        push(nd, edge.to);
      }
    }
  }
  if (!dist.has(to) || (dist.get(to) as number) > maxDistM) return null;

  const nodeIds = [to]; const edgeWayIds: number[] = [];
  let cur = to;
  while (cur !== from) {
    const p = prev.get(cur);
    if (!p) return null; // unreachable — shouldn't happen once dist.has(to) is true, defensive only
    edgeWayIds.push(p.wayId);
    cur = p.node;
    nodeIds.push(cur);
  }
  nodeIds.reverse(); edgeWayIds.reverse();
  return { nodeIds, edgeWayIds, distM: dist.get(to)! };
}

// Detects and removes immediately-reversed consecutive edge sequences (A→B→A) from an
// assembled node path — a classic Dijkstra-per-leg artifact when an anchor snaps near a
// dead-end spur: the path walks in, then has to walk back out the identical way to continue.
// Found in 100% of the first-pass audit's ratio-rejected parks (9.5%-55% of assembled length
// was pure backtrack). Standard stack-based "free reduction" — provably preserves a valid
// connected path: a pop only fires on an exact immediate reversal, so whatever remains on the
// stack was already validly connected to whatever comes next.
function trimBacktrackPath(nodeIds: number[], edgeWayIds: number[]): { nodeIds: number[]; edgeWayIds: number[] } {
  const stackNodes: number[] = [nodeIds[0]];
  const stackWays: number[] = [];
  for (let i = 0; i < edgeWayIds.length; i++) {
    const nextNode = nodeIds[i + 1];
    if (stackNodes.length >= 2 && stackNodes[stackNodes.length - 2] === nextNode) {
      stackNodes.pop(); stackWays.pop();
    } else {
      stackNodes.push(nextNode); stackWays.push(edgeWayIds[i]);
    }
  }
  return { nodeIds: stackNodes, edgeWayIds: stackWays };
}

// Primary acceptance gate (replaces the old length-ratio-to-polygon-perimeter test as
// primary): does the assembled loop actually hug the real park, point by point? A pure length
// ratio conflates a real defect with "a real sidewalk legitimately runs outside the grass
// boundary it borders" — this measures containment directly instead.
function maxDistFromRing(pts: number[][], ring: number[][]): number {
  let worst = 0;
  for (const p of pts) {
    let best = Infinity;
    for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; best = Math.min(best, pointToSegDistAndFrac(p, a, b).distM); }
    worst = Math.max(worst, best);
  }
  return worst;
}

function buildParkLoopCandidate(ref: string, name: string, ring: number[][], graph: WalkGraph): { candidate: Candidate | null; report: ParkLoopReport } {
  const drop = (reason: string, oldPerimeterM = 0, newLengthM: number | null = null, maxDistFromPolygonM?: number): { candidate: null; report: ParkLoopReport } =>
    ({ candidate: null, report: { name, oldPerimeterM: Math.round(oldPerimeterM), newLengthM, verdict: 'DROPPED', reason, maxDistFromPolygonM } });

  if (ring.length < 3) return drop('degenerate ring (<3 points)');
  const oldPerimeterM = pathLen(ring);
  if (oldPerimeterM < LEN_LOOP_MIN || oldPerimeterM > LEN_LOOP_MAX) return drop(`polygon perimeter ${Math.round(oldPerimeterM)}m outside the [${LEN_LOOP_MIN},${LEN_LOOP_MAX}]m loop window`, oldPerimeterM);

  const anchors = downsampleRing(ring, MIN_ANCHOR_SPACING_M);
  if (anchors.length < 3) return drop(`only ${anchors.length} anchor(s) after ${MIN_ANCHOR_SPACING_M}m downsampling — too small/degenerate to route`, oldPerimeterM);

  const snapped = anchors.map(a => snapToGraphSegment(a, graph));
  const failIdx = snapped.findIndex(s => s === null || s.distM > ANCHOR_SNAP_TOLERANCE_M);
  if (failIdx !== -1) return drop(`anchor ${failIdx + 1}/${anchors.length} has no walkable way within ${ANCHOR_SNAP_TOLERANCE_M}m — no real perimeter path here`, oldPerimeterM);
  const snappedIds = snapped.map(s => s!.nodeId);

  const legs: { nodeIds: number[]; edgeWayIds: number[]; distM: number }[] = [];
  for (let i = 0; i < snappedIds.length; i++) {
    const from = snappedIds[i], to = snappedIds[(i + 1) % snappedIds.length];
    const straightM = hav(anchors[i], anchors[(i + 1) % anchors.length]);
    const bound = Math.max(DIJKSTRA_BASE_BOUND_M, straightM * 4);
    const legNum = i + 1, nextNum = ((i + 1) % anchors.length) + 1;
    const leg = dijkstraPath(graph, from, to, bound);
    if (!leg) return drop(`no walkable path between anchor ${legNum} and ${nextNum} within ${Math.round(bound)}m`, oldPerimeterM);
    if (leg.distM > straightM * MAX_LEG_DETOUR_RATIO) {
      const detour = leg.distM / straightM;
      return drop(`leg ${legNum}→${nextNum} requires a ${detour.toFixed(1)}x detour (${Math.round(leg.distM)}m for a ${Math.round(straightM)}m gap) — not a real local perimeter path`, oldPerimeterM);
    }
    legs.push(leg);
  }

  const allNodeIds: number[] = [];
  const allEdgeWayIds: number[] = [];
  for (const leg of legs) {
    const startAt = allNodeIds.length === 0 ? 0 : 1; // skip the shared node with the previous leg's tail — avoid a duplicate point at each anchor.
    for (let i = startAt; i < leg.nodeIds.length; i++) allNodeIds.push(leg.nodeIds[i]);
    allEdgeWayIds.push(...leg.edgeWayIds);
  }
  const trimmed = trimBacktrackPath(allNodeIds, allEdgeWayIds);
  if (trimmed.nodeIds.length < 4) return drop('assembled loop collapsed to a degenerate path after backtrack-trimming — essentially all out-and-back, no real forward loop', oldPerimeterM);

  const pts = trimmed.nodeIds.map(id => graph.nodeCoord.get(id)!);
  const edgeWayIds = trimmed.edgeWayIds;
  const newLengthM = pathLen(pts);

  const maxDistM = maxDistFromRing(pts, ring);
  if (maxDistM > MAX_DIST_FROM_POLYGON_M) return drop(`assembled loop strays ${Math.round(maxDistM)}m from the polygon at its worst point (limit ${MAX_DIST_FROM_POLYGON_M}m)`, oldPerimeterM, Math.round(newLengthM), Math.round(maxDistM));

  const ratio = newLengthM / oldPerimeterM;
  if (ratio > MAX_LOOP_LENGTH_RATIO) return drop(`assembled walkable loop ${Math.round(newLengthM)}m is ${ratio.toFixed(2)}x the polygon perimeter even after backtrack-trimming (backstop limit ${MAX_LOOP_LENGTH_RATIO}x)`, oldPerimeterM, Math.round(newLengthM), Math.round(maxDistM));

  // Continuity audit — exact, not sampled (every point of `pts` sits exactly on a real graph
  // edge by construction, so coverage is 100% by definition; this measures HOW that 100% is
  // made up: one long real path / a legitimate multi-way perimeter route, vs. a pathological
  // zig-zag). distinctWays > 4x the anchor count is a sanity backstop against a Dijkstra
  // result that's technically all-real-edges but absurdly fragmented — should essentially
  // never trigger given the distance-from-polygon and ratio gates above already reject
  // wandering routes; computed on the TRIMMED path, so it no longer double-counts backtrack.
  const distinctWays = new Set(edgeWayIds).size;
  let runs = 0, longestRun = 0, curRun = 0, prevWay: number | null = null;
  for (const wid of edgeWayIds) {
    if (wid === prevWay) curRun++;
    else { if (prevWay !== null) { runs++; longestRun = Math.max(longestRun, curRun); } curRun = 1; }
    prevWay = wid;
  }
  if (prevWay !== null) { runs++; longestRun = Math.max(longestRun, curRun); }
  const longestRunPct = edgeWayIds.length ? Math.round((longestRun / edgeWayIds.length) * 1000) / 10 : 100;
  if (distinctWays > anchors.length * 4) return drop(`assembled from ${distinctWays} distinct ways across only ${anchors.length} anchors — too fragmented to be a real perimeter path`, oldPerimeterM, Math.round(newLengthM), Math.round(maxDistM));

  const candidate: Candidate = {
    externalId: `osm:${ref}`,
    osmName: name,
    kind: 'park',
    pts,
    lengthM: Math.round(newLengthM),
    isLoop: true,
    surface: 'trail',
    ...(ref.startsWith('rel/') ? { relRef: ref } : {}),
    // Real provenance of the assembled perimeter — distinct from externalId (which stays
    // `osm:${ref}`, the PARK's own way/relation id, so re-runs still upsert the same doc).
    sourceWayIds: Array.from(new Set(edgeWayIds)).map(id => `way/${id}`),
  };
  return { candidate, report: { name, oldPerimeterM: Math.round(oldPerimeterM), newLengthM: Math.round(newLengthM), verdict: 'KEPT', coveragePct: 100, longestRunPct, distinctWays, runs, maxDistFromPolygonM: Math.round(maxDistM) } };
}

function buildParkLoopCandidates(parkRings: Array<{ ref: string; name: string; ring: number[][] }>, graph: WalkGraph): { candidates: Candidate[]; reports: ParkLoopReport[] } {
  const candidates: Candidate[] = [];
  const reports: ParkLoopReport[] = [];
  for (const p of parkRings) {
    const { candidate, report } = buildParkLoopCandidate(p.ref, p.name, p.ring, graph);
    if (candidate) candidates.push(candidate);
    reports.push(report);
  }
  return { candidates, reports };
}

// Blocking polygons (water + buildings) consumed by artifactReason. Extracted from discover()
// so the round-trip source can reuse the SAME artifact filter when --skip-osm bypasses discovery.
async function fetchBlockPolys(b: Region['bbox']): Promise<{ poly: number[][]; label: string }[]> {
  console.log('fetching blocking polygons (water + buildings) for artifact filter …');
  const bb = `${b.latMin - 0.003},${b.lonMin - 0.003},${b.latMax + 0.003},${b.lonMax + 0.003}`;
  const blockData = await overpass(`[out:json][timeout:120];(way["natural"="water"](${bb});way["building"](${bb});way["leisure"~"^(swimming_pool|water_park)$"](${bb});relation["natural"="water"](${bb}););out geom;`);
  const blockPolys: { poly: number[][]; label: string }[] = [];
  for (const e of blockData.elements) {
    const label = e.tags?.name || e.tags?.natural || (e.tags?.building ? 'building' : e.tags?.leisure) || 'block';
    if (e.type === 'way' && e.geometry && e.geometry.length >= 3) blockPolys.push({ poly: wayGeom(e), label });
    else if (e.type === 'relation' && e.members) for (const m of e.members) if (m.geometry && m.geometry.length >= 3) blockPolys.push({ poly: m.geometry.map((p: any) => [p.lat, p.lon]), label });
  }
  return blockPolys;
}

// A candidate is an artifact if a meaningful fraction of its vertices sit inside a
// blocking polygon (over water / inside a building). One stray point is tolerated
// (OSM ways can graze a building corner); >20% inside ⇒ reject.
function artifactReason(pts: number[][], blockPolys: { poly: number[][]; label: string }[]): string | null {
  let inside = 0; let label = '';
  for (const p of pts) { const b = blockPolys.find(bp => inPoly(p, bp.poly)); if (b) { inside++; label = b.label; } }
  return inside / pts.length > 0.2 ? `over ${label} (${inside}/${pts.length} pts)` : null;
}

// ─────────────────── municipal-boundary clip (standing capability) ───────────────────
// Fetches the real admin boundary polygon for a region's `boundaryClipWikidata` (when
// set), used ONLY as a post-discovery clipping filter — see the Region interface's
// doc comment for why this is deliberately never used as discovery scope. Any region
// may opt in by supplying the field; a region without it gets no boundary clip
// (outsideBoundaryReason fails open below), matching every region's behavior before
// this capability existed.
async function fetchAdminBoundaryPoly(wikidataId: string): Promise<number[][] | null> {
  const q = `[out:json][timeout:120];rel["wikidata"="${wikidataId}"]["boundary"="administrative"];out geom;(._;>;);out geom;`;
  const data = await overpass(q);
  const rel = data.elements.find((e: any) => e.type === 'relation');
  if (!rel) return null;
  const wayById = new Map<number, number[][]>();
  for (const e of data.elements) if (e.type === 'way' && e.geometry) wayById.set(e.id, wayGeom(e));
  const outerWays: number[][][] = [];
  for (const m of rel.members || []) if (m.type === 'way' && m.role !== 'inner' && wayById.has(m.ref)) outerWays.push(wayById.get(m.ref)!);
  const rings = stitch(outerWays, 200);
  if (!rings.length) return null;
  return rings.reduce((a, b) => b.length > a.length ? b : a);
}
// Mirrors artifactReason's fraction style, inverted: drop a candidate if a majority
// of its points fall OUTSIDE the real municipal boundary. Fail-open (never filters)
// when no polygon was loaded — this file's "never silently guess" discipline.
function outsideBoundaryReason(pts: number[][], boundaryPoly: number[][] | null): string | null {
  if (!boundaryPoly) return null;
  let outside = 0;
  for (const p of pts) if (!inPoly(p, boundaryPoly)) outside++;
  return outside / pts.length > 0.5 ? `outside boundary (${outside}/${pts.length} pts)` : null;
}

// ─────────────────────────────── route doc builder ───────────────────────────────
const B32 = '0123456789bcdefghjkmnpqrstuvwxyz';
function geohash(lat: number, lon: number, prec = 7) { let idx = 0, bit = 0, even = true, h = ''; const la = [-90, 90], lo = [-180, 180]; while (h.length < prec) { if (even) { const m = (lo[0] + lo[1]) / 2; if (lon >= m) { idx = idx * 2 + 1; lo[0] = m; } else { idx = idx * 2; lo[1] = m; } } else { const m = (la[0] + la[1]) / 2; if (lat >= m) { idx = idx * 2 + 1; la[0] = m; } else { idx = idx * 2; la[1] = m; } } even = !even; if (++bit === 5) { h += B32[idx]; bit = 0; idx = 0; } } return h; }

function buildRouteDoc(
  c: Candidate, dem: { gainM: number; maxGrade: number } | null, authorityId: string,
  composition?: { sidewalkPct: number; genuinePct: number; ordinaryPct: number; otherPct: number },
  lighting?: { status: 'computed' | 'unknown'; litCoveragePct: number | null; isLit: boolean | null },
) {
  const distance = c.lengthM; // meters (matches formatDistance + TLV pilot)
  // walking is the safe default for nature trails; paved pedestrian promenades also run well.
  // Bicycle-tagged candidates (isBicycle) get their own activityType — see Candidate.isBicycle.
  const activityTypes = c.isBicycle ? ['cycling'] : ['walking', 'running'];
  const activityType = c.isBicycle ? 'cycling' : (c.surface === 'road' ? 'running' : 'walking');
  const kindHe = c.isLoop ? 'לולאה' : c.kind === 'trail' ? 'שביל מסומן' : 'מסלול';
  // Park-anchored perimeter loops (item A) get their own naming convention —
  // "הקפת X" ("circuit of X"), distinct from the general "לולאת X" loop
  // prefix — both because it reads more naturally for "loop around a park"
  // in Hebrew, and because it's the exact naming pattern the lost TLV probe
  // used (e.g. "הקפת פארק חופי רידינג"), giving this rebuild continuity with
  // the capability it's replacing. discoverParkLoops() only ever emits
  // NAMED candidates (Overpass query requires ["name"]), so the fallback
  // here is defensive only.
  const name = c.kind === 'park'
    ? `הקפת ${c.osmName ?? REGION.label}`
    : c.osmName
      ? (c.isLoop ? `לולאת ${c.osmName}` : c.osmName)
      : `${kindHe} ${REGION.label}${c.isLoop ? ' (לולאה)' : ''}`;
  const distanceKm = distance / 1000;
  const mid = c.pts[Math.floor(c.pts.length / 2)];
  const gain = dem?.gainM ?? 0;
  // difficulty from length + climb (simple, transparent heuristic)
  // NOTE: must match Route.difficulty exactly ('easy'|'medium'|'hard') — a prior
  // version of this line used 'moderate', which isn't a valid Route.difficulty
  // value and silently broke calorie calc (NaN) + ranking (mis-scored as hardest)
  // + DifficultyBolts (mis-rendered as easiest) wherever it landed. Don't reintroduce it.
  const difficulty: 'easy' | 'medium' | 'hard' = (distanceKm > 8 || gain > 200) ? 'hard' : (distanceKm > 3.5 || gain > 80) ? 'medium' : 'easy';
  return {
    name,
    description: `${kindHe} ${c.surface === 'trail' ? 'שטח' : 'סלול'} ב${REGION.label}${c.osmName ? ` — ${c.osmName}` : ''}`,
    // The doc's `distance` field is km-contractual (confirmed by ~18 reader
    // sites across mobile+admin — route-editor-scoping-spec.md's
    // distance-unit-normalization work); this used to write the raw-meters
    // `distance` local (line above `distanceKm`'s own declaration), which
    // is exactly the bug that produced the 77 Haifa docs fixed by
    // scripts/migrate-distance-unit.ts. `distance` (meters) itself is left
    // untouched below — `duration` genuinely needs meters (its divisors are
    // meters-per-minute), and `distanceKm` already correctly feeds `score`/
    // `calories` above/below — only THIS field's value was wrong, not the
    // internal meters variable those other fields still correctly rely on.
    distance: distanceKm,
    // Cycling divisor/multiplier are feel-based estimates, same rigor level as the
    // walking/running constants they sit beside — flagged for calibration review.
    // NOT a unit bug: `distance` here is the meters local (unchanged), and
    // 250/150/90 are meters-per-minute — internally consistent as-is.
    duration: Math.round(distance / (c.isBicycle ? 250 : activityType === 'running' ? 150 : 90)),
    score: Math.round(distanceKm * 10),
    rating: c.isLoop ? 5 : 4,
    calories: Math.round(distanceKm * (c.isBicycle ? 35 : 65)),
    type: activityType,
    activityType,
    activityTypes,
    difficulty,
    path: toPath(c.pts),
    segments: [],
    features: {
      hasGym: false, hasBenches: false,
      scenic: c.surface === 'trail' || c.kind === 'trail',
      lit: c.surface === 'road',
      terrain: c.surface === 'trail' ? 'dirt' : 'asphalt',
      environment: c.surface === 'trail' ? 'nature' : 'urban',
      trafficLoad: 'none',
      surface: c.surface,
    },
    source: { type: 'official_api', name: c.sourceName ?? 'OSM Geo-Discovery', externalId: c.externalId, ...(c.relRef ? { osmRef: c.relRef } : {}) },
    // Top-level, not nested under `source` (see RouteFieldsSchema.sourceWayIds's
    // doc comment — `source` itself isn't schema-validated as a nested object).
    ...(c.sourceWayIds ? { sourceWayIds: c.sourceWayIds } : {}),
    elevationGain: gain,
    maxGrade: dem?.maxGrade ?? 0,
    // Granular ground-material vocabulary — deliberately a NEW top-level
    // field, not a rewrite of features.surface above (that field is a
    // different, coarser concept, actively read elsewhere as 'road'/'trail'
    // — see surface-type.ts's header comment). mapOsmSurfaceToType always
    // returns a value ('unknown' when c.osmSurface is absent, e.g.
    // trail-relation-derived candidates never had a raw way tag) — never
    // undefined, so no conditional-spread needed here.
    surfaceType: mapOsmSurfaceToType(c.osmSurface),
    // routeShape retires the old isLoop boolean (Stage 1A) — c.isLoop only means
    // "geometrically closed" (start≈end); when false the candidate is a plain
    // linear trail/segment, which is neither 'loop' nor 'out_and_back', so we
    // omit the field rather than guess (Firestore admin SDK write — omit,
    // don't set undefined, matching this file's existing conditional-spread
    // convention for optional fields like osmRef above).
    ...(c.isLoop ? { routeShape: 'loop' as const } : {}),
    // Quality-certificate v1 (composition only — lighting is a separate,
    // later task). Only set when a composition was actually computed for
    // this run (main() skips the city-wide way-grid fetch under --skip-osm,
    // and round-trip-only candidates never go through this path) — omitted,
    // not written with zeros, when unavailable; qualitySignals stays
    // genuinely optional rather than a false "computed" claim.
    // lighting is only ever present alongside composition (both require the
    // !SKIP_OSM city-data path) — omitted, not zeroed, when unavailable,
    // same discipline as composition itself.
    ...(composition ? { qualitySignals: { composition, ...(lighting ? { lighting: { ...lighting, source: 'street_segments_lit' as const } } : {}), computedAt: admin.firestore.FieldValue.serverTimestamp(), source: 'osm_overpass_v1' as const } } : {}),
    geohash: geohash(mid[0], mid[1]),
    city: REGION.label,
    // Stage 1B: this script never set authorityId before — resolved once per
    // run in main() (REGION.label -> authorityId via findAuthorityByCityName)
    // and threaded through here. Required by the chokepoint's CREATE-mode
    // validation (hard rule 1).
    authorityId,
    importBatchId: REGION.batchId,
    origin: 'osm_import',
    status: 'pending',
    published: false,
  };
}

// ─────────────────────────── Mapbox round-trip loops (foot) ───────────────────────────
// Synthetic loops around anchor points (named anchors + our `parks` gyms) at 3/5/10 km via the
// Mapbox Directions *walking* profile. Added to compensate for Ashkelon having no OSM route
// relations. Emits the SAME Candidate shape → flows through buildRouteDoc + the artifact filter
// + DEM enrichment unchanged. Enabled with --roundtrips (add --skip-osm for round-trips only).
type Anchor = { key: string; label: string; lat: number; lng: number };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const RT_DISTS = [3000, 5000, 10000];

// geodesic destination point (haversine forward) — places loop waypoints around an anchor.
function destPoint(lat: number, lon: number, brgDeg: number, distM: number): number[] {
  const br = brgDeg * Math.PI / 180, dr = distM / R, la1 = lat * Math.PI / 180, lo1 = lon * Math.PI / 180;
  const la2 = Math.asin(Math.sin(la1) * Math.cos(dr) + Math.cos(la1) * Math.sin(dr) * Math.cos(br));
  const lo2 = lo1 + Math.atan2(Math.sin(br) * Math.sin(dr) * Math.cos(la1), Math.cos(dr) - Math.sin(la1) * Math.sin(la2));
  return [la2 * 180 / Math.PI, lo2 * 180 / Math.PI];
}

// Mapbox Directions, walking profile. waypts as [lat,lon]; returns the snapped foot polyline + length.
async function mapboxWalk(waypts: number[][]): Promise<{ pts: number[][]; lengthM: number } | null> {
  const coordStr = waypts.map(p => `${p[1]},${p[0]}`).join(';');
  const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${coordStr}?geometries=geojson&overview=full&access_token=${TOKEN}`;
  try {
    const j = JSON.parse((await fetchBuf(url)).toString());
    const r = j.routes?.[0];
    if (!r?.geometry?.coordinates?.length) return null;
    return { pts: r.geometry.coordinates.map((c: number[]) => [c[1], c[0]]), lengthM: Math.round(r.distance) };
  } catch { return null; }
}

// One foot loop of ~targetM around an anchor: 4 waypoints on a circle, back to the start.
// One radius-correction retry (street routing inflates length beyond the straight-line circle).
async function buildLoop(a: Anchor, targetM: number, seed: number): Promise<Candidate | null> {
  const K = 4, targetKm = Math.round(targetM / 1000);
  let radius = targetM / (2 * Math.PI) / 1.25; // first guess; corrected once below
  for (let attempt = 0; attempt < 2; attempt++) {
    const rot = (seed * 47) % 360;
    const waypts: number[][] = [[a.lat, a.lng]];
    for (let i = 0; i < K; i++) waypts.push(destPoint(a.lat, a.lng, rot + i * (360 / K), radius));
    waypts.push([a.lat, a.lng]);
    const res = await mapboxWalk(waypts);
    if (!res || res.pts.length < 2) return null;
    if (attempt === 0 && (res.lengthM < targetM * 0.7 || res.lengthM > targetM * 1.5)) { radius *= targetM / res.lengthM; continue; }
    if (res.lengthM < LEN_LOOP_MIN || res.lengthM > LEN_LOOP_MAX) return null; // same window as OSM loops
    return {
      externalId: `mapbox:roundtrip/${a.key}/${targetKm}km`,
      osmName: `${a.label} · ${targetKm} ק"מ`,
      kind: 'loop', pts: res.pts, lengthM: res.lengthM,
      isLoop: hav(res.pts[0], res.pts[res.pts.length - 1]) < LOOP_CLOSE_M,
      surface: 'road', sourceName: 'Mapbox Round-Trip (foot)',
    };
  }
  return null;
}

// Anchors = region.roundTripAnchors + every `parks` gym in the region (city == region.label OR
// coords inside the region bbox). Coordinates at location.lat/lng (Explore-verified). Read-only.
// cityMatch was previously a hardcoded /אשקלון|ashkelon/i regex, region-agnostic in name only
// (it never read the `region` argument this function already receives) — fixed Stage A,
// city-orchestrator plan, 02.09.2026. Verified behavior-preserving by a live read-only query
// (not assumed): all 31 parks docs the old regex matched carry city === 'אשקלון' exactly, no
// English spelling, no neighborhood-qualified variant, no whitespace difference — so
// `p.city === region.label` matches the identical 31-doc set for every one of the 9 Ashkelon-
// family REGIONS entries (all of which set label: 'אשקלון'), with zero risk of silently
// dropping a doc the old regex would have caught.
async function loadParkAnchors(db: admin.firestore.Firestore, region: Region): Promise<Anchor[]> {
  const snap = await db.collection('parks').get();
  const b = region.bbox; const out: Anchor[] = [];
  for (const doc of snap.docs) {
    const p: any = doc.data();
    const lat = p.location?.lat ?? p.lat, lng = p.location?.lng ?? p.lng;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    const cityMatch = typeof p.city === 'string' && p.city === region.label;
    const inBox = lat >= b.latMin && lat <= b.latMax && lng >= b.lonMin && lng <= b.lonMax;
    if (!cityMatch && !inBox) continue;
    out.push({ key: `park-${doc.id}`, label: (p.name && String(p.name).trim()) || 'גינת כושר', lat, lng });
  }
  const CAP = 60;
  if (out.length > CAP) { console.log(`  ⚠ ${out.length} park anchors → capping to ${CAP} (rest skipped — NOT silently dropped)`); return out.slice(0, CAP); }
  return out;
}

async function discoverRoundTrips(db: admin.firestore.Firestore, region: Region): Promise<{ candidates: Candidate[]; stats: any }> {
  const stats: any = { attempted: 0, built: 0, failed: 0, closed: 0, perDist: { 3: 0, 5: 0, 10: 0 } };
  if (!TOKEN) { console.warn('  ⚠ no NEXT_PUBLIC_MAPBOX_TOKEN — round-trip source skipped'); return { candidates: [], stats }; }
  const named = region.roundTripAnchors || [];
  const parks = await loadParkAnchors(db, region);
  const anchors: Anchor[] = [...named, ...parks];
  console.log(`\nround-trip anchors: ${named.length} named + ${parks.length} park gyms = ${anchors.length}, each × [3,5,10]km (foot)`);
  const candidates: Candidate[] = [];
  let seed = 0;
  for (const a of anchors) {
    for (const d of RT_DISTS) {
      stats.attempted++;
      const c = await buildLoop(a, d, seed++);
      await sleep(120); // be polite to the Mapbox Directions API
      if (!c) { stats.failed++; continue; }
      candidates.push(c); stats.built++; stats.perDist[d / 1000]++;
      if (c.isLoop) stats.closed++;
    }
  }
  return { candidates, stats };
}

// ─────────────────────────────── firebase ───────────────────────────────
function initFb() { const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!); if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id }); return admin.firestore(); }

async function main() {
  REGION = await resolveRegion();
  console.log(`\n=== GEO-DISCOVERY — region: ${REGION.label} (${REGION.key}) ===`);
  const db = initFb();
  const col = db.collection('official_routes');

  if (DELETE) {
    const snap = await col.where('importBatchId', '==', REGION.batchId).get();
    console.log(`deleting ${snap.size} routes from batch ${REGION.batchId} …`);
    let b = db.batch(), n = 0; for (const d of snap.docs) { b.delete(d.ref); if (++n % 450 === 0) { await b.commit(); b = db.batch(); } } await b.commit();
    console.log('✅ deleted'); return;
  }

  // Stage 1B — this script never set authorityId before (confirmed absent
  // via grep during the route-enrichment-pipeline investigation). Resolve
  // it once for the whole region: REGION.label is a city NAME (not raw
  // coordinates), so the fuzzy name-matcher is the right tool, not the
  // polygon resolver. Fail fast if it doesn't resolve — every candidate in
  // this run shares the same authority, so an unresolved region means
  // nothing in this run can pass the chokepoint anyway.
  const { findAuthorityByCityName, buildValidatedDoc } = await import('../src/lib/route-collections');
  const authoritySnap = await db.collection('authorities').get();
  const authorityList = authoritySnap.docs.map(d => ({ id: d.id, name: (d.data().name as string) || '' }));
  const knownAuthorityIds = new Set(authorityList.map(a => a.id));
  const resolvedAuthorityId = findAuthorityByCityName(REGION.label, authorityList);
  if (!resolvedAuthorityId) {
    console.error(`❌ Could not resolve an authority for REGION.label="${REGION.label}" — checked against ${authorityList.length} known authorities. Aborting (no candidate in this run could pass the chokepoint without it).`);
    process.exit(1);
  }
  console.log(`resolved authority: ${REGION.label} → ${resolvedAuthorityId}`);

  console.log('loading Terrain-RGB DEM tiles …'); await loadTiles(); console.log(`  decoded ${tiles.size} tiles`);
  let boundaryPoly: number[][] | null = null;
  if (REGION.boundaryClipWikidata) {
    console.log(`fetching admin boundary polygon (wikidata=${REGION.boundaryClipWikidata}, clip-filter only — not used as discovery scope) …`);
    boundaryPoly = await fetchAdminBoundaryPoly(REGION.boundaryClipWikidata);
    console.log(boundaryPoly ? `  boundary polygon loaded: ${boundaryPoly.length} vertices` : '  ⚠ boundary polygon not found — clip filter skipped');
  }
  let candidates: Candidate[] = [];
  let blockPolys: { poly: number[][]; label: string }[] = [];
  let stats: any = {};
  if (!SKIP_OSM) {
    const d = await discover();
    candidates = d.candidates; blockPolys = d.blockPolys; stats = d.stats;
    console.log(`\ndiscovered: ${stats.relations} trail-relations → ${stats.relLines} local lines (${stats.relRescued || 0} rejected-for-length, rescued named members) · ${stats.parks || 0} named park/garden loops · ${stats.loops} loops · ${stats.segments} named segments (from ${stats.ways} ways, ${stats.stitchedSameName || 0} same-name + ${stats.stitchedCrossName || 0} cross-name stitches, ${stats.recreationalGateDropped || 0} candidates dropped by the recreational-quality gate). road bike lanes: ${stats.bikeLaneSegments || 0} named (from ${stats.bikeLaneWays || 0} tagged ways). blocking polygons: ${blockPolys.length}`);
  } else {
    console.log('--skip-osm: skipping Overpass discovery; fetching blocking polygons only (for the round-trip artifact filter) …');
    blockPolys = await fetchBlockPolys(REGION.bbox);
  }
  if (ROUNDTRIPS) {
    const rt = await discoverRoundTrips(db, REGION);
    candidates.push(...rt.candidates);
    stats.roundtrip = rt.stats;
    console.log(`round-trips: attempted ${rt.stats.attempted}, built ${rt.stats.built} (3km:${rt.stats.perDist[3]} · 5km:${rt.stats.perDist[5]} · 10km:${rt.stats.perDist[10]}), loop-closed ${rt.stats.closed}, failed ${rt.stats.failed}. blocking polygons: ${blockPolys.length}`);
  }

  // filter artifacts + enrich + validate through the Stage 1B chokepoint.
  // Validated in the SAME code path regardless of --dry-run, so the dry-run
  // preview reflects what would actually be allowed to write, not just what
  // buildRouteDoc happened to produce. A validation failure drops just that
  // one candidate (logged, not silent) rather than aborting the whole run —
  // in practice none should fail, since authorityId is resolved above and
  // difficulty was fixed in Stage 0, but this is the safety net for
  // anything this investigation missed.
  // Quality-certificate v1 composition — ONE city-wide way-grid fetch for the
  // whole run (not per-candidate), reusing the exact same classifier module
  // Stage 1/2's backfill uses (scripts/lib/route-composition-classify.ts).
  // discover()'s own internal way-fetches (roadSegGrid, the named-segment
  // fetch, etc.) are each scoped narrower for their own purpose — none is
  // the unrestricted "every highway way, all tags" fetch composition
  // classification needs — so this is a genuinely separate fetch, not a
  // duplicate of one discover() already made. Skipped under --skip-osm
  // (no way data fetched at all that run) — composition is then simply
  // omitted from every doc, never faked.
  let cityGrid: CityWayGrid | null = null;
  if (!SKIP_OSM) {
    console.log('\nFetching city-wide way grid for quality-certificate composition …');
    cityGrid = await fetchCityWayGrid(`${REGION.bbox.latMin},${REGION.bbox.lonMin},${REGION.bbox.latMax},${REGION.bbox.lonMax}`);
    console.log(`  ${cityGrid.wayCount} ways fetched (${cityGrid.roadWayCount} road-category).`);
  }
  const wayCategoryCache = new Map<number, WayCategory>();

  // Lighting at discovery time. Reads the region's ALREADY-INGESTED
  // street_segments (no new fetch, no Overpass call) via the same
  // computeRouteLighting used by scripts/backfill-route-lighting-haifa.ts,
  // honesty fix (untagged-vs-confirmed-unlit) included.
  //
  // REGION.computeLighting ?? fallback (Stage A, city-orchestrator plan,
  // 02.09.2026) replaces the old unconditional `REGION.label === 'חיפה'`
  // literal check — additive, not a replacement of the old behavior: none
  // of the 11 in-file REGIONS entries sets `computeLighting`, so every one
  // of them still falls through to the exact same `label === 'חיפה'` test
  // as before (Haifa true, everyone else false — byte-identical). The field
  // only takes effect for a region resolved from `city_registrations`
  // (src/lib/city-registrations.ts), where it defaults `true` at the
  // ingester script's own call site (not schema-defaulted) — the lighting
  // honesty-gate (`status:'unknown'`) already handles low-OSM-coverage
  // cities gracefully, so there's no remaining reason to default a new
  // city to `false` just for not being Haifa.
  const computeLightingForThisRegion = REGION.computeLighting ?? (REGION.label === 'חיפה');

  const kept: { doc: ReturnType<typeof buildRouteDoc>; c: Candidate }[] = [];
  const dropped: { name: string; reason: string }[] = [];
  const boundaryDropped: { name: string; reason: string }[] = [];
  for (const c of candidates) {
    const reason = artifactReason(c.pts, blockPolys);
    if (reason) { dropped.push({ name: c.osmName || c.externalId, reason }); continue; }
    const boundaryReason = outsideBoundaryReason(c.pts, boundaryPoly);
    if (boundaryReason) { boundaryDropped.push({ name: c.osmName || c.externalId, reason: boundaryReason }); continue; }
    const dem = demProfile(c.pts);
    const composition = cityGrid
      ? (() => {
          const comp = computeRouteComposition(c.pts as [number, number][], cityGrid!.waysById, cityGrid!.allGrid, cityGrid!.roadGrid, wayCategoryCache);
          return { sidewalkPct: comp.sidewalkPct, genuinePct: comp.genuinePct, ordinaryPct: comp.ordinaryPct, otherPct: comp.otherPct + comp.unmatchedPct };
        })()
      : undefined;
    const lighting = computeLightingForThisRegion
      ? await (async () => {
          const rawPath = c.pts.map(([lat, lng]: number[]) => ({ lat, lng }));
          const result = await computeRouteLighting(db, rawPath, [REGION.label]);
          return { status: result.status, litCoveragePct: result.litCoveragePct, isLit: result.isLit };
        })()
      : undefined;
    const doc = buildRouteDoc(c, dem, resolvedAuthorityId, composition, lighting);
    try {
      const validatedDoc = buildValidatedDoc('official_routes', doc, { mode: 'create', knownAuthorityIds }) as typeof doc;
      kept.push({ doc: validatedDoc, c });
    } catch (e: any) {
      dropped.push({ name: c.osmName || c.externalId, reason: `chokepoint: ${e.message}` });
    }
  }

  // Prefer loops: loops first, then by (climb-weighted) length descending.
  kept.sort((a, b) => (Number(b.c.isLoop) - Number(a.c.isLoop)) || (b.doc.distance * (1 + (b.doc.elevationGain || 0) / 100) - a.doc.distance * (1 + (a.doc.elevationGain || 0) / 100)));

  const nParks = kept.filter(k => k.c.kind === 'park').length;
  const nLoops = kept.filter(k => k.c.isLoop && !k.c.isBicycle && k.c.kind !== 'park').length;
  const nTrails = kept.filter(k => k.c.kind === 'trail' && !k.c.isBicycle).length;
  const nSegments = kept.filter(k => k.c.kind === 'segment' && !k.c.isLoop && !k.c.isBicycle).length;
  const nCycling = kept.filter(k => k.c.isBicycle).length;
  const nStitched = kept.filter(k => (k.c.sourceWayIds?.length ?? 0) > 0).length;
  console.log(`\nAFTER FILTER: ${kept.length} routes kept (${nParks} park loops, ${nLoops} loops, ${nTrails} marked-trail lines), ${dropped.length} artifacts dropped, ${boundaryDropped.length} dropped as outside the boundary.`);
  console.log(`  by type: ${nTrails} trail · ${nParks} park · ${nLoops} loop · ${nSegments} named segment · ${nCycling} cycling  (${nStitched} of these are stitched from >1 OSM way)`);
  if (dropped.length) dropped.slice(0, 10).forEach(d => console.log(`   ✗ artifact: ${d.name} — ${d.reason}`));
  if (boundaryDropped.length) boundaryDropped.slice(0, 15).forEach(d => console.log(`   ✗ outside boundary: ${d.name} — ${d.reason}`));

  console.log('\n── candidates (loops first) ──');
  for (const k of kept) {
    const d = k.doc;
    const icon = k.c.kind === 'park' ? '🌳' : k.c.isBicycle ? '🚲' : k.c.isLoop ? '🔁' : k.c.kind === 'trail' ? '🥾' : '·';
    const stitchNote = (k.c.sourceWayIds?.length ?? 0) > 0 ? ` (stitched from ${k.c.sourceWayIds!.length} ways)` : '';
    console.log(`  ${icon} ${String(d.distance).padStart(5)}m  gain ${String(d.elevationGain).padStart(4)}m  ${d.difficulty.padEnd(8)} ${d.activityType.padEnd(8)} ${d.name}  [${k.c.externalId}]${stitchNote}`);
  }

  if (DRY) { console.log(`\n[dry-run] no writes. ${kept.length} pending routes would be written to official_routes (batch ${REGION.batchId}).`); return; }

  // idempotent upsert by source.externalId; preserve moderation state on re-run.
  let created = 0, updated = 0;
  for (const k of kept) {
    const existing = await col.where('source.externalId', '==', k.c.externalId).limit(1).get();
    if (existing.empty) {
      await col.add({ ...k.doc, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      created++;
    } else {
      const prev = existing.docs[0].data();
      // never resurrect an already-moderated route back to pending
      const status = prev.status && prev.status !== 'pending' ? prev.status : 'pending';
      const published = prev.published === true ? true : false;
      await existing.docs[0].ref.set({ ...k.doc, status, published, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      updated++;
    }
  }
  console.log(`\n✅ official_routes: ${created} created, ${updated} updated — all status:'pending', published:false (batch ${REGION.batchId}). NO street_segments broadcast, NO merge.`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
