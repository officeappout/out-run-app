---
name: exercise-editor-conventions
description: Admin panel exercise editor — clearing a field must send null, never undefined; the undefined-means-untouched trap and how to avoid it in new fields/controls
metadata:
  type: reference
---

# Exercise Editor — Clearing a Field Sends `null`, Never `undefined`

**Source:** `docs/workout-engine/03-CHANGES.md` (08–09.09.2026, "admin panel can't clear a field" bug)
**Regression script:** `scripts/verify-exercise-editor-clear-fields.ts` — real Firestore round-trip, run before/after touching any exercise-editor field control

---

## The rule

In the exercise editor (`src/features/content/exercises/admin/`), a control that clears/deselects a field must send `null` (single-value fields) or `[]` (array fields) — **never `undefined`**.

`undefined` means "the user didn't touch this field" to the save pipeline, not "the user cleared it." Sending `undefined` to mean "cleared" silently keeps the OLD stored value instead of clearing it, via one of two mechanisms:

1. **Fields covered by `exercise.service.ts`'s `preserveField`** (`exercise.service.ts:352-364` — the full field list is right there): `undefined` explicitly falls through to "preserve existing value."
2. **Fields NOT covered by `preserveField`** (e.g. `targetPrograms`): `undefined` drops the key from the `updateDoc` payload entirely, so Firestore's partial update never touches the field. Same silent-preserve outcome, different mechanism — this is the more dangerous variant because there's no explicit "preserve" line to grep for; the field just silently vanishes from the payload.

## Why not fix `preserveField` instead

`preserveField` is correct as written — it's the thing protecting every metadata field on live exercise data from accidental data loss on a partial save. The bug is entirely in the UI layer sending the wrong sentinel value. Do not weaken or route around `preserveField`; send `null`/`[]` instead.

## The 4 confirmed instances (fixed)

| Field | File:line | Trigger shape |
|---|---|---|
| `movementGroup` | `BasicsSection.tsx:789` | chip toggle: `selected ? undefined : group` |
| `base_movement_id` | `BasicsSection.tsx:695` | explicit "clear" button |
| `primaryMuscle` | `MuscleSelectionSection.tsx:32` | dropdown blank option: `muscle \|\| undefined` |
| `targetPrograms` | `ExerciseEditorForm.tsx:565` | submit-time ternary: `arr.length > 0 ? arr : undefined` |

All four were the same underlying pattern reached three different ways: a "click again to deselect" toggle, a dropdown's blank option, and an explicit clear button/submit-time ternary.

## What was checked and found NOT buggy

`secondaryMuscles` and `injuryShield` already clear correctly — both are toggled via array `filter`/spread, which always produces a real `[]`, never `undefined`. No fix needed; this is the model to copy for any new array-field control.

`isFollowAlong` (checkbox) and `secondsPerRep` (number input, floors to a default) structurally cannot produce `undefined` via their controls at all — not applicable to this bug.

`noiseLevel`/`sweatLevel` have selectable controls but no clear/deselect affordance today — can't hit this bug, but also can't be cleared once set (a separate UX gap, not this one).

## When adding a new field or control to the exercise editor

1. Does this field have a "clear"/"deselect" affordance (click-again toggle, blank dropdown option, an explicit clear button)? If not, this doesn't apply.
2. If yes: grep the setter for `? undefined :`, `|| undefined`, or `?? undefined` in whatever produces the clear branch. Replace with `null` (single value) or `[]` (array).
3. Check whether the field's TypeScript type allows `null` — if not, extend the type (see `exercise.types.ts`'s `movementGroup`/`primaryMuscle`/`base_movement_id` for the pattern), don't work around it with a cast.
4. Add a case to `scripts/verify-exercise-editor-clear-fields.ts` covering the new field and re-run it (`npx tsx scripts/verify-exercise-editor-clear-fields.ts`) — a unit test alone does not prove this; the real save pipeline (`sanitizeExerciseData` → `preserveField`/key-presence → `convertUndefinedToNull` → `updateDoc`) has to be exercised against real Firestore to catch this class of bug, which is exactly how the original 4 instances were confirmed.
