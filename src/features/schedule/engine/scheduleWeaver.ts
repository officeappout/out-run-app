/**
 * Schedule Weaver — coordinates two rule families into one week.
 *
 * Pure function, zero content knowledge. Everything domain-specific is
 * reached only through the RuleFamily interface (ruleFamily.ts) — this file
 * never names a specific skill, category, or role literal. If a future edit
 * adds a domain word here outside a `family.id` string, the interface is
 * wrong, not this file.
 *
 * Source of truth: .claude/knowledge/schedule-weaver-spec.md
 * Acceptance scenarios: .claude/knowledge/schedule-builder-drawer-spec.md, ת1–ת12.
 *
 * ── Design note: existingWeek is always real, never built from scratch ──
 * weaveWeek never synthesizes a domain's week from raw day-counts alone —
 * it only reduces (via reduceTo) or leaves alone an `existingWeek` each
 * domain input already carries. This matches ת6: the drawer only ever
 * opens once a user has TWO domains, each added through its own separate,
 * real onboarding/build event (never a single combined signup) — so by the
 * time weaveWeek runs, both domains already have a real week from their own
 * construction pathway (buildDefaultTemplate for strength, the running
 * engine's generatePlan for running). Building a week from nothing is a
 * different, unaddressed problem this file does not attempt to solve.
 *
 * ── Design note: the "sum" in step 5 is a raw arithmetic sum ──
 * "הזמינות קטנה מהסכום" is read literally: dominant.requestedCount +
 * secondary.requestedCount, not the count of distinct calendar days after
 * accounting for hybrid same-day overlap. A day hosting both domains at
 * once is a real, intended pattern (ת1's own implementation note — 3+3
 * often lands on the same day-list) but detecting/exploiting that overlap
 * is a further optimization this function does not attempt; it only
 * affects how *generous* availableDayCount needs to be to avoid a
 * reduction that a smarter, overlap-aware version might have avoided.
 */

import type { RuleFamily, RuleFamilyReduction } from './ruleFamily';

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export interface WeaveDomainInput<TWeek, TValidateContext, TReduceContext> {
  family: RuleFamily<TWeek, TValidateContext, TReduceContext>;
  /** How many training days the user asked for in this domain. */
  requestedCount: number;
  /** This domain's own current/proposed week — always real, see file header. */
  existingWeek: TWeek;
  validateContext: TValidateContext;
  reduceContext: TReduceContext;
}

export interface WeaveWeekInput {
  /** Fixed first — see schedule-weaver-spec.md's dominance principle (lifestyle.primaryTrack). */
  dominant: WeaveDomainInput<any, any, any>;
  secondary: WeaveDomainInput<any, any, any>;
  /** Total days/week the user can train, shared across both domains (see the "sum" note above). */
  availableDayCount: number;
}

export interface WeaveWeekResult {
  /** Keyed by each domain's family.id — e.g. { strength: ScheduleDay[], running: RunningWeekDay[] }. */
  week: Record<string, unknown>;
  notes: string[];
  reductions: Array<{ domainId: string; removed: string[] }>;
}

// ──────────────────────────────────────────────────────────────────────────
// weaveWeek
// ──────────────────────────────────────────────────────────────────────────

/**
 * Bounded search cap: realistic day counts run 0–7 (a week has 7 days), so
 * the entire search space for (dominantCount × secondaryCount) combinations
 * is at most 8 × 8 = 64. This cap covers that whole space — generous enough
 * to always find a solution if one exists within a single week, while
 * still being an explicit, documented ceiling rather than an unbounded
 * loop.
 */
const MAX_CANDIDATES = 64;

/**
 * "Propose and verify": starting from both domains at their full requested
 * count, tries decreasing combinations in a fixed, deterministic order —
 * secondary count down first (dominant held fixed), and only once every
 * secondary count from requestedCount down to 0 has been tried at the
 * current dominant count, decrements the dominant count by one and repeats.
 * The first combination that (a) fits the shared day budget and (b) passes
 * both families' validate() wins. Same input always walks the exact same
 * sequence of candidates in the exact same order — no Math.random, no
 * Date.now, no unordered object iteration — so the same input always
 * returns the same week.
 */
export function weaveWeek(input: WeaveWeekInput): WeaveWeekResult {
  const { dominant, secondary, availableDayCount } = input;
  const originalDominantCount = dominant.requestedCount;
  const originalSecondaryCount = secondary.requestedCount;

  let candidatesTried = 0;
  let found:
    | {
        dCount: number;
        sCount: number;
        dominantResult: RuleFamilyReduction<any>;
        secondaryResult: RuleFamilyReduction<any>;
      }
    | null = null;

  for (
    let dCount = originalDominantCount;
    dCount >= 0 && !found && candidatesTried < MAX_CANDIDATES;
    dCount--
  ) {
    for (
      let sCount = originalSecondaryCount;
      sCount >= 0 && !found && candidatesTried < MAX_CANDIDATES;
      sCount--
    ) {
      candidatesTried++;

      // Step 5: skip combinations that don't fit the shared day budget
      // without spending a validate() call on them.
      if (dCount + sCount > availableDayCount) continue;

      const dominantResult = dominant.family.reduceTo(dominant.existingWeek, dCount, dominant.reduceContext);
      const secondaryResult = secondary.family.reduceTo(secondary.existingWeek, sCount, secondary.reduceContext);

      const dominantValidation = dominant.family.validate(dominantResult.week, dominant.validateContext);
      const secondaryValidation = secondary.family.validate(secondaryResult.week, secondary.validateContext);

      if (dominantValidation.valid && secondaryValidation.valid) {
        found = { dCount, sCount, dominantResult, secondaryResult };
      }
    }
  }

  const notes: string[] = [];
  const reductions: Array<{ domainId: string; removed: string[] }> = [];

  if (!found) {
    // Bounded search exhausted with no valid combination anywhere in the
    // search space — fall back to the smallest, safest candidate (zero
    // days each) rather than throwing or returning something unvalidated.
    // Requesting 0 here is the smallest input this function can ask a
    // family for — it is NOT guaranteed to produce an empty week. Strength's
    // own preferredDays fallback (scheduleRules.ts, "daysPerWeek <= 1 → [0]",
    // faithfully mirrored in ruleFamily.ts) returns one day even for a
    // count of 0, so buildDefaultTemplate(...,0) still places one session.
    // The note below is worded to not claim "zero days" for a domain where
    // that isn't actually true.
    const dominantResult = dominant.family.reduceTo(dominant.existingWeek, 0, dominant.reduceContext);
    const secondaryResult = secondary.family.reduceTo(secondary.existingWeek, 0, secondary.reduceContext);
    notes.push('לא נמצא שילוב חוקי בטווח החיפוש — הלוז צומצם למינימום האפשרי בכל דומיין.');
    return {
      week: { [dominant.family.id]: dominantResult.week, [secondary.family.id]: secondaryResult.week },
      notes,
      reductions,
    };
  }

  const { dCount, sCount, dominantResult, secondaryResult } = found;

  // Step 5 — secondary reduced first, always with an explanation.
  if (sCount < originalSecondaryCount) {
    reductions.push({ domainId: secondary.family.id, removed: secondaryResult.removed });
    notes.push(...secondaryResult.notes);
  }

  // Step 4 — no solution kept the dominant fixed; it had to move too.
  // Never silent: a dedicated note names the dominant domain explicitly,
  // on top of whatever explanation its own reduceTo produced.
  if (dCount < originalDominantCount) {
    reductions.push({ domainId: dominant.family.id, removed: dominantResult.removed });
    notes.push(...dominantResult.notes);
    notes.push(
      `לא נמצא שילוב חוקי ששומר על ${dominant.family.id} במלואו — גם הוא הוקטן, מ-${originalDominantCount} ל-${dCount} ימים.`,
    );
  }

  return {
    week: { [dominant.family.id]: dominantResult.week, [secondary.family.id]: secondaryResult.week },
    notes,
    reductions,
  };
}
