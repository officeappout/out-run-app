# Ticket — Admin test-push route silently fails FCM send in production

**Status:** OPEN, not blocking. Needs David's GCP/Vercel console access — do NOT build/change anything until actioned.
**Discovered:** 10.08.2026, during a controlled single-device push-delivery test (step-goal notification investigation).

---

## Symptom

`POST /api/admin/notifications/test` (`src/app/api/admin/notifications/test/route.ts`) — the admin panel's "send a test push to one user" endpoint — returns `HTTP 200` with `{ delivered: 0, failed: 1, tokens: 1 }` for a real, valid, currently-registered device token. No thrown error, no 5xx — the request completes "successfully" while silently failing to deliver.

This affects **every** call to this route in production today. The feature (send-test-push-to-a-user, used from `/admin/notifications`) is currently non-functional, even though it reports HTTP 200.

## Root cause

Confirmed via direct comparison, not guessed:

1. **The token and device are fine.** The exact same FCM payload (title/body/data/apns/android blocks), sent via `admin.messaging().sendEachForMulticast()` **directly** from a local script using the `FIREBASE_SERVICE_ACCOUNT_KEY` value in `.env.local` (service account `firebase-adminsdk-r84y7@appout-1.iam.gserviceaccount.com`), **succeeded** — real message IDs returned, delivered.

2. **Firestore reads inside the deployed route succeed** — it correctly resolves the target user doc and reads `fcmTokens` (proven: the response's `tokens: 1` count was correct).

3. **Only the FCM send, specifically inside the deployed Vercel route, fails** — no exception thrown, just a per-token failure inside `sendEachForMulticast`'s response array (the route doesn't currently log the individual `response.error.code`/`message` per token — see "Suggested route improvement" below, that's why this took extra digging to diagnose).

This combination — Firestore works, FCM doesn't, only inside that one deployed execution context — points at one of two things:

- **(a) IAM gap**: whichever service account Vercel's `FIREBASE_SERVICE_ACCOUNT_KEY` (or `GOOGLE_SERVICE_ACCOUNT_KEY` fallback — see `src/lib/firebase-admin.ts` credential-resolution order) resolves to in the **production Vercel environment** has Firestore/Datastore permissions but lacks the IAM role needed to send Cloud Messaging (`Firebase Cloud Messaging API` — needs "Firebase Cloud Messaging Admin" or equivalent, which is a separate grant from Firestore access; `src/lib/firebase-admin.ts`'s own doc comment already warns "The Gmail-delegation SA may lack these [roles]" — that warning was written for Firestore/Auth, but the same risk applies to Messaging and was apparently never checked for it specifically).
- **(b) Stale/different key**: Vercel's env var value doesn't actually match the `.env.local` key that was just proven to work — possible drift between what's configured in Vercel vs. what's in the local dev file.

I could not distinguish (a) vs (b) further without Vercel dashboard / GCP IAM console access, which I don't have in this session.

## What's NOT affected

`functions/src/services/push.service.ts` (the real `sendPush()` used by `trainingReminderScheduler.ts`, `retentionScheduler.ts`, `onboardingDropoffDispatcher.ts`, `chatMessageNotification.ts`, `sendPushFromQueue.ts`) is a **structurally different credential path** and is very likely unaffected:

- All of them call bare `admin.initializeApp()` with **no explicit credential** (grep-confirmed across `trainingReminderScheduler.ts:45`, `retentionScheduler.ts:48`, `sendPushFromQueue.ts:41` — no `serviceAccount` override anywhere in `functions/src/index.ts` or `firebase.json` either).
- Cloud Functions running on actual GCP infrastructure resolve Application Default Credentials automatically to the function's **runtime service account** — not a manually-supplied downloaded key like Vercel needs, since Vercel isn't GCP infrastructure and has no metadata server to query.
- This is a fundamentally different, GCP-native credential path from the Vercel/Next.js route's explicit-key approach — the exact bug found here (an externally-supplied key missing one specific IAM role) structurally cannot occur the same way for code running natively on GCP with ADC.

**Caveat — not directly tested.** This assessment is based on code + infrastructure reasoning, not a live send. I did not run a real Cloud Functions push test to confirm empirically (per instruction, no further test sends without asking first). If you want empirical proof before building the step-goal scheduler on top of this path, that would need one more single-device test, explicitly approved.

## The fix (for David to action in console — not built here)

One of:

1. **Grant the IAM role.** In GCP IAM Console (project `appout-1`), find the service account matching whatever `FIREBASE_SERVICE_ACCOUNT_KEY` (or `GOOGLE_SERVICE_ACCOUNT_KEY`) is set to in **Vercel's production environment variables** (Vercel dashboard → Project Settings → Environment Variables), and grant it the **"Firebase Cloud Messaging Admin"** role (or confirm it already has "Firebase Admin SDK Administrator Service Agent", which should cover it).
2. **OR align the key.** If Vercel's env var is meant to just be a copy of the Cloud Functions' working setup, the simplest fix may be replacing Vercel's `FIREBASE_SERVICE_ACCOUNT_KEY` value with a fresh key downloaded for `firebase-adminsdk-r84y7@appout-1.iam.gserviceaccount.com` — the exact service account already confirmed to have working FCM send permission (verified live, 10.08.2026).

Either fix is a console/dashboard action — nothing in this repo needs to change for it. Re-test with `POST /api/admin/notifications/test` (or the admin UI) afterward to confirm `delivered: 1`.

## Suggested route improvement (optional, separate from the fix)

While debugging this, I noticed `src/app/api/admin/notifications/test/route.ts` returns only `{ delivered, failed, tokens }` — it discards the per-token `response.error.code`/`message` from `sendEachForMulticast`'s result. Logging or returning that would have made this diagnosable from the route's own response instead of requiring a side-by-side local reproduction. Not urgent, just noted for whenever this route gets touched next.
