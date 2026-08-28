# Map Performance Watchdog — Investigation + Design (read-only, 23.07.2026)

> Companion to `map-stability-oom.md` (§1–§9). That file = "what leaks / what's the OOM". THIS file = **"what fires requests/load, when, how much concurrently, and how to govern it centrally."** 4-agent workflow (inventory · storms · monitoring · completeness-critic). Report only — no code touched.
> **Motivation:** native map apps get request-governance + a memory-governor from the OS. We run mapbox-gl-js in a WKWebView, so we must emulate that manually. Pieces already exist scattered (§2 tile-cache, presence 750ms throttle, onZoom threshold, Stage-3 native shed) → unify into **one governor**.

---

## 1. Request/load-source inventory

Mount chain: `MapShell.tsx` → `MapShellInner` (always) → `<AppMap>` when `mode!=='free_run'` (`MapShell.tsx:394`) + `DiscoverLayer` (discover) / `FreeRunLayer` (free_run, owns its own `<AppMap>`). GPS via `useMapLogic.ts:36`; heartbeat + group-presence + referral in `MapShellInner`.

**Legend:** Gov = governed today (✅ yes / ◐ partial / ❌ no). Cxl = cancelable.

| Source | file:line | Trigger · Freq | Throttled | Cxl | Gov |
|---|---|---|---|---|---|
| Mapbox TILES | `AppMap.tsx:1402` (`maxTileCacheSize={45}`), `:58` `workerCount=1` | pan/zoom | mapbox-internal | mapbox | ◐ cache-capped; **pixelRatio uncapped** |
| **PRESENCE `verified_global` onSnapshot** | `usePresenceStore.ts:52-53` | per-snapshot (many/sec dense city) | raw stream **NO**; only paint 750ms | unsub (ref-count) | ◐ 2→1 listener, but **query has NO limit/geo** |
| PARKS `fetchRealParks` | `parks.service.ts:218/230` (whole coll), called `AppMap.tsx:707` **and** `DiscoverLayer.tsx:526` | mount | no | abort= setState only, **net not cxl** | ◐ 6h SWR cache; whole-collection |
| **FACILITIES** | `inventory.service.ts:163-166` (entire coll, no where/limit), `useFacilities.ts:17` | mount once | n/a | **❌ none** | **❌ national getDocs, no limit/scope/abort/unmount-guard** |
| ROUTES `fetchOfficialRoutes` | `inventory.service.ts:305` (`limit(200)` + module cache) | route-gen | n/a | none | ✅ limited+cached |
| GPS watch | `useGPS.ts:192/248`, mount `useMapLogic.ts:36` | per-tick ~1-2Hz | ✅ 500ms + 3m | `clearWatch` | ◐ throttled+bg-pause; always high-accuracy idle (P6) |
| CAMERA easeTo | `useCameraController.ts:721` | per-GPS-tick (workout only) | ✅ 200ms + delta-guard | n/a | ✅ workout-only |
| usePartnerData ×4 | `DiscoverLayer.tsx:761` (**unconditional**) | discover mount, per-snapshot | no | unsub | ◐ (see below) |
| ↳ **community_events + registrations N+1** | onSnap `usePartnerData.ts:283`; `getDocs` per event `:319` | **N+1 getDocs re-run every snapshot** | no | **not cxl** | **❌ unbounded fan-out** |
| useCommunityEnrichment (routes) | `:352/428/448`, mount `DiscoverLayer.tsx:931` | routeIds change | no | unsub | ◐ routeIds≤30, avatars `limit(3)`; **broad groups query `:392` NO limit** |
| **useParkEvents (park-tap)** ⚠️critic | `useCommunityEnrichment.ts:601/627/659` +regs `:162`, mount `ParkDetailSheet.tsx:302` | park-pin tap; 3 onSnap + N getDocs | no | unsub | ❌ no limit on 3 queries |
| useGroupPresence pins | `useGroupPresenceListener.ts:26`, mount `MapShell.tsx:125` + `FreeRunLayer.tsx:149` | per-snapshot | no | unsub | ◐ discovery=shared unbounded stream; group=member-scoped |
| Referral toast | `MapShell.tsx:274` (single doc) | per-snapshot | no | unsub | ✅ single doc |
| Map HEARTBEAT (write) | `presence.service.ts:302` (2min), `usePresenceLayer.ts:347` | interval 2min | n/a | clearInterval | ✅ 2min + bg-pause |
| **Heatmap POLL** | `usePresenceLayer.ts:540` (60s) → `getHeatmapData` | interval 60s | n/a | clearInterval | ❌ **NOT bg-paused + result UNUSED** (`MapShell.tsx:121` discards) |
| Presence discover/friends onSnap | `usePresenceLayer.ts:489/439` | per-snapshot | no | unsub | ❌ **result UNUSED by MapShell**, redundant |
| onZoom setCurrentZoom | `AppMap.tsx:1376-1382` | zoom frame ~60/s | ✅ `ZOOM_COMMIT_EPSILON=0.25` render-bail | n/a | ✅ Fix#2 |
| Hebrew relabel | `AppMap.tsx:1313` | per-tile sourcedata | ✅ metadata-gate+idempotent+50ms | timer | ✅ Fix#3 |
| presence-heatmap setData | `AppMap.tsx:1557/676` | per-snapshot | ✅ 750ms | timer | ✅ Stage1b (paint only) |
| walk-to-route **Directions fetch** | `mapbox.service.ts` getSmartPath, `useWalkToRoute.ts:262` | focused-route | ✅ 500ms + per-routeId cache | **NO abort** | ◐ debounce; in-flight uncxl |
| useNearbyParks `getAllParks` | `useNearbyParks.ts:38` → `parks.service.ts:97` (whole coll, **uncached**) | drawer open | no | `cancelled` flag | ◐ one-shot but 2nd unbounded whole-parks getDocs |
| **reverse-geocode (city)** ⚠️critic | `useUserCityName.ts:274`→`location-utils.ts:101` `fetch(mapbox geocoding)`, mount `DiscoverLayer.tsx:497` | first GPS fix + every >1km move | ✅ 1km gate | **NO abort** (setState guard) | ◐ billable Mapbox round-trip |
| **searchAddress geocode** ⚠️critic | `mapbox.service.ts:219`, `useSearchNavigation.ts:86` | per-keystroke ≥3ch | ✅ debounce | no | ◐ + pulls cached parks/routes |
| commute Directions / route-stitching ⚠️critic | `mapbox.service.ts:188`, `route-generator.service.ts:976`, `route-stitching.service.ts:372/783` | route-gen | varies | no | ◐ |

**Excluded (verified not live-map):** GIS/elevation proxy (`gis-integration.service.ts:172` — admin import only), SafeCity map (`useSafeCityMap.ts`), workout heartbeat. **No** EventSource/WebSocket/SSE anywhere.

### Top ungoverned / uncancelable (ranked)
1. **FACILITIES** (`inventory.service.ts:163-166`) — the only source with *nothing*: no limit/scope/abort/unmount-guard. Whole national collection into heap on every mount.
2. **verified_global presence raw stream** (`usePresenceStore.ts:52`) — unbounded query volume; server pushes on every public user's presence change; only paint throttled. Scales with city density.
3. **usePartnerData registrations N+1** (`usePartnerData.ts:319`) — subcollection getDocs per event, re-run every snapshot, uncancelable.
4. **useCommunityEnrichment/useParkEvents broad-groups queries** (`:392`, `:601/627/659`) — `isActive==true` with no `limit()`.
5. **Wasted always-on**: heatmap poll (60s, not bg-paused) + presence-layer discover/friends listeners whose **results are discarded** (`MapShell.tsx:121`) — pure redundant load.
6. **Whole-`parks` getDocs ×2** — `fetchRealParks` (6h cache) + `getAllParks` (uncached). Both net-uncancelable.
7. **Uncancelable Mapbox HTTP** — reverse-geocode, searchAddress, Directions (getSmartPath/Alternatives) — debounced but no AbortController.

---

## 2. The request-storm map (what fires *simultaneously, uncoordinated* per trigger)

Ranked worst→mildest. 🔥 = multiple uncoordinated sources on one trigger.

**(a) MAP OPEN / COLD BOOT — 🔥 WORST + it is the crash-loop engine.** In one mount tick, zero sequencing: ~10 Firestore listeners (presence-layer discover + heatmap-poll + heartbeat, group-presence shared stream, referral, usePartnerData ×4, useCommunityEnrichment ×3) + **3 whole-collection fetches** (parks, facilities, official-routes) + reverse-geocode Mapbox fetch (`useUserCityName.ts:274`) + GPS watch + Mapbox WebGL init + ~150-layer Hebrew style sweep + **2 redundant declutter paths** (watchdog idle-safety `AppMap.tsx:827` vs style.load `:1336`) + **2 camera systems** (flyover `useFlyoverEntrance.ts:49` vs controller `useCameraController.ts:917`, only loosely deconflicted by `skipInitialZoom`). **Re-runs verbatim on every post-OOM auto-reload (§4) → the reload-then-crash loop.** Extra: `liveUsersVisible` defaults **true** (`useMapStore.ts:368`, forwarded over AppMap's `false` prop default) → presence heat + partner markers live from cold boot, silently defeating the "clean base map until finder opens" intent.

**(d) FREE-RUN ENTER/EXIT — 🔥 most destructive per-event.** Mode swap unmounts MapShell's AppMap and mounts FreeRunLayer's **own** `<AppMap>` (`MapShell.tsx:394` / `FreeRunLayer.tsx:253`) → destroys + cold-boots an **entire Mapbox WebGL instance** each direction (replays all of (a)'s Mapbox init: new GL context, ~150-layer sweep, declutter, tile re-download, listener re-wire). No warm-handoff, no `reuseMaps`.

**(c) ZOOM — 🔥 breakpoint burst.** onZoom epsilon-gate (`:1376`) tamed the per-frame storm, but a 14→15 crossing at `onZoomEnd` still simultaneously: mounts a viewport of facility markers (≥14) + partner markers (≥15) + fires the double viewport-write + rescales lemur + trips `breakFollow`. Four uncoordinated reactions on one gesture-end.

**(b) MAP MOVE / PAN — 🔥 mild.** `onMoveEnd` → `syncViewportToStore` does a **double `setViewportBounds`** (local `AppMap.tsx:1364` + global store `:1365`) fanning into 3 subtrees (AppMap, DiscoverLayer, useMapLogic→MapShellInner→AppMap-again; AppMap is **not** `React.memo`'d). **CONFIRMED: plain pan triggers ZERO network fetches** ("search this area" filters in-memory). Real cost = Mapbox-internal tile fetch/decode.

**(f) PARK / ENTITY PIN TAP — 🔥 uncoordinated fan-out ⚠️critic-added.** Opens `useParkEvents` 3 onSnapshot + per-event getDocs (`useCommunityEnrichment.ts:601/627/659/162`) **simultaneously** with `useWalkToRoute` recompute (Directions fetch) + camera `fitBounds`. Every pin tap.

**(g) SEARCH / ADDRESS TYPING — 🔥 per-keystroke ⚠️critic-added.** Each debounced keystroke: `searchAddress` Mapbox geocode + `getCachedParks` + `getCachedOfficialRoutes` (`useSearchNavigation.ts:80-92`).

**(e) PARTNER-FINDER OPEN — mildest.** The machinery is ALREADY hot (usePartnerData unconditional + `liveUsersVisible` default-true). Opening only adds RadarAnimation + PartnerOverlay + a throttled filter-sync loop. The "storm" attributed to it is really (a) that was already running invisibly.

**Cross-cutting coordination gaps:** double viewport-write (`AppMap.tsx:1364-1365`); two declutter paths; two boot camera systems; AppMap not `React.memo`'d (every GPS tick / store write re-renders the ~1937-line component); `liveUsersVisible` default-true.

---

## 3. Backpressure / cancel — have vs missing
- **AbortController:** parks (setState-guard only, net uncancelable) is the ONLY one. Facilities, walk-to-route Directions, reverse-geocode, searchAddress, commute Directions, N+1 registrations → **no cancel**. New request does NOT cancel the stale one anywhere.
- **onSnapshot:** all unsub on unmount (verified), but the **verified_global stream is unbounded** (no limit/geo) and at peak cold-boot ~10 listeners are open concurrently with no stagger; 2 of them (heatmap-poll consumer, presence-layer discover) have their **results discarded**.
- **Governed today:** tile-cache (45), presence-paint (750ms), onZoom (0.25), Hebrew relabel (Fix#3), GPS (500ms/3m + bg-pause), camera (200ms + delta-guard), heartbeats (interval + bg-pause), official-routes (`limit(200)`+cache), parks 6h SWR, reverse-geocode 1km gate, walk-to-route 500ms+cache, `IS_PERF_BATCH1/2` flags.
- **Fully ungoverned:** facilities, verified_global volume, N+1 registrations, broad-groups queries, heatmap-poll (not bg-paused), the uncancelable Mapbox HTTP fetches.

---

## 4. Monitoring — greenfield + a platform caveat that shapes the design
**Existing perf monitoring = NONE** (verified zero): no `performance.memory`, no FPS/frame-timing, no WebGL context counting, no perf SDK (Sentry/mixpanel/posthog/web-vitals/@vercel/analytics all absent). The only "watchdog" in code is an unrelated map-STYLE declutter watchdog (`AppMap.tsx:794-844`). Only sinks: `Analytics.logError` (`AnalyticsService.ts:429`, Firestore breadcrumb) + the Stage-3 `lastMemoryWarningAt` store signal.

⚠️ **CRITICAL platform caveat (new):** `performance.memory` is a **Chromium-only, non-standard** API — **WebKit / iOS WKWebView does NOT implement it.** So JS-heap sampling is *unavailable on our actual target*. The monitor CANNOT be heap-based. It must key on: **(1) FPS via `requestAnimationFrame` frame-delta** (works in WKWebView), **(2) the native `memoryWarning` signal** (Stage-3, the only real memory signal we get on iOS), **(3) `webglcontextlost`** on the map canvas (hard signal). This is the single most important correction for the monitor's design.

### Governance surface a watchdog would drive (existing knobs → make reactive)
| Knob | file:line | Drive under pressure |
|---|---|---|
| `maxTileCacheSize={45}` | `AppMap.tsx:1402` | → ~20 via `map.setMaxTileCacheSize()` (live, not just prop) |
| presence throttle `750` | `AppMap.tsx:241/676` | → 2000ms |
| `ZOOM_COMMIT_EPSILON 0.25` | `AppMap.tsx:566` | → widen |
| park-fetch AbortController | `AppMap.tsx:701-715` | proactively abort/gate re-issue |
| foreground pause seam | `appForeground.ts:40-46/106` | treat "pressure" like "backgrounded" — reuse heartbeat/partners/GPS pause |
| `lastMemoryWarningAt` (Stage-3 input) | `appForeground.ts:83-86/121` | **primary pressure trigger** (native→JS) |
| `HEATMAP_POLL_MS 60000` | `usePresenceLayer.ts:54/540` | pause (it's unused anyway) |
| `IS_PERF_BATCH1/2` flags | `feature-flags.ts` | kill-switches a governor can flip |
| `visibleLayers` / `liveUsersVisible` | `useMapStore.ts:37/73` | drop layers / hide partners |

**Home for the governor:** `useMapStore` (zustand singleton; already holds viewportBounds, visibleLayers, liveUsersVisible, facilities, isMapVisuallyReady). Add a `pressureLevel` field + actions (same idiom as `_signalMemoryWarning`). Read `useMapMode().mode` as the **safety gate** (never shed during `active`/`navigate` — mirrors the GPS hard-exception).

---

## 5. Watchdog design — one module, three roles

### (A) Request Governor — all map fetches route through `governedFetch`
- **cancel-in-flight:** `governedFetch(key, fn)` aborts the prior in-flight request for the same `key` (AbortController) → retrofit the uncancelable fetches (facilities, Directions, geocode, park-events, N+1). New request kills stale.
- **coalesce:** dedupe duplicate in-flight (the 2× `fetchRealParks` sites, 2× whole-`parks` getDocs) → one shared promise.
- **concurrency budget:** a semaphore caps parallel map fetches (e.g. ≤3–4); the cold-boot storm's ~3 whole-collection fetches + geocode + Directions queue instead of firing at once.
- **idle-debounce:** viewport/route-scoped fetches wait for Mapbox `'idle'` (map settled), not mid-gesture. (Most current fetches are mount-once, so this mainly future-proofs viewport-scoped fetching + the enrichment re-subscribes.)
- **bounded queries as config:** governor owns the limits — enforce `.limit()`/scope on facilities, verified_global (geo/limit), broad-groups, N+1. (These are also standalone quick wins — see §6.)

### (B) Monitor — FPS + native-signal + context-loss (NOT heap; see §4 caveat)
- rAF frame-delta sampler → rolling FPS; `webglcontextlost` listener; subscribe `lastMemoryWarningAt`.
- **Thresholds:** `warning` = FPS<40 sustained ~3s **OR** a native `memoryWarning`. `critical` = FPS<25 sustained **OR** `webglcontextlost` **OR** repeated `memoryWarning` within a window.
- Emit breadcrumbs via `Analytics.logError('map_degraded', …)` (only sink). Hysteresis so it doesn't flap.

### (C) Adaptive Shed — shed in ORDER on threshold, restore in reverse on recovery
Ladder (cheapest/least-visible → most drastic):
1. **Freeze non-critical fetches** — abort/queue geocode, Directions, park-events, community-enrichment; **pause the wasteful 60s heatmap poll** + the discarded presence-layer listeners. Keep GPS + active-workout writes.
2. **Drop markers** — `liveUsersVisible=false` (hide partner markers), drop `gym`/facility layer, presence → heatmap-only or clear.
3. **Kill animations + slacken paint** — user-marker ping / radar; presence throttle 750→2000ms.
4. **Reduce quality** — `maxTileCacheSize` 45→20; widen onZoom epsilon; (if Stage-2 DPR lands) drop pixelRatio.
5. **Backstop (out-of-band, native):** Stage-3 Part B `WebContentRecoveryProxy` — if we still OOM, the back-off recovery screen replaces the silent reload loop. The whole ladder exists to *avoid ever reaching this*.

**Recovery:** when FPS recovers and no `memoryWarning` for ~N s, restore levels in reverse with hysteresis (don't flap).

**Part A shed = rung 1–2 of THIS ladder, not a one-off.** The `memoryWarning` window event → governor → runs the ladder. That is the "concrete shedding" the Stage-3 Part-A comment (`appForeground.ts:116-119`) earmarked as a follow-up.

---

## 6. Gaps + effort + build order

**Connect (already exists):** all the §4 knobs, appForeground pause + `memoryWarning`, Stage-3 native (Part A trigger + Part B backstop), `IS_PERF` flags, the debounces/caches.
**Build new:** governor singleton (in `useMapStore`), `governedFetch` + AbortControllers on uncancelable fetches, concurrency semaphore, the FPS/context Monitor, the shed ladder + recovery.

**Recommended order (each its own branch, measure between):**
1. **Quick wins first — independent, shrink the baseline so the governor rarely fires** (S each): bound facilities (`.limit()`/scope), bound verified_global (limit/geo), add `.limit()` to broad-groups + park-events queries, **delete the wasteful heatmap-poll + the discarded presence-layer listeners** (`MapShell.tsx:121` — pure redundant load), coalesce the 2× parks fetches. Biggest load reduction for least code; no governor needed.
2. **Monitor (M)** — FPS + `memoryWarning` + `webglcontextlost`, emit breadcrumbs. No behavior change; gives the telemetry to tune thresholds. **Before shed** (need real thresholds first).
3. **Request Governor (M–L)** — `governedFetch` + AbortControllers + concurrency cap + idle-debounce; retrofit the fetch call sites.
4. **Adaptive Shed ladder (M)** — wire monitor thresholds + `memoryWarning` → the rung ladder → recovery; fold Part A in. Knobs mostly exist, so this is mostly wiring + hysteresis tuning.

Rationale: quick-wins are cheap and reduce how often anything else is needed; **Monitor before Shed** (can't tune shed thresholds without measurement); Governor is the structural spine the Shed drives.

---

## 7. Status update — 09.08.2026 (verified against live code, not carried over)

Re-checked in response to David's renewed heat complaint. **§6 step 1 (quick-wins) is fully shipped**, more than this doc's "nothing built" framing suggested:
- `23a88184` facilities viewport bounds-fetch — **on origin/main**
- `eef135da` verified_global presence `limit(200)` — **on origin/main**
- `2bcf6e67` drop dead-weight presence listeners — **on origin/main**, confirmed live: `MapShell.tsx:142` calls `usePresenceLayer(..., heartbeatOnly=true)`, which skips both the discover `onSnapshot` and the 60s heatmap poll (`usePresenceLayer.ts:546-551`) — genuinely inert, not just flagged
- `72ff5854` coalesce concurrent parks fetches — **on origin/main**
- Stage 1 (partner-ping removal + presence throttle) — **live**, `IS_PERF_BATCH1_ENABLED=true` in prod
- Stage 3 Part A+B (iOS native memory safety-net, `WebContentRecoveryProxy`) — **live**, `ios/App/App/ViewController.swift` has `webViewWebContentProcessDidTerminate`
- `dd2e4b96` Android Stage-3 counterpart — **committed but NOT pushed**, sits on local branch `perf/android-memory-safetynet` since 23.07. Ready to ship, just needs a push — flag it to David.
- `IS_PERF_BATCH2_ENABLED` (camera) and `IS_PERF_BATCH2_PRESENCE_ENABLED` — **both `true` in prod now** (were dormant/measuring as of the 18.07 memory snapshot).
- Canvas `pixelRatio` cap (§8 Stage 2 in `map-stability-oom.md`) — **still NOT shipped**. The only `devicePixelRatio` usage found (`AppMap.tsx:910`) caps *pin icon* rendering only (pre-existing, unrelated), not the canvas/drawing-buffer. Confirms the doc's "⛔ blocked on mapbox-gl v3" status is still current.
- §5 (A) Request Governor, (B) Monitor (FPS/memoryWarning/webglcontextlost), (C) Adaptive Shed ladder — **none built**. No `governedFetch`, no FPS sampler, no `pressureLevel` in `useMapStore` found anywhere in `src/`.

**Net: the cheap, high-leverage layer is done. What's left is the expensive structural layer (Governor/Monitor/Shed) plus two loose ends (Android safety-net push, Stage 2 DPR spike).** If heat persists post-quick-wins, the next lever is either finishing Stage 2 (spike-gated on mapbox-gl v2→v3, its own scoped effort) or starting §5's Monitor (cheapest of the three, no behavior change, gives real on-device numbers before committing to the Governor build).

New, previously-unaudited findings from this pass: [[schedule-editor-perf-audit]] (TrainingPlannerOverlay — ~115-145 Firestore reads per open/edit, unrelated to the map) and [[onboarding-map-location-perf-audit]] (UnifiedLocationStep — serial network chain + uncached whole-country `getAllParks()`, shares root component with the map's location-gate).

## 8. §5B Monitor — ✅ BUILT (10.08), local commit `c78ab642`, not pushed

New `useMapPerfMonitor` hook (`src/features/parks/core/hooks/useMapPerfMonitor.ts`), wired into `AppMap.tsx` via one hook call. Computes `pressureLevel` ('normal'|'warning'|'critical') into a new `useMapStore.pressureLevel` field from: FPS (rAF frame-delta, sustained-threshold state machine, thresholds exactly as designed in §5B — warning <40fps/3s, critical <25fps/2s), the existing `lastMemoryWarningAt` native signal (single=warning, repeated-in-15s=critical), and `webglcontextlost` (immediate critical). Emits `Analytics.logError('map_degraded', ...)` breadcrumbs on level transitions (30s cooldown).

**Pure observability — verified zero behavior change** (independent code review): nothing else in the codebase reads `pressureLevel` yet, no markers/fetches/rendering touched. Two minor timer-correctness bugs (stale recovery-timer on non-FPS escalation paths; missing rafId null-out) found in review, fixed before commit.

**✅ SHIPPED (10.08)** — `fcefd1ca` on origin/main, alongside the MapShell stagger fix (`54833f5f`) and the onboarding-location PR (`62d2d310`) — David asked to push all three straight to production in one go to test live on his phone, rather than staging device-verification before push as originally planned. Deploying via Vercel git-integration → outrun.co.il. Watch analytics for `map_degraded` breadcrumbs over the next few real days of usage — that's the real data the Governor's thresholds should eventually be tuned against.

**§5A Request Governor: ✅ BUILT (10.08), 4 local commits on work/free-run-build, all independently code-reviewed PASS.** Planned via `.claude/plans/cryptic-munching-gadget.md` (David asked for a plan first, then caught a 3rd existing coalesce precedent — `hybridTrioInflight` in DiscoverLayer.tsx — before build started, confirmed compatible with the design). New `src/lib/requestGovernor.ts` (`withCoalesce` + `withCancelPrevious`, generalizing 3 patterns already proven live in this codebase). Wired into 4 real call sites across 4 commits: `91cba34d` (utility + mapbox.service.ts signal passthrough, zero behavior change), `d7a544f5` (useWalkToRoute.ts — closed a real stale-data bug, not just perf), `ea18e286` (address-search typeahead + commute Directions), `faec5a8f` (useUserCityName's 3 independent instances — coalesced, not cancelled, since they want the same answer not to cancel each other). One suspected call site (`useSearchNavigation.ts`'s `fetchNavigationVariants`) turned out to be dead code — confirmed zero live callers, excluded. **✅ SHIPPED (10.08)** — `3dc157bf..bba82095` on origin/main, David asked to push directly to test live rather than wait. Deploying via Vercel.

**§5C Adaptive Shed: ✅ BUILT (10.08), 2 local commits on work/free-run-build, both independently code-reviewed PASS.** Planned via `.claude/plans/cryptic-munching-gadget.md` (David pushed back on treating this as separate from "the big project" — correctly: Governor+Monitor+Shed together ARE the one project, Shed is just its final, reactive piece). Verified two things that changed scope from the original sketch: (1) `maxTileCacheSize` live-adjustment is NOT achievable — no `setMaxTileCacheSize()` exists in mapbox-gl v2.15, react-map-gl doesn't reactively re-apply that prop either — rung dropped, not attempted as a fragile private-internals hack; (2) no separate hysteresis needed in the Shed itself since `pressureLevel` is already sustain-timer-protected at the Monitor. Deliberately conservative 3-tier design (only 'critical' does anything visible; 'warning' only slackens an already-invisible throttle) given the Monitor has only run in prod briefly — thresholds are unvalidated. New `IS_ADAPTIVE_SHED_ENABLED` flag (default true, same pattern as `IS_PERF_BATCH1/2_ENABLED`) is the rollback path if so. Commits: `64765677`/`47f4bed4` on origin/main (`b15ba07c`/`20bb5201` locally — cherry-picked+pushed 10.08) — flag + new `useAdaptiveShed.ts` hook + AppMap.tsx dynamic presence throttle + usePartnerData.ts's 4 listeners pausing under critical (caught+fixed a Rules-of-Hooks bug myself mid-edit: the derived boolean must be flag-gated, never the hook call itself). ✅ SHIPPED.

**⚠️ 11.08 correction — a fresh idle-heat investigation (see `idle-map-heat-investigation` workflow, same day) found the Shed likely addresses a SECONDARY driver, not the primary one.** David reported heat persists at pure idle with ZERO other players present — meaning partner-marker/listener load (what the Shed sheds) isn't the dominant cause. The investigation's #1 finding: iOS GPS watch runs continuously at `kCLLocationAccuracyBestForNavigation` (Apple's most power-intensive tier, meant for plugged-in turn-by-turn nav) for the ENTIRE time the map is open and foregrounded, with zero idle/stillness step-down — a hardware-level cost, unrelated to the Shed's Firestore/marker/animation-side levers entirely. See the workflow's full findings (11 checks, 2 confirmed major, several moderate/minor, 2 ruled out including this session's own Monitor) for the complete ranked list. GPS fix is next, not yet started.

Deferred to a future follow-up (not this session): pausing `useCommunityEnrichment`'s broad listener (zero existing pause mechanism, unlike usePartnerData), dropping the gym/facility layer (needs its own snapshot-vs-user-preference tracking like partner visibility got).

## 9. Phase 1 "bound the rest" — ✅ BUILT (10.08), local commit `e28567ea`, planned via `.claude/plans/cryptic-munching-gadget.md`

David asked to plan before continuing — full re-verification of every remaining §1/§3 item against LIVE code (not stale 23.07 line numbers) surfaced a useful split the original audit didn't make explicit:
- **Category A** (this file's §5A Governor) — racing/uncoordinated Mapbox HTTP calls needing real `governedFetch` infra (keyed AbortController + coalescing). **Confirmed: no such utility exists anywhere in the codebase** (full-repo search). Still not built — genuinely separate, bigger effort.
- **Category B** — plain unbounded/N+1 Firestore reads, fixable with the exact same proven `limit()`/cache-swap pattern already shipped 3× today. **This is what shipped as Phase 1:**
  - `usePartnerData.ts` community_events query — `limit(100)` added (was fully unscoped, feeding a per-event registrations N+1 that re-ran on every unrelated community_events change — the single biggest remaining recurring passive-browse cost)
  - `useCommunityEnrichment.ts` broad community_groups catch-all — `limit(100)` added (a stale code comment already claimed this cap existed; it didn't)
  - `useNearbyParks.ts` — swapped raw `getAllParks()` for cached `fetchRealParks()`
  - `inventory.service.ts` — new `fetchAllFacilitiesCached()` (mirrors `fetchRealParks`'s cache pattern exactly) for the one remaining uncached whole-collection facilities call (`useSearchNavigation.ts`'s nav-variants fetch); `fetchFacilities()` itself untouched for its scoped (admin) callers

Independently code-reviewed (PASS, no findings). **✅ SHIPPED (10.08)** — `cde0b58b..43ca3afc` on origin/main, deploying via Vercel. David asked to push directly rather than wait for a device pass first. Watch for: partner-finder still shows partners, park-detail community sessions populate, "navigate to address" still shows nearby water/gym icons.

**Explicitly NOT fixed:** the N+1 shape itself in `usePartnerData.ts` (one `getDocs` per event for registrations) — `limit(100)` only bounds the fan-out width, doesn't eliminate it. Real fix needs either a denormalized participant list/count on the event doc, or a `collectionGroup('registrations')` query (unverified whether registration docs carry a back-reference `eventId` field to support one). Flagged, not attempted.
