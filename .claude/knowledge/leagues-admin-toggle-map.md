# Leagues Admin Toggle — Map + Plan (read-only, 02.08)

> Status: investigation done, plan drafted. **Nothing applied.** Awaiting David's go-ahead per-gap.

## TL;DR — this is smaller than it looked

The admin-controlled toggle David asked for **already exists**, built on the exact same pattern as running/feed, with a leagues row already present:

- Storage: `system_config/feature_flags` (Firestore doc, public read / root-admin write) — field `enable_leagues` (bool).
- Reader hook: `src/hooks/useFeatureFlags.ts` → `flags.enableLeagues` (real-time `onSnapshot`, `SAFE_DEFAULTS` = all `false`, super-admins auto-bypass to `true`).
- Admin UI: `src/app/admin/system-settings/page.tsx` — leagues is already the **third card** (lines ~254–285), same `Toggle` component as running/feed, same `handleSave`.
- Nav gate: `BottomNavbar.tsx:47-54` shows the "חברתי" tab if `enableCommunityFeed || enableLeagues` (either on keeps the tab, correct — leagues shouldn't lose its only entry point when feed alone is off).
- Main route gate: `src/app/community/page.tsx` — redirects to `/home` and renders `null` when **both** flags are off; correctly treats feed and leagues as independent sub-surfaces of the same page.

So step 3 of the original ask ("add a `leagues` toggle to the same mechanism, default OFF") is **not new work** — it's already wired. **What's actually missing is coverage**: several real entry points into league content don't check `enableLeagues` at all, so turning the flag off does not fully hide leagues today. That's the actual gap to close.

⚠️ **Not yet checked: the live value of `enable_leagues` in prod Firestore right now.** Before relying on "OFF by default," read the actual doc — `SAFE_DEFAULTS` only apply if the doc/field is missing; if someone already flipped it true, it's live today regardless of what ships in code. Recommend a one-off `getDoc` check (read-only, safe) before doing anything else — flag if you want me to run it.

Also: `IS_LEAGUES_ENABLED` at `src/config/feature-flags.ts:55-59` is a **dormant, unused, compile-time constant** that mirrors nothing live (`true`, never imported). Naming trap — anyone who later grep-finds it and wires a check against it silently bypasses the real Firestore flag. Recommend deleting it or renaming it clearly as dead, low priority.

---

## Step 1 — running/feed toggle mechanism (the template, confirmed identical for leagues)

| | Running | Feed |
|---|---|---|
| Firestore field | `enable_running_programs` | `enable_community_feed` |
| Scope | onboarding running-schedule step, home dashboard mode, gateway card, profile-completion score | community tab, `/community`, `/community/[id]`, post-workout feed publish |
| Route guard | `src/app/onboarding-new/running-schedule/page.tsx:25-33` (redirect `/home`) | `src/app/community/page.tsx:131-135,449` (redirect `/home` when both feed+leagues off) |
| Non-hook read | — | `src/features/social/services/feed.service.ts:104-117` (raw `getDoc`, fail-closed, guards the post-creation *write*) |

Both are driven by the same doc/hook/admin-page as leagues — confirmed no separate mechanism needed.

## Step 2 — full leagues surface area, gate status per entry point

✅ = already respects `enableLeagues` (directly or via a gated destination). ⚠️ = gap, reachable regardless of the flag.

| # | Entry point | file:line | Status |
|---|---|---|---|
| 1 | Bottom nav "חברתי" tab | `BottomNavbar.tsx:47-54` | ✅ |
| 2 | `/community` page + in-page "ליגות" tab | `src/app/community/page.tsx` | ✅ |
| 3 | `/league`, `/arena`, `/feed` redirect stubs | `src/app/league/page.tsx`, `src/app/arena/page.tsx`, `src/app/feed/page.tsx` | ✅ (via destination) |
| 4 | Push-notification deep link `/league` (`League_Overtake`) | `src/lib/native/push.ts:386-414`, `init.ts:62-144` | ✅ (via destination) — **but confirm the Cloud Function queue itself isn't still enqueueing `League_Overtake` pushes when the flag is off; not reviewed (server-side, `functions/src/`)** |
| 5 | Gateway invite/session auto-join → `/community` | `src/app/gateway/page.tsx`, `src/app/session/[token]/page.tsx` | ✅ (via destination) |
| 6 | `MunicipalPressureCard` / `LockedArenaCard` (city segment) | inside `/community` | ✅ (page-gated) — but note: internally these also gate on `authority.isActiveClient` (`useArenaData.ts:186-213`) — a **separate per-authority axis**, not touched, just flagging the layering |
| 7 | **`NearbyGroupsRow`** — home screen "קבוצות קרובות אליך", shows/joins public groups incl. league types, inline `GroupDetailsDrawer` with working Join button | `src/app/home/page.tsx:1546`, `src/features/home/components/NearbyGroupsRow.tsx` | ⚠️ **no gate at all** |
| 8 | **`/search` page** — "groups"/"events" tabs, same public-groups backend, reachable from the global header search icon on every screen | `src/app/search/page.tsx`, `src/components/ui/AppHeader.tsx` (search icon) | ⚠️ **no gate at all** |
| 9 | **`/arena/create`** — the league-creation wizard itself ("צור ליגת שכונה/עבודה/בית ספר/יחידה"), fully functional, writes real groups | `src/app/arena/create/page.tsx` | ⚠️ **no `useFeatureFlags` import at all** |
| 10 | **`/community/[id]`** — group detail hub for any group incl. league-type groups | `src/app/community/[id]/page.tsx:67-74,147` | ⚠️ checks `enableCommunityFeed` **only**, never `enableLeagues` — wrong axis for league-type groups |
| 11 | **Achievements sheet** — "ליגות" category rendered unconditionally (rank/standing copy) | `src/features/user/progression/components/AchievementSheet.tsx:215-221`, reachable from `/profile` | ⚠️ **no gate** (cosmetic — no navigation, but leaks league terminology/ranks) |
| 12 | **`/join/[inviteCode]`** preview (before auth) | `src/app/join/[inviteCode]/page.tsx` | ⚠️ preview renders group name/schedule/members with no flag check (only the post-join redirect destination is gated) |
| 13 | `/challenge/[inviteCode]` "Maccabiah" campaign pages — copy references "ליגת האתגר", separate marketing surface reusing group/leaderboard backend | `src/app/challenge/[inviteCode]/page.tsx` | Likely out of scope (different product surface) — confirm with David rather than assume |

---

## Step 3 — plan to close the gaps (apply only after approval, per gap)

Same mechanism throughout — no schema change, no new doc, no new hook. Every fix is: import `useFeatureFlags`, add the same redirect+render-null guard already used in `/community`, `/community/[id]`, and the onboarding running-schedule page.

1. **`NearbyGroupsRow` (home)** — needs a product decision first: does this row ever show *non-league* public groups (plain social groups), or are all `getPublicGroups()` results league-type by construction? If leagues-only → wrap the whole row's mount in `flags.enableLeagues`. If mixed → filter results by group type/kind before rendering, only excluding league-type groups. **Flagging as a decision point, not assuming.**
2. **`/search` page** — same decision as #1 applies to the "groups" tab. Simplest safe fix: gate the groups tab (or filter league-type entries out of it) the same way; "events" tab likely untouched (confirm it's not league-specific).
3. **`/arena/create`** — copy the exact `/community` guard pattern: `useFeatureFlags()` → redirect to `/home` + `return null` while loading/off. Straightforward, no ambiguity — this route is 100% league creation.
4. **`/community/[id]`** — needs group-type awareness: this page already fetches the group doc, so it can branch — if the fetched group's type is a league-type, gate on `enableLeagues`; otherwise keep the existing `enableCommunityFeed` check. (Today it's single-axis and wrong for league groups.)
5. **`AchievementSheet`** — wrap the `leagues` category in `CATEGORY_ORDER` render with `flags.enableLeagues` (or filter it out of the mapped array when off). Low-risk, cosmetic-only fix.
6. **`/join/[inviteCode]` preview** — lower priority (invite-only, needs a real code to reach); if David wants full parity, add the same guard once the group's type is known.
7. **Server-side push queue (`functions/src/sendPushFromQueue.ts`, `League_Overtake`)** — separate investigation needed (Cloud Functions side, not reviewed here). Flag to David: closing the client gates doesn't stop the notification from being *sent*, only from landing on working content once tapped (destination route will already be gated by #3/#4 fixes... but `/league` itself redirects into `/community` which is already ✅, so this may already be safe — worth a quick confirmation read of the function, not urgent).
8. **Dormant `IS_LEAGUES_ENABLED` constant** — optional cleanup, delete or clearly mark dead to prevent a future bug where someone wires against it instead of the real flag.

## Verification once applied (per axioms.md — measure, don't assume "TSC clean" = working)

- `enableLeagues = false`: no leagues tab, `/community?tab=leagues` no leagues UI, `/arena/create` redirects out, `/community/[id]` on a league-type group redirects out, home screen shows no league-type groups in `NearbyGroupsRow`, `/search` groups tab shows no league-type groups, achievements sheet has no "ליגות" category, direct `/league` deep link lands somewhere safe.
- `enableLeagues = true`: everything above returns, nothing else regresses (feed-only groups still visible when `enableCommunityFeed` alone is on).
- tsc = baseline (no new errors).
- No push to main until David reviews.
