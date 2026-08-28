# Autonomous City Mapping — Infrastructure Audit + Architecture

> Read-only audit (13.07.2026). No code was changed. Every inventory claim cites `file:line`.
> Part A = **what exists today**. Part B = **architecture recommendation** for turning it autonomous. Gaps are marked ⚠️.
> Compiled from 5 parallel read-only sub-agent sweeps of branch `feat/approval-center-detail-view`.

---

## TL;DR

- The full **deterministic** mapping toolkit already exists — OSM ingestion, DEM climb detection, loop synthesis, reverse-geocoded naming, terrain validation, the approval queue. It writes clean `pending` items to Firestore.
- What's missing is **not capability — it's autonomy**: every pipeline is a **manual CLI script** (`npx tsx …`). Nothing runs server-side, nothing runs on a schedule, nothing auto-triages.
- The 24/7 rail to host it on **already exists and is proven in production**: `functions/` is a deployed Firebase Functions project (Node 20) with **7 scheduled functions** running via Cloud Scheduler.
- **Zero LLM calls happen anywhere in the current pipeline.** Keep it that way for the bulk; introduce an LLM **only** as a QA adjudicator for the ambiguous middle band. At city scale that's ~dozens of small calls, not thousands.
- The core correction: an autonomous mapper **cannot be a Claude Code session or a local script** — those die with the machine. It must be a deployed cloud job that *calls* an LLM as an API for the fuzzy 10%.

---

# PART A — INVENTORY (what exists today)

## A1. Asset ingestion — OSM → Firestore

| Script | Source | Writes to | Run method |
|---|---|---|---|
| `scripts/geo-discovery-routes.ts` | Overpass API (3 mirrors) + Mapbox Terrain-RGB DEM | `official_routes` | `npx tsx … --region=zichron [--dry-run] [--delete]` |
| `scripts/import-osm-routes-tlv.ts` | Pre-computed JSON (`/tmp/tlv_routes_final.json`) | `official_routes` | `npx tsx … [--dry-run]` |
| `src/scripts/import-osm-segments.ts` → `osm-segment-importer.ts` | Overpass API | `street_segments` (doc id `osm_{id}`) | `npx tsx … --city … --south … --dry-run\|--commit` |

**geo-discovery-routes.ts** — the generalized ingester:
- Overpass mirrors defined at `scripts/geo-discovery-routes.ts:97`; POST with retry at `:97–109`.
- Three query shapes: trail relations (`route=hiking|foot|walking|running`, `:198`), closed-way loops and named segments (`highway=footway|path|track|pedestrian|cycleway`, `:236`).
- DEM enrichment (elevation/grade) via Mapbox Terrain-RGB tiles, hand-rolled PNG decode via zlib, `:120–151`; silently degrades `elevationGain`/`maxGrade` to `0` if `NEXT_PUBLIC_MAPBOX_TOKEN` missing (`:135`).
- **Idempotent upsert** keyed on `source.externalId` (`:389`); on update it **preserves moderation state** (`:396–398`) — won't resurrect an archived route to `pending`.
- Distance stored in **meters** (`distance`, `:309`); `distanceKm` computed on the fly only (`:301`), never persisted.
- Region config is a hardcoded map with **only `zichron`** populated (`:55–66`) — adding a city = editing the script. ⚠️

**Route document shape** (`buildRouteDoc`, `scripts/geo-discovery-routes.ts:306–339`; types `src/features/parks/core/types/route.types.ts:253–414`): `name`, `description`, `distance` (m), `duration` (min), `path: {lng,lat}[]` (Firestore-normalized objects, `:318`), `elevationGain`, `maxGrade`, `isLoop`, `geohash` (prec 7), `city`, `importBatchId`, `source.{type,name,externalId,osmRef}`, and the moderation gate: **`status:'pending'`, `published:false`** (`:337–338`).

## A2. Route generators — synthesis (two engines, one relevant)

**Generator A — `generateDynamicRoutes()`** (`src/features/parks/core/services/route-generator.service.ts:544–778`):
- On-demand triangular loop via Mapbox Directions. Waypoints from `street_segments` (scored) or random fallback.
- **In-memory only — never persisted** (`:777`). Used for FreeRun exploration.
- **Lacks the quality fixes** (no `continue_straight`, no bearing-order, no RDP smoothing). Not the city-mapping engine.

**Generator B — `RouteStitchingService.generateCuratedRoutes()`** (`src/features/parks/core/services/route-stitching.service.ts:869–1128`) — **this is the city-mapping route engine:**
1. Fetch GIS/`street_segments` by authority, filter by activity compatibility (`:906`).
2. **K-means density clustering** → 3–8 neighbourhood groups (`:952–956`).
3. **Diamond waypoints** — 4 cardinal bearings per cluster×tier (`:968–987`).
4. **Facility snapping** — gyms/stairs/benches, tiered by activity (walking ≤4 stops, running ≤2), 300m radius (`:989–1003`).
5. **Mapbox circular route with `continue_straight=true`** (`buildCircularRoute`, `:366`) + failure retry without it (`:375`).
6. **Douglas-Peucker RDP smoothing**, tol 15m/8m (`:1018–1020`).
7. **Persists to `curated_routes` + `official_routes`** (`:1102–1106`).
- Admin-triggered today (`admin/routes/page.tsx`). Quality fixes from merge `dba0333` live here only.

## A3. Climbs / stairs pipeline (3 stages)

**Discovery (read-only, → `/tmp/*.json`):**
- `scripts/dem-climbs-tlv.ts` — Mapbox Terrain-RGB DEM sampled along OSM foot ways; sliding-window climb detection (40m+, 3%+ grade), suspect flags for bridges/tunnels/`maxGrade>18%`.
- `scripts/climb-segments-tlv.ts` — multi-scale window classification: `short-sharp` (≥8%, 50–150m), `repeats` (5–8%, 150–300m), `long-gentle` (3–5%, 200–300m).

**Backfill (the main writer) — `scripts/write-climb-segments-tlv.ts` → `climb_segments`:**
- Three sources: **terrain** (from the classifier JSON), **structure** (OSM `incline`/`ramp` foot ways), **stairs** (OSM `highway=steps`).
- **Terrain validation** (`:139–145`, commit `f3007cb`): must sit ≤15m from a walkable OSM way AND not inside a blocking polygon (`natural=water`, marina/pool, `access=private`). Two bbox Overpass queries then **local** geometry per climb (rate-limit friendly).
- **Escalator filter** (`:182–189`, commit `a7484ab`): skip if `conveying != 'no'`; deletes previously-written escalators.
- **Stair significance** (`:26–28`): keep if `stepCount ≥ 15` OR `lengthM ≥ 15`.
- **Titles via Mapbox reverse-geocode** (`:70–79`), street-first priority chain `address→poi→neighborhood→locality→place`, rejects bare numbers/`way/1234` (`:53–54`). Result: 196/196 named, 0 numeric (commit `5b2fe0d`).
- Geometry stored as **`{lng,lat}` objects** (nested arrays forbidden by Firestore, commit `9c5dacb`).
- Writes **`status:'pending'`**, `origin:'osm_import'`, `city:'תל אביב-יפו'` (**hardcoded** ⚠️), `importBatchId` (`:236–243`); re-runs preserve moderation state.
- Current collection: **196 docs** (23 terrain, 27 structure, 130 stairs).

## A4. Approval queue + moderation contract

**UI** `src/app/admin/approval-center/page.tsx` (4 tabs: parks / routes / climbs / UGC). **Service** `src/features/admin/services/moderation.service.ts` (`approveEntity`, `rejectEntity`, both write an audit log via `logAction()`).

**Status contract per entity** (the target every writer must hit for an item to land in the queue):

| Entity | Collection | Pending | Approved | Rejected |
|---|---|---|---|---|
| park | `parks` | `contentStatus:'pending_review'` + `published:false` | `'published'` + `true` | `'draft'` + `false` + `rejectionReason` |
| route | `official_routes` | `status:'pending'` + `published:false` | `'published'` + `true` | `'archived'` + `false` + `rejectionReason` |
| climb | `climb_segments` | `status:'pending'` | `'published'` | `'rejected'` + `rejectionReason` |
| contribution (UGC) | `user_contributions` | `status:'pending'` | `'approved'` | `'rejected'` + `rejectionReason` |

- **climbType sub-filter** chips (all / short-sharp / repeats / long-gentle / structure-ramp / stairs), `page.tsx:250–254` (commit `a7484ab`).
- **Role scoping** (`page.tsx:116–119`): super-admin sees all; authority manager sees own `authorityIds` or self-created. **Climbs are super-admin-only** (`:164–165`).
- Approve side-effects flip status + set `publishedAt`/`reviewedBy`/`reviewedAt`; UGC `new_location` approval **creates a live Park + awards XP** (`contribution.service.ts:191–192`).

## A5. City / authority association

- Parks/routes carry an **explicit `authorityId`** field (`park.types.ts:275`, `route.types.ts:309`), **set manually by the admin in the form** (`ParkForm.tsx:374`) — not derived geographically.
- Authority model **has** `boundaryGeoJSON: Feature<Polygon>` (`admin-types.ts:154`) + `coordinates`+`radiusKm` fallback (`:150–152`), used only for in-form out-of-bounds validation (`ParkForm.tsx:129–131`).
- **No point-in-polygon auto-assignment anywhere.** ⚠️
- `climb_segments` have **no `authorityId`** — city-level only, via a hardcoded string. ⚠️

## A6. Route imagery

- **Static map images exist** via Mapbox Static Images API. Route thumbnail with the polyline drawn: `src/app/admin/locations/page.tsx:81` (`…/static/geojson(…)/auto/600x180@2x`). Pin previews in `SessionDrawer.tsx:130–133`, `MapCard.tsx`, `GroupDetailsDrawer.tsx`.
- **Rendered on the fly, never stored** — the URL goes straight into `<img src>`. No Storage/Bunny persistence. ⚠️ (Mapbox outage → all previews break.)

## A7. Cloud / deploy infrastructure — the Part B linchpin

**`functions/` is a live Firebase Functions project** (Node 20, `firebase.json:6–8`; `functions/package.json`). **7 scheduled functions already run via Cloud Scheduler:**

| Function | Schedule | File |
|---|---|---|
| `trainingReminderScheduler` | `30 7 * * *` Asia/Jerusalem | `functions/src/trainingReminderScheduler.ts:94` |
| `retentionScheduler` | `0 10 * * *` | `functions/src/retentionScheduler.ts:104` |
| `cleanupEphemeralDocs` | `7 * * * *` hourly | `functions/src/cleanupEphemeralDocs.ts:110` |
| `cleanupOldLogs` | `0 3 1 * *` monthly | `functions/src/cleanupOldLogs.ts:102` |
| `deleteZombieGroups` | `0 3 * * *` | `functions/src/onGroupMemberWrite.ts:66` |
| `rollupLeaderboard` | `0 3 * * *` | `functions/src/leaderboard.ts:74` |
| `onboardingDropoffDispatcher` | every 30 min | `functions/src/onboardingDropoffDispatcher.ts:71` |

- Also **callable** fns (`awardWorkoutXP`, `validateAccessCode`, `runDataMigration`, `ingestHealthSamples`, …) and Firestore triggers — `functions/src/index.ts:1–24`.
- Current scheduled fns cap at **256–512MiB / ≤540s** timeout.
- **Second scheduling rail: Vercel cron** — `/api/admin/crm-agent/run` at `7 5 * * *` (`vercel.json:1–8`), a Next.js API route (max 60s).
- **No Cloud Run, no App Engine, no Pub/Sub topics** (scheduled fns use Cloud Scheduler under the hood).
- Scripts authenticate via **`FIREBASE_SERVICE_ACCOUNT_KEY`** env (`.env.example:64–67`; e.g. `scripts/fetch-gps-traces.ts:21–27`).

## A8. How it runs today — the honest summary

**Everything is a human at a terminal.** `npx tsx scripts/…` → dry-run → eyeball → commit → then a super-admin clicks through the approval center one item at a time. No schedule, no server-side trigger, no auto-triage, no auto-publish, no LLM. The pipeline is *capable and clean* but *entirely hand-cranked* and *single-city-hardcoded*.

---

# PART B — ARCHITECTURE (autonomous, cloud, token-lean)

## B0. The core correction

A process that maps a city "24/7 even when the laptop is off" is **not a Claude/agent session and not a local script** — both die with the session/machine. It must be a **deployed cloud job** that runs the deterministic pipeline and *calls* an LLM as an API only for the fuzzy QA band. This is the Moovit model, and it's exactly what keeps token cost near zero: deterministic code does ~90%, the LLM touches only what's genuinely uncertain.

## B1. Where it runs — reuse `functions/`, don't invent infra

The `functions/` project is the answer — it already has the exact rail (scheduled + callable, Firestore-native, service-account auth). Recommended shape:

- **Enqueue (callable/HTTP fn or Vercel API route):** panel writes a `mapping_jobs/{jobId}` doc.
- **Worker (scheduled fn, e.g. every 5 min):** picks up `status:'queued'` jobs and processes them in **bounded chunks (per bbox tile)**, writing progress back to the job doc.
- **Why chunk:** a full-city Overpass+DEM+Directions pass **will exceed the 540s scheduled-fn timeout**. Tile-by-tile keeps each invocation bounded and makes the job **resumable/replayable**. ⚠️ If a single uninterrupted long pass is ever needed, that's the one case for **Cloud Run** (not currently in the repo — new infra).

## B2. The pipeline, stage by stage — deterministic vs LLM split

The whole point of the split is token minimization. Today the split is 100/0 (all deterministic APIs, zero LLM). Keep the bulk there.

| Stage | Deterministic (no LLM) | LLM? |
|---|---|---|
| OSM fetch/parse | ✅ Overpass / Geofabrik | no |
| DEM decode + climb detection | ✅ existing sliding-window logic | no |
| Loop synthesis | ✅ Generator B (K-means + diamond + `continue_straight` + RDP) | no |
| Dedup | ✅ `source.externalId` upsert | no |
| Escalator / terrain-artifact filter | ✅ walkable-way + blocking-polygon | no |
| Significance thresholds / scoring | ✅ existing constants | no |
| Naming | ✅ Mapbox reverse-geocode (already 196/196) | **only** on geocode miss / nonsensical name |
| City assignment | ✅ **point-in-polygon vs `boundaryGeoJSON`** (needs building) | no |
| Static thumbnail | ✅ Mapbox Static Images | no |
| **Confidence adjudication (yellow band)** | scoring proposes the tier | ✅ **the one real LLM stage** |

**Token math:** if a city yields ~500 candidates and ~85% are clearly green/red on deterministic signals, only ~75 hit the LLM — small structured calls (metadata + optional static-map image for a vision pass). ~dozens of calls per city, not thousands. Green auto-publish and red auto-reject **never** touch the LLM.

## B3. Bulk data source — Geofabrik for scale, Overpass for refresh

Overpass rate-limits are already a live constraint (3 mirrors + delays). For a full-city/country pass, prefer a **Geofabrik regional extract** (`israel-and-palestine.osm.pbf`) processed inside the job; keep Overpass for targeted/incremental refresh. ⚠️ Needs a `.pbf` parser dependency — **not currently in the repo** (new dependency).

## B4. Three-tier confidence model → the existing status contract

Map confidence directly onto A4's contract — **no schema change needed**, just a confidence gate in the writer (which today always writes `pending`):

- 🟢 **High → auto-publish.** Write `status:'published'` + `published:true` directly, skip the queue. **NEW behavior** ⚠️ (see B8 — this bypasses human review of user-facing content).
- 🟡 **Medium → my queue.** Write `status:'pending'` (today's default) → surfaces in approval center. Only this tier reaches a human.
- 🔴 **Low → auto-reject.** Write `status:'rejected'` (or `'archived'` for routes) + reason, so it's audited and **won't be re-suggested** on the next run (dedup already preserves moderation state).

**Deterministic tier signals (proposed):**
- *Route:* loop closes cleanly · low backtrack ratio · sits on walkable ways · sane length vs target · has a facility anchor → green. Jagged / self-crossing / crosses water → red.
- *Park:* has equipment tags · inside boundary → green.
- *Stairs:* `step_count` present · ≥15 · on walkable way · not escalator · real geocoded name → green. Missing name / borderline count → yellow.
- *Climb:* grade in sane range · on walkable way · not a DEM artifact → green.

## B5. Panel trigger — "select city → enqueue mapping job"

1. Admin picks an authority + confirms boundary → button writes `mapping_jobs/{jobId}` = `{authorityId, boundaryGeoJSON|bbox, status:'queued', requestedBy, createdAt}`.
2. Worker fn processes tiles, runs the deterministic pipeline, applies B4 tiering: **auto-publishes green, queues yellow, logs red.**
3. Job doc streams progress (`tilesdone/total`, counts per tier) back to the panel.
4. **Only the yellow band returns to the human** — satisfying "no per-item approval."

Full job = **ingest assets** (parks/climbs/segments) **then synthesize loops** (Generator B on top of the freshly-ingested `street_segments`). Both halves already exist; the job just sequences them.

## B6. The QA agent — the second agent, bounded to the middle

Sits **after** deterministic scoring, **before** write, and **only** sees yellow-candidates. For each: takes structured metadata (+ optionally the static-map image for a vision check) and decides **promote→green / keep→yellow / demote→red**, with a one-line reason stored on the doc. This is where ~all token spend concentrates — and it's capped at the ambiguous minority by construction.

## B7. Gaps to close before build (severity-ranked)

1. **Auto-publish path (🔴 blocker-ish).** Every writer hardcodes `pending`. Autonomy needs a confidence gate that can write `published` — plus an authorization decision (see B8).
2. **Point-in-polygon city assignment (🔴).** `boundaryGeoJSON` exists but is unused; needed to assign `authorityId` at scale. `climb_segments` also lack `authorityId` (city string only).
3. **Function timeout/memory for city scale (🟠).** 540s / 512MiB won't cover a city in one pass → tile-chunking (or Cloud Run).
4. **Geofabrik `.pbf` ingestion (🟠).** New dependency; not present.
5. **Region hardcoding (🟠).** `geo-discovery-routes.ts` region map + climb writer city string are single-city — must be parameterized by the job's authority/boundary.
6. **Mapbox token in the function env (🟡).** Wire `NEXT_PUBLIC_MAPBOX_TOKEN` into functions config (geocode/DEM/static/directions all need it).
7. **Static-thumbnail persistence (🟡).** Currently on-the-fly; a stored route needs its thumbnail persisted to Storage/Bunny.
8. **Cost/rate ceiling at city scale (🟡).** Mapbox Directions + Static + Geocoding volume — budget + backoff.

## B8. Open decisions for David

- **Does 🟢 auto-publish go straight live, or to a "high-confidence" fast-lane that a human still one-click confirms?** Auto-publishing bypasses human review of content real users see (parks/routes/climbs). Recommend starting with **green→pending-but-flagged** for the first city, measure the false-positive rate, then flip proven categories to true auto-publish.
- **Which entity types are allowed to auto-publish at all?** (Stairs are low-risk; synthesized loops are higher-risk.)
- **Confidence thresholds per entity** — needs one calibration pass against the existing 196 climbs + the zichron routes (we have ground-truth already reviewed).
- **Firebase Functions tiling vs Cloud Run** for the heavy pass — infra decision gated on expected city size.

---

## Appendix — key files

- Ingestion: `scripts/geo-discovery-routes.ts`, `scripts/import-osm-routes-tlv.ts`, `src/scripts/import-osm-segments.ts`
- Climbs: `scripts/dem-climbs-tlv.ts`, `scripts/climb-segments-tlv.ts`, `scripts/write-climb-segments-tlv.ts`
- Generators: `src/features/parks/core/services/route-generator.service.ts` (A), `…/route-stitching.service.ts` (B)
- Approval: `src/app/admin/approval-center/page.tsx`, `src/features/admin/services/moderation.service.ts`
- Types: `route.types.ts`, `park.types.ts`, `contribution.types.ts`, `admin-types.ts`
- Infra: `functions/` (esp. `functions/src/index.ts` + the 7 schedulers), `firebase.json`, `vercel.json`
- Imagery: `src/app/admin/locations/page.tsx:81`
