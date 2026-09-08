/**
 * feature-flag-defs — the SINGLE source of truth for system_config/feature_flags'
 * shape + defaults. Deliberately has ZERO Firebase/Next imports (plain data only) so
 * both the live hook (useFeatureFlags.ts, real-time Firestore listener) and the admin
 * editing page (system-settings/resolve-loaded-flags.ts, one-shot getDoc/setDoc) read
 * the exact same defaults instead of maintaining their own copies that can drift apart.
 *
 * defaultValue: used as the fallback whenever a Firestore document exists but doesn't
 * yet have this specific key (e.g. right after a new flag ships, before the doc is
 * re-seeded), and as the initial in-memory value before any read completes. Existing
 * flags fail CLOSED (false) — new features must be explicitly turned on. The 3
 * hybrid-slot flags below fail OPEN (true) because they're replacing compile-time
 * constants that are already `true` in production; failing closed on them would
 * instantly hide 3 live features for every real user the moment this code deploys,
 * ahead of the one-time seed script (scripts/seed-hybrid-slot-flags.ts) that writes
 * the explicit values. Once the doc has the key (seeded, or an admin toggled it), that
 * explicit value always wins — this default only covers the missing-key gap.
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
  // reasoning: the "recommended" card is live in prod today.
  { key: 'enableRecommendedHybrid', firestoreKey: 'enable_recommended_hybrid', defaultValue: true, superAdminValue: true },
] as const;

export type FirestoreFlagKey = (typeof FLAG_DEFS)[number]['firestoreKey'];

/** Firestore-field-keyed defaults (snake_case) — what the admin panel's form state uses. */
export const FIRESTORE_FLAG_DEFAULTS: Record<FirestoreFlagKey, boolean> = Object.fromEntries(
  FLAG_DEFS.map((d) => [d.firestoreKey, d.defaultValue]),
) as Record<FirestoreFlagKey, boolean>;
