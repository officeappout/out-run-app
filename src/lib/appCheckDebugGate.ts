/**
 * appCheckDebugGate.ts — SPEC-02 SEC-10
 *
 * Both App Check debug paths in firebase.ts (the web debug-token global at
 * `FIREBASE_APPCHECK_DEBUG_TOKEN`, and the native CustomProvider's `debug`
 * flag passed to `FirebaseAppCheck.initialize`) used to activate purely off
 * an env var (`NEXT_PUBLIC_APP_CHECK_DEBUG_TOKEN` / `NEXT_PUBLIC_APP_CHECK_DEBUG`),
 * with no build-environment check at all. If either var ever leaked into a
 * Vercel Production environment (or shipped in a TestFlight production
 * build — Next.js inlines `process.env.NODE_ENV` at build time, so this
 * check is reliable there too, not just on Vercel), every real user's
 * session would run App Check in debug mode: anyone who obtained the debug
 * token could mint their own App Check tokens, defeating attestation for
 * the whole production app.
 *
 * Extracted as a pure function so the guard is unit-testable without
 * needing `window` or a real Firebase app.
 */
export function isAppCheckDebugAllowed(nodeEnv: string | undefined): boolean {
  return nodeEnv !== 'production';
}
