# Per-City Mapping Playbook (+ Haifa Bike-Discovery + Full-Build Verification)

**Status:** Built + committed to this worktree (branch `post-merge-dryrun-verification`,
19.08.2026, two rounds). **Dry-run only throughout — nothing `--apply`'d, nothing pushed, `main`
untouched.** `tsc`: 456/456 baseline maintained across both rounds (0 new errors).

---

## Part A — Broadened bicycle-discovery layer (standing capability)

`geo-discovery-routes.ts`'s bike detection is now the standard search for every region (not a
Haifa-only fallback):

1. **Tag-check on already-fetched candidates**: `bicycle==='designated'`, `bicycle==='yes'`, or
   `segregated==='yes'`, in addition to the original `highway==='cycleway'`.
2. **Dedicated Overpass query for road-painted bike lanes** — a separate highway-type universe
   (residential/primary/secondary/etc.) not covered by the footway|path|track|pedestrian|cycleway
   fetch: `cycleway=lane|track|opposite_lane|opposite_track`, `cycleway:left`, `cycleway:right`.
   Same named-only + 500–12000m window as every other segment.
3. Cycling labeling: `activityType:'cycling'`, duration divisor 250 m/min, calorie multiplier
   35 kcal/km (feel-based estimates, flagged for calibration review, not derived).
4. **Length/name floor deliberately left as-is**, per instruction — see the Bat Galim finding below.

**Haifa proof: 0 → 5 cycling candidates.** Examples: לולאה חיפה (unnamed loop, picked up via tag),
דרך גבעת העיזים ×2, סעדיה פז, עבאס (found via the new road-lane query — Haifa's bbox has only
3 tagged road-bike-lane ways total, 1 named).

**Bat Galim / Carmel-coast validation** (checked against live OSM tags, not guessed): the
promenade way itself (טיילת בת גלים) is explicitly `bicycle=no` — correctly excluded. A real
parallel bike lane exists right beside it (2 unnamed `highway=cycleway` ways + 2 named "טיילת
חולדה גורביץ'" fragments, one tagged exactly `bicycle=designated`+`segregated=yes`) — none
surfaced, because every fragment individually falls under the 500m floor or has no name. **This
is the deferred length/name-floor question**, a separate design call from the vocabulary
broadening itself, left open per instruction. Also found, outside the literal ask: a named
residential street (יוברט המפרי) tagged `bicycle=yes` directly on a road — not caught, since the
spec was `cycleway=*` tags on roads, not bare `bicycle=yes`.

---

## Part B — Per-city playbook: mapping a new city end to end

### Step 0 — Config you add per new city (the only manual, per-city work)

| File | What to add | Haifa's real values |
|---|---|---|
| `scripts/map-city.ts` → `CITY_CONFIGS` | `cityName`, `authorityId`, `bbox`, `boundaryClipWikidata?` | `'חיפה'`, `9ZdWFmlkP0njOyFPceEw`, `{32.734,34.9296,32.854,35.0496}`, `Q41621` |
| `scripts/geo-discovery-routes.ts` → `REGIONS` | `key`, `label`, `extraBboxes`/`bbox` (discovery scope — bbox-based, NOT `areaWikidata`), `boundaryClipWikidata?`, `batchId` | `haifa` entry, `boundaryClipWikidata: 'Q41621'`, `batchId: 'haifa-geodiscovery-2026-08-19'` |
| *(nothing else)* — the climb-discovery chain and amenities reuse `map-city.ts`'s own `CITY_CONFIGS` bbox + `boundaryClipWikidata` via CLI args, no separate config object | — | — |

`boundaryClipWikidata` is optional everywhere — a city without one simply gets no boundary clip
(fail-open, same as before this capability existed).

### Step 1 — The full ordered run sequence (route discovery + `map-city.ts`'s 11 steps)

Every write-capable step is dry-run by default; `--apply` is a genuine, deliberate hard-stop,
called out per step. Steps 2–12 all run via one command, `map-city.ts --city=<key>` (11 real
steps) — step 1 (route discovery) is separate, its own script, not a `map-city.ts` step.

| # | Step | Hard-stop on | Boundary-clipped? |
|---|---|---|---|
| 1 | Route discovery (`geo-discovery-routes.ts --region=<key> --dry-run`) | dropping `--dry-run` | ✅ if `boundaryClipWikidata` set |
| 2 | DEM tile-cache warm (city-wide) | `--apply` | n/a (Storage cache, not city-scoped data) |
| 3 | Street segments — calm pass | `--apply` | ❌ bbox only |
| 4 | Street segments — arterial pass | `--apply` | ❌ bbox only |
| 5 | DEM elevation — **routes** (route difficulty) | `--apply` | n/a (updates existing docs) |
| 6 | DEM elevation — **street segments** (per-segment grade, all segments) | `--apply` | n/a (updates existing docs) |
| 7 | Climb discovery — terrain | none — never touches Firestore | n/a (local file only) |
| 8 | Climb + stairs write | `--apply` (⚠️ underlying script defaults live — see below) | ✅ if `boundaryClipWikidata` set |
| 9 | Lit-tag rollup | `--apply` — pass `--include-pending` to also dress pending routes | n/a |
| 10 | Route-enrichment / climb-join | `--apply` — same `--include-pending` | n/a |
| 11 | Amenity extraction (incl. crossings) | `--apply` | ✅ if `boundaryClipWikidata` set (added round 2) |
| 12 | Route-adjacency recompute | `--apply` (city-agnostic — recomputes every city each run) | n/a |

Full dry-run command:
```
npx tsx scripts/map-city.ts --city=<key> --include-pending
```
Apply (only once every dry-run above has been reviewed and approved, step by step):
```
npx tsx scripts/map-city.ts --city=<key> --include-pending --apply
```

**⚠️ Known sharp edge, already fixed, worth remembering for any FUTURE new step added to this
pipeline**: `write-climb-segments-tlv.ts` (step 8) has an opt-in-dry-run CLI convention (default =
**live** write), the inverse of every other script here (default = safe dry-run, `--apply` opts
IN). `map-city.ts`'s step config sets `requiresExplicitDryRunFlag: true` on that one step
specifically to force `--dry-run` onto its default invocation — an independent review caught this
before it ever ran live (see Verification section, round 1). Any new step wrapping a script with
this same inverted convention needs the same flag, or it will silently write on every "dry-run".

### Round 2 additions (19.08.2026) — what changed

- **Amenity boundary-clip**: `extract-osm-amenities-tlv.ts` gained the same municipal-polygon clip
  routes/climbs already had (`--boundary-wikidata`, ported a 3rd time as a self-contained copy,
  matching this codebase's per-script convention). Closes real bbox-spillover into neighboring
  municipalities (e.g. Kiryat Ata/Nesher slivers around Haifa's bbox). Unlike routes/climbs
  (polylines, fraction-based clip), amenities are points — a plain in/out check, no threshold.
- **Pedestrian crossings — data capture only**: new 5th `osm_amenities` category `'crossing'`
  (`node["highway"="crossing"]`), point geometry, boundary-clipped like every other category.
  **Deliberately NOT wired into the route generator** (no prefer/avoid-crossing routing logic) —
  documented as a separate, larger future project. Available immediately for display/moderation,
  exactly like the other 4 categories always were.
- **Street-segment DEM grade — data capture only**: new script
  `scripts/populate-street-segment-elevation.ts`, DEM-samples **every** `street_segments` doc for
  a city (not restricted to arterials — verified cheap against real TLV data: 100% coverage,
  1144/1144 real segments, 0.02s total sampling time, 0 new Mapbox calls against an
  already-warmed cache). Writes two new fields, `demGradePercent`/`demElevationGainM`,
  **deliberately kept separate** from the existing `StreetSegment.inclinePct` (OSM-tag-derived,
  confirmed live at 0/11,180 real segments populated — see the "captured but not read" section
  below for why these two fields must never be merged). **Not wired into the generator** — same
  "capture only" scope as crossings.

### Still not built / deferred (small, flagged, not blocking)

- Generator wiring for crossings (routing preference) and segment grade (prefer-flat routing) —
  both explicitly out of scope this round, real future projects.
- The bike-discovery length/name floor (Part A) — deferred by instruction, not fixed.
- `dem-climbs-tlv.ts` remains an orphaned pilot script — harmless as-is, a candidate for deletion
  if David wants the dead code cleaned up (not touched, out of scope).

---

## Captured but NOT yet read by the generator — the full picture

Data existing in Firestore (or about to, once `--apply`'d) is not the same as data influencing
what a user actually gets routed through. This table is the complete answer, verified this
session via direct code search (file:line) across `route-generator.service.ts`,
`route-stitching.service.ts`, and `src/features/workout-engine/` — not assumed.

| Data | Read by live generator? | Evidence |
|---|---|---|
| `street_segments.score` / `flowScore` | ✅ **Yes** | `route-generator.service.ts:592,776` (fetch), `:1223` (flowScore live scoring bonus) |
| `official_routes.elevationGain`/`maxGrade` | ✅ **Yes** | `generator-elevation.service.ts`, wired into 5 live construction sites (`route-generator.service.ts:1920,2234,2609,3291,3371`) |
| `street_segments.tags.lit` | 🟡 **Indirect** | Baked into `.score` at import time (`osm-segment-importer.ts:490-491`) — no live "prefer lit streets" signal beyond that |
| `parks` (via `getParksByAuthority`) | ✅ **Yes** | Sole facility source for hybrid route-stitching, `route-stitching.service.ts:420` |
| `parks.gymEquipment` | ✅ **Yes**, generator-side only | Strength-generation logic reads it (`first-workout.service.ts:113-117`, `park-equipment-resolver.ts:43-99`, `execution-method-selector.service.ts:112-205`) — NOT exposed as a user-facing equipment filter |
| `StreetSegment.inclinePct` (OSM-tag) | ❌ **No** | Own doc comment: *"not yet consumed by scoreSegment/scoreWaypoint or any generator logic"*; confirmed 0/11,180 real docs even populated |
| `StreetSegment.demGradePercent`/`demElevationGainM` (DEM, new round 2) | ❌ **No** | Same "capture only" scope as inclinePct, by design this round |
| `night_lighting` (route featureTag) | ❌ **No** | Display/filter chip only (`RouteDetailSheet.tsx`, admin forms) — no routing influence |
| `climb_segments` / `official_routes.terrainFeatures` / `StreetSegment.nearbyClimbSegmentIds` | ❌ **No** | Gated behind `IS_ROUTE_ENRICHMENT_ORCHESTRATOR_ENABLED`, review/display join only. **Stairs are structurally excluded from routable segments by design** (`osm-segment-importer.ts:223-226`: *"a routing engine must never route someone onto a staircase"*) — climbs aren't a missing generator input, they're deliberately never meant to be one for stairs specifically |
| `StreetSegment.surfaceType` | ❌ **No** | Parsed/stored only, same scope as inclinePct |
| `osm_amenities` (all 5 categories, incl. new `crossing`) | ❌ **No** | `osm-amenity-admin.service.ts` is explicitly *"display layer only"*; zero references in `route-stitching.service.ts` or anywhere in `src/features/workout-engine/` |

**Bottom line**: routing/scoring today runs on `street_segments.score`/`flowScore` and
`official_routes.elevationGain`/`maxGrade` — that's the whole live input surface. Everything else
in this pipeline (lighting tags, climbs/stairs, amenities including crossings, both grade fields
on segments) is real, captured, moderatable, displayable data that currently has zero influence
on what route gets generated. That's an accurate description of today's system, not a bug list —
several of these were explicitly scoped as "capture now, wire later" from the start.

---

## Verification — full Haifa dry-run (19.08.2026)

*(round 2 counts below — filled in after the live run)*
