# Branch summary — `feat/unified-domain-resolver`

**Status: ready for review. Not merged. `main` untouched.**
**Last updated: 14.09.2026** (this document is the up-to-date source for review — re-read it, don't rely on anything said about this branch in an earlier chat).

---

## What this branch does

Consolidates domain resolution — "which domain (push/pull/legs/core/a skill) does this exercise belong to, for this session" — into one function, `resolveExerciseDomain` (`workout-selection.utils.ts`), replacing several independent, ad-hoc implementations of the same question across the workout engine. Three-tier resolution: (1) a skill tag always beats a co-tagged foundational parent tag, independent of array order; (2) when 2+ skill tags match, `skillPriority` (the user's own skill-selection order) breaks the tie; (3) no skill match — parent-vs-parent, tiebreak per an explicit, named `parentTiebreak` option (`'exercise-tag-order'` default, `'active-domain-order'` for the one site that needs it — confirmed via a 372-exercise differential test against each site's own pre-migration behavior, not assumed).

## Key verified facts

- **Blocker 1 (tier-1 resolution correctness):** confirmed via the real `resolveExerciseDomain`, not simulation — a planche+one_arm_pullup user resolves the 2 test exercises to `one_arm_pullup` at tier 1, not `pull`.
- **Blocker 2 (skillPriority source):** `skillPriority`/`selectedSkillIds` (`home-workout.service.ts`) rewired from the raw `progression.skillFocusIds` to `resolvedChildDomains` — the local variable actually proven, via a full data-chain trace, to be the real upstream source `activeDomains`'s live skill ordering derives from (not a parallel derivation). Verified byte-identical to the old wiring against 2 real accounts (no regression in the normal case); closes a theoretical divergence in edge-case normalization paths.
- **Blocker 3 (declared parent-fallback):** confirmed, via a real account, that completing a skill questionnaire automatically writes a level to the parent program — the mechanism the fallback depends on is real, not assumed.
- **Regression safety property, measured twice, two different questions:**
  - Test 1 (no-skills-user, `activeDomains=[push,pull,legs,core]` only): 14 total mismatches between the old `MG_TO_DOMAIN`-only resolution and the new tag-aware resolution — 9 improvements (old had no domain at all) + 5 genuine divergences (the 5 planks, below).
  - Test 2 (`[DomainMismatch]` fire-test, worst-case `activeDomains` = every skill + every foundational domain): 6 fire. Test 1's 5 are an exact subset of Test 2's 6 — the 6th (`oLzPZ7rQMdOUgGuVr1os`, "פשיטת ירך אחורית") is only visible in the richer Test-2 context.
  - These are two different measurements, not one number that "changed" between rounds — kept explicitly separate after an earlier draft of this summary conflated them into a contradictory single figure.

## `[DomainMismatch]` fix (11b7ad6e)

The original diagnostic fired whenever `tagDomain !== mgDomain` — which is the *expected*, normal shape for almost every correctly-tagged skill exercise (movementGroup gives the generic category, the tag gives the specific skill — direct parent-child, not a conflict). Fixed to only fire when the two are in genuinely different branches (neither equal, nor one the direct parent of the other via the skill→parent map, checked both directions). Verified on all 372 catalog exercises with the worst-case `activeDomains`: **6 fire, not dozens** — the 5 known planks plus one newly-surfaced exercise, "פשיטת ירך אחורית" (a hamstring exercise carrying what looks like an erroneous `planche` tag — 0 biomechanical connection). Registered as a known, approved regression in `parking-lot.md` ("רגרסיה ידועה ומאושרת") — not a bug to fix in code, per the standing rule that this codebase does not decide exercise tagging.

## `_SKILL_PARENT_MAP` — extraction + rename (a73f1fed, added after the original summary)

Two changes David required before the `/admin/unreachable-exercises` audit page (a *separate*, stacked branch — see below) could reuse this branch's own `[DomainMismatch]` logic instead of maintaining a second copy of the same 3-line question:

1. **Extracted `isDomainAncestorRelated(tagDomain, mgDomain): boolean`** — a new exported function in `workout-selection.utils.ts`, containing exactly the ancestor-check `resolveDavidRuleDomain` (`WorkoutGenerator.ts`) used to compute inline. `resolveDavidRuleDomain` itself was updated to call this exported function instead of duplicating the check. Placed in `workout-selection.utils.ts`, **not** in `WorkoutGenerator.ts` itself — that module is large and this function's only real dependency (`_SKILL_PARENT_MAP`) already lives in `workout-selection.utils.ts` alongside its sibling `resolveExerciseDomain`; importing from `WorkoutGenerator.ts` into a client-side admin page would pull in far more than needed.
2. **Renamed `_TEMP_SKILL_PARENT_MAP` → `_SKILL_PARENT_MAP`** across all 5 real usage sites (`workout-selection.utils.ts`, `WorkoutGenerator.ts`, `GuaranteePassRunner.ts`, `workout-budgeting.utils.ts`, plus its own definition) — "TEMP" stopped describing reality once the constant picked up a second real consumer (the admin audit) beyond its existing production callers. This is a **rename only** — it does not unify the other 3 duplicate skill→parent structures documented in `parking-lot.md`'s "חמישה מבנים, אותה שאלה" entry (`_CU_SKILL_PARENT`, `_SKILL_PARENT_MAP` in `home-workout.service.ts` — same short name, unrelated file/scope, do not confuse the two — and `SKILL_TO_FOUNDATION_DOMAIN`). That unification is still undecided.

**Cross-validation, not just a passing type-check:** a completely independent script, re-running `isDomainAncestorRelated` + `resolveExerciseDomain` against all 372 real catalog exercises (worst-case `activeDomains`), returned **the exact same 6 exercises** as the original `[DomainMismatch]` verification (5 planks + פשיטת ירך אחורית) — proof the extraction preserved behavior exactly, not just that it compiles.

**⚠️ Counts (14 mismatches, 6 DomainMismatch fires) were measured against the live catalog as of 10.09.2026. David is actively fixing exercise tags in the admin panel in parallel — re-verify before relying on an exact number if meaningfully more time has passed.**

## Cleanup

All `[DIAG-L0]`/`[DIAG-L1]`/`[DIAG-L2]` instrumentation removed (`InputSanitizerMiddleware.ts`, `ContextualEngine.ts`) — real logic untouched, only the diagnostic prints/assert-blocks stripped.

## Live-run proof: "safety net, not a cure"

A live device run recovered `one_arm_pullup` after `_balancedClusterCap` had cut it — demonstrating the skill-representation guarantee mechanism (`runSkillRepresentationGuarantee`, `GuaranteePassRunner.ts`) does its job as designed: it's a recovery mechanism for representation gaps that occur naturally in the pipeline, not a substitute for correct tagging or generation logic upstream.

## Measurements

`NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` = **450 errors** (unchanged baseline, matches a fresh `origin/main` measured at the same moment). `npx vitest run` = **1696/1697 tests passing** (108-ish known-flaky test files unrelated to this branch's changes — `logMultiCategoryWorkout.smoke.test.ts`'s streak-threshold assertion, confirmed flaky/date-dependent, not caused by this branch). Both measured fresh after the `isDomainAncestorRelated` extraction + rename commit (`a73f1fed`) — not reused from an earlier round.

## Merge-order constraint

**A separate branch, `feat/unreachable-exercises-admin-audit`, is stacked on top of this one** (built from this branch's tip, `a73f1fed`). It imports `isDomainAncestorRelated` and `_SKILL_PARENT_MAP`, both of which only exist on this branch — not on `origin/main`. **`feat/unreachable-exercises-admin-audit` cannot merge before `feat/unified-domain-resolver` does.** See that branch's own summary for its content — it does not touch the workout engine, only a read-only admin audit page.

## Never merged, never touched `main`

All work is local commits on this branch and its stacked child. Nothing pushed unless explicitly requested; nothing merged.
