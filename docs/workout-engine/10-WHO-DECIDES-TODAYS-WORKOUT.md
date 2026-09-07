# Who Decides What Today's Workout Is — Ownership Map

**Status: mapping only, zero code changed.** Written 07.09.2026 for hand-off to the parallel
schedule/domain-mechanism chat, per David's explicit request — before either side fixes anything,
both need the same picture of what exists today.

**Trigger:** confirmed (`03-CHANGES.md` Addenda 26-28) that `InputSanitizerMiddleware` reads only
`activePrograms[0]`, so a push+pull+legs-split user gets exactly one domain forever. Before fixing
that, David asked: is there already a schedule-driven mechanism meant to solve this, and would a
locally-invented "rotation" inside the workout engine collide with it?

**Short answer: yes, there is real machinery for this, spread across at least 6 independent
systems, and none of them imports from any other.** One of them (`scheduledProgramIds`) is
structurally the right answer and already reaches the engine — but whether it's actually populated
with real day-by-day push/pull/legs variation for a split user is unclear from code alone (§3), and
is the single most important open question for the schedule side to confirm.

---

## 1. `scheduledProgramIds` — what it is, and how far it actually reaches

This is the most important finding in this document. **The mechanism to solve "today = pull" already
exists and already reaches the engine — but its *upstream* population is the unverified part.**

**Computed:** `resolveScheduledProgram()` (`src/features/home/utils/resolveScheduledProgram.ts`),
called from `StatsOverview.tsx` (~line 791). It's a pure function over:
- `rawEntries` — today's persisted `UserScheduleEntry[]` docs (real Firestore schedule data)
- `hydrated` — entries just materialized from `recurringTemplate` when `rawEntries` was empty
- `templateDayIds` — `profile.lifestyle.recurringTemplate?.[todayLetter]`, raw
- `activeProgramId` — the final fallback

**Contains:** a real **array**, not a single ID — `UserScheduleEntry.programIds: string[]`
(`schedule.types.ts:69`, "Firestore program doc IDs; empty for rest days"). The schema fully
supports a day carrying `['pull']` while another day carries `['push']`. Resolution order per
`resolveScheduledProgram` (`resolveScheduledProgram.ts:84-90`):
1. Real schedule entries for today (`rawEntries`/`hydrated`, deduped, template-order preserved)
2. `recurringTemplate` fallback (`templateFallbackIds`)
3. `activeProgramId` (single value) — **the last resort, same [0]-shaped fallback as everywhere else**

**Does the engine use it, or ignore it?** It's genuinely consumed, not ignored — but only up to a
point:

- `StatsOverview.tsx:872` passes it into `generateHomeWorkoutTrio({ scheduledProgramIds, ... })`.
- `home-workout.service.ts:1490-1492` normalizes it into `rawScheduledIds`, **falling back to
  `activePrograms[0].templateId` only when `scheduledProgramIds` is empty** (line 1483, 1492).
- `home-workout.service.ts:1526-1544` (Step 1c) is the critical piece: it **rebuilds a synthetic
  `effectiveProfile.progression.activePrograms`** from `rawScheduledIds` (narrowed to `[0]` only
  when the leading id is a master program — `full_body`/`upper_body`/`calisthenics_upper`/
  `lower_body` — otherwise the *full* scheduled array is kept). `InputSanitizerMiddleware` (§2 of
  the systems table) then reads `effectiveProfile.activePrograms[0]` — which, if
  `scheduledProgramIds` correctly said `['pull']` for today, **would correctly resolve to pull**,
  no code change needed downstream.

**So the "activePrograms[0]" bug found in Addendum 26-28 is not fully accurate as originally
framed.** The precise statement is: *when `scheduledProgramIds` is empty (no real schedule data
reaches this call), the engine falls back to the raw, never-rotating, stored `activePrograms[0]`.*
Every test this session used a profile with no schedule configured at all — meaning every
reproduction hit the fallback path, not a failure of the schedule-aware path itself.

**What's unverified — and it's the load-bearing question:** does a real push/pull/legs-split user's
`UserScheduleEntry`/`recurringTemplate` data actually *vary* `programIds` by day (`Monday: ['push']`,
`Wednesday: ['pull']`, `Friday: ['legs']`), or does it carry the same value every training day? §3
below found real evidence pointing toward "same value every day, for non-skill users" — but that
was traced through the onboarding-time schedule *builder*, not confirmed against what a real
post-split-switch schedule actually contains. **This is the one item this document could not
resolve by reading code alone — it needs input from whoever owns the schedule data.**

---

## 2. The 6 systems — none imports from any other

| # | System | File | Reads | Computes | Doesn't know about |
|---|---|---|---|---|---|
| 1 | **`InputSanitizerMiddleware.buildActiveProgramFilters`** | `core/middleware/InputSanitizerMiddleware.ts:222` | `effectiveProfile.progression.activePrograms[0]`, shadow-matrix overrides | `activeProgramFilters`/`activeDomains` — the array that gates which exercises are even scored | The schedule, `lastSessionFocus`, dominance ratios. Trusts whatever `activePrograms[0]` it's handed. |
| 2 | **`home-workout.service.ts` Step 1c (`effectiveProfile` construction)** | `services/home-workout.service.ts:1490-1544` | `scheduledProgramIds` (from caller), raw `activePrograms[0]` as fallback | A *synthetic* `activePrograms` array, narrowed to "today's program(s)" — this is what feeds #1 | `SplitDecisionService`'s rotation logic, `lastSessionFocus` |
| 3 | **`SplitDecisionService.getWorkoutContext` / `resolvePrioritySkillIds`** | `services/split-decision/SplitDecisionService.ts` | `activePrograms[0]` (own separate read, line 395-396), `lastSessionFocus`, `skillFocusIds` | `sessionType`, `priority1/2/3SkillIds`, dominance ratio (50/30/20 etc). Has its own **fully-built PPL push→pull→legs rotation** (lines 182-222), keyed on `lastSessionFocus` | `scheduledProgramIds`, the real calendar. Its rotation output currently only affects *volume weighting inside whatever domains `#1` already decided are in scope* — confirmed not wired into `buildActiveProgramFilters`'s input for the non-master path (`profileForFilters` is only specially reconstructed for `isCalisthenicsUpperMaster`, `home-workout.service.ts:1895-1920`). |
| 4 | **Schedule resolution — `resolveScheduledProgram` + `UserScheduleEntry`** | `home/utils/resolveScheduledProgram.ts`, `user/scheduling/types/schedule.types.ts` | Real per-day Firestore schedule docs (`programIds: string[]` per day), `recurringTemplate` | `scheduledProgramIds` for *today specifically* — the literal calendar's answer | `lastSessionFocus`, dominance/volume math, anything about the exercise pool |
| 5 | **Schedule-building engine — `buildDefaultTemplate`** | `features/schedule/engine/scheduleRules.ts:248` | `seedPrograms`, `seedSkills` (from onboarding-time `resolveScheduleSeed`), `daysPerWeek` | The recurringTemplate/scheduleGrid **at onboarding time** — its own rotation concept, but **skill-centric** (FRONT_LEVER/OAPU/PLANCHE/HANDSTAND), not base-domain-centric. For a non-skill programs-only case: `rotationItems = [primaryItem]` — **one item, repeated every training day, no push/pull/legs rotation at all** (`scheduleRules.ts:288-293`). | `lastSessionFocus`, `SplitDecisionService`, and — critically — whatever `activePrograms` shape a *later* split-switch produces (see #6) |
| 6 | **`progression.service.ts`'s split-template builder** | `features/user/progression/services/progression.service.ts:~1380-1466` | `subLevelsSnapshot` (pre-switch per-domain levels) | **Writes** the `activePrograms` array itself when a user switches to `push_pull_legs` or `upper_lower` — 3 (or 2) separate entries, each with static `focusDomains`. This is the literal origin of the data shape every reproduction this session tested against. | The schedule. Does not appear (not traced further than its own function) to touch `recurringTemplate`/`UserScheduleEntry` at all — meaning a user's calendar may still reflect whatever it was *before* they switched splits. |

**Supporting 7th piece (not a decision-maker, but load-bearing plumbing):**
**`trackMuscleUsage`** (`services/split-decision/muscle-fatigue.service.ts:47`), called from
`useActivitySync.ts:293` on real workout completion — this is the **only writer** of
`progression.lastSessionFocus`, which system #3 depends on. Confirmed real and wired (not a
phantom field) — `sessionFocus` is derived from the completed workout's `programId` or muscle-group
dominance.

**Closest thing to a "source of truth" today:** none of them fully is. System #4
(`scheduledProgramIds`) is structurally the correct one — it's the only system that knows the literal
calendar and already has a path into the engine (via #2) that, when populated, correctly narrows
`activePrograms[0]` per day. But it depends on #5 (or manual user schedule editing) to have actually
written *varying* `programIds` per day — and #5's default-generation logic does not do that for a
plain push/pull/legs split. System #3 has the most complete *rotation algorithm*, but it's
disconnected from what actually gates the exercise pool (#1).

**Confirmed contradiction, stated rather than resolved:** systems #3 and #4/#5 each implement their
own, independent concept of "rotation" — #3 via `lastSessionFocus` (a single most-recent value, reactive,
day-of-week-agnostic), #5 via a fixed onboarding-time template (calendar-fixed, day-of-week-specific, but
skill-only). If both were wired into the engine simultaneously without reconciling them first, they
could disagree on "what is today" — e.g., #5's stale template says Tuesday=push (set once at
onboarding), while #3's `lastSessionFocus`-driven logic says "you just did push, so today should be
pull" regardless of what day it is. Neither is authoritative over the other today.

---

## 3. Where the schedule actually lives

- **Persisted structure exists and supports day-specific program ids**: `users/{uid}.lifestyle.recurringTemplate`
  (`Record<HebrewDayLetter, string[]>`, `schedule.types.ts:15`) plus real per-day
  `UserScheduleEntry` Firestore documents (`programIds: string[]` per entry).
- **Who writes it:** `ScheduleStep.tsx` (onboarding, `handleContinue`, line 428-441) builds
  `recurringTemplate` fresh from the in-session `scheduleGrid` state every time onboarding
  completes. `userSchedule.service.ts` also writes/renames template entries (day-key mutations).
- **Who reads it:** `resolveScheduledProgram` (via `StatsOverview`'s `templateDayIds` input) and
  `hydrateFromTemplate` (materializes concrete `UserScheduleEntry` docs from the template when none
  exist for a date yet — not traced in this pass, referenced by `resolveScheduledProgram.ts`'s own
  docstring).
- **Does it know "today = upper" or just "you train 3x/week"?** The schema supports the former
  (`programIds` per day), but the *default-generation* logic (`buildDefaultTemplate`,
  `scheduleRules.ts:248-311`) only fills in real per-skill rotation for skill-focused users
  (calisthenics_upper path). For a plain multi-domain-programs case with no skills:
  `rotationItems = programs.length > 0 ? [primaryItem] : ['UPPER_BODY']` — a **single item**,
  assigned to every training day via `idx < rotationItems.length ? rotationItems[idx] : ...`
  (effectively always index 0 for a 1-length array). **This means the default template for a plain
  push/pull/legs split does not vary by day out of the box.** Whether an actual push_pull_legs-split
  user ends up with a *different* recurringTemplate (e.g., because they built their schedule before
  switching splits, or edited days manually) is not something this document can confirm from static
  code — it depends on data, not just logic. **Open question for the schedule chat.**
- **`recurringTemplate` is NOT re-read on return to onboarding** — `scheduleRehydration.ts:27-33`
  explicitly notes it's "write-only, built fresh in handleContinue," deliberately not a rehydration
  source. Not directly relevant to the engine-read path, but relevant to understanding how stale a
  user's template can get relative to their current program selection.

---

## 4. Automatic full-body membership (push+pull+legs ⇒ also full_body)

**Not found implemented anywhere.** Searched for auto-enrollment logic, unlock rules, and any
`activePrograms` mutation that adds a `full_body` entry alongside a push/pull/legs split — found
none. The one directly relevant hit is a doc comment on a *generic* admin-configurable
suggestion/unlock-rule type (`progression.types.ts:313-319`):

> `'auto': legacy behavior — directly set the target track ... Kept for cases that should stay
> silent/automatic (e.g. an eventual full_body auto-enrollment rule), NOT the default.`

This is a comment describing a **hypothetical future use** of a generic rule engine, not a
configured or active rule. `isFullBodyMaster` (`home-workout.service.ts:1654-1656`) is computed at
runtime from whether `resolvedChildDomains` happens to cover all 4 base domains — it is **not**
driven by a stored 4th `activePrograms` entry or a flag. For a real push_pull_legs-split user whose
`activePrograms[0] = 'push'`, `resolveChildDomainsForParent('push', ...)` returns `['push']` only
(§1 of Addendum 28's investigation) — so `resolvedChildDomains` would never reach 4 domains this
way, and `isFullBodyMaster` would be `false`. **Conclusion: "push+pull+legs implies full_body" is a
product understanding, not a written rule anywhere in this codebase today.**

---

## 5. Registration → workout: the flow as it exists today (not as it should)

```
Onboarding (ScheduleStep.tsx)
  └─ buildDefaultTemplate() → recurringTemplate written to Firestore
       (rotates SKILLS if any selected; else same primaryItem every day)

[Later, optional] Program evolution / split switch (progression.service.ts)
  └─ writes activePrograms = [push, pull, legs] (or [upper_body, lower_body]), each with
     static focusDomains — does NOT appear to touch recurringTemplate/schedule at all

Daily: StatsOverview.tsx mounts
  ├─ getScheduleEntries(date) → rawEntries (real per-day docs, if any)
  ├─ hydrateFromTemplate() → hydrated (materialized from recurringTemplate, if rawEntries empty)
  └─ resolveScheduledProgram({rawEntries, hydrated, templateDayIds, activeProgramId, ...})
       → { isRestDay, scheduledProgramIds }
            (falls back to activePrograms[0] ONLY if nothing else resolved)

generateHomeWorkoutTrio({ scheduledProgramIds, ... })
  └─ home-workout.service.ts Step 1c:
       rawScheduledIds = normalize(scheduledProgramIds) OR [activePrograms[0].templateId]
       effectiveProfile.activePrograms = rebuilt from rawScheduledIds
                                          (narrowed to [0] only if leading id is a master program)
  └─ InputSanitizerMiddleware.buildActiveProgramFilters(effectiveProfile, ...)
       → activeDomains  ← THIS is what actually gates exercise selection

  [separately, same call]
  └─ SplitDecisionService.getWorkoutContext(userProfile, ...)
       → priority1/2/3SkillIds, dominanceRatio, sessionType
            (has its own independent PPL rotation via lastSessionFocus —
             its output affects VOLUME WEIGHTING, not activeDomains)

Workout completes
  └─ useActivitySync.ts → trackMuscleUsage() writes progression.lastSessionFocus
       (read by SplitDecisionService next time, NOT by scheduledProgramIds/the schedule)
```

The two branches under "same call" never intersect. `activeDomains` (which exercises can even be
selected) is decided entirely by the top branch; `lastSessionFocus`-based rotation (which the split
engine clearly intended, per its own PPL_ORDER logic) only ever influences volume weighting within
whatever `activeDomains` the top branch already fixed.

---

## 6. Proposed interface — schedule → engine (NOT implemented, for discussion)

Whatever ends up owning "what should today's session cover," the engine's actual need at the exact
point it matters (`home-workout.service.ts` Step 1c, right before `buildActiveProgramFilters` is
called) is narrow:

**Input the engine needs:** an ordered list of domain/program ids for *today specifically* —
structurally identical to what `scheduledProgramIds` already provides (`string[]`, Firestore
program doc ids or slugs). Nothing more exotic — the engine does not need to know *why* a domain was
chosen (schedule vs. rotation vs. merge), only *which one(s)*.

**Natural connection point in code:** exactly where `rawScheduledIds` is computed today
(`home-workout.service.ts:1490-1492`) — this is already the single place that decides "trust the
caller-provided schedule, or fall back." Whatever authority ends up deciding rotation should feed
its answer in *as* `scheduledProgramIds` (or a same-shaped sibling parameter), not by patching a
second, competing computation inside the engine.

**What the engine should do when there's no answer** (per David's stated rule — no schedule/history
to rotate by → merge, don't get stuck): this is a policy decision that belongs with whoever owns
rotation, not something to encode ad hoc in the engine. The engine's existing `isFullBodyMaster`
merge path (`home-workout.service.ts:1654-1656`, and `SplitDecisionService`'s own
`applySmartMerge`, `SplitDecisionService.ts:344-384`) is architecturally the right *shape* for a
"merge instead of getting stuck" fallback — it already exists for volume-deficit-driven merging, so
extending it to "no rotation basis" is likely more natural than inventing a new merge path, but
`applySmartMerge` currently only reads/writes `sessionType`, not `activeDomains` — the same
disconnect as everything else in this document. Not designed here — flagging where it would plug in.

**Two failure modes to design against explicitly**, since both are real per §1-§3:
1. `scheduledProgramIds` present but stale/non-rotating (today's data-population gap, §3).
2. `scheduledProgramIds` absent entirely (no schedule configured — brand-new user, or a caller that
   doesn't thread it through, e.g. Custom Builder).

---

## 7. Minimal fix — described, NOT implemented

The smallest change that stops the engine from ignoring programs 2+ *without the engine deciding
rotation order itself*:

`InputSanitizerMiddleware.buildActiveProgramFilters` (and the `home-workout.service.ts` Step 1c
profile-rebuild that feeds it) already correctly consume `scheduledProgramIds` **when it contains
more than one id** — confirmed by reading `effectiveActiveIds = isLeadingMaster ?
rawScheduledIds.slice(0,1) : rawScheduledIds` (`home-workout.service.ts:1531-1533`): the *only*
place the array gets collapsed to a single entry is the master-program special case, which doesn't
apply to a bare `['push']`-for-today schedule entry. **In other words: if `scheduledProgramIds` for
today already contained `['pull']` instead of being empty, no further engine change would be needed
at all for that day to correctly train pull.**

So the minimal fix, *if* the schedule side confirms `scheduledProgramIds` is reliably populated with
real day-varying data for split users: **none, on the engine side** — the gap is entirely in
whether upstream data (schedule population, §3) is correct.

If the schedule side instead confirms the gap found in §3 is real (default template doesn't rotate
push/pull/legs for non-skill users), the minimal *engine-side* fix is narrower than a full rotation
build: stop falling back to raw `activePrograms[0]` (`home-workout.service.ts:1483`,
`1492`) when `scheduledProgramIds` is empty, and fall back to **all** of the user's active program
ids instead of just the first — i.e., when there's no day-specific answer, behave like a merged/
full-body session across every registered program, not like a frozen single one. This satisfies
"don't get stuck on the same program" without the engine inventing an opinion about *which* program
should lead on which day — that ordering decision stays entirely with whichever system (§2's table)
ends up owning rotation.

---

## Open questions for the schedule/domain chat

1. **The load-bearing one**: for a real push_pull_legs-split user, does `UserScheduleEntry.programIds`
   (or the `recurringTemplate` it hydrates from) actually vary by day today, or is it the same value
   every training day (matching what §3's code trace of `buildDefaultTemplate` suggests)?
2. If it doesn't vary today — is building that rotation your side's responsibility, or does it belong
   with `SplitDecisionService`'s already-built (but disconnected) PPL logic (system #3)?
3. Should `SplitDecisionService.getWorkoutContext`'s rotation output and the schedule's per-day
   answer be reconciled into one authority, or should the schedule always win when both exist (per
   §2's stated contradiction)?
4. Does "push+pull+legs ⇒ also full_body" (§4) need to become a real, written rule, or is it
   sufficient that `isFullBodyMaster` already derives the same effect at runtime *if* `resolvedChildDomains`
   ever legitimately covers all 4 domains (which, per Addendum 28, it currently doesn't for a
   `activePrograms[0]='push'` split user)?
