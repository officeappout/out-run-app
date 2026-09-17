# Server-Side Security Audit — Cloud Functions & Next.js API
**Scope:** `functions/src/**`, `src/app/api/**`, secrets handling, git history, App Check
**Date:** 2026-09-07 · **Repo:** appout-1 · **Context:** pre-launch (~4,000 real users) + partner SDK integration
**Method:** static read of source on disk. Nothing was executed against production. Runtime/console
configuration (Vercel env values, Firebase App Check enforcement toggles, IAM roles) could not be
observed and is marked **NEEDS VERIFICATION** wherever it changes a verdict.

---

## 0. Executive summary

The good news first, because it is real and it is unusual:

- **There are zero `onRequest` (raw HTTP) Cloud Functions.** Every callable is `onCall`, and every
  one of them checks `request.auth` as its first statement. The `?secret=dudu2026` public HTTP
  migration endpoint that the code comments describe has genuinely been removed
  (`functions/src/runDataMigration.ts:7-13`).
- **Every `/api/admin/*` route is guarded.** All 30 of them call `requireAdminApi`,
  `requireSection`, `requireSuperAdminApi` or `requireRouteEditAccess` on the first line of the
  handler. No admin route is reachable with plain curl.
- **Firestore rules genuinely block admin self-promotion** (`firestore.rules:73-90`,
  `firestore.rules:285-302`). A user cannot write `core.isSuperAdmin` on their own document, so the
  "read the user doc to decide admin" pattern used by `runDataMigration`, `logAuditAction` and
  `resolveIdentity` is not directly escalatable.
- **No real credential is in git history.** (Details in §5.)

The bad news is concentrated in three places: **three unauthenticated Next.js API routes that use the
Admin SDK**, **a leaderboard trigger that trusts client-written document fields**, and **an App Check
debug path with no production guard**.

One fact multiplies the severity of everything below: **anonymous authentication is enabled and used**
(`src/app/gateway/page.tsx`, `src/lib/auth.service.ts` — `signInAnonymously`). "Authenticated" is
therefore a free, unlimited, unattributable credential. Anyone with the public Firebase web API key
can mint as many valid uids and ID tokens as they want, from a script, in seconds. Read every
`isAuthenticated()` rule and every "requires a Bearer token" route below as **"requires nothing but a
30-second script."**

### Findings by severity

| # | Sev | Finding | Location |
|---|-----|---------|----------|
| F1 | **CRITICAL** | `/api/calendar/[userId]` — unauthenticated Admin-SDK read of any user's 90-day training schedule (IDOR + free 90-read cost amplifier) | `src/app/api/calendar/[userId]/route.ts:150` |
| F2 | **CRITICAL** | `/api/challenge/leaderboard` — unauthenticated Admin-SDK dump of name/gender/ageGroup/uid for any group, incl. minors and locked military groups | `src/app/api/challenge/leaderboard/route.ts:39` |
| F3 | **HIGH** | `onFeedPostCreate` trusts client-written `tenantId`/`unitId`/`userId`/`xpAwarded` → arbitrary leaderboard forgery in any unit, as any uid | `functions/src/leaderboard.ts:46-78` |
| F4 | **HIGH** | App Check debug-token path has no production guard — a debug token set in prod ships in the JS bundle and defeats `enforceAppCheck` on every callable | `src/lib/firebase.ts:115-120`, `:274` |
| F5 | **HIGH** | `resolveIdentity` falls back to **unverified JWT decode** and grants admin by email claim whenever `NODE_ENV !== 'production'` | `src/lib/firebase-admin.ts:168-187` |
| F6 | **HIGH** | Admin privilege tiers collapse: `isTenantOwner` / `isVerticalAdmin` pass `requireAdminApi`, unlocking finance, CDN upload, seeding and arbitrary push | `src/lib/firebase-admin.ts:207-214` + all `/api/admin/*` |
| F7 | **HIGH** | Middleware admin gate only fires on `admin.outrun.co.il`; `/admin/*` is ungated on the Vercel/apex domain | `src/middleware.ts:211-214` |
| F8 | **MEDIUM** | `runDataMigration` — destructive tenant delete/rename callable still deployed months past its stated removal date | `functions/src/index.ts:4`, `runDataMigration.ts:29` |
| F9 | **MEDIUM** | No rate limiting on `validateAccessCode` → unlimited access-code brute force from anonymous accounts | `functions/src/validateAccessCode.ts:31` |
| F10 | **MEDIUM** | `awardWorkoutXP` caps per call (2,000 XP) but not per day → ~50 calls reaches max level | `functions/src/services/progression.service.ts:44` |
| F11 | **MEDIUM** | Attacker-controlled `fromName` from a `kudos` doc is injected verbatim into a push notification to any uid | `functions/src/onKudosCreated.ts:107,138` + `firestore.rules:1430` |
| F12 | **MEDIUM** | `onGroupMemberWrite` re-reads the entire members collection on every membership write — O(N) reads per join | `functions/src/onGroupMemberWrite.ts:33-36` |
| F13 | **MEDIUM** | `logAuditAction` sets `enforceAppCheck: false` and accepts a caller-supplied `adminName` → audit-trail spoofing | `functions/src/auditLogger.ts:159,190` |
| F14 | **MEDIUM** | `onLevelUp` triggers on every write to `users/{uid}` — invocation storm at 4k users | `functions/src/onLevelUp.ts:52` |
| F15 | **MEDIUM** | `/api/challenge/submit` — no group-membership check, and unbounded `attempts` arrayUnion growth | `src/app/api/challenge/submit/route.ts:23` |
| F16 | **MEDIUM** | CORS allowlist includes `http://localhost` with `Allow-Credentials: true` | `src/middleware.ts:23,30` |
| F17 | **LOW** | `deleteZombieGroups` / `unitLeagueRollup` — unbounded scans and >500-doc batch commits | `onGroupMemberWrite.ts:66-87`, `unitLeagueRollup.ts:67-128` |
| F18 | **LOW** | `NEXT_PUBLIC_ROOT_ADMIN_EMAILS` ships the admin allowlist to every client | `.env.example`, `.env.local` |
| F19 | **LOW** | `CRON_SECRET` compared with `!==` (non-constant-time) | `src/app/api/admin/crm-agent/run/route.ts:730` |
| F20 | **LOW** | `join/preview` IP rate limiter is in-process — ineffective across serverless instances | `src/app/api/join/preview/route.ts:71-75` |
| F21 | **INFO** | `firebase-key.json` was committed once, but the blob is a 54-byte stub with no key material | commit `e7ff1ec9` |

---

## 1. Cloud Functions inventory (`functions/src/`)

Entry point: `functions/src/index.ts`. Runtime `nodejs20` (`firebase.json:8`). 31 exported functions.

### 1a. Callable (`onCall`) — 7 functions

| Function | File:line | `request.auth` first? | Ownership / IDOR | App Check |
|---|---|---|---|---|
| `validateAccessCode` | `validateAccessCode.ts:31` | ✔ (`:43`, before any read) | ✔ writes only `users/{request.auth.uid}` | ✔ `enforceAppCheck: true` |
| `awardWorkoutXP` | `awardWorkoutXP.ts:56` | ✔ (`:69`) | ✔ uid from token only | ✔ |
| `reverseWorkoutXP` | `reverseWorkoutXP.ts:64` | ✔ (`:78`) | ✔ explicit `workout.userId !== uid` → `permission-denied` (`:120`) | ✔ |
| `ingestHealthSamples` | `ingestHealthSamples.ts:131` | ✔ (`:141`) | ✔ uid from token only | ✔ |
| `requestAccountDeletion` | `onUserDelete.ts:276` | ✔ (`:284`) | ✔ self-only | ✔ |
| `runDataMigration` | `runDataMigration.ts:121` | ✔ via `requireAdmin` (`:131`, first statement) | n/a — global | ✔ |
| `logAuditAction` | `auditLogger.ts:153` | ✔ via `requireAdmin` (`:163`) | ✔ | ✘ **`enforceAppCheck: false`** (`:159`) |

**Verdict:** the callable surface is in good shape. Auth is checked before any data access in all
seven. `reverseWorkoutXP` is the standout — it does the ownership check transactionally and clamps
`xpEarned` to `MAX_XP_PER_CALL` so a self-authored inflated workout doc can't be weaponised
(`reverseWorkoutXP.ts:112-140`). All seven set `cors: true`, which is correct for `onCall` (the SDK
adds its own auth layer; CORS is not the control here).

### 1b. Firestore triggers — 12 functions

| Function | Trigger path | Loop risk | Fan-out |
|---|---|---|---|
| `onGroupMemberWrite` | `community_groups/{groupId}/members/{uid}` (written) | Writes the **parent** doc, not the trigger doc → no loop | ⚠ **F12** — full `members` collection `.get()` per write |
| `onFeedPostCreate` | `feed_posts/{docId}` (created) | ✔ writes a different collection | ⚠ **F3** — trusts client fields |
| `onWorkoutCreate` | `workouts/{docId}` (created) | ✔ | ✔ resolves tenant from the *protected* `users.core`, not the payload |
| `onUnitWrite` | `tenants/{tenantId}/units/{unitId}` (written) | ✔ writes parent + `unitDirectory` | ⚠ full `units` collection `.get()` per write (small N) |
| `onAuthorityWrite` | `authorities/{authorityId}` (written) | **Self-writing**, but guarded — compares `armType`/`statusCategory` before update (`:132-137`) → converges after one extra invocation | ✔ |
| `onMilitaryDeclarationWritten` | `military_declarations/{uid}` (written) | not fully read — **NEEDS VERIFICATION** | — |
| `onLevelUp` | `users/{uid}` (updated) | ✔ fast-exits on `newLevel <= prevLevel` (`:67-74`) | ⚠ **F14** — fires on *every* user-doc write |
| `onKudosCreated` | `kudos/{recipientUid}/inbox/{kudoId}` (created) | ✔ | ⚠ **F11** — push content injection |
| `onGroupMemberJoin` | `community_groups/{groupId}/members/{uid}` (created) | ✔ | ✔ |
| `chatMessageNotification` | `chats/{chatId}/messages/{messageId}` (created) | ✔ | legacy path has **no rate cap** and `skipQuietHours: true` (`:139-141`) |
| `sendPushFromQueue` | `push_messages/{messageId}` (created) | ✔ compare-and-set claim on `status` (`:96-108`) — properly idempotent | Mass broadcast, but `push_messages` is **admin-write-only** (`firestore.rules:1582-1584`) ✔ |
| `onPlannedActivityCreated` | `planned_sessions/{sessionId}` (created) | flag-gated, not deployed (`index.ts:33-37`) | `rateCapHours: 2` ✔ |
| `onUserDelete` | v1 **auth** trigger `.onDelete()` | ✔ idempotent re-run of `purgeUserData` | ✔ |

### 1c. Scheduled — 11 functions

| Function | Cron | Scan bounded? |
|---|---|---|
| `deleteZombieGroups` | `0 3 * * *` | ✘ unbounded query + single `batch.commit()` → **fails hard above 500 docs** (`onGroupMemberWrite.ts:82-84`) |
| `rollupLeaderboard` | `0 3 * * *` | ✘ full `leaderboard_shards` `.get()` (`leaderboard.ts:172-174`); batches chunked ✔ |
| `unitLeagueRollup` | `0 * * * *` (hourly) | ✘ three full-collection `.get()`s per hour (`:67`, `:80`, `:122`) |
| `retentionScheduler` | `0 10 * * *` | ✔ `.limit(BATCH_LIMIT)` |
| `trainingReminderScheduler` | `30 7 * * *` | ✔ `.limit()` |
| `stepGoalNudgeScheduler` | `0 18 * * *` | ✔ `.limit()` |
| `onboardingDropoffDispatcher` | `17,47 * * * *` | ✔ `.limit()` |
| `pushOutcomeSweeper` | `*/30 * * * *` | ✔ `.limit(SWEEP_BATCH_LIMIT)` |
| `cleanupOldLogs` | `0 3 1 * *` | ✔ `.limit(BATCH_SIZE)` |
| `cleanupEphemeralDocs` | `7 * * * *` | ✔ `.limit(BATCH_SIZE)` |
| `purgeExpiredLegalHolds` | `0 3 2 * *` | ✔ `.limit(50)` + `recursiveDelete` |

Most schedulers page correctly. The three marked ✘ are cost, not security — see F17.

---

## 2. Next.js API route inventory (`src/app/api/**`)

**Auth ✔ = cannot be called by an anonymous stranger with curl.**
**Auth ✘ = fully reachable with `curl`, no token of any kind.**

### 2a. Admin routes — 30 routes, all guarded

| Route | Methods | Guard | Auth |
|---|---|---|---|
| `/api/admin/authorities` | GET | `requireAdminApi` | ✔ |
| `/api/admin/authorities/[id]` | GET, PATCH | `requireAdminApi` | ✔ |
| `/api/admin/bunny/status/[videoId]` | GET | `requireAdminApi` | ✔ |
| `/api/admin/bunny/upload` | POST | `requireAdminApi` | ✔ |
| `/api/admin/city-mapping/amenities-ingest` | POST | `requireSuperAdminApi` | ✔ |
| `/api/admin/city-mapping/amenities-tag` | POST | `requireSuperAdminApi` | ✔ |
| `/api/admin/city-mapping/boundary-geometry` | POST | `requireSuperAdminApi` | ✔ |
| `/api/admin/city-mapping/lighting` | POST | `requireSuperAdminApi` | ✔ |
| `/api/admin/city-mapping/register-city` | POST | `requireSuperAdminApi` | ✔ |
| `/api/admin/city-mapping/resolve-boundary` | POST | `requireSuperAdminApi` | ✔ |
| `/api/admin/crm-agent/run` | POST | `requireSection('municipal')` | ✔ |
| `/api/admin/crm-agent/run` | GET (Vercel cron) | `Bearer CRON_SECRET` | ✔ (see F19) |
| `/api/admin/drive/authority-folder` | GET | `requireAdminApi` | ✔ |
| `/api/admin/drive/backfill-attachments` | POST | `requireAdminApi` | ✔ |
| `/api/admin/equipment-icons` | GET | `requireAdminApi` | ✔ |
| `/api/admin/equipment/fix-iconkey` | POST | `requireAdminApi` | ✔ |
| `/api/admin/equipment/seed-optional` | POST | `requireAdminApi` | ✔ |
| `/api/admin/exercises/export` | GET | `requireAdminApi` | ✔ |
| `/api/admin/exercises/sanitize-legacy` | POST | `requireAdminApi` | ✔ |
| `/api/admin/finance/packet` | POST | `requireAdminApi` | ✔ |
| `/api/admin/finance/scan-invoices` | POST, GET | `requireAdminApi` | ✔ |
| `/api/admin/finance/seed-vendors` | POST | `requireAdminApi` | ✔ |
| `/api/admin/finance/transactions` | GET, POST | `requireAdminApi` | ✔ |
| `/api/admin/finance/transactions/[id]` | PATCH, DELETE | `requireAdminApi` | ✔ |
| `/api/admin/insights` | GET | `requireAdminApi` | ✔ |
| `/api/admin/master-evolution-sync` | POST | `requireSection('system')` | ✔ |
| `/api/admin/notifications/test` | POST | `requireAdminApi` | ✔ (but see F6) |
| `/api/admin/photo-release/[submissionId]` | GET | local `isAuthorizedAdmin` copy | ✔ |
| `/api/admin/re-seed-authorities` | POST | `requireSection('system')` | ✔ |
| `/api/admin/routes/accuracy-queue` | GET | `requireSuperAdminApi` | ✔ |
| `/api/admin/routes/dem-recompute` | POST | `requireRouteEditAccess` | ✔ |
| `/api/admin/seed-sderot` | POST | `requireAdminApi` | ✔ |
| `/api/admin/transcripts/process` | POST | `requireAdminApi` | ✔ |
| `/api/admin/transcripts/scan` | POST | `requireAdminApi` | ✔ |
| `/api/integrations/universal-gis-proxy` | GET | `requireAdminApi` | ✔ |
| `/api/social/reconcile-group-membership` | POST | `requireAdminApi` | ✔ |

### 2b. User routes — Bearer ID token required

| Route | Methods | Auth model | IDOR-safe? |
|---|---|---|---|
| `/api/auth/session` | POST/GET/DELETE | mints admin cookie from verified ID token | ✔ cookie is `HttpOnly; SameSite=Lax; Secure` in prod (`route.ts:29-40`) |
| `/api/user/complete-profile` | POST | `verifyIdToken(idToken, true)` | ✔ uid from token; strict field whitelist `{name,gender,birthDay/Month/Year}`; age floor 14 enforced server-side (`:78-81`) |
| `/api/user/update-authority` | POST | `verifyIdToken(idToken, true)` | ✔ **exemplary** — re-verifies `neighborhoodId.parentAuthorityId === authorityId` server-side (`:82-89`) |
| `/api/social/group-membership` | POST | `verifyIdToken(idToken, true)` | ✔ uid from token; ⚠ no public/private check on `groupId` — **NEEDS VERIFICATION** inside `joinEngine` |
| `/api/social/sync-user-memberships` | POST | `verifyIdToken(idToken, true)` | ✔ self-only |
| `/api/challenge/join` | POST | `verifyIdToken` | ✔ |
| `/api/challenge/submit` | POST | `verifyIdToken(idToken, true)` | ✔ uid from token; ⚠ **F15** |
| `/api/join/confirm` | POST | `verifyIdToken(idToken, true)` | ✔ |
| `/api/join/session-token` | POST | `verifyIdToken(idToken, true)` | ✔ token validated by `joinEngine`; expiry/max-uses enforced |
| `/api/invite/run-session` | POST | `verifyIdToken(idToken, true)` | ✔ **exemplary** — re-invite path verifies `community_groups/{gid}/members/{uid}` exists → 403 `not-a-member` (`:128-133`) |

### 2c. Unauthenticated routes — callable by anyone with curl

| Route | Methods | Auth | Verdict |
|---|---|---|---|
| `/api/calendar/[userId]` | GET | ✘ **none** | **F1 — CRITICAL** |
| `/api/challenge/leaderboard` | GET | ✘ **none** | **F2 — CRITICAL** |
| `/api/challenge/exercise` | GET | ✘ none | Acceptable — returns only exercise `name` + `videoUrl` from a public catalogue. Note: unbounded doc-read amplifier, add caching. |
| `/api/join/preview` | GET | ✘ none *by design* | **Acceptable and well built** — IP rate limit, `^[A-Za-z0-9_-]{4,16}$` format check, explicit `SAFE_FIELDS` whitelist, images capped at 1, generic 404. Use this as the template for fixing F1/F2. |
| `/api/links/[id]/click` | GET, POST | ✘ none *by design* | Public click tracker; IP is salted (`LINK_CLICK_IP_SALT`). Acceptable. |

---

## 3. Detailed findings

### F1 — CRITICAL · Unauthenticated access to any user's training calendar
**`src/app/api/calendar/[userId]/route.ts:150-201`**

```ts
export async function GET(_req: NextRequest, { params }: { params: { userId: string } }) {
  const { userId } = params;
  if (!userId || typeof userId !== 'string' || userId.length < 6) { ... }
  const db = getAdminDb();                              // ← Admin SDK: bypasses ALL security rules
  const refs = dates.map((d) => db.collection('userSchedule').doc(`${userId}_${d}`));
```

There is no `Authorization` header read, no cookie check, no token, no rate limit. `userId` comes
straight from the URL path into an Admin-SDK read.

**Attack (stranger, curl only):**
1. Sign in anonymously against the public web API key (or simply read any authenticated view) and
   harvest uids — uids are freely exposed in `feed_posts.authorUid`, in `community_groups/*/members`
   doc ids, and in `/api/challenge/leaderboard` responses (F2), which returns `uid` explicitly.
2. `curl https://<host>/api/calendar/<uid>` → a `.ics` file containing that user's next 90 days of
   scheduled training: what they do, on which days, at which times.

For a product whose user base includes military reservists bucketed by unit, a per-person 90-day
schedule of when-and-where is a pattern-of-life leak, not a privacy nit.

**Secondary — free cost amplifier:** each request issues **90 Firestore document reads** with no
auth and no rate limit. A single laptop looping this endpoint bills the project at ~90 reads per
HTTP request indefinitely.

**Fix:** require `Authorization: Bearer <ID token>`, verify it, and enforce
`decoded.uid === params.userId`. If subscribe-by-URL for external calendar apps must keep working
(calendar clients cannot send bearer tokens), replace the uid in the path with a per-user
unguessable, revocable feed token stored on the user doc — `/api/calendar/feed/<random-32-bytes>` —
and never accept a raw uid. Add IP rate limiting and collapse the 90 individual `get()`s into one
range query.

---

### F2 — CRITICAL · Unauthenticated PII dump of challenge participants
**`src/app/api/challenge/leaderboard/route.ts:39-100`**

```ts
export async function GET(request: NextRequest) {
  const groupId = searchParams.get('groupId');
  const db = getAdminDb();                              // ← Admin SDK
  const collRef = db.collection(`community_groups/${groupId}/challenge_submissions`);
  ...
  rows = sorted.map((doc, idx) => ({ rank, uid: doc.id, name: d.name, ageGroup: d.ageGroup,
                                     gender: d.gender, bestValue: ..., displayTime: ... }));
```

No auth. `groupId` is attacker-supplied and goes directly into an Admin-SDK path.

**Attack:** `curl 'https://<host>/api/challenge/leaderboard?groupId=<gid>&limit=50'` returns, for
every participant: **uid, real name, age group, and gender.** Group ids are obtainable from
`/api/join/preview` responses (`preview.id`), from any authenticated client, and from invite links.

Three compounding factors:
1. `firestore.rules:1244-1250` deliberately locks `community_groups` reads for military groups to
   members only, precisely to prevent "real names mapped to a military-adjacent affiliation." This
   endpoint reads the same population through the Admin SDK and hands it to anonymous callers,
   defeating that control.
2. Tenant types include `educational` and `youth_movement` — this is a name/age/gender roster of
   minors, served to the open internet.
3. It is also the uid oracle that makes F1 trivially exploitable at scale.

**Secondary — cost:** the `gender` branch (`:56`) runs `.where('gender','==',x).get()` with **no
`.limit()`**, reading the entire submissions subcollection on every unauthenticated request.

**Fix:** require a verified ID token; require that the caller is a member of `groupId`
(`community_groups/{groupId}/members/{uid}` exists) — the exact check `/api/invite/run-session:128`
already implements. Drop `uid` from the response entirely, and truncate `name` to a display form.
Add `.limit()` to the gender branch.

---

### F3 — HIGH · Leaderboard forgery via client-written feed post fields
**`functions/src/leaderboard.ts:46-78`** with **`firestore.rules:1211`**

The trigger trusts the created document wholesale:

```ts
const uid: string      = data.userId ?? data.uid ?? '';
const tenantId: string = data.tenantId ?? '_global';
const unitId: string   = data.unitId ?? '_all';
const xp: number       = typeof data.xpAwarded === 'number' ? data.xpAwarded : 1;
...
const shardDocId = `${tenantId}_${unitId}_${period}_${uid}_${shard}`;
await shardRef.set({ ..., xp: FieldValue.increment(xp), ... }, { merge: true });
```

The only rule on creation is:

```
allow create: if isAuthenticated() && request.auth.uid == request.resource.data.authorUid;
```

`authorUid` is checked. `userId`, `tenantId`, `unitId` and `xpAwarded` are **not**.

**Attack:** sign in anonymously, then create one `feed_posts` document with
`authorUid: <my own uid>` (satisfies the rule) but `userId: <victim uid>`,
`tenantId: <any tenant>`, `unitId: <any unit>`, `xpAwarded: 999999`. The trigger writes a
`leaderboard_shards` doc crediting arbitrary XP to an arbitrary uid in an arbitrary unit's league.
Repeat to place yourself first in every unit, or to inflate/disrupt any rival.

This is the same vulnerability class the rules file believes it closed. `firestore.rules:95-104`
documents the fix for `core.tenantId`/`core.unitId` self-assignment and notes "`leaderboard.ts`
trusts core.tenantId/unitId with zero verification." That fix hardened the **user doc** path.
`onFeedPostCreate` never reads the user doc — it reads the post — so the hole is still open through a
different door. `onWorkoutCreate` (`leaderboard.ts:100-124`) does it correctly: it resolves
`tenantId`/`unitId` from the protected `users/{uid}.core`. Make `onFeedPostCreate` do the same.

**Fix:** in `onFeedPostCreate`, ignore `data.userId`/`tenantId`/`unitId` entirely; use
`data.authorUid` and look up `users/{authorUid}.core` for the bucket (mirroring `onWorkoutCreate`).
Ignore `data.xpAwarded` and use a server-side constant, or clamp it. Additionally lock the fields in
`firestore.rules` so a client cannot write `xpAwarded`/`tenantId`/`unitId` on a feed post at all.

---

### F4 — HIGH · App Check debug path is not production-guarded
**`src/lib/firebase.ts:93, 115-120`** and **`src/lib/firebase.ts:274`**

```ts
const debugToken = process.env.NEXT_PUBLIC_APP_CHECK_DEBUG_TOKEN;
...
if (debugToken) {
  (self as unknown as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
} else if (isLocalDev) { ... }
```

The `if (debugToken)` branch is evaluated **before** and **independently of** every environment
check. `isLocalDev`, `NODE_ENV` and hostname are irrelevant to it. `NEXT_PUBLIC_*` values are inlined
into the client bundle at build time.

Consequence: if `NEXT_PUBLIC_APP_CHECK_DEBUG_TOKEN` is present in the Vercel **production** env, the
debug token is compiled into the public JS bundle, readable by anyone with devtools — and a debug
token registered in the Firebase console mints tokens that satisfy App Check. Every
`enforceAppCheck: true` on every callable (`awardWorkoutXP`, `ingestHealthSamples`,
`validateAccessCode`, `runDataMigration`, `requestAccountDeletion`, `reverseWorkoutXP`) is then
bypassable with curl, and the App Check requirement on the `presence` collection's rules with it.

The same pattern exists on the native path (`:274`):
```ts
const isDebug = process.env.NEXT_PUBLIC_APP_CHECK_DEBUG === 'true';
await FAC.initialize({ debug: isDebug, isTokenAutoRefreshEnabled: true });
```
guarded only by a comment ("Leave unset in production"). **`NEXT_PUBLIC_APP_CHECK_DEBUG=true` is
present and set to true in the local `.env.local`** — one env-var copy into Vercel or into a native
build pipeline turns App Check off in production with no error and no log.

**NEEDS VERIFICATION:** whether either variable is set in the Vercel production environment or in the
iOS/Android release build env. This is a five-minute check and it changes the severity from
"latent" to "actively exploitable."

**Fix:** wrap both branches so they are *impossible* in a production build:
```ts
const allowDebug = process.env.NODE_ENV !== 'production' && isLocalHost;
const debugToken = allowDebug ? process.env.NEXT_PUBLIC_APP_CHECK_DEBUG_TOKEN : undefined;
```
Then delete both vars from the Vercel production env and revoke every registered debug token in the
Firebase console before launch. Also confirm in the console that App Check **enforcement** (not just
monitoring) is switched on for Cloud Functions, Firestore and Storage — the `enforceAppCheck: true`
flags in code are necessary but not sufficient.

---

### F5 — HIGH · Unverified-JWT admin fallback outside production
**`src/lib/firebase-admin.ts:168-187`**

```ts
if (process.env.NODE_ENV !== 'production') {
  const claims = decodeJwt(idToken);          // ← NO signature verification
  const devEmail = claims['email'] as string | null;
  const devAdmin = !!(devEmail && ROOT_ADMIN_EMAIL_REGEX.test(devEmail)) || ...;
  return { uid: devUid, email: devEmail, admin: devAdmin };
}
```

`decodeJwt` parses without verifying. Anyone can hand-craft `{"sub":"x","email":"david@appout.co.il"}`
base64url with a garbage signature and receive `admin: true` — which `/api/auth/session` then mints
into a real, signed `out_admin_session` cookie granting the whole admin API.

The only gate is `NODE_ENV !== 'production'`. `next build` sets `NODE_ENV=production`, so Vercel
production and preview deployments are protected. But the guard is an implicit build-mode flag rather
than a deliberate switch: any host running `next dev` (a staging box, a demo instance, a tunnelled
dev server, a docker image built without `NODE_ENV`) is a complete admin bypass, reachable by anyone
who can reach the port.

**NEEDS VERIFICATION:** that no publicly-reachable deployment runs in dev mode.

**Fix:** gate on an explicit opt-in that cannot be set by accident, e.g.
`process.env.ALLOW_UNVERIFIED_DEV_TOKENS === 'true' && process.env.NODE_ENV === 'development'`, and
ideally strip the branch at build time. With a partner SDK about to be integrated, an unverified-token
code path in the identity resolver is exactly the kind of thing that gets copied.

---

### F6 — HIGH · Admin privilege tiers collapse into one
**`src/lib/firebase-admin.ts:199-214`** (mirrored at `functions/src/runDataMigration.ts:105-113` and
`functions/src/auditLogger.ts:74-86`)

```ts
admin = data.role === 'admin' || core.role === 'admin' || core.role === 'system_admin' ||
        core.isSuperAdmin === true || core.isSystemAdmin === true ||
        core.isVerticalAdmin === true || core.isTenantOwner === true;
```

`isTenantOwner` — a city coordinator, school principal, or company HR contact — resolves to
`admin: true`. Since `requireAdminApi` is a boolean gate on exactly this value, **every**
`requireAdminApi` route in §2a opens to them: the finance ledger and transaction delete
(`/api/admin/finance/transactions/[id]` DELETE), Bunny CDN uploads billed to the project
(`/api/admin/bunny/upload`), destructive seeding (`/api/admin/seed-sderot`,
`/api/admin/re-seed-authorities`), cross-tenant data export (`/api/admin/exercises/export`,
`/api/admin/insights`), and `/api/admin/notifications/test`, which sends **arbitrary attacker-chosen
title and body text to any uid** (`route.ts:29-33` — `customTitle`/`customBody` are free text with no
allowlist), bypassing user prefs, quiet hours and rate caps.

The codebase clearly knows about this: `requireSection` and `requireSuperAdminApi` exist precisely to
distinguish tiers, and `api-auth.ts:176-180` documents that `requireSection` "never recognizes
isAuthorityManager." But ~24 of the 30 admin routes still use the flat `requireAdminApi`.

Note this is *not* currently a self-escalation path — `firestore.rules:73-90` prevents a user from
setting `isTenantOwner` on themselves. The risk is that a legitimately-provisioned partner-org
account holds far more authority than intended. With 4,000 users across municipalities and schools,
the number of `isTenantOwner` accounts is not one.

**Fix:** split the tiers. `requireAdminApi` should mean OUT staff only (`isSuperAdmin` /
`isSystemAdmin` / root email). Move finance, seeding, CDN upload and notification-send behind
`requireSuperAdminApi`. Give tenant owners a narrow, explicitly-scoped guard that also filters
results to their own tenant.

---

### F7 — HIGH · Admin page gate only applies on one hostname
**`src/middleware.ts:211-214`**

```ts
const shouldGateAdmin =
  pathname.startsWith('/admin') && !isAdminPublic(pathname) &&
  isAdminDomain;                       // domain === 'admin.outrun.co.il' || 'admin.outrun.local'
```

The middleware header (`:37-56`) states the goal: stop shipping admin HTML/JS to non-admins, because
"a determined attacker could already see the admin source code." The implementation only achieves
that on `admin.outrun.co.il`. The same Next.js app is served from the Vercel domain
(`out-run-app.vercel.app`, referenced at `middleware.ts:18`) and presumably the apex domain — where
`isAdminDomain` is false, `shouldGateAdmin` is false, and `/admin/*` is served to anyone, falling
back to the client-side guard in `src/app/admin/layout.tsx` that the comment explicitly calls
insufficient.

**Attack:** `curl https://out-run-app.vercel.app/admin/finance` (or any `/admin/*` path) returns the
admin bundle unauthenticated — full internal route map, component names, API shapes, and the field
names of privileged endpoints. This is reconnaissance, not direct data access (the APIs are
separately guarded), which is why it is HIGH rather than CRITICAL.

**Fix:** gate on `!isLocalDev` instead of `isAdminDomain`, so every non-local hostname is protected;
or block `/admin/*` entirely on non-admin hostnames.

---

### F8 — MEDIUM · Destructive migration callable still deployed
**`functions/src/index.ts:4`, `functions/src/runDataMigration.ts:29`**

> `IMPORTANT: Remove this function entirely after the migration is complete.`

It is still exported. It deletes and recreates tenant documents and their `units` subcollections,
and rewrites `access_codes`, `users`, and `authorities` cross-references en masse
(`runDataMigration.ts:230-238`). The admin check is sound and App Check is enforced, so this is not
remotely exploitable today — but a 540-second, memory-boosted, multi-collection delete/rewrite
callable is exactly the wrong thing to leave live while onboarding 4,000 users, and its Path C admin
check (`:100-113`) inherits F6's broad `isTenantOwner` definition.

**Fix:** delete the export from `index.ts` and redeploy before launch.

---

### F9 — MEDIUM · Access-code brute force is unlimited
**`functions/src/validateAccessCode.ts:31-88`**

Auth and App Check are enforced, and secret hygiene in the logging is genuinely careful
(`:52-59` — length only, never the value). What is missing is a rate limit. Each call does a doc-ID
lookup then a field query; a failed attempt throws `not-found` and costs the attacker nothing.

Because anonymous auth is enabled, an attacker can mint unlimited identities and grind the code
space. A hit auto-joins them to that tenant/unit — `tx.set` writes `core.tenantId`, `unitId`,
`unitPath`, `tenantType` (`:144-155`) — the exact self-assignment `firestore.rules:95-136` was
rewritten to prevent, obtained through the legitimate door. For `company` tenants it also stamps a
`core.affiliations` entry (`:196-209`), unlocking that org's league and feed scope.

**Fix:** per-uid and per-IP throttle (e.g. 5 failures/hour, backing off), stored in a
`code_attempts/{uid}` doc; lock the code after N global failures; alert on burst failures. Ensure
`maxUses` is set on every real code.

---

### F10 — MEDIUM · Per-call XP cap without a per-day cap
**`functions/src/services/progression.service.ts:44-46`**

`MAX_XP_PER_CALL = 2_000`, and `applyAward` correctly recomputes `globalLevel` server-side from the
canonical table so a level value cannot be forged. But there is no per-day or per-window ceiling, and
`awardWorkoutXP` (`awardWorkoutXP.ts:56`) has no rate limiting. Level 10 is 100,000 XP
(`progression.service.ts:68`) = 50 calls. A script reaches max level and tops every leaderboard in
under a minute. Coins (`MAX_COINS_PER_CALL = 5_000`) have the same shape, and coins may become
economically meaningful.

**Fix:** add a daily accumulator (`push_rate`-style doc per uid per day) and clamp total daily XP and
coins. `ingestHealthSamples` already does this correctly with `clampDelta(current, addition, maxTotal)`
(`ingestHealthSamples.ts:126-129`) — reuse that pattern on the active door.

---

### F11 — MEDIUM · Push-notification content injection via kudos
**`functions/src/onKudosCreated.ts:107, 138-148`** with **`firestore.rules:1428-1431`**

```
match /kudos/{recipientUid}/inbox/{kudoId} {
  allow create: if isAuthenticated();          // ← any user, any recipient, any payload
}
```
```ts
const senderName = String(kudoData.fromName ?? 'מישהו');
const { title, body } = buildMessage(unreadCount, senderName, kudoType);
await sendPush({ toUids: [recipientUid], channel: 'social', title, body, ... });
```

`fromName` is fully attacker-controlled and lands verbatim in an OS-level push notification delivered
to a victim chosen by the attacker. Set it to `"Your account is suspended — verify at bit.ly/…"` and
you have branded phishing arriving as a trusted app notification. `fromUid` is not validated against
`request.auth.uid` either, so the kudo can also impersonate another user in-app.

Mitigating: `sendPush` applies a per-uid/per-channel rate cap (`push.service.ts:317-323`,
`RATE_CAP_HOURS` from `onKudosCreated.ts:53`), so this is one message per window per victim, not a
flood.

**Fix:** in rules, require `request.resource.data.fromUid == request.auth.uid` and
`recipientUid != request.auth.uid`. In the function, ignore `fromName` from the payload and read the
sender's display name from `users/{fromUid}`. Sanitise and length-limit any user string that reaches
a push body.

---

### F12 — MEDIUM · O(N) reads per group-membership write
**`functions/src/onGroupMemberWrite.ts:33-36`**

```ts
const membersSnap = await db.collection(`community_groups/${groupId}/members`).get();
const count = membersSnap.size;
```

Every single member write re-reads the whole members collection. For a 4,000-member city group,
one join costs 4,000 reads; a join/leave loop is a cheap, authenticated billing attack, and legitimate
bulk onboarding is O(N²) — 4,000 sequential joins to one group is ~8M reads.

**Fix:** use `FieldValue.increment(±1)` driven off `event.data.before.exists` /
`after.exists`, or Firestore's `count()` aggregation, instead of materialising every doc.

---

### F13 — MEDIUM · Audit log: App Check off, and caller-supplied identity
**`functions/src/auditLogger.ts:159, 190-193`**

`enforceAppCheck: false` is set explicitly, unlike every other callable — so only a bearer token is
needed, from any client, including automation. Worse, the writer's displayed identity is taken from
the request:

```ts
const adminName = (typeof data.adminName === 'string' && data.adminName.trim().length > 0
  ? data.adminName.trim().slice(0, 200) : tokenEmail || uid);
```

`adminId` is correctly `request.auth.uid`, but the human-readable `adminName` shown in the Approval
Center is attacker-chosen, and `actionType`/`targetEntity`/`targetId`/`oldValue`/`newValue` are all
caller-supplied within allowlists. Any account passing the broad `requireAdmin` check (F6) can inject
plausible false entries attributed to another person's name, or bury real entries in noise. An audit
log that the audited party can write freely is not an audit log.

**Fix:** set `enforceAppCheck: true`; drop the `adminName` parameter and resolve the name server-side
from the token/user doc; rate-limit writes per uid.

---

### F14 — MEDIUM · `onLevelUp` fires on every user-document write
**`functions/src/onLevelUp.ts:50-56`** — `document: 'users/{uid}'`, `onDocumentUpdated`.

The handler's fast-exit is correct (`:67-74`) and there is no write-back loop. The cost is the
invocation itself: `users/{uid}` is one of the hottest documents in the app (progression, FCM tokens,
onboarding state, preferences, affiliations, `social.groupIds`). Every one of those writes, for every
one of 4,000 users, invokes a 256 MiB function that delivers the full before/after document and then
almost always returns immediately.

**Fix:** trigger on a narrow document instead — have `applyAward` write a `level_events/{uid}_{level}`
doc on an actual level-up and trigger on that. Same for any future `users/{uid}` triggers.

---

### F15 — MEDIUM · Challenge submissions: no membership check, unbounded array
**`src/app/api/challenge/submit/route.ts:23-88`**

Auth is correct (uid from a verified token, `checkRevoked=true`, `value` bounded 1–3600). Two gaps:

1. **No membership check on `groupId`.** Any authenticated user can insert themselves into any
   group's `challenge_submissions` — and, via F2, that record is then published to the world with
   their name, age group and gender.
2. **Unbounded array growth.** `attempts: FieldValue.arrayUnion({ value, submittedAt })` (`:78-81`)
   appends on every call with no cap. Firestore's 1 MiB document limit is reachable by a scripted
   loop, permanently bricking that user's submission doc and every read of it.

**Fix:** verify `community_groups/{groupId}/members/{uid}` exists before writing. Cap `attempts`
(keep the last N) or move attempts to a subcollection. Rate-limit submissions per uid.

---

### F16 — MEDIUM · CORS allows `http://localhost` with credentials
**`src/middleware.ts:20-32`**

```ts
const CAPACITOR_ORIGINS = new Set(['capacitor://localhost', 'https://localhost', 'http://localhost']);
const CORS_HEADERS = { ..., 'Access-Control-Allow-Credentials': 'true' };
```

The origin is reflected back verbatim (`:109`, `:118`) with credentials allowed. `capacitor://localhost`
and `https://localhost` are the legitimate native-shell origins. `http://localhost` is not: any page
served from a local HTTP server on a user's machine — a dev server, an Electron app, a malicious
`npm` package's postinstall server, anything the user has been induced to open — becomes a trusted
origin able to make credentialed cross-origin calls to the production API and read the responses.

**Fix:** drop `http://localhost`. Keep the other two, and pair them with bearer-token auth on every
route rather than relying on origin as a control (any native app on a device can claim
`capacitor://localhost`).

---

### F17 — LOW · Unbounded scheduler scans and oversized batches
- `deleteZombieGroups` (`onGroupMemberWrite.ts:66-87`): unbounded query then a **single**
  `db.batch()` commit. Firestore caps a batch at 500 writes — above 500 zombie groups this throws and
  the cleanup silently stops running. Page with `.limit(400)` in a loop.
- `unitLeagueRollup` (`unitLeagueRollup.ts:67, 80, 122`): three full-collection `.get()`s **every
  hour**. Grows linearly with units, declarations and aggregates.
- `rollupLeaderboard` (`leaderboard.ts:172-174`): full `leaderboard_shards` scan. Shard count is
  users × units × periods — the fastest-growing collection in the schema. Writes are correctly
  chunked (`:204-229`); the read is not.

---

### F18 — LOW · Admin allowlist shipped to the client
`NEXT_PUBLIC_ROOT_ADMIN_EMAILS` (`.env.example`, `.env.local`, used in `src/`) is inlined into the
public bundle. It hands an attacker the exact list of accounts worth phishing or credential-stuffing —
the same accounts hardcoded as `ROOT_ADMIN_EMAIL_REGEX` in `firestore.rules:21`,
`firebase-admin.ts:134`, `runDataMigration.ts:43` and `auditLogger.ts:53`. Move the check server-side
and drop the `NEXT_PUBLIC_` variant.

Also of note: `resolveProjectId()` (`firebase-admin.ts:44-50`) falls back to a hardcoded `'appout-1'`,
and `bunny.config.ts:21-22` hardcodes `BUNNY_CDN_HOSTNAME_FALLBACK` and `BUNNY_LIBRARY_ID_FALLBACK`.
Both are documented as public values and are — but silent fallbacks mean a missing env var produces
working-but-wrong behaviour instead of a loud failure.

---

### F19 — LOW · Non-constant-time cron secret comparison
**`src/app/api/admin/crm-agent/run/route.ts:730`**

```ts
if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) { return 401; }
```

`!==` on strings short-circuits at the first differing byte. Practically unexploitable over a network,
but `api-auth.ts` already imports `timingSafeEqual` and uses it for `AGENT_API_KEY` — use it here too
for consistency. Positives: it fails closed when `CRON_SECRET` is unset, and the synthetic POST
(`:734-741`) correctly re-enters through the normal guard.

---

### F20 — LOW · In-process rate limiter
**`src/app/api/join/preview/route.ts:71-75`** — `isRateLimited(ip)` is per-Node-process state. On
Vercel each concurrent lambda instance has its own map, and instances recycle constantly, so the
effective limit is `N_instances × configured_limit` and resets unpredictably. Use a shared store
(Firestore doc, Upstash, or Vercel's WAF/rate-limit rules) for any limit that must actually hold.
The same applies to every rate limit recommended in F1, F9, F10 and F15.

---

## 5. Secrets handling (Part C)

### Hardcoded values in source
| Value | Location | Verdict |
|---|---|---|
| Firebase web `apiKey` | `src/lib/firebase.ts:34` | **Expected.** Firebase web API keys are public identifiers, not secrets. **Action:** confirm HTTP-referrer / bundle-id restrictions are applied in the GCP console, so the key can't be used to drive anonymous-auth abuse from arbitrary origins. |
| Dev session secret string | `src/lib/admin-session.ts:55` | **Acceptable.** `getSessionSecret()` throws in production when `SESSION_COOKIE_SECRET` is missing or <32 chars (`:49-53`). Fails closed. |
| `dudu2026` | `functions/src/runDataMigration.ts:9` | **Historical only** — appears in a comment describing the removed vulnerability. The endpoint is gone. Still worth scrubbing the literal from the comment. |
| Bunny CDN hostname / library id | `src/lib/bunny/bunny.config.ts:21-22` | Public pull-zone values, correctly separated from `BUNNY_API_KEY`. |

**No service-account JSON, private key block, Mapbox `pk.` token, Slack, GitHub or Anthropic key was
found in `src/` or `functions/src/`.** Scanned for `AIza…`, `pk.eyJ…`, `sk-…`, `sk-ant-…`, `xox[baprs]-`,
`ghp_…`, `BEGIN … PRIVATE KEY`. The only match anywhere was the public Firebase web key above.

`secrets/gmail-service-account.json` exists on disk with mode `0600`, is covered by `.gitignore:60`
(`secrets/`), and is **not** tracked by git. Correct.

### `NEXT_PUBLIC_` exposure review
Everything with this prefix ships in the client bundle. Currently used in `src/`:

| Variable | Ships to client | Verdict |
|---|---|---|
| `NEXT_PUBLIC_APP_CHECK_DEBUG` | yes | ⚠ **F4** — set to `true` in `.env.local`; must never reach a production/native build |
| `NEXT_PUBLIC_APP_CHECK_DEBUG_TOKEN` | yes | ⚠ **F4** — a real bearer credential if set in prod |
| `NEXT_PUBLIC_ROOT_ADMIN_EMAILS` | yes | ⚠ **F18** — should be server-only |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | yes | ✔ site keys are public by design |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | yes | ✔ if it is a scoped **public** `pk.` token. **NEEDS VERIFICATION** that it is not a secret `sk.` token and that URL restrictions are set — Mapbox bills per request. |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | yes | ✔ public by design; **verify** HTTP-referrer restrictions and a billing quota cap |
| `NEXT_PUBLIC_FCM_VAPID_KEY` | yes | ✔ public half of the VAPID pair |
| `NEXT_PUBLIC_BUNNY_LIBRARY_ID` / `_CDN_HOSTNAME` | yes | ✔ public CDN identifiers |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_VERCEL_ENV`, `NEXT_PUBLIC_SHORT_LINK_DOMAIN` | yes | ✔ non-sensitive |

Correctly kept **server-only** (no `NEXT_PUBLIC_` prefix, verified not referenced from client code):
`FIREBASE_SERVICE_ACCOUNT_KEY`, `GOOGLE_SERVICE_ACCOUNT_KEY`, `SESSION_COOKIE_SECRET`,
`AGENT_API_KEY`, `CRON_SECRET`, `BUNNY_API_KEY`, `BUNNY_STORAGE_ACCESSKEY`, `LINK_CLICK_IP_SALT`,
`ANTHROPIC_API_KEY`, `FTP_*`, `FIREBASE_ADMIN_PASSWORD`, `FIREBASE_ID_TOKEN`.

### `.env.example` drift
`.env.example` is missing three variables the code depends on: **`AGENT_API_KEY`**,
**`CRON_SECRET`**, **`GOOGLE_SERVICE_ACCOUNT_KEY`**. All three fail closed when unset
(`api-auth.ts:19`, `crm-agent/run/route.ts:730`, `firebase-admin.ts:83`), so this is a documentation
gap rather than a vulnerability — but an operator provisioning a new environment from `.env.example`
will silently ship without machine-to-machine auth or cron auth.

Conversely, `.env.local` contains `FIREBASE_ADMIN_PASSWORD`, `FIREBASE_ID_TOKEN` and
`ANTHROPIC_API_KEY`, none of which appear in `.env.example`. A long-lived admin password and ID token
sitting in a developer's dotfile is worth reviewing separately; they are not in git.

---

## 6. Git history leak check (Part D)

```
$ git log --oneline | wc -l
1620
```

Files matching secret-ish patterns that were **ever added** in any branch:

| Path | Status |
|---|---|
| `.env.example` | ✔ template only, no values |
| `ios/App/App/GoogleService-Info.plist` | ✔ tracked in HEAD; standard Firebase iOS config (public client identifiers). Not a secret. |
| `android/app/google-services (1).json` | ✔ same — public Android Firebase config |
| **`firebase-key.json`** | ⚠ **investigated — benign** |
| `functions/node_modules/**` (~28 files matching `credential`/`secret` in their *filenames*) | ✔ false positives — vendored library source (`@grpc/grpc-js`, `firebase-admin`, `google-auth-library`, `jose`). Not credentials. |

### `firebase-key.json` — investigated, not a leak
Added in `e7ff1ec9` (2026-06-01, *"fix: sanitize execution methods location data…"*), removed in
`64a1b1fb` (*"security: ignore firebase credentials"*), now covered by `.gitignore:74` and absent
from HEAD (`git ls-files firebase-key.json` → 0).

The committed blob (`24bd7543`) is **54 bytes** and contains **no `private_key`, no `client_email`,
no `PRIVATE KEY` PEM block, and no `apiKey`**. It was a stub/placeholder, not a real service-account
key. **No rotation required.** The commit message suggests the author believed a credential had been
committed; it had not.

**Note on repo hygiene:** `functions/node_modules/` was committed at some point. That is a large
history-bloat problem and it means any future accidental secret under `functions/` would be easy to
miss in a scan. Confirm `functions/node_modules` is in `.gitignore` today.

### Recommended verification before launch
This audit's history scan matched on **filenames only**, per the requested method. That will not
catch a key pasted into a `.ts` file, a script, or a commit message. Run a content-based scan over
full history before launch:
```
gitleaks detect --source . --log-opts="--all"      # or: trufflehog git file://. --only-verified
```

---

## 7. App Check posture (Part E)

**In code:**
- Client init: `src/lib/firebase.ts:76-130` (web, reCAPTCHA Enterprise) and `:252-300` (native,
  DeviceCheck / Play Integrity via `@capacitor-firebase/app-check` `CustomProvider`).
- Ordering is correct — `initializeAppCheck` runs before `getAuth` / `initializeFirestore` /
  `getStorage`, as the comment at `:55-58` requires.
- Native failure handling is genuinely well engineered: 10s hard timeout, 60s circuit breaker, and a
  throw (not a short-TTL dummy token) so the SDK's own back-off applies (`:186-215`). The comment
  documenting why the dummy-token approach froze the UI is exactly right.
- Server enforcement: `enforceAppCheck: true` on 6 of 7 callables. **`logAuditAction` is the sole
  opt-out** (`auditLogger.ts:159`) — see F13.
- Firestore rules require an App Check token on the `presence` collection (per `firebase.ts:61-63`).

**Gaps:**
1. **F4 — the debug path has no production guard.** This is the material finding. Both
   `NEXT_PUBLIC_APP_CHECK_DEBUG_TOKEN` (web, `:115`) and `NEXT_PUBLIC_APP_CHECK_DEBUG` (native,
   `:274`) are honoured regardless of `NODE_ENV` or hostname, and `NEXT_PUBLIC_APP_CHECK_DEBUG=true`
   is currently set in `.env.local`.
2. **Local-dev bypass is hostname-driven** (`:106-113`): `isLocalDev` is true for `localhost`,
   `127.0.0.1`, `[::1]`, `0.0.0.0`, `*.localhost`, **or** `NODE_ENV === 'development'`. Combined with
   F16's `http://localhost` CORS entry and F5's dev-mode admin bypass, "runs on localhost" is a
   recurring trust boundary across this codebase. It holds only as long as nothing public is ever
   served from a localhost-ish hostname or a dev-mode build.
3. **NEEDS VERIFICATION (console-only, cannot be read from source):** that App Check **enforcement**
   — not merely monitoring — is enabled for Cloud Functions, Firestore, and Storage in the Firebase
   console, and that no stale debug tokens are registered. `enforceAppCheck: true` in code is
   necessary but not sufficient; the console toggle is the real control.

---

## 8. Notes for the partner SDK integration

Since this audit is a precondition for a third-party SDK landing in the codebase:

1. **Fix F5 first.** An unverified-JWT branch inside the shared identity resolver is the single most
   likely thing to be copied into a new integration path.
2. **Give the partner their own credential and their own guard.** Do not extend `AGENT_API_KEY` or
   the `isTenantOwner`-inclusive `requireAdminApi` (F6) to them. A partner should get a dedicated
   key, a dedicated scope, and routes that filter to their tenant.
3. **Every new partner endpoint must state its auth model in the first five lines of the handler**,
   the way the current admin routes do. The three unauthenticated Admin-SDK routes in this audit
   (F1, F2, and the acceptable-but-unbounded `/api/challenge/exercise`) all share one trait: no
   comment or code at the top of the handler says what the auth model is, so nothing signals that it
   is missing. `/api/join/preview` — which documents and implements rate limiting, input validation
   and a field whitelist — is the pattern to copy.
4. **Assume the partner will send you uids.** Given F1 and F3, "trust an id in the payload" is
   already the recurring bug class here. Every partner-supplied identifier must be re-resolved
   against a verified token or a server-side lookup before it reaches an Admin-SDK call.

---

## 9. Top 5 pre-launch fixes

1. **Authenticate `/api/calendar/[userId]` and `/api/challenge/leaderboard`** (F1, F2). Two files.
   These are the only endpoints where a total stranger with curl reads real user data today —
   training schedules, and names/ages/genders including minors. Everything else needs at least a
   token.
2. **Stop `onFeedPostCreate` trusting the post document** (F3). Resolve `tenantId`/`unitId` from
   `users/{authorUid}.core` and ignore client `xpAwarded` — copy `onWorkoutCreate`, which already
   does it right. Leaderboards are the product's competitive core and are currently forgeable by any
   anonymous account.
3. **Production-guard the App Check debug paths and purge the debug env vars** (F4). Add the
   `NODE_ENV`/hostname guard, remove `NEXT_PUBLIC_APP_CHECK_DEBUG*` from every production and native
   build environment, revoke registered debug tokens, and confirm enforcement is ON in the console.
   Without this, all the `enforceAppCheck: true` flags may be decorative.
4. **Remove the unverified-JWT admin fallback and split the admin tiers** (F5, F6). Gate the
   `decodeJwt` branch behind an explicit opt-in env var, and move finance, seeding, CDN upload and
   `notifications/test` off the flat `requireAdminApi` onto `requireSuperAdminApi`. Do this before
   the partner integration, not after.
5. **Add rate limiting where money and abuse meet** (F9, F10, F12, F15, plus F7's admin-bundle
   exposure). Concretely: throttle `validateAccessCode` failures per uid/IP; add a daily XP/coin
   ceiling to `awardWorkoutXP`; replace `onGroupMemberWrite`'s full-collection read with an
   `increment`; cap `challenge/submit` attempts; and change the middleware gate from `isAdminDomain`
   to `!isLocalDev`. With anonymous auth enabled and 4,000 users arriving, every unlimited
   authenticated loop is a billing incident waiting to happen.
