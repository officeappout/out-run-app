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
