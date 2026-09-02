/**
 * persona-alias-map.service — persona TAG normalization for admin-authored
 * content (notification library, exercise-content tagging).
 *
 * SOURCE OF TRUTH for this module. A manually-synced mirror lives at
 * `functions/src/services/persona-alias-map.service.ts` (Cloud Functions
 * cannot import from `src/` — separate TypeScript project). Keep both in
 * sync by hand; see that file's header comment. It has real callers today:
 * `functions/src/stepGoalNudgeScheduler.ts` and
 * `functions/src/onPlannedActivityCreated.ts` (both flag-gated, both flags
 * currently `true` in production per app_config/feature_flags).
 *
 * ═══════════════════════════════════════════════════════════════════════
 * REDEFINED 01.09.2026 — see docs/research/military-persona-unified-architecture.md
 * ═══════════════════════════════════════════════════════════════════════
 * Previously this module reconciled FIVE overlapping identity vocabularies
 * (onboarding UI, a dead UnifiedLocation flow, workout-content tagging, the
 * workout-engine's own normalization, and the notification corpus) because
 * each had its own independent enum. That's gone: `src/types/persona.types.ts`
 * (`PersonaId`) is now the ONE canonical identity type, used directly by
 * onboarding, workout-content scoring, and admin tagging alike — there is
 * nothing left to reconcile between those.
 *
 * What's LEFT for this module: the admin-authored **content** (the
 * notification library, `workoutMetadata/notifications/notifications`, 219
 * real docs) still has legacy tag values on it (`senior`, `high_tech`,
 * `army_combat`, `army_job`, etc.) from before the redefinition. Those get
 * relabeled to the new 7 canonical PersonaId values in a follow-up content
 * migration — until that lands, this map's alias entries let content
 * lookups still find a persona-appropriate match. Once the content is
 * relabeled, this whole module can be retired (its only remaining purpose
 * is content-tag normalization, not identity reconciliation).
 *
 * User-doc-side identity resolution now checks `users/{uid}.personas[]`
 * FIRST (see resolveCanonicalPersona below) — the old personaId /
 * onboardingAnswers.persona,.personas / lifestyle.selectedPersonaId fields
 * this resolver used to check no longer exist on any user doc.
 */

import type { PersonaId } from '@/types/persona.types';

export type CanonicalPersona = PersonaId | 'generic';

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
 * Raw tag → canonical persona. Base entries are identity mappings for the 7
 * canonical values (+ `generic`); everything below the divider is a legacy
 * tag still present on admin-authored content
 * (`workoutMetadata/notifications/notifications`) pending relabeling —
 * see the file header. NOT for user-identity resolution — that's the
 * `personas[]` array now, checked directly, no aliasing needed.
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

  // ── Legacy content tags, pending relabeling (see file header) ─────────
  senior: 'vatikim',
  athlete: 'generic', // no "casual athlete" tier exists; pro_athlete's tags (advanced/performance) would overclaim
  young_pro: 'generic', // no canonical counterpart
  high_tech: 'office_worker', // office_worker's 'wfh' tag is the closest semantic parent
  army_combat: 'military',
  army_job: 'military',
  reservist: 'military', // pre-redefinition onboarding value
  soldier: 'military', // pre-redefinition onboarding value
  active_soldier: 'military', // pre-redefinition workout-content-scoring value
  // Note: the corpus also has 49 blank ('') persona values — handled by
  // normalizePersonaValue()'s empty-string check below, not a map entry.
};

/**
 * Normalize a single raw persona/tag string onto the canonical enum.
 * Returns null if the raw value is empty, not a string, or unrecognized —
 * callers should fall through to the next precedence source (see
 * resolveCanonicalPersona) rather than treating null as an error.
 */
export function normalizePersonaValue(raw: unknown): CanonicalPersona | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  if (isCanonicalPersona(trimmed)) return trimmed;
  return PERSONA_ALIAS_MAP[trimmed] ?? null;
}

/**
 * Minimal structural shape this resolver needs — deliberately not the full
 * `UserFullProfile` type, so this module has no dependency on
 * `src/features/user/core/types/user.types.ts` and stays trivially
 * portable to the Cloud Functions mirror (which only ever sees raw
 * Firestore doc data, not the FE type).
 */
export interface PersonaResolvableProfile {
  personas?: Array<{ id?: string | null }> | null;
  lifestyle?: {
    lifestyleTags?: string[] | null;
  } | null;
}

/**
 * Resolve a user's canonical persona for content-personalization purposes
 * (e.g. picking which notification copy to send). A user can hold multiple
 * personas simultaneously — this picks the first one deterministically,
 * which is all a single piece of push copy needs; it is NOT a "primary
 * persona" designation (that concept was deliberately dropped, see the
 * research doc).
 * Precedence (first non-empty, recognized value wins):
 *   1. Explicit override (for future admin-preview/testing tooling).
 *   2. `personas[0].id` — the real source of truth after 01.09.2026.
 *   3. `lifestyle.lifestyleTags[0]` — still written, independent tag array.
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
