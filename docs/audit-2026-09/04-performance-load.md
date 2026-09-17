# 04 — Runtime Performance & Backend Load Audit

**Repo:** `appout-1` (Next.js 14.2.35 + Capacitor 6 + Firebase)
**Date:** 2026-09-07
**Scope:** MAP screen heat/slowness, Firestore read amplification, client bundle/startup, Cloud Functions cost, data model.
**Method:** static read of `src/`, `functions/src/`, `firestore.indexes.json`, `public/`. No device profiling was possible from this session — every claim that needs a device or a live Firestore count is explicitly marked **NEEDS RUNTIME MEASUREMENT**.

> Note on prior work: this codebase already carries several rounds of map perf work (`.claude/knowledge/map-watchdog-plan.md`, `idle-map-heat-gps-investigation.md`, `map-stability-oom.md`, `thermal-state-diagnostic.md`). Much of the *obvious* stuff — memoised GeoJSON, zoom-epsilon commit, viewport-culled markers, `maxTileCacheSize`, `workerCount=1`, throttled presence `setData` — is already done and is genuinely good. The findings below are what is **left**, and the biggest ones are things the previous rounds did not look at.

---

## 0. Top 5 scaling walls (read this if you read nothing else)

| # | Wall | Breaks at | Why |
|---|---|---|---|
| 1 | **`fetchRealParks()` reads the entire `parks` collection on every map open** — `src/features/parks/core/services/parks.service.ts:220` | Already expensive at 4k; ruinous at 400k | `getDocs(collection(db,'parks'))`, no `limit`, no geo scope. The 6h localStorage cache does **not** save reads — line 238 fires the background revalidate on every warm hit too. Cost = `N_parks × map_opens/day`. |
| 2 | **Global `presence` listener is O(clients × writers)** — `src/features/parks/core/store/usePresenceStore.ts:64` | ~2k concurrent map clients | Every client subscribes to `where('mode','==','verified_global') limit(200)`. Each presence heartbeat inside that 200-doc window is delivered to *every* listener = 1 billed read each. Reads/sec = `C × min(C,200)/120`. Quadratic. |
| 3 | **`leaderboard_snapshots/{bucket}` is a single doc holding a `rankings` array of every participant** — `functions/src/leaderboard.ts:219` | ~8k–10k users in one bucket | Firestore hard limit is 1 MiB/document. Every user without `core.tenantId` lands in the **same** `_global__all_<period>` bucket. The write does not fail gracefully — the whole nightly rollup throws. |
| 4 | **`resolveAudience()` full-scans the `users` collection for every broadcast push** — `functions/src/sendPushFromQueue.ts:352, 363, 388, 410` | ~200k users (256 MiB function OOM) | `db.collection('users').select().get()` with no `limit` and no cursor, materialising every uid in memory. Comment on line 407 claims it avoids a full collection scan; it does not. |
| 5 | **`unitLeagueRollup` runs hourly and reads 7 docs per reservist, then commits one un-chunked `WriteBatch`** — `functions/src/unitLeagueRollup.ts:95, 128–144` | 4k reservists = 672k reads/day; batch throws above 500 writes | `Promise.all` over every declaration with no concurrency cap, plus a single `db.batch()` that violates the 500-write limit as soon as `aggregates + stale deletes > 500`. |

---

## 1. MAP — why the phone heats up

The map screen (`/map` → `MapShell` → `AppMap` + `DiscoverLayer`) is doing five things at once that each independently keep the CPU/GPU awake. Ranked by expected thermal contribution.

### M1 — [CRITICAL] A 150-particle, 60 fps, retina canvas animation runs forever *behind an opaque map*

**`src/app/map/MapShell.tsx:545-549`** mounts `<ParticleBackground />` in every non-active map mode.

```
{!isActiveMode && (
  <div className="absolute inset-0 z-[-1] pointer-events-none">
    <ParticleBackground />
  </div>
)}
```

**`src/components/ParticleBackground.tsx:20,53-59,72,84-91`** — `fpsLimit: 60`, `number.value: 150`, `detectRetina: true`, `interactivity.onHover: repulse` enabled, and the canvas is `position: fixed; zIndex: -1` over the full viewport.

Why this costs battery and heat:
- tsparticles drives its own `requestAnimationFrame` loop at 60 fps for the life of the screen. It never idles, never pauses on `visibilitychange`, and is not gated by `document.hidden`.
- `detectRetina: true` on an iPhone means the backing canvas is DPR³ — a 3× oversampled full-screen 2D canvas repainted 60×/sec, composited on top of Mapbox's WebGL surface.
- **It is invisible.** The particles sit at `z-index: -1` (fixed). The Mapbox container is `src/app/map/MapShell.tsx:556` `<div className="absolute inset-0 z-0">` wrapping `AppMap`, whose root (`src/features/parks/core/components/AppMap.tsx:1590`) is `bg-[#f3f4f6]` — opaque. `<main>` at line 513 is also `bg-[#f3f4f6]`. Nothing behind z-0 is ever seen on this screen.
- `onHover: repulse` also forces a pointer-move hit-test over 150 particles on every touch-move — i.e. it competes with map panning for the main thread.

**Fix:** delete `ParticleBackground` from `MapShell.tsx:545-549`. It is unused anywhere else in `src/` (verified: the only other references are the import at line 34 and the doc comment at line 13). This is a pure deletion with zero visual change. If it is wanted on some other screen later, gate it on `useIsForeground()` and drop `detectRetina`/`fpsLimit` to 30.

**Expected impact:** this is the single highest-confidence heat fix in the audit. **NEEDS RUNTIME MEASUREMENT** to quantify: Xcode Instruments → Energy Log + Time Profiler on `/map` idle for 3 min, before/after. Also `console` count of tsparticles frames. Expect a full-screen 60 fps canvas to be worth several percent of sustained CPU on its own.

### M2 — [HIGH] A permanent `requestAnimationFrame` loop keeps the WebView from ever idling

**`src/features/parks/core/hooks/useMapPerfMonitor.ts:72-141`**, mounted unconditionally at **`src/features/parks/core/components/AppMap.tsx:370`**.

```
rafIdRef.current = requestAnimationFrame(tick);   // line 128
...
rafIdRef.current = requestAnimationFrame(tick);   // line 125 — re-arms forever
```

The loop runs for the entire life of the map screen, with no stop condition. Per frame it does a `push`, a conditional `shift`, and a `reduce` over a 30-element array (line 92-95), then re-arms.

Why it costs battery: Mapbox GL stops rendering when the map is idle, and the compositor can then park. An always-armed `rAF` forces the browser to schedule and run a callback every display refresh (60 Hz, 120 Hz on ProMotion) *forever*, which keeps the render loop alive and prevents the WebView from dropping into its low-power idle state. The `document.hidden` guard on line 81 handles backgrounding but not "foreground and idle" — which is exactly the "phone gets hot while I'm just looking at the map" complaint.

The hook's own doc comment says it is "PURE OBSERVABILITY … does NOT change any map behavior." That is true for map *behaviour* and false for power.

**Fix:** make the sampler duty-cycled instead of continuous. Sample for ~1 s out of every 10 s (`setTimeout` re-arm between bursts), and additionally only sample while the map is actually moving — subscribe to Mapbox `movestart`/`moveend` on the raw map and only run `rAF` between them. FPS while nothing is animating is meaningless data anyway. Keep the `webglcontextlost` and `memoryWarning` listeners (lines 144-167) as-is; those are free.

### M3 — [HIGH] Every map open re-reads the whole `parks` collection and re-parses it on the phone

**`src/features/parks/core/services/parks.service.ts:220`**

```
_inflightParksFetch = getDocs(collection(db, PARKS_COLLECTION))
```

Called from **`AppMap.tsx:824`** on mount. The stale-while-revalidate wrapper at `parks.service.ts:230-251` returns the localStorage copy instantly (good for perceived latency) but **line 238 unconditionally fires `fetchAndCacheParks()` anyway** on the warm path. So the read cost is paid on every single map open, cache or no cache.

CPU/battery cost on device, per map open:
- N documents downloaded and JSON-parsed by the Firestore SDK.
- `normalizePark` (line 50-92) allocates a 40-field object per park — `parks.service.ts:222`.
- `writeParksToStorage` (line 185) does `JSON.stringify` of the *entire* park array and a synchronous `localStorage.setItem` — a main-thread-blocking serialise of the whole dataset, on every map open. For a few thousand parks this is a multi-megabyte synchronous string operation. This alone can produce a visible hitch on entering the map.
- Then `parksGeoJSON` (`AppMap.tsx:891-909`) rebuilds a FeatureCollection over all N parks and hands it to Mapbox, which re-tessellates the clustered source.

**Fix (three parts):**
1. Scope the query. Parks have `authorityId` and `neighborhoodId` (indexes already exist: `parks/authorityId+name`, `parks/neighborhoodId+name`). Fetch `where('authorityId','==',profile.core.authorityId)` instead of the whole collection. Users only ever see their own city on the map.
2. Respect the cache: on a warm hit, only revalidate if `Date.now() - cachedAt > REVALIDATE_MIN_MS` (e.g. 30 min), not on every open.
3. Move `writeParksToStorage` off the main thread — IndexedDB via the already-present `idb` dependency, or at minimum defer it with `requestIdleCallback`.

**NEEDS RUNTIME MEASUREMENT:** the actual document count in `parks`. Run in the Firebase console or `firebase firestore:indexes`-adjacent tooling: `db.collection('parks').count().get()`. The whole cost model below scales linearly with it.

### M4 — [HIGH] Route generation does hundreds of Firestore reads and heavy geometry on the phone

**`src/features/parks/core/services/route-generator.service.ts`** (3,623 lines, runs entirely client-side):
- line 592-599: `street_segments` geohash query, `limit(300)` — the file's own comment at line 589 admits this "already matches fetching the full city (6106 docs) for this case".
- line 774-776: a second `street_segments` `getDocs`.
- line 1698: `official_routes where city == c and published == true` — **no limit**, run once per city candidate.
- line 1787 **and again** line 2164: `route_adjacency where cityName == c` — **no limit**, and the same query is issued from two different code paths in one generation run.

Then it runs waypoint scoring, triangle combination (`buildTriangleCombinations`, line 2429), angular-diversity selection (line 1297) and turf distance maths over those segments — on a phone CPU, while Mapbox is rendering.

**Fix:** this belongs on the server. A callable Cloud Function (or a Next.js route handler) that takes `{lat,lng,targetDistance,activity}` and returns 3 candidate routes turns ~1,000 client reads + seconds of client CPU into 1 HTTPS round-trip, and lets you cache the result per (geohash, distance-bucket, activity) across users. That last part is the real win: in a city, the same 5-6 route requests repeat thousands of times a day.
Interim mitigations if the move is too big right now: add `limit()` to lines 1698/1787/2164, and de-duplicate the double `route_adjacency` fetch (1787 vs 2164) into one memoised call per generation.

### M5 — [MEDIUM] Two full Mapbox GL instances can cold-boot at the same moment

`MapShell.tsx:1013-1035` renders `MapShellInner` (which mounts `AppMap`) **and** the location gate `UnifiedLocationStep`, which mounts its own Mapbox instance (`src/features/user/onboarding/components/steps/UnifiedLocationStep.tsx:14-15` imports `react-map-gl` + `mapbox-gl` eagerly). The 400 ms `gateVisible` stagger at `MapShell.tsx:981-987` is a mitigation, not a fix — two WebGL contexts, two style parses, two tile-fetch storms.

The code's own comment (lines 952-980) already flags this and says **"NEEDS DEVICE VERIFICATION before this ships."** It has apparently shipped. Verify it.

**Fix:** the gate does not need a full interactive Mapbox instance. A static Mapbox Static Images API tile (one HTTP image request) is enough for an anchor-confirmation step. Failing that, don't mount the gate's map until `AppMap` reports `isMapLoaded`.

### M6 — [MEDIUM] Debug `console.log` left in hot paths

These run on production devices (`next.config.mjs` has no `removeConsole`):
- `MapShell.tsx:119, 136, 142, 350, 361` — `[A2-SPIKE]` diagnostics, one of which (line 350) fires on every `mode`/`isWorkoutActive`/`runMode` change.
- `src/features/parks/core/hooks/useGPS.ts:170` — per-mount.
- `MapShell.tsx:241` — `[SimInject]` logs on every simulated position (100 ms cadence in sim mode).
- `src/features/parks/core/store/usePresenceStore.ts:74` — logs on **every presence snapshot**, i.e. potentially several times a second in a busy city.
- `src/features/parks/core/hooks/useCommunityEnrichment.ts:343, 372, 435, 442, 455, 644, 688` — logs on every enrichment snapshot.
- `src/features/parks/core/hooks/useGroupPresence.ts:241-256` — builds a `modeBreakdown` object and drop-reason counters on **every presence snapshot** purely for a diagnostic log.

On iOS WKWebView with a debugger attached (TestFlight, Safari inspector) `console.log` is genuinely expensive — string coercion plus an IPC hop per call. Even detached it costs allocation.

**Fix:** add to `next.config.mjs`:
```
compiler: { removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error','warn'] } : false },
```
and delete the `[A2-SPIKE]` block (`MapShell.tsx:112-148`) and the `[heat-diag]` block (`usePresenceStore.ts:68-74`) outright — they are explicitly labelled temporary.

### M7 — What is already correct (do not "fix" these)

Credit where due, so nobody regresses them:
- Markers are **not** React DOM nodes at scale. Parks render through a clustered Mapbox `SymbolLayer` (`AppMap.tsx:1828-1839`, `cluster={true} clusterMaxZoom={14} clusterRadius={50}`). Partners render as a heatmap below z13 and circles z13-15 (`AppMap.tsx:146-183`), with React `<Marker>` only at z≥15 **and** viewport-culled (`AppMap.tsx:2221-2227`). Facilities are gated at z≥14 and viewport-culled (`AppMap.tsx:2181, 2195`). This is the right architecture.
- `onZoom` commits through a 0.25 epsilon so it does not re-render 60×/s (`AppMap.tsx:1594-1600, 675`).
- `mapRoutes` and `navigationTurns` are memoised in `MapShell.tsx:450-455, 475-510` specifically to stop GeoJSON re-upload per GPS tick.
- Presence `setData` is throttled to 750 ms with adaptive backoff (`AppMap.tsx:291, 790-793`).
- Mapbox listeners registered in `handleMapLoad` are detached by ref on unmount (`AppMap.tsx:386-401`), and `useCameraController` mirrors that (`useCameraController.ts:413-432`).
- GPS is throttled to 2 Hz / 3 m, paused when backgrounded unless a workout is active, and uses a 20 s one-shot poll instead of a continuous watch while idle (`useGPS.ts:47, 51, 68, 139, 364`). Cleanup is present.
- `maxTileCacheSize={45}` and `mapboxgl.workerCount = 1` (`AppMap.tsx:1620, 62`).

**Marker count answer:** at any moment the map holds, as React DOM markers: 1 user marker, ≤1 destination, ≤N hybrid stations, ≤N leg-plan stops, 2 per visible route (start+finish, `AppMap.tsx:2103, 2153` — **not** viewport-culled, but `visibleRoutes` is at most 3), visible facilities (viewport-culled, z≥14), visible partners (viewport-culled, z≥15, ≤200 source docs). Everything else is GPU layers. This is bounded and fine. **The heat is not coming from marker count.**

### M8 — DEM tile cache: correct but unbounded and session-only

**`src/lib/dem-tile-cache/dem-tile-cache-client.ts:31, 35`** — `sessionTileCache` is a module-level `Map`, "never evicted" by design (line 28-30), and `knownMissing` likewise. Two consequences:
- It is **not persisted**, so every cold app launch re-downloads every DEM tile from Firebase Storage. On a metered mobile connection that is repeated egress cost and latency.
- It is **never evicted**, so a user who generates routes across a wide area accumulates elevation grids in JS heap for the life of the tab — on WKWebView (~300-500 MB budget, per the comment at `AppMap.tsx:56-61`) that is a contributor to the OOM kills the codebase already documents.

It is *not* refetching within a session (the `!sessionTileCache.has(key) && !knownMissing.has(key)` filter at line 55-58 is correct), and the dynamic `import('firebase/storage')` at line 61 correctly keeps the Storage SDK out of the main bundle.

**Fix:** back it with IndexedDB (`idb` is already a dependency) keyed by `z/x/y` with a size cap and LRU eviction, so tiles survive relaunch and heap stays bounded.

---

## 2. Firestore read amplification

### 2.1 Full `onSnapshot` inventory (46 call sites)

Risk key: **CRIT** = unbounded/quadratic at scale · **HIGH** = unbounded but scoped · **MED** = bounded but avoidable · **LOW** = correctly scoped.

| # | file:line | Listens to | Scoped? | Limit? | Unsub on unmount? | Risk |
|---|---|---|---|---|---|---|
| 1 | `src/features/parks/core/store/usePresenceStore.ts:64` | `presence where mode==verified_global` | **No geo/city scope** | `limit(200)` | ref-counted release, yes | **CRIT** — global fan-out, O(clients×writers). See §2.2 |
| 2 | `src/features/parks/core/hooks/useGroupPresence.ts:239` | `presence` (group branch: `mode==group + audienceGroupIds array-contains`; discovery branch falls back to global `limit(200)`) | group: yes / discovery: no | 200 on discovery branch | yes (`unsubRef`, line 209-215) | **CRIT** on discovery branch |
| 3 | `src/features/parks/core/hooks/usePartnerData.ts:491` | `presence where mode==verified_global limit(200)` | no | 200 | yes | **CRIT** (de-duped into #1 when `IS_PERF_BATCH2_PRESENCE_ENABLED`, which is `true`) |
| 4 | `src/features/safecity/hooks/usePresenceLayer.ts:498` | `presence where mode==verified_global [+ authorityId]` | city-scoped **only if** `authorityId` present | **none** | yes | **CRIT** — no `limit()` at all; anonymous/MAP_ONLY users have no authorityId → unbounded global read |
| 5 | `src/features/safecity/hooks/usePresenceLayer.ts:448` | `presence where uid in <30> + mode==verified_global`, **one listener per 30-follower batch** | yes | implicit 30 | yes (line 485) | MED — listener count grows with follow graph |
| 6 | `src/features/safecity/hooks/useSocialLiveMap.ts:306` | `presence where mode==verified_global` | no | **none** | yes | **CRIT** — but **dead code**: `useSocialLiveMap` has no callers (only a doc reference in `usePresenceLayer.ts:7`). Delete it before someone wires it up. |
| 7 | `src/features/safecity/hooks/useSocialLiveMap.ts:268` | `presence where uid in <30>`, per batch | yes | 30 | yes | dead code |
| 8 | `src/features/parks/core/hooks/usePartnerData.ts:265` | `planned_sessions where expiresAt>=now + status in [planned,active]` | **no entity scope** | **none** | yes | **CRIT** — unbounded *and* almost certainly failing on a missing composite index (§5.2); the error handler is `() => setIsLoading(false)`, so the failure is silent |
| 9 | `src/features/parks/core/hooks/usePartnerData.ts:298` | `community_events where isActive==true limit(100)` | no | 100 | yes | HIGH — plus N+1 registration fan-out in the callback |
| 10 | `src/features/parks/core/hooks/usePartnerData.ts:392` | `community_groups where isActive==true` | no | **none** | yes | HIGH — the `limit(100)` applied to #9 was not applied here |
| 11 | `src/features/parks/core/hooks/useCommunityEnrichment.ts:352` | `community_events where location.routeId in <30> + isActive==true` | yes | 30 ids | yes (line 475) | HIGH — **N+1**: callback `await`s a `getDocs` per event (line 359 → 162) |
| 12 | `src/features/parks/core/hooks/useCommunityEnrichment.ts:431` | `community_groups where isActive==true limit(100)` | no | 100 | yes | MED |
| 13 | `src/features/parks/core/hooks/useCommunityEnrichment.ts:451` | `community_groups where meetingLocation.routeId in <30>` | yes | 30 ids | yes | LOW |
| 14 | `src/features/parks/core/hooks/useCommunityEnrichment.ts:604` | `community_events where location.parkId== + isActive==` | yes | none | yes | MED — **N+1** at line 610, and needs a missing index |
| 15 | `src/features/parks/core/hooks/useCommunityEnrichment.ts:630` | `community_groups where meetingLocation.parkId==` | yes | none | yes | LOW |
| 16 | `src/features/parks/core/hooks/useCommunityEnrichment.ts:662` | `planned_sessions where parkId== + expiresAt>=` | yes | none | yes | MED — needs a missing index |
| 17 | `src/features/parks/core/hooks/useMyRegistrations.ts:35` | `community_events/{id}/registrations/{uid}` — **`onSnapshot` inside a `for` loop over `eventIds`** | yes | 1 doc each | yes (`unsubsRef`, line 21) | HIGH — listener-per-list-item; N listeners for an N-item list |
| 18 | `src/app/map/MapShell.tsx:406` | `users/{uid}` (referral toast) | yes | 1 doc | yes | MED — **duplicate**: #19 already watches the same doc |
| 19 | `src/features/user/progression/store/useProgressionStore.ts:361` | `users/{uid}` (progression) | yes | 1 doc | dedup by uid, module-level | MED — session-long; combined with #18 the same doc is watched twice |
| 20 | `src/features/activity/store/useActivityStore.ts:1129` | `dailyActivity/{uid}_{today}` | yes | 1 doc | yes | LOW |
| 21 | `src/features/activity/store/useActivityStore.ts:1157` | `streaks/{uid}` | yes | 1 doc | yes | LOW |
| 22 | `src/features/social/hooks/useChatInbox.ts:48` | `chats where participants array-contains uid orderBy lastMessageAt desc` | yes | **none** | yes | **HIGH** — mounted **globally for the whole session** via `ClientLayout.tsx:102` → `ChatInbox.tsx:57`, which calls the hook **unconditionally**; `isOpen` only gates rendering (line 163) |
| 23 | `src/features/social/hooks/useActivityFeed.ts:45` | `activity/{uid}/feed limit(30)` | yes | 30 | yes | LOW — also globally mounted (`ClientLayout.tsx:107` → `ActivityPanel.tsx:64`) but bounded |
| 24 | `src/hooks/useFeatureFlags.ts:52` | `system_config/feature_flags` | n/a | 1 doc | yes | LOW |
| 25 | `src/features/home/hooks/useDailyProgress.ts:65` | `dailyProgress/{uid}_{date}` | yes | 1 doc | yes | LOW — but a redundant `getDoc` fires first at line 53, doubling the read |
| 26 | `src/features/home/hooks/useWeeklyStrengthGoal.ts:57` | `dailyProgress where documentId() in <7>` | yes | 7 | yes | LOW |
| 27 | `src/features/social/services/chat.service.ts:132` | `chats/{id}/messages limit(50)` | yes | 50 | caller | LOW |
| 28 | `src/features/social/services/chat.service.ts:159` | `chats orderBy lastMessageAt limit(200)` (admin) | **whole collection** | 200 | caller | MED — admin only |
| 29 | `src/features/messages/services/MessageService.ts:659` | `smart_messages orderBy type,priority` — whole collection | no | **none** | caller | MED — admin only |
| 30 | `src/features/messages/services/MessageService.ts:683` | `smart_messages where type== + isActive==` | partial | **none** | caller | MED |
| 31 | `src/features/safecity/services/kudos.service.ts:74` | `kudos/{uid}/inbox where read==false limit(5)` | yes | 5 | caller | LOW |
| 32 | `src/features/workout-engine/core/store/useSharedSession.ts:105` | `community_groups/{g}/attendance/{id}` | yes | 1 doc | caller | LOW |
| 33 | `src/features/admin/services/group-session.service.ts:176` | `group_sessions/{id}` | yes | 1 doc | caller | LOW |
| 34 | `src/features/admin/services/planned-sessions.service.ts:290` | `planned_sessions where routeId in <30> + expiresAt>= orderBy startTime` | yes | 30 ids | caller | MED — needs a missing index |
| 35 | `src/features/admin/services/planned-sessions.service.ts:340` | `planned_sessions where parkId== + expiresAt>= orderBy startTime` | yes | none | caller | MED — needs a missing index |
| 36 | `src/features/arena/hooks/useArenaData.ts:150` | `community_groups where authorityId== orderBy createdAt` | city | **none** | yes | MED |
| 37 | `src/features/arena/hooks/useArenaData.ts:170` | `community_events where authorityId== + isActive== orderBy date` | city | **none** | yes | MED |
| 38 | `src/features/arena/hooks/usePublicGroupPhases.ts:89` | attendance doc — **one listener per active group**, in a loop | yes | 1 each | yes (line 71-73) | MED — listener-per-item |
| 39 | `src/features/arena/hooks/useCommunitySessionBanner.ts:252` | attendance doc — **one listener per session**, inside `forEach` | yes | 1 each | see below | MED — listener-per-item |
| 40 | `src/features/arena/hooks/useCommunitySessionBanner.ts:285` | same, re-subscribed from a 60 s `setInterval` (line 269) | yes | 1 each | `unsubsRef` map | MED — verify no leak across the interval path |
| 41 | `src/features/arena/hooks/useGroupLiveSession.ts:64` | attendance doc | yes | 1 doc | yes | LOW |
| 42 | `src/features/arena/hooks/useHasDeclaredReserveStatus.ts:64` | `military_declarations/{uid}` | yes | 1 doc | yes | LOW |
| 43 | `src/features/heatmap/services/heatmap.service.ts:167` | `active_workouts where authorityId in <30>` | city tree | **none** | yes | HIGH at scale — every active workout in a city, live |
| 44 | `src/features/admin/hooks/useAuthorities.ts:196` | `authorities [where type in] orderBy name` | no | **none** | yes | MED — admin only |
| 45 | `src/features/forms/photo-release/admin/PhotoReleaseManagement.tsx:61` | photo-release submissions | admin | check | yes | LOW — admin only |
| 46 | `src/features/profile/hooks/useWorkoutHistory.ts:47` | *(not a listener — comment only; it is a one-shot `getDocs`)* | — | — | — | — |

**Cleanup verdict:** unsubscribe hygiene is genuinely good — every listener I traced returns or stores an unsubscribe. There is no classic "forgot to return the cleanup" leak. The problem is **scope and lifetime**, not cleanup.

**Listeners open simultaneously on the map screen** (discover mode, logged-in user): #1 (shared presence), #8, #9, #10, #11, #12, #13, #17 (×N events), #18, #19, #20, #21, #22, #23, #24 = **~15+ live listeners**, several of them unbounded.

### 2.2 The presence quadratic — the read-cost headline

Every client on `/map` holds `presence where mode=='verified_global' limit(200)` (`usePresenceStore.ts:64`).
Every client on `/map` **writes** its own presence doc every 120 s (`src/features/safecity/services/presence.service.ts:273, 303`), and every 30 s during a moving workout (line 340, 344).

Firestore bills 1 read per document *delivered* to a listener. So:

```
reads/sec  =  C  ×  min(C, 200) / 120
             (listeners)  (writers inside the 200-doc window)
```

| Scenario | Concurrent map clients (C) | reads/sec | reads/day (@3 peak-hour-equivalents) | Firestore cost/month @ $0.06/100k |
|---|---|---|---|---|
| Today | 50 | 21 | 0.22 M | ~$4 |
| **4,000 DAU** (5% peak concurrency) | 200 | 333 | 3.6 M | **~$65/mo** |
| 4,000 DAU (15% peak) | 600 | 1,000 | 10.8 M | ~$195/mo |
| **400,000 users** (5% peak) | 20,000 | 33,333 | 360 M | **~$6,500/mo** |
| 400,000 users, workout heartbeat 30 s | 20,000 | 133,333 | 1.4 B | ~$26,000/mo |

Two things go wrong at once at the partner scale: the cost, and the fact that **`limit(200)` with no ordering returns 200 documents in document-id order** — i.e. the same arbitrary 200 users to every client on the planet. The feature stops working long before it stops being affordable. `usePresenceStore.ts:35-38` already acknowledges this in a comment.

**Fix:** geo-scope the presence query. Add a `geohash` (or reuse `authorityId`) field to presence docs and query `where('mode','==','verified_global').where('geohash','>=',lo).where('geohash','<=',hi).limit(50)` per geohash cell. Index: `presence (mode ASC, geohash ASC)`. That turns the window from "all users globally" into "users in my ~5 km cell", which caps both delivered docs and cost at a *constant* per client instead of scaling with total users. There is already a `presence (mode, authorityId)` composite index deployed, so an authority-scoped interim fix is a one-line change to `usePresenceStore.ts:64` — add `.where('authorityId','==',myAuthorityId)`.

### 2.3 Reads per map session (the other half of the bill)

Per cold `/map` open, per user, ignoring the listener churn above:

| Source | file:line | Reads |
|---|---|---|
| `parks` full collection | `parks.service.ts:220` | **N_parks** (unbounded) |
| `presence` initial snapshot | `usePresenceStore.ts:64` | 200 |
| `planned_sessions` (partner data) | `usePartnerData.ts:265` | unbounded (or 0 if index-failing) |
| `community_events isActive` | `usePartnerData.ts:298` | ≤100 |
| `community_events` N+1 registrations | `useCommunityEnrichment.ts:162` | **≤3 × number of events, re-run on every snapshot** |
| `community_groups isActive` | `usePartnerData.ts:392` | unbounded |
| `community_groups isActive limit 100` | `useCommunityEnrichment.ts:431` | ≤100 |
| `community_events` by routeId | `useCommunityEnrichment.ts:352` | ≤30 routes' worth |
| `chats` inbox (global, always-on) | `useChatInbox.ts:48` | unbounded (thread count) |
| `users/{uid}` ×2 | `MapShell.tsx:406`, `useProgressionStore.ts:361` | 2 |
| route generation, if the user taps generate | `route-generator.service.ts:596, 776, 1698, 1787, 2164` | ~600 + 2×`route_adjacency(city)` + `official_routes(city)` |

Floor of ~450 reads/map-open **before** `N_parks`, `route_adjacency`, and listener churn.

At 4,000 DAU × 3 map opens/day = 12,000 sessions/day:
- Fixed portion alone: 12,000 × 450 = **5.4 M reads/day** ≈ $100/mo.
- Plus parks: if `N_parks = 3,000`, that is 12,000 × 3,000 = **36 M reads/day** ≈ **$650/mo for park pins alone**.
- At 400,000 users (1.2 M sessions/day) the same arithmetic gives **3.6 B reads/day for parks** ≈ $65,000/mo. This is why finding #1 is the number-one wall.

**NEEDS RUNTIME MEASUREMENT:** exact `N_parks`, `N_route_adjacency` per city, `N_official_routes` per city, and average threads per user in `chats`. Get all four with `.count()` aggregate queries — they cost 1 read each. Then re-run this table with real numbers.

### 2.4 N+1 patterns (query inside a loop over query results)

| file:line | Pattern | Blast radius |
|---|---|---|
| `src/features/parks/core/hooks/useCommunityEnrichment.ts:358-359` → `:162` | `for (const docSnap of snapshot.docs) { await eventDocToEnrichment(docSnap) }` where the helper does `getDocs(community_events/{id}/registrations limit 3)` | 1 + 3×E reads **per snapshot emission**, serially awaited. A single registration write anywhere re-fires the whole fan-out. |
| `src/features/parks/core/hooks/useCommunityEnrichment.ts:609-610` | same, park variant | same |
| `src/features/parks/core/hooks/useMyRegistrations.ts:33-35` | `for (const eventId of stableIds) { onSnapshot(...) }` | N *persistent listeners*, not just N reads |
| `src/features/arena/hooks/useCommunitySessionBanner.ts:242-252` | `rawSessions.forEach(... onSnapshot ...)` | N persistent listeners |
| `src/features/arena/hooks/usePublicGroupPhases.ts:84-89` | `for (const g of groups) { onSnapshot(...) }` | N persistent listeners |
| `src/features/admin/components/authority-manager/AnalyticsDashboard.tsx:311` | `getDocs(community_groups/{g.id}/attendance)` inside a loop over groups | admin only, but unbounded |
| `src/features/admin/components/authority-manager/SessionsDashboard.tsx:95` | same | admin only |
| `src/features/admin/services/unit-count-sync.service.ts:52` | `getDocs(tenants/{a.id}/units)` per authority | admin only |

**Fix for the enrichment N+1:** denormalise. Cloud Functions already fire on registration writes — have them maintain `community_events/{id}.topAvatars` (an array of ≤3 `{uid,name,photoURL}`) on the parent doc. The client then needs zero sub-queries. This removes 3×E reads per snapshot from the map's hot path.

**Fix for listener-per-item:** replace with one query. `useMyRegistrations` should be `collectionGroup('registrations').where('uid','==',myUid).where('eventId','in', capped)` (add `eventId` to registration docs), or simply `where(documentId(),'in', ids)` against a flattened `event_registrations/{eventId}_{uid}` collection — 1 listener instead of N.

### 2.5 Unbounded `getDocs` on whole collections (client-side)

`collectionGroup` scans: only 2, both admin (`src/app/admin/workout-settings/page.tsx:570`, `notification_clicks`) and both correctly indexed. Not a problem.

Whole-collection `getDocs` from client code — the user-facing ones that matter:

| file:line | Collection | Why it matters |
|---|---|---|
| `src/features/parks/core/services/parks.service.ts:220` | `parks` | §M3 — **the #1 cost item** |
| `src/features/content/exercises/core/exercise.service.ts:104` | `exercises` | Full library pulled to the client. `exercise-inventory.csv` has 366 rows → ~366 reads + a large parse, per call. Verify it is memoised across the session. |
| `src/features/content/exercises/core/exercise.service.ts:170` | `exercises` | second full-collection path |
| `src/features/content/programs/core/program.service.ts:169` | `programs` | full library |
| `src/features/parks/core/services/route-generator.service.ts:1698` | `official_routes` (per city) | no `limit` |
| `src/features/parks/core/services/route-generator.service.ts:1787, 2164` | `route_adjacency` (per city) | no `limit`, **issued twice per generation** |

Admin-only full scans of `users` / `workouts` (`strategic-insights.service.ts:32,67,122,272`, `cpo-analytics.service.ts:136,163,216,254,316`, `admin-management.service.ts:48,90,371`, `authority.service.ts:852`) are a separate class of problem: at 400k users, opening the admin dashboard costs 400k reads (~$0.24) *and* will very likely blow the browser's memory. These should move to server-side aggregates or `count()` queries, but they are not on a user-facing path — flag as **MEDIUM, deferred**.

---

## 3. Client bundle & startup

### 3.1 `next.config.mjs` — what is missing

`next.config.mjs` is 38 lines and configures only `eslint`, `typescript`, `images.remotePatterns` and two `headers`. Three things are absent and all three matter here:

1. **No `compiler.removeConsole`** — see §M6. Every `console.log` in the codebase ships to production devices.
2. **No `modularizeImports` / `optimizePackageImports`** for `lucide-react` (v0.562) — the app imports named icons from `'lucide-react'` in ~200 files. Next 14 tree-shakes this reasonably in production, but adding `experimental.optimizePackageImports: ['lucide-react','date-fns','framer-motion']` measurably cuts module count and cold-parse time on a WebView.
3. **No bundle analyzer wired up** — there is no way to answer "how big is the map chunk" from this repo today.

**Fix:** add all three. The analyzer first, so the numbers below stop being estimates.

### 3.2 Heavy libraries and where they are imported eagerly

The dependency list contains four separate map stacks: `mapbox-gl` + `react-map-gl` (in use), `leaflet` + `react-leaflet`, and `@react-google-maps/api`. Plus `reactflow` + `dagre`, `recharts`, `pdf-lib` + `@pdf-lib/fontkit`, `xlsx`, `unpdf`, `mammoth`, `shpjs`, `jszip`, `osmtogeojson`, `tsparticles` + `@tsparticles/slim`, `hls.js`, `@lottiefiles/dotlottie-react`.

| Library | Eager import at | On a user path? | Verdict |
|---|---|---|---|
| `@tsparticles/react` + `slim` | `src/components/ParticleBackground.tsx:4-5` | **Yes — the map**, `MapShell.tsx:34` (static import) | **Delete** (§M1). Removes tsparticles from the map chunk entirely. |
| `@lottiefiles/dotlottie-react` | `src/components/ui/AnimatedFlame.tsx:24`, statically imported by `src/components/ui/AppHeader.tsx:26` | **Yes — the map** (`MapShell.tsx:537, 542` render `AppHeader`) and Home | **HIGH.** Pulls the dotLottie React binding into the map's critical path, and `setWasmUrl` at module scope (line 38) points at a **1.2 MB WASM** (`public/assets/animations/dotlottie-player.wasm`) fetched on the map screen for a small flame icon. `next/dynamic({ ssr:false })` the `AnimatedFlame` and render the plain `lucide-react` `<Flame/>` (already imported at line 23) as the fallback. |
| `recharts` | `MiniSparkline.tsx:3` (profile), `LapPaceChart.tsx:4` (run summary), `MasterExerciseView.tsx:23` | Yes — profile + post-run summary | `next/dynamic` all three. Recharts pulls in `d3-*`; it must not be in the shared chunk. |
| `leaflet` / `react-leaflet` | *no imports found in `src/`* | No | **Dead dependency — remove from `package.json`.** |
| `@react-google-maps/api` | *no imports found in `src/`* | No | **Dead dependency — remove.** |
| `pdf-lib` | `photo-release-pdf.service.ts:23`, `pdf-service.ts:9` (onboarding) | onboarding path | Convert to `await import('pdf-lib')` inside the function that uses it. |
| `xlsx` | `importExcelAction.ts:3`, `park-import.service.ts:9` | admin only | Fine (admin route is its own chunk), but confirm with the analyzer that it is not in the shared chunk. |
| `shpjs` + `jszip` | `gis-parser.service.ts:1-2` | admin only | dynamic-import to be safe |
| `reactflow` + `dagre` | `src/app/admin/questionnaire/page.tsx:42` | admin only | fine |
| `canvas-confetti` | `WorkoutBlockCard.tsx:18`, `StrengthExerciseCard.tsx:27`, `CreateGroupWizard.tsx:4` | Yes — workout player | Small (~5 KB), leave it. |
| `mapbox-gl` / `react-map-gl` | `AppMap.tsx:4-5` etc. | Yes | Correctly code-split: `page.tsx:17` → `next/dynamic(MapShell)` → `MapShell.tsx:76` → `next/dynamic(AppMap, {ssr:false})`. **Good, no change.** But see §M5: `UnifiedLocationStep.tsx:14-15` imports it statically, which is a second entry point into the same chunk. |

The app already uses `next/dynamic` in 35 files — the split discipline exists, it just has gaps.

### 3.3 `public/` — 50 MB shipped, one 11 MB file

Top 25 by size (KB):

| KB | Path | Referenced? |
|---:|---|---|
| **11,156** | `public/images/gateway/card-map.png` | `src/app/gateway/page.tsx:518` — **as a CSS `background-image`** |
| 7,388 | `public/icons/muscles/כופפי ירך.svg` | yes (muscle-chips) |
| 7,388 | `public/icons/muscles/male/hip_flexors.svg` | yes |
| 4,884 | `public/assets/logo/Turquoise And White Minimalist Yoga App Instagram Post 1.svg` | **NOT referenced in `src/`** |
| 2,656 | `public/assets/lemur/king-lemur.png` | yes |
| 1,852 | `public/images/gateway/card-strength.png` | `gateway/page.tsx:606` (CSS bg) |
| 1,652 | `public/images/gateway/card-running.png` | `gateway/page.tsx:567` (CSS bg) |
| 1,368 | `public/icons/muscles/מקרבים.svg` | yes |
| 1,368 | `public/icons/muscles/male/adductors.svg` | yes |
| 1,320 | `public/icons/muscles/female/מרחיקים.svg` | yes |
| 1,320 | `public/assets/lemur/lemur-avatar.png` | yes |
| 1,316 | `public/assets/icons/equipment/mat.svg` | yes |
| 1,196 | `public/assets/animations/dotlottie-player.wasm` | `AnimatedFlame.tsx:38` |
| 644 | `public/assets/icons/equipment/pants.svg` | yes |
| 620 | `public/assets/videos/אנימציית_דמות_ממצמצת_וכותבת.mp4` | **NOT referenced in `src/`** |
| 392 | `public/assets/icons/equipment/back_pack.svg` | yes |
| 352 | `public/assets/lemur/lemur-rest.svg` | yes |
| 320 | `public/assets/icons/equipment/long_resistance_band.svg` | yes |
| 284 | `public/assets/icons/equipment/yoga_block.svg` | yes |
| 264 | `public/assets/icons/equipment/weight_belt.svg` | yes |
| 228 | `public/assets/icons/equipment/Abdominal_wheel.svg` | yes |
| 224 | `public/assets/icons/equipment/training_steps.svg` | yes |
| 204 | `public/assets/icons/equipment/table.svg` | yes |
| 184 | `public/assets/lemur/lemur-doctor.png` | yes |
| 156 | `public/assets/lemur/lemur_notepad.png` | yes |

Findings:

- **[CRITICAL] `card-map.png` is 10.9 MB and is loaded as a CSS `background-image`** (`gateway/page.tsx:518`). Because it is a CSS URL and not `next/image`, it bypasses Next's image optimizer completely — no resize, no WebP/AVIF, no responsive `srcset`. Every visitor to `/gateway` downloads 10.9 MB for a card background. On a 4G phone that is ~15-25 s and a large chunk of a user's data allowance. The two sibling cards (1.8 MB, 1.6 MB) are the same pattern.
  **Fix:** re-encode all three to WebP at 2× the rendered card size (they are card thumbnails — 800×1000 WebP q80 should land under 120 KB each, a **~99% reduction**), and switch to `next/image` with `fill` + `object-cover` instead of `background-image`. `gateway/page.tsx` already uses raw `<img>` at lines 51, 485, 618 — those should become `next/image` too.
- **[HIGH] The three muscle SVGs at 7.4 MB / 7.4 MB / 1.4 MB are almost certainly Illustrator exports with embedded raster data or absurd path precision.** A muscle-group icon has no business being 7 MB. Run them through SVGO with `convertPathData` precision 2 and strip embedded images; expect >95% reduction. Same for `mat.svg` (1.3 MB) and the rest of the equipment icons — `public/assets/icons/equipment/` is a set of *icons*, and several are over 200 KB.
- **[MEDIUM] Two unreferenced files totalling 5.5 MB:** `assets/logo/Turquoise And White Minimalist Yoga App Instagram Post 1.svg` (4.9 MB) and `assets/videos/אנימציית_דמות_ממצמצת_וכותבת.mp4` (0.6 MB). Delete. (Note: filenames contain spaces and Hebrew, which is its own operational hazard on some CDNs.)
- Everything under `public/` is copied into the Capacitor native bundle by `cap sync`, so this 50 MB is also **app download size** on the App Store and Play Store, not just web egress.

**Estimated saving from the image work alone: ~40 MB of the 50 MB directory**, and a `/gateway` first-paint that goes from ~15 MB of images to under 400 KB.

### 3.4 Startup

`src/app/ClientLayout.tsx` mounts, for every route: `BottomNavigation`, `GlobalDetailOverlay`, **`ChatInbox`** (line 102), **`ActivityPanel`** (line 107), `OfflineBanner`, `GlobalErrorOverlay`, `MidnightClock`, `OnboardingSyncErrorToast`, plus `useMidnightRefresh()` (line 27).

`ChatInbox.tsx:57` calls `useChatInbox(myUid)` unconditionally — the `isOpen` prop only gates the JSX at line 163. So an **unbounded `chats` listener is open on every screen for the entire session**, including the map. Same shape for `ActivityPanel.tsx:64` (bounded at 30, so lower risk).

**Fix:** pass `isOpen ? myUid : null` to both hooks (both already handle a null uid by clearing state and returning early). One-line change per file; removes an unbounded session-long listener from every screen.

---

## 4. Cloud Functions — cost and load

35 function files, all in `us-central1`, mostly 256 MiB.

### F1 — [CRITICAL] `leaderboard_snapshots` is a single document containing every participant

**`functions/src/leaderboard.ts:207-232`**

```
const snapshotRef = db.collection('leaderboard_snapshots').doc(bucketKey);
batch.set(snapshotRef, { period, rankings: ranked, totalParticipants: ranked.length, ... });
```

`ranked` is an array with **one entry per user in the bucket**. Firestore's hard document limit is **1 MiB**. At roughly 100-120 bytes per entry (`uid` ~28 chars + rank + xp + posts + array/map overhead), the ceiling is **~8,000-10,000 users per bucket**.

Worse: `bucketKey` is `${tenantId}_${unitId}_${period}` and both default to `_global` / `_all` (lines 53-54, 115-116) for any user without `core.tenantId`. So **every non-community user in the entire app shares one bucket**. At 4,000 users this document is ~400-500 KB — already uncomfortable and already re-written in full nightly. At the partner's scale it simply exceeds 1 MiB and the batch commit throws, killing the whole rollup for every tenant in that batch.

**Fix:** write the ranking as documents, not an array — `leaderboard_snapshots/{bucketKey}/entries/{uid}` with a `rank` field, plus a small parent doc holding `{period, totalParticipants, rolledUpAt}`. Clients then read `orderBy('rank').limit(50)` instead of downloading everyone. Add a `where('tenantId','!=','_global')` guard or simply skip the `_global__all` bucket — a global leaderboard across 400k strangers is not a product feature anyway.

### F2 — [CRITICAL] `rollupLeaderboard` loads every shard for the period into memory

**`functions/src/leaderboard.ts:171-174`**

```
const shardsSnap = await db.collection('leaderboard_shards').where('period','==',period).get();
```

No `limit`, no cursor, no streaming. `onWorkoutCreate` (line 137-139) writes one deterministic doc **per user per day**, so a month's shards ≈ `DAU × 30`. At 4,000 DAU that is ~120,000 docs read in one shot into a default-memory function (no `memory` option is set on this `onSchedule` — it gets the 256 MiB default). At 400k DAU it is 12 M docs — an instant OOM and a 540 s timeout, plus **$7.20 of reads per nightly run**.

**Fix:** stream with a cursor — `.orderBy(FieldPath.documentId()).limit(5000)` in a loop with `startAfter`, accumulating into the bucket map and flushing snapshot writes per bucket as each bucket completes. Bump `memory: '1GiB'` and `timeoutSeconds: 540`. Better still: aggregate incrementally in `onWorkoutCreate` so the nightly job only has to sort, not sum.

Also note the composite index `leaderboard_shards (period ASC, tenantId ASC)` exists but the query only filters on `period` — fine, but the index is being maintained for a query nobody runs in this file.

### F3 — [CRITICAL] `unitLeagueRollup` runs hourly, fans out 7 reads per reservist, and uses one un-chunked batch

**`functions/src/unitLeagueRollup.ts:116-117`** — `schedule: '0 * * * *'` (hourly).

Three problems:

1. **Read fan-out** — line 94-95: `const refs = dates.map(...); await db.getAll(...refs)` inside a `Promise.all` over **every** `military_declarations` doc with `status=='reserve'` (line 86). That is `7 × R` reads per hour, `168 × R` per day.
   - R = 4,000 → 28,000 reads/hour, **672,000/day**, 20 M/month ≈ **$12/mo**. Tolerable but wasteful.
   - R = 400,000 → 2.8 M reads/hour, **67 M/day** ≈ **$40/day = $1,200/mo**, and the function will time out long before that.
2. **No concurrency cap** — `Promise.all` over R declarations issues R simultaneous `getAll` calls. At R in the thousands this saturates the gRPC channel and blows memory. No `memory` option is set on this `onSchedule` either → 256 MiB default.
3. **[HARD FAILURE] Single un-chunked `WriteBatch`** — lines 128-144 build one `db.batch()` containing one `set` per aggregate **plus** one `delete` per stale doc, then `await batch.commit()`. Firestore's limit is **500 writes per batch**. As soon as `aggregates.length + staleDeletes > 500` (i.e. ~500 units), `commit()` throws and the entire hourly rollup produces nothing — silently, since there is no try/catch.

**Fix:**
- Chunk the batch into groups of 400 (the codebase already does exactly this in `sendPushFromQueue.ts:505` and `push.service.ts:526` — reuse that pattern).
- Replace the per-reservist 7-doc fan-out with a single query per day: `dailyActivity where date == d and steps > 0` (index `dailyActivity (userId, date)` exists; you would want `(date, steps)`), or maintain a rolling `military_declarations/{uid}.weeklySteps` updated by `ingestHealthSamples` so the rollup reads R docs instead of 7R.
- Drop the cadence from hourly to every 6 h. A 7-day rolling average does not change meaningfully in an hour.
- Add `memory: '1GiB'`, `timeoutSeconds: 540`, and a `p-limit`-style concurrency cap of ~50.

### F4 — [HIGH] `resolveAudience` full-scans `users` for every push broadcast

**`functions/src/sendPushFromQueue.ts:346-410`**

```
const baseQuery = authorityId === 'all' ? db.collection('users') : db.collection('users').where('core.authorityId','==',authorityId);
if (audience === 'all')            { const snap = await baseQuery.select().get(); ... }        // line 352
if (audience === 'active_users')   { const snap = await baseQuery.select('lastActive').get(); } // line 363
if (park_users && !parkId)         { const snap = await baseQuery.select().get(); }             // line 388
if (park_users)                    { const authoritySnap = await baseQuery.select().get(); }    // line 410
```

The doc comment at lines 341-345 claims the implementation "deliberately uses small, indexed queries so that a city with millions of users does not require a full collection scan." It does the opposite — no `limit`, no cursor, and every uid is materialised into a JS `Set` in a 256 MiB function.

- 4,000 users: 4,000 reads (~$0.002) and ~200 KB of Set. Fine.
- 400,000 users: 400,000 reads per send, and 400k uid strings + Set overhead ≈ **80-150 MB** — plus the token fetch that follows. Expect OOM.
- `authorityId === 'all'` (root-admin global broadcast, line 348) removes even the city filter.

There is also no composite index for `core.authorityId` alone — Firestore's automatic single-field index covers it, so this query works, but `active_users`/`inactive_users` deliberately avoid a composite (comment at line 356-359) by fetching everything and filtering in memory. That is exactly the pattern that breaks.

**Fix:** page the query (`orderBy(documentId()).limit(2000)` + `startAfter` cursor) and process each page end-to-end (resolve tokens → multicast → prune) before fetching the next, so peak memory is O(page) not O(users). For `active_users`, add the composite index `users (core.authorityId ASC, lastActive DESC)` and query it directly instead of scanning.

### F5 — [HIGH] `retentionScheduler` scans the same first 200 users every day, forever

**`functions/src/retentionScheduler.ts:130-133`**

```
.collection('users').where('onboardingStatus','==','COMPLETED').limit(BATCH_LIMIT).get()
```

`BATCH_LIMIT` defaults to 200 (line 33). There is **no `orderBy` and no cursor**, so Firestore returns the first 200 documents in document-id order — **the same 200 users every single day**. Then it filters for inactivity client-side (lines 146-181), because "Firestore doesn't support field-absent OR field < X in a single query" (line 124-127).

Consequences:
- At 4,000 users, ~95% of the user base is **never** eligible for a retention push. This is a silent product failure, not just a perf issue.
- At 400,000 users it is 99.95%.
- The composite index `users (onboardingStatus ASC, createdAt ASC)` **exists** in `firestore.indexes.json` — it is simply not used by this query.

**Fix:** use the index that is already deployed. Persist a cursor (e.g. `app_config/retention_state.lastDocId`) and `orderBy('createdAt').startAfter(cursor).limit(BATCH_LIMIT)`, wrapping around at the end — every user gets scanned within `ceil(N/200)` days. Better: backfill `lastActive` to a sentinel on signup so the absent-field case disappears, then query `where('lastActive','<',cutoff)` directly with a `(onboardingStatus, lastActive)` index and stop scanning irrelevant users entirely.

### F6 — [HIGH] `onPlannedActivityCreated` does an unbounded geohash scan then fans out push to everyone it finds

**`functions/src/onPlannedActivityCreated.ts:117-147`** — `geohashQueryBounds(center, 3000)` produces up to 9 range queries over `userLocations`, each `.orderBy('geohash').startAt().endAt().get()` with **no `limit`**, all issued in parallel (line 127-136), then every returned doc is distance-filtered in memory.

In a dense city, a 3 km radius at 400k users could return **tens of thousands** of `userLocations` docs in a 256 MiB / 60 s function. Then line 125-127 merges them into a recipient `Set` and pushes to all of them — with no cap on recipient count.

This fires on **every** `planned_sessions` create. It is currently gated behind the `socialActivityNearbyPushEnabled` flag (line 78), which is the only thing keeping it safe.

**Fix:** add `.limit(200)` to each geohash range query, and cap the merged recipient set (e.g. 500, nearest-first by the distance already computed at line 144). Also add `maxInstances` to the function so a burst of planned sessions cannot spawn unbounded concurrent instances.

### F7 — [MEDIUM] Per-document write-rate ceiling

Firestore sustains ~1 write/sec per document. Checked the counter paths:

- `leaderboard_shards` **is correctly sharded** for feed posts — `leaderboard.ts:63-66` picks a random shard out of `NUM_SHARDS = 10`, giving ~10 writes/sec headroom per (tenant, unit, period, uid). Good.
- `onWorkoutCreate` (`leaderboard.ts:137-159`) writes a **deterministic per-user-per-day** doc inside a transaction. Not hot — a single user cannot generate >1 workout/sec.
- `unit_league_aggregates/{directoryId}` — written once per hour by the rollup. Not hot.
- `presence/{uid}` — one writer per doc. Not hot.
- **The one to watch:** `community_events/{id}.currentRegistrations`. `useCommunityEnrichment.ts:176` reads it, and the registration flow increments it. If a popular event opens registration to thousands simultaneously, that single field is a hot document. **NEEDS RUNTIME MEASUREMENT** — but the fix is standard: shard the counter or use a Cloud Function with a debounce, exactly as `leaderboard.ts` already does for XP.

### F8 — [MEDIUM] `maxInstances` is set nowhere

No function in `functions/src/` declares `maxInstances`. A Firestore-trigger storm (mass import, a migration, a bug loop) can scale any of these to the project's default concurrency ceiling and produce a surprise bill with no upper bound. Set explicit `maxInstances` on every trigger — particularly `onWorkoutCreate`, `onFeedPostCreate`, `chatMessageNotification`, `onKudosCreated`, and `onPlannedActivityCreated`.

---

## 5. Firestore data model & indexes

### 5.1 Index inventory

`firestore.indexes.json` — **81 composite indexes**, 0 field overrides. (Note: the file is JSON-with-comments; `JSON.parse` fails on it. `firebase-tools` strips comments so deploys work, but any custom tooling reading this file will break.)

By collection:

| Count | Collection | | Count | Collection |
|---:|---|---|---:|---|
| **39** | `feed_posts` | | 2 | `dailyActivity` |
| 6 | `users` | | 2 | `notification_clicks` |
| 5 | `community_groups` | | 1 each | `push_events`, `members`, `chats`, `community_events`, `streaks`, `pe_grades`, `leaderboard_shards`, `sessions`, `street_segments`, `marketing_links`, `challenge_submissions` |
| 4 | `workouts` | | | |
| 3 | `parks`, `presence` | | | |
| 2 | `user_contributions`, `curated_routes`, `official_routes` | | | |

**[MEDIUM] 39 composite indexes on `feed_posts`** is a write-amplification problem: every feed post write must also write ~39 composite index entries plus single-field entries. That inflates write latency and index storage (billed separately). Firestore's ceiling is 200 composite indexes per database — you are at 81, so there is room, but `feed_posts` alone consuming half the budget suggests the query surface needs consolidating. Audit which of the 39 are actually issued by live code; my read of the codebase suggests several are for admin/analytics views that could be served by one broader index plus client filtering.

Only 4 indexes are `COLLECTION_GROUP`-scoped (`members`, `notification_clicks` ×2, `challenge_submissions`) — and only `notification_clicks` has a matching `collectionGroup()` query in the code. Low risk here.

### 5.2 Queries whose index appears to be MISSING

These are static deductions from the query shapes; each needs confirmation from the Firebase console's index page or a `failed-precondition` in device logs.

| Query | file:line | Index required | Present? | Consequence |
|---|---|---|---|---|
| `planned_sessions where expiresAt >= now AND status in [...]` | `usePartnerData.ts:265-269` | `planned_sessions (status ASC, expiresAt ASC)` | **NO — `planned_sessions` has zero indexes in the file** | Listener fails `failed-precondition`. The error callback is `() => setIsLoading(false)` (line 279) — **the failure is completely silent**. The "planned arrivals" partner layer on the map is probably dead in production today. |
| `planned_sessions where parkId == AND expiresAt >=` | `useCommunityEnrichment.ts:656-660` | `planned_sessions (parkId ASC, expiresAt ASC)` | **NO** | Silent — `console.warn` only (line 691) |
| `planned_sessions where routeId in [...] AND expiresAt >= orderBy startTime` | `planned-sessions.service.ts:283-288` | `planned_sessions (routeId ASC, expiresAt ASC, startTime ASC)` | **NO** | fails |
| `planned_sessions where parkId == AND expiresAt >= orderBy startTime` | `planned-sessions.service.ts:333-338` | `planned_sessions (parkId ASC, expiresAt ASC, startTime ASC)` | **NO** | fails |
| `community_events where location.routeId in [...] AND isActive ==` | `useCommunityEnrichment.ts:346-350` | `community_events (isActive ASC, location.routeId ASC)` | **NO** — only `(tenantId, createdAt)` exists | fails; `console.warn` only (line 376) |
| `community_events where location.parkId == AND isActive ==` | `useCommunityEnrichment.ts:598-602` | `community_events (isActive ASC, location.parkId ASC)` | **NO** | fails |
| `community_events where authorityId == AND isActive == orderBy date` | `useArenaData.ts:164-169` | `community_events (authorityId ASC, isActive ASC, date ASC)` | **NO** | Arena events list fails |
| `active_workouts where authorityId in [...]` | `heatmap.service.ts:162-165` | single-field — OK | n/a | fine |

**This is the highest-value quick win in the whole audit after the map fixes.** Four collections' worth of user-facing real-time features may be silently returning nothing because the index is missing and every one of these error handlers swallows `failed-precondition` into a `console.warn`.

**Fix:**
1. Add the seven indexes above to `firestore.indexes.json` and deploy.
2. Change every one of those error callbacks to detect `err.code === 'failed-precondition'` and log loudly (the codebase already has this pattern done *correctly* in `usePartnerData.ts:155-163` and `usePresenceLayer.ts:466-472` — copy it).

### 5.3 Documents that grow unboundedly

| Document / field | Where written | Risk |
|---|---|---|
| `leaderboard_snapshots/{bucket}.rankings[]` | `functions/src/leaderboard.ts:221` | **CRITICAL** — array with one entry per user; hits 1 MiB at ~8-10k users. See F1. |
| `connections/{uid}.followers[]` | read at `onPlannedActivityCreated.ts:104-108`, `usePresenceLayer.ts:427-430` | **HIGH** — an append-only array of follower uids on a single document. At 30 chars/uid, 1 MiB ≈ 30,000 followers, but the real limit hits earlier: `usePresenceLayer.ts:427-430` chunks it into `in` queries of 30, so a user with 3,000 followers opens **100 simultaneous `onSnapshot` listeners**. Move to a `connections/{uid}/followers/{followerUid}` subcollection. |
| `community_groups/{g}/attendance/{id}` member lists | `useSharedSession.ts:105`, `usePublicGroupPhases.ts:89` | MEDIUM — grows with group size; fine for small groups, watch it for a 500-person community. |
| `military_declarations/{uid}.unitPathIds[]` | `unitLeagueRollup.ts:90` | LOW — bounded by org depth. |
| `users/{uid}` | many | MEDIUM — `users` docs are read whole in several hot paths (`push.service.ts:286`, `leaderboard.ts:118`). Every field added grows every read. Consider `.select()` on the server paths that only need `core.tenantId`/`core.unitId` (`leaderboard.ts:118` reads the whole doc for two fields). |

---

## 6. What needs runtime measurement, and exactly how

Nothing below could be settled from source alone.

| # | Question | How to measure |
|---|---|---|
| 1 | How much CPU/energy does `ParticleBackground` actually cost on the map? | Xcode → Product → Profile → **Energy Log** + **Time Profiler**, attach to the app, sit on `/map` idle for 3 min. Record avg CPU%. Delete `MapShell.tsx:545-549`, rebuild, repeat. Report the delta. |
| 2 | Does `useMapPerfMonitor`'s rAF keep the WebView awake? | Same setup. In the Time Profiler look for a `tick` frame at display cadence with the map static. Then comment out `AppMap.tsx:370` and re-measure. |
| 3 | Thermal state on device | The app already listens for `thermalStateChanged` (`src/lib/appForeground.ts:97`). Log it to Analytics with the current route, then look at `/map` vs other screens over a week. `.claude/knowledge/thermal-state-diagnostic.md` suggests this instrumentation partly exists — wire it to a dashboard. |
| 4 | `N_parks`, `N_route_adjacency`, `N_official_routes`, avg `chats` threads/user | Firestore `count()` aggregate queries (1 read each) from a scratch admin script. Plug into §2.3. |
| 5 | Actual Firestore reads per map session | Firebase console → Firestore → Usage, before/after a controlled 10-session test on a single test account. Or enable `setLogLevel('debug')` in the web SDK on a dev build and count `Listen`/`Query` responses. |
| 6 | Whether the missing indexes (§5.2) are actually missing | Firebase console → Firestore → Indexes. Cross-check against the 7 rows. Or run the app with the error callbacks temporarily changed to `console.error` and open the map. |
| 7 | Real bundle sizes per route | `npm i -D @next/bundle-analyzer`, wrap `next.config.mjs`, `ANALYZE=true npm run build`. Confirm `/map`'s first-load JS and whether recharts/lottie/tsparticles appear in the shared chunk. |
| 8 | Is `community_events.currentRegistrations` a hot document? | Firestore console → Usage → check for `RESOURCE_EXHAUSTED` / contention errors on that collection during a registration burst. |
| 9 | Does the map flash through before the gate covers it on a warm JS cache? | The code itself asks for this (`MapShell.tsx:970-980`). Test `/map` cold-launch and warm re-entry on a real device, both with and without a profile `authorityId`. |
| 10 | `leaderboard_shards` document count for the current period | `db.collection('leaderboard_shards').where('period','==','2026-09').count().get()` — tells you how close `rollupLeaderboard` is to OOM today. |

---

## 7. Prioritised action list

**Ship this week (map heat — small, safe, high confidence):**
1. Delete `ParticleBackground` from `MapShell.tsx:545-549` + the import at line 34. *(§M1)*
2. Duty-cycle or movement-gate the `rAF` in `useMapPerfMonitor.ts:72-141`. *(§M2)*
3. Add `compiler.removeConsole` to `next.config.mjs`; delete the `[A2-SPIKE]` block (`MapShell.tsx:112-148`) and the `[heat-diag]` log (`usePresenceStore.ts:68-74`). *(§M6)*
4. `next/dynamic` the `AnimatedFlame` in `AppHeader.tsx:26` so the 1.2 MB Lottie WASM leaves the map path. *(§3.2)*
5. Gate `useChatInbox` on `isOpen` in `ChatInbox.tsx:57`. *(§3.4)*

**Ship this month (cost + correctness before 4,000 users):**
6. Scope `fetchRealParks` to `authorityId` and stop revalidating on every open. *(§M3)*
7. Add the 7 missing composite indexes and make the `failed-precondition` handlers loud. *(§5.2)*
8. Scope the presence listener by `authorityId` (the index already exists) as an interim, geohash later. *(§2.2)*
9. Re-encode `public/images/gateway/*.png` to WebP + `next/image`; SVGO the muscle/equipment icons; delete the two unreferenced assets. *(§3.3)*
10. Chunk `unitLeagueRollup`'s batch to 400 writes and drop it to every 6 h. *(§F3)*
11. Give `retentionScheduler` a cursor so it covers the whole user base. *(§F5)*
12. Denormalise event avatars onto `community_events` to kill the N+1. *(§2.4)*

**Before onboarding the 400,000-user partner (architectural):**
13. Re-shape `leaderboard_snapshots` from one array-doc to an `entries` subcollection. *(§F1)*
14. Stream `rollupLeaderboard` with a cursor; raise memory. *(§F2)*
15. Page `resolveAudience` in `sendPushFromQueue`. *(§F4)*
16. Move route generation server-side with a shared per-city cache. *(§M4)*
17. Geohash-scope presence and cap it per cell. *(§2.2)*
18. Bound the `onPlannedActivityCreated` geohash scan and recipient set. *(§F6)*
19. Set `maxInstances` on every Firestore trigger. *(§F8)*
20. Move `connections/{uid}.followers[]` to a subcollection. *(§5.3)*

**Housekeeping:** remove the dead dependencies `leaflet`, `react-leaflet`, `@react-google-maps/api` and the dead hook `src/features/safecity/hooks/useSocialLiveMap.ts` (an unbounded global presence listener waiting for someone to import it).
