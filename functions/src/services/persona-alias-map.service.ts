/**
 * persona-alias-map.service — persona TAG normalization for admin-authored
 * content (notification library, exercise-content tagging).
 *
 * LOCAL MIRROR — Admin SDK doesn't import FE (`src/`) modules; there is no
 * cross-project `paths`/`workspaces` config connecting `functions/tsconfig.json`
 * (only includes `functions/src`) to the outer `src/` project.
 *
 * SOURCE OF TRUTH lives at
 * `src/features/user/onboarding/services/persona-alias-map.service.ts` —
 * keep this file in sync with it BY HAND (its `CanonicalPersona` type is
 * `PersonaId | 'generic'` imported from `src/types/persona.types.ts`; this
 * mirror hand-duplicates the same 7 values as a literal union since it
 * can't import that file).
 *
 * REAL CALLERS TODAY (not zero — a prior version of this comment was wrong
 * about that): `functions/src/stepGoalNudgeScheduler.ts` and
 * `functions/src/onPlannedActivityCreated.ts`, both flag-gated
 * (app_config/feature_flags.stepGoalNudgeEnabled /
 * .socialActivityNearbyPushEnabled), both flags currently `true` in
 * production as of 01.09.2026.
 *
 * See the source-of-truth file's header comment for the full "why this
 * exists" background (docs/research/military-persona-unified-architecture.md).
 */

export type CanonicalPersona =
  | 'parent'
  | 'student'
  | 'pupil'
  | 'office_worker'
  | 'military'
  | 'vatikim'
  | 'pro_athlete'
  | 'generic';

const VALID_PERSONAS: ReadonlySet<string> = new Set<CanonicalPersona>([
  'parent',
  'student',
  'pupil',
  'office_worker',
  'military',
  'vatikim',
  'pro_athlete',
  'generic',
]);

export function isCanonicalPersona(value: unknown): value is CanonicalPersona {
  return typeof value === 'string' && VALID_PERSONAS.has(value);
}

/**
 * Raw tag → canonical persona. MUST stay identical to the src/
 * source-of-truth's PERSONA_ALIAS_MAP.
 */
const PERSONA_ALIAS_MAP: Record<string, CanonicalPersona> = {
  // ── Canonical identities ──────────────────────────────────────────────
  parent: 'parent',
  student: 'student',
  pupil: 'pupil',
  office_worker: 'office_worker',
  military: 'military',
  vatikim: 'vatikim',
  pro_athlete: 'pro_athlete',
  generic: 'generic',

  // ── Legacy content tags, pending relabeling ────────────────────────────
  senior: 'vatikim',
  athlete: 'generic',
  young_pro: 'generic',
  high_tech: 'office_worker',
  army_combat: 'military',
  army_job: 'military',
  reservist: 'military',
  soldier: 'military',
  active_soldier: 'military',
};

/**
 * Normalize a single raw persona/tag string onto the canonical enum.
 * Returns null if the raw value is empty, not a string, or unrecognized.
 */
export function normalizePersonaValue(raw: unknown): CanonicalPersona | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  if (isCanonicalPersona(trimmed)) return trimmed;
  return PERSONA_ALIAS_MAP[trimmed] ?? null;
}

/**
 * Minimal structural shape this resolver needs — matches raw Firestore doc
 * data as read via the Admin SDK (no FE type dependency).
 */
export interface PersonaResolvableProfile {
  personas?: Array<{ id?: string | null }> | null;
  lifestyle?: {
    lifestyleTags?: string[] | null;
  } | null;
}

/**
 * Resolve a user's canonical persona for content-personalization purposes.
 * See the source-of-truth file's doc comment for the full reasoning
 * (multi-persona users pick the first deterministically — not a "primary").
 * Precedence:
 *   1. Explicit override.
 *   2. `personas[0].id` — the real source of truth after 01.09.2026.
 *   3. `lifestyle.lifestyleTags[0]`.
 *   4. `'generic'` — never returns null/undefined.
 */
export function resolveCanonicalPersona(
  profile: PersonaResolvableProfile | null | undefined,
  overrideValue?: string | null,
): CanonicalPersona {
  const candidates: Array<string | null | undefined> = [
    overrideValue,
    profile?.personas?.[0]?.id,
    profile?.lifestyle?.lifestyleTags?.[0],
  ];

  for (const candidate of candidates) {
    const resolved = normalizePersonaValue(candidate);
    if (resolved) return resolved;
  }

  return 'generic';
}
