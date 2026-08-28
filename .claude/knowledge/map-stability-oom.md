# Map Stability — Dense-City Heat + Reload + Crash (OOM) Audit

> Read-only diagnosis, 23.07.2026. 4-agent fan-out (render load / memory leaks / perf-flag coverage / crash trigger).
> Symptom (David, on device): using the map in a **dense city** → phone heats up → app **fully reloads from scratch** → **crashes**. Classic OOM / memory-pressure signature.
> Fix #1 IN PROGRESS on branch `perf/map-facilities-viewport-cull` (from origin/main) — see §6.

---

## 1. Crash mechanism — native OOM, NOT app reload-on-error, NOT a leak

WKWebView web-content-process OOM kill + **default auto-reload of the remote `server.url`**:
- `capacitor.config.ts:14` — `server.url: 'https://outrun.co.il'`. The native shell renders a **remote** URL, so after iOS jettisons the web process WKWebView re-fetches the page = "reloads from scratch."
- The reload **is a cold boot** → re-runs the full heavy load → same pressure → dies again = the observed reload-then-crash loop.
- **No native memory handling anywhere:** no `webViewWebContentProcessDidTerminate` (`ios/App/App/ViewController.swift` — 44 lines, only gestures/scroll/autoplay), no `didReceiveMemoryWarning` / `onTrimMemory` / `onRenderProcessGone`. The app has zero visibility into the kill and no throttle/back-off.
- **No error boundary that matters:** `src/app/map/error.tsx` catches only sync render exceptions and does NOT reload; the generic `src/components/ErrorBoundary.tsx` wraps only the admin exercise editor — **the map is not wrapped**. `src/app/global-error.tsx` reloads only for `ChunkLoadError` (loop-guarded). `GlobalErrorOverlay` in prod only `console.error`s (never reloads).
- **Secondary reload amplifier:** `MapShell.tsx:394` renders `<AppMap>` only when `mode !== 'free_run'` → entering/leaving free-run **tears down and rebuilds the whole Mapbox WebGL instance** (comment: two Mapbox instances = GPU/memory issues).

**Not a classic leak.** The map tree is already OOM-hardened: react-map-gl owns `map.remove()`; no imperative `addLayer`/`addSource`/`new Marker`; map `.on` listeners torn down by identity (`AppMap.tsx:840-860`); all `onSnapshot`/intervals unsubscribe/clear; effect-dep churn memoized (`MapShell.tsx:337-372`). This is a **render-load / memory-baseline** problem, not accumulation.

---

## 2. Ranked suspects (the crash = #1 × #2)

### ⭐ #1 — Facility DOM markers: unbounded fetch + no viewport-cull  ← NEW, not in prior parked list
- `useFacilities.ts` called `InventoryService.fetchFacilities()` with **no scope** → `inventory.service.ts:163-165` else-branch returns the **entire national `facilities` collection** (no `where`/`limit`/bounds).
- `AppMap.tsx:1719-1746` rendered a DOM `<Marker>` for **every** facility of a visible type at `currentZoom >= 14`, filtered only by `visibleLayers.includes(f.type)` + finite coords — **no `viewportBounds.contains()`**. Default `visibleLayers = ['parks','routes','gym']` (`useMapStore.ts:344`), so `gym` markers mount by default.
- The smoking gun: partner markers **directly below** (`AppMap.tsx:1753-1759`) DO cull via `viewportBounds.contains([p.lng,p.lat])` + zoom≥15. The pattern was simply never applied to facilities. The team had already fixed the identical bug for park photo-bubbles (`AppMap.tsx:635-648` — "blew through Mapbox's WebGL marker buffer once a city's worth entered the viewport").
- **This is the one tier that scales directly with city density** → hundreds–thousands of persistent DOM markers re-projected every camera frame → high memory baseline + sustained heat → OOM.

### #2 — `onZoom` per-frame full-tree re-render (ungated; = parked P3)
- `AppMap.tsx:1269` — `onZoom={(e) => setCurrentZoom(e.viewState.zoom)}` fires on **every zoom animation frame**, re-rendering the 1807-line component and rebuilding all DOM-marker `.map()` arrays (facilities/partners/route-starts). Multiplies #1 ~60×/sec through every pinch/scroll/flyTo. Biggest **heat/CPU amplifier**.

### #3 — Per-tile Hebrew relabel full-style pass (partly mitigated)
- `AppMap.tsx:1175-1206` — `applyHebrewLabels` loops ~150 style layers calling `setLayoutProperty`, historically on **every** `sourcedata` tile event while panning ("the sustained-heat hot path"). `IS_PERF_BATCH1_ENABLED` gates it to `metadata`-only (`AppMap.tsx:1199`), cutting frequency, but dense-city panning still fires metadata events frequently. Dominant **GPU-memory** churn source (Mapbox-internal, app can't bound it) under prolonged pan; `workerCount=1` (`AppMap.tsx:57`) halves worker heap.

### Not suspects
- **Parks (~1162)** — the headline number is a **red herring**: `parks-clustered` is native GL clustering (`AppMap.tsx:1448`, `cluster:true, clusterMaxZoom:14`), GL-tiled, ~1162 points is trivial heap. (Fetched whole-collection unscoped though — `parks.service.ts:218/230`, a cold-boot amplifier.)
- **Routes (183+)** — capped at 3 (`useRouteGeneration.ts:123`), gated to focused (`MapShell.tsx:337-372`).
- **Gardens** — base-map fill tint / ordinary park pins, no per-item DOM.
- **Partners/presence** — viewport-culled + zoom-tiered.

---

## 3. Perf-flag coverage — dense-city PASSIVE BROWSE is a blind spot

All three `true` in prod: `feature-flags.ts:116` (Batch1), `:131` (Batch2 camera), `:141` (Batch2 presence). For "open app → map in dense city → pan, NO workout":

| Batch | Runs on browse path? | Real reduction? |
|---|---|---|
| Batch1 background-guard | No (foreground) | None — inert (`useIsForeground()`==true while visible) |
| Batch1 Hebrew relabel gate (`AppMap.tsx:1199`) | Yes | **Yes** — the only shipped browse win |
| Batch1 declutter guard (`mapStyleConfig.ts:135`) | style.load only | Minor (init-burst) |
| Batch2 camera (`useCameraController.ts:703,678`) | **No** — inside `follow` + `isNavigationMode||isActiveWorkout` (`:634`) | None — no-op |
| Batch2 presence (`usePresenceStore.ts:49-89`) | Yes | Partial — 2 listeners→1 only; query has **no `limit`/geo** (`:52`) so snapshot doc-volume + marker count stay unbounded |

**Unmitigated cost drivers on the browse path:** facility markers (#1), onZoom re-render (P3/#2), unbounded presence volume, always-on `usePartnerData` (P5, `DiscoverLayer.tsx:761` unconditional), full-accuracy idle GPS (P6, `useGPS.ts:45,193` fixed `enableHighAccuracy:true, maximumAge:0, 500ms`).

---

## 4. Cold-boot amplifiers (re-fire on every post-OOM reload)
- `fetchRealParks` — whole `parks` collection, no limit (`parks.service.ts:218/230`), on every AppMap mount.
- Facilities whole-collection (pre-fix) + Mapbox WebGL init + wall of `onSnapshot` (usePartnerData ×5, useCommunityEnrichment ×6, useGroupPresence, presence heartbeat + heatmap interval) + continuous GPS watch — all on map mount.

---

## 5. Highest-leverage fixes (for David)
1. **Facilities viewport-cull** — ✅ Fix #1 LIVE, §6.
2. **Kill onZoom per-frame `setCurrentZoom`** (=parked P3) + **idempotent Hebrew relabel** (=diagnosis #3) — 🔶 Fix #2+#3 committed, awaiting device test, §7.
3. **Native memory handler** — `webViewWebContentProcessDidTerminate` (iOS) + `onRenderProcessGone` (Android) → throttled/back-off reload instead of silent immediate. STILL OPEN.
4. **Bound `fetchRealParks`** (viewport/authority) so a reload doesn't reload the whole country into memory. STILL OPEN.

---

## 6. Fix #1 — STATUS: ✅ LIVE IN PROD (part (a) only), 23.07.2026
ff-pushed to origin/main `3d6bf79..51f500e` (mechanism B, no merge commit; build passed on device first). **Behind no flag** → deploys via Vercel git-integration → outrun.co.il ([[vercel-deploy-model]]). Rollback = revert the 7-line AppMap insert. Branch `perf/map-facilities-viewport-cull` was built in the `/appout-1-panel` worktree (the shared `/appout-1` checkout was swapped to `fix/park-image-resolver` mid-task — left untouched); branch now deleted (merged), `appout-1-panel` parked back on `main`. No remote branch existed (mechanism B).

- **(a) SHIPPED** — commit `993f895`. `AppMap.tsx` facilities block — added `if (viewportBounds && !viewportBounds.contains([f.location.lng, f.location.lat])) return null;` after the finite-coords gate (mirrors partners at `:1759`). Bounds WHICH markers mount to the viewport; does NOT change which facilities load.
- **(b) REVERTED** — commit `51f500e`. **Product decision (David, 23.07): users want to see ALL facilities on the map**, so the national fetch stays unscoped. The `core.authorityId` scope + hydration gate were removed; `useFacilities.ts` is byte-identical to origin/main again.

**Net branch diff vs origin/main = part (a) only** (7-line insert in AppMap.tsx). All facilities still load; only off-screen DOM markers are not mounted — the OOM mitigation is independent of scope, so the product decision costs nothing here.

**Device-test (dense city):** off-screen facility markers no longer mount; on-screen ones appear normally; all facility types still present; heat/OOM improved. If verified → push to origin/main (auto-deploys via Vercel git-integration → outrun.co.il, see [[vercel-deploy-model]]).

> Note: dropping the fetch-scope means the whole national facilities collection is still loaded into JS memory on map mount (a cold-boot amplifier, §4) — the viewport-cull only bounds the *rendered marker* count, not the fetched data. If memory baseline is still too high after device test, a bounds/geo-scoped fetch (not authority-scoped) would cut the loaded data without hiding any city's facilities.

---

## 7. Fix #2 + #3 — STATUS: ✅ LIVE IN PROD (origin/main = `8963cb9`)
Shipped to origin/main. Net diff = AppMap.tsx only (+49/-4). Type-clean.

- **#2 onZoom threshold** — `onZoom` now commits `currentZoom` only past a `ZOOM_COMMIT_EPSILON = 0.25` delta (functional setState returns `prev` unchanged → React bails the render). Kills the ~60/sec full-tree re-render storm during pinch/flyTo. Safe because every `currentZoom` consumer is a discrete integer breakpoint (`>=10/13/14/15`: lemur scale `:1554`, pulse dot `:1555`, facilities `:1720`, partners `:1760`, park photo `:668`) and `onZoomEnd` still commits the exact value at rest. **Unflagged** (rollback = revert).
- **#3 Hebrew relabel idempotency** — `applyHebrewLabels` now skips the full ~150-layer `setLayoutProperty` sweep once it has run (new `hebrewLabelsAppliedRef`); `debouncedHebrew` skips even scheduling the 50ms timer. A real `style.load` re-arms + force-re-runs via an `applyHebrewLabelsOnStyleLoad` wrapper (also updated the cleanup `off('style.load', …)` identity to the wrapper). **Gated by the existing `IS_PERF_BATCH1_ENABLED`** → flag-off is byte-identical (relabel-every-event).

**Device-test (dense city):** (a) pinch/zoom is smoother, no jank; markers (facilities/partners/lemur/photo) still appear/disappear at the right zoom levels (just resolve at gesture end). (b) Base-map place labels are still in Hebrew after prolonged panning and after any style change; panning heat reduced.

---

## 8. Accumulation deep-dive — what GROWS over 2-3 min → OOM (23.07.2026, 2-agent + direct)
**Key reframe: the accumulation is NOT in app-level code — it's mapbox's tile-texture cache × an uncapped canvas pixelRatio.** Sources/layers/markers/WebGL-contexts are all bounded and cleaned. Per section (map + bounded/unbounded):

- **§1 pixelRatio — ❌ UNCAPPED (biggest lever).** `<Map>` (`AppMap.tsx:1286`) sets no `pixelRatio` → canvas uses full `window.devicePixelRatio` (3× retina → **9× fragments** + 9× per tile texture). Team caps *pin icons* at 2× (`:839`) but never the canvas. → Fix §1.
- **§2 maxTileCacheSize — ❌ NOT SET.** No `maxTileCacheSize` anywhere in `src`. Relies on mapbox-gl's viewport-derived default (soft, no hard cap); each retained tile is 9× under §1. Both agents name the mapbox tile cache (under `workerCount=1`, `:58`) the prime steady grower while panning a dense city. → Fix §2.
- **§3 sources/layers — ✅ BOUNDED.** Map is 100% declarative react-map-gl; **zero** `addSource`/`addLayer`/`removeSource`/`new mapboxgl.Marker` in `src`; every `<Source id>`/`<Layer id>` uses a static string literal (none keyed by `route.id`/template) → react-map-gl reconciles + removes on unmount. Two sustained-but-bounded churn drivers: `live-path` grows monotonically **only during an active run** (`:1340`, setData `:1015-1023`); `partner-presence` re-uploads a fresh FeatureCollection per presence `onSnapshot` (`:1457`, geojson `:605-614`) — density-scaling GC/heat, not a leak.
- **§4 DOM markers — ✅ BOUNDED.** All markers stable-keyed (`f.id`/`p.uid`/`route.id`) → React reuses DOM; facilities+partners viewport-culled. No index/changing-value keys.
- **§5 WebGL contexts — ✅ CLEAN.** `reuseMaps` off; `map.remove()` on every unmount; cleanups thorough (`:860-880`). Free-run swap is sequential (AppMap#1 unmounts before FreeRunLayer's AppMap#2 mounts, `MapShell.tsx:394`/`FreeRunLayer.tsx:253`). Transient ×2 contexts (self-clearing) only when: contribution wizard open (`Step1LocationPicker.tsx:90`), location-gate (new users, `MapShell.tsx:746`), free-run sub-frame overlap. Minor JS-heap-only retention: `useFlyoverEntrance` `mapRefHolder` never nulled (frees GPU context anyway). ⚠️ repeated free-run/wizard toggling *could* compound if a cleanup regresses — instrument context count.
- **§6 continuous repaint — ✅ no per-frame loop in passive browse.** No `triggerRepaint`, no rAF touching the map, no animated dasharray/sky/fog. Only never-idle driver = active-run follow camera (`useCameraController.ts:721`, easeTo per GPS tick) — NOT passive. Density-scaling compositor churn: partner `animate-ping` ×N (`PartnerMarker.tsx:38`, only partner-finder open + zoom≥15), user `animate-ping` (`:1625`), presence `setData` (per-update). Relabel mitigated by §3-fix flag.
- **§7 native safety-net — ❌ ABSENT.** `AppDelegate.swift` = empty stubs, no `applicationDidReceiveMemoryWarning`; no `webViewWebContentProcessDidTerminate` in app code. Add: `webViewWebContentProcessDidTerminate(_:)` as `WKNavigationDelegate` on the `CAPBridgeViewController` subclass in `ios/App/App/ViewController.swift` (reload w/ back-off, not silent immediate) + `didReceiveMemoryWarning` override → bridge event to shed markers/tiles. **Handled separately.**

**Ranked passive-browse accumulators:** 1) §1 pixelRatio ×9 (baseline), 2) §2 uncapped tile cache × §1 (the "grows with panning"), 3) presence `setData` + partner `animate-ping` (heat/GC, not monotonic), 4) §7 gap (turns OOM into a crash loop). **Honest caveat:** no app-level unbounded leak found for *pure* passive browse — measure WebGL-context count + `performance.memory` before further code.

### Fix §1+§2 — STATUS: §2 🔶 committed (awaiting push); §1 ⛔ BLOCKED by mapbox-gl v2.15
Branch `perf/map-canvas-memory` in `/appout-1-panel`, commit `9095e8e`, on the `<Map>`. Type-clean.
- **§2 `maxTileCacheSize={45}`** — ✅ committed. Valid supported react-map-gl prop (`maxTileCacheSize` ∈ mapbox-gl `MapboxOptions`, forwarded at `react-map-gl/dist/esm/exports-mapbox.d.ts:64`). Conservative (viewport + one pan ring); tune by on-device memory measurement.
- **§1 `pixelRatio` — ⛔ NOT feasible in the current stack.** Verified: `mapbox-gl@2.15.0` has **no canvas-pixelRatio API** — `pixelRatio` is NOT a `MapboxOptions` constructor option (only `addImage`'s `ImageOptions.pixelRatio`, `@types/mapbox-gl:328`), and `setPixelRatio`/`getPixelRatio` have **0 occurrences** in the v2.15 runtime dist. Both were added in **mapbox-gl v3**. react-map-gl v7 *does* spread all props into `new Map(...)` (`mapbox.js:208-234`), so a `pixelRatio` prop WOULD reach the constructor — but the v2.15 constructor **silently ignores it** (no-op). David's specified `pixelRatio={...}` prop also fails tsc (react-map-gl's `MapProps` doesn't declare it). → Real §1 fix requires a **mapbox-gl v2→v3 upgrade** (breaking API changes — own scoped effort). Not shipped.
- ⚠️ origin/main advanced to `384e5b9` (David's hero-preview work, 2 commits) during this work — branch base is `8963cb9`; rebase onto `384e5b9` before push (hero commits touch different files → clean). §3–§6 untouched (clean); §7 separate.

---

## 9. Staged heat+crash fix plan (23.07.2026) — plan file `.claude/plans/keen-orbiting-whale.md`
David-approved 3-stage plan (safest first), executed one stage at a time with per-stage approval. Key corrections baked in: `antialias` is a verified no-op (v2.15 default false); mapbox v3 has **no pixelRatio API** (MapLibre feature) so §1 is done as an app-level `devicePixelRatio` override on the current v2, gated by an on-device spike.

- **Stage 1 — ✅ LIVE IN PROD** (origin/main `6afd969`, mechanism-B, no flag). Branch `perf/map-heat-relief`. **1a** (`a23053d`): removed the partner-marker infinite `animate-ping` glow (`PartnerMarker.tsx` — was one per-frame compositor layer PER visible partner at zoom≥15, the only idle-map GPU cost scaling with density). **1b** (`6afd969`): new `useThrottledValue` (leading+trailing, 750ms, mirrors useCameraController idiom) applied ONLY to the `partner-presence <Source>` data (`AppMap.tsx` — the heatmap re-tessellation churn); live `<Marker>` pins use un-throttled `visiblePartners` (stay responsive). User-marker ping kept (David's call). **NEXT: measure in prod before Stage 3.**
- **Stage 3 — ✅ MERGED to main** (origin/main `f2d7f9e`, mechanism-B, branch `perf/native-memory-safetynet`; commits A `e6d5a48` + B `f2d7f9e`). **Web part (`appForeground.ts`) deploys via Vercel now** (harmless listener for a native-only event); **native Swift ships with the next native release** — David builds/tests in Xcode when preparing the migration app version.
  - **Part A** (proactive shed, best-effort): `ViewController.didReceiveMemoryWarning` → `bridge.triggerWindowJSEvent("memoryWarning")`; `AppDelegate.applicationDidReceiveMemoryWarning` NSLog breadcrumb; `appForeground.ts` `window 'memoryWarning'` listener → store signal `lastMemoryWarningAt` + `useLastMemoryWarningAt()` selector. Concrete map-state shedding wired to the signal is a **follow-up**, gated on confirming (Simulate Memory Warning) the channel fires on device.
  - **Part B = the reliable loop-breaker**: `WebContentRecoveryProxy` (forwarding `WKNavigationDelegate`) installed in `viewDidLoad` after Capacitor sets its handler. Forwards every call to Capacitor via ObjC message forwarding (nav policy/`allowNavigation` preserved); overrides ONLY `webViewWebContentProcessDidTerminate` → backed-off reload (1s×2, cap 30s) + "מתחבר מחדש…" overlay instead of Capacitor's silent immediate `reload()` (`@capacitor/ios/.../WebViewDelegationHandler.swift:160`); observes `didFinish` to clear overlay + reset back-off. Proxy + Capacitor handler retained strongly (navigationDelegate is weak); raw VC NOT set as delegate. Test: force a real web-content termination in Xcode.
  - **Android counterpart — ✅ SHIPPED to origin/main (10.08), commit `cde0b58b`.** Sat committed-unpushed since 23.07 (`dd2e4b96` on branch `perf/android-memory-safetynet`); cherry-picked cleanly onto current main (only touches `MainActivity.java`, untouched by 300+ intervening commits) and pushed. Part A: `onTrimMemory`/`onLowMemory` → `bridge.triggerWindowJSEvent("memoryWarning")` (same shared web-side shed as iOS). Part B: `WebViewListener.onRenderProcessGone` returns `true` (Android does NOT kill the app process) → back-off `recreate()` (fresh Bridge+WebView, heavier than iOS's plain reload since the dead WebView is unusable) behind a "מתחבר מחדש…" overlay; `onPageLoaded` resets back-off. **⚠️ Native-only — pushing to git does NOT deploy this.** Unlike the web/TS fixes (auto-deploy via Vercel), this requires an actual Android native rebuild (Android Studio / new APK) before it takes effect on any device — merging to `main` only unblocks it from staleness, it is not "live" yet. Untested (no Android Studio build/adb memory-pressure simulation run) — verify before the next native release.
- **Stage 2 — spike-gated, last** (only if memory still binds after 1+3): `window.devicePixelRatio`→`min(native,2)` cap on current v2.15. **Step 2.0 = on-device spike FIRST** — prove (a) DPR is redefinable in WKWebView and (b) mapbox reads it live at init (not module-cached; if cached, useLayoutEffect is too late → move to app bootstrap). If the drawing buffer doesn't halve, Stage 2 is dead. If it passes: scoped to map mount/unmount with **crash-proof restore** (error boundary + pagehide fallback + idempotent) so the app can't get stuck at 2× globally.
