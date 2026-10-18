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
  // David, 23.09.2026 — MockLocationPanel (dev/test city-override tool, field-test
  // doc 37/38) opened to ALL users TEMPORARILY, for testing purposes, with an
  // explicit off-switch here (no deploy needed to kill it). defaultValue:true is
  // his own explicit instruction for this flag specifically ("דלוק כרגע") — not a
  // copy of the hybrid-slot flags' historical exception above. superAdminValue:true
  // so a super admin always sees the panel regardless of this flag's real value
  // (MockLocationBanner + the workout-active block apply to everyone regardless of
  // this flag either way — it only gates the panel's own visibility).
  { key: 'enableMockLocationPanel', firestoreKey: 'enable_mock_location_panel', defaultValue: true, superAdminValue: true },
  // Onboarding tutorial, entry-mechanism slice (06.10.2026) — the whole new
  // welcome-drawer + 2-gate entry router; slice 2 (17.10.2026) adds the first-run
  // coach-mark tours (home / map / community / player — those also need enable_home_v2).
  // defaultValue false: nothing changes for users until the panel toggle is flipped.
  // superAdminValue was false (David: "nothing changes in production until I flip it");
  // flipped to true on 17.10.2026 at the owner's request so he can review the first-run
  // experience on his own account — affects super admins only. Fail-closed otherwise.
  { key: 'enableOnboardingTutorialV1', firestoreKey: 'enable_onboarding_tutorial_v1', defaultValue: false, superAdminValue: true },
  // Guided station layer (PR-B1, 15.10.2026) — KILL-SWITCH, not a launch gate. The guided
  // "ליווי צעד-אחר-צעד" layer is the default for every user (David's decision); this flag
  // exists only to turn it OFF globally without a deploy (off = everyone gets fast mode,
  // i.e. today's production station). Fails OPEN (defaultValue: true) — a deliberate
  // exception to the fail-closed norm, like the hybrid-slot flags above, for a different
  // reason: a kill-switch must not itself switch the feature off just because the document
  // is missing the key or a read failed. superAdminValue: true so admins see what users see.
  { key: 'enableGuidedStation', firestoreKey: 'enable_guided_station', defaultValue: true, superAdminValue: true },
  // Sderot pilot G1.1 (15.10.2026) — map carousel ("מה עושים היום?") swipe affordance v2: wider
  // peek, a delayed once-per-user nudge, and a peeking card's button only centres it (never
  // starts "יוצאים מיד" by accident). Fail-closed launch gate; superAdminValue false on purpose
  // — the panel toggle is the ONE switch, David's own account
  // included, so the flag-off regression pass shows exactly what users get (today's #207 hint).
  { key: 'enableCarouselSwipeHint', firestoreKey: 'enable_carousel_swipe_hint', defaultValue: false, superAdminValue: false },
  // Sderot pilot G3.1 (15.10.2026) — walk-to-first-stop: a persistent walking card with live
  // distance + secondary "הגעתי"; the big "הגעתי לתחנה" CTA only after the user walked INTO the
  // approach radius (never on the first fix at a park-start). Normal fail-closed launch gate;
  // superAdminValue false because HybridStationLayer reads flags without the super-admin
  // override anyway (useFeatureFlags() with no arg) — off = today's behaviour for everyone.
  { key: 'enableWalkToFirstStop', firestoreKey: 'enable_walk_to_first_stop', defaultValue: false, superAdminValue: false },
  // Sderot pilot G3.2 (15.10.2026) — adapt a LOOP route to the direction the user actually walks
  // (first ~60–150 m): flip the live stop order (list reversal of the composed plan, never a
  // re-compose) + toast; "which way" arrow at the start until settled. one_way / out-and-back are
  // never flipped. Fail-closed; superAdminValue false — the panel toggle is the one switch.
  { key: 'enableRouteDirectionAdapt', firestoreKey: 'enable_route_direction_adapt', defaultValue: false, superAdminValue: false },
  // G8.2 (15.10.2026, David: "never a strength level without the questionnaire") — when ON, nothing
  // writes a strength level/program for a user with no questionnaire result: onboarding's
  // GOAL_TO_PROGRAM fallback and Path B's synthesized results are skipped, and a strength workout
  // by an unassessed user skips the level/track writes (history + XP untouched). Read one-shot via
  // readFeatureFlagOnce. Fail-closed; superAdminValue false. Summary guard in place
  // (LevelRingCard hidden when skipped, StrengthSummaryView.tsx, after #305). David turns it on
  // himself after field-testing.
  { key: 'enableNoAutoStrengthLevel', firestoreKey: 'enable_no_auto_strength_level', defaultValue: false, superAdminValue: false },
  // League aggregates (17.10.2026, David) — the neighborhood / city boards read the
  // league_scope_stats sums (written by onWorkoutCreateLeagueStats from the workouts
  // record) instead of summing feed_posts on the client. Fail-closed: turn it on once the
  // function is deployed and the current week/month is backfilled. Read one-shot in
  // ranking.service (readFeatureFlagOnce), so no superAdmin override is needed.
  { key: 'enableLeagueAggregates', firestoreKey: 'enable_league_aggregates', defaultValue: false, superAdminValue: false },
  // Home v2 (17.10.2026, design lab approved by David) — the home screen in the site's design
  // language: streak flames per activity (brand Lottie), the connected streak capsule, the
  // day bubble, the v2 header. Fail-closed launch gate; superAdminValue true so David sees it
  // on his account while every other user keeps today's home until he flips it.
  { key: 'enableHomeV2', firestoreKey: 'enable_home_v2', defaultValue: false, superAdminValue: true },
  // Calm return (CALM_RETURN_V1, 18.10.2026, policy approved by David) — coming back after
  // missed workouts costs the user as little attention as possible: one getDaysAway for the
  // whole app, tiered lighter loads (src/lib/calm-return), no realign/rebuild popups, no
  // missed-workout banner, at most one quiet card per open, a weekly streak grace day.
  // Fail-closed; superAdminValue false — the panel toggle is the one switch (the streak
  // store and the generator read the live value, which ignores the super-admin override).
  { key: 'enableCalmReturnV1', firestoreKey: 'enable_calm_return_v1', defaultValue: false, superAdminValue: false },
  // OUT AI Phase 0 (18.10.2026) — foundation only, no user-facing AI feature reads these yet.
  // The SERVER is the enforcer (src/lib/ai/*.server.ts reads this same document via the Admin
  // SDK, ignoring superAdminValue); the client copies below only drive UI.
  // aiCoachEnabled — master gate for every AI coaching surface. Fail-closed; superAdminValue
  // false so the panel toggle is the one switch (the server ignores the override anyway, so a
  // `true` here would only show super admins UI the server then refuses).
  { key: 'aiCoachEnabled', firestoreKey: 'ai_coach_enabled', defaultValue: false, superAdminValue: false },
  // aiCoachFreeForAll — launch mode: while ON, every eligible (adult) user may use AI without an
  // entitlements/{uid} doc. Fail-CLOSED (18.10.2026, owner): defaultValue false so turning
  // ai_coach_enabled ON can never open AI to every user by accident (a missing key or a failed
  // read means "entitled users only"). To open AI to everyone, turn ai_coach_free_for_all ON
  // explicitly in the panel. superAdminValue false: the server ignores the override anyway.
  { key: 'aiCoachFreeForAll', firestoreKey: 'ai_coach_free_for_all', defaultValue: false, superAdminValue: false },
  // coachNoteLLM — the post-workout coach note is written by the LLM instead of the template
  // engine. Fail-closed; requires aiCoachEnabled at runtime.
  { key: 'coachNoteLLM', firestoreKey: 'coach_note_llm', defaultValue: false, superAdminValue: false },
  // weatherEnabled — the home weather chip + weather-aware workouts (rain → home, heat →
  // shorter/more rest, cold → longer warm-up). Fail-closed. superAdminValue is unused for the
  // weather pair: the home page gates on the LIVE values (useFeatureFlags' rawFlags) via
  // isWeatherOnFor (src/features/weather/core/weather-access.ts), so the panel toggle is the
  // one switch for admins too.
  { key: 'weatherEnabled', firestoreKey: 'weather_enabled', defaultValue: false, superAdminValue: false },
  // weatherAdminsOnly (18.10.2026) — testing mode for weatherEnabled: while ON, weather reaches
  // super admins only (the same audience enable_home_v2 previews to). defaultValue TRUE so
  // flipping weather_enabled on can never reach every user by accident — opening it to all is
  // a second, explicit flip of this toggle to OFF.
  { key: 'weatherAdminsOnly', firestoreKey: 'weather_admins_only', defaultValue: true, superAdminValue: true },
  // aiCoachScheduleAdvisor (18.10.2026, schedule advisor phase A) — Kelly's schedule
  // advisor: the read-only recommend_week / recommend_today tools, the "open the builder"
  // chip, the sheet's plan section (template days, running week, missed sessions, WHO gap)
  // and the derived "done" for today (no "build today's workout" chip after a strength
  // workout today). The server is the enforcer (route.ts reads it via the Admin SDK).
  // Fail-closed; superAdminValue false — the panel toggle is the one switch.
  { key: 'aiCoachScheduleAdvisor', firestoreKey: 'ai_coach_schedule_advisor', defaultValue: false, superAdminValue: false },
  // Unified Kelly, phase 1 (18.10.2026, owner) — ONE Kelly conversation per user in
  // ai_coach_threads/{uid}: AI replies, the human team's replies (admin panel "קלי · ממתינים
  // למענה"), the welcome message, and handoffs (needsHuman on the thread doc instead of a
  // message in the old chats/{uid_system_kelly_coach} DM). Users without AI get the same screen
  // in "team only" mode. Fail-closed; superAdminValue false — the panel toggle is the one
  // switch (the server reads the real value and ignores the override anyway). Off = today's
  // behaviour: separate "קלי AI" screen + the human Kelly DM.
  { key: 'kellyUnifiedV1', firestoreKey: 'kelly_unified_v1', defaultValue: false, superAdminValue: false },
] as const;

export type FirestoreFlagKey = (typeof FLAG_DEFS)[number]['firestoreKey'];

/** Firestore-field-keyed defaults (snake_case) — what the admin panel's form state uses. */
export const FIRESTORE_FLAG_DEFAULTS: Record<FirestoreFlagKey, boolean> = Object.fromEntries(
  FLAG_DEFS.map((d) => [d.firestoreKey, d.defaultValue]),
) as Record<FirestoreFlagKey, boolean>;
