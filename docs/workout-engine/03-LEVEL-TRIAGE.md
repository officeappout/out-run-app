# Exercise Level Triage — the 70 Orphaned Exercises + Core Gaps + Junk Records

> **Status:** report only. Zero Firestore writes were made to produce this document.
> Data pulled live from the `exercises` collection on 2026-09-03 (branch
> `fix/exercise-level-integrity`), cross-checked against `programs` doc IDs to resolve
> real program slugs (not raw Firestore hashes). Grounded in
> [`01-MAP.md`](01-MAP.md) §4/§8, [`02-CATALOG-AUDIT.md`](02-CATALOG-AUDIT.md), and
> [`00-PLAN.md`](00-PLAN.md) §6-10.
>
> Program-ID → slug key used throughout this doc (resolved live from the `programs`
> collection, not assumed): `kDMpobbKsuVTByTIKUpe`=**core**,
> `UPDBtTdCvX748dtBlWYj`=**pull**, `J0fLpmJhG0KDN2tQouxh`=**push**,
> `OrAmOH3F375dVio5yGdU`=**legs**, `EtY8YCol0qpF6DzgcTx1`=**human_flag**,
> `H2279XsRGDg9G370J7S9`=**full_body** (master), `47smw26hUyG5ZbE1bhr3`=**upper_body** (master).

---

## ⚠️ A correction to the plan's premise, found while pulling the raw data

`00-PLAN.md` §7 and this task's own framing assume the 70 orphaned exercises are
"mostly warmups and stretches, legitimately selected by `exerciseRole`." The raw data
says otherwise: **only 6 of the 70 have `exerciseRole` set at all** (all six are
`exerciseRole: 'recovery'`). Every other item — including exercises that are
unambiguously stretches by name, e.g. "מתיחת המסתרינג בשכיבה" (hamstring stretch) —
has `exerciseRole: null`.

This matters because `prependWarmupExercises`' general-warmup candidate pool requires
`exerciseRole === 'warmup' OR tags.includes('mobility')` (`warmup.service.ts:394`,
doc comment at `:443`), and `appendCooldownExercises` requires
`exerciseRole === 'cooldown'` with a fallback of
`exerciseRole === 'cooldown' || tags.includes('flexibility')`
(`cooldown.service.ts:47,101`). **None of the 64 non-recovery orphaned exercises
satisfy any of those conditions.** They are not "selected by role" — they are
**currently unreachable by any live selection path**, full stop, unless they carry
`tags: ['hiit_friendly']` (which routes them into the separate Tabata-finisher pool,
`home-workout.service.ts:2362`, tag-only, level-independent).

This is a real finding, distinct from the level-integrity bug this task is scoped to
fix. It does not require a code change (the code is working exactly as written) — it
means a chunk of authored warmup/stretch content is sitting in the catalog with no
tag/role that makes it reachable. **Flagged here, not fixed here** — out of this
task's scope (level triage), but it changes what "Group A — fine as-is" actually
means: fine in the sense of "doesn't need a level," not fine in the sense of "is
being shown to users." Recorded as an open item in
[03-CHANGES.md](03-CHANGES.md).

---

## Part 1 — The 70 Orphaned Exercises

**41 → Group A** (no level needed) · **20 → Group B** (🔴 real exercise, level bug) ·
**7 → Group C** (unclear, needs your call) · **2 → cross-referenced to Part 1b2**
(core exercises the canonical detector also misses — handled there, not duplicated
here).

### Group A — warmup / stretch / mobility / conditioning (41)

Classified by name pattern (מתיחת/מתיחות/חימום/סיבוב/שחרור = stretch/warmup vocabulary)
or by an explicit `exerciseRole: 'recovery'`. None of these need a level — they are
not domain-progression content. See the reachability caveat above for the honest
caveat on *most* of them.

| Name | exercise_id | Why A |
|---|---|---|
| מתיחת המסתרינג בשכיבה | `24acSdN3XiV2NZ7UnSkZ` | stretch by name |
| חימום סיבובי מפרקים | `34LJ5pJYnk5GPr77xlG9` | warmup by name |
| מתיחת ישיבה בפייק | `4Sjv6yU3LOD6vmaDfz43` | stretch by name |
| חימום סיבובי ירך | `4wCedrBoFjPePiymHoYP` | warmup by name |
| מתיחת דוגמנית | `7spjueGo4OFPIrHHu3Jl` | stretch by name |
| חימום רוטציות לצדדים עמוד השדרה | `8WN9CquCscUXK5SvNiIn` | warmup by name |
| הרחקת כתף שמאל | `DCnxDF0lbfzXLloH8gYp` | mobility/prehab by name |
| מתיחות יד אחורית | `GEnSPwxEqIK6HTakuXOI` | stretch by name |
| חימום דינמי ריצה במקום | `GSPTjOAgRueyZZPkryqe` | warmup by name |
| מתיחות שורש כף יד | `J6KQxmkJHwVqVGgnKhVm` | stretch by name |
| חימום כפיפות צידיות | `JBfizf0KaVURhTYjXZac` | warmup by name |
| מתיחת כתף | `LvRPIsxlZMgYRNBFxFaM` | stretch by name |
| מתיחת קרסול ושוקיים | `MkVq2PbvCCAM77AEEjtN` | stretch by name |
| חימום הנפות | `RAbscOoGqbAN8CbGEYhe` | warmup by name |
| חימום סיבובי ידיים | `UdAmrvtDL0nBYnj8UMe1` | warmup by name |
| חימום כפיפות לפנים | `WkXqEGdoSpq8KeC6EGAn` | warmup by name |
| מתיחת כלב מביט מבט | `ZWx6yKLawdjSrImWUQoL` | stretch by name — **typo, see Part 1c** |
| חימום דנימי קפיצות כוכב | `ZYssXGqyPrIgvV1vXJcn` | warmup by name — **typo, see Part 1c** |
| מתיחת חתול פרה | `ZmVz1kaBwhYqPPAqnkax` | stretch by name (cat-cow) |
| מתיחת פרפר | `dK6Rcu8r93CeaBNOL0EU` | stretch by name |
| חימום סיבובי ברכיים | `eHCiPK74PTW3b7CdrhaZ` | warmup by name |
| חימום סיבובי קרסול | `eHjbkb9XIK2txbwgYWH4` | warmup by name |
| מתיחת ירך קדמית | `g5M36kx6sXaRr8MMWLJj` | stretch by name |
| מתיחת מתפלל | `gWHaGzObmixb1vr66l5I` | stretch by name |
| מתיחת ראש לצדדים | `kx37r35Yh4EkMNO8y6r8` | stretch by name |
| חימום סיבובי אגן | `oGqeJNojQ3UNv73n6mBp` | warmup by name |
| סיבוב חיצוני של הכתף | `s0NCgFV5Lqapbe5ceJwy` | mobility/prehab by name |
| הרחקת כתף ימין | `uujJWUGNVRx0G2GEr9S3` | mobility/prehab by name |
| חימום פשיטה וכפיפת עמוד השדרה | `x7nwPNg3YbxnFLvvLLp2` | warmup by name |
| הליכות דוב ×2 | `4GVlUbVr5r9gNdUCKagI`, `v6DZcJA4vW0tjZTA0bUU` | conditioning/locomotor, `hiit_friendly` — reaches the Tabata pool tag-only; **duplicate, see Part 1c** |
| הליכות זחל ×2 | `AdIAFteC2tmYWTPaaDtl`, `T1XghOTmtU74SeRRg9vb` | same as above; **duplicate, see Part 1c** |
| הליכת סרטן | `eEqv5jF3JkNduEM9Qgp7` | same pattern (crab walk), `hiit_friendly` |
| סשן התאוששות #1–#7 (6 of 7; #1's twin already counted elsewhere) | `rec_*` × 6 | `exerciseRole: 'recovery'` is **explicitly set** — genuinely reachable via the rest-day recovery-video path, not a reachability gap like the rest of this group |

### Group B — real exercises with a missing level (20) 🔴

For each: proposed `programId` (slug) + level + one-line justification against an
already-leveled comparable, per the task's ask. **Not applied anywhere — proposals
only**, for `apply-level-triage.ts` (Part 2) to read.

| Name | exercise_id | Proposed | Justification |
|---|---|---|---|
| פיסטול סקוואט שלילי שמאל | `5LhNqpOowBF268tFTDz7` | **legs L8** | Between "פיסטול סקוואט מוגבה" (elevated/assisted pistol) L9 and "החזקת פיסטול סקוואט" (pistol hold) L7 — negative/eccentric pistol is the classic bridge exercise just below a full unassisted pistol squat (L10) |
| פיסטול סקוואט שלילי ימין | `i5JiWYzTrmtMbpwN207A` | **legs L8** | Mirror of the left-side variant above |
| סקוואט בולגרי עם קפיצה על ספה | `7mRRX85Hfx5sQ6oCl7YE` | **legs L9** | Single-leg + plyometric combined — above "לאנג׳ בולגרי" (no jump) L5 and "סקוואט קפיצה" (bilateral jump) L3; the single-leg+plyo combination puts it near pistol-squat-tier difficulty |
| סמוך קום | `4kww5BB13UkNaaAjZKS0` | **push L6** | Full burpee (squat+plank+push-up+jump) — above "שכיבות סמיכה" (plain push-up) L5, a compound multi-pattern movement |
| חצי סמוך קום | `3dIrpJQHp5QbimPVTZDk` | **push L3** | Half burpee (no push-up/jump component) — simpler than the full burpee (L6 proposed above) |
| סמוך קום עם שכיבת סמיכה | `f4ZbXHOaV5lRTC9JQPkk` | **push L7** | Burpee + push-up variant — above the base burpee (L6 proposed above); the added push-up raises the floor |
| סמוך קום מתחילים | `nunGVGOEmOMnxiwh7jcu` | **push L2** | Explicitly named "beginners" variant — near "שכיבות סמיכה ב-60°" (incline push-up) L1 |
| שכיבות סמיכה לשכמות | `EnS9ade12iVKtUEDuiGW` | **push L3** | Scapular control drill, no load — below "מתח שכמות (תלייה אקטיבית פסיבית)" (scapular pull, hanging bodyweight) L5 since ground work is far less demanding than a hang; above a plain incline push-up since it's a distinct proprioceptive skill |
| עליות תאומים על מדרגה | `wfgHCel9MyopaIXRQS8D` | **legs L2** | Calf raise on a step — between "עליות תאומים" (flat-ground, no added ROM) L1 and "הרמות תאומים טווח מלא" (full range) L3; the step adds range of motion over the flat version |
| סקוואט כנגד קיר | `PUIZw7xWhCCzSDK8LecV` | **legs L1** | Wall-supported squat — matches "סקוואט בעזרת רצועות" L1 / "לאנג׳ קדמי" L1, the catalog's beginner-support-variant tier |
| סקוואט סטטי כנגד קיר | `zXXMkiGHRGQH66J09OYs` | **legs L1** | Wall-sit — same supported position as the item above, held isometrically instead of moved dynamically; same difficulty tier |
| פשיטת מרפקים יד מאחורי הראש בהתנגדות גומיה | `CQtZDiAEvfNB8khudfsG` | **push L2** | Band triceps extension, isolation — below the catalog's compound band exercises ("דדליפט רומני בהתנגדות גומייה" L3, "כפיפת ברך כנגד גומייה" L4) since it's single-joint |
| פשיטת מרפקים בהתנגדות גומיה | `niIBVtXV75LjFsWNJp0k` | **push L2** | Same movement pattern as the item above, different cue variant |
| כפיפת כתף בהתנגדות גומיה | `LitmztKbOSD9MvQwBDsE` | **push L2** | Band front raise, isolation — same tier as the triceps items above |
| כפיפת מרפקים בהתנגדות גומיה | `UmPbE7WydxjOSw5UlDIT` | **pull L2** | Band bicep curl, isolation — comparable simplicity to "דדליפט רומני בהתנגדות גומייה" L3, slightly below since it's a smaller single-joint movement |
| לחיצת חזה בשכיבה בהתנגדות גומיה | `Vr2htqrpnuBObpjzzzyj` | **push L3** | Band chest press, lying — matches "סקוואט כנגד גומייה" L4 / "כפיפת ברך כנגד גומייה" L4 tier (compound-ish band accessory), placed slightly below as a smaller-muscle-group press |
| לחיצת כתפיים בהתנגות גומייה | `TZMFGuNweuAnTLIjyhkx` | **push L3** | Band overhead press — same tier as the chest-press item above; **typo in the stored name, see Part 1c** |
| חתירות בעמידה בהתנגדות גומיה | `ZovShNVtJBRPgdwsngxr` | **pull L3** | Band standing row — matches "דדליפט רומני בהתנגדות גומייה" L3 tier |
| שכיבות סמיכה בהתנגדות גומיה | `gGlZXMEjhAXTxxmO3hTN` | **push L6** | Push-up **with added** band resistance — above the plain push-up baseline "שכיבות סמיכה" L5, since here the band *increases* load (unlike the assisted-dip/pull-up band exercises elsewhere in the catalog, where a band *reduces* load) |
| סקוואט+לחיצת כפתיים בהתנגדות גומיה | `nrPxCJYZtHAyRF6Iywry` | **legs L4** | Combo squat+press against band — above the pure squat-vs-band baseline "סקוואט כנגד גומייה" L4, though kept at the same level since the press component is light; **typo in the stored name, see Part 1c** |

### Group C — unclear, needs your call (7)

No confident comparable was found for these in the catalog data pulled. Each note
below states exactly what's missing to make the call.

| Name | exercise_id | What's missing to decide |
|---|---|---|
| שחיין חזה | `hB253EVZ8ksjQyve6TOu` | Name is ambiguous ("swimmer chest") — could be a posterior-chain/back extension exercise ("superman/swimmer") or something else entirely. Needs a look at its `content`/`instructions` text or video to know which domain (pull? a dedicated lower-back accessory?) and rough difficulty it belongs to. |
| עמידת כלב רגל ויד נגדית | `hECufw1PU0a0lcUEadY9` | This is the classic "bird dog" anti-rotation drill — **found during this pass, not originally named in the task**, and it's a THIRD example (beyond the 2 named in Part 1b2) of a genuine core-stability exercise the canonical detector completely misses (no `movementGroup`/`primaryMuscle`/tag/name-keyword match). Flagging here rather than silently folding it into Part 1b2, since you didn't ask for it and I don't want to expand scope without your sign-off — but it's the same root problem. |
| סקוואט וכפיפת ברך לחזה | `sgjfCmExjbU1CTmSxoMu` | Combo movement (squat + knee-to-chest) — could be a dynamic warmup flow (no level needed) or a genuine leg-conditioning exercise (needs one). No comparable combo movement found in the catalog to anchor a level against. |
| פולי עליון על הריצפה עם מגבת | `vUt6DeXfFk9zvRO5IQza` | Towel-based improvised lat-pulldown — clearly a `pull` exercise, but no comparable "towel"-based movement exists elsewhere in the catalog to anchor a level against. I'd rather flag this than invent a number with no comparable behind it. |
| שכיבות סמיכה על טבעות 75 | `xeo8dpAwk2pNe0IuokLk` | Ring push-up at a 75° incline — the `push_up` family in this catalog has no ring-pushup entries to compare against (only flat/incline plain push-ups and separate dip/ring-support holds under a different `base_movement_id`). The angle-progression pattern (flat push-up L5, 60°/75° incline L1) doesn't transfer cleanly once rings (instability) are added. |
| (EMPTY NAME) | `qHy5Te1jSPSi5jA3W9d6` | This is the junk record from Part 1c — resolve the cleanup decision there first; giving it a level before that just perpetuates a broken doc. |
| עותק של פיסטול סקוואט שלילי שמאל | `sgrEdIolfxaRCgz8Oqyp` | This is the duplicate flagged in Part 1c — same reasoning: resolve the dedup decision first, don't level a copy that may get deleted. |

---

## Part 1b — Core / Abs Exercises

Confirmed against live data: of the 55 canonical-core exercises, **42 already carry a
valid `targetPrograms[core]` level, running 1→18** (verified ladder below) — **not
touched by anything in this report.** 13 are missing a core-programId level; 9 of
those are the flag exercises (Part 1b3), 4 are real ab exercises (Part 1b1).

The real ladder (for citing comparables below), core programId = `kDMpobbKsuVTByTIKUpe`:

```
L1  כפיפות בטן חצי טווח
L2  כפיפות בטן · קראנץ
L3  ישיבת L בתמיכת הרגליים · כפיפות בטן אלכוסונים · פינגווינים
L4  הרמות רגל אחת בישיבת L · טבטה · מטפס הרים · מספריים אופקיים בשכיבה · מספרים בשכיבה
L5  ספר ברכיים כפופת · עליות מספרים בשכיבה · עליות רגליים בשכיבה · פלאנק רגל ויד נגדית
L6  החזקת הולו באדי · כפיפות ברכים בפלאנק על trx · סיבובי רגליים בשכיבה
L7  גליל בטן עם תמיכת הברכיים · ישיבת L ברכיים כפופות · פלאנק גבוה טבעות · קופנהגן פלאנק
L8  הרמות רגליים בישיבת פייק/L · טבטה+ · עליות ברכיים כפופות בתלייה · עליות ספר רגליים ישרות · פלאנק רחוק · קראנץ כל הגוף
L9  כפיפות ברכיים בתלייה אלכסונים
L10 ישיבת L דינמית · ישיבת L רגל אחת · תלייה מספרים
L11 עליות l בתלייה
L12 גליל בטן אקצנטרי · טבטה מאתגר · ישיבת L
L14 דרגון פלאג בטאק · ישיבת L על הרצפה · רגליים למתח
L15 דרגון פלאג בטאק מתקדם
L16 טבטה מאתגר+
L18 דרגון פלאג בפישוק
```

### ב1 — 4 real ab exercises missing a core level

| Name | exercise_id | Currently has | Proposed | Justification |
|---|---|---|---|---|
| פלאנק על הברכיים (knee plank) | `iEZGhtBNV7Tv5iNuT70E` | push L1 only | **core L1** | Regression of full plank; already L1 on `push` — the easiest possible tier fits core too |
| פלאנק (standard plank) | `FHh3m3suMMtoLk1PrxYv` | push L2, full_body L2, upper_body L2 | **core L2** | Foundational isometric hold, same beginner tier as "כפיפות בטן" L2 / "קראנץ" L2 — and consistent with plank's own L2 rating on push |
| פלאנק עליות ונגיעות בכתפיים (plank shoulder-taps) | `BWbscvj0m3hvxghEMtKV` | push L3 only | **core L4** | Anti-rotation/instability variant, harder than a static plank; comparable to "מספרים בשכיבה" L4, below the more demanding "פלאנק רגל ויד נגדית" L5 |
| כפיפת ירך על הגבהה (elevated hip flexion) | `vVTTFbDP1LffViDAQfHn` | legs L4 (via `OrAmOH3F375dVio5yGdU`) | **no core level — reconsider the tag instead** | `primaryMuscle: 'quads'`, and it already has a real, sensible level under `legs`. This reads as a hip-flexor/quad exercise that picked up `movementGroup: 'core'` by mistake, not a genuine core movement. Recommend re-tagging `movementGroup` away from `'core'` rather than inventing a core level for it — see the flag-exercise discussion below, same root pattern. |

### ב2 — 2 ab exercises the canonical detector doesn't recognize as core at all

Both are members of the same 70-exercise orphaned set (Part 1) — `movementGroup` and
`primaryMuscle` are both `null`, so `exerciseMatchesProgram(ex, 'core')`
(`shadow-level.utils.ts:213-227`) fails every one of its 5 checks (no `movementGroup`,
no `primaryMuscle`, no `programIds`/`targetPrograms`, and the name contains none of
the trigger substrings `core`/`plank`/`abs`/`בטן`/`פלאנק`).

| Name | exercise_id | Why the detector misses it | Proposed fix |
|---|---|---|---|
| אופניים (bicycle crunches) | `BcsFnuiLx1fZY2SIVhoC` | `movementGroup: null`, `primaryMuscle: null`, name has no trigger substring | Set `movementGroup: 'core'`, `primaryMuscle: 'abs'`; **level core L3** — comparable to "כפיפות בטן אלכוסונים" L3 / "פינגווינים" L3 (rotational/oblique dynamic movements) |
| עליות נגיעה בבהונות בשכיבה (lying toe-touch crunches) | `DU3SwZWr6uy75WI7T4jB` | Same as above | Set `movementGroup: 'core'`, `primaryMuscle: 'abs'`; **level core L5** — comparable to "עליות רגליים בשכיבה" L5 / "עליות מספרים בשכיבה" L5 (lying leg-raise family) |

Fixing the tagging (not just the level) also makes both reachable by the canonical
core detector for the first time — this single fix closes two separate gaps at once.

### ב3 — 9 flag exercises tagged as core

All 9 confirmed: `movementGroup: 'core'`, `primaryMuscle: 'shoulders'`, and **none**
has a `targetPrograms` entry for `programId: 'core'`. Every one of them already has
real levels on `pull`/`push` (and `human_flag` for most):

| Name | exercise_id | Existing levels (pull / push / human_flag / other) |
|---|---|---|
| דגל אנושי | `kbxV76kyWw1nL3i8Mewi` | pull L21, push L21, human_flag L10 |
| דגל אקצנטרי בטאק | `FSbQ2OfFSDzWxGOSRljt` | pull L18, push L18, human_flag L9 |
| דגל ב-45° | `DWiXoX8UHKQiAS1ye40c` | pull L13, push L13, human_flag L2 |
| דגל בטאק | `ycvdr08dAy8xr1p5COyy` | pull L16, push L16, human_flag L7 |
| דגל בעזרת גומייה | `FU3FAudvpYTZqYU0m8GV` | pull L19, push L19, human_flag L9 |
| דגל בפישוק | `WJIrY4OW1QgfhTeNLvNS` | pull L20, push L20, human_flag L9 |
| דגל נמוך | `fg0NDJmRtK2RPXU7gHqr` | pull L14, push L14, human_flag L3 |
| דגל פלאנק צידי | `0vBLmiJuZnq6djGSa5LD` | pull L12, push L12, human_flag L1 |
| שולחן הפוך | `RxpMhnXQBW80jq1no41f` | push L1, full_body L1, upper_body L1, legs L1 |

Because `movementGroup: 'core'` makes `exerciseMatchesProgram(ex, 'core')` return
`true` (`shadow-level.utils.ts:216`), every one of these is a legitimate core-slot
candidate in a normal workout. With no `targetPrograms[core]` entry,
`resolveExerciseLevelForDomains` (`workout-selection.utils.ts:95-97`) falls through to
whatever *other* program entry it happens to resolve first — comparing a number from
the `pull`/`push`/`human_flag` scale against the user's `core`-scale level. Not
catastrophic today (the levels are high, so a beginner mostly won't see them), but a
real cross-scale comparison bug of exactly the kind flagged in `01-MAP.md` §8.

**Two options, implications laid out, no decision made here:**

| | Option 1 — remove from core classification | Option 2 — add a `targetPrograms[core]` entry |
|---|---|---|
| **Mechanism** | Change `movementGroup` away from `'core'` (e.g. to `null`, or a dedicated skill-only grouping) | Add a `{programId: 'core', level: N}` entry to `targetPrograms`, keep `movementGroup: 'core'` |
| **Effect on core-slot eligibility** | These 9 exercises stop being core-slot candidates in ordinary workouts entirely | They stay core-slot candidates, but now compared against the user's *actual* core level, correctly |
| **Effect on `applyPhysiologicalSort`** | No longer forced into the always-last core ordering tier (`workout-sorting.utils.ts`, tier 4) — would sort by whatever tier its remaining classification implies | Still forced last, which is arguably correct anyway (any flag/lever move is inherently a stabilizer-heavy skill move, physiologically wants to go last regardless of "true" domain) |
| **Effect on Smart Swap** | `movementGroup` also drives swap-family matching (`exercise.types.ts` doc comment) — changing it could change what these exercises swap into/from elsewhere | No change to swap behavior |
| **What level would even be defensible for Option 2** | N/A | These are advanced human_flag skill moves (L9-L21 on their real scale) with essentially zero anatomical relationship to a beginner's ab-circuit core level — there is no "correct" core-scale number to invent here, only a plausible-looking one. This is the honest reason Option 1 reads as structurally cleaner, though it's still your call |
| **Effort** | Single-field tag change × 9 docs | Requires picking a defensible level for each of 9 exercises with no real comparable in the core ladder — same "inventing a number" problem this whole report is trying to avoid elsewhere |

---

## Part 1c — Junk Records

Identified, not deleted. Recommendation given for each, decision left to you.

| Issue | Details | Recommendation |
|---|---|---|
| **Empty `name` + zero `execution_methods`** | `id: qHy5Te1jSPSi5jA3W9d6` — this is **one single broken document**, not two separate issues: it has both an empty `name` field AND zero `execution_methods` (confirmed the only exercise in the whole 373-doc catalog with `execution_methods.length === 0`). It can never be selected (no method) and would render as a blank label anywhere it did surface. | Delete. There is no content here to recover — an empty name with no execution method is not a draft worth salvaging, it reads as an artifact of a partial/aborted creation. |
| **"עותק של פיסטול סקוואט שלילי שמאל"** | `id: sgrEdIolfxaRCgz8Oqyp` — a duplicate of "פיסטול סקוואט שלילי שמאל" (`5LhNqpOowBF268tFTDz7`, Group B above) with "עותק של" ("copy of") literally prefixed in the stored name. Same missing-level bug as its original. | Delete, once you're satisfied it's a pure duplicate (I did not diff every field between the two — only name/level status was checked). Do **not** apply the Group B level fix to this one; fixing the original is enough. |
| **"הליכות דוב" ×2** | `4GVlUbVr5r9gNdUCKagI`, `v6DZcJA4vW0tjZTA0bUU` — identical name, both `hiit_friendly`, both otherwise-orphaned (Group A above). I did not diff their `execution_methods`/media to determine if they're byte-identical or two distinct filmed variants that happen to share a name. | Manually compare the two docs' media/execution_methods before deciding — if identical, delete one; if they're genuinely different filmed variants, rename one to disambiguate (e.g. add a distinguishing suffix) rather than deleting real content. |
| **"הליכות זחל" ×2** | `AdIAFteC2tmYWTPaaDtl`, `T1XghOTmtU74SeRRg9vb` — same situation as bear walks above. | Same recommendation as above. |
| **Typos in user-facing names** | `TZMFGuNweuAnTLIjyhkx` "לחיצת כתפיים **בהתנגות** גומייה" (should be בהתנגד**ות**); `nrPxCJYZtHAyRF6Iywry` "סקוואט+לחיצת **כפתיים** בהתנגדות גומיה" (buttons/knobs — should almost certainly be **כתפיים**, shoulders); `ZYssXGqyPrIgvV1vXJcn` "חימום **דנימי** קפיצות כוכב" (should be **דינמי**, dynamic); `ZWx6yKLawdjSrImWUQoL` "מתיחת כלב מביט **מבט**" (duplicated word — likely meant "כלב מביט **מטה**," downward-facing dog) | Straightforward spelling fixes, safe to correct directly whenever convenient — these are display-string typos with no structural/level implications, unlike everything else in this report. |

---

## What this report does *not* cover

- The reachability gap flagged in the callout at the top (most Group-A content having
  no `exerciseRole`/mobility tag) — a real finding, out of scope for a level-integrity
  task, logged as an open item.
- The bird-dog exercise found in Group C — a third core-detector miss beyond the two
  you named, flagged rather than silently folded into Part 1b2's scope.
- Any exercise outside these 70 + 55 sets. This report does not re-audit the whole
  catalog — see `02-CATALOG-AUDIT.md` for that.

See [`03-CHANGES.md`](03-CHANGES.md) for what was actually changed in code as a
result of this report, and [`apply-level-triage.ts`](../../scripts/audit/apply-level-triage.ts)
for the dry-run migration script that reads Group B above.
