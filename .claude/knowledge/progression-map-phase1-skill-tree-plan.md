# Progression Map — Phase 1 "Skill Tree" Implementation Plan

**Status:** plan for review, no app code written yet. Researched via a 7-agent workflow
(5 parallel verification passes against `origin/main`, a design synthesis, and an
adversarial critique) — this document is the corrected synthesis after the critique
caught 5 real internal-consistency issues in the first draft (all fixed below, noted
inline where relevant). Freshness re-checked three times across the research: last
confirmed clean at `origin/main` `7d105a7d` (one docs-only commit past the research's
base `a3ca0d79`, touching none of the ~15 files cited here).

---

## 1. Reuse-first implementation plan

### Reuse targets — exact existing thing per brief item

| Brief's reuse target | Exact existing thing | Verdict |
|---|---|---|
| Node photo/thumbnail URL | `resolveImageForLocation()` — `exercise.types.ts:903-917` | **Reuse directly.** Already exported, already called from 4 unrelated places (`onboarding-new/program-path/page.tsx:309`, `ExerciseWishlistStrip.tsx:66`, `visual-content-resolver.service.ts:319`, `heroMedia.utils.ts:76`). |
| Node visual shape (rings/lock/greyscale) | `ChainNode` — `MasterExerciseView.tsx:229-300` | **Port, don't rebuild.** Closest existing match to the locked design (rounded photo, state rings, lock overlay) — but it's a private, unexported function with its own duplicate image-resolution logic. Extract to its own file; swap its private `resolveThumbnail()` for the canonical `resolveImageForLocation()`; move the level number from a below-card line onto an on-photo badge. |
| Swap drawer | `ExerciseReplacementModal.tsx` — atoms `LazyExerciseImage` (:74-93), `DrawerGearBadge` (:39-71), card-row markup (:358-397) | **Reuse atoms only, not the modal's fetch pipeline.** See mismatch (2) below. |
| Level-precision ("דיוק רמה") drawer | — | **Does not exist.** New work. See mismatch (1). |
| Start-workout CTA target | — | **Does not exist** for a single program+level focus. New work, blocked on a founder decision. See mismatch (3). |
| "מפה מלאה" entry point | `ProgressionChainRow` (`MasterExerciseView.tsx:302-341`) + `handleNavigateToRoadmap` (`ExerciseDetailSheet.tsx:64-65`) | **Exists, wired to a 404.** Rewire, don't rebuild. |
| `progression.tracks` id/slug resolution | `buildUserProgramLevels` + `resolveDataLevel` (`level-resolution.utils.ts`) + `resolveToSlug`/`buildIdToSlugMapFromPrograms` (`program-hierarchy.utils.ts`) | **Reuse directly.** See §3. |

### New work to build

Per this repo's `src/features/{domain}/` convention (domain-agnostic, shared utilities
in `src/lib/`), Progression Map is a new domain: `src/features/progression-map/`.

- `src/lib/progression-map-config.ts` — the fixed 6-programId allow-list **and** the
  `resolveTreeProgramId(exercise)` helper. Placed in `src/lib/` (not inside either
  `content/exercises` or `progression-map`) so both domains can import it without a
  cross-domain violation. **The rule, stated explicitly** (this was missing from the
  first draft — the critique caught it): `exercise.targetPrograms.find(tp => ALLOWLIST.includes(tp.programId))` —
  first `targetPrograms` entry, in array order, whose `programId` is on the allow-list.
- `src/features/progression-map/services/build-skill-tree.service.ts` — pure function:
  collect exercises tagged to the program → group by level → pick one representative
  per level (§2) → gap segments for empty levels. Side-effect-free (takes exercises +
  programId as arguments, returns a tree structure).
- `src/features/progression-map/hooks/useUserProgramLevel.ts` — thin wrapper around
  `buildUserProgramLevels`/`resolveToSlug` (§3) — the gap the research explicitly
  flagged as "no existing hook wraps this generically."
- `src/features/progression-map/hooks/useSkillTree.ts` — fetches exercises for one
  program, calls `build-skill-tree.service.ts`, merges in the resolved current level.
- `src/features/progression-map/components/SkillTreeScreen.tsx` — header (breadcrumb,
  skill name, "רמה X מתוך Y · היעד: …", progress bar) + path + nodes. **Caveat, not
  in the first draft:** the "היעד: …" / level-description banner's data source
  (`ProgramLevelSettings.levelDescription`) has **zero research coverage this
  session** — nobody confirmed a read-path exists or checked what fetches that
  collection client-side. Treat this line of the header as provisional until that's
  checked (a 10-minute grep, not a redesign) — do not assume it's free.
- `src/features/progression-map/components/TreeNode.tsx` — the photo-only node,
  ported from `ChainNode` per above.
- `src/features/progression-map/components/TreePath.tsx` — winding, alternating
  left/right, dotted-connector path with grey gap segments. Genuinely new — no
  precedent found anywhere in the codebase.
- `src/features/progression-map/components/SwapPill.tsx` — the "🔄 +N" control.
- `src/features/progression-map/components/ProgramLevelSwapSheet.tsx` — new, lighter
  sheet (not a 3rd tab on `ExerciseReplacementModal` — see mismatch (2) for why).
  Reuses `LazyExerciseImage`/`DrawerGearBadge`/card-row markup lifted from
  `ExerciseReplacementModal.tsx` — **with one required change when porting**: strip
  the lower/same/higher level-trend badge/icon. That badge exists to show a
  candidate's level relative to the current exercise; in this sheet every candidate
  is the same level by construction, so it would show "same" on every card with zero
  information value. Don't port it as-is.
- `src/features/progression-map/services/program-level-swap-query.ts` — new exported
  `getSameProgramLevelExercises(programId, level, excludeExerciseId)`. **Signature is
  provisional, not settled** — see open question §6.5: if the founder wants the
  location/gear execution-method check both existing swap fetchers apply
  (`exerciseHasLocation` + `selectExecutionMethodWithBrand`), this signature grows
  `location`/`userProfile`/`park` params too. Modeled on the one place this exact
  predicate already exists verbatim — `admin/exercises/page.tsx:403-409`
  (`tp.programId === programFilter && tp.level === levelFilter`) — but that's an
  inline, unexported, admin-only filter callback; this would be the first real,
  callable, exported version.
- `src/features/progression-map/components/LevelDetailDrawer.tsx` — the "דיוק רמה"
  drawer. **Blocked, not a normal buildable unit** (the first draft listed this
  alongside ordinary new files without this flag — critique caught it): its one
  defining action, "התחל אימון ברמה זו," has no existing mechanism to call (mismatch
  3). The drawer's read-only parts (name, total workouts, current level, progress)
  can be scoped and built now; the CTA cannot be wired until §6.1 is answered. Ship
  as two slices if needed, not one.
- `src/app/progression-map/[programId]/page.tsx` — new route, the מפה מלאה
  destination replacing the dead `/exercises/roadmap/[...]`.

**Cross-domain import boundary, stated plainly (the first draft claimed this plan
"does not repeat" an existing pattern, then contradicted itself two sentences later —
fixed here):** `buildUserProgramLevels`/`resolveToSlug` live in
`workout-engine/services/`, not `src/lib/`. Existing code already imports them
cross-domain without a shim — `ProgramsSection.tsx:37` (profile domain) and
`useProgramProgress.ts:20` (home domain) both do this directly. `useUserProgramLevel.ts`
will do the same thing, for lack of a `src/lib`-hosted alternative. **This repeats an
existing pattern; it does not avoid one.** Whether that's acceptable, or whether these
utilities should be relocated to `src/lib/` first, is a real open question (§6.2), not
something this plan resolves on its own.

---

## 2. The representative-per-level rule

**Rule: sort the candidate exercises at a level by Firestore document ID (lexicographic
ascending), take the first.**

Why: `TargetProgramRef`'s full field list (`exercise.types.ts:789-801`) —
`{programId, level, strengthScore?, balanceScore?, mobilityScore?}` — has no field
anywhere that signals "canonical/primary exercise for this level." Inventing a
semantic preference the data doesn't encode is exactly what the brief asked not to do.
The nearest existing precedent (`getExerciseLevel()` in both
`exercise-replacement.service.ts` and `useExerciseMasterData.ts:222`) already takes
`targetPrograms?.[0]` unconditionally — "first in array order" is the repo's ambient
convention here — but raw Firestore fetch order isn't guaranteed stable without an
explicit `orderBy`, which would make the spine node flicker across reloads. Doc ID is
the cheapest field guaranteed constant across every fetch.

**Honesty note:** this specific justification (fetch-order instability, doc-ID
stability) is this session's own engineering reasoning, not something any of the 5
research passes independently verified against Firestore's actual behavior — flagged
per the critique, since everything else in this plan traces to a direct citation and
this one line doesn't.

Composes cleanly with the swap pill: everything **not** picked as the representative
(same doc-ID sort) is exactly the set `getSameProgramLevelExercises` should return.

---

## 3. `progression.tracks` key resolution (id vs. slug)

**Plan: warm the id↔slug map once per Tree-screen mount, resolve through the proven
composite resolver — never read `progression.tracks[programId]` directly.**

1. On mount, call `buildIdToSlugMapFromPrograms(await getAllPrograms())` (or its
   cached wrapper `getIdToSlugMap()`, `program-hierarchy.utils.ts:57`) inside
   `useUserProgramLevel.ts`. **Required, not optional** — the two live call sites that
   skip this (`ProgramsSection.tsx`, `useProgramProgress.ts`) only work because they
   ride on the module singleton having been warmed by some earlier navigation.
   Progression Map can't assume that for a user who deep-links straight into a Tree.
2. Resolve the level via `resolveDataLevel(tracks[resolveToSlug(programId)] ?? tracks[programId])`
   — `resolveDataLevel` (`level-resolution.utils.ts:35-38`) is the file's own stated
   "Single Source of Truth" for the `.currentLevel ?? .level ?? 0` normalization.
3. For a future hub screen needing all 6 programs at once, call
   `buildUserProgramLevels(profile, masterProgramIds, tag)` directly — the one
   function actually proven in production for the multi-program case (real callers:
   `home-workout.service.ts:1861`, `hybrid-context.util.ts:56`,
   `build-home-user-context.ts:89`, `partial-completion.generator.ts:107`), including
   its healing-pass for stale hash-keyed L1 entries.
4. **Do not use** `resolveUserLevelFromMap` (`program-hierarchy.utils.ts:136-163`)
   even though its signature is the closest textual match — it's confirmed dead code,
   zero call sites anywhere. Available but never proven against real data.
5. **Do not model anything on** `useProgressionStore.domainProgress.level`
   (`useProgressionStore.ts:73,241`) — confirmed broken: hydrated verbatim from
   `progression.tracks` (real field `.currentLevel`) into a slot typed and read as
   `.level`. A second, independent instance of the same bug was found this session at
   `useExerciseMasterData.ts:222`'s `userLevelInTrack` — meaning **the existing
   "מסלול ההתקדמות" strip's lock/unlock state is likely already silently broken in
   production today** (always reads `undefined`). Worth a bug ticket on its own,
   separate from this build.

**Edge case:** `resolveToSlug`'s hardcoded `KNOWN_SLUGS` fast-path (used only if the
map isn't warmed yet) has no entry for `human_flag` — one of the 6 Phase-1 programs.
Step 1 above should make this moot; flagging for whoever implements/QAs it.

---

## 4. Every brief-vs-code mismatch, stated plainly

**(1) The "דיוק רמה" level-precision drawer — DOES NOT EXIST.**
Exhaustive search against current `origin/main` (Hebrew strings "דיוק רמה", "רמת דיוק",
the literal CTA "התחל אימון ברמה זו", every plausible English name) — zero hits,
anywhere. `LevelUpModal.tsx` (the component the brief specifically warned not to
confuse with it) was read in full and confirmed to be something else entirely: a
post-workout celebration overlay, props `{isOpen, programName, newLevel, onClose}`
only, fired automatically at the end of a workout, never by tapping anything, no
exercise identity or stats. Shape precedent only (not reusable as-is): `ProgramDrawer.tsx`
(`src/features/profile/components/widgets/`) — program-grain not exercise-grain, and
its one CTA re-assesses rather than starts a workout.

**(2) The swap drawer's current filter logic does not support program+level
membership — new query logic, not a filter tweak.**
`ExerciseReplacementModal.tsx`'s two tabs use different axes entirely: Tab 1
("התאמת התרגיל") groups by `base_movement_id` ±3 levels; Tab 2 ("תרגיל חלופי") groups
by `movementGroup` ±3 levels. Neither accepts an explicit `programId` param — the
only program-related input either uses is the user's *currently active* program, and
only to label a candidate's own level. The one place "same program + exact level"
exists verbatim is an unrelated, unexported, admin-only inline filter
(`admin/exercises/page.tsx:403-409`) — not reachable from the mobile app. Forcing this
into the existing modal as a 3rd tab is wrong beyond the missing query, too: both
fetchers hard-cap results at 3 (`smartSelect3`), which would undercount the swap
pill's true "+N," and the lower/same/higher bucket machinery collapses to a no-op
when every candidate is the same level by construction (see the icon-stripping note
in §1).

**(3) The "start workout at this level/program" CTA — DOES NOT EXIST.**
Checked every plausible candidate: `startMiniDomainAssessment()` starts a
*re-assessment questionnaire* ("tell us your level"), not a workout, despite covering
exactly this family of skills. `ProgramDrawer.tsx` has exactly two actions
(re-assess, close) — no start-workout button. `/workouts/[id]/active/page.tsx`
requires an already-generated workout doc keyed by id — nothing accepts a bare
programId+level. `WorkoutGenerator`'s `GenerationContext` type has no
`focusProgramId`/`targetProgramId` field anywhere. Park/route "התחל אימון" buttons
are all outdoor/aerobic — wrong domain. **Needs a founder decision (§6.1)** before
this slice can be scoped with any confidence, let alone estimated.

**(4) "מפה מלאה" — confirmed 404, confirmed wired on the wrong key.**
`MasterExerciseView.tsx:335` calls `onNavigateToRoadmap(exercise.base_movement_id)`;
`ExerciseDetailSheet.tsx:65` routes to `/exercises/roadmap/${baseMovementId}` — no
`src/app/exercises/` tree exists at all on `origin/main`. Needs rewiring to a resolved
`programId` (§1) and the new destination route.

**(4b) — new, not in the original brief's list, caught by critique: what does "מפה
מלאה" do for the majority of exercises that aren't on the 6-program allow-list?**
`resolveTreeProgramId` returns `undefined` for most of the library (push/pull/legs/
core/full_body/upper_body/lower_body/calisthenics_upper are NOT Phase-1 trees).
**Proposed default: hide the "מפה מלאה" button entirely when no allow-listed program
resolves** — this is the conservative, reuse-first choice (the button already only
renders when its callback prop resolves to something real; gating on a resolved
`programId` instead of a resolved `baseMovementId` is a one-line change to the
existing guard condition, `MasterExerciseView.tsx:332`). Stating this as the plan's
recommendation, not leaving it silently undecided — flag if a different behavior is
wanted (e.g., linking to a future Hub instead of hiding).

**(5) The cross-tagging ambiguity the brief itself raised is real, not hypothetical —
but unquantified.**
`Exercise.targetPrograms` is a plain array with no uniqueness constraint on
`programId` anywhere in the type or write path. One exercise can structurally carry
entries for 2+ of the 6 allow-listed programs — the handstand/HSPU pair's shared
diagnostic-triad scoring convention (`exercise.types.ts:792-798`) is concrete evidence
this kind of cross-tagging is plausible, not just theoretical. No live Firestore
access this session to say how often it actually happens (§6.3).

**(6) Two confirmed `.level`-vs-`.currentLevel` bugs found beyond what was asked,
relevant to anyone touching level-reads near this work.**
`useProgressionStore.ts:73,241` and `useExerciseMasterData.ts:222`'s
`userLevelInTrack` both read a `.level` field that doesn't exist in real data (real
field is `.currentLevel`). Phase 1 must not copy either pattern (§3 already routes
around both) — flagging because the second one means a currently-shipped UI surface
(the existing progression strip) is probably already silently broken.

---

## 5. Files to touch

### Edits to existing files (additive)

| File | Change | Risk note |
|---|---|---|
| `MasterExerciseView.tsx` | Widen `ProgressionChainRow`'s `onNavigateToRoadmap` contract to resolve+pass a `programId` (via `resolveTreeProgramId`) instead of `baseMovementId`; hide the button when no allow-listed program resolves (mismatch 4b). | Confirmed exactly **one** real caller wires this prop (`ExerciseDetailSheet.tsx` — the only one any research pass found). "Additive/no behavior change" is scoped to that one verified call site, not a broader claim about other unverified callers. |
| `ExerciseDetailSheet.tsx` | Change `handleNavigateToRoadmap`'s target from the dead `/exercises/roadmap/${baseMovementId}` to `/progression-map/${programId}`. | Fixes already-dead code (confirmed 404 today) — not a behavior change to anything working. |

### New files

| File | Status |
|---|---|
| `src/lib/progression-map-config.ts` | Buildable now |
| `src/features/progression-map/services/build-skill-tree.service.ts` | Buildable now |
| `src/features/progression-map/services/program-level-swap-query.ts` | Buildable now — signature may grow pending §6.5 |
| `src/features/progression-map/hooks/useUserProgramLevel.ts` | Buildable now |
| `src/features/progression-map/hooks/useSkillTree.ts` | Buildable now |
| `src/features/progression-map/components/SkillTreeScreen.tsx` | Buildable now — header's level-description line provisional pending §6.4 |
| `src/features/progression-map/components/TreeNode.tsx` | Buildable now |
| `src/features/progression-map/components/TreePath.tsx` | Buildable now |
| `src/features/progression-map/components/SwapPill.tsx` | Buildable now |
| `src/features/progression-map/components/ProgramLevelSwapSheet.tsx` | Buildable now |
| `src/features/progression-map/components/LevelDetailDrawer.tsx` | **Partial** — read-only content buildable now, CTA blocked on §6.1 |
| `src/app/progression-map/[programId]/page.tsx` | Buildable now |

**Deliberately not listed:** any file dedicated to the start-workout mechanism itself
(distinct from the drawer that would trigger it). Per mismatch (3), no existing thing
fits, and scoping it correctly depends on §6.1.

---

## 6. Open questions for the founder

1. **Start-workout CTA semantics.** Nothing in the codebase starts a workout scoped to
   one program+level. Does "התחל אימון ▶" mean (a) open the generator pre-filtered to
   this one focus exercise, (b) a new lightweight single-exercise session type, or (c)
   something else? Blocks: the CTA itself, and `LevelDetailDrawer.tsx`'s defining action.
2. **Cross-domain import boundary.** `useUserProgramLevel.ts` will import
   `workout-engine/services/` utilities directly — repeating an existing (if
   technically-against-convention) pattern rather than avoiding it. Acceptable, or
   should those utilities move to `src/lib/` first (separate, larger refactor)?
3. **Cross-tagging frequency.** How often does a real exercise carry `targetPrograms`
   entries for 2+ of the 6 allow-listed programs? No Firestore access to check this
   session. If rare, mismatch (5)'s tie-break is moot in practice; if common, worth
   surfacing to users somehow rather than silently picking one.
4. **`ProgramLevelSettings.levelDescription` read path — genuinely unresearched.**
   Nobody on this pass confirmed whether a client-readable fetch for this field exists.
   Needs a 10-minute check before `SkillTreeScreen.tsx`'s header banner is built as
   described, not assumed either way.
5. **Should the new swap query apply the location/gear execution-method check**
   (`exerciseHasLocation` + `selectExecutionMethodWithBrand`) both existing swap
   fetchers apply? Changes `getSameProgramLevelExercises`'s signature and behavior —
   the plan's current 3-param version assumes "no," stated as provisional in §1.
6. **Single-exercise levels.** When a level has exactly one exercise (no siblings),
   does the swap pill render "🔄 +0," nothing, or not render at all? Cheap to confirm
   now, avoids a guess baked into `TreeNode.tsx`/`SwapPill.tsx`.
7. **מאסל אפ exclusion** — confirmed reminder only, not a new finding: excluded from
   Phase 1 because of its `isMaster=true` prod mis-flag, a founder-only fix. No action
   needed here.

---

## Baseline verification

No app code was written this turn (per the brief's explicit ask — plan only), so
there's no diff to typecheck/build/test yet. This worktree (`worktree-progression-map-phase0`)
was re-fetched and diffed against `origin/main` three times across this research
(latest clean at `7d105a7d`) — no relevant file drifted during the work. When Phase 1
code is actually written, it should happen in a **fresh** worktree branched from
current `origin/main` (this one is now several commits behind and was only ever meant
for read-only research), with the standard baseline (tsc + vitest) → preview → smoke →
explicit founder "go" → merge sequence from the overall program's guardrails.
