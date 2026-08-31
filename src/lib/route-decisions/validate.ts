/**
 * src/lib/route-decisions/validate.ts — the (separate, simpler) chokepoint
 * for route_decisions writes. NOT src/lib/route-collections/validate.ts's
 * buildValidatedDoc — that function's create/update authority-locking
 * modes have no meaning for an append-only, never-updated log (see
 * schema.ts's header for the full reasoning). This is zod-shape validation
 * only, reusing stripUndefined() VERBATIM from route-collections/validate.ts
 * rather than forking it — Firestore's "reject undefined, but never flatten
 * a FieldValue sentinel" behavior is identical for any collection, so the
 * one existing, already-tested implementation is reused as-is.
 *
 * Zero firebase/firebase-admin imports — importable unmodified from both
 * browser code (the 3 client-SDK hooks: moderation.service.ts,
 * inventory.service.ts, route-geometry-edit.service.ts) and any future
 * Node/tsx script (mining, Stage 4).
 */
import { stripUndefined } from '@/lib/route-collections/validate';
import { RouteDecisionFieldsSchema } from './schema';

export class RouteDecisionValidationError extends Error {
  constructor(public issues: string[]) {
    super(`route_decisions: ${issues.length} validation issue(s):\n` + issues.map((i) => `  - ${i}`).join('\n'));
    this.name = 'RouteDecisionValidationError';
  }
}

/** Validates + returns a Firestore-write-ready doc (stripped of undefineds). Throws RouteDecisionValidationError with every issue found, not just the first. */
export function buildValidatedDecisionDoc(raw: unknown): Record<string, unknown> {
  const stripped = stripUndefined(raw as Record<string, any>);
  const parsed = RouteDecisionFieldsSchema.safeParse(stripped);
  if (!parsed.success) {
    throw new RouteDecisionValidationError(parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`));
  }
  return stripped;
}
