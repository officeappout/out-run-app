# City Orchestrator — Phased Implementation Plan

**Date:** 01.09.2026 · Builds directly on `CITY-ONBOARDING-INVENTORY.md` (same worktree). Plan only — nothing built, no code/config/data changed.

**The four hard principles below are load-bearing for every phase; each phase section states explicitly how it honors them, not just once here.**
1. One click → automatic → lands as pending, never auto-live.
2. Tags are real queryable Firestore fields, not display strings — Phases 4-5 need zero rewrite of Phase 3's schema.
3. Honesty (unknown ≠ false) everywhere: dashboard shows real coverage, cards stay silent, never a false negative.
4. Reproducibility: every pipeline must be regenerable from committed code — no step may depend on data whose origin isn't in the repo.

**One fact from the inventory governs the whole plan and is worth restating up front:** the closest existing precedent for Phase 3's tagging pattern — `recomputeRouteEnrichmentForCity`'s climb_segments↔route join — is gated by `IS_ROUTE_ENRICHMENT_ORCHESTRATOR_ENABLED = false` in production today (`feature-flags.ts:754`). The pattern exists in code but has never run live. Phase 3 inherits that risk, not a battle-tested foundation.

---

## Phase 0 — Prerequisites

**Scope:** four fixes surfaced by the inventory that block everything after them, none of which require new architecture.

### 0.1 — Reproduce the orphaned crosswalk/dog_park data
**Problem:** 2,206 `osm_amenities` docs with `category:'crossing'` and 18 with `category:'dog_park'` exist live (Haifa) but no committed code produces them, and neither value is in the `AmenityCategory` enum (`osm-amenity.types.ts:27`) or the zod schema (`schemas.ts:171`). This is a direct violation of principle 4 — the data exists but can't be regenerated, and it can't be queried/tagged onto routes safely (Phase 3) while it's outside the typed contract.
**Fix:** (a) widen `AmenityCategory` to include `'crossing'`+`'dog_park'` (schema + type, both sides of the chokepoint), (b) write a real, committed ingestion path for both — extending `extract-osm-amenities-tlv.ts`'s Overpass query (it explicitly excludes both today, per its own header, line 308) rather than inventing a second script. Also **flag to David that Haifa's existing 2,709 `osm_amenities` docs — the majority of the collection — were written by an unknown second mechanism** (the only known script is TLV-hardcoded); before generalizing, confirm whether that mechanism still exists somewhere untracked, or whether Haifa's data should be treated as an unreproducible legacy snapshot to preserve-but-not-extend.
**Files:** `src/features/parks/core/types/osm-amenity.types.ts`, `src/lib/route-collections/schemas.ts`, `scripts/extract-osm-amenities-tlv.ts`.
**Effort:** S-M (schema change is trivial; the Overpass query extension and garden-dedup interaction need care — the existing script already suppresses matches against `parks` docs, crosswalks/dog-parks need the same treatment or a decision that they don't dedup against parks at all).
**Risk:** low-medium — touches a live chokepoint-enforced collection; must not break the 3 already-working categories.

### 0.2 — Parameterize the city-hardcoded ingestions
**Problem:** `write-climb-segments-tlv.ts` hardcodes `city:'תל אביב-יפו'` (line 282) **and** its climb-detection source is a TLV-specific local JSON dump of 23 climbs — the city isn't just a parameter, the input data itself doesn't generalize. `extract-osm-amenities-tlv.ts` hardcodes `TLV_CITY` (line 106) but its Overpass-query logic is already city-agnostic in principle — only the constant needs to become an argument.
**Fix, two different shapes:**
- `extract-osm-amenities-tlv.ts` → straightforward: replace the hardcoded constant with a `--city`/`--authorityId` CLI arg, same pattern `geo-discovery-routes.ts` already uses (`--region=`).
- `write-climb-segments-tlv.ts` → **not just parameterization**. The local-JSON climb source has no equivalent for any other city. The OSM-tag half (`incline=*`, `highway=steps`) genuinely does generalize (it's a live Overpass query) — that half can be parameterized now. The DEM-detected-climb half needs a real decision: either build a generic DEM-slope-scanning pipeline (real new work, not in scope here) or accept that non-TLV cities launch with OSM-tag-sourced climbs only (steps + tagged inclines), missing the "detected from elevation data" category until that generic pipeline exists. Recommend the latter for v1 — ship what generalizes, document the gap rather than block on it.
**Files:** `scripts/write-climb-segments-tlv.ts`, `scripts/extract-osm-amenities-tlv.ts`.
**Effort:** S (amenities) / M (climbs, because of the honest scoping decision above, not the code itself).
**Risk:** low — both are already-isolated CLI scripts; parameterizing doesn't touch any live write path used elsewhere.

### 0.3 — Generalize the lighting wrapper
**Problem:** `backfill-route-lighting-haifa.ts` hardcodes `HAIFA_CITY='חיפה'` (line 39) and geo-discovery-routes.ts independently mirrors the same restriction (`REGION.label === 'חיפה'`, ~line 1846). The underlying classifier (`computeRouteLighting`) is already city-agnostic — this is a pure wrapper-generalization, the cheapest item in Phase 0.
**Fix:** replace both hardcoded checks with a parameter/config lookup. The existing `HAIFA_CITYNAME_ALIASES` array (already shaped for this, per its own comment, just unused as one today) is the natural extension point — turn it into a per-city alias-list config keyed by authorityId.
**Caveat to carry into Phase 0.4 (Haifa pilot) and Phase 2 (dashboard):** lighting quality depends on `street_segments.tags.lit` density, which was ~2.3% in Haifa (the reason the honesty gate — `status:'unknown'` — exists at all; only 4/77 Haifa routes are genuinely `'computed'` even today). Generalizing the wrapper doesn't guarantee useful lighting data for a new city — OSM `lit=` tag coverage is city-by-city unpredictable. Expect most new cities to land mostly `'unknown'`, honestly, not `'computed'`.
**Files:** `scripts/backfill-route-lighting-haifa.ts` (likely renamed), `scripts/geo-discovery-routes.ts`.
**Effort:** S.
**Risk:** low.

### 0.4 — Drive Haifa fully through the flow (the pilot)
**Problem:** Haifa is the most-built-out city in every collection except one — `route_adjacency` is zero, because that pipeline only reads `published` routes and 73/77 Haifa routes are still `pending`.
**Fix:** this is a **manual approval pass in Approval Center**, not new code — approve (or explicitly reject) Haifa's 73 pending routes, then confirm `route_adjacency` populates automatically (it's already gated `IS_ROUTE_ADJACENCY_ENABLED=true` and fires on route mutation). This is the cheapest possible end-to-end proof that the *existing* automatic-trigger chain (publish → adjacency → enrichment) actually works, before building anything new on top of it in Phase 1.
**Files:** none (admin-panel human action only).
**Effort:** XS (David's time, not build time) — but explicitly sequence this **before** Phase 1 design decisions are locked, since its result (does adjacency really populate automatically, or does the trigger silently not fire?) directly informs how much Phase 1 can trust "automatic" steps versus needing to explicitly re-invoke them.
**Risk:** none — pure human review of already-computed candidates, same action type happening today, just applied to a bigger batch.

**Phase 0 dependency note:** 0.1-0.3 are independent of each other and of 0.4; all four should land before Phase 1 begins, since Phase 1's step sequence assumes every pipeline it calls is genuinely city-agnostic (0.1-0.3) and that the automatic-trigger chain is proven, not assumed (0.4).

---

## Phase 1 — The Orchestrator ("map city X")

**Where it runs — grounded in a real, working precedent already in this codebase, not a new pattern:** `src/features/admin/services/demo-seed-sderot.ts`'s `runSderotDemoSeed(progress: ProgressFn, authorityId: string): Promise<SeedResult>` (line 1127) is a client-side async function, called from `src/app/admin/demo-seed/page.tsx`, that runs 10 named steps (`StepName` union) sequentially in the browser and streams live progress via a callback (`ProgressUpdate{step,status,message,count}`) straight into React state — no server-side job needed for the orchestration logic itself. **This sidesteps a real, concrete constraint**: every existing long-running admin API route in this codebase caps at `export const maxDuration = 60` (confirmed on `crm-agent/run`, `master-evolution-sync`, `transcripts/*`, `finance/*` — a consistent house convention, not per-route guesswork), and the full city-onboarding sequence (multiple Overpass fetches across several pipelines, DEM sampling per route, potentially 50-150+ routes) will very plausibly exceed that for a single request. Keeping the *sequence* in the browser tab, with each pipeline step calling its own short (<60s) API route, avoids needing a new job-queue/worker system.

**Design:**
- New client-side orchestrator, `runCityMapping(progress: ProgressFn, authorityId: string): Promise<CityMappingResult>`, mirroring `demo-seed-sderot.ts`'s exact shape and `StepName`/`ProgressUpdate` types.
- New admin page (`src/app/admin/city-mapping/page.tsx`), mirroring `demo-seed/page.tsx`'s UI: a city picker, a "Play" button, a live step list (running/done/error per step, with counts).
- **The ~10-step sequence from the inventory's §5, wired as the step list**, in the same dependency order: authority-exists check → street_segments import → route discovery → (composition is already inline in discovery, no separate step) → lighting → parks import → osm_amenities → climb_segments → **pause for human approval** → adjacency/enrichment re-verification.
- Each pipeline step that needs Admin-SDK/service-account/Overpass access (everything except the `street_segments` browser-commit path, which the inventory found already has a working admin-UI trigger at `/admin/segments`) needs a **new thin API route wrapper** exposing its existing CLI script's core logic — `maxDuration=60`, `requireRouteEditAccess`-style guard (matching the accuracy-queue precedent from earlier this session), city/authorityId as the only real input. This is genuinely new server code, but thin: each route calls an already-existing, already-tested function — it doesn't reimplement pipeline logic.
- **Honesty on partial failure**, per principle 3: `ProgressUpdate.status:'error'` per step, with the step's real error message surfaced verbatim in the UI (matching `SeedResult.errors: string[]`'s existing shape) — never swallowed, never silently retried without saying so. A step's failure does **not** silently skip to the next one; the orchestrator stops and shows exactly which step failed and why, since later steps (e.g. adjacency needs published routes, enrichment needs climb_segments) have real data dependencies on earlier ones.
- **Everything lands as pending** (principle 1) — this requires zero new logic, since every pipeline in the inventory already writes `status:'pending'`/`published:false` by default (`official_routes` via discovery) or requires the same pre-existing manual moderation step (`osm_amenities` via the approval queue). The orchestrator's last step is explicitly **not** "publish" — it stops at "ready for review," matching the existing Approval Center as the one and only publish gate.
- **Risk not yet resolved by this plan, stated honestly**: if a single pipeline step (most likely the Overpass-heavy ones — street_segments or osm_amenities on a large city) itself exceeds 60s, the thin-API-route-per-step design breaks down and that ONE step needs internal chunking (a cursor/offset param the orchestrator calls repeatedly until the step reports done) — a real possibility worth load-testing against a mid-size city (Ramat Gan-scale) before assuming every step fits.

**Effort:** L (the new orchestrator + UI is a moderate lift matching demo-seed's own ~1300+800 lines combined; the 4-5 new thin API-route wrappers are individually small but numerous).
**Dependencies:** all of Phase 0.
**Risk:** medium — the per-step-duration risk above is real and untested; also, chaining 6+ Overpass-dependent steps compounds the rate-limit/retry behavior already observed in this session's own script runs (multiple mirror fallbacks needed even for single-city fetches).

---

## Phase 2 — City Coverage Dashboard

**Scope:** a per-city read view answering "what does this city actually have" — directly reusing the inventory's own per-city query logic (§2's live matrix was built by extending `scripts/audit-city-coverage.ts`'s exported `auditRoutes`/`auditLocations` functions; the same extension should become a real, permanent, reusable module rather than a one-off script).

**Design:**
- New shared module (server-side, Admin SDK — mirrors this session's earlier `compute-queue.ts` precedent for the accuracy-queue feature: one batch-compute function, reused by both an API route and any future CLI/script caller), covering every collection from the inventory's matrix: `official_routes`/`curated_routes` counts + `qualitySignals` coverage breakdown, `street_segments`, `climb_segments`, `route_adjacency`, `osm_amenities` by category, `parks` by facilityType.
- New admin page + API route (superAdmin-gated, same pattern as the accuracy-queue route from earlier this session — an all-cities-visible surface is a super-admin operation, not an authority-manager one, though this one is naturally per-city so the authority-manager-scoping question is more genuinely open here than it was for the accuracy queue; flag for a decision, don't assume).
- **Honesty rule applied concretely**: every signal cell renders one of three states, never two — populated-with-real-number, `'אין מידע'` (never computed for this city), or (composition/lighting specifically) `'אין מידע (כיסוי נמוך)'` for the computed-but-`unknown` case, reusing the exact wording already shipped in the route editor's own quality-certificate block (`edit/page.tsx`, this session's earlier work) rather than inventing new copy for the same concept.
- **Must also surface the field-key inconsistency the inventory found** (`authorityId` vs `cityName` vs no-field-at-all across different collections, plus the `placeholder_tlv` artifact) — the dashboard's own per-city aggregation needs to resolve this correctly (fall back through `authorityId` → `city`/`cityName` → flag as unresolvable), or it will silently under-count exactly the way the "amenities are TLV-only" myth got started.

**Effort:** M — mostly assembling already-proven per-collection query patterns into one view; the real work is the honest-rendering rules, not the queries themselves.
**Dependencies:** Phase 0 (a dashboard showing an ungeneralized pipeline's data as "not yet run for city X" is only meaningful once "run for city X" is actually possible). Does **not** depend on Phase 1 — the dashboard is equally useful for auditing today's 4 cities' current, real, patchwork state.
**Risk:** low — read-only surface, no write path, worst case is a wrong number, not a data-integrity issue.

---

## Phase 3 — Feature/Amenity → Route Tagging as Queryable Data

**This is the phase principle 2 is really about — get the schema right here or Phases 4-5 need a rewrite.**

**The real precedent, and its real caveat:** `Route.terrainFeatures?: RouteTerrainFeatureRef[]` (route.types.ts:324-331) is the existing pattern for exactly this shape of problem — a spatial join from a route to nearby typed entities in another collection (`climb_segments`), computed by a separate service (`route-enrichment.service.ts`, pure geometry) and written via `InventoryService.recomputeRouteEnrichmentForCity` through the chokepoint. **But this pattern has never run in production** — `IS_ROUTE_ENRICHMENT_ORCHESTRATOR_ENABLED = false` (feature-flags.ts:754) — and the inventory found `terrainFeatures` populated on 0/176 sampled routes. Phase 3 should follow this pattern's *shape* while treating its *reliability* as unproven, and budget time to actually flip the enrichment flag on and verify it works (on Haifa, post-Phase-0.4) before trusting the same mechanism for amenities.

**Data model (concrete, per principle 2 — dual-layer, not just an array):**
```ts
// New field on Route, structurally parallel to terrainFeatures:
interface RouteAmenityRef {
  amenityId: string;              // osm_amenities doc id
  category: AmenityCategory;      // widened per Phase 0.1: court|bench|drinking_water|fitness_station|crossing|dog_park
  distanceFromRouteM: number;     // for later distance-weighted scoring
  pathFraction?: number;          // 0-1 position along the route, for "on the way" phrasing later
}
nearbyAmenities?: RouteAmenityRef[];   // rich, positional — NOT the query layer

// Flat summary fields alongside it — THIS is what Phase 4/5 actually filter/sort on.
// Mirrors qualitySignals.composition's own already-proven pattern: real numbers,
// not booleans-only, so a later "weight lighting up" can scale continuously.
amenitySummary?: {
  benchCount: number;
  drinkingWaterCount: number;
  courtCount: number;
  fitnessStationCount: number;
  crossingCount: number;          // for "few crosswalks" — see Phase 5
  hasDogPark: boolean;
};
```
The array alone is insufficient for principle 2: Firestore can't cheaply compound-filter/sort on "count of array entries matching category X" alongside other conditions. The flat summary is the actual queryable/weightable surface; the array is provenance/detail for the UI (badge tooltips, "which bench" drill-down) — same division of labor as `qualitySignals.composition`'s flat percentages already prove out today.

**Trees/shade — honest feasibility assessment, not a guess:** the inventory found zero `natural=tree` querying anywhere, and this codebase's own prior experience with a structurally similar OSM tag (`lit=`) found only ~2.3% real coverage in Haifa — the specific reason the lighting honesty-gate exists. `natural=tree` individual-tree tagging is typically **even sparser** than street-lighting tags in OSM generally (trees are usually mapped as `landuse=forest`/canopy polygons in well-mapped areas, or not mapped at all in most residential/informal urban areas — Israeli municipal OSM coverage for individual trees is unverified by this plan and should not be assumed). **Recommendation: do not build a shade pipeline in Phase 3.** Run a single cheap Overpass probe query for `natural=tree` density in Haifa's bbox first (an afternoon, not a phase) — only proceed with a real shade signal if that probe shows genuinely usable density; otherwise shade stays a documented future gap, honestly reported as `'אין מידע'` everywhere, same treatment non-Haifa lighting already gets.

**featureTags reuse:** `has_benches`/`water_fountain` already exist as `RouteFeatureTag` literals and are populated (sparsely — 3/158 routes) by the *existing* admin editor's manual `FeatureTagPicker`. Phase 3 should **compute and set these two existing tags automatically** from the new `amenitySummary` (bench/drinking-water counts > 0) rather than leaving them purely manual — but this doesn't replace the new `nearbyAmenities`/`amenitySummary` fields, since `featureTags` has no room for court/fitness_station/dog_park/crossing (0/5 of those have an enum member) and carries no distance/count structure.

**Files:** `route.types.ts` (new fields), new `route-amenity-enrichment.service.ts` (pure geometry, sibling to `route-enrichment.service.ts`), extends `InventoryService.recomputeRouteEnrichmentForCity`'s existing dispatcher rather than adding a second trigger point.

**Effort:** M-L (schema + join service is moderate; the real cost is verifying the never-proven-live enrichment-trigger mechanism actually fires reliably, which Phase 0.4's Haifa pilot should have already partly de-risked for climb_segments specifically).
**Dependencies:** Phase 0.1 (widened `AmenityCategory`), and benefits from — but doesn't strictly require — Phase 1/2 (a manual one-city backfill run is possible without the full orchestrator).
**Risk:** medium — the join-trigger reliability question is real and currently unverified; a silent no-op (same failure mode `route_adjacency` had for Haifa) is the main danger, mitigated by Phase 2's dashboard making "0 amenities tagged" visibly obvious rather than silently invisible.

---

## Phase 4 (design sketch) — Signals Feed Generation

**Not building this — confirming the Phase 3 schema makes it a weighting layer, not a rewrite.**

Today's generator (`route-generator.service.ts`) already has a proven scoring-bonus mechanism — `scoreArterialFlow`'s `preferArterialFlow` bonus and the `isOfficial` corridor bonus (both confirmed live, unconditional, in the inventory's §4) — added as extra terms inside `scoreWaypoint()`, gated by a caller-supplied preference flag. A future "evening" preset weighting lighting up, or a "shade" preset weighting tree-coverage up, is the **same mechanism**: a new bonus term reading `street_segments`-adjacent or route-level fields (`qualitySignals.lighting.litCoveragePct`, `amenitySummary.crossingCount` inverted, a future shade field) multiplied by a preset-supplied weight, added into the existing scoring pass. Because Phase 3 already made these real numeric fields (not display strings), the weighting term is a straightforward `score += (signalValue/scale) * presetWeight` — structurally identical to the two bonuses that already exist, not a new scoring architecture. The **generator would need read access to route-level fields it doesn't touch today** (confirmed absent from `route-generator.service.ts` in the inventory's §4b) — that's the one real wiring gap, not a design gap.

**Effort (future, not now):** M per new weighted signal, once Phase 3's fields exist.
**Dependencies:** Phase 3 fields must be populated (not just schema-present) for a city before that city's generation can use them — another reason Phase 2's dashboard (visible coverage) matters before Phase 4 is ever built.

---

## Phase 5 (design sketch) — Natural-Language Requests

**Not building this — confirming the same fields map cleanly.**

"5km run, few crosswalks, relatively lit (7pm), water fountains on the way, maybe a fitness station" decomposes directly onto Phase 3/4's fields, no new data model needed:
- "5km" → existing distance-fit scoring (already live).
- "few crosswalks" → `amenitySummary.crossingCount`, low-weighted preference (Phase 4 mechanism).
- "relatively lit, 7pm" → time-of-day maps to a preset (Phase 4's "evening" example) that up-weights `qualitySignals.lighting.litCoveragePct` — note this is **still honesty-gated**: a route with `lighting` absent/`unknown` cannot be scored on this axis at all, it simply doesn't get the bonus (never penalized for missing data, matching principle 3 exactly).
- "water fountains on the way" → `amenitySummary.drinkingWaterCount` + optionally `nearbyAmenities[].pathFraction` for genuine "on the way" (not just "somewhere near") phrasing — this is exactly why the array-plus-summary dual layer from Phase 3 was designed in, not an afterthought.
- "maybe a fitness station" → soft/optional weight, not a hard filter — same bonus-mechanism as above, just lower magnitude.

The NL-parsing layer itself (turning the sentence into `{distanceKm:5, weights:{crossing:-0.3, lighting:0.6, drinkingWater:0.4, fitnessStation:0.2}}`) is new work, but it's a **translation layer sitting on top of Phase 4's weighting mechanism** — it doesn't require the data model or scoring architecture to change again. This is the concrete proof that Phase 3's schema decision (real numeric fields, not strings) is the right one to lock in now.

**Effort (future, not now):** L (the NL-parsing/intent-extraction layer is the real new work; the scoring plumbing is Phase 4's, already sketched).
**Dependencies:** Phase 4.

---

## Recommended Build Order & Prerequisite vs. Nice-to-Have

**Build order:** 0 → 1 → 2 → 3, with 2 buildable in parallel with 1 (2 doesn't depend on 1's existence, only on 0). 4 and 5 are explicitly future, design-validated but not scheduled.

| Item | Status |
|---|---|
| Phase 0.1 (crosswalk/dog_park reproducibility) | **Prerequisite** — Phase 3 cannot tag categories that aren't in the typed schema |
| Phase 0.2 (parameterize climb/amenity ingestion) | **Prerequisite** — Phase 1 has nothing to orchestrate for a new city otherwise |
| Phase 0.3 (generalize lighting) | **Prerequisite**, cheapest item — do first |
| Phase 0.4 (Haifa pilot) | **Prerequisite** — de-risks the automatic-trigger assumption Phase 1 and Phase 3 both lean on |
| Phase 1 (orchestrator) | **Prerequisite** for the stated vision (one-click) — but the city-onboarding sequence remains fully usable manually (today's actual state) if this slips |
| Phase 2 (dashboard) | **Nice-to-have relative to the vision, but effectively a prerequisite in practice** — without it, Phase 3's "did the join actually run" question (real risk, stated above) is invisible until someone thinks to check Firestore directly |
| Phase 3 (amenity tagging) | **Prerequisite for Phase 4/5**, not for Phase 1's own vision (one-click onboarding is complete without route-level amenity tags — they're a quality/filtering layer on top, not a blocker to "map the city") |
| Phase 4/5 | **Explicitly future** — sketch only, correctly deferred |

---

*Full pipeline citations, live per-city numbers, and the crosswalk/dog_park data-origin question are documented in `CITY-ONBOARDING-INVENTORY.md` (same repo, prior audit) — this plan does not repeat them, only references what's load-bearing for a design decision.*
