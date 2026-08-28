# Route-Data-Enrichment Pipeline — Scoping Audit (READ-ONLY)

> Date: 16.08.2026. Read-only investigation, nothing built or changed. Purpose: map what's REAL vs NEW before designing an orchestrated multi-agent route-enrichment pipeline (official routes, loops/laps, elevation→difficulty, tags/labels, climbs/ascents, stairs) feeding an admin panel with per-city tagging + human approval.

---

## 1. Route Data Collections

Five Firestore collections carry route/geo data (`firestore.rules:731-792`), all public-read / admin-write:

| Collection | Type | Populated by | Consumed by |
|---|---|---|---|
| `official_routes` | shared `Route` interface (`src/features/parks/core/types/route.types.ts:290-463`) — no dedicated type | `InventoryService` (8 mutation sites), OSM/DEM import scripts | `route-generator.service.ts`, admin inventory, heatmap overlay |
| `curated_routes` | same `Route` interface | `InventoryService.saveCuratedRoutes` — dual-writes to both `curated_routes` **and** `official_routes` | onboarding location step, admin routes page |
| `climb_segments` | ad-hoc, no dedicated type | `write-climb-segments-tlv.ts` (DEM+OSM), moderation writes | **Approval Center only** — no production client reader found |
| `street_segments` | `interface StreetSegment` (`route-generator.service.ts:276-303`) | 3 writers: `osm-segment-importer.ts`, `src/scripts/import-osm-segments.ts`, `official-route-broadcaster.ts` | live dynamic route generator (`fetchScoredWaypoints`/`fetchScoredWaypointsByProximity`), deviation orchestrator |
| `route_adjacency` | `AdjacencyEdge` in-memory type, explicit write shape | `InventoryService.recomputeRouteAdjacencyForCity` (incremental hook) + `backfill-route-adjacency.ts` (one-time) | `generateDiscoveredChainRoute`, `generateUserAnchoredFlowRoute` |

**`official_routes` schema highlights:** `distance, duration, score, type (ActivityType), difficulty ('easy'|'medium'|'hard'), features, featureTags[], segments, path, authorityId, city, status ('pending'|'published'|'archived'), published, origin, isHybrid/hybridType, curatedTier`. No elevation field on the type.

**`climb_segments` schema (ad-hoc, from writer scripts):** `type ('terrain'|'structure'|'stairs'), climbType, center, bbox, geometry, lengthM, avgGrade, maxGrade, dir, geohash, wayName, source ('dem'|'osm:<tag>'), stepCount, status ('pending'|'published'|'rejected'), origin, city, importBatchId`.

**⚠️ Documentation/reality gap:** `firestore.rules:748-758` describes `climb_segments` as queried by the client via `climbsNear()` for the live route generator. That function only exists as a standalone demo in `scripts/climb-layer-tlv.ts:114-118` (in-memory array filter, never touches Firestore). Zero references to `climbsNear` or `climb_segments` exist in `route-generator.service.ts` or anywhere in the live generation path. **`climb_segments` is write + moderation only today — nothing in the live app reads it.**

**`route_adjacency` schema:** `routeIdA, routeIdB, contactA {lng,lat}, contactB {lng,lat}, gapMeters, cityName, updatedAt`. Doc id = `[routeIdA,routeIdB].sort().join('_')` (idempotent).

---

## 2. Existing Mapping/Import Scripts ("agents")

No script is registered in `package.json`; all are run by hand via `npx tsx scripts/<name>.ts [flags]`.

| Script | Writes | Scope | Dry-run? |
|---|---|---|---|
| `import-osm-routes-tlv.ts` | `official_routes` (pending), upsert by `source.externalId` | Hardcoded TLV, 1 batch id | `--dry-run`, `--delete` |
| `geo-discovery-routes.ts` | `official_routes` (pending) + Mapbox DEM elevation + Overpass loop synthesis | Parameterized `--region=`, but only 2 regions configured today (zichron, ashkelon) | `--dry-run`, `--delete`, `--roundtrips` |
| `backfill-route-adjacency.ts` | `route_adjacency`, per-city batches | **National** — iterates every city found in published `official_routes` | Default dry-run; `--commit` to write |
| `backfill-street-segments-geohash.ts` | `street_segments` (adds `geohash` to legacy docs) | National, collection-wide | Default dry-run; `--commit` |
| `climb-segments-tlv.ts` | **Nothing to Firestore** — outputs `/tmp/tlv_climb_segments.json` | Hardcoded TLV bbox | N/A (read-only) |
| `write-climb-segments-tlv.ts` | `climb_segments` (pending), batched, preserves moderation state on re-run | Hardcoded TLV, 1 batch id | `--dry-run`, `--delete`, `--prune-stairs` |
| `recalc-route-distances.ts` | `official_routes.distance/duration` fix | Scoped to 2 hardcoded pilot `importBatchId`s (`--batch=` overridable) | `--dry-run` |
| `dem-climbs-tlv.ts` *(found, not in original list)* | Nothing — read-only DEM climb detector, outputs tmp json + SVG heatmap | Hardcoded TLV | N/A |
| `climb-layer-tlv.ts` *(found)* | Nothing — read-only demo unifying terrain+structure+stairs, demos `climbsNear()` | Hardcoded TLV | N/A |
| `src/scripts/import-osm-segments.ts` *(found)* | `street_segments` via raw Firestore REST + manual ID token | Fully parameterized (`--city/--authority/--bbox`) | Requires `--dry-run` or `--commit` |
| `src/features/admin/services/osm-segment-importer.ts` *(found)* | `street_segments`, `writeBatch` | Fully parameterized `ImportOptions` — shared lib, not a script | `commit: boolean` switch |
| `official-route-broadcaster.ts` *(found)* | `street_segments` from `official_routes` on save/publish | Per-route, resolves city dynamically | Gated on `published` flag only, no dry-run |

**Two independent tmp-file chains exist (human-driven, not code-driven):**
- `dem-climbs-tlv.ts` → `climb-layer-tlv.ts` (read-only demo)
- `climb-segments-tlv.ts` → `write-climb-segments-tlv.ts` (the actual write path)

Both require a human to run stage N, inspect output, then manually run stage N+1.

---

## 3. Difficulty & Elevation

**Elevation: EXISTS as a wired data source (Mapbox Terrain-RGB DEM, hand-rolled decoder), but only in offline CLI scripts — not in the live app.**
- `geo-discovery-routes.ts:219-228` computes `gainM`/`maxGrade` per candidate route and persists `elevationGain`/`maxGrade` onto `official_routes` docs.
- `write-climb-segments-tlv.ts` persists DEM-derived `avgGrade`/`maxGrade`/`lengthM` onto `climb_segments` docs (not raw elevation profile, only derived grade).
- **Confirmed: neither field is ever read back** by `route-generator.service.ts` or `inventory.service.ts` — written but unconsumed.
- Unrelated: live device GPS altitude accumulates a per-session `elevationGain` in the running player (`useRunningPlayer.ts:1184-1198`) — sensor data, nothing to do with route/segment elevation.

**Difficulty scoring: `scoreSegment` and `scoreWaypoint` have ZERO elevation/difficulty input.**
- `scoreSegment` (`osm-segment-importer.ts:365-435`) — scores OSM way quality only: highway type, surface, lit, smoothness, maxspeed, sidewalk.
- `scoreWaypoint` (`route-generator.service.ts:1036-1135`) — scores waypoint candidate fit: proximity to parks/gyms, distance-tier fit, official-route bonus, safety cutoff.
- A genuine difficulty heuristic exists **only** in `geo-discovery-routes.ts:388-389`: `(distanceKm>8 || gain>200) ? 'hard' : (distanceKm>3.5 || gain>80) ? 'moderate' : 'easy'`.
- **⚠️ Bug/inconsistency found:** this heuristic's type is `'easy'|'moderate'|'hard'`, but `Route.difficulty` on the core type is `'easy'|'medium'|'hard'` — **`'moderate'` vs `'medium'` mismatch.** Any route ingested via this script would carry a difficulty value the rest of the app's type doesn't expect.

**Verdict: the elevation/climb DEM building blocks (fetch, decode, grade computation, classification) already exist and have run for real — but as one-off CLI scripts targeting specific regions, with zero wiring into the live generator, live scoring functions, or any read path.**

---

## 4. Tags/Labels

No unified free-form tag system. Three separate mechanisms:

1. **`RouteFeatureTag`** — closed 13-value enum (`route.types.ts:248-288`: night_lighting, has_benches, stairs_training, parkour_friendly, etc.) with Hebrew labels. Stored on `Route.featureTags`. **Manually assigned** by an admin via checkboxes in `RouteEditor.tsx` (~line 579-593). One route at a time.
2. **`Route.description`** — free text, admin-entered or auto-generated by ingestion scripts.
3. **`climb_segments.climbType`** — script-assigned category (`short-sharp`/`repeats`/`long-gentle`/`structure-ramp`/`stairs`), surfaced via `CLIMB_TYPE_LABELS` in the approval UI. Automated, not manual.

No generic `category` field exists anywhere on `Route` or segment types.

---

## 5. Route Types

**No persisted loop/out-and-back/point-to-point enum on the `Route` type.**
- `isLoopRoute()` (`useRouteDeviationOrchestrator.ts:105-115`) derives loop-ness at **runtime** from path start/end proximity — never stored.
- `returnShape?: 'out_and_back'` (`route-generator.service.ts:267`) is an explicit **placeholder seam** — only value implemented is `'out_and_back'`; `'loop'` is reserved but not built.
- `isLoop: boolean` is written by `geo-discovery-routes.ts`/`import-osm-routes-tlv.ts` but **is not part of the `Route` TypeScript type and is never read anywhere** — an orphaned field.
- **"Climb" is a sibling entity type**, not a route-shape value: `ModerationEntityType = 'park'|'route'|'climb'|'contribution'` treats climbs as their own moderated entity backed by `climb_segments`, separate from `official_routes`.

**Stairs — recognized, but three pipelines handle it three different ways:**
- `osm-segment-importer.ts` — `HIGHWAY_TYPES` never includes `steps`; if one slipped through, it's silently dropped into a generic "skipped" counter. No dedicated handling.
- `geo-discovery-routes.ts` — explicitly **excludes** `highway=steps` from route candidates (comment: "stairs are not routes").
- `write-climb-segments-tlv.ts` — the only pipeline giving stairs a **dedicated category** (`type:'stairs'`), with escalator filtering and a significance threshold (`STAIR_MIN_STEPS=15` or `STAIR_MIN_LEN=15m`).
- Separately, a manual `stairs_training` `RouteFeatureTag` exists — an unrelated admin amenity flag, not derived from OSM steps detection.

---

## 6. Corridor/Loop Engine (route_adjacency) — CONFIRMED SHIPPED

- Flag `IS_ROUTE_ADJACENCY_ENABLED` (`src/config/feature-flags.ts:643`) — **`true`** as of commit `f30e56a9` (16.08.2026).
- `route-adjacency.service.ts` — pure, I/O-free geometry: nearest-contact-point search, geohash-prefiltered candidate pairing (5km default), `computeCorridorAdjacency(corridors, thresholdMeters=1000)`, loop-rotation/splice helpers for chaining.
- **Populated two ways**, both calling the same pure function: (1) incremental hook fired from 8 `official_routes` mutation sites (save/approve/reject/delete), (2) one-time `backfill-route-adjacency.ts` (needed because the flag was false its entire life until 16.08, so the collection was empty).
- **Scoped strictly per-city**, not national — confirmed live result: **88 edges across 3 cities** (Zichron Yaakov 56, Tel Aviv-Yafo 32, Sderot 0).
- Free-run wiring (commit `5e1b4ae2`): `useRouteGeneration.ts:184-187` sets `userAnchoredCorridorFlow` on the free-run map builder specifically — deliberately **not** wired into the shared dispatcher fallthrough, so hybrid/step-deficit/deviation-recovery flows are unaffected.
- Standing caveat documented in the code itself: a geometric gap proves corridors are *close*, never *walkable* — a fence/highway/tracks could sit between them. Every discovered connector needs a real-map review, not auto-accept on distance alone.

---

## 7. Admin Panel for Routes

- **`admin/routes/page.tsx`** (super-admin) — the only page with a real per-city view: a city filter dropdown + multi-select checkboxes over the full `official_routes` inventory. **But bulk actions are delete-only** (`bulkDeleteRoutes`, `deleteRoutesByCity`) — no bulk approve, no bulk tag, no bulk difficulty. Per-row status toggle is one-at-a-time.
- **`admin/authority/routes/page.tsx`** — single-authority-scoped list (auto-resolved, no city switch), per-row approve button only.
- **`RouteEditor.tsx`** — single-route draw/edit tool (shared by both new-route flows). One route at a time; `featureTags` picker applies only to the route being edited.
- **Approval Center (`admin/approval-center/page.tsx`)** — **NOT route-specific.** A generic 4-tab moderation queue: `locations` (parks), `routes` (`official_routes`), `climbs` (`climb_segments`, super-admin only), `ugc`. All four share the same approve/reject dispatch (`moderation.service.ts`). One entity at a time via `ApprovalDetailModal`, no batch/multi-select.
- **Approval flow (route):** `published`(bool) + `status` (`pending|published|archived`) gate visibility. Approve → `InventoryService.approveRoute` → sets published/status, **then fires two downstream writes**: `broadcastRouteToStreetSegments` (feeds the generator) and `recomputeAdjacencyForCities` (feeds corridor chaining). Two distinct reject semantics exist: inventory-tab reject = soft "back to pending"; Approval Center reject = permanent "archived" with `rejectionReason`/audit fields — not the same operation despite the shared name.
- **No per-city bulk tagging surface exists anywhere.** Every mutation that isn't delete or import-time authority assignment (tag, difficulty, activityType, approve/reject) operates on exactly one route/segment at a time today. Closest candidate (`admin/routes/page.tsx` "bulk assign city/authority") only applies to routes in the *current import batch being added*, not to already-saved inventory.

---

## 8. Orchestration — CONFIRMED: NONE EXISTS

No central runner coordinates multiple mapping/enrichment steps per city. Every script above is invoked manually, one at a time, by hand.

Confirmed by: grepping all of `scripts/` and `src/` for orchestrator/pipeline/runner/run-all patterns (all hits belong to unrelated subsystems — workout engine, hybrid orchestrator, onboarding questionnaire chain, live-run deviation recovery); per-file cross-reference of all 14 route/geo/climb files found no imports linking them to each other or to a common caller; zero `package.json` script entries reference any of them. This matches a prior independent audit in this repo (`.claude/knowledge/autonomous-city-mapping-audit.md`, 13.07.2026), which reached the same conclusion.

**The one live "automatic" wiring found** — `official-route-broadcaster.ts`, called from `InventoryService` whenever an `official_routes` doc is saved/approved — is a **reactive side-effect of the app**, not a per-city multi-step coordinator. It fires regardless of whether a script or an admin UI action caused the save.

---

## Bottom line: what's REAL vs NEW for the planned pipeline

**REAL (extend, don't rebuild):**
- 5 Firestore collections with working schemas and writers
- OSM segment scoring (`scoreSegment`), waypoint scoring (`scoreWaypoint`) — surface-quality only
- DEM elevation fetch+decode+grade computation, proven in `geo-discovery-routes.ts` and the climb scripts (region-parameterized pattern already exists in `geo-discovery-routes.ts`)
- Climb/stairs classification logic (`write-climb-segments-tlv.ts`) — terrain/structure/stairs, with escalator filtering and significance thresholds
- Corridor/adjacency engine (`route-adjacency.service.ts`) — pure, tested, per-city, shipped and flag-enabled
- Admin approval infrastructure (generic moderation queue, per-entity approve/reject, `official_routes`↔`street_segments`↔`route_adjacency` cascade on approve)
- A per-city filtered route inventory view (delete-only bulk actions today)

**NEW (would need to be built):**
- Any central orchestrator/runner coordinating multiple enrichment steps per city — currently 100% manual CLI, single-city-hardcoded in most scripts
- Wiring elevation/difficulty into the live generator or scoring functions (currently write-only, never read back)
- A real difficulty computation reachable at runtime (today's only difficulty heuristic lives in one ingestion script, and its enum doesn't even match the `Route` type — `'moderate'` vs `'medium'`)
- A unified tag/label system (today: 3 disconnected mechanisms, all closed-enum or script-fixed, none free-form)
- A persisted route-type field (loop/out-and-back/climb) — today derived at runtime or a single-value placeholder
- Consistent stairs handling — 3 pipelines currently disagree (silently drop / explicitly exclude / dedicated category)
- Any per-city BULK tagging/approval surface — today every non-delete mutation is one route/segment at a time
- Making `climb_segments` actually consumed by the live route generator — the rules-file-documented `climbsNear()` read path does not exist in code
