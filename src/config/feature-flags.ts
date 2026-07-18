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

// MISSED_DAYS_PROMPTS: The two "you missed days" nudges on the home screen —
// (1) the red re-engagement/missed-workout recovery banner at the top of /home, and
// (2) the purple periodization "coach cue" banner in StatsOverview (long-gap / deload).
// DEFAULT FALSE = both are hidden. The underlying logic (daysInactive calc, deload /
// periodization gating) is UNTOUCHED and still runs — only the display is gated, so
// flipping this back to true fully restores both banners with no other change.
// NOTE: banner (2) surfaces ALL coach cues (peak / deload / gap re-engagement); while
// false none of them show. Flip to true to bring the missed-days nudges back.
export const SHOW_MISSED_DAYS_PROMPTS = false;

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
// DEFAULT FALSE so the merge is byte-identical — flip to true only after the
// localhost A/B output-parity + invalidation checks pass.
export const PLS_CACHE_ENABLED = false;

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

// Helper function for conditional rendering
export function shouldShowCoinUI(): boolean {
  return IS_COIN_SYSTEM_ENABLED;
}

// Helper function for conditional coin logic
export function shouldProcessCoinRewards(): boolean {
  return IS_COIN_SYSTEM_ENABLED;
}
