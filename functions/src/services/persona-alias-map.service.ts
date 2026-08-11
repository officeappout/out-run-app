/**
 * persona-alias-map.service — canonical persona normalization (Phase 0 Item 4).
 *
 * LOCAL MIRROR — Admin SDK doesn't import FE (`src/`) modules; there is no
 * cross-project `paths`/`workspaces` config connecting `functions/tsconfig.json`
 * (only includes `functions/src`) to the outer `src/` project. Same
 * convention already used by `onboardingDropoffDispatcher.ts`'s local type
 * mirrors of `user.types.ts`.
 *
 * SOURCE OF TRUTH lives at
 * `src/features/user/onboarding/services/persona-alias-map.service.ts` —
 * keep this file in sync with it BY HAND. This copy is a Cloud-Functions-safe
 * subset (no imports of any FE-only type), otherwise byte-identical in
 * behavior.
 *
 * See the source-of-truth file's header comment for the full "why this
 * exists" / "two onboarding write paths" background, and
 * `.claude/knowledge/push-phase0-implementation-plan.md` §Item 4 for the
 * full per-value alias-table reasoning.
 *
 * ⚠️ Phase 0 status: this module has ZERO callers anywhere in `functions/src`
 * as of this commit — it lands as a standalone module, not wired into any
 * live push sender yet. Wiring it into an actual sender (e.g. to filter a
 * future persona-targeted push) is deliberately out of this item's scope —
 * see the Open Decisions section of the plan doc.
 */

export type CanonicalPersona =
  | 'parent'
  | 'student'
  | 'pupil'
  | 'office_worker'
  | 'reservist'
  | 'soldier'
  | 'vatikim'
  | 'pro_athlete'
  | 'generic';

const VALID_PERSONAS: ReadonlySet<string> = new Set<CanonicalPersona>([
  'parent',
  'student',
  'pupil',
  'office_worker',
  'reservist',
  'soldier',
  'vatikim',
  'pro_athlete',
  'generic',
]);

export function isCanonicalPersona(value: unknown): value is CanonicalPersona {
  return typeof value === 'string' && VALID_PERSONAS.has(value);
}

/**
 * Raw ID / tag → canonical persona. Base entries are identity mappings for
 * the 8 canonical values (+ `generic`); everything below the divider is an
 * alias from one of the other 4 vocabularies or the notification corpus.
 * MUST stay identical to the src/ source-of-truth's PERSONA_ALIAS_MAP.
 */
const PERSONA_ALIAS_MAP: Record<string, CanonicalPersona> = {
  // ── Canonical identities ──────────────────────────────────────────────
  parent: 'parent',
  student: 'student',
  pupil: 'pupil',
  office_worker: 'office_worker',
  reservist: 'reservist',
  soldier: 'soldier',
  vatikim: 'vatikim',
  pro_athlete: 'pro_athlete',
  generic: 'generic',

  // ── Aliases / legacy IDs ──────────────────────────────────────────────
  senior: 'vatikim', // vatikim's own onboarding tags include 'senior' (PersonaStep.tsx:125) — highest-confidence alias in this map
  athlete: 'generic', // no "casual athlete" tier exists; pro_athlete's tags (advanced/performance) would overclaim
  young_pro: 'generic', // no canonical counterpart; office_worker rejected — doesn't reliably imply desk/WFH work

  // Notification corpus (scripts/corpus/notification-corpus.json, 201 entries)
  high_tech: 'office_worker', // 3rd-largest populated bucket (21); office_worker's 'wfh' tag is the closest semantic parent — recommend a content-team gut-check before trusting broadly
  army_combat: 'soldier', // "combat" reads as active-duty framing, closer to soldier (tags: military,active) than reservist (tags: military,busy)
  army_job: 'generic', // only 2 entries, ambiguous — recommend eyeballing the actual entries before trusting
  // Note: the corpus also has 49 blank ('') persona values — handled by
  // normalizePersonaValue()'s empty-string check below, not a map entry.
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
  personaId?: string | null;
  lifestyle?: {
    lifestyleTags?: string[] | null;
  } | null;
  onboardingAnswers?: {
    persona?: string | null;
    personas?: string[] | null;
    lifestyleTags?: string[] | null;
  } | null;
}

/**
 * Resolve a user's canonical persona, checking both onboarding write paths.
 * Precedence (first non-empty, recognized value wins) — see the
 * source-of-truth file's doc comment for the full reasoning:
 *   1. Explicit override.
 *   2. Path B `lifestyle.lifestyleTags[0]`.
 *   3. Path B top-level `personaId`.
 *   4. Path A `onboardingAnswers.persona`.
 *   5. Path A `onboardingAnswers.personas[0]`.
 *   6. Path A `onboardingAnswers.lifestyleTags[0]`.
 *   7. `'generic'` — never returns null/undefined.
 */
export function resolveCanonicalPersona(
  profile: PersonaResolvableProfile | null | undefined,
  overrideValue?: string | null,
): CanonicalPersona {
  const candidates: Array<string | null | undefined> = [
    overrideValue,
    profile?.lifestyle?.lifestyleTags?.[0],
    profile?.personaId,
    profile?.onboardingAnswers?.persona,
    profile?.onboardingAnswers?.personas?.[0],
    profile?.onboardingAnswers?.lifestyleTags?.[0],
  ];

  for (const candidate of candidates) {
    const resolved = normalizePersonaValue(candidate);
    if (resolved) return resolved;
  }

  return 'generic';
}
