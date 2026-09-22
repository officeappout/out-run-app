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
  test: {
    include: [
      'src/**/__tests__/**/*.test.ts',
      'tests/firestore-rules.test.ts',
      // functions/ is a separate package (own tsconfig, not installed in
      // this root's node_modules) — only files with zero external
      // imports (pure logic, like accessCodeRateLimit.ts) can run here.
      'functions/src/**/__tests__/**/*.test.ts',
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
