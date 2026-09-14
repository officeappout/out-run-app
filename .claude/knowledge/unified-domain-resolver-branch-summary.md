# Branch summary — `feat/unified-domain-resolver`

**Status: ready for review. Not merged. `main` untouched.**
**Last updated: 14.09.2026** (this document is the up-to-date source for review — re-read it, don't rely on anything said about this branch in an earlier chat).

---

## What this branch does — TWO changes, not one

**⚠️ Read this section in full before the diff.** An earlier draft of this summary framed the whole branch as "domain-resolution consolidation" and only mentioned the second change below in the live-run-proof paragraph, as if it were a side effect. It is not. A reviewer who reads only the opening must know that live user-facing behavior changed, not just internal resolution logic.

**(א) Domain-resolution consolidation.** "Which domain (push/pull/legs/core/a skill) does this exercise belong to, for this session" is consolidated into one function, `resolveExerciseDomain` (`workout-selection.utils.ts`), replacing several independent, ad-hoc implementations of the same question across the workout engine. Three-tier resolution: (1) a skill tag always beats a co-tagged foundational parent tag, independent of array order; (2) when 2+ skill tags match, `skillPriority` (the user's own skill-selection order) breaks the tie; (3) no skill match — parent-vs-parent, tiebreak per an explicit, named `parentTiebreak` option (`'exercise-tag-order'` default, `'active-domain-order'` for the one site that needs it — confirmed via a 372-exercise differential test against each site's own pre-migration behavior, not assumed). This part is a refactor — it changes *how* an existing answer is computed, not what a user sees, and ships unconditionally (no flag — a pure internal consolidation, nothing new to gate).

**(ב) A new production pass that replaces exercises for real users.** `runSkillRepresentationGuarantee` (`GuaranteePassRunner.ts`, 280+ lines, 09.09.2026) is a standalone feature, not a byproduct of (א): when a user's selected skill ends up with zero representation in a generated workout, this pass swaps in a skill-tagged exercise (or, failing that, a declared-parent-fallback exercise) in its place. It runs on every real workout generation, for every strategy including `single_domain`, right before the final sort — live production traffic sees exercises it chose replaced with exercises this pass chose instead. **This ships behind a flag**, `SKILL_REPRESENTATION_GUARANTEE_ENABLED` (`feature-flags.ts`) — **default `false`**, matching the same convention as every other engine change of this size in this project (`HOME_DAILY_GOAL_V1`, `BLOCK_B_SMART_CLOSE_V1`): while false, the pass is skipped entirely and `workout.exercises` passes through byte-identical to pre-flag behavior. See "The flag" section below for the full rationale and how to turn it on/off.

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

## Skill→parent map — extraction, and two rounds of renaming (a73f1fed, a913f332)

**Round 1 (a73f1fed), required before the `/admin/unreachable-exercises` audit page (a *separate*, stacked branch — see below) could reuse this branch's own `[DomainMismatch]` logic instead of maintaining a second copy of the same 3-line question:**

1. **Extracted `isDomainAncestorRelated(tagDomain, mgDomain): boolean`** — a new exported function in `workout-selection.utils.ts`, containing exactly the ancestor-check `resolveDavidRuleDomain` (`WorkoutGenerator.ts`) used to compute inline. `resolveDavidRuleDomain` itself was updated to call this exported function instead of duplicating the check. Placed in `workout-selection.utils.ts`, **not** in `WorkoutGenerator.ts` itself — that module is large and this function's only real dependency already lives in `workout-selection.utils.ts` alongside its sibling `resolveExerciseDomain`; importing from `WorkoutGenerator.ts` into a client-side admin page would pull in far more than needed.
2. **Renamed `_TEMP_SKILL_PARENT_MAP` → `_SKILL_PARENT_MAP`** — "TEMP" stopped describing reality once the constant picked up a second real consumer (the admin audit) beyond its existing production callers.

**⚠️ Round 2 (a913f332, review round 2) — round 1's rename was a mistake, corrected.** Dropping "TEMP" produced `_SKILL_PARENT_MAP`, which **collided, name-for-name, with an unrelated local `_SKILL_PARENT_MAP` already in `home-workout.service.ts`** — a different one of the (at least) 4 known duplicate skill→parent structures documented in `parking-lot.md`'s "חמישה מבנים, אותה שאלה" entry. Two structures, two files, same exact name, with a code comment saying "do not confuse the two" — precisely the "convention you have to remember" failure this whole naming discipline exists to prevent, just relocated instead of removed. Renamed both to describe what each actually holds:
- `workout-selection.utils.ts`'s exported map (used by every domain-resolution function across the engine — `resolveExerciseDomain`, `isDomainAncestorRelated`, `GuaranteePassRunner`'s declared-fallback, `workout-budgeting.utils.ts`, the admin audit page) → **`DOMAIN_RESOLUTION_SKILL_PARENT_MAP`**.
- `home-workout.service.ts`'s local, non-exported map (used within that file's generation function for both `calisthenics_upper` focusDomains expansion AND general per-exercise domain-budget resolution — not narrow enough to be CU- or focus-domains-specific) → **`_HOME_WORKOUT_SKILL_PARENT_MAP`**.

Neither rename unifies the 4 duplicate structures into one — that's still undecided (same parking-lot entry). Updated every real usage site (5 files) and every comment reference, including ones in `level-resolution.utils.ts` and `parking-lot.md` that cited the old name.

**Cross-validation, not just a passing type-check:** a completely independent script, re-running `isDomainAncestorRelated` + `resolveExerciseDomain` against all 372 real catalog exercises (worst-case `activeDomains`), returned **the exact same 6 exercises** as the original `[DomainMismatch]` verification (5 planks + פשיטת ירך אחורית) — proof the extraction preserved behavior exactly, not just that it compiles. Re-confirmed after round 2's rename — same 6, same names.

**⚠️ Counts (14 mismatches, 6 DomainMismatch fires) were measured against the live catalog as of 10.09.2026. David is actively fixing exercise tags in the admin panel in parallel — re-verify before relying on an exact number if meaningfully more time has passed.**

## The flag — `SKILL_REPRESENTATION_GUARANTEE_ENABLED`

Added `feature-flags.ts` (a913f332), review round 2. Gates `runSkillRepresentationGuarantee`'s one call site (`home-workout.service.ts`) — while false, `workout.exercises = SKILL_REPRESENTATION_GUARANTEE_ENABLED ? runSkillRepresentationGuarantee(...) : workout.exercises` skips the call entirely, byte-identical to pre-flag behavior.

**Default `false`.** Investigated the two project precedents David named — `HOME_DAILY_GOAL_V1` and `BLOCK_B_SMART_CLOSE_V1` (`feature-flags.ts`) — both are plain exported `const`s, both default `false`, both documented as "DEFAULT FALSE = BYTE-IDENTICAL to today." (A third named precedent, "Hybrid Slots," no longer exists in this compile-time pattern — `HYBRID_SLOTS_ENABLED` was removed wave 1, 08.09.2026, and migrated to a Firestore/admin-panel-controlled flag with a deliberately *different* default — `true`, an explicitly-documented temporary exception to the normal fail-closed convention, not a second valid precedent to follow here.) `SKILL_REPRESENTATION_GUARANTEE_ENABLED` follows the two still-current examples: default `false`.

**Why this matters at merge time:** Capacitor ships the live bundle to every phone the moment this branch's code reaches production — there is no native rebuild/App Store review gate for this change. With the flag default `false`, merging this branch changes nothing live (the pass stays off) until David explicitly flips it after on-device verification. The flag is also the *only* kill-switch — this is the pass's one call site, so flipping it back to `false` is the only way to stop it in production without a code revert + redeploy.

## Cleanup

All `[DIAG-L0]`/`[DIAG-L1]`/`[DIAG-L2]` instrumentation removed (`InputSanitizerMiddleware.ts`, `ContextualEngine.ts`) — real logic untouched, only the diagnostic prints/assert-blocks stripped.

## Live-run proof: "safety net, not a cure"

A live device run showed `runSkillRepresentationGuarantee` (`GuaranteePassRunner.ts`) act after `_balancedClusterCap` had cut `one_arm_pullup` from the workout — demonstrating the pass does its job as designed: it's a recovery mechanism for coverage gaps that occur naturally in the pipeline, not a substitute for correct tagging or generation logic upstream.

**⚠️ Precision correction (14.09.2026, review round 2):** "recovered" is only accurate when the pass finds a genuinely skill-tagged substitute. In the declared-parent-fallback path (no skill-tagged candidate exists at all), the exercise injected in its place carries the *parent domain's* tag, not the skill's own tag — `representsSkill` still returns `false` for that skill even after the pass runs. The correct framing for that path is **"a parent-program exercise was injected in its place, logged"** — not "the skill was represented." The pass closes a coverage gap (a real exercise sits in the slot) in every case; it closes a representation gap (an exercise tagged with the user's actual selected skill) only when a skill-tagged candidate exists. See `parking-lot.md`'s "חוב פתוח — נפילה-להורה מוצהרת" entry for the full mechanism.

## Measurements

`NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` = **450 errors** (unchanged baseline, matches a fresh `origin/main` measured at the same moment). `npx vitest run` = **1696/1697 tests passing** (108-ish known-flaky test files unrelated to this branch's changes — `logMultiCategoryWorkout.smoke.test.ts`'s streak-threshold assertion, confirmed flaky/date-dependent, not caused by this branch). Both measured fresh after the `isDomainAncestorRelated` extraction + rename commit (`a73f1fed`) — not reused from an earlier round.

## Merge-order constraint

**A separate branch, `feat/unreachable-exercises-admin-audit`, is stacked on top of this one** (built from this branch's tip, `a73f1fed`). It imports `isDomainAncestorRelated` and `_SKILL_PARENT_MAP`, both of which only exist on this branch — not on `origin/main`. **`feat/unreachable-exercises-admin-audit` cannot merge before `feat/unified-domain-resolver` does.** See that branch's own summary for its content — it does not touch the workout engine, only a read-only admin audit page.

## Never merged, never touched `main`

All work is local commits on this branch and its stacked child. Nothing pushed unless explicitly requested; nothing merged.
