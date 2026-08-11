/**
 * persona-alias-map.service — canonical persona normalization (Phase 0 Item 4).
 *
 * SOURCE OF TRUTH for this module. A manually-synced mirror lives at
 * `functions/src/services/persona-alias-map.service.ts` (Cloud Functions
 * cannot import from `src/` — separate TypeScript project, no shared
 * `paths`/`workspaces` config connects them). Keep both in sync by hand;
 * see that file's header comment.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS
 * ═══════════════════════════════════════════════════════════════════════
 * Five different, overlapping persona/lifestyle vocabularies exist across
 * the codebase (onboarding UI, UnifiedLocation flow, workout-content
 * tagging, the workout-engine's own normalization, and the notification
 * corpus). This module is an ADDITIVE mapping layer onto ONE canonical
 * enum — it does not rename or replace any of the five source
 * vocabularies. Full per-value reasoning table:
 * `.claude/knowledge/push-phase0-implementation-plan.md` §Item 4.
 *
 * Canonical source: the live onboarding persona picker,
 * `src/features/user/onboarding/components/steps/PersonaStep.tsx`
 * (`LIFESTYLE_OPTIONS`, 8 values) + `generic` as an explicit fallback for
 * "no persona set."
 *
 * ⚠️ Do NOT reuse `src/features/workout-engine/services/user-profile.utils.ts`'s
 * `PERSONA_ID_MAP`/`LifestylePersona` here — that module targets a DIFFERENT
 * value space (workout-CONTENT scoring, e.g. `school_student`/`home_worker`/
 * `high_tech`/`active_soldier`), not this canonical push/onboarding persona
 * list. Only its Record+aliases+Set-guard+resolver PATTERN was borrowed.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * TWO ONBOARDING WRITE PATHS — the resolver checks BOTH
 * ═══════════════════════════════════════════════════════════════════════
 * `personaId` / `lifestyle.lifestyleTags` (the fields one might assume are
 * canonical) are written by only ONE of two divergent onboarding
 * completion flows:
 *
 *   Path B — `LifestyleWizard.tsx` (`handleFinalSubmit`), the post-
 *   MAP_ONLY "bridge" flow. The ONLY path that writes top-level
 *   `personaId` and `lifestyle.lifestyleTags`.
 *
 *   Path A — the main `OnboardingWizard.tsx` flow, via
 *   `onboarding-sync.service.ts`'s `syncOnboardingToFirestore()`. Writes
 *   `onboardingAnswers.persona` / `onboardingAnswers.personas` /
 *   `onboardingAnswers.lifestyleTags` instead. NEVER writes top-level
 *   `personaId`.
 *
 * A resolver that only checks `personaId` is blind to Path-A-only users.
 * `resolveCanonicalPersona()` below checks both, in the precedence order
 * documented on that function.
 *
 * ⚠️ Precedence assumption, not yet empirically verified: Path B is
 * checked before Path A on the theory that it's chronologically later in
 * the flow. This has not been validated against real data (e.g. how often
 * a single user doc has both shapes populated). Recommend a one-time
 * Firestore sample query before treating this ordering as final.
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
 * Confidence + justification for each aliased entry — see
 * `.claude/knowledge/push-phase0-implementation-plan.md` §Item 4 table.
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
  // location-constants.ts (UnifiedLocation flow — confirmed dead code this
  // session, grep found zero real importers of its LIFESTYLE_OPTIONS
  // export; kept here anyway since it's cheap and the file could resurface).
  senior: 'vatikim', // vatikim's own onboarding tags include 'senior' (PersonaStep.tsx:125) — highest-confidence alias in this map
  athlete: 'generic', // no "casual athlete" tier exists; pro_athlete's tags (advanced/performance) would overclaim
  young_pro: 'generic', // no canonical counterpart; office_worker rejected — doesn't reliably imply desk/WFH work

  // Notification corpus (scripts/corpus/notification-corpus.json, 201 entries)
  high_tech: 'office_worker', // 3rd-largest populated bucket (21); office_worker's 'wfh' tag is the closest semantic parent — recommend a content-team gut-check before trusting broadly
  army_combat: 'soldier', // "combat" reads as active-duty framing, closer to soldier (tags: military,active) than reservist (tags: military,busy)
  army_job: 'generic', // only 2 entries, ambiguous — could be non-combat military role; office_worker rejected to avoid injecting civilian-workplace copy into a military context. Recommend eyeballing the actual 2 entries before trusting.
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
 * Precedence (first non-empty, recognized value wins):
 *   1. Explicit override (for future admin-preview/testing tooling).
 *   2. Path B `lifestyle.lifestyleTags[0]`.
 *   3. Path B top-level `personaId`.
 *   4. Path A `onboardingAnswers.persona`.
 *   5. Path A `onboardingAnswers.personas[0]` (fallback for malformed docs).
 *   6. Path A `onboardingAnswers.lifestyleTags[0]` (lowest priority — these
 *      are "persona + goal" tags combined per the write-site's own
 *      comment, so index 0 isn't reliably a persona value).
 *   7. `'generic'` — never returns null/undefined, unlike the
 *      workout-engine's `mapPersonaIdToLifestylePersona()`, which this
 *      canonical enum's first-class `generic` member makes unnecessary.
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
