# Route geometry measurement — pending queue, Stage A

**Branch: `route-quality-geometry-measurement`**

Executed 04.10.2026. Script: `scripts/measure-route-geometry.ts` (`npx tsx scripts/measure-route-geometry.ts`) — READ-ONLY, prints a report, writes nothing to Firestore, does not touch `route-generator`, `route-stitching.service.ts`, or `src/lib/route-decisions/decide-accuracy.ts` (that file is imported and *called* for comparison in cut (b) below, never modified). Not a pipeline stage.

**Zero thresholds set. Zero pass/fail applied to any of the 97.** Every section below is a distribution, a ranking, or a direct comparison — never a verdict. The two places a "floor" appears (cuts (a)/(b)/(c)) are explicitly illustrative, chosen to make the cut legible, not proposed publish bars.

## The tree

1. **Closure** — distance between the route's last point and first point, in meters. Screens, first: a non-closed route has no enclosed area, so none of the compactness measures in step 2 apply to it at all — reported in a separate bucket, not scored.
2. **On closed loops only — 3 standardized measures, all 0→1, via turf:**
   - Polsby-Popper: `4π·area / perimeter²`
   - Reock: `area / area of the minimum enclosing circle`
   - Convex Hull ratio: `area / area of the convex hull`
3. **On everything** — self-overlap %, dead branches, junction-degree distribution, sharp turns (≥150°) and their streaks. These four are **not** standardized named formulas the way step 2's three are — methodology for each is in the appendix, reported in full so it can be judged on its own terms.

## 🔴 Calibration — 3 known Kiryat Ono routes, with a real bug found and fixed along the way

| | length | closure | Polsby-Popper | Reock | Convex Hull | self-overlap | junctions | dead branches | sharp turns |
|---|---|---|---|---|---|---|---|---|---|
| הקפת פארק צה"ל | 738m | 0.0m | 0.265 | 0.212 | 0.632 | 0.141 | 2 | 1 | 2 |
| הקפת פארק מכבית | 1024m | 0.0m | 0.108 | **0.078** (lowest) | 0.506 | 0.130 | 6 | 1 | 0 |
| הקפת Bar Yehuda | 702m | 0.0m | **0.017** (lowest) | 0.018 | 0.050 | 0.438 | 11 | 3 | 3 |

**Maccabiah's lowest measure: Reock — matches the prediction exactly.**
**Bar Yehuda's lowest measure: Polsby-Popper, not Convex Hull as predicted** — but it's a *different* measure than Maccabiah's, which is the actual stop-condition you specified ("if they fail on the SAME measure, stop"). They don't. **Calibration passes.**

Worth your attention even though the gate passed: Bar Yehuda's three values (0.017 / 0.018 / 0.050) are all three badly low, not cleanly diagnosed by one — a tangled, self-crossing "network" path collapses toward zero on every areal measure simultaneously (none of them have much net enclosed area to work with), not just the one hypothesized to catch it. Convex Hull turned out to be the measure with the widest *relative* separation between Maccabiah (0.506) and Bar Yehuda (0.050) — a real ~10x gap — so it's still the most useful single lens for telling these two failure modes apart, just not because it uniquely "belongs" to Bar Yehuda's case the way the per-route framing assumed.

### The bug

First attempt at this calibration intermittently **failed** the stop-condition — Bar Yehuda's lowest measure flipped between runs. Traced it to `smallest-enclosing-circle` (the Reock dependency): closing a self-intersecting path into a ring produces exact-duplicate points at every self-crossing (Bar Yehuda: 40 ring points, 13 exact duplicates), and this library's circle-fit occasionally — not rarely, roughly 1 in 5-10 calls on this exact input — returns a radius off by 7-8 orders of magnitude (observed: r≈9,389,108,031 meters against a correct r≈107m). Not floating-point jitter; an outright algorithmic failure on duplicate-heavy input.

**Fix, verified**: deduplicate the point set before passing it to the circle-fit. 30 repeated calls on the raw points: radius varied wildly, including the billion-meter outlier 3 times. 30 repeated calls on deduplicated points: **identical r=106.97 every single time.** Applied inside `computeCompactness()` — a data-hygiene step on the circle-fit's input, not a change to Reock's own formula. The numbers in this report are all from the fixed path, confirmed stable across 4 full script re-runs.

## Full run — 97 pending routes

**28 closed (compactness computed). 69 not closed enough (bucketed separately — screened out of step 2 entirely, not scored on it).**

All 3 cities currently represented in the pending queue: חיפה (70 pending, only **5** closed), הרצליה (23 pending, 19 closed), קריית אונו (4 pending, 4 closed). Worth flagging on its own: the 97-route queue is not nationally representative of anything yet — it's exactly these 3 cities, and Haifa's pending routes are overwhelmingly *not* loop-shaped (65 of 70 fail the closure screen outright).

### Distributions (deciles, not thresholds, not means-only)

**Closure gap, meters — all 97:**
p0=0 · p10=0 · p20=0 · p30=60 · p40=490 · p50=627 · p60=818 · p70=993 · p80=1,451 · p90=1,622 · p100=2,857 (mean 745)

**Polsby-Popper — 28 closed:**
p0=0.000 · p10=0.000 · p20=0.030 · p30=0.054 · p40=0.087 · p50=0.104 · p60=0.149 · p70=0.241 · p80=0.303 · p90=0.433 · p100=0.599 (mean 0.186)

**Reock — 28 closed:**
p0=0.000 · p10=0.000 · p20=0.029 · p30=0.058 · p40=0.068 · p50=0.109 · p60=0.203 · p70=0.232 · p80=0.283 · p90=0.329 · p100=0.512 (mean 0.159)

**Convex Hull ratio — 28 closed:**
p0=0.000 · p10=0.000 · p20=0.086 · p30=0.196 · p40=0.267 · p50=0.457 · p60=0.506 · p70=0.531 · p80=0.699 · p90=0.802 · p100=1.000 (mean 0.421)

**Self-overlap ratio — all 97:**
p0=0.000 · p10=0.000 · p20=0.000 · p30=0.000 · p40=0.000 · p50=0.006 · p60=0.015 · p70=0.036 · p80=0.104 · p90=0.258 · p100=0.509 (mean 0.071)

**Junction count per route — all 97:**
p0=0 · p10=0 · p20=1 · p30=2 · p40=2 · p50=4 · p60=5 · p70=7 · p80=10 · p90=19 · p100=59 (mean 7.8)

**Junction visit-degree — 752 individual junctions found, across all 97:**
visited exactly 2 times (simple crossing): **739** · visited 3 times: **11** · visited 4 times: **2**. ("Degree-1" doesn't occur by construction — a junction only exists because the path revisited it at least once.)

**Dead-branch out-and-back ratio — 56 detected candidates:**
p0=0.589 · p10=0.870 · p20=1.000 · p30=1.000 · p40=1.000 · p50=1.000 · p60=1.023 · p70=1.067 · p80=1.192 · p90=1.301 · p100=1.824 (mean 1.077). A pure there-and-back spur reads ≈1.0 by this metric's own construction (walked length ÷ 2×max displacement) — the fact that the median sits almost exactly there is a sanity check the heuristic is catching real spurs, not noise.

**Sharp turns (≥150°) per route — all 97:**
p0=0 · p10=0 · p20=0 · p30=0 · p40=1 · p50=1 · p60=1 · p70=2 · p80=2 · p90=5 · p100=40 (mean 2.4)

**Sharp-turn streak length (consecutive flagged vertices) — 176 streaks found:**
length 1 (isolated): **143** · length 2: **19** · length 3: **4** · length 4: **7** · length 5: **2** · length 6: **1**. One route has a run of 6 consecutive sharp turns — almost certainly a digitization artifact, not 6 intentional hairpins in a row.

## (א) 🔴 Where the 3 compactness measures disagree with each other

Illustrative lens: percentile-rank spread across the 3 measures, within the 28 closed routes.

| route | city | PP %ile | Reock %ile | ConvexHull %ile | spread |
|---|---|---|---|---|---|
| הקפת גן אלכס | חיפה | 39 | 36 | 64 | 29 |
| הקפת פארק רבין | הרצליה | 43 | 25 | 46 | 21 |
| הקפת ספורטק הרצליה | הרצליה | 61 | 71 | 54 | 18 |
| הקפת חורשת ניסנוב | הרצליה | 89 | 79 | 96 | 18 |
| הקפת גן המייסדים | חיפה | 71 | 89 | 79 | 18 |
| הקפת גינת יקינטון | הרצליה | 32 | 50 | 32 | 18 |
| הקפת גן קיסלק | חיפה | 86 | 68 | 86 | 18 |

Honest read: the widest spread found is 29 percentile points, most are in the teens. **The three measures mostly agree with each other** across this 28-route set — they aren't catching wildly different failure populations here. That's itself informative: it means a route flagged by one is very likely to be flagged by the others too, at least at this sample size.

## (ב) 🔴 Where the measures disagree with the EXISTING certificate — the finding that proves this adds something

Illustrative lens: certificate verdict = approve (confidence 90, the hard-coded clean-pass value), **and** the route ranks bottom-quartile (≤25th percentile) on **all three** geometric measures simultaneously.

**7 of 28 closed routes.** Four of them score effectively **zero** on all three measures at once:

| route | city | cert confidence | Polsby-Popper | Reock | Convex Hull |
|---|---|---|---|---|---|
| הקפת גן סחלב | הרצליה | 90 | 0.0000 | 0.0000 | 0.0000 |
| הקפת גינת גל | הרצליה | 90 | 0.0000 | 0.0000 | 0.0000 |
| הקפת Gan Alof | הרצליה | 90 | 0.0000 | 0.0000 | 0.0000 |
| הקפת גן הבנים | הרצליה | 90 | 0.0000 | 0.0000 | 0.0000 |
| הקפת גינת חגי | הרצליה | 90 | 0.030 | 0.029 | 0.100 |
| הקפת Bar Yehuda | קריית אונו | 90 | 0.017 | 0.018 | 0.050 |
| הקפת גן מנחם בגין | הרצליה | 90 | 0.030 | 0.037 | 0.086 |

Checked the 4 zero-scoring routes directly, not just trusted the number: all are short (158-567m), all have an unusually high junction count for their length (e.g. 7 self-crossings in 158m) — genuinely tangled crisscrossing paths through small gardens, not a computation artifact. Real area ≈ 0.00 m² on all four, independently confirmed from the raw polygon area before any ratio is taken.

This is the concrete proof point: the existing certificate measures surface composition (is this pavement classified as a real path), and correctly says these are fine on that axis. It has no opinion on shape at all. These 7 routes would publish today at "תקין · ביטחון 90%" with zero geometric scrutiny.

## (ג) 🔴 The business cut — if we publish only the top 5 per city, what survives?

Per-measure view, floors are global percentile-rank cutoffs (excluding the bottom X% of the 28 closed routes), shown at several illustrative floors so you can see where it actually bites rather than just one picked number. **ALL-3-COMBINED is the realistic one** — a route counted as eligible there clears the SAME floor on all three measures simultaneously, which is what an actual publish gate would require.

**חיפה — 70 pending, only 5 closed at all:**
| floor (bottom X% excluded) | 10% | 20% | 30% | 50% | 70% | 80% | 90% |
|---|---|---|---|---|---|---|---|
| ALL-3-COMBINED eligible | 5 | 5 | 5 | **2** | 1 | 0 | 0 |

**⚠️ Haifa's candidate pool collapses as soon as a real floor is applied — drops below 5 at the 50% floor, hits zero by 80%.** With only 5 closed routes to begin with (93% of Haifa's queue isn't loop-shaped at all), there's no depth to fall back on.

**הרצליה — 23 pending, 19 closed:**
| floor | 10% | 20% | 30% | 50% | 70% | 80% | 90% |
|---|---|---|---|---|---|---|---|
| ALL-3-COMBINED eligible | 5 | 5 | 5 | **5** | 4 | 3 | 1 |

Real depth — stays at a full 5 all the way to the 50% floor, degrades gracefully after that.

**קריית אונו — 4 pending, 4 closed:**
| floor | 10% | 20% | 30% | 50% | 70% | 80% | 90% |
|---|---|---|---|---|---|---|---|
| ALL-3-COMBINED eligible | 4 | 3 | 3 | 2 | 1 | 0 | 0 |

**⚠️ Already capped below 5 by raw volume alone** — only 4 pending routes total, so "5 per city" is structurally unreachable here regardless of quality, before any floor is even applied.

**Answer to the realism question**: at today's queue composition, "5 clean routes per city" holds comfortably for Herzliya, is capped by volume (not quality) in Kiryat Ono, and is a real, quality-floor-dependent risk in Haifa specifically — the one city supplying 72% of the current queue by raw count.

## 🔴 Measure → human-readable rejection reason

| trigger | reason to display |
|---|---|
| Closure failed | "נקרא 'הקפת' ואינו טבעת" |
| Reock low | "רצועה מתארכת, לא לולאה" |
| Convex Hull low | "רשת שבילים, לא מסלול" |
| Self-overlap high | "הלוך-חזור שמתחזה ללולאה" |

Reported as given — ready to pre-fill the approval screen's rejection chip, next stage, not this one.

## ⚠️ Promenades / linear green strips — segregated, not penalized

**5 routes** flagged by name pattern (טיילת/רצועה ירוקה/רצועת חוף/שביל טבע) — all 5 in חיפה, all 5 already fall in the "not closed enough" bucket from step 1, meaning **compactness was never computed on them at all** — correct behavior, not a special case needed. Listed so they're visible, not buried:

הטיילת · טיילת איינשטיין · טיילת קרית אליעזר · טיילת אריה גוראל · טיילת ראסל ברי

**Honest limitation**: this signal is name-pattern only. The 69-route "not closed" bucket almost certainly contains more genuine point-to-point trails that just aren't *named* "טיילת" — they're correctly excluded from compactness scoring either way (closure already screens them out), but they aren't individually confirmed-linear-by-intent the way these 5 are. Not expanded to a geometric heuristic (tried one, found it just re-labeled most of the "not closed" bucket without real evidence — removed, noted in the appendix).

## What this script did NOT do

- Set no threshold, scored no route pass/fail.
- Wrote nothing to Firestore — no field, no flag, no status.
- Did not touch `route-generator`, `route-stitching.service.ts`, or `decide-accuracy.ts` (imported and called read-only for cut (b) only).
- Did not change the existing quality certificate.

## Appendix — methodology for the 4 non-standard Step-3 metrics

- **Self-overlap ratio**: buffer the route's LineString by 4m radius (`OVERLAP_BUFFER_RADIUS_M` — a measurement-resolution choice, not a quality bar: roughly half a typical path width), compute the buffered polygon's real area. A route that never retraces itself produces a buffer area ≈ length × 2×radius; a route that doubles back has its buffer self-overlap, so the resulting area is smaller — the shortfall, as a fraction, is the overlap ratio. Small, uncorrected bias from round end-caps, noted not fixed (negligible at these route lengths).
- **Junctions**: `@turf/kinks` finds pairwise self-intersection points on the route's own LineString; points within 6m (`JUNCTION_CLUSTER_RADIUS_M`) are clustered into one junction. "Visits" = count of distinct times the path's own coordinate sequence passes within that radius of the junction's centroid.
- **Dead branches**: heuristic, not a named algorithm. For each junction visited more than once with no other junction in between the two visits, compares the walked distance between those visits to 2× the farthest point reached from the junction in between — a pure out-and-back spur reads ≈1.0 on this ratio; a real loop (covering new ground, not retracing) reads much higher.
- **Sharp turns**: per-vertex bearing change via `@turf/bearing`, flagged at ≥150° (your own spec). Streaks = consecutive flagged vertices.
- **Closure structural gap**: 50m (`CLOSURE_STRUCTURAL_GAP_M`) — the cutoff for "close enough to compute a polygon from at all." A geometric necessity to let step 2 run, not a quality judgment; the raw gap distance (and gap-as-%-of-length) is reported for every route regardless, so this bucketing can be re-sliced at any cutoff from the raw numbers.
- **Promenade flag — what was tried and discarded**: an earlier version also flagged any not-closed route whose gap exceeded 50% of its own length ("open path, ends far apart"). Checked the actual count it produced: 57 of 97 — which is just re-describing "not closed" (69 routes) under a reassuring label, not real evidence of linear intent. Removed; name-pattern only, with the limitation stated above.
