# Investigation: First-Run Gateway Flow + Missing Home Strength Card

**Type:** Read-only investigation (no code changed). Deliverable for brainstorming next steps.
**Checked out against:** `origin/main` @ `dc6532ed4301017a1ea50d1439312f43341f7197` (2026-09-19).
**Scope respected:** XP/progression internals, the difficulty ladder, and the workout-engine's calculation logic were not analyzed — only the routing/gating/UI-state logic that decides which card/screen renders.

---

## TL;DR — root cause

The gateway's **"גלו את המפה" (discover the map) card** calls `handleExploreMap`
(`src/app/gateway/page.tsx:270-393`), which does an unconditional Firestore
`setDoc(..., { merge: true })` (`:294-332`) that **wipes `progression.domains` back to `{}`**
for whatever uid is currently signed in — with no check for whether that uid already has a
real, assessed strength profile.

Because `merge: true` still fully replaces any field path that is explicitly present in the
payload, `domains: {}` overwrites — not merges into — the user's real assessed-domain map.
Every place in the app that decides "does this user have a strength program?" reads exactly
that field, so once it's wiped:

- `full-strength.generator.ts:210-213` sees `hasAnyAssessedDomain === false` and the generator
  self-excludes (`generate()` returns `null`).
- `access-control.service.ts:144-150` (`hasAssessedStrengthDomain`) also flips to `false`,
  which is what `home/page.tsx:1514` reads into `hasStrengthProgram`.

With `full-strength` out of the running pool, the **only** generator left standing is
`safety-net`, whose `eligible: () => true` (`safety-net.generator.ts:56`) makes it a
guaranteed fallback. That's the "מצא לי מסלול" card — it isn't a new feature replacing the
strength card, it's the pool's designed floor value showing up alone because the real
candidate got disqualified.

**This is a data-integrity bug in the gateway map handler, not a UI/flag regression** — no
strength-card component was removed, and no flag toggles it off. See §3 for the full trace and
§"How a real user hits this" below for the reachability path.

The team already hit and fixed this exact bug class once, elsewhere, but the fix was never
ported to the gateway: `onboarding-sync.service.ts:1841-1882` added an `alreadyHasPrimaryTrack`
guard (02.09.2026) specifically to stop re-entry from overwriting an existing user's track.
`handleExploreMap` has never had an equivalent guard.

### How a real strength user actually hits this

`/gateway` renders its two clickable cards immediately on mount
(`gateway/page.tsx:465-639`) and only *asynchronously* redirects already-onboarded users away
via an `onAuthStateChange` + `getDoc` effect (`:117-178`, redirect for `COMPLETED` at `:165-166`).
That lookup can take up to `PROFILE_LOOKUP_TIMEOUT_MS` (8s) under slow network/App Check —
the same risk is explicitly called out for the sibling root page (`src/app/page.tsx:22-29`,
`:444-458`). `/gateway` is also a legitimate deep-link target
(`src/lib/native/init.ts:97-102,338` — `/gateway?ref=<uid>` referral landing) and reachable via
browser back-navigation or a stale bookmark on web. Anyone who lands on `/gateway` inside that
redirect window and taps the "גלו את המפה" card (larger, first, most visually prominent) fires
the destructive write against their **real, existing uid** — `resolveUser()` reuses the current
signed-in user rather than minting a new guest.

**Note:** the ordinary bottom-nav "מפה" tab (`BottomNavbar.tsx:49` → `/map`) was checked and
does **not** touch `progression`/`onboardingPath`/`dashboardMode` at all — a strength user
casually browsing routes through the normal in-app map does not trigger this. The bug is
specific to the **gateway's** map card / `handleExploreMap`.

---

## 1. Gateway flow ("מה מתאים לך?")

File: `src/app/gateway/page.tsx`. Hebrew heading at line 494.

**Card A — "גלו את המפה"** (`:501-551`, `onClick` at `:510` → `handleExploreMap`, `:270-393`):
1. `resolveUser()` (`:186-192`) — reuses `auth.currentUser` if already signed in
   (including anonymous); otherwise `signInGuest()` (`auth.service.ts:461-468`, Firebase
   `signInAnonymously()`), which resolves to the *existing* anonymous user if one is already
   signed in — it does not mint a new uid for a returning guest.
2. `setOnboardingPref('gateway_uid', user.uid)`, `setOnboardingPref('onboarding_path', 'MAP_ONLY')`
   (`:286-287`) — correctly routed through `src/lib/onboardingPrefs.ts` per the durable-flag
   convention (axioms.md §19).
3. `setDoc(doc(db, 'users', user.uid), {...}, { merge: true })` (`:294-332`) — **the destructive
   write**. Sets `onboardingPath: 'MAP_ONLY'`, `onboardingStatus: 'MAP_ONLY'`,
   `core.trackingMode: 'wellness'`, `core.mainGoal: 'healthy_lifestyle'`, and wipes
   `progression.domains: {}`, `progression.activePrograms: []`,
   `progression.unlockedBonusExercises: []` — unconditionally, no existing-profile check.
4. `router.push('/explorer')` (`:387`) — bypasses `/onboarding-new/profile` entirely.

Raw (non-durable) `localStorage` use in this handler is limited to one-shot deep-link
consumption keys — `pending_invite_code`/`pending_group_id`/`group_inviter_uid`/
`pending_session_token`/`pending_run_invite` (`:203-267, 351-355, 419-423`) — which is fine
per axioms.md §19 (short-lived hints, not durable cross-launch flags).

**Card B — "תוכנית ריצה"** (`:553-588`, gated by `flags.enableRunningPrograms` at `:554`):
`onClick` → `handleGetProgram('RUNNING')` (`:560`).

**Card C — "תוכנית כוח"** (`:590-632`, `onClick` at `:599`) → `handleGetProgram('STRENGTH')`.
`handleGetProgram` (`:396-463`): `resolveUser()`, then `setOnboardingPref('gateway_uid', ...)`
and `setOnboardingPref('gateway_track', track)` (`:409-410`) — **no destructive Firestore
write**, unlike the map path. Lands on `/onboarding-new/profile` (`:457`), unless a pending
invite/group/session redirect intercepts first (`:429-455`).

**Second screen after gateway:** both the running and strength tracks land on
`/onboarding-new/profile` (identity form), which reads the durable `gateway_track` pref to
branch into `/onboarding-new/program-path` (strength) or `/onboarding-new/dynamic` (running) —
`onboarding-entry.ts:95-106` (`resolveOnboardingEntryHref`),
`onboarding-new/program-path/page.tsx:99-104`. **The map track skips this screen entirely**
and goes straight to `/explorer`.

**The async auto-redirect** for already-authenticated/completed users
(`gateway/page.tsx:117-178`) is the race window described above — gated only by
`isBusyRef.current` and an un-timed `getDoc`, with no loading gate over the cards.

---

## 2. Home page card logic ("האימון היומי שלך")

File: `src/app/home/page.tsx`. Heading at `:2994`.

Controlling condition, `readyPreWorkoutSuggestions` (`:2941-2947`):

```
HOME_PRE_WORKOUT_SUGGESTION_CAROUSEL_ENABLED
&& isViewingToday
&& !isTodayWorkoutDone
&& preWorkoutSuggestions
&& preWorkoutSuggestions.length > 0
```

- `HOME_PRE_WORKOUT_SUGGESTION_CAROUSEL_ENABLED = true` (`src/config/feature-flags.ts:1330`).
- `preWorkoutSuggestions` comes from an effect (`home/page.tsx:1204-1267`) calling
  `runSuggestionEngineStreaming(context, ...)` (`:1242`, `suggestion-engine.ts`) with
  `surface: 'home'`, taking the top-3 ranked suggestions (`:1252`). `safety-net` is stripped
  from that list *only* when the step goal is already met (`:1253-1260`) — it is never removed
  just because a strength suggestion also exists.
- When falsy (loading, or resolved empty), the page falls back to the legacy
  `<StatsOverview ... hasCompletedAssessment={hasStrengthProgram} />` anchor (`:2936, 2953-2960,
  3116-3122`).

Per-suggestion card choice is `PreWorkoutCardRenderer`
(`src/features/home/components/PreWorkoutCardRenderer.tsx`):
- `generatorId ∈ {'full-strength', 'recovery-follow-up'}` → `HeroWorkoutCard` (`:229-248`) —
  the strength hero card.
- `generatorId === 'safety-net'` → `ConnectStepsCard` if health isn't connected (`:251-253`),
  else a resolved real-route `SuggestionCard` (`:254-267`), else the generic "מצא לי מסלול"
  card with live steps-remaining (`:274-283`) — **this is the card shown today.**
- anything else → generic `SuggestionCard` (`:286`).

**There is no standalone boolean like "showStrengthCard."** Which card wins is entirely a side
effect of generator eligibility + `generate()` output, ranked:
- `full-strength.eligible = () => profile !== null` (`:197`); self-excludes inside `generate()`
  via `hasAnyAssessedDomain` (`:209-213`, quoted in TL;DR).
- `safety-net.eligible = () => true` (`:56`) — always produces a suggestion (the guaranteed
  floor).
- `recovery-follow-up.eligible = () => profile !== null` (`:82`); self-excludes if
  `buildRecoveryFollowUpWorkout(profile)` is falsy (`:84-89`) — in practice needs prior
  workout/domain history, so also fails once `domains` is wiped.
- `route` / `full-park-workout` / `anchor-loop` never compete on the home surface because
  `buildHomeUserContext` is always called with `location: null` there (`home/page.tsx:1220-1222,
  1234-1241`), and those generators require a real location.

---

## 3. The bug — is there a dedicated strength-card component, and where did it go?

**No dedicated `StrengthCard` / `DailyWorkoutCard` / `StrengthPromptCard` component has ever
existed** in this repo (checked full history — `git log --all --diff-filter=D` and
`git log --all --name-only`, no matches). The "strength card" has always been produced by the
generic suggestion pipeline above, rendered as a `HeroWorkoutCard` when `full-strength` wins.

So nothing was deleted or replaced — the same code path that has always rendered the strength
card is still there; it's just losing the eligibility check because the underlying data got
wiped. Root cause is fully covered in the TL;DR and §1.

**Two legacy/dormant duplicates worth flagging** (same "misleading-name" pattern as
`FreeRunActive`/`FreeRunLayer`):
- `WorkoutSelectionCarousel` (home) is explicitly documented as **flag-dormant today** because
  `HOME_ANCHOR_V2_ENABLED` routes around it
  (`src/features/workout-engine/core/components/SuggestionCarousel.tsx:8`). Its exports
  (`BuildCustomButton`, `CarouselSkeleton`) are still imported into `home/page.tsx:100` even
  though the component itself is unreachable — dead code kept alongside the live path.
- `StatsOverview.tsx:1083` renders its **own independent copy** of the "האימון היומי שלך"
  heading and its own `generateHomeWorkoutTrio`/`hasCompletedAssessment` gate
  (`:263, 343, 1032, 1097, 1107, 1116-1117, 1195`) — this is the fallback path
  `home/page.tsx:3116-3122` uses whenever the new carousel has no ready suggestions. Both the
  new and legacy heading-renderers key off the **same** underlying signal
  (`hasStrengthProgram = hasAssessedStrengthDomain(profile)`, `home/page.tsx:1514`), so wiping
  `progression.domains` hides the strength card under *either* code path — this is not a
  carousel-specific regression, it's upstream of both.
- Also found: `access-control.service.ts` used to contain a **second, buggy**
  `hasCompletedAssessment` function that treated `onboardingStatus === 'COMPLETED'` as
  sufficient proof of a strength assessment — deleted 04.09.2026 (doc comment still at
  `access-control.service.ts:137-142`). Direct textual evidence this exact "onboarding-complete
  ≠ strength-assessed" confusion has already bitten this codebase once before.

**Flags checked and ruled out as the cause:** `HOME_ANCHOR_V2_ENABLED`,
`HOME_PRE_WORKOUT_SUGGESTION_CAROUSEL_ENABLED`, `IS_CHEAP_SUGGESTION_RANKING_ENABLED` are all
`true` at `dc6532ed` and all route through the *live* `hasAnyAssessedDomain` check — none of
them gate a dormant/inverted branch relevant to this bug. `enableRunningPrograms` only affects
the gateway's running card and the running/hybrid clamp in `useDashboardMode`.
`RUNNING_ONBOARDING_GATE_ENABLED` only gates the separate `SmartWeeklySchedule` card. None of
these explain the symptom — the data wipe does.

---

## 4. Strength questionnaire (שאלון) — every entry point

| Entry point | File:line | Trigger |
|---|---|---|
| Gateway "תוכנית כוח" card | `gateway/page.tsx:590-632` (onClick `:599`) | `handleGetProgram('STRENGTH')` → `setOnboardingPref('gateway_track','STRENGTH')` (`:410`) → `/onboarding-new/profile` |
| Profile-completion checklist item | `home/page.tsx:141-148` (`handleGoToStep`) | Tapping an incomplete strength checklist item → seeds `gateway_track='STRENGTH'` → `router.push(item.jitPath)` |
| `ConsistencyWidget` "הוסף תוכנית כוח" | `features/home/components/rows/ConsistencyWidget.tsx:171-172` | `resolveOnboardingEntryHref(profile, 'STRENGTH')` |
| `ProgramProgressRow` | `features/home/components/rows/ProgramProgressRow.tsx:45` | same `resolveOnboardingEntryHref` pattern |
| `StrengthVolumeWidget` upsell | `features/home/components/widgets/StrengthVolumeWidget.tsx:130` | `seedOnboardingTrackEntry(profile, 'STRENGTH')`; shown when `dashboardMode === 'RUNNING' && strengthIncomplete` (`:97-99`) |
| Shared resolver | `features/user/onboarding/utils/onboarding-entry.ts:79-106` | Seeds `gateway_track` via the correct `onboardingPrefs` API (`:83`); routes to `/onboarding-new/program-path` (known identity) or `/onboarding-new/profile` (unknown identity) |
| The questionnaire itself | `app/onboarding-new/program-path/page.tsx:99` (`getOnboardingPref('gateway_track')`) | Branches STRENGTH → `STRENGTH_PHASES` (`:11`), RUNNING → `/onboarding-new/dynamic` |

All of these route correctly through `onboardingPrefs.ts` — **none reproduce the destructive
overwrite.** That bug is unique to the gateway's map-card handler.

---

## 5. Running vs. strength branching + flags/variants

**Dashboard-mode resolution** — `src/hooks/useDashboardMode.ts:29-133`, in order:
1. `user.lifestyle.dashboardMode` explicit override
2. `user.lifestyle.primaryTrack` → `TRACK_TO_MODE` (`:11-16`: `health→DEFAULT,
   strength→PERFORMANCE, run→RUNNING, hybrid→HYBRID`)
3. Legacy keyword-sniffing of raw onboarding answers (`:60-124`)
4. Fallback `DEFAULT`

`enableRunningMode` param clamps `RUNNING`/`HYBRID` → `DEFAULT` when `false`
(`home/page.tsx:325`: `useDashboardMode(profile, featureFlags.enableRunningPrograms)`).

**`primaryTrack`/`dashboardMode` writers:**
- `onboarding-sync.service.ts:917-929` — Persona Engine sets both from onboarding answers.
- `onboarding-sync.service.ts:1841-1882` — "running bridge" completion path, **with** the
  `alreadyHasPrimaryTrack` re-entry guard (added 02.09.2026, comment `:1855-1869`) that
  `handleExploreMap` lacks.

**Admin-configurable flags** (`src/hooks/feature-flag-defs.ts:39-58`):
- `enableRunningPrograms` (default `false`, super-admin `true`) — gates gateway's running card
  and the running-mode clamp above.
- `enableCommunityFeed`, `enableLeagues`, `maintenanceMode`, `enableHybridSlots`,
  `enableFullParkWorkout`, `enableRouteStops`, `enableRecommendedHybrid` — unrelated to this
  investigation.

**Compile-time flags** (`src/config/feature-flags.ts`):
- `HOME_ANCHOR_V2_ENABLED = true` (`:345`) — new single-hero anchor vs. legacy
  `WorkoutSelectionCarousel` (dormant).
- `HOME_PRE_WORKOUT_SUGGESTION_CAROUSEL_ENABLED = true` (`:1330`) — new engine-driven carousel
  vs. legacy `StatsOverview`-hosted anchor fallback.
- `IS_CHEAP_SUGGESTION_RANKING_ENABLED = true` (`:254`) — live branch in
  `full-strength.generator.ts` containing the `hasAnyAssessedDomain` check; the file also has a
  dead, currently-unreachable real-generation branch (`:233-258`) below it.
- `RUNNING_ONBOARDING_GATE_ENABLED = true` (`:1481`), with a **runtime `localStorage` override**
  `OUT_RUNNING_GATE` (`home/page.tsx:301-314`, `isRunningOnboardingGateEnabled()`) — a
  device-local A/B override, same pattern as other dormant toggles elsewhere in the codebase
  (not otherwise investigated here).
- `POST_WORKOUT_SUGGESTION_CAROUSEL_ENABLED = true` (`:1299`) — sibling flag for the
  post-workout surface; noted for completeness, out of scope otherwise.

**Legacy/duplicate-name components** (the `FreeRunActive`/`FreeRunLayer`-style pattern):
- `WorkoutSelectionCarousel` (home, dormant) vs. the new `SuggestionCarousel`
  (`workout-engine/core/components/SuggestionCarousel.tsx`).
- `HybridSlotCarousel` (map-specific, still live) — a third, intentionally separate carousel
  implementation (`SuggestionCarousel.tsx:9-18`).
- Two independent live renderers of "האימון היומי שלך" — `home/page.tsx:2994` (new) and
  `StatsOverview.tsx:1083` (legacy fallback) — selected by `readyPreWorkoutSuggestions`.

---

## Recommendation (for the brainstorm, not applied)

The fix belongs in `handleExploreMap` (`gateway/page.tsx:270-393`), specifically the `setDoc`
at `:294-332`: it must stop unconditionally scaffolding `progression`/`core`/`onboardingPath`/
`onboardingStatus` for a uid that may already have a real profile. The precedent already exists
in this codebase — `alreadyHasPrimaryTrack` in `onboarding-sync.service.ts:1870-1882` — read
the existing doc first (the gateway's own auto-redirect effect at `:117-178` already does this)
and skip or short-circuit the destructive write whenever a completed or strength-assessed
profile is found for that uid.

No code was changed as part of this investigation.
