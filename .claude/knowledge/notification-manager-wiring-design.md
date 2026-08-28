# Notification Manager Wiring — Investigation + Design

**Status: DESIGN ONLY. No code written, no wiring done, no Firestore writes made beyond read-only investigation.**
11.08.2026. Supersedes nothing — this is additive to `.claude/knowledge/push-phase0-implementation-plan.md`, which this work plugs into (reuses `push.service.ts`, the persona alias-map resolver, the `health_milestone` channel already flagged as clean/unused).

---

## Step 1 — Investigation findings

### Backing store
`workoutMetadata/notifications/notifications` — a **subcollection** (doc `workoutMetadata/notifications` is just a container, not a real content doc). Confirmed identically across 6 files: `src/app/admin/workout-settings/page.tsx:666`, `.../bulk/page.tsx:60,393`, `.../status/page.tsx:213`, `.../inject-parent-data.ts:198`, `src/app/admin/simulator/page.tsx:60,213`, `scripts/export-notification-corpus.ts:94-98`.

**Three live write paths**, not one:
1. Single-entry form in `page.tsx` (`addDoc`/`setDoc{merge:true}`/`deleteDoc`, :2270-2296, :2471-2474) — Firestore-auto 20-char IDs.
2. Bulk paste-JSON/CSV uploader (`bulk/page.tsx`) — deterministic FNV1a-hash doc IDs (`generateDocId`, :82-87) so re-upload is a safe upsert. 10/201 real entries have this ID shape.
3. `inject-parent-data.ts`'s `injectParentPersonaData()` — **dead code**, imported at `page.tsx:32` but never invoked anywhere in the repo.

`loadNotifications()` (`page.tsx:664-678`) fetches the **entire** subcollection with no `where()` — all filtering (persona/location/timeOfDay/daysInactive/text-search) happens client-side in the admin UI. At 201 docs this is cheap; the same "fetch-all, filter in-memory" approach is what the new selector should use too (see Step 2b).

### Complete schema

No single canonical type — `page.tsx:156-178`, `branding.types.ts:55-68` (`Notification` interface — the authoritative one, since it's what `resolveNotificationText()` consumes), and `simulator/page.tsx:36-44` all declare slightly different local interfaces. Real key-union across all 201 documents (verified directly against `scripts/corpus/notification-corpus.json`):

| field | type | real usage today | notes |
|---|---|---|---|
| `id` | Firestore doc ID | — | 191 auto-ID, 10 hash-ID |
| `triggerType` | `'Inactivity' \| 'Scheduled' \| 'Location_Based' \| 'Habit_Maintenance' \| 'Proximity' \| 'League_Overtake' \| 'Social_Matchmaking' \| 'Future_Partner_Plan' \| 'Community_Group_New'` (9 values, `branding.types.ts:38-47`) | **100% = `'Inactivity'`** | Form dropdown offers 5 of 9: Inactivity, Scheduled, Location_Based, **Habit_Maintenance**, Proximity (`page.tsx:2031-2035`) |
| `daysInactive` | `1 \| 2 \| 7 \| 30`, only meaningful for `Inactivity` | 100% = `1` | — |
| `persona` | free `string`, no enum | `''`=49, `parent`=41, `senior`=31, `student`=26, `high_tech`=21, `reservist`=15, `generic`=13, `army_combat`=3, `army_job`=2 | Form dropdown (`personaLabels`) omits 4 of these 8 real values (`high_tech`,`generic`,`army_combat`,`army_job`) — script-written docs with those values just render unlabeled in the admin table, same as today |
| `gender` | `'male'\|'female'\|'both'` | 100% = `'both'` | **No form control at all** — settable only via bulk-upload |
| `psychologicalTrigger` | `'FOMO'\|'Challenge'\|'Support'\|'Reward'\|'Social_Proof'\|'Loss_Aversion'` (6 values, `branding.types.ts:13-19`) | 100% = `'FOMO'` | Form dropdown offers 4 of 6: FOMO, Challenge, **Support**, Reward (`page.tsx:2068-2076`). `Social_Proof`/`Loss_Aversion` pair specifically with the 4 social triggers per the type's own doc comment |
| `text` | `string` | 100% populated | **The only field that carries real copy.** `@tag` syntax (e.g. `@שם`), resolved by `resolveNotificationText()`/`TagResolverContext` in `src/features/content/branding/core/branding.utils.ts:10-296` |
| `title` / `body` | not in the app's own type | **0/201 non-empty** | Neither live write path ever sets these — an export-script artifact, not a real field |
| `calendarIntegration` | `boolean` | 100% = `false` | Bulk-uploader hard-codes `false` regardless of input (`bulk/page.tsx:399`) |
| `bundleId` | not on the `Notification` type at all (belongs to a different content type, `WorkoutMetadataRow`) but 100% populated on real notification docs anyway | 187 distinct values, prefixes: `snr`,`gen`,`tech`,`prog`,`week`,`run`,`dad`,`mom`,`res`,`stu`,`young`,`st`,`sadir` | **No form control**, bulk-upload-only; **not read by any consumer today** — inert grouping metadata |
| `clickCount` / `completionRate` | `number` | 0/201 populated | Dead placeholders |
| `createdAt`/`updatedAt` | Firestore `Timestamp` | `serverTimestamp()` on write | 201 docs cluster into only 17 distinct timestamps (2026-03-18 to -20) — mixed scripted/bulk origin, not 191 individual manual saves |
| `sportType`,`motivationStyle`,`experienceLevel`,`progressRange`,`dayPeriod`,`programId`,`minLevel`,`maxLevel`,`distanceMeters` | various, all optional | **0/201 populated for any of them** | Fully wired in both the form and bulk-uploader — zero real-world adoption |

**Confirmed absent from the schema, searched exhaustively:** `timeOfDay` (exists on `MotivationalPhrase`/other content types, not `Notification`), `location` as a stored field (only a *runtime preview-context* param, never persisted), `deepLink`/`action`/`cta`/`route`/`screen` (nothing — the real `sendPush()` delivery contract accepts a `deepLink`, the corpus schema has no field for it at all), `active`/`enabled` flag, `priority`/A-B weight, locale/language, frequency cap.

### Wiring status
Confirmed: **zero files under `functions/src/`** reference this collection. The real production schedulers (`retentionScheduler.ts`, `onboardingDropoffDispatcher.ts`, `trainingReminderScheduler.ts`) all run on **hardcoded 4-5-variant arrays inside the scheduler file itself**, selected by `hash(uid) % N` — completely disconnected from this 201-entry store. Inside "מנהל התראות" itself there is no send/activate/publish action of any kind — only Save and Delete. This matches and sharpens the earlier audit's finding.

### Step/walking content gap
Exactly **2 entries** match any step/walk search, and they're an exact duplicate pair (`bundleId: "snr_walking_01"`, `persona: "senior"`): a **post-walk stretching reminder** ("חזרת מהליכה? בוא/י למתיחות קצרות"), not a step-goal message. Zero step-count/step-goal content exists anywhere in the corpus.

---

## Step 2 — Design

### Key finding that simplifies everything: use existing enum values, zero schema changes

`Habit_Maintenance` ("routine reinforcement / streak defence" per its own doc comment) is a real `triggerType` value — **already in the admin form's dropdown**, **zero real-world usage today (0/201)**. It's a better semantic fit for a step-goal nudge than inventing a new value, and needs no type-declaration changes anywhere (`branding.types.ts`, the bulk-uploader's `VALID_TRIGGER_TYPES`, the form dropdown all already accept it). Same story for `psychologicalTrigger: 'Support'` (or `'Reward'`) — also dropdown-offered, also 0/201 used today.

**Recommended fields for the step-goal message**, using only real, pre-existing schema — nothing invented:
```
triggerType: 'Habit_Maintenance'   // existing value, 0 real usage, UI-dropdown-supported, semantically fits
persona: 'generic'                 // existing value, 13 real precedents
gender: 'both'                     // 100% precedent
psychologicalTrigger: 'Support'    // existing value, UI-dropdown-supported; 'Reward' is the alt
calendarIntegration: false         // standard default
bundleId: 'steps_evening_generic_01'  // free text — the selector will filter on this prefix (see 2b)
text: '<Hebrew copy, e.g.>: "@שם, עוד קצת ונגיע ליעד הצעדים של היום — יציאה קצרה עכשיו תסגור את זה 💪"'
// NOT daysInactive (only meaningful for triggerType='Inactivity')
```

**The one genuine gap: no `deepLink` field anywhere in the schema.** Two options, my recommendation is (i):
- **(i) Recommended — hardcode deep-link per category in the Cloud Function selector**, not on the message doc. A category→deepLink lookup (`Habit_Maintenance` + `bundleId` prefix `steps_` → `/map?openRun=walking`) living in code, same pattern already used by every existing scheduler (`onboardingDropoffDispatcher.ts`'s own `DEEP_LINK` constant, `trainingReminderScheduler.ts`'s hardcoded `'/'`). Keeps "plug into the existing store" literally true — zero schema changes, zero risk to the content-authoring surface you actively use.
- (ii) Alternative — add a real `deepLink?: string` field to the schema. Only worth it if you want per-message deep-link override capability later (e.g. different step messages linking to different places). Flagging as your call, not doing it unless you want it.

### (a) Seed script

Writes directly via Admin SDK (bypasses the form/bulk-uploader UI, but produces byte-identical document shape to what the bulk-uploader would write). Recommend reusing the bulk-uploader's **deterministic hash doc-ID scheme** (`generateDocId()`, `bulk/page.tsx:82-87`) rather than `addDoc`'s random ID — makes the script safely re-runnable (idempotent upsert via `{merge:true}`) instead of creating duplicates on every re-run during iteration/testing. Location: `scripts/seed-step-goal-notifications.ts`, modeled on `scripts/export-notification-corpus.ts`'s existing service-account-init pattern (read-only there; this one writes).

Content plan: start with **1 message**, not a set — matches "first test to David's device only." Expand the library only after the single message is confirmed working end-to-end.

### (b) Selection layer — Cloud Function module

New file: `functions/src/services/notification-content.service.ts`.

```
selectNotificationContent(opts: {
  triggerType: NotificationTriggerType;
  bundleIdPrefix?: string;   // narrows within a triggerType, e.g. 'steps_' — needed because
                             // triggerType alone is coarse (Habit_Maintenance could hold other
                             // future non-step content too)
  persona: CanonicalPersona; // from the Phase-0 persona-alias-map resolver
  uid: string;                // for deterministic selection among multiple matches
}): Promise<{ text: string; bundleId: string } | null>
```

- Fetch+cache the **entire** subcollection in memory (mirrors the admin UI's own no-`where()` pattern — 201 docs is cheap), TTL ~10-15 min, same shape as `push.service.ts`'s existing `channelConfigCache` pattern (reuse the idea, not the code — different collection).
- Filter in-memory: `triggerType` match → `bundleId.startsWith(bundleIdPrefix)` if given → `persona === target || persona === 'generic' || persona === ''` (blank treated as generic, consistent with the Phase-0 alias-map's own handling).
- Among multiple matches: `hash(uid) % candidates.length` — the same deterministic-rotation pattern every existing scheduler already uses. **Not** a priority-weighted `getBestMessage()`-style system — that's explicitly out of scope (locked decision #2: extending that pattern to FCM is separate future work), and the schema doesn't even have a `priority` field to weight by.
- Text resolution: the corpus's `@tag` syntax is resolved today by `resolveNotificationText()` in `src/features/content/branding/core/branding.utils.ts` — **`src/` code, can't be imported into `functions/src`** (same cross-project boundary as the Phase-0 persona-alias-map). For the step message(s), recommend keeping `text` simple enough to need only a minimal tag mirror (e.g. just `@שם`→name, reusing the same `{var}`-style regex-replace the existing schedulers already use, adapted for the `@word` syntax) rather than porting the full tag vocabulary (location, league rank, social/matchmaking context) — that fuller port is only needed once/if this selector also starts serving the other ~199 retention-oriented entries.

**Scope decision, flagged explicitly**: you said (b) is "what turns the whole 201-message library live, not just the step ones" — the plumbing above (fetch/cache/filter/select/send) is built generically enough to serve any `triggerType`, but I recommend the **first live caller be only the new step-goal trigger** (2c), leaving `retentionScheduler.ts`/`onboardingDropoffDispatcher.ts`/`trainingReminderScheduler.ts` on their current hardcoded arrays for now. Migrating those three to consume this selector is a natural next step but needs its own full `@tag`-resolver port and its own separately-flagged, separately-reviewed rollout — bundling it into this round would mean touching 3 already-live, already-flagged-in-Phase-0 schedulers at the same time as shipping a brand-new trigger, which is more simultaneous risk than "test to my device first" calls for. **Confirm this narrower first slice is what you want**, or tell me to widen it.

### (c) Step-goal trigger — new scheduled Cloud Function

New file: `functions/src/stepGoalNudgeScheduler.ts`, modeled directly on `trainingReminderScheduler.ts`'s structure.

- `onSchedule({ schedule: '0 18 * * *', timeZone: 'Asia/Jerusalem', ... })` — 18:00 IST, sits safely inside active hours (`skipQuietHours: true`, standard for scheduled jobs per every existing scheduler).
- Query candidates: `users` where `onboardingStatus == 'COMPLETED'`, batched (`BATCH_LIMIT`, same pattern as `retentionScheduler.ts`).
- Per candidate: fetch `dailyActivity/{uid}_{today}.steps`, compare against `users/{uid}.progression.dailyStepGoal`; keep only below-goal users. **This is N extra Firestore reads for N candidates** (one `dailyActivity` doc per user) — flagging the read-cost explicitly, same category of cost `retentionScheduler.ts` already accepts for its cohort size, but worth watching once this scales past the test phase.
- Resolve persona via the Phase-0 `resolveCanonicalPersona()` mirror (`functions/src/services/persona-alias-map.service.ts`, already shipped, zero other callers today — this becomes its first live caller).
- Call `selectNotificationContent({ triggerType: 'Habit_Maintenance', bundleIdPrefix: 'steps_', persona, uid })`.
- Call `sendPush({ toUids: [uid], channel: 'health_milestone', title: '<short title>', body: selectedText, deepLink: '/map?openRun=walking', data: { triggerType: 'StepGoal' }, rateCapHours: 24, skipQuietHours: true })` — `'health_milestone'` per the Phase-1 recon finding, confirmed zero producers today, clean no-conflict home.
- **"First test to David's device only" mechanism**: an env-var allow-list, `STEP_GOAL_TEST_UIDS` (comma-separated), mirroring the existing `_TEST_MODE` convention already used by every scheduler. When set, the function **skips the full candidate query entirely** and only evaluates the listed uid(s) directly — not just a dry-run/log-only mode (those already exist as a separate `STEP_GOAL_TEST_MODE` flag per the established pattern), a genuine audience restriction. Remove the env var (or leave it set to nothing) once validated to open up to the real batch query.

### Feature flag

One flag covers the whole feature: `app_config/feature_flags.stepGoalNudgeEnabled`, default `false`/absent — checked first thing inside the scheduled function; when false, the function logs and returns immediately (same shape as `onboardingDropoffDispatcher.ts`'s `DROPOFF_TEST_MODE` early-exit). Deploying the function itself is safe regardless of flag state — it does nothing until flipped.

### Open decisions for your review (nothing built yet, all recommendations above, not settled)

1. `deepLink` — hardcode in the Cloud Function (recommended) vs. add a real schema field.
2. `psychologicalTrigger: 'Support'` vs `'Reward'` — both are valid, dropdown-supported, zero real precedent either way; your call on tone.
3. Selector (b)'s first live caller — **step-goal trigger only** (recommended, narrower blast radius) vs. also migrating the 3 existing schedulers in this same round (matches your literal "not just the step ones" framing more fully, but is meaningfully more simultaneous risk).
4. `bundleIdPrefix: 'steps_'` as the fine-grained filter under the coarse `triggerType: 'Habit_Maintenance'` — confirms the naming convention for any future step-related bundles.
5. Test-scoping mechanism (`STEP_GOAL_TEST_UIDS` allow-list) — confirms this is the right shape for "first test to my device only," or if you have a different mechanism in mind.

Nothing above has been implemented. Say go-ahead (and resolve/override the 5 decisions, or accept the recommendations) and I'll write the actual script + Cloud Function code, each as its own local commit with diff shown before any push — same rhythm as Phase 0.
