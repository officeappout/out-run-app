import { defineConfig } from 'vitest/config';

// First test infra for functions/ — mirrors the root project's vitest.config.ts
// shape (unit tests only, node environment). Run with functions/ as the
// working directory (so this config is auto-discovered and `root` resolves
// correctly — a `--config` path passed from the REPO root resolves `root` to
// the repo root, not this file's directory, and silently reruns the OUTER
// project's tests instead):
//   cd functions && node ../node_modules/.bin/vitest run
// (or `npm test` from inside functions/, same effect).
// Requires functions/node_modules to exist (firebase-admin/firebase-functions
// types resolved from there) — NOT present by default in this repo (see
// scripts/scenario-sweep.ts's header comment for why); run `npm install`
// inside functions/ first, then remove functions/node_modules again
// afterward to restore the state other scripts in this repo depend on.
export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    environment: 'node',
  },
});
