# Push Notifications — Current-State Audit (04.10.2026)

**Status: read-only investigation. No code changed, no deploy, no data written.**

Builds on `.claude/knowledge/push-engine-capabilities.md` (11.08.2026, committed to git 28.08.2026 — see §Correction below) — that audit is 54 days old and this one found a full new build wave it doesn't mention at all (Phase-0 persona work + a whole measurement layer, 12.08–08.09.2026). Every claim below is re-verified against the live repo today (`origin/main`) and, where noted, against live production Firestore data (read-only queries, same credentials used earlier this session).

**Correction (04.10.2026, same day, after merge):** this doc's original text claimed `push-engine-capabilities.md` and `notification-manager-wiring-design.md` were "uncommitted, main checkout" — that was wrong, asserted by analogy with an old memory note instead of checking `git log` directly, which is exactly the kind of staleness error this whole audit exists to avoid repeating. Both files (and the other two push-related knowledge docs) were committed to git on 28.08.2026 (`564ad915`, "commit the .claude/knowledge base into git") — over a month before this audit was written. `push-engine-capabilities.md` now carries an explicit superseded-banner (same commit as this correction) pointing back here.

---

## 1. Inventory — what push types exist, and how content feeds them

**12 distinct push types fire today** (up from the 10 the old audit found):

| # | Name | Trigger | Content source | Persona-aware? |
|---|---|---|---|---|
| 1 | Training reminder | Cron 07:30 IST | Hardcoded 3-variant array in the scheduler file | No |
| 2 | Retention/inactivity | Cron 10:00 IST | Hardcoded 4-variant array | No |
| 3 | Onboarding dropoff | Cron every 30 min | Hardcoded 5-variant array | No |
| 4 | Level up | `progression.globalLevel` increase | Per-level hardcoded table | No |
| 5 | Kudos received | `onCreate kudos inbox` | Single/batched hardcoded template | No |
| 6 | Group-join welcome | `onCreate group member` | Hardcoded template | No |
| 7 | Group-join admin alert | Same trigger as #6 | Hardcoded template | No |
| 8 | Chat message | `onCreate chat message` (flag-gated, now **ON**) | Sender name + raw message text | No |
| 9 | Admin broadcast | Admin "שלח ידנית" modal | Free text, admin-authored | No |
| 10 | Admin test send | `/api/admin/notifications/test` | Fixed samples or custom | No |
| **11** | **Step-goal nudge (NEW)** | Cron 18:00 IST | **מנהל התראות corpus**, `triggerType='Habit_Maintenance'`/`Daily_Goal` bucket | **Yes** |
| **12** | **Planned-activity / social push (NEW)** | `onCreate planned_sessions` | **מנהל התראות corpus**, `triggerType='Future_Partner_Plan'` | **Yes** |

**Only #11 and #12 are persona-aware and content-library-driven.** #1–#10 are unchanged from 54 days ago — still hardcoded-array, still non-persona.

### The content libraries — and a real conflation worth clearing up

Your question bundled "מנהל התראות" with "184 כותרות אימון"/"משפטים מוטיבציוניים" — **these are not the same system.** All four live as tabs on the *same* page (`src/app/admin/workout-settings/page.tsx`), sharing the same filter UI (פרסונה/מיקום/שעת היום/מגדר), which is almost certainly why they read as one thing:

| Tab | Collection | Live count | Feeds |
|---|---|---|---|
| כותרות אימון | `workoutMetadata/workoutTitles/titles` | **184** | In-app workout-card **titles** (workout generator's "Score Transparency" scoring) — confirmed **zero** references anywhere in `functions/src/`. Not push. |
| משפטים מוטיבציוניים | `workoutMetadata/motivationalPhrases/phrases` | **0** (empty) | Same in-app pipeline, currently unseeded. Not push. |
| (descriptions tab) | `workoutMetadata/smartDescriptions/...` | — | In-app workout-card **descriptions**. Not push. |
| **מנהל התראות** | `workoutMetadata/notifications/notifications` | **219** (201 legacy `Inactivity` + 12 new `Daily_Goal` + 6 new `Future_Partner_Plan`) | **This is the actual push content library.** Read by #11 and #12 only. |

So: **no**, the 184 workout titles and the (empty) motivational phrases do not feed push notifications at all, today or ever in the code. The real push corpus is the 219-doc "מנהל התראות" collection, and it's wired to exactly 2 of the 12 live push types.

### Persona/segmentation filters — real, but narrow

The פרסונה/מיקום/שעת היום/מגדר filters you saw are real stored fields and do filter the admin table. Since 01.09.2026 there's now a canonical `PersonaId` type (`src/types/persona.types.ts`) and an alias-map resolver (`functions/src/services/persona-alias-map.service.ts`) — this is new since the old audit and resolves what used to be 5 divergent persona vocabularies into one. But:
- `location`/`timeOfDay` aren't even real fields on the `Notification` type (confirmed absent from schema) — they exist on the *other* content types in the same tabbed UI, so those filter options are inert no-ops on the מנהל התראות tab specifically.
- Only senders #11/#12 resolve/use persona at all. #1–#10 ignore it completely, same gap the old audit found.

---

## 2. Trigger mechanism

**Scheduled (`onSchedule`):** #1 (07:30), #2 (10:00), #3 (every 30 min), **#11 NEW (18:00)**, plus a non-sending measurement sweep, `pushOutcomeSweeper` (every 30 min — checks outcomes, doesn't send).

**Event-triggered:** #4–#8, **#12 NEW** (`onCreate planned_sessions`, two recipient axes — followers + 3km geo-radius, merged/deduped).

**Manual:** #9, #10.

**Audience selection:** per-sender, no shared audience engine. #11 queries `users where onboardingStatus=='COMPLETED'`, batched, then per-candidate checks today's `dailyActivity` steps against `progression.dailyStepGoal`. #12 resolves followers + geohash-bounded nearby users. Admin broadcast (#9) supports `all`/`active_users`/`inactive_users`/`park_users`, scoped by authority.

**Send-time is always a fixed blast time per job — zero per-user send-time personalization anywhere in the codebase.**

**Live state, verified by direct read-only query against production:**
- `app_config/feature_flags.stepGoalNudgeEnabled` = **`true`** — the feature is flagged ON.
- `app_config/feature_flags.stepGoalTestUids` = **one real uid** — the function is still in forced test-mode, restricted to that single uid, *despite* the flag being on. (`stepGoalNudgeScheduler.ts`'s own doc comment: when this list is non-empty, it skips the real candidate query entirely.) **In practice, #11 is sending to exactly one person today, not the general population.**
- `app_config/feature_flags.chatNotificationsEnabled` = **`true`** (the old audit recorded this as default-off; it's been flipped on since).
- No global kill-switch exists (`notification_configs.pushEnabled` is `undefined`) — Phase-0's planned global kill-switch item was never built; only the persona-alias-map item (of that same plan) shipped, as part of this unrelated step-goal build.
- The 3 senders that bypass `push.service.ts` entirely (quiet hours, rate cap, kill switch) — `sendPushFromQueue.ts`, `chatMessageNotification.ts`, `onboardingDropoffDispatcher.ts` — **still call `admin.messaging().sendEachForMulticast()` directly**, unchanged from 54 days ago.
- The old group-join deep-link 404 (`/community/groups/{id}`) **is fixed** — now correctly `/community/{id}` in both live call sites.

---

## 3. Delivery infra

**FCM**, via Firebase Admin SDK (`admin.messaging().sendEachForMulticast()`), either through the shared `push.service.ts` (5 original + 2 new senders) or called directly (the 3 bypass senders).

**Device tokens:** `users/{uid}.fcmTokens` (array) + `fcmTokenMeta`, written client-side (`src/lib/native/push.ts`'s `saveTokenToFirestore()`, `arrayUnion`) only after OS permission grant. No separate per-platform (iOS/Android) field — both platforms' tokens live in the same array, distinguished only by token format, not an explicit tag. Dead tokens are pruned server-side after failed sends.

**Opt-in tracking:**
- Master: `settings.pushEnabled` (boolean, default true).
- Per-channel: `settings.notificationPrefs.{channel}` (boolean, default true). Live channels in use: adds `health_milestone` (now has real producers — #11/#12 — closing the old "declared but never sent" gap) and `community` (now has a real producer — #12 — same gap closed).
- Checked uniformly by everything routed through `push.service.ts`; the 3 bypass senders each re-implement their own copy of this check inline.

---

## 4. Tracking — the critical part

**This is the headline finding: a real measurement layer was built (12.08–08.09.2026) that the 54-day-old audit never saw.** It is live and has fired in production — verified by a direct read-only query against the `push_events` collection just now:

```
push_events (live, read-only query, 04.10.2026):
  push_sent:          64
  post_push_outcome:  64
  push_opened:         6
  landing_screen:      6
  push_dismissed:      0   ← declared as an event type, zero writers anywhere
```

### (a) SENT
**Logged — but only for 2 of 12 push types.** `functions/src/services/push-events.service.ts`'s `writePushSentEvent()`, called from `push.service.ts`'s `sendPush()` **only when the caller passes `opts.measurement`** — today that's exactly `stepGoalNudgeScheduler.ts` (#11) and `onPlannedActivityCreated.ts` (#12). Writes to `push_events/{pushId}_{uid}_push_sent`: uid, template/variant (`bundleId` as `variantId`), trigger category, persona, channel, `delivered` (bool), `sentAt`, plus outcome-window bookkeeping. The other 10 senders have **no persisted per-recipient sent record** — only ephemeral Cloud Functions log lines, except admin-broadcast (#9), which keeps an aggregate `deliveredCount`/`failedCount` on the broadcast doc itself (per-campaign, not per-user).

### (b) DELIVERED
**Same 2-of-12 coverage.** `push_sent.delivered` is a real per-uid boolean from the FCM multicast response. Beyond that, delivery success/failure for the other 10 senders exists only in function logs.

### (c) OPENED
**Logged client-side, same 2-of-12 coverage, plus a confusing second mechanism.** `src/lib/native/push.ts`'s native tap listener writes `push_events/{pushId}_{uid}_push_opened` with `openedAt` — gated on the same `data.messageId` (= `pushId`) the measurement-enabled senders stamp. **Separately**, there's an older, independent click-tracking write to `users/{uid}/notification_clicks` (also gated on `data.messageId`, which admin-broadcast also happens to stamp via its own pre-existing path) — feeding the *existing* CTR dashboard in `workout-settings/page.tsx`. **Two different collections, two different code paths, both triggered by the same tap, covering different and non-overlapping sets of senders.** `push_dismissed` is declared as an event type and never written anywhere — dead.

**Real measured open rate today (#11/#12 only): 6/64 ≈ 9%.**

### (d) POST-OPEN ACTION
**Exists, but narrower than "opened → action."** `pushOutcomeSweeper.ts` (cron, every 30 min) finds `push_sent` rows whose outcome window has elapsed and checks goal completion — **windowed from SEND time, not OPEN time** (default 6h), and it only knows how to evaluate **one** outcome: `category==='Daily_Goal' && activityType==='walking'` → did `dailyActivity.steps` reach `progression.dailyStepGoal` by end of that calendar day. Every other category (including #12's `Future_Partner_Plan`) gets `goalCompleted:false` + marked `unresolvable` — not a real check, just closed out so the sweeper doesn't rescan it forever. There is no "did they open this push and then start/finish a workout within N minutes" attribution anywhere — the closest real thing is this coarser, send-anchored, single-goal-type signal.

### Per-user push history on a user-detail screen
**Does not exist.** Confirmed: zero admin UI anywhere — including `/admin/users/all`'s own user-detail modal, which I was editing in the previous task this session — queries `push_events` or `notification_clicks` per-user. The data for a per-user timeline already exists in `push_events` (keyed by `uid`); nothing renders it.

---

## 5. Admin "מנהל התראות" today — and what's genuinely messy

**What it can do:** pure CRUD on the 219-doc corpus — a single-entry form (add/edit/delete) and a bulk paste-JSON/CSV uploader with deterministic hash IDs (safe re-upload). **No send/activate/publish action exists in this tab at all** — it only authors content that a scheduler may or may not later pull from.

**No stats of any kind** — no open rate, no send count, nothing — anywhere in this tab. The only stats UI anywhere in the whole push surface is a separate CTR dashboard elsewhere on the same `workout-settings/page.tsx` (clicks ÷ recipients, historical only, never fed back into any send-time decision) — and that dashboard reads the *older* `notification_clicks` mechanism, not the new `push_events` layer.

**What's messy / needs ordering, concretely:**

1. **Two unrelated "notification manager" UIs exist.** This `workout-settings` tab (content authoring for the 219-doc corpus) is a completely different thing from `src/app/admin/notifications/page.tsx` (per-channel kill-switch toggles + a template editor). They share no code, no Firestore doc, and overlapping names — the kind of thing that reads as duplication because it *looks* like it should be one screen.
2. **The template editor on `admin/notifications/page.tsx` is still a non-functional mock** — writes to `app_config/notification_configs`, which today has exactly **one** channel key (`training_reminder`) and is read by zero live senders for its template text. The per-channel enabled/disabled toggle on that same page *is* real and respected (by the 5+2 senders that go through `push.service.ts`).
3. **The 219-doc push corpus shares a page/tab/filter-UI with two unrelated, non-push content types** (workout titles, 184 docs; motivational phrases, 0 docs) — the direct cause of the "184" conflation in your question.
4. **Two independent, non-overlapping tap-tracking mechanisms now coexist** (`notification_clicks` for admin-broadcast; `push_events.push_opened` for #11/#12) — same user action, two collections, two write paths, and the newer one has no dashboard at all.
5. **10 of 12 live push types still bypass the persona system and the content library entirely** — the new persona/corpus machinery exists and works, but today it only reaches the 2 newest senders.

---

## 6. Gap table

| Capability | Status | Where | Note |
|---|---|---|---|
| **Sent** | PARTIAL | `push_events` (`push_sent`) | Only 2 of 12 senders write it (step-goal, planned-activity). The other 10 have no persisted per-recipient record — logs only, except admin-broadcast's per-campaign aggregate count. |
| **Delivered** | PARTIAL | `push_events.push_sent.delivered` | Same 2-of-12 coverage; FCM per-token failures beyond that are log-only. |
| **Opened** | PARTIAL | `push_events` (`push_opened`) **+** legacy `notification_clicks` | Two separate, non-overlapping collections/mechanisms. Measured today: 6/64 ≈ 9% open rate (step-goal + planned-activity only). `push_dismissed` type exists, zero writers. |
| **Post-open action** | PARTIAL | `push_events` (`post_push_outcome`) via `pushOutcomeSweeper` | Windowed from send time, not open time; only one outcome type (daily walking step-goal) has real logic — everything else is closed out unresolved, not actually checked. |
| **Per-user push history** | MISSING | — | Data already exists in `push_events`; nothing queries or renders it per-user. |
| **A/B by copy** | MISSING | — | `bundleId`/variant is already stamped on every sent/outcome row; nothing aggregates by it. No experiment framework exists. |
| **Send-time optimization** | MISSING | — | Every job fires at one fixed clock time for every recipient; no per-user timing signal anywhere. |

**Cheapest instrumentation path for each MISSING item:**
- **Per-user push history** — zero new writes needed. A read-only `push_events.where('uid','==',uid).orderBy('sentAt','desc')` query, surfaced as a new tab on the existing user-detail modal. Pure UI work on data that already exists (for the 2 covered senders).
- **A/B by copy** — zero new writes needed either. A group-by aggregation (admin dashboard query, or a scheduled rollup doc keyed by `bundleId`) over the existing `push_sent`/`post_push_outcome` rows. Same 2-of-12 coverage caveat applies until more senders adopt `measurement`.
- **Send-time optimization** — this one is a real build, not a cheap log addition: it needs a genuinely new signal (e.g., a per-user histogram of `push_opened.openedAt` hours, accumulated over time) before there's anything to optimize against.

---

## Source map

- Content library + new wiring: `src/app/admin/workout-settings/page.tsx`, `functions/src/services/notification-content.service.ts`, `functions/src/services/persona-alias-map.service.ts`, `.claude/knowledge/notification-manager-wiring-design.md`
- New senders: `functions/src/stepGoalNudgeScheduler.ts`, `functions/src/onPlannedActivityCreated.ts`
- Measurement layer: `functions/src/services/push-events.service.ts`, `functions/src/pushOutcomeSweeper.ts`, tap-side writes in `src/lib/native/push.ts`
- Shared send core: `functions/src/services/push.service.ts`
- Legacy schedulers (unchanged, still hardcoded/non-persona): `functions/src/trainingReminderScheduler.ts`, `functions/src/retentionScheduler.ts`, `functions/src/onboardingDropoffDispatcher.ts`
- Bypass senders (unchanged): `functions/src/sendPushFromQueue.ts`, `functions/src/chatMessageNotification.ts`, `functions/src/onboardingDropoffDispatcher.ts`
- Admin "settings" mock: `src/app/admin/notifications/page.tsx`
- CTR dashboard + legacy click tracking: `src/app/admin/workout-settings/page.tsx` (CTR section), `users/{uid}/notification_clicks`
- Workout-card content (confirmed unrelated to push): `workoutMetadata/workoutTitles`, `workoutMetadata/motivationalPhrases`, `workoutMetadata/smartDescriptions`, `src/features/workout-engine/services/workout-metadata.service.ts`
- Prior audit (54 days old, still useful for everything this doc doesn't re-cover — persona enum history, deep-link mechanics, templating primitives): `.claude/knowledge/push-engine-capabilities.md`
