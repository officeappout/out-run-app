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
 * qaTesterValue (optional, 20.10.2026): the value an AI tester sees (uid demo_qa_* + token claim
 * qa, only while enable_demo_users && enable_ai_testers are on). Flags without it keep their
 * stored value for testers. Testers NEVER get superAdminValue. See feature-flag-resolve.ts.
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
  // Situation-aware hybrid cards (19.10.2026) — the map carousel ("מה עושים היום?") picks,
  // orders and explains its cards from the user's situation (remaining steps, remaining weekly
  // strength sets, today's schedule, nearby equipped parks, nearby / browsed routes with stops):
  // a smart "הליכה + כוח" walk through a nearby park (replaces the old one-station recommended
  // card; hidden when no park is near), "אימון מלא בפארק" mainly on a strength day, "מסלול +
  // עצירות" only near a route with stops. Also routes the free-run drawer's "תחנות כוח" toggle
  // to the same smart walk (hidden with no park near). Fail-closed; superAdminValue false — the
  // panel toggle is the ONE switch, so the flag-off pass shows exactly what users get.
  // Off = today's carousel, byte-identical (src/features/workout-engine/hybrid/smart-cards).
  { key: 'enableHybridCardsV2', firestoreKey: 'enable_hybrid_cards_v2', defaultValue: false, superAdminValue: false },
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
  // qaTesterValue true (20.10.2026, owner: AI testers test v2): a signed-in AI tester (uid
  // demo_qa_* + token claim qa, while enable_demo_users && enable_ai_testers) sees v2 —
  // see feature-flag-resolve.ts. Real users are untouched.
  { key: 'enableHomeV2', firestoreKey: 'enable_home_v2', defaultValue: false, superAdminValue: true, qaTesterValue: true },
  // Calm return (CALM_RETURN_V1, 18.10.2026, policy approved by David) — coming back after
  // missed workouts costs the user as little attention as possible: one getDaysAway for the
  // whole app, tiered lighter loads (src/lib/calm-return), no realign/rebuild popups, no
  // missed-workout banner, at most one quiet card per open, a weekly streak grace day.
  // Fail-closed; superAdminValue false — the panel toggle is the one switch (the streak
  // store and the generator read the live value, which ignores the super-admin override).
  { key: 'enableCalmReturnV1', firestoreKey: 'enable_calm_return_v1', defaultValue: false, superAdminValue: false },
  // Streak rules (owner decisions 21.10.2026) — src/features/activity/lib/streak-day.core.ts,
  // read by BOTH the app's streak store (live value) and streakRescueScheduler (this same doc).
  // enable_shabbat_free_streak: a missed Saturday never breaks the streak, for everyone (an
  //   active Saturday still counts). enable_streak_shields: +1 shield per 7 streak days, max 2,
  //   used automatically on a missed day. enable_streak_pushes: the server's streak pushes
  //   (19:30 / 21:15 rescue, 10:00 broken, 20:00 milestone). All fail-closed; superAdminValue
  //   false — the panel toggle is the one switch (the store and the server read the live value).
  { key: 'enableShabbatFreeStreak', firestoreKey: 'enable_shabbat_free_streak', defaultValue: false, superAdminValue: false },
  { key: 'enableStreakShields', firestoreKey: 'enable_streak_shields', defaultValue: false, superAdminValue: false },
  { key: 'enableStreakPushes', firestoreKey: 'enable_streak_pushes', defaultValue: false, superAdminValue: false },
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
  // aiCoachPhase2 (19.10.2026, owner-approved "Kelly phase 2") — context-aware quick replies
  // (first open + 2-3 follow-ups under each answer) and rotating input hints, app-help answers
  // (get_app_help over a curated Hebrew knowledge file), schedule changes from chat
  // (propose_schedule_change → a confirm card; the user's tap applies it through the existing
  // schedule-builder save path, Kelly never writes), and question-topic tagging in the daily
  // review + the "top topics" panel section. The server is the enforcer (route.ts reads the
  // real value). Fail-closed; superAdminValue false — the panel toggle is the one switch.
  // Off = byte-identical Kelly (prompt, tools, stream, stored messages, review).
  { key: 'aiCoachPhase2', firestoreKey: 'ai_coach_phase2', defaultValue: false, superAdminValue: false },
  // Unified Kelly, phase 1 (18.10.2026, owner) — ONE Kelly conversation per user in
  // ai_coach_threads/{uid}: AI replies, the human team's replies (admin panel "קלי · ממתינים
  // למענה"), the welcome message, and handoffs (needsHuman on the thread doc instead of a
  // message in the old chats/{uid_system_kelly_coach} DM). Users without AI get the same screen
  // in "team only" mode. Fail-closed; superAdminValue false — the panel toggle is the one
  // switch (the server reads the real value and ignores the override anyway). Off = today's
  // behaviour: separate "קלי AI" screen + the human Kelly DM.
  { key: 'kellyUnifiedV1', firestoreKey: 'kelly_unified_v1', defaultValue: false, superAdminValue: false },
  // Kelly phase 3 (19.10.2026, owner-approved) — proactive Kelly: at most ONE Kelly message a
  // day per user in the unified thread (+ a 'coach' push counted in the daily push cap): the
  // morning line on a training day, the Friday weekly summary, a level-check nudge, a weather
  // tip, and "איך היה?" after a saved workout (קל / בדיוק / קשה stored server-side). Quiet hours,
  // Shabbat opt-in, calm return (lapsed users get only the retention milestones), a user opt-out
  // (Settings, default on). Needs kelly_unified_v1 (the thread) and AI access per user. The
  // server (proactive run route + onKellyThreadMessage) is the enforcer. Fail-closed;
  // superAdminValue false. Off = byte-identical (nothing is evaluated or written).
  { key: 'aiCoachProactive', firestoreKey: 'ai_coach_proactive', defaultValue: false, superAdminValue: false },
  // Sub-flag of ai_coach_proactive: ONE sentence of the proactive message personalized by the
  // fast model (Haiku), under the AI budget + a per-run cap. Off = the deterministic template only.
  { key: 'aiCoachProactiveLlm', firestoreKey: 'ai_coach_proactive_llm', defaultValue: false, superAdminValue: false },
  // Kelly phase 3 — memory: a nightly fast-model pass keeps up to 20 durable facts per user
  // (injury or sensitivity they said, schedule limits, goals or events, preferences) in
  // ai_coach_memory/{uid} (server only), shown to Kelly as "מה אני זוכר עליך" and to the user
  // ("מה קלי זוכר", per-fact delete + delete all). Fail-closed; off = no extraction, no block,
  // no screen.
  { key: 'aiCoachMemory', firestoreKey: 'ai_coach_memory', defaultValue: false, superAdminValue: false },
  // Kelly round 4 (19.10.2026, owner-approved) — aerobic sessions from chat (walk, easy run by
  // effort, a run from the user's running program, + a short core or strength block; optional
  // loop route), find_nearby_parks (read-only, by the user's area, filtered by gear), get_weather
  // (read-only, same weather service + weather_admins_only gate), honest "home has too little at
  // your level → nearby parks", and "איך משתמשים": the first-run tour replayable from Settings and
  // from Kelly (start_tutorial) + a searchable help hub over the same app-help entries. The
  // server is the enforcer (route.ts reads the real value). Fail-closed; superAdminValue false.
  // Off = byte-identical Kelly (prompt, tools, stream, stored messages) and no hub row.
  { key: 'aiCoachRound4', firestoreKey: 'ai_coach_round4', defaultValue: false, superAdminValue: false },
  // iOS keyboard insets (19.10.2026) — the app-wide keyboard-inset controller
  // (src/lib/keyboard): sheets / chat composers / map search sit above the keyboard,
  // the focused field is scrolled into view, and the Capacitor Keyboard plugin is
  // switched to resize:'none' at runtime. Web code ships to every iPhone on deploy,
  // so it's fail-closed and super admins (owner + office) test it on-device first.
  // Off = exactly today's behaviour (the CSS utilities are inert at --kb-inset: 0).
  { key: 'enableKeyboardInsetsV1', firestoreKey: 'enable_keyboard_insets_v1', defaultValue: false, superAdminValue: true },
  // Fast startup v1 (19.10.2026) — returning onboarded users skip the splash wait on `/`
  // (straight to /home from the persisted profile; home re-verifies auth + the users doc in
  // the background), the home trio paints from today's IndexedDB copy and refreshes in place,
  // and programs / gym equipment / trio labels get a 30-min IndexedDB layer (src/lib/fast-startup).
  // Read BEFORE the flags snapshot lands (from the localStorage flags cache), so a panel
  // change reaches a device on its next launch. Fail-closed; superAdminValue false — the
  // panel toggle is the one switch (pre-auth code can't know who is a super admin).
  // Off = exactly today's startup.
  { key: 'enableFastStartupV1', firestoreKey: 'enable_fast_startup_v1', defaultValue: false, superAdminValue: false },
  // Budget light mode (19.10.2026, owner decision) — when the daily or weekly strength set
  // budget is spent, RECOMMENDATIONS (home trio, map hybrid cards / stations, full park, Kelly's
  // generate_workout) offer a LIGHTER strength session (fewer sets, easier bolt, the user's own
  // exercises) with a one-line "why" — instead of the recovery-stretch floor or the core default.
  // A workout the user builds himself (builder / adjuster) gets no budget restriction at all.
  // Read with readLiveFlag (src/features/workout-engine/budget-light). Fail-closed;
  // superAdminValue false — the panel toggle is the one switch. Off = today, byte-identical.
  { key: 'enableBudgetLightMode', firestoreKey: 'enable_budget_light_mode', defaultValue: false, superAdminValue: false },
  // Route quality v1 (19.10.2026, owner-approved phases 0+1) — the loop route generator places
  // waypoints ON quiet streets (geohash ring sampling, far fewer Firestore reads), pins them for
  // Mapbox (walkway bias + radius + travel bearing), drops blind synthetic points, trims dead-end
  // spurs, rejects loops that retrace / U-turn / are too thin / cross major roads unmarked, and
  // stops inventing lit / traffic / benches / rating. Read on the device via readLiveFlag (the
  // generator is a plain module), so superAdminValue false — the panel toggle is the one switch.
  // Off = the generator is byte-identical. A/B: /admin/routes/quality.
  { key: 'enableRouteQualityV1', firestoreKey: 'enable_route_quality_v1', defaultValue: false, superAdminValue: false },
  // GraphHopper routes (19.10.2026, owner-approved) — loop generation moves to OUT's
  // self-hosted GraphHopper (Cloud Run me-west1, infra/graphhopper/) via POST
  // /api/routes/generate: mix best-of-6 + spur trimming + route-quality scoring. Any
  // error / timeout (> 2 s) / empty answer falls back to the existing Mapbox generator.
  // Read on the device via readLiveFlag, so superAdminValue false — the panel toggle is
  // the one switch. Off = the generator is byte-identical. A/B: /admin/routes/quality.
  { key: 'enableGraphhopperRoutes', firestoreKey: 'enable_graphhopper_routes', defaultValue: false, superAdminValue: false },
  // Loops prefer our routes (19.10.2026, owner-approved) — generated loops pass along OUR mapped
  // routes (official_routes) when they are nearby: v1 (Mapbox) seeds waypoints ON those routes
  // and ranks loops by their share on them (needs enable_route_quality_v1); GraphHopper gets them
  // as a buffered custom area with a priority boost + the same share in its scoring. Read on the
  // device via readLiveFlag, so superAdminValue false — the panel toggle is the one switch.
  // Off = the generator is byte-identical. A/B: /admin/routes/quality.
  { key: 'enableLoopsPreferOfficial', firestoreKey: 'enable_loops_prefer_official', defaultValue: false, superAdminValue: false },
  // "Shadiest route" (RC6, 21.10.2026, owner-approved) — a "המסלול המוצל ביותר" row in the
  // free-run extras sheet. The app sends preferShade to /api/routes/generate, which asks
  // GraphHopper for 6 candidates and ranks them by Technion shade (src/lib/shade) in the 13 cities
  // that have a layer; elsewhere the normal top 3 come back and the response says why. Offered
  // only while enable_graphhopper_routes is on (the Mapbox pipeline ignores it). Default OFF,
  // superAdminValue false — the panel toggle is the one switch. Off = byte-identical.
  { key: 'enableRoutePrefShade', firestoreKey: 'enable_route_pref_shade', defaultValue: false, superAdminValue: false },
  // Time-aware route preference (RC7, 21.10.2026, owner-approved) — GraphHopper loops only: in
  // hot sunny hours (May–Oct, sun > 25°) the server ranks 6 candidates by the hourly shade at
  // that hour (shade/hourly/v1), after dark by lit length (lighting/v1), otherwise the normal
  // top 3. Cities without the layer get the normal top 3. Not a user choice — the app adds
  // `timeAware` to the request while this is on ("shadiest route" wins when picked).
  // Default OFF, superAdminValue false — the panel toggle is the one switch. Off = byte-identical.
  { key: 'enableRouteTimeAware', firestoreKey: 'enable_route_time_aware', defaultValue: false, superAdminValue: false },
  // Route shade tag (22.10.2026, owner request) — "🌳 מוצל X%" on route cards (only when the
  // Technion layer measures ≥ 50% of the route; never "0%") and a shade row in route details
  // (overall %, "עכשיו · בצהריים · אחה״צ" from the hourly layer, "מואר בלילה X%"). Stored routes
  // read route_scores via POST /api/routes/shade (server); GraphHopper loops get `shadedPct` in
  // the generate response. Display only — never changes ranking. Read on the device via
  // readLiveFlag too, so superAdminValue false — the panel toggle is the one switch.
  // Default OFF. Off = cards, details and the generate request/response byte-identical.
  { key: 'enableRouteShadeTag', firestoreKey: 'enable_route_shade_tag', defaultValue: false, superAdminValue: false },
  // Unified search (19.10.2026, owner-approved design canvas) — /search becomes one search over
  // exercises, parks, routes, people & groups, events, articles and help (site_content), with
  // chips + counts, grouped "הכל" results, recents, situation suggestions, "אולי חיפשת" and Ask
  // Kelly; the map search (SearchOverlayV2) gains quick chips + a "חיפוש בכל האפליקציה" row.
  // The exercise library under "תרגילים" is the same component as today. Fail-closed; super
  // admins preview it. Off = today's /search and map search, byte-identical.
  { key: 'enableUnifiedSearch', firestoreKey: 'enable_unified_search', defaultValue: false, superAdminValue: true },
  // Entry flow v2 — step 2 on the map (20.10.2026, owner-approved design canvas N2/N2b/N2k,
  // R1–R3, R6). After the location step (enable_entry_globe_v1) lands on /map with entry=v2,
  // a one-time "מה בא לך עכשיו?" drawer (route card when a park / route is near, the personal
  // plan hero, Kelly with ready chips); the first floating route card gets a 3-bubble finger
  // tutorial, the route card a "first workout" line until the health declaration is accepted,
  // and the route player a one-time long-press tip. Fail-closed; super admins preview it.
  // Off = byte-identical map, cards and player.
  { key: 'enableEntryWhatnowV1', firestoreKey: 'enable_entry_whatnow_v1', defaultValue: false, superAdminValue: true },
  // Generation review (19.10.2026, owner) — learn from every generated session: each session a
  // generator SHOWS (home trio, Kelly workouts, hybrid compositions, generated loops / A→B routes,
  // planned runs) is summarized on the device (no names, area = geohash-5, route ends trimmed) and
  // stored server-side in generation_log (60-day TTL); a nightly job runs invariant rules over the
  // day and fills /admin/generation-review; "דווח על בעיה" in the overview drawers. The server is
  // the enforcer (the log route reads the real value; a sample % lives in
  // app_config/generation_review.samplePct). superAdminValue true: super admins are ALWAYS
  // captured and always see the report button. Off = byte-identical for every other user
  // (nothing summarized, sent or written).
  { key: 'enableGenerationReview', firestoreKey: 'enable_generation_review', defaultValue: false, superAdminValue: true },
  // Sub-flag: the nightly review also asks the smart model (Sonnet) "does this make sense for this
  // user" on a small daily sample, under the AI budget + its own daily cap. Off = rules only.
  { key: 'enableGenerationReviewLlm', firestoreKey: 'enable_generation_review_llm', defaultValue: false, superAdminValue: false },
  // Org access-code prompt (19.10.2026, owner-approved audit fix) — picking the persona
  // "עובד משרד" on the persona screen (lifestyle wizard / onboarding PERSONA step) opens the
  // optional "יש לך קוד גישה מהארגון?" popup (AccessCodeGate → validateAccessCode → company
  // affiliation / league tab). Until now it opened for EVERY user (a B2B prompt shown to B2C);
  // off = the persona is simply selected, no popup. Kept for B2B to switch back on. Read in
  // PersonaStep via useFeatureFlags() without the super-admin override, so the panel toggle is
  // the one switch. Fail-closed; superAdminValue false.
  { key: 'enableOrgAccessCodePrompt', firestoreKey: 'enable_org_access_code_prompt', defaultValue: false, superAdminValue: false },
  // Entry flow v2 — location step (20.10.2026, owner-approved design canvas M1b–M5). The
  // quick-signup location step (/explorer → UnifiedLocationStep mode="explorer") gets the new
  // presentation: the live Earth with the "בשביל ___ לא צריך כלום" headline, a dive from space
  // to the user's street while fast-locate runs, the "גרים ב…?" confirm drawer with the nearest
  // park, and the grouped city/neighbourhood search. All the step's logic (GPS on tap, lookups,
  // drag-to-refine, handleConfirm) is unchanged. Confirm lands on /map?fromExplorer=true&entry=v2
  // + sessionStorage entry_v2_landing=1 (read by the entry flow's step 2). Fail-closed; super
  // admins preview it. Off = byte-identical location step.
  { key: 'enableEntryGlobeV1', firestoreKey: 'enable_entry_globe_v1', defaultValue: false, superAdminValue: true },
  // JIT identity before the health declaration (20.10.2026, entry flow v2 brief B) — a user with
  // no known identity (quick signup "הרשמה מהירה" → MAP_ONLY, no name / birth date) who starts a
  // workout first fills the existing identity screen (gender, birth date, name — same validation,
  // v2 look) inside the JIT gate, so the health declaration is signed with their real name and
  // gendered copy. onboardingPath / onboardingStatus are left untouched. Fail-closed; super admins
  // preview it. Off = today's JIT gate (health declaration only), byte-identical.
  { key: 'enableJitIdentityV1', firestoreKey: 'enable_jit_identity_v1', defaultValue: false, superAdminValue: true },
  // Entry flow v2 — landing + the 5-barrier intro stories (20.10.2026, owner-approved design canvas
  // intro-S1/SB/S2–S6/G1, brief E). The landing becomes the city portrait ("ברוכים הבאים ל-OUT");
  // "הרשמה מהירה" runs the same quick signup, then — once per device (onboardingPrefs
  // entry_intro_seen) — /intro: the "why it's hard to keep going" bridge + five story screens
  // (time, community, access, money, know-how), and the ring closes into the OUT logo over the
  // location step's globe. Pending invites keep their own redirects. Fail-closed; super admins
  // preview it once signed in (the landing itself is pre-auth, so it follows the global value).
  // Off = today's landing and flow, byte-identical.
  { key: 'enableEntryIntroV1', firestoreKey: 'enable_entry_intro_v1', defaultValue: false, superAdminValue: true },
  // Entry flow v2 — strength quiz drag hint (20.10.2026, owner-approved design Q1–Q3, brief G).
  // The v2 coverflow strip in the strength assessment teaches itself: no blur mask, no bubble
  // card; on the first category the strip demos itself (harder, harder, back — the video and the
  // CTA follow), a dark coach pill above it until the first real drag, then a light "now stop on
  // the hardest" line; later categories get one short nudge. Fail-closed; super admins preview it.
  // Off = today's tutorial (mask + bubble + finger), byte-identical.
  // Retire /gateway as the fallback (21.10.2026, owner-approved — agent-briefs/gateway-retire-brief.md).
  // Every place that used to send a user to the old track picker (/gateway) goes to the real flow
  // instead: a signed-in user with no users doc gets the quick-signup scaffold → /intro / /explorer;
  // an unknown / ONBOARDING / missing status → /home with a program, else /explorer; referral and
  // invite links → / (welcome); back-without-history → / (or /home); /gateway itself redirects to /.
  // Fail-closed. superAdminValue FALSE on purpose: it changes where an account lands on launch, so
  // the panel toggle is the one switch (also keeps the sync cache reader — flag.ts — in agreement).
  // Off = byte-identical routing.
  { key: 'enableLandingRealFallback', firestoreKey: 'enable_landing_real_fallback', defaultValue: false, superAdminValue: false },
  { key: 'enableStrengthQuizHintV2', firestoreKey: 'enable_strength_quiz_hint_v2', defaultValue: false, superAdminValue: true },
  // Run / walk live players — map first (21.10.2026, owner — agent-briefs/run-player-drawer-brief.md).
  // Inside the enable_home_v2 run / walk players (free, route, walk, planned intervals, continuous):
  // the metrics card becomes a drawer (compact time · distance · pace ⇄ today's full card; further
  // down still opens the session list), the follow camera keeps the runner's marker just above the
  // drawer at every snap and re-follows ~8 s after a pan, the live trail is solid (zone-coloured on
  // planned runs) and the story bars sit in a header strip attached to the top edge instead of a
  // floating card. Fail-closed; super admins preview it. Off = byte-identical players.
  { key: 'enableRunPlayerDrawerV1', firestoreKey: 'enable_run_player_drawer_v1', defaultValue: false, superAdminValue: true },
  // Two-level schedule UI (21.10.2026, owner-approved — agent-briefs/week-builder-brief.md, boards
  // S-2a…S-2h). Inside the enable_home_v2 signup schedule flows: a simple plan (one repeated
  // workout, one track, under 5 days) keeps the days picker (S-2b look) and today's week screen; a
  // complex plan (a strength split, two tracks, a walking plan next to another track, or 5+ days)
  // gets the week builder after the days step (per-day cards with the engine's "why" line, drag to
  // another day validated by schedule engine v2, tap a day to edit, "אישור השבוע"). Same builder in
  // add-second-track (S-6b / S-6c). Writes only what those flows already write. Fail-closed; super
  // admins preview it. Off = byte-identical flows.
  { key: 'enableWeekBuilderV1', firestoreKey: 'enable_week_builder_v1', defaultValue: false, superAdminValue: true },
  // Map polish (21.10.2026, owner — agent-briefs/map-polish-brief.md). Inside enable_home_v2's map:
  // every "navigate there" button (park card, park page, route sheets, a live user's card) goes
  // to the ONE in-app destination flow (commute carousel → player); "כל פרטי המסלול" and the
  // global route fallback stay in the v2 route overview instead of the legacy RouteDetailSheet;
  // a compact park card; layers panel toggles for parks and routes. Fail-closed; super admins
  // preview it. Off = byte-identical map.
  { key: 'enableMapPolishV1', firestoreKey: 'enable_map_polish_v1', defaultValue: false, superAdminValue: true },
  // Demo world (20.10.2026, owner-approved — agent-briefs/demo-users-design.md §2.1). The one
  // kill-switch for the simulated demo users (the scheduled simulator, PR 4, exits without
  // writing while it is off). Nothing reads it yet in PR 1 (isolation guards only). Default
  // OFF and superAdminValue FALSE on purpose: a super admin must never switch the demo world
  // on just by opening the app — only the explicit toggle in system settings does.
  { key: 'enableDemoUsers', firestoreKey: 'enable_demo_users', defaultValue: false, superAdminValue: false },
  // Demo control center (20.10.2026, owner: start/stop everything live from /admin/demo).
  // Sub-switches of enable_demo_users — both meaningless while it is off. Same reasoning as above:
  // default OFF, superAdminValue FALSE (only the explicit switch turns them on). Read by the
  // server-side demo engines (life-engine chat replies, AI tester runner), never by app UI.
  //   demo_life_llm      — the life engine may write chat replies with a small LLM (else phrase bank)
  //   enable_ai_testers  — the AI tester runner may start (agent-briefs/ai-testers-design.md §5.3)
  //   demo_kelly         — Kelly (proactive sends, memory, workout reviewer) also runs on demo
  //                        users; its usage counts toward the demo budget (usage bySource.kelly)
  { key: 'demoLifeLlm', firestoreKey: 'demo_life_llm', defaultValue: false, superAdminValue: false },
  { key: 'enableAiTesters', firestoreKey: 'enable_ai_testers', defaultValue: false, superAdminValue: false },
  { key: 'demoKelly', firestoreKey: 'demo_kelly', defaultValue: false, superAdminValue: false },
  // i18n wave 1 (21.10.2026, owner-approved docs/i18n/PLAN.md §3.1) — the translation layer.
  // enable_i18n is the master: off = locale is always 'he', no out_locale cookie, <html lang dir>
  // exactly as before (byte-identical Hebrew). On = the locale resolves from users/{uid}.core.locale
  // → onboardingPrefs 'app_locale' → device language, among the languages switched on below.
  // The per-language flags stay OFF (superAdminValue false too) until that language's catalogs
  // are complete — a super admin must not land in a half-translated app by opening it.
  { key: 'enableI18n', firestoreKey: 'enable_i18n', defaultValue: false, superAdminValue: true },
  { key: 'enableLocaleEn', firestoreKey: 'enable_locale_en', defaultValue: false, superAdminValue: false },
  { key: 'enableLocaleRu', firestoreKey: 'enable_locale_ru', defaultValue: false, superAdminValue: false },
  { key: 'enableLocaleDe', firestoreKey: 'enable_locale_de', defaultValue: false, superAdminValue: false },
  // App-session signal (22.10.2026, owner-approved — docs/admin/ADMIN-AI-ASSISTANT-PLAN.md open
  // question 10): "came back to the app without tapping a push". The old app_open/session_start
  // event types were removed (#171) because nothing ever fired them — not for cost or noise — so
  // this is a NEW, aggregated signal, not a raw event stream: ONE doc per user per Israel day
  // (app_sessions_daily/{uid}_{date}: sessions + pushSessions counters, platform, lastAt) — one
  // write per session (≥30 min in the background = new session), capped at 12 a day. No location,
  // no PII; honours the analytics opt-out. Read synchronously via readLiveFlag
  // (src/features/analytics/app-session.ts) → superAdminValue FALSE. Fail-closed. Needs the
  // app_sessions_daily rules (firestore.rules) deployed BEFORE it is switched on.
  { key: 'enableAppSessionSignal', firestoreKey: 'enable_app_session_signal', defaultValue: false, superAdminValue: false },
] as const;

export type FirestoreFlagKey = (typeof FLAG_DEFS)[number]['firestoreKey'];

/** Firestore-field-keyed defaults (snake_case) — what the admin panel's form state uses. */
export const FIRESTORE_FLAG_DEFAULTS: Record<FirestoreFlagKey, boolean> = Object.fromEntries(
  FLAG_DEFS.map((d) => [d.firestoreKey, d.defaultValue]),
) as Record<FirestoreFlagKey, boolean>;
