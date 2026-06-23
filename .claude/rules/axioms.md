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
The ONLY authorized writer is the `awardWorkoutXP` Callable Cloud Function ("The Guardian").
Client code MUST route through `src/lib/awardWorkoutXP.ts`.
Firestore rules (`noGameIntegrityFieldsChanged()`) reject any direct client write.
DO NOT invent bonus formulas — every value must trace to a row in `.cursoragents/XP_Progression_Truth.md`.

## 3. StrengthRunner Boundary
**Source (existence):** `src/features/workout-engine/players/strength/StrengthRunner.tsx` (verified — "Spotify-style decoupled live workout player")
**Source (boundary rule):** ⚠️ unverified — oral convention from chat, not written in any file.

StrengthRunner is the strength-session player. It is currently stable.
Convention (⚠️ unverified): do not modify without an explicit request naming StrengthRunner by name.
Confirm the boundary rule with David before treating it as a hard law.

## 4. Google APIs — Dynamic Import Only
**Source:** `CLAUDE.md` line 32

`await import('googleapis')` and `await import('google-auth-library')` only — NEVER top-level.
Reason (as stated in CLAUDE.md): "hangs webpack on this machine."
This applies to every file in the codebase — no exceptions.

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

## 15. API Route Guards
**Source:** `CLAUDE.md` line 30

Every API route under `src/app/api/admin/` must begin with `requireAdminApi(request)`.
No exceptions. Firebase Admin SDK via `getAdminDb()` / `getAdminAuth()` from `src/lib/firebase-admin.ts`.

## 16. PLACEHOLDER Rule — Knowledge Files
**Source:** Established convention — Block D infrastructure session, 22.06.2026

If a knowledge file contains `⚠️ PLACEHOLDER` anywhere in its body:
- Treat the **entire topic** covered by that file as unknown
- Do NOT present placeholder content as fact
- Do NOT invent information around the gap or attempt to fill it from memory
- Surface the gap explicitly: "הקובץ `<name>` מכיל PLACEHOLDER — אין לי מידע אמיתי על `<topic>`. יש לשאול את דוד."

This applies to every agent and skill that loads knowledge files.
A PLACEHOLDER file is safer than a missing file — it signals a known unknown instead of a silent gap.
