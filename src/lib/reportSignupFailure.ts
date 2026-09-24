/**
 * reportSignupFailure.ts — client-side, fail-safe, fire-and-forget report
 * of a signup/onboarding failure to POST /api/telemetry/signup-failure.
 * See src/lib/signupFailureLog.ts for the shared stage list and the
 * no-PII/fail-safe requirements this must uphold.
 *
 * Deliberately never awaited by any caller, and never throws — a failure
 * here (network error, the endpoint being down, rate-limited) must not
 * add a SECOND error on top of whatever the caller was already handling.
 * Call it as a bare statement inside an existing catch block, right next
 * to the existing console.error — it does not replace that logging, it
 * supplements it with something queryable after the fact.
 */
import { auth } from '@/lib/firebase';
import type { SignupFailureStage } from '@/lib/signupFailureLog';

/**
 * Extracts a short, safe error CODE from an unknown caught value — never
 * the raw `.message`, which can vary in shape and isn't guaranteed free
 * of dynamic/user-entered content. Firebase SDK errors expose `.code`
 * (e.g. 'auth/network-request-failed', 'permission-denied'); anything
 * else falls back to `.name`, then a fixed 'unknown' string.
 */
export function extractErrorCode(err: unknown): string {
  if (err && typeof err === 'object') {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string' && code.length > 0) return code;
    const name = (err as { name?: unknown }).name;
    if (typeof name === 'string' && name.length > 0) return name;
  }
  return 'unknown';
}

export function reportSignupFailure(stage: SignupFailureStage, reason: string): void {
  void (async () => {
    try {
      let token: string | undefined;
      try {
        token = await auth.currentUser?.getIdToken();
      } catch {
        token = undefined;
      }
      await fetch('/api/telemetry/signup-failure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ stage, reason }),
      });
    } catch {
      // Fail-safe by design — see file header.
    }
  })();
}
