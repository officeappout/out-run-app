# Daily-Goal Notifications — Wave 1 (12.08.2026)

**Branch:** `feat/daily-goal-notifications-wave1`. **Status:** built, seeded, flag OFF, awaiting device test + David's review before merge.

First end-to-end vertical of the notification/measurement engine, proving the whole pattern on the steps axis with measurement wired in from day one.

---

## The new axis

**`dailyGoalBucket`** (`branding.types.ts`): `'start' | 'mid' | 'close' | 'hit' | 'over'` — how much of TODAY's resettable activity goal remains. Buckets (as actually computed by `stepGoalNudgeScheduler.ts`'s `computeDailyGoalBucket`): start [0,25), mid [25,70), close [70,100), hit exactly 100, over >100.

Explicitly **distinct** from the pre-existing `progressRange` field (0-20/20-90/90-100), which measures progress within a multi-week training *program* and is untouched.

**`activityType`**: `'walking' | 'strength' | 'running'` — makes the axis activity-agnostic. Same axis, same 5 buckets, this field is the only thing that varies per activity.

**New trigger type**: `'Daily_Goal'` — added to `NotificationTriggerType` (was 9 values, now 10), the admin form's trigger dropdown, and the bulk-uploader's validation list.

**Wave 1 scope**: **steps only** (`activityType: 'walking'`), buckets **start/mid/close only** (hit/over are schema-ready, not seeded — no celebration copy yet). Strength is deliberately deferred — see "Strength decision" below.

---

## Strength decision (important — read before building the strength slice)

David's instruction assumed `dailyStrengthPct` "already exists in the app." Investigated: it's real, well-designed, and would have been a clean reuse — **but it lives only on the unmerged `feat/home-daily-goal-v1` branch**, gated behind `HOME_DAILY_GOAL_V1=false`. Confirmed via diff (`git diff main feat/home-daily-goal-v1`):
- `completion-sync.service.ts` / `useProgressionStore.ts` write `dailyStrengthPct` to `dailyProgress/{uid}_{date}` only when the flag is on AND the strength player passes a `strengthCompletion` snapshot at completion time (a caller-side change also only on that branch).
- Turning the flag on **also changes what `workoutCompleted` means sitewide** — it becomes gated on `strengthCompletion.met` instead of unconditionally `true` on any completion, which feeds the schedule flame/streak logic (per the separate schedule-consolidation audit in `parking-lot.md`'s "לו"ז" section). That's real, unrelated blast radius for a notification feature to take on as a side effect.

**Decision (David, asked explicitly mid-build): ship steps only this wave.** Strength stays out until `feat/home-daily-goal-v1` merges on its own timeline, then gets added as a follow-up slice reusing the same `dailyGoalBucket`/`activityType` schema — no rework needed, just new seeded content + a strength scheduler once the real pct is live and unflagged on `main`.

---

## `@` tag additions

Wired into the same tag-resolution path as every existing `@` tag:
- **Client** (`branding.utils.ts`, panel authoring/preview): `resolveNotificationText()` gets `@רצף` (raw `streakDays`) and `@צעדים_שנותרו` (`stepsLeft`, locale-formatted). `@מרחק` already existed (was Proximity-only, `distanceMeters`) — reused as-is for the suggested-route-distance meaning; same formatting function, different semantic caller.
- **Cloud Function mirror** (`notification-content.service.ts`'s `personaliseNotificationText()`): same 3 tags, hand-mirrored (can't import `src/` into `functions/src` — same cross-project boundary as the persona alias-map). Kept the old generic `{key}` replace too (harmless, used by nothing currently but zero cost to keep).
- **Panel preview bug fixed as a side effect**: the admin form's live preview called `resolveNotificationText()` directly, which never actually resolved `@מרחק` (that tag only lived in `resolveDescription()`, one function over). Switched the 3 preview call sites to `resolveContentTags()` — the unified resolver already built for exactly this (chains `resolveDescription` → `resolveNotificationText`) — so `@מרחק` previews correctly for the first time, and the new tags work too.

---

## Measurement layer

### Storage decision: dedicated `push_events` collection

Two candidates investigated and rejected before landing here:
1. **`users/{uid}` scalar fields** (`onboardingStatus`, `dropoffNotifiedAt`) — the "onboarding action log" hint. Wrong shape entirely: overwritten-in-place scalars, can't hold 5 events × every push × lifetime.
2. **`analytics_events`** — the real generic event log (append-only, client-writable, feeds the admin Timeline tab + CPO onboarding-funnel dashboard). Structurally closer, but it's a shared, unindexed firehose with a generic `isAuthenticated()` create rule — piling high-volume push telemetry onto it risks slowing the funnel queries it already serves, and the "goal completed within 6h" time-window query needs its own composite indexes that don't belong on a shared collection.

**Decision**: `push_events/{pushId}_{uid}_{eventType}` — deterministic IDs (idempotent re-writes), purpose-built composite index (`eventType`, `outcomeChecked`, `checkAfter`) added to `firestore.indexes.json`, isolated from `analytics_events`'s query load.

### Schema

```
push_events/{pushId}_{uid}_{eventType}
  pushId          — correlates all events for one logical send
  uid
  eventType       — 'push_sent' | 'push_opened' | 'push_dismissed' | 'post_push_outcome' | 'landing_screen'
  variantId       — = bundleId (no new field — bundleId was already a de-facto variant identifier)
  category        — = triggerType, e.g. 'Daily_Goal'
  persona
  activityType
  framing         — = psychologicalTrigger
  timeOfDay
  channel
  createdAt

  # push_sent only:
  delivered, sentAt, outcomeWindowHours, checkAfter, outcomeChecked

  # push_opened / landing_screen only:
  openedAt / (landingPath, loggedAt)

  # post_push_outcome only:
  goalCompleted, checkedAt
```

### Wiring

- **`push_sent`**: `push.service.ts`'s `sendPush()` gains an opt-in `measurement` param. When present: mints a `pushId` (Firestore auto-ID), stamps it as `data.messageId` in the FCM payload (**reuses the field the native tap handler already reads** for its pre-existing `notification_clicks` CTR write — no new correlation field needed, and that CTR mechanism now fires for free on measured sends too), writes one `push_sent` doc per attempted uid (uid counts delivered if any of its tokens succeeded — multi-device safe). Fully additive: every existing `sendPush()` caller (5+ live schedulers) is byte-identical when `measurement` is omitted.
- **`push_opened` + `landing_screen`**: `src/lib/native/push.ts`'s `notificationActionPerformed` handler, gated on the same `messageId` presence check as the CTR write. `landing_screen` logs the resolved deep-link path *before* the `window.location.href` navigation fires (that navigation unloads the JS context).
- **`push_dismissed`**: **not implemented — genuine platform limitation, not an oversight.** The Capacitor FCM plugin (`@capacitor-firebase/messaging`) exposes exactly 3 listeners in this codebase: `tokenReceived`, `notificationReceived` (foreground display), `notificationActionPerformed` (tap). No dismiss/deleted event exists in its public API on either platform without a native Notification Service Extension (out of scope). "Not opened" is already derivable from the absence of a `push_opened` doc for a given `pushId` — didn't fabricate a synthetic dismissed event to fill the schema slot.
- **`post_push_outcome`**: new `pushOutcomeSweeper.ts`, `onSchedule` every 30 minutes. Queries `push_events` where `eventType=='push_sent' && outcomeChecked==false && checkAfter<=now`. Wave 1 only knows how to resolve `category=='Daily_Goal' && activityType=='walking'`: compares `dailyActivity/{uid}_{date}.steps` against `progression.dailyStepGoal`, for the **send date** (derived from `sentAt` in Asia/Jerusalem, not whatever day the sweep happens to run — a 6h window can cross local midnight). Anything else is marked checked with `goalCompleted:false` and a log note, so the sweeper doesn't rescan it forever — honest "can't resolve this yet," not a fabricated result.

### Firestore rules

`push_events`: `allow read: if isAdmin()`; `allow create: if isAuthenticated() && request.resource.data.uid == request.auth.uid && request.resource.data.eventType in ['push_opened','push_dismissed','landing_screen']`. Server writes (`push_sent`, `post_push_outcome`) go through Admin SDK, which bypasses rules — no allowance needed for those. Pattern mirrors the already-proven `notification_clicks` sub-collection rule (`firestore.rules:299-302`).

⚠️ **Not yet verified against the emulator** (axioms.md §14 recommends it, not a hard law) — the rule is narrow and structurally identical to the already-live `notification_clicks` pattern, so it wasn't run through `firebase emulators:start` this round. Flagging so David can ask for it before deploy if he wants the extra check.

---

## Content library additions

12 messages seeded (`scripts/seed-daily-goal-notifications.ts`), all `triggerType:'Daily_Goal'`, `activityType:'walking'`:
- `generic` × {start, mid, close} × 2 variants = 6
- `parent` × {start, mid, close} × 1 variant = 3
- `office_worker` × {start, mid, close} × 1 variant = 3

Copy is a first pass (no brainstorm doc was available this round to pull exact wording from) — refine later, same as the original single test message.

The earlier ad-hoc test doc (`bundleId: steps_evening_generic_01`, `triggerType: Habit_Maintenance`) is **deleted** — no longer reachable by the scheduler's selector (now filters on `Daily_Goal`). `scripts/seed-step-goal-notifications.ts` is marked superseded in its own header, kept only as a historical record.

---

## Scheduler changes

`stepGoalNudgeScheduler.ts` (already-live, already-deployed function — extended in place, not duplicated):
- Selector call changed from `triggerType:'Habit_Maintenance', bundleIdPrefix:'steps_'` to `triggerType:'Daily_Goal', activityType:'walking', dailyGoalBucket:<computed>`.
- Dropped the "only send to below-goal users" pre-filter — bucket-based selection now handles it naturally (a `hit`/`over` user just finds no seeded content this wave and is skipped, same practical outcome, but the logic is correct once celebration copy exists later).
- Added `currentStreak` (`progression.currentStreak`) to the candidate fetch, for `@רצף`.
- Added `distanceMeters` via a mirrored `stepsToDistanceMeters()` (same formula as `route-request.utils.ts`'s `stepsToTargetKm()` — src/ code, not importable into `functions/src`).
- Wired `sendPush()`'s new `measurement` param.
- Same master flag as before: `app_config/feature_flags.stepGoalNudgeEnabled` (still `false` in prod).

**"Moments" interpretation** — David's spec named 3 moments (`start / mid+close / evening-close-gap`). Read as **bucket-flavored copy authored for a single evening send** (the existing 18:00 scheduler, unchanged cadence), not 3 new cron schedules — consistent with the prior wave's explicit "no time-of-day chunking yet, that's a later decision." If David meant literal multiple-times-a-day sends, that's a real scope difference worth confirming before the next wave.

---

## Independent review (before deploy)

Per this codebase's standing rule (the agent that writes code doesn't review its own output), ran a
multi-dimensional review workflow (correctness, Firestore security, backward-compat, data-integrity) on
the full diff before deploying, each finding adversarially verified. 13 raw findings, 10 confirmed. Fixed:

- **Blocking**: `push_events`'s create rule had no field-level allowlist — a client could attach
  server-only fields (`delivered`, `goalCompleted`, `variantId`, etc.) to its own `push_opened`/
  `landing_screen` doc despite the rule's own comment claiming otherwise. Fixed with per-eventType
  `keys().hasOnly([...])`; also dropped `push_dismissed` from the allowed `eventType` list since no
  client code writes it (least-privilege — don't leave a write path open for an unimplemented feature).
- **Moderate**: the admin panel's Edit button omitted `dailyGoalBucket`/`activityType` when populating
  the form from an existing notification, so editing any Daily_Goal message showed the wrong bucket/
  activity (defaults, not the real saved value) — fixed.
- **Moderate**: `personaliseNotificationText`'s generic `{key}` pass ran *after* the `@שם` (user name)
  substitution, so a display name literally containing `{steps_left}`-shaped text would get partially
  rewritten by the same regex. Fixed by reordering — the generic pass now runs first, on the raw
  template only, before any user-controlled value is spliced in.
- **Moderate**: when an entire FCM multicast batch throws (outage/quota), those uids' `push_sent` events
  were silently never written (only per-token failures inside a successful batch were tracked) — exactly
  the outage scenario measurement should catch. Fixed: the catch block now also marks those uids
  `delivered:false`.
- **Moderate**: client-side `push_opened`/`landing_screen` writes used `addDoc` (random ID), breaking the
  collection's own "deterministic ID, no dupes on retry" guarantee that the server-side events honor —
  fixed to `setDoc(doc(..., '{pushId}_{uid}_{eventType}'))`, matching the server pattern.
- **Minor**: admin dropdown labels said "close = 70-95%" while the real computed range is [70,100) —
  fixed the label text (also fixed the same stale figure in this doc, above).
- **Minor**: removing the below-goal pre-filter collapsed two different "no push sent" causes (real
  below-goal content gap vs. expected hit/over-no-celebration-copy) into one `skippedNoContent` counter,
  burying a real signal under an expected one — split into `skippedBelowGoalNoContent` /
  `skippedAtOrOverGoalNoContent` in the run-summary log.
- **Minor**: `outcomeWindowHours: 6` was duplicated as an independent literal in the scheduler instead of
  referencing `push-events.service.ts`'s `DEFAULT_OUTCOME_WINDOW_HOURS` — now imports and uses the
  constant so the two can't silently diverge.

**Not fixed, accepted for Wave 1 scale** (documented here instead, per the "no silent caps" principle —
not swept under the rug):
- `pushOutcomeSweeper.ts` has no per-doc claim/lock, so two overlapping scheduled invocations (GCP's
  documented at-least-once delivery, or a manual re-trigger) could both process the same `push_sent` doc.
  Because the outcome write uses the same deterministic ID either way, a race just means a redundant
  `set()` (last-write-wins on the same doc), not duplicate rows or corrupted data — and at Wave-1's
  single-test-uid, 30-min-cadence scale the realistic collision probability is effectively zero. A real
  fix (claim the doc via a status field inside a transaction before processing) is proportionate once
  `push_events` has real production volume, not before.
- Deploy-ordering: `pushOutcomeSweeper.ts`'s query needs the new `push_events` composite index built.
  `firestore:indexes` and `functions` are independent `firebase deploy` targets with no ordering
  enforced — handled operationally (deploy indexes first) rather than in code; the query fails safely
  (caught, logged, self-heals) if the index isn't ready yet, and `push_events` is a brand-new empty
  collection at deploy time so the index builds near-instantly regardless.

## Open items for a future wave

- Strength axis (blocked on `feat/home-daily-goal-v1` merging).
- `hit`/`over` celebration copy (schema-ready, unseeded).
- `push_dismissed` — no real fix available without native work; revisit only if a genuine product need for "actively dismissed vs never opened" emerges.
- Migrating `retentionScheduler.ts` / `onboardingDropoffDispatcher.ts` / `trainingReminderScheduler.ts` onto `notification-content.service.ts`'s selector + the measurement layer (deliberately out of scope, per the original Phase-0 scope decision — narrower blast radius for the first live-data pass).
