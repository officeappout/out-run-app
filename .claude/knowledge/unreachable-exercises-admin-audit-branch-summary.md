# Branch summary — `feat/unreachable-exercises-admin-audit`

**Status: back for final review after round 2 — all applicable review blockers closed. Not merged. `main` untouched.**
**Last updated: 14.09.2026.**

---

## ⚠️ Merge-order constraint — read this first

**This branch is stacked on `feat/unified-domain-resolver` and cannot merge before it.** It imports `isDomainAncestorRelated` and `DOMAIN_RESOLUTION_SKILL_PARENT_MAP` from `workout-selection.utils.ts` — both of which only exist on `feat/unified-domain-resolver`, not on `origin/main`. There is no way to make this branch independently mergeable without duplicating that logic, which was explicitly rejected (see that branch's own summary, "extraction, not duplication"). Review order: `feat/unified-domain-resolver` first, this branch second.

---

## What this branch does

Extends the existing, already-live `/admin/unreachable-exercises` page (a permanent admin tool showing which catalog exercises can't be selected by any real generation path, and why) with 5 new tagging-hygiene categories. Zero writes — read-only, client-side audit over already-fetched catalog data. Does not touch the workout engine.

## The 5 new categories

1. **ANCESTOR_DUPLICATE** — an exercise tagged with both a program and one of its ancestors in the real `programs` hierarchy (e.g. `pull` + `upper_body` + `full_body`). Genuinely new audit logic (no live production code walks this ancestor chain — it's a tagging-hygiene question, not a runtime decision), built from the real `isMaster`/`subPrograms` fields, resolved via `resolveToSlug` (the correct resolver — not `progression.service.ts`'s buggy `buildProgramSlugMap`).
2. **MULTI_SKILL_TAG** — 2+ of the catalog's actually-used skill tags (planche, one_arm_pullup, front_lever, muscle_up, handstand_pushup, handstand) on one exercise. `handstand` added 14.09.2026 — see the screaming-check finding below.
3. **MOVEMENT_GROUP_MISMATCH** — imports the real `[DomainMismatch]` check (`isDomainAncestorRelated` + `resolveExerciseDomain` + `MG_TO_DOMAIN`) from `feat/unified-domain-resolver`, not a reimplementation.
4. **LEGACY_PROGRAM_ID_SCHEMA** — the one exercise still using a singular `programId` field instead of `targetPrograms`.
5. **NO_NAME** — no name in any language (he/en/es).

Every new category's explanation shows the exercise's current `targetPrograms` tags with levels, matching the existing categories' pattern.

## Verified against the live catalog (372 exercises, 10.09.2026)

- MULTI_SKILL_TAG: **24 exercises, 4 pattern groups** — matches exactly.
- MOVEMENT_GROUP_MISMATCH: **6** — the identical set to the `[DomainMismatch]` verification on `feat/unified-domain-resolver` (5 planks + "פשיטת ירך אחורית"). Cross-validates that the extraction on that branch preserved behavior exactly.
- LEGACY_PROGRAM_ID_SCHEMA / NO_NAME: **1 / 1** — same single malformed exercise (`qHy5Te1jSPSi5jA3W9d6`) for both, consistent with it having no other fields at all.
- ANCESTOR_DUPLICATE: **35 exercises, 57 pairs** — did not match an initial ~43 estimate. Reported honestly rather than force-fit (see below), not silently adjusted.

## SKILL_SLUGS vs `DOMAIN_RESOLUTION_SKILL_PARENT_MAP` — a silent assumption, caught by a screaming check, and it was already wrong

Review round 2 (David) flagged that `SKILL_SLUGS` (5, hand-picked) and `DOMAIN_RESOLUTION_SKILL_PARENT_MAP`'s keys (7) were two definitions of "what counts as a skill" in the same file, justified only by "the other 2 aren't used in the catalog" — an assumption that doesn't verify itself going forward.

Added a runtime check: for every exercise, if it carries a `DOMAIN_RESOLUTION_SKILL_PARENT_MAP` key not in `SKILL_SLUGS`, `console.error` it loudly, every scan.

**It fired immediately, on real data.** `handstand` (distinct from `handstand_pushup`, already tracked) is tagged on 4 real exercises today ("הליכות קיר", "עמידת ידיים" ×3) — the original "not used in the catalog" justification was already false, not just fragile. Added `handstand` to `SKILL_SLUGS`. None of the 4 exercises carry a second `SKILL_SLUGS` tag, so `MULTI_SKILL_TAG`'s verified count (24) is unaffected — only the list's accuracy changed. `back_lever` stays excluded, re-verified 0 real usage in the same run. The check now stays silent (confirmed) — but keeps watching, so the next tagging drift surfaces the same way instead of silently repeating this one.

## `muscle_up` — decided, and a real contradiction it surfaces

14 of the 35 ANCESTOR_DUPLICATE rows are the pattern `pull + muscle_up`. `muscle_up` is structurally an `isMaster` program with `subPrograms:[push, pull]` in the real `programs` collection — so the algorithm (a single, exception-free ancestor walk) correctly flags it as an ancestor relationship.

**David's decision (14.09.2026): this tagging is valid, not a duplicate.** `muscle_up` genuinely is composed of both push and pull movement (pull → transition → lower) — `subPrograms:[push,pull]` stays as-is, not modified.

**Per the standing no-exceptions rule, the algorithm was NOT special-cased for muscle_up** — it remains one rule, no per-program exclusions. What changed is display-only: the 14 affected rows get an explicit note in their explanation ("תיוג תקין — מאסל-אפ מורכב מדחיפה ומשיכה (הכרעת דוד 14.09.2026)") so they're visible and explained, not silently dropped from the report or silently excluded from the count. Verified: exactly 14 rows carry the note, the other 21 ANCESTOR_DUPLICATE rows don't.

**This decision surfaces a genuine, unresolved contradiction**, registered in `parking-lot.md` (not fixed here, read-only per the new standing rule):
```
DOMAIN_RESOLUTION_SKILL_PARENT_MAP['muscle_up'] = 'pull'   // skill -> single parent
muscle_up.subPrograms = ['push', 'pull']                   // master -> two children
```
Opposite directions on the same relationship. Investigated (read-only) what this means for the declared-fallback mechanism (`GuaranteePassRunner.ts`'s `runSkillRepresentationGuarantee`) when a user selects muscle_up and there aren't enough tagged candidates — it falls to `pull` only today, `push` is never considered despite the composite nature. Full trace (all 5 real consumers of `DOMAIN_RESOLUTION_SKILL_PARENT_MAP`, what changes if the entry is removed/changed, and a description — not implementation — of a dual-parent fallback) is in `parking-lot.md`'s "מאסל-אפ נשאר כמו שהוא" entry.

## Counts are a snapshot, not a guarantee

**Measured against the catalog as of 10.09.2026. David is actively fixing exercise tags in the admin panel in parallel with this branch's development** (per the new standing rule — he makes all program/exercise/level changes himself, this page only reports and prepares lists). Re-run before relying on an exact number if meaningfully more catalog editing has happened since.

## Measurements

**⚠️ Correction (14.09.2026, merge day):** an earlier version of this table was measured before discovering the base branch's fork point was 29 commits behind `origin/main`'s actual tip — that gave a misleading "450 vs 452" comparison. Both branches were rebased onto the current `origin/main` before merging (two rounds for this branch — the first rebase target turned out to be a stale local `main` ref, not `origin/main`; redone explicitly against `origin/main`, confirmed via `git merge-base` matching `origin/main`'s tip exactly before proceeding).

**Final, measured fresh immediately before merge, both post-rebase:**

| | `tsc --noEmit` | `vitest run` |
|---|---|---|
| Fresh `origin/main` (`d61eb990`, pre-merge) | 452 errors | 1648/1649 |
| `feat/unified-domain-resolver` (merged to `main` as `371daafd`) | 452 errors | 1705/1706 |
| `feat/unreachable-exercises-admin-audit` (this branch, rebased on `371daafd`) | 452 errors | 1705/1706 |

**452 = 452 — exact match, zero new tsc errors.** This branch's vitest count matches its base exactly (no unit tests of its own — no jsdom in this repo's vitest, a React component can't be unit-tested here). `1705 − 1648 = 57` new tests, all from the base branch, not double-counted. Single known-flaky test (`logMultiCategoryWorkout.smoke.test.ts`'s streak-threshold assertion) identical everywhere.

**Behavioral re-verification (David's explicit request, both rebases) — re-ran the 5 category counts against the live catalog after each rebase:** ANCESTOR_DUPLICATE 35 (14 muscle_up-involved), MULTI_SKILL_TAG 24, MOVEMENT_GROUP_MISMATCH 6, LEGACY_PROGRAM_ID_SCHEMA 1, NO_NAME 1 — all exact matches, every time. Confirms the two rebases (including the correction from stale-local-`main` to real `origin/main`) changed nothing behaviorally.

## Never merged, never touched `main`

Local commits only. Nothing pushed unless explicitly requested.
