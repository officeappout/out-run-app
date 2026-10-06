/**
 * Pure logic for useMilitaryTenantSelection.ts, split into its own
 * dependency-free file deliberately — importing anything from the hook
 * file itself drags in its full React/Firebase import chain (which, in
 * this codebase, transitively reaches a .tsx component and breaks
 * vitest's node-only config; see vitest-node-only-no-jsdom convention).
 * This file has zero imports, so it's directly unit-testable.
 */

export interface MilitaryTenantOption {
  id: string;
  name: string;
}

/**
 * 06.10.2026 (David's review) — a saved tenantId that's no longer in the
 * caller's OWN real options (role changed, a different user signed in
 * on this browser, etc.) must never surface as a 403 from the server.
 * If it's not in the real list, treat it exactly like "nothing saved
 * yet" — never an error, never a blank screen with no explanation.
 */
export function resolveTenantSelectionAfterOptionsLoad(
  currentTenantId: string | null,
  options: MilitaryTenantOption[],
): string | null {
  if (!currentTenantId) return null;
  return options.some((o) => o.id === currentTenantId) ? currentTenantId : null;
}
