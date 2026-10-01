# re-seed-authorities.ts — non-empty-collection guard

01.10.2026. Follow-up to `docs/audit-2026-09/authority-boundary-backfill-report.md`'s §3 blast-radius question, which surfaced this as the real risk — not the `name` field fix it was originally asked about.

## 1. What the script actually deletes and writes (read-only, before any fix)

**Deletes:** every doc in `authorities` except one whose id or `name` contains `__SCHEMA_INIT__`. No other filter. Confirmed via direct read of `authorities/dRk9LUrVnTlNc7EbOdvq` (אשקלון, the paying client named as the stakes):

```
real fields (21): activityLog, boundaryGeoJSON, cluster, contacts, coordinates,
createdAt, financials, gatingMode, hierarchyLevel, isActiveClient, logoUrl,
managerIds, name, parentAuthorityId, pipelineStatus, status, type, unitCount,
updatedAt, userCount, vertical
```

`contacts` holds real named people with real emails (e.g. a sports-department contact with a `@ashkelon.muni.il` address). `isActiveClient: true`, `pipelineStatus: 'active'`.

**Writes** (via `createAuthority`, from the static `src/lib/data/israel-locations.ts`):

```
name, type, parentAuthorityId, logoUrl, coBrandingEnabled, managerIds,
userCount, status, isActiveClient, coordinates, contacts, pipelineStatus,
activityLog, tasks, contactType, contactValue, contactPersonName,
pressureCount, createdAt, updatedAt
```

**Fields on the real doc that the new doc never gets at all** — not defaulted, not present: `boundaryGeoJSON` (today's 155), `financials`, `cluster`, `gatingMode`, `hierarchyLevel`, `unitCount`, `vertical`, `district`, `authorityCode`.

**Fields that exist on both but get reset to a worse value:** `status` ("active" → "inactive"), `isActiveClient` (true → **false**, directly the field axioms.md §6 says must never change without David's written approval), `pipelineStatus` ("active" → "lead", a backward pipeline move the CRM rules explicitly forbid), `contacts`/`activityLog` (real data → `[]`), `managerIds` (real assignments → `[]`).

🔴 **The worse finding, bigger than any field diff:** `createAuthority` calls Firestore's `addDoc` — an auto-generated new document ID, not the original one. Every foreign-key reference to an authority anywhere in this app (`users.core.authorityId` per axioms.md §20, `parks`/`official_routes`/`climb_segments`/`street_segments`/`route_adjacency`.authorityId per §23, CRM tasks, invitations, join flows) points at a Firestore document ID that would no longer exist. This isn't a field-loss problem, it's an app-wide orphaned-reference problem — re-seeding doesn't just reset Ashkelon's CRM data, it silently breaks every user, park, and route currently linked to Ashkelon's authority doc.

## 2. The guard (code, not a comment)

Three guards already existed (`KNOWN_PRODUCTION_PROJECT_ID` check — unconditionally refuses "appout-1" since no separate staging project exists; `ALLOW_DESTRUCTIVE_RESEED` env var; `confirmPhrase` parameter). None of them check whether the collection is actually non-empty, and the project-id check is the only one that currently makes this script fully inert — a true guarantee, but a single hardcoded string match, not defense-in-depth.

🔴 **Found while reading the existing guards (bigger than the original question):** the `confirmPhrase` guard is already defeated in a live, shipped code path. `src/features/admin/hooks/useAuthorities.ts`'s `handleReSeedAuthorities` passes `confirmPhrase: 'DELETE ALL AUTHORITIES'` **hardcoded in source** — a human only has to click a button and then click OK on one generic browser `confirm()` popup. They never type anything. That's the exact "documentation doesn't stop execution" failure mode from this week's other two incidents, except here it was a parameter check, not a doc — same actual outcome.

**New guard** (`src/features/admin/services/re-seed-authorities.ts`): if the collection is non-empty and not a dry run, require `process.argv` to literally contain `--i-understand-this-deletes-a-nonempty-collection`, checked immediately before the delete loop, in addition to (not instead of) the three existing checks. This is deliberately a `process.argv` check, not a new parameter — a parameter can be hardcoded by a caller exactly like `confirmPhrase` already was. `process.argv` reflects how the actual OS process was launched:
- The API route runs inside the Next.js server process, whose argv is fixed at server startup — no request body can change it.
- The UI hook calls the function **directly in the browser** (client SDK, confirmed by reading `useAuthorities.ts` — it's a React hook, no server round-trip for this path at all). `process` has no real meaning in a browser bundle; the check either throws immediately or evaluates to blocked. Either way it fails closed.

No CLI entry point was added to make the flag easy to pass — that friction is the point. A genuine future need (e.g. once a real staging project exists) requires someone to deliberately write and run a script that does this, a reviewed action in itself.

**Verified:** isolated unit-level check of the exact boolean (empty→allowed, non-empty+no-flag→blocked, non-empty+flag→allowed, non-empty+similar-but-wrong-flag→still blocked) — all four as expected. `tsc --noEmit` clean. **Not verified:** a full live run through the real function — `re-seed-authorities.ts`'s import chain pulls in `shpjs` (a browser-only shapefile library) somewhere upstream, which throws `ReferenceError: self is not defined` under plain Node/tsx, unrelated to this change. This means the function has apparently never been exercised outside an actual browser/Next.js context — a pre-existing gap, not introduced here, but it means this guard's end-to-end behavior is verified by code reading + isolated logic testing, not a live run. Flagged as "לא אומת" for the full integration, per instruction.

## 3. Other whole-collection-delete scripts (mapped, not fixed)

Searched for self-documented "deletes all/entire collection" language plus files with unfiltered `getDocs()`/`.get()` immediately followed by a delete loop. Checked every plausible hit:

- **`seed-israeli-authorities.ts`** — confusingly similar name, but confirmed additive/idempotent: checks `getAllAuthorities()` and skips any location "already exists by name," no `deleteDoc` anywhere in the file. Not destructive. (Side note: because it dedupes by `name`, a future `name` fix on an existing authority — e.g. קרית אונו — would make this seed script fail to recognize it as existing and could create a duplicate from the static file. Worth remembering when that fix is picked up, not an issue today.)
- **`functions/src/runDataMigration.ts`** — a different kind of destructive admin tool (renames tenant/unit document IDs), with its own documented past incident: originally a public HTTPS endpoint gated only by a hardcoded secret query param, "anyone with the URL could wipe and rename every tenant." Already hardened (Fortress Phase, Apr 2026) — real ID-token auth + 3-path admin verification. Not a whole-collection delete+recreate pattern like re-seed-authorities.ts; flagged only because it's in the same "powerful admin tool, historically under-protected" family.
- **`scripts/delete-ashkelon-routes.ts`** — correctly scoped: queries `official_routes`/`curated_routes`/`street_segments` with `where('city', '==', 'אשקלון')` (or `cityName`); the one unfiltered `route_adjacency.get()` call is commented as reading a small (88-doc) collection to filter client-side, not a bulk delete of it. Not a wipe risk.
- **`functions/src/legalHold.ts`** — deletes only *expired* (7-year-old) legal-hold archives on a schedule; a data-retention mechanism, not a collection-wipe risk.
- **`community.service.ts`**'s unfiltered `getDocs(collection(db, GROUPS_COLLECTION))`  — a pure read (`getAllGroupsForAdmin`, an admin list screen), no delete attached.

**Conclusion: `re-seed-authorities.ts` is genuinely unique in this codebase** for the "delete the entire collection, recreate from an incomplete static file" pattern. ~80 other files touch `deleteDoc`/`.delete()` somewhere; none of the ones checked here share this shape. Not every one of the ~80 was traced individually — the search was keyword- and pattern-targeted at the specific risk shape (whole collection, no scoping filter), not an exhaustive file-by-file read.

## Status

Code change: new guard in `re-seed-authorities.ts` only. Nothing else touched. Zero Firestore writes made by this investigation. Separate PR, not merged — main freeze (Google Play review) still in effect.
