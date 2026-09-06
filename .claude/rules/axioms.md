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
- `firestore.rules` (Stage 2 Phase 2.5, not yet deployed as of Stage 1B) — client-SDK/admin-UI-only defense-in-depth; cannot stop Admin-SDK script writes (those bypass rules by design), which is why the chokepoint above is the primary enforcement for scripts.

As of Stage 1B, only 4 write paths were migrated to the chokepoint: `InventoryService.saveRoutes`/`saveCuratedRoutes`/`updateRoute`, and `scripts/geo-discovery-routes.ts`. The surface-type phase (17.08.2026) added a 5th: `osm-segment-importer.ts`'s `commitSegmentsToFirestore`. Stage 3 (spatial join, 17.08.2026) added a 6th, chokepoint-migrated from birth: `InventoryService.recomputeRouteEnrichmentForCity` (climb_segments/official_routes/street_segments cross-ref writes). Its pure geometry lives in a separate, deliberately I/O-free sibling file (`route-enrichment.service.ts`) that never touches Firestore directly and is therefore NOT itself in `AUTHORIZED_ROUTE_WRITERS` — same reasoning `route-adjacency.service.ts` (its structural precedent) is also absent from that list. The rest of the ~14 originally-known writers are authorized (in the safety-check allowlist) but not yet chokepoint-enforced — migrated as each is generalized for multi-city use, which is how the count keeps climbing one phase at a time rather than in one big-bang pass.

---

## 24. Third-Party Library Options — a Key Present-with-`undefined` Is Not the Same as an Absent Key
**Source:** production incident 06.09.2026 — `qr-code-styling` constructor crash on `/admin/links` drawer open; full writeup `docs/architecture/marketing-attribution.md` §16.7

When building an options object for a third-party library that merges caller options over its own defaults — a shallow `Object.assign`/spread, which is the overwhelmingly common implementation — a key that is PRESENT with value `undefined` is NOT equivalent to an ABSENT key:
- Absent key → the library's own default for that key survives the merge, untouched.
- Present-with-`undefined` key → the merge OVERWRITES the library's default with `undefined`. If any internal code then dereferences a nested field on that value without an optional-chaining guard (`options.someKey.nestedField`), it throws — exactly what happened here (`imageOptions.hideBackgroundDots`).

Concretely: `someKey: condition ? {...} : undefined` is the wrong shape whenever `someKey` has a real, non-empty library default. Use a conditional spread instead — `...(condition ? { someKey: {...} } : {})` — so the key is fully absent, not present-with-`undefined`, when the condition is false.

**Test-writing corollary**: `expect(options.someKey).toBeUndefined()` passes identically whether the key is absent or present-with-`undefined` — it cannot distinguish the two, and 31 passing tests failed to catch this exact bug for precisely that reason. When the intent is "key must be absent," assert `Object.prototype.hasOwnProperty.call(options, 'someKey') === false`, not just that the value reads as `undefined`.

This will recur with any future dependency that does default-merging (most do) — check this pattern whenever writing an options-builder for a newly-adopted library, not only for `qr-code-styling`.
