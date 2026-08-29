# Running Questionnaire — Gap Map (End-to-End Audit)

> **Status:** READ-ONLY investigation — 22.08.2026. Nothing built, nothing fixed, nothing changed.
> **Method:** 5 parallel static-code investigations over the live repo, every claim cites `file:line`.
> No dev/build server was run anywhere in this audit (`axioms.md §11`) — the perf axis (§4) is
> static analysis only, explicitly marked where runtime confirmation would still be needed.
> **Do not re-investigate** the 3 findings from `.claude/knowledge/running-onboarding-routing-audit.md`
> (21.08.2026) — they're restated as background context below (marked "prior audit") and this doc
> builds forward from them.

---

## 0. Critical framing correction — read this before anything else below

The mental model of "strength track = `OnboardingWizard.tsx` + `PersonaStep`/`PersonalStatsStep`/
`ScheduleStep`/etc." is **9 days out of date**. `src/app/onboarding/page.tsx:9-15` and
`src/app/profile/page.tsx:274-277` both independently confirm: the old `/onboarding-new/intro`
chain (intro → selection → roadmap → persona-selection) was **removed 13.08.2026**. Today's date
is 22.08.2026.

**The real live primary flow (both tracks) is:**

```
/gateway/page.tsx
  │ writes gateway_track → localStorage (+capacitor/preferences)   [BUG #1 below — never reaches sessionStorage]
  ▼
/onboarding-new/profile  (IdentityProfilePage — SHARED: name, gender, DOB only)
  ▼
/onboarding-new/program-path  ← THE ACTUAL FORK
  │ reads gateway_track from sessionStorage (broken by BUG #1 → redirect never fires)
  ├─ strength branch → /onboarding-new/assessment-visual → ... → back into /onboarding-new/dynamic
  └─ running branch  → /onboarding-new/dynamic (startQuestionId='q_run_goal')
  ▼
/onboarding-new/dynamic  (DynamicOnboardingEngine + DynamicQuestionRenderer, Firestore-driven tree)
  │ guarded by hasCompletedOnboarding()                             [BUG #2 below — blocks re-entry]
  │ running answers accumulate into sessionStorage('onboarding_running_answers')
  │ handleComplete() → running branch pushes to running-schedule
  ▼
/onboarding-new/running-schedule  (RunningScheduleStep.tsx)
  │ guarded by enable_running_programs flag (one-time checkpoint, not continuous — §6.4)
  │ writes runningWeeklyFrequency/runningScheduleDays/Time/DayIndices/NotificationsEnabled(dead)
  │ + a merged `scheduleDays` — to the LOCAL onboarding store only (not yet synced)
  ▼
/onboarding-new/running-plan-length  (PlanLengthStep — computeRecommendedWeeks via WEEKS_LOOKUP)
  ▼
/onboarding-new/running-summary  (RunningPlanSummary.tsx — display only)
  ▼
/onboarding-new/health  (HealthDeclarationStep — SHARED with strength)
  ▼
/onboarding-new/health-connect  (HealthConnectOptInStep — SHARED)
  │ triggers syncOnboardingToFirestore('COMPLETED', ...) → onboarding-sync.service.ts
  │   ├─ PROGRAM & LEVEL ASSIGNMENT block (lines 854-1490)          [BUG #3 fires here]
  │   └─ RUNNING BRIDGE block (~1498-1697):
  │        bridgeRunningOnboarding() → running-onboarding-bridge.service.ts
  │          → generateProgramTemplate() → plan-generator.service.ts   (pure, no Firestore)
  │          → generatePlan()            → running-engine.service.ts   (materializes weeks,
  │                                          runs enforceVolumeCaps/applyIntensitySafetyValve/
  │                                          enforceWeeklyProgressionCap — all active mutators;
  │                                          validateIntensityDistribution — advisory only, §7.5)
  │        → updateData.running.activeProgram
  │        → recurringTemplate OVERWRITTEN wholesale                [BUG #4]
  │        → lifestyle.primaryTrack/dashboardMode "running wins" overwrite
  │   └─ ONE setDoc(userDocRef, sanitizedUpdateData, {merge:true}) — line 1778 — commits
  │      everything above atomically in a single write
  ▼
/home
  │ profile.progression.domains/tracks/activePrograms now contains the phantom full_body entry
  │ → hasProgram / hasStrengthProgram / hasStrengthSurvey() all wrongly TRUE
  │ → dashboardMode correctly 'RUNNING' → StatsOverview hero renders correctly
  │ → but ConsistencyWidget / ProgramProgressRow / default tab render STRENGTH UI for the phantom
  │ AgendaDayCard.tsx (main schedule list) / SmartWeeklySchedule.tsx (home weekly strip) render
  │ the weekly view — running wins exclusively on shared days in AgendaDayCard (BUG #5), partial
  │ merge only in SmartWeeklySchedule's RUNNING/HYBRID mode
```

**Consequence for how to read the rest of this doc:** `PersonaStep.tsx`/`PersonalStatsStep.tsx` are
now JIT-only (`/onboarding-new/setup?step=X&jit=true`) or `LifestyleWizard`-only (Home "set
schedule" CTA for `MAP_ONLY` users) — **dead in the primary flow for BOTH tracks**, not a
running-specific gap. `HistoryStep.tsx` is fully dead (content merged into `ScheduleStep.tsx`'s
"Deep History" section, itself JIT-only). `OnboardingWizard.tsx` has no live bare-entry caller
anywhere in the codebase.

---

## 1. Step-by-step comparison: strength vs. running (corrected model)

| Step | Strength reality | Running reality | Gap |
|---|---|---|---|
| Persona | `PersonaStep.tsx` — JIT-only / `LifestyleWizard`-only | None in primary chain | **Track-agnostic**, not running-specific — neither track collects it live today |
| Name/gender/DOB | `/onboarding-new/profile` (shared) | Same shared page | **No gap** — genuinely shared and live |
| Weight | `PersonalStatsStep.tsx` — JIT-only | None; `dynamic/page.tsx:379` hardcodes `weight:''` | **Track-agnostic** — both default to 70kg (`profile.service.ts:315`) |
| Height | Never collected, not even a field in `user.types.ts` | Same | **Not a gap** — dead concept on both tracks, zero readers exist |
| Schedule | No live strength schedule page exists (`ScheduleStep.tsx` is JIT-only) | `RunningScheduleStep.tsx`, live at `/onboarding-new/running-schedule` | **Real asymmetry, opposite direction** — running's collector is live, strength's isn't wired into any `/onboarding-new/*` page today |
| Location/GPS | `UnifiedLocationStep.tsx` — JIT-only; not confirmed live anywhere in the primary chain either | None; running plan has zero location dependency (confirmed — no lat/lng in the bridge service) | **Not a real gap for running** — moot, running was never location-dependent (§6.1) |
| Health declaration | `/onboarding-new/health` (shared) | Same shared page | **No gap** |
| Account security | `AccountSecureStep.tsx` — 2 live mounts total (`OnboardingWizard.tsx`, unrelated `EmailCaptureDrawer.tsx`), neither reachable from running | None | **Real gap** — guest/anonymous users can complete the entire running flow, including the Firestore write, without ever being asked to secure an account (§6.6) |
| Equipment | `EquipmentStep.tsx` — JIT-only | None | **Track-agnostic gap**, same JIT-only pattern as persona |
| Summary | `SummaryStep.tsx` — JIT/legacy only | `RunningPlanSummary.tsx`, live | **No gap in practice** — both tracks have *a* live summary screen, just not the named component the old model assumed |

### Persona downstream — the real question wasn't "is it missing," it's "which of 4 different field paths is it missing from"

Grep found persona read from **4 distinct, non-aliased Firestore paths** across the codebase —
`personaId` (top-level), `lifestyle.persona` (singular), `identity.persona`, `core.personaId` — and
only one of these (`personaId` top-level / `lifestyle.lifestyleTags`) is ever written by the (now
JIT-only) `PersonaStep`. The other three have **zero writers anywhere in the repo** and are
permanently dead regardless of the questionnaire gap:
- `lifestyle.persona` → `DailyPhrase.tsx:66`, falls to generic phrase
- `identity.persona` → `NextRunWorkoutCard.tsx:231`, falls to `null`, disables persona-flavored running-workout copy
- `core.personaId` → `StrengthOverviewCard.tsx:109`, falls to `'parent'` — a **specific wrong default**, not a neutral one; also `PlannedPreviewLayer.tsx:81`

All persona readers found are crash-safe (optional chaining throughout). The bug pattern is
**silent wrong-branch/wrong-default**, never a crash. One consumer (`workout-metadata.service.ts`,
~15 line refs) treats "no persona" as a first-class, intentionally-designed case ("David Clause")
— that one is fine as-is.

---

## 2. Numbered gap list (severity: 🔴 blocking · 🟠 significant · 🟡 cosmetic/minor)

Every entry below is **verified in code** unless explicitly marked otherwise.

### 🔴 #1 — `gateway_track` storage-layer split *(prior audit, restated as background)*
`gateway/page.tsx:410` writes to `localStorage`(+capacitor); every downstream reader
(`program-path/page.tsx:98`, `dynamic/page.tsx:82,126,437`, `health/page.tsx:21`,
`health-connect/page.tsx:14`) reads `sessionStorage`. Zero bridge exists. **The redirect into the
running tree never fires from the canonical Gateway path** — every user, strength or running,
currently lands in the strength-only picker.

### 🔴 #2 — `hasCompletedOnboarding()` blocks ALL re-entry to `/onboarding-new/dynamic` — upstream of #1
`dynamic/page.tsx:142-146`: `if (!hasCompletedOnboarding()) init(); else router.replace('/home')`.
`hasCompletedOnboarding()` (`useUserStore.ts:259-276`) is **global, not track-specific** — true if
`lifestyle.scheduleDays.length>0` OR `onboardingStatus` is `PENDING_LIFESTYLE`/`COMPLETED`. Any
user who has ever completed onboarding once (strength **or** running) is bounced to `/home` before
the page even initializes — **regardless of whether #1 gets fixed**. This is a distinct, more
fundamental blocker than the storage-split bug: fixing #1 alone still dead-ends here for any
already-onboarded user. Three live entry points hit this wall directly: `RunForecastWidget.tsx:136`,
`StatsOverview.tsx:1363,1371`, `profile-completion.service.ts:213,221` (the JIT `jitPath`).

### 🔴 #3 — Phantom `full_body` strength program written for every running-only new user
`onboarding-sync.service.ts` — ordering bug. Line 1406's skip-check (`updateData.running?.isUnlocked`)
is meant to prevent assigning a fake strength program to running-only users, but that field is only
set `true` at line 1543-1545, **inside the RUNNING BRIDGE block, which runs AFTER the PROGRAM &
LEVEL ASSIGNMENT block (854-1490)** in the same function call. For a brand-new user's first
`COMPLETED` sync, the check fails → falls through to the `GOAL_TO_PROGRAM` fallback (1410-1489) →
`selectedGoalIds` defaults to `['healthy_lifestyle']` (a running user never answers the strength
goal question) → `GOAL_TO_PROGRAM['healthy_lifestyle']='full_body'` (line 175) → writes
`progression.domains.full_body` / `progression.tracks.full_body` /
`progression.activePrograms=[{templateId:'full_body',...}]` at a **real, non-zero level** (1/3/5
depending on `fitnessLevel`). The running bridge runs afterward and correctly populates
`running.*` — but the phantom entry is already committed in the same `setDoc`. The code's own log
line ("Running-only user detected … Skipping strength program fallback") describes exactly the
behavior this ordering bug prevents.

**Verified downstream effects, all in `home/page.tsx` / related components:**
- `hasProgram` (986-988), `hasStrengthProgram` (992-998), `hasStrengthSurvey()`
  (`useProgramProgress.ts:72-78`) — all wrongly **TRUE**
- Home tab defaults to "strength progress" instead of running/health (`home/page.tsx:366,1839-1846`)
- `ConsistencyWidget` shows a live (fake, `0/N`) strength mini-bar instead of a "add strength
  program" ghost prompt (`ConsistencyWidget.tsx:139,148-186`)
- `ProgramProgressRow` renders a real `ProgramProgressCard` for the phantom program instead of
  `GhostUpsell` (`ProgramProgressRow.tsx:36-59`)
- `handleHeroPress` (`home/page.tsx:1419-1561`) routes into strength-workout flow instead of the
  strength assessment wherever it fires while running-mode is active
- `dashboardMode`/`primaryTrack` **do** end up correct (`'RUNNING'`, since the running bridge
  overwrites them last) — the hero/`StatsOverview` carousel itself is fine; it's specifically the
  Row-2 widgets above it that are wrong
- `profile-completion.service.ts`'s "goals" item (weight 10) gets **undeserved credit** from the
  same phantom write, while `schedule`+`equipment` (weight 15) are correctly withheld — net: a
  plausible-looking ~85-95% completion score that **masks** the real gap instead of surfacing it,
  arguably worse than a visibly low number

### 🟠 #4 — `lifestyle.recurringTemplate` silently wiped for returning/hybrid users — ✅ CLOSED 29.08.2026 (two-stage fix)
Strength writes this field via a proper merge (`onboarding-sync.service.ts:585-597`:
`{...(existing recurringTemplate ?? {}), ...(data as any).recurringTemplate}`) — the comment right
above it states the explicit intent: *"We MERGE rather than overwrite so a user who completes both
strength and running onboarding keeps both worlds."* The running bridge, **in the same function,
later in the same call** (lines 1662-1678), builds a fresh `recurringTemplate` from only the
running days and assigns it wholesale — never spreading the pre-existing value first. This directly
contradicts the running block's own adjacent comment, which correctly claims `activePrograms` is
untouched but is silent about (and wrong about) `recurringTemplate`. **Concrete impact:** a
returning user with an active strength `recurringTemplate` (e.g. `{א:['full_body'], ...}`) who
later completes running onboarding on different days has their **entire recurring schedule
replaced** — the strength days vanish from the calendar (`StatsOverview.tsx:753-754`'s
`hydrateFromTemplate` consumes exactly this field). A second, smaller instance of the same
"running always wins, no check for the other track" pattern: `lifestyle.primaryTrack`/
`dashboardMode` are unconditionally overwritten by the running bridge (1686-1691) regardless of
whether the same call also assigned a strength program — **still open, not part of either fix
below**, tracked separately (documented as a deliberate, temporary product decision pending the
hybrid dashboard design, see commit `827450f9`'s message and the schedule-drawer plan's §5).

**Stage 1 (commit `827450f9`, 25.08.2026):** fixed the *map-level* case above — the running block's
`recurringTemplate` write now spreads the existing value first (`{...existing, ...runTemplate}`),
so a returning user's strength days on *other* day-letters survive. Its own test title says the
boundary out loud: `"completing running on **different days**"`. It explicitly deferred the
same-day case as out of scope, naming it "gap-map finding #9" in the commit message.

**Stage 2 (this fix, 29.08.2026, both directions):** closed the same-day case #9 pointed at — see #9
below for the mechanism. Both `recurringTemplate` write sites in this file now merge each
day-letter's *array* through `mergeDayItems(existing, next, owner)` before their map-level spread:
- The running bridge (`~1780-1810`, `owner: 'running'`) — a day that already has a strength id (e.g.
  Dana trains ב/ד/ו for strength, picks ד for running too) keeps both —
  `template['ד'] === ['FULL_BODY', <runningTemplateId>]`, not just the running id.
- The strength UTS bridge (`~596-627`, `owner: 'strength'`) — confirmed, during this fix, to have
  the *identical* bug in reverse: same flat map-level spread, same array-level overwrite, and the
  same false "keeps both worlds" claim in its own adjacent comment (`:601-602`, pre-fix). A running
  user who later completes strength onboarding on a day that already has a running id was silently
  losing the running id — same class of bug, opposite direction, now closed the same way.

Two integration tests, `onboarding-sync.service.test.ts` — describe block
`"gap-map finding #9: same-day collision"`: `"Dana's bug"` (running write collides with existing
strength) and `"Dana's bug in reverse"` (strength write collides with existing running) — each
proves its own direction, a passing pure-function test alone would not have caught either
integration wiring being wrong or missing.

**⚠️ Data-layer fix only — does not mean a user can now *see* both trainings on a shared day.** See
#5 below: `AgendaDayCard.tsx` still renders running and strength as mutually exclusive per day,
completely independent of what `recurringTemplate` now correctly stores. Closing #9 means the data
survives; #5 is the reason it still won't appear on screen.

### 🟠 #5 — `AgendaDayCard.tsx` treats running and strength as mutually exclusive per day — 🔴 STILL OPEN, confirmed live 29.08.2026, blocks David's own decision
`AgendaDayCard.tsx:874`: `if (hasRunning) { setEntries([]); return; }` — skips the strength
Firestore fetch **entirely** the moment a day has a running entry. Render is a strict `if/else-if`
chain (`:1104` `) : hasRunning ? (`) — never both. On any day that is both a running day and a
strength day, the strength session is simply never shown. No crash, no merge, no warning. **Not a
theoretical concern** — re-confirmed by re-reading both lines directly on 29.08.2026, specifically
because an earlier claim that running and strength already render together on the main agenda was
wrong and got corrected on re-check; treat that as the standing caution for this file — verify
against current line numbers before trusting any status claim here, including this one.

**Relationship to #9, precise — do not conflate:** #9 (above) closes the *data* layer —
`recurringTemplate[day]` now correctly holds both a strength id and a running id for a shared day,
both directions, and survives every write path that touches it. #5 is the *display* layer, and is
untouched. **Closing #9 does not mean a user can see both trainings on a shared day** — it means
the data is finally correct underneath a screen that still shows only one of the two. `hasRunning`
short-circuits before the strength fetch ever runs, so the now-correctly-persisted strength id for
that day is simply never read.

**Note, 29.08.2026:** this entry originally cited `RunningScheduleStep.tsx:346-347,358` rendering a
shared day in **purple**, labeled "שניהם"/"both", as evidence that the running UI "actively
invites" this collision scenario. That purple/"שניהם" treatment has since been **removed** (same
pass that closed #4/#9, above) — a day picked for both tracks now renders with the plain running
color plus a separate small strength marker beside it, matching the "one card/marker per real
thing" pattern `AgendaDayCard.tsx`/`SmartWeeklySchedule.tsx` already use elsewhere *for entries that
do get fetched*. **This is a UI-consistency fix on the registration screen only, not a fix for
#5** — `AgendaDayCard.tsx:874`'s own mutually-exclusive rendering is completely untouched and still
reachable the exact same way. Removing the misleading "shared" visual just means the registration
screen itself no longer promises a blended view the agenda doesn't actually deliver.

**Explicitly not touched, needs David's decision (per his own instruction, 29.08.2026):** do not fix
#5 without a product call on how a shared day should render — options include (a) two entries
resolved independently once `hasRunning` no longer short-circuits, mirroring how
`AgendaDayCard.tsx:975`'s `trainingEntries`/one-card-per-entry pattern already handles multiple
*strength* items on one day (see #4/#9's history above), or (b) something narrower. Not this
implementer's call.

`SmartWeeklySchedule.tsx` (the other schedule surface,
home's weekly strip) does have a partial merge (`buildPlannedSessions`, Stage H, 18.08.2026) — but
only when `dashboardMode` is `RUNNING`/`HYBRID`; in `wellness`/`performance` mode the running
entry instead surfaces as a generic, mislabeled dot (icon falls back to `'muscle'`, no pace/category/
shoe icon). Confirmed separately: `CARDIO_ACCESSORY` (the `smartSchedule.types.ts` "Phase 2" stub)
is **fully dead** — 4 grep hits, all comments — running never goes through that engine at all; it's
a completely parallel system built on `profile.running.activeProgram.schedule`.

**Integration seam, precisely located (not designed, per instructions):** `AgendaDayCard.tsx:745`'s
short-circuit plus the mutually-exclusive branch at 944/1011. The data-shape mismatch to resolve
first: `runningWorkout` (bespoke shape from `resolveRunningEntry()`) vs. `UserScheduleEntry`
(Firestore doc shape: `programIds`/`scheduledCategories`/`type`/`source`) have no shared adapter —
`SmartWeeklySchedule.tsx`'s Stage H `buildPlannedSessions()`/`DaySessionInput` already invented
one for its own icon-dot merge, but `AgendaDayCard.tsx` has no equivalent.

### 🟠 #6 — `experience` and `hasInjuries` are structurally uncollectable, not occasionally missing
`bridge.service.ts:79` hardcodes running-history months to `0` for **every real user** — the code
comment claims "inferred from ability tier + pace input," but grep confirms **no such inference
code exists anywhere** (only synthetic demo-seed scripts set a fake value). `bridge.service.ts:78`
hardcodes `hasInjuries` to `false` for every real user — the question was **removed from the
tree entirely** (`running-improvement-branch.draft.ts:235,428`: *"q_run_injuries REMOVED — David:
cut from flow"*). Consequence: `isNovice` is **always true** in `plan-generator.service.ts:474-517`
regardless of actual experience (forces the conservative deload-every-3-weeks path on everyone),
and the injury-safety branch (intensity clamp, hill exclusion) is dead code on the live path. This
isn't "some users skip a question" — the question doesn't exist for anyone.

### 🟠 #7 — Re-render/latency root causes on the running "choose your goals" screen
**STATIC ANALYSIS ONLY** — no dev server was run (`axioms.md §11`), so these are code-proven
mechanisms, not measured timings.
1. `DynamicOnboardingEngine.initialize()` (`DynamicOnboardingEngine.ts:201-217`) fetches the entry
   question **twice sequentially**, plus once more via `loadQuestion` — 3 Firestore round-trips (2
   for the identical doc) block first paint on every session, worst on the running track's first
   screen.
2. Every subsequent question transition does 2 sequential (not `Promise.all`'d) Firestore reads
   (`questionnaire.service.ts:320-339`, called from `DynamicOnboardingEngine.ts:243`) — stacked
   under an **already-existing artificial 300ms `setTimeout`** in `page.tsx:196,244`. This fires on
   literally every tap and is the most likely source of the felt "lag."
3. A question cache (`loadedQuestions` Map, `DynamicOnboardingEngine.ts:103,289,696`) is write-only
   — `.set()`/`.clear()` exist, no `.get()`/`.has()` anywhere — so the auto-skip walk (up to 25
   hops) re-fetches already-seen questions with no memoization safety net.
4. `useUserStore()` called with no selector (`dynamic/page.tsx:34`) — subscribes the whole quiz
   page to every field of the large profile object; any unrelated profile write elsewhere in the
   app while the quiz is mounted force-re-renders it.
5. `key={currentQuestion.id}` on the `AnimatePresence` wrapper (`page.tsx:684-716`) fully
   unmounts/remounts the question subtree on every answer — restarts the exercise-prefetch effect
   and discards any in-flight video download.
6. No `React.memo` anywhere in the render tree — every answer-select click re-renders the full
   `OnboardingLayout` + `DynamicQuestionRenderer` tree.

**Explicitly checked and NOT found:** no state-updates-inside-its-own-effect-dependency loop, no
`onSnapshot` calls at all in this flow (so no listener leak), all list keys are correct
(`answer.id`, not index). `QuestionnaireChainOrchestrator.ts` and the non-"Dynamic" `OnboardingEngine.ts`
are both **confirmed fully dead** for this screen (zero live call sites) — don't spend more
investigation time on either.

### 🟡 #8 — `lifestyle.scheduleDays` never populated for running-only users
`RunningScheduleStep.tsx:157-166` computes a merged `scheduleDays` (union with any existing
strength days) but writes it only to the **local** onboarding store. `health/page.tsx:39-49`'s
final sync payload forwards only `runningWeeklyFrequency`/`runningScheduleDays`/`runningScheduleTime`
— dropping the merged field. `onboarding-sync.service.ts:552` gates the `lifestyle.scheduleDays`
write behind `data.trainingDays !== undefined`, a strength-only field running never sets. (A
*different* field, `profile.running.scheduleDays`, does get written at 619-622 — but
`profile-completion.service.ts:186-188`'s "schedule" completion item checks `lifestyle.scheduleDays`,
not that one.) Net effect: that completion item — and the hybrid-awareness highlighting in
`RunningScheduleStep.tsx:63` itself — stays permanently blind to a running-only user's own answers.
The awareness is also one-directional: strength days are visible to the running step, but running
days are never written back for a strength step to see.

### 🟡 #9 — `recurringTemplate` day-value shape diverges between tracks — ✅ CLOSED 29.08.2026 (as an ownership-detection adapter, not a shape normalization)
Strength writes `recurringTemplate[day] = ScheduleItemId[]` (a typed union like `PLANCHE`/
`FULL_BODY`, consumed by `MOVEMENT_OF`/`SKILL_DISPLAY` lookups, `smartSchedule.types.ts:193,220`).
Running writes `recurringTemplate[day] = [bridge.programTemplate.id]` — a raw running-template-id
string the typed lookups don't recognize, silently falling through to default/unstyled rendering
wherever this field is consumed outside running-specific surfaces. This is the data-shape half of
why #4/#5 can't just be unioned without an adapter first.

**Closed differently than originally framed — no shape normalization was needed.** The premise was
that the two shapes need to be *unified* before #4 could be fixed. Turned out unnecessary: strength
ids are a small **closed set** (9 values total — `ALL_SKILL_IDS` + `ALL_PROGRAM_IDS`,
`smartSchedule.types.ts:114,123`), already checkable via `isSkillId`/`isProgramId`
(`smartSchedule.types.ts:287,291` — written, exported, never called anywhere until now). Running ids
are free-form (`bridge.programTemplate.id`, no closed set) but don't need their own positive check —
"not a known strength id" is sufficient to classify an id as running-owned. `mergeDayItems`
(`src/features/schedule/services/mergeDayItems.ts`) uses exactly this exclusion test as its
ownership check, without touching either shape. `HANDSTAND` (a deliberately-retained "free slot" in
the strength template, `ScheduleStep.tsx:558-562`) is in `ALL_SKILL_IDS`, so it's correctly
classified strength-owned — verified with a dedicated test, not assumed. Residual, theoretical-only
limitation: exclusion-based detection would misclassify a running template id that happened to
collide with one of the 9 strength enum strings — considered astronomically unlikely given the two
naming domains, not guarded against.

### 🟡 #10 — `WEEKS_LOOKUP` table has real coverage gaps
`resolveWeeks()`/`WEEKS_LOOKUP` (`bridge.service.ts:118-124`,
`running-improvement-branch.draft.ts:471-545`) is missing entries for some real combinations (e.g.
every `start_running|*|*|4-days-per-week` combo) — silently falls back to a generic
`DEFAULT_PLAN_WEEKS[targetDistance] ?? 8` instead of the PDF-sourced table value for those specific
users.

### 🟡 #11 — Plan-generation failure is silent; the final safety check is advisory-only
`enforceVolumeCaps`, `applyIntensitySafetyValve`, `enforceWeeklyProgressionCap` (`running-engine.
service.ts:1935,1941,1952`) are all **active, mutating** safeguards — the plan going to Firestore
is not raw, unvalidated output. But `validateIntensityDistribution` (the 80/20 easy/hard check,
line 1993) only **appends a warning string** if it fails — never blocks or rejects. And the entire
generation try/catch in `onboarding-sync.service.ts:1566-1684` swallows **any** failure (template
fetch, `generatePlan`, etc.) with a `console.warn` — a broken generation silently leaves
`activeProgram` unset with zero user-facing error.

### 🟡 #12 — `runningNotificationsEnabled` is a dead setter
Set 4× in `RunningScheduleStep.tsx` (lines 85,162,178,188,191), backed by a real
`Notification.requestPermission()` call — but has **zero consumers anywhere** in the codebase and
is absent from `health/page.tsx`'s explicit sync forward-list. The user's toggle has no effect on
whether any reminder ever fires. Same pattern CLAUDE.md already flags for `useRunningPlayer.
activityType`.

### 🟡 #13 — `running-improvement-branch.draft.ts` is misleadingly named — live in 3 places
Despite its own header ("DO NOT UPLOAD TO FIRESTORE — awaiting confirmation"), it is live-imported
by `PlanLengthStep.tsx:6` and `running-onboarding-bridge.service.ts:29` (both use `WEEKS_LOOKUP` in
production code), and by `src/app/admin/running/import/decision-tree/page.tsx:25` — an admin tool
whose `handleRun()` actually `setDoc`-loops `RUNNING_QUESTIONS`/`RUNNING_ANSWERS` straight into the
live `onboarding_questions`/`onboarding_answers` Firestore collections the engine queries at
runtime — **exactly** the content the file's header warns against uploading. **Could not verify
statically whether this uploader has already been run against production.** Flag for David.

### 🟡 #14 — No resume after interruption
`DynamicOnboardingEngine` holds all progress **in-memory only** — no Firestore write, no persistent
storage of the walk itself. A fresh engine is created on every mount (`dynamic/page.tsx:41`) and
always initializes from scratch. `sessionStorage('onboarding_running_answers')` is write-only for
later downstream consumption, never read back to resume the tree — and per `axioms.md §19`, iOS can
evict `sessionStorage` on a hard close anyway. Killing the app mid-questionnaire restarts from
question 1, confirmed, no partial-progress recovery exists anywhere in this flow.

### 🟡 #15 — Guest/anonymous users can complete the entire flow, including the Firestore write
`profile/page.tsx`'s `resolveUid()` accepts a bare anonymous Firebase uid (the app has a real
`signInAnonymously` path from `/gateway`); `handleContinue` only requires *some* uid + a fresh ID
token. `AccountSecureStep` has exactly 2 live mount sites in the whole repo, neither reachable from
the running chain (see §1 table). A guest can complete
`program-path → dynamic → running-plan-length → running-schedule → running-summary → health →
health-connect → /home` — including the `COMPLETED` sync that generates and persists the real
program — entirely on an anonymous uid, never seeing any "you'll lose this if you delete the app"
warning.

### 🟡 #16 — Partial/abandoned questionnaire produces a silently generic plan, not an error
`handleAnswer`'s fallback (`dynamic/page.tsx:285-292`) force-completes with whatever answers exist
if the engine returns neither a terminal result nor a next question. Downstream
(`PlanLengthStep.tsx:37-40`) fills every missing field with a silent default
(`goalPath ?? 'start_running'`, etc.) rather than surfacing any validation error — a gappy chain
produces a plausible-looking generic plan instead of failing loudly.

### 🟡 #17 — `enable_running_programs` is a one-time arrival checkpoint, not a continuous gate *(refines prior audit's finding c)*
`running-schedule/page.tsx` is confirmed the **only** caller of this flag anywhere in the codebase.
A user already past that single page (e.g. sitting on `running-plan-length`) when the flag flips
off is **not interrupted** — nothing downstream re-checks it, so they can finish the entire rest of
the flow (`running-plan-length → running-summary → health → health-connect → /home`) unimpeded.
This sharpens rather than contradicts the prior audit's "hard stop at running-schedule" finding —
it's a checkpoint on arrival, not a persistent gate.

### 🟡 #18 — A 3rd live surface hits the already-known `gateway_track` gap (bug #1)
`PerformanceMetricsRow.tsx:38` builds `RUN_ONBOARDING_HREF` with a `?track=run` query param that
`program-path/page.tsx` never reads (no `useSearchParams` anywhere in that file) — silently
dropped, falls through to the same broken `sessionStorage` check as bug #1. Same category as
`ConsistencyWidget`'s "+ ריצה" button (prior audit) and `StrengthVolumeWidget.tsx:128`'s
`?track=strength` sibling — not a new bug, just more blast radius for fixing #1.

### 🟢 Checked, confirmed NOT a bug — location permission
Running has **zero** dependency on `UnifiedLocationStep`/GPS anywhere — `bridge.service.ts` has no
lat/lng/location references at all; the plan is built purely from questionnaire metadata. This
edge case, as posed, is moot for running (it only matters for the strength/map-bridge/explorer
entry points, where a manual city-search fallback does already exist on denial).

---

## 3. "Not checked / could not verify" — explicit

- **GPS sessionStorage bridge** — `dynamic/page.tsx:506-507` reads
  `sessionStorage.onboarding_gps_lat/lng`, but no writer of those keys was found within
  `onboarding-new`/`gateway`. A broader app-level geolocation hook outside that search scope may
  exist and wasn't exhaustively traced — **assumption, not fully verified**.
- **`AerobicSummaryShell`'s own account-secure nudge** — flagged as a *plausible* running-track gap
  (parallel to `StrengthSummaryPage`'s `EmailCaptureDrawer`) but the file itself was not opened to
  confirm one way or the other.
- **Whether the `running-improvement-branch.draft.ts` uploader script (bug #13) has already been
  run against production Firestore** — could not determine from static reading; the collections it
  targets (`onboarding_questions`/`onboarding_answers`) are exactly what the live engine queries,
  so this matters for trusting the running question tree's actual production content.
- **Runtime-confirmed timings for the perf findings (#7)** — every mechanism is code-proven, but
  actual round-trip latency and actual re-render counts were never measured, per the ban on running
  `next dev`/instrumentation in this repo.

---

## 4. Sources / files read across all 5 investigation passes

`OnboardingWizard.tsx`, `LifestyleWizard.tsx`, all `steps/*.tsx`, `types.ts`, `DynamicOnboardingEngine.ts`,
`QuestionnaireChainOrchestrator.ts`, `OnboardingEngine.ts`, `useOnboardingStore.ts`,
`DynamicQuestionRenderer.tsx`, `onboarding-sync.service.ts` (full), `running-onboarding-bridge.service.ts`
(full), `plan-generator.service.ts`, `running-engine.service.ts`, `profile-completion.service.ts` (full),
`profile.service.ts`, `useRunningConfigStore.ts`, `smartSchedule.types.ts`, `scheduleRules.ts` (full),
`AgendaDayCard.tsx`, `RollingAgenda.tsx`, `SmartWeeklySchedule.tsx`, `useDashboardMode.ts`, `home/page.tsx`,
`ConsistencyWidget.tsx`, `ProgramProgressRow.tsx`, `ProfileCompletionWidget.tsx`, `StatsOverview.tsx`, all
10 `onboarding-new/*/page.tsx` routes, `running-improvement-branch.draft.ts` (full),
`admin/running/import/decision-tree/page.tsx`, plus grep sweeps for every field/component name cited above.
