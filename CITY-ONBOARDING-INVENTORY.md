# City-Onboarding Inventory — Read-Only Audit

**Date:** 01.09.2026 · **Scope:** fact-finding for a future one-button "map this city" orchestrator. Zero code/config/data changed — this is a report only. Every claim below is either a direct code citation (file:line) or a live, read-only Firestore query run against production during this audit.

**Verified live totals (all queries cross-checked against each other):** 176 routes (158 `official_routes` + 18 `curated_routes`) · 18,426 `street_segments` · 938 `climb_segments` · 88 `route_adjacency` · 3,771 `osm_amenities` · 1,165 `parks` · ~2,750 `authorities` docs (only 4 with real city data).

---

## 1. Data-Source Inventory

| # | Pipeline | Script / module | Trigger | Writes to |
|---|---|---|---|---|
| 1 | Route generation/discovery | `scripts/geo-discovery-routes.ts` (1925 lines) | **Manual CLI only**: `npx tsx scripts/geo-discovery-routes.ts --region=<name> [--dry-run\|--delete\|--roundtrips\|--skip-osm]`. No `package.json` script, no admin-UI button. New city requires a new `REGIONS` entry in-file. | `official_routes` (`status:'pending', published:false` — never live directly). Via the Stage-1B chokepoint, `buildValidatedDoc(..., {mode:'create'})`, geo-discovery-routes.ts:1781,1875 |
| 2 | `street_segments` import | `src/features/admin/services/osm-segment-importer.ts` (824 lines) | **Two live paths**: (a) admin UI `/admin/segments` (dry-run + browser commit), (b) CLI `src/scripts/import-osm-segments.ts` (dry-run everywhere; real commit via REST+ID-token) | `street_segments`, via `commitSegmentsToFirestore` → chokepoint (line 718) |
| 3 | Composition (`qualitySignals.composition`) | `scripts/lib/route-composition-classify.ts` (pure classifier) + `scripts/backfill-route-quality-signals.ts` | **Manual CLI**, dry-run default: `npx tsx scripts/backfill-route-quality-signals.ts [--apply]`. Also computed **inline, automatically**, inside pipeline #1 at discovery time (geo-discovery-routes.ts:87 imports `computeRouteComposition` directly) | `official_routes`/`curated_routes.qualitySignals.composition` |
| 4 | Lighting (`qualitySignals.lighting`) | `scripts/backfill-route-lighting-haifa.ts` + `scripts/lib/route-lighting-street-segments.node.ts` | **Manual CLI**, dry-run default: `npx tsx scripts/backfill-route-lighting-haifa.ts [--apply]`. **Confirmed Haifa-only by explicit hardcode**: `const HAIFA_CITY = 'חיפה'` (line 39) filters the query (line 68); geo-discovery-routes.ts independently mirrors the same restriction (`REGION.label === 'חיפה'`, ~line 1846, with a comment that other regions' `street_segments` coverage "hasn't been reviewed for this yet") | `official_routes.qualitySignals.lighting` (re-includes existing `composition` unchanged in the same write, since a partial-object write would fail schema validation) |
| 5 | Elevation/DEM | `src/lib/dem-tile-cache/` + `route-difficulty.service.ts` (pure bucketing, never fetches DEM itself) + `POST /api/admin/routes/dem-recompute` | **Automatic**, fires on every geometry edit in the admin route editor (`route-geometry-edit.service.ts:209`) — not a separate manual step. Geo-discovery-routes.ts also has its own **separate**, embedded DEM loader for discovery-time enrichment (not the shared `dem-tile-cache/`) | No direct write from the API route itself (pure read+compute); the doc write happens via `InventoryService.updateRoute` |
| 6 | `climb_segments` | `scripts/write-climb-segments-tlv.ts` (creation) + `InventoryService.recomputeRouteEnrichmentForCity` (join) | **Manual CLI** for creation: `npx tsx scripts/write-climb-segments-tlv.ts [--dry-run\|--delete\|--prune-stairs]` — **hardcoded to `city:'תל אביב-יפו'`** (line 282), sourced from a local TLV-specific JSON dump of 23 DEM-detected climbs + OSM `incline=*`/`highway=steps` tags. The join step is **automatic and city-generic**, fires from `recomputeEnrichmentForCities` on route reject/bulk-reject/save/update (inventory.service.ts:1418,1445,1562,502), gated by `IS_ROUTE_ENRICHMENT_ORCHESTRATOR_ENABLED` | `climb_segments` (creation); `climb_segments`+`official_routes` (join, via chokepoint, inventory.service.ts:449-453) |
| 7 | `route_adjacency` | `route-adjacency.service.ts` (pure geometry) + `InventoryService.recomputeRouteAdjacencyForCity` | **Automatic**, city-generic, gated on `IS_ROUTE_ADJACENCY_ENABLED=true` (`feature-flags.ts:713`), fires from the same mutation points as #6. Reads only **published** routes. One-off retroactive-backfill CLI also exists (`scripts/backfill-route-adjacency.ts`) | `route_adjacency` — **full delete-then-rewrite** per city, not incremental |
| 8 | Parks | `park-import.service.ts` (bulk CSV, admin UI) / `ParkForm.tsx`→`parks.service.ts` (manual single-add) / `[category]` admin import (`src/app/admin/locations/import/[category]/page.tsx`) | Admin-UI buttons, all browser-triggered (client Firestore SDK) | `parks`, discriminated by `facilityType` |
| 9 | `osm_amenities` (court/bench/drinking_water/fitness_station) | `scripts/extract-osm-amenities-tlv.ts` | **Manual CLI**, `--apply` flag. **Hardcoded single-city**: `TLV_CITY = 'תל אביב-יפו'` (line 106, with a comment admitting it). Explicitly scopes OUT pedestrian crossings and dog-park/polygon geometry (line 308) | `osm_amenities`, via chokepoint (line 473) |

**Crosswalks / trees / dog parks — explicit check:**

| Signal | Code state | Live data state |
|---|---|---|
| **Crosswalks** (`highway=crossing`) | **ABSENT** — zero ingestion code anywhere in `src/` or `scripts/` for this category today | **Data exists anyway**: 2,206 real `osm_amenities` docs with `category:'crossing'` (all Haifa), 59% of the entire collection. `'crossing'` is not in the `AmenityCategory` enum (`osm-amenity.types.ts:27`) or the zod schema (`schemas.ts:171`) — these docs were written by code that is no longer in the repo, or an ad-hoc/manual run outside tracked history. **Data is an orphaned artifact; the pipeline to reproduce it is genuinely gone or was never committed.** |
| **Trees/shade/canopy** | **PARTIAL** — `Park.isShaded`/`Park.hasNaturalShade` are real, persisted fields (`park.types.ts:314-315`), but computed via Hebrew-keyword regex over free-text descriptions (`park-import.service.ts:636-650`: `/עצים\|צמרת\|חורשה\|צל טבעי/`), not real tree/canopy geometry. No `natural=tree`/`canopy` OSM query exists anywhere. Also settable as a manual admin toggle (`LocationEditor.tsx:566`). | Park-level only; **zero route-level tree/shade field exists at all** (confirmed absent both in code and in the older `audit-city-coverage.ts:352-353` gap list) |
| **Dog parks** (`leisure=dog_park`) | **PARTIAL** — no OSM ingestion exists. `dog_park`/`hasDogPark` exist as a manual admin category (`category-branding.service.ts:42,78,102`) and the same keyword-regex tagging pattern as shade (`park-import.service.ts:663`: `/כלבים\|דוג.?פארק\|dog.?park\|כלב/` → `dog_friendly`) | **Also orphaned live data**: 18 `osm_amenities` docs with `category:'dog_park'` (all Haifa) — same "no known writer" situation as crossing above. `dog_park` is not in the `AmenityCategory` enum either. |

---

## 2. Per-City Coverage Matrix

Live counts, read-only, 01.09.2026. Only 4 cities have any real route/segment data at all (out of ~2,750 `authorities` docs — the overwhelming majority of authority records carry zero geo data).

| City | official_routes | curated_routes | street_segments | climb_segments | route_adjacency | osm_amenities | composition present | lighting: computed / unknown / absent |
|---|---|---|---|---|---|---|---|---|
| **חיפה (Haifa)** | 77 | 0 | 7,246 | 758 | **0** | 2,709 | 77/77 | 4 / 73 / 0 |
| **תל אביב-יפו (TLV)** | 27 | 18 | 1,144 (+6,692 under a mis-tagged authorityId — see below) | 180 | 32 | 1,062 | 45/45 | 0 / 0 / 45 |
| **זכרון יעקב** | 27 | 0 | 2,177 | 0 | 56 | 0 | 27/27 | 0 / 0 / 27 |
| **שדרות (Sderot)** | 27 | 0 | 1,167 | 0 | 0 | 0 | 27/27 | 0 / 0 / 27 |

**Known data-quality artifact confirmed live:** 6,692 `street_segments` docs have `authorityId:'placeholder_tlv'` (a literal string, not a real authority doc) with `cityName:'תל אביב'` (missing the `-יפו` suffix) — the "TLV two-spelling debt" already logged in memory as unfixed. These are real TLV segments, just invisible under the wrong key; real TLV total is 1,144+6,692 = 7,836.

**Field-name inconsistency across collections** (confirmed by sampling, not assumed): routes/`climb_segments`/`osm_amenities` use `authorityId`+`city`; `street_segments` uses `authorityId`(often null)+`cityName`; `route_adjacency` has **no `authorityId` field at all** (0/88 docs) — `cityName` only. A future orchestrator querying "give me everything for city X" cannot use one consistent key across collections today.

**Claim checks (as requested):**
- **"Amenities appear TLV-only" — REFUTED.** Real split: Haifa 2,709 (72%) vs TLV 1,062 (28%). Root cause of the wrong belief: `osm_amenities.importBatchId` is literally `"tlv-amenities-2026-08-19"` on **both** cities' docs — a misleading batch-name artifact. The only known ingestion script (`extract-osm-amenities-tlv.ts`) is TLV-hardcoded, so **Haifa's 2,709 docs (including the orphaned crossing/dog_park categories) were written by an undiscovered second mechanism** — not found anywhere in the current codebase. Open question, not resolved by this audit.
- **"Lighting is Haifa-only" — CONFIRMED**, and it's a stronger absence than a status value: every non-Haifa route's `qualitySignals.lighting` key is entirely **missing**, not `'unknown'`. Nuance: even within Haifa, only 4/77 (~5%) are genuinely `'computed'` — the other 73 are `'unknown'`-status placeholders.

**What's special about Haifa:** it leads every collection it appears in — most `street_segments` among correctly-tagged cities, 81% of all `climb_segments` (758/938 — no other city has *any*), 72% of `osm_amenities`, sole city with real lighting data, and the only city with a consistently-populated real `authorityId` (`9ZdWFmlkP0njOyFPceEw`) across every collection rather than falling back to a raw city string. Yet it has **zero `route_adjacency` docs** despite otherwise leading everything — see §5/§6, this traces to only 3/77 Haifa routes being `published` (adjacency only reads published routes).

---

## 3. Route-Tagging State

**Fields that exist directly on `Route`** (`src/features/parks/core/types/route.types.ts`):
- `features: RouteFeatures` (required, L243-252) — `{hasGym, hasBenches, lit, scenic, terrain, environment, trafficLoad, surface}`. Only `hasBenches` is amenity-like; no water/dog/court/fitness slots.
- `featureTags?: RouteFeatureTag[]` (L264-277) — closed union of 13 literals, includes `has_benches` and `water_fountain` directly, `dog_friendly` as a fuzzy (not dedicated dog-park) concept, and **no `court` or `fitness_station` value at all**.
- `qualitySignals?` (L404-419) — composition + optional lighting, already covered above; not amenity-adjacent.
- `terrainFeatures?: RouteTerrainFeatureRef[]` (L324-331) — cross-refs to `climb_segments` only, **the real precedent** for how a spatial join onto a route should look (see below).

**Live population** (sampled 158+18 real docs): `features` — 100% populated. `featureTags` — only 3/158 official (0/18 curated) actually carry any tags; real samples: `["has_benches"]`, `["night_lighting"]`, `["night_lighting","water_fountain","has_benches"]`. `terrainFeatures` — 0/176 populated (the Stage-3 spatial join exists in code but hasn't produced results in this sample).

**Verdict: amenity tagging is NOT "wire an existing slot."** `featureTags` can only absorb 2/5 needed concepts (bench, water) as coarse presence-booleans with no location/category structure — it has no enum value for court, fitness_station, or a real dog-park concept. The correct integration point is a **new field analogous to `terrainFeatures`** (e.g. `nearbyAmenities?: RouteAmenityRef[]`), populated by a **new spatial-join service analogous to `route-enrichment.service.ts`**, sourcing from the already-real `osm_amenities` collection (which has geometry, category, `authorityId`/`city` — everything needed except a `dog_park` enum member and the join itself). **Zero route↔amenity join exists anywhere in the codebase today** — confirmed by grep, no file references both `osm_amenities` and any route-writing code together. `route-comfort-tags.service.ts` (17.08.2026) is a third, smaller precedent already doing proximity-based auto-suggest for `featureTags` values (currently only `night_lighting`, with `shaded`/`near_water` named in-comment as natural next additions — not amenities-as-a-set).

---

## 4. Algorithm Inputs (Route Generator)

**Two genuinely separate pipelines — do not conflate them:** the **live generator** (`route-generator.service.ts`, real-time per-user-request, scores `street_segments`) vs **offline discovery** (`geo-discovery-routes.ts`, ad-hoc per-city, produces admin-review candidates). Discovery explicitly does not feed the live generator (geo-discovery-routes.ts:73: "pending routes stay out of the generator").

**Direct answer: yes, the live generator already, unconditionally, prefers higher-scored corridors** — two live mechanisms:
1. **`flowScore` arterial-hierarchy bonus** (`scoreArterialFlow()`, osm-segment-importer.ts:525-543) — a pure `highway=` rubric (primary=10 → footway/path=0), read at generation time via `preferArterialFlow: true`, hardcoded unconditionally at all 3 live generation call sites (route-generator.service.ts:3025,3138,3264, "generic main-street awareness, unconditional").
2. **`isOfficial` corridor bonus** — routes with an admin-approved `street_segments.officialRouteId` get a flat +10 tie-break bonus AND a 5× multiplier on their base score (route-generator.service.ts:445,455,511-523 — "guaranteed to dominate ALL other candidates"). Both bonuses only break ties among already-distance-appropriate candidates; they can't override the primary distance-fit score.

**But the base `street_segments.score` itself has the OPPOSITE bias** — `scoreSegment()` (osm-segment-importer.ts:437-507) rewards footway/pedestrian/cycleway/residential over tertiary/primary/secondary, plus OSM `lit`/`surface`/`maxspeed`/`sidewalk` tags. So the net effect is nuanced: pedestrian-friendly segments start with a higher base score, but among segments already in play, official/arterial ones get tie-break priority.

**Separately, the offline discovery-time "recreational-quality gate"** (`isSidewalkLikeWay`/`isGenuineRecreationalWay`, geo-discovery-routes.ts:557,601, `RECREATIONAL_MAJORITY_MIN_FRAC=0.5`) does the **opposite** of a main-road preference — it requires ≥50% dedicated trail infrastructure and actively penalizes both sidewalks and ordinary/arterial streets. This predates and is unrelated to this session's `qualitySignals.composition` certification classifier.

**(a) Signals that actively feed generation today:** base `street_segments.score` (highway type/surface/OSM `lit`/smoothness/maxspeed/sidewalk), `flowScore`, `isOfficial`/`officialRouteId`, `route_adjacency` (for corridor *chaining*, not scoring), nearby-park proximity, distance-fit, angular-sector diversity.

**(b) Signals computed and stored but never read back into generation:** `qualitySignals.composition`, `qualitySignals.lighting`, DEM `elevationGain`/`maxGrade`, `climb_segments` (only cross-referenced for display, never a scoring term). All confirmed absent from `route-generator.service.ts`/`osm-segment-importer.ts` by direct grep — these are pure certification/display data today, with zero feedback loop into what gets generated.

---

## 5. Orchestration State

**No orchestrator or scheduler exists.** Confirmed — every pipeline in §1 is either a standalone CLI script or an admin-UI button; nothing sequences them. The two *automatic* steps (climb/route-enrichment join, route_adjacency) are triggered by `InventoryService` mutation side-effects (save/update/reject), not a scheduler, and are gated behind feature flags.

**The actual manual sequence someone runs today to onboard one new city from scratch**, in dependency order:

1. **Authority must already exist** — a real `authorities` doc (prerequisite for every route-collection write per axioms §23's "no CREATE without a resolved authorityId" rule). Not a data-pipeline step; CRM/admin authority creation.
2. **`street_segments` import** — admin UI `/admin/segments` or CLI `import-osm-segments.ts`, for the new city. Needed before the *live generator* can produce any routes for this city at all (it scores `street_segments` directly).
3. **Route discovery** — `npx tsx scripts/geo-discovery-routes.ts --region=<city>` (after adding a `REGIONS` entry for it in-file, since it isn't parameterized by arbitrary name). Produces pending `official_routes`; composition is computed automatically inline; lighting is **not** — the Haifa-only branch is a literal string check, a no-op for any other region as written.
4. *(Optional, mostly redundant post-#3)* `backfill-route-quality-signals.ts --apply` — idempotent re-verification of composition, not strictly required for freshly-discovered routes.
5. **Manual human step — admin approval in Approval Center.** Routes sit `published:false` until someone approves them individually or in bulk. **This is empirically a real bottleneck today, even for Haifa**: 73/77 Haifa routes are still `pending`, only 3 `published`. Nothing downstream that depends on "published" (see #6) works until this happens.
6. **`route_adjacency`** — automatic once routes are published (gated `IS_ROUTE_ADJACENCY_ENABLED=true`), but only reads **published** routes — which is exactly why Haifa (mostly unpublished) shows zero adjacency docs despite leading every other collection. A retroactive CLI backfill exists if the automatic trigger is ever suspected of not firing.
7. **Parks** — admin-UI `[category]` import (per category, authority-selectable) or CSV bulk-import, independent of the route pipeline above; can run any time.
8. **`osm_amenities`** — **no generalizable pipeline exists.** The only known script is hardcoded to one city (`TLV_CITY` literal) and would need to be forked/parameterized. Even then it only covers 4 of the needed categories.
9. **`climb_segments`** — **no generalizable pipeline exists either.** `write-climb-segments-tlv.ts` is hardcoded end-to-end (city string AND its climb-detection source data, a TLV-specific local JSON file) — a full rewrite is needed for any other city, not just a parameter change.
10. **Lighting** — **needs code generalization, not just a re-run.** The underlying classifier (`computeRouteLighting`) is city-agnostic; the wrapper script and geo-discovery-routes.ts's own gate are both hardcoded to the literal string `'חיפה'`.

---

## 6. Gaps Summary

**True gaps — no code exists, would need to be built:**
- Crosswalk ingestion (real orphaned data exists with no reproducible writer — see §1)
- Real tree/canopy geometry signal (only a text-keyword proxy exists, at the park level)
- Route↔amenity spatial join (osm_amenities has zero connection to any route doc)
- Generalized (any-city) climb/terrain-feature detection
- `dog_park` as a real ingestion category anywhere (not in the `AmenityCategory` enum; Park-level tag is manual/keyword only)

**Exist, but only for some cities (real code, city-scoped or hardcoded):**
- Lighting — Haifa only (classifier is generic, wrapper isn't)
- `climb_segments` — TLV only (both trigger and source data are hardcoded)
- `osm_amenities` ingestion — TLV only in the one *known* script (Haifa's larger count comes from an unidentified second source — open question)
- `route_adjacency` — technically city-generic and automatic, but empirically populated for only 2/4 cities (Zichron Yaakov, TLV); gated on "published" status, so effectively blocked wherever the manual-approval step (§5.5) hasn't happened

**Exist, but not tied to routes (data sits in a separate collection, never joined onto the route doc):**
- `osm_amenities` (all categories, including the orphaned crossing/dog_park data) — zero join code
- Tree/shade — exists only at the Park level, never even modeled at the route level

**Missing orchestration only** (code/data already generic and working, just no scheduler): street_segments import → route discovery → composition backfill → DEM — all already parameterizable by city, just manually run today in the CLI sequence in §5.

**Missing orchestration + needs generalization first:** lighting (reusable core logic, hardcoded wrapper).

**Missing data (nothing to orchestrate — build the pipeline before there's anything to sequence):** crosswalks, dog-park ingestion, real tree/canopy data, route↔amenity join, generalized climb detection, and a TLV-agnostic `osm_amenities` importer.
