/**
 * native-auth-validation.ts
 *
 * Shared type definitions for the pre-flight native build validator and the
 * Firebase App Check error classification layer.
 *
 * Consumed by:
 *   • scripts/preflight-native-check.mjs  (runtime validation before builds)
 *   • src/lib/firebase.ts                 (structured App Check error logging)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Pre-flight validation result
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validation result shape returned by scripts/preflight-native-check.mjs.
 * Each boolean maps to one discrete native configuration requirement.
 *
 * Extend this interface (never change existing keys) when adding new checks.
 */
export interface NativeAuthValidation {
  /** iOS Info.plist contains a URL scheme starting with com.googleusercontent.apps. */
  isIosUrlSchemeValid: boolean;
  /** ios/App/App/GoogleService-Info.plist is present in the filesystem. */
  isFirebaseConfigBundled: boolean;
  /** android/app/google-services.json is present and parseable as JSON. */
  isAndroidConfigPresent: boolean;
  /** capacitor.config.ts server.url block is commented out (local-bundle production mode). */
  isServerBlockDisabled: boolean;
  /** google-services.json contains at least one certificate_hash (SHA-1 / SHA-256). */
  isSha1Present: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// App Check failure classification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Discrete error categories emitted by the Firebase App Check CustomProvider
 * when native attestation fails (DeviceCheck on iOS, Play Integrity on Android).
 *
 * Classified in firebase.ts → classifyAppCheckError() before every throw,
 * allowing future analytics sinks to distinguish transient network issues
 * from mis-configuration without parsing raw error message strings.
 */
export type AppCheckFailureReason =
  /** Native bridge did not respond within APP_CHECK_TOKEN_TIMEOUT_MS (10 s). */
  | 'TIMEOUT'
  /** Circuit breaker active — too soon after last failure (60 s backoff). */
  | 'BACKOFF'
  /** iOS DeviceCheck / App Attest API returned a non-retriable error. */
  | 'DEVICE_CHECK_ERROR'
  /** Android Play Integrity API returned a non-retriable error. */
  | 'PLAY_INTEGRITY_ERROR'
  /** HTTP 400 "Too many attempts" — device-level rate limit exceeded. */
  | 'RATE_LIMITED'
  /** HTTP 400 "App not registered" — App Check not configured in Firebase Console. */
  | 'NOT_REGISTERED'
  /** initializeAppCheck() itself threw during module initialisation. */
  | 'INIT_FAILED'
  /** Any error not covered by the categories above. */
  | 'UNKNOWN';

/**
 * Structured App Check failure event.
 *
 * Emitted via logAppCheckFailure() in firebase.ts on every getToken() rejection.
 * Future analytics integration (e.g. Firebase Analytics logEvent, Sentry, Datadog)
 * should consume this shape rather than scraping console output.
 */
export interface AppCheckFailureEvent {
  /** Discrete reason code — use this for analytics event naming. */
  reason: AppCheckFailureReason;
  /** Original error message for developer context. */
  message: string;
  /** Native platform where the failure occurred. */
  platform: 'ios' | 'android' | 'unknown';
  /** For BACKOFF failures: milliseconds remaining before the next attempt is allowed. */
  backoffRemainingMs?: number;
}
