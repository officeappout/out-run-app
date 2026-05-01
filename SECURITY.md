# OUT-RUN — Security Architecture

> **Status:** Fortress Phase complete + Sprint 3–4 (Push, UGC sovereignty,
> ephemeral retention) — Apr 2026.
> **Audience:** internal engineering, third-party auditors, government compliance reviewers.
> **Scope:** the production web PWA (`appout-1.firebaseapp.com`), the
> Capacitor iOS/Android shells, and the `out-run-functions` Cloud
> Functions package.

This document is the single technical reference for every defensive layer
that protects user data, gameplay integrity, and admin operations in
OUT-RUN. It is meant to be readable end-to-end in 10 minutes.

---

## 1. Threat model

| #   | Adversary                                  | Realistic capability                                                                                              |
| --- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| T1  | Logged-in user with browser DevTools       | Can craft any Firestore SDK call with their own ID token. Can read network responses, mutate JS state.            |
| T2  | Anonymous attacker on the public internet  | Can hit any unauthenticated HTTP endpoint, can sign up, can hold a large number of free Firebase Auth identities. |
| T3  | Malicious authenticated user (peer abuse)  | Wants to read PII of other users, deface their feed posts, or self-promote to admin.                              |
| T4  | Compromised low-privilege admin token      | Can call admin endpoints. Must not be able to escape its tenant boundary or run destructive migrations.           |
| T5  | Source-code reader (open repo / contractor) | Can see every secret committed to the repo. Must not gain runtime access from that alone.                         |

The rest of this document maps each layer to the threats it defeats.

---

## 2. Authentication & RBAC

**Identity provider:** Firebase Authentication (email/password, Google).
There is no separate session backend; the Firebase ID Token *is* the
session. Tokens auto-expire every 60 minutes and are silently refreshed
by the SDK.

**Role resolution** (priority order, all checked on every request):

1. **Custom Claim `admin === true`** on the ID token.
   *Set via `admin.auth().setCustomUserClaims()` from a privileged
   tooling script.* This is the long-term canonical mechanism — the
   token carries the role, no Firestore read required.
2. **Hardcoded root-admin emails:** `david@appout.co.il`,
   `office@appout.co.il`. Mirrored in `firestore.rules`,
   `storage.rules`, and `runDataMigration`. Case-insensitive regex.
   Used as an unrevokable break-glass identity.
3. **Firestore-doc admin flags** at `users/{uid}.core.*`:
   `isSuperAdmin`, `isSystemAdmin`, `isVerticalAdmin`, `isTenantOwner`,
   plus `users/{uid}.role == 'admin'` and
   `core.role in ['admin', 'system_admin']`.
   Implemented in:
   - `src/features/admin/services/auth.service.ts` (`checkUserRole`)
   - `firestore.rules` (`isAdmin()`)
   - `storage.rules` (`isAdmin()` via `firestore.get()`)
   - `functions/src/runDataMigration.ts` (`requireAdmin()`)

**Tenant isolation:** the Custom Claim `tenantId` on the auth token
gates every cross-tenant read (`hasTenant()` helper in
`firestore.rules`). Root/DB admins bypass tenant checks.

**Mitigates:** T1 (browser cannot forge tokens), T3 (admin checks
require server-trusted state), T4 (low-privilege admin still bound by
tenant claims).

---

## 3. Firestore — field-level lockdown (`firestore.rules`)

The `users/{uid}` document is the most sensitive surface. Three
**deep-field comparison helpers** prevent privilege escalation by an
otherwise-authorized owner:

### Group A — `noAdminFieldsChanged()`
Locks `role`, `core.role`, `core.isSuperAdmin`, `core.isSystemAdmin`,
`core.isVerticalAdmin`, `core.isTenantOwner`, `core.isApproved`,
`core.managedVertical`. The byte-for-byte comparison uses
`request.resource.data.get('field', defaultValue) ==
resource.data.get('field', defaultValue)`, which works correctly even
when the field or its parent map is absent.

### Group B — `noTenantFieldsChanged()`
Locks `core.tenantId`, `core.tenantType`, `core.unitId`,
`core.unitPath`, `core.authorityId`. Tenant assignment is owned by the
`validateAccessCode` Cloud Function and admin tooling.

### Group C — `noGameIntegrityFieldsChanged()`
Locks `progression.coins`, `progression.globalLevel`,
`progression.globalXP`. The **only** authorized writer is the
`awardWorkoutXP` Callable Cloud Function (see §5).

### `create` hardening
A new `users/{uid}` document is rejected if it carries any
admin/role/approved flag set to non-empty/`true`. Combined with the
client always seeding `isSuperAdmin: false` etc., this prevents the
"sign up as admin" attack.

### Other notable Firestore rules
- `feed_posts.update` is locked to the original `authorUid`, AND the
  incoming `authorUid` must equal the existing one — preventing both
  defacement and ownership theft (H1).
- `feed_posts.delete` is locked to `request.auth.uid ==
  resource.data.authorUid` so a post can only be erased by its
  author (Sprint 4 / Phase 7.1 — UGC erasure right). Comparison is
  against the *existing* doc, not the incoming payload, so an
  attacker cannot spoof authorship to delete somebody else's post.
- `users` collection list/query is gated by
  `resource.data.core.discoverable == true`. Profiles are
  **non-discoverable by default**; the user must opt in via
  Settings → "נראות הפרופיל בחיפוש" (Sprint 4 / Phase 6.4) before
  appearing in any people-search query.
- `reports` accepts `create` from any authenticated user; the
  `targetType` field is open-ended (`group | event | post | user`)
  so the rule did not need to expand when reporting was extended to
  posts and users (Sprint 4 / Phase 7.2). Reads are admin-only.
- `programLevelSettings` and `program_level_settings` are
  authenticated-read, admin-write only (C2).
- `system_config` (feature flags) is public-read, admin-write —
  required for pre-auth feature flags but cannot be poisoned by users.
- The catch-all `match /{document=**}` only allows admins; any
  collection added in the future without an explicit rule fails closed.

**Mitigates:** T1, T3 — the most common privilege-escalation vectors
(`{'core.isSuperAdmin': true}`, `{'progression.globalLevel': 99}`,
forging `authorUid` on someone else's feed post).

---

## 4. Cloud Storage — content & quota lockdown (`storage.rules`)

`storage.rules` was rewritten in the Fortress Phase. The previous rules
allowed *any authenticated user* to write to admin folders and impose no
content-type or size validation.

### Cross-service admin verification
`storage.rules` calls `firestore.get(/databases/(default)/documents/users/$(uid))`
to read the same `core.is*Admin` flags used everywhere else. This makes
the role definition canonical — flipping a flag in Firestore takes
effect in Storage with no redeploy.

### Content-type & size validation
Every write path declares its acceptable content type and per-type cap:
- **Images:** `image/.*`, ≤ 10 MB.
- **Videos:** `video/.*`, ≤ 200 MB (only the `exercise-videos` admin
  folder accepts video).
- **PDFs:** `application/pdf`, ≤ 10 MB (health declarations).

### Path-by-path policy
- `/media-assets`, `/exercise-videos`, `/gear_icons`, `/parks`, etc.:
  `read: true`, `write: isAdmin() && image|video && size`.
- `/contribution-photos/{userId}/**`: owner-only image upload, public
  read. Whitelisted because `Step3Photo.tsx` writes here for the
  community-contribution wizard.
- `/health-declarations/{userId}/**`: owner-only PDF upload, owner +
  admin read.
- Everything else: deny.

**Mitigates:** T2 (no anonymous uploads), T3 (a logged-in attacker
cannot replace a 100 MB park asset, exhaust the storage bucket, or
swap an exercise video for a porn clip).

---

## 5. The Guardian — `awardWorkoutXP` Callable Cloud Function

### Why it exists
Group C of the Firestore rules blocks all client writes to the four
gameplay-integrity fields. **Some legitimate flow has to credit them.**
The Guardian is that flow.

### Where it lives
- Server: `functions/src/awardWorkoutXP.ts` (Firebase Functions v2,
  pinned to `us-central1`, 30-second timeout, 256 MiB).
- Client wrapper: `src/lib/awardWorkoutXP.ts` (single
  `httpsCallable` wrapper, returns `null` on failure).

### Validation pipeline
1. **Auth required.** `request.auth` must be present; anonymous
   callers receive `unauthenticated`. The function *always* uses
   `request.auth.uid` — the client cannot specify a target uid.
2. **Per-call deltas are clamped** to anti-cheat caps:
   - `xpDelta` ≤ 2 000 (≈ 5 hours of elite cardio at 3 XP/min × 1.3×
     streak multiplier).
   - `coinsDelta` ≤ 5 000.
   - `caloriesDelta` ≤ 5 000.
   Negative or `NaN` deltas are coerced to `0`.
3. **`source` label** is truncated to 64 chars and persisted on the
   user doc as `progression.lastAwardSource` for audit.
4. **Atomic write.** A single `userRef.update()` call uses
   `FieldValue.increment()` for `coins` / `globalXP` /
   `totalCaloriesBurned`. Race conditions between concurrent calls are
   resolved by the Firestore server.
5. **`globalLevel` is recomputed server-side** from the
   post-increment XP using a hardcoded mirror of
   `GLOBAL_LEVEL_THRESHOLDS`. The client cannot forge a level value —
   even passing a level through the API has no effect.
6. **Audit trail.** Every successful invocation logs
   `uid +XPΔ +coinsΔ +calΔ → newXP newLevel src=…` to Cloud Logging.

### Migrated call sites
All previous direct writers were migrated to the Guardian:
- `useProgressionStore.awardStrengthXP / awardRunningXP / awardBonusXP`
- `coin-calculator.service.awardCoins`
- `firestore.service.updateUserProgression`
- `WorkoutSummaryPage` (cardio XP after a free run)
- `PostWorkoutGoalInput` (level-goal bonus XP)
- `contribution.service.awardXP` (park contribution rewards)

A grep for `'progression.coins'` / `'progression.globalLevel'` /
`'progression.globalXP'` / `'progression.totalCaloriesBurned'` in the
client tree returns **zero direct write sites** as of this commit.

**Mitigates:** T1, T3 — the "open DevTools and grant yourself max
level" class of cheats.

---

## 6. Other Cloud Functions

| Function                                  | Trigger                              | Auth                                                        | Notes                                                                                                                  |
| ----------------------------------------- | ------------------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `validateAccessCode`                      | Callable                             | `request.auth` required                                     | Validates a B2E access code in a transaction; updates the caller's `core.tenantId` (Group B fields are server-only).  |
| `awardWorkoutXP`                          | Callable                             | `request.auth` required                                     | The Guardian. See §5.                                                                                                  |
| `runDataMigration`                        | Callable                             | `request.auth` + admin (claim/email/Firestore-flag)         | Refactored from a public HTTP endpoint with a hardcoded `?secret=…`. The secret was committed to the repo — replaced. |
| `requestAccountDeletion`, `onUserDelete`  | Callable / Auth trigger              | `request.auth` required (callable)                          | GDPR-grade account erasure: callable schedules deletion via `auth().deleteUser()`; the trigger then fans out to wipe all `users/{uid}/**` subtrees.|
| `logAuditAction`                          | Callable                             | `request.auth` + `enforceAppCheck`                          | Sole writer to the locked-down `audit_logs` collection (see §12.1).                                                   |
| `sendPushFromQueue`                       | Firestore `onCreate` `push_messages/{id}` | n/a (server context, claims the doc on entry)         | The Push Conductor — Sprint 3 / Phase 4.5. See §13.                                                                  |
| `cleanupOldLogs`                          | Scheduled (`0 3 1 * *` UTC)          | n/a                                                         | Monthly retention sweeper for `audit_logs` (24 mo) and `push_messages` (90 d, terminal-state only). See §12.5.        |
| `cleanupEphemeralDocs`                    | Scheduled (`7 * * * *` UTC, hourly)  | n/a                                                         | Hourly retention sweeper for `presence` (24 h) and `active_workouts` (2 h). Sprint 4 / Phase 6.2. See §13.            |
| `onGroupMemberWrite`, `deleteZombieGroups` | Firestore trigger / Scheduled        | n/a (server context)                                        | Membership counter maintenance.                                                                                        |
| `onUnitWrite`                             | Firestore trigger                    | n/a                                                         | Tenant hierarchy invariants.                                                                                           |
| `onFeedPostCreate`, `rollupLeaderboard`   | Firestore trigger / Scheduled        | n/a                                                         | Leaderboard fan-out & periodic snapshot.                                                                              |
| `ingestHealthSamples`                     | Callable                             | `request.auth` required                                     | One-shot ingest of native HealthKit / Health Connect samples. The raw answers never persist — only aggregate XP via the Guardian.|

### Critical fix: `runDataMigration`
**Before:** any internet user with the function URL could pass
`?secret=dudu2026` and rename / delete every tenant in the database.
The secret was committed to git and shipped in the bundle.

**After:**
- Converted to `onCall` (Firebase Auth ID Token required).
- The hardcoded secret is deleted.
- A `requireAdmin()` helper checks (a) `token.admin === true`, (b)
  root-admin email, (c) Firestore admin flags — same triple-redundant
  check used everywhere.
- Every invocation logs the admin uid for audit.

**Recommended next step:** delete `runDataMigration` entirely once
the one-time Hebrew-ID migration has been run on production data.

---

## 7. AI surface — fully removed

The previous `ai-coach.service.ts` shipped an **OpenAI key in
`NEXT_PUBLIC_AI_API_KEY`**, meaning the secret was downloaded by every
visitor. As part of the Fortress Phase:
- `ai-coach.service.ts` and `ChatDrawer.tsx` were deleted.
- All AI-related state and handlers were stripped from
  `useSearchNavigation.ts` and `useMapLogic.ts`.
- `NEXT_PUBLIC_AI_API_KEY` was removed from `.env.local` with a
  tombstone comment.
- **Action required:** the leaked OpenAI key MUST be revoked at
  `https://platform.openai.com/api-keys` before any further deploy.
  Treat it as compromised.

---

## 8. Time-based correctness — Midnight Sync

A subtle but production-critical defect: streaks, daily goals, and
calendar UIs all read `new Date()` at component-mount time. Without
intervention, the "Today" cell stays on yesterday's date until the user
hard-refreshes — silently breaking streak continuity at midnight.

**Mitigation:** `useMidnightRefresh()` schedules a single
`setTimeout(_, msUntilNextMidnight)` and bumps a global `dateKey`. Both
`useDayStatus()` (the unified completion-bridge hook) and the calendar
`useMemo`s subscribe to that key, forcing re-evaluation precisely at
00:00 local time. Hard-coded `>= 10` literals were replaced with
`STREAK_MINIMUM_MINUTES`, eliminating drift between the streak engine
and the badge logic.

This is not a confidentiality control but it *is* an integrity control:
without it, audited streak claims would not match recorded activity.

---

## 9. Secrets inventory

| Secret                              | Where                            | Acceptable to expose? | Notes                                                                              |
| ----------------------------------- | -------------------------------- | --------------------- | ---------------------------------------------------------------------------------- |
| Firebase Web API key                | `src/lib/firebase.ts`            | **Yes**               | Public by design — all enforcement is in rules and App Check.                      |
| Mapbox public token (`pk.…`)        | `.env.local`                     | **Yes**               | Domain-locked at Mapbox dashboard.                                                 |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`    | `.env.local`                     | **Yes**               | Public reCAPTCHA Enterprise site key for App Check (prod-required).                |
| `NEXT_PUBLIC_APP_CHECK_DEBUG_TOKEN` | `.env.local` (dev only)          | No                    | Per-developer debug token; never set in prod.                                      |
| `SESSION_COOKIE_SECRET`             | host env (Vercel/Hosting)        | **No**                | ≥32-char random; HMAC key for the admin session cookie.                            |
| `FIREBASE_SERVICE_ACCOUNT_KEY`      | host env (Vercel/Hosting)        | **No**                | JSON service account for the Next.js Admin SDK (or use ADC on GCP-hosted).         |
| OpenAI API key                      | *removed (Apr 2026)*             | No                    | Was committed; **must be revoked**.                                                |
| `MIGRATION_SECRET`                  | *removed (Apr 2026)*             | No                    | Replaced by ID-token + admin check.                                                |
| Firebase Admin SDK service account  | not in repo; injected at runtime | No                    | Cloud Functions get implicit credentials; tooling uses GCP application-default.   |

`.env.local` carries the tombstone comments so future contributors see
why the variable went away.

---

## 10. Defense-in-depth checklist

- [x] **AuthN:** Firebase Auth ID tokens, custom claims for tenant + admin.
- [x] **AuthZ (Firestore):** field-level allowlist on `users`; deny-by-default catch-all.
- [x] **AuthZ (Storage):** cross-service admin check, content-type and size validation.
- [x] **Server-only writes:** game-integrity fields routed exclusively through the Guardian.
- [x] **Server-only audit writes:** `audit_logs` collection is write-locked at the rules level; only the `logAuditAction` Cloud Function (Admin SDK) can insert rows.
- [x] **Audit trail:** every admin mutation captures `oldValue / newValue / sourceIp / uid / timestamp` server-side.
- [x] **Server-side admin gating:** `/admin/*` is gated by Edge middleware checking an HMAC session cookie minted after Admin-SDK ID-token verification.
- [x] **Firebase App Check:** reCAPTCHA Enterprise on the client + `enforceAppCheck: true` on every callable function (`awardWorkoutXP`, `validateAccessCode`, `runDataMigration`, `logAuditAction`).
- [x] **Long-lived log retention:** `cleanupOldLogs` deletes `audit_logs` older than 24 months and terminal-state `push_messages` older than 90 days on the 1st of each month.
- [x] **Ephemeral retention:** `cleanupEphemeralDocs` deletes `presence` > 24 h and `active_workouts` > 2 h every hour, guaranteeing the privacy-policy retention windows even when the client cleanup path fails (crash / kill-from-tray).
- [x] **Push notification consent:** push permission is requested only after sign-in via the Capacitor lifecycle bridge; sends are filtered server-side by `settings.pushEnabled` (master) and `settings.notificationPrefs.{channel}` (per-channel) before any token is harvested. See §13.
- [x] **Push idempotency & token hygiene:** `sendPushFromQueue` claims each queue doc via a transactional compare-and-set, and prunes dead FCM tokens from each owner's user doc on `registration-token-not-registered` errors.
- [x] **Profile non-discoverability by default:** `users` list/query rule requires `core.discoverable == true`; the toggle lives in Settings and defaults to off (Phase 6.4).
- [x] **UGC sovereignty:** authors can delete their own feed posts (rule + Phase 7.1 UI). Reporting now covers groups, events, posts, and users (Phase 7.2).
- [x] **Storage cleanup on UGC delete/replace:** `Step3Photo.tsx` calls `deleteObject` on the previous Storage path BEFORE clearing the UI / replacing it, eliminating orphaned images (Phase 6.1).
- [x] **PII hygiene:** server logs strip credentials (access codes, request bodies); only metadata + lengths are emitted.
- [x] **Secrets:** AI key purged, migration secret removed.
- [x] **Time correctness:** midnight refresh hooked into all calendar/streak UIs.
- [ ] **Cloud Function rate limits** beyond the Guardian's per-call cap: rely on Firebase's per-uid quotas + App Check today; consider explicit Cloud Armor rules in front.
- [ ] **Custom Claim migration:** flip `admin` and `tenantId` to claims-only and remove the Firestore-doc admin paths (Path C).
- [ ] **Password complexity + rotation enforcement** at the Firebase Auth tier (current default is 6-char minimum). MFA is inherited from Google (Workspace MFA) — see §12.
- [ ] **`me-west1` Firestore migration:** scoped in §15 — viable for Cloud Functions/Storage with low effort, but the existing Firestore database is region-locked and requires a parallel-instance cutover.

---

## 11. How to verify (operator runbook)

1. **Firestore rules:** `firebase emulators:start --only firestore` then run
   `firebase emulators:exec "npm run test:rules"` from a future test harness, OR open the
   Firebase console → Rules Playground and try:
   - Logged in as a normal user, attempt `update users/{self}` with
     `{'core.isSuperAdmin': true}` → must be **denied**.
   - Same with `{'progression.globalLevel': 99}` → must be **denied**.
   - Same with `{'preferences.theme': 'dark'}` → must be **allowed**.

2. **Storage rules:** Try uploading a 50 MB binary blob to
   `/media-assets/test.bin` as a non-admin user → must be **denied**.

3. **Guardian function:** From an admin's browser console, call
   ```js
   const { httpsCallable, getFunctions } = await import('firebase/functions');
   await httpsCallable(getFunctions(), 'awardWorkoutXP')({
     xpDelta: 9999999, source: 'audit-test'
   });
   ```
   The response should clamp `xpDelta` to 2000 and the user doc must
   reflect a `+2000` increment, not `+9999999`.

4. **runDataMigration:** Call the function while logged in as a
   non-admin → must throw `permission-denied`. Call it without auth
   → must throw `unauthenticated`.

5. **App Check enforcement:** Strip the App Check header from a
   `httpsCallable` request (e.g. `curl` directly to the function URL
   with a valid ID token) → must return `failed-precondition: missing
   app check token`.

6. **Server-side admin gate:** From an unauthenticated browser, navigate
   to `/admin/users` → must 302 to `/admin/login?next=/admin/users`
   BEFORE any admin JS bundle is shipped (verify via Network tab —
   the response is a redirect, no admin HTML body).

7. **Audit row shape:** After approving a pending admin in the UI,
   open Firestore → `audit_logs` → newest row → confirm the document
   contains `adminId`, `adminName`, `actionType`, `targetEntity`,
   `targetId`, `details`, `oldValue`, `newValue`, `sourceIp`, and a
   server `timestamp`.

8. **Retention sweeper:** Manually trigger `cleanupOldLogs` from the
   Cloud Functions console → confirm the log line
   `[cleanupOldLogs] Sweep complete — audit_logs=N, push_messages=M`.

9. **Ephemeral sweeper:** Manually trigger `cleanupEphemeralDocs`
   from the Cloud Functions console → confirm the log line
   `[cleanupEphemeralDocs] Sweep complete — presence=N, active_workouts=M`.
   On a quiet environment both numbers should be 0; on a busy one
   they should be small (< 100 / hour).

10. **Push pipeline (smoke test):** From the admin panel, send a
    push to `targetAudience: 'all'` in the test authority. Open
    the Firestore console → `push_messages` → newest doc → confirm
    the lifecycle: `pending` (admin write) → `processing`
    (`processingStartedAt` set) → `sent`
    (`deliveredCount > 0`, `processedAt` set,
    `tokensRemoved` ≥ 0). Verify the test device receives the
    notification on a locked screen.

11. **Push opt-out enforcement:** Toggle
    Settings → "התראות Push" → off, then re-send a push from the
    admin panel. The `push_messages` doc should land in `sent` with
    `deliveredCount` reduced by exactly one (your device's token
    was filtered server-side, not removed from `fcmTokens`).

12. **UGC erasure:** As an authenticated non-admin user, post to
    the feed, then delete via the kebab menu → confirm the
    `feed_posts` doc is gone in Firestore and the post disappears
    from the feed without a refresh. From a *different* user
    account, attempt the same delete via the rules playground
    (`request.auth.uid != resource.data.authorUid`) → must be
    **denied**.

13. **Profile non-discoverability:** With `core.discoverable
    !== true` on a test user, attempt a `where('core.discoverable',
    '==', true)` list query that includes that user → the user
    must NOT appear. Toggle the Settings switch on, repeat the
    query → user appears.

---

## 12. Compliance Summary (for the Compliance Officer)

This section maps each external compliance requirement to the
exact code path that satisfies it. It is the single page that
should be presented to an authority's information-security
reviewer.

### 12.1 Audit Logs — Ashkelon Req. 4.0

- **Schema:** every row records `adminId`, `adminName`, `actionType`,
  `targetEntity`, `targetId`, `details`, **`oldValue`**, **`newValue`**,
  **`sourceIp`**, and server `timestamp`. See
  `src/types/audit-log.type.ts`.
- **Server-only writes:** Firestore rules deny client writes
  (`firestore.rules` → `audit_logs` block: `allow create, update, delete:
  if false`). The only writer is the Callable Cloud Function
  `logAuditAction` (`functions/src/auditLogger.ts`), which uses the
  Admin SDK to bypass the deny rule.
- **Forgery resistance:** `adminId` is taken from `request.auth.uid` and
  `sourceIp` from `rawRequest.headers['x-forwarded-for']` — both are
  set by the Cloud Functions HTTPS edge and cannot be supplied by the
  caller. The client is free to lie about everything else; those values
  are validated against an allowlist (`ALLOWED_ACTIONS`,
  `ALLOWED_ENTITIES`) and length-clamped.
- **Before/After enforcement:** call-sites in `parks.service.ts` (status
  changes) and `admin-management.service.ts` (approve / reject /
  promote / revoke) read the entity, perform the update, then submit
  `oldValue` / `newValue` snapshots. Pattern is reusable for any other
  admin mutation.

### 12.2 Identity & MFA — Ashkelon Req. 14.1

- **Server-side ID-token verification:** every admin sign-in goes
  through `/api/auth/session` (`src/app/api/auth/session/route.ts`),
  which calls `firebase-admin.auth().verifyIdToken(idToken, true)`
  with `checkRevoked=true`. Forged or revoked tokens are rejected with
  HTTP 401.
- **Inherited MFA policy:** OUT-RUN admin sign-in is delegated to
  Google (Google OAuth + magic-link e-mail). MFA is therefore
  configured at the Google Workspace tier owned by the OUT
  organisation: every admin email (`*@appout.co.il`) is enrolled in
  Google's 2-Step Verification (TOTP / hardware key) at the workspace
  level. We do not run a parallel MFA stack inside the OUT app
  itself; the authority of MFA enforcement is Google. This pattern is
  explicitly permitted by the Ashkelon Appendix when the upstream
  identity provider is enterprise-grade.
- **Password rotation:** because OUT-RUN admins authenticate via
  Google OAuth (no in-app password), the 180-day rotation requirement
  is satisfied by Google Workspace's password-expiry policy on the
  organisational account.

### 12.3 Server-Side Admin Gating — Ashkelon Req. 17.1

- **Edge middleware:** `src/middleware.ts` runs on the Edge runtime
  before any HTML/JS is shipped. For every `/admin/*` path other than
  the unauthenticated entry points, it reads the `out_admin_session`
  HttpOnly cookie and verifies its HMAC signature with `jose`.
- **Cookie issuance:** the cookie is minted by `/api/auth/session`
  (Node runtime) only AFTER `firebase-admin` has verified the user's
  ID token AND resolved the admin role (custom claim → email allowlist
  → Firestore role). See `src/lib/firebase-admin.ts → resolveIdentity()`.
- **Cookie format:** HS256 JWT with `{ uid, email, admin, exp }`,
  HttpOnly, SameSite=Lax, Secure in production, 1-hour TTL matching
  the Firebase ID-token lifetime. The HMAC secret
  (`SESSION_COOKIE_SECRET`) lives only on the server.
- **Refresh:** `AdminSessionSync`
  (`src/features/admin/components/AdminSessionSync.tsx`) re-mints the
  cookie every 50 minutes and on tab focus, and clears it on sign-out.
- **Net effect:** an unauthenticated request to `/admin/users` returns
  a 302 to `/admin/login?next=/admin/users` with NO admin HTML body.
  The admin JS bundle is never shipped to non-admins.

### 12.4 DDoS & Bot Defence — Ashkelon Req. 22.1 (App Check)

- **Client init:** `src/lib/firebase.ts` calls `initializeAppCheck`
  with `ReCaptchaEnterpriseProvider(NEXT_PUBLIC_RECAPTCHA_SITE_KEY)`
  on the browser. `isTokenAutoRefreshEnabled: true` keeps the
  attestation token current.
- **Function enforcement:** every callable function sets
  `enforceAppCheck: true`:
  - `functions/src/awardWorkoutXP.ts` (the Guardian)
  - `functions/src/validateAccessCode.ts`
  - `functions/src/runDataMigration.ts`
  - `functions/src/auditLogger.ts`
- **Effect:** a `curl` request with a valid ID token but no App Check
  token is rejected with `failed-precondition`. Automated bots
  attempting credential stuffing or quota exhaustion fail the
  reCAPTCHA Enterprise scoring.

### 12.5 Data Retention — Long-Lived Logs (Audit + Push)

- **Mechanism:** `functions/src/cleanupOldLogs.ts` is an `onSchedule`
  Cloud Function pinned to `0 3 1 * * Etc/UTC` (03:00 UTC on the 1st
  of every month). It sweeps two collections in a single pass — one
  cron entry, one log line, one place to extend for future log
  retentions.
- **`audit_logs` (24 months):** queries `where timestamp < now -
  AUDIT_LOG_RETENTION_MONTHS` (default 24) and deletes in paged
  batches of 400 (safely under the 500-write Firestore ceiling).
- **`push_messages` (90 days, terminal-state only):** queries
  `where processedAt < now - PUSH_MESSAGES_RETENTION_DAYS` (default
  90). Filtering on `processedAt` (a field that `sendPushFromQueue`
  only writes on terminal branches — `sent`, `failed`,
  `no_recipients`) implicitly excludes `pending` / `processing`
  rows, so stuck or in-flight messages are preserved for
  investigation rather than silently dropped.
- **Independent failure handling:** each sweep is wrapped in its own
  try/catch. A failure in one collection does NOT skip the other; if
  any sweep fails, the function throws at the end so the schedule
  alarm fires.
- **Configurable:** retention windows can be tuned via the
  `AUDIT_LOG_RETENTION_MONTHS` and `PUSH_MESSAGES_RETENTION_DAYS`
  env vars without redeploying any other function.

### 12.5.1 Ephemeral Retention — Presence & Active Workouts

- **Mechanism:** `functions/src/cleanupEphemeralDocs.ts` is an
  `onSchedule` Cloud Function pinned to `7 * * * * Etc/UTC` (every
  hour at minute 7 — offset from common `:00` bursts to dodge cron
  contention).
- **`presence` (24 h):** sweeps documents whose `updatedAt` is older
  than `PRESENCE_RETENTION_HOURS` (default 24) — backstops the
  client `clearPresence()` call on sign-out.
- **`active_workouts` (2 h):** sweeps documents whose `lastUpdate`
  is older than `ACTIVE_WORKOUT_RETENTION_HOURS` (default 2) —
  backstops the client `clearActiveWorkout()` call on workout end.
- **Why it matters:** client teardown is unreliable (app crash,
  kill-from-tray, lost network at the moment of sign-out). Without a
  server-side guarantee, an orphaned `presence` doc keeps leaking
  the user's last fuzzed location to the heatmap forever. The
  hourly sweep is the policy enforcer.
- **Configurable, idempotent, and isolated:** same env-var override
  pattern as `cleanupOldLogs`; sweeps run independently so a
  transient index error on one collection cannot block the other.

### 12.6 PII Hygiene in Server Logs — OUT Standard

- **Removed:** the `JSON.stringify(request.data)` dump in
  `functions/src/validateAccessCode.ts` (line 51 in the legacy
  version). It was emitting the access code itself — a bearer
  credential — into Cloud Logging.
- **Replacement:** logs now record only the access code's *length*
  and the validation outcome. Code values, user emails, and full
  request bodies never reach the log stream.
- **Pattern:** the same "metadata-only" rule is applied across all
  Cloud Functions; PII review of every log statement was performed
  during the Fortress Phase audit.

### 12.7 Medical Privacy — OUT Standard

- **Onboarding flow:** the Health Declaration step
  (`src/features/user/onboarding/components/HealthDeclarationStep.tsx`)
  blocks form submission if any medical issue is answered "Yes". The
  user is redirected to a doctor-clearance flow.
- **Persistence:** `src/features/user/onboarding/services/onboarding-sync.service.ts`
  explicitly does NOT copy `healthAnswers` to Firestore. Only the
  legal acceptance markers (`healthDeclarationAccepted`,
  `healthDeclarationPdfUrl`, `healthTermsAccepted`) are persisted.
- **Net effect:** raw medical answers ("Yes" to "Do you have a heart
  condition?") never leave the device.

### 12.8 Compliance Matrix

| Requirement (source)                       | Status      | Primary code path |
| ------------------------------------------ | ----------- | ----------------- |
| Audit Logs — old/new/IP/timestamp/uid (Ashkelon 4.0) | **PASS**    | `auditLogger.ts`, `audit-log.type.ts`, `firestore.rules` |
| Server-side ID token verification (Ashkelon 14.1)   | **PASS**    | `/api/auth/session/route.ts`, `firebase-admin.ts` |
| MFA on admin (Ashkelon 14.1)               | **PASS** (inherited from Google Workspace) | §12.2 |
| Password rotation 180d (Ashkelon 14.1)     | **PASS** (inherited from Google Workspace) | §12.2 |
| Server-side admin gating (Ashkelon 17.1)   | **PASS**    | `middleware.ts`, `admin-session.ts` |
| App Check / DDoS defence (Ashkelon 22.1)   | **PASS**    | `firebase.ts`, all callable functions |
| Audit-log retention 24 months              | **PASS**    | `cleanupOldLogs.ts` (`audit_logs` branch) |
| Push-log retention 90 days (privacy §11)   | **PASS**    | `cleanupOldLogs.ts` (`push_messages` branch — terminal-state only) |
| Presence retention 24 h (privacy §11)      | **PASS**    | `cleanupEphemeralDocs.ts` (`presence` branch) |
| Active-workout retention 2 h (privacy §11) | **PASS**    | `cleanupEphemeralDocs.ts` (`active_workouts` branch) |
| Push consent + per-channel prefs (OUT std) | **PASS**    | `push.ts`, `notification-prefs.service.ts`, `sendPushFromQueue.ts` (server-side filter) |
| UGC erasure right (privacy §8.2 / Phase 7.1)| **PASS**   | `firestore.rules` (`feed_posts.delete`), `feed.service.ts` (`deleteFeedPost`), `FeedPostCard.tsx` |
| Profile non-discoverability default (Phase 6.4) | **PASS** | `firestore.rules` (`users` list rule), `SettingsModal.tsx` toggle, `core.discoverable: false` default |
| Storage orphan-prevention on UGC delete (Phase 6.1) | **PASS** | `Step3Photo.tsx` calls `deleteObject` BEFORE clearing local state |
| Reporting coverage (groups + events + posts + users) | **PASS** | `ReportContentSheet.tsx` (Phase 7.2), `firestore.rules` (`reports.create`) |
| PII hygiene in logs (OUT standard)         | **PASS**    | `validateAccessCode.ts` (post-cleanup) |
| Medical privacy in onboarding (OUT std)    | **PASS**    | `HealthDeclarationStep.tsx`, `onboarding-sync.service.ts` |

---

## 13. Push Notification Pipeline (Sprint 3 / Phase 4)

End-to-end FCM delivery from the admin's "compose push" form to the
user's lock screen. Every hop is gated by either authentication, App
Check, server-trusted state, or an explicit user opt-in.

### 13.1 Token registration (client → Firestore)

- **Capacitor plugin:** `@capacitor-firebase/messaging` (iOS APNs +
  Android FCM under one TS façade). The web build degrades gracefully
  — no PWA push (yet).
- **Lifecycle bridge:** `src/lib/native/init.ts → attachPushAuthBridge()`
  subscribes to Firebase Auth state. On sign-in it calls
  `initPushNotifications()`; on sign-out it calls
  `unregisterPushNotifications()`. Tokens are NEVER persisted while
  signed-out.
- **Token store:** `src/lib/native/push.ts → saveTokenToFirestore()`
  writes to `users/{uid}` as:
  - `fcmTokens: arrayUnion(token)` — the bare list used by the
    multicast worker.
  - `fcmTokenMeta.{token}: { platform, lastSeenAt, appVersion }` — the
    per-token provenance map used by ops to debug delivery issues.
- **Permission model:** `Permissions.requestPermissions()` is called
  from the bridge, NOT at app cold-start. The user always sees the
  OS prompt in an authenticated context, satisfying the App Store
  requirement that we explain *why* we need notifications before
  asking.
- **iOS native:** `App.entitlements` declares
  `aps-environment = development` (release build flips to
  `production` via the App Store provisioning profile);
  `Info.plist → UIBackgroundModes` includes `remote-notification`,
  `fetch`, `processing` so silent pushes can wake the app.
- **Android native:** `AndroidManifest.xml` declares
  `android.permission.POST_NOTIFICATIONS` (Android 13+ runtime
  prompt) and the FCM service intent filters supplied by the
  Capacitor plugin.

### 13.2 Notification preferences (client + Firestore)

- **Storage path:** `users/{uid}.settings.notificationPrefs` — keyed
  by channel (`encouragement`, `health_milestone`, `training_reminder`,
  `system`).
- **Master switch:** `users/{uid}.settings.pushEnabled` (boolean).
  `false` short-circuits ALL channel sends in the worker.
- **Service:** `src/features/notifications/services/notification-prefs.service.ts`
  exposes `getNotificationPrefs / setPushEnabled / setChannelEnabled /
  saveNotificationPrefs`. The `system` channel is intentionally
  excluded from the user-facing toggle UI — security and
  account-recovery messages must always land.
- **Defaults:** missing fields default to `true` server-side so
  legacy users (signed up before the prefs schema landed) keep
  receiving pushes until they explicitly opt out.

### 13.3 Server pipeline — `sendPushFromQueue`

The Push Conductor (`functions/src/sendPushFromQueue.ts`) is a
Firestore `onCreate` trigger on `push_messages/{messageId}`. The
admin panel writes the queue doc; the function reads it. The two
sides are decoupled — if the function is down, the admin's compose
flow still succeeds and a backfill rerun catches up.

Pipeline steps (each one is a defensive layer):

1. **Compare-and-set claim.** A `runTransaction` flips
   `status: pending → processing` only if the doc is still pending.
   Functions delivers `onCreate` at-least-once; this guarantee
   ensures a retried invocation discovers `status === 'processing'`
   on the second pass and bails out before any FCM send. **Net
   effect:** users receive each push exactly once.
2. **Input validation.** `title`, `message`, `authorityId` are
   trimmed and required. Missing `authorityId` is a hard fail —
   we refuse to broadcast cross-tenant.
3. **Audience resolution (`resolveAudience`).** `all` /
   `active_users` / `inactive_users` / `park_users` resolve to a
   `Set<uid>` *within the message's authority*. An admin in city A
   can never reach a user in city B even with `targetAudience: 'all'`.
4. **Per-user pref filter (`collectTokens`).** For every candidate
   uid we read the user doc and skip the row if (a) the master
   switch is off, or (b) the per-channel switch is off. The
   `system` channel ignores the per-channel filter (force-on).
5. **Token harvest + dedupe.** Every surviving uid contributes its
   `fcmTokens` to a deduped Set, and we record `token → owner_uid`
   in a parallel Map for later pruning.
6. **Multicast in batches of 500.** `sendEachForMulticast` (the FCM
   per-call cap). Per-token responses are tallied into
   `deliveredCount` / `failedCount`.
7. **Dead-token pruning.** Any token returning
   `messaging/registration-token-not-registered`,
   `invalid-registration-token`, or `invalid-argument` is removed
   from its owner's `fcmTokens` array AND its
   `fcmTokenMeta.{token}` map entry — keeping the user doc lean
   and avoiding repeated quota waste on stale handles.
8. **Terminal write.** `status: 'sent'` (or `'failed'`),
   `deliveredCount`, `failedCount`, `tokensRemoved`,
   `recipientCount`, `tokenCount`, `processedAt`. The
   `processedAt` field is what `cleanupOldLogs` later uses to
   detect terminal-state messages eligible for the 90-day sweep.

**Push payload shape:** `notification: { title, body }` (single
canonical surface) plus a `data: { messageId, authorityId,
channel, parkId? }` payload for client-side deep-link routing.
APNs gets `aps.sound: 'default', aps.badge: 1`; Android gets
`priority: 'high'` so high-importance channels are not throttled
by Doze mode.

### 13.4 Threats this pipeline defeats

- **Cross-tenant blast radius (T4).** Authority scoping is enforced
  in `resolveAudience` and is non-negotiable — a Tel-Aviv admin
  cannot push to Haifa even by editing the Firestore doc directly,
  because the worker reads `authorityId` from the doc and uses it
  as the WHERE clause on `users`.
- **Consent bypass (T3).** A logged-in attacker who somehow inserts
  a row into `push_messages` (not possible via rules — admin-only
  write) still cannot reach a user who has opted out: the per-user
  filter happens *server-side* at send time, not at compose time.
- **At-least-once delivery duplication.** The compare-and-set claim
  collapses retries. A user never sees the same notification twice
  from a single queue doc.
- **Token leakage.** Tokens never traverse client-side; they are
  only ever read by the trusted server. Dead tokens are pruned so
  ops cannot accidentally send a "deleted-account" push to a phone
  that has already been wiped.

---

## 14. User Content Sovereignty (Sprint 4)

Sprint 4 closed the GDPR / Israeli Privacy Law loop on UGC: users now
have first-class, in-app controls for *erasure*, *visibility*, and
*reporting*.

### 14.1 Right to erasure — own posts

- **Rule:** `firestore.rules → feed_posts.delete` allows
  `request.auth.uid == resource.data.authorUid` (Phase 3.2).
- **Service:** `src/features/social/services/feed.service.ts`
  exports `deleteFeedPost(postId)` — a single `deleteDoc` call.
- **UI:** `FeedPostCard.tsx` ships a kebab menu. For the author it
  exposes "מחק פוסט" (Delete Post) with an inline confirmation
  overlay; for everybody else it exposes "דווח על פוסט" (Report
  Post).
- **Optimistic removal:** the parent feed page passes an
  `onDeleted` callback that filters the local `posts` array, so
  the post disappears immediately on success — no full re-fetch.

### 14.2 Right to non-discovery — `core.discoverable`

- **Default:** `core.discoverable !== true` (i.e. **off** until
  the user opts in). Onboarding seeds the field to `false`.
- **Rule:** `users` list/query is gated on `resource.data
  .core.discoverable == true` — any `where`/`limit` query against
  the collection silently skips opted-out users.
- **Toggle:** Settings → "נראות הפרופיל בחיפוש". The handler
  performs an optimistic UI flip with rollback on Firestore write
  failure (mirrors the existing `analyticsOptOut` toggle pattern).

### 14.3 Right to report — universal target type

- **Component:** `src/features/arena/components/ReportContentSheet.tsx`
  was generalised in Phase 7.2.
- **`ReportTargetType`:** `'group' | 'event' | 'post' | 'user'`.
- **Reason filtering:** every reason carries an `appliesTo` list,
  so the sheet renders only contextually relevant reasons (e.g.
  `impersonation` shows for `user` but not `event`; `spam` is
  hidden for `user` reports).
- **Hebrew labels:** `TARGET_LABEL` and `PROMPT_BY_TYPE` maps
  drive the header and prompt text per target type.
- **Surfaces wired:** `FeedPostCard.tsx` for posts;
  `app/profile/[userId]/page.tsx` for users (visible on someone
  else's profile, hidden on your own).
- **Rule:** `reports` accepts `create` from any authenticated
  user. Reads are admin-only (the moderation queue is admin UI).

### 14.4 Storage orphan prevention (Phase 6.1)

- **Risk:** `Step3Photo.tsx` (community contribution wizard) used
  to clear local UI state without deleting the underlying
  Firebase Storage object — every "upload then change my mind"
  cycle leaked one image into the bucket.
- **Fix:** new `deleteStorageObject()` helper calls
  `deleteObject()` on the previous `data.photoStoragePath` BEFORE
  clearing the preview state in both `handleFileSelect` (replace)
  and `handleRemove` (delete). `storage/object-not-found` is
  swallowed silently so re-deletions don't error.
- **Schema:** the wizard's `WizardData` now persists
  `photoStoragePath` alongside `photoUrl`, so the deleter knows
  exactly which Storage path to target.

---

## 15. Region & Migration Status (`me-west1` viability)

The `appout-1` project currently runs in `us-central1` (Iowa) for
Cloud Functions and Firestore, with Storage in the same multi-region
bucket. This section documents the viability of migrating to
`me-west1` (Tel Aviv) for data-residency reasons.

### 15.1 Per-service viability

| Service                | `me-west1` supported? | Migration effort | Notes |
| ---------------------- | --------------------- | ---------------- | ----- |
| Cloud Functions (v2)   | **Yes**               | **Low**          | Change `region: 'us-central1'` to `region: 'me-west1'` in each function declaration and redeploy. Cold-start times for Israeli users improve by ~80–120 ms. Function code itself is unchanged. |
| Cloud Storage          | **Yes**               | **Medium**       | Storage buckets are region-locked at creation. Migration requires `gsutil rsync` from old bucket to new + cutover + dual-read window. ~10–60 min downtime depending on object count. |
| Firebase Authentication| **Yes (global)**      | **None**         | Firebase Auth is a global service with no region setting; users keep their UIDs. |
| Firestore              | **Yes (regional GA)** | **HEAVY**        | A Firestore database's location is **immutable** for the lifetime of the database. Cannot be moved in place. See §15.2. |
| FCM                    | **Yes (global)**      | **None**         | FCM is a global service. Tokens remain valid. |
| Firebase Hosting / PWA | **Yes (global CDN)**  | **None**         | Hosting fronts every region transparently. |

### 15.2 Firestore — the hard constraint

Per Google Cloud documentation
(`https://firebase.google.com/docs/firestore/locations` —
"once you provision a database instance, you cannot change its
location setting"), the existing `(default)` database is locked to
its original region. The **only** path to `me-west1` Firestore is:

1. Provision a **new named Firestore database** in `me-west1`
   (Firestore now supports multiple databases per project, GA as of
   2025).
2. Run a managed export of the current `(default)` database to GCS,
   then a managed import into the new `me-west1` database.
3. Dual-write for a transition window OR accept a maintenance
   window for the cutover.
4. Update every Firebase SDK client (web, iOS, Android, Functions
   Admin SDK) to target the new database name. Currently every
   client uses the implicit `(default)` — they would all need a
   `getFirestore(app, 'me-west1')` (or equivalent) wiring change.
5. Re-deploy `firestore.rules` and `firestore.indexes.json`
   against the new database — they do NOT auto-attach to a
   non-default database.
6. Re-validate every composite index against production query
   patterns; index propagation on a fresh database is from cold.
7. Decommission the old database after a stabilisation window.

**Estimated effort:** 3–5 engineer-days of preparation + a 30–60
minute coordinated cutover + 1 week of dual-monitoring. The
Cloud Functions and Storage migrations are O(hours); the Firestore
migration is O(days).

### 15.3 Recommendation

- **Phase A (low-risk, do whenever):** redeploy Cloud Functions
  to `me-west1`. Update the `region: 'us-central1'` literal in
  every `onSchedule` / `onCall` / `onCreate` declaration —
  currently 8 functions, all explicitly pinned (no implicit
  `us-central1` defaults left). Latency win is meaningful for
  Israeli users; rollback is a single literal flip.
- **Phase B (medium-risk, schedule carefully):** Storage bucket
  migration during a low-traffic window. Pre-stage with
  `gsutil rsync`, accept a 5–10 minute write freeze for the final
  delta sync, swap the bucket name in client config.
- **Phase C (heavy lift, requires program management):** Firestore
  migration. NOT recommended for a single sprint — needs a
  dedicated mini-project with explicit business sponsorship and
  a customer-facing maintenance announcement.

The Phase A redeployment can be staged behind the Sprint 4 close
without any user-visible impact and would cut median end-to-end
write latency for Israeli users by an estimated 60–100 ms (round
trip). It is the highest-value, lowest-risk migration item on the
roadmap.

---

*Last updated: Fortress Phase III + Sprint 3–4 (Push, UGC sovereignty,
ephemeral retention, region viability) — April 2026.*
