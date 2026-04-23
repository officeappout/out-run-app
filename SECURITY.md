# OUT-RUN — Security Architecture

> **Status:** Fortress Phase complete (Apr 2026).
> **Audience:** internal engineering, third-party auditors, government compliance reviewers.
> **Scope:** the production web PWA (`appout-1.firebaseapp.com`) plus the
> `out-run-functions` Cloud Functions package.

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
| `onGroupMemberWrite`, `deleteZombieGroups` | Firestore trigger / Scheduled        | n/a (server context)                                        | Membership counter maintenance.                                                                                        |
| `onUnitWrite`                             | Firestore trigger                    | n/a                                                         | Tenant hierarchy invariants.                                                                                           |
| `onFeedPostCreate`, `rollupLeaderboard`   | Firestore trigger / Scheduled        | n/a                                                         | Leaderboard fan-out & periodic snapshot.                                                                              |

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
- [x] **Data retention:** `cleanupOldLogs` scheduled function deletes `audit_logs` older than 24 months on the 1st of each month.
- [x] **PII hygiene:** server logs strip credentials (access codes, request bodies); only metadata + lengths are emitted.
- [x] **Secrets:** AI key purged, migration secret removed.
- [x] **Time correctness:** midnight refresh hooked into all calendar/streak UIs.
- [ ] **Cloud Function rate limits** beyond the Guardian's per-call cap: rely on Firebase's per-uid quotas + App Check today; consider explicit Cloud Armor rules in front.
- [ ] **Custom Claim migration:** flip `admin` and `tenantId` to claims-only and remove the Firestore-doc admin paths (Path C).
- [ ] **Password complexity + rotation enforcement** at the Firebase Auth tier (current default is 6-char minimum). MFA is inherited from Google (Workspace MFA) — see §12.

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
   `[cleanupOldLogs] Sweep complete — deleted N document(s)`.

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

### 12.5 Data Retention — 24-Month Policy

- **Mechanism:** `functions/src/cleanupOldLogs.ts` is an `onSchedule`
  Cloud Function pinned to `0 3 1 * * Etc/UTC` (03:00 UTC on the 1st
  of every month).
- **Behaviour:** queries `audit_logs` where `timestamp` is older than
  `now - AUDIT_LOG_RETENTION_MONTHS` (default 24) and deletes them in
  paged batches of 400 to stay under Firestore's 500-write batch cap.
- **Configurable:** the retention window can be tuned via the
  `AUDIT_LOG_RETENTION_MONTHS` env var without redeploying any other
  function.

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
| Audit-log retention 24 months              | **PASS**    | `cleanupOldLogs.ts` |
| PII hygiene in logs (OUT standard)         | **PASS**    | `validateAccessCode.ts` (post-cleanup) |
| Medical privacy in onboarding (OUT std)    | **PASS**    | `HealthDeclarationStep.tsx`, `onboarding-sync.service.ts` |

---

*Last updated: Fortress Phase III — Compliance Lockdown, April 2026.*
