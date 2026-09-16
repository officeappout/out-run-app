---
name: adr-004-one-workout-one-location
description: David's decision — a workout commits to one execution location for its entire duration; no per-exercise location swapping. Documentation only, not implemented.
metadata:
  type: project
---

# ADR-004 — One Workout = One Location

**Date:** 16.09.2026
**Status:** Decided by David. **Documentation only — not implemented.** No code in this ADR's scope has been touched.

---

## Context

The execution-method-identity investigation (`execution-method-identity-plan.md`, the `[MEV-MISMATCH]`/`[SMFC-MISMATCH]`/`[COOLDOWN-NUKE]` production tripwires, and the corrected location-coverage measurement) traced a chain of individually-reasonable fallbacks that, stacked together, let a workout silently mix locations:

- `method-selection.utils.ts` Priority 2.5/3 selects a method by **gear alone**, with no location check, for every non-park location.
- `resolveExerciseMedia` (`media-resolution.utils.ts`) falls back **across methods** when the selected one has no clip of its own.
- PARK FORCE (`resolveEffectivePipelineLocation`) hard-codes `'park'` as the ultimate default when nothing else is specified.

None of these are individually wrong — each is a reasonable fallback for its own layer. The problem is architectural: **there is no single point where "this workout's location" is decided once and enforced everywhere downstream.** Every layer independently improvises a location-shaped answer, and the improvisations don't agree with each other (see the parking-lot entry "המגירה והראנר לא מסכימים על הסבר חלופי" for one concrete instance).

**Measured baseline** (own-method-only short-clip coverage, ±0 exact level, home vs park):

| level | home | park |
|---|---|---|
| 1 | 75% | 100% |
| 5 | 76% | 90% |
| 9 | 40% | 100% |
| 13 | 8% | 100% |
| 17+ | 0% | 91-100% |

Home is genuinely viable (own-clip coverage, not fallback-inflated) to roughly **level 8**; park stays viable across nearly the entire scale.

---

## Decision

**A workout commits to exactly one execution location for its entire duration.** The location is decided **once, before the workout is built**, and holds for every exercise in it.

- ❌ No per-exercise location swap that silently pulls in a different location's content mid-workout.
- ❌ No exercise counts toward a location's viability unless it has **both**: a method tagged for that location, **and** its own short clip (not a clip borrowed from another location's method via the cross-method fallback). An exercise with a method but no clip of its own does not count — whatever plays would be another location's footage, which is exactly the visual mix a user actually experiences, even if the underlying selection logic is "correct."
- **Viability test** for a candidate location, at a user's level N: count exercises with an own-clip method for that location, in the window `[N-3, N+3]` (the engine's real level tolerance, `ContextualEngine.ts:113`), broken down by movement group (push / pull / legs / core — from `movementGroup`, mapped from the granular `horizontal_push`/`vertical_push`/etc. taxonomy).
- **On failure:** the *entire* workout falls to the next candidate location, and the user gets an explicit message that this happened. Never a silent per-exercise substitution.

---

## Consequences

1. **The Priority 2.5/3 gear-only leak becomes moot.** It exists today only because nothing upstream ever decided "is this location actually viable" — every exercise fends for itself. Once viability is decided once, per workout, before generation starts, the per-exercise gear-only fallback has nothing left to compensate for.
2. **PARK FORCE stops being a hard-coded constant and becomes a computed result.** `'park'` wins today by default, unconditionally. Under this rule, it wins because it actually clears the viability bar at the user's level — which today it usually does, but that becomes a measured outcome, not an assumption baked into `resolveEffectivePipelineLocation`.
3. **Applies to the military persona too.** A soldier gets an all-`service` workout, or — if `service` fails the viability bar at their level — a complete workout at a different single location, with an explicit message. Never a mix of `service` and borrowed non-`service` content inside one session.

---

## Why This File Exists

Every individual fallback in the current chain (gear-only selection, cross-method media fallback, PARK FORCE's hard default) was added for a locally reasonable reason and is documented as such in its own file. None of those files, individually, explains why a user can end up mid-workout with content that doesn't match the location they were told they'd get. This ADR is the missing top-of-chain decision that the existing fallbacks were quietly compensating for — without it, any future investigation into a "wrong location" report will rediscover the same chain from scratch.

**Not implemented.** This file records the decision and its consequences for when implementation is scoped — it does not change `PARK FORCE`, `ExecutionLocation`, the admin panel, or the media-resolution layer.
