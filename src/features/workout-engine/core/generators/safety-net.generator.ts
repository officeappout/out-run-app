/**
 * safety-net.generator — the registry's guaranteed non-null member (doc §14's open question,
 * "ברירת-מחדל ל'אין הצעה מתאימה'", answered here).
 *
 * NOT an onboarding-gate substitute. A brand-new, unassessed user on home is already stopped
 * from reaching an empty screen by a dedicated UI gate (blur + level-assessment CTA) — that
 * case doesn't need this generator at all. The real target is the other failure mode: an
 * ALREADY-ASSESSED user, in a context where the system genuinely fails to build them
 * content (the real, observed class of bug this is guarding against — a route-generation
 * failure in a specific city). Also covers any future surface (map, post_workout) that has
 * no dedicated onboarding gate of its own the way home does — without this, a fully-ineligible
 * context on those surfaces would make runSuggestionEngine return an empty array, not a
 * graceful degrade.
 *
 * Mirrors the decision-tree doc's own already-established principle 6: a free, aerobic-only
 * suggestion is always available, no questionnaire required, shown last — the same category
 * of content the existing, zero-questionnaire FreeRunDrawer flow already offers in production.
 *
 * generate() must be provably total: synchronous, zero I/O, cannot throw, cannot return null.
 * suggestion-engine.ts converts a thrown/null generator result into "dropped candidate" — if
 * THIS generator could ever do either, the one guarantee it exists to provide would silently
 * break in exactly the scenario it's meant to cover. Mirrors the same always-static shape
 * route.generator.ts/full-strength.generator.ts already use under
 * IS_CHEAP_SUGGESTION_RANKING_ENABLED, but unconditionally — this is the fallback for when
 * even those cheap paths come back empty.
 *
 * Deliberately scores low via the ranker's existing weighted factors (no special-casing
 * needed in rank-suggestions.ts): no `todayGoal` value matches its goalTags, and
 * `requiresLocation: false` means it never earns `locationBonus` — so it naturally loses to
 * any other real, eligible suggestion and only wins when it's the only one left.
 */

import type { Generator } from '../types/generator.types';
import type { Suggestion } from '../types/suggestion.types';

export const safetyNetGenerator: Generator = {
  id: 'safety-net',
  name: 'הליכה קלה / מתיחות',
  surfaces: ['home', 'map', 'post_workout'],

  eligible: () => true,

  generate: async (context): Promise<Suggestion> => ({
    id: `safety-net-${context.userId}`,
    type: 'daily_workout',
    generatorId: 'safety-net',
    title: 'הליכה קלה',
    subtitle: 'בלי ציוד, בלי שאלון — תמיד אפשרות',
    structure: { segments: 1, durationMin: context.availableTimeMin || 10 },
    methodsUsed: [],
    difficulty: 1,
    goalTags: ['recovery', 'walk'],
    surfaceEligibility: ['home', 'map', 'post_workout'],
    requiresLocation: false,
    score: 0,
    scoreBreakdown: {
      goalMatch: 0, gapFilling: 0, stepDeficit: 0, preferenceMatch: 0,
      recoveryMatch: 0, locationBonus: 0, timeOfDayMatch: 0, alreadyTrained: 0,
    },
  }),
};
