# Station-Expansion Scoping — audit only, nothing built

> Scoping/estimation task (04.08.2026, two rounds same day), NOT a build. worktree
> `appout-1-scope-station-expansion` (branch `scope/station-expansion-04-08`) exists but is empty —
> all research agents (round 1 + round 2) ran in their own throwaway isolated worktrees (read-mostly,
> no PoC code was needed) and were auto-cleaned up. This file is the only persisted output. Do not
> treat anything below as decided/approved — it's a complexity estimate to help David sequence
> future work.
>
> **Round 2 (same day) overturned two Round-1 conclusions** — both were grep-based false negatives.
> Corrections are inline below, marked ⚠️ **ROUND 2 CORRECTION**. Net effect: Part A's estimate
> downgrades from medium-large to **medium** (questionnaire gate already exists, live and unflagged
> — just needs wiring), and Part B's is now closer to **small** (home location already exists as
> real lat/lng, no new field needed).

## Part A — "Grass, no-equipment" station, questionnaire-gated

Stop on grass/open area with NO equipment, offering ONLY legs+core (no pull/push). Gated on the
user having completed a strength self-assessment; if not completed AND no equipped gym nearby →
show an "unlock by completing the questionnaire" message instead of silently offering nothing.

**(a) Reusable today:**
- `mapParkToStop` ([route-stops.service.ts:54-75](../../src/features/workout-engine/hybrid/route-stops.service.ts#L54)) — explicitly modular dispatch, file's own header calls a new location kind "one branch here."
- `Exercise.fieldReady` ([exercise.types.ts:756](../../src/features/content/exercises/core/exercise.types.ts#L756)), read via `ContextualEngine.passesFieldMode` (`intentMode: 'field'`) — already filters the catalog to no-equipment-only, domain-independent.
- `MUSCLE_TO_DOMAIN` / `domainOf()` ([compose-hybrid-session.service.ts:48-56](../../src/features/workout-engine/hybrid/compose-hybrid-session.service.ts#L48)) — maps `primaryMuscle` → `pull|push|legs|core|other`; restricting to legs+core is a one-line filter on this, no new tagging needed.
- Empty `gymEquipment` on a park already yields *a* bodyweight stop today (see Part B) — the "no gear ⇒ bodyweight content" mechanism is proven, just not domain-restricted to legs+core.

**(b) Missing:**
- **Real schema gap.** `ParkFacilityCategory` ([park.types.ts:37](../../src/features/parks/core/types/park.types.ts#L37)) has no "open/grass, unequipped" value (`gym_park|court|route|zen_spot|urban_spot|nature_community` only). Also found a latent bug: `mapParkToStop` reads `(park as any).category ?? park.facilityType`, but `normalizePark` never populates `category` — only `facilityType` — so that fallback is dead code today (harmless, since `facilityType` always wins in practice). Today `facilityType==='gym_park'` with empty `gymEquipment` already routes to a *mixed*-domain bodyweight stop, not legs+core-only — overloading `gym_park` further would be the wrong fix; needs a real new category (e.g. `open_field`).
- New branch in `mapParkToStop` + new logic in `dispatchStopContent` ([compose-hybrid-session.service.ts:332-413](../../src/features/workout-engine/hybrid/compose-hybrid-session.service.ts#L332)) to force `domain ∈ {legs, core}` — no existing param does this (`domainFocus` today is one cycling domain or unset-for-all).
- ~~Questionnaire-completion gate does not exist... would be built from scratch.~~
- Unlock-message UX/copy — mostly reusable now, see correction below.

> ⚠️ **ROUND 2 CORRECTION (04.08.2026):** the "questionnaire gate doesn't exist" finding above was
> **wrong** — it only checked the dead `profileCompleted` field. A real, live, **unflagged** gate
> already exists: `hasCompletedAssessment`, a derived boolean in
> [home/page.tsx:602-612](../../src/app/home/page.tsx#L602), `true` when any
> `progression.tracks[x].currentLevel > 1` OR any `progression.domains[x].currentLevel > 1` OR
> `profile.onboardingStatus === 'COMPLETED'`. It's already wired end-to-end: `home/page.tsx` →
> `<StatsOverview onStartWorkout={handleHeroPress}>` → tapping a locked widget or the hero with no
> strength program → a real nudge drawer ([StatsOverview.tsx:1452-1507](../../src/features/home/components/StatsOverview.tsx#L1452),
> title "קודם כל, בואו נכיר!", CTA "התחל אבחון רמה") → `router.push('/onboarding-new/assessment-visual')`
> ([home/page.tsx:1012](../../src/app/home/page.tsx#L1012)). No feature flag gates it. **The unlock-message
> UX this feature needs isn't new — reuse this exact drawer/copy pattern and the `hasCompletedAssessment`
> derivation**, just triggered from the route_stops eligibility check instead of the home hero.
> (Separately: `WorkoutBuilderSheet.tsx`'s "unlock modal" — [:1218-1242](../../src/features/home/components/WorkoutBuilderSheet.tsx#L1218) —
> is a DIFFERENT, inert placeholder ("בקרוב תוכל/י לבצע כאן מבדק כוח קצר" — coming-soon teaser, OK-only
> dismiss). Don't confuse the two; the live one is `hasCompletedAssessment`, not the builder-sheet modal.)

**(c) Complexity: medium** *(downgraded from medium-large — questionnaire gate is a wire-up, not a build)*. Filtering machinery reuses cleanly, the questionnaire-completion signal and its nudge-drawer UX already exist and are reusable as-is; remaining new work is the Park category (schema + admin UI) and the `domain ∈ {legs, core}` filter in `dispatchStopContent`.

---

## Part B — Fallback to home-exercises when no matching equipment nearby

User's level needs specific equipment (pull-up bar/dips) but no equipped park is in range →
fall back to walking loop + difficulty-matched bodyweight substitutes, at either a saved "home"
location or the user's current location.

**(a) Reusable today — largely already built.** A near-identical fallback already ships:
`composeHybridSession` §3 step 7 ([compose-hybrid-session.service.ts:574-591](../../src/features/workout-engine/hybrid/compose-hybrid-session.service.ts#L574)) — when no equipped park sits near the route, synthesizes exactly "walking loop + bodyweight stop" (`usedFieldFallback = true`, `locationKind: 'open_area'`, `availableEquipment: []`, `intentMode: 'field'`). Explicitly documented at [start-hybrid-session.ts:492-494](../../src/features/workout-engine/hybrid/start-hybrid-session.ts#L492): "only synthesize field fallback when NO candidate carries equipment." Zero-station `route_stops` routes already degrade into this same path. `Exercise.level: number` ([exercise.types.ts:784](../../src/features/content/exercises/core/exercise.types.ts#L784)) exists per-exercise for difficulty-matching. `Authority.coordinates?` ([admin-types.ts:166](../../src/types/admin-types.ts#L166)) is the closest existing "predefined location" concept, but it's authority/city-level, not per-user.

**(b) Missing:**
- ~~No per-user saved "home" location anywhere... would need a new profile field + set-home UI.~~ **WRONG, see correction below — this already exists.**
- No curated "high-level bodyweight pull/dip substitute" tagging — today's fallback pool is generic mixed-domain bodyweight (`fieldReady` + level window), not verified as difficulty-equivalent replacements for iron pull/push work specifically. **Unresolved by static analysis** — whether the live exercise catalog already has enough tagged high-level substitutes (archer rows, pike push-ups, etc.) is a live-data question, not something grep can answer. (Round 2 got adjacent real numbers — see the new "Exercise-count background data" section below — but did not specifically verify pull/dip-substitute *quality*, only raw home+legs/core+level counts.)

> ⚠️ **ROUND 2 CORRECTION (04.08.2026):** the "no per-user home location" finding above was **wrong**
> — it was a keyword-grep false negative (the field isn't named "home"). Tracing the actual onboarding
> flow found a real, precise, already-reusable home anchor:
> - **UI:** `UnifiedLocationStep.tsx` (onboarding) — Mapbox draggable-pin picker + GPS button + city/neighborhood search.
> - **Firestore field:** `users/{uid}.core.anchorLat` / `core.anchorLng` — real numeric lat/lng
>   ([user.types.ts:268-270](../../src/features/user/core/types/user.types.ts#L268), comment: *"Neighborhood-level
>   anchor coordinates saved when the user first confirms their location"*), written via
>   `syncLocationToFirestore()` ([firestore.service.ts:391-423](../../src/lib/firestore.service.ts#L391)).
>   `core.authorityId` (city-level) is saved separately via the locked `/api/user/update-authority` route.
> - **Precision:** real coordinates, not just a city pointer — sourced from GPS, geocoded city/neighborhood
>   centroid, or manual pin-drag. **Already consumed as a location anchor** by `useGPS.ts:25-28`,
>   `NearbyGroupsRow.tsx:106-107`, `WorkoutLocationSuggestions.tsx:70-71`, `CreateGroupWizard.tsx:143-144` —
>   this is an established pattern, not a one-off.
> - **No edit screen** — `MapShell.tsx`'s `needsLocationGate` ([:711-719](../../src/app/map/MapShell.tsx#L711))
>   only re-shows the picker if `core.authorityId` is missing; once set, `anchorLat`/`anchorLng` are
>   effectively locked (no user-facing "edit my home location" screen found anywhere, checked `src/app/settings/`).
>   Not blocking for this feature (read-only reuse), but worth knowing if "home" ever needs to be
>   user-editable later.
> - **Directly reusable as-is for the home-anchor fallback — no new field, no geocode step needed.**

**(c) Complexity: small** *(downgraded from small-medium — home location is a read, not a build)*. The fallback mechanism AND the home-location anchor both already ship; remaining work is exercise-substitute curation/tagging only.

**(d) Overlap with Part A: same mechanism, different trigger — even cheaper to share than Round 1 estimated.** Both reuse `intentMode:'field'` + `fieldReady` + `domainOf()`/level-window filtering inside `dispatchStopContent`. Concretely: Part B's existing fallback is domain-**unrestricted** (any bodyweight fits) and triggers on "no equipped park nearby" only — no questionnaire check. Part A still needs its own `domain ∈ {legs, core}` filter (new, small) — but per the Round 2 corrections above, its questionnaire gate (`hasCompletedAssessment`) and Part B's home anchor (`core.anchorLat/anchorLng`) **both already exist and are both just reuse, not builds.** **Net: A and B now share almost their entire foundation (field-mode filtering, home anchor, questionnaire signal) — the only genuinely new code across BOTH parts is the new Park category (A), the `legs/core`-only filter (A), and pull/dip-substitute curation (B).**

---

## Constraint decisions to document (not built this round)

### Home as route ANCHOR only — never a mid-route stop
**Source:** David, Round 2 (04.08.2026). When a route includes a home-exercise component, "home"
may only appear as the route's **start point or end point** — never as a repeating mid-route stop.
Unlike park stops (where the route can loop out to several stations and back), you can't "leave home
and return home" multiple times within one session. The aerobic component (walk/run) may come
**before or after** the home strength block, but the home anchor itself is single-occurrence, at
one edge of the route.

**Relevance to what exists today:** `resolveRouteStops` ([route-stops.service.ts:106-162](../../src/features/workout-engine/hybrid/route-stops.service.ts#L106))
currently treats all stops uniformly as mid-path proximity matches along a loop — it has no concept
of an "anchor-only, edge-of-route" stop kind. Whoever builds Part B's route-integration (not scoped
in detail this round — Part B above only covers the *exercise-selection* fallback, not full
route-shape integration) will need to make sure home-as-anchor is structurally distinct from the
existing mid-route stop-matching loop, not just another entry in it. Flagging so it isn't
retrofitted incorrectly later.

### Polygon-drawing tool must live in the SAME admin surface as existing point-marking — not a separate tool
**Source:** David, Round 2 (04.08.2026). Part C's polygon-drawing capability (see above) must be
added to the **exact same place** admins already mark point locations today — not a standalone new
tool/page. Per the Round 1 Part C findings, that place is `LocationPicker.tsx`
([:74-80](../../src/features/admin/components/LocationPicker.tsx#L74), used by `ParkForm.tsx`) and/or
`RouteEditor.tsx` ([:236-260](../../src/features/admin/components/routes/RouteEditor.tsx#L236)) — polygon
drawing should extend one of these existing editors (most likely `LocationPicker.tsx`, since it
already renders/validates against a `Polygon` boundary), not live in a new component/page.

**Forward-compatibility requirement (not built, just a constraint to design around later):** when
the future automated area-scan agent is eventually built (explicitly out of scope — see Part C (d)
and the parking-lot "stairs workout" idea for the pattern of documenting-without-building), it
should write into the **same** data entry point/schema the manual polygon tool uses, so a
human-drawn area and an agent-proposed area are indistinguishable to the rest of the system (same
review/approval flow the project already uses for `official_routes`, per `CLAUDE.md`'s CRM/approval
conventions). Concretely: whatever new `stop_areas`-type collection/schema gets designed for the
manual tool should be designed with an agent-writer in mind from day one (e.g. a `source: 'manual' |
'agent'` + approval-status field, mirroring how `official_routes` are already reviewed), even though
building the agent itself is not in scope now.

---

## Exercise-count background data (for setting a minimum-exercise threshold — data only, no decision made)

**Source:** Round 2 (04.08.2026), from `exercise-inventory.csv` (repo root, generated 03.08.2026 by
`scripts/inventory-core-exercises.ts` directly from the live Firestore `exercises` collection — fresh,
not stale). Domain classification used the exact `MUSCLE_TO_DOMAIN` map from
[compose-hybrid-session.service.ts:47-52](../../src/features/workout-engine/hybrid/compose-hybrid-session.service.ts#L47).

- **Raw total home-tagged (all domains):** 352 of 366 exercises (96%) — expected for a
  bodyweight-calisthenics catalog.
- **Home-tagged AND domain ∈ {legs, core}: 90 exercises** — legs: 76, core (abs): 14.
- **⚠️ Important scale correction:** there is **no single global 1-3 difficulty field** on `Exercise`.
  `level` lives inside per-program `targetPrograms[]` entries ([exercise.types.ts:782-784](../../src/features/content/exercises/core/exercise.types.ts#L782)) —
  a program-relative progression index, NOT a fixed 3-tier scale. Observed ranges: **legs 1–13**
  (n=76, distribution roughly even across the range, heaviest at levels 1, 5, 6, 7, 10), **core 3–18**
  (n=11 of the 14 core exercises actually carry a level — 3 have `primaryMuscle: abs` but no `core:`
  entry in `targetPrograms` at all, so they have no defined level under this scheme).
- **Implication for the threshold decision:** whatever minimum-count threshold gets picked should be
  defined against this program-relative level scale (or a level-BAND, e.g. "±2 around the user's
  current program level," matching how the rest of the engine already windows by level — see
  `WorkoutGenerator.ts`'s level-tier logic referenced in Part A/B above) — not against an assumed
  1/2/3 scale, since that scale doesn't exist in the data. 90 total candidates split across a
  1–18-wide range means any given narrow level-band will have a much smaller real count than 90 —
  worth sanity-checking a specific band's count before finalizing a threshold, not just using the 90 total.

---

## Part C — Admin-panel polygon-drawing tool (area, not point)

Draw/mark a whole area on the map meaning "this area suits stop-type X," instead of entering
many individual point coordinates. (Future, not estimated here: automated city-wide grass/open-area
scan, analogous to the existing route-approval flow.)

**(a) Reusable today:**
- Two existing admin click-to-place UIs, both point-based: `LocationPicker.tsx` ([:74-80](../../src/features/admin/components/LocationPicker.tsx#L74)) — single-point placement, already renders a GeoJSON `Polygon` boundary overlay + hand-rolled `isPointInPolygon` ([:32-47](../../src/features/admin/components/LocationPicker.tsx#L32)) + `createCirclePolygon` ([:11-29](../../src/features/admin/components/LocationPicker.tsx#L11)), used by `ParkForm.tsx` for placing a park pin inside an authority boundary. `RouteEditor.tsx` ([:236-260](../../src/features/admin/components/routes/RouteEditor.tsx#L236)) — sequential click-to-place ordered waypoints forming a line, used for `official_routes`. Neither draws closed areas.
- `import-osm-routes-tlv.ts` is a pure CLI one-off writer (no map UI). `osm-segment-importer.ts` is shared logic used by both a CLI script and an admin UI page (`src/app/admin/segments/page.tsx`) — good precedent for "CLI + admin-UI share one service module."
- **`mapbox-gl-draw`: NOT installed** (confirmed absent from package.json/lockfile). Installed stack: `mapbox-gl@2.15.0`, `react-map-gl@^7.1.9` — within mapbox-gl-draw's normal v1-v3 compat window, no known conflict with this codebase's custom style logic (`mapStyleConfig.ts`).
- **Polygon/GeoJSON Firestore storage already proven end-to-end**: `authorities.boundaryGeoJSON`, typed `GeoJSON.Feature<GeoJSON.Polygon>` ([admin-types.ts:169-170](../../src/types/admin-types.ts#L169)), normalized in `authority.service.ts:278`, consumed by `LocationPicker`/`ParkForm`. Real working pattern — but 1:1 per authority (one city boundary), not a repeatable collection of many small tagged shapes.
- `resolveRouteStops` ([route-stops.service.ts:106-162](../../src/features/workout-engine/hybrid/route-stops.service.ts#L106)) — pure point-based proximity matching (180m match radius, 150m dedupe gap), zero polygon awareness today.

**(b) Missing:**
- `mapbox-gl-draw` as a new dependency — no closed-shape drawing tool exists anywhere in the admin panel.
- A new Firestore schema for "named area + stop-type tag" as a repeatable collection (e.g. `stop_areas: {geometry: Polygon, stopType, authorityId}`) — the storage *pattern* is proven, the *collection* doesn't exist.
- New logic in/alongside `resolveRouteStops`: fetch polygon-tagged areas, test route-path-vs-polygon intersection (point-in-polygon math is reusable from `LocationPicker.tsx:32-47` but needs a path-vs-polygon variant), then pick one lat/lng inside the polygon for the marker (nearest in-polygon route vertex, or centroid) — feeds into the existing `ResolvedRouteStop` shape unchanged. `mapParkToStop` and the downstream composer/dispatch stay untouched.

**(c) Complexity: medium.** All three foundational primitives (map click UI, GeoJSON Polygon Firestore field, point-in-polygon math) already exist and are directly extendable — not from scratch. But no actual drawing UI exists (new dependency + new editor component), a new collection/schema must be designed, and `resolveRouteStops` needs a genuinely new code path added alongside the point loop.

**(d)** Automated city-wide area scan flagged by David as a later idea — not estimated here.

---

## Summary (for quick reference — see chat for the delivered prose version)

**Post-Round-2 relative sizes: B (small) < A (medium) ≈ C (medium).** Both Round-1 "missing"
conclusions for A (questionnaire gate) and B (home location) were wrong — both already exist, live,
unflagged, and directly reusable. B is now almost pure curation work. A's remaining gaps are a new
Park category + a `legs/core`-only filter (both small-ish, no more "build a questionnaire system"
gap). C is unchanged from Round 1 — still needs a new drawing-tool dependency, a new collection, and
new route-matching logic, now with the added constraint that it must extend the existing
`LocationPicker.tsx`/`RouteEditor.tsx` surface rather than being a new tool, and should be designed
agent-writer-compatible from the start for the (unbuilt) future auto-scan idea.
