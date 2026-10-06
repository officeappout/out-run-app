# axioms.md — OUT Ground Truth Constants

> Every fact below cites its source path + line.
> Claims without a verified written source are marked ⚠️ unverified — confirm with David.
> This file is load-bearing. One fabricated "law" poisons the entire system.
> Do not rationalize around these. Treat them as constraints, not suggestions.

---

## 1. Workout Engine — Pure TypeScript, No Side Effects
**Source:** `.cursoragents/Workout_Engine_Truth.md` LAW 0 (lines 13–29)

`WorkoutGenerator` must be pure TypeScript.
- NO React hooks inside the generator
- NO Firebase calls inside the generator
- Pass all data as arguments
- Lives in: `src/features/workout-engine/` (pure logic, no UI, no hooks)

## 2. XP / Coins / Levels — Server Ownership
**Source:** `.cursoragents/XP_Progression_Truth.md` LAW 0 (lines 14–18)

`progression.coins`, `progression.globalLevel`, `progression.globalXP` are server-owned.
The ONLY authorized writers are the `awardWorkoutXP` Callable Cloud Function ("The Guardian") and, as of the B5 delete-workout batch (12.08.2026), `reverseWorkoutXP` (`functions/src/reverseWorkoutXP.ts`) — a narrowly-scoped sibling callable that reverses `globalXP`/`globalLevel` only (never `coins`) when a workout is deleted. It never touches `applyAward`/`sanitizeDelta`, takes only `{workoutId}` from the client (never a client-supplied amount), reads the reversal amount and ownership server-side from the workout doc, and is idempotent via a transactional `xpReversed` marker written atomically with the progression update.
Client code MUST route through `src/lib/awardWorkoutXP.ts` (awards) or `src/lib/reverseWorkoutXP.ts` (reversals) — never a direct client write.
Firestore rules (`noGameIntegrityFieldsChanged()`) reject any direct client write.
DO NOT invent bonus formulas — every value must trace to a row in `.cursoragents/XP_Progression_Truth.md`.

## 3. StrengthRunner Boundary
**Source (existence):** `src/features/workout-engine/players/strength/StrengthRunner.tsx` (verified — "Spotify-style decoupled live workout player")
**Source (boundary rule):** ⚠️ unverified — oral convention from chat, not written in any file.

StrengthRunner is the strength-session player. It is currently stable.
Convention (⚠️ unverified): do not modify without an explicit request naming StrengthRunner by name.
Confirm the boundary rule with David before treating it as a hard law.

## 4. Google APIs + Capacitor Plugins — Dynamic Import Only
**Source:** `CLAUDE.md` line 32 (googleapis); verified by inspection of all `@capacitor` usages in `src/lib/` and `src/features/` (23.06.2026)

`await import('googleapis')`, `await import('google-auth-library')`, `await import('@capacitor/*')`, and `await import('@capacitor-firebase/*')` only — NEVER top-level.
Reason: top-level imports hang webpack on this machine.
This applies to every file in the codebase — no exceptions.
Examples of the pattern: `src/lib/auth.service.ts:106`, `src/lib/firebase.ts:273`, `src/lib/onboardingPrefs.ts:68`.

## 5. Firestore Array Write Rules
**Source:** `CLAUDE.md` lines 45–48

- **Array append:** `FieldValue.arrayUnion` — NEVER overwrite the whole array directly
- **Array remove:** `getDoc` → filter → `updateDoc` — `arrayRemove` silently fails on object-type elements
- **Timestamps inside arrays:** `Timestamp.now()` — `serverTimestamp()` is invalid inside array elements
- **Document `updatedAt`:** `FieldValue.serverTimestamp()` — always, at document root level

## 6. isActiveClient — Never Modify Without Written Approval
**Source:** `CLAUDE.md` lines 42–43

`isActiveClient` must NOT be modified on any authority without David's explicit written approval.
This field gates league access for real, paying users.
Applies to every write path: API routes, scripts, agents, admin panel.
For the current list of paying clients: see `.claude/knowledge/product-context.md` (not here — client lists are data, not law).

## 7. State Management — Zustand Only
**Source:** `.cursorrules` lines 48–51

Zustand is the only state management solution.
No Redux. No MobX. No new React Contexts.
`MapModeContext` is the ONLY allowed React Context (map mode routing).
Cross-feature writes go through actions/callbacks, not direct store writes.

## 8. Z-Index Budget — No Unregistered Values
**Source:** `.cursorrules` lines 31–45

All z-index values are budgeted and documented in `.cursorrules` lines 31–45.
DO NOT create a new z-index value without first updating that table.
Range: z-[-1] (ParticleBackground) through z-[200] (RunSummary nested UI).

## 9. One-Card-Only Map UI
**Source:** `.cursorrules` lines 19–29

Only ONE bottom overlay may be visible on the map screen at a time.
Generated routes → WorkoutDrawer. Curated routes → BottomJourneyContainer. **This is THE LAW.**
The `DiscoverLayer` screen state enforces: SEARCH | NAV | ROUTE_CARD | DISCOVERY.
Opening a higher-priority overlay hides all lower-priority ones.

## 10. Deploy Model — Web vs Native
**Source:** `CLAUDE.md` Architecture Patterns section
**Stronger source:** ⚠️ exact line unverified — cross-check `capacitor.config.ts` if in doubt.

Web content → Vercel via `npm run deploy`.
Native config/plugins → `npx cap sync`.
`cap sync` does NOT push web content — only syncs native plugins and config.
Never conflate the two. "Rebuild the app" is only needed for native plugin changes.

## 11. Build / Dev Commands — DO NOT RUN
**Source:** `.cursorrules` lines 66–68

DO NOT run: `npm run build`, `npm run dev`, `next build`, `next dev`, `rm -rf .next`.
The developer (David) runs dev server and tests on localhost.
Commit locally → report changes → wait for David's explicit push approval.
No auto git push at task end.

## 12. iCloud Drive Safety
**Source:** `CLAUDE.md` line 75

iCloud Drive is active on this machine.
Never delete `.next/` or `node_modules/` without first checking iCloud sync status.

## 13. webpack Cache — Do Not Modify
**Source:** `CLAUDE.md` line 76

Do NOT modify `next.config.mjs` webpack cache settings.
Reason (as stated in CLAUDE.md): caused startup hangs previously.

## 14. Firestore Rules — Emulator Testing
**Source:** `SECURITY.md` §11 "How to verify" (lines 336–345) — describes verification workflow, NOT an explicit pre-deploy requirement.
**Rule status:** ⚠️ unverified as a hard law.

When modifying `firestore.rules`, the recommended verification method is:
`firebase emulators:start --only firestore` then test via Rules Playground or `firebase emulators:exec`.
⚠️ Whether this is MANDATORY before deploy: confirm with David.

## 15. API Route Guards — Three Distinct Auth Patterns
**Source:** `CLAUDE.md` line 30; verified by inspection of all `route.ts` files (23.06.2026)

There are three auth patterns in this codebase — NOT one universal guard:

| Pattern | Guard | Used by |
|---|---|---|
| `requireAdminApi(request)` | `AGENT_API_KEY` header only | Most `/api/admin/*` routes (automated/machine) |
| `requireSection(request, 'system')` | `AGENT_API_KEY` **or** admin UI session | `/api/admin/master-evolution-sync` (line 15), `/api/admin/re-seed-authorities` (line 11) |
| Firebase ID token Bearer | `Authorization: Bearer <id-token>` verified via `getAdminAuth().verifyIdToken` | User-facing routes: `/api/join/*`, `/api/social/*`, `/api/user/*` |
| No auth | Intentional — read-only, rate-limited | `/api/join/preview` only |

`requireSection` is a **superset** of `requireAdminApi` — it accepts both the agent key and admin UI sessions. Use it only for routes that also need browser-based admin access.

`getAdminDb()` / `getAdminAuth()` from `src/lib/firebase-admin.ts` is required in all server routes regardless of which auth pattern is used.

## 17. social.groupIds ↔ user_memberships — Always Dual-Write, Always Atomic
**Source:** `src/app/api/join/confirm/route.ts` lines 107–132; `src/app/api/social/group-membership/route.ts` lines 53–65; `scripts/safety-check.sh` (authorized-paths enforcement)

Every write to `users/{uid}.social.groupIds` **must** include `user_memberships/{uid}.groupIds` in the same atomic batch (`merge: true`).
`user_memberships` is a lean mirror document read by the Firestore rule function `memberGroupIds()` to authorize presence writes. Without it, presence writes are rejected with PERMISSION-DENIED — silently from the user's perspective.

**Full join triple-write (the complete required set for any group join):**
1. `community_groups/{groupId}/members/{uid}` — membership record (role, name, joinedAt)
2. `user_memberships/{uid}` — presence gate mirror (`groupIds: arrayUnion(groupId)`)
3. `users/{uid}.social.groupIds` — client-read denormalized array (`arrayUnion(groupId)`)

All three must succeed in one batch. Missing any one breaks a different subsystem: (1) group roster, (2) presence authorization, (3) client membership reads.
The `memberCount` increment (`community_groups/{groupId}`) is a **non-fatal** fourth write — counter drift is acceptable.

Only two routes are authorized to write `social.groupIds` as a Firestore field key (enforced by `scripts/safety-check.sh`):
- `src/app/api/social/group-membership/route.ts`
- `src/app/api/social/reconcile-group-membership/route.ts`

---

## 18. Join Flow — groupId Always Resolved Server-Side from inviteCode; Never Trusted from Client
**Source:** `src/app/api/join/confirm/route.ts` line 54 (comment: "never trust client groupId"); `src/app/join/[inviteCode]/page.tsx` lines 73–74; `src/app/onboarding-new/profile/page.tsx` line 280

The `groupId` for all group join operations is derived **only** by looking up `inviteCode` in Firestore via Admin SDK on the server. The client never sends a bare `groupId` to the join API.

When an unauthenticated user lands on `/join/[inviteCode]`, the invite code is persisted to `localStorage('pending_invite_code')` and consumed in `onboarding-new/profile/page.tsx` after authentication, then immediately removed.
`pending_group_id` is intentionally **not** stored — the groupId is always re-resolved from the code server-side to prevent client spoofing.

---

## 19. Durable Native Flags → `onboardingPrefs.ts`; Short-Lived Hints → `sessionStorage`
**Source:** `src/lib/onboardingPrefs.ts` lines 1–28 (inline documentation); `src/app/page.tsx` lines 293–306

WKWebView can evict `localStorage` between hard close and re-launch on iOS when the app loads from a remote origin via `server.url`. Two storage tiers apply:

| Data | Storage | Why |
|---|---|---|
| Durable cross-launch flags (`onboarding_language`, `gateway_uid`, `gateway_track`, etc.) | `src/lib/onboardingPrefs.ts` | Dual-writes: `localStorage` (fast sync) + `@capacitor/preferences` (NSUserDefaults — survives hard close) |
| Short-lived UI navigation hints (`show_gear_toast`, `jit_return_to`, `post_workout_completed`, etc.) | `sessionStorage` | Must NOT persist across launches |

Never call `localStorage.setItem` directly for onboarding-critical data that must survive a hard close on native. Always go through `setOnboardingPref` / `getOnboardingPrefAsync` from `src/lib/onboardingPrefs.ts`.

---

## 20. core.authorityId — Client-Write Locked; All Mutations via /api/user/update-authority
**Source:** `src/app/api/user/update-authority/route.ts` line 8; `firestore.rules` line 112 (`noTenantFieldsChanged()`) + line 254

`users/{uid}.core.authorityId` is blocked from client self-write by the Firestore rule `noTenantFieldsChanged()`.
Reason: prevents users from self-assigning to paying municipalities.
All writes route through `/api/user/update-authority` via Admin SDK (Firebase ID token Bearer auth).

⚠️ **Pending (billing):** when municipality payment goes live, this route must add an `authority.isActiveClient == true` entitlement check before writing. A TODO comment exists at `src/app/api/user/update-authority/route.ts` — do not remove it.

---

## 21. Active Group Session — Presence Mode Forced to `group` Regardless of Privacy Settings
**Source:** `src/features/safecity/hooks/usePresenceLayer.ts` lines 298–306; `src/features/arena/components/CommunitySessionBanner.tsx` lines 160–173

During a live group session (`useSharedSession.getState().groupId` is non-null), the presence system forces `mode: 'group'` for **all** participants — including the host — overriding their personal privacy setting.

```
// usePresenceLayer.ts:305-306
const liveGroupId = useSharedSession.getState().groupId;
const requestedMode = liveGroupId ? 'group' : s.privacyMode;
```

The override is automatic and reverts when `groupId → null` (session ends). Do NOT add logic that bypasses this by reading `privacyMode` directly when a `liveGroupId` exists.
`CommunitySessionBanner` triggers `startGroupSession` automatically when `effectivePhase === 'active' && isJoined && session.groupId` (line 163).

---

## 22. PLACEHOLDER Rule — Knowledge Files
**Source:** Established convention — Block D infrastructure session, 22.06.2026

If a knowledge file contains `⚠️ PLACEHOLDER` anywhere in its body:
- Treat the **entire topic** covered by that file as unknown
- Do NOT present placeholder content as fact
- Do NOT invent information around the gap or attempt to fill it from memory
- Surface the gap explicitly: "הקובץ `<name>` מכיל PLACEHOLDER — אין לי מידע אמיתי על `<topic>`. יש לשאול את דוד."

This applies to every agent and skill that loads knowledge files.
A PLACEHOLDER file is safer than a missing file — it signals a known unknown instead of a silent gap.

---

## 23. Route-Collection Writes — Resolved Authority Required on Create, Correct-Typed Fields Always
**Source:** `.claude/plans/route-enrichment-pipeline-kickoff-vast-pelican.md` (route-enrichment-pipeline plan, Stage 0-1B); `src/lib/route-collections/validate.ts`; `scripts/safety-check.sh` check 3

Two hard rules for the 5 route/geo Firestore collections (`official_routes`, `curated_routes`, `climb_segments`, `street_segments`, `route_adjacency`), discovered because convention alone already failed twice independently:

1. **No CREATE without a resolved city/authority.** `authorityId` must be a real doc in the `authorities` collection, `city` must be non-empty. **UPDATE is NOT held to the same bar** — production has many legacy docs with no authorityId at all (`InventoryService.bulkAssignAuthority` exists specifically to backfill them). An update that doesn't touch `authorityId`/`city` must never be blocked on their account. Once a field IS set (create-time or a later update), it locks — a further update cannot silently change it (mirrors `noTenantFieldsChanged()`, §20 above).
2. **Every value must go in its correctly-typed field, cast or no cast.** `Route.difficulty` is `'easy'|'medium'|'hard'` — a value like `'moderate'` must be rejected at the moment of write, not merely disallowed by a TypeScript type a caller can defeat with `as any` (which is exactly how this rule was broken twice — see the `.claude/knowledge/route-enrichment-pipeline-scoping.md` audit).

**Enforcement (3 layers, since neither alone covers every writer):**
- `src/lib/route-collections/validate.ts`'s `buildValidatedDoc(collection, raw, ctx)` — the chokepoint. Runs a zod schema (mirroring the real TS types verbatim) at the moment of write, plus the create/update authority rules above. Every migrated writer calls this immediately before its actual Firestore write.
- `scripts/safety-check.sh` check 3 — pre-commit tripwire: blocks a new route-collection write from a file not in `AUTHORIZED_ROUTE_WRITERS`, and blocks a new write-verb line in a chokepoint-migrated file (`AUTHORIZED_ROUTE_WRITERS` ∩ `MIGRATED_CHOKEPOINT_WRITERS`) that doesn't co-occur with a `buildValidatedDoc(` call.
- `firestore.rules` (Stage 2 Phase 2.5) — client-SDK/admin-UI-only defense-in-depth; cannot stop Admin-SDK script writes (those bypass rules by design), which is why the chokepoint above is the primary enforcement for scripts. Written and reviewed, but **not one uniform "ready and pending David's go" block** — the 5 collections split into two genuinely different states (confirmed 28.09.2026, see `firestore.rules` lines 1046–1088 for the full audit trail written inline at each collection's guard):
  - **Audited safe, blocked only on approval:** `official_routes`, `curated_routes`, `climb_segments`, `route_adjacency`. Every live writer for these already guarantees a resolved `authorityId`/`cityName` before the write reaches here (via the chokepoint or a required function parameter) — enabling the commented-out `allow create/update` lines is a real go/no-go decision, not a blocked one.
  - **Not deployable as currently written:** `street_segments`. `official-route-broadcaster.ts` intentionally writes `authorityId: null` on `street_segments` docs broadcast from an `official_routes` route that itself has none — true for 156 of 183 real `official_routes` docs in production (confirmed live 16.08.2026, re-confirmed 28.09.2026, no reason to expect this count has since dropped). Enabling `hasResolvedAuthority()` here today would silently break that fire-and-forget broadcast for the majority of existing routes (swallowed `.catch()` — the admin would see nothing). This needs one of two fixes FIRST, not just a sign-off: (a) change `official-route-broadcaster.ts` to resolve/require `authorityId` before broadcasting, or explicitly skip+warn instead of writing `null`; or (b) run `InventoryService.bulkAssignAuthority` (already built for exactly this, not yet run) to backfill the 156 legacy docs. Until one of those lands, `street_segments`' guard stays commented out regardless of any other approval.

As of Stage 1B, only 4 write paths were migrated to the chokepoint: `InventoryService.saveRoutes`/`saveCuratedRoutes`/`updateRoute`, and `scripts/geo-discovery-routes.ts`. The surface-type phase (17.08.2026) added a 5th: `osm-segment-importer.ts`'s `commitSegmentsToFirestore`. Stage 3 (spatial join, 17.08.2026) added a 6th, chokepoint-migrated from birth: `InventoryService.recomputeRouteEnrichmentForCity` (climb_segments/official_routes/street_segments cross-ref writes). Its pure geometry lives in a separate, deliberately I/O-free sibling file (`route-enrichment.service.ts`) that never touches Firestore directly and is therefore NOT itself in `AUTHORIZED_ROUTE_WRITERS` — same reasoning `route-adjacency.service.ts` (its structural precedent) is also absent from that list. The rest of the ~14 originally-known writers are authorized (in the safety-check allowlist) but not yet chokepoint-enforced — migrated as each is generalized for multi-city use, which is how the count keeps climbing one phase at a time rather than in one big-bang pass.

**Known enforcement gap, open as of 28.09.2026 (not fixed, tracked here in writing rather than left as a code comment):** two classes of writer have zero enforcement of rule 1 above beyond code discipline —
1. **Writers not yet chokepoint-migrated** — the ~8 of the original ~14 known route-collection writers that are safety-check-authorized but don't yet call `buildValidatedDoc`.
2. **Any Admin-SDK script writer** — bypasses `firestore.rules` by design regardless of deployment state, migrated or not.

Neither gap is new; both are the direct, expected consequence of the staged-migration design this section already describes (`firestore.rules` itself is explicit that it "cannot stop Admin-SDK script writes... which is why the chokepoint above is the primary enforcement for scripts"). Listed explicitly here so it reads as an open item, not just implied by the surrounding prose.

---

## 24. Third-Party Library Options — a Key Present-with-`undefined` Is Not the Same as an Absent Key
**Source:** production incident 06.09.2026 — `qr-code-styling` constructor crash on `/admin/links` drawer open; full writeup `docs/architecture/marketing-attribution.md` §16.7

When building an options object for a third-party library that merges caller options over its own defaults — a shallow `Object.assign`/spread, which is the overwhelmingly common implementation — a key that is PRESENT with value `undefined` is NOT equivalent to an ABSENT key:
- Absent key → the library's own default for that key survives the merge, untouched.
- Present-with-`undefined` key → the merge OVERWRITES the library's default with `undefined`. If any internal code then dereferences a nested field on that value without an optional-chaining guard (`options.someKey.nestedField`), it throws — exactly what happened here (`imageOptions.hideBackgroundDots`).

Concretely: `someKey: condition ? {...} : undefined` is the wrong shape whenever `someKey` has a real, non-empty library default. Use a conditional spread instead — `...(condition ? { someKey: {...} } : {})` — so the key is fully absent, not present-with-`undefined`, when the condition is false.

**Test-writing corollary**: `expect(options.someKey).toBeUndefined()` passes identically whether the key is absent or present-with-`undefined` — it cannot distinguish the two, and 31 passing tests failed to catch this exact bug for precisely that reason. When the intent is "key must be absent," assert `Object.prototype.hasOwnProperty.call(options, 'someKey') === false`, not just that the value reads as `undefined`.

This will recur with any future dependency that does default-merging (most do) — check this pattern whenever writing an options-builder for a newly-adopted library, not only for `qr-code-styling`.

---

## 25. Firestore `list`/Query Rules — `isOwner()` Can Never Gate an Open Collection Query
**Source:** production incident 28.09.2026 — `checkAdminEmail`'s `getUserByEmail` (`src/features/admin/services/admin-management.service.ts`, `where('core.email','==',email)`) silently `permission-denied` for every non-admin caller, mis-reported to a real officer as "email not found in the system"; full writeup `docs/audit-2026-09/00-MASTER-PLAN.md` (login-entry-points unification, 28.09.2026).

A Firestore security rule's `list`/query permission must be **provable for every possible document the query could return, without running the query** — the rules engine cannot inspect actual data to evaluate a per-document condition against an open-ended query. `allow read: if isOwner(userId) || isAdmin();` on `users/{userId}` correctly gates a single-document `get()` — `userId` is fixed by the request, `isOwner(userId)` is directly checkable. The SAME rule can NEVER gate a `list`/`where()` query across the whole collection (e.g. `where('core.email','==',someValue)`): `isOwner(userId)` cannot be proven for an unbounded, not-yet-known set of matching documents, so Firestore rejects the query outright for anyone who doesn't ALSO satisfy a collection-wide condition like `isAdmin()` — regardless of whether the querying user's own document would, in fact, have matched.

**The trap:** the rejected query throws `permission-denied`. If the calling code wraps it in a try/catch that treats "the query failed" the same as "the query ran and found nothing" — exactly what `getUserByEmail`'s caller did — a genuine caller's own record becomes indistinguishable from "no such record exists." This is the SAME "0 that isn't really 0" failure class already documented (`00-MASTER-PLAN.md` §13.47/§13.48's standing rule), through a DIFFERENT mechanism: not a missing composite/`collectionGroup` index that fails intermittently, but a structural client-SDK-query/rules mismatch that fails on every single call, for every caller the rule was never written to admit.

**The rule, effective immediately, checked on every future PR:** before merging any NEW browser-side (client-SDK) `query()`/`where()`/`collectionGroup()` call against a protected Firestore collection, verify explicitly that the collection's `list` rule can be proven true for the calling context **without depending on which specific document(s) the query happens to return** — a collection-wide condition (`isAdmin()`, a custom claim, a rule keyed on a field of the query itself), never a bare per-document `isOwner(docId)`-style check alone. If the only way to make a needed browser-side query work would require relaxing a per-document rule into something an ordinary user could exploit for enumeration, the query belongs server-side (Admin SDK) instead — the established "route officer-panel reads through the server" pattern (§13.28's `hasTenant()` decision, this same repo) is the model to follow, not a rules change.

## 26. Accidental Protection Is Not Protection — Verify the Gate, Not a Side Effect That Happens to Look Like One
**Source:** production investigation 28-29.09.2026 — `/admin/dashboard` reachable by `unit_admin` at the middleware layer (`src/middleware.ts`'s `AUTHORITY_MANAGER_ALLOWED_PATHS`, a deliberate Stage-4 simplification shared with `authority_manager`/`tenant_owner`); the only thing stopping a real data leak was `admin/dashboard/page.tsx`'s own `resolveAuthority()` happening to exit early because `getAuthoritiesByManager(uid)` is always empty for `unit_admin` — an accident of that page's unrelated data-fetch logic, not an authorization check. David's framing, verbatim: "הגנה מקרית היא לא הגנה, וזו אותה משפחה של הפונקציות המתות ב-rules" — the same family as a Firestore rule silently made inert by a broader catch-all elsewhere (see the `Firestore Rules Admin-Fallback Inert` memory) — a narrower control that LOOKS like it's doing something, but the actual outcome is determined by something else entirely, unrelated to intent.

**The trap:** a code review (including this agent's own, this session) can look at "does a `unit_admin` see real municipal data on `/admin/dashboard`?", get a correct "no" from tracing `resolveAuthority()`, and stop there — treating that "no" as proof the door is closed. It isn't. The "no" holds only as long as that specific downstream function keeps failing the exact same way for the exact same reason. Change `resolveAuthority()` later (e.g. to add a `unit_admin` fallback using a DIFFERENT id source than `getAuthoritiesByManager`), and the leak reopens silently — no test tied to an authorization boundary would catch it, because there never was one at that boundary to begin with.

**The rule:** when asking "can role X reach resource Y," answer at the layer that is SUPPOSED to decide that — middleware/route guard for a page, a Firestore rule for a collection, `resolveUnitPermissionScope`/`requireAdminApi` for an API route — never by tracing forward through a page's or function's incidental logic to see whether it happens to come out safe today. A "no" that isn't backed by an explicit check at the real gate is not a verified "no"; it's an unverified "not yet." Where no real gate exists, add one (this session's `/admin/dashboard` fix: a narrow, explicit `unit_admin` exclusion in `decideAdminGateAction`) rather than documenting the accidental behavior as if it were the boundary.

---

## 27. "Prepared, Not Deployed" Is Zero Protection — and More Dangerous Than No Fix At All
**Source:** production investigation 30.09.2026 — `admin_invitations`' tightened Firestore rule (`allow read: if isRootAdmin()`, `firestore.rules` ~lines 1296-1300) was committed to `main` with its own comment stating "PREPARED, NOT DEPLOYED as of this commit." A live code-level gap found the same day (`/admin/authority/team`'s `localStorage`-sourced `authorityId`, unvalidated against the caller's own scope — see `00-MASTER-PLAN.md` §13.58) depended entirely on whether that rule was actually live. It could not be answered from the repository — only from the actual deployed state in Firebase, which git does not track.

A security fix that exists only in source control protects nothing — Firestore enforces whatever was last deployed, not whatever is most recently committed. This is already true of every `firestore.rules` change (see the Git/Deploy Rules in `CLAUDE.md`: deploy from `main` only, after merge, never from a feature branch), but "prepared, not deployed" is a sharper failure mode than an unmerged branch: the fix sits in plain sight on `main`, complete with a comment describing exactly what it protects — so a future reader (human or agent) has every reason to assume it's active. The comment that documents the fix is the same comment that makes the false assumption plausible. An unmerged branch at least looks unfinished; a merged-but-undeployed rule looks done.

**The rule:** any `firestore.rules` change lands with one of two things, never neither — (1) it is deployed in the same work session as the merge (deploy-from-main-after-merge, per `CLAUDE.md`), or (2) if deploy must wait (blocked on a dependent code change reaching production first, a coordinated multi-step rollout, etc.), the commit carries an explicit, loud "NOT YET DEPLOYED" marker AND a corresponding tracked follow-up item (`00-MASTER-PLAN.md` or equivalent) that stays open until deploy is confirmed. "Prepared but not deployed" is never a resting state left implicit in a code comment alone — every agent that reads a rules change must be able to find, without asking, whether it is live. When in doubt about whether a specific rule is actually deployed: say so explicitly and treat the protection as absent until a human confirms the live state (the Firebase console, or an explicit deploy confirmation) — never assume a committed rule is an enforced one.

---

## 28. A Time-Only Cache Doesn't Know Its Input Changed — Silent Dedup Can Swallow a Later Fix Whole
**Source:** production investigation 01.10.2026 — `mintAdminSessionCookie`'s 5-second uid-keyed dedupe (`src/lib/auth.service.ts`, added by commit `6510a27c`, 28.09.2026, to fix a real 429 rate-limit problem from redundant session-mint calls) silently absorbed a *later*, unrelated fix: commit `942a6cec` (30.09.2026) diagnosed a fresh-officer first-login failure and prescribed exactly one thing — re-mint the session cookie right after `accept-invitation` writes the user's real role to Firestore, since the cookie's `scope` is signed in at mint time from whatever Firestore said *at that instant*, not recomputed per request. That re-mint call went through the same `mintAdminSessionCookie` entrypoint `6510a27c` had just made authoritative — and because it almost always landed within 5 seconds of the prior mint, the dedupe guard returned its cached `true` without ever re-signing the cookie. The fix was correctly diagnosed, correctly written, and never once took effect — not because it was wrong, but because an earlier, entirely reasonable optimization two days prior had no way to know this particular call meant something different from every other redundant one it was built to absorb.

**The general shape, not a one-off:** a cache or dedupe guard keyed ONLY on elapsed time (or call count, or identity) — with no awareness of whether the underlying data its payload is derived from has changed — cannot distinguish "this repeat call is pure waste" from "this repeat call exists specifically because something changed and must be re-read." Both look identical from the cache's vantage point: same key, short interval, recent success. The cache has no way to tell them apart because it was never given anything to tell them apart WITH.

**The rule:** any dedupe/cache whose cached payload is derived from mutable underlying data (a Firestore doc, a role, a permission, anything that can change between calls) must carry an explicit, named invalidation/bypass path for a caller that KNOWS the input changed — not just a shorter TTL, not just "call it again and hope enough time passed." A bypass parameter that forces a real refresh, with a reason string that says WHY (self-documenting at every call site, not a bare boolean) is the minimum bar. The dedupe/cache itself stays — it solved a real problem and should keep solving it for the ordinary redundant-call case; the fix is giving it an escape hatch for the one case it structurally cannot detect on its own.

**The sharper, more dangerous half of this:** a silent optimization is more dangerous than one that fails loudly. `6510a27c`'s dedupe never logged, never errored, never behaved differently when it swallowed a semantically-necessary call versus a genuinely redundant one — both returned `true` and looked identical to every caller. A loud failure (a thrown error, a conspicuous warning) gets investigated the first time it's hit. A silent one gets diagnosed as something else entirely (here: a session/cookie-loop in a *different* file, two layers downstream) and can sit unnoticed through a full fix-and-ship cycle of the thing it's actually breaking. When writing or reviewing any cache/dedupe layer, ask explicitly: if this cache swallows a call that mattered, will anything ever surface that — or will it just look like success?

---

## 29. A Permission Clause Resting On Data Nobody Writes Is Not a Permissions Mechanism — It's Dead Code Wearing a Disguise
**Source:** production investigation 01.10.2026 — `firestore.rules`' `hasTenant(tenantId)` has three branches: `isRootAdmin()`, `isAdmin()`, and `request.auth.token.tenantId == tenantId`. The third branch is the only one that varies by WHICH tenant is being read — the entire reason the function exists instead of just calling `isAdmin()` directly. A repo-wide search for `setCustomUserClaims` found zero real call sites that ever set a `tenantId` claim — one comment noting the same search had already come back empty once before (§13.27), one unrelated migration-planning note. Nobody in this codebase has ever written that claim. The branch has been dead since the day it was written.

**The general shape, matching §27/§28's family exactly:** a security rule's conditional branch is only a real permissions mechanism if some code path actually produces the data it reads. A branch keyed on a custom claim nobody sets, a document field nobody writes, a flag nobody flips — reads exactly like a working scoped-access check in the rules file itself. Nothing about the rule's text, on its own, reveals that the branch can never fire. It LOOKS like protection — narrower than the collection-wide fallback, conceptually correct, exactly the shape a real fix would take — right up until a caller actually depends on it, at which point it silently contributes nothing and the fallback (here, `isAdmin()`) is the entire effective rule.

**Why this is dangerous in a specific, recurring way:** unlike a rule that's too permissive (which leaks data) or too strict (which breaks a feature loudly), a dead branch does neither on its own — it just never fires, forever, with no error and no signal. It's only caught by noticing the branch's OWN precondition is never satisfied anywhere else in the codebase, which requires actively searching for the writer, not reading the rule in isolation. A rules file can accumulate any number of these over time, each looking like real scoping to the next reader, none of them doing anything.

**The rule:** before trusting ANY rules branch that keys off something other than `isAdmin()`/`isRootAdmin()`/a plain document-owner check (a custom claim, a denormalized field, a flag) — find the writer. If no code path sets it, that branch is not a weaker form of protection than the fallback above it; it IS the fallback above it, with extra text. Treat an un-produced input the same as a missing one: the branch is inert, not "narrower." When reviewing or extending a rules file, grep for the actual writer of every non-trivial field a rule reads — same discipline axiom §25 already demands for `list`/query provability, applied one level earlier, to whether the rule's own inputs are real.

---

## 30. Firestore Rules — Dry-Run Compilation Check Before Any Deploy Instruction, Not After
**Source:** production incident 02.10.2026 — `docs/audit-2026-09/readiness-firestore-rules-proposal.md` v3's `match /readiness_thresholds/{docId}` was deliberately written with zero `allow` statements (comments only) to express "fully locked from the client" as literally as possible. The intent was correct and had been explicitly approved — but Firestore requires at least one declaration inside every `match` body; a comment-only block is a compilation error, not an empty-and-therefore-denying rule. David ran the deploy himself and hit it live in his terminal: `Error: Compilation error in firestore.rules: [E] 2330:5 - The 'match' body must contain at least one declaration.` Nothing deployed — Firestore rejects the whole file atomically on any compile error, so production rules were untouched — but the mistake still reached David's terminal instead of being caught before the instruction was ever handed to him.

**The general shape:** a rules change can look self-evidently correct by every review this agent is equipped to do — read the diff, reason about the intent, confirm it matches what was approved — and still fail to compile, because Firestore's grammar has requirements (a `match` body needs ≥1 declaration; others exist) that have nothing to do with the *security logic* being reviewed. Diff review proves the change says what you meant. It does not prove the file is valid Rules Language. Those are different questions, and only one of them was being checked.

**The rule:** before handing ANY firestore.rules change to David as ready for his review/merge/deploy — not after, not "if there's time" — run `firebase deploy --only firestore:rules --dry-run --project <project-id>` (the flag exists in firebase-tools 15.13.0, confirmed `--help` output; check for a given install if upgrading) and show the actual output, including the `✔ compiled successfully` (or failure) line. This performs a real compilation check against the live project's rules engine without deploying anything — it is not a local syntax linter, it is the authoritative compiler. If the dry-run flag is ever unavailable in some future CLI version: say so explicitly and state plainly that compilation is unverified — never claim a check was run that wasn't, and never invent a substitute check (axiom §27's "prepared, not deployed" trap has the same shape: an unverified claim of safety is worse than an honest "I don't know," because it gets trusted). David's own framing, verbatim: "זה לא טקס, זה עלה לנו סבב" ("this isn't ceremony, it cost us a round") — the dry-run is cheap (seconds, no deploy) precisely because the alternative is a human discovering a compile error in their own terminal after being told the change was ready.

---

## 31. Shape-Verification Against Production Is Impossible On An Empty Collection — First Write To A New Collection Needs Its Own Write-Then-Read Test
**Source:** production incident 03.10.2026 — `computeUnitRoster` (readiness-read.service.ts) threw a real 500 the instant the very first `readiness_results` document was ever written. Root cause: the Firestore Admin SDK returns `Timestamp` instances on read, never plain JS `Date` objects, even for a field written as `new Date()` — so `computeSoldierCurrentStatus`'s `.getTime()` call on `recordedAt` threw `TypeError: ...getTime is not a function` against the real document, verbatim. Every fake-db test in this build (write-service, read-service, both reviewed and green) hands back whatever JS object was stored, in memory, with no Firestore serialization in between — so none of them, no matter how many were written, could ever have caught this. The write side was tested. The read side was tested. The ONE thing never tested was the actual handoff between them through real Firestore.

This is NOT a gap that "shape-verification against a real production document" (the standing discipline this build already followed every round) could have caught either: `readiness_results` was empty until that exact write — there was no real document to verify a read against until the write that broke everything already happened. Shape-verification assumes a document already exists to check the code against; it has nothing to check when the collection is still empty, which is exactly the state every brand-new collection starts in.

**The general shape:** a fake-db test suite that stores and returns plain JS objects, never round-tripping through the real database's own serialization, can prove business logic (authorization, validation, scope resolution) correctly while staying structurally blind to any bug that only exists BECAUSE of that serialization round-trip — type coercion (Date↔Timestamp here; the same class of gap applies to any ORM/driver that silently changes a value's runtime shape between write and read). The emulator-free fake db is not wrong for what it was built to test; it was never asked to prove the one thing that actually broke.

**The rule:** the first write path to ANY new Firestore collection — before merge, not after a live incident proves it's needed — requires a dedicated integration test that calls the real write function and the real read function in the SAME test, against a fake db that faithfully reproduces the target database's own read-time type coercion (for Firestore specifically: wrap `Date` values in a `Timestamp`-shaped stand-in — `.toDate()`/`.toMillis()` present, `.getTime()` deliberately absent — at the point data is stored, so a `.get().data()` call returns the same shape the real Admin SDK would). A regular per-function fake-db test (write tested alone, read tested alone, each with its own convenient in-memory shape) is necessary but not sufficient — it is proof of business logic, not proof of the handoff. And because shape-verification against a real document is structurally impossible before any document exists: the FIRST deploy that can write to a brand-new collection must be followed by an immediate live check (the real action, through the real UI, against the real empty-then-no-longer-empty collection) before the round is called done — not deferred to "whenever David gets to testing it."

---

## 32. A Flag Predates Every Role That Later Reuses It — Opening a Role to a New Audience Means Auditing Every Listener, Not Just the Role's Own Code
**Source:** production investigation 06.10.2026 — three Cloud Functions (`functions/src/auditLogger.ts`, `runDataMigration.ts`, `previewNotificationContent.ts`) each carry their own copy of a `requireAdmin()` check that accepts `core.isTenantOwner === true` as a passing condition. Confirmed via `git log -S` on all three files: the condition was present from each file's own FIRST commit (2026-04-23/07-01/09-08) — written as a verbatim copy of `checkUserRole`'s generic "admin-ish flags" list, at a time when `core.isTenantOwner` had no real external meaning at all. The military/school vertical build later (Stage 0, 23-24.09.2026) turned `tenant_owner` into a real, invitable, externally-held customer role — and nobody went back to these three functions to ask whether a real customer should now pass their gate. One of the three (`runDataMigration`) turned out to be a live, global, destructive migration a real customer officer had standing access to trigger; confirmed harmless on the other two only after tracing their actual blast radius and real callers, not by inspection of the role's own definition.

**The general shape:** a boolean flag or role-name string has no inherent scope of its own — its real reach is the union of every place in the codebase that reads it, which is almost never visible from reading the code that WRITES it or the feature that currently grants it. When a flag is first introduced, whoever writes a NEW check against it is reasoning about the flag's meaning AT THAT MOMENT — which is a fact about the calendar, not a fact that updates itself later. A role that starts as an internal, developer-only convenience (every early holder of `core.isTenantOwner` was presumably internal, since the role had no external grant path yet) can be opened to a real external audience by a LATER, unrelated feature, while every OLDER reader of that same flag keeps its original, now-stale assumption about who could possibly hold it.

**Why this is easy to miss:** the later feature (the invitation flow that made `tenant_owner` real) has no reason to even know the three Cloud Functions exist — they live in a different part of the codebase, were written for an unrelated purpose (audit logging, a one-time migration, a notification preview), and their own code review at the time was correctly scoped to "does this function do what it's supposed to do," not "who else, system-wide, currently satisfies this exact boolean expression." The bug is invisible from either side: the Cloud Functions' own tests pass (they correctly admit whoever the flag-check says is an admin); the invitation flow's own tests pass (it correctly grants `tenant_owner` to the invited officer). Only tracing the flag itself, system-wide, independent of either feature, surfaces the mismatch.

**The rule:** before opening any existing internal role/flag to a new, wider, or external audience — or before building a NEW feature that reuses an EXISTING flag rather than introducing a dedicated one (exactly the trap this session nearly walked into, wiring a cross-brigade readiness feature to `core.isVerticalAdmin`) — grep every reader of that flag across the entire codebase, Cloud Functions included, not just the admin panel. For each reader found, trace its real blast radius (what can it actually do, who can actually reach it) as if a brand-new audience already holds the flag today — because by the time the role's meaning has changed, some of them already do. The flag is the thing with the wider, older history; the role riding on it today is the newer, narrower story — auditing the role's own code tells you nothing about the flag's full reach.

---

## 33. `== null` Matches a Field Set to `null` — Never a Field That Is Simply Absent
**Source:** production investigation 06.10.2026 — `admin/dashboard/page.tsx`'s super-admin authority picker called `getAllAuthorities(undefined, true)`, whose `topLevelOnly` branch filters server-side with `where('parentAuthorityId', '==', null)`. Confirmed directly against production (read-only script, David-approved): every `military_unit` authority has NO `parentAuthorityId` field at all — not set to `null`, simply never written. The query's own semantics silently excluded every one of them from the result. A brigade id saved by the vertical-overview list's row-click was therefore never found in that list, and the code fell through to `allAuths[0]` — an unrelated municipal authority, alphabetically first — instead of the real saved brigade. Click-through from "כל החטיבות" landed on a municipality's dashboard, not the brigade's.

**The general shape:** `where(field, '==', null)` is NOT "this field is empty/falsy/unset" — it is "this document has `field` present, with the literal value `null`." A document where the field was never written at all does not satisfy that comparison and is excluded, exactly the way a missing document is excluded from a `where(field, '==', 'x')` match. This is easy to misread as the SQL-ish intuition "`field IS NULL`" (which usually does mean "absent or null" in a relational database) — Firestore's semantics are narrower and do not work that way.

**Why this fails silently, same family as §29:** the query returns a valid, successful result — just an incomplete one. There is no error, no exception, no empty-collection warning; the caller sees a plausible-looking list that happens to be systematically missing every document from one entire category of writer (here: every authority-creation path that never set `parentAuthorityId` at all, as opposed to explicitly setting it to `null` for a genuine top-level entity). Exactly like §29's dead rules branch, the bug is invisible from reading the filtering code alone — it only surfaces by checking, directly against real data, whether the field is actually written everywhere the filter assumes it is.

**The rule:** before filtering any Firestore query on `where(field, '==', null)` (or relying on equivalent "is this field empty" logic elsewhere), confirm — against real documents, not assumed from the schema or a type definition — that every relevant writer actually sets the field, even when setting it to `null`. If some writers omit the field entirely rather than explicitly nulling it, the filter is not "narrower," it is wrong for an entire class of document, and needs either a `parentAuthorityId` backfill at every creation path, or an `OR` that also admits the field's absence (Firestore has no single-query way to express "field is null or missing" — a client-side filter after a broader read, or a schema fix, is the real options here).
