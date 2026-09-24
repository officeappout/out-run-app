# SCALE-AND-ARCH-AUDIT.md — OUT Route Engine

**Scope:** the route engine (OSM ingestion, route generation, quality certification, safe editing, accuracy-agent review) and the admin-panel/Firestore infrastructure directly supporting it — the same subsystem covered by the companion `ARCHITECTURE.md`. Read-only audit; no code, config, or data was changed to produce this report.

**Verified:** 2026-08-31, against local `main` at commit `34b5ac62`. Every citation below was independently opened and confirmed, including a dedicated adversarial fact-check pass that caught and corrected two errors before they reached this document (noted inline where relevant).

---

## Executive Summary

The route engine's actual scale exposure is narrower and better-understood than the two-part question suggests: route generation runs **entirely client-side** with zero server compute, so "thousands of concurrent users" does not translate into shared server-CPU load, and every Firestore read/write pattern found is either well-bounded or, where unbounded, a Firestore **billing-cost** concern rather than an availability risk — Firestore and Vercel are not being asked to do anything they don't already scale. The one genuine, uncapped scale exposure is **Mapbox Directions**, called directly from every user's browser with a shared client-embedded token, no retry/backoff, no 429-handling, and up to ~12 concurrent calls per single route-generation click — this is a real dependency risk worth a deliberate fix, not an emergency. On the architecture side, the codebase is honest with itself in useful ways (zero inline TODO/FIXME markers, a consistent three-tier error-handling convention, a real and correctly-implemented DEM tile cache, atomic Firestore counters where contention is real) but carries genuine, fixable debt: one live data-integrity gap (an admin can silently un-reject a moderator's hard-rejection with zero audit trail), one validation gap in the same bug class the team already fixed once before (`official_routes.status` has no enum check), a missing batch-chunking safeguard on one write path, systemic small-scale duplication (9 independent haversine implementations, 6 independent Mapbox-call implementations), and zero automated test coverage on every write-side service that actually touches Firestore — a real due-diligence gap, but one correctly scoped as a correctness risk rather than a scale risk. None of this is disqualifying; most of it is a few days of focused, low-risk work, and the report below separates what's worth fixing before the deal closes from what can honestly wait.

---

## Findings Table

Severity: CRITICAL / HIGH / MEDIUM / LOW. Fix class: **cheap-now** (small, low-risk, doable before close) vs. **roadmap** (real design/testing time, safe to defer). Rows marked **credit** are positive findings — cite them, no fix needed.

### Part A — Scale

| # | Area | Severity | Fix class | Finding |
|---|---|---|---|---|
| A-1 | External API | **HIGH** | roadmap | Mapbox Directions: shared client-embedded token, ~12 concurrent calls per single user click, zero retry-backoff/429-handling/request timeout, and the one existing rate-limit throttle was deliberately removed for latency |
| A-2 | Firestore reads | MEDIUM | cheap-now (partial) | Primary route-generation candidate query has no `limit()` and no server-side score filter; a Tier-2 fallback can double it |
| A-3 | Caching | MEDIUM | cheap-now | Zero caching on the per-user `street_segments`/`route_adjacency` scoring pass — full query + scoring re-run on every single generation |
| A-4 | Firestore reads | LOW | roadmap | `InventoryService.fetchImportBatches` — unbounded full-collection scan, fires on every `/admin/routes` load (admin-only) |
| A-5 | Firestore reads | LOW | roadmap | Approval Center — 3 unbounded moderation-queue reads (admin-only; arguably correct UX) |
| A-6 | Compute | LOW-MEDIUM | roadmap | `recomputeRouteEnrichmentForCity` — real per-climb N+1, fires on every route approval (admin-triggered, non-blocking, small today) |
| A-7 | Compute | LOW | roadmap | Lighting classifier has a genuine N+1 shape, but is script-only, Haifa-only, human-triggered |
| A-8 | Write contention | **HIGH** (correctness) | **cheap-now** | `recomputeRouteAdjacencyForCity` + its backfill-script twin lack the 500-op batch chunking every other bulk-write path has; failure is silently swallowed |
| A-9 | Write contention | LOW | roadmap | No dedup/lock across rapid sequential single-route approvals hitting the same city's adjacency recompute |
| A-10 | Write contention | **credit** | — | The one genuine many-end-users-same-document pattern found (`official_routes.analytics.usageCount`, ratings) uses Firestore's atomic `increment()` correctly |
| A-11 | Write contention | **credit** | — | Route→street_segments broadcaster: hard segment cap (200) + correct 500-op batch chunking |
| A-12 | Compute | **credit** | — | Route generation runs 100% client-side — zero server compute, zero API route in the path; the "thousands of concurrent users hits shared CPU" risk class does not apply, by architecture |
| A-13 | Firestore reads | **credit** | — | Composite index + single-field geohash indexing both correctly designed for the queries that need them |
| A-14 | Caching | **credit** | — | DEM/Terrain-RGB is confirmed NOT a live per-request call — a real, correctly-implemented check-before-recompute cache in Firebase Storage |
| A-15 | External API | **credit** | — | Overpass API: zero end-user exposure, best-instrumented of the three external APIs (429/502/503/504-aware, bounded retries, mirror failover) |
| A-16 | Platform | **credit** | — | Every Part-A finding except A-1 is correctly a cost/latency line item, not an availability risk — Firestore/Vercel auto-scaling absorbs it; no re-architecture is recommended anywhere in this report |
| A-17 | Firestore reads | LOW | roadmap | One query pattern hand-copied verbatim twice in the same file (naturally small/curated data — maintainability note only) |

### Part B — Architecture & Maintainability

| # | Area | Severity | Fix class | Finding |
|---|---|---|---|---|
| B-1 | Consistency | **HIGH** | **cheap-now** | `official_routes.status` has no validated enum at all; sibling collections validate a *different* third literal than the one actually written to `official_routes` — live enum-drift risk, same bug class already fixed once for `elevationGain`/`maxGrade` |
| B-2 | Consistency | **HIGH** | **cheap-now** | Admin Inventory tab's publish-toggle can silently un-reject an Approval-Center hard-rejection — no audit trail, stale rejection reason, route re-enters the live generator pool |
| B-3 | Consistency | HIGH (correctness) | roadmap | `route_adjacency`'s two writers + `street_segments`' broadcaster bypass the `buildValidatedDoc` chokepoint entirely (each has a documented reason; closing it needs real sequencing work) |
| B-4 | Consistency | MEDIUM | roadmap | Firestore Stage-2.5 authority-guard rules are written but commented out, deliberately blocked on a known legacy-data precondition |
| B-5 | Consistency | LOW | roadmap | `city` vs `cityName` field-naming inconsistency across the 6 gated collections (cosmetic, already centrally mapped) |
| B-6 | Consistency | LOW | **cheap-now** | Pre-commit safety-check tripwire's collection regex omits `osm_amenities`, even though it's fully chokepoint-enforced in code |
| B-7 | Duplication | MEDIUM | roadmap | 6 independent hand-rolled Mapbox Directions call implementations, despite a proven, reusable shared client already used by 5 real callers in the same directory |
| B-8 | Duplication | MEDIUM | roadmap | 9 independent haversine/distance re-implementations, several with unverified "identical" claims already subtly diverged — the direct mechanism behind bugs already logged in project history |
| B-9 | Duplication | MEDIUM | roadmap | 5 independent geohash-proximity-query-and-merge implementations, no shared helper, 2 on live production/admin paths |
| B-10 | Duplication | LOW | **cheap-now** | `route.service.ts` is confirmed dead code — zero live callers anywhere; safe to delete |
| B-11 | Folder structure | MEDIUM | roadmap | Extensive cross-domain imports inside the parks domain, contradicting the project's own stated domain-isolation rule — appears to be an app-wide norm, not a route-engine-specific lapse |
| B-12 | Folder structure | LOW-MEDIUM | cheap-now | The domain's own service barrel misses `route-generator.service.ts` — the single most important file in the domain — forcing all 11 real callers to deep-import it |
| B-13 | Folder structure | LOW | roadmap | Two files both named `parks.service.ts` (admin wrapper vs. core) cause a naming trap, not a functional bug |
| B-14 | Folder structure | LOW | roadmap | OSM ingestion logic is split across 3 homes with no documented rule (defensible, not discoverable) |
| B-15 | Folder structure | LOW | cheap-now (optional) | One placeholder barrel file (`export {}` only), no functional impact |
| B-16 | Folder structure | LOW | roadmap | `scripts/` dry-run flag spelled 3 different ways; the underlying dry-run-by-default safety property itself holds in every case checked |
| B-17 | Duplication | — | — | *(corrected during review — see detail: this file has a real caller and must not be deleted; see §B.3 detail)* |
| B-18 | Test coverage | **HIGH** | roadmap | Every write-side service that actually mutates Firestore has zero automated test coverage — a 1,700-line central CRUD service, the safe-edit engine, moderation, and the 1,925-line ingestion script all included |
| B-19 | Test coverage | MEDIUM | **cheap-now** | Two pure, deterministic, decision-critical functions (the accuracy-agent's decision engine and the composition classifier) break the domain's otherwise-strong "pure logic gets tested" pattern — realistically a same-day fix |
| B-20 | Test coverage | HIGH (structural) | roadmap | No CI exists at all — all existing tests are 100% developer-run-manually, and `main` auto-deploys to prod on merge |
| B-21 | Test coverage | MEDIUM | cheap-now | The live Haifa lighting writer, which contains the exact kind of subtlety that already produced one real bug, has zero tests |
| B-22 | Test coverage | **credit** | — | The pure geometry/scoring layer is genuinely well-covered — 1,392 lines of dated, named regression-guard tests for real historical bugs |
| B-23 | Consistency | **credit** | — | Error-handling pattern across the service layer (rethrow-on-write / degrade-to-empty-on-read / non-fatal-on-background-effect) is consistent and deliberate, not accidental drift |
| B-24 | Consistency | **credit** | — | Zero inline TODO/FIXME/HACK/XXX markers across 183 scoped files |
| B-25 | Folder structure | **credit** | — | The two role-scoped admin route pages sharing one editor component are a legitimate, consistent pattern, not an accidental duplicate |
| B-26 | Duplication | **credit** | — | Difficulty calculation is genuinely centralized — one real algorithm reused everywhere the DEM profile is available |

---

## Part A — Scalability & Load Readiness (detail)

### A.1 — Firestore read patterns

The most consequential finding sits on the actual multi-user hot path: **`fetchScoredWaypointsByProximity`** (`src/features/parks/core/services/route-generator.service.ts:742-819`), the primary candidate-fetch for route generation, fans out a `Promise.all` over geohash boxes with **no `limit()` on any box query** — the `score >= 6` floor is applied client-side (line 819) only, after every doc in the box is already pulled. A Tier-2 "guaranteed fallback" (lines 3117-3123, live since `IS_GUARANTEED_ROUTE_FALLBACK_ENABLED=true`) can fire the same unbounded query a second time, at ~4× the box area and a relaxed score floor, when the first pass yields zero routes. This is a **read-cost/latency risk, not an availability risk** — Firestore serves it fine, but cost scales with (concurrent users) × (local segment density), with no ceiling. The file's own fallback path, `fetchScoredWaypoints` (lines 591-599: `where(cityName in…), where(score>=6), orderBy(score desc), limit(300)`), is the reference-quality pattern already sitting in the same file — bounded, indexed (`firestore.indexes.json:539-545` covers it exactly), and empirically tuned per its own comment. **Fix:** add `limit()` to each box query in the primary path; a full server-side score filter is a bigger composite-index tradeoff, reasonably left for roadmap.

Two `official_routes`/`route_adjacency` queries (`fetchPublishedCorridorsForCity` and its callers, lines 1695-2164) are also unbounded but naturally small (~189 `official_routes` system-wide per the code's own comment) and hand-copied verbatim in two places — a maintainability note (A-17), not a scale risk.

Everything else unbounded is **admin-only or script-only by construction**, correctly low-concurrency: `InventoryService.fetchImportBatches` (`inventory.service.ts:806-808`, a true zero-`where`/zero-`limit` full-collection scan, the least-bounded query in the whole audit, but fires only on an internal staff page load); the Approval Center's three moderation-queue reads (`approval-center/page.tsx:207,227,252`); `recalculateAllDistances` and `bulkAssignAuthority` (explicit admin bulk-action buttons); and every full-collection read inside a manual CLI script (`review-route-accuracy.ts`, `geo-discovery-routes.ts`, backfill scripts). One genuine N+1 loop was found — `route-lighting-street-segments.node.ts:125-147`, sequential per-sample-point Firestore reads — but it has zero live app caller; its only two callers are both scripts. A second, live N+1 was found — `recomputeRouteEnrichmentForCity` (`inventory.service.ts:383-409`), one sequential await per climb in the city, fired fire-and-forget on every route approval — small today (~180 climbs per the code's own comment) but will scale linearly as climb inventory grows across cities (A-6).

Composite-index coverage is correctly designed: the one query needing one has it (`firestore.indexes.json:539-545`); every geohash-range query is single-field and correctly needs none (A-13).

### A.2 / A.6 — Per-request compute and the dynamic route generator

`route-generator.service.ts` (3,623 lines) is the canonical live generator. **It runs 100% client-side** — confirmed by its import of the client (not Admin) Firestore SDK, raw browser `fetch()` calls to Mapbox using a `NEXT_PUBLIC_*` token, and four real `'use client'` React-hook callers with **zero server API route anywhere in the call chain** (a repo-wide grep for generator-related terms under `src/app/api` returned nothing). This means the "thousands of concurrent users hits shared server CPU" risk class **does not apply here, by architecture** — every user's generation compute is paid on their own device (A-12). The compute itself is modest even so: no spatial index, no graph search, bounded array scans/sorts over at most a few hundred candidates, all cheap at that scale.

The real concurrency-sensitive dependency this compute characterization surfaces is **Mapbox Directions**, called directly inside this file (7 call sites: lines 1859, 2042, 2225, 2592, 2612, 3296, 3573) via a shared `mapbox.service.ts` client using a browser-exposed token. Loop-mode route generation fires up to 6 candidate combinations concurrently (`TARGET_COMBINATIONS=6`, line 2439), each costing up to 2 Directions calls (a primary + one fallback-with-different-params), for **up to ~12 concurrent Mapbox requests from one user's one click** (`attemptOneCombination` fan-out, lines 2530-2839). Corridor-flow mode adds up to 5 more sequential calls per chain hop. This is not hypothetical: the file carries a live scar — `"✅ CRITICAL FIX: 1.5 second delay between API calls to prevent 429 errors"` (line 887) — from a prior real rate-limit incident, and a 17.08.2026 refactor deliberately traded away an equivalent throttle on the newer loop-mode path in favor of latency (comment, lines 2530-2538). See A.4 for the full external-API risk analysis — this is the one place in the entire Part A investigation where end-user traffic volume genuinely, multiplicatively drives an external dependency's call volume.

DEM/Terrain-RGB is confirmed **not** a live per-request call in this path — `generator-elevation.service.ts` only ever reads pre-decoded elevation grids already written to Firebase Storage by an offline admin process, degrading gracefully to a hardcoded `'easy'` difficulty on any cache miss rather than making a live external call (A-14). No other route-engine `/api/*` route does heavy synchronous per-request work — the only other route/geo-adjacent API route found (`/api/integrations/universal-gis-proxy`) is admin-only and does a single lightweight reshape on a one-off GIS import.

### A.3 — Caching

**No distributed cache layer exists anywhere in this codebase** — Redis/Upstash/ioredis, Next.js `unstable_cache`/`revalidate`, and SWR/React Query are all confirmed absent (grep + `package.json`, zero hits). What *does* exist and is genuinely well-built: the DEM tile cache (`src/lib/dem-tile-cache/*`) checks Firebase Storage before ever calling Mapbox, persists decoded elevation grids for reuse, and adds a session-lifetime in-memory layer on the client so one browser tab never re-fetches the same tile twice (A-14) — real credit due, not an overstated name. A 5-minute-TTL authority cache and a 6-hour-TTL localStorage parks cache also exist and are correctly scoped to their (low-volume, admin or map-adjacent) use cases.

The gap that matters: **`route-generator.service.ts` has zero caching or memoization of any kind** around its `street_segments`/`route_adjacency` query-and-score pass (grepped the entire 3,623-line file for `cache|memo` — every hit references the unrelated DEM cache). The same ~300-document query and in-memory scoring pass is re-derived identically for every user generating a route in the same city, within whatever window that city's underlying data stays unchanged (which, per the write-side investigation, is not that frequently — only OSM re-imports or route approvals invalidate it). This is a real, compounding **Firestore read-cost** line item on the genuine multi-user hot path, not an availability risk — a short per-city TTL cache (even 60-120 seconds, which the soft-shuffle scoring already tolerates being slightly stale) would cut it close to zero for repeat generations without touching correctness. Overpass's `fetchCityWayGrid` has the same no-cross-run-cache gap, but it's strictly script-only, human-triggered, negligible cost.

### A.4 — External API exposure at scale

Three external APIs, three very different risk profiles:

**Mapbox Directions v5 — real spike risk at thousands-of-users scale.** Confirmed 8 independent call-construction sites; the ones that matter are all end-user-facing: `route-generator.service.ts` (the live generator, ~12 concurrent calls per click, per A.2 above), `useSearchNavigation.ts` (2-3 more parallel calls per destination search), `useWalkToRoute.ts`, `leg-plan.service.ts`. No caller anywhere in this chain has retry-with-backoff, 429-specific handling, or a request timeout — every failure is single-attempt-and-give-up or single-attempt-with-one-different-fallback. There is **no retry-storm risk** (nothing loops retrying the identical failed request), but the real risk is the opposite and arguably worse: legitimate, non-retried, highly concurrent fan-out directly from end-user devices against one shared account token, with zero client-side rate-limit awareness, and a documented prior incident (the 1.5s-delay comment) that a later refactor explicitly traded away for latency on the newer, higher-fan-out path. Two admin-only Mapbox callers exist too (`RouteEditor.tsx`'s route-creation tool, `route-geometry-edit.service.ts`'s safe-edit re-bridge) — both single-attempt, with deliberately different failure semantics (straight-line fallback vs. hard-fail) documented as an intentional product decision, not drift.

**Mapbox Terrain-RGB — bounded by admin/script usage, zero end-user exposure.** All 6 call sites are the admin DEM-recompute API route, a one-off elevation-population script, or the ingestion script's own decoder — the live end-user path only ever reads pre-decoded JSON from Firebase Storage (§A.3). 15-30s socket timeouts exist on every live-fetch path; a failed/missing tile is silently skipped, never retried, never guessed.

**Overpass API — bounded by admin/script usage, best-instrumented of the three.** Zero reachable path from end-user code — every one of the (8 independently re-implemented, see B.3) callers is either a manually-clicked admin import button (`osm-segment-importer.ts`, used by `/admin/segments` and `/admin/routes`) or a CLI script. Unlike the other two APIs, Overpass calls are explicitly 429/502/503/504-aware with bounded retries (2 attempts × 3 mirror endpoints) and a fixed inter-attempt delay — genuine resilience engineering, just never exercised by end-user traffic because nothing in that traffic reaches it.

### A.5 — Write contention & hot documents

The route-approval broadcast (`official-route-broadcaster.ts`) is correctly engineered: a hard 200-segment-per-route cap plus proper 500-op batch chunking means a single approval action can never exceed Firestore's write-batch limit (A-11) — a non-issue, cited as credit.

**The one genuine, currently-live bug found in this whole audit sits here (A-8):** `recomputeRouteAdjacencyForCity` (`inventory.service.ts:212-254`) does a full delete-then-rewrite of a city's `route_adjacency` edges in a **single, unchunked `writeBatch`** — no `+= 500` loop, unlike every one of the other 10 bulk-write paths checked across this codebase (all of which correctly chunk at 500). If one city's combined existing-plus-new edge count ever crosses 500, the call throws — and the enclosing try/catch swallows it non-fatally (`console.warn`, returns a zeroed result), so the failure mode is **silent staleness of a live feature** (`IS_ROUTE_ADJACENCY_ENABLED=true`), not a visible crash. The standalone backfill script mirrors the same gap. The fix is close to copy-paste: the exact rolling-batch pattern already exists one file over, in the structural sibling function `recomputeRouteEnrichmentForCity` (`inventory.service.ts:435-441`). At current data volume (~189 `official_routes` system-wide) this hasn't triggered yet, but it will as the catalog grows — worth fixing now while it's cheap and before it's a live incident.

A related, narrower gap: rapid **sequential single-route** approvals in the same city fire uncoordinated, overlapping delete-then-rewrite passes with no dedup/lock (A-9) — a real but narrow race window, admin-only, low frequency (bulk approval already correctly dedupes by city within one call).

The one place many real end users genuinely write to the *same* document — `official_routes.analytics.usageCount` and rating aggregates, incremented on every completed run or submitted rating — is implemented correctly with Firestore's atomic `increment()` (A-10), which the platform serializes server-side with no data loss risk; the only theoretical cost is added latency on an extremely popular single route receiving many completions within the same second, well below this app's realistic (regional/municipal) traffic profile. No hot city- or authority-level aggregate document was found anywhere in the route engine's write surface.

---

## Part B — Architecture & Code Organization (detail)

### B.1 — Module/folder structure

The domain's placement is mostly consistent with the project's own stated convention: admin components and pages call into `parks/core` services rather than owning business logic directly (`RouteEditor.tsx` writes through `InventoryService.saveRoutes`, not a raw Firestore call). `src/lib/route-collections` and `src/lib/route-decisions` earn their `src/lib/` placement — both are genuinely imported from both the `admin` and `parks` feature domains, not just one. `src/lib/dem-tile-cache` is a thinner case (its only feature-domain consumer is `parks/core`; the other caller is an API route) but has a fair rationale.

The one real surprise: **OSM ingestion is split across three homes with no documented rule** (B-14) — `osm-segment-importer.ts` (the canonical, chokepoint-enforced `street_segments` writer) lives in `src/features/admin/services/`, while the independent `official_routes` discovery pipeline is a top-level `scripts/geo-discovery-routes.ts`, and `parks/core` only ever *reads* the results of both. Defensible (one is admin-UI-triggered, the other a CLI batch tool) but not discoverable without prior knowledge.

**Cross-domain imports are extensive, not isolated** (B-11): 38 files across `parks/core` and `parks/client` import directly from `workout-engine`, `user`, `admin`, `arena`, `safecity`, or `social`, contradicting the project's own stated "no cross-domain direct imports" rule. This is bidirectional (workout-engine's own route generator imports back into `parks/core`) and looks like an app-wide norm rather than a route-engine-specific lapse — real, but unwinding it is a cross-cutting redesign, not a targeted fix.

Two smaller navigability gaps: the domain's own inner service barrel (`parks/core/index.ts`) covers only 6 of 23 services and, notably, **misses `route-generator.service.ts` itself** — the single most important file in the domain — forcing all 11 real callers to deep-import it directly (B-12, cheap to fix by adding one export line). And two files are both named `parks.service.ts` (an admin wrapper and the real core implementation), which has already produced one component importing the "same" service via two different paths in the same file (B-13) — confusing, not broken.

`scripts/` itself (34 route/geo-relevant files, plus a genuinely-used `scripts/lib/` shared-logic folder) is navigable for its two well-populated buckets (`backfill-*`, `probe-*`) but ad-hoc for the rest, with a dry-run opt-in flag spelled three different ways (`--apply`/`--commit`/`--dry-run`-as-opt-out) and one stray script living under `src/scripts/` instead of the top-level `scripts/` directory for no apparent technical reason (B-16) — real friction, zero functional risk, since the underlying dry-run-by-default safety property holds in every case checked.

### B.2 — Oversized files (real line-count scan)

Per the task's requirement, the following is the actual output of `find src scripts -name '*.ts' -o -name '*.tsx' | xargs wc -l | sort -rn | head -30`, run directly against this working tree — not estimated:

```
  471135 total  (1,784 .ts/.tsx files under src/ and scripts/)
    3790 src/app/admin/workout-settings/page.tsx
    3712 src/lib/data/israel-locations.ts
    3623 src/features/parks/core/services/route-generator.service.ts
    3495 src/app/admin/users/all/page.tsx
    3343 src/app/admin/questionnaire/page.tsx
    3205 src/features/user/onboarding/components/steps/UnifiedLocation/location-constants.ts
    3161 src/app/home/page.tsx
    2794 src/app/admin/routes/page.tsx
    2629 src/features/user/progression/services/progression.service.ts
    2620 src/app/admin/locations/page.tsx
    2530 src/features/workout-engine/services/home-workout.service.ts
    2297 src/features/parks/core/components/AppMap.tsx
    2155 src/features/home/components/SettingsModal.tsx
    2118 src/features/workout-engine/core/services/running-engine.service.ts
    2043 src/features/user/onboarding/services/onboarding-sync.service.ts
    2020 src/features/workout-engine/players/running/store/useRunningPlayer.ts
    1991 src/app/map/layers/DiscoverLayer.tsx
    1925 scripts/geo-discovery-routes.ts
    1856 src/features/arena/components/GroupDetailsDrawer.tsx
    1835 src/app/workouts/[id]/active/page.tsx
    1817 src/features/admin/actions/importExcelAction.ts
    1806 src/features/home/components/SmartWeeklySchedule.tsx
    1746 src/features/parks/core/services/inventory.service.ts
    1734 src/features/workout-engine/logic/WorkoutGenerator.ts
    1706 src/features/admin/components/authority-manager/CommunityGroups.tsx
    1702 src/features/user/onboarding/components/steps/UnifiedLocation/location-utils.ts
    1700 src/features/admin/services/park-import.service.ts
    1687 src/app/admin/progression-manager/page.tsx
    1626 src/app/community/page.tsx
    1615 src/app/admin/workout-simulator/page.tsx
```

Whole-codebase totals: **232 files ≥500 lines, 78 files ≥1,000 lines**, out of 1,784 total — the majority of both lists sit in domains outside this audit's scope (workout engine, onboarding, home, users). Within the **route-engine domain specifically**, every file ≥500 lines:

| Lines | File |
|---|---|
| 3623 | `src/features/parks/core/services/route-generator.service.ts` |
| 2794 | `src/app/admin/routes/page.tsx` |
| 2297 | `src/features/parks/core/components/AppMap.tsx` |
| 1925 | `scripts/geo-discovery-routes.ts` |
| 1746 | `src/features/parks/core/services/inventory.service.ts` |
| 1413 | `src/features/parks/core/components/FreeRunDrawer.tsx` |
| 1200 | `src/features/parks/core/components/RouteCarousel.tsx` |
| 1185 | `src/features/parks/core/hooks/useCameraController.ts` |
| 1134 | `src/features/admin/components/parks/ParkForm.tsx` |
| 1128 | `src/features/parks/core/services/route-stitching.service.ts` |
| 1124 | `src/features/parks/client/components/route-preview/RouteDetailSheet.tsx` |
| 1108 | `src/features/parks/client/components/park-detail/ParkDetailSheet.tsx` |
| 1085 | `src/features/parks/core/components/TurnCarousel.tsx` |
| 1014 | `src/app/admin/authority/routes/[id]/edit/page.tsx` |
| 890 | `src/features/parks/core/services/__tests__/route-generator.calibration.test.ts` |
| 876 | `src/features/parks/client/components/equipment-detail/EquipmentDetailDrawer.tsx` |
| 858 | `src/app/admin/parks/import/page.tsx` |
| 853 | `src/features/parks/core/services/geoUtils.ts` |
| 823 | `src/features/admin/services/osm-segment-importer.ts` |
| 781 | `src/features/parks/core/hooks/usePartnerData.ts` |
| 752 | `src/features/admin/components/routes/RouteEditor.tsx` |
| 748 | `src/features/parks/core/hooks/useCommunityEnrichment.ts` |
| 635 | `src/features/parks/core/types/route.types.ts` |
| 584 | `src/features/parks/core/hooks/useGPS.ts` |
| 575 | `src/features/parks/core/components/hybrid/HybridOverviewScreen.tsx` |
| 566 | `src/features/parks/client/components/planned-activity/PlannedActivityComposeSheet.tsx` |
| 539 | `src/features/parks/core/components/hybrid/HybridSlotCarousel.tsx` |
| 533 | `src/features/parks/core/components/FreeRunRouteSelector.tsx` |
| 502 | `src/features/parks/core/services/__tests__/geoUtils.test.ts` |
| 1119 | `src/app/admin/approval-center/page.tsx` *(explicitly named in the task; just under the ≥1000 codebase-wide cut but included here for completeness)* |

**Top offenders, discussed:**

- **`route-generator.service.ts` (3,623 lines) — the single largest file in the entire route-engine domain and the 3rd largest in the whole codebase.** This is not idle bulk: it's the live end-user route generator, and it's the file every finding in Part A traces back to (A-1 through A-3, A-12). It genuinely has real, dated regression-guard test coverage (890 + 231 + 80 + 45 lines across four test files) — this is not an untested monolith — but its size alone makes it the hardest file in the domain to safely change, and it's already showing internal size-pressure signals: two independent, hand-copied query implementations (A-17), no in-file memoization (A-3), and a barrel-export gap that forces every caller to deep-import it (B-12). Splitting the loop-mode / corridor-flow / chain-discovery branches into separate modules is a real, worthwhile roadmap item — not urgent, since it's well-tested, but the size is a genuine navigability and change-risk cost.
- **`src/app/admin/routes/page.tsx` (2,794 lines) and `src/app/admin/approval-center/page.tsx` (1,119 lines)** — both classic "admin god-pages" mixing data-fetching, moderation actions, bulk operations, and UI in one file each. Low scale risk (admin-only), but both are where the B-2 finding (silent un-reject) and several duplicate haversine/Mapbox call sites (B-7, B-8) physically live — oversizing here has a direct correctness cost, not just a readability one.
- **`scripts/geo-discovery-routes.ts` (1,925 lines)** — the entire OSM-ingestion pipeline in one file, 43 top-level functions, zero test coverage (B-18), and home to the self-contained DEM decoder that duplicates the (tested) shared `dem-tile-cache` module. A strong candidate for decomposition specifically because it's both large *and* untested *and* contains real, duplicated logic — the highest-value refactor target in the whole domain, though correctly a roadmap item given the size of the undertaking.
- **`inventory.service.ts` (1,746 lines)** — the central route CRUD/moderation surface, 26 Firestore-write call sites, zero test coverage (B-18). Size here compounds directly with the test-coverage gap: a 1,700-line file with no tests is a materially harder thing to safely refactor or extend than a 1,700-line file with tests, and this is the file every write-path finding in this report (A-8, A-9, B-2, B-3) traces back to.

### B.3 — Duplication

Three real, cited duplication clusters, plus one correction from the adversarial review pass:

**Mapbox Directions call code — 6 independent implementations, one proven shared client bypassed by 5 of them (B-7).** `RouteEditor.tsx`'s `fetchSnappedRoute` and `route-geometry-edit.service.ts`'s `fetchBridgeConnector` are near-identical in URL/params/response-parsing, with a genuinely intentional behavioral divergence (straight-line fallback vs. hard-fail) — not a defect. But the duplication is wider than those two: `route-stitching.service.ts` alone hand-rolls **two** independent Directions-call bodies (`buildCircularRoute`, `bridgeGap`), plus `route.service.ts` (confirmed dead code — zero live callers, B-10) and `scripts/geo-discovery-routes.ts`'s own copy — 6 total. A real, reusable shared client (`mapbox.service.ts`) already exists in the same directory and is used by 5 real production callers including the live generator itself — so this isn't a "no good pattern exists" gap, it's an inconsistently-applied one. The risk is concrete, not theoretical: the shared client's own doc comments record a real bug (`route.legs[]` silently discarded until a fix on 08.08) that, because the 6 duplicate sites don't route through it, would not have been fixed for any of them even after the fix landed.

**Haversine/distance math — 9 independent re-implementations, the largest duplication surface found (B-8).** A canonical module (`geoUtils.ts`) exists and is correctly imported by several siblings, but `inventory.service.ts`, `route-stitching.service.ts`, `official-route-broadcaster.ts`, `route-generator.service.ts` (which already imports a *different* function from the same canonical file, proving the import path is trivial), `osm-segment-importer.ts`, `authority-resolution.ts`, `dem-sampling.service.ts`, `admin/routes/page.tsx`, and `scripts/recalc-route-distances.ts` all independently reimplement the identical formula. Three of these carry doc comments explicitly asserting they are "identical" to another copy — and one of those claims is **already subtly false today** (a rounding difference between `inventory.service.ts` and `distance-unit-classify.ts`, harmless by the latter's own design but proof the "identical" comment is an unverified assertion, not an enforced invariant). This is the exact class of bug (lat/lng ordering, unit mismatches) already logged and fixed once in this project's history — a real, systemic risk, not cosmetic.

**Geohash-proximity query-and-merge — 5 independent implementations, no shared helper (B-9).** The idiom "query geohash boxes → merge → dedupe → extract path with a midpoint fallback" is hand-written 5 times, including in the live route generator and the live Haifa lighting writer — a correctness fix to the merge/dedupe logic would need re-applying in up to 5 places.

**Correction from adversarial review:** an earlier draft of this audit recommended deleting `scripts/lib/route-lighting-classify.ts` as dead code. On review, this is **wrong** — the file has a real, live caller: `scripts/audit-route-quality-signals.ts` imports and actively uses it. It is correctly *not* used by the live production lighting writer (that's a different file, `route-lighting-street-segments.node.ts`), but it is not dead code and must not be deleted without first removing that import too. Corrected here rather than left as a false "cheap win."

Difficulty calculation, by contrast, is genuinely centralized (B-26) — one real algorithm, reused everywhere a DEM profile is available; the admin route-creation tool's manual 3-way difficulty picker is an intentional, simpler UX for brand-new hand-drawn routes with no elevation data yet, not copy-pasted logic (worth noting as a minor product-level gap — nothing reconciles a hand-picked value against what the DEM formula would compute for the same geometry — but not a code duplication).

### B.4 — Consistency / correctness-adjacent debt

Four previously-known items, reconfirmed unchanged: the `city`/`cityName` naming split across the 6 gated collections (B-5); `route_adjacency`'s two writers plus `street_segments`' broadcaster bypassing `buildValidatedDoc` (B-3); the Stage-2.5 authority-guard rules written but commented out, correctly and deliberately blocked on a known legacy-data precondition (B-4); and the pre-commit safety-check tripwire's `osm_amenities` gap (B-6).

**Two new, genuinely significant findings:**

**B-1 — `official_routes.status` has no validated enum, and its siblings disagree on what the third valid value even is.** `RouteFieldsSchema` defines no `status` or `published` field at all — both pass through the chokepoint's zod validation completely unchecked, because every schema in this registry is `.passthrough()`. Meanwhile `climb_segments` and `osm_amenities` — the two other moderatable collections in the same registry — both validate `status` against `z.enum(['pending','published','rejected'])`, but `official_routes` has only ever had `'archived'` written to it in practice. The admin UI already shows the fingerprint of this drift risk: the Approval Center's queue filter defensively excludes *both* `'archived'` and `'rejected'`, even though only one is ever actually written — exactly the kind of defensive code that appears when an inconsistency is already suspected but not fixed. This is the same bug class (a field that existed on the TypeScript type but was never added to the write-time schema) the team already found and fixed once, for `elevationGain`/`maxGrade` — leaving its sibling unfixed is a small, cheap gap in the same lineage.

**B-2 — the plain Inventory tab's publish-toggle can silently undo an Approval Center hard-rejection, with zero audit trail.** `src/app/admin/routes/page.tsx`'s draft/published toggle is a binary switch keyed only on `route.published`, and its own "is this a draft" logic treats a route that was explicitly rejected with a documented reason (`published:false, status:'archived', rejectionReason:'...'`) as indistinguishable from an ordinary never-reviewed route — same badge, same click target. Clicking it calls `InventoryService.approveRoute()` with no `admin` argument, which means: no `logAction` audit-log row is written, no `route_decisions` entry is logged, and — most concretely — the stale `rejectionReason` is never cleared even as the route goes live again and re-enters the live generator's broadcast/adjacency/enrichment pipeline. Any admin working the plain Inventory tab, rather than the Approval Center, can accidentally un-reject a colleague's documented rejection with no record it happened. This is a real governance gap, not a naming coincidence — worth fixing before an acquirer's engineer finds it by clicking around the admin UI themselves.

The error-handling pattern across the service layer, by contrast, is genuinely principled rather than accidental — a consistent three-tier convention (writes rethrow so the UI can surface an error; reads degrade to empty/null so a failed fetch doesn't crash a screen; background side-effects are explicitly non-fatal, documented as such in multiple files' own doc comments) holds across every method checked (B-23), and the codebase carries zero inline TODO/FIXME/HACK/XXX markers across 183 scoped files (B-24) — unfinished work here is tracked in prose doc-comments and planning docs, not left as silent inline debt markers.

### B.5 — Test coverage

The domain's pure logic is genuinely well-tested: `geoUtils.test.ts` (502 lines) and `route-generator.calibration.test.ts` (890 lines) alone account for over half the domain's test volume, and read as careful, dated regression guards for real historically-shipped bugs — named threshold edge cases, "byte-identical for existing callers" assertions tied to specific dated tuning changes — not superficial happy-path tests. Difficulty calculation, corridor adjacency geometry, climb-route spatial-join logic, and the leg-plan orchestration all have real, focused test files too.

**The gap that matters most for an acquisition specifically: every write-side service that actually mutates Firestore has zero automated test coverage (B-18).** `inventory.service.ts` (1,746 lines, 26 distinct Firestore-write call sites — `saveRoutes`, `approveRoute`, `updateRoute`, the adjacency/enrichment recomputes), `moderation.service.ts` (293 lines, 14 write sites), `route-geometry-edit.service.ts` (the entire safe-edit engine — `applySafeGeometryEdit` itself), `log-decision.ts` (the accuracy-agent's decision-log writer), and `scripts/geo-discovery-routes.ts` (1,925 lines, 43 functions, including the chokepoint write itself) are all confirmed, by direct search, to have no corresponding test file anywhere in the repository. This is precisely the class of risk this project's own operating rules call "silent data corruption" — and unlike Part A's findings, this is correctly a **correctness risk, not a scale risk**: a bad `approveRoute` or a mis-run ingestion script corrupts data for every user who later reads that route, independent of how many concurrent users the app has.

Two smaller but notable exceptions to the "pure logic is tested" pattern: `decide-accuracy.ts` (the accuracy-agent's decision engine, revised as recently as this week) and `route-composition-classify.ts` (the quality-certificate's composition classifier) are both explicitly documented as pure, deterministic, I/O-free functions — the exact profile every other tested file in this domain shares — yet both have zero tests (B-19). These are realistically a same-day addition, unlike the write-side gap.

**No CI exists at all** — no `.github/workflows`, no pre-commit test hook (B-20). The `test` script is real and runnable (`npm test` → `vitest run`), but nothing runs it automatically on commit, push, or deploy; since `main` auto-deploys to Vercel on merge per this project's own workflow, a broken change — tested or not — reaches production the moment a human forgets to run the test suite themselves. This removes the safety net underneath every other test-coverage fix in this report.

---

## Prioritized Shortlist

### Top 5 to do before the deal closes

1. **B-1 — Add the missing `status`/`published` enum validation to `RouteFieldsSchema`.** High severity, cheap fix, and the exact bug class the project already caught and fixed once for a sibling field — leaving it unfixed undercuts the "we know our own gaps" story if an acquirer's engineer finds it first by diffing the collection schemas themselves.
2. **A-8 — Add 500-op batch chunking to `recomputeRouteAdjacencyForCity` and its backfill-script twin.** A live feature is one large city away from silently going stale, and the fix is close to a direct copy of the correct pattern already sitting one file over in the same service.
3. **B-2 — Gate the Inventory tab's publish-toggle against silently un-rejecting an Approval Center decision.** A real governance/audit-trail gap with zero record when it fires — the kind of thing an acquirer's engineer might stumble into just by clicking around the admin UI.
4. **A-2 — Add `limit()` to `fetchScoredWaypointsByProximity`'s per-box queries.** Medium severity, but it's the one item sitting directly on the "thousands of concurrent users" axis this report was asked to answer; a small, low-risk mitigation lets the team say "no unbounded reads on the primary generation hot path" without qualification.
5. **Cheap hygiene batch — B-6 + B-10 + B-19.** A one-line regex fix to add `osm_amenities` to the pre-commit safety-check tripwire; delete the confirmed-dead `route.service.ts`; add unit tests for `decide-accuracy.ts` and `route-composition-classify.ts` mirroring the existing `route-difficulty.test.ts` style. Small, low-risk, closes several visible gaps between what the team claims and what's actually enforced/tested.

### Safe to wait for the acquirer

- **A-1 (Mapbox Directions rate-limit exposure)** — real, but the fix (a server-side proxy or genuine client throttling) needs proper design and testing; no acute failure has occurred today, and a rushed patch days before close is riskier than a deliberate post-close fix.
- **B-18 / B-20 (zero write-path test coverage; no CI)** — both real and both high-impact, but genuinely large: meaningful tests for a 1,700-line write-heavy service, and standing up CI for a team that currently deploys manually, are workflow changes needing time and buy-in, not something to slip in unilaterally right before a deal closes.
- **B-3 / B-4 (chokepoint bypass on the adjacency/broadcaster writers; the commented-out authority-guard rules)** — the team already has the fix staged in code and is deliberately, correctly blocked on a known precondition (156 of 183 legacy routes have no `authorityId`); enabling it before that backfill would break live route broadcasts. Correctly sequenced, not neglected.
- **B-7 / B-8 / B-9 (Mapbox-call, haversine, and geohash-query duplication)** — real, with a proven historical bug mechanism behind it, but consolidating 6, 9, and 5 call sites respectively (some with deliberately different failure semantics) needs careful regression testing; nothing is actively broken today.
- **B-11 (cross-domain imports)** — an app-wide architectural pattern, not a route-engine-specific lapse; unwinding it is a genuine cross-cutting redesign, out of scope for a pre-close fix.
- **A-6 / A-9 (adjacency N+1; no lock on rapid sequential approvals)** — admin-triggered, non-blocking, low-frequency by construction; will matter only once climb/route inventory scales meaningfully across more cities.
- **B-13 / B-14 / B-16 (naming trap, OSM-import folder split, scripts hygiene)** — cosmetic/discoverability only; the underlying safety properties hold in every case checked.

### Explicit platform credit

Firestore's and Vercel's own auto-scaling already absorb every read/write-volume concern this audit found, with the single exception of the Mapbox dependency (A-1) — no finding in this report recommends re-architecting anything the managed platform already handles. Specific credits worth stating plainly to an acquirer: route generation runs 100% client-side with zero server compute (A-12); the DEM tile cache is a real, correctly-implemented check-before-recompute cache (A-14); Overpass usage is the best-instrumented of the three external APIs and has zero end-user exposure (A-15); the one genuine many-end-users-same-document write pattern found uses Firestore's atomic `increment()` correctly (A-10); and the pure geometry/scoring test layer is close to a best-practice bar for this kind of domain (B-22), backed by a deliberate, consistent error-handling convention (B-23) and zero inline TODO/FIXME debt markers across the entire scoped domain (B-24).
