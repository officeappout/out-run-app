---
name: schedule-builder-drawer-spec
description: The full spec for the schedule-builder drawer (Block 3) — what it is, when it opens, the rules engine it asks, and what it writes. The single file for this topic; everything else (research, prior decisions, code inventories) is referenced, not duplicated.
---

# Schedule-Builder Drawer — Full Spec

**Written:** 04.09.2026 · **Source:** David, dictated in full after the rules-engine and ownership-principle
decisions closed. **Documentation only — nothing built yet.**

This is the one file for the drawer. Everything decided in prior rounds is referenced here, not
copied: `hybrid-display-decisions.md` (the rules-engine decision + the ownership principle),
`running-strength-weekly-research.md` (R1-R8), `running-progress-card.md` (the runner home-page
spec this drawer's triggers interact with), `next-run-workout-card-inventory.md`,
`adaptive-schedule-map.md` (the rolling-vs-calendar decision).

---

## 1 · What it is

A drawer that arranges everything the user trains into one week, by rules. Not a day-picker. Not a
form.

## 2 · When it opens

Three automatic triggers — the user just added something that needs a place in the week, and the
week already has something in it:
- Strength → adds running
- Running → adds strength
- A strength program → a second strength program is added (push→pull)

Opens on the home page, at the end of the questionnaire.

Plus: a button in the schedule editor, always available, opens the same drawer.

**Does not open on a user's very first-ever registration** — there's nothing to coordinate yet.
That path stays what it already is: a blurred card + wizard, already built and live.

**⚠️ Dependency:** the home-page gate (`RUNNING_ONBOARDING_GATE_ENABLED`,
`src/lib/running-onboarding-gate.ts`) doesn't currently distinguish first-registration from
adding-a-second-track. A strength user adding running gets today's blurred card instead of the
drawer. The drawer overrides it — that's part of this work, not a separate fix.

## 3 · What happens when it opens

A proposal, not a question. The rules have already arranged everything before the user sees
anything.

```
Title:   what they have — "3 strength workouts and 3 runs"
Body:    one week, 7 days, with the proposal already placed
Reason:  a short sentence, only when there's something to explain
Action:  [ This works ]   [ I want to change it ]
```

The reasoning is what turns this from a form into an assistant. Every rule carries its own
sentence — not phrased by the drawer itself.

## 4 · Manual changes

Always allowed. Never blocked.
When a move lands somewhere the rules didn't pick — a short note, not a wall.
Double days are allowed; the rules themselves may propose them.

## 5 · The rules engine

Its own module, its own name. Not conditions inside the drawer's UI.
Coordinates across three families:

| Pair | Source |
|---|---|
| Strength ↔ Strength | `src/features/schedule/engine/scheduleRules.ts` — existing, pure, zero React. `preferredDays`, `buildDefaultTemplate`, `validateMultiSession`, `validateSchedule`, `validateInitial`. Consume as-is. |
| Running ↔ Strength | R1-R8, `running-strength-weekly-research.md` §5. Written research, not code yet. **← this is the one to write.** |
| Running ↔ Running | `getSmartDefaultDays` — existing, coarse. |

Four conditions on the module:
1. **Data-source agnostic.** Running currently sits in `profile.running.activeProgram.schedule`,
   strength in Firestore entries. Unifying the sources isn't required now, but source-coupled
   rules would force a rewrite once that unification happens.
2. **Only acts on what the user has actually unlocked** — the ownership principle
   (`hybrid-display-decisions.md`). Never proposes a program the user has no level in.
3. **Every rule carries its own explanation sentence.**
4. **Designed to grow.** David: "we'll upgrade them every time."

## 6 · Workout defaults — starting values, not truth

- Double-training-days per week: beginner 1, others up to 2.
- No hour question asked. A double day = one continuous session (R1's own default). The hour-gap
  is documented and left open, not closed.
- Beginner default: concentrate, don't split. 3+3 split means training almost every day;
  concentrating preserves full rest days.

## 7 · What gets written on save

- Strength days → `lifestyle.scheduleDays` + `recurringTemplate`
- Running days → `running.scheduleDays` + `scheduleDaysSource:'user-chosen'`
- Rebuilding the running plan preserves history — `mergePreservedHistory`. Never starts over from
  scratch. (David's product decision, already on `main`.)
- `PlanRealignPopup`/`RebuildPopup` — existing infra for "days changed after a plan was already
  built." Check whether it fits here before building anything new.

## 8 · Deliberately not built here

- Unifying the two sources of truth (running vs. strength schedule data)
- The rolling engine (stage 2) — direction approved, execution not
- Unifying the five "what does this user have" implementations — a target, not now

## 9 · The finding that has to sit at the top of this document

```
SCHEDULE_POLICY.PREFERRED_DAYS[3] = [0,2,4]
getSmartDefaultDays(3)            = [0,2,4]
```

Identical. A strength user with 3 days who adds running gets three collisions out of three — the
most common configuration, not an edge case. This is the scenario the drawer actually opens into.

---

## Cross-references, not duplicated here

- **Rules-engine decision + ownership principle:** `hybrid-display-decisions.md`, "הכרעה סופית"
  section (04.09.2026).
- **R1-R8 + all backing research:** `running-strength-weekly-research.md` §5.
- **Runner home-page spec** (carousel/widgets this drawer's triggers land the user back into):
  `running-progress-card.md`.
- **`NextRunWorkoutCard` behavior inventory** (before it's retired as an independent card):
  `next-run-workout-card-inventory.md`.
- **Calendar-vs-rolling decision** (unblocks the weaver, doesn't build it):
  `adaptive-schedule-map.md`.
- **`getUpperBodyDominance`/`buildUpperCalisthenicsSession` dead code, the lower-body structural
  bug:** `parking-lot.md` (04.09.2026 entries).
