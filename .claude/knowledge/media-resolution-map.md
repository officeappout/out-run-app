# Media Resolution Map — READ-ONLY Audit

> Scope: how exercise **video** + **image/thumbnail** are resolved across every workout entry point and player state, why `resolveExImage` fails on Bunny-only exercises while the live player plays them, how the execution-method is selected (index vs location), and a DRY verdict.
> Constraints honored: read-only. No code/data/Firestore writes, no commit/push, StrengthRunner untouched.
> Date: 17.07.2026. Evidence is file:line.

---

## §0 — The two field regimes (the root of everything)

Every exercise doc can hold media in **two generations**, and the whole bug surface is that different code reads different generations.

| Regime | Fields | Read via |
|---|---|---|
| **NEW — Bunny structured** | `media.previewVideo.he.videoId` (short loop), `media.fullTutorial.he.videoId` (long), `media.bunnyVideoId_mainVideoUrl` (sidecar id). Also `ExternalVideo.thumbnailUrl`. | `resolvePreviewForLang()` / `resolveTutorialForLang()` (`exercise.types.ts:334,346`) + `buildBunnyStreamUrl/Thumbnail` |
| **OLD — legacy direct URL** | `media.mainVideoUrl`, `media.videoUrl`, `media.imageUrl`; root `videoUrl`, `imageUrl`, `coverImage`, `thumbnailUrl` | direct string reads |

The migration moved media to Bunny, so a modern exercise (e.g. **`h3oFM4Xe6FE63OQzfh8x` "סקוואט טווח חלקי"**) can have `previewVideo.he.videoId` populated and **no** legacy `mainVideoUrl`. Any reader that only knows the legacy regime returns nothing for it.

---

## §1 — Media path per entry point × state

Legend: **🟢 Bunny-aware** (reads `previewVideo.he.videoId`) · **🔴 legacy-only** (misses Bunny-only exercises) · n/a = no media at this surface.

### (ב) Regular strength live session — `StrengthRunner`
Plan built by `enrichExercise` (`app/workouts/[id]/active/page.tsx:111-254`): sets `videoUrl = method.media.mainVideoUrl` (:121), `imageUrl = method.media.imageUrl || videoUrl` (:122), and **strips `execution_methods`** from the flat exercise (return :235-253). Media hub: `usePlayerMedia` (`StrengthRunner.tsx:83-89`).

| State | Component:line | Video source | Image/thumb source | Verdict |
|---|---|---|---|---|
| playlist / overview card | `WorkoutPlaylist.tsx:157` → `resolveExImage` (`grouping.utils.ts:42`) → `resolveExerciseMedia` | none (image only) | `entry.imageUrl` legacy | 🔴 |
| warmup / cooldown card | `WorkoutBlockCard.tsx:263+` | none | same `resolveExImage` | 🔴 |
| PREPARING / countdown | `PreparingStateView.tsx:38-74` | `safeVideoUrl` (Bunny) | `safeImageUrl` = legacy `imageUrl` | 🟢 video / 🔴 img |
| **ACTIVE execution** | `ActiveExerciseView.tsx:156` → strength `ExerciseVideoPlayer` | `safeVideoUrl` (Bunny) | n/a (black bg) | 🟢 **reference** |
| INPUT / reps-input | `InputStateView.tsx:96` | `safeVideoUrl` (Bunny) | n/a | 🟢 |
| RESTING / next-ex preview | `RestingStateView.tsx:90` → `RestWithPreview.tsx:44-51` | `nextExercise.videoUrl` **legacy** — `bunnyVideoId` is computed (`useExerciseDerivedValues.ts:488-519`) but **dropped** at `RestWithPreview.tsx:47` | next-ex `imageUrl` legacy | 🔴 (diverges from ACTIVE) |
| mini-player | `MiniPlayerBar.tsx:62` | `safeVideoUrl` (Bunny) | none | 🟢 |

Caveat that bites even the 🟢 rows: because `enrichExercise` strips `execution_methods`, `exerciseBunnyVideoId` (`useExerciseDerivedValues.ts:370-385`) can't read `previewVideo.he.videoId` (no methods present) and falls to the **UUID-regex-from-`mainVideoUrl`** branch (:377-384). On a truly Bunny-only exercise with no `mainVideoUrl`, that yields `null` → no video even on ACTIVE. (See §2 for why the reported case still plays.)

### (א) Hybrid workout
**No hybrid player exists.** `workout-engine/hybrid/` is design-only (`HYBRID_ENGINE_DESIGN.md`, "no code yet"); overview route is a "Coming soon" stub (`app/workouts/[id]/overview/page.tsx:256-259`). Parks "hybrid slots" resolve **routes/aerobic legs**, no exercise media. Station preview cards read `ex.imageUrl` only (`StationCard.tsx:60`). When built, design says it reuses the strength engine → will inherit (ב)'s behavior. → 🔴 today (no Bunny path anywhere).

### (ג) Home strength shelf — `HeroWorkoutCard`
`home/page.tsx:1309` → `HeroWorkoutCard.tsx:56` `resolveHeroMedia` → `resolveVideoForLocation`/`resolveImageForLocation` (`exercise.types.ts:846,857`). Video = `method.media.mainVideoUrl`; image = `method.media.imageUrl` → group fallback. Carousel cards `WorkoutSelectionCarousel.tsx:353` same. → 🔴 (a **third** resolver, legacy).

### (ד) Home-page generator — `WorkoutBuilderSheet`
The sheet renders only icon/SVG chips, **no exercise media** (`WorkoutBuilderSheet.tsx:789+`). Generated exercise thumbs appear downstream: home hero/carousel (`resolveHeroMedia`, as ג) and the full preview `WorkoutPreviewClient.tsx:257-262` `resolveImageUrl` = `execution_methods[0].media.imageUrl || .mainVideoUrl || media.imageUrl || media.videoUrl` (image-only, index-0). → 🔴

### (ה) Big schedule (`src/features/schedule`)
Contains **no UI/media** — only `scheduleRules.ts` + types. Scheduling UI (`WorkoutBuilderSheet` schedule mode, `SmartWeeklySchedule.tsx`) shows calendar chrome, no exercise thumbs. Media materializes only when a scheduled workout opens → `WorkoutPreviewClient` (legacy, as ד) → `StrengthRunner` live (ב). → 🔴 / defers.

**§1 headline:** The Bunny field `previewVideo.he.videoId` is consumed in **exactly one place** — `usePlayerMedia` for ACTIVE/INPUT/PREPARING/mini-player of the live strength session. **Every other state and every other entry point (playlist, rest preview, all images, home shelf, generator preview, schedule) is legacy-only** and blind to Bunny-only exercises.

---

## §2 — The specific gap: `resolveExImage` vs `ExerciseVideoPlayer`

**Question:** why does the player find media for `h3oFM4Xe6FE63OQzfh8x` but `resolveExImage` logs `[Media FAIL]`?

**Answer — exact fields on each side:**

| Side | Function | Field it reads for this exercise | Result on Bunny-only |
|---|---|---|---|
| **Player finds it** | `exerciseBunnyVideoId` `useExerciseDerivedValues.ts:373-375` | **`m.media.previewVideo.he.videoId`** (iterates `execution_methods`) → `buildBunnyStreamUrl` → `play_{res}p.mp4` | ✅ plays |
| **Playlist fails** | `resolveExImage` `grouping.utils.ts:47` → `resolveExerciseMedia` `media-resolution.utils.ts:56-81` | `mainVideoUrl` / `videoUrl` / `imageUrl` / `coverImage` / `thumbnailUrl` — **never `previewVideo`** | ❌ `undefined` → `[Media FAIL]` |

So it is a pure **field-name mismatch**: the player's Bunny path reads `previewVideo.he.videoId`; `resolveExerciseMedia` was written for the legacy regime and **never learned the Bunny field**. It doesn't even derive a Bunny thumbnail from the videoId (`buildBunnyThumbnailUrl`) — its image "last resort" is the legacy `videoUrl`, also absent. Hence no image either.

**Why the asymmetry needs `execution_methods` to survive:** the player reads `previewVideo.he.videoId` off `execution_methods`. That works on any surface where the exercise still carries its methods (e.g. a plan built with methods intact). The user reports "2 שיטות ביצוע" on this exercise — i.e. methods are present → the player's loop finds the Bunny id, `resolveExerciseMedia` still can't.

**Second-order latent gap (flag):** on the fully-enriched live plan, `enrichExercise` **strips methods** (`active/page.tsx:235-253`), so `previewVideo` is unreachable and the player leans on the `mainVideoUrl`-regex fallback. A Bunny-only exercise reaching the player *through that flatten* would fail there too. Any fix must both (a) teach the shared resolver the Bunny field, and (b) carry the Bunny id through the flatten step.

> Not verified against Firestore (read-only-no-data constraint): the exact doc shape (`previewVideo.he.videoId` present + `mainVideoUrl` absent). The code-level asymmetry above is conclusive for the `[Media FAIL]` regardless.

---

## §3 — Execution-method selection: index vs location tag

The "correct" primitive `findMethodForLocation` (`exercise.types.ts:817-840`) **is** location-tag based — *but only if a real `location` is passed*: exact `m.location === location` (:826) → `locationMapping.includes` (:830) → first method with **legacy** media (:835) → `methods[0]` (:840). If `location` is null it skips straight to index-0. Also its media-presence check (:836) is legacy-only, so it won't even pick a Bunny-only method.

| Path | File:line | Verdict |
|---|---|---|
| Main / hybrid generator | `ContextualEngine.ts:594-644` (`findMatchingMethod`) | 🟢 LOCATION-TAG (strict; park hard-rejects home) |
| Workout selection pool | `workout-selection.utils.ts:559-565` | 🟢 LOCATION-TAG (order-safe two-step) |
| Cooldown | `cooldown.service.ts:100-103` | 🟢 LOCATION-TAG (order-safe) |
| Live player video | `LiveWorkoutOverlay.tsx:119,129` (orphan) / `enrichExercise` `active/page.tsx:120` | 🟢 LOCATION-TAG (`workoutLocation` threaded) |
| **Warmup** | **`warmup.service.ts:492`** | 🔴 **ORDER bug** — single-predicate `.find(m.location===loc \|\| m.location==='home' \|\| mapping)` returns **home if listed first**, even when a park method exists |
| **Home shelf / recovery** | **`home-workout.service.ts:232`** | 🔴 INDEX-0 |
| **Home-page trio generator** | **`home-workout.service.ts:384`** | 🔴 INDEX-0 — ignores the `location` computed 8 lines above (:376) |
| **Overview page** | **`overview/page.tsx:34,55-64`** | 🔴 hardcoded `'home'` + `execution_methods[0]` |
| **Preview-drawer conversion** | **`workout-conversion.utils.ts:34,60,68,125,175`** | 🔴 hardcoded `'home'` → index-0 fallback |
| Live bunny-id fallback | `useExerciseDerivedValues.ts:379` | 🔴 INDEX-0 (fallback only) |
| Schedule | `src/features/schedule/*` | n/a — no method selection |

**Where the location lives:** canonical field `workoutLocation` (`WorkoutPlan.workoutLocation`) / engine `context.location`. It **defaults to `'home'`** at `active/page.tsx:523` and is read from `sessionStorage` (:612-643) — if never set for an outdoor workout it silently stays `'home'`.

**The user's "home method inside an outdoor workout" bug = confirmed, multi-source:** the trio generator (`home-workout.service.ts:384`) and preview-drawer conversion (hardcoded `'home'`) **bake the wrong method into the plan** before the location-aware live player runs; and `warmup.service.ts:492` returns a home warmup whenever it precedes the park one in the array. The live player itself is location-correct — the damage is upstream.

---

## §4 — DRY verdict: **NOT DRY. Three forked resolver families.**

There is **no single shared resolver**. The code forks into three families reading different fields:

| Family | Reads | Resolvers (file:line) |
|---|---|---|
| **A. Legacy-only** | `mainVideoUrl/videoUrl/imageUrl/coverImage/thumbnailUrl` | `resolveExerciseMedia` (`media-resolution.utils.ts:47`), `resolveExImage` (`grouping.utils.ts:42`), `resolveVideoForLocation`/`resolveImageForLocation` (`exercise.types.ts:846,857`), `enrichExercise` (`active/page.tsx:121`), `convertExercisesToWorkoutPlan` (`workout-conversion.utils.ts:69`), home flatten (`home/page.tsx:688`), `WorkoutPreviewClient.resolveImageUrl` (:257), `visual-content-resolver.service.ts:290` |
| **B. Bunny-native** | `previewVideo.he.videoId`, `fullTutorial.he.videoId` | `resolvePreviewForLang`/`resolveTutorialForLang` (`exercise.types.ts:334,346`) + consumers `ExerciseLibraryCard`, `MasterExerciseView`, content `ExerciseVideoPlayer` |
| **C. Mixed** | legacy video + Bunny id + Bunny tutorial | `useExerciseDerivedValues` (`:340,370,394`) → `usePlayerMedia` |

Only **`fullTutorial`** is uniformly Bunny-resolved everywhere (all route through `resolveTutorialForLang`). For the **preview video and image/thumbnail**, every workout-engine / home / onboarding / schedule surface is Family A (legacy) — and Family B (the real Bunny reader) is used **only in the content-library surfaces**, not in any workout runner.

**Every legacy-only reader that misses a Bunny-only exercise** (the `h3oFM4Xe6FE63OQzfh8x` class): `media-resolution.utils.ts:56-81` (and all its callers — home flatten, enrichExercise, workout-conversion, exercise-display, useExerciseSwap, ExerciseReplacementModal, pyramid.processor, resolveExImage), `exercise.types.ts:851,862`, `WorkoutPreviewClient.tsx:257`, `useExerciseDerivedValues.ts:340-362`.

**DRY determination:** ❌ the 5 entry points do **not** converge on one resolver. The single point that must become Bunny-aware to fix everything at once is **`resolveExerciseMedia`** — fold `previewVideo`/`bunnyVideoId` resolution + Bunny-thumbnail derivation into it, then route the inline flatten steps (`enrichExercise`, `convertExercisesToWorkoutPlan`, home flatten, `resolveVideoForLocation`/`resolveImageForLocation`) through it, and carry the Bunny id through flattening so it survives `execution_methods` stripping.

---

## Fix direction (NOT implemented — for the decision after this map)

One code fix, one place, no data touched:
1. **Make `resolveExerciseMedia` Bunny-aware** — add `resolvePreviewForLang(media).videoId` → `buildBunnyStreamUrl` for video, and `ExternalVideo.thumbnailUrl ?? buildBunnyThumbnailUrl(videoId)` for image, ahead of the legacy chain. This alone fixes `resolveExImage` + home flatten + preview + swap.
2. **Converge Families A→ the fixed resolver**; delete `resolveVideoForLocation`/`resolveImageForLocation`'s duplicate legacy chain (or make them delegate).
3. **Carry the Bunny id through the flatten** (`enrichExercise`, `convertExercisesToWorkoutPlan`) so `execution_methods` stripping doesn't blind the live player.
4. **Method selection**: pass real `workoutLocation` into `home-workout.service.ts:384`, `overview/page.tsx:34`, `workout-conversion.utils.ts`; fix the `warmup.service.ts:492` single-predicate `.find` into the two-step form used by `cooldown.service.ts`.

Sections 1 (table), 2 (gap), 3 (method map), 4 (DRY) above are the map. No fix applied yet — decide from here.
