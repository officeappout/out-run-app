---
name: next-run-workout-card-inventory
description: Full behavior inventory of NextRunWorkoutCard.tsx — every render state, button, and failure mode — taken before running-progress-card.md's [1] retires it as an independent card and folds its content into the shared carousel. Protects against silently dropping behavior during that move.
---

# `NextRunWorkoutCard` — behavior inventory

**Taken:** 03.09.2026, David's explicit request, before any refactor. READ-ONLY — nothing built or changed here.

**Why this exists:** `running-progress-card.md`'s `[1]` retires this component's role as an independent card — its content moves *inside* the shared carousel. David: don't want "we moved the workout card into the carousel" to quietly lose four other things that lived in the same file. This is the checklist for that move — every state below needs a home in whatever replaces it, or an explicit decision to drop it.

File: `src/features/home/components/widgets/NextRunWorkoutCard.tsx`, 573 lines.

## Consumers — the full external surface

**Exactly one file renders this component, at exactly two call sites, both inside `StatsOverview.tsx`'s `mode === 'RUNNING'` render branch — no props passed at either:**
- `StatsOverview.tsx:1317` — rendered first when `!isRunDayToday` (rest day, computed locally in `StatsOverview` from `profile?.running?.scheduleDays` — a separate, third computation of "is today a rest day," alongside this component's own `effectiveRestDay` below and `RunningWorkoutCards`' `isRestDay`).
- `StatsOverview.tsx:1334` — rendered when `isRunDayToday`.

Zero props (`<NextRunWorkoutCard />` both times) — everything is self-derived from `useUserStore()` inside the component. Any replacement needs no prop-plumbing from the caller; it needs the same `profile` access the carousel already has.

## Data it reads (all from `useUserStore().profile`)

- `running.scheduleDays` — Hebrew day-letters (`['א','ב',...]`), used to compute `isRunDay` for today and (inside `findNextRun`) the next scheduled day.
- `running.activeProgram.schedule` — the flat `{week, day, status, workoutName, category, workoutId}[]` array; presence of a non-empty array is `hasActiveSchedule`, the gate between the "no plan" states and the real workout states.
- `running.activeProgram.startDate` / `.currentWeek` — fed to `resolveRunningCurrentWeek` (flag-gated, `RUNNING_CURRENT_WEEK_RECOMPUTE_ENABLED`) → `effectiveCurrentWeek`, used everywhere below instead of re-reading the stored field independently.
- `running.generatedProgramTemplate.targetDistance` — resolves `distKm`/`distLabel` via `DIST_KM`/`DIST_LABEL` lookup tables (`2k/3k/5k/10k/maintenance`, default `5k`).
- `running.paceProfile.basePace` — feeds `estimatedMinutes = Math.round((basePace * distKm) / 60)` when `basePace > 0`, else no duration shown.
- `running.isUnlocked` — read indirectly, via `isRunningPlanBuildStuck(profile)` (see below).
- `identity.persona`, `core.gender` — passed into `resolveWorkoutMetadata` when the briefing drawer loads (best-effort, wrapped in `try/catch`).
- `_hasHydrated` (from `useUserStore()` itself, not `profile`) — gates everything else; see State 0.

## Render states, in the order the component actually checks them

### State 0 — not hydrated yet (`!_hasHydrated`)
Neutral skeleton: pulsing gray icon-square + two pulsing text bars. No claim about running-plan state is made here — this exists specifically to prevent every valid runner from flashing "we couldn't build your plan" for a moment on every app open (documented in-code as a fix for a real flicker David flagged 01.09.2026).

### State 1 — no active schedule (`!hasActiveSchedule`, i.e. `activeProgram.schedule` is empty/missing)
Three further sub-states, computed via `isRunningPlanBuildStuck(profile)` / `hasRunningRebuildInputs(profile)` (both from `running-schedule-write.service.ts`):

**1A — stuck, but rebuildable** (`isStuck && canRebuild`): icon is `AlertCircle` (or a spinning `Loader2` while `isRebuilding`). Title: "לא הצלחנו להכין את תוכנית הריצה שלך." (or "עדיין לא מצליח." if a retry already failed once this session — `rebuildFailedOnce` state, session-local, resets on remount). Subtitle explains everything typed is saved. **Button:** "בנה את התוכנית" / "בונה..." / "נסה שוב" — calls `handleRebuildClick`, which reads `auth.currentUser?.uid`, calls `buildActiveRunningProgram(uid)`, and on success calls `refreshProfile()` (required — `profile` is `getDoc()`-based, not a live listener, so without this the UI would stay showing the stuck state even after a successful write). On failure, sets `rebuildFailedOnce=true`, no auto-retry — only another tap retries.

**1B — stuck, and NOT rebuildable** (`isStuck && !canRebuild`): message-only, **deliberately no button**. Title: "משהו חסר בהגדרת הריצה שלך." Subtitle: "נעבור שוב על ההגדרה — זה ייקח דקה." The in-code comment documents *why* no button: the natural destination (`/onboarding-new/dynamic`) was investigated and found unsafe for this specific re-entry — `isJitEdit` never fires on that route, and `onboarding-sync.service.ts` unconditionally overwrites `activeProgram`/`primaryTrack`/`dashboardMode` on that path with no "already has real progress" guard. No live code path is known to actually produce this state today (the only writer of `paceProfile`/`generatedProgramTemplate` writes both together with `isUnlocked`) — kept as a safe dead-end rather than a button into a documented-unsafe route.

**1C — not stuck** (neither 1A nor 1B applies): `hasTemplate = !!running?.generatedProgramTemplate` decides the copy. If true: "התוכנית שלך בהכנה" / "לוח האימונים ייווצר בכניסה הבאה" with a spinning `Loader2`. If false: "אין תוכנית ריצה" / "השלם/י את ההרשמה כדי ליצור תוכנית" with a static `Footprints` icon. Neither has a button.

### State 2 — has an active schedule, and it's a rest day (`effectiveRestDay = !isRunDay || skippedToday`)
**Note:** `effectiveRestDay` is this component's own, independent computation — not the same value as `RunningWorkoutCards`' `isRestDay` (`!todayEntry`, in `SmartWeeklySchedule.tsx`) or `StatsOverview.tsx`'s own local `isRunDayToday` check that decides call-site order. Three separate implementations of "is today a rest day," already flagged in `parking-lot.md`.

Moon icon, "היום זה להתאושש 🧘". If `findNextRun(...)` resolves a next scheduled day (scans up to 7 days forward from today against `scheduleDays`, and — separately — tries to resolve that day's actual workout name from `schedule[]` by mapping the day back to a slot-index within `scheduleDays`, a **third, independent re-implementation of "which schedule entry is a given day," structurally similar to `resolveTodayRunningWorkout` and `AgendaDayCard.tsx`'s `resolveRunningEntry`**): a subtitle line — "מחר מחכה לך: X" if tomorrow, else "הבא בעוד N ימים: X". If `skippedToday` is what produced this state (not a genuine non-training day): an extra button, "ביטול — אני בכל זאת רוצה להתאמן", which sets `skippedToday=false` and returns to State 3 below.

### State 3 — has an active schedule, and it's a real training day
Header row: "האימון שלך היום" (label) + today's formatted date (`formatDate()`, e.g. "יום ג׳, 3/9") on the same line. Icon + workout name/duration: icon from `WORKOUT_ICONS` (`easy`→Footprints, `interval`→Zap, `tempo`→Timer, `long`→TrendingUp), name is `workoutLabel` (from the resolved schedule entry) or a generic fallback label built from `targetDist`, duration is `~{estimatedMinutes} דקות` when `basePace > 0`, else omitted entirely.

Two buttons:
- **"התחל ריצה"** (primary, filled cyan) — opens the briefing drawer (`setBriefingOpen(true)`).
- **"אין לי כוח היום — דלג לעוד"** (secondary, text-only) — sets `skippedToday=true`, which flips this render to State 2 (the "cancel" sub-case) on the next render. Session-local only — not persisted to Firestore, resets on remount/date change (`useState`, no write anywhere).

**Which schedule entry is "today's workout"** — a `useMemo` (`:152-210`) with its own fallback logic: matches an entry where the mapped day-index equals today; if none, falls back to the first `pending`/no-status entry in the current week; if still none, falls back to `weekEntries[0]`. **This is the same shape of bug `resolveTodayRunningWorkout` was built to fix in `RunningWorkoutCards`** (a nullish/no-match "today" silently substituting a different day's entry) — not confirmed broken here, not investigated as part of this inventory; flagged because it's the third live instance of this exact pattern and any refactor should decide whether to route this component through the same pure function instead of keeping its own copy.

**Briefing drawer** (`RunBriefingDrawer`, a separate component): opened by "התחל ריצה". A `useEffect` (`:213-291`) fires when `briefingOpen && pendingWorkoutId` (guarded against re-fetching the same id via `briefingLoadedIdRef`) — fetches `getRunWorkoutTemplate`, `getPaceMapConfig`, and (if a program id exists) `getRunProgramTemplate`, then calls `materializeWorkout(...)` to build the full `RunWorkout` object, then best-effort enriches title/description/cues via `resolveWorkoutMetadata(...)` (wrapped in `try/catch` — template fallbacks used silently on failure). Passed to the drawer as `workout`/`isLoading`. `onGo` (`handleBriefingGo`) closes the drawer and navigates to `/map` with `workoutId`/`week`/`day`/`context=running`/`autoStart=true` query params — this is the actual "start the run" action; nothing else in the component performs it.

## Internal helpers (module-scope, not exported — would need re-homing or re-export if reused)

- `findNextRun(scheduleDays, schedule?, currentWeek?)` — used only by State 2.
- `formatDate()` — used only by State 3's header.
- `CATEGORY_TO_TYPE`, `WORKOUT_ICONS`, `DIST_KM`, `DIST_LABEL`, `DAY_TO_HE` — lookup tables, used across multiple states.

## Feature-flag interaction

`effectiveCurrentWeek` goes through `resolveRunningCurrentWeek` (`running-current-week.utils.ts`), gated by `RUNNING_CURRENT_WEEK_RECOMPUTE_ENABLED` (currently `true` in prod, live since 14.08.2026) — this component is one of 5 named display-read sites in that flag's own doc comment (`feature-flags.ts:958`), alongside `StatsOverview`, `SmartWeeklySchedule`, `RollingAgenda`, `TrainingPlannerOverlay`.

## Checklist — what needs a home when this stops being an independent card

- [ ] State 0 (hydration skeleton) — or does the carousel's own loading state already cover this?
- [ ] State 1A (rebuildable, with its 3 sub-copy variants + spinner + `rebuildFailedOnce` session flag) — the retry button's exact call pattern (`buildActiveRunningProgram(uid)` → `refreshProfile()`) must be preserved verbatim.
- [ ] State 1B (not rebuildable, deliberately no button) — the reasoning (unsafe `/onboarding-new/dynamic` re-entry) still applies wherever this lands.
- [ ] State 1C (both copy variants — "בהכנה" vs "אין תוכנית").
- [ ] State 2's "next run" preview line, including its own workout-name resolution.
- [ ] State 2's skip-cancel button ("ביטול — אני בכל זאת רוצה להתאמן") when `skippedToday` produced the rest state.
- [ ] State 3's "אין לי כוח היום — דלג לעוד" skip button and its purely-session-local `skippedToday` state (currently not persisted anywhere — confirm this is still acceptable once the card is inside a carousel with its own lifecycle).
- [ ] The briefing-drawer flow in full (load effect, metadata enrichment, `handleBriefingGo`'s navigation to `/map`) — this is the actual "start the run" path; nothing else in the component does it.
- [ ] The three independent "what day/entry is this" computations noted above (`effectiveRestDay`, the State-3 `useMemo`, `findNextRun`'s own lookup) — decide whether the carousel version keeps its own copies or routes through `resolveTodayRunningWorkout`.

Not itemized further here — this is an inventory, not an implementation plan. `running-progress-card.md` is the spec; this file is what must not be dropped while building it.
