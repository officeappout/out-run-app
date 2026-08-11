# Idle Map Heat Investigation — 11.08.2026

> Triggered by David: the map heats the phone even with **zero other active players** on the map and **zero interaction** (phone just sitting open on the map screen). This directly contradicted the working assumption behind the same day's Governor/Monitor/Shed work (which targets *interaction*-triggered and *partner*-related load) — so a fresh, dedicated investigation was run via a 4-finder + adversarial-verify Workflow (`idle-map-heat-investigation`, 20 agents, ~1.55M tokens). Read-only, all file:line citations independently re-verified against live code by a second skeptical pass before being trusted. Full raw output: workflow journal for run `wf_a9cc97ad-581`.

**Not a "found nothing" result — 2 confirmed MAJOR causes, several moderate/minor, 2 confidently ruled out.**

## 1. MAJOR — iOS GPS chip held at maximum "navigation" accuracy continuously, all the time the map is open

- `src/features/parks/core/hooks/useGPS.ts:192-193` calls `Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }, ...)`.
- Native side: `node_modules/@capacitor/geolocation/ios/Sources/GeolocationPlugin/GeolocationPlugin.swift:56-67` maps `enableHighAccuracy: true` → `desiredAccuracy = kCLLocationAccuracyBestForNavigation` (the tier ABOVE plain `kCLLocationAccuracyBest`) and calls `locationManager.startUpdatingLocation()`. No `distanceFilter` is set anywhere (defaults to `kCLDistanceFilterNone` — every possible fix reported, not just post-movement ones). No `pausesLocationUpdatesAutomatically`/`activityType` configured either.
- Apple's own docs describe this tier as meant "for use in navigation apps that require precise position information at all times and are intended to be used only while the device is plugged in" — i.e. Apple itself flags this as an expected heat/battery driver when sustained, and it's being used here for a passive browsing screen, not turn-by-turn nav.
- **The only pause condition is `gpsPaused = !isForeground && !workoutActive`** (`useGPS.ts:120`). `isForeground` only reflects app backgrounding (`src/lib/appForeground.ts`, `document.visibilitychange`/Capacitor `appStateChange`) — nothing distinguishes "sitting still on the map" from "actively panning." **No idle/stillness detector exists anywhere in `useGPS.ts`, `useGPSStore.ts`, or `appForeground.ts`.**
- The existing JS-side throttle (`GPS_MIN_INTERVAL_MS=500`, `GPS_MIN_DISTANCE_M=3`, `useGPS.ts:45,49,205-213`) only filters which fixes become React state updates — it runs *inside* the native callback, meaning every fix has already crossed the WKWebView bridge (chip work + IPC already spent) before being discarded. It does not throttle the underlying CLLocationManager delivery rate at all.
- **This is a hardware-level, not JS-level, continuous cost** — matches David's exact report (idle, no interaction, no partners) better than any other candidate found.
- Fix direction (not yet built): step iOS down from `kCLLocationAccuracyBestForNavigation` to plain `kCLLocationAccuracyBest` (or add a `distanceFilter`) whenever browsing (not in an active workout/nav session) — reuse the existing `workoutActive` distinction already coded for the *pause* branch, applied to accuracy level instead. A genuine foreground-idle detector (no accepted position change + no interaction for N seconds → `clearWatch` + slow `getCurrentPosition` poll, re-arm on movement/interaction) is the fuller fix, mirroring the existing backgrounding-pause pattern.

**Android has the same class of gap, gentler** (`node_modules/@capacitor/geolocation/android/.../Geolocation.java:90-97,175`): fused location at `PRIORITY_HIGH_ACCURACY`, ~5-10s cadence, no `minimumUpdateInterval` passed by the app (defaults to 5000ms) — real, but Android's fused-location power management makes it meaningfully lighter than the iOS config. Same fix (step down while idle) helps both. Rated MINOR (vs iOS's MAJOR) on its own.

## 2. MODERATE — the user's OWN marker has two separate "forever" animations stacked on it

- `src/components/LemurMarker.tsx:18-49` — a framer-motion `<motion.div animate={{scale:[1,1.05,1]}} transition={{duration:2, repeat:Infinity, type:'tween'}}>` "breathing" loop, unconditional, no gate.
- `src/features/parks/core/components/AppMap.tsx:1790-1809` — a separate Tailwind `animate-ping` CSS halo (2.8s cycle, also infinite), in the code's own-labeled "Idle mode" branch (the default branch when `isNavigationMode` is false — i.e. exactly plain idle browsing).
- Both mount unconditionally at the default idle map view (default zoom 13, not navigating) — **this is the user's own marker, not a partner's** (partner-marker ping was already permanently removed earlier the same day — this is the identical bug class, missed on the user's own marker).
- Fix direction: drop `repeat: Infinity` (or cap to a few cycles), mirroring the already-shipped `PartnerMarker.tsx` fix. Cheap, low-risk, zero product cost.

## 3. MODERATE (needs a live check before prioritizing) — nationwide, not local, presence listener can trigger real Mapbox repaints

- `AppMap.tsx:1627-1632`'s `partner-presence` Source is fed by `activityFilteredPositions` ← `useGroupPresenceListener` (discovery mode, no `groupId`) ← `usePresenceStore.ts`'s ref-counted `verified_global` stream (`mode=='verified_global'`, `limit(200)`, **no geographic scope** — confirmed by the query's own code comment). Opens unconditionally the moment `MapShell` mounts (`MapShell.tsx:146`), untouched by the same-day Adaptive Shed work (which only gates `liveUsersVisible`/marker rendering, never closes this listener).
- Fires (throttled 750-2000ms via the Shed's dynamic throttle) on **any** verified user's presence write **anywhere in the country**, not just nearby ones — structurally explains "heats up with zero nearby players," since "nearby" was never actually the trigger condition.
- Whether this is *currently* significant depends on live nationwide concurrent-user count, which can't be determined from source alone — **recommended before prioritizing further work here: log `activityFilteredPositions.length` on David's own idle session** to see if it's actually non-empty/firing in practice.

## 4. MINOR — a small shimmer/hint button animates forever on the idle map screen

- `src/components/ui/ShimmerPhraseButton.tsx:41-51`, mounted from `DiscoverLayer.tsx:1425` whenever `HYBRID_SLOTS_ENABLED (hard-coded true) && mapMode==='idle' && isMapVisuallyReady` — i.e. the default resting state, no partner/session gate.
- A `setInterval(5000ms)` message-rotator (cheap) plus a separate, more expensive CSS `background-position` gradient animation (paint-triggering, not just compositor transform/opacity) running `infinite`.
- Low absolute impact (one small button, not full-screen). Fix direction: swap to a transform/opacity-driven shimmer. Low priority.

## Ruled out (checked carefully, confirmed negligible)

- **This same session's own `useMapPerfMonitor` rAF loop** (`src/features/parks/core/hooks/useMapPerfMonitor.ts`) — independently checked 3 times. Trivial per-frame arithmetic (bounded 30-element buffer, no DOM reads, no Mapbox calls), zero re-renders/zero store writes during healthy idle (the `emit()` early-return). Real but negligible — validates that today's earlier Monitor work is not itself contributing to the complaint.
- **The 2-minute presence heartbeat write** (`src/features/safecity/services/presence.service.ts:273,286-312`) — confirmed genuinely active during idle (not gated by `heartbeatOnly`), but a single small `setDoc` + 2 `console.log`s every 120s is orders of magnitude too infrequent/small to produce perceptible heat.

## Recommended order (per the investigation's own synthesis)

1. **GPS accuracy tier** (finding #1) — strongest, best-matched-to-symptom. Fix iOS + apply the equivalent cheaper fix to Android at the same time (same bug class).
2. **User's own marker animations** (finding #2) — cheap, low-risk, same fix pattern already proven on partner markers.
3. **Live-check the nationwide presence listener** (finding #3) before investing engineering time — determine actual firing rate on David's device first.
4. **Shimmer button** (finding #4) — low priority, whenever convenient.
5. No action needed on the FPS monitor or the heartbeat — both checked and cleared.
6. **If heat persists after the GPS fix ships and is device-tested:** stop reading code, move to on-device profiling (Xcode Energy Log / Instruments). Mapbox GL's own internal WebGL render/compositor behavior during idle could not be fully assessed from source alone — that's the next place to look, but it needs a profiler, not more static analysis.

## Status (11.08)

**Item 1 (GPS accuracy tier) — SHIPPED to `work/free-run-build`, uncommitted→committed, NOT yet pushed.** Approach taken: JS-only, no native Swift/Java patch (would have needed `patch-package` + `cap sync` + a new native build/App Store release — see plan for the full iOS-asymmetry reasoning). Instead: while `!workoutActive` and foreground, `src/features/parks/core/hooks/useGPS.ts` stops the continuous `watchPosition` subscription entirely and polls with the existing one-shot `getCurrentPosition` every 20s (`GPS_IDLE_POLL_INTERVAL_MS`) — this already reaches iOS's sane `kCLLocationAccuracyBest` tier (only reachable on the one-shot path, never on `watchPosition`) and lets the chip idle between fixes. The moment a workout/nav session starts, it switches straight back to the exact continuous watch used today, unchanged. Gated behind `IS_GPS_IDLE_POLLING_ENABLED` (feature-flags.ts), **default FALSE** — unlike this session's other flags (which defaulted true), given the elevated risk of a transition bug tracking a workout with no live GPS. code-reviewer PASS (2 non-blocking warnings, both fixed: native idle-poll error path now calls `Geolocation.checkPermissions()` to surface a revoked permission instead of leaving `permissionState` stale; `_setPermissionState('granted')` consolidated into the shared `processFix` so it only fires on an accepted fix, not moved earlier than before). tsc clean (492 baseline, unchanged). Full plan: `.claude/plans/cryptic-munching-gadget.md`. **Not yet device-tested** — needs the idle↔workout transition test specifically before David flips the flag (checklist in the plan's Verification section), not just "does the dot update while idle."

Items 2-4 (own-marker infinite animations, nationwide presence listener live-check, shimmer button) — not started.
