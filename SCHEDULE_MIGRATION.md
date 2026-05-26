## Schedule Migration — entries[] format

### Why
Replaced flat Firestore docs + _2 suffix pattern with a single doc per day
containing entries[]. Enables unlimited workouts per day, community sessions
as first-class entries, and cleaner drag/move logic.

### Completed Steps
- [x] Step 1 — Types: entryId, groupId, groupName, UserScheduleDay, CommunitySessionRef deprecated
- [x] Step 2 — Service: normalizeDay shim + getScheduleDay / getScheduleEntries / addScheduleEntry / removeScheduleEntry / removeCommunityEntriesForGroup
- [x] Step 3 — Service: hydrateFromTemplate + upsertScheduleEntry write entries[] format
- [x] Step 4 — Service: getScheduleEntry / getAdditionalScheduleEntry / getWeekEntries read via shim
- [x] Step 5 — Service: moveScheduleEntry uses entryId, sourceSuffix deprecated
- [x] Step 6 — communitySchedule.service: frequency-aware expandSlotDates, 12-week horizon, addScheduleEntry/removeCommunityEntriesForGroup
- [x] Step 7 — AgendaDayCard: extract StrengthCard + community badge
- [x] Step 8 — AgendaDayCard: entries state + getScheduleEntries
- [x] Step 9 — RollingAgenda: entryId in MoveIntent
- [x] Step 10 — MonthlyCalendarGrid: entries array, multi-dot
- [x] Step 11 — StatsOverview: getScheduleEntries, skip community
- [x] Step 12 — SmartWeeklySchedule: patch ICS export (community entries)
- [x] Step 13 — Migration script written: `scripts/migrate-schedule-entries.ts`
- [x] Step 14 — Cleanup: shim removed, _2 dead-code gone, CommunitySessionRef
      gone, sourceSuffix gone, getAdditionalScheduleEntry gone

### Remaining Steps
- [ ] **Step 13a — Operator action: run the migration script.** This MUST happen
      against staging *and* production before the Step 14 cleanup is deployed.
      ```
      # preview
      npx tsx scripts/migrate-schedule-entries.ts --dry-run
      # execute
      npx tsx scripts/migrate-schedule-entries.ts
      ```

### ⚠️ DEPLOY GATE — Read before merging Step 14

Step 14 removes the `normalizeDay` runtime shim that was silently translating
legacy `_2` docs and `communitySessions[]` fields on the fly. After Step 14
is deployed, the runtime treats any doc that lacks an `entries[]` array as
empty (with a one-shot console warning naming the docId).

**If Step 13a hasn't run in production when Step 14 ships, every user with
any of:**
- a legacy flat doc that still has top-level `type` / `programIds` instead of `entries[]`,
- a `{uid}_{date}_2` overflow doc,
- a doc with a top-level `communitySessions[]` field,

**will see those workouts silently disappear from the planner.** Their data
is not destroyed — it remains in Firestore — but it is invisible to the app
until the migration script runs.

Recommended order:
1. Merge & deploy Steps 1–13 (already done — `normalizeDay` shim is in place).
2. Run `--dry-run` against staging, sanity-check the counters, then run live.
3. Smoke-test the planner / calendar / agenda on staging.
4. Run `--dry-run` against production, then live.
5. Wait 24–48h confirming no schedule-related bug reports.
6. **Then** deploy Step 14 cleanup.

### New Architecture
- Every day = one Firestore doc: `{ userId, date, entries: UserScheduleEntry[], updatedAt }`
- Community sessions = `source: 'community'` entries with `groupId` + `groupName`
- Multiple workouts per day = multiple entries in the same `entries[]` array
- The `_2` suffix pattern is gone; ditto the legacy `communitySessions[]` field.

### Step 14 — what changed in code

**`src/features/user/scheduling/types/schedule.types.ts`**
- Removed `CommunitySessionRef` interface.
- Removed `communitySessions?: CommunitySessionRef[]` field from `UserScheduleEntry`.
- Reframed the `entryId` doc comment — it's optional only for transient
  in-memory entries (e.g. the `scheduleDays`-driven recurring fallback in
  `AgendaDayCard.tsx`). Persisted entries always carry one.

**`src/features/user/scheduling/services/userSchedule.service.ts`**
- Removed `normalizeDay` shim. Replaced with `readDay`, which asserts the
  `entries[]` shape and emits a one-shot warning on legacy data.
- Removed `getAdditionalScheduleEntry` (no remaining callers).
- Removed the `sourceSuffix: '_2' | ''` parameter from `moveScheduleEntry`
  (and the `sourceEntries[1]` legacy branch). Source resolution now goes
  `entryId` → priority heuristic → `fallbackEntry` synthesis.
- Removed `CommunitySessionRef` import.
- Fixed three pre-existing `TS2352` casts (`as Record<string, unknown>`
  → `as unknown as Record<string, unknown>`) so the file is now strict-clean.

**`src/features/home/components/agenda/RollingAgenda.tsx`**
- Dropped the `''` positional `sourceSuffix` arg from both `moveScheduleEntry`
  call-sites.

**`scripts/migrate-schedule-entries.ts`**
- Comments updated — the script is now the canonical legacy converter; no
  runtime shim mirrors it any more.

### Migration Script Behaviour (Step 13)
File: `scripts/migrate-schedule-entries.ts`

- Idempotent — re-runnable. Skips docs already in `entries[]` shape.
- Pages the `userSchedule/` collection (500-doc pages, ordered by __name__).
- For each primary `{uid}_{date}`:
    - Wraps the flat doc as a single entry in `entries[]`.
    - If a `{uid}_{date}_2` exists, merges its body as a second entry then
      deletes the `_2` doc.
    - If the primary's `communitySessions[]` is set, promotes each
      `CommunitySessionRef` to a first-class `source: 'community'` entry
      with `groupId` / `groupName` / `startTime` / `scheduledCategories`.
    - Community-only wrappers (source === 'community' AND
      communitySessions[] populated) emit only the community entries —
      no duplicate "personal" entry from the placeholder fields.
- Orphan `_2` docs (primary missing) are migrated standalone into a primary
  doc at the un-suffixed path, then the `_2` is deleted.
- Synthetic entryIds are stable across re-runs:
    - primary  → `legacy_{docId}`
    - secondary → `legacy_{docId}_2`
    - community → `legacy_community_{date}_{groupId}`
- `--dry-run` previews what would change without writing.

**Credentials & project ID** — auto-discovered in this order, first hit wins:
1. `FIREBASE_SERVICE_ACCOUNT_KEY` env (inline JSON; same as `src/lib/firebase-admin.ts`).
2. `FIREBASE_SERVICE_ACCOUNT_PATH` env (filesystem path to a SA JSON file).
3. `GOOGLE_APPLICATION_CREDENTIALS` env (filesystem path).
4. `serviceAccountKey.json` at the project root.
5. Application Default Credentials (`gcloud auth application-default login` /
   Cloud Run / Firebase Hosting Functions).

Project ID resolves from the SA JSON if loaded, then
`NEXT_PUBLIC_FIREBASE_PROJECT_ID` → `FIREBASE_PROJECT_ID` (read from
`.env.local` or `.env`) → hardcoded `appout-1`. The script always passes
`projectId` explicitly, so the "Unable to detect a Project Id" error from
Firestore can never recur even when running under ADC alone.
