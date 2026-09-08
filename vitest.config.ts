import { defineConfig } from 'vitest/config';
import path from 'path';

// Unit tests (pure logic — engine rules, route-request mapping, schema
// contracts). No jsdom/component testing yet; that is a separate decision.
//
// tests/firestore-rules.test.ts is the one exception: it's an emulator
// integration suite, not a pure-logic unit test. It requires
// `firebase emulators:start --only firestore,auth` running separately
// (127.0.0.1:8080) — every case in it fails immediately if the emulator
// isn't up. testTimeout/hookTimeout are raised project-wide so its ~100
// emulator round-trips (and one 25-document stress suite) don't trip the
// default 5s/10s vitest limits; that's harmless for the fast unit tests too.
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
