/**
 * 03.10.2026 production incident — every readiness route's catch block
 * swallowed the real error into a bare "Internal error" string, logged
 * to console with no way to cross-reference that log line against the
 * client-visible response. That is exactly what left this incident
 * looking like a mystery instead of a one-line fix: the 500 was real,
 * the cause was in the server log the whole time, but nothing tied the
 * two together. Never expose the real error/stack to the client
 * (internal details, same discipline as every other route in this
 * build) — but never swallow it into an unlabeled string either.
 *
 * Used identically by every route under src/app/api/units/readiness/ —
 * a shared helper so the id format and the log shape can't drift
 * between routes one at a time.
 */
export function logReadinessInternalError(routeName: string, err: unknown): string {
  const errorId = `${routeName}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
  console.error(`[${routeName}] [${errorId}]`, detail);
  return errorId;
}
