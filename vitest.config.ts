import { defineConfig } from 'vitest/config';
import path from 'path';

// Unit tests (pure logic — engine rules, route-request mapping, schema
// contracts). No jsdom/component testing yet; that is a separate decision.
//
// tests/firestore-rules.test.ts is the one exception: it's an emulator
// integration suite, not a pure-logic unit test. It requires
// `firebase emulators:start --only firestore` running separately
// (127.0.0.1:8080) — every case in it fails immediately if the emulator
// isn't up. testTimeout/hookTimeout are raised project-wide so its
// emulator round-trips (and one 25-document stress suite) don't trip the
// default 5s/10s vitest limits; that's harmless for the fast unit tests too.
//
// storage.rules changes (SPEC-02 F-14) are NOT covered by an equivalent
// automated suite here — the Firebase Storage emulator proved unreliable
// in this environment (repeated timeouts/crashes across two attempts via
// @firebase/rules-unit-testing's storage client) and a hanging test file
// would violate this project's own "npm test must stay green" rule worse
// than having no automated coverage. See SPEC-02's final report for the
// manual verification this fix relies on instead.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  // tsconfig's "jsx": "preserve" (Next owns the JSX transform) would otherwise
  // leave JSX untouched and vitest can't parse .tsx. Compile it with the
  // automatic runtime for tests only. Needed by the v2 primitives' render
  // tests below — still node environment, no jsdom (SSR via react-dom/server).
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    include: [
      'src/**/__tests__/**/*.test.ts',
      // Design language v2 primitives — static-markup render tests (node env).
      'src/components/ui/v2/__tests__/**/*.test.tsx',
      // Error boundaries + lazy overlay wrappers — same static-markup approach.
      'src/components/system/__tests__/**/*.test.tsx',
      // Unified overview drawer (parks) — parity + render tests, same static-markup approach.
      'src/features/parks/core/components/overview/__tests__/**/*.test.tsx',
      // Run workout overview on the same drawer (enable_home_v2) — same static-markup approach.
      'src/features/workout-engine/players/running/components/overview-v2/__tests__/**/*.test.tsx',
      // i18n wave 2 (player namespace, run.*) — Hebrew markup parity of the running players, static markup.
      'src/features/workout-engine/players/running/components/**/__tests__/**/*.test.tsx',
      // Unified search (enable_unified_search) — flag-off parity + card render tests, static markup.
      'src/features/search/__tests__/**/*.test.tsx',
      // Entry intro (enable_entry_intro_v1) — SSR smoke render of the landing / bridge / stories.
      'src/features/user/onboarding/intro/__tests__/**/*.test.tsx',
      // i18n wave 2 pilot (profile namespace) — Hebrew markup parity, static markup.
      'src/features/activity/components/__tests__/**/*.test.tsx',
      'src/features/progression-map/components/__tests__/**/*.test.tsx',
      // i18n wave 2 — Partner Finder Hebrew markup parity (static markup, node env).
      'src/features/partners/components/__tests__/**/*.test.tsx',
      // i18n wave 2 (onboarding namespace) — strength quiz Hebrew markup parity.
      'src/features/user/onboarding/components/visual-assessment/__tests__/**/*.test.tsx',
      // i18n wave 2 (map namespace) — route preview + equipment sheets, Hebrew markup parity (jsdom).
      'src/features/parks/client/components/route-preview/__tests__/**/*.test.tsx',
      'src/features/parks/client/components/equipment-detail/__tests__/**/*.test.tsx',
      // i18n wave 2 (community namespace) — group page Hebrew markup parity (static markup + jsdom taps).
      'src/features/arena/components/group-details/__tests__/**/*.test.tsx',
      // i18n wave 2 (onboarding namespace) — strength assessment page parity (jsdom, services mocked).
      'src/app/onboarding-new/assessment-visual/__tests__/**/*.test.tsx',
      // i18n wave 2 (profile namespace) — exercise page v2, Hebrew markup parity (jsdom).
      'src/features/profile/components/exercise-analytics-v2/__tests__/**/*.test.tsx',
      // i18n wave 2 batch 1 (profile namespace, hub.*) — progress tab v2 Hebrew markup parity, static markup.
      'src/features/progression-hub/v2/components/__tests__/**/*.test.tsx',
      // i18n wave 2 (library namespace, exercises.*) — exercise library Hebrew markup parity (jsdom).
      'src/features/content/exercises/client/__tests__/**/*.test.tsx',
      // i18n wave 2 (profile namespace, profile.* / widgets.*) — profile screen components, Hebrew markup parity (jsdom).
      'src/features/profile/components/__tests__/**/*.test.tsx',
      // i18n wave 2 (community namespace) — arena cards / sheets / session banner parity (static + jsdom).
      'src/features/arena/components/__tests__/**/*.test.tsx',
      // i18n wave 2 (onboarding namespace, steps.* / location.*) — onboarding steps + location sheets parity (jsdom).
      'src/features/user/onboarding/components/steps/**/__tests__/**/*.test.tsx',
      // i18n wave 2 (community namespace, social.*) — feed / share / activity components, Hebrew markup parity.
      'src/features/social/components/__tests__/**/*.test.tsx',
      // i18n wave 2 (app pages: legal / join / session / settings / map error / league / workout history) —
      // Hebrew markup parity of the route pages' own copy (static markup + jsdom).
      'src/app/__tests__/app-pages-i18n/**/*.test.tsx',
      'tests/firestore-rules.test.ts',
      'tests/military-panel-adversarial-audit.rules.test.ts',
      'tests/firestore-fix-write-layer2-batch-a.rules.test.ts',
      'tests/firestore-fix-write-layer2-batch-b-attendance.rules.test.ts',
      'tests/firestore-fix-feed-posts-scope-fields.rules.test.ts',
      'tests/firestore-fix-group-invitations-hostuid.rules.test.ts',
      'tests/storage-fix-delete-rules.rules.test.ts',
      'tests/firestore-fix-planned-sessions-privacy.rules.test.ts',
      'tests/firestore-fix-membercount-streaks-clamp.rules.test.ts',
      'tests/firestore-fix-connections-selffollow.rules.test.ts',
      'tests/firestore-fix-chats-messages-fieldguard.rules.test.ts',
      'tests/firestore-fix-agents-lockdown.rules.test.ts',
      // admin_costs / admin_cost_items server-only lockdown (/admin/costs) — emulator :8089.
      'tests/firestore-admin-costs.rules.test.ts',
      // demo_registry server-only lockdown + users.core.demo stamp lock (demo world PR 1) — emulator :8089.
      'tests/firestore-demo-registry.rules.test.ts',
      // demo actor sandbox (B1: uid demo_* / claim demo writes only to demo targets) — emulator :8089.
      'tests/firestore-demo-actor-sandbox.rules.test.ts',
      // site_content published-only read / content_suggestions server-only — emulator :8089.
      'tests/firestore-site-content.rules.test.ts',
      'tests/firestore-exercise-swaps.rules.test.ts',
      // workouts.timedBlocks (enable_home_v2) write + read back — emulator :8089.
      'tests/workouts-timed-blocks.rules.test.ts',
      'tests/firestore-trail-segments.rules.test.ts',
      // trails --apply write path on the emulator — self-skips unless FIRESTORE_EMULATOR_HOST is set.
      'tests/trails-apply.emulator.test.ts',
      'tests/firestore-fix-ai-entitlements.rules.test.ts',
      'tests/firestore-ai-coach-threads.rules.test.ts',
      // Pace self-correction write path (users.running.paceProfile) — emulator :8089.
      'tests/pace-profile-self-correction.rules.test.ts',
      // Streak kept-gap bridge (Saturday rule / shields) under the existing streaks rule — emulator :8089.
      'tests/streak-bridge.rules.test.ts',
      // AI testers' boot sync (streaks write shape) — emulator :8089.
      'tests/firestore-qa-tester-activity-sync.rules.test.ts',
      // functions/ is a separate package (own tsconfig, not installed in
      // this root's node_modules) — only files with zero external
      // imports (pure logic, like accessCodeRateLimit.ts) can run here.
      'functions/src/**/__tests__/**/*.test.ts',
      // CI tooling — the tsc baseline gate's normalizer + compare mode (17.10.2026).
      'scripts/ci/__tests__/**/*.test.ts',
      // Demo world scripts (seed / purge / add-viewer) — pure units + one emulator suite (:8089).
      'scripts/demo/__tests__/**/*.test.ts',
      // AI tester runner + overseer (scripts/qa) — pure units only (no browser, no network).
      'scripts/qa/__tests__/**/*.test.ts',
    ],
    // hybrid-runtime.test.ts + hybrid-orchestrator.test.ts (22.09.2026,
    // field-test doc 12/13): both predate this vitest setup — plain
    // console-log/process.exit scripts meant to run via `npx tsx` directly
    // (both say so in their own header, "no test framework on this branch"),
    // swept in by accident by the glob above since they live under
    // __tests__/*.test.ts with zero describe/it blocks. All their internal
    // assertions verified passing (52/52, 62/62) via direct tsx execution —
    // excluded here rather than rewritten so their documented standalone
    // usage keeps working unchanged. This closes the gap against this
    // file's own pre-existing "npm test must stay green" rule (see header
    // comment above) for both files. Vitest's own `exclude` REPLACES its
    // built-in default list rather than merging with it, so that default
    // (node_modules/dist/etc.) is repeated here verbatim — otherwise these
    // two extra entries would silently un-exclude everything vitest
    // normally skips.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      'src/features/workout-engine/hybrid/__tests__/hybrid-runtime.test.ts',
      'src/features/workout-engine/hybrid/__tests__/hybrid-orchestrator.test.ts',
    ],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
