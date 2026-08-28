# Phase 0 Implementation Plan + Phase 1 Reconnaissance — Push Notification Engine

**Status: PLAN ONLY. No code written, no git operations performed.** Grounded via 5 rounds of direct code investigation (3 Explore passes + 2 Plan-design passes) plus my own direct re-read of the two most load-bearing files (`push.service.ts`, `onGroupMemberJoin.ts`) and 3 confirmation greps — every claim below traces to a specific file:line, not an assumption.

## Context

The push-engine capabilities audit (`.claude/knowledge/push-engine-capabilities.md`) found the engine can send push reliably but cannot target by persona, has 3 senders that bypass every admin safety control, has a live 404 deep-link bug, and has 5 different incompatible persona vocabularies scattered across the codebase. David locked 4 decisions on how to proceed (canonical persona + alias map, `getBestMessage`-to-FCM is new work, push is a connector not a builder, main-only + flag-gated workflow). This plan turns those decisions into an execution-ready Phase 0 (build now) and a Phase 1 reconnaissance map (where things would hook in — not built yet).

`push.service.ts`'s own header comment already documents Phase 0's Item 1 as known, intentional tech debt: *"Existing triggers (sendPushFromQueue, chatMessageNotification, onboardingDropoffDispatcher) retain their own delivery paths until a future consolidation pass."* This plan is that consolidation pass.

## Locked decisions (recap, not up for relitigation)

1. Canonical persona = onboarding `PersonaStep.tsx` enum (`parent/student/pupil/office_worker/reservist/soldier/vatikim/pro_athlete` + `generic`). Build an **additive alias map** — nothing in the 5 source vocabularies gets renamed.
2. Extending `getBestMessage`'s selection pattern to FCM is **new work**, not reuse of `smart_messages`/`MessageService`.
3. Push is a **connector**: deep-links land on the existing in-app entry point with a type hint; push never builds new workout pages.
4. Workflow = **main-only**, no long-lived branches, every behavioral change behind a flag defaulted `false`, diff reviewed per push. This whole task is plan-only.

---

## Phase 0 — Implementation Plan

### Item 1 — Route the 3 bypass senders through `push.service.ts`

All three currently call `admin.messaging().sendEachForMulticast()` directly, duplicating `push.service.ts`'s own pref-filter and token-prune logic, and skip its quiet-hours/rate-cap/kill-switch guardrails entirely.

#### 1a. `chatMessageNotification.ts` — build first (lowest risk)

- **Files/functions**: `functions/src/chatMessageNotification.ts` — FCM call `:184` (loop `:181-204`), inline pref filter `:118-137` (near-duplicate of `push.service.ts:207-219`), inline token-prune `:207-237`, `chatNotificationsEnabled` flag read `:80-90` (`app_config/feature_flags`, strict `=== true`, default OFF).
- **The change**: keep `chatNotificationsEnabled` exactly as today's outer pre-check, unconditionally — do not retire it (retiring would flip chat's default from off to effectively-on and lose the cheap early-exit for the common "chat push is off" case). Add a flag-gated branch: `false` (default) keeps today's inline path byte-identical; `true` resolves `chatData.participants` minus sender (already a flat array, `:99-104`) and calls `sendPush({ toUids, channel:'chat', title, body, deepLink, data, rateCapHours:0, skipQuietHours:true })`. `rateCapHours:0`/`skipQuietHours:true` are deliberate — chat has neither today, and must not silently start being suppressed/throttled as a side effect. Once soaked, delete the now-dead inline filter/prune code in a separate follow-up commit.
- **The risk**: this is the first time `notification_configs.channels.chat.enabled` (the admin Notifications page's chat toggle) will actually do anything — confirmed today it's dead wiring, `chatMessageNotification.ts` never reads that doc. If any admin already flipped it off believing it worked, chat push silently stops the moment this ships. **Mitigation**: check the live value of `notification_configs.channels.chat.enabled` before flipping this flag to `true`.
- **The flag**: `app_config/feature_flags.pushRouting_chatMessageNotification` (boolean, default `false`/absent). Same doc/pattern already used by `chatNotificationsEnabled`.

#### 1b. `sendPushFromQueue.ts` — build second

- **Files/functions**: `functions/src/sendPushFromQueue.ts` — FCM call `:213-216` (loop `:210-239`), `resolveAudience()` `:288-362` (active/inactive branch `:304-324` does a full `.get()`, not `.select()`), `collectTokens()` `:390-430`, result write `:246-254`, local narrower `PushChannel` subset `:53-57`.
- **The change**: two unflagged prerequisite fixes (safe regardless of the routing flag): change the active/inactive query to `.select('lastActive')` instead of full-doc fetch (removes a doubled-read problem before it can bite), and import the shared `PushChannel` type instead of the local subset. Then a flag-gated branch: `false` (default) = today's path; `true` = `resolveAudience()` → `Array.from(uids)` → `sendPush({ toUids, channel, title, body, deepLink, data:{messageId,authorityId,...}, rateCapHours:0, skipQuietHours:true })`, mapping `SendPushResult` onto the same `push_messages/{id}` status fields (`delivered→deliveredCount`, `failed→failedCount`, `tokensPruned→tokensRemoved`). `rateCapHours:0`/`skipQuietHours:true` preserve today's "admin broadcasts, any hour, never throttled" behavior explicitly rather than silently changing it via `sendPush()`'s defaults (24h cap, quiet-hours enforced).
- **The risk**: if the explicit opt-outs above are skipped, a broadcast sent at 23:00 IST silently vanishes (quiet hours) or a second broadcast to the same audience within 24h silently under-delivers (rate cap) — with `push_messages` still reporting success, just a lower count, no error surfaced to the sending admin. Separately: `push.service.ts` is a shared module imported by 5 already-live callers (`onLevelUp`, `retentionScheduler`, `trainingReminderScheduler`, `onGroupMemberJoin`, `onKudosCreated`) — any edit to it ships to all of them on their next redeploy regardless of which function name is explicitly targeted by `firebase deploy --only`.
- **The flag**: `app_config/feature_flags.pushRouting_sendPushFromQueue` (boolean, default `false`).

#### 1c. `onboardingDropoffDispatcher.ts` — build last (sharpest edge case)

- **Files/functions**: `functions/src/onboardingDropoffDispatcher.ts` — `sendMulticast()` helper `:184-211` invoked in the dispatch loop `:353-411`, cooldown read `:284-297` / write `:420-425` (`dropoffNotifiedAt`/`dropoffNotifyCount` on `users/{uid}`, NOT `push_rate/{uid}`), inline pref filter `:298-311`, FCM payload self-tags `channel:'training_reminder'` at `:375` for display only.
- **The change**: precursor commit, landed and reviewed on its own first: add `'onboarding_dropoff'` as a new `PushChannel` member in `push.service.ts:82-91` — purely additive, zero existing callers affected. Keep `dropoffNotifiedAt`/`dropoffNotifyCount` gating exactly as-is — **do not** fold it into `push.service.ts`'s rate cap. Two concrete reasons: (1) migrating to `sendPush({channel:'training_reminder', rateCapHours:48})` would make this share the *exact same* `push_rate/{uid}.training_reminder_lastSentAt` field/clock as `trainingReminderScheduler.ts`'s independent 22h cap — a user getting their 07:30 reminder could spuriously block an unrelated onboarding nudge, or vice versa, with zero errors, just missing pushes. (2) `dropoffNotifiedAt` on the user doc doubles as the admin Funnel Dashboard's directly-queryable signal (header comment `:44-52`) — moving it into `push_rate` breaks that direct query. Then a flag-gated branch: `false` (default) = today's `sendMulticast()` path; `true` = after the existing cooldown gate + variant selection, call `sendPush({toUids:[uid], channel:'onboarding_dropoff', title, body, deepLink, data, rateCapHours:0, skipQuietHours:true})` — `rateCapHours:0` is required here, not optional, to avoid double-gating against the same-purpose user-doc cooldown, and the new `'onboarding_dropoff'` channel (not `'training_reminder'`) is required to avoid the collision above.
- **The risk**: if a future edit at this call site uses `channel:'training_reminder'` instead of `'onboarding_dropoff'` — an easy mistake since the FCM payload already self-tags `'training_reminder'` for display — it silently reintroduces the collision described above. **Code review must check the literal channel string at this call site specifically.** State explicitly in the PR: the only functional gain here is quiet-hours + (once fixed) kill-switch coverage — not rate-cap consolidation, which is intentionally not happening.
- **The flag**: `app_config/feature_flags.pushRouting_onboardingDropoff` (boolean, default `false`). The `PushChannel` enum addition itself has no flag — see flag-impractical list.

### Item 2 — Global master kill-switch

- **Files/functions**: `functions/src/services/push.service.ts` — insertion point immediately after the empty-uid early return (`:166`) and before the existing per-channel check (`:169-173`); `isAdminChannelEnabled()`/`channelConfigCache` (`:55-78`); admin UI `src/app/admin/notifications/page.tsx` (`NotifConfig` interface, `handleToggle`/`handleTemplateSave` save handlers).
- **The change**: add a new top-level field `pushEnabled: boolean` sibling to `channels` inside `app_config/notification_configs` — the exact document `isAdminChannelEnabled()` already fetches and caches every 5 minutes, so this reuses the same fetch at zero extra Firestore-read cost. Default: **absent → enabled**, mirroring the per-channel field's own default-true philosophy, so this ships byte-identical to current behavior. Extend `channelConfigCache` to also carry `globalEnabled`. New check inserted right after the `:166` empty-uid return, short-circuiting before any per-uid work if global switch is off — counted under a **new** `SendPushResult` field (`skippedGlobalKill`), not folded into `skippedPrefs`, so an emergency halt is never confused with routine unsubscribes in the metrics. Admin UI: extend `NotifConfig` with `pushEnabled?: boolean`, add a confirm-dialog-gated master toggle, following the exact same full-object non-merge `setDoc` pattern the existing toggles already use.
- **Three design tensions, each recommended but flagged for explicit confirmation** (see Open Decisions below): (a) fail-open vs fail-closed on a Firestore read error — recommend **fail closed** in a separate `try/catch` from the existing (fail-open) per-channel logic, since an emergency switch that fails open during the exact kind of incident (Firestore degradation) that might prompt reaching for it defeats its own purpose; this deliberately contradicts the adjacent per-channel precedent, so the code comment must say so explicitly. (b) should `'system'` stay exempt — recommend **yes**, consistent with its existing force-on contract; a "kill literally everything including security pushes" scenario is rare enough to handle as a deploy-time action instead. (c) 5-min cache TTL — recommend **accepting it as-is** rather than adding a short-TTL bypass (extra per-call Firestore read cost for a scenario where 5 minutes rarely matters).
- **The risk**: `handleToggle`/`handleTemplateSave` do a non-merge `setDoc` of the *entire* locally-cached config object (not `{merge:true}`). Co-locating the new master switch in the same document as routine per-channel template edits creates a real concurrent-edit hazard: Admin A opens the page, Admin B flips the master switch off during an incident, Admin A — whose local snapshot predates B's change — saves an unrelated template edit, silently reverting the emergency switch back on because A's stale local state still has `pushEnabled:true` baked in. This is a genuine hazard from the existing non-transactional write pattern, not hypothetical.
- **The flag**: none needed for the code path itself (safe absent-default). Safety net instead: a one-time controlled validation — flip `pushEnabled:false` in a dev/staging doc, invoke `sendPush()` via a harmless test path, confirm `skippedGlobalKill` count and zero FCM sends, flip back — before trusting it in a real incident.

### Item 3 — Fix the group-join deep-link 404

- **Confirmed exhaustive scope** (fresh grep, this session, worktree copies excluded): exactly 3 files contain the literal string `community/groups` — `functions/src/onGroupMemberJoin.ts` (2 **live** occurrences: joiner-welcome push `:116`, admin-alert push `:137`, both `deepLink: \`/community/groups/${groupId}\``), `functions/src/sendPushFromQueue.ts:75` (doc-comment example only), `src/features/admin/services/engagement.service.ts:100` (doc-comment only). Real route confirmed: `src/app/community/[id]/page.tsx` exists; no `community/groups/` subdirectory exists anywhere (`src/app/community/` contains only `page.tsx` and `[id]/page.tsx`).
- **The change**: fix both live call sites to `deepLink: \`/community/${groupId}\`` and correct the two doc-comment examples so future engineers don't copy the broken pattern.
- **Recommended fix target vs. the alternative, with reasoning**: an alternative already-live pattern exists — `src/lib/resolveJoinLanding.ts:14` returns `/home?openGroupDrawer={groupId}&joined=true`, consumed by `src/app/home/page.tsx:528-559` to open the group drawer directly with join-celebration UI. This is arguably better UX (drawer opens immediately vs. a full page nav) and is battle-tested from another live join flow — but `onGroupMemberJoin.ts` sends this same `deepLink` value to **two different recipient roles** (the joiner at `:116`, and the group admin being notified someone else joined, at `:137`). The `openGroupDrawer`+`joined=true` pattern's celebration semantics are correct for the joiner but wrong for the admin, who didn't just join anything — adopting it correctly would require inventing new per-recipient-role query-param semantics, real scope creep for a "fix a 404" item. **Recommend the direct, minimal `/community/{id}` fix now**; the drawer pattern is a legitimate candidate for a later, deliberately-scoped UX change once Items 1/2 are stable and not bundled here.
- **The risk**: low — no shared-module interaction, only the community list/detail page's general-purpose group handling to sanity-check.
- **The flag**: none — a 2-character string literal fix has no meaningful "off" state (see flag-impractical list). Safety net: deploy scoped to `firebase deploy --only functions:onGroupMemberJoin` (independently deployable, isolated from the Item 1/2 shared-module edits) + a manual smoke test (join a test group in dev/staging, tap the resulting push, confirm landing on the community page instead of a 404) before/without bundling with other items.

### Item 4 — Adopt the canonical persona enum + build the alias map

This is the alias-map **module landing**, not wiring it into any live call site — see Open Decisions for why wiring is deliberately out of Phase-0 scope.

#### Full alias table (additive only — no source vocabulary is renamed)

Canonical target: `parent | student | pupil | office_worker | reservist | soldier | vatikim | pro_athlete | generic`

| Raw value | Source | → Canonical | Confidence | Why |
|---|---|---|---|---|
| `parent, student, pupil, office_worker, reservist, soldier, vatikim, pro_athlete` | Canonical (`PersonaStep.tsx`) + `location-constants.ts` | identity | high | Exact match. |
| `senior` | `location-constants.ts`, corpus (31) | `vatikim` | high | Canonical `vatikim`'s own tag list literally includes `'senior'` (`PersonaStep.tsx:125`) — strongest-evidenced alias in the map. |
| `athlete` | `location-constants.ts` | `generic` | medium | No "casual athlete" tier exists; folding into `pro_athlete` would falsely imply advanced/performance-tier messaging for a general audience. Under-target rather than over-claim. |
| `young_pro` | `location-constants.ts` | `generic` | medium | No canonical counterpart; `office_worker` rejected since "young professional" doesn't reliably imply desk/WFH work. |
| `''` (blank, 49) + `generic` (13) | corpus | `generic` | decision, stated explicitly | Two spellings of "no persona authored," both collapse to `generic` — called out here as a deliberate merge, not a silent one. |
| `high_tech` (21) | corpus | `office_worker` | medium — recommend content-team confirmation | Third-largest populated bucket, no canonical counterpart; `office_worker`'s `wfh` tag is the closest semantic parent. Flag for a quick content gut-check since high-tech-specific narratives (burnout, hybrid-work culture) may not survive the collapse. |
| `army_combat` (3) | corpus | `soldier` | medium | "Combat" reads as active-duty framing, closer to `soldier` (tags `military, active`) than `reservist` (tags `military, busy` — reserve-duty-around-civilian-life framing). |
| `army_job` (2) | corpus | `generic` | low — flag for manual recode | Only 2 entries; "army job" plausibly means a non-combat *military* role, and `office_worker` would inject civilian-workplace copy into a military context — worse than under-targeting. Recommend eyeballing the actual 2 entries' text before finalizing. |

**Excluded from this map, deliberately**: `contextual-engine.types.ts`'s `LifestylePersona` / `user-profile.utils.ts`'s `PERSONA_ID_MAP` / `workout-metadata.service.ts`'s tag pool — this is a downstream workout-content-scoring vocabulary going the *opposite* direction (canonical → engine-internal), not a raw persona-storage location; reuse only its **pattern** (Record + aliases section + Set guard + precedence resolver), never its value space. `location-utils.ts`'s `classifyPersonaGroup()`/`PersonaGroup` — a derived output classification for copy-selection, not a mapping target. **New finding**: `src/features/content/personas/core/persona.types.ts` defines an unrelated third "Persona" concept (Firestore-backed Lemur-mascot content docs with their own `linkedLifestyleTags`) — a content-targeting consumer, not user-persona storage; flag for a one-line confirmation with that feature's owner that it's out of scope, since it wasn't part of the original 5-vocabulary count.

#### Resolver precedence — must check BOTH onboarding write paths

**Critical finding**: `personaId`/`lifestyle.lifestyleTags` (the fields originally assumed canonical) are written by only ONE of two divergent onboarding completion flows:
- **Path B** (`LifestyleWizard.tsx:handleFinalSubmit`, `:87-101`) — writes top-level `personaId` and `lifestyle.lifestyleTags`. The only place that does.
- **Path A** (main `OnboardingWizard.tsx` → `onboarding-sync.service.ts:syncOnboardingToFirestore`) — writes `onboardingAnswers.persona`/`onboardingAnswers.personas`/`onboardingAnswers.lifestyleTags` instead. Never writes top-level `personaId`. A user who only went through Path A is invisible to any resolver that only checks `personaId`.

Resolver order (first hit wins, each value run through the alias table above, case-insensitive/trim):
1. Explicit override param (for future admin-preview/testing tooling).
2. Path B `lifestyle.lifestyleTags[0]`.
3. Path B top-level `personaId`.
4. Path A `onboardingAnswers.persona`.
5. Path A `onboardingAnswers.personas[0]` (fallback for malformed docs).
6. Path A `onboardingAnswers.lifestyleTags[0]` (lowest priority — the source comment says these are "persona **+ goal**" tags combined, so index 0 isn't reliably persona).
7. Fallback: `generic` (never returns null — unlike the workout-engine's existing resolver, the canonical enum has a first-class `generic` member).

⚠️ Step 2-vs-4 ordering (Path B checked before Path A) is based on Path B being chronologically later in the flow, not on an empirical check of how often both are populated simultaneously on one user doc. **Recommend a cheap one-time Firestore query** (sample docs with both `personaId` and `onboardingAnswers.persona` set) to validate this ordering before treating it as final.

#### File locations (confirmed: no cross-project import is possible)

`functions/tsconfig.json` only includes `functions/src`; root `tsconfig.json`'s `@/*` paths only map into `src/`; no `shared/`/`packages/`/`common/` directory exists; `functions/package.json` has no `workspaces` field. Two files, following the established local-mirror convention already used at `onboardingDropoffDispatcher.ts:137` (`// local mirrors of user.types.ts — Admin SDK doesn't import FE types`):

| Side | Path | Rationale |
|---|---|---|
| `src/` (source of truth) | `src/features/user/onboarding/services/persona-alias-map.service.ts` | Co-located with the canonical source (`PersonaStep.tsx`) and Path A's writer, matches the directory's `kebab-case.service.ts` convention. |
| `functions/src/` (manual mirror) | `functions/src/services/persona-alias-map.service.ts` | Co-located with `push.service.ts`, its future consumer. Comment cross-references the `src/` path, "keep in sync manually." |

`location-constants.ts`'s 11-entry vocabulary is **confirmed dead code** this session (`grep -rn "LIFESTYLE_OPTIONS" src` → only its own declaration, `PersonaStep.tsx`'s unrelated same-named local const, and `SummaryStep.tsx`'s known-stale copy — zero real importers). Its 2 ambiguous entries (`athlete`, `young_pro`) default to `generic` above and shouldn't block delivery; re-confirm before ever deleting the file (separate, unrequested task).

### Suggested build/deploy order

| Order | Item | Why |
|---|---|---|
| 1 | Item 3 (deep-link fix) | Smallest, most isolated, zero interaction with `push.service.ts`, independently deployable, immediate user-facing value, no flag decisions to resolve — validates the review/deploy rhythm before touching riskier surfaces. |
| 2 | Item 2 (global kill switch) | Lives inside the shared `push.service.ts` module all 5 existing + 3 soon-to-be-migrated callers depend on. Land and stabilize this shared-module change while blast radius is still just the 5 existing callers, *before* Item 1 adds 3 more. Its safe absent-default makes it the least risky shared-module change to go first. |
| 3 | Item 1, in order **1a → 1b → 1c** | 1a (chat) is confirmed easiest/lowest-risk (flat audience, no batching) — best first proof the routing pattern works end-to-end in prod. 1b (queue) is medium complexity, no channel-collision risk. 1c (dropoff) needs its own precursor commit (new `PushChannel` value) and carries the sharpest edge case (silent rate-cap collision) — tackle it once the pattern is battle-tested. |
| any time, parallel | Item 4 (alias-map module) | Zero live callers by design → zero interaction with push-delivery risk. Independent of Items 1-3's sequencing. |

### Flag-impractical callout list (explicitly surfaced per your instruction)

- **Item 3** (deep-link fix) — a literal URL string has no "off" state. Safety net: scoped single-function deploy + manual tap-through smoke test.
- **Item 4** (alias-map module) — no runtime callers means no runtime behavior to gate; "default false" is meaningless for code nothing imports. Safety net: diff-scope review restricted to the new module only, zero other files touched.
- **Item 1's dead-code cleanups** (deleting the now-unreachable inline pref-filter/token-prune in each of the 3 files, once each routing flag is soaked) — putting a deletion of already-unreachable code behind yet another flag would mean maintaining 3 parallel paths. Safety net: a separate, later commit after a soak period, revertable via plain `git revert`, never bundled with the flag-flip commit.
- **The `'onboarding_dropoff'` `PushChannel` enum addition** (Item 1c) — an additive TypeScript union member is compile-time-only, nothing calls it until 1c's own routing flag is true. Safety net: land as its own small, isolated precursor commit reviewed on its own.
- **Item 2's admin-UI master-switch toggle** — a UI control either ships in the deployed bundle or doesn't; flagging the control that manages the flag is circular. Safety net: normal review + the backend field's own safe default.

### Open decisions requiring explicit confirmation (recommendations given, not settled)

1. **Item 2**: global kill-switch fails **closed** on Firestore read error (recommended) — contradicts the existing per-channel precedent's fail-open behavior right next to it in the same file.
2. **Item 2**: `'system'` channel stays exempt from the new global switch (recommended: yes).
3. **Items 1a/1b/1c**: admin broadcasts / chat / onboarding-dropoff do **not** start respecting quiet hours in Phase 0 (`skipQuietHours:true` everywhere) — making them quiet-hours-aware is a legitimate future idea but must be its own explicitly separate, later decision.
4. **Item 3**: `/community/{groupId}` (direct fix) over the `resolveJoinLanding` drawer pattern (recommended, for the per-recipient-role semantic mismatch reasoning above).
5. **Item 4 alias table**: `high_tech`→`office_worker` (recommend a quick content-team gut-check before finalizing), `army_job`→`generic` (recommend eyeballing the 2 actual corpus entries before finalizing).
6. **Item 4 resolver**: Path B checked before Path A — recommend validating with a one-time Firestore sample query before treating as final.
7. **Item 4 scope**: the alias-map module is built but **wired into zero live call sites** in Phase 0 — wiring it into `MessageService.ts`'s `targetPersona` matching or `SmartGreeting.tsx`'s persona derivation is itself a behavioral change (a string-normalization step that can silently change which messages match which users) and deserves its own scoped, flagged, separately-reviewed rollout in a later phase — confirm this scoping is correct, not scope creep.

---

## Phase 1 — Reconnaissance (map only — nothing below is being built now)

### B1. Deep-link entry point for walking/steps-completion

**Confirmed live target for "prompt a walk"**: `/map?openRun=walking` — read via `useSearchParams()` at `src/app/map/MapShell.tsx:700`, consumed at `src/app/map/layers/DiscoverLayer.tsx:326-334` (`handleActivityChange('walking')` → `setMapMode('freeRun')` → `setFreeRunStep('config')`), opening `FreeRunDrawer` (the component that actually plays the "WorkoutDrawer" role the axiom doc names — no file literally named `WorkoutDrawer.tsx` exists) pre-configured for a walking activity. Built originally for the run-invite share-link feature but fully reusable as a push `deepLink` value **today, with zero new client code**.

By contrast, today's training-reminder push (`deepLink:'/'`, `data:{triggerType,date}`) is a confirmed dead-end for type-hinting: `/` (`src/app/page.tsx`) is a splash/auth-gate that reads no query params and never inspects the FCM `data` payload; the native tap handler (`src/lib/native/push.ts:359-419`) only ever reads `messageId`/`channel`/`authorityId`/`deepLink` — `triggerType`/`date` are pure decoration, confirmed never read anywhere client-side.

**Assessment — does `openRun=walking` suffice as the type hint?** For a **"come take a walk" prompt**: yes, fully, zero new work. For a **"you hit your step goal" celebration**: no — `openRun=walking`'s destination (a fresh-activity config screen) is a UX mismatch for acknowledging a just-finished goal. No existing landing surface for a completed step-goal exists today (`HeroWorkoutCard` is workout-generation-driven and not push-wired; `StepsWidget` has no "goal reached" state). Two sizing options for whoever picks this up: **near-zero** — deep-link to plain `/home` with `data.triggerType:'StepsGoalReached'` riding along as decoration, same as today's unused pattern; or **small (~few hours)** — a new query param (e.g. `/home?highlight=steps`) with one new effect to scroll-to/pulse the steps widget, genuinely new but small.

### B2. Step-goal / streak / milestone trigger hook-in points

- **Confirmed**: none of the 8 existing `onSchedule` functions touch step or streak data — a step-goal/streak trigger needs a **brand-new `onSchedule` function**, structurally modeled on `trainingReminderScheduler.ts`'s query→filter→`sendPush()` pattern.
- **2 data sources, 2 separate reads, no existing join**: goal in `progression.dailyStepGoal` (on `users/{uid}`, default 3000, adaptive ±10%/-5%); live count in `dailyActivity/{uid}_{date}.steps` (separate collection, written by the `ingestHealthSamples` **callable**, populated asynchronously per client sync — not on a predictable schedule).
- **Cadence**: "X% of goal by 2pm" is same-day time-sensitive → needs **intraday** scheduling, unlike every existing once-daily job. A streak-lapse warning needs genuinely new forward-looking computation (only retroactive recompute-on-load exists today via `useActivityStore.ts`, keyed off `progression.currentStreak` + `lastActivityDate`).
- **Interaction with `push.service.ts` guardrails**: a daytime intraday check sits safely inside active hours (`skipQuietHours:true` applies cleanly, same as `trainingReminderScheduler.ts`). A streak-lapse warning's natural firing time (~21:00-22:00, "you'll lose your streak at midnight") sits right at the 22:00 quiet-hours boundary — a real product decision (fire earlier and lose urgency, or fire at the boundary and consciously bypass quiet hours) for whoever builds this, not solved here. Rate cap works correctly under intraday polling as long as `rateCapHours` stays ~20-24h — no `push.service.ts` changes needed.
- **Channel choice**: `'health_milestone'` is confirmed to have **zero producers anywhere in `functions/src`** today (re-verified this session — only type declarations exist, no live `sendPush({channel:'health_milestone',...})` call anywhere) — a clean, no-conflict home for a step-goal/milestone push. `'progression'` is already used by `onLevelUp.ts`; sharing it for a streak trigger risks same-day rate-cap collision with an unrelated level-up push. **Flag for Phase 1's actual build**: use `'health_milestone'`, or mint a dedicated new channel for streak specifically if `'progression'`'s semantics are preferred.

### B3. Message-selection-to-FCM wiring ledger

| | Piece | Status |
|---|---|---|
| Reused | `sendPush()` (`push.service.ts`) | As-is — already accepts `toUids`/`channel`/`title`/`body`/`deepLink`/`data`; a selection layer only needs to resolve those 5 fields per user. |
| Reused | Item 4's persona alias-map resolver | As-is — normalizes a candidate message's persona and a user's persona onto the same canonical vocabulary before matching. |
| Reused | `{var}` interpolation (`.replace(/\{(\w+)\}/g,...)`) | Already used in `retentionScheduler.ts`/`onboardingDropoffDispatcher.ts`; same approach for candidate `title`/`body` templating. |
| Reused | `push.service.ts` guardrails (quiet hours, rate cap, pref filter, dead-token cleanup) | Automatic for whatever the new selection layer eventually passes into `sendPush()`. |
| Reused, zero-conflict | `'health_milestone'` `PushChannel` | Confirmed unused — available as-is (see B2). |
| **Net new** | Message-candidate schema + a **new**, push-scoped Firestore collection | Shape-analogous to `smart_messages`'s `{priority, targetPersona, minStreak/maxStreak}` fields, but a separate collection — `smart_messages` itself stays in-app-only per the locked decision. |
| **Net new** | Selection function | Conceptually modeled on `getBestMessage`'s filter-by-persona-then-priority logic, freshly implemented for the Cloud Functions runtime — `MessageService`/`getBestMessage` has zero references anywhere in `functions/src` today, nothing to extend. |
| **Net new** | Wiring: winning candidate → `sendPush()` call | Small glue code inside whatever new `onSchedule` trigger(s) B2 introduces. |
| **Net new**, possibly | Dedicated `PushChannel` for streak-lapse | Only if `'progression'`-sharing is rejected per B2. |

---

## Verification plan (once Phase 0 is actually implemented — not applicable to this plan-only turn)

- **Item 1 (each sub-item)**: `dryRun:true` call against a test uid before flipping the routing flag; confirm `SendPushResult` counts match expectations; flip flag `true` in dev/staging only first; verify `push_messages`/chat/dropoff still deliver correctly; check `push_rate/{uid}` isn't double-written for 1c.
- **Item 2**: the controlled validation described above (flip `pushEnabled:false` in staging, confirm zero sends + `skippedGlobalKill` count, flip back) before it's ever trusted live.
- **Item 3**: join a test community group in dev/staging, tap the resulting push notification on a real device, confirm it lands on `/community/{id}` instead of 404.
- **Item 4**: unit-test the resolver against synthetic docs covering both Path A and Path B shapes, plus the corpus's 8 raw persona values, confirming every one resolves to a canonical value (never `undefined`).
- All of the above per CLAUDE.md's existing rule: local commit → diff review → device/dev test → **only then** ask David before any push to `main` or flag flip to `true` in prod.

## Critical files (for whoever implements this)

- `functions/src/services/push.service.ts` — central delivery primitive, kill-switch insertion point, `PushChannel` type.
- `functions/src/sendPushFromQueue.ts`, `functions/src/chatMessageNotification.ts`, `functions/src/onboardingDropoffDispatcher.ts` — the 3 bypass senders.
- `functions/src/onGroupMemberJoin.ts` — deep-link bug, lines 116 and 137.
- `functions/src/sendPushFromQueue.ts:75`, `src/features/admin/services/engagement.service.ts:100` — doc-comment copies of the same bug.
- `src/app/admin/notifications/page.tsx` — admin UI, `NotifConfig`, toggle handlers for the new global switch.
- `src/features/user/onboarding/components/steps/PersonaStep.tsx` — canonical persona source.
- `src/features/user/onboarding/services/onboarding-sync.service.ts`, `src/features/user/onboarding/components/LifestyleWizard.tsx` — Path A / Path B persona write sites the alias-map resolver must check.
- `src/features/workout-engine/services/user-profile.utils.ts` — the `PERSONA_ID_MAP` pattern to model the new alias map's shape on (not its value space).
- `functions/src/trainingReminderScheduler.ts` — reference pattern for any future `onSchedule` trigger (Phase 1, B2).
- `src/app/map/layers/DiscoverLayer.tsx:319-334` — the `openRun` deep-link consumption Phase 1's walking-prompt push would reuse.
