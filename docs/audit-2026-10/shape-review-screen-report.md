# Shape-review screen — stage 1

**Branch: `route-approval-screen-geometry`**

Built 05.10.2026. Screen: `/admin/routes/shape-review` (superAdmin-only, same gate as the Accuracy Queue tab). Does not touch `route-generator`, `route-stitching.service.ts`, or `decide-accuracy.ts`'s computation. Does not approve, reject, or delete any route anywhere on this screen. No automation decides anything — every write is triggered by a human clicking one of ✅/❓/❌ in the panel.

## What got written (facts, not judgment)

`scripts/backfill-route-shape-classification.ts` (reuses `profileRoute`/`toRouteDoc` from the measurement script verbatim — not re-derived) wrote `shapeType`, `geometryMetrics`, `isReviewPriority`, `suggestedReasonChips` onto all 97 pending routes. No decision field was written by this script — `shapeTrainingReview` (the ✅/❓/❌ + chips) only ever gets written by a human clicking a button in the live screen.

### Shape breakdown, by city — the refinement your estimate predicted

| city | 🔵 loop | 🟢 linear corridor | ⚪ unclassified | total |
|---|---|---|---|---|
| חיפה | 5 | **15** | 50 | 70 |
| הרצליה | 19 | 0 | 4 | 23 |
| קריית אונו | 4 | 0 | 0 | 4 |

You estimated "65 Haifa routes → ⚪." The real number, once linear corridors are actually identified (name-pattern match, including the "ואדי" extension you asked for — it caught 10 more wadi trails beyond the 5 already-known טיילת routes): **15 of those 65 are confirmed legitimate corridors, not unknowns. 50 remain genuinely ⚪.** Closure-gap distribution for those 50 is in `geometryMetrics.closureGapM` on each doc now — queryable directly, not something you need to ask for separately anymore.

## (א) Shape classification

Computed once, stored as a real field (`shapeType`), not a client-side filter:
- 🔵 **loop** — closed (≤50m gap, the same structural threshold from the measurement report). All 3 compactness numbers computed and stored.
- 🟢 **linear_corridor** — not closed, name matches טיילת/רצועה ירוקה/רצועת חוף/שביל טבע/ואדי. Compactness not computed, not penalized — `geometryMetrics.compactness: null`.
- ⚪ **unclassified** — not closed, no name match. Neither approved nor rejected. `closureGapM` is still persisted so you can judge it.

## (ב) The screen

List/Map toggle, same filtered set feeds both. City filter (searchable dropdown, same UX pattern as `/admin/routes`' own authority search) is **optional for list, enforced for map** — switching to map with no city selected shows a prompt instead of a national spaghetti map, exactly as specified.

Clicking a route (list row or map line) opens the **existing** `ApprovalDetailModal` — not a new panel. Added one new section to it (`RouteShapeReviewSection`), gated behind a new optional `shapeReviewAdmin` prop so every other caller of this modal is byte-for-byte unaffected. Shows shape classification, the 3 geometric numbers **as numbers, no verdict**, closure gap in meters, self-overlap in percent, then the chip picker and ✅/❓/❌.

**Caught and fixed before shipping**: my first wiring would have shown the modal's own native "אשר/דחה" buttons *alongside* my new ones — wired to no-op handlers on this screen, since this screen has nothing to do with publishing. Added a `hideNativeActions` prop to suppress them cleanly rather than leaving two sets of buttons where one silently does nothing.

## (ג) Reason capture

`shape-review-chips.ts` — the exact 8 rejection + 5 approval chips you specified, no free-text-only option. Free text is a genuine optional *supplement* (always present, never required, never the only field submitted).

## (ד) The seven, pinned first

Not hardcoded IDs in UI code — `isReviewPriority` is computed in the backfill script using the **exact cut-(b) criterion already validated in the measurement report** (certificate verdict=approve AND bottom-quartile on all 3 compactness measures): **7 routes, confirmed identical to the report's list.** Suggested chip `['לא באמת מסלול']` is pre-filled in the UI's chip state (`suggestedReasonChips`) — visibly selected when the panel opens, but nothing is submitted until you click ❌ yourself. The list sorts these 7 first.

## (ה) Certificate label

`AccuracyQueueTab.tsx`, one line: `· ביטחון {confidence}%` → `· ניקיון הרכב: {confidence}%`. Computation, thresholds, `decide-accuracy.ts` — all untouched. Comment left in place explaining why, so the next person reading this line doesn't wonder.

## Constraints — confirmed, not just stated

- No route-generator/route-stitching/decide-accuracy.ts computation changes.
- No approve, reject, or delete anywhere on this screen.
- Zero automation deciding anything — `isReviewPriority`/`suggestedReasonChips` are *suggestions* persisted as data, submitted only on a human click.
- `tsc --noEmit`: zero errors in every file this PR touches (confirmed — the ~800 pre-existing repo-wide errors are all in unrelated files, unchanged by this PR).

## Not done — flagged, not decided

- Map component is a genuinely new extraction (`RouteShapeReviewMap.tsx`), not a copy-paste into a 3rd/4th/5th inline implementation. Worth knowing: there were already 4+ independent `react-map-gl` wrappers in this codebase before this PR (confirmed by direct investigation), not 2 — this is the first one actually extracted as a reusable component, closely following the established `/admin/routes` pattern rather than inventing a new one. If you'd rather this stayed inline instead of a new file, say so — easy to fold back in.
- This PR is stacked on #124 (the still-unmerged measurement script) — cherry-picked its commit to reuse the exact, validated geometry functions rather than re-deriving them. Depends on #124 landing first (or alongside).

PR, not merged — you merge.
