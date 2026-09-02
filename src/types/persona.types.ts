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
