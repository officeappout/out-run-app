/**
 * Tracks a fire-once async attempt with a reset path on failure. Used by
 * auto-skip effects (e.g. HealthDeclarationPage's already-accepted skip)
 * that must run exactly once on success, but allow exactly one retry — not
 * an uncontrolled loop, and not a permanent dead end — after a transient
 * failure (network/Firestore error).
 */
export function createSkipAttemptGuard() {
  let started = false;
  return {
    shouldStart(): boolean {
      return !started;
    },
    markStarted(): void {
      started = true;
    },
    markFailed(): void {
      started = false;
    },
  };
}

export type SkipAttemptGuard = ReturnType<typeof createSkipAttemptGuard>;
