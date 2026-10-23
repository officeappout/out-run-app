# Route geometry gaps — straight "bridges" in `official_routes.path`

Found 24.10.2026 on the city-mapping hub map of מועצה אזורית מטה בנימין: pending routes drawn as long straight lines that follow no trail
(e.g. "שביל גולני · קטע מטה בנימין": 11.4 km of trail, a 13.8 km chord). Fix + repair: branch `fix/route-geometry-straight-bridges`.

## 1. Measurement (production, read-only, 24.10.2026)

`official_routes` = 1,655 docs: 1,537 pending (unpublished), 117 published, 1 archived. `path` is stored as `{lng,lat}[]`.
Two measures: (a) the longest vertex-to-vertex step of `path` (haversine); (b) the **exact** test — consecutive `trail.segmentIds`
(`seg_<way>_<startNode>_<endNode>`) that do not share an OSM node were joined by a straight line.

### By step size (longest step of the path), pending docs

| origin | docs | step > 200 m | > 500 m | > 2 km | bridge share of path length |
|---|---|---|---|---|---|
| osm_import | 1,390 | 470 | **258** | 113 | 15.1 % |
| bike_adjacent_walk | 89 | 9 | 0 | 0 | 0 |
| osm_named_way | 45 | 7 | 0 | 0 | 0 |
| dataset_import | 10 | 1 | 0 | 0 | 0 |
| web_research | 3 | 0 | 0 | 0 | 0 |

Published (117): osm_import 58 → 5 with a step > 500 m (2 of them > 2 km: "סובב ברור חיל" 2.8 km, "סינגל קמה" 2.7 km, both שער הנגב);
super_admin 29 → 1 (523 m, a park loop — legitimate). Histogram of the longest step over all 1,537 pending docs:
< 100 m: 506 · 100-200: 542 · 200-300: 129 · 300-500: 102 · 500 m-1 km: 73 · 1-2 km: 72 · 2-5 km: 59 · > 5 km: 54.

### Exact test (what the repair uses)

**309 docs have at least one bridge; 307 of them are pending + unpublished + osm_import** (22 % of the 1,390 pending osm_import docs); 692 bridges in total.
All other origins: zero. The two others affected are published (שער הנגב) and are **never touched**.
Of the 307: longest bridge < 200 m: 43 · 200-500 m: 36 · 0.5-2 km: 116 · ≥ 2 km: 112. The bridges add **≈ 1,241 km** of straight line to
**≈ 2,907 km** of stored `distance` (≈ 30 % of the drawn path; `distance` itself excludes the bridges — it is the sum of the real segments, which is why
the Golani doc says 11.4 km while its line is far longer).

Why not a distance threshold: in the first regional run's 284,181 segments, 1,488 (0.5 %) legitimately have a 500 m+ step between two OSM nodes
(a straight desert way mapped with two nodes; max 5.6 km). 2 % of correctly-built chains have a > 500 m step; only 4 of 2,766 reach 1 km.
A 500 m cut would both miss 79 real bridges shorter than 500 m and flag legitimate routes. The segment-node test has neither problem.

Top 30 worst pending routes (name · council · stored km · longest step · steps > 500 m):

| doc | name | council | km | max step | #>500 m |
|---|---|---|---|---|---|
| osm_rel_282071__yV2g5NWjvsd9u3NXWyCU | שביל ישראל · קטע הערבה התיכונה | הערבה התיכונה | 118.7 | 32.5 km | 2 |
| osm_rel_282071__lt6vK9gbVHf9TpFNiCrD | שביל ישראל · קטע עמק יזרעאל | עמק יזרעאל | 18.9 | 30.3 km | 3 |
| osm_rel_11123868__Iy4Qx5sdyQGD07AYAozW | שביל גולני · קטע אשכול | אשכול | 44.6 | 21.8 km | 4 |
| osm_rel_11123868__X82KhLDEmUjmTN9xxndA | שביל גולני · קטע מרחבים | מרחבים | 28.6 | 20.9 km | 6 |
| osm_rel_282071__jBMboivtZJYRlrIepvCw | שביל ישראל · קטע בני שמעון | בני שמעון | 27.6 | 20.8 km | 1 |
| osm_rel_282071__IfEHp2Qws1NaskZrctkK | שביל ישראל · קטע מבואות החרמון | מבואות החרמון | 34.0 | 19.4 km | 5 |
| osm_rel_17752845 | שביל הים | חוף הכרמל | 39.3 | 17.5 km | 5 |
| osm_rel_11123868__R7aq9jBkeq822zu18dc2 | שביל גולני · קטע הגלבוע | הגלבוע | 43.1 | 16.2 km | 7 |
| osm_rel_11123868__ASDZghxSiHISeBIJSkw9 | שביל גולני · קטע עמק המעיינות | עמק המעיינות | 28.5 | 16.0 km | 4 |
| osm_rel_11123868__34R4AdquTOa64CH6Wgka | שביל גולני · קטע הר חברון | הר חברון | 1.3 | 14.5 km | 1 |
| osm_rel_11123868__SyzwqMrFbQc6tftxSL5T | שביל גולני · קטע לכיש | לכיש | 29.2 | 14.1 km | 1 |
| osm_rel_5145441 | שביל סובב כנרת | עמק הירדן | 38.8 | 13.8 km | 6 |
| osm_rel_11123868__4fzyIahk1bj8e68agAxP | שביל גולני · קטע מטה בנימין | מטה בנימין | 11.4 | 13.8 km | 3 |
| osm_rel_3952979__7PN1nJv0woPRv9IITPaQ | דרך נוף נחל שקמה · קטע שער הנגב | שער הנגב | 27.1 | 13.7 km | 3 |
| osm_rel_6359565__lt6vK9gbVHf9TpFNiCrD | שביל יזרעאל | עמק יזרעאל | 55.9 | 13.7 km | 8 |
| osm_rel_10816954__lt6vK9gbVHf9TpFNiCrD | שביל הסנהדרין · קטע עמק יזרעאל | עמק יזרעאל | 27.1 | 12.3 km | 8 |
| osm_rel_2860967__gUnk3Sy9UqgfWmUlw3Fd | מסע מים אל ים · קטע מעלה יוסף | מעלה יוסף | 16.2 | 11.3 km | 2 |
| osm_rel_282071__goZznzyUjIw7dBeOyzz7 | שביל ישראל · קטע מרום הגליל | מרום הגליל | 24.9 | 11.2 km | 4 |
| osm_rel_11518999__DMDnOxN5w3Rp6XJqcnLY | שביל השרון · קטע עמק חפר | עמק חפר | 19.6 | 10.9 km | 1 |
| osm_rel_11123868__IfEHp2Qws1NaskZrctkK | שביל גולני · קטע מבואות החרמון | מבואות החרמון | 31.8 | 10.4 km | 9 |
| osm_rel_282071__MipsYOQoSCMoX8551L0r | שביל ישראל · קטע עמק הירדן | עמק הירדן | 30.8 | 9.3 km | 2 |
| osm_rel_2535664 | סינגל הבשור | מרחבים | 16.2 | 9.1 km | 4 |
| osm_rel_2860967 | מסע מים אל ים | מטה אשר | 12.1 | 8.5 km | 1 |
| osm_rel_4805190__yV2g5NWjvsd9u3NXWyCU | שביל אדום · נחל צין · קטע הערבה התיכונה | הערבה התיכונה | 11.3 | 8.2 km | 1 |
| osm_rel_11518999__YigMUPH2d3I8x7VKjfks | שביל השרון · קטע דרום השרון | דרום השרון | 8.4 | 8.0 km | 3 |
| osm_rel_11123868__jBMboivtZJYRlrIepvCw | שביל גולני · קטע בני שמעון | בני שמעון | 36.8 | 7.8 km | 3 |
| osm_rel_282071__QTT37abFKCGdQHcc6gF6 | שביל ישראל · קטע חוף הכרמל | חוף הכרמל | 33.4 | 7.8 km | 5 |
| osm_rel_11123868__YigMUPH2d3I8x7VKjfks | שביל גולני · קטע דרום השרון | דרום השרון | 17.5 | 7.6 km | 4 |
| osm_rel_2747463 | נחל הבשור - דרך נוף | מרחבים | 2.5 | 7.3 km | 1 |
| osm_rel_6244703 | שביל כחול · נחל פצאל | ערבות הירדן | 2.6 | 7.1 km | 1 |

Affected councils (exact test, pending): 41. Most: משגב 15 · חוף הכרמל 15 · מטה יהודה 15 · אשכול 14 · מרום הגליל 13 · עמק יזרעאל 11 · מגידו 11 · גולן 10 · הגלבוע 10 · מרחבים 10 · חבל אילות 10 · מטה בנימין 9 · חבל מודיעין 9 · יואב 9 · הר חברון 9.
The full per-council / per-doc list is in the dry-run's `plan.json` (see §4).

**Judgement on the examples.** The Golani Trail in מטה בנימין is a real bug, not sparse vertices: its 76 OSM segments total 11.4 km, but the stored
path has 3 steps of 5.4, 5.6 and 13.8 km joining pieces that are kilometres apart. Generated loops (`gen_*`, `ghsettle_*`) and named-way / bike-adjacent
routes have no bridges (their stitching tolerance is ≤ 50 m).

## 2. Root cause

`src/lib/trail-graph/route-assembly.ts` `orderSegments` (before this fix). The pipeline (`scripts/trails/import-named-routes.ts`, step 1) takes
all segments that carry a relation id *inside the council boundary*, and walks them: follow the longest unused continuation; **when stuck, "jump to
the nearest unused segment end (counted as a gap)"** and append the next segment's full geometry to the same polyline. The `else` branch of the walk
(`geometry.push(...(geometry.length && options.length ? g.slice(1) : g))` — with `options` empty, the whole `g` is pushed) draws the straight line
between the dead end and the jump target. `ord.gaps` / `ord.continuity` were computed but the caller ignored them: `named.push({ geometry: ord.geometry, … })`.

Why gaps exist at all: a relation that passes through several councils is cut per council (the segment graph only holds ways inside the boundary —
`clippedToPilotArea`), so a relation that leaves and re-enters the boundary, or has ways missing from OSM, leaves disconnected pieces. Spur/branch
segments left behind by the greedy walk are joined the same way. First regional run: 1,853 relation×council cases, **414 had at least one jump**;
1,026 jumps in total (median 547 m, p90 5.5 km, max 78 km).

Reproduced on the real Golani fixture (relation 11123868, 76 segments from the 22.10 run; `src/lib/trail-graph/__tests__/fixtures/golani-mateh-binyamin.segments.json`):
old walk → one polyline with 7 jumps and a 13.76 km step; chains → 6 continuous pieces of 6.84 / 2.38 / 0.84 / 0.80 / 0.50 / 0.01 km (sum 11.38 km = the real trail).

The other stitchers are not affected: named corridors (`named-corridors.ts`, 25 m), known routes (40 m), bike-adjacent / datasets (≤ 50 m) — measured 0 docs ≥ 500 m.

## 3. Fix

* `orderSegmentChains` (route-assembly.ts): returns **continuous chains** only — a walk ends when stuck, the leftovers start the next chain, no jump.
  `orderSegments` is now a thin wrapper returning the longest chain (and `gaps` = chains left out).
* `import-named-routes.ts`: every chain becomes its own route part. The longest needs the usual 300 m, every further chain ≥ 800 m
  (`planChainParts`). Ids: single-chain relations keep `osm_rel_<id>`; a relation with > 1 chain gets `osm_rel_<id>_p<rank>` for every chain, so none can
  collide with an old bridged `osm_rel_<id>` doc (create-only would skip it). `providers.node.ts` adds the council suffix to `_pN` ids too
  (`osm_rel_<id>_p2__<authorityId>`). Names: the existing duplicate-name rule (ref → nearest distinct toponym) already separates parts; if nothing does,
  "<name> · קטע N" (N = rank by length) instead of "(n)". The existing cross-council rule ("· קטע <council>") and `dedupe.ts` need no change (same-name /
  geometry-overlap logic; legacy-id guard regex `^osm_rel_\d+__` simply doesn't match `_pN` ids).
* Over the 1,853 first-run cases: parts kept (≥ 300/800 m) 2,298 routes carrying 9,840 km of 9,982 km (98.6 %); the rest is sub-800 m fragments.
* Guard: `route_scores.geometryGapM` (longest vertex step, m; `route-geometry/gaps.ts`, `routeScoreInputFromDoc`). Selection puts a route with a step ≥ 1,000 m
  in `manual_review` (never auto-selected); 500 m is the "suspicious" level the hub can show. Legitimate sparse ways: 4 of 2,766 correct chains reach 1 km.
* Tests: `trail-graph/__tests__/route-chains.test.ts` (synthetic gap, boundary-clipped relation that re-enters, spur, ids, real Golani fixture),
  `route-geometry/__tests__/gaps.test.ts`, `routes-nationwide/__tests__/geometry-gaps.test.ts`, select / from-route-doc / route_scores round trip.

## 4. Repair of the existing pending docs — **archive, then regenerate**

`scripts/routes-nationwide/repair-route-geometry-gaps.ts` (writer: `lib/geometry-gap-apply.node.ts`, allowlisted in `scripts/safety-check.sh`).

Why not trim `path` in place: `trail.stats`, `segmentIds`, difficulty, stars, `elevationProfile` / `elevationGain` / `maxGrade`, `route_scores`, shade / urban
enrichment all derive from the same bridged walk. A stored polyline cannot give them back; the fixed pipeline can, and it is also the only way to get the
**new** parts (a trimmed doc would silently drop the other continuous pieces).

* Scope: `origin == 'osm_import'`, `status == 'pending'`, `published == false`, and the exact segment-walk test finds ≥ 1 bridge. Published / approved / archived /
  other-origin docs are never written. Docs that only have a long path step but no segment ids (5: 3 published, 2 pending `gen_*` loops) are reported, not written.
* Write: the approval-center reject shape — `published:false, status:'archived', rejectionReason:'geometry gap — regenerate', reviewedBy:'script:repair-route-geometry-gaps', reviewedAt, updatedAt`;
  `buildValidatedDoc` (update mode); `lastUpdateTime` precondition from the read (an edited / approved-since doc is a conflict, skipped); batches of 200 (≤ 400); never deletes.
* Dry-run result (24.10.2026): **307 docs in 41 councils would be archived**, all `osm_import`; ≈ 670 regenerated routes expected before quota selection
  (estimate from the stored path — the real split comes from the OSM segments).
* Regenerate afterwards (printed by the script with the affected `--authority=` ids): `run.ts --authority=… --fresh --apply --project appout-1`. Archived docs are skipped by the
  `existing` stage and the cross-council check; new parts have new ids, so create-only is not blocked. Quota selection and `route_scores` are rewritten by the runner.
* Order matters: archive first, then regenerate, then bulk-approve. Do NOT bulk-approve before the archive — 307 pending docs contain the straight lines.

## 5. Hub bulk-approve (PR #746, `src/lib/city-mapping-hub/bulk-routes.server.ts`) — proposal, not edited

`readPendingRoutesNationwide` already reads `route_scores.score` per pending route. Proposal (small, separate PR): also read `geometryGapM` (field mask) and
(a) exclude candidates with `geometryGapM >= 500` from the default "approve all selected" set, (b) show a "⚠ קו ישר N ק״מ" badge on the row with an explicit opt-in.
Routes without a `route_scores` doc (or scored before this change: `geometryGapM` absent) should be treated as "unknown", not "clean" — which is another reason to
run the repair + regenerate first (regenerated routes always carry the number).
