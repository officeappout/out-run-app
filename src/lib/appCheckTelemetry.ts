/**
 * appCheckTelemetry.ts — measurement only, changes no App Check behaviour.
 *
 * Why this exists (13.10.2026): the Firestore App Check console split is
 * Verified 29% / Outdated client 27% / Invalid 44% / Unknown origin 0%. The
 * console cannot say WHICH platform or WHICH reason produces the Invalid
 * 44%. This reports a small, sampled, PII-free set of facts to Sentry so the
 * split can be read per platform:
 *
 *   • init     — which provider is actually in use (debug vs attested vs
 *                reCAPTCHA). Answers "is a debug provider live in prod?"
 *   • failure  — a native getToken() failure, by classified reason.
 *   • handoff  — how much REAL life the native token had left when it was
 *                handed to the web SDK (see firebase.ts: the CustomProvider
 *                reports a fixed 50-min expiry regardless).
 *   • web      — the error code (+ HTTP status) from a one-time web token
 *                probe when reCAPTCHA Enterprise fails.
 *
 * Privacy: no uid, no token, no URL, no message text — only enums and
 * buckets. Events go through sentryBeforeSend like everything else.
 *
 * Alerts: events are tagged `environment: appcheck-diagnostics`, NOT
 * `production`, so they never match the `environment:production` alert rules
 * (new issue / spike / regression). The alert rules are untouched.
 *
 * Volume: one sampling decision per app launch (SAMPLE_RATE), plus a
 * once-per-key-per-launch dedupe — bounded, not per-request.
 */

export const SAMPLE_RATE = 0.1;
export const TELEMETRY_ENVIRONMENT = 'appcheck-diagnostics';

/** The fixed expiry firebase.ts's CustomProvider currently reports. */
export const REPORTED_TTL_MS = 50 * 60 * 1_000;

export type TelemetryPlatform = 'ios' | 'android' | 'web' | 'unknown';

/**
 * Bucket the REAL remaining life of a native token at hand-off.
 * `expired` / `lt5m` / `lt15m` / `lt30m` / `lt50m` are all cases where the
 * fixed 50-min report outlives the token; `gte50m` is the benign case.
 */
export function bucketRemainingLife(remainingMs: number | undefined): string {
  if (remainingMs === undefined || !Number.isFinite(remainingMs)) return 'unknown';
  if (remainingMs <= 0) return 'expired';
  const min = remainingMs / 60_000;
  if (min < 5) return 'lt5m';
  if (min < 15) return 'lt15m';
  if (min < 30) return 'lt30m';
  if (min < 50) return 'lt50m';
  return 'gte50m';
}

/** True when the reported 50-min TTL outlives the token's real life. */
export function reportedTtlOutlivesToken(remainingMs: number | undefined): boolean | 'unknown' {
  if (remainingMs === undefined || !Number.isFinite(remainingMs)) return 'unknown';
  return remainingMs < REPORTED_TTL_MS;
}

// ── per-launch state (module scope = one app launch) ──────────────────────
let sampled: boolean | null = null;
const sent = new Set<string>();

function isSampled(): boolean {
  if (typeof window === 'undefined') return false;
  if (process.env.NODE_ENV !== 'production') return false;
  if (sampled === null) sampled = Math.random() < SAMPLE_RATE;
  return sampled;
}

async function send(
  message: string,
  tags: Record<string, string>,
): Promise<void> {
  const key = `${message}|${Object.entries(tags).sort().join(',')}`;
  if (!isSampled() || sent.has(key)) return;
  sent.add(key);
  try {
    // Dynamic import: keeps Sentry out of firebase.ts's static graph.
    const Sentry = await import('@sentry/nextjs');
    Sentry.withScope((scope) => {
      scope.setLevel('info');
      scope.setTags(tags);
      scope.setFingerprint(['app-check-telemetry', message, ...Object.values(tags)]);
      scope.addEventProcessor((event) => {
        event.environment = TELEMETRY_ENVIRONMENT;
        return event;
      });
      Sentry.captureMessage(message);
    });
  } catch {
    // Telemetry must never affect the app.
  }
}

export function reportAppCheckInit(platform: TelemetryPlatform, provider: string): void {
  void send('app_check_init', { platform, provider });
}

export function reportAppCheckFailure(platform: TelemetryPlatform, reason: string): void {
  void send('app_check_native_failure', { platform, reason });
}

export function reportAppCheckHandoff(
  platform: TelemetryPlatform,
  remainingMs: number | undefined,
): void {
  void send('app_check_native_handoff', {
    platform,
    remaining_life: bucketRemainingLife(remainingMs),
    reported_ttl_outlives_token: String(reportedTtlOutlivesToken(remainingMs)),
  });
}

export function reportAppCheckWebError(code: string, httpStatus?: number): void {
  void send('app_check_web_error', {
    platform: 'web',
    code: code.slice(0, 60),
    http_status: httpStatus === undefined ? 'none' : String(httpStatus),
  });
}

/** Test helper — resets per-launch state. */
export function __resetAppCheckTelemetryForTests(): void {
  sampled = null;
  sent.clear();
}
