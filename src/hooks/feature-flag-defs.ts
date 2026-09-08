/**
 * feature-flag-defs — the SINGLE source of truth for system_config/feature_flags'
 * shape + defaults. Deliberately has ZERO Firebase/Next imports (plain data only) so
 * both the live hook (useFeatureFlags.ts, real-time Firestore listener) and the admin
 * editing page (system-settings/resolve-loaded-flags.ts, one-shot getDoc/setDoc) read
 * the exact same defaults instead of maintaining their own copies that can drift apart.
 *
 * defaultValue: used as the fallback whenever a Firestore document exists but doesn't
 * yet have this specific key, and as the initial in-memory value before any read
 * completes. Existing flags fail CLOSED (false) — new features must be explicitly
 * turned on.
 *
 * The 4 hybrid-slot flags below (enableHybridSlots/enableFullParkWorkout/
 * enableRouteStops/enableRecommendedHybrid) fail OPEN (true) instead — a deliberate,
 * one-time exception to that pattern, not a template to copy for future flags. They
 * replaced compile-time constants that were already `true` in production, so failing
 * closed on them would have instantly hidden live features for every real user the
 * moment this code first deployed, ahead of the document being seeded with explicit
 * values. That seeding happened once (08.09.2026) — the document now holds explicit
 * `true` values for all 4 keys — so today this default's ONLY remaining job is the
 * genuinely-missing-key gap (e.g. someone manually deletes a field); once a key is
 * present, its stored value always wins, fail-open or not.
 *
 * ⚠️ Do NOT read this as "these flags are meant to be true" or reseed them to true
 * "just in case": a one-time bootstrap script that unconditionally wrote `true` to all
 * 4 keys (regardless of the document's current state) was used for the initial
 * migration, then re-run later to add enableRecommendedHybrid as a 4th key — and on
 * that second run it silently reverted enableRouteStops, which David had deliberately
 * switched OFF in the admin panel in between. Fixed by hand immediately; the script
 * itself was deleted afterward (see CLAUDE.md's debt log for the incident) because a
 * "just re-run it" tool for these specific keys is now pure risk with no legitimate use
 * left. Any future script that bootstraps a missing key on a Firestore-backed admin
 * flag must read the document first and only fill keys that are genuinely absent —
 * never assume a value that was correct when first written is still correct.
 *
 * Adding a flag: add ONE entry here. useFeatureFlags.ts and the system-settings page
 * both derive everything they need from this array.
 */
export const FLAG_DEFS = [
  { key: 'enableRunningPrograms', firestoreKey: 'enable_running_programs', defaultValue: false, superAdminValue: true },
  { key: 'enableCommunityFeed', firestoreKey: 'enable_community_feed', defaultValue: false, superAdminValue: true },
  { key: 'enableLeagues', firestoreKey: 'enable_leagues', defaultValue: false, superAdminValue: true },
  { key: 'maintenanceMode', firestoreKey: 'maintenance_mode', defaultValue: false, superAdminValue: false },
  // Hybrid-slot map flags (wave 1) — see the defaultValue note above.
  { key: 'enableHybridSlots', firestoreKey: 'enable_hybrid_slots', defaultValue: true, superAdminValue: true },
  { key: 'enableFullParkWorkout', firestoreKey: 'enable_full_park_workout', defaultValue: true, superAdminValue: true },
  { key: 'enableRouteStops', firestoreKey: 'enable_route_stops', defaultValue: true, superAdminValue: true },
  // Wave-1 addition (08.09.2026) — sub-flag of enableHybridSlots, same defaultValue
  // reasoning: the "recommended" card is live in prod today. Gates ONLY the
  // auto-surfaced card in the map carousel (hybrid-slots.ts's resolveSlots) — NOT
  // FreeRunDrawer's "תחנות כוח" toggle, which reaches the identical compose path but
  // is a deliberate, user-parameterized second entry left uncovered on purpose (David,
  // 08.09.2026: the concern was the app auto-surfacing this, not the capability
  // existing). See the full reasoning in hybrid-slots.ts's SlotEnv.enableRecommendedHybrid
  // doc comment — this is not an oversight, don't extend this flag to the drawer without
  // re-raising it as its own decision.
  { key: 'enableRecommendedHybrid', firestoreKey: 'enable_recommended_hybrid', defaultValue: true, superAdminValue: true },
] as const;

export type FirestoreFlagKey = (typeof FLAG_DEFS)[number]['firestoreKey'];

/** Firestore-field-keyed defaults (snake_case) — what the admin panel's form state uses. */
export const FIRESTORE_FLAG_DEFAULTS: Record<FirestoreFlagKey, boolean> = Object.fromEntries(
  FLAG_DEFS.map((d) => [d.firestoreKey, d.defaultValue]),
) as Record<FirestoreFlagKey, boolean>;
