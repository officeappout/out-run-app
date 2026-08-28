# Why steps weren't syncing for David's account — diagnosis

**Read-only, 12.08.2026. Nothing changed.** uid `nX2AM2HJ79WulFZ2F7jGoA4kDhl1`.

## Answer: (c) — a device/permission-side event, not a code bug or admin-specific path

David went through the optional health-connect onboarding step **on 2026-08-11**, and that's exactly when real step data started flowing. Before that, his account had been silently steps-blind for months despite being fully onboarded.

## The evidence, point by point

**1. `dailyActivity/{uid}_{date}` docs — is data flowing at all?**
Yes, now. 20 docs total exist for this uid. The 18 oldest (2026-01-29 through 2026-07-29) **all show `steps: 0`**, no `passiveSteps` field at all. The 2 newest — **2026-08-11: `steps=2042`** and **2026-08-12: `steps=7`** — are real, and both have `passiveSteps` populated matching `steps` (the shape the passive HealthKit-sync path writes). The transition is a hard line at 8/11, not a gradual ramp-up.

⚠️ Unexplained anomaly, not resolved here: 4 of those 18 zero-step docs are dated **before David's own account `createdAt` (2026-06-19)** — 2026-01-29, 02-23, 03-13, 04-30. I don't have an explanation for activity docs predating account creation (possible uid reuse, seed/test data, or a `createdAt` reset unrelated to first real use) — flagging it rather than guessing.

**2. Steps-permission module — completed? state set?**
`users/{uid}.health.connectState = "granted"`, `connectStateUpdatedAt = 2026-08-11T15:14:22Z` — **matches the steps-data transition to the minute.**

The module is real and named: `HealthConnectOptInStep` (`src/features/user/onboarding/components/HealthConnectOptInStep.tsx`, routed at `/onboarding-new/health-connect`), invoked via `requestHealthPermissions()` → `useHealthWithDisclosure.ts`. Critically, **it's explicitly optional** — `LifestyleWizard.tsx:108`'s own comment confirms it's "offered as its own optional onboarding step," and `onboardingStatus` can reach `COMPLETED` without ever touching it (confirmed: David's account did exactly this — `onboardingStatus: 'COMPLETED'`, `onboardingPath: 'FULL_PROGRAM'`, for 8 weeks with zero real step data).

`health.connectState` is synced to Firestore specifically for this kind of query — `src/lib/healthBridge/init.ts:729-753`'s own doc comment says so verbatim: *"Purely for future server-side querying (e.g. a re-engagement push campaign targeting connectState in ['deferred', 'not_asked'])."* **Correction to an earlier finding from this same session's Phase-1 push-engine recon**: that audit concluded steps-permission state "is never synced to Firestore, tracked only in a local Zustand store." That was accurate for the *local* grant flags (`healthPermissionAsked`/`healthBridgeEnabled` in `useSettingsStore`), but missed this separate, real, Firestore-mirrored `health.connectState` field — worth knowing if a future push campaign wants to target users who deferred/never-asked (the mechanism already exists, per that comment, just unused today).

**3. Account creation date — old, pre-steps-feature?**
`createdAt: 2026-06-19` — 8 weeks old at time of writing. Not pre-feature: a real, non-admin user I sampled has continuous step data starting **2026-05-11**, a full month *before* David's account even existed — the feature was live and working well before his signup. His gap isn't "the feature didn't exist yet," it's "he personally didn't grant permission until now."

**4. Admin flag — does it alter the steps path?**
`core.isSuperAdmin: true`, `core.role: 'USER'`. Grepped `isSuperAdmin` across the entire health/activity/ingestion code path (`functions/src/`, `src/features/activity/`, `src/lib/healthBridge/`, `src/lib/outbox/`) — **zero matches** (the only repo-wide hits are in unrelated files, `runDataMigration.ts` and `auditLogger.ts`). No special-casing exists in code. Independently confirmed by data: the healthy 92-day-history real user in my sample is `isSuperAdmin: false` — same pipeline, works fine regardless of admin flag.

**5. `progression.dailyStepGoal` — present?**
**No — confirmed absent/undefined.** Separate gap from step-count syncing (this field is the *goal*, not the *count*; my `stepGoalNudgeScheduler` already defaults to 3000 when absent, so it's not blocking that feature). Likely never set because the goal-setting flow that populates it (`smart-goals.service.ts`) hasn't run for his account either — plausibly connected to the same "skipped optional setup" pattern, not independently investigated further here.

## Systemic gap or isolated to David?

**Both, in a specific way — the underlying gap is real and structural, but David's specific *fix* (his transition to working) is not part of any broader fix.**

Sampled real, engaged users (`onboardingStatus: 'COMPLETED'` AND has FCM tokens registered — filtered specifically to exclude the large number of synthetic/seed accounts in this database, e.g. the `sderot-m...`-prefixed demo records with no onboarding/no tokens, which make up 19 of the first 20 accounts by creation date and are not representative of real usage):

- Only 5 real engaged users found in the sampled page.
- **1 of 5**: perfectly healthy, continuous real step data for 92 days straight — proves the core pipeline works correctly and robustly when permission is actually granted.
- **2 of 5 (40%)**: have `dailyActivity` docs but **permanently `steps: 0`** — the exact same stuck state David was in until 2 days ago. This is a real, current, non-trivial gap affecting other real users right now, not just a historical curiosity about one account.
- **0 of 5**: show David's specific "was zero, now real" recent transition — nobody else's data changed shape recently. His fix was personal (he went through the flow on his device), not the result of a code change or a broader campaign — confirmed also by there being no relevant code change to the health/steps pipeline in this session's git history.

**Practical read**: the optional, skippable health-connect step is a genuine structural gap — some real, fully-onboarded users are permanently steps-blind simply because they never revisited that one optional screen, and there's no strong ongoing nudge to complete it beyond ad-hoc "steps-ring entry points" per the code's own comment. The other 2 stuck real users in this small sample won't self-resolve the way David's did unless they also go through `HealthConnectOptInStep` (or its re-prompt path) themselves. Sample size is small (5 real users found in one page of 60) — the true scale across the full active base isn't established at this size, but the direction and mechanism are solid.

## Source map
- `src/lib/healthBridge/init.ts:493` (`requestHealthPermissions`), `:679-753` (state machine + Firestore mirror, `syncHealthConnectStateToFirestore`)
- `src/features/user/onboarding/components/HealthConnectOptInStep.tsx`, routed `src/app/onboarding-new/health-connect/page.tsx`
- `src/hooks/useHealthWithDisclosure.ts`
- `functions/src/ingestHealthSamples.ts` (passive `steps`/`passiveSteps` writer, callable, client-invoked per sync batch)
- Client-side richer `dailyActivity` writer (`stepsGoal`/`calories`/`categories`/`activityType`/`floorsGoal`): `src/features/activity/store/useActivityStore.ts`, `src/features/activity/services/activity-history.service.ts` — a second writer onto the same doc, not traced further than confirming its existence (out of scope for this diagnosis)
- `src/features/user/identity/services/profile.service.ts:66` (`dailyStepGoal: 3000` default, never reached for this account)
