# Audit 01 — Firestore & Storage Security Rules (Data Leakage)

**Date:** 2026-09-07
**Scope:** `firestore.rules` (1,960 lines, read in full), `storage.rules` (202 lines, read in full),
`firestore.indexes.json` (header/structure only), plus targeted reads of `src/` and `functions/src/`
to confirm exploitability.
**Focus:** cross-user / cross-tenant data leakage before replacing a live app with ~4,000 real users
(municipality residents included).
**Method:** every finding below cites a line I actually read. Where I could not prove exploitability
from the code, the finding is marked **NEEDS VERIFICATION** with the exact check required.

---

## 0. Executive summary

The rules file is unusually well-documented and several past audits are visible in it (the
tenant-field lockdown, the feed-post authorship fix, the `access_codes` / `schools` lockdowns, the
`military_declarations` split). Privilege escalation on `users/{uid}` is genuinely well defended.

**However, the read side is wide open in a systematic way.** The recurring pattern
`allow read: if isAuthenticated();` — added to make leaderboard / map / inbox queries work — is
applied at collection scope with no tenant, authority or ownership predicate. Because Firestore
rules are not filters, every one of these grants permits an **unfiltered `getDocs(collection(...))`
dump of the entire collection** by any account that can sign up.

Three findings are launch-blocking:

1. **`dailyActivity` (line 393)** — every user's daily health metrics (steps, calories, floors,
   distance) for every day, dumpable by any signed-in account. Sensitive health information under
   the Israeli Privacy Protection Law.
2. **`connections` (lines 1163–1169)** — any signed-in user can rewrite **any other user's**
   `followers` array, which is the exact trust anchor the `presence` "squad" read rule consumes.
   This converts into live GPS tracking of arbitrary users, minors included.
3. **`chats` (lines 1455–1457 + 1516–1519)** — any signed-in user can enumerate every group chat
   (roster of real names included) and then add themselves to any of them and read the full
   message history. This bypasses the entire `community_groups` military/institutional roster
   lockdown built at lines 1244 and 1295.

Rules unit tests exist and are good, but they test the paths that were already fixed — none of the
three findings above is covered.

---

## 1. Findings table

| # | Severity | Path | File:line | Issue |
|---|---|---|---|---|
| F-01 | **CRITICAL** | `dailyActivity/{docId}` | `firestore.rules:393` | `allow read: if isAuthenticated()` → full health-data dump of all users |
| F-02 | **CRITICAL** | `connections/{userId}` | `firestore.rules:1163–1169` | Any user can write any user's `followers` → escalates to live-GPS read via `presence` squad rule |
| F-03 | **CRITICAL** | `chats/{chatId}` | `firestore.rules:1455–1457`, `1516–1519` | Any user can enumerate + self-join any group chat and read all history |
| F-04 | **HIGH** | `leaderboard_shards`, `leaderboard_snapshots` | `firestore.rules:1731`, `1740` | `isAuthenticated()` read on tenant-keyed docs → cross-tenant uid→unit/tenant mapping |
| F-05 | **HIGH** | `admin_invitations/{docId}` | `firestore.rules:1005` | Any signed-in user can list all admin invitations: emails, roles, authorityIds, 64-char tokens |
| F-06 | **HIGH** | `users/{userId}` | `firestore.rules:276–280` | Whole-document read grant on `core.discoverable == true` — no field projection, no authority scoping |
| F-07 | **HIGH** | `sessions/{docId}` | `firestore.rules:1666` | `isAuthenticated()` read → every user's park/run check-ins (userId + location + time) |
| F-08 | **HIGH** | multi-tenancy (design) | `firestore.rules:82–86` + codebase | `hasTenant()` depends on a custom claim that is **never set anywhere in the repo** — tenant isolation is vacuous |
| F-09 | **MEDIUM** | `streaks/{docId}` | `firestore.rules:467` | `isAuthenticated()` read of all users' streak docs |
| F-10 | **MEDIUM** | `presence` squad branch | `firestore.rules:1094–1099` | Depends on client-writable `connections` (see F-02) |
| F-11 | **MEDIUM** | `planned_sessions`, `community_events/*/registrations`, `community_groups/*/attendance` | `firestore.rules:1418`, `1400`, `1346` | `isAuthenticated()` reads expose who is going where, when |
| F-12 | **MEDIUM** | `group_invitations/{token}` | `firestore.rules:1568` | Token collection is listable — "unguessable id is the security layer" is false when the ids are enumerable |
| F-13 | **MEDIUM** | `feed_posts/*/reactions` | `firestore.rules:1236–1237` | `allow write: if isAuthenticated()` — any user can forge/delete anyone's reactions |
| F-14 | **MEDIUM** | Storage `/communities/**` | `storage.rules:148–154` | Any authenticated user can overwrite any community image (no owner/path scoping) |
| F-15 | **MEDIUM** | `photo_release_submissions` | `firestore.rules:1924–1925` | Unauthenticated create, 700 KB per doc — write-bomb / cost vector holding minors' PII |
| F-16 | **MEDIUM** | `/api/challenge/leaderboard` | `src/app/api/challenge/leaderboard/route.ts:1–80` | Unauthenticated API returns uid + name + ageGroup + gender; bypasses rules via Admin SDK |
| F-17 | **LOW** | Storage `/contribution-photos/{uid}/**` | `storage.rules:175–178` | `allow read: if true` on un-moderated user uploads |
| F-18 | **LOW** | `sharedWorkouts/{docId}` | `firestore.rules:523` | `allow read: if true` — verified low-risk, but see note |
| F-19 | **LOW** | `analytics_events`, `referrals`, `kudos` | `firestore.rules:534`, `1556–1557`, `1430` | Create with no `uid == request.auth.uid` binding — forgeable rows |
| F-20 | **LOW / doc bug** | `users/{uid}/notification_clicks` | `firestore.rules:345–348` | Comment claims this rule authorizes the collectionGroup query; it does not (works only via the admin catch-all) |
| F-21 | **LOW** | `reports/{reportId}` | `firestore.rules:1546–1549` | Reads top-level `.data.role`, but the app stores roles under `core.role` — the non-root branch is likely dead |

---

## 2. Complete access map (every `match` block in `firestore.rules`)

Legend: **O** = owner-only, **A** = admin-only, **AUTH** = any signed-in user, **PUB** = world
(unauthenticated), **CF** = server-only in practice (Admin SDK bypasses rules).

### 2.1 User-owned / PII

| Path | Line | Read | Write | Ownership enforced? |
|---|---|---|---|---|
| `users/{userId}` | 276 | O + A + **AUTH if `core.discoverable == true`** (whole doc) | O (5 protected-field guards) + A | Yes for write; read is document-scope, not field-scope — **F-06** |
| `users/{uid}/notification_clicks/{id}` | 345 | A | O create only | Yes |
| `users/{uid}/{sub}/{**}` | 363 | O + A | O + A | Yes (recursive; correctly excludes the parent doc) |
| `dailyActivity/{docId}` | 386 | **AUTH (all users)** | O (docId-prefix or `userId` field) + passive-field lock | Write yes, **read NO — F-01** |
| `dailyProgress/{docId}` | 443 | O + A | O + A | Yes |
| `streaks/{docId}` | 466 | **AUTH** | O + A | Write yes, read no — **F-09** |
| `healthSamples/{uid}/{date}/{id}` | 484 | O + A | A/CF only | Yes |
| `userSchedule/{docId}` | 501 | O (docId prefix) + A | same | Yes |
| `workouts/{docId}` | 512 | O (`userId` field) + A | O + A | Yes |
| `userLocations/{userId}` | 1121 | O | O | Yes |
| `user_memberships/{uid}` | 1137 | O + A | A/CF only | Yes |
| `userAge/{uid}` | 1155 | O + A | A/CF only | Yes |
| `military_declarations/{uid}` | 1823 | O + A | O + A, shape-validated | Yes |
| `pe_grades/{docId}` | 1708 | O (docId prefix) + A | A | Yes |
| `legal_hold/{uid}` + `**` | 1946 | `false` (+ admin catch-all) | `false` | Yes |
| `presence/{userId}` | 1070 | O; AUTH if `mode=='verified_global'`; followers if `squad`; shared-group if `group` | O + audienceGroupIds subset + minor mode restriction | Yes for write; **squad branch trusts client-writable data — F-10 / F-02** |

### 2.2 Social graph & communication

| Path | Line | Read | Write | Ownership enforced? |
|---|---|---|---|---|
| `connections/{userId}` | 1163 | **AUTH** | O — **plus an `allow update: if isAuthenticated()` that covers every field in the doc** | **NO — F-02** |
| `blocks/{blockId}` | 1190 | either side of edge | blocker only | Yes |
| `feed_posts/{docId}` | 1201 | AUTH by `audience`; author for private; **AUTH for legacy docs missing `audience`** | author only, `authorUid` locked | Mostly yes; legacy-doc branch is an unbounded read grant on any doc lacking the field |
| `feed_posts/*/reactions/{id}` | 1235 | AUTH | **AUTH (any user, any doc)** | **NO — F-13** |
| `chats/{chatId}` | 1451 | participants; **AUTH for `type=='group'`**; AUTH when `resource == null` | participants; **AUTH self-join on any group chat** | **NO — F-03** |
| `chats/*/messages/{id}` | 1521 | participants (via `get()` on parent) | sender must be participant | Yes — but participancy is self-grantable, see F-03 |
| `kudos/{uid}/inbox/{id}` | 1428 | O | create: AUTH (any sender) | Read yes |
| `activity/{scopeId}/feed/{id}` | 1439 | O, or any `city_*` scope to any AUTH user | A; AUTH create into own or `city_*` scope | Partial — city feeds are cross-user by design |
| `planned_sessions/{id}` | 1417 | **AUTH** | O (`userId`) | Write yes, read no — **F-11** |

### 2.3 Community / tenancy

| Path | Line | Read | Write | Ownership enforced? |
|---|---|---|---|---|
| `community_groups/{docId}` | 1244 | AUTH, **except military group → members+admin only** | A; creator-scoped create/update with `isLocked` lock; AUTH may patch counters | Yes |
| `community_groups/*/members/{uid}` | 1295 | same military gate | self / group-admin / group-owner ranked | Yes (well built) |
| `community_groups/*/attendance/{sid}` | 1345 | **AUTH** | AUTH for RSVP fields; group-admin for phase fields | Field split yes, read no — **F-11** |
| `community_groups/*/attendance/*/member_statuses/{uid}` | 1366 | AUTH | O | Read no |
| `community_groups/*/challenge_submissions/{uid}` | *(none)* | admin catch-all only | admin catch-all only | Default-deny for clients — **correct** (Admin SDK API routes only) |
| `community_events/{docId}` | 1373 | AUTH | A; AUTH counter-only update; AUTH shape-locked create | Yes |
| `community_events/*/registrations/{uid}` | 1399 | **AUTH** | O | Read no — **F-11** |
| `tenants/{tenantId}` + `/units/{unitId}` | 1748 | `hasTenant()` custom claim | A | Claim never set — **F-08** |
| `readiness_configs/{unitId}` | 1720 | `hasTenant(resource.data.tenantId)` | A | Same — **F-08** |
| `leaderboard_shards/{shardId}` | 1730 | **AUTH** | A/CF | **NO — F-04** |
| `leaderboard_snapshots/{id}` | 1739 | **AUTH** | A/CF | **NO — F-04** |
| `unitDirectory/{id}` | 1777 | **PUB** (documented deliberate choice) | A | N/A — contains no people data (verified in comment + rule) |
| `unit_league_aggregates/{id}` | 1790 | **PUB** (deliberate) | A | N/A — counts only |
| `access_codes/{codeId}` | 1699 | A | A | Yes (previously leaked, now fixed) |
| `schools/{docId}` | 1680 | `false` + admin catch-all | A | Yes (previously `if true`, now fixed) |
| `admin_invitations/{docId}` | 1001 | **AUTH** | A | **NO — F-05** |
| `authorities/{docId}` | 968 | **PUB** | A; AUTH may bump `pressureCount` only | Field-scoped, acceptable |
| `authorities/*/pressure_logs/{id}` | 976 | A | AUTH create | Yes |

### 2.4 Admin-only (verified correctly locked)

`route_decisions` (958), `edit_requests` (1014), `audit_logs` (1033, create/update/delete hard-`false`),
`maintenance_reports` (1038), `manager_notifications` (1578), `push_messages` (1582),
`account_metrics` (1594), `content_items` (1606), `marketing_links` (1628) + `/clicks` (root-admin only, 1635),
`product_roadmap` (1643), `product_tags` (1647), `user_feedback` (1651, AUTH create / admin read),
`analytics_events` (532, AUTH create / admin read), `push_events` (548, AUTH create with a strict
field allowlist — this one is a model of how the rest should be written),
`active_workouts` (1047), `photo_release_submissions` reads (1924).

### 2.5 World-readable content (`allow read: if true`) — reviewed, benign

Lines 566, 574, 579, 584, 589, 594, 599, 604, 613, 618, 623, 631, 636, 644, 671, 679, 687–723,
729–760, 767, 772, 842, 861, 877, 901, 936, 969, 986, 994, 1010, 1777, 1791, 1844, 1849, 1854, 1885.

These are exercise/program/level/persona/gear/park/route/config/branding catalogs plus feature flags.
All are admin-write. I checked the two that looked like they might hold user data:

- `onboarding_answers` (636) — **verified benign**: it is the admin decision-tree answer catalog
  (`src/features/admin/services/questionnaire.service.ts:24`,
  `src/app/admin/running/import/decision-tree/page.tsx:29`), not per-user questionnaire responses.
  The name is dangerously misleading; rename it before someone stores real answers there.
- `sharedWorkouts` (523) — **F-18**: public read is intentional (deep-link previews,
  `src/app/workouts/[id]/shared-workout-loader.ts:51` fetches it over the REST API with a
  `mask.fieldPaths` projection). The doc is created by `share.service.ts:221`; the rule places no
  limit on what fields a client writes, so a future change that adds a `creatorName`/`creatorUid`
  to the payload silently becomes world-readable. Add a field allowlist on create.

### 2.6 Catch-all

```
firestore.rules:1956
    match /{document=**} {
      allow read, write: if isRootAdmin() || isAdmin();
    }
```

This is **not** over-permissive — it is admin-gated, and it is what makes collections with no
explicit rule (see §4) admin-reachable while staying denied to clients. Two notes: (a) it is also
what actually authorizes the `notification_clicks` collectionGroup query (F-20); (b) `isAdmin()`
performs a `get()` on `users/{uid}` on **every** denied request that reaches it, which is a real
cost/latency item at 4,000 users but not a security one.

---

## 3. Detailed findings

### F-01 — CRITICAL — Every user's health data is readable by every signed-in user

**File:** `firestore.rules:393` (inside `match /dailyActivity/{docId}`, line 386)

```
      // Leaderboard queries (steps mode: WHERE authorityId == scopeId, orderBy steps)
      // must read across multiple users' dailyActivity docs. The owner-only rules
      // below still apply for all other client reads; this line only widens the
      // read gate — writes remain strictly owner-scoped and passive-field-protected.
      allow read: if isAuthenticated();
```

The comment's premise is wrong. Firestore ORs all matching `allow` rules, and a rule is not a
filter: once `allow read: if isAuthenticated()` matches, the owner-scoped rules at lines 396–402
are irrelevant for reads, and **no `where` clause is required of the caller**.

Document shape (`src/features/activity/types/activity.types.ts:125–155`): `userId`, `date`,
`steps`, `stepsGoal`, `floors`, `calories`, `distanceMeters`, `categories`, plus the
HealthKit/Health Connect passive counters. Doc id is `{uid}_{YYYY-MM-DD}`.

**Attack.** Any account created through normal sign-up runs:

```js
const snap = await getDocs(collection(db, 'dailyActivity'));   // no where(), no limit
// → every document in the collection: ~4,000 users × 365 days of health metrics,
//   each keyed by uid so it joins directly to users/{uid}.
```

Under Israeli Privacy Protection Law this is sensitive information (`מידע רגיש`), and for a
municipality deployment it is per-resident. It is also a per-minor exposure, since minors are in
the same collection with no age partition.

**Fix.** Delete line 393 and serve leaderboards from the aggregate collections that already exist,
or, if the client must query live, require the query to be scoped and make the scope provable:

```
    match /dailyActivity/{docId} {
      allow read, write: if isRootAdmin() || isAdmin();

      // Owner reads (single doc + own collection query)
      allow read: if isAuthenticated() && (
        (resource != null && resource.data.userId == request.auth.uid) ||
        (docId.size() > request.auth.uid.size() &&
         docId[0:request.auth.uid.size()] == request.auth.uid &&
         docId[request.auth.uid.size():request.auth.uid.size()+1] == '_')
      );

      // Leaderboard: same-authority only, and only the ranking fields.
      // Requires the reader's authorityId on the token (see F-08) — until custom
      // claims ship, serve the leaderboard from leaderboard_snapshots instead
      // and grant NO cross-user read here at all.
      allow read: if isAuthenticated()
                  && resource.data.authorityId == request.auth.token.authorityId;
      ...
    }
```

The correct near-term move is the second half of that comment: **remove the cross-user read and
render leaderboards from `leaderboard_snapshots`**, which is what the Cloud Function already
produces (`functions/src/leaderboard.ts:180–215`).

---

### F-02 — CRITICAL — Any user can rewrite any other user's social graph, and that unlocks live GPS

**File:** `firestore.rules:1163–1169`

```
    match /connections/{userId} {
      allow read: if isAuthenticated();
      allow write: if isOwner(userId);
      allow update: if isAuthenticated() &&
        request.resource.data.diff(resource.data).affectedKeys()
          .hasOnly(['followers', 'following', 'followerCount', 'followingCount', 'updatedAt']);
    }
```

The third rule has **no owner predicate at all**. The `hasOnly([...])` allowlist enumerates every
field the document has, so it constrains nothing. `userId` here is the document being edited, not
the requester.

Now chain it to `firestore.rules:1094–1099`:

```
      // Friends: reader must be in broadcaster's followers list
      allow read: if isAuthenticated()
                  && resource.data.mode == 'squad'
                  && request.auth.uid in
                     get(/databases/$(database)/documents/connections/$(userId)).data.followers;
```

`presence/{uid}` holds real name, `lat`, `lng`, `photoURL`, `ageGroup`, `schoolName`,
`authorityId` and current activity (`src/features/safecity/services/presence.service.ts:174–212`).
Minors' coordinates are fuzzed (`shouldFuzz`), adults' are not.

**Attack.** Attacker `E` picks any victim `V` (uids are enumerable from `users` where
`core.discoverable == true`, from `feed_posts.authorUid`, from `presence` in `verified_global`
mode, or from `leaderboard_shards`):

```js
// 1. Insert self into the victim's followers list — permitted by line 1166.
await updateDoc(doc(db, 'connections', V), {
  followers: arrayUnion(E),
  updatedAt: serverTimestamp(),
});
// 2. Read the victim's squad-mode presence — line 1094 now evaluates true.
onSnapshot(doc(db, 'presence', V), s => console.log(s.data().lat, s.data().lng));
```

Result: continuous location tracking of an arbitrary resident, with their real name attached. The
same rule also permits mass vandalism — wiping every user's `following`/`followers` in a loop.

**Fix.** The counter-update path exists so that *the other side* of a follow can be updated. Bind
it to the acting user instead of leaving it open:

```
    match /connections/{userId} {
      allow read: if isAuthenticated() && (
        isOwner(userId) || request.auth.uid in resource.data.get('followers', [])
      );
      allow write: if isOwner(userId);

      // Someone else may ONLY add/remove THEMSELVES from this user's edges.
      allow update: if isAuthenticated()
        && request.resource.data.diff(resource.data).affectedKeys()
             .hasOnly(['followers', 'followerCount', 'updatedAt'])
        && request.resource.data.followers.toSet()
             .difference(resource.data.get('followers', []).toSet())
             .hasOnly([request.auth.uid])
        && resource.data.get('followers', []).toSet()
             .difference(request.resource.data.followers.toSet())
             .hasOnly([request.auth.uid]);
    }
```

Better still, route follow/unfollow through an Admin-SDK API route (the pattern already used for
`social.groupIds` via `/api/social/group-membership`) and set `connections` to owner-read/
server-write. The presence `squad` branch is only as trustworthy as this collection.

---

### F-03 — CRITICAL — Any user can enumerate and join any group chat, then read all its history

**File:** `firestore.rules:1455–1457` and `firestore.rules:1516–1519`

```
1455      // Any authenticated user can read a group-type chat
1456      // (needed to check existence before joining and for inbox listing)
1457      allow read: if isAuthenticated()
1458                  && resource.data.type == 'group';
...
1515      // Group chat JOIN: any authenticated user can add themselves to a group chat.
1516      // After arrayUnion(uid), request.resource.data.participants will contain uid.
1517      allow update: if isAuthenticated()
1518                    && resource.data.type == 'group'
1519                    && request.auth.uid in request.resource.data.participants;
```

Two separate problems compound:

**(a) The group-chat doc is world-readable to any signed-in user, and it carries the roster.**
`createGroupChat` (`src/features/social/services/chat.service.ts:221–232`) writes
`participants`, **`participantNames` (uid → real name)**, `groupName`, `groupId`, `lastMessage`,
`lastSenderId`. Line 1457 supports the query `where('type','==','group')`, so the whole set is
listable. This directly defeats the military/institutional roster protection that lines 1244 and
1295 were written to provide: the same names are mirrored into `chats/group_{groupId}.participantNames`
with no such gate. Chat ids are deterministic — `makeGroupChatId` returns `group_${groupId}`
(`chat.service.ts:204–206`) — so a specific group's chat can be addressed directly from a
`community_groups` id.

**(b) Self-join grants message history.** Line 1517 has no membership, invite, or `isLocked`
check, and no `affectedKeys()` restriction — so the attacker may also rewrite `groupName`,
`lastMessage`, or drop other participants in the same write. Once in `participants`, the
`messages` sub-rule at 1523–1526 authorizes reading **every message ever sent in that thread**,
because it resolves participancy with a live `get()` on the parent.

**Attack.**

```js
// 1. Enumerate every group thread in the app — names, rosters, last message.
const groups = await getDocs(query(collection(db,'chats'), where('type','==','group')));

// 2. Join the interesting one (e.g. the reservist or municipality group).
await updateDoc(doc(db,'chats', chatId), { participants: arrayUnion(myUid) });

// 3. Read the entire history.
const msgs = await getDocs(collection(db,'chats',chatId,'messages'));
```

**Fix.** Gate both on real membership of the backing community group, and constrain the join write:

```
      // Read a group thread only if you are a member of the backing group.
      allow read: if isAuthenticated()
                  && resource.data.type == 'group'
                  && exists(/databases/$(database)/documents/community_groups/
                            $(resource.data.groupId)/members/$(request.auth.uid));

      // Join: only yourself, only the participant fields, only if already a group member.
      allow update: if isAuthenticated()
                    && resource.data.type == 'group'
                    && exists(/databases/$(database)/documents/community_groups/
                              $(resource.data.groupId)/members/$(request.auth.uid))
                    && request.resource.data.diff(resource.data).affectedKeys()
                         .hasOnly(['participants', 'participantNames'])
                    && request.resource.data.participants.toSet()
                         .difference(resource.data.participants.toSet())
                         .hasOnly([request.auth.uid]);
```

Note the existence-probe rule at line 1470 (`allow read: if isAuthenticated() && resource == null`)
is fine and should stay — it returns no fields.

---

### F-04 — HIGH — Cross-tenant leaderboard reads map uids to tenants and military units

**File:** `firestore.rules:1731` and `firestore.rules:1740`

```
1730    match /leaderboard_shards/{shardId} {
1731      allow read: if isAuthenticated();
1732      allow write: if isRootAdmin() || isAdmin();
...
1739    match /leaderboard_snapshots/{snapshotId} {
1740      allow read: if isAuthenticated();
```

Both comments say "tenant-scoped". Neither rule contains a tenant predicate.

Shard documents carry `{ tenantId, unitId, period, uid, shard, xp, posts }` and the doc id is
`{tenantId}_{unitId}_{period}_{uid}_{shard}` (`functions/src/leaderboard.ts:64–77`). A single
unfiltered read of the collection therefore yields **a complete uid → tenantId/unitId mapping for
every user in the system**.

**Attack.** A user belonging to city A dumps `leaderboard_shards`, joins it against `users` (F-06)
for names, and obtains the membership roster of city B, of every school/company tenant, and — in
the military vertical — of every unit. This is precisely the exposure that the
`military_declarations` split (lines 1804–1830) and the `isMilitaryGroup` roster gate (line 1251)
were built to prevent; the shard collection leaks the **verified** affiliation, which is strictly
more sensitive than the self-declared one those rules protect.

**Fix.** Scope reads to the caller's own bucket. Since custom claims are not yet issued (F-08),
the reliable near-term form uses the caller's own user doc:

```
    match /leaderboard_snapshots/{snapshotId} {
      allow read: if isAuthenticated()
                  && resource.data.tenantId ==
                     getUserDoc().get('core', {}).get('tenantId', '_global');
      allow write: if isRootAdmin() || isAdmin();
    }

    // Raw shards are an internal aggregation artifact — no client needs them.
    match /leaderboard_shards/{shardId} {
      allow read, write: if isRootAdmin() || isAdmin();
    }
```

---

### F-05 — HIGH — Admin invitations (emails, roles, authorityIds, tokens) are listable by any user

**File:** `firestore.rules:1001–1007`

```
1001    match /admin_invitations/{docId} {
1002      // Authenticated users can read invitations (needed for token validation
1003      // during the sign-up flow, before the user has the 'admin' role).
1004      // Tokens are 64-char random hex — knowledge of the token IS authorization.
1005      allow read: if isAuthenticated();
1006      allow write: if isAdmin();
1007    }
```

The comment's security model ("knowledge of the token IS authorization") is defeated by the rule
itself: an unfiltered `getDocs(collection(db,'admin_invitations'))` returns **all** tokens, plus
`email`, `role` (`super_admin` / `tenant_owner` / `vertical_admin` / `authority_manager` /
`unit_admin` / `platform_member`), `authorityId`, `tenantId`, `unitId`, `allowedSections`
(`src/features/admin/services/invitation.service.ts:164–190`).

**I verified the escalation does not currently complete.** `applyInvitationToUser`
(`invitation.service.ts:293–403`) writes `role: 'admin'` and `core.isSuperAdmin` from the
**client** SDK; both the create path (`firestore.rules:283–295`) and the update path
(`noAdminFieldsChanged`, lines 105–122) reject it. So a stolen token does not currently mint an
admin. Two consequences, both of which need action:

1. The leak is still a **HIGH** information disclosure: full staff roster with emails, the
   municipality each manager is bound to, and live invitation tokens. It is also a targeted
   phishing kit.
2. **NEEDS VERIFICATION:** the admin-invitation acceptance flow appears to be broken in
   production for exactly the same reason. Check whether real admins are onboarded through
   `/admin/authority-login?token=…` today, or through the Firebase console / an Admin-SDK route I
   did not find. If the client path is live, it is failing silently with `permission-denied`.

**Fix.** Never let the client list the collection. Validate by token id, or move validation
server-side:

```
    match /admin_invitations/{docId} {
      // Read only the exact invitation whose token you already hold, and only
      // when it is still open. Requires docId == token (see generateToken).
      allow get:  if isAuthenticated()
                  && resource.data.isUsed == false
                  && resource.data.expiresAt > request.time;
      allow list: if isAdmin();
      allow write: if isAdmin();
    }
```

Best: expose `POST /api/admin/invitations/validate` (Admin SDK) and set this collection to
`allow read, write: if isAdmin();`.

---

### F-06 — HIGH — `users` read grant is whole-document and un-scoped

**File:** `firestore.rules:276–280`

```
276    match /users/{userId} {
277      // READ — owner, admins, or any auth user when the profile opted into discovery.
278      allow read: if isOwner(userId)
279                  || isRootAdmin() || isAdmin()
280                  || (isAuthenticated() && resource.data.core.discoverable == true);
```

Two mitigations are real and worth crediting: `discoverable` is opt-in and defaults to false
(`src/features/user/core/types/user.types.ts:341–350`), and the team already recognised this
grant's shape — it is the stated reason `military_declarations` was split into its own document
(comment at lines 1804–1817). But the grant is still **document-scope**, so for every user who
flips the Privacy toggle on, a signed-in stranger receives:

- `core.email`, `core.name`, `core.photoURL`, `core.gender`, `core.weight`, `core.birthDate`
- `core.anchorLat` / `core.anchorLng` — the user's saved home-neighborhood coordinates
- `core.authorityId`, `core.neighborhoodId`, `core.tenantId`, `core.unitId`, `core.unitPath`
- `healthDeclarationAccepted` and **`healthDeclarationPdfUrl`**
  (`src/features/user/onboarding/services/onboarding-sync.service.ts:733–746`)

The PDF URL matters: `HealthDeclarationStep.tsx:257–274` uploads to
`health-declarations/{uid}/…pdf` and stores `getDownloadURL()` on the user doc. A Firebase
download URL embeds an access token and **is honoured independently of Storage rules**. So the
careful owner-only rule at `storage.rules:188–191` is bypassed for any discoverable user: read the
user doc, follow the URL, get the signed health declaration PDF. That chain is CRITICAL in effect;
I am rating the rule HIGH and calling the chain out explicitly here.

Also note there is **no authority/tenant scoping** in this rule. `searchUsersByName`
(`src/features/social/services/user-search.service.ts:44–56`) adds `where('core.authorityId','==',…)`
only when the caller passes one — that is client-side courtesy, not enforcement. A city-A user can
query `where('core.discoverable','==',true)` with no authority filter and page through every
discoverable profile in every municipality.

**Fix.** (a) Move the public profile projection into a separate `public_profiles/{uid}` document
written by the Admin SDK (name, photo, fitness tier, authorityId — nothing else) and revoke the
cross-user grant on `users` entirely. (b) In the interim, at minimum stop storing the download URL:
keep the storage path on the user doc and mint short-lived signed URLs server-side. (c) If (a) is
too large before launch, scope the grant:

```
      allow read: if isOwner(userId) || isRootAdmin() || isAdmin()
                  || (isAuthenticated()
                      && resource.data.core.discoverable == true
                      && resource.data.core.get('authorityId', '') ==
                         getUserDoc().get('core', {}).get('authorityId', ''));
```

(c) still returns the whole document, so it is a containment measure, not a fix.

---

### F-07 — HIGH — Every user's park/run check-ins are readable by every user

**File:** `firestore.rules:1659–1666`

```
1659    match /sessions/{docId} {
1660      // Admins retain full access (heatmap / analytics tooling).
1661      allow read, write: if isRootAdmin() || isAdmin();
1662
1663      // Reads stay open to authenticated users: the admin heatmap
1664      // (route-overlay.service) and analytics aggregate across users via
1665      // authorityId queries. (Tightening reads is a separate follow-up.)
1666      allow read: if isAuthenticated();
```

The rule's own comment concedes this ("Tightening reads is a separate follow-up") and names an
**admin** consumer as the justification — but admins are already covered by line 1661, so line
1666 exists only to serve non-admin readers. Sessions are check-ins written with
`userId == request.auth.uid` plus park/route and timestamps, giving a per-user location-history
trail across the whole user base.

**Fix.** Delete line 1666. The admin heatmap keeps working through line 1661; if a non-admin
surface needs aggregates, serve them from a pre-aggregated collection.

---

### F-08 — HIGH — Multi-tenancy is not actually enforced: the custom claim is never issued

**File:** `firestore.rules:82–86`

```
82    function hasTenant(tenantId) {
83      return isRootAdmin() || isAdmin() ||
84        (isAuthenticated() && request.auth.token.tenantId == tenantId);
85    }
```

I searched the whole repo (`src/`, `functions/src/`, `scripts/`) for `setCustomUserClaims`. The
only occurrence is a **comment** in `functions/src/runDataMigration.ts:17`. No code path ever sets
`tenantId` on an auth token.

Consequences:

- `tenants/{tenantId}` (1748), `tenants/*/units/{unitId}` (1752) and `readiness_configs/{unitId}`
  (1720) are unreadable by every non-admin user. This **fails closed** — good — but it means the
  military readiness feature and the tenant hierarchy are non-functional for real users, and any
  bug report of "missing or insufficient permissions" there has this root cause.
- More importantly, the collections where tenant isolation actually matters do **not** use
  `hasTenant()` at all: `leaderboard_shards` / `leaderboard_snapshots` (F-04), `dailyActivity`
  (F-01), `streaks` (F-09), `sessions` (F-07) and `users` (F-06) are all `isAuthenticated()`.
  So "a city-A user cannot read city-B members" is **false today** — verified by rule text, not
  inferred.

**Fix.** Issue `tenantId` / `authorityId` custom claims from `validateAccessCode` and from the
admin assignment tooling (`admin.auth().setCustomUserClaims(uid, { tenantId, authorityId })`,
then force a token refresh client-side), and then use them in the read predicates in F-01, F-04,
F-06 and F-07. Until claims ship, use `getUserDoc().core.authorityId` in those predicates — one
extra `get()` per request, cached within an evaluation.

---

### F-09 — MEDIUM — `streaks` readable by all

**File:** `firestore.rules:466–468`

```
466    match /streaks/{docId} {
467      allow read: if isAuthenticated();
468      allow write: if isOwner(docId) || isRootAdmin() || isAdmin();
```

Doc id is the uid, so an unfiltered dump yields per-user engagement history for the whole base.
Lower sensitivity than F-01 but the same class and the same fix (serve from snapshots, or scope by
`authorityId`). The rules test at `tests/firestore-rules.test.ts:422` asserts this behaviour as
intended ("A7 — other authenticated user reads streaks → ALLOW (leaderboard design)"), so changing
it means updating that test deliberately.

---

### F-11 — MEDIUM — Intent/attendance collections expose who is going where and when

**Files:** `firestore.rules:1418` (`planned_sessions`), `1400` (`community_events/*/registrations/{uid}`),
`1346` (`community_groups/*/attendance/{sessionId}`), `1367` (`…/member_statuses/{uid}`).

Each is `allow read: if isAuthenticated();`. `planned_sessions` is the strongest of these: it is an
explicit "I will be at this park/route at this time" declaration keyed by `userId`. The comment at
lines 1408–1415 argues the upstream queries are bounded by `parkId`/`routeId`/`userId` — true of
the app's own queries, irrelevant to an attacker, who simply omits the `where`.

**Fix.** For `planned_sessions`, require the query to be scoped to a place rather than to people:
either restrict to the owner plus a same-authority predicate, or (simplest) move the partner-finder
to a Cloud Function that returns only coarse counts. For `registrations` / `attendance` /
`member_statuses`, gate on membership of the backing group, same shape as the F-03 fix.

---

### F-12 — MEDIUM — `group_invitations` tokens are listable

**File:** `firestore.rules:1567–1568`

```
1566    // Tokens are cryptographic random — unguessable ID is the primary security layer.
1567    match /group_invitations/{token} {
1568      allow read: if isAuthenticated();
```

Same defect shape as F-05: unguessability is irrelevant when the collection can be listed. Replace
`allow read` with `allow get` (single-document reads only, which requires already knowing the
token) and leave `allow list` to admins. Note that `allow read` = `get` + `list`; splitting them is
the exact tool for a "knowledge of the id is authorization" design.

---

### F-13 — MEDIUM — Anyone can forge or delete anyone's feed reactions

**File:** `firestore.rules:1235–1238`

```
1235      match /reactions/{reactionId} {
1236        allow read: if isAuthenticated();
1237        allow write: if isAuthenticated();
1238      }
```

`allow write` covers create, update **and delete**, with no author binding — a user can add
reactions under another user's identity or wipe a post's reactions. The parent `feed_posts` rules
(1201–1233) were carefully hardened against exactly this class of thing; the sub-collection was
missed.

**Fix.**

```
      match /reactions/{reactionId} {
        allow read:   if isAuthenticated();
        allow create: if isAuthenticated()
                      && reactionId == request.auth.uid
                      && request.resource.data.uid == request.auth.uid;
        allow update, delete: if isAuthenticated() && reactionId == request.auth.uid;
      }
```

---

### F-14 — MEDIUM — Storage: any authenticated user can overwrite any community image

**File:** `storage.rules:148–154`

```
148    match /communities/{allPaths=**} {
149      allow read: if true;
150      // Admins can write anything; authenticated users can upload group cover images
151      // (UGC path used by CreateGroupWizard → uploadCommunityImage).
152      allow write: if isImage() && isImageSize()
153                   && (isAdmin() || isAuthenticated());
154    }
```

`isAdmin() || isAuthenticated()` reduces to `isAuthenticated()`, and `{allPaths=**}` is the whole
subtree with no owner segment. Any signed-in user can overwrite **any** group's cover image
(defacement of a municipality-branded group) or fill the prefix with 10 MB files. `allow write`
also includes delete.

**Fix.** Scope by group and check membership, or at minimum by uploader uid:

```
    match /communities/{groupId}/{allPaths=**} {
      allow read: if true;
      allow write: if isImage() && isImageSize() && (
        isAdmin() ||
        firestore.get(/databases/(default)/documents/community_groups/$(groupId))
          .data.get('createdBy', '') == request.auth.uid
      );
    }
```

The rest of `storage.rules` is in good shape: admin folders are admin-write with content-type and
size caps (10 MB images / 200 MB video / 10 MB PDF), the catch-all at 198–200 denies everything
else, and health declarations are owner-write / owner+admin-read. The one hole in that last one is
not in Storage at all — it is the download URL stored in Firestore (see F-06).

---

### F-15 — MEDIUM — Unauthenticated write endpoint holding minors' PII

**File:** `firestore.rules:1924–1927` with the validator at 1904–1921

```
1924    match /photo_release_submissions/{docId} {
1925      allow create: if isValidPhotoRelease();
1926      allow read, update, delete: if isRootAdmin() || isAdmin();
1927    }
```

The read side is correct — admins only, immutable. The concern is the write side: `create` requires
no auth at all, and `isValidPhotoRelease()` permits `signatureData` up to **700,000 bytes**
(line 1921). A script can write unlimited ~700 KB documents at no cost to the attacker. The rule
comment states App Check with reCAPTCHA Enterprise attests every write.

**NEEDS VERIFICATION:** confirm App Check **enforcement** is actually ON for Firestore in the
Firebase console (not just "monitoring"), and for the production app ID. If it is in monitoring
mode, this is an open, unauthenticated, unmetered write endpoint that also stores children's names,
school, class, parent name and `parentId` (national ID number, up to 20 chars).

**Fix regardless of App Check:** move this form behind a rate-limited Next.js API route using the
Admin SDK, and set `allow create: if false;`. If it must stay client-side, cut `signatureData` to
~150 KB (a PNG signature is far smaller) and add `request.time` based fields you can index for
abuse detection.

---

### F-16 — MEDIUM — Unauthenticated API leaks participant names (rules bypass)

**File:** `src/app/api/challenge/leaderboard/route.ts:1–80`

```
 * Public (no auth required) — reads challenge_submissions via Admin SDK.
...
 * No rate-limit: Admin SDK only, read-only, no sensitive user data exposed.
```

The returned row is `{ rank, uid, name, ageGroup, gender, bestValue, displayTime }`
(lines 20–28, 66–76). That is a name + age-group + gender + uid tuple for every participant,
served to anyone who can guess or read a `groupId` — and `community_groups` is readable by any
signed-in user (line 1251), so ids are not secret. The header comment's claim "no sensitive user
data exposed" is inaccurate for `ageGroup: 'minor'` rows.

Worth flagging structurally: `challenge_submissions` has **no** Firestore rule and is correctly
default-denied to clients (§4) — the exposure comes entirely from an Admin-SDK route that bypasses
rules. Rules hardening does not close it.

**Fix.** Require auth + group membership on the route, or drop `uid`/`name` for `ageGroup == 'minor'`
rows and return display initials only. Add a rate limit.

---

### F-17 / F-18 / F-19 / F-20 / F-21 — LOW

- **F-17** `storage.rules:175–178` — `/contribution-photos/{userId}/**` is `allow read: if true`.
  The comment says photos are visible "after admin moderation", but the rule makes them public the
  instant they are uploaded, before any review. Filenames are `{timestamp}_{filename}` so blind
  enumeration is impractical, but any URL that leaks is permanent and unauthenticated. Consider
  moving approved photos to a separate public prefix on approval.
- **F-18** `firestore.rules:523` — `sharedWorkouts` public read is intentional (deep links). Risk is
  future drift: `share.service.ts:221` controls the payload today, but the rule imposes no field
  allowlist on `create`, so any future addition of creator identity becomes world-readable. Add
  `request.resource.data.keys().hasOnly([...])` to the create rule.
- **F-19** `analytics_events` (534), `referrals` (1556–1557), `kudos` create (1430) — `allow create:
  if isAuthenticated()` with no binding between the payload's user field and `request.auth.uid`. Users
  can write analytics rows and referral records attributed to other people. Contrast with
  `push_events` (548–563), which does this correctly with a per-eventType field allowlist — copy that
  pattern.
- **F-20** `firestore.rules:337–348` — the comment claims the explicit `match /users/{userId}/
  notification_clicks/{clickId}` block makes the collectionGroup query "unambiguously authorized".
  It does not: Firestore only applies a rule to a collection-group query when the match path is
  prefixed with a recursive wildcard. The query at `src/app/admin/workout-settings/page.tsx:570`
  works only because the root catch-all (1956) grants admins everything. Harmless today because the
  reader is an admin, but the stated invariant ("survives any future narrowing of the wildcard") is
  false — narrowing the catch-all would break it. Correct form:
  `match /{path=**}/notification_clicks/{clickId} { allow read: if isAdmin(); }`.
- **F-21** `firestore.rules:1546–1549` — the `reports` read/update/delete rule tests
  `get(...).data.role in ['admin','authority','root']`, but the app's admin flags live under
  `users/{uid}.core.*` (see `isAdmin()` at lines 37–45 and the `auth.service.ts` reference in the
  header comment). Unless legacy top-level `role` values exist in production, only the two hardcoded
  root emails can moderate reports. **NEEDS VERIFICATION:** query production for
  `users` documents with a top-level `role` field to see whether this branch is live.

---

## 4. Collections written by app code but not covered by any rule block

I extracted every `collection('…')` / `doc(db,'…')` / `db.collection('…')` literal from `src/` and
`functions/src/` (62 distinct names) and diffed against the 116 `match` blocks in the rules.

Unmatched by any explicit rule — therefore reachable **only** through the admin catch-all at
line 1956, and denied to all non-admin clients:

| Collection | Written by | Client-SDK read? | Verdict |
|---|---|---|---|
| `city_registrations` | `api/admin/city-mapping/register-city/route.ts:48` (Admin SDK) | yes, admin page `city-mapping-summary.ts:132` | OK — admin-only via catch-all |
| `crm_runs` | `api/admin/crm-agent/run/route.ts:704` (Admin SDK) | yes, admin pages | OK |
| `osm_amenities` | `moderation.service.ts:76,166` (client, admin UI) | yes, admin pages | OK |
| `imported_exercises` | `importExcelAction.ts:1221+` (client, admin UI) | yes, admin only | OK |
| `finance_meta` | `api/admin/finance/scan-invoices/route.ts:717` | Admin SDK only | OK |
| `transactions` | `api/admin/finance/*` | Admin SDK only | OK |
| `push_rate` | `functions/src/services/push.service.ts:291,492` | Admin SDK only | OK |
| `community_groups/*/challenge_submissions/*` | `api/challenge/submit/route.ts:62` | Admin SDK only | OK at the rules layer — but see **F-16** |
| `users/*/gps_traces/*` | `useRunningPlayer.ts:1459` | owner | Covered by the users sub-collection wildcard (line 363) — correct |

**No missing-rule leak found.** Firestore's default-deny plus the admin-only catch-all handles all
of these correctly. The catch-all itself is **not** over-permissive: it is `isRootAdmin() ||
isAdmin()`, never `if true` or `if request.auth != null`.

---

## 5. Collection-group queries

Every `collectionGroup(...)` call in `src/`, `functions/`, `scripts/` and `tests/`:

| Call | Location | Rule that authorizes it | Status |
|---|---|---|---|
| `collectionGroup(db,'notification_clicks')` | `src/app/admin/workout-settings/page.tsx:570` | root catch-all (1956), **not** the block at 345 | Works (admin-only). See **F-20** for the incorrect comment. |
| `db.collectionGroup('gps_traces')` | `scripts/fetch-gps-traces.ts:39` | Admin SDK — bypasses rules | N/A |
| `db.collectionGroup('units')` | `scripts/_verify-military-units.ts:69,74,79` | Admin SDK | N/A |
| `db.collectionGroup(...)` refs | `scripts/smoke-test-tenants.ts` | index assertions only, not queries | N/A |

`firestore.indexes.json` declares **81 index entries**, of which **5** are `queryScope:
COLLECTION_GROUP`: `members` (line 256), `notification_clicks` (×2, lines 592 and 601),
`challenge_submissions` (line 661).

Two of those have no corresponding client query today:

- **`members`** — there is a COLLECTION_GROUP index but no `collectionGroup('members')` call in the
  codebase. If one is ever added, note that the rule at `firestore.rules:1295` (`match
  /community_groups/{docId}/members/{uid}`) will **not** authorize it — collection-group queries
  require a recursive-wildcard match path. Non-admins would get `permission-denied`; admins would
  succeed via the catch-all and thereby read **every group's roster including the military one**,
  bypassing the `isMilitaryGroup` gate. Treat the index as a trap: either delete it or write the
  rule deliberately before anyone adds the query.
- **`challenge_submissions`** — same situation; queried only through the Admin SDK route today.

**Net:** no collection-group rule is currently *wrong* in a way that leaks, because the only live
client query is admin-scoped. The risk is latent and sits in the two unused indexes.

---

## 6. Privilege escalation review (writes)

This is the strongest part of the file, and I could not find a working escalation.

| Field | Guard | Line | Verdict |
|---|---|---|---|
| `role`, `core.role` | `noAdminFieldsChanged()` on update; `!('role' in …)` + `== ''` on create | 105–122, 283–295 | Blocked |
| `core.isSuperAdmin` / `isSystemAdmin` / `isVerticalAdmin` / `isTenantOwner` / `isApproved` / `managedVertical` | `noAdminFieldsChanged()` + create guards | 105–122, 286–291 | Blocked |
| `core.tenantId` / `tenantType` / `unitId` / `unitPath` | `noTenantFieldsChanged()`; initial-write allowance now requires `isAdmin()` | 159–170, 292–295 | Blocked (this was a real past hole; the fix is correct) |
| `core.authorityId` | Locked once non-empty; initial write is client-writable by design | 169 | **Partially open.** The comment (lines 152–157) says the real lock is that onboarding-sync omits it and writes route through `/api/user/update-authority`. But the *rule* permits a first-time client write of any value. A new user can self-declare membership in any municipality before the API route runs. **MEDIUM** — see fix below. |
| `progression.globalLevel` / `globalXP` / `coins` | `noGameIntegrityFieldsChanged()`, initial-seed allowance only when `progression` is absent | 190–197 | Blocked |
| `social.groupIds` | `noSocialGroupIdsChanged()` — Admin-SDK only | 208–212 | Blocked |
| `core.ageGroup` / `core.birthDate` | `noLockedCoreFieldsChanged()` + create guards | 255–262 | Blocked |
| `dailyActivity.passive*` | `noPassiveActivityFieldsChanged()` | 225–234 | Blocked |
| `community_groups.isLocked` / `isOfficial` / `source` | create + update guards | 1268–1280 | Blocked |
| `community_groups/*/members.role` | rank-based (self cannot change role; admin promotes; owner demotes) | 1300–1315 | Blocked; covered by tests H2_1–H2_4 |
| No `subscription` / `plan` / `entitlement` fields exist | — | — | N/A |

**`core.authorityId` fix.** Close the initial-write allowance the same way the tenant fields were
closed:

```
          && (cur.get('authorityId', '') == nxt.get('authorityId', '')
              || (cur.get('authorityId', '') == '' && isAdmin()))
```

and add `&& (isAdmin() || request.resource.data.get('core', {}).get('authorityId', '') == '')`
to the `allow create` block at line 292. Since `authorityId` gates the leaderboard scope proposed
in F-01/F-04 and municipal content tiers, it should be as locked as `tenantId`.

---

## 7. Rules unit tests — honest coverage

`tests/firestore-rules.test.ts` — 763 lines, hand-rolled `it()` harness, `@firebase/rules-unit-testing`
against the emulator (`firebase.json` configures the Firestore emulator on 8080). Supporting ad-hoc
scripts: `scripts/test-members-rule.mjs`, `scripts/test-members-h2.mjs`,
`scripts/test-authority-presence-rules.mjs`.

**Covered (48 assertions):** presence group/squad reads and spoofed `audienceGroupIds` (P1–P4);
community group join with/without invite code, admin/owner removal ranks (G1–G5, H2_1–H2_4);
schedule-field patch scoping (S1–S4); `dailyActivity` and `streaks` owner/non-owner reads
(A1–A7 — note A3 and A7 **assert the leak in F-01/F-09 as intended behaviour**); tenant self-assign
on create and update (T1–T5 — the F-06-adjacent fix); `military_declarations` shape validation and
cross-user denial (U1–U6); `unitDirectory` and `unit_league_aggregates` (U7–U10, UL1–UL3); military
group roster lockdown including the unfiltered-list case (R1–R7); and U11, which asserts a
discoverable user doc carries no military-declaration key.

**Not covered — zero assertions:**

- `connections` (F-02) — no test that a third party cannot write another user's `followers`
- `chats` / `chats/*/messages` (F-03) — no test of group-chat read, self-join, or history access
- `leaderboard_shards` / `leaderboard_snapshots` (F-04) — no cross-tenant read test
- `admin_invitations` (F-05), `group_invitations` (F-12)
- `users` cross-user read (F-06) — U11 checks one *absent field*, not the read boundary itself
- `sessions` (F-07), `planned_sessions` / `attendance` / `registrations` (F-11)
- `feed_posts` and `feed_posts/*/reactions` (F-13)
- `photo_release_submissions` (F-15)
- **`storage.rules` — no tests at all**

There is no CI gate visible on these tests. Coverage is roughly "the paths fixed in past audits",
which is the classic shape: the tests encode what was already known, and every finding in this
report sits in the untested remainder.

---

## 8. What to fix before launch — top 5

1. **`firestore.rules:1163–1169` — bind `connections` updates to the acting user.** (F-02) This is
   the only finding that yields live location tracking of arbitrary residents and minors. It is a
   ~10-line rule change plus a test.
2. **`firestore.rules:1455–1457, 1516–1519` — gate group-chat read and self-join on real group
   membership.** (F-03) Today any account reads every group roster by real name and can read any
   group's full message history. This silently defeats the military/institutional lockdown the team
   already built and tested.
3. **`firestore.rules:393` — delete the blanket `dailyActivity` read; serve leaderboards from
   `leaderboard_snapshots`.** (F-01) Full health-data dump of ~4,000 users. Apply the same deletion
   to `sessions:1666` and `streaks:467` in the same change (F-07, F-09), and tenant-scope
   `leaderboard_shards:1731` / `leaderboard_snapshots:1740` (F-04). Update tests A3 and A7, which
   currently assert the old behaviour.
4. **`firestore.rules:1005` — stop the `admin_invitations` list, and stop storing
   `healthDeclarationPdfUrl` on the user doc.** (F-05, F-06) The first exposes the full staff roster
   with live tokens; the second turns the `core.discoverable` toggle into a public link to a signed
   health declaration PDF, bypassing an otherwise-correct Storage rule. Both are small, contained
   changes. While in `users`, close the `core.authorityId` initial-write allowance (§6).
5. **Issue the tenant/authority custom claims, then make the cross-user read rules use them.**
   (F-08) `setCustomUserClaims` is never called anywhere in the repo, so `hasTenant()` is dead code
   and every claim of tenant isolation in the rules' comments is currently unenforced. Until claims
   exist, use `getUserDoc().core.authorityId` in the predicates from items 3 and 4 — but do not
   launch a municipality deployment describing itself as multi-tenant on rules that contain no
   tenant predicate.

**Also add before launch, cheaply:** rules tests for items 1–4 (the harness already exists), and
`storage.rules:148–154` scoping (F-14) so group cover images cannot be overwritten by any account.

---

## 9. Items requiring verification (not asserted as findings)

1. **App Check enforcement mode** for Firestore in production — F-15 depends on it entirely.
   Check Firebase console → App Check → Firestore = *Enforced*, not *Monitoring*, for the
   production app IDs (web + iOS + Android).
2. **Is the client-side admin-invitation acceptance flow live?**
   `invitation.service.ts:293–403` writes `role: 'admin'` from the client SDK; the rules deny it.
   Either admins are onboarded another way, or that flow is silently broken in production.
3. **Do any production `users` documents carry a top-level `role` field?** If not, the non-root
   branch of the `reports` rule (line 1548) is dead and only two hardcoded emails can moderate
   abuse reports — an operational risk for a municipality launch (F-21).
4. **`firestore.indexes.json` contains `//` comments** (e.g. line 582), which is not strict JSON —
   `python3 -c json.load` fails on it. The Firebase CLI may tolerate it, but confirm
   `firebase deploy --only firestore:indexes` actually succeeds against this file rather than
   silently using a previously deployed index set.
5. **Are the two unused COLLECTION_GROUP indexes (`members`, `challenge_submissions`) intentional?**
   See §5 — they are a latent trap rather than a current leak.
