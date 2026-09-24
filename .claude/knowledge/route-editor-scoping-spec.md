# In-Panel Route Editor — Scoping Spec

**Status:** Spec only. No code written, no route data touched.
**29.08.2026 addendum (§9-10 below):** extended for the kickoff session that builds this — core
architecture decision carried through: the manual editor and a future **autonomous accuracy
agent** are the SAME engine with two drivers, both calling one core primitive (§3). §9 specs the
agent as the second consumer; §10 supersedes §8 (two of the original four questions are now
resolved by investigation, cited inline; new questions the agent design raises are added).
**Original status note (pre-29.08):** Written for a future dedicated implementation session
("the admin-UI chat") to build from.
**Grounded in:** the full Haifa route triage (77 live routes, 20 in the EDIT bucket) +
a codebase investigation of what already exists (§1 below). Every claim about existing code
cites file:line; anything not cited is a new-build recommendation, not a fact about current state.
**Author's note on scope:** the user's request has two layers — (a) an editor for the 20 EDIT
routes specifically, and (b) a general learning loop across ALL three panel decisions
(edit / reject / approve), so every route decision made in the panel — not just edits —
feeds future generator-quality improvements. Both are specified below; they share one data model.

---

## 1. What already exists (ground truth, not assumption)

A full investigation (not guesswork) found:

1. **No route-editing UI exists at all.** `src/features/admin/components/routes/RouteEditor.tsx`
   (752 lines, used at `/admin/routes/new` and `/admin/authority/routes/new`) is **creation-only**:
   click-to-draw waypoints → `fetchSnappedRoute` (Mapbox Directions API, line 92-109) builds one
   snapped segment per pair of clicks → segments accumulate. `handleUndo` (line 264-268) only pops
   the *last* segment — no arbitrary point deletion, no trim-from-either-end, no mid-route deletion,
   no drag-to-move. Save always calls `InventoryService.saveRoutes([route])` with a synthesized id
   (`manual-${activity}-${Date.now()}`, line 315) — always a **new** doc, never an update.
   `src/app/admin/authority/routes/[id]/edit/page.tsx` edits *metadata* (difficulty, name, etc.),
   never `path`. Nothing in the Approval Center touches geometry.
   **The click→Directions-snap segment-building primitive is real and reusable, but only as a
   "draw a replacement/connector segment" building block — everything else (trim, point-delete,
   stretch-delete, load-existing-geometry-for-editing) is new work.**

2. **`InventoryService.updateRoute` (inventory.service.ts:1266-1295) exists but silently drops
   `path`.** Its own doc comment: "Does NOT touch path geometry — only name, description,
   difficulty, activityType, etc." It destructures `path` out of the payload before writing
   (line 1268). **This is the single most important gap for this project**: the one existing
   update path for `official_routes` cannot save a geometry edit today. It also does not
   recompute `distance`/`elevationGain`/`maxGrade` — callers must supply already-computed values.
   It does call `buildValidatedDoc(..., {mode:'update'})` (line 1282-1289), and per the codebase's
   own grandfather clause (`validate.ts:82-104`, axioms.md §23) an **update is not required to
   carry `authorityId`/`city`** — already-set values just stay locked. This means editing an
   existing (already-authority-assigned) route is not blocked by that rule.

3. **DEM/elevation recompute is already a reusable, environment-agnostic utility** —
   `src/lib/dem-tile-cache/dem-sampling.service.ts` exports `computeDemProfile(pathLatLng, tiles,
   zoom)` → `{elevationGainM, maxGradePercent}`, explicitly built (per its own header) as a
   verified-equivalent port of `geo-discovery-routes.ts`'s private `elevAt`/`demProfile`, for
   exactly this kind of second-consumer reuse. Tile loading has both a browser-safe client
   (`dem-tile-cache-client.ts`, reads pre-decoded JSON from Firebase Storage) and an Admin-SDK
   Node loader (`dem-tile-cache-admin.node.ts`). **No DEM-decode porting is needed** — this is a
   straight import.

4. **The Approval Center has zero partial-edit action today** — only approve / reject / archive /
   bulk-approve / bulk-reject (`page.tsx:344,356,474,491`, `moderation.service.ts`,
   `InventoryService.approveRoute`/`bulkApproveRoutes`). It never calls `updateRoute`. The editor
   is 100% new UI surface, not an extension of an existing button.

5. **`official_routes.source` has no `sourceWayIds` field in the canonical `Route` type**
   (`route.types.ts:319-534`) — only `source.externalId`. `sourceWayIds` is written by
   `geo-discovery-routes.ts` only for *stitched* candidates and survives only because the write
   schema uses zod `.passthrough()` (`schemas.ts`). **This means way-ID-based blocklisting (§4)
   cannot rely on every doc having it** — confirmed independently earlier this session (the
   "sourceWayIds absent on single-way docs" bug from the recreational-quality audit). The
   blocklist must key on **geometry**, not way-ID lookups on the route doc.

6. **Two existing log/audit patterns to build on, not duplicate:**
   - `edit_requests` (`edit-requests.service.ts:29-47`): a *propose → approve/reject* workflow
     with `originalData`/`newData` before/after snapshots, used for Authority-Manager-initiated
     changes needing super-admin review. **Not the right fit for David editing directly** (he has
     authority to edit outright) — but its before/after snapshot shape is a good pattern to borrow.
   - `audit_logs` (`audit.service.ts` + `audit-log.type.ts:39-79`): every existing route-mutating
     action (approve/reject/bulk) already calls `logAction()` → a Cloud Function writes
     `{adminId, actionType, targetEntity:'Route', targetId, oldValue, newValue, sourceIp,
     timestamp}` server-side (client can't forge `adminId`/`sourceIp`/`timestamp` — direct writes
     to `/audit_logs` are rules-blocked). **Every new route-decision action this spec adds should
     also call `logAction()`**, for consistency with every other admin action — but `audit_logs`'
     generic JSON-blob `oldValue`/`newValue` isn't shaped for the aggregation/mining requirement
     (§5-6), so a **new, purpose-built collection** is still needed alongside it (dual-write: the
     new structured collection for mining, `audit_logs` for the general admin trail).

---

## 2. What the 20 EDIT routes actually need (grounds the operation list)

From the [Haifa Route Triage](https://claude.ai/code/artifact/7fca48a4-ff5f-4370-92e1-df6f8d581b6b)
(published artifact), the 20 EDIT-bucket routes split into three real patterns — not hypothetical:

| Pattern | Count | Examples | Operation needed |
|---|---|---|---|
| Clean tail at one or both ends | 12 | הקפת פארק הלוחם היהודי, נחל עובדיה, ואדי ראש-מיה, שביל רמת אלון, הקפת גן המייסדים | **Trim from either end** |
| Moderate composition, no clean end-trim (bad content likely mid-route) | 6 | שביל חיפה - הדר הכרמל (1219m), המעונות, היער, הקפת גן קיסלק, טיילת לואי, שביל מסומן חיפה (1183m) | **Delete an inset/mid-route stretch** |
| Owner-confirmed inset bad content the algorithm's end-trim can't see | 1 | טיילת אריה גוראל (real seafront + a street-comb end that doesn't touch the literal endpoint) | **Delete an inset stretch** |
| — | 1 | (overlap between the above categories) | — |

Concretely: **טיילת לואי** is a 7-way stitched candidate
(`osm:stitched/35014061+305096491+308348907+325283597+488111113+488111120+1470987339`), and the
one confirmed-sidewalk way (`325283597`, `footway=sidewalk`) is the **4th of 7** — literally the
middle of the sequence, not an end. Deleting it leaves a real gap between way 3 and way 5 that
must be re-joined, not just trimmed away. This is the load-bearing example for why trim-only
tooling is insufficient — a third of the EDIT bucket needs true mid-route surgery.

**Conclusion: the editor needs one core primitive — select a contiguous range of path points and
delete it — used three ways:**
1. Range touches the start → **trim start**
2. Range touches the end → **trim end**
3. Range is fully inset → **delete mid-route stretch** (may leave a gap needing reconnection — see §3.3)

"Delete individual points" is the same primitive at range-length 1 (e.g. removing one bad GPS/OSM
vertex without touching the surrounding shape) — no separate mechanism needed.

---

## 3. Editing operations spec

### 3.1 Load an existing route for editing

**New work, no existing precedent.** Given a `routeId`, fetch the doc, decode `path` (stored as
`{lat,lng}[]` per `schemas.ts:30-34` — convert to whatever in-memory form the map layer needs),
render it on the map as an editable polyline with each vertex as a draggable/selectable point.
Recommend building this as a new mode on `RouteEditor.tsx` (an optional `editRouteId` prop) rather
than a parallel component — it already owns the map, the Mapbox Directions integration, and the
save-to-`InventoryService` wiring; teaching it to *load* a path before editing is additive to what
it already does, not a rewrite.

### 3.2 Trim from either end

Select a contiguous run of points from the start or end, delete it. This is mechanically the
*easiest* op and — bonus — the exact same "predominantly-bad-prefix/suffix" logic already built
and validated in `scripts/_haifa-full-triage.ts` (`longestBadPrefix`/`longestBadSuffix`) can
pre-select a **suggested** trim range for the editor to show as a one-click default, which the
admin can accept, adjust, or ignore. Recommend porting that logic (not the whole triage script,
just the two functions + the per-point sidewalk/ordinary/dedicated classification it depends on)
into a shared `src/lib/route-collections/` (or similar) module so both the discovery script and
the editor call the same, already-validated classification — not two independent reimplementations
that could drift.

### 3.3 Delete an inset (mid-route) stretch

Select a contiguous run of points anywhere in the middle, delete it. Two sub-cases:

- **The two now-adjacent endpoints are already close** (say <60m, matching the file's own
  `LOOP_CLOSE_M`/gap-tolerance precedent in `geo-discovery-routes.ts`) — just splice, no bridge
  needed.
- **They're far apart** (e.g., removing way 325283597 from Louis Promenade splits the route into
  two disconnected pieces) — **recommend auto-bridging with a Directions-API-snapped connector**,
  reusing `RouteEditor.tsx`'s existing `fetchSnappedRoute` primitive (line 92-109) to draw a real
  walkable connection between the two cut ends. This mirrors the discovery script's own
  "unnamed bridge connector" concept (pass-2 bridge merging) — the same problem, solved the same
  way, just triggered by a human's delete instead of an automated stitch. Fall back to leaving a
  manual gap (with a clear warning) if no walkable connector is found within a reasonable radius.

### 3.4 Delete individual points

Same primitive as 3.2/3.3 at a range length of 1 — no separate implementation.

### 3.5 Save flow

On save, the editor must:

1. **Recompute `distance`** — straightforward haversine sum over the new `path` (the same
   `pathLen`/`hav` pattern used everywhere else in this codebase).
2. **Recompute `elevationGain`/`maxGrade`** — call `computeDemProfile()` from
   `dem-sampling.service.ts` (§1.3) with the new path + cached DEM tiles. No new DEM logic needed.
3. **`duration`** — check how the create-flow (`RouteEditor.tsx`) currently derives this (likely a
   pace-based estimate off `distance`) and reuse the same formula so an edited route's duration
   stays consistent with a freshly-created one.
4. **`difficulty`** — re-derive from the new `elevationGain`/`maxGrade`/`distance` using whatever
   rule the create-flow already uses (confirm exact thresholds during implementation — not found
   in this investigation pass, worth one targeted look before coding).
5. **Preserve the doc ID and moderation state** — this must be a true **edit-in-place**
   (`updateRoute`-style), never delete-and-recreate. Recreating would generate a new random doc ID,
   breaking every downstream reference (`street_segments.officialRouteId`, `route_adjacency`,
   `curated_routes`, `workouts.routeId`, etc. — the full reference set already enumerated and
   checked repeatedly this session). `status`/`published` must carry over unchanged — editing a
   route must never silently re-publish or un-publish it.
6. **Write via a *modified* `updateRoute`**, not a new parallel write path. Recommend adding an
   explicit `allowPathUpdate: boolean` (default `false`) parameter to `updateRoute` — when `true`,
   don't strip `path` from the payload before calling `buildValidatedDoc`. Keeping the strip as the
   *default* preserves every existing caller's current (correct) behavior; only the new editor
   opts in. This is a small, explicit, single-purpose change to a well-understood function — safer
   than a second method that duplicates `updateRoute`'s validation/authority-locking logic.
7. **If a live/published, broadcast route is being edited** (recall from the sidewalk-gate cleanup
   this session: `טיילת חולדה גורביץ'` is `published:true` with 33 live `street_segments`
   references) — an edit to a *published* route's geometry needs the **same broadcast-refresh**
   that `InventoryService.approveRoute` already performs on first publish (recompute/rewrite the
   affected `street_segments` + `route_adjacency` entries), or the live generator will keep serving
   the old geometry. Confirm the exact broadcast mechanism (`approveRoute`'s implementation) before
   building this — not fully traced in this investigation pass.

---

## 4. Per-city bad-segment blocklist

**Goal:** once a human removes a segment from a route (or rejects a whole route), the *next*
discovery run for that city should not silently regenerate it.

**Key design constraint (from §1.5):** cannot key on OSM way ID reliably — `sourceWayIds` isn't
guaranteed present, and even when present, an OSM way's ID is stable but a *stitched* candidate's
constituent-way list can shift between discovery runs (this session's `stitchWithIds` is
documented as "input-order-sensitive, Overpass mirror response order isn't guaranteed stable
run-to-run" — `geo-discovery-routes.ts`'s own comment). **Key on geometry instead**: store the
removed segment's own polyline (or a bounding box + a representative point sequence), and at
discovery time, reject a *new* candidate if a large enough fraction of its length runs within a
small tolerance (e.g. reuse `SIDEWALK_PROXIMITY_M`-scale, ~15-20m) of a blocklisted polyline.

**Proposed collection: `city_route_blocklist/{authorityId}`** (one doc per city, matching the
existing per-city-doc pattern elsewhere in this codebase), containing an array of entries:

```
{
  entries: [
    {
      id: string,              // stable id for this blocklist entry (uuid)
      polyline: {lat,lng}[],   // the removed segment's own geometry
      addedAt: Timestamp,
      addedBy: string,         // admin uid
      sourceRouteId: string,   // which route this was cut from
      reason: string,          // free text or the same category enum as §5
      wayIdsHint?: number[],   // best-effort, NOT authoritative — only used as a fast-path check when present
    }, ...
  ]
}
```

**Consumption point in `geo-discovery-routes.ts`**: a new pre-filter step, run once per candidate
(both named-segment and trail-relation candidates, same place the recreational-quality gate
already runs), checking the candidate's path against the region's blocklist entries using the
existing `pointToSegDistAndFrac` proximity primitive. This is additive — does not touch the
sidewalk/majority gate logic shipped this session, sits as one more independent filter alongside it.

---

## 5. Edit-log data model (the learning loop, all three decision types)

Per the extended scope, every panel route decision — not just edits — should feed one shared,
mineable log. **Proposed new collection: `route_decisions`.**

```ts
interface RouteDecision {
  id: string;                      // auto
  routeId: string;
  routeName: string;
  city: string;
  authorityId: string;
  decisionType: 'edit' | 'reject' | 'approve';
  decidedBy: string;                // admin uid
  decidedAt: Timestamp;

  // Composition snapshot AT DECISION TIME — same 4-way breakdown as the triage table,
  // computed via the same shared sidewalk-detector module recommended in §3.2.
  compositionSnapshot: {
    genuinePct: number;
    sidewalkPct: number;
    ordinaryPct: number;
    otherPct: number;
    lengthM: number;
    type: 'named segment' | 'trail' | 'park loop' | 'other loop' | 'cycling';
  };

  // 'edit' only — what was actually removed.
  editDetail?: {
    removedRanges: Array<{
      startIdx: number; endIdx: number;          // index into the OLD path
      lengthM: number;
      wayIdsHint?: number[];                       // best-effort, not authoritative (see §4)
      wayTagsHint?: Array<{ highway?: string; footway?: string; is_sidepath?: string }>;
    }>;
    editKind: 'trim-start' | 'trim-end' | 'delete-inset' | 'delete-point';
    reasonCategory?: 'sidewalk' | 'street-comb' | 'detour' | 'other';
    reasonNote?: string;
    blocklistEntryIds: string[];                   // ids written to city_route_blocklist by this edit
  };

  // 'reject' only — the strongest negative signal, logs the FULL route's composition
  // (already captured above in compositionSnapshot) plus why.
  rejectDetail?: {
    reasonCategory?: 'sidewalk' | 'street-comb' | 'detour' | 'too-short' | 'not-recreational' | 'other';
    reasonNote?: string;
  };

  // 'approve' — no extra detail needed; compositionSnapshot alone is the positive exemplar.
}
```

**Naming reconciliation (resolved 30.08.2026, quality-certificate v1 Stage 2):** `genuinePct` above
is now the SHIPPED, PERSISTED field name — `Route.qualitySignals.composition.genuinePct` on every
`official_routes`/`curated_routes` doc (schema: `route.types.ts`, `RouteFieldsSchema` in
`src/lib/route-collections/schemas.ts`), computed by `scripts/lib/route-composition-classify.ts`.
An earlier draft of that module used `dedicatedPct` for the same concept before this doc was
checked — renamed to match `genuinePct` here, since this spec (and the underlying classifier's own
`isGenuineRecreationalWay`/`trailGenuineLen` naming in `geo-discovery-routes.ts`) predates it. When
`route_decisions`/`compositionSnapshot` above gets built, it should read the SAME persisted
`genuinePct` value at decision time rather than recomputing independently — one field name, one
source of truth, no drift.

Every write here should **also** call the existing `logAction()` (`audit.service.ts`) with
`targetEntity:'Route'`, for consistency with every other admin mutation in the panel — this
collection is the mining-optimized structured record; `audit_logs` stays the general trail.

**UI requirement this implies:** the Approval Center's approve/reject actions (§1.4) need a small
addition — a reason-category picker (optional, but encouraged) at the moment of reject, and the
edit flow (§3) needs the same at save time. Both are lightweight additions to existing/new flows,
not new screens.

---

## 6. Pattern-mining step

**Goal:** periodically turn `route_decisions` into candidate NEW generator-gate rules — the exact
manual loop run all session (owner spots a problem → becomes a codified rule in
`geo-discovery-routes.ts`), now fed by real accumulated data instead of one-off investigations.

**Proposed as a script, not a live service, to start** (`scripts/mine-route-decisions.ts` or
similar) — run manually or on a simple cron, not real-time:

1. **Reason/tag frequency** — for `edit` decisions, aggregate `editDetail.reasonCategory` and
   `wayTagsHint` across all cities: which tag combinations get removed most often? (e.g., if
   `footway=sidewalk` dominates edit removals, that's already-closed by this session's fix — but a
   *new* pattern, like `highway=track` near roads, would surface here before anyone manually
   noticed it.)
2. **Reject composition clustering** — for `reject` decisions, look at the `compositionSnapshot`
   distribution: **"rejected routes cluster above X% sidewalk" or "below Y% genuine" directly
   proposes a threshold** the current gate isn't yet enforcing, or should tighten. This is the
   most direct feed into "the gate is still too loose here."
2b. **Approve composition floor** — symmetrically, the *lowest* `genuinePct` among `approve`
   decisions is a soft lower bound sanity-check against the reject cluster — if they overlap, the
   gate boundary is ambiguous and needs a human look, not an automated threshold change.
3. **Output**: a human-readable report (markdown or the same JSON-dump-to-artifact pattern used
   throughout this session), listing candidate rule changes with supporting counts — **never
   auto-applied**. Every gate change this session went through explicit read-only investigation →
   proposed rule → dry-run → explicit "GO" from David; the mining step's job is to *surface*
   candidates for that same review cycle, not to skip it.

---

## 7. Suggested build phases

1. **Phase 0 — `updateRoute` path-write gap.** Add the `allowPathUpdate` flag (§3.5.6). Smallest,
   most foundational change; nothing else in this spec works without it.
   **✅ IMPLEMENTED 29.08.2026** — commit `d991efd0`, branch `feat/route-editor-engine`. Unpushed.
2. **Phase 1 — Load + trim.** Editor loads an existing route (§3.1), supports trim-from-either-end
   only (§3.2, reusing the triage script's already-validated trim logic), full save flow (§3.5).
   Covers 12 of the 20 EDIT routes end-to-end.
   **✅ IMPLEMENTED 29.08.2026** — commit `fc850b5a`, same branch. Unpushed, not yet visually
   smoke-tested (axioms.md §11 forbids running the dev server from this agent — David should
   verify on his running dev server). Two real deviations from this section's literal text, both
   explained in the commit message: (a) built as `applySafeGeometryEdit()` in a new
   `route-geometry-edit.service.ts`, NOT inline in `RouteEditor.tsx` — landed on the existing
   `admin/authority/routes/[id]/edit` metadata-edit page instead of a new `RouteEditor.tsx` mode,
   after reading that component in full and finding its click-to-draw state machine shares almost
   nothing with select-a-range-on-an-existing-path; (b) the triage script's trim-suggestion logic
   (`longestBadPrefix`/`longestBadSuffix`) was NOT ported — it's coupled to a live, whole-city
   Overpass OSM fetch (§9.1's own finding) that doesn't belong running inline in an admin page load;
   Phase 1 ships pure **manual** trim (slider-driven), no auto-suggested starting range. Porting the
   pure decision algorithm (decoupled from live OSM classification) is a clean, deferred fast-follow
   whenever the auto-suggestion convenience is actually wanted.
3. **Phase 2 — Inset deletion + reconnection.** Adds mid-route stretch/point deletion (§3.3),
   including the Directions-snap auto-bridge. Covers the remaining EDIT routes (טיילת לואי,
   אריה גוראל, etc.).
4. **Phase 3 — Learning loop.** `route_decisions` collection + writes from edit/reject/approve
   (§5), `city_route_blocklist` + discovery-script consumption (§4).
5. **Phase 4 — Mining.** The aggregation script (§6), run manually first; promote to scheduled
   once the report format is validated against a real batch of accumulated decisions.

Phases 0-2 alone deliver the editor David asked to size. Phases 3-4 deliver the learning loop,
which was called out as required, not optional — but can land as a fast-follow once the editor
itself is proven on real edits.

**29.08.2026 addendum — Phase 5.** The autonomous accuracy agent (§9) is a new phase, not a
replacement for any of the above — it is a second *driver* of the same §3 primitive, so it can
only start once that primitive exists (Phase 0-2). Sequenced last because it also depends on §9.1's
detector-completeness question (§10 Q2) landing first; unlike Phases 0-2, it is not blocked on
anything *within* this spec, only on an external branch.

---

## 8. Open questions for David before implementation starts

**29.08.2026 update: Q2 and Q3 below are RESOLVED by this session's investigation — kept here
with their answers inline (struck the "confirm before Phase 1" framing) so the history stays
readable. Q1 and Q4 are still genuinely open. See §10 for the full current question list
(supersedes this section as the thing to actually answer) — §10 also folds in new questions the
accuracy-agent design raises.**

1. Should a **published, broadcast route's** geometry be editable directly, or should editing a
   published route force it back to `pending` for re-approval first? (§3.5.7 flags the broadcast-
   refresh gap either way — this is a policy question, not just a technical one.) **Still open —
   see §10 Q1**, now sharpened by a concrete bug found in the broadcast mechanism itself (§9.5).
2. ~~Confirm the exact `duration`/`difficulty` derivation formula~~ **RESOLVED.** `duration` in
   `RouteEditor.tsx`'s create flow (line 307-309) is a flat pace estimate:
   `round(totalDistanceKm * paceMinPerKm)`, `paceMinPerKm` = 3 (cycling) / 6 (running) / 12
   (walking) — reuse this formula verbatim for edits, keyed off the route's `activityType`.
   `difficulty` in the create flow is **not derived at all** — it's a manual 3-way picker
   (`useState<'easy'|'medium'|'hard'>`, line 178), never computed from geometry. The real formula
   the spec's §3.5.4 was looking for lives elsewhere: `route-difficulty.service.ts`'s
   `computeDifficulty(elevationGain, maxGrade, distanceKm)` → `difficultyLevelToRouteDifficulty()`
   — a pure, already-shipped Stage 5 utility (route-enrichment-pipeline plan, 17.08.2026) built
   for exactly this kind of second-consumer reuse. **Use this service for edit-flow difficulty,
   not RouteEditor.tsx's picker** — the picker is a human-authoring convenience for brand-new
   routes with no elevation data yet; an edit already has (or is recomputing, per §3.5.2) real
   `elevationGain`/`maxGrade` to feed the real formula.
3. ~~Confirm `approveRoute`'s exact broadcast mechanism~~ **RESOLVED.**
   `InventoryService.approveRoute` (inventory.service.ts:1322-1356) on publish calls, in order:
   `broadcastRouteToStreetSegments(route)` (fire-and-forget, non-fatal on failure) →
   `recomputeAdjacencyForCities([route.city])` (gated on `IS_ROUTE_ADJACENCY_ENABLED`) →
   `recomputeEnrichmentForCities([route.city])` (gated on `IS_ROUTE_ENRICHMENT_ORCHESTRATOR_ENABLED`).
   `rejectRoute` (line 1361) does the inverse: `deleteOfficialRouteSegments(routeId)` + the same
   two recomputes. **But this surfaced a real bug relevant to editing a published route**, not
   just a mechanism to confirm — see §9.5's broadcast-refresh note. The mechanism is confirmed;
   whether it's *safe to reuse as-is* for a geometry edit is not — that's now part of §10 Q1.
4. Blocklist granularity (§4): city-level (`authorityId`) as proposed, or finer (per-neighborhood,
   per park-neighborhood-model per `[[park-neighborhood-model]]`)? City-level is the simpler
   default and matches how discovery itself is already scoped. **Still open — see §10 Q7.**

---

## 9. The autonomous accuracy agent — second consumer of the safe-edit primitive

### 9.1 Ground truth on the detectors this agent would run (investigated 29.08.2026, not assumed)

The kickoff for this build named three detectors the agent should run: sidewalk, recreational-
quality, park-loop walkability, plus the trim logic. Investigation found a **split state that
matters for sequencing**, not the clean "existing detectors" picture the kickoff assumed:

- **On `main` right now** (as of commit `7eaab8ca`, which landed *during this investigation* —
  main is moving under this work, see the caution below): `scripts/geo-discovery-routes.ts` has a
  working sidewalk detector (`isSidewalkLikeWay()`, line 554, wired into the gate at line ~600
  with a trail-bonus interaction whose "don't let the trail-bonus rescue a confirmed sidewalk"
  fix just landed) and a "specialness"/recreational-quality gate (MIN_PARK_AREA_M2 threshold +
  coastline signal, ~line 1127-1150) plus park-loop candidate building
  (`buildParkLoopCandidate(s)`, lines 1392/1477).
- **NOT on `main`, only on the unmerged branch `post-merge-dryrun-verification`** (worktree
  `.claude/worktrees/route-enrichment-stage-0`, last commit `ff2ad195`, 27.08.2026 — 2 days old,
  actively in flight): the park-loop gate-set **correction** ("correct the park-loop gate-set per
  drop-audit findings", "rebuild park loops from a real walkable-way graph") and a further
  trail-bonus fix on top of what just landed. In plain terms: **main's park-loop walkability
  detector is a known-pre-fix version** per that branch's own commit messages — the branch exists
  specifically because the version now on main was found to have gate-set bugs.
- **NOT on `main` at all, no unmerged branch either — genuinely missing**: the trim-suggestion
  logic (`longestBadPrefix`/`longestBadSuffix` + the per-point classification they depend on).
  It lives only in `scripts/_haifa-full-triage.ts`, which itself only exists on the
  `route-enrichment-stage-0` worktree (confirmed via `git show main:scripts/_haifa-full-triage.ts`
  → missing). §3.2's recommendation to port these two functions into a shared
  `src/lib/route-collections/` module is therefore a **prerequisite build step for this agent**,
  not a "nice to have already sitting on main" — this was already true when the original spec was
  written, restated here because the agent depends on it directly (§9.3 below) and the kickoff's
  phrasing implied it might already be reusable as-is.

**Caution for whoever implements this**: main was observed to change mid-investigation (a route
gate fix landed while this session was reading the file). Treat every file:line citation above as
a snapshot, not a promise — re-grep before writing agent code against it, don't trust this
paragraph's line numbers blindly by then.

### 9.2 Architecture: one primitive, two drivers

No new geometry-mutation code path. The agent is a **script/service that decides *what* range to
delete and *why*, then hands off to the exact same safe-edit primitive the manual editor calls**
(§3.5: delete-range → reconnect if needed → recompute distance/elevation/grade/duration/difficulty
→ preserve doc ID + moderation status → write via `updateRoute(..., {allowPathUpdate: true})` →
log). Concretely, this means the primitive should be built as one function —

```ts
// proposed shape, src/features/parks/core/services/route-geometry-edit.service.ts (new file)
async function applySafeGeometryEdit(
  routeId: string,
  removedRanges: Array<{ startIdx: number; endIdx: number }>,
  ctx: { initiatedBy: 'owner' | 'agent'; decidedBy: string; editKind: RouteDecision['editDetail']['editKind']; reasonCategory?: string },
): Promise<{ ok: true; newDistance: number; newDifficulty: string } | { ok: false; reason: string }>
```

— that both the manual editor's save handler and the agent's auto-fix path call with the same
signature, differing only in `ctx.initiatedBy`/`decidedBy` (a human uid vs. a fixed sentinel like
`'system:accuracy-agent'`) and in how the `removedRanges` argument gets computed upstream (a human
dragging a selection on the map vs. the agent's detector output, §9.3).

### 9.3 Agent pipeline

Per route, per city (batched, one city at a time — matching how discovery itself is scoped, §10
Q7):

1. **Load** the route's current `path` (§3.1's load logic, reused as-is).
2. **Run detectors** over the path: sidewalk (§9.1), recreational-quality/specialness, park-loop
   walkability (only for `routeShape`-classified loop routes touching a park ring). Each detector
   produces the same 4-way composition breakdown already defined in §5's `compositionSnapshot`
   (genuinePct/sidewalkPct/ordinaryPct/otherPct) plus, where a detector fires, the flagged index
   range(s) in the path.
3. **Classify each flagged range** using §2's own taxonomy — touches start/end → trim; fully
   inset → delete-mid (requiring §3.3's reconnection logic, itself reusing
   `RouteEditor.tsx`'s `fetchSnappedRoute`).
4. **Score confidence** (§9.4) per flagged range.
5. **Decide**: auto-fix (call `applySafeGeometryEdit` directly, `initiatedBy: 'agent'`) vs.
   escalate (§9.6) vs. no action (composition clean, nothing flagged).
6. **Log** every route touched — including "no action" routes, so the mining step (§6) has a
   complete denominator, not just a log of interventions — to `route_decisions` with the new
   `initiatedBy` field (§9.7).

### 9.4 Confidence thresholds — proposed defaults, David's numbers to confirm (§10 Q3)

Grounded in the same signals §2's triage table already used, not invented fresh:

| Condition (ALL must hold for auto-fix) | Proposed default | Why this signal |
|---|---|---|
| Range classification | trim-start or trim-end only — **never** auto-fix a delete-inset | §2: trim was the *validated, already-shipped-logic* 12/20 case; inset-delete needs a bridge whose walkability isn't guaranteed (§3.3's own "fall back to leaving a manual gap with a warning" acknowledges this) |
| Bad-range composition | `sidewalkPct + ordinaryPct` in the flagged range ≥ **90%** | Mirrors the triage's own bucketing; a range that's 90%+ confidently-bad-by-detector is the same bar the triage used to call something "clean trim" |
| Removed length vs. total route length | ≤ **35%** of total route distance | Guards against a technically-valid-but-route-gutting trim; no precedent value exists for this one — genuinely a new number, flag prominently for David |
| Route status | **not currently `published`** (i.e., still `pending`) | Defers into the broadcast-refresh gap found in §9.5 — auto-editing a live, broadcast route without fixing that gap first risks silently stale `street_segments` |
| Route type | **not park-loop** | §9.1: main's park-loop walkability detector is a pre-fix version by the unmerged branch's own admission — don't let an unattended agent auto-fix off a detector its own authors are actively correcting |

Anything not meeting all five conditions escalates (§9.6) rather than silently doing nothing —
every detector-flagged range gets *some* record, never a dropped signal.

### 9.5 A concrete bug this design surfaces (not hypothetical — worth fixing before Phase 5 ships)

`broadcastRouteToStreetSegments` (official-route-broadcaster.ts:34-38) writes deterministic doc
ids `official_${routeId}_seg_${idx}` — re-broadcasting the same route **overwrites** matching
indices, which the file's own comment calls idempotent. That's true only when the new path has
**the same or more** segments than the old one. **A trim or inset-delete edit produces *fewer*
segments** — indices beyond the new count are never touched by the overwrite, so they survive as
stale ghost segments still referencing geometry the route no longer has. This only matters for
`published` routes (§9.4 already excludes them from agent auto-fix for exactly this reason) — but
the manual editor (§3, Phase 1-2) has no such exclusion today and needs it fixed before published-
route editing ships, agent or human. Concretely: any edit-save path that re-broadcasts must first
call `deleteOfficialRouteSegments(routeId)` (already exists, used by `rejectRoute`) before
re-broadcasting, not rely on the overwrite alone.

### 9.6 Escalation — output shape and open design question

**What gets escalated**: any detector-flagged range that fails one of §9.4's five conditions.
**Where it goes** is a genuine open question (§10 Q4), not decided here — two real options,
grounded in what's actually in the codebase today, not two hypothetical designs:

- **Reuse `edit_requests`** (edit-requests.service.ts) — its shape (`originalData`/`newData`
  snapshot, `pending`/`approved`/`rejected`, `reviewedBy`/`reviewNote`) already fits an edit
  proposal, and `EditRequestEntityType` already includes `'route'` (line 27) — looks like
  ready-made prior art. **But investigation found it isn't actually free**: `approveEditRequest`'s
  route branch (line 263-281) does a **raw `batch.update(doc('official_routes', id), {...newData,
  contentStatus: 'published', ...})`** — no `buildValidatedDoc` chokepoint, no recompute, no
  broadcast-refresh, and it sets `contentStatus` (a `parks`-collection field) rather than
  `official_routes`' own `status`/`published` booleans, which looks like a pre-existing latent bug
  independent of this project. Reusing this collection for agent escalations would need
  `approveEditRequest`'s route branch rewritten to call `applySafeGeometryEdit` (§9.2) instead of
  the raw batch write — not a drop-in reuse, a real code change to existing, already-shipped logic.
  **Also found: this approve/reject path has zero UI callers anywhere in the app today**
  (`grep` for `approveEditRequest`/`rejectEditRequest`/`getEditRequests` across `src/` finds only
  the service file itself) — only `createEditRequest` is called (from `parks.service.ts`, for
  Authority-Manager park edits). So "reuse edit_requests" would not, in practice, hand this build
  a working review screen for free — one needs building either way.
- **Purpose-built escalation queue**, e.g. a `pendingAgentReview: true` flag directly on
  `route_decisions` docs (§5/§9.7) with a dedicated new Approval-Center tab. Keeps agent
  escalations visibly separate from human Authority-Manager park/climb requests (arguably a
  clearer mental model for David reviewing them) at the cost of a second, parallel review surface
  instead of consolidating onto one.

This build makes no call between these two — flagged for David as §10 Q4.

### 9.7 Extending the §5 data model (additive, not a redesign)

One new field on `RouteDecision` (§5): `initiatedBy: 'owner' | 'agent'` (default `'owner'` — every
existing/manual decision path is unaffected). No new `decisionType` values needed — an
agent auto-fix logs as a normal `'edit'` decision with `initiatedBy: 'agent'`,
`decidedBy: 'system:accuracy-agent'`; an escalated-then-owner-approved edit logs at the moment the
owner actually decides (not at proposal time), same as any other edit, with `initiatedBy: 'agent'`
still set so the mining step (§6) can separate "agent proposed, owner confirmed" from "owner
initiated" in its pattern analysis — that split is itself a useful mining signal (are agent
proposals getting approved at a meaningfully different composition profile than owner-initiated
edits? that would suggest the confidence thresholds in §9.4 are miscalibrated in a specific,
correctable direction).

---

## 10. Full current open-question list (29.08.2026) — answer before implementation resumes

**ANSWERED by David, 29.08.2026 — recorded here, binding for implementation:**

| # | Question | David's answer |
|---|---|---|
| 1 | Published-route geometry edits | **Force back to `pending`** on any geometry edit — sidesteps the §9.5 broadcast bug by re-running `approveRoute`'s normal full broadcast on re-approval. No fix to the broadcast mechanism itself required before Phase 1-2 ships. |
| 2 | Wait for `post-merge-dryrun-verification` to merge before Phase 5? | **No — start now, accept the gap.** Park-loop routes already escalate rather than auto-fix (§9.4), so the known park-loop detector bug doesn't block agent auto-fixes on the other detectors. |
| 3 | Confidence-threshold numbers (§9.4) | **Accept proposed defaults** — 90% bad-composition bar, 35% max-removed-length guard. Revisit once real agent decisions accumulate in `route_decisions`. |
| 4 | Escalation destination (§9.6) | **Purpose-built queue** — `pendingAgentReview` flag on `route_decisions` docs + a new dedicated Approval-Center tab. `edit_requests` is NOT reused (its route-approval branch stays as-is, out of scope). |
| 5 | Agent trigger/cadence | **Manual run only, for now** — same posture as §6's mining script; promote to scheduled later, once trusted. |
| 6 | Agent v1 scope | **Haifa only** — validate against the real 77-route triage baseline before expanding. |
| 7 | Blocklist granularity (§4) | **City-level** (`authorityId`), as originally proposed. |

**Implication for the build sequence**: decision #1 means Phase 1-2 (manual editor) does NOT need
§9.5's broadcast-refresh fix as a prerequisite — editing a published route un-publishes it first,
so the stale-ghost-segment bug never triggers via the edit path (it would still need fixing
separately if anything else re-broadcasts a shortened path, but that's now out of this build's
critical path). Decision #4 means §9.6's "reuse edit_requests" option and the `approveEditRequest`
route-branch bug are **not** being fixed as part of this build — noted for awareness only, not
a task here.

Original plain-list questions, kept below for the reasoning/options each answer was chosen from:

1. **Published-route geometry edits** (carried from original §8 Q1, sharpened by §9.5): should a
   `published`/broadcast route ever be directly geometry-edited (by owner or agent), given the
   broadcast-refresh bug §9.5 found (stale ghost `street_segments` when an edit shortens the
   route)? Options: (a) block editing published routes entirely until §9.5's fix ships, (b) allow
   it but only after §9.5's fix ships, (c) force published routes back to `pending` on any
   geometry edit (re-approval required, sidesteps the broadcast question by re-running the normal
   approve-time broadcast). Phase 1-2 (the manual editor) is blocked on this answer for any
   already-published route; Phase 5 (agent) already defaults to excluding published routes
   regardless (§9.4), so the agent isn't blocked on it, only the manual editor's full scope is.
2. **Does `route-enrichment-stage-0` / branch `post-merge-dryrun-verification` need to merge to
   `main` before Phase 5 starts**, or should the agent's detector calls be built against whatever
   is on `main` at agent-build time, accepting the known park-loop gate-set bugs (§9.1) until that
   branch lands separately? This branch is not part of this build (out of scope to merge it here)
   but Phase 5 directly depends on its content.
3. **Confidence-threshold numbers** (§9.4): confirm or override the five proposed conditions —
   in particular the 90% bad-composition bar and the 35% max-removed-length guard, both of which
   are new numbers with no prior precedent in this codebase (unlike the trim-logic reuse, which
   at least inherits validated behavior from the triage script).
4. **Escalation destination** (§9.6): reuse `edit_requests` (needs `approveEditRequest`'s route
   branch rewritten to call the safe-edit primitive instead of its current raw, unvalidated
   `batch.update` — a real fix, not free reuse) with a new review UI built for it either way since
   none exists today — or a purpose-built `route_decisions`-based escalation queue, kept fully
   separate from Authority-Manager park/climb requests?
5. **Agent trigger/cadence**: manual one-off run (matching how §6's mining script is scoped — "run
   manually first, promote to scheduled once validated") or wired to a schedule from the start?
   If scheduled, per-city or all-cities-per-run, and how often?
6. **Agent scope for v1**: all cities, or start on Haifa only (the one city with a real triage
   baseline to compare the agent's decisions against, per §2)?
7. **Blocklist granularity** (carried from original §8 Q4): city-level (`authorityId`) as
   proposed in §4, or finer-grained (per-neighborhood, per `[[park-neighborhood-model]]`)?
