# 06 — Capability URLs, Codes & Share Links

**Audit date:** 2026-09-08
**Scope:** every URL / code / link in the repo where *the string itself is the credential*.
**Explicitly excluded (already being fixed):** `/api/calendar/[userId]`, `/api/challenge/leaderboard`.
**Method:** static read of `src/app/**`, `src/features/**`, `src/lib/**`, `functions/src/**`,
`firestore.rules`, `capacitor.config.ts`, `ios/App/App/*.entitlements`, `public/.well-known/*`.
Every claim below cites `file:line` from code actually read.

---

## 0. The finding that changes everything else

Before reading the individual surfaces, understand this, because it downgrades or upgrades
almost every verdict in this document.

**`isAuthenticated()` in `firestore.rules` means "anybody on the internet".**

- `firestore.rules:9-11` — `function isAuthenticated() { return request.auth != null; }`
- `src/lib/auth.service.ts:461-467` — `signInGuest()` = `signInAnonymously(auth)`.
- `src/app/challenge/[inviteCode]/join/page.tsx:44-46` — the challenge join screen calls
  `auth.signOut()` then `signInGuest()` with no gate at all.
- `src/app/gateway/page.tsx:183` — the main gateway does the same for guest onboarding.

Anonymous auth is enabled and reachable in one tap with the public Firebase web config that
ships in the client bundle. Therefore **any rule guarded only by `isAuthenticated()` is a
public rule**. Where a rule like that exposes a *token*, the token has no secrecy left —
which is exactly the failure mode of the calendar bug.

**This is the same class of bug as the calendar route, repeated three more times**
(`admin_invitations`, `group_invitations`, `community_groups.inviteCode`).

---

## 1. VULNERABLE — CRITICAL

### 1.1 `admin_invitations` — live 64-char admin tokens readable by any anonymous user

**Location / URL shape**
- Rule: `firestore.rules:1029-1035`
- Link built at: `src/features/admin/services/invitation.service.ts:189-190`
  `https://<host>/admin/authority-login?token=<64-hex>&authority=<authorityId>`
- Token minted: `src/features/admin/services/invitation.service.ts:48-63`
- Redeemed: `src/app/admin/auth/callback/page.tsx:84-103` → `applyInvitationToUser()`
  (`invitation.service.ts:293-446`)

**What is the secret?** `admin_invitations/{doc}.token` — 64 hex chars from
`window.crypto.getRandomValues(new Uint8Array(32))` (invitation.service.ts:50-54).

**How guessable?** As a string: not guessable. 2^256. Cryptographically fine.

**Is the secret obtainable elsewhere? YES — this is the whole bug.**
`firestore.rules:1033` is `allow read: if isAuthenticated();`. The rule's own comment
(lines 1030-1032) says *"Tokens are 64-char random hex — knowledge of the token IS
authorization"* — and then hands the token to every caller. There is no `where('token','==',x)`
constraint enforceable at the rules layer: a `list` on the collection returns every document.
`getAllInvitations()` (invitation.service.ts:452-465) is exactly that query, and it runs from
the client SDK with no role check ("Read-only — no Root Admin check required", line 451).
An attacker: `signInAnonymously()` → `getDocs(collection(db,'admin_invitations'))` → every
un-used token, plus every invited admin's **email, role, authorityId, tenantId, unitId**.

**What does holding it grant?**
1. **Guaranteed:** full disclosure of the admin/authority roster — emails, roles, which
   municipality/military tenant each one administers. That is a targeted-phishing kit
   for a municipality's staff.
2. **Attempted privilege escalation:** `/authority-portal/login` with a token present sets
   `hasInvitationToken` (`src/app/authority-portal/login/page.tsx:115-125`), and
   `sendAdminMagicLink` **skips the admin-email check entirely** when that flag is set
   (`src/features/admin/services/passwordless-auth.service.ts:186-196`) — so the attacker
   types *their own* email, receives a real Firebase magic link, signs in, and the callback
   runs `applyInvitationToUser(theirUid, invitation)` which writes `role:'admin'`,
   `core.isSuperAdmin`, `core.isApproved:true`, `core.tenantId` (invitation.service.ts:310-403).
   The invitation is **never checked against the signed-in user's email** anywhere in
   `validateInvitation()` (invitation.service.ts:215-254) or the callback.

   That last write is *currently* blocked by `firestore.rules:374-381` (create forbids
   `'role' in request.resource.data`) and `:398-403` + `noAdminFieldsChanged()`
   (`firestore.rules:135-152`). So escalation fails **on a rules technicality, not by design** —
   the application logic fully intends to grant admin here. Any future rules relaxation, or any
   Admin-SDK server route added for invitation redemption, turns this into instant super-admin
   takeover. Treat it as a live escalation path.

**Rate limiting?** None — and irrelevant, the token is handed over directly.
**Expiry / revocation?** 7-day expiry (invitation.service.ts:165-166), single-use via
`isUsed` (`markInvitationAsUsed`, :259-287). Both are checked *after* the token is already public.

**Verdict: VULNERABLE — CRITICAL.**
**Fix (do this first, it is one line):**
```
match /admin_invitations/{docId} {
  allow read, write: if isAdmin();   // was: allow read: if isAuthenticated()
}
```
Token *validation* must move to a Cloud Function / Admin-SDK API route that takes the token,
verifies it, **verifies `invitation.email === request.auth.token.email`**, and applies the role
server-side. Then delete `getAllInvitations()`'s client-side unrestricted read, and rotate
(delete + reissue) every currently outstanding invitation, because they have all been readable.

---

### 1.2 Group invite codes — 6 chars of `Math.random()`, and the whole collection is public

**Location / URL shape**
- `https://outrun.co.il/join/<CODE>` — `src/app/join/[inviteCode]/`
- `https://outrun.co.il/challenge/<CODE>` — `src/app/challenge/[inviteCode]/page.tsx:34`
- Generated: `src/features/arena/services/group.service.ts:104-106` and
  `src/features/admin/services/community.service.ts:593-595`, both:
  `Math.random().toString(36).substring(2, 8).toUpperCase()`
- Consumed: `src/app/api/join/preview/route.ts:86-90`, `src/app/api/join/confirm/route.ts:62-66`,
  `src/app/api/challenge/join/route.ts:85-89`, `src/lib/joinEngine.ts:101-116`

**What is the secret?** `community_groups/{id}.inviteCode` — 6 chars, base-36.

**How guessable?** Two independent problems.
- *Search space:* 36^6 ≈ **2.18 billion**. Sounds fine; it is not, see rate limiting below.
- *Randomness:* `Math.random()` is **not** a CSPRNG. V8's xorshift128+ state is recoverable
  from a handful of consecutive outputs, and outputs are generated in reverse-order batches of
  64. A group creator who creates a few groups (or observes any other `Math.random()`-derived
  value in the same page context) can predict subsequent codes. Category: **predictable, not
  merely short**. Contrast `src/app/api/invite/run-session/route.ts:38`, which correctly uses
  `crypto.randomInt`.

**Is the secret obtainable elsewhere? YES.**
`firestore.rules:1288` — `match /community_groups/{docId} { allow read: if isAuthenticated(); }`.
`inviteCode` is a plain field on that document. One anonymous sign-in plus
`getDocs(collection(db,'community_groups'))` returns **every invite code for every group in the
product**, including private (`isPublic:false`) and access-code-locked (`isLocked:true`)
institutional groups — schools, military units, workplaces
(`src/features/arena/services/group.service.ts:114-119` defines those as institutional).
The rule's comment (lines 1272-1287) explains at length why the gate was *removed* (it broke
`list` queries) — the reasoning about `list` is correct, but the consequence for `inviteCode`
was not considered.

**What does holding it grant?**
- Unauthenticated group metadata: name, category, description, cover image, schedule slots,
  **`meetingLocation`**, rules (`src/app/api/join/preview/route.ts:52-64`). For a school or
  minors' group that is "where children meet, and when", available with no login.
- With a one-tap anonymous account: **full membership** via `/api/join/confirm`
  (route.ts:62-66) or `/api/challenge/join` (route.ts:85-89). `joinEngine` writes the member
  record, `user_memberships`, and `users.social.groupIds` with the **Admin SDK**
  (`src/lib/joinEngine.ts:196-263`), which bypasses `firestore.rules` — so the persona gate at
  `firestore.rules:1378-1387` (`blockedByGroupPersonaGate`) and the `isLocked` access-code gate
  never run on this path. Membership then unlocks the group roster
  (`firestore.rules:1343`), attendance and `attendeeProfiles` (`:1395-1400`), group chat, and
  the presence/location scope that `social.groupIds` anchors
  (`src/app/api/social/group-membership/route.ts:6-10`).

**Rate limiting?**
- `/api/join/preview` has one: **60 requests / 60 s per IP**, in-memory per serverless instance
  (`src/app/api/join/preview/route.ts:28-45`). Note the doc comment at line 11 claims 15/60s
  but `MAX_REQUESTS_PER_WINDOW = 60` (line 29). It is also per-instance and per-IP, so it is
  defeated by Vercel's instance fan-out and by any rotating-IP pool.
- `/api/join/confirm` and `/api/challenge/join`: **no rate limit at all**. `joinEngine`'s
  `where('inviteCode','==',code)` is a free oracle.
- Moot anyway, since §1.2's real break is the bulk read, not brute force.

**Expiry / revocation?** **None.** `inviteCode` is a permanent field on the group document.
There is a `generateGroupInviteCode(groupId)` rotator
(`src/features/admin/services/community.service.ts:602-604`) but no expiry, no usage cap,
and no UI-driven rotation policy found.

**Verdict: VULNERABLE — CRITICAL** (severity driven by minors' groups and military/school
institutional groups being enumerable).

**Fix:**
1. Move `inviteCode` **off** the `community_groups` document into a separate collection
   `group_invite_codes/{code}` → `{ groupId }` with `allow read: if false;` (server-only).
   This is the only change that actually restores secrecy, and it does not reintroduce the
   `list`-query breakage the rules comment describes, because the public document keeps its
   unconditional read.
2. Replace both `generateInviteCode()` implementations with a server-side
   `crypto.randomBytes`-derived code of ≥10 chars from an unambiguous alphabet.
3. Add a shared rate limiter to `/api/join/confirm` and `/api/challenge/join`.
4. **Do not silently rotate every code** — see §4 for the ones that are physically printed.

---

### 1.3 `/api/social/group-membership` — join *any* group by ID, no invite code at all

**Location:** `src/app/api/social/group-membership/route.ts:57-70`; engine branch
`src/lib/joinEngine.ts:160-165`.

**URL shape:** `POST /api/social/group-membership` with any Firebase ID token (anonymous is
accepted — `verifyIdToken` at route.ts:38 does not check provider) and
`{ groupId: "<any group doc id>", action: "join" }`.

**What is the secret?** The Firestore document ID of the group. That is not a secret:
`firestore.rules:1288` publishes the entire `community_groups` collection, IDs included.

**How guessable?** Not applicable — it is *published*, not guessed.

**What does holding it grant?** Full membership in **any** group. `joinEngine`'s `'direct'`
branch has a comment saying *"Caller is responsible for validating the groupId is legitimate"*
(`joinEngine.ts:161-162`) — and this caller performs **no validation whatsoever**. It does not
check `isPublic`, does not check `isLocked`, does not check `inviteCode`, does not check the
persona gate. Because it runs on the Admin SDK, every `firestore.rules` guard is bypassed.
This means the reserve-league / military persona gating built at `firestore.rules:1959-1965`
(`community_groups_reserve`, readable only by users with
`military_declarations.status == 'reserve'`) can be walked around: join the underlying group
through this route, and membership unlocks the roster of real names at
`firestore.rules:1343` — the exact exposure that gate exists to prevent.

**Rate limiting?** None. **Expiry / revocation?** N/A — membership is permanent until removed.

**Verdict: VULNERABLE — CRITICAL.** Highest legal exposure of anything in this document
(military-affiliated real names + minors' group rosters).

**Fix:** the `'direct'` target must never be reachable from a user-supplied `groupId`. Either
(a) restrict this route to `action:'leave'` and the *repair* path only — i.e. accept `join`
only when `community_groups/{groupId}/members/{uid}` already exists (which is the stale-mirror
case the route was actually built for, see its doc comment lines 1-13) — or (b) require an
`inviteCode` and route through `target:{type:'group'}`. Also add the `isLocked` / persona
checks *into* `joinEngine` so no future caller can forget them.

---

## 2. NEEDS-HARDENING — HIGH

### 2.1 Access codes (`access_codes`) — 6 chars of `Math.random()`, grants a military/municipal tenant

**Location / shape:** typed into the app, not a URL, but functionally identical — the code is
the credential. Generated `src/features/admin/services/access-code-admin.service.ts:35-42`;
redeemed `functions/src/validateAccessCode.ts:31-167`.

**What is the secret?** `access_codes/{id}.code` — 6 chars from
`ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (32 symbols), optionally `PREFIX-` prefixed.

**How guessable?** 32^6 = **1,073,741,824** combinations — but drawn from
`Math.floor(Math.random() * chars.length)` (line 39), so the same V8-predictability problem as
§1.2. An admin generating a batch of codes in one browser session produces a *predictable
sequence*. Category: **predictable**.

**Is it obtainable elsewhere?** **No — this one is correctly locked.**
`firestore.rules:1778-1781` is `allow read/write: if isAdmin();`, and the rule's comment
(lines 1773-1777) records that this was tightened after a prior leak. `schools` was likewise
closed at `firestore.rules:1762-1770`. Good.

**What does holding it grant?** `validateAccessCode` writes `core.tenantId`, `core.unitId`,
`core.unitPath`, `core.tenantType` onto the caller (`validateAccessCode.ts:143-155`) and, for
company tenants, an `affiliations` entry (:196-209). `tenantType` includes `'military'`
(:23). `functions/src/leaderboard.ts` trusts `core.tenantId`/`unitId` for competitive
bucketing — this is called out explicitly in `firestore.rules:162-167`. So a valid code places
you inside a military unit's or a school's tenant and its leaderboards.

**Rate limiting?** **None in code.** `validateAccessCode` is `onCall` with
`enforceAppCheck: true` (`validateAccessCode.ts:34-36`) and requires auth (:43-46), but there
is no attempt counter, no per-uid throttle, no lockout. App Check raises the cost (you need a
real device/attested app) but does not bound attempts. **NEEDS VERIFICATION:** whether a
Cloud Armor / Firebase rate limit exists at the infrastructure layer — check the GCP console
for a rate-limit policy on the `validateAccessCode` function, and check whether App Check is
actually *enforced* (not "monitoring") for Cloud Functions in the Firebase console.

**Expiry / revocation?** Good: `isActive`, `expiresAt`, `maxUses`/`usageCount` are all checked
in the transaction (`validateAccessCode.ts:112-120`). Revocable via the admin panel.

**Verdict: NEEDS-HARDENING — HIGH.**
**Fix:** (1) replace `Math.random()` with `crypto.randomInt` / server-side generation;
(2) raise to 8-10 chars; (3) add a per-uid + per-IP attempt counter in the function (e.g. 5
failures → 15-minute lockout), logged; (4) confirm App Check enforcement mode.

---

### 2.2 Session invite tokens (`group_invitations/{token}`) — whole collection is publicly readable

**Location / URL shape**
- `https://outrun.co.il/session/<si_XXXXXX>` — built at
  `src/app/api/invite/run-session/route.ts:257` and
  `src/features/arena/services/group-invitation.service.ts:96-98`.
- Landing page: `src/app/session/[token]/page.tsx:19-41`.
- Shared through `navigator.share` / WhatsApp:
  `src/features/workout-engine/components/RunShareBar.tsx:212-219`,
  `src/features/workout-engine/shared/components/SessionLobbyOverlay.tsx:113-120`,
  `src/features/workout-engine/players/running/components/FreeRun/InviteRunButton.tsx:58-62`.

**What is the secret?** The document ID `si_` + 6 chars from a 32-symbol alphabet.

**How guessable?** 32^6 ≈ **1.07 billion** — but **two different generators exist**:
- `src/app/api/invite/run-session/route.ts:35-41` uses `crypto.randomInt` — **correct**.
- `src/features/arena/services/group-invitation.service.ts:55-62` uses
  `Math.random()` — **predictable**, same class as §1.2/§2.1.
Both write to the same collection, so the weak generator drags the whole surface down.

**Is it obtainable elsewhere? YES.** `firestore.rules:1636` — `allow read: if isAuthenticated();`.
The comment directly above (line 1633) asserts *"Tokens are cryptographic random — unguessable
ID is the primary security layer"*, which is (a) only half true given the `Math.random()`
generator and (b) irrelevant, because the rule permits a **collection `list`**: an anonymous
client can enumerate every live invitation document and read `groupId`, `attendanceId`,
`hostUid`, `groupName`, `sessionDate`, `sessionTime`, `scheduledFor`.

**What does holding it grant?**
- Read: **who is running, when, and under what group name** — including scheduled future runs
  (`scheduledFor`, run-session route.ts:225). For minors this is a "where will this child be,
  and at what time" feed.
- Write: `POST /api/join/session-token` (`src/app/api/join/session-token/route.ts:69-74`) with
  any Firebase ID token joins the session — Admin-SDK member write, attendance RSVP with the
  joiner's name/photo into `attendeeProfiles`, and a calendar entry pushed into the joiner's
  schedule (:100-132). Once a member, the joiner passes the presence gate and can see the live
  session's participants.
- Direct Firestore write: `firestore.rules:1642-1643` lets any authenticated user increment
  `useCount` on any invitation — a trivial way to burn a `maxUses`-limited invite.

**Rate limiting?** None on `/api/join/session-token`. Moot given the enumerable read.

**Expiry / revocation?** Good design: 2-hour TTL enforced server-side
(`src/lib/joinEngine.ts:141-146`, `run-session/route.ts:30`), optional `maxUses`
(`joinEngine.ts:147-152`), host can delete (`firestore.rules:1639-1640`).
`functions/src/cleanupEphemeralDocs.ts` exists for sweeping.

**Verdict: NEEDS-HARDENING — HIGH.**
**Fix:** (1) `allow read: if false;` on `group_invitations` — the `/session/[token]` page
should validate through a server route, not `getDoc` from the client
(`group-invitation.service.ts:105-118` is the only client reader); (2) delete the
`Math.random()` generator at `group-invitation.service.ts:55-62` and make the API route the
single minting path; (3) restrict the `useCount` update rule to the Admin SDK only — the
increment already happens in `joinEngine.ts:255-258`, so the client rule is dead weight.

---

### 2.3 Referral links `?ref=<uid>` — publishes Firebase UIDs, which is what made the calendar bug real

**Location / URL shape**
- `https://onelink.to/appout?ref=<firebaseUid>` —
  `src/features/safecity/components/ViralUnlockSheet.tsx:16-18`, shared via
  `navigator.share`, WhatsApp, clipboard, **and rendered as a QR code**
  (`ViralUnlockSheet.tsx:37, 204, 214`).
- Landing: `src/app/join/page.tsx:4, 17-20` → `captureReferralParam()`
  (`src/features/safecity/services/referral.service.ts:125-134`).

**What is the secret?** Nothing. The user's own 28-char Firebase UID, deliberately published.

**How guessable?** Not guessable — but **not secret either**, by design.

**Is it obtainable elsewhere? YES, in bulk.** `firestore.rules:1623-1626` —
`match /referrals/{docId} { allow read: if isAuthenticated(); allow create: if isAuthenticated(); }`.
Document IDs are `${referrerUid}_${inviteeUid}` (`referral.service.ts:52`) and the body carries
`referrerUid`, `inviteeUid`, **`inviteeName`** (:59-64). One anonymous `getDocs` yields a
**UID → real-name map for the entire referral graph**.

**What does holding it grant?**
- On its own: `processReferral` (`referral.service.ts:46-86`) bumps
  `users/{referrerUid}.core.referralCount` and `social.partnerCount` from the **client**, and
  `establishSocialConnection` (:92-119) writes a mutual follow into `connections/{uid}` for
  both parties. `allow create: if isAuthenticated()` means anyone can forge referral documents
  for anyone: inflate a stranger's referral count, unlock their viral gate, or force a
  follow relationship. Low severity on its own, but it is unauthenticated write-to-another-
  user's-graph.
- **In combination: this is the calendar bug's supply line.** The calendar feed's only
  credential is the UID. A referral link posted in a WhatsApp group, or the bulk read above,
  hands out UIDs at scale. Fixing `/api/calendar/[userId]` is necessary but not sufficient —
  the same UID also keys `users/{uid}` (readable when `core.discoverable == true`,
  `firestore.rules:307-309`), `presence/{uid}`, `userLocations/{uid}`, `kudos/{uid}/inbox`.
  Audit every other `/{uid}`-keyed surface on the assumption that UIDs are public.

**Rate limiting?** None. **Expiry?** None — the referral link is permanent and un-revocable
(the UID cannot be rotated).

**Verdict: NEEDS-HARDENING — HIGH.**
**Fix:** (1) `referrals`: `allow read: if isAdmin();` and move `create` to an Admin-SDK route
that derives `inviteeUid` from the verified token instead of the request body; (2) replace
`?ref=<uid>` with an opaque per-user referral slug stored server-side (`referral_codes/{slug}
→ {uid}`, `allow read: if false`) so no UID ever leaves the device; (3) treat "a Firebase UID
is public" as a standing assumption in the threat model.

---

## 3. NEEDS-HARDENING — MEDIUM / LOW

### 3.1 Marketing smart links `/r/[id]` and `/api/links/[id]/click`

- `src/app/r/[id]/route.ts:20-32`, `src/app/api/links/[id]/click/route.ts:16-28`,
  shared handler `src/features/admin/services/link-click-handler.ts:145-303`.
- **Secret:** the Firestore auto-ID of `marketing_links/{id}` — 20 chars, Firestore-generated,
  effectively unguessable.
- **Obtainable elsewhere?** No. `firestore.rules:1696-1721` locks the collection to admins,
  the click sub-collection to root-admin. The route uses the Admin SDK deliberately
  (`link-click-handler.ts:163-173`).
- **Grants:** a 302 redirect to a store URL, plus an analytics counter increment
  (:198-203) and a click record with a **salted-hashed** IP (:61-64). No personal data
  is readable. Bots are excluded from counting (:156-157, 198).
- **Rate limiting:** none. Someone who learns a link ID can inflate `clicksCount` and
  `daily_stats` indefinitely — analytics pollution only, no data or money at risk.
- **Expiry:** `isActive:false` disables the redirect with a 410 (:175-196). Revocable. Good.
- **Verdict: OK-BY-DESIGN, with one caveat** — see §4, these IDs get printed on QR codes.
  Optional hardening: bot-independent per-IP throttle on the counter write.

### 3.2 Public photo-release form — unauthenticated write of minors' PII (currently broken)

- Page: `src/app/public/forms/photo-release/page.tsx:117-132`; middleware explicitly bypasses
  all gating for `/public/*` (`src/middleware.ts:83-90, 133-136`).
- Rule: `firestore.rules:2081-2083` — `allow create: if isValidPhotoRelease();` with
  **no `isAuthenticated()`**. The validator is `firestore.rules:2061-2079`.
- **Secret:** none. The form URL is public by design (sent to parents over WhatsApp) — a
  legitimate design, but it means the *write* is world-open.
- **Grants:** creating `photo_release_submissions` documents containing a **minor's full name,
  school, class, parent's full name, and a base64 signature image up to 700 KB**
  (`firestore.rules:2076-2078`). Read is correctly admin-only (:2083), and the PDF route
  `src/app/api/admin/photo-release/[submissionId]/route.ts:25-58` is properly admin-gated
  (Bearer or signed session cookie) — **that route is SAFE.**
- **Rate limiting:** none. An attacker can flood the collection with forged consent forms
  naming real children, or with 700 KB blobs (cost + storage abuse). Because reads are
  admin-only, this is a **data-integrity and cost** problem, not a disclosure one — but a
  forged photo-release consent for a real child is a legal document.
- **BUG — NEEDS VERIFICATION:** `isValidPhotoRelease()` requires
  `request.resource.data.parentId is string` (`firestore.rules:2074`), and the form
  **never sends `parentId`** (the `addDoc` payload at `page.tsx:117-131` has no such field;
  `parentId?` exists only as an optional type at
  `src/features/forms/photo-release/types.ts:24`). A missing key makes that clause evaluate
  false, so **every submission from this form should currently be rejected**. Verify against
  production: if parents cannot submit, this is a live functional outage; if they can, the
  deployed rules differ from the repo. Either way the answer changes the fix.
- **Verdict: NEEDS-HARDENING — MEDIUM.**
  **Fix:** require `isAuthenticated()` (anonymous is fine — it gives you a uid to rate-limit
  and a `signInAnonymously` cost), or route submissions through an API route with App Check +
  a per-IP limit; cap `signatureData` lower; add a per-IP/day submission cap; and resolve the
  `parentId` mismatch in the same change.

### 3.3 `/api/challenge/exercise` — public, minimal

- `src/app/api/challenge/exercise/route.ts:14-39`. No auth, no rate limit.
- **Secret:** an `exercises/{id}` document ID. Not secret — `firestore.rules:602-605` makes
  `exercises` world-readable anyway (`allow read: if true`).
- **Grants:** exercise name + video URL. Nothing personal.
- **Verdict: OK-BY-DESIGN.** Optional: cache headers to blunt scraping cost.

### 3.4 `AGENT_API_KEY` — a static machine credential

- `src/lib/api-auth.ts:9, 18-25, 81-88, 146-150`; used by
  `/api/social/reconcile-group-membership` (route.ts:15-18, 32-33) and others.
- **Secret:** a static shared key presented as `X-Agent-Key`. Compared with
  `timingSafeEqual` after a length check — **correctly implemented**.
- **Obtainable elsewhere?** Not from the repo — it is `process.env.AGENT_API_KEY`, never
  `NEXT_PUBLIC_*`. **NEEDS VERIFICATION:** confirm in the Vercel dashboard that it is a
  server-only env var and that its value is not duplicated into any `NEXT_PUBLIC_` variable,
  and confirm it is not committed in `secrets/` or `.env.local` in git history.
- **Grants:** full admin-equivalent API access with no expiry and no per-caller identity in
  the audit log.
- **Verdict: NEEDS-HARDENING — LOW.** Add a documented rotation date; the rotation note at
  `api-auth.ts:13` exists but no schedule does.

---

## 4. Physically-printed capability URLs — CANNOT be rotated after deployment

Flagging these separately because the fix is different: a code on a sign in a park, or on a
booth screen photographed by a hundred people, is permanent. You cannot "rotate and redeploy"
a laminated poster.

| Printed artefact | The string | Where it comes from | Rotatable? |
|---|---|---|---|
| Booth / kiosk screen QR | `https://outrun.co.il/challenge/LSIT26` | **Hardcoded** at `src/app/booth/display/page.tsx:11` | Only by reprinting/redeploying the booth. The code `LSIT26` is a live `community_groups.inviteCode`. |
| Marketing QR codes (posters, park signage) | `https://outrun.co.il/r/<linkId>` | `src/features/admin/components/QrCodeGenerator.tsx:90-96`, rendered from `/admin/links` (`src/app/admin/links/page.tsx:824`). The route comment at `src/app/r/[id]/route.ts:6-11` says these are "meant to be what's copied into a QR code". | The **target** is rotatable (`marketing_links` fields are editable, `isActive:false` kills it) — good design. The **ID** is not. |
| Legacy printed links | `https://outrun.co.il/api/links/<id>/click` | Kept alive explicitly "for anything already printed or shared" — `src/app/api/links/[id]/click/route.ts:1-8` | No. Permanent. |
| Referral QR | `https://onelink.to/appout?ref=<uid>` | `src/features/safecity/components/ViralUnlockSheet.tsx:16-18, 214` | **No.** A UID can never be rotated. Anyone who photographs a user's referral QR has that user's UID forever. This is the strongest argument for §2.3's opaque-slug fix. |

**Consequence for §1.2's fix:** you cannot simply regenerate every `inviteCode`. Before
rotating, grep for every printed/hardcoded code (`LSIT26` at minimum), and give those groups a
**dual-code** window: keep the old code valid (ideally now scoped to preview-only, no
auto-join) while the new secret code takes over the shareable path. Ideally the printed
artefact should point at a rotatable indirection (`/r/<linkId>` → current invite) rather than
at the invite code itself.

**Also flagged — `public/.well-known/assetlinks.json`:** both SHA-256 fingerprints are
literal placeholders (`PLACEHOLDER_PLAY_APP_SIGNING_SHA256`,
`PLACEHOLDER_UPLOAD_KEY_SHA256`). Android App Links verification will fail, so `/join/*` and
`/session/*` will open in a browser rather than the app. Not a security hole by itself, but a
failed verification means a **different** app could claim the domain intent filter on some
devices. **NEEDS VERIFICATION:** confirm the deployed `assetlinks.json` at
`https://outrun.co.il/.well-known/assetlinks.json` contains the real Play App Signing
fingerprint before launch.

---

## 5. Deep links / universal links

- `ios/App/App/App.entitlements` — `applinks:outrun.co.il`.
- `public/.well-known/apple-app-site-association` — claimed paths:
  `/join/*`, `/session/*`, `/school/*`, `/community`, `/gateway`.
- `capacitor.config.ts:12-17` — the app is a hosted WebView on `https://outrun.co.il` with
  `allowNavigation` limited to `outrun.co.il` and subdomains. No custom URL scheme is
  registered, so there is **no `outrun://` scheme-hijack surface**. Good.
- **None of the claimed paths open a privileged screen directly.** `/join/*` and `/session/*`
  both land on pages that stash the code and route through the gateway
  (`src/app/join/page.tsx:17-20`, `src/app/session/[token]/page.tsx:27-41`) — the capability
  lives in the code, not in the deep link, and is covered by §1.2 / §2.2.
- `/school/*` is claimed in the AASA file but **no such route exists** under `src/app`. Dead
  claim — remove it, or a future `/school/*` route inherits an unreviewed deep-link entry.
- `capacitor.config.ts:28` sets `webContentsDebuggingEnabled: true` for iOS **in release
  builds**. The comment says "TestFlight-only right now, revisit before any public App Store
  release." With 4,000 real users about to arrive, **that time is now** — a debuggable WebView
  lets anyone with the device and a Mac read the signed-in user's tokens. Not a capability URL,
  but it is in scope for the launch gate.

---

## 6. Surfaces checked and found SAFE — do not re-audit

| Surface | Why it is safe | Evidence |
|---|---|---|
| `/api/admin/photo-release/[submissionId]` | Admin-gated via Bearer ID token **or** signed HMAC session cookie before any read | `route.ts:25-58` |
| `/api/auth/session` | Only mints a cookie from a **verified** Firebase ID token; `admin` flag comes from `resolveIdentity`, not the request | `route.ts:42-79` |
| Admin session cookie | HMAC-signed JWT, 1 h TTL, HttpOnly + Secure + SameSite=Lax; production **refuses to start** without a ≥32-char `SESSION_COOKIE_SECRET` | `src/lib/admin-session.ts:29, 45-58`; `src/app/api/auth/session/route.ts:29-40` |
| `/api/integrations/universal-gis-proxy` | Admin-only **and** https-only host allowlist that rejects IP literals — SSRF to `169.254.169.254` is blocked | `route.ts:15-50` |
| All `/api/admin/*` routes | Every one gated by `requireSection` / `requireSuperAdminApi` / `requireAdminApi` / `requireRouteEditAccess` before any work. Verified across all 33 routes. | e.g. `city-mapping/register-city/route.ts:23-24`, `master-evolution-sync/route.ts:15-16`, `re-seed-authorities/route.ts:11-12`, `routes/dem-recompute/route.ts:27-28` |
| `/api/challenge/submit` | Requires a verified ID token; `value` bounded 1-3600 | `route.ts:26-49` |
| `/api/social/sync-user-memberships` | Requires a verified ID token; can only write the caller's own doc | `route.ts:26-51` |
| `/api/social/reconcile-group-membership` | `requireAdminApi` (agent key or admin) | `route.ts:32-33` |
| `/api/join/session-token` token→group binding | Client-supplied `groupId` is verified against the token's own `groupId`; expiry and `maxUses` both enforced server-side | `src/lib/joinEngine.ts:134-152` |
| `access_codes` / `schools` collections | Reads locked to `isAdmin()`; both were previously leaky and have been fixed | `firestore.rules:1762-1770, 1778-1781` |
| `push_messages` (the paid-push trigger) | `allow read, write: if isAdmin()` — no user can queue a broadcast; `sendPushFromQueue` additionally refuses a message with no `authorityId` | `firestore.rules:1650-1652`; `functions/src/sendPushFromQueue.ts:124-137` |
| `marketing_links` + `clicks` + `daily_stats` | Admin/root-admin only; anonymous clicks reach it solely through the Admin SDK route | `firestore.rules:1696-1721` |
| `legal_hold` | `allow read, write: if false` for everyone including the data subject; Admin-SDK only | `firestore.rules:2103-2109` |
| `users/{uid}` self-promotion | `noAdminFieldsChanged()` + create-time guards block a client from writing `role` / `isSuperAdmin` / `isApproved` / tenant fields | `firestore.rules:135-152, 371-403` |
| Custom URL schemes | None registered — Capacitor runs as a hosted WebView with a domain allowlist | `capacitor.config.ts:12-17` |
| Email delivery | No mailer in `functions/src` at all; the only email path is Firebase's own `sendSignInLinkToEmail`, whose `continueUrl` is always constructed from `window.location.origin`, never from user input | `src/lib/auth.service.ts:882-889`; `src/app/authority-portal/login/page.tsx:120-125` |
| `webcal://` construction | Builds only `/api/calendar/${userId}` — no second, separate calendar capability URL exists | `src/features/home/components/SmartWeeklySchedule.tsx:1547-1555` |

---

## 7. Fix order

1. **`firestore.rules:1033`** → `allow read: if isAdmin();` on `admin_invitations`, then rotate
   every outstanding invitation. *One line. Do it today.* (§1.1)
2. **`src/app/api/social/group-membership/route.ts:57-70`** → stop accepting an arbitrary
   `groupId` for `action:'join'`. (§1.3)
3. **Move `inviteCode` out of the public `community_groups` document** into a server-only
   lookup collection; plan the printed-code migration in §4 *before* rotating. (§1.2)
4. **`firestore.rules:1636`** → `allow read: if false;` on `group_invitations`; delete the
   `Math.random()` token generator at `group-invitation.service.ts:55-62`. (§2.2)
5. **`firestore.rules:1624-1625`** → lock `referrals` reads to admin, move `create` server-side,
   and replace `?ref=<uid>` with an opaque slug. (§2.3)
6. Replace every `Math.random()`-based credential generator with `crypto.randomInt` /
   `crypto.randomBytes`, and lengthen codes to ≥8-10 chars:
   `src/features/arena/services/group.service.ts:104-106`,
   `src/features/admin/services/community.service.ts:593-595`,
   `src/features/admin/services/access-code-admin.service.ts:35-42`,
   `src/features/arena/services/group-invitation.service.ts:55-62`.
7. Add rate limiting to `/api/join/confirm`, `/api/challenge/join`, `/api/join/session-token`,
   and `validateAccessCode`; fix the 15-vs-60 comment/constant mismatch at
   `src/app/api/join/preview/route.ts:11 vs :29`. (§1.2, §2.1)
8. Photo-release form: add auth + a rate limit, and resolve the `parentId` rule/form mismatch.
   (§3.2)
9. Launch hygiene: real fingerprints in `assetlinks.json`; drop `/school/*` from the AASA file;
   set `webContentsDebuggingEnabled: false`. (§4, §5)

## 8. Open items requiring non-code verification

- Is App Check **enforced** (not "monitoring") for Cloud Functions and Firestore? (§2.1)
- Is there any infrastructure-layer rate limit (Cloud Armor, Firebase quota) in front of
  `validateAccessCode` and the Next.js API routes? (§2.1, §1.2)
- Is `AGENT_API_KEY` server-only in Vercel, and absent from git history / `secrets/`? (§3.4)
- Does the **deployed** `firestore.rules` match this repo? Specifically the `parentId` clause at
  `firestore.rules:2074` versus a photo-release form that never sends it. (§3.2)
- Does the deployed `assetlinks.json` carry the real Play App Signing fingerprint? (§4)
- Where else, physically, is `LSIT26` printed? (§4)
