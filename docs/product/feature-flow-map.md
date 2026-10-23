# OUTRUN — Feature & Flow Map (for golden-path onboarding design)

**Purpose:** map every major feature and the real, code-verified user flows, to design a "golden path to first activity" and to spec instrumentation (screen + control names below are intended to become analytics event names).

**Method:** read-only research against a fresh checkout of `origin/main` (`7628b18b`, 2026-10-05), via 5 parallel code-tracing passes. Every claim below cites file:line. Where a claim conflicts with an older doc (`.cursorrules`, `CLAUDE.md`, prior memory), the live code wins and the doc is flagged as stale. No code was changed to produce this.

**Headline correction to the brief:** the working assumption was 2 core activation paths (strength, running). The code shows **at least 3 primary, independently-completable paths — strength, running, and hybrid (run + park strength stops) — plus a lighter 4th (recovery)**. See §2 for the full breakdown and why hybrid doesn't fully count yet (XP is hard-wired to zero).

---

## 1) Feature Inventory

Scope: consumer app only (`src/app/**` excl. `admin`, `src/features/**`). Grouped, one line each.

### Core Activity
- **Workout engine** — pure-TS generator + suggestion system — `src/features/workout-engine/`
- **Map / routes** — live map shell, route generation, free-run, turn-by-turn — `src/app/map/` (`MapShell.tsx`)
- **Running** — route-based and free-form runs — `src/features/workout-engine/players/running/`
- **Hybrid** — run + park strength-station composition — `src/features/workout-engine/hybrid/`
- **Active/overview/history workout screens** — `src/app/workouts/[id]/active|overview|history`
- **Home dashboard** — daily plan, hero card, schedule — `src/app/home/page.tsx`

### Social
- **Community + Leagues hub** — unified feed/groups/leaderboards (legacy `/feed`, `/arena` now redirect here) — `src/app/community/page.tsx`
- **Group detail / create-group wizard** — `src/app/community/[id]/page.tsx`, `src/app/arena/create/page.tsx`
- **Group live-session banner** — forces presence mode to `group` during a live session (axiom §21) — `CommunitySessionBanner.tsx`
- **Presence / "friends on map"** — live avatars, kudos, privacy switch — `src/features/safecity/`
- **Chat (1:1 inbox)** — `src/app/chat/[chatId]/page.tsx`
- **Activity feed / posts** — `FeedPostCard.tsx`
- **People discovery / partners matching** — `mutual-partners.service.ts`
- **Invite/join flows** — generic group invite `/join/[inviteCode]`, timed exercise-challenge invite `/challenge/[inviteCode]`, event booth QR `/booth/display`

### Profile
- **Profile screen** (self + public) — dashboard/history tabs, public activity grid — `src/app/profile/page.tsx`, `/profile/[userId]`
- **Per-exercise analytics drill-down** — `/profile/exercise/[exerciseId]`
- **Workout history** by mode (strength/running/activity/recovery cards) — `src/features/profile/components/cards/`
- **Edit profile** (name, DOB, photo) — `EditProfileModal.tsx` (DOB has no working edit path post-onboarding, per prior finding)
- **Favorites (saved workouts)** — `src/features/favorites/`

### Leagues / Gamification
- **XP / Level / Coins** — server-owned (axiom §2), client display via `xp.service.ts`, `coin-calculator.service.ts`
- **Lemur avatar / level stages** — `lemur-evolution.service.ts`
- **Achievements / badges** — `achievement.service.ts`, `AchievementUnlockToast.tsx`
- **Streaks** — surfaced on Home/HeroCard — `useDailyActivity.ts`
- **City/school/park leaderboards (Arena)** — `CityArenaView.tsx`, `NeighborhoodLeaderboard.tsx`
- **Military/organizational persona** — self-declare unit, unit badges, reserve-duty status, unit-vs-unit league — `src/app/api/units/declare/`, `UnitLeagueTable.tsx`

### Settings
- **Settings modal** (launched from Home, not a route) — account, notifications, privacy/presence, equipment filter, language, health connect/disconnect, delete-account — `SettingsModal.tsx`
- **Notification preferences** — per-channel opt-out + frequency cap — `notification-prefs.service.ts`
- **Account deletion** — `/delete-data` (public, no-login)
- Only one standalone settings *route* exists: `/settings/refine-levels`; everything else is modal-based.

### Map (discovery, distinct from active navigation)
- **Unified search** — exercises / social / events tabs — `src/app/search/page.tsx`
- **Guest-only lightweight explorer** — map-only mode, no account needed — `src/app/explorer/page.tsx`
- **Saved/favorite places** — `SavedPlacesQuickRow.tsx`

### Notifications
- **Push channels** (opt-out by default): encouragement, health_milestone, training_reminder, system, chat, social, progression, community, retention
- **No in-app notification center/history** — preferences only, no inbox list

### Health / Recovery
- **HealthKit / Health Connect bridge** — `src/lib/healthBridge/`
- **Steps tracking** — `/activity/steps`
- **Recovery videos** — follow-along sessions, own workout type — live in prod, kill-switch available

### Other (hygiene notes)
- **Workout builder (manual)** — `/workout-builder`
- **Progression map** (per-program skill tree) — `/progression`, `/progression-map/[programId]`
- **Roadmap page** — placeholder "coming soon", not a real feature yet
- **Wedding planner** (`src/app/public/wedding/`, `src/features/wedding/`) — unrelated personal side-project living in this repo; excluded from everything below
- **Challenge booth kiosk** — hard-coded to one past event (`LSIT26`), not generalized

---

## 2) Core "Do the Thing" Paths

**Corrected finding:** 3 primary paths + 1 minor. "Free run" is a *variant* of running, not a separate path.

| Path | Status today | Counts for XP/metrics? |
|---|---|---|
| **A. Strength workout at a park** | Fully live, default home surface | Yes — real `awardWorkoutXP` call |
| **B. Running / walking route (incl. free-run)** | Fully live, reachable with zero account/onboarding | XP accrues server-side but **UI shows 0** (hardcoded) |
| **C. Hybrid (run + park strength stops)** | Live, flag-on-by-default, reachable from map idle screen | **No** — XP hard-coded to `0`, deliberate (Phase 2 gate, see CLAUDE.md) |
| **D. Recovery (video-led session)** | Live, minor/secondary | Yes — reuses the normal strength save pipeline |

---

### A. Strength Workout at a Park

```
Home → Hero Workout Card → [assessment gate] → JIT health-declaration (first time only)
  → Workout Preview Drawer → "התחלת אימון" → Active Player (StrengthRunner)
  → exercise/rest loop → Pause/Exit modal (if exited) → Dopamine screen
  → Workout Summary → "Finish" → back to Home
```

| # | Screen | File:line | Key control | Decision point | Abandon risk |
|---|---|---|---|---|---|
| 1 | Home | `src/app/home/page.tsx` | Day strip, tabs, Hero card | — | — |
| 2 | Hero Workout Card | `HeroWorkoutCard.tsx:542` | Whole-card tap, randomized curiosity copy (not a literal "Start" label) | **Gate:** `hasStrengthProgram` (`home/page.tsx:1515`) false → redirected to `/onboarding-new/assessment-visual` instead of a workout | A brand-new unassessed user never sees a plan here at all |
| 3 | JIT health-declaration modal (first start only) | `useRequiredSetup.ts`, `JITSetupModal.tsx` via `interceptWorkoutStart` | Hard-block accept, once per user | No | **Real abandon point** — decline/close and never reach the plan |
| 4 | Workout Preview Drawer | `WorkoutPreviewDrawer.tsx` | Exercise list, location/difficulty/warmup toggles | Location/difficulty choice | **Named abandon risk #1 — viewed, no Play** |
| 5 | Start button | `DrawerFooter.tsx:101` — label **"התחלת אימון"** | Tap → `router.push('/workouts/[id]/active')` | — | Low (committing action) |
| 6 | Active Player mount | `src/app/workouts/[id]/active/page.tsx` → `StrengthRunner.tsx` | — | No resume dialog by default (`STRENGTH_RESUME_CHECKPOINT_ENABLED=false`) — a crash here loses progress | |
| 7a | Exercise screen | `ActiveExerciseView.tsx:337` | Button **"סיימתי"** | Mid-set exercise swap | Exit via native back/pause before finishing a set |
| 7b | Rest screen | `RestScreen.tsx` | "התרגיל הבא" preview; optional **"דלגו על המנוחה"** skip | Skip rest (non-Tabata only) | — |
| 7c | Pause/Exit | `PauseOverlay.tsx` → `ExitConfirmModal.tsx` | "התחילו שוב" (resume) / **"סיום אימון"** (exit) | Resume vs. confirm-exit | **Named abandon risk #2 — mid-workout exit** |
| 8 | Dopamine celebration | `StrengthDopamineScreen` | "Back" tap | No | Transient |
| 9 | Workout Summary | `StrengthSummaryPage.tsx` | "Finish" → `handleSummaryFinish` | No | Backgrounding the app before tapping Finish |
| 10 | Back to Home | — | — | — | — |

**Second entry point (map-direct, architecturally different):** tapping a park pin's **"התחל אימון"** on `ParkDetailSheet.tsx:1199` composes a standalone park workout (`composeParkWorkout`) and opens the *same* Preview Drawer pre-filled on Home. **Notable asymmetry:** this path has **no visible assessment gate** — an unassessed user gets a fallback-level workout instead of being routed to assessment, unlike the Hero-card path. Flag for David — likely unintentional inconsistency.

**XP confirmed live:** `StrengthSummaryPage.tsx:268` calls `awardWorkoutXP` — the only client write path, per axiom §2.

---

### B. Running / Walking Route (map-based; free-run is a variant, not a separate path)

```
Map open → [location gate if needed] → Discovery screen (idle)
  → tap mode pill ("גלה מסלולים" or "אירובי חופשי") → route/goal picker
  → Route Detail / Free-Run config → "התחל אימון" / "התחל חופשי"
  → Active run (map + controls) → pause → long-press "סיים אימון" → Summary
```

| # | Screen | File:line | Key control | Decision point | Abandon risk |
|---|---|---|---|---|---|
| 1 | Map boot | `src/app/map/MapShell.tsx:74` | — | — | Load time only |
| 2 | Location gate (if no authorityId) | `UnifiedLocationStep` (mode="bridge") | Anchor/city picker | Yes | A brand-new user must clear this before seeing the map |
| 3 | Discover screen, idle | `DiscoverLayer.tsx` (`case 'DISCOVERY'`) | Search bar, mode pills | — | — |
| 4 | **Mode-pill tap (hard gate)** | `MapModeHeader.tsx:30` | Pill **"גלה מסלולים"** (only if `hasNearbyRoutes`) / **"אירובי חופשי"** | Yes | **Highest-leverage discoverability gap found:** the curated-route carousel is NOT shown by default — a first-time user who doesn't tap this exact pill never learns routes exist nearby |
| 5a | Curated-route carousel | `BottomJourneyContainer.tsx` | **"צא לדרך"** (reachable) / **"נווט להתחלה"** (unreachable → opens Waze, **exits the app**) | Yes | Waze branch can lose the user entirely |
| 5b | Free-Run drawer (alt entry) | `FreeRunDrawer.tsx:335` | **"התחל חופשי"** (primary) / **"🗺️ עם מסלול"** (secondary) | Yes | Low |
| 6 | Goal sheet (free-run only) | `FreeRunDrawer.tsx:584` | Pills: ⏱ זמן / 📏 מרחק / 🔥 קלוריות | Yes | Low |
| 7 | Route Detail Sheet (2nd tap on curated card) | `RouteDetailSheet.tsx:1128` | **"התחל אימון"** primary, "ניווט" secondary | Yes | Low–medium |
| 8 | Start → session spin-up | `useWorkoutSession.ts:204` | — (no UI) | No | — |
| 9 | Active run | `FreeRunActive.tsx` via `ActiveDashboard.tsx` | **"השהה אימון"** (pause) / "הקפה חדשה" (lap); once paused: "המשך אימון" (resume) / **"סיים אימון"** (700ms long-press, deliberate 2-step stop) | Deliberate friction on stop | A casual tap does not stop the run — needs pause-then-hold; possible first-time confusion |
| 10 | Turn-by-turn overlay (routed runs) | `TurnCarousel` | Swipe | No | Low |
| 11 | Summary | `AerobicSummaryShell` (variant="solo") | **"סיום וחזרה לבית"** | No (guest variant differs) | — |

**Important structural finding:** every map-discovered route — curated or generated — runs with `runMode: 'free'`, never `'plan'`. The dedicated "plan"/"guided route" views only activate via a Home-initiated deep link, not from map discovery. Treat map-discovered running as one mechanism for instrumentation purposes, regardless of whether the route was curated or generated.

**XP not shown:** `WorkoutSummaryPage.tsx` hardcodes `xpEarned={0}` at all 4 call sites — a first-time runner sees **no XP confirmation at all** on completion (XP does accrue server-side; only the UI is silent).

**Stale-doc flag:** `.cursorrules`' "generated routes → WorkoutDrawer" law no longer matches the code — `WorkoutDrawer` doesn't exist; `BottomJourneyContainer` now renders all route types in one carousel. Don't use the old rule as an instrumentation source.

---

### C. Hybrid (Run + Park Strength Stops)

```
Map idle → tap "מה עושים היום? ✨" → slot carousel → compose preview
  → Hybrid Overview sheet → "התחל אימון" → Active (run leg ↔ station leg, alternating)
  → "סיים אימון משולב" → Summary (tabs: סקירה/אירובי/כוח/סטטיסטיקה)
```

| # | Screen | File:line | Key control | Note |
|---|---|---|---|---|
| 1 | Map idle entry nudge | `DiscoverLayer.tsx:1623` | `ShimmerPhraseButton` "מה עושים היום? ✨" | Gated by `enableHybridSlots` only |
| 2 | Slot carousel | `HybridSlotCarousel.tsx` | Card CTA "צא לדרך" / "יוצאים מיד" | Auto-composes a live preview route, no save yet |
| 3 | Compose | `start-hybrid-session.ts:1002` | — | **Dead-end risk:** no strength assessment + no equipped park nearby → `needsAssessmentSession()` returns an empty plan with only an assessment link — not a runnable workout |
| 4 | Hybrid Overview sheet | `HybridOverviewScreen.tsx:587` | Sticky **"התחל אימון"** | Strong **viewed-but-no-Play** point — full plan/route/stations shown, "אין אני רוצה" back button |
| 5 | Active — aerobic leg | `FreeRunLayer.tsx` | Standard run HUD | — |
| 6 | Approach a station | `HybridStationLayer.tsx:108` | **"📍 הגעתי לתחנה"** / "✕" skip | GPS-distance gated |
| 7 | At station | `HybridStationLayer.tsx:78` | `StrengthRunner` embedded full-screen; "דלג על התחנה" | Same player as path A, embedded |
| 8 | Final leg | `HybridStationLayer.tsx:127` | **"🏁 סיים אימון משולב"** | Unconditional finish |
| 9 | Summary | `HybridSummary.tsx` | Tabs + "סיום" | `xpEarned` always 0 |

**Second entry point:** `FreeRunDrawer`'s "תחנות כוח" toggle reaches the identical compose pipeline — i.e. a user configuring a plain run can pivot into hybrid from the same drawer used in path B.

**Why hybrid doesn't fully "count" yet:** `hybrid-save.service.ts` hard-codes `earnedCoins: 0` with an explicit code comment — "no `awardWorkoutXP` call here — display-only," matching CLAUDE.md's documented Phase-2 gate against double-counting. A completed hybrid session saves to history and counts toward streak/rings/daily-goal, but never awards real or displayed XP.

---

### D. Recovery (minor, secondary path)

Video-led follow-along session. Reuses the strength player/active-page shell (`workoutType: 'recovery'`), has its own Home shortcut, writes real history and syncs streak/rings via the normal `awardWorkoutXP`-eligible path (nothing in the save path excludes it). Does not consume weekly-volume budget. Not a design focus for the golden-path redesign, but it is a real, completable, XP-eligible activity — worth including in any activation metric definition.

**Confirmed NOT a separate path:** cycling (explicitly "בקרוב"/coming soon, disabled), Tabata finisher (an internal generator option, not a standalone activity), steps/HealthKit sync (passive display metric only, no streak/XP linkage).

---

## 3) Entry Intents

The first screen (`src/app/page.tsx`, Landing) offers exactly **two** choices — and they are *not* symmetric:

| Button | Prominence | Goes to | Track choice shown? |
|---|---|---|---|
| **"הרשמה מהירה"** (Quick Signup) | Primary CTA | Anonymous sign-in → `onboarding_path='MAP_ONLY'` → `/explorer` → `/map` | **No — bypasses any track choice entirely** |
| **"התחברות"** (Login) | Secondary | Real Google/Apple auth → `/gateway` (only because no profile doc exists yet) | Yes, see below |

**The actual first multi-path decision screen is `/gateway`**, reached via the secondary button, a direct deep link, or an ambiguous return-user state — **not** via the prominent primary CTA. A user who taps the most visible button on the very first screen never sees a track choice at all; they land straight in map-exploration mode.

`/gateway`'s three cards:

| Card | Label | Shown when | Leads to |
|---|---|---|---|
| A | "גלו את המפה" | Always | Same anonymous map-only flow as Quick Signup |
| B | "תוכנית ריצה" | **Only if `enableRunningPrograms` flag is on — default is `false`** | Running onboarding track |
| C | "תוכנית כוח" | Always | Strength onboarding track |

**Material finding:** running is not a selectable entry intent for an ordinary user today — the flag that reveals the running card defaults off. In practice there are only two live entry intents: **"explore the map" (anonymous, no questionnaire)** and **"get a strength plan" (full onboarding)**. A user can still end up running (path B above) purely through map discovery, without ever choosing "running" as an intent — see §6 for why that matters.

---

## 4) Current Onboarding

Shared first step for both real tracks: **`/onboarding-new/profile`** — name/gender/DOB form.

### Strength track
`profile` → `program-path` (pick 1 of 3 focus cards) → `assessment-visual` (why → tier → per-category sliders → result, multi-step) → `health` (declaration) → `health-connect` (HealthKit/Health Connect opt-in, soft — never blocks) → **`/home`**

### Running track (flag-gated off by default — see §3)
`profile` → `dynamic` (adaptive questionnaire, `DynamicOnboardingEngine`) → `running-schedule` → `running-plan-length` → `running-summary` → `health` → `health-connect` → **`/home`**

### Map-only / explorer track
`/explorer` → `UnifiedLocationStep` (GPS or city picker) → **`/map`** directly. No profile, no health screen, no questionnaire at all — true guest browsing, and it **never visits Home**.

### Where onboarding ends vs. where the gap begins
Both real tracks end at `/onboarding-new/health-connect`, which redirects to `/home`. But landing on Home is **not** the same as reaching first activity:

1. If the user's weekly schedule isn't set (`onboardingStatus==='PENDING_LIFESTYLE'`), a **`BlurryBridgeOverlay`** — a full-screen blurred glass card ("בוא נכניס הכל ללו״ז" / "3 דקות") — blocks interaction until the user starts a schedule wizard or explicitly skips. This is a real, forced extra screen sitting between "onboarding complete" and "usable Home."
2. Tapping the Hero Workout Card on Home is **not guaranteed to open a workout** — if `hasStrengthProgram` is false (which it is immediately after the assessment, until `progression.domains` is populated — timing not independently confirmed), the user is redirected back into assessment instead.
3. A **second, separate** health-declaration hard-block (`JITSetupModal`, via `useRequiredSetup`) fires on the very first workout-start attempt, on top of the health screen already completed during onboarding — likely to read as redundant/confusing ("didn't I already answer this?").

**This is the 79%-drop-off gap, concretely:** Onboarding Ends (`/home` redirect) → [BlurryBridgeOverlay] → [Hero Card tap, possibly re-diverted] → [JIT health re-ask] → [Preview Drawer, a real view-but-no-Play point] → [Start]. That's up to 4 additional screens/gates after "onboarding complete" before the user even sees a workout plan to decide on.

---

## 5) Micro-Steps to First Activity

Two very different real paths exist today — the gap between them is itself a major finding.

### Path 1 — Mainline (Strength track, full onboarding) — ~13 taps to Play

1. Tap "התחברות" (Login)
2. Complete Google/Apple auth (external OS flow)
3. Tap "תוכנית כוח" card (Gateway)
4. Fill identity form + submit (`/onboarding-new/profile`)
5. Pick 1 of 3 focus cards + continue (`program-path`)
6. Assessment: why → tier → sliders → accept result (`assessment-visual`, ~3-4 taps bundled)
7. Health declaration + continue (`health`)
8. Health-Connect opt-in or skip (`health-connect`)
9. Land on `/home` → BlurryBridgeOverlay: skip (or start wizard)
10. Tap Hero Workout Card
11. JIT health-declaration modal: accept (first time only)
12. Workout Preview Drawer opens — review, tap **"התחלת אימון"**
13. → **Play pressed**

Then +2 more taps to reach "completed": Dopamine screen "Back" → Summary "Finish."

**Viewed-but-no-Play point:** step 12 (Preview Drawer) — the single most exposed abandon point on this path; everything before it is a forced funnel, this is the first moment the user can see the real plan and choose not to proceed.

### Path 2 — Shortest path found in the app today (Free-Run via map, anonymous) — ~5-6 taps to Play

1. Tap "הרשמה מהירה" (Quick Signup) — anonymous, no form
2. Confirm location (`/explorer` → GPS or city pick)
3. Land on `/map`
4. Tap "אירובי חופשי" mode pill
5. In Free-Run drawer, tap **"התחל חופשי"** (or pick a goal pill first — +1 tap)
6. → **Play pressed**, no account, no questionnaire, no health screen

**This path requires zero account creation and zero onboarding screens**, yet it is not surfaced as "the fast way to start" anywhere in the funnel — the Landing page's primary CTA sends the user into map exploration generically, not explicitly toward "start a run right now." This asymmetry (13 taps + a full profile vs. ~5 taps + no account, for two activities that are both real, completable, XP-eligible activations) is the single most actionable finding for a golden-path redesign.

**Open question, not fully traced — flag before relying on it:** whether an anonymous map-only user can also reach the *strength* path via a direct park-pin tap (`ParkDetailSheet` → "התחל אימון") without ever visiting `/home`. The consuming mechanism for that start action lives in a `home/page.tsx` effect; it's unconfirmed whether that effect fires for a user who has never mounted Home. Worth a direct device check before citing a tap-count for "shortest strength path."

### Viewed-but-no-Play inventory (all paths)

| Path | Screen | Why abandonable |
|---|---|---|
| Strength | Workout Preview Drawer | Full plan shown, no commitment yet |
| Running | Route Detail Sheet / Free-Run goal sheet | Full route/goal shown before Start |
| Running | Curated carousel's "נווט להתחלה" (unreachable route) | Exits the app to Waze — may never return |
| Hybrid | Hybrid Overview sheet | Full plan + stations shown, explicit "אין אני רוצה" back button |
| Hybrid | Assessment-needed dead-end | Shown a non-workout (just a link) on first attempt |

---

## 6) Friction & Notes

**Highest-leverage findings, ranked:**

1. **The fastest real activation (free-run, ~5 taps, zero account) is structurally invisible as a "fast path."** The Landing page's primary CTA doesn't message "go for a run right now" — it's generic map exploration. A golden-path redesign could lean directly into this existing short path instead of building a new one.
2. **The running "track" as a *questionnaire/program* is flag-gated off by default** (`enableRunningPrograms=false`), yet running as an *activity* is fully reachable and completable via the map with no questionnaire at all. These are two unrelated systems today; conflating them in planning will misstate the actual gap.
3. **The curated-route carousel on the map is hidden by default** behind a mode-pill tap that only appears when `hasNearbyRoutes` — a first-time map visitor can look at the map and never learn a nearby route exists. This is arguably the single biggest, cheapest fix available: pre-select or auto-surface that pill for new users.
4. **The strength funnel has 4 extra gates after "onboarding complete"** before a workout plan is even visible (BlurryBridgeOverlay → Hero-card re-diversion risk → duplicate JIT health check → Preview Drawer). Each is a plausible drop-off point; the JIT health re-ask in particular duplicates a screen already completed minutes earlier in the same session.
5. **Two structurally different "start a strength workout" entry points (Hero card vs. park-pin) apply the assessment gate inconsistently** — one redirects unassessed users to assessment, the other silently falls back to a default level. Worth confirming with David whether this is intentional.
6. **No XP is shown on completion for running or hybrid** (`xpEarned` hardcoded to `0` in both summary screens, even though it genuinely accrues server-side for running). A first-time completer of either path gets no visible positive reinforcement — a plausible retention (not completion) risk worth flagging even though it's outside this doc's immediate scope.
7. **Hybrid has a real first-attempt dead-end**: an unassessed user with no equipped park nearby sees an empty "go complete assessment" plan instead of a workout the very first time they try it.
8. **A mid-run exit to Waze (unreachable curated route) takes the user fully out of the app** with no guaranteed return path back into the funnel.
9. **Terminology/doc hygiene** (useful for whoever instruments this next): `.cursorrules`' "generated routes → WorkoutDrawer" rule is stale — that component doesn't exist; all map routes now render through `BottomJourneyContainer`. `FullMapView.tsx` is orphaned. A "generated-route-via-Builder" CTA branch (`isGenerated` in `BottomJourneyContainer`) points at dead code (`BuilderLayer` is currently unreachable) — harmless today only because nothing produces that route shape in the live tree; a latent silent dead-end if that path is ever reconnected without also fixing the missing `showDetailsDrawer` consumer.

**Not investigated in this pass (flag for follow-up if needed):** exact device-level timing of `hasStrengthProgram` becoming true right after assessment; whether the anonymous map-only→park-pin strength start actually works without a Home visit; cross-track behavior for a user who completes strength onboarding then later wants a run (does the running UI appear, or is it still gated by the same off-by-default flag regardless of track taken?).

---

*Compiled 2026-10-05 from 5 parallel code-tracing passes against `origin/main@7628b18b`, worktree `product-feature-flow-map`. Read-only — no code changed.*
