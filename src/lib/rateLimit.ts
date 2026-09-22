/**
 * rateLimit.ts — SPEC-02 SEC-15
 *
 * check-email, verify-token, and /api/join/preview each had their OWN
 * in-memory `Map` rate limiter — per-instance, so it resets on every
 * serverless cold start (Vercel routinely recycles instances), which
 * defeats the whole point. This is the ONE shared replacement for all
 * three — a Firestore doc per key, so the count survives cold starts.
 * Not used by validateAccessCode (a separate Cloud Functions runtime
 * that can't import from src/ at all — see that function's own
 * rate-limit code for the necessarily-separate implementation of a
 * different algorithm shape, described below).
 *
 * Sliding-window request count, NOT a failure-counter-with-lockout —
 * matches what check-email/join-preview actually had before (limit
 * total requests per window), unlike validateAccessCode's "10 failures
 * in 15 min -> 1h block" ask, which is a different algorithm entirely.
 */
import type { Firestore } from 'firebase-admin/firestore';

const COLLECTION = 'rate_limits';

// windowStart round-trips through Firestore as a real Timestamp
// (.toMillis()) in production — Admin SDK auto-converts a written Date
// into one. Handled defensively anyway (plain Date/number too) so this
// doesn't silently break if that ever changes, and so it's unit-testable
// against a plain-object mock without needing a real Firestore round-trip.
function toMillis(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'object' && 'toMillis' in (v as object) && typeof (v as { toMillis: unknown }).toMillis === 'function') {
    return (v as { toMillis: () => number }).toMillis();
  }
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  return 0;
}

/**
 * 22.09.2026 (rate-limiting rollout, phase B): wrapped in try/catch —
 * fails OPEN. If Firestore itself is unavailable, a request that should
 * have been checked is instead let through, with a logged warning. The
 * alternative (propagate the error, effectively fail-closed since every
 * caller today turns an uncaught throw into a 500) would mean a Firestore
 * blip locks every real user — including a municipality manager — out of
 * login entirely. One extra request slipping through during a genuine
 * Firestore outage is a far smaller cost than that.
 */
export async function isRateLimited(
  db: Firestore,
  key: string,
  opts: { windowMs: number; maxRequests: number },
): Promise<boolean> {
  const ref = db.collection(COLLECTION).doc(key);
  const now = Date.now();

  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : undefined;
      const windowStartMs = toMillis(data?.windowStart);
      const withinWindow = now - windowStartMs < opts.windowMs;
      const count = withinWindow ? ((data?.count as number | undefined) ?? 0) : 0;

      if (count >= opts.maxRequests) {
        return true;
      }

      tx.set(
        ref,
        {
          count: count + 1,
          windowStart: withinWindow ? (data!.windowStart) : new Date(now),
          // Best-effort TTL cleanup, if a TTL policy is ever configured on
          // this collection — harmless field otherwise.
          expiresAt: new Date(now + opts.windowMs),
        },
        { merge: false },
      );
      return false;
    });
  } catch (err) {
    console.warn(`[rateLimit] check failed for key="${key}" — failing OPEN (request allowed)`, err);
    return false;
  }
}
