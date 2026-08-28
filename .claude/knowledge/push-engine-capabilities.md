# Push-Notification / Re-Engagement Engine — Capabilities Report

**Status:** Read-only investigation, 11.08.2026. No code changed. Produced via 4 parallel research passes over `functions/src/`, `src/features/`, `src/app/admin/`, `src/lib/`, and `scripts/`. Every claim below is grounded in a file:line citation from the live repo — nothing here is inferred or assumed.

**Purpose:** ground-truth map of what the push engine can and cannot do today, to scope a large persona-based message library.

---

## TL;DR

- The engine can **send** push reliably (5 senders route through a shared `push.service.ts` with quiet-hours + rate-cap + kill-switch; 3 more send FCM directly, bypassing all three controls).
- It **cannot currently target by persona, gender, age, or activity level** — none of those fields are read by any push sender. The only working targeting today is: authority (city), onboarding status, activity recency, park-visit history, and per-user opt-in prefs.
- A rich **persona field already exists on the user doc** (`personaId` + `lifestyle.lifestyleTags`), with real enum values matching exactly the list you asked about (אמא/אבא/תלמיד/סטודנט/גמלאי/חייל/עובד משרד) — it's just never wired into a push query.
- There's a genuine **priority + persona-based scoring/selection mechanism already built** (`MessageService.getBestMessage`) — but it drives in-app greeting text only (home screen, active-workout screen), and has zero connection to FCM.
- There's also a **workout-suggestion ranking engine** (`rank-suggestions.ts`) — real weighted scoring, but for in-app workout cards, not messages, not click-probability, and not wired into push either.
- All 9 live push notifications have Hebrew-only, hardcoded copy baked directly into each Cloud Function file. The admin UI's template editor is a **non-functional mock** — it writes to a Firestore doc that no live sender reads.
- A 201-entry notification corpus (`scripts/corpus/notification-corpus.json`) already exists with persona tagging (`parent`, `senior`, `student`, `high_tech`, `reservist`, `army_combat`, `army_job`, `generic`) and psychological-trigger metadata — but it's for one channel only (`retention`) and none of it is wired to any live sender. It's a useful format/seed reference, not an authoritative current-state source.
- One production bug exists in the deep-link mechanism: group-join notifications link to `/community/groups/{id}`, but the real route is `/community/{id}` (no `groups` segment) — this 404s on tap today.
- **Known unrelated infra issue** (already logged in `.claude/knowledge/admin-test-push-route-iam-gap.md`, 10.08.2026): the admin panel's single-user test-push route silently fails to deliver in production due to a probable IAM gap on Vercel's service account — does not affect any of the Cloud-Functions-based senders documented here, which use a structurally different (GCP-native ADC) credential path.

---

## 1. Segmentation fields

| Field | Firestore path | Enum / type | Set by | Used by any push sender today? |
|---|---|---|---|---|
| **Persona (primary)** | `personaId` (top-level, not nested) | free string, single-select | `PersonaStep.tsx:294-298` (onboarding) | **NO** |
| **Persona (multi-tag)** | `lifestyle.lifestyleTags` | `string[]` | same onboarding step, union of all selected persona+goal tags | **NO** |
| **Tenant type** (institutional persona) | `core.tenantType` | `'municipal'\|'educational'\|'military'\|'company'\|'youth_movement'` | server-side, access-code Cloud Function | **NO** |
| **Military sub-flag** | `core.isActiveReserve` | boolean | onboarding | **NO** |
| Gender | `core.gender` | `'male'\|'female'\|'other'` | `/api/user/complete-profile` (server-only write) | **NO** |
| Age (raw) | `core.birthDate` | `Date` | `/api/user/complete-profile` | **NO** |
| Age (bracket) | `core.ageGroup` | `'minor'\|'adult'` | server-computed (`src/lib/age.ts:13-18`) | **NO** (live consumer today is Safe-City map segregation only) |
| Activity/fitness level | `core.initialFitnessTier` | `1\|2\|3` | onboarding | **NO** |
| Training frequency | `lifestyle.trainingHistory` | `'none'\|'1-2'\|'3+'` | onboarding lifestyle wizard | **NO** |
| **City (authority)** | `core.authorityId` | string, authority doc ID | server-only via `/api/user/update-authority` | **YES** — `sendPushFromQueue.ts:297` |
| Neighborhood | — | **does not exist on the user doc** | — | N/A — field doesn't exist. Neighborhoods exist only as child-`authorities` docs (`parentAuthorityId`) and on `parks`, not on users. |
| Home/anchor location | `core.anchorLat` / `core.anchorLng` | lat/lng | set once on first map confirmation | **NO** |
| GPS permission granted | `core.gpsEnabled` | boolean | `useUserCityName.ts:158-162` | **NO** |
| **Onboarding completion (coarse)** | `onboardingStatus` | `'IN_PROGRESS'\|'COMPLETED'\|'PENDING_LIFESTYLE'\|'MAP_ONLY'\|'ONBOARDING'` | server | **YES** — `retentionScheduler.ts:131` (`==COMPLETED`), `onboardingDropoffDispatcher.ts:259` (`in [IN_PROGRESS,ONBOARDING]`) |
| Onboarding completion (%) | `onboardingProgress` (0-100, stored) **vs.** `calculateProfileCompletion()` (0-100, live-computed, NOT stored) | — | onboarding writes; completion service is client-computed only | **NO** — two different numbers exist and neither is read by any push sender |
| Steps-permission state | — | **does not exist server-side** | tracked only in a local Zustand store + `@capacitor/preferences` (NSUserDefaults), never synced to Firestore | N/A — cannot be a push filter today |
| Push-permission state (explicit) | — | **no explicit enum stored** | inferred only from `fcmTokens` non-empty | proxy only |
| Push opt-in (master) | `settings.pushEnabled` | boolean, default true | user settings | **YES** — every sender checks this |
| Push opt-in (per-channel) | `settings.notificationPrefs.{channel}` | boolean per channel, default true | user settings | **YES** — checked individually in each sender |
| Activity recency | `lastActive` | Timestamp | updated on app use | **YES** — `retentionScheduler.ts:161-174`, `sendPushFromQueue.ts` (`active_users`/`inactive_users` audiences) |
| Park visit history | `workouts` collection (`parkId`, `date`, `userId`) | — | workout completion | **YES** — `sendPushFromQueue.ts:339-358` (`park_users` audience, 30-day window) |

### Persona enum values — full picture (fragmented, no single canonical list)

The exact persona words you asked about **do exist**, from the live onboarding UI (`PersonaStep.tsx:62-137`, the list actually shown to users):

| ID | Hebrew label |
|---|---|
| `parent` | אבא/אמא |
| `student` | סטודנט/ית |
| `pupil` | תלמיד/ה |
| `office_worker` | עובד/ת משרד |
| `reservist` | מילואימניק/ית |
| `soldier` | חייל/ת סדיר |
| `vatikim` | גיל הזהב (≈ senior/retiree) |
| `pro_athlete` | ספורטאי/ת קצה |

**But there are at least 4 other, overlapping, not-fully-consistent persona enums elsewhere in the codebase:**
- `location-constants.ts:16-26` (older, parallel list): adds `athlete`, `senior` (גמלאי/ת — closer to your exact "גמלאי" word than `vatikim`), `young_pro`.
- `location-types.ts:146` `PersonaGroup` (derived, copy-selection only, not stored): `student|mom|dad|senior|reservist|careerist|single_young|highschooler|default`.
- `workout-metadata.service.ts:263` (content-tagging pool): `parent, mom, senior, high_tech, army, reservist, student`.
- `user-profile.utils.ts:43` (workout-engine's normalization set): `parent, student, school_student, office_worker, home_worker, high_tech, senior, athlete, reservist, active_soldier`.
- The **notification corpus** (`scripts/corpus/notification-corpus.json`) uses yet another set: `parent, senior, student, high_tech, reservist, army_combat, army_job, generic` (+ blank).

**Bottom line for the persona field:** the concept and the Hebrew vocabulary you want already exist in the product (onboarding asks it, `personaId`/`lifestyleTags` store it), but there is no single source-of-truth enum — 5 different lists overlap and diverge, and **none of them are read by any push-sending code today**. Building a persona-based push library will need to pick/normalize ONE canonical enum (the `PersonaStep.tsx` list is the most authoritative since it's what onboarding actually writes) and then wire it into whichever sender(s) will use it.

### Full user-doc shape (top-level sections)
`src/features/user/core/types/user.types.ts:250-477` (`UserFullProfile`): `id, core{...30 fields}, social, progression{...}, equipment{home/office/outdoor}, goals, selectedGoals, lifestyle{...}, personaId, profileCompleted, onboardingProgress/onboardingPath/onboardingStatus/onboardingStep/firstWorkout*, health, settings{pushEnabled, notificationPrefs, calendarSync, privacyMode}, fcmTokens, fcmTokenMeta, running, subscriptionTier, hasWelcomeBotTriggered, createdAt/updatedAt/lastActive`.

Two live fields are **Admin-SDK-only and undocumented in the TS types**: `dropoffNotifiedAt`/`dropoffNotifyCount` (onboarding-dropoff cooldown) and the separate `push_rate/{uid}` collection (rate-cap bookkeeping) — worth knowing about since they won't show up if you only read `user.types.ts`.

---

## 2. Triggers

### Scheduled (Cloud Scheduler / `onSchedule`)

| Job | File | Cron | TZ | Wired? |
|---|---|---|---|---|
| Training reminder | `functions/src/trainingReminderScheduler.ts:112-119` | `30 7 * * *` | Asia/Jerusalem | ✅ live |
| Retention / inactivity | `functions/src/retentionScheduler.ts:104-111` | `0 10 * * *` | Asia/Jerusalem | ✅ live |
| Onboarding dropoff | `functions/src/onboardingDropoffDispatcher.ts:215-224` | `17,47 * * * *` (every 30 min, all day) | Asia/Jerusalem | ✅ live |
| Zombie-group cleanup (not push) | `functions/src/onGroupMemberWrite.ts:66-88` | `0 3 * * *` | UTC | ✅ live, not a notification |
| `cleanupEphemeralDocs`, `cleanupOldLogs`, `purgeExpiredLegalHolds`, `rollupLeaderboard` | respective files | various | — | ✅ live, none send push (verified no `sendPush`/`messaging` calls) |

### Behavioral / event-triggered

| Trigger | Condition | Wired? | File |
|---|---|---|---|
| Level up | `progression.globalLevel` increases past 1 | ✅ live, per-level copy table (levels 2-10) + fallback | `functions/src/onLevelUp.ts` |
| Kudos received | `onCreate kudos/{uid}/inbox/{id}`, batched via Firestore `.count()` | ✅ live | `functions/src/onKudosCreated.ts` |
| Group join (welcome + admin alert) | `onCreate community_groups/{gid}/members/{uid}` | ✅ live | `functions/src/onGroupMemberJoin.ts` |
| Chat message | `onCreate chats/{chatId}/messages/{messageId}`, gated by `chatNotificationsEnabled` flag (default off) | ✅ live | `functions/src/chatMessageNotification.ts` |
| Onboarding module-incomplete | `onboardingStatus IN [IN_PROGRESS,ONBOARDING]` + stale ≥24h | ✅ live (the dropoff dispatcher above) | — |
| **% of daily step goal** | — | ❌ **NOT WIRED** — `progression.dailyStepGoal` exists on the user doc but no scheduler/trigger reads it for a push condition. `stepDeficit` scoring only exists in the unrelated in-app workout-suggestion ranker (§9). | — |
| **Streak-about-to-break** | — | ❌ **NOT WIRED** — `progression.currentStreak` exists but no code checks "streak will lapse today" and fires a push. | — |
| **Inactivity N days** | ✅ live, this is exactly the retention scheduler above (default N=7, env `RETENTION_INACTIVITY_DAYS`) | ✅ | `retentionScheduler.ts` |
| **Goal reached / milestone** | Level-up (progression milestone) is wired; a generic "goal reached" (e.g. hit daily step goal, hit a distance PR) is **NOT WIRED** as a push — only level-ups fire. | partial | `onLevelUp.ts` only |

### Manual / admin-triggered (not a scheduler, not a behavioral trigger)
- Admin broadcast queue: `onCreate push_messages/{messageId}` → `functions/src/sendPushFromQueue.ts`, written by the admin "שלח ידנית" modal or `sendEncouragementPush()`.
- Admin single-user test send: `POST /api/admin/notifications/test`.

---

## 3. Timing controls

| Control | Implemented? | Exact values | Coverage gap |
|---|---|---|---|
| **Quiet hours** | Yes | `hour >= 22 \|\| hour < 7`, Asia/Jerusalem (`push.service.ts:46-48,328-334`) | Only applies to callers of `push.service.sendPush()` — that's `onLevelUp`, `onKudosCreated`, `onGroupMemberJoin` (unconditionally subject to it), plus `trainingReminderScheduler`/`retentionScheduler` (which explicitly opt out via `skipQuietHours:true`). **NOT applied at all** to `sendPushFromQueue` (admin broadcasts), `chatMessageNotification`, or `onboardingDropoffDispatcher` — all three call FCM directly and can fire at any hour. |
| **Rate cap** | Yes, per (uid, channel) | Default 24h. Overrides: `training_reminder`=22h, `retention`=48h, `progression`(level-up)=24h, `social`(kudos)=30min (env `KUDOS_RATE_CAP_HOURS`), group-join welcome=0h(uncapped), group-join admin-alert=1h, `system`=always uncapped. Stored in `push_rate/{uid}` (separate collection, not on the user doc). | **NOT applied** to `sendPushFromQueue` or `chatMessageNotification` (no `push_rate` interaction). `onboardingDropoffDispatcher` uses its own separate cooldown field instead (see below), not this mechanism. |
| **Kill switch — per channel** | Yes | `app_config/notification_configs.channels.{channel}.enabled`, 5-min cache, fails open if unreadable, admin UI toggle at `src/app/admin/notifications/page.tsx:340-363` | Only gates the 5 `push.service.sendPush()` callers. Does **not** gate `sendPushFromQueue`, `onboardingDropoffDispatcher`, or `chatMessageNotification`. |
| **Kill switch — chat-specific** | Yes, separate doc | `app_config/feature_flags.chatNotificationsEnabled`, strict `=== true`, default off | Independent of the channel-config kill switch above; toggled in `src/app/admin/workout-settings/page.tsx` |
| **Global master kill switch (one flag, all push)** | ❌ **NOT FOUND** | — | No single flag disables every push path at once — you'd need to flip the per-channel config AND separately handle the 3 senders that bypass it entirely. |
| **Per-user master opt-out** | Yes | `settings.pushEnabled === false`, checked independently in all senders | — |
| **Per-channel user pref** | Yes | `settings.notificationPrefs.{channel} === false`. Live channel keys: `system, chat, encouragement, health_milestone, training_reminder, social, progression, community, retention`. | `health_milestone` and `community` are toggle-able in the UI but **no code path ever sends to them** — dead channels. |
| **Custom cooldown ("don't resend within N days")** | Yes, one instance | `onboardingDropoffDispatcher.ts` — its own `dropoffNotifiedAt` field, default 48h, env `DROPOFF_RE_NOTIFY_HOURS` | Self-contained, doesn't use the shared `push_rate` mechanism |

**3 of 9 live senders bypass every admin-level control** (quiet hours, rate cap, kill switch) because they call `admin.messaging().sendEachForMulticast()` directly instead of routing through `push.service.ts`: `sendPushFromQueue.ts` (admin broadcasts), `chatMessageNotification.ts`, `onboardingDropoffDispatcher.ts`. This is a real gap worth flagging if the new message library is meant to inherit these controls uniformly.

---

## 4. Deep-link targets

**Mechanism:** FCM `data.deepLink` carries a bare path string (e.g. `/chat/<id>`, `/community/groups/<id>`, `/onboarding-new/selection`). Client-side listener at `src/lib/native/push.ts:359-420` (`FirebaseMessaging.addListener('notificationActionPerformed', ...)`) reads it, resolves it against `window.location.origin` (same-origin check only, no path allow-list), and does a **full page navigation** (`window.location.href = target.href`) — not an in-app router push.

| Destination type | Wired today? | Detail |
|---|---|---|
| Specific static screen (home `/`, chat, community) | ✅ | Routes exist and resolve correctly |
| Onboarding/completion module | ✅ | `/onboarding-new/selection` re-hydrates the wizard at the last completed step |
| Community group by ID | ⚠️ **broken today** | Senders build `/community/groups/{groupId}` but the real route is `/community/{id}` (single dynamic segment, `src/app/community/[id]/page.tsx`) — no `community/groups/` folder exists. Taps 404. One-line fix needed either in the dispatcher or by adding the route. |
| Specific workout route/trail by ID | ❌ **not wired** | No public-facing route/trail detail page exists anywhere in `src/app` (only admin-only `src/app/admin/routes`). Would need a new page + new deep-link string; the navigation mechanism itself needs no changes. |
| **"Route from the user's neighborhood"** | ❌ **not targetable** | Two separate gaps stack here: (a) no `neighborhoodId` field exists on the user doc at all (§1), and (b) no consumer page for a specific route/park exists (previous row). Both would need to be built. |
| Admin manual arbitrary deep link | ✅ | Free-text field in the admin "שלח ידנית" modal |

Click-tracking is a separate, partial mechanism: taps write to `users/{uid}/notification_clicks`, keyed by `data.messageId` — but **only `sendPushFromQueue`-originated pushes ever set `messageId`**; the other 4 direct senders (level-up, kudos, group-join, chat via `push.service.ts`) never stamp it, so their taps aren't counted. A read-only CTR dashboard exists in `src/app/admin/workout-settings/page.tsx` but is purely historical reporting — never fed back into any send-time decision.

---

## 5. Copy / templating

**Templating:** yes, but primitive — simple `{var}` regex-replace, two separate non-shared implementations (`onboardingDropoffDispatcher.ts:154-156` single-var, `retentionScheduler.ts:98-100`/`onGroupMemberJoin.ts:54-56` multi-var). Confirmed live variables: `{name}`, `{days_since}`, `{group_name}`, `{user_name}`. No templating engine, no shared utility.

**⚠️ Admin UI template editor is a mock.** `src/app/admin/notifications/page.tsx` lets an admin edit `titleTemplate`/`bodyTemplate` per channel with a `{level}`/`{workout_title}`-style variable catalog — these writes land in `app_config/notification_configs`, but **no live sender reads those fields**. Every scheduler's copy is hardcoded directly in its `.ts` file, independent of what the admin panel shows/edits. Don't trust the admin catalog's advertised template vars as ground truth — several have already drifted from the real code (see TL;DR).

**Hebrew localization:** push copy is **Hebrew-only, hardcoded as string literals** in each Cloud Function — no i18n system involved. The app does have a real i18n system (`src/lib/i18n/onboarding-locales.ts`, supports `he`/`en`/`ru`) but it's scoped to onboarding-wizard UI screens only, lives in the Next.js client bundle, and is **not importable from `functions/src`** (separate deploy target/TS project). Building multi-language push would need a new locale layer inside the Functions codebase — nothing to reuse there today.

**Message variety mechanism:** not randomization, but deterministic rotation — each sender picks from a small hardcoded array of variants via either day-of-year (`trainingReminderScheduler`) or `hash(uid) % N` (`retentionScheduler`, `onboardingDropoffDispatcher`) so the same user consistently sees the same variant within a cooldown window.

---

## 6. Channels

### Push (FCM)
Client registration/token lifecycle: `src/lib/native/push.ts`. Permission request → `saveTokenToFirestore()` (`arrayUnion` into `fcmTokens`) only after OS grant. Dead tokens auto-pruned server-side after failed sends (`sendPushFromQueue.ts` step 6, and equivalent logic in `push.service.ts`). Foreground pushes surface via `PushForegroundToast.tsx` + `usePushToastStore.ts` (in-app toast when the app is already open, distinct from the OS notification tray).

### In-app home-screen completion-% indicator (always-on nudge)
Component: `ProfileProgressBar`, inline in `src/app/home/page.tsx:80-182`, plus a second consumer `src/features/home/components/ProfileCompletionWidget.tsx`. Data source: `calculateProfileCompletion(profile)` (`src/features/user/identity/services/profile-completion.service.ts:71-238`) — a **client-side-only computed weighted percentage** (12 weighted items across basic/strength/running buckets), never persisted to Firestore. Hidden entirely once ≥100% or verified.

It's interactive, not passive: tapping expands an accordion; each incomplete item has a "השלם" button that routes to `/onboarding-new/setup?step={step}&jit=true` (except GPS, which triggers the permission prompt directly).

**Important: this is NOT the same completion signal the push engine uses.** The onboarding-dropoff push keys off the coarse server-side `onboardingStatus` enum, not this granular percentage. `calculateProfileCompletion` is referenced only in `src/app/home/page.tsx` and `ProfileCompletionWidget.tsx` — never in `functions/src`. A push tied to "you're at 73% complete" would need new server-side plumbing (replicate the calc in Functions, or persist the client-computed % back to Firestore).

---

## 7. Current inventory — every notification that exists today

| # | Name | Trigger | Copy (verbatim/template) | Audience | Deep link |
|---|---|---|---|---|---|
| 1 | Training reminder | Cron `30 7 * * *` IST | `📅 {category label}{ ב-HH:MM \| היום}` + 1 of 3 rotating bodies (day-of-year rotation) | `userSchedule` today, uncompleted, time not passed | `/` |
| 2 | Retention/inactivity | Cron `0 10 * * *` IST | 1 of 4 `{name}, {days_since}…` templates (uid-hash rotation) | `onboardingStatus==COMPLETED`, inactive ≥7d | `/` |
| 3 | Onboarding dropoff | Cron every 30 min, all day | 1 of 5 `{name}, …` templates (uid-hash rotation) | `onboardingStatus IN [IN_PROGRESS,ONBOARDING]`, stale ≥24h, 48h cooldown | `/onboarding-new/selection` |
| 4 | Level up | `progression.globalLevel` increases | Per-level table (levels 2-10, each a distinct title+body) + generic fallback | Any user leveling past 1 | `/` |
| 5 | Kudos received | `onCreate kudos inbox`, batched (30min rate cap) | Single or batched-count template | Kudos recipient | `/activity` |
| 6 | Group-join welcome | `onCreate group member` | `"ברוך הבא ל{group_name}!"` | New joiner (non-bootstrap-admin) | `/community/groups/{id}` ⚠️ broken (see §4) |
| 7 | Group-join admin alert | Same trigger as #6 | `"{user_name} הצטרף/ה!"` | Group leader/creator | `/community/groups/{id}` ⚠️ broken |
| 8 | Chat message | `onCreate chat message`, gated by feature flag (default off) | Sender name + message text (≤100 chars) | All participants except sender | `/chat/{chatId}` |
| 9 | Admin broadcast/encouragement | `onCreate push_messages` (admin-authored) | Free text | `all`\|`active_users`\|`inactive_users`\|`park_users`, scoped to authority | Admin-supplied |
| 10 | Admin test send | Manual, `/api/admin/notifications/test` | Fixed `[טסט]`-suffixed samples or custom | Single chosen uid | Custom or `/` |

**Declared but never sent:** `health_milestone` and `community` channels exist as toggle-able types with no live code path — treat as planned-not-built.

---

## 8. Gaps — what would need to be built for persona × time-of-day × deep-link targeting

1. **Persona targeting**: no push sender reads `personaId`/`lifestyleTags`/`tenantType` today. Needs: (a) pick one canonical persona enum (recommend the `PersonaStep.tsx` 8-value list, since it's what onboarding actually writes — the other 4 lists are inconsistent variants), (b) add a Firestore query/filter option in whichever sender(s) the library targets, likely via a new `sendPushFromQueue`-style audience type (`persona:<id>`) or a Cloud Function that iterates candidate personas.
2. **Gender/age/activity-level targeting**: same gap — fields exist, zero senders filter on them. Straightforward to add as additional `where()` clauses once a use case needs them.
3. **Neighborhood targeting**: two-part gap — the field doesn't exist on the user doc at all, and there's no consumer page for a neighborhood-specific route to deep-link to. Both need building.
4. **Route/trail deep-linking**: no public route/trail detail page exists in the app today (only admin). Needs a new page + deep-link path before any "here's a route near you" push is meaningful.
5. **Step-goal-%, streak-about-to-break, generic milestone triggers**: not wired at all. `progression.dailyStepGoal` and `progression.currentStreak` exist on the user doc, but no scheduler currently evaluates them for a push condition — would need a new Cloud Function (scheduled, likely daily or twice-daily) doing this evaluation.
6. **Group-join deep link bug**: `/community/groups/{id}` should be `/community/{id}` — quick fix, but relevant since any new persona message reusing this deep-link pattern would inherit the bug.
7. **Templating**: workable but primitive — no shared utility, two divergent regex implementations. A real message library would benefit from consolidating into one templating helper with a defined variable contract (name, step count, goal, neighborhood name, etc. — none of the last three are wired as template vars today; only `{name}`, `{days_since}`, `{group_name}`, `{user_name}` are live).
8. **Hebrew-only**: no blocker for a Hebrew-only library, but if English/Russian variants are ever wanted, a locale layer needs to be built inside `functions/src` (the existing i18n system can't be imported there).
9. **Uniform timing-control coverage**: 3 of 9 senders bypass quiet-hours/rate-cap/kill-switch entirely. If the new library is meant to inherit these guarantees uniformly, those senders (or their successor) need to route through `push.service.ts` instead of calling FCM directly.
10. **Admin template editor is disconnected from delivery** — either wire it to actually drive copy, or stop presenting it as functional (currently misleading: an admin can "save" a template that changes nothing).
11. **Message-scoring/selection for push**: does not exist (see §9 below) — would need to be built new if the library wants automatic candidate-ranking rather than one-message-per-trigger.

---

## 9. Message scoring / ranking engine — and workout linkage

**Bottom line up front: the "scores candidates by predicted click/engagement probability and priority, picks a winner" mechanism does NOT exist for push notifications.** Two adjacent, real systems exist for other surfaces — neither is connected to FCM, and neither actually scores by predicted engagement.

### (A) `MessageService` — closest match, but in-app text only, not push
`src/features/messages/services/MessageService.ts`. This is a genuine priority + persona-filtered selection mechanism:
- `SmartMessage` type (`:56-75`): `priority` (1-10, manually set by an admin — not predicted), `targetPersona?: string`, `minStreak?`/`maxStreak?`.
- `getBestMessage()` (`:470-507`) / `getLocalBestMessage()` + `selectByPriority()` (`:307-381`): filters candidates by `type`, persona match (`context.persona`/`context.lifestyles` against `msg.targetPersona`, `'general'` = matches everyone), streak range, then does a **priority-weighted random selection** among survivors.
- Storage: Firestore `smart_messages` collection, mirrored to `localStorage` for instant reads.
- **Consumed only by**: `useSmartGreeting`/`useSmartMessage` hooks → `src/app/home/page.tsx` (home greeting text) and `src/app/workouts/[id]/active/page.tsx` (active-workout screen text).
- **Confirmed zero references** to `MessageService`/`smart_messages` anywhere in `functions/src/` or in `src/lib/native/push.ts`/`sendPushFromQueue.ts`. It never touches FCM.
- This is the shape of mechanism you're describing (candidates → filter by persona → score by priority → pick winner), just on the wrong channel (in-app greeting, not push) and the wrong metric (hand-set priority number, not predicted click/engagement probability — there is no ML/historical-CTR input anywhere in this file).

### (B) `rank-suggestions.ts` — real weighted scoring, but for workout suggestions, not messages
`src/features/workout-engine/core/engine/rank-suggestions.ts` + `.weights.ts`, called by `suggestion-engine.ts:18` (`runSuggestionEngine`). Scores candidate `Suggestion` objects (in-app workout recommendations — daily-workout cards, post-workout suggestions, micro-nudges) on 7 rule-based factors: `goalMatch`(30), `gapFilling`(25, currently a stubbed no-op), `stepDeficit`(20), `preferenceMatch`(15), `recoveryMatch`(20), `locationBonus`(10), `timeOfDayMatch`(10, currently a stubbed no-op). Weights are manual constants, not calibrated from data. Highest-scoring candidate after a stable sort = "the recommendation"; **no click/engagement-probability signal anywhere**, and this engine's own file header states it is "not wired into any real UI surface yet" — it's pre-production even for its intended in-app use, let alone push.
- **Zero references** to this engine anywhere in `functions/src/` — confirmed via grep. It has never been connected to any push sender.
- The `Suggestion` type (`suggestion.types.ts:43-69`) carries `title`/`subtitle` and a coarse `structure` (segment count/duration), but **no `description` field, no exercise list, no image, no route/park reference** — it's a thin ranking record, not something you could drop straight into a push body today.

### "PULL/PUSH" terminology clarification
The `PULL`/`PUSH` distinction referenced in the recommendation-engine architecture doc (`docs/architecture/workout-recommendation-engine.md`) is **not** about FCM delivery mode — it's about data-flow direction: `PULL` = the app queries the engine on-demand (user opens map/home); `PUSH` = the engine is triggered by a real-world event (workout finished, location/time event). The doc does mention an aspirational "also via push [notification]" for a future "moments" layer, but its own status table marks that layer as not built, and no code implements it.

### How a message links to a workout today
There currently **is no live push notification that links to a specific workout's title/description**. The closest existing pattern:
- Training-reminder push (§7, #1) references only a **category label** (אימון כוח / ריצה / תרגול החזקה / הליכה), not an actual workout's real title or description — the category map is a hardcoded 4-entry lookup (`trainingReminderScheduler.ts:61-66`), not sourced from `Suggestion.title` or any generated-workout document.
- No push sender reads from the workout-generation pipeline (`WorkoutGenerator`, `suggestion-engine.ts`, or any `workouts/{id}` document) to compose its copy or deep link.
- Building a coherent "push → opens this specific workout" flow would require: (1) generating/selecting the workout server-side at send time (or reading an already-generated one), (2) putting its title/description into the push copy via the existing `{var}` templating pattern, and (3) a deep link to an actual workout-detail route with the workout ID (the closest existing pattern is the `/chat/{chatId}`-style ID-based deep link — same mechanism, new destination page needed since no public workout-detail-by-ID page was found outside admin).

### Persona / time-of-day in scoring — either engine
- **`rank-suggestions.ts`**: `UserContext.timeOfDay` exists and is read once inside `preferenceMatch`, but the dedicated `timeOfDayMatch` factor is a stub returning 0. **No `persona` field anywhere in `UserContext` or the weights file** — would need to be added (new field on `UserContext`, new factor function, new weight constant).
- **`MessageService`**: already supports persona filtering (`targetPersona`/`context.persona`/`context.lifestyles`) natively — this part is real and working, just for in-app text. Does not have a time-of-day dimension currently (`MessageContext` has no `timeOfDay` field).

### Other scoring-adjacent findings
- CTR (`ctr = clicks/recipients`) is computed and displayed in an admin dashboard (`src/app/admin/workout-settings/page.tsx`), but this is **read-only historical reporting**, never fed back into a send-time decision.
- An `engagementScore` exists (`cpo-analytics.service.ts`), but it's a **municipality-level** average-workouts-per-user metric for the CPO dashboard — unrelated to per-user message selection.

---

## Source map (for follow-up reading)

- Push send core: `functions/src/services/push.service.ts`, `functions/src/sendPushFromQueue.ts`
- Schedulers: `functions/src/trainingReminderScheduler.ts`, `functions/src/retentionScheduler.ts`, `functions/src/onboardingDropoffDispatcher.ts`
- Event triggers: `functions/src/onLevelUp.ts`, `functions/src/onKudosCreated.ts`, `functions/src/onGroupMemberJoin.ts`, `functions/src/chatMessageNotification.ts`
- Client-side: `src/lib/native/push.ts`, `src/lib/native/usePushToastStore.ts`, `src/components/system/PushForegroundToast.tsx`
- Admin UI: `src/app/admin/notifications/page.tsx`, `src/app/api/admin/notifications/test/route.ts`, `src/features/admin/services/engagement.service.ts`
- User schema: `src/features/user/core/types/user.types.ts`, onboarding writes in `src/features/user/onboarding/components/steps/PersonaStep.tsx`, `/api/user/complete-profile/route.ts`
- In-app completion: `src/features/user/identity/services/profile-completion.service.ts`, `src/app/home/page.tsx`
- In-app messaging (closest existing scorer): `src/features/messages/services/MessageService.ts`
- Workout-suggestion ranker: `src/features/workout-engine/core/engine/rank-suggestions.ts`, `.weights.ts`, `suggestion-engine.ts`, `docs/architecture/workout-recommendation-engine.md`
- Notification content corpus (unwired, retention-only): `scripts/corpus/notification-corpus.json`, `scripts/export-notification-corpus.ts`
- Known unrelated infra issue: `.claude/knowledge/admin-test-push-route-iam-gap.md`
