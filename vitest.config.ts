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
    include: ['src/**/__tests__/**/*.test.ts', 'tests/firestore-rules.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
