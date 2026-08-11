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

// Helper function for conditional rendering
export function shouldShowCoinUI(): boolean {
  return IS_COIN_SYSTEM_ENABLED;
}

// Helper function for conditional coin logic
export function shouldProcessCoinRewards(): boolean {
  return IS_COIN_SYSTEM_ENABLED;
}
