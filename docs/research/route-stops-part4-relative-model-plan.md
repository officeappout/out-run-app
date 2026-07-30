# Route-Stops §7.3 Part 4 — the "Plan-From-Here" Model (PLAN)

> **Status: PLANNED — no code.** Replaces the interim "cooldown-last" pin-relocation
> (`composeRouteStopsWorkout`, `start-hybrid-session.ts`, behind `MAP_ROUTE_STOPS_V1`).
> **Do NOT build until the open-bug audit clears** — now effectively a **single** gate: the
> recovery-card + double-count work is consolidated into **one audit**, and the folded item is
> confirmed *during* that mapping (not a separate gate). The interim patch stays active behind the
> flag until then.
> Basis: read-only investigation 2026-07-30 (entry / directionality / geometry source).

**The model in one line:** a **fixed canonical route** (the reference) feeds a **dynamic
"plan-from-here" engine** parameterized by *(entry, direction, topology)*, which serves **both**
"start now from my location" **and** (future) "recalc the rest from here after a deviation".

---

## Principle 1 — Two layers: canonical (fixed) vs session (dynamic)

- **Canonical layer — FIXED, never mutated.** The stored `official_route.path` **and its physical
  distance markers** (`buildRoutePrefixKm` → cumulative km along the path; e.g. the Haifa-promenade
  200 m marker is already on this). This is the immutable **reference/base**: every "where am I / how
  far / what's next" is measured against it. We do not touch it.
- **Session (traversal) layer — DYNAMIC, this is what we build.** A session is a *view* derived from
  the canonical route, defined by **3 variable axes** (below). Nothing here mutates the canonical
  route; it produces a session plan **from** it.

## Principle 2 — (A) is a reusable pure engine, not a point-fix

Design (A) as a standalone pure function:

```
planFromPoint(canonicalPath, entryPoint, direction, topology) → sessionPlan
```

- **First caller = "start now":** `entryPoint` = the user's current GPS.
- **Same primitive, future caller = recalc-on-deviation:** "I went off-route → plan the rest **from
  here**" is the **identical call**, `entryPoint` = current position, invoked **mid-session** instead
  of at start.
- **Critical constraint:** do **NOT** bury this logic inside session-start code. It must be callable
  at the start **and again** mid-way with no special-casing.
- **The trigger exists; the response doesn't.** `useRouteDeviationOrchestrator` +
  `crossTrackDistanceMeters` already **detect** deviation — but nothing is wired to react. **(A) is
  that response.** Mark **recalc-on-deviation as a FUTURE CONSUMER**: design `planFromPoint` so it can
  serve it, but do not build the wiring now.

---

## The 3 axes (graded by cost & dependency)

### Axis 1 — entry (entry-relative) · NEAREST · MODERATE
Start from the user's current point, not `wp0`. Snap `entryPoint` → nearest canonical vertex → rotate
the traversal to begin there. **Reuse `useRouteFilter`'s rotation** (`:159-180`) — extract it to a
shared pure util (one source for display + planner). Stops reindex relative to entry; the stretch
**stays at its real POI**, and "last" = last **relative to entry**. Retires the interim pin-relocation.
- **Touches:** `composeRouteStopsWorkout` (delete the patch, call `planFromPoint`); a shared rotation
  util. `composeHybridSession` **unchanged** (still km-ordered; rotation makes km relative to entry).
  Scoped → `MAP_ROUTE_STOPS_V1` off = byte-identical.
- **Dependency:** the base — Axes 2 & 3 build on it.

### Axis 2 — direction (bidirectional) · MANDATORY · HIGHER
Same route, **either direction**. Infer heading (GPS heading, or nearest-next-vertex from movement —
**new**, none today); if reverse, the traversal reads the canonical path **backward**.
- **Touches:** direction inference (new); **arrival** (`hybrid-orchestrator.ts:97-105`
  `shouldArriveAtStation`, cumulative-km) and **deviation** (`useRouteDeviationOrchestrator.ts:258-265`
  finish target) must consume the **direction-oriented** traversal (they're array-order-based, so a
  reverse at plan time carries through — **must be tested end-to-end** on the live run chain).
- **Dependency:** on Axis 1 (rotate first, then orient direction).

### Axis 3 — topology (out-and-back / circular / repeated laps) · NEW AXIS · LARGEST
The **shape** of the traversal over the canonical route:
- **Linear one-way** — forward to the terminus (today's implicit behavior).
- **Out-and-back** — read the canonical **forward then backward**; **stations can recur on the return
  leg** (a stop at km5 outbound can appear again at km5 inbound).
- **Circular / repeated laps** — loop the canonical N times.
- **Touches:** the plan generator changes from "a **slice** of the path" to "a **sequence** that can
  **revisit** the path" → station placement (one stop → multiple traversal positions),
  `composeHybridSession` leg interleave (**assumes monotonic km** — laps/back-legs break monotonicity),
  and arrival/deviation (repeated visits to the same canonical vertex). **This is the biggest axis.**
- **Dependency:** on Axes 1 + 2.

---

## Sequencing
1. **GATE:** the open-bug audit — effectively **one** item now (recovery-card + double-count
   consolidated into a single audit; the folded piece is confirmed *during* the mapping, not a
   separate gate).
2. Build **`planFromPoint`** with **Axis 1 (entry)** — retires the patch. **Give the signature all
   three params now** (`direction`, `topology` default to today's behavior) so Axes 2/3 slot in
   without a rewrite.
3. **Axis 2 (direction).**
4. **Axis 3 (topology).**
5. **Future:** wire **recalc-on-deviation** as a second caller of `planFromPoint` (design supports it
   from step 2; build later).

---

## `planFromPoint` — the contract (DESIGN only; body PAUSED)

> Signature + axis types now (doesn't count sets/stations). The **body** — mapping stops to
> station content + budget/leg distribution + arrival/deviation wiring — **counts sets/stations, so
> it is ON HOLD** until the ② domainSets/set-counting fix lands (owned by the home-page chat). Then
> rebase and build the body Axis ① → ② → ③.

```ts
// ── Principle 1: the CANONICAL layer (fixed reference — never mutated) ─────────────
interface CanonicalRoute {
  path: RoutePath;         // [lng,lat][] — the stored official_route.path
  prefixKm: number[];      // buildRoutePrefixKm(path) — physical distance markers (the reference)
}

// ── Axis ① entry ──────────────────────────────────────────────────────────────────
interface EntryPoint {
  position: LatLng;        // start = user GPS · recalc = current position mid-route
  // planFromPoint snaps this → nearest canonical vertex (reuse useRouteFilter's nearest-index math)
}

// ── Axis ② direction ──────────────────────────────────────────────────────────────
type Direction = 'forward' | 'backward' | 'auto';   // 'auto' → infer (heading / nearest-next vertex)

// ── Axis ③ topology ───────────────────────────────────────────────────────────────
type Topology =
  | 'one_way'            // entry → terminus (today's implicit shape)
  | 'out_and_back'       // entry → far point → back; a stop can RECUR on the return
  | 'loop';              // cyclic (path[0]≈path[N]); "last" wraps back near entry
  // future: { kind: 'laps'; count: number }

// ── The pure planner (Principle 2: one function, two callers) ─────────────────────
interface PlanFromPointInput {
  canonical: CanonicalRoute;
  entry: EntryPoint;
  direction: Direction;
  topology: Topology;
  stops: ResolvedRouteStop[];        // POIs to place — keep their REAL canonical positions (no pin move)
}
function planFromPoint(input: PlanFromPointInput): SessionPlan;   // PURE — no I/O, no store reads

// ── Output: the dynamic session view over the canonical route ─────────────────────
interface SessionPlan {
  traversal: RoutePath;              // the path ACTUALLY walked (rotated to entry · reversed per dir · expanded per topology)
  entryIndex: number;                // where on canonical the session began (map + recalc anchor)
  direction: 'forward' | 'backward'; // resolved (auto → concrete)
  stops: PlannedStop[];              // stops in TRAVERSAL order, keyed by distance-from-entry
}
interface PlannedStop {
  stop: ResolvedRouteStop;           // the POI — pin stays at its real canonical location
  traversalKm: number;               // distance from entry along the traversal — THE ordering key (replaces waypointIndex)
  // occurrence?: number;            // out_and_back / laps — which pass (a stop may appear >1×)
}
```

**Design properties (why this is the honest model, not the patch):**
1. **Canonical never mutated** — `SessionPlan` is derived; `path` + `prefixKm` stay the fixed reference.
2. **Pure + reusable** — no I/O/store reads; callable at **start** (`entry` = GPS) **and again mid-route**
   (`entry` = current position) = the recalc-on-deviation consumer, same call.
3. **Entry-relative by construction** — ordering is by `traversalKm` (distance-from-entry), **not** by
   canonical `waypointIndex`. The interim pin-relocation is **deleted**: a stretch stays at its real POI,
   and "last" falls out of `traversalKm`. No lying about location.
4. **Axes compose** — entry (rotate) → direction (reverse) → topology (expand); stops re-project onto the
   resulting traversal. `out_and_back`/`loop`/`laps` are where a stop can recur (`occurrence`).
5. **Signature carries all three axes from day one** — Axis ① body first (`direction`/`topology` default to
   today's behavior), ② and ③ slot in without a signature change.

---

## Backlog — separate epic (NOT now)

- **(B) Open-space polygon pipeline** — model a stretch as an **AREA** (e.g. Charles Clore lawn), not a
  point. Not derivable from existing data. Needs the routes/climbs-style three-layer build:
  1. **New source** — OSM `leisure=park` / `landuse` polygons via Overpass, OR a municipal GIS polygon
     layer through the existing `.gov.il`/`.arcgis` proxy.
  2. **New geometry field on `Park`** — points only today (`location:{lat,lng}` + `segmentEndpoints`).
  3. **Polygon/MultiPolygon support in `gis-parser.service`** — Point + LineString only today.
  Scope ≈ the route/climb ingestion pipeline. Independent of Part 4; does not gate it.
