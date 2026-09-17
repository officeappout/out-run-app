# 03 — Code Health Audit (whole codebase)

**Repo:** `~/Development/appout-1` · **Branch:** `main` @ `dea30f8b` (2026-09-07)
**Scope:** whole codebase — `src/` (1,720 TS/TSX files, 456,323 lines), `functions/src/` (35 files, 7,930 lines), `scripts/` (190 files), root configs, tests, git worktrees.
**Method:** read-only static analysis over the live working tree. Every number below was produced by a command run against this tree on 2026-09-07; no numbers are estimated. Method limits are stated inline where they matter.

---

## 0. What the existing docs claim vs. what is actually here

| Doc | Claim | Reality found |
|---|---|---|
| `SCALE-AND-ARCH-AUDIT.md` (2026-08-31, commit `34b5ac62`) | Scoped **only** to the route engine + admin panel. Excellent within scope. | Still accurate where it overlaps. Its counts have drifted slightly: it says *232 files ≥500 lines, 78 ≥1,000*; today it is **233 ≥500, 78 ≥1,000, 300 ≥400**. Its B-10 claim that `route.service.ts` is dead is **confirmed still true**. Its B-24 credit ("zero inline TODO/FIXME/HACK/XXX across 183 scoped files") **holds app-wide too** — see §3. **This file is itself untracked in git** (`?? SCALE-AND-ARCH-AUDIT.md`). |
| `ARCHITECTURE.md` | Describes a 5-store Zustand app with `MapboxService`, `LocationService`, `WorkoutEngine`, `FirestoreService`; "Vercel / PWA Ready"; "targeting React Native wrapper **or** Capacitor". | Materially stale. There is no `LocationService`/`FirestoreService` by those names; the real app has **25 feature domains**, ~12+ stores (`.cursorrules` lists 12), a 452-file workout engine, an arena/social/safecity/heatmap/partners layer, and 116 admin routes — none of which appear in the diagram. Capacitor is not "targeted", it is **shipped** (`capacitor.config.ts` with a live `server.url`). The doc describes roughly the app as of early 2026. |
| `PROJECT_STRUCTURE.md` | Lists root files `next.config.js`, `PRD.md`, `pRunMap.tsx`, `CRITICAL_FIXES_COMPLETE.md`, `DYNAMIC_GOALS_COMPLETE.md`, `MIGRATION_GHOSTS_FIXED.md`, `MIGRATION_WAVE_1_COMPLETE.md`, `UI_FINALIZATION_COMPLETE.md`, `WAVE_2/3/4_*_COMPLETE.md`. | **None of those 11 files exist.** The real config is `next.config.mjs`. The doc's `src/` tree is a snapshot of a much smaller app. Treat as historical. |
| `CLAUDE.md` | Law 7: "`src/features/{domain}/` is self-contained. **No cross-domain direct imports.**" | **Violated 1,009 times** (§2.4). This is the single largest gap between stated and actual architecture. |
| `CLAUDE.md` | "TypeScript strict; avoid `any`" | `tsconfig.json` **does** set `strict: true` — but `next.config.mjs` sets `typescript.ignoreBuildErrors: true`, so nothing enforces it, and `npx tsc --noEmit` **cannot complete** (§5.1). 1,862 `any` usages, 425 `eslint-disable` comments. |
| `CLAUDE.md` reference table | 10 referenced files (`SECURITY.md`, `.cursoragents/*_Truth.md`, `.claude/rules/axioms.md`, …) | **All 10 exist.** Credit — the agent-doc graph is intact. |
| `src/middleware.ts` doc comment | "When the app is built for TestFlight / production (**server.url commented out** in capacitor.config.ts)…" | **False today.** `capacitor.config.ts:14` has `url: 'https://outrun.co.il'` active, and `ios/App/App/capacitor.config.json:8` carries the same. This drift has a real consequence — see §5.6. |

**Bottom line on docs:** `SCALE-AND-ARCH-AUDIT.md` is the only trustworthy architecture document, and it deliberately covers ~10% of the codebase. `ARCHITECTURE.md` and `PROJECT_STRUCTURE.md` are actively misleading and should be marked historical or deleted.

---

## 1. Monster files

### 1.1 Size distribution (`src/`, 1,720 files, 456,323 lines)

| Bucket | Files | % of files |
|---|---:|---:|
| ≥ 1,000 lines | **78** | 4.5% |
| ≥ 500 lines | **233** | 13.5% |
| ≥ 400 lines | **300** | 17.4% |
| ≥ 300 lines | 416 | 24.2% |

**React files (`.tsx`) over 400 lines: 189. Over 1,000 lines: 47.** Both are flagged per the brief; 47 thousand-line React files is the headline number.

`functions/src` is comparatively healthy — largest file is 559 lines (`services/push.service.ts`), only 3 files over 500.

### 1.2 Top 40 by line count (`src/` + `functions/src`)

"Imported by a test?" = at least one `__tests__`/`*.test.ts` file imports this module (import-graph derived, see §3.1).

| # | Lines | File | Kind | Imported by a test? | Inbound imports |
|---|------:|------|------|:--:|--:|
| 1 | 3792 | `src/app/admin/workout-settings/page.tsx` | page | no | 0 |
| 2 | 3713 | `src/lib/data/israel-locations.ts` | data | no | 6 |
| 3 | 3623 | `src/features/parks/core/services/route-generator.service.ts` | module | YES | 14 |
| 4 | 3505 | `src/app/admin/users/all/page.tsx` | page | no | 0 |
| 5 | 3433 | `src/app/home/page.tsx` | page | no | 0 |
| 6 | 3343 | `src/app/admin/questionnaire/page.tsx` | page | no | 0 |
| 7 | 3187 | `src/features/user/onboarding/components/steps/UnifiedLocation/location-constants.ts` | data | no | 3 |
| 8 | 2794 | `src/app/admin/routes/page.tsx` | page | no | 0 |
| 9 | 2629 | `src/features/user/progression/services/progression.service.ts` | module | no | 6 |
| 10 | 2620 | `src/app/admin/locations/page.tsx` | page | no | 0 |
| 11 | 2602 | `src/features/workout-engine/services/home-workout.service.ts` | module | YES | 15 |
| 12 | 2297 | `src/features/parks/core/components/AppMap.tsx` | component | no | 4 |
| 13 | 2165 | `src/features/home/components/SettingsModal.tsx` | component | no | 1 |
| 14 | 2118 | `src/features/workout-engine/core/services/running-engine.service.ts` | module | YES | 15 |
| 15 | 2090 | `src/features/user/onboarding/services/onboarding-sync.service.ts` | module | YES | 10 |
| 16 | 2020 | `src/features/workout-engine/players/running/store/useRunningPlayer.ts` | module | no | 50 |
| 17 | 2009 | `src/app/map/layers/DiscoverLayer.tsx` | component | no | 2 |
| 18 | 1856 | `src/features/arena/components/GroupDetailsDrawer.tsx` | component | no | 4 |
| 19 | 1835 | `src/features/workout-engine/logic/WorkoutGenerator.ts` | module | YES | 61 |
| 20 | 1835 | `src/app/workouts/[id]/active/page.tsx` | page | no | 0 |
| 21 | 1817 | `src/features/admin/actions/importExcelAction.ts` **DEAD** | module | no | 0 |
| 22 | 1795 | `src/features/home/components/SmartWeeklySchedule.tsx` | component | no | 1 |
| 23 | 1746 | `src/features/parks/core/services/inventory.service.ts` | module | no | 15 |
| 24 | 1715 | `src/app/community/page.tsx` | page | no | 0 |
| 25 | 1706 | `src/features/admin/components/authority-manager/CommunityGroups.tsx` | component | no | 1 |
| 26 | 1705 | `src/features/user/onboarding/components/steps/UnifiedLocation/location-utils.ts` | module | YES | 11 |
| 27 | 1700 | `src/features/admin/services/park-import.service.ts` | module | no | 1 |
| 28 | 1687 | `src/app/admin/progression-manager/page.tsx` | page | no | 0 |
| 29 | 1584 | `src/features/admin/components/authorities/AuthorityDetailDrawer.tsx` | component | no | 1 |
| 30 | 1580 | `src/features/admin/components/MediaLibraryModal.tsx` | component | no | 4 |
| 31 | 1555 | `src/app/admin/visual-assessment/page.tsx` | page | no | 0 |
| 32 | 1513 | `src/features/home/components/StatsOverview.tsx` | component | no | 1 |
| 33 | 1495 | `src/config/feature-flags.ts` | module | no | 88 |
| 34 | 1493 | `src/app/admin/workout-simulator/page.tsx` | page | no | 0 |
| 35 | 1450 | `src/features/content/branding/core/branding.utils.ts` | module | no | 7 |
| 36 | 1438 | `src/app/admin/programs/page.tsx` | page | no | 0 |
| 37 | 1413 | `src/features/parks/core/components/FreeRunDrawer.tsx` | component | no | 1 |
| 38 | 1380 | `src/features/content/exercises/admin/components/exercise-editor/ExecutionMethodCard.tsx` | component | no | 2 |
| 39 | 1374 | `src/features/arena/components/CreateGroupWizard.tsx` | component | no | 2 |
| 40 | 1348 | `src/features/workout-engine/shared/utils/gear-mapping.utils.ts` | module | no | 47 |

*(No `functions/src` file reaches the top 40 — the largest is 559 lines.)*

### 1.3 The top 10, individually assessed

| # | File | What it is | Cohesive or dumping ground? |
|---|---|---|---|
| 1 | `src/app/admin/workout-settings/page.tsx` — 3,792 | Admin screen for workout-engine settings: MET tables, notifications, questionnaire quotes, drop-off analytics, CSV export/import. **47 `useState`, 18 direct Firestore write calls, one 3,400-line component body** (only top-level definition is `WorkoutSettingsPage` at line 323). | **Dumping ground.** Six unrelated admin concerns in one function. Highest single-file change risk in the repo. |
| 2 | `src/lib/data/israel-locations.ts` — 3,713 | Static array of Israeli cities/councils/neighborhoods with populations. Zero functions, zero imports. | **Cohesive** — it is a data table, not code. Should be a JSON asset (or Firestore), not a TS module in the JS bundle, but it is not "tangled". |
| 3 | `src/features/parks/core/services/route-generator.service.ts` — 3,623 | The live client-side route generator (loop/corridor/chain modes, Mapbox Directions, geohash scoring). | **Legitimately large, genuinely tested** (4 test files import it, incl. an 890-line calibration suite). Already covered by `SCALE-AND-ARCH-AUDIT.md` B.2. Split is worthwhile but low-urgency. |
| 4 | `src/app/admin/users/all/page.tsx` — 3,505 | User CRM: list, search, detail modal, workout history, steps trend, notification prefs, deletion, authority reassignment. 33 `useState`; a 2,774-line `UserDetailModal` before the page component even starts (line 103 → 2,877). | **Dumping ground.** The modal is a whole feature living inside a route file. |
| 5 | `src/app/home/page.tsx` — 3,433 | The consumer home dashboard. **92 import statements, 37 `useState`, 16 `useEffect`**, plus two inline sub-components. Owns onboarding redirects, JIT setup modals, arena banners, goal celebration, GPS, schedule. | **Dumping ground, and the highest-traffic one.** Every consumer session loads this. It is the app's single biggest change-risk surface. |
| 6 | `src/app/admin/questionnaire/page.tsx` — 3,343 | Onboarding-questionnaire editor. Unusually, it *does* decompose: 10 named sub-components (`QuestionCard`, `AnswerManager`, `FlowView`, 3 modals…). | **Borderline-cohesive.** One concern, honestly structured — it just never got split into files. Cheapest large file to fix (mechanical file-split, no logic change). |
| 7 | `.../UnifiedLocation/location-constants.ts` — 3,187 | Location/persona constant tables for the unified-location onboarding step. Contains **5 separate `6371` earth-radius constants** (§4.1). | **Mostly data, but polluted** — constants file that grew geo math. |
| 8 | `src/app/admin/routes/page.tsx` — 2,794 | Route inventory + moderation admin page. **64 `useState` in one file** — the highest in the repo. | **Dumping ground.** Already the physical home of `SCALE-AND-ARCH-AUDIT.md` findings B-2 (silent un-reject) and B-8 (own haversine copy). Size has a documented correctness cost here. |
| 9 | `src/features/user/progression/services/progression.service.ts` — 2,629 | XP/level/domain-progression service. 11 exports; **5 of them are never referenced outside the file** (`calculateSessionProgress`, `initializeProgressionTracks`, `buildEvolvedPrograms`, `getReadyForSplitStatus`, `dismissReadyForSplit`). **Zero tests.** | **Cohesive concern, but unaudited.** Progression is money/retention logic with no test coverage — see §6.3. |
| 10 | `src/app/admin/locations/page.tsx` — 2,620 | Parks/locations admin CRUD. 25 `useState`. | **Dumping ground**, same shape as #4 and #8. |

### 1.4 The pattern behind the monsters

Nine of the top ten are either an **admin route page** or a **consumer route page**. `src/app/admin` alone is **75,598 lines across 116 `page.tsx` routes**, and `src/features/admin` adds **44,971**. Total admin surface: **120,569 lines = 26% of `src/`**, versus **26,266 lines** for all non-admin, non-API app routes combined. The admin panel is 4.6× the consumer app by line count and lives in the same Next.js app that Capacitor ships to iOS/Android.

Component-level offenders worth naming (all >400 lines, all `.tsx`):
`SettingsModal.tsx` (2,165 — **40 `useState`**, 7 direct Firestore writes, imports from **8 foreign feature domains**), `AppMap.tsx` (2,297), `DiscoverLayer.tsx` (2,009), `GroupDetailsDrawer.tsx` (1,856), `SmartWeeklySchedule.tsx` (1,795), `admin/layout.tsx` (968 — a layout with a full RBAC state machine inside).

---

## 2. Folder architecture

### 2.1 What actually lives in each top-level `src/` directory

| Directory | Files | Lines | Reality |
|---|---:|---:|---|
| `src/features/` | 1,283 | 319,961 | The real codebase. 25 domains. |
| `src/app/` | 254 | 108,431 | 169 `page.tsx` (116 admin), 50 `api/route.ts` (33 admin). Several pages are 2,000–3,800 lines of logic, not thin routes. |
| `src/lib/` | 99 | 16,810 | Genuinely shared: `firebase.ts`, `firebase-admin.ts`, `auth.service.ts`, `api-auth.ts`, `route-collections/`, `route-decisions/`, `dem-tile-cache/`, `data/israel-locations.ts`. **This one earns its place.** |
| `src/components/` | 39 | 5,135 | Truly global UI (`BottomNavigation`, `ErrorBoundary`, `ui/*`) — but **6 of the 39 are dead** (`AuthModal`, `FeedbackFAB`, `CalculatingProfileScreen`, `KingLemurLoadingScreen`, +2). |
| `src/types/` | 16 | 1,864 | Global types. Competes with per-feature `types/` folders in 12 domains. |
| `src/config/` | 3 | 1,630 | `feature-flags.ts` is 1,495 of those lines for **16 flags** (10 hard-coded `true`, 3 hard-coded `false`, 0 env-driven) — the rest is prose. 69 exports, 8 never referenced elsewhere, including `ROOT_ADMIN_EMAILS` and `ADMIN_ALLOWED_EMAILS`. |
| `src/hooks/` | 11 | 854 | Real, used, small. Fine. |
| `src/utils/` | 5 | 383 | `render-helpers` (15 importers), `facility-icon` (4), `geoValidation` (3), `pathSimplify` (2), `video-utils` (2). Fine but arbitrary vs `src/lib/`. |
| `src/store/` | **1** | **46** | Contains only `useAppStore.ts` (i18n/direction). 9 importers. Every other store lives inside its feature. |
| `src/contexts/` | **1** | **53** | Only `LanguageContext.tsx`. 7 importers. |
| `src/constants/` | **1** | **64** | Only `terms-content.ts`. **1** importer. |
| `src/core/` | **2** | **165** | Only `constants/userLifestyles.ts` + a barrel. **3** importers. |
| `src/@core/` | **1** | **5** | Only `hooks/useCardPage.ts` — a **5-line** hook returning `` `/${type}/${id}` ``. **One** importer: `src/features/parks/client/components/park-item/index.tsx:7`. |
| `src/scripts/` | 3 | 671 | Stray. Duplicates the top-level `scripts/` (190 files). 2 of the 3 are unreachable. |
| `src/assets/`, `src/test_video/` | **0** | **0** | Empty directories. |

**Verdict on `@core` vs `core`:** these are not two competing architectures — they are **two abandoned attempts at one**, together holding **3 files and 170 lines** consumed by **4 call sites**. Same for `store/`, `contexts/`, `constants/`: each is a one-file directory. Six top-level directories hold 6 files and 333 lines between them. The boundary is **accidental, not real**.

### 2.2 Feature-folder shape: 25 domains, 25 shapes

`.cursorrules` states the convention is `src/features/{domain}/{admin|client|core}/{components|hooks|services|store|types}`. Actual sub-folder sets:

- `parks` → `admin client core` ✅ (the **only** conforming domain)
- `user` → `core identity onboarding places progression scheduling`
- `workout-engine` → `components core generator hooks hybrid logic players services shared summary utils`
- `content` → `branding equipment exercises programs shared`
- `admin` → `actions components config context hooks services utils`
- `home`, `activity`, `favorites`, `social`, `safecity` → flat `components hooks services store types`
- `navigation` → a single `BottomNavbar.tsx`; `notifications` → a single `services/`; `dev`, `challenge` → `components` only
- **`src/features/app/`** → 2 files total: `app/home/components/DailyPhrase.tsx` (**dead**) and `app/exercises/components/ExerciseDetailView.tsx` (1 importer). A vestigial third namespace colliding with `features/home` and `features/content/exercises`.

### 2.3 Where the same kind of code lives in two places

| Concern | Home A | Home B | Overlap |
|---|---|---|---|
| Gym-equipment editor form | `src/features/admin/components/GymEquipmentEditorForm.tsx` (396 ln, **dead**) | `src/features/content/equipment/gym/admin/GymEquipmentEditorForm.tsx` (821 ln, live) | **91% of unique lines shared** — a dead fork |
| Coin pill UI | `src/features/home/components/CoinPill.tsx` (74) | `src/features/user/progression/components/CoinPill.tsx` (72) | **61% shared** |
| Parks service | `src/features/admin/services/parks.service.ts` (234) | `src/features/parks/core/services/parks.service.ts` (396) | 22% — naming trap (already B-13) |
| Auth service | `src/lib/auth.service.ts` (944, client sign-in) | `src/features/admin/services/auth.service.ts` (235, role checks — *and* `calculateHealthROI`) | Same filename, different concerns; B also holds an unrelated health-economics function |
| GIS integration | `src/features/admin/services/gis-integration.service.ts` (51) | `src/features/parks/core/services/gis-integration.service.ts` (353) | 22% |
| Workout session hook | `src/features/workouts/.../hooks/useWorkoutSession.ts` (126) | `src/features/parks/core/hooks/useWorkoutSession.ts` (282) | Same exported name, 6% overlap — pure name collision |
| Exercise video player | `.../players/strength/components/ExerciseVideoPlayer.tsx` (563) | `.../content/exercises/client/components/ExerciseVideoPlayer.tsx` (500) | 10% — two real implementations of the same product feature |
| Partner card | `src/features/social/components/PartnerCard.tsx` (92) | `src/features/partners/components/PartnerCard.tsx` (455) | 23% |
| Protocol types | `.../workout-engine/core/types/protocol.types.ts` (106) | `.../workout-engine/logic/protocols/protocol.types.ts` (45) | Two type modules, same name, same domain |
| Persona alias map | `functions/src/services/persona-alias-map.service.ts` (128) | `src/features/user/onboarding/services/persona-alias-map.service.ts` (149) | **Deliberate hand-synced mirror**, documented on both sides. Honest, but 109 diff lines and a "keep in sync BY HAND" contract with no test asserting equality. |
| XP reversal | `src/lib/reverseWorkoutXP.ts` (55, callable wrapper) | `functions/src/reverseWorkoutXP.ts` (196, the function) | Correct split — **credit**, not duplication |

No two files in `src`/`scripts`/`functions/src` are byte-identical (checked by MD5 over all 1,945 files ≥200 bytes) — **credit**: there is no copy-paste-the-whole-file problem, only forked-then-drifted files.

### 2.4 Cross-domain coupling — CLAUDE.md Law 7 is not enforced

Import-graph derived: **1,009 direct `features/A` → `features/B` import edges.**

Heaviest flows: `workout-engine → content` (95), `home → user` (81), `workout-engine → parks` (81), `workout-engine → user` (68), `home → workout-engine` (66), `workouts → workout-engine` (52), `parks → workout-engine` (34).

**Confirmed bidirectional cycles between domains:** `workout-engine ↔ parks` (81/34), `workout-engine ↔ content` (95/10), `home ↔ workout-engine` (66/…), `workout-engine ↔ user` (68/13), `user ↔ parks` (24/11), `parks ↔ admin` (27/10). These are true module cycles at the domain level, which is why no domain can be extracted or lazily loaded independently.

Worst individual offenders (files importing from ≥5 foreign domains):
- `src/features/home/components/SettingsModal.tsx` → 8 domains (`analytics content legal notifications parks profile safecity user`)
- `src/features/home/components/AddWorkoutModal.tsx` → 7
- `src/features/home/components/StatsOverview.tsx` → 6
- `src/features/parks/client/components/route-preview/RouteDetailSheet.tsx` → 6
- `src/features/user/onboarding/services/onboarding-sync.service.ts` → 5
- `src/features/workout-engine/players/running/store/useRunningPlayer.ts` → 5

Also: **241 files import `firebase/firestore` directly**, of which **75 are `.tsx` components** and **48 are pages under `src/app/`** — i.e. the "services own Firestore" rule from `.cursorrules` is bypassed in ~31% of Firestore-touching files. `src/app/admin/workout-settings/page.tsx` alone makes 18 direct write calls.

### 2.5 `onboarding` vs `onboarding-dynamic` vs `onboarding-new` — resolved

| Route dir | Files | Last commit touching it | Inbound references | Status |
|---|---|---|---|---|
| `src/app/onboarding/` | 1 (`page.tsx`, **31 lines**) | 2026-08-13 `e806cb42 fix: kill leftover dead-ended pre-08.2026 onboarding chain` | `StatsWidgets.tsx:34` (itself dead), `BottomNavbar.tsx:29` (path prefix check) | **LIVE, intentional.** It is a redirect stub → `/gateway`, kept for stale bookmarks/QR links. Its own doc comment says so. Keep. |
| `src/app/onboarding-dynamic/` | 1 (`page.tsx`, **432 lines**) | **2026-02-12** `f774227f "final update"` | **ZERO** — no `router.push`, `Link`, or string reference anywhere in `src/` | **ABANDONED.** A 7-month-old fork of the live flow: **51% of its unique lines are shared** with `src/app/onboarding-new/dynamic/page.tsx` (730 lines). It is still a live, publicly routable URL that runs a stale `DynamicOnboardingEngine` path and a stale `syncOnboardingToFirestore` call. **Delete.** |
| `src/app/onboarding-new/` | 10 pages | 2026-09-04 | **~20 `router.push`/`replace` call sites** across `home/page.tsx`, `page.tsx`, `gateway`, `map/MapShell`, `profile`, `community`, `join`, plus `ClientLayout.tsx:36` nav-hiding | **LIVE — this is the real onboarding.** |

The `-new` suffix on the live flow while the unsuffixed `/onboarding` is a stub is itself a navigability trap, but renaming it now would break the ~20 call sites and any external links; not worth it pre-launch.

---

## 3. Dead / stale code

### 3.1 Method and its limits (read this before acting)

A static import graph was built over all 1,720 `src/` files by regexing `from '…'`, `import('…')`, `require('…')` and `import '…'`, resolving `@/*` (per `tsconfig.json` paths) and relative specifiers against real files, including `index.ts(x)` barrels. Only **19** relative/aliased specifiers failed to resolve across the whole tree, so coverage is high.

Reachability was then computed from a root set of: all Next.js App-Router special files under `src/app` (`page.tsx`, `layout.tsx`, `route.ts`, `error.tsx`, `loading.tsx`, `not-found.tsx`, `global-error.tsx`, `template.tsx`, `default.tsx`), `src/middleware.ts`, **every test file**, and **every `src/` file imported from `scripts/`, `functions/src/`, or `plugins/`** (43 such entry points). 421 roots total.

**What this can miss (why everything below is "likely dead — verify"):**
- Dynamic imports built from template strings or variables (`import(\`./steps/${id}\`)`).
- Components referenced only from non-TS sources (MDX, JSON config, Firestore-driven registries).
- Files reachable only through a barrel that re-exports with `export *` from a directory (these *were* resolved, but wildcard re-export chains can hide a symbol-level dependency).
- Anything referenced only by string name at runtime.

Spot-checks were run: a plain `grep` across `src/ scripts/ functions/src/` for `importExcelAction`, `LocationEditor`, `FeedbackFAB`, `AuthModal`, `CalculatingProfileScreen`, `KingLemurLoadingScreen`, `PostWorkoutSurvey` returned **zero references outside each file itself** — the graph result matches raw text search for every one checked.

### 3.2 Result

- **272 files** in `src/` have **zero inbound imports** and are not App-Router roots (38,491 lines).
- Narrowing to files **unreachable from any route, test, or script**: **136 files, 22,481 lines (4.9% of `src/`).**

By area (lines): `features/admin` 4,210 · `features/home` 4,075 · `features/workout-engine` 3,608 · `features/user` 3,487 · `features/parks` 1,833 · `features/safecity` 1,162 · `components` 1,103 · `content` 854 · `src/scripts` 671 · `profile` 553.

Top 40 by size:

| Lines | File |
|------:|------|
| 1817 | `src/features/admin/actions/importExcelAction.ts` |
| 833 | `src/features/admin/components/locations/LocationEditor.tsx` |
| 632 | `src/features/content/programs/admin/components/GlobalLevelsManager.tsx` |
| 533 | `src/features/parks/core/components/FreeRunRouteSelector.tsx` |
| 519 | `src/features/workout-engine/players/running/hooks/useDraggableMetrics.ts` |
| 515 | `src/features/home/components/carousel/DashedGoalCarousel.tsx` |
| 479 | `src/features/user/onboarding/services/recommendation.service.ts` |
| 461 | `src/features/user/onboarding/components/steps/SummaryStep.tsx` |
| 435 | `src/features/admin/components/authority-manager/ParksManagement.tsx` |
| 428 | `src/features/workout-engine/components/PostWorkoutSurvey.tsx` |
| 400 | `src/features/workout-engine/players/running/components/FreeRun/AdaptiveMetricsWrapper.tsx` |
| 398 | `src/features/safecity/hooks/useSocialLiveMap.ts` |
| 396 | `src/features/admin/components/GymEquipmentEditorForm.tsx` |
| 384 | `src/scripts/import-osm-segments.ts` |
| 377 | `src/components/ui/FeedbackFAB.tsx` |
| 373 | `src/features/user/onboarding/components/steps/HistoryStep.tsx` |
| 352 | `src/features/workout-engine/core/pipeline/ProtocolInjector.ts` |
| 318 | `src/features/home/components/widgets/RunProgressCircle.tsx` |
| 315 | `src/features/home/components/EquipmentEditorSheet.tsx` |
| 311 | `src/features/parks/core/components/ActivityCarousel.tsx` |
| 293 | `src/features/user/onboarding/components/SummaryReveal.tsx` |
| 281 | `src/features/user/onboarding/engine/QuestionnaireChainOrchestrator.ts` |
| 270 | `src/features/user/onboarding/components/LoadingAIBuilder.tsx` |
| 261 | `src/features/user/onboarding/components/visual-assessment/BlurredHowStep.tsx` |
| 244 | `src/components/AuthModal.tsx` |
| 234 | `src/features/parks/core/components/ActiveWorkoutOverlay.tsx` |
| 233 | `src/scripts/fix-authority-coordinates.ts` |
| 214 | `src/features/workout-engine/core/services/adaptive-rest.service.ts` |
| 210 | `src/features/home/components/RunDetailsDrawer.tsx` |
| 209 | `src/features/workout-engine/players/running/components/PlannedRun/PaceGauge.tsx` |
| 209 | `src/features/profile/components/widgets/ExerciseTrendChart.tsx` |
| 209 | `src/features/home/components/DaySummarySheet.tsx` |
| 198 | `src/features/parks/core/components/SavedPlacesQuickRow.tsx` |
| 196 | `src/components/CalculatingProfileScreen.tsx` |
| 195 | `src/features/home/components/UserHeaderPill.tsx` |
| 185 | `src/features/home/components/HeroCard.tsx` |
| 184 | `src/features/home/components/CalendarSheet.tsx` |
| 184 | `src/features/admin/services/group-session.service.ts` |
| 184 | `src/components/KingLemurLoadingScreen.tsx` |
| 180 | `src/features/workout-engine/players/running/components/FreeRun/FreeRunPaused.tsx` |

Total: 136 files, 22,481 lines.

Notable individual items:
- **`src/features/admin/actions/importExcelAction.ts` (1,817 lines)** — the 21st-largest file in the repo and completely unreferenced. Largest single dead artifact.
- **`src/features/admin/components/GymEquipmentEditorForm.tsx` (396)** — a dead 91%-identical fork of the live one (§2.3).
- **`src/app/onboarding-dynamic/page.tsx` (432)** — not in the 136 because App-Router pages are treated as roots, but it is dead by every other measure (§2.5).
- **`src/features/parks/core/components/FreeRunRouteSelector.tsx` (533)** and **`FreeRun/FreeRunPaused.tsx` (180)** are dead, while `FreeRunLayer.tsx`, `FreeRunView.tsx`, `FreeRunActive.tsx`, `FreeRunOverlay.tsx`, `FreeRunSummary.tsx`, `FreeRunDrawer.tsx` are live. This is exactly the "legacy duplicate with a misleading name" trap `CLAUDE.md`'s Verification-First Rule #1 warns about — and it is still present.
- **`src/components/AuthModal.tsx` (244)** is dead, and it is the *only* consumer of `linkGoogleAccount()` from `src/lib/auth.service.ts` — deleting the component makes that export dead too.
- 3 empty/near-empty directories: `src/assets/`, `src/test_video/` (0 files), and `~/Development/appout-1-worktrees/` (0 bytes).

### 3.3 Unused exports inside large live modules

| Module | Lines | Exports | Never referenced outside the file |
|---|---:|---:|---|
| `features/workout-engine/core/services/running-engine.service.ts` | 2,118 | 25 | **15 (60%)** — `round5`, `paceMapKeyForProfile`, `classifyPerformance`, `processSelfCorrection`, `recordQualityWorkout`, `computeWalkRunForWeek`, `applyProgressionToBlock`, `enforceVolumeCaps`, `enforceWeeklyProgressionCap`, `validateIntensityDistribution`, `computePredictedRacePace`, `PHASE_DEFAULT_POOLS`, + 3 result types |
| `features/workout-engine/shared/utils/gear-mapping.utils.ts` | 1,348 | 27 | 8 — incl. `printMappingAudit`, `reportEquipmentResolution` (debug tooling shipped in the bundle) |
| `features/user/onboarding/.../UnifiedLocation/location-utils.ts` | 1,705 | 28 | 8 |
| `features/admin/services/park-import.service.ts` | 1,700 | 18 | 8 |
| `src/config/feature-flags.ts` | 1,495 | 69 | 8 — incl. `IS_LEAGUES_ENABLED` (declared, never read anywhere), `ROOT_ADMIN_EMAILS`, `ADMIN_ALLOWED_EMAILS` |
| `features/user/progression/services/progression.service.ts` | 2,629 | 11 | 5 |
| `features/parks/core/services/route-generator.service.ts` | 3,623 | 25 | 5 (all diagnostics types) |

`running-engine.service.ts` is the standout: a 2,118-line module documented as "pure-function core of the generative running engine" whose public API is 60% unconsumed, with zero tests importing more than a fraction of it.

### 3.4 Debt markers — this codebase is unusually clean here

| Marker | Occurrences in `src` + `scripts` + `functions/src` |
|---|---:|
| `TODO` | 17 |
| `FIXME` | **0** |
| `HACK` | **0** |
| `XXX` | 5 (all false positives — CSV/placeholder strings) |
| `@deprecated` | 29 |
| `LEGACY` / `legacy` (word) | 27 / **647** |
| commented-out code lines (heuristic: `//` + code syntax) | **69 total** |

Combined real TODO/FIXME/HACK/XXX lines: **18**, across 1,945 files. `SCALE-AND-ARCH-AUDIT.md`'s B-24 credit **generalises to the whole codebase** — this is a genuine strength and worth saying out loud to any acquirer.

Worst TODO offenders: `features/workout-engine/services/warmup.service.ts` (3), `app/api/user/update-authority/route.ts` (2), then 1 each across 13 files.

Worst `@deprecated` offenders: `content/exercises/core/exercise.types.ts` (4), `.../strength/components/ExerciseDetailContent.tsx` (3), `workout-engine/logic/workout-generator.types.ts` (3), `players/running/hooks/useDraggableMetrics.ts` (2 — and the file is **dead**), `user/core/types/progression.types.ts` (2), `admin/services/authority.service.ts` (2), `activity/hooks/useDayStatus.ts` (2).

Worst commented-out-code offender: `features/home/components/SettingsModal.tsx` (**27 of the 69 lines**). Everything else is ≤3.

**The real debt marker in this codebase is the word "legacy", not TODO** — 647 occurrences. Worst files: `content/exercises/services/exercise-mapping.utils.ts` (19), `content/exercises/core/exercise.types.ts` (19), `types/onboarding-questionnaire.ts` (10), `workout-engine/core/services/running-migration.service.ts` (10), `content/exercises/client/components/ExerciseVideoPlayer.tsx` (10). The exercise-content model carries the most historical baggage.

### 3.5 Shipped debug noise

**1,283 `console.log` call sites** in `src/` (3,094 including `warn`/`error`/`debug`), all shipped to production — `next.config.mjs` has no `removeConsole` compiler option. Worst: `workout-engine/services/home-workout.service.ts` (43), `parks/core/services/route-generator.service.ts` (43), `workout-engine/logic/WorkoutGenerator.ts` (35), `services/split-decision/SplitDecisionService.ts` (32), `user/onboarding/services/onboarding-sync.service.ts` (31), `user/progression/services/progression.service.ts` (30).

---

## 4. Duplication

### 4.1 Haversine / distance math — 36 independent copies

`grep` for the earth-radius constant `6371`/`6378` across `src` + `scripts`: **36 distinct files** contain their own copy; 28 files independently contain the full `Math.atan2(Math.sqrt(...))` haversine body.

A canonical implementation exists and is correct: `src/features/parks/core/services/geoUtils.ts` (853 lines, 24 exports, **502-line test suite**). It is bypassed by, among others:

`src/app/admin/routes/page.tsx`, `src/app/api/admin/routes/dem-recompute/route.ts`, `src/features/admin/components/routes/RouteEditor.tsx`, `src/features/admin/services/park-import.service.ts`, `src/features/admin/services/osm-segment-importer.ts`, `src/features/arena/utils/distance.ts`, `src/features/arena/components/CreateGroupWizard.tsx`, `src/features/arena/components/GroupDetailsDrawer.tsx`, `src/features/arena/components/SessionDrawer.tsx`, `src/features/parks/core/hooks/useGPS.ts`, `useRouteFilter.ts`, `useSearchNavigation.ts`, `useWorkoutSession.ts`, `src/features/parks/core/services/contribution.service.ts`, `generator-elevation.service.ts`, `inventory.service.ts`, `route-generator.service.ts`, `route-stitching.service.ts`, `official-route-broadcaster.ts`, `src/features/safecity/hooks/usePresenceLayer.ts`, `useSocialLiveMap.ts`, `src/features/user/onboarding/.../location-constants.ts` (**5 copies in one file**), `location-utils.ts`, `src/features/workout-engine/players/running/components/Commute/useCommuteEta.ts`, `src/features/workout-engine/services/first-workout.service.ts`, `src/lib/dem-tile-cache/dem-sampling.service.ts`, `src/lib/route-collections/authority-resolution.ts`, `src/lib/services/location.service.ts`, plus 12 `scripts/*`.

`src/features/arena/utils/distance.ts` and `geoUtils.ts` both export a function literally named **`haversineKm`** — two public functions, same name, same semantics, different files.

This is `SCALE-AND-ARCH-AUDIT.md` B-8 (which counted 9 within the route-engine domain), extended to the whole app: the real number is **36**.

### 4.2 Calorie calculation — 6 implementations, 3 incompatible models

| # | Location | Formula |
|---|---|---|
| 1 | `workout-engine/summary/format.ts:42` `metCalories()` — doc-commented **"the single source of truth"** | `MET × kg × 3.5 / 200 × minutes` |
| 2 | `workout-engine/components/strength/utils/summary.utils.ts:81` `calculateCalories()` | `MET × 0.0175 × kg × minutes` — **numerically identical to #1** (3.5/200 = 0.0175), independently written |
| 3 | `workout-engine/logic/workout-budgeting.utils.ts:1296` | `met * 0.0175 * weight * duration`, then `Math.max(BASE_WORKOUT_CALORIES, …)` — **a third copy of the same formula** with a floor |
| 4 | `workout-engine/hybrid/compose-hybrid-session.service.ts:541` `strengthBlockCalories()` | `(MET × 3.5 × kg) / 200` per minute — **a fourth copy**, with its own work/rest split and `TIER_MET` table |
| 5 | `workout-engine/players/running/store/useRunningPlayer.ts:1308` | `distanceKm × kg × 1.036` — **a different model entirely** (distance-based, not MET-based) |
| 6 | `features/home/hooks/useSmartSchedule.ts:181` `calculateWorkoutRewards()` | hard-coded kcal/min table `{strength:8, cardio:10, recovery:5, flexibility:3}` × difficulty multiplier — **a fifth, unrelated model** |

`format.ts` calls itself the single source of truth while four other files compute calories independently. `useRunningPlayer.ts:1302-1307` carries an explicit comment saying its `1.036` constant is *deliberately* not shared ("the same 'mirror' pattern … already use for their own copies") — a documented decision to duplicate. Coins are then derived 1:1 from calories in at least two of these, so the divergence propagates into the reward economy.

### 4.3 Date / duration / pace formatting — 77 local definitions

| Function name | Distinct files defining it |
|---|---:|
| `formatTime` | **21** |
| `formatDate` | **19** |
| `formatDuration` | **17** |
| `formatPace` | **12** |
| `formatDistance` | **7** |
| **Total definitions** | **77** |

A canonical `formatPace` exists at `src/features/workout-engine/core/utils/formatPace.ts` and is bypassed 11 times. `formatDuration` exists in both `workout-engine/summary/format.ts` and `workout-engine/components/strength/utils/summary.utils.ts` (both exported, same name, same domain). `formatDistance` exists in both `features/admin/components/approval/approval-labels.ts` and `user/onboarding/.../location-utils.ts`.

Separately: 63 raw `toLocaleDateString(...)` call sites across 42 files, each with its own locale/options, and `todayKey`/`dateKey`/`getTodayKey` re-derived in ≥5 hooks (`useLiveDailyActivity.ts:64`, `useStepsAnalytics.ts:81`, `useGoalCelebration.ts:11`, `admin/authorities/page.tsx:194`, `api/admin/crm-agent/run/route.ts:703`).

**`date-fns@^4.1.0` is a declared production dependency with ZERO imports anywhere in the codebase.**

### 4.4 Firestore access patterns

- `collection(db, 'users')` appears **34** times, `'workouts'` 26, `'official_routes'` 24, `'community_groups'` 19, `'presence'` 13, `'feed_posts'` 13, `'authorities'` 12 — collection names are string literals repeated at every call site, not centralised constants. A rename is a 34-site edit with no compiler help.
- `doc(db, 'users', …)` appears **99 times across 55 files** — the single most-repeated data-access idiom. Worst: `SettingsModal.tsx` (7), `admin/users/all/page.tsx` (7), `lib/firestore.service.ts` (5), `onboarding/services/migration.service.ts` (4), `notifications/services/notification-prefs.service.ts` (4).
- **`functions/src`: 27 of 30 top-level files each call `admin.initializeApp()` themselves**, and the guard is spelled two different ways — `if (!admin.apps.length) { admin.initializeApp(); }` in `leaderboard.ts:30` versus a bare multi-line form in the other 26. There is no shared `functions/src/lib/admin.ts`.

### 4.5 Competing implementations of one concern

- **Auth: 6 modules.** `src/lib/auth.service.ts` (944 ln, client sign-in/link) · `src/lib/api-auth.ts` (223, server admin guards) · `src/lib/native-auth-validation.ts` (81) · `src/lib/capacitorAuthPersistence.ts` (212) · `src/features/admin/services/auth.service.ts` (235, role checks — **plus an unrelated `calculateHealthROI()`**) · `src/features/admin/services/passwordless-auth.service.ts` (281). The split is mostly defensible, but the two files named `auth.service.ts` are a real trap, and `lib/auth.service.ts` exports near-duplicate pairs: `signInWithGoogle` / `signInWithGoogleDirect`, `linkGoogleAccount` / `linkWithGoogleAccount` (the former only used by the **dead** `AuthModal.tsx`).
- **Map rendering: one real stack, three declared.** `react-map-gl` (12 files) + `mapbox-gl` (6 files) are live. **`leaflet`, `react-leaflet`, `@react-google-maps/api`, and `@mapbox/mapbox-sdk` are production dependencies with ZERO imports** (§5.4). Live map surfaces are legitimately separate components — `AppMap.tsx` (2,297), `LiveHeatMap.tsx`, `BoundaryConfirmMap.tsx`, `ApprovalPreviewMap.tsx`, `AmenitiesQueueMap.tsx`, `LocationPicker.tsx`, `MiniLocationPicker.tsx`, `MapboxMapWrapper.tsx`, `RunMapBlock.tsx` — but they share no map-init abstraction; each re-does token/style/camera setup.
- **Mapbox Directions: 6 hand-rolled clients** despite a shared `mapbox.service.ts` — already documented as `SCALE-AND-ARCH-AUDIT.md` B-7; **re-confirmed unchanged**.

---

## 5. Config drift

### 5.1 🚨 The build ignores all type and lint errors

`next.config.mjs` lines 3-8:
```js
eslint:      { ignoreDuringBuilds: true },
typescript:  { ignoreBuildErrors: true },
```
Meanwhile `tsconfig.json` sets `"strict": true` and `CLAUDE.md` promises "TypeScript strict". **Both are decorative.** Nothing in the pipeline type-checks or lints:
- No `.github/workflows` — **no CI of any kind** (confirms `SCALE-AND-ARCH-AUDIT.md` B-20 at the whole-repo level).
- `npm run build` → `next build`, which skips both checks.
- `main` auto-deploys to Vercel on merge.

**Worse: the codebase can no longer be type-checked with default settings.** `npx tsc --noEmit` **crashes**:
```
FATAL ERROR: Ineffective mark-compacts near heap limit
JavaScript heap out of memory   (~1,951 MB / 1,988 MB, after ~21s)
```
With `NODE_OPTIONS=--max-old-space-size=8192` it does not OOM but did **not finish within a 42-second budget**, so the actual error count is unknown. Note the working tree already carries a 1.3 MB `tsconfig.tsbuildinfo`, i.e. this is not a cold-cache artifact.

Counter-evidence and credit: **`functions/` type-checks clean** — `cd functions && npx tsc --noEmit` completes with zero errors in under 40s.

Supporting signals in `src/`: **1,862** `any` annotations, **425** `eslint-disable` comments, **0** `@ts-ignore`/`@ts-nocheck` (credit — nobody is silencing individual errors, because nothing reports them).

### 5.2 🚨 Dependency drift between the app and Cloud Functions — two major versions apart

| Package | root `package.json` | `functions/package.json` | Gap |
|---|---|---|---|
| `firebase-admin` | `^13.7.0` | `^12.0.0` | **1 major** |
| `firebase-functions` | `^7.2.3` | `^5.0.0` | **2 majors** |
| `axios` | `^1.13.2` | `^1.15.2` | functions is **ahead** of the app |
| `geofire-common` | `^6.0.0` | `^6.0.0` | ✅ aligned |
| `typescript` | `^5` | `^5.4.0` | ok |

Both projects write to the same Firestore. The Next.js server layer (`src/lib/firebase-admin.ts`, 33 API routes) runs Admin SDK **v13**; the deployed Cloud Functions run **v12** — different `FieldValue`/`Timestamp`/`BulkWriter` semantics on the same collections. `firebase-functions` v5 → v7 spans two breaking releases of the trigger API. Node engines are consistent (`firebase.json` `runtime: nodejs20`, `functions/package.json` `engines.node: "20"`) — credit.

### 5.3 `patch-package` runs on every install with nothing to patch

`package.json` declares `"postinstall": "patch-package"` and `patch-package@^8.0.1` in devDependencies, but **there is no `patches/` directory**. So: zero patches exist (the brief asked for the list and rationale — the answer is *none*), and every `npm install` runs a no-op tool. Either the patches were deleted without removing the hook, or the hook was added speculatively. `.npmrc` also sets `legacy-peer-deps=true`, which silences peer-dependency conflicts across the 84 production dependencies rather than resolving them.

### 5.4 Dead production dependencies

Declared in `dependencies` (shipped to install, some bundled) with **zero import sites** anywhere in `src`, `scripts`, or `functions/src`:

`leaflet@^1.9.4`, `react-leaflet@^4.2.1`, `@react-google-maps/api@^2.20.8`, `@mapbox/mapbox-sdk@^0.16.2`, `mammoth@^1.12.0`, `unpdf@^1.6.2`, `hls.js@^1.6.16`, `tsparticles@^3.9.1`, `date-fns@^4.1.0`.

That is **three unused mapping libraries** plus two document-parsing libraries and a video-streaming library. Corresponding dead `@types/*` in devDependencies: `@types/leaflet`, `@types/mapbox__mapbox-sdk`. (Method note: detected by import-specifier grep; a package used only via a dynamic string or a CSS side-effect import would be missed — verify each before removing.)

### 5.5 npm scripts

All script targets **exist** — `scripts/gen-equipment-icon-manifest.mjs`, `scripts/upload-local-media.ts`, `scripts/snapshot-workout-corpus.ts`, `scripts/preflight-native-check.mjs`, `tests/invariants/{preflight.mjs,runner.ts,tsconfig.json}` all resolve. **Credit — no broken script targets.** Same for `firebase.json`: `firestore.rules`, `firestore.indexes.json`, `storage.rules` and `functions/` all exist.

The gap is not broken scripts but **missing ones**: there is no `typecheck` script, and neither `lint` nor `test` runs automatically anywhere.

### 5.6 Capacitor ↔ middleware ↔ deployment drift

- `capacitor.config.ts:14` sets `server.url = 'https://outrun.co.il'` (mirrored into `ios/App/App/capacitor.config.json:8`). The native shell is a thin wrapper around the live website; `webDir: 'capacitor-shell'` is only an offline fallback. Consequence: **every App Store / TestFlight build depends on the live site being up and correct at runtime**, and a bad Vercel deploy is an instant mobile outage with no rollback via the stores.
- `src/middleware.ts` (lines 20-32) is written on the assumption that "server.url [is] commented out in capacitor.config.ts" for production. **It is not.** That comment is stale.
- More consequential: the middleware's server-side admin gate is `shouldGateAdmin = pathname.startsWith('/admin') && !isAdminPublic(pathname) && isAdminDomain`, where `isAdminDomain` is **only** `admin.outrun.co.il` / `admin.outrun.local`. On `outrun.co.il` — the exact origin the mobile app loads — **the Edge gate does not run at all**, and `/admin/*` falls back to the client-side guard in `src/app/admin/layout.tsx`. That guard does exist and covers all admin routes (it redirects on `onAuthStateChanged` + `checkUserRole`), and Firestore Rules remain the real data gate, but the layered defence the middleware documents is one domain short of what its own comment claims. Only **45 of 116** admin `page.tsx` files carry any auth check of their own.
- `capacitor.config.ts:26` sets `ios.webContentsDebuggingEnabled: true` with a self-documented note: *"TestFlight-only distribution to internal testers right now, so enabling it is safe; **revisit before any public App Store release**."* → this is a live pre-launch checklist item.
- `src/app/api/admin/photo-release/[submissionId]/route.ts` is the **only 1 of 33** `api/admin` routes with no `requireAdminApi`/`requireSuperAdminApi`/`requireSection`/`requireRouteEditAccess` guard and no `AGENT_API_KEY`/`ADMIN_SECRET` check. Worth a look; it may be intentional (parent-facing public form), in which case it is misfiled under `/api/admin`.

### 5.7 Two rules files, one repo

`.cursorrules` (74 lines) and `CLAUDE.md` (111 lines) both define architecture law. They do not contradict each other outright, but they partition differently: `.cursorrules` defines the `{admin|client|core}` feature shape and the Z-Index budget; `CLAUDE.md` defines the 7 agent laws and the Firestore rules table. `.cursorrules` also states "**No new React Contexts**" while `src/features/parks/core/context/MapModeContext.tsx` and `src/contexts/LanguageContext.tsx` exist (both are grandfathered and named in the file — consistent). Low severity, but a single source would remove the ambiguity about which file wins.

### 5.8 Repository hygiene

`git status` on `main`: **65 dirty entries**, of which **49 are untracked `scripts/*.ts` files** (`_audit-*`, `_investigate-*`, `probe-*`, `bulk-upload-*`, `import-*`…), plus 5 untracked PNG screenshots at repo root (`step1-initial-load.png`, `qr-button-repro-screenshot.png`, …), 4 untracked CSVs, and **`SCALE-AND-ARCH-AUDIT.md` itself**. The repo root also carries 9 loose `.md` files and 5 loose `.csv`/`.txt` data dumps (`exercise-inventory.csv` 115 KB, `media-migration-audit.csv` 152 KB, `firestore_exercises.txt` 34 KB).

---

## 6. Testing reality

### 6.1 What exists

- **153 test files**, all `*.test.ts` (no `.tsx`), essentially all under `src/**/__tests__/`.
- `vitest.config.ts`: `include: ['src/**/__tests__/**/*.test.ts']`, `environment: 'node'`, alias `@ → src`. Its own comment: *"Unit tests only (pure logic…). No jsdom/component testing yet."*
- `tests/invariants/` — a real, separate hermetic workout-validity harness with frozen JSON fixtures (`exercises.json`, `programs.json`, `gym_equipment.json`, `program_level_settings.json`) and service mocks. Run via `npm run test:invariants`.
- `tests/firestore-rules.test.ts` — a Firestore Security Rules test using `@firebase/rules-unit-testing`.
- `tests/safety-check/` — 4 fixture files for the pre-commit collection-write tripwire.

### 6.2 What is actually covered

Coverage is concentrated, not spread. By area:
- **`workout-engine`: ~60 test files** — pipeline gates, protocol blocks, generators, budgeting, tabata/compute advance, hybrid composition. Genuinely deep on pure logic.
- **`parks/core/services`: 14 test files** including the 890-line `route-generator.calibration.test.ts` and 502-line `geoUtils.test.ts`.
- **`arena`: 8** · **`home` utils: 7** · **`user/onboarding`: 9** · **`lib/`: 15** (mostly running-schedule date logic) · **`schedule`: 4**.
- Effectively zero: `admin` (4 files, none touching the admin UI), `social`, `safecity`, `partners`, `heatmap`, `messages`, `favorites`, `activity` (1 smoke test), `profile` (2), `content` (1), **`functions/src` (0 test files at all)**.

### 6.3 Two structural gaps that matter more than the count

**(a) `npm test` does not run two of the three test suites.** `vitest.config.ts`'s `include` glob is `src/**/__tests__/**/*.test.ts`, so **`tests/firestore-rules.test.ts` is never executed by `npm test`** — the only automated check on a **97,302-line `firestore.rules`** file, and it is outside the default run. `tests/invariants/` is likewise a separate manual command.

**(b) Nothing runs any of it automatically.** No `.github/workflows`, no pre-commit test hook, and `main` auto-deploys to Vercel on merge. The entire suite is opt-in muscle memory.

### 6.4 Riskiest untested area

**`src/features/user/progression/` — the XP / level / coin economy.**

- `progression.service.ts` is **2,629 lines** with **zero tests** and no test file imports it.
- `src/features/user/progression/services/xp.service.ts`, `coin-calculator.service.ts`, and `store/useProgressionStore.ts` also have no tests.
- The write path spans **client and server with independent implementations**: `functions/src/awardWorkoutXP.ts`, `functions/src/reverseWorkoutXP.ts`, `functions/src/services/progression.service.ts`, `functions/src/services/passive-xp.ts` — and **`functions/src` has no tests whatsoever**.
- The inputs to that economy are the **6 divergent calorie formulas** of §4.2, with coins derived 1:1 from calories in at least two of them.
- `CLAUDE.md` itself flags the live hazard: *"אל תחווט XP אמיתי ל-hybrid עד ש-single-save נסגר (Phase 2) — אחרת double-count"* ("don't wire real XP into hybrid until single-save is closed, or you double-count"). A known double-count risk, in the largest untested service in the repo, with no regression guard.

Runner-up: `src/features/parks/core/services/inventory.service.ts` (1,746 lines, 26 Firestore write sites, zero tests) — already documented as `SCALE-AND-ARCH-AUDIT.md` B-18 and unchanged.

---

## 7. Worktrees

**Registered worktrees: 57. Local branches: 156 (72 not merged into `main`).**

### 7.1 The nine siblings under `~/Development`

Uncommitted state was checked with `git --git-dir=<main>/.git/worktrees/<name> --work-tree=<dir> status --porcelain` (the worktrees' own `.git` pointer files reference macOS paths that do not resolve from this session's mount, so `git -C <dir>` alone reports nothing — that is a mount artifact, **not** evidence of breakage, and `git worktree list`'s "prunable" flag is unreliable here for the same reason).

| Directory | Branch | Last commit | Ahead of `main` | Behind `main` | Uncommitted | Size (excl. node_modules) |
|---|---|---|---:|---:|---|---:|
| `appout-1-sim-preview` | `feat/workout-simulator-real-preview` | **2026-09-07** | 1 | **2** | 1 untracked (`scripts/scenario-sweep.ts`) | 97 MB |
| `appout-1-leagues-stage-d` | `feat/leagues-stage-d` | 2026-08-18 | 2 | 435 | clean | 88 MB |
| `appout-routes` | `fix/loop-orientation-chaining-v2` | 2026-08-18 | 2 | 426 | clean | 89 MB |
| `appout-1-hybrid` | `feat/hybrid-engine` | 2026-08-12 (`WIP: preserve uncommitted work (safety commit, pre-cleanup)`) | 2 | 1,242 | clean | 82 MB |
| `appout-1-panel` | `perf/android-memory-safetynet` | 2026-08-12 (same WIP message) | 2 | 992 | clean | 86 MB |
| `appout-1-protocols` | `fix/tabata-content-bugs` | 2026-08-12 (same WIP message) | 1 | 887 | clean | 86 MB |
| `appout-1-healthbridge` | `feat/profile-program-drawer-edit` | 2026-08-10 | **26** | 772 | clean | 109 MB |
| `appout-1-station-home-grass` | `fix/hybrid-unassessed-domain-gate-06-08` | 2026-08-07 | 3 | 821 | clean | 86 MB |
| `appout-1-live-video` | `fix/live-video-playback` | **2026-07-17** | 3 | 1,176 | clean | 85 MB |

**No uncommitted work would be lost** in any of the nine except one untracked script in `appout-1-sim-preview`. The three `WIP: preserve uncommitted work (safety commit, pre-cleanup)` commits show a prior cleanup pass already rescued in-flight work into commits — good hygiene, and it means these are safe to remove.

`appout-1-sim-preview` is **actively in use today** (branch tip 2026-09-07, only 2 behind `main`) — do **not** prune it.

`appout-1-healthbridge` is **26 commits ahead of `main`** on `feat/profile-program-drawer-edit`, including `feat(health-bridge): passive distance sync — web/functions ingest + steps-screen card`. That work is committed (safe) but unmerged and 772 commits stale — merging it will be a real conflict exercise, not a fast-forward. Decide "merge or abandon" explicitly rather than letting it rot.

### 7.2 Two orphans

- **`~/Development/appout-1-consolidation`** — has a `.git` file pointing at `…/appout-1/.git/worktrees/appout-1-consolidation`, but **no such registration exists** in the main repo. It is an **orphaned worktree**: git cannot see it, `git worktree prune` will not clean it, and its state cannot be diffed against any branch. 79 MB, newest file **2026-07-15** (`src/features/parks/core/components/RouteCardUnified.tsx`). It also contains a `temp-data/` folder with exercise spreadsheets not present in `main`. **Manually diff before deleting** — this is the one place where work could genuinely be lost, precisely because git no longer tracks it.
- **`~/Development/appout-1-worktrees`** — an **empty directory** (0 bytes, 0 entries). Pure leftover.

### 7.3 The bigger number

**48 of the 57 registered worktrees live under `appout-1/.claude/worktrees/`** (50 directories on disk), one per agent task: `agent-a7a6af6eb83f51860`, `audit-city-coverage`, `city-mapping-stage-c1`, `feat+route-discovery`, … The oldest branch tips are **2026-07-11**. These are agent-session scratch worktrees that were never pruned. They inflate `.git`, slow every `git worktree`/`git branch` operation, and are the main reason the branch count is 156.

---

## 8. Ranked remediation

Effort: **S** ≤ half a day · **M** 1–3 days · **L** ≥ 1 week.
"Safe before launch" means: no behavioural change to shipped consumer code paths, or a change whose blast radius is provably contained.

### Do BEFORE launch

| # | Action | Evidence | Effort | Why now |
|---|---|---|---|---|
| **1** | **Add a `typecheck` script and make it pass.** Add `"typecheck": "tsc --noEmit"` with `NODE_OPTIONS=--max-old-space-size=8192`, run it, fix what it finds, then flip `next.config.mjs` `typescript.ignoreBuildErrors` to `false`. | §5.1 — `tsc` OOMs at 2 GB; `ignoreBuildErrors: true` + `strict: true` | **M–L** (unknown error count; the typecheck must be run once to size it) | This is the single highest-leverage item. You are shipping to the App Store with **zero** compile-time verification. Do the *measurement* (run it once) this week even if the fixes slip. |
| **2** | **Align `functions/package.json` to `firebase-admin@13` / `firebase-functions@7`,** or pin the root back to 12/5 — but pick one. Redeploy functions and smoke-test XP award/reversal and push. | §5.2 | **S–M** | Two majors of drift on the SDK writing your XP/progression data, on the eve of a launch that will multiply write volume. |
| **3** | **Make `npm test` run everything.** Widen `vitest.config.ts` `include` to cover `tests/**` (or add `"test:all": "vitest run && npm run test:invariants"`), so `tests/firestore-rules.test.ts` actually executes against your 97 KB `firestore.rules`. | §6.3(a) | **S** | Zero risk, and it turns an existing-but-dormant safety net back on. |
| **4** | **Add minimal CI** — one GitHub Action on push to `main`: `npm ci && npm run lint && npm test`. Do not gate the deploy yet; just make failures visible. | §5.1, §6.3(b) | **S** | `main` auto-deploys to production. Right now a broken merge reaches users before a human notices. |
| **5** | **Delete `src/app/onboarding-dynamic/`.** Zero inbound references; 7-month-old 51%-identical fork of the live flow; currently a publicly routable URL running stale onboarding + Firestore-sync code. | §2.5 | **S** | A live URL that can write stale onboarding data. Highest-value single deletion. |
| **6** | **Fix `capacitor.config.ts:26` — `ios.webContentsDebuggingEnabled: true`.** Set to `false` (or `#if DEBUG`-gate it) before the first public App Store submission. | §5.6 — the config's own comment says "revisit before any public App Store release" | **S** | Named pre-launch item, written by the team, still open. |
| **7** | **Decide the `/admin` domain story.** Either (a) serve admin only from `admin.outrun.co.il` so the middleware Edge gate actually runs, or (b) extend `shouldGateAdmin` to cover `outrun.co.il`. Also fix the stale "server.url commented out" comment in `src/middleware.ts`. | §5.6 | **S** (config/one-line) to **M** (if a domain split is chosen) | The mobile app loads `outrun.co.il`; on that host the documented Edge gate is inactive and only the client-side layout guard applies. |
| **8** | **Audit and remove the 9 unused production dependencies** (`leaflet`, `react-leaflet`, `@react-google-maps/api`, `@mapbox/mapbox-sdk`, `mammoth`, `unpdf`, `hls.js`, `tsparticles`, `date-fns`) + 2 dead `@types`. Verify each with a grep for dynamic/CSS imports first. | §5.4 | **S** | Smaller install, smaller attack surface, fewer transitive CVEs to answer for at launch. Three unused map libraries is also the kind of thing a technical reviewer notices immediately. |
| **9** | **Remove the no-op `patch-package` postinstall** (no `patches/` directory exists) or restore the missing patches. | §5.3 | **S** | 30 seconds. Removes a lie from the build. |
| **10** | **Delete the 5 root PNGs, commit or delete the 49 untracked `scripts/*.ts`, and commit `SCALE-AND-ARCH-AUDIT.md`.** | §5.8 | **S** | Your only good architecture doc is currently untracked and one `git clean` from gone. |
| **11** | **Prune worktrees: `git worktree prune`, then remove the 48 `.claude/worktrees/*` and the 8 stale siblings** (all except `appout-1-sim-preview`). Manually diff `appout-1-consolidation` first — it is orphaned and git-invisible. Delete the empty `appout-1-worktrees/`. Decide merge-or-abandon on `appout-1-healthbridge` (26 unmerged commits). | §7 | **S** (mechanical) + **M** (the healthbridge decision) | ~700 MB reclaimed, 156 branches → manageable, and every future `git` operation gets faster. Verified: no uncommitted work is at risk except in `-consolidation` and one untracked file in `-sim-preview`. |
| **12** | **Delete the 136 unreachable files (22,481 lines) in two passes.** Pass 1 (safe, ~8k lines): the 25 files with zero raw-grep references anywhere — start with `importExcelAction.ts` (1,817), `GymEquipmentEditorForm.tsx` (396, dead fork), `FreeRunRouteSelector.tsx` (533), `FreeRunPaused.tsx` (180), `AuthModal.tsx` (244), `FeedbackFAB.tsx` (377), `CalculatingProfileScreen.tsx` (196), `KingLemurLoadingScreen.tsx` (184). Pass 2: the rest, one domain at a time, verifying each. | §3.2 | **S** for pass 1, **M** for pass 2 | Pass 1 is low-risk and removes the misleadingly-named legacy twins that `CLAUDE.md`'s own Rule #1 identifies as "a time bomb". Do pass 2 after launch. |

### Do AFTER launch

| # | Action | Evidence | Effort |
|---|---|---|---|
| **13** | **Unify the calorie/coin economy behind one module.** Pick `workout-engine/summary/format.ts` (it already claims to be the source of truth), delete the 3 duplicate MET copies, and make an explicit, documented decision about the two *different models* (`useRunningPlayer`'s distance×1.036 and `useSmartSchedule`'s kcal/min table). Add tests. | §4.2 | **M** |
| **14** | **Add tests to the progression/XP economy** — `progression.service.ts` (2,629 ln), `xp.service.ts`, `coin-calculator.service.ts`, and the `functions/src` award/reverse pair. Start with the documented double-count hazard. | §6.4 | **M–L** |
| **15** | **Collapse the 77 `format*` definitions** into `src/lib/format/` (`formatTime`, `formatDuration`, `formatPace`, `formatDate`, `formatDistance`) and codemod the call sites. Either adopt the already-installed `date-fns` or drop it. | §4.3 | **M** |
| **16** | **Consolidate haversine onto `geoUtils.ts`.** 36 files, but `geoUtils` already has a 502-line test suite, so the target is proven. Do it in waves: `arena` (4 files) → `safecity` (2) → `workout-engine` (2) → `admin` (4) → `parks` (10) → `scripts` (12). Delete `arena/utils/distance.ts`'s duplicate `haversineKm`. | §4.1 | **M** |
| **17** | **Split the top 5 admin god-pages.** `admin/workout-settings/page.tsx` (3,792, 47 useState), `admin/users/all/page.tsx` (3,505 — extract the 2,774-line `UserDetailModal`), `admin/routes/page.tsx` (2,794, 64 useState), `admin/questionnaire/page.tsx` (3,343 — already has 10 named sub-components, this is a **mechanical file split, do it first**), `admin/locations/page.tsx` (2,620). | §1.3 | **L** (but `questionnaire` alone is **S**) |
| **18** | **Split `src/app/home/page.tsx` (3,433, 92 imports, 37 useState).** Highest-traffic file in the consumer app; every future home change carries its full blast radius. Do it *after* launch precisely because it is the riskiest refactor in the repo. | §1.3 | **L** |
| **19** | **Retire the vestigial directories.** Move `src/@core/hooks/useCardPage.ts` (5 lines, 1 caller) into `features/parks`, fold `src/core/constants/` into `src/constants/`, fold `src/store/useAppStore.ts` and `src/contexts/LanguageContext.tsx` into one place, move `src/scripts/*` (3 files) to the top-level `scripts/`, delete `src/assets/` and `src/test_video/`. Then delete `src/@core` and `src/core`. | §2.1 | **S** — but touches 4 import sites, so do it when nothing else is in flight |
| **20** | **Introduce a Firestore collection-name constants module** and replace the 34 `collection(db,'users')` / 99 `doc(db,'users',…)` string literals. Add a shared `functions/src/lib/admin.ts` so the 27 duplicated `admin.initializeApp()` blocks collapse to one import. | §4.4 | **M** |
| **21** | **Strip production `console.log`** — add `compiler: { removeConsole: { exclude: ['error','warn'] } }` to `next.config.mjs`. 1,283 call sites, one config line. | §3.5 | **S** (deliberately post-launch: you will want the logs during the launch window) |
| **22** | **Address cross-domain coupling** — 1,009 edges, 6 confirmed domain cycles. Do not attempt a big-bang fix. Pick the two worst single files (`SettingsModal.tsx` → 8 domains, `AddWorkoutModal.tsx` → 7) and invert their dependencies via props/callbacks, then add an ESLint `no-restricted-imports` rule that forbids *new* `features/A → features/B` edges while grandfathering existing ones. | §2.4 | **L** |
| **23** | **Rewrite or retire `ARCHITECTURE.md` and `PROJECT_STRUCTURE.md`.** Both describe an app that no longer exists and reference 11 root files that were deleted. Either regenerate `PROJECT_STRUCTURE.md` from a script or mark both `HISTORICAL — see docs/audit-2026-09/`. | §0 | **S** |
| **24** | **Merge the duplicated `ExerciseVideoPlayer`, `CoinPill`, `PartnerCard`, and `WorkoutPreviewDrawer` variants**; rename the two `auth.service.ts` and two `parks.service.ts` files to disambiguate; move `calculateHealthROI()` out of `admin/services/auth.service.ts`. | §2.3, §4.5 | **M** |
| **25** | **Add an equality test for the hand-synced `persona-alias-map.service.ts` mirror** (`functions/src/services/` ↔ `src/features/user/onboarding/services/`) so the documented "keep in sync BY HAND" contract is machine-checked. | §2.3 | **S** |

### What is genuinely good (say this out loud)

- **18 real TODO/FIXME/HACK/XXX markers across 1,945 files**, 0 `FIXME`, 0 `HACK`, 0 `@ts-ignore`, and only **69 lines** of commented-out code. For an AI-assisted codebase this is exceptional.
- **No byte-identical duplicate files** anywhere in `src`/`scripts`/`functions/src`.
- **`functions/` type-checks clean** and its largest file is 559 lines.
- **32 of 33 `api/admin` routes** are guarded by an explicit `requireAdminApi`-family call.
- **153 test files** with genuinely deep coverage of the workout engine's pure logic and the route generator's geometry — including dated regression guards for real historical bugs.
- **Every file referenced by `CLAUDE.md` and every npm-script/firebase.json target exists** — the tooling metadata is honest.
- The three `WIP: preserve uncommitted work (safety commit, pre-cleanup)` worktree commits show a previous cleanup that correctly rescued in-flight work before pruning.
