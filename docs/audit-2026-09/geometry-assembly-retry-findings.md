# Geometry-assembly "bug" — investigation + report-classification fix

01.10.2026. Follow-up to the authority-boundary-backfill audit. David's ask: diagnose the 17 "relation matched but boundary geometry could not be assembled" FAILs — רעננה and רמת השרון (Herzliya's two neighbors) first — before writing any fix.

## 1. Raw data on רעננה (relation/1383630)

9 members: 8 ways (all role=`outer`) + 1 node (role=`label`). 151 nodes returned, 0 ways missing, 0 ways without geometry. No sub-relation members. `osmtogeojson` assembled this into a valid `Polygon` on the first clean retry — no ring-closure problem anywhere.

## 2. Diagnosed all 17, not just the 2

Ran the exact query `fetchCityBoundary` uses (no changes to that file) against all 17, inspecting raw member counts/roles/sub-relations and `osmtogeojson`'s full output, not just the pass/fail filter. Result: **17/17 assembled correctly once given a complete Overpass response** — including the structurally hardest cases in the set (ביתר עילית: 3 outer + 15 inner rings; מועצה אזורית גולן: 24 outer + 7 inner + an admin_centre node; אלפי מנשה: 6 outer + 2 inner). Zero sub-relation members anywhere. Zero genuine ring-closure failures.

**Conclusion: not a code bug, not one, not several.** `fetchCityBoundary`/`osmtogeojson` correctly handles every shape tested. `fetchCityBoundary` itself was not modified — confirmed clean by this investigation, not assumed.

## 3. The real bug: the SCRIPT's own classification conflated network failure with a negative result

`fetchCityBoundary` throws on ANY failure to produce a Polygon/MultiPolygon — including a pure network timeout, not just a genuine structural defect. The old code in `backfill-authority-boundaries-bulk.ts` caught that exception and funneled it straight into `classify()`'s generic "relation matched but boundary geometry could not be assembled" message, indistinguishable from an actual defect. That's the entire root cause of all 17 — confirmed by both the manual diagnostic above and, independently, by the fixed script itself (below).

David's follow-up question raised the real issue: could the SAME conflation have hit the 88 "no OSM relation matched" entries too? A timed-out Overpass query returns zero results with no thrown error — indistinguishable, by message alone, from a genuine no-match.

## 4. The fix

`scripts/backfill-authority-boundaries-bulk.ts`:
- `Verdict` gains a 4th value, `RETRY`, distinct from `FAIL`. Any exception from `findAdminRelationsByName` or `fetchCityBoundary` now sets `verdict: 'RETRY'` and **`status: 'pending'`** — so the existing resume mechanism picks it up again on the next invocation, with zero new code for that part.
- `findAdminRelationsByName` now also checks the raw Overpass response's `remark` field (present when Overpass silently truncates/times out a query but still returns HTTP 200 — a field `fetchOverpassRaw`'s declared return type doesn't name, but the raw object still carries at runtime) and throws if present, routing that case through the same RETRY path instead of letting a truncated empty response masquerade as a confirmed no-match.
- A clean, exception-free response — real zero matches, real multiple matches, or a successfully-fetched feature — is still a confirmed, `status: 'done'` PASS/FLAG/FAIL exactly as before. Nothing about matching logic itself changed (no normalization, no fuzzy matching — per the explicit instruction not to loosen that).
- Report (`writeReport`) now shows RETRY as its own row category and surfaces a count/warning when any remain unresolved.

## 5. Re-ran on all 106 original failures (not just 17), to convergence

Reset all 106 FAIL entries to `pending`, ran the fixed script to completion, then kept re-running (same command, no flags) as RETRY entries automatically re-queued themselves — 5 passes total until zero RETRY remained.

**Before → after (fully converged, RETRY: 0):**

| | before | after |
|---|---|---|
| PASS | 148 | **165** |
| FLAG | 1 | 1 |
| FAIL | 106 | **89** |

**All +17 came from the 17 geometry-assembly entries — every single one flipped to PASS.** Verified precisely: compared each of the original 17 names against their final verdict; all 17 are now PASS (matches the manual diagnostic exactly).

**Zero of the original 88 "no OSM relation matched" entries flipped — all 88 remain FAIL after full convergence, RETRY: 0 for this bucket specifically too.** David's hypothesis about classification confusion was correct and real — but it specifically hit the geometry-assembly bucket, not the no-match bucket. The number 88 (not quite the ~86 estimated verbally earlier — the real committed count) **was real**, confirmed, not an artifact of the same bug.

The 1 ambiguous case (ירושלים, 2 relations matched) also reconfirmed as genuinely FAIL on a clean response — not network-related, a real multi-match.

## Status

Code change: `backfill-authority-boundaries-bulk.ts` only (the classification/retry logic) — `fetchCityBoundary`/`osm-boundary-fetch.node.ts`, the matching logic (`findAdminRelationsByName`'s exact-string matching), `REGIONS`, and the discovery engine are all untouched, per instruction. Committed as a follow-up on the existing `feat/bulk-authority-boundary-backfill` branch (PR #83) rather than a new branch — this is a direct correction to that PR's own script and its own Stage A report, not a separate deliverable.

Zero Firestore writes. Stage B not run for the 17 newly-PASS authorities — awaiting approval, same rule as before (dry-run → report → approval → write, additive-only, single-field merge, never overwrite an authority that already has a boundary).
