/**
 * Feature Flags Configuration
 * 
 * COIN_SYSTEM_PAUSED: The coin/economy system is temporarily frozen.
 * Re-enable in April by setting IS_COIN_SYSTEM_ENABLED = true
 */

// COIN_SYSTEM_PAUSED: Set to true to re-enable the coin economy system
export const IS_COIN_SYSTEM_ENABLED = false;

// AEROBIC_SOLO: Ready for device verification. Shell is TSC-clean + fully wired.
// While false, solo workouts use SummaryOrchestrator (FreeRunSummary) as fallback.
export const AEROBIC_SOLO_ENABLED = true;

// COMMUNITY_FEED_PAUSED: Social feed is hidden for the MVP.
// Set to true to re-enable automatic post creation on workout completion.
export const IS_COMMUNITY_FEED_ENABLED = false;

// HYBRID_SLOTS: Adaptive "מה עושים היום?" slot entry on the map (Phase 1).
// A prominent on-map button opens a floating carousel of resolver-driven slots
// (recommended hybrid + aerobic quick-start). While false, the free-run flow is
// BYTE-IDENTICAL — no entry button, no 'slots' step; the existing FreeRunDrawer
// toggle+slider hybrid path is untouched.
// Live before single-save (Phase 2): hybrid is display-only (0 XP credit) and has no active users.
// ⚠️ Do NOT wire real XP until single-save closes — else double-count.
export const HYBRID_SLOTS_ENABLED = true;

// HYBRID_SLOT_PREVIEW: Draw a slot's route on the map the moment the carousel
// settles on its card (compose-on-settle), matching discover cards — instead of
// only on the "צא לדרך" CTA. READ-ONLY: composes + draws (setFocusedRoute) only;
// never saves, never touches runHybridPlan/finishHybrid (single-save invariant
// intact). While false, the slot layer is BYTE-IDENTICAL — the route appears
// only on the CTA (current behaviour). Sub-flag of HYBRID_SLOTS_ENABLED.
export const HYBRID_SLOT_PREVIEW_ENABLED = true;

// HYBRID_FULL_PARK_WORKOUT: the "אימון מלא בפארק" slot — walk to the nearest EQUIPPED
// park, do the FULL home-recommended strength workout there, walk back (reuses the home
// recommendation instead of the budget-split station). DEFAULT FALSE. Sub-flag of
// HYBRID_SLOTS_ENABLED; additionally gated at runtime on (equipped park nearby AND the
// user has a strength program). While false, the slot layer is BYTE-IDENTICAL — the card
// is never surfaced and the new compose branch (composeFullParkWorkout) is never entered.
// ⚠️ Still display-only XP (0 credit) — do NOT wire real XP until single-save closes.
export const HYBRID_FULL_PARK_WORKOUT_ENABLED = true;

// MAP_ROUTE_STOPS_V1: the general "מסלול + עצירות" slot — a loop GENERATED from the
// user's own location (same generateDynamicRoutes machinery + maxRoutes:3/pick-closest fix
// as the other 2 hybrid cards — resolveRouteStopsBackbone's 'generated_loop' mode), with
// every real park/POI within 180m of that loop becoming a generic stop (strength/stretch/
// core), produced by the EXISTING budget-split engine (composeHybridSession). full_park is
// the special case (one stop = one park); this is its generalization. DEFAULT FALSE =
// kill-switch. Sub-flag of HYBRID_SLOTS_ENABLED; gated at runtime on GPS + at least one real
// stop resolving from the parks collection along the generated loop.
// ⚠️ Comment corrected (08.08.2026): this used to say the backbone is "a REAL official_route"
// / "the published route nearest the user" — that was the ORIGINAL pilot design (the
// `existing_route` backbone mode still exists in resolveRouteStopsBackbone for a possible
// future decision) but is NOT what's wired today. The real data dependency is the `parks`
// collection's per-POI fields (category/facilityType, natureType, urbanType, gymEquipment —
// read by mapParkToStop), not a curated official_routes document.
// While false, the slot layer is BYTE-IDENTICAL — the card is never surfaced, the new compose
// branch (mode:'route_stops' → composeRouteStopsWorkout) is never entered, and full_park + the
// budget-split path are untouched.
// ⚠️ Display-only XP (0 credit) like all hybrid — do NOT wire real XP until single-save closes.
// TRUE (08.08.2026, David-approved after a readiness summary): composeRouteStopsWorkout has
// NO end-to-end automated coverage (only its pure sub-pieces — resolveRouteStops's dedupe,
// planFromPoint's ordering — are unit-tested); this flip is this code path's first-ever
// execution, live or in test. Accepted given 0 real users today (store build is David-only,
// replacing the old app in 1-2 weeks — see project memory), an instant kill-switch, and all
// 4 previously-silent gates now degrading to a real fallbackHint instead of a silent bounce.
// David device-tests immediately after this ships, same pattern as MAP_REC_ENGINE_RANKING_V1.
export const MAP_ROUTE_STOPS_V1 = true;

// STRENGTH_ASSESSMENT_PROMPT_CARD_V1: the "אימון מלא בפארק" slot's own gate
// (HYBRID_FULL_PARK_WORKOUT_ENABLED && (MAP_OVERVIEW_CHROME_V1 || (hasEquippedPark &&
// hasStrengthProgram)), hybrid-slots.ts resolveSlots) is effectively defeated today —
// MAP_OVERVIEW_CHROME_V1 is already true in prod, so the OR short-circuits and the card
// shows to EVERY user, including one with zero active strength programs (bug found
// 08.08.2026: composeFullParkWorkout still gates safely underneath via
// hasAssessedStrengthDomain, so nothing crashes/mis-levels — the card itself is just a
// dead end for that user, offering a workout it can't actually build a real level for).
// DEFAULT FALSE = kill-switch: while false, resolveSlots' full_park branch is BYTE-
// IDENTICAL (always pushes 'full_park', the pre-existing behaviour). TRUE → when
// !env.hasStrengthProgram, REPLACES 'full_park' with a new 'assessment_prompt' slot
// (no compose — its CTA navigates straight to startMiniDomainAssessment(router, 'push'),
// same domain fallback DiscoverLayer's onAssessmentLink already uses) instead of adding
// alongside it. A user WITH a strength program still sees 'full_park', unchanged.
// TRUE (09.08.2026, David-approved after review — code-reviewer PASS + independent
// adversarial logic review, both clean, no blocking findings). Neither the badge fix nor
// this substitution has been visually verified in a browser/device (no access from this
// environment) — David verifies directly, same pattern as every other flag this session.
export const STRENGTH_ASSESSMENT_PROMPT_CARD_V1 = true;

// MAP_REC_ENGINE_RANKING_V1: the unified rec-engine's PULL ranking, wired into DiscoverLayer's
// hybrid slot carousel (useSuggestionEngineStore → applyRankedSlotOrder). This specific wiring
// shipped WITHOUT a flag initially (08.08.2026), unlike every other piece of this build-out;
// added retroactively before the app goes to real users. While false: applyRankedSlotOrder is
// never called, the ranking useEffect never fires, resolveSlots' output (baseSlots) reaches the
// carousel completely unchanged — byte-identical to before this flag existed.
// TRUE (08.08.2026, David-approved): device smoke-test happens post-flip, not pre-flip — David
// verifies directly on his device right after this ships. MAP_ROUTE_STOPS_V1 stays a SEPARATE,
// deliberately untouched decision — it gates the whole route+stops feature, not just ranking.
export const MAP_REC_ENGINE_RANKING_V1 = true;

// LEAGUES: Arena / leagues surface inside /community. Independent of the feed
// so leagues can ship to stores while the social feed stays paused. Runtime
// control lives in system_config/feature_flags.enable_leagues; this compile-time
// constant mirrors the feed pattern for any future compile-time guard.
export const IS_LEAGUES_ENABLED = true;

// UNIFIED_ROUTE_CARDS: Text-only, aerobic-style route cards across all three
// bottom carousels (RouteCarousel · BottomJourneyContainer · HybridSlotCarousel).
// While false, each carousel renders its current production card (no regression).
// Set to true to switch to the unified text-only design (name + distance + time
// + DifficultyBolts + CTA, no top image). Rollout-safe compile-time guard.
export const UNIFIED_ROUTE_CARDS_ENABLED = true;

// CONTEXT_AWARE_SELECTION: The park/home execution-method + context fix.
// Master flag that gates TWO coupled behaviours which MUST ship together (else a
// park with real equipment but a stale distance-picked context produces sparse
// workouts in the in-between window):
//   (1) Refill routing — guarantee/david/warmup/cooldown/domain-rescue/recovery
//       resolve their method via selectMethodForContext (park→bodyweight→exclude,
//       never home) instead of executionMethods[0] (authored home-first → leak).
//   (2) Coverage-aware context — resolveWorkoutContext picks the EQUIPPED park
//       within 2 km that actually covers the user's domain quotas (else home),
//       replacing distance-only detectNearbyPark + the GPS-timeout guard.
// While FALSE, both paths are BYTE-IDENTICAL to today: refill sites fall back to
// executionMethods[0] and the entry points use the legacy resolveParkEquipmentIds.
// Selector extraction (Phase 0) is unconditional and inert regardless of this flag.
export const CONTEXT_AWARE_SELECTION_ENABLED = true;

// ASSUMED_HOME_GEAR: In home/office/school contexts, assume placed-existing
// fixtures (door, chair, wall, floor, towel) that need no user marking, so
// improvised home methods aren't blocked for sparse-profile users. Sub-flag of
// CONTEXT_AWARE_SELECTION. While FALSE, home gear is profile-only (today's set).
export const ASSUMED_HOME_GEAR_ENABLED = true;

// SWAP_ALL: Generic per-dimension bulk/single "swap all → <value>" in the workout
// preview drawer (Phase 1 = location home/park/street). Gates BOTH the workout-level
// bulk control AND the per-exercise MEV method-writer (`onMethodChange`). While
// FALSE, the drawer + MasterExerciseView are BYTE-IDENTICAL to today: no bulk control
// is mounted and `onMethodChange` is never passed, so MEV stays strictly read-only.
// This is the ONLY production rollback for the feature — keep it as a hard kill-switch.
// DEFAULT FALSE until code-review + live smoke pass.
export const SWAP_ALL_ENABLED = true;

// PERF_BATCH1 — single kill-switch for the Batch-1 heat/battery fixes. When
// FALSE, every gated site below is byte-identical to prior production behaviour
// and the change is instantly reversible; flip to TRUE to enable + measure.
// (Fix 1 — disabling the useUserCityName debug-log spam — is intentionally NOT
//  gated: it is pure log removal with no behavioural effect.)
//
// Gated behaviours:
//   • Background guard (Fix 2) — pause the map presence heartbeat, the four
//     partner-finder listeners, and the discovery GPS watch while the app is
//     backgrounded. HARD EXCEPTION: the GPS watch is NOT paused during an
//     active workout/nav session (useSessionStore.status ∈ {active, paused}),
//     so a run keeps recording with the screen off. When false, useIsForeground
//     stays permanently true → no pausing, tracker never initialises.
//   • Map declutter idempotency guard (Fix 3) — skip the repeated full-style
//     declutter sweeps after the first successful pass. When false, every call
//     runs the full sweep exactly as before.
//   • Hebrew relabel gate (Fix 3) — relabel only on source 'metadata' events,
//     not on every tile. When false, relabels on every 'sourcedata' as before.
export const IS_PERF_BATCH1_ENABLED = true;

// PERF_BATCH2 — single kill-switch for the Batch-2 map-render fixes. When
// FALSE, every gated site is byte-identical to production and the change is
// instantly reversible; flip TRUE to enable + measure. Milestone 1 = CAMERA
// only (useCameraController), the largest remaining heat source on an active
// run:
//   • Delta-guard — skip the follow easeTo when the camera is already ~here
//     (moved <1.5 m AND bearing Δ<1.5°) and no pitch/zoom state transition is
//     pending. A redundant easeTo redraws the full 3-D scene every GPS tick.
//   • Transition-ease cap — 800 ms→400 ms so a state-transition ease settles
//     before the next GPS sample (≤500 ms), letting the map reach 'idle'
//     between samples instead of rendering continuously through turns/pauses.
// When false: the guard never runs (flag is the first && operand) and the ease
// duration keeps its original 800/200 literals. Sim (jumpTo) is never gated.
export const IS_PERF_BATCH2_ENABLED = true;

// PERF_BATCH2_PRESENCE — independent sub-flag for the P4 presence-stream
// unification, kept SEPARATE from IS_PERF_BATCH2_ENABLED (camera) so presence
// can be rolled back on its own. When FALSE, useGroupPresence (discovery) and
// usePartnerData each keep their own `presence where mode=='verified_global'`
// onSnapshot and the shared usePresenceStore is never mounted → byte-identical.
// When TRUE, both read one shared ref-counted stream (one Firestore listener
// instead of two on the foreground map). Query shape preserved → rules-safe;
// the group-session `mode=='group'` path is never unified.
export const IS_PERF_BATCH2_PRESENCE_ENABLED = true;

// ADAPTIVE_SHED — reactive layer on top of the map perf Monitor's pressureLevel
// ('normal'|'warning'|'critical', useMapStore, computed by useMapPerfMonitor
// from FPS/native memoryWarning/webglcontextlost). While false, pressureLevel
// is still computed (pure observability, unaffected by this flag) but nothing
// reacts to it — byte-identical to before this flag existed. When true:
//   • Presence paint throttle scales 750→1500→2000ms across normal/warning/
//     critical (AppMap.tsx) — invisible, just less paint/GC churn at warning.
//   • usePartnerData's 4 existing foreground-pause guards also bail at
//     'critical' — the same listeners already paused when backgrounded now
//     also pause under sustained critical pressure.
//   • useAdaptiveShed hides partner markers (liveUsersVisible=false) only at
//     'critical', and restores them on recovery ONLY if the Shed itself was
//     the one that hid them (a user who manually hid partners beforehand is
//     never overridden either way).
// Thresholds are the Monitor's original design defaults, not yet validated
// against real device telemetry (the Monitor has only run in prod briefly) —
// this flag is the rollback path if 'critical' fires on normal use: flip
// false and redeploy, no code change needed.
export const IS_ADAPTIVE_SHED_ENABLED = true;

// GPS_IDLE_POLLING — while idle-browsing the map (no active workout/nav
// session), stop the continuous watchPosition subscription (iOS: pinned at
// kCLLocationAccuracyBestForNavigation the whole time the map is open — the
// #1 confirmed cause of idle heat, .claude/knowledge/idle-map-heat-gps-
// investigation.md) and instead poll with one-shot getCurrentPosition every
// GPS_IDLE_POLL_INTERVAL_MS. The moment a workout/nav session starts
// (useSessionStore.status → 'active'|'paused'), it switches straight back to
// the exact continuous watch used today — full accuracy, zero change, for the
// one case that actually needs it.
// Unlike every other flag on this page (which defaulted true because the
// worst case was a flickering marker or a wasted request), this one changes
// how live position is acquired for a hook many things depend on (map blue
// dot, route generation, presence, nearby-parks) — a transition bug (e.g.
// starting a workout doesn't re-arm the continuous watch) would mean a run
// gets tracked with no live GPS. TRUE (11.08.2026, David-approved): device
// test happens post-flip, matching this session's other flags — verify the
// idle↔workout transition specifically (start a workout while idle-polling
// was active → full continuous tracking with no dead zone; end it → back to
// idle-polling), not just "does the dot update while idle." Kill-switch:
// flip back to false + redeploy, no code change needed.
export const IS_GPS_IDLE_POLLING_ENABLED = true;

// CHEAP_SUGGESTION_RANKING — the map's "what to do today" ranking (runSuggestionEngine,
// 5 generators: route/route-stops/full-park-workout/full-strength/anchor-loop) used to run
// each generator's REAL, full build (real Mapbox route calls, real generateHomeWorkoutTrio
// exercise scoring) just to pick which ONE existing card gets the "recommended" badge —
// confirmed by tracing the only consumer (applyRankedSlotOrder.ts) that ranking output only
// ever reads `generatorId` off the winning Suggestion; every other field (title, structure,
// methodsUsed) is discarded. The score itself (rank-suggestions.ts) only reads
// difficulty/goalTags/stepContribution/requiresLocation — never the real composed content.
// So building for real bought nothing: same ranking outcome, ~9s + real network calls wasted
// on every trigger (11.08.2026 finding, .claude/knowledge/map-suggestion-pipeline-thrash.md).
// While TRUE, each generator returns a cheap, instantly-resolved estimate using only static/
// already-cached signals — no Mapbox call, no exercise-level scoring — EXCEPT it still
// preserves the two real "this generator can't produce anything useful right now" exclusions
// generators self-apply today (full-park-workout: no nearby equipped park; full-strength: no
// assessed domain) via a cheap synchronous check instead of a full compose-then-discard.
// While FALSE, every generator's `generate()` is byte-identical to before this flag existed.
// Does NOT touch tap-to-open COST: the settle/prefetch mechanism that makes tapping a card
// instant (DiscoverLayer.tsx's `handleSettleSlot`/`hybridPlanCache`) is a completely separate
// system with its own cache, never fed by these generators either before or after this flag —
// verified by reading the code, not assumed (adversarial re-check, 11.08.2026: 0 findings).
// One harmless TIMING nuance the same re-check surfaced: HybridSlotCarousel's settle-effect
// re-fires when `applyRankedSlotOrder` returns a new `slots` reference on ranking completion;
// pre-flag that 2nd fire landed ~9s after mount (whenever real ranking finished), post-flag it
// lands almost immediately — but it's fully deduped by `composeTrioDeduped`/`hybridPlanCache`
// either way, so it costs nothing extra, just fires sooner. TRUE (11.08.2026, David-approved).
export const IS_CHEAP_SUGGESTION_RANKING_ENABLED = true;

// ============================================================================
// SUMMARY CONSOLIDATION (Stage 2/3) — per-screen V2 renderers over the shared
// summary/blocks kit. ALL DEFAULT FALSE: while false, each summary screen renders
// its EXISTING component byte-identically (the V2 page is never mounted). Flip per
// screen only after on-device parity. These guards sit INSIDE the existing branches
// and never replace AEROBIC_SOLO_ENABLED.
// ============================================================================

// AEROBIC_SUMMARY_V2: swap AerobicSummaryShell → summary/pages/AerobicSummary in
// both the group + solo branches of WorkoutSummaryPage. While FALSE the shell
// renders exactly as today.
export const AEROBIC_SUMMARY_V2_ENABLED = false;

// STRENGTH_SUMMARY_V2: swap StrengthSummaryPage → summary/pages/StrengthSummary at
// the /workouts/[id]/active render site. While FALSE the page is byte-identical.
export const STRENGTH_SUMMARY_V2_ENABLED = false;

// HYBRID_SUMMARY: the brand-new hybrid recap (summary/pages/HybridSummary), wired in
// SummaryLayer (Stage 3) reading the stashed HybridFinalizeResult. While FALSE a
// hybrid finish falls through to the current (empty) aerobic shell — today's behaviour.
// Independent flag: disturbs neither AEROBIC_SOLO_ENABLED nor the strength route.
export const HYBRID_SUMMARY_ENABLED = true;

// PLS_CACHE: Short-lived read cache + dedup for getProgramLevelSetting (#1 perf).
// One home-workout generation issued ~48 getProgramLevelSetting round-trips — the
// same push/pull/legs/core docs read up to 3× across resolveGlobalMaxIntense,
// resolveAggregateFullBodyBudget and the protocol/goal loop, plus many misses.
// With the cache those collapse to ~8 unique reads. Also gates the parallelised
// resolveGlobalMaxIntense fan-out. While FALSE, getProgramLevelSetting is
// BYTE-IDENTICAL to today (every call fetches; loops stay sequential) — this is the
// output-parity baseline and the hard kill-switch. Freshness: invalidate-on-write
// (same process) + short TTL (cross-process, see PLS_CACHE_TTL_MS in the service).
// Runtime A/B override (no rebuild): localStorage['OUT_PLS_CACHE'] = '1' | '0'.
// ENABLED in prod after localhost A/B passed (output-parity: identical budgets +
// levels cache-on vs off; exercise differences = RNG). Measured win ~1720ms/gen.
// Hard kill-switch: set false + FF-push to instantly revert (no code change).
export const PLS_CACHE_ENABLED = true;

// STRENGTH_RING: Daily Strength Ring (Layer A) — a sets-driven, minutes-displayed
// daily ring shown in the post-workout celebration card, replacing the static
// "improvement %" placeholder row. While FALSE the card is BYTE-IDENTICAL to today
// (home does not populate completionData.ring → the card renders the improvement
// row, and the useDailyStrengthTarget Firestore read is skipped). The shared
// StrengthRing primitives are unreferenced until this flag wires them in.
export const STRENGTH_RING_ENABLED = false;

// TIMER_AUTO_ADVANCE: when false (default), the live strength/hybrid player never
// advances on a timer. The reps FillingButton shows NO fill bar at all — it is a
// plain tap-only "סיימתי" (the auto-fill animation is removed, per product
// decision: a bar that pushes you to finish is stressful); only a manual tap
// completes. The rest countdown is KEPT (a natural rest timer, not stressful) but
// reaches 0 WITHOUT auto-advancing — the user taps "דלגו על המנוחה" (always on
// RestScreen). FillingButton + useWorkoutTimers are shared by StrengthRunner, so
// both behaviours apply identically to standalone strength AND hybrid stations,
// and to every FillingButton caller incl. legacy ExerciseDetailsSheet (one source,
// no fork). Video-driven completion (onVideoEnded) is NOT gated — not a timer.
// Dormant reversible toggle: flip true to restore the original auto-fill + auto-advance.
export const TIMER_AUTO_ADVANCE_ENABLED = false;

// HOME_ANCHOR_V2: the home workout anchor redesign (R Track 1) — swaps the horizontal
// trio carousel for a single hero (the recommended option) + a toggle row (the 3
// options), adds a location square + swipe-between-days, and reorders home to
// "workout-first" (schedule → anchor → metrics). The engine is unchanged
// (generateHomeWorkoutTrio still returns 3 options); only presentation changes.
// While FALSE the anchor renders the existing WorkoutSelectionCarousel and home keeps
// its current order — BYTE-IDENTICAL. Gates every R-1.x sub-change.
export const HOME_ANCHOR_V2_ENABLED = true;

// MAP_OVERVIEW_CHROME_V1: the route-preview "מבט על אימון" chrome for the hybrid
// overview screen (Moovit/Waze pattern). ONE master switch for BOTH sub-changes:
//   (1) chrome-collapse — while the HybridOverviewScreen drawer is up, fold the top
//       chrome (AppHeader nav-bar + FloatingSearchBar + MapModeHeader pills +
//       MapLayersControl) up and out, replaced by a thin blue OverviewTitleBar
//       ("מבט על אימון" + workout name + back). More map, cleaner route.
//   (2) camera zoom-out — widen the drawer-aware fitBounds padding + lower maxZoom
//       (useCameraController overview branch) so the route sits with more surround.
// The overview flag is published by HybridOverviewScreen via useMapStore
// (isOverviewActive); MapShell + DiscoverLayer read it to gate the chrome.
// While FALSE the map screen is BYTE-IDENTICAL to today: full chrome stays, no blue
// bar, camera padding/maxZoom unchanged. Hard kill-switch for the whole feature.
// ENABLED in prod after David's on-device verification (28.07): chrome collapse +
// blue bar + camera zoom-out + hybrid overview scroll-chain (expand-then-scroll).
// Kill-switch: flip to false + redeploy (compile-time flag → no runtime toggle).
export const MAP_OVERVIEW_CHROME_V1 = true;

// ============================================================================
// ROOT ADMIN SYSTEM (ENV-based, immutable at runtime)
// ============================================================================

/**
 * Root Admins — defined via environment variable for maximum security.
 * Only Root Admins can manage the admin_invitations collection.
 * Root Admins automatically have super_admin privileges + isApproved.
 *
 * Set in .env.local:
 *   NEXT_PUBLIC_ROOT_ADMIN_EMAILS=david@appout.co.il,office@appout.co.il
 */
const ROOT_ADMIN_ENV = process.env.NEXT_PUBLIC_ROOT_ADMIN_EMAILS || '';

export const ROOT_ADMIN_EMAILS: string[] = ROOT_ADMIN_ENV
  ? ROOT_ADMIN_ENV.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
  : [
      // Hardcoded fallback — used if ENV is not set (e.g., local dev without .env)
      'david@appout.co.il',
      'office@appout.co.il',
    ];

// Hardcoded safety net — mirrors ROOT_ADMIN_EMAIL_REGEX in firebase-admin.ts.
// Ensures david@ and office@ are always recognized even if NEXT_PUBLIC_ROOT_ADMIN_EMAILS
// is misconfigured or missing from the deployment environment.
const CORE_ROOT_ADMIN_REGEX = /^(david|office)@appout\.co\.il$/i;

/**
 * Check if an email is a Root Admin (ENV-defined, highest authority).
 */
export function isRootAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase().trim();
  return CORE_ROOT_ADMIN_REGEX.test(normalized) || ROOT_ADMIN_EMAILS.includes(normalized);
}

// ============================================================================
// ADMIN ACCESS CONTROL (Super Admin allowlist)
// ============================================================================

/**
 * Admin Access Control
 * 
 * Only emails in this list (or Root Admins) are allowed Super Admin access.
 * Root Admins are always included implicitly.
 */
export const ADMIN_ALLOWED_EMAILS: string[] = [
  // Root Admins (always included)
  ...ROOT_ADMIN_EMAILS,
  // DB-managed Super Admins
  'gal@appout.co.il',
  'matan.danan@appout.co.il',
];

/**
 * Check if an email is allowed admin access (Super Admin level).
 * Returns true for Root Admins + allowlisted Super Admins.
 */
export function isAdminEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalizedEmail = email.toLowerCase().trim();
  return ADMIN_ALLOWED_EMAILS.some(
    allowedEmail => allowedEmail.toLowerCase().trim() === normalizedEmail
  );
}

// ============================================================================
// ACCESS-CODE PERSONA GATES — per-vertical rollout for the onboarding
// persona → access-code flow (PersonaStep.tsx). office_worker is live
// unconditionally (already ships a working 'company' affiliation). These three
// gate the OTHER personas onto the same AccessCodeGate popup, one vertical at a
// time. ALL DEFAULT FALSE: while false, PersonaStep's ACCESS_CODE_PERSONA_IDS
// stays exactly {'office_worker'} — reservist/soldier/pupil/student pick a
// persona but never see the code popup, BYTE-IDENTICAL to today. The
// validateAccessCode Cloud Function + admin /admin/access-codes panel already
// support military/educational tenantTypes — flip a flag here to start
// surfacing the popup for that vertical, no other code change needed.
// University has no separate tenantType yet — student redeems under
// tenantType:'educational', same bucket as pupil (school).
// ============================================================================

// ACCESS_CODE_MILITARY_ENABLED: adds reservist + soldier to ACCESS_CODE_PERSONA_IDS.
export const ACCESS_CODE_MILITARY_ENABLED = false;

// ACCESS_CODE_SCHOOL_ENABLED: adds pupil to ACCESS_CODE_PERSONA_IDS.
export const ACCESS_CODE_SCHOOL_ENABLED = false;

// ACCESS_CODE_UNIVERSITY_ENABLED: adds student to ACCESS_CODE_PERSONA_IDS.
// Redeems under the same tenantType:'educational' as ACCESS_CODE_SCHOOL_ENABLED
// until university gets its own tenantType.
export const ACCESS_CODE_UNIVERSITY_ENABLED = false;

// RUNNING_NATIVE_KEEP_AWAKE_ENABLED: on native (Capacitor.isNativePlatform()), route
// requestWakeLock/releaseWakeLock in useRunningPlayer.ts through the
// @capacitor-community/keep-awake plugin instead of the raw browser Wake Lock API
// (navigator.wakeLock), which WKWebView on iOS does not implement reliably. While
// false, native falls through to the exact same raw navigator.wakeLock path used
// today — BYTE-IDENTICAL to pre-flag behavior. Web (non-native) is unaffected either
// way — it always uses navigator.wakeLock. Requires `npx cap sync` + a native
// Xcode/Android Studio rebuild before it can take effect on device (plugin must be
// registered into the native project — installing the npm package alone is not enough).
export const RUNNING_NATIVE_KEEP_AWAKE_ENABLED = false;

// NEIGHBORHOOD_GEOCODE_GUARD_ENABLED: forwardGeocode() in UnifiedLocation/
// location-utils.ts is called on every city/neighborhood search-result
// selection to "snap" the map to Mapbox's precise centroid instead of our
// static DEFAULT_COORDINATES. Root cause (11.08.2026 investigation): Mapbox's
// geocoder has essentially no neighborhood-level index for Israel — a query
// like "רמת אביב ג', תל אביב-יפו" silently resolves to place_type: ['place']
// with text "תל אביב-יפו" (the CITY, not the neighborhood), overwriting our
// correct stored coordinate with the city center. This affected every
// neighborhood in the app (Jerusalem, Haifa, Rishon LeZion, not just Tel
// Aviv) — regional-council settlements only ever "worked" because Mapbox
// usually returns no match at all for those obscure names, so the static
// fallback survived by accident. While true: forwardGeocode rejects a
// city-only (place_type: ['place']) result whenever a neighborhood was
// expected (city.parentName set), keeping the static coordinate instead.
// Plain city searches and any genuine finer-grained Mapbox match are
// unaffected either way. While false: BYTE-IDENTICAL to pre-fix behavior
// (unconditional overwrite) — instant rollback if this guard ever causes an
// unexpected regression.
export const NEIGHBORHOOD_GEOCODE_GUARD_ENABLED = true;

// STEP_GOAL_ROUTE_PREVIEW: when a /map?openRun=walking deep-link also carries
// &targetSteps=N (sent by the step-goal push, functions/src/stepGoalNudgeScheduler.ts),
// skip the empty FreeRunDrawer config step and jump straight to the RouteCarousel
// pre-built at that target size (steps converted to km via
// route-request.utils.ts's stepsToTargetKm — raw gap, no time-of-day chunking yet,
// that's a later design decision). While false: openRun=walking behaves exactly as
// before (lands on the config drawer), even if targetSteps is present in the URL.
// Test scope: only David's account currently ever receives a push with targetSteps
// (gated by app_config/feature_flags.stepGoalTestUids on the push side) — this flag
// is a second, independent safety net on the map-consumption side.
// RE-ENABLED 12.08.2026 — the 12.08 "lands on home" regression (documented in
// .claude/knowledge/step-goal-route-preview-regression.md) was root-caused to
// the notificationActionPerformed tap listener being registered too late in
// the native boot sequence (src/lib/native/init.ts / push.ts,
// installTapListener()), NOT to this feature's own code. Confirmed on a real
// device cold-launch tap after the boot-sequencing fix landed. Safe to
// re-enable.
export const IS_STEP_GOAL_ROUTE_PREVIEW_ENABLED = true;

// IS_STEP_GOAL_SHORT_ROUTE_ENABLED: fixes the "push promised 12 min, route
// card showed 32 min / 2.7km" mismatch — root-caused to route-generator
// .service.ts's MIN_GENERATION_KM=1.5 floor silently inflating small
// step-goal targets. When true, the step-goal deep-link effect
// (DiscoverLayer.tsx) passes RouteGenerationOptions.shortRouteMode: true so
// small targets try a genuinely short loop first (falling back to an
// out-and-back shape) instead of being clamped up to 1.5km. Kept SEPARATE
// from IS_STEP_GOAL_ROUTE_PREVIEW_ENABLED so "does the preview open at all"
// and "does it use this new, not-yet-device-verified short-route geometry"
// can be rolled back independently. Default false pending on-device
// verification (see the short-route plan's verification section). Same
// scope as the route-preview flag: only David's account currently ever
// receives a push with targetSteps (gated by
// app_config/feature_flags.stepGoalTestUids on the push side).
// FLIPPED TRUE for on-device verification (13.08.2026) — the both-fail edge
// (loop AND out-and-back both return zero routes) now falls back to the
// standard floored loop, so a thin-coverage city degrades to a
// longer-than-promised route instead of an empty screen. Calibration
// constants (MIN_PATH_POINTS_SHORT etc.) are still initial guesses — revisit
// after David's device test.
export const IS_STEP_GOAL_SHORT_ROUTE_ENABLED = true;

// IS_PROXIMITY_SEGMENT_QUERY_ENABLED: switches route-generator.service.ts's
// street_segments candidate fetch from "top 300 by score, citywide"
// (fetchScoredWaypoints) to a geohash bounding-box query around the user
// (fetchScoredWaypointsByProximity) — a correctness AND performance fix.
// Root problem: the citywide-by-score query can be saturated by unrelated
// high-score content before reaching a genuinely nearby segment — confirmed
// live (13.08.2026): 300 docs fetched, zero within 0.7km of a real point
// ~150m from a real published route's segment, because other content
// citywide filled all 300 score-ranked slots first. Also wastes Firestore
// reads/bandwidth/battery on every generation, worse in dense cities.
// While false: fetchScoredWaypointsByProximity is never called —
// fetchScoredWaypoints (unchanged) is the only strategy, byte-identical to
// before this flag existed. Requires the one-time geohash backfill
// (scripts/backfill-street-segments-geohash.ts) to have real effect —
// segments without a geohash are simply invisible to the new query, which
// falls back to fetchScoredWaypoints automatically per-request either way
// (a defensive third rung, not just a flag-off fallback).
// FLIPPED TRUE, GLOBAL (13.08.2026) — backfill committed (11,180/11,180
// segments migrated, 0 errors), independent review passed, and live
// before/after numbers confirmed the win in both test scenarios:
//   Tel Aviv near "הקפת פארק המסילה": 0 → 534 segments in radius (103 official)
//   Zichron Yaakov: 0 → 22 segments in radius (22 official)
// Global rather than uid-scoped — deliberate: street_segments is public-read
// (no security/data exposure either way), RouteGenerationOptions carries no
// caller identity today (scoping would mean threading a uid/email through
// ~6 call sites, a materially bigger change than the risk here justifies),
// and the 3-rung fallback ladder guarantees worst case = today's exact
// behavior. Kill-switch: flip back to false, byte-identical instantly.
export const IS_PROXIMITY_SEGMENT_QUERY_ENABLED = true;

// IS_TIGHTENED_DISTANCE_WINDOW_ENABLED: switches route-generator.service.ts's
// normal-mode (non-short-route) acceptance check from computeDistanceWindow
// to computeTightenedDistanceWindow for targets in the ~1.5-8km range.
// Root problem: computeDistanceWindow's absolute floors (0.5km below /
// 2.5km above) dominate the whole 1.5-8km band — live-confirmed (14.08.2026,
// Tel Aviv): a 5km target's real window is [4.5,7.5]km, wide enough that a
// 30%+ oversized result sails through unrejected every time. This is the
// same class of bug already fixed once for sub-1.5km targets
// (computeShortRouteDistanceWindow) and once for 15km+ targets (the 08.08
// proportional-scaling fix) — the medium band between them was never
// covered by either pass.
// While false: computeTightenedDistanceWindow is never called — every
// generation uses computeDistanceWindow exactly as today, byte-identical.
// Live-calibrated (14.08.2026) in both Tel Aviv (dense) and a
// known-thin-coverage city (Sderot — confirmed the only other city besides
// Zichron Yaakov with any real street_segments coverage at all) — a
// tighter window trades "wrong distance but a route" for "right distance
// but occasionally none," the exact failure mode the original wide floors
// existed to prevent at the large end; repeated live trials showed that
// tradeoff is real (occasional degraded/empty results, worse in Sderot
// than Tel Aviv) but acceptable.
//
// FLIPPED TRUE (14.08.2026) — David approved for his own device judgment
// on the accuracy-vs-occasional-empty tradeoff, not yet a final production
// decision. Flip back to false for an instant, byte-identical revert.
export const IS_TIGHTENED_DISTANCE_WINDOW_ENABLED = true;

// IS_GUARANTEED_ROUTE_FALLBACK_ENABLED: switches route-generator.service.ts's
// generateLoopRoutes from "return whatever validRoutes collected, possibly
// empty" to a two-tier guarantee that kicks in ONLY when the main loop (which
// runs unchanged, still checked against computeTightenedDistanceWindow when
// that flag is on) ends up with zero accepted routes.
//
// Root problem this fixes: IS_TIGHTENED_DISTANCE_WINDOW_ENABLED's tighter
// window can reject a route that Mapbox already successfully built from real
// street data — live-confirmed (14.08.2026, Tel Aviv, 3km/30min/40min
// targets): the exact same spot the old loose window used to return valid
// routes now shows the empty-state card, even though a real, on-street route
// was computed and simply discarded by the tighter check.
//
// Both tiers are bounded by computeDistanceWindow — today's exact,
// pre-tightening window, unchanged by this session's work — so the guarantee
// can NEVER accept a route the app wouldn't have accepted before
// IS_TIGHTENED_DISTANCE_WINDOW_ENABLED existed. Tier 1: retain the closest-
// to-target result already computed during the main loop's combinations
// (zero extra network calls) if it falls within that bound. Tier 2, only if
// Tier 1 finds nothing: one relaxed re-fetch (wider search radius, lower
// score floor) and one more bounded pass. If both tiers find nothing, falls
// through unchanged to today's exact empty-state behavior.
//
// While false: neither tier ever runs — generateLoopRoutes returns exactly
// what it does today, byte-identical, including with
// IS_TIGHTENED_DISTANCE_WINDOW_ENABLED on. Independent of that flag on
// purpose — lets either be flipped off alone if something about the other
// looks wrong.
// FLIPPED TRUE (15.08.2026) — David approved global (no active users yet, so
// scoping cost isn't justified), for his own device judgment on (a) whether
// the empties disappear at his real address, (b) whether Tier 1's rescued
// route (bounded by the old computeDistanceWindow) feels acceptable when it
// overshoots. Tier 2's relaxation-number calibration and the official-route
// scoring-dominance issue (a known cause of some empties Tier 2 can't always
// rescue) are explicit, parked follow-ups — not blockers for this flip. Flip
// back to false for an instant, byte-identical revert.
export const IS_GUARANTEED_ROUTE_FALLBACK_ENABLED = true;

// WORKOUT_EXIT_HARD_BLOCK_ENABLED: product-decision reversal (12.08.2026) —
// swipe-back (iOS) / hardware-back (Android) during an active workout no
// longer opens ExitConfirmModal; it is blocked ENTIRELY and silently, as if
// nothing happened. The only way out of an active workout is the explicit
// stop/finish button already in the UI. Also NEW: extends the same silent
// block to /map while an aerobic (running/walking/hybrid) session is active
// or paused — previously /map was not blocked on either platform.
//
// While FALSE (default), both platforms preserve the PREVIOUSLY SHIPPED
// behaviour byte-for-byte:
//   • /active + /workout-builder → dispatch 'nativeBackInWorkout' (opens
//     ExitConfirmModal), exactly as before this flag existed.
//   • /map → never blocked, on either platform (unchanged — this is a new
//     extension, not a prior behaviour, so "off" means "does not exist yet").
//
// While TRUE, both platforms silently absorb the gesture — no event
// dispatch, no popup — on /active, /workout-builder, AND /map (the latter
// only while an aerobic session is active/paused; plain map browsing is
// never blocked).
//
// Android reads this constant directly in src/lib/native/init.ts (plain JS,
// no bridging). iOS CANNOT read this constant directly — ViewController.swift's
// decidePolicyFor is native Swift with no bridge round-trip available at
// decision time — so the value is mirrored into @capacitor/preferences by
// WorkoutExitGuardTracker (mounted in NativeBootstrap) and read back
// synchronously from the same UserDefaults key. See
// src/lib/native/workoutExitGuard.ts for the full mechanism writeup.
//
// ⚠️ IMPORTANT CAVEAT — this does NOT make the iOS side a pure runtime
// toggle: the Swift CODE that reads the Preferences-mirrored flag (added in
// the same commit as this flag) still requires its own one-time Xcode
// rebuild + TestFlight build before it exists on-device AT ALL. Only AFTER
// that native build has shipped does flipping this constant (a normal web
// deploy, since the app loads its JS bundle from a remote origin) change
// behaviour without a further native rebuild. Flipping this flag before that
// native build ships has NO effect on iOS (old binary, no Preferences read)
// and DOES have effect on Android (pure JS) — the two platforms are
// intentionally decoupled by this constraint, not by a bug.
export const WORKOUT_EXIT_HARD_BLOCK_ENABLED = false;

// STRENGTH_RESUME_CHECKPOINT_ENABLED: crash-recovery resume-offer dialog on
// the strength active-workout screen. useWorkoutPersistence.ts already
// writes a checkpoint continuously (debounced 500ms auto-save + immediate
// save on visibilitychange) — this flag wires up the READ side, which had
// zero callers until now.
//
// While FALSE (default), active/page.tsx's mount-time restoreCheckpoint
// call never fires, pendingCheckpoint never gets set, and the new
// resume-decision early-return block is unreachable — the page renders
// BYTE-IDENTICAL to before this feature existed: StrengthRunner mounts
// immediately with no initialCheckpoint (undefined, same as every prior
// build), exactly like today.
//
// While TRUE: on mount, if a non-expired checkpoint (see MAX_AGE_MS,
// useWorkoutPersistence.ts) matching this workoutId is found,
// ResumeWorkoutDialog is shown instead of the runner. "Resume" seeds
// useWorkoutStateMachine via StrengthRunner's initialCheckpoint prop;
// "Start Over" calls clearWorkoutCheckpoint() and proceeds fresh, same as
// a normal cold start today.
//
// This hook is StrengthRunner's ONLY state-machine call site
// (src/features/workout-engine/players/strength/StrengthRunner.tsx:85) —
// every real strength workout in the app runs through it. Kill-switch:
// flip back to false, no code change needed.
export const STRENGTH_RESUME_CHECKPOINT_ENABLED = false;

// WORKOUT_DELETE_EXPANDED_ENABLED: gates the shared
// DeleteWorkoutConfirmModal (src/components/ui/DeleteWorkoutConfirmModal.tsx)
// + deleteWorkoutWithReversal orchestration
// (src/lib/workoutDeletion.ts) across EVERY delete-workout surface: the
// AerobicSummaryShell rewire, the (home) activity history list,
// StrengthHistoryDetail, and FreeRunSummary.
//
// ⚠️ IMPORTANT NUANCE: this flag gates the FIX ITSELF, not just the new UI
// surfaces. While FALSE (default), AerobicSummaryShell keeps TODAY'S EXACT
// EXISTING delete behaviour BYTE-IDENTICAL — including today's existing
// BROKEN XP/streak reversal: the "בטל / מחק אימון" flow still calls
// useRunningPlayer.getState().deleteLastWorkout(), which (a) reverses XP via
// a direct awardWorkoutXP({ xpDelta: -xpToReverse }) call instead of the new
// server-verified reverseWorkoutXP callable, and (b) "reverses the streak"
// by decrementing progression.daysActive / clearing progression.lastActiveDate
// directly — fields that are NOT the same ones useActivityStore's
// currentStreak/longestStreak/lastStreakDate actually read from, so today's
// streak reversal silently does nothing for the UI streak counter. The other
// three surfaces (history list, StrengthHistoryDetail, FreeRunSummary) simply
// don't offer a delete affordance at all while this is FALSE — nothing to
// keep byte-identical there, they don't exist yet.
//
// While TRUE, all four surfaces render the shared DeleteWorkoutConfirmModal
// and route their confirm action through deleteWorkoutWithReversal(), which
// calls the server-verified reverseWorkoutXP callable (correct XP reversal)
// and useActivityStore's reverseStreakForToday() (correct streak reversal,
// operating on the fields the UI actually reads) — see src/lib/
// workoutDeletion.ts for the full ordering contract. deleteLastWorkout() and
// its awardWorkoutXP/daysActive reversal path are retired once every call
// site has migrated behind this flag.
//
// Kill-switch: flip back to false to instantly revert every surface to
// today's behaviour (AerobicSummaryShell falls back to deleteLastWorkout();
// the other three surfaces lose their delete affordance again) — no code
// change needed, this is a pure runtime/compile-time constant read.
export const WORKOUT_DELETE_EXPANDED_ENABLED = false;

// RECOVERY_WORKOUT_CATEGORIZATION_ENABLED: gates the write-site classification
// fix for the rest-day "recovery video trio" (a rest-day session that is
// exactly one follow-along video) — today it is saved and displayed
// identically to a real strength workout everywhere in the app (workoutType:
// 'strength', category: 'strength', dumbbell icon, "אימון כוח" label).
//
// While FALSE (default), the write site in active/page.tsx's
// handleSummaryFinish is BYTE-IDENTICAL to today: the saveWorkout() call
// always receives the same hardcoded workoutType: 'strength' / category:
// 'strength' / displayIcon: 'dumbbell', regardless of whether the completed
// session was the recovery video trio. Every downstream read site gated on
// workoutType === 'recovery' (history cards, profile detail, admin panel,
// dashboard widgets) is unreachable dead code while this is false, since no
// document is ever written with workoutType: 'recovery'.
//
// While TRUE, the write site additionally checks
// isPureRecoveryVideoTrioWorkout(stableWorkoutPlan) (see
// recovery-video-trio.utils.ts) — a narrow discriminator requiring the EXACT
// single-`seg-recovery`-segment shape, so it does NOT fire for the other two
// isRecovery:true producers (the multi-exercise Budget-Floor cooldown workout
// and the standard rest-day generator), which keep saving as 'strength'
// exactly as before. Only the pure video-trio session gets workoutType:
// 'recovery' / category: 'recovery' / displayIcon: 'moon', and is shown
// everywhere as "אימון התאוששות" with its own card/icon/detail view instead
// of being indistinguishable from a real strength workout.
//
// Classification-only change: duration/calories/coins/xp/segments and every
// other saved field are untouched either way.
//
// FLIPPED TRUE (13.08.2026) — David approved going straight to production for
// this one (no separate device-verification pass first). Live for all users
// once this ships: any future recovery-video-trio completion will be labeled
// "אימון התאוששות" and excluded from the weekly strength-day count. Does not
// retroactively relabel past completions already saved as 'strength'.
export const RECOVERY_WORKOUT_CATEGORIZATION_ENABLED = true;

// RECOVERY_DAY_BADGE_FIX_ENABLED: gates the write-site fix for the "Beast Mode"
// bonus-flame badge (resolveDayDisplayProps, BONUS_WORKOUT_COLOR) incorrectly
// showing on a scheduled rest day whose ONLY completed activity was recovery
// content — either the rest-day recovery-video-trio OR the "Budget Floor"
// fallback cooldown/mobility workout. Both are the day's INTENDED content, not
// bonus effort, so Beast Mode should not fire for either. Deliberately keys off
// the BROAD `isRecovery` flag (true for all three isRecovery producers), NOT
// the narrow isPureRecoveryVideoTrioWorkout discriminator that
// RECOVERY_WORKOUT_CATEGORIZATION_ENABLED uses for history-list labeling —
// that narrow check intentionally excludes the Budget-Floor cooldown and the
// standard rest-day generator, but both of those should ALSO suppress Beast
// Mode here, since they're equally the day's designated content.
//
// While FALSE (default), the single write choke point — useActivitySync.ts's
// syncWorkoutCompletion() call — passes `isRecovery: undefined` regardless of
// the session's real isRecovery value, so completion-sync.service.ts →
// useProgressionStore.markTodayAsCompleted() always receives `isRecovery:
// undefined` → the dailyProgress/{userId}_{date} Firestore write always
// stores `isRecovery: false` (never `true`, by any document, from any user).
// Every downstream read site (useDailyProgress, usePastWorkoutCompleted,
// useDayStatus's isRecoveryCompletion, DayDisplayInput.isRecoveryCompletion)
// therefore always evaluates falsy, and both Beast Mode branches in
// resolveDayDisplayProps (today + past) keep firing exactly as today — the
// pre-existing bug is preserved, not the pre-existing Firestore document
// shape (the new `isRecovery` field is written either way; only its value is
// gated). BYTE-IDENTICAL in the sense that matters: every new branch this fix
// adds is structurally unreachable while this flag is false.
//
// While TRUE, the real per-session isRecovery boolean (already threaded into
// useActivitySync's params, previously only consumed by recordStrengthSession)
// flows through to dailyProgress.isRecovery, and both Beast Mode branches
// additionally require `!isRecoveryCompletion` — a rest day whose only
// completed activity was recovery content falls through to the ordinary
// rest-day (Zz) treatment instead of the violet bonus flame.
//
// Only strength-runner completions (useActivitySync, fed by
// StrengthSummaryPage.tsx) ever carry a real isRecovery value — running
// (useRunningPlayer.ts) and hybrid (useHybridRun.ts) syncWorkoutCompletion
// calls have no recovery concept and never set this field, confirmed by
// inspection (13.08.2026) — so gating at this single strength choke point is
// sufficient; no other syncWorkoutCompletion caller needs its own gate.
//
// FLIPPED TRUE (14.08.2026) — David approved production rollout after
// reviewing the diff himself. Live for all users once this ships: a rest
// day whose only completion was recovery content (video-trio or
// Budget-Floor) stops showing the violet "Beast Mode" bonus flame.
export const RECOVERY_DAY_BADGE_FIX_ENABLED = true;

// RUNNING_CURRENT_WEEK_RECOMPUTE_ENABLED: fixes a real, reproducible staleness
// bug in "which week of the running program is the user on." Multiple home
// widgets need this number; some read the stored field
// (`running.activeProgram.currentWeek`), others already recompute fresh from
// `(today − startDate) / 7` via the canonical calculateCurrentWeek()
// (workout-completion.service.ts). The stored field only advances on two
// narrow write events — completing that week's first planned run, or the
// explicit "back one week" button — so it goes stale at every week boundary:
// a user who opens the app before completing this week's first run sees ONE
// widget correctly say "rest day" (calendar-derived) while ANOTHER widget on
// the same home screen still shows LAST week's already-finished workout as
// if it were new and tappable (stored-field-derived).
//
// Gates the DISPLAY (read) sites only, via the shared resolveRunningCurrentWeek
// helper (workout-engine/shared/utils/running-current-week.utils.ts):
// NextRunWorkoutCard, StatsOverview, SmartWeeklySchedule, RollingAgenda,
// TrainingPlannerOverlay. The two WRITE sites — markSessionComplete and
// rollBackOneWeek, both in workout-completion.service.ts — already call
// calculateCurrentWeek() directly and are UNCHANGED by this flag either way.
// AgendaDayCard's resolveRunningEntry() is also UNCHANGED by this flag: it
// already unconditionally recomputes per rendered calendar day whenever
// startDate is present (only falling back to the stored field in the same
// rare case as today — startDate itself missing), so this flag has nothing
// to gate there; the refactor just de-duplicates its own hand-written copy
// of the same formula into a per-day calculateCurrentWeek(startDate, asOfDate)
// call instead of "today".
//
// While FALSE (default), every gated read site falls back to the stored
// `activeProgram.currentWeek` field exactly as today — byte-identical,
// including RollingAgenda's and TrainingPlannerOverlay's "שבוע N" week-badge
// staying invisible exactly as it is now. (Those two currently have an
// INDEPENDENT, always-on bug: `new Date(startDate + 'T00:00:00')` where
// startDate is already a real Date object, not a string — the string
// coercion silently produces an Invalid Date, so the badge never renders
// today, regardless of this flag. Routing through calculateCurrentWeek fixes
// that coercion for free, but only takes effect once this flag is TRUE.)
//
// While TRUE, all five gated sites recompute the calendar-correct week via
// calculateCurrentWeek(startDate) instead of trusting the stored field, and
// the two week-badges above start rendering "שבוע N" for the first time.
//
// FLIPPED TRUE (14.08.2026) — David verified on-device first (uncommitted
// local flip, not deployed) before approving: confirmed the home page shows
// the correct current-week workout when opened before completing that
// week's first run, and the Planner's "שבוע N" pill now renders correctly.
// Kill-switch: flip back to false, byte-identical instantly, no code change
// needed.
export const RUNNING_CURRENT_WEEK_RECOMPUTE_ENABLED = true;

// HOME_RECOVERY_START_SHORTCUT_ENABLED: skips the workout-preview drawer
// entirely for a "pure recovery video trio" rest-day session (a rest-day
// workout that is structurally just ONE follow-along video — see
// isPureRecoveryVideoTrioWorkout in
// workout-engine/shared/utils/recovery-video-trio.utils.ts for the canonical
// WorkoutPlan-shaped discriminator). Today, tapping that hero card on the
// home page opens WorkoutPreviewDrawer (tap 1), which requires a second tap
// on the single exercise card and a third tap on "Start" before the video
// actually plays — three taps of friction for what is, structurally, one
// continuous video with nothing else to preview. Every OTHER workout type
// (real strength workouts, multi-exercise recovery workouts e.g. the Budget
// Floor cooldown) is completely unaffected — they keep opening the drawer
// exactly as today.
//
// Gates a single branch inside home/page.tsx's handleHeroPress: AFTER the
// existing interceptWorkoutStart() health-declaration hard-block passes
// (unconditional, unchanged — runs for every path including this shortcut),
// a pre-flatten equivalent of isPureRecoveryVideoTrioWorkout is checked
// against generatedWorkoutRef.current (the raw GeneratedWorkout, before the
// WorkoutPlan flatten that normally happens inside openWorkoutPreview). When
// it matches, handleHeroPress calls useWorkoutSession's handleStartWorkout
// directly (the exact same hand-off WorkoutPreviewDrawer's own "Start"
// button already uses — see
// features/workouts/components/workout-preview-drawer/hooks/useWorkoutSession.ts)
// instead of setSelectedWorkout(...), so the drawer never mounts and the
// active video-playback screen opens on the first tap.
//
// While FALSE (default), the discriminator check never runs — short-
// circuited on this flag first — so home/page.tsx's tap handling is byte-
// identical to before this diff for every workout type, including the video
// trio: the drawer still opens exactly as now. Kill-switch: flip back to
// false, byte-identical instantly, no code change needed.
export const HOME_RECOVERY_START_SHORTCUT_ENABLED = false;

// Helper function for conditional rendering
export function shouldShowCoinUI(): boolean {
  return IS_COIN_SYSTEM_ENABLED;
}

// Helper function for conditional coin logic
export function shouldProcessCoinRewards(): boolean {
  return IS_COIN_SYSTEM_ENABLED;
}
