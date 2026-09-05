/**
 * Canonical persona identity model (replaces the ~6 overlapping vocabularies
 * that previously existed: LifestyleOption ids in PersonaStep.tsx,
 * LifestylePersona in contextual-engine.types.ts, CanonicalPersona in
 * persona-alias-map.service.ts, PERSONA_ID_MAP in user-profile.utils.ts, the
 * decorative /admin/personas "Lemur" catalog, and stale seed-data-only
 * values). See docs/research/military-persona-unified-architecture.md.
 *
 * A user can hold multiple personas simultaneously (confirmed product
 * intent, not a bug) — see users/{uid}.personas below. Each persona's
 * follow-up-question answers are typed per persona (discriminated union),
 * not a free-form bag, so a mismatched shape is a compile error.
 */

export type PersonaId =
  | 'parent'
  | 'student'
  | 'pupil'
  | 'office_worker'
  | 'military'
  | 'vatikim'
  | 'pro_athlete';

export type MilitaryStatus = 'regular' | 'career' | 'reserve';

export interface MilitaryPersonaAnswers {
  status?: MilitaryStatus;
  /** Brigade — authorities/{id} (type: 'military_unit'). */
  orgId?: string;
  /** The deepest unit selected — tenants/{orgId}/units/{unitId}. */
  unitId?: string;
  /**
   * Ancestor unit IDs (not names — tenants/{orgId}/units/{id}.unitPath is
   * names; this is IDs, deliberately different field name so the two are
   * never confused). Enables array-contains queries at any hierarchy depth.
   */
  unitPathIds?: string[];
  /**
   * Set when the user's own "unit isn't in the list" submission is still
   * pending (or was just approved and self-heal hasn't caught up yet) —
   * points at `pending_units/{pendingUnitId}` (07.09.2026: previously
   * nothing was ever written here, so a brand-new-unit submission left the
   * declaration completely unchanged — see useResolvedPersonaSummary.ts's
   * own comment on why this exists). NEVER deleted once set — once
   * orgId/unitId resolve to the real approved unit, this field just stops
   * mattering for display (useResolvedPersonaSummary only shows the
   * "ממתין לאישור" label while the pending doc's own status is still
   * 'pending'), but it stays on the document and costs one extra getDoc on
   * every future resolution. Acceptable for now — see the review note on
   * this same commit — not something to build active cleanup for yet.
   */
  pendingUnitId?: string;
}

export interface OfficeWorkerPersonaAnswers {
  officeLocation?: { lat: number; lng: number; address: string };
}

/** Personas with no follow-up questions defined today. */
export type NoAnswers = Record<string, never>;

export interface PersonaAnswersMap {
  military: MilitaryPersonaAnswers;
  office_worker: OfficeWorkerPersonaAnswers;
  parent: NoAnswers;
  student: NoAnswers;
  pupil: NoAnswers;
  vatikim: NoAnswers;
  pro_athlete: NoAnswers;
}

export interface PersonaEntry<P extends PersonaId = PersonaId> {
  id: P;
  /** {} is valid — persona selected, nothing answered yet. Not an error. */
  answers: PersonaAnswersMap[P];
  updatedAt?: any; // Firebase serverTimestamp() — see other Timestamp fields in user.types.ts
}

/**
 * `PersonaEntry<P>` alone loses discrimination inside an array — TypeScript
 * resolves the generic to its default and `answers` becomes a union of every
 * persona's answer shape, so `entry.id === 'military'` would NOT narrow
 * `entry.answers`. This mapped-type + indexed-access form produces a real
 * discriminated union instead.
 */
export type AnyPersonaEntry = { [P in PersonaId]: PersonaEntry<P> }[PersonaId];

// Permanent compile-time guard for the discriminated union above — do not
// remove. If this ever stops erroring, AnyPersonaEntry has silently lost its
// discrimination again (e.g. someone "simplified" it back to PersonaEntry[]),
// and unitId-under-office_worker-shaped bugs become possible at runtime with
// no compiler warning. Verified failing on 01.09.2026.
// @ts-expect-error — unitId does not belong to office_worker's answers
const _typeCheckGuard: AnyPersonaEntry = { id: 'office_worker', answers: { unitId: 'x' } };
void _typeCheckGuard;
