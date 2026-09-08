/**
 * accessCodeRateLimit.ts — SPEC-01 task 4 / SPEC-02
 *
 * validateAccessCode had no attempt limiting at all — a 6-char code
 * (Math.random()-generated, a separate known issue tracked for the
 * rotation spec, not this one) could be brute-forced in a loop. 10
 * failures in 15 minutes -> blocked for 1 hour, tracked separately by
 * uid AND by IP (either one triggers a block for that key).
 *
 * Extracted as a pure function — no firebase-admin/firebase-functions
 * import — for the same reason as the Next.js app's
 * src/lib/validateGroupJoinAccess.ts: unit-testable with a mocked
 * reader, no real emulator connection needed. functions/ is a genuinely
 * separate package (own tsconfig, not installed in this worktree's root
 * node_modules) from the Next.js app, so this can't literally share code
 * with src/lib/rateLimit.ts even though the shape rhymes — that one is a
 * sliding-window request counter, this one is a failure-counter with a
 * punitive lockout, a different algorithm for a different threat (brute
 * force of a low-entropy code, not enumeration-by-volume).
 */

export interface AttemptDocReader {
  doc(path: string): {
    get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
    set(data: Record<string, unknown>, opts?: { merge?: boolean }): Promise<unknown>;
  };
}

export const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const MAX_FAILURES = 10;
export const LOCKOUT_MS = 60 * 60 * 1000; // 1 hour

// blockedUntil/windowStart round-trip through Firestore as a real
// Timestamp (.toMillis()) in production — handled defensively for plain
// Date/number too, same reasoning as src/lib/rateLimit.ts's toMillis().
function toMillis(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'object' && 'toMillis' in (v as object) && typeof (v as { toMillis: unknown }).toMillis === 'function') {
    return (v as { toMillis: () => number }).toMillis();
  }
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  return 0;
}

/** True if this key (uid or ip) is currently locked out. */
export async function isBlocked(db: AttemptDocReader, key: string, now: number): Promise<boolean> {
  const snap = await db.doc(`access_code_attempts/${key}`).get();
  if (!snap.exists) return false;
  return toMillis(snap.data()?.blockedUntil) > now;
}

/**
 * Records a failed attempt for this key. Sets a lockout once the
 * 15-minute failure count reaches MAX_FAILURES. Not transactional —
 * under concurrent failures from the same key the count can very
 * occasionally undercount by one; acceptable for brute-force throttling
 * (the window catches up), not worth the complexity for this threat model.
 */
export async function recordFailure(db: AttemptDocReader, key: string, now: number): Promise<void> {
  const ref = db.doc(`access_code_attempts/${key}`);
  const snap = await ref.get();
  const data = snap.exists ? snap.data() : undefined;
  const windowStartMs = toMillis(data?.windowStart);
  const withinWindow = now - windowStartMs < WINDOW_MS;
  const priorCount = withinWindow ? ((data?.failureCount as number | undefined) ?? 0) : 0;
  const newCount = priorCount + 1;

  await ref.set(
    {
      failureCount: newCount,
      windowStart: withinWindow ? data!.windowStart : new Date(now),
      blockedUntil: newCount >= MAX_FAILURES ? new Date(now + LOCKOUT_MS) : (data?.blockedUntil ?? null),
    },
    { merge: true },
  );
}

/** Clears the failure count and any lockout for this key on success. */
export async function recordSuccess(db: AttemptDocReader, key: string): Promise<void> {
  await db.doc(`access_code_attempts/${key}`).set({ failureCount: 0, blockedUntil: null }, { merge: true });
}
