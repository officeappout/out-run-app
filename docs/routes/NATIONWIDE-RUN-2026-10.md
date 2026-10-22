# Nationwide routes run — dry-run, October 2026 (RC8 → RC9)

Re-generated 2026-10-22 after RC9 (urban measurement #683, urban floor #684, bike-adjacent walks + MoT bike-path layer — step 3 PR) from `scripts/routes-nationwide/run.ts` (dry-run, production read-only, live GraphHopper `foot_turns`, ≤ 30 GH calls per authority, GraphHopper answers reused from the RC8 run's cache — the first RC9 pass made 392 new live calls, all within the per-authority cap, and this final pass 0). **Nothing was written.** The RC8 run (#676) is the "before" column throughout.

Sources per authority, in order: existing `official_routes` → known routes (web research) → open datasets (ofneidan, bicycle_jer_2019 — CC-BY; **bph_infra_exist — MoT national bike-path layer, other-open**) → named OSM route relations → named OSM paths stitched into corridors → **walking/running corridors beside bike paths (`bike_adjacent_walk`, RC9)** → big-park loops → generated loops (pipeline B, then GraphHopper neighbourhood loops) — the last two only while the ≥70 quota minimum is unmet. Every candidate is scored with **routeScore v1.3**: urban candidates are now measured on the OSM extract (composition, lighting, amenities ≤ 50 m, road crossings), shade from the Technion layer or — where it is missing — a tree hint from the MoT layer. Selection: score ≥ 70, plus the **urban floor (62)** for named urban routes in authorities still below their quota minimum (only up to that minimum, hard bars: no U-turn/spur, retrace limit, distance within 15%).

## Totals — before (RC8) → after (RC9)

| | RC8 | RC9 |
|---|---|---|
| authorities run | 264 | 264 (errors: 0) |
| selected routes | 1138 (35 existing + 1103 new) | **1296** (36 existing + 1260 new; 61 via the urban floor) |
| summed quota minimum | 2494 | 2494 |
| quota minimum met | 48 / 264 | **56 / 264** |
| candidate pool | 3867 (3652 new) | 4295 (4080 new) |
| bands (pool) | 🟢 22 · 🟡 3837 · 🔴 8 | 🟢 30 · 🟡 4149 · 🔴 116 |
| GraphHopper live calls | 5331 | 0 (5546 cached, 0 refused by budget, 0 errors) |

**Selected by source** — RC8: existing 35 · known_routes 3 · dataset 0 · osm 1069 · named_ways 0 · bike_adjacent_walk 0 · park_loops 0 · generated 31 · neighbourhood 0  
RC9: existing 36 · known_routes 6 · dataset 8 · osm 1053 · named_ways 75 · bike_adjacent_walk 66 · park_loops 20 · generated 31 · neighbourhood 1

**New candidates added by stage** — RC8: existing 0 · known_routes 13 · dataset 0 · osm 2028 · named_ways 329 · bike_adjacent_walk 0 · park_loops 34 · generated 748 · neighbourhood 500  
RC9: existing 0 · known_routes 13 · dataset 34 · osm 2028 · named_ways 329 · bike_adjacent_walk 420 · park_loops 33 · generated 734 · neighbourhood 489

**Selected by surface class** — RC8: walk_run_paved 84 · hike_offroad 900 · bike_road 16 · bike_offroad 138 · unknown 0  
RC9: walk_run_paved 247 · hike_offroad 886 · bike_road 25 · bike_offroad 138 · unknown 0

**Urban measurement (RC9 step 1):** 1529 urban candidates considered, 1529 measured — composition 1481, lighting 71, amenities 1418, crossings 1529.

## What this run says (read first)

1. **+158 routes, +8 authorities at their minimum, walk/run-paved routes ×3.** 1,138 → 1,296 selected; walk_run_paved selected 84 → 247. The new routes are urban: named corridors 0 → 75, bike-adjacent walks 0 → 66, park loops 0 → 20, MoT bike routes 0 → 8. Marked trails (OSM relations) are unchanged by design (1,069 → 1,053, the difference is the per-city caps now choosing better urban routes).
2. **Measuring helps where the place is good, and hurts where it isn't.** 1,529 urban candidates measured (composition 1,481, amenities 1,418, crossings 1,529; lighting only 71 — OSM lamps are sparse). Promenades and park paths rose (named corridors: 84 now ≥ 70; טיילת קרית ים 82, Charles Clore 79); GraphHopper neighbourhood loops fell (median 56 → 48; 57 are now red) because they run on sidewalks beside arterials and cross major roads at unmarked points. Existing app routes: 7 of the RC8 selection lost their place after measurement (e.g. Sderot "מסלול הכלניות" 72 → 57: it runs along a major road), Sderot 4 → 3.
3. **Bike-adjacent walks are the biggest new urban source** — 420 candidates, median 67, 139 ≥ 70 — but in most cities they run beside arterials, where the walkway is classified "sidewalk" (¼ weight in surface) and within 10 m of a tertiary+ centerline (safety 0). That is why Rishon (3/25), Petah Tikva (3/25) and Bnei Brak (3/25) stay short even at a floor of 62.
4. **The urban floor at 62 adds 61 routes** (65: +45, vs. 70) — mostly in Tel Aviv (15 → 22), Be'er Sheva (12 → 19), Netivot-size towns (Ofakim 3 → 8, Nahariya 2 → 7). It only fills up to each authority's minimum and every pick passes the hard bars.
5. **MoT bike-path layer:** 7,905 usable sections (2,489 crossings excluded) → 39 same-street corridors ≥ 2 km assigned to an authority as bike routes (8 selected) and the primary input for bike-adjacent walks (MoT corridors win over the OSM copy of the same path).

## Owner decisions needed

- **Q-A′ — the urban floor value.** 62 → 1,296 selected (61 via the floor), 65 → 1,280, 70 → 1,235 (calibration table below). Recommendation: **62** — every floor pick is a named place that passed the hard bars, and it never goes beyond the minimum.
- **Q-D — a walkway separated from an arterial.** Today a footway / bike-path walkway within 10 m of a tertiary+ road counts as "on the major road" (safety → 0) and as a "sidewalk" (¼ surface weight) — the same rules the app's quality certificate uses. Most bike-adjacent walks in Rishon / Petah Tikva / Bnei Brak / Ashkelon hit both. Options: (a) keep — honest about traffic noise and exhaust; (b) count a walkway the MoT layer marks as physically separated (BPHPLACE "בין המיסעה לרצועת ההליכה", DIV_VEH heavy/medium divider) as half a major-road share; (c) raise the sidewalk weight for walkways ≥ 3 m wide. No change was made — this is a scoring decision.
- **Q-B — apply order** unchanged from RC8 (clients → big cities → regional councils → the rest), now with RC9 merged and the MoT zip in the datasets dir.

## Owner apply commands (batched — David runs them; each authority asks for a typed YES)

From the main checkout **after #683, #684 and #699 are merged** (and #667 / #675, already merged), on `main`:

```bash
cd /Users/calisthenicsltd/Development/appout-1
git fetch && git status && git log --oneline -1 origin/main    # main == origin/main, includes #699
export TRAILS_OSM_CACHE_DIR=$PWD/.cache/osm
GH=--graphhopper-url=https://graphhopper-ufsbvwndwa-zf.a.run.app
DS=--datasets-dir=$HOME/Downloads          # ofneidan.zip + bicycle_jer_2019.zip + bph_infra_exist.zip
OUT=--out=scripts/output/nationwide-apply-2026-10-rc9

# 1. clients
npx tsx scripts/routes-nationwide/run.ts --apply --project appout-1 $GH $DS $OUT --city=אשקלון "--city=קרית ים" --city=שדרות
# 2. big cities
npx tsx scripts/routes-nationwide/run.ts --apply --project appout-1 $GH $DS $OUT --city=ירושלים "--city=תל אביב-יפו" --city=חיפה "--city=פתח תקווה" "--city=ראשון לציון" --city=נתניה "--city=בני ברק" --city=אשדוד "--city=באר שבע"
# 3. regional councils
npx tsx scripts/routes-nationwide/run.ts --apply --project appout-1 $GH $DS $OUT --kind=regional
# 4. everything else (the checkpoint in $OUT skips what batches 1-3 already did)
npx tsx scripts/routes-nationwide/run.ts --apply --project appout-1 $GH $DS $OUT --kind=municipal
```

Use a NEW `$OUT` (not the RC8 one) so no RC8 checkpoint is continued. To reuse this dry-run's GraphHopper answers exactly, copy its `cache/gh/` into `$OUT/cache/gh/` first. Writes are create-only `official_routes` (status `pending`, `published:false`, through `buildValidatedDoc` at the write site) + `route_scores` (now v1.3, including urban-floor selection reasons); existing routes are never modified. Without `--write-candidates` only **selected** routes are created. `--no-urban-measure` reproduces RC8 scoring for comparison.

## Urban floor — calibration (owner decision)

Selected routes at each urban floor (the 70 column = no urban floor, i.e. measurement + bike-adjacent walks only). The floor only ever fills an authority up to its quota **minimum**, only with named urban routes (named corridors, park loops, known routes, bike-adjacent walks) that pass the hard bars.

| | 62 | 65 | 70 |
|---|---|---|---|
| **all authorities** | 1296 | 1280 | 1235 |
| לקוחות | 9 | 8 | 7 |
| ערים גדולות | 122 | 117 | 100 |
| מועצות אזוריות | 724 | 723 | 721 |
| שאר הרשויות | 441 | 432 | 407 |

Per authority (clients, big cities, and every other authority where the floor changes the count):

| authority | quota min | RC8 | 62 | 65 | 70 |
|---|---|---|---|---|---|
| אשקלון | 15 | 0 | 4 | 3 | 3 |
| קרית ים | 8 | 0 | 2 | 2 | 1 |
| שדרות | 8 | 4 | 3 | 3 | 3 |
| ירושלים | 25 | 30 | 35 | 35 | 35 |
| תל אביב-יפו | 25 | 9 | 22 | 21 | 15 |
| חיפה | 25 | 22 | 24 | 24 | 22 |
| פתח תקווה | 25 | 1 | 3 | 3 | 2 |
| ראשון לציון | 25 | 0 | 3 | 2 | 1 |
| נתניה | 25 | 3 | 7 | 6 | 5 |
| בני ברק | 25 | 0 | 3 | 3 | 3 |
| אשדוד | 25 | 2 | 6 | 6 | 5 |
| באר שבע | 25 | 9 | 19 | 17 | 12 |
| ברנר | 10 | 4 | 6 | 6 | 4 |
| מועצה אזורית עמק חפר | 10 | 9 | 10 | 9 | 9 |
| בית שמש | 15 | 6 | 7 | 6 | 6 |
| הרצליה | 15 | 5 | 9 | 9 | 7 |
| רעננה | 15 | 1 | 3 | 3 | 1 |
| ראש העין | 15 | 4 | 8 | 8 | 7 |
| קרית גת | 15 | 2 | 5 | 5 | 4 |
| נהריה | 8 | 2 | 7 | 6 | 2 |
| אופקים | 8 | 2 | 8 | 7 | 3 |
| כפר יונה | 8 | 0 | 1 | 1 | 0 |
| תל שבע | 8 | 1 | 2 | 2 | 1 |
| שוהם | 8 | 0 | 4 | 4 | 3 |
| קריית טבעון | 8 | 3 | 4 | 4 | 3 |
| דאלית אל-כרמל | 8 | 0 | 1 | 1 | 0 |
| ירכא | 8 | 4 | 5 | 5 | 4 |
| בנימינה-גבעת עדה | 8 | 3 | 4 | 3 | 3 |
| תל מונד | 8 | 2 | 3 | 2 | 2 |
| קרני שומרון | 8 | 2 | 4 | 3 | 2 |
| צור הדסה | 8 | 3 | 4 | 3 | 3 |
| בסמת טבעון | 8 | 2 | 3 | 2 | 2 |
| להבים | 8 | 3 | 5 | 5 | 3 |
| קדימה-צורן | 8 | 5 | 8 | 7 | 5 |

## לקוחות (client) — 3

| authority | selected RC8 → RC9 / quota | via floor | by source (RC9 selected) | surface (RC9 selected) | top new routes | gaps |
|---|---|---|---|---|---|---|
| אשקלון | 0 → **4** / 15–25 | 1 | dataset 1, named_ways 3 | walk run paved 3, bike road 1 | שביל החומה (72, 1.2 km); השקמה (72, 1.2 km); שביל אופניים — שמעון פרס (71, 2.3 km) | short 11; 11 new not selected (best 67) |
| קרית ים | 0 → **2** / 8–15 | 1 | named_ways 1, bike_adjacent_walk 1 | walk run paved 2 | טיילת קרית ים (82, 2.2 km); לאורך טיילת המטרונית · הלוך-חזור (66, 5.0 km) | short 6; 2 new not selected (best 60) |
| שדרות | 4 → **3** / 8–15 | 0 | existing 1, osm 2 | walk run paved 2, hike offroad 1 | מסלול שדרות #1 (79, 0.7 km); שביל גולני (70, 1.3 km) | short 5; 6 new not selected (best 61) |

## ערים גדולות (large_city) — 9

| authority | selected RC8 → RC9 / quota | via floor | by source (RC9 selected) | surface (RC9 selected) | top new routes | gaps |
|---|---|---|---|---|---|---|
| ירושלים | 30 → **35** / 25–40 | 0 | known_routes 4, osm 28, named_ways 2, bike_adjacent_walk 1 | walk run paved 14, hike offroad 19, bike road 2 | שביל כחול · מערת קבורה (87, 1.0 km); סינגל הרכסים - IMBA (86, 5.0 km); שביל הארז (86, 3.8 km) | 33 new not selected (best 85) |
| תל אביב-יפו | 9 → **22** / 25–40 | 7 | existing 10, dataset 3, osm 2, named_ways 1, bike_adjacent_walk 5, park_loops 1 | walk run paved 18, bike road 4 | שביל ישראל (79, 13.6 km); שביל אופניים — פארק הירקון (2) (76, 2.9 km); לאורך גשר המכביה ה-15 · הלוך-חזור (76, 10.4 km) | short 3; 30 new not selected (best 75) |
| חיפה | 22 → **24** / 25–40 | 2 | existing 14, osm 7, named_ways 1, bike_adjacent_walk 2 | walk run paved 7, hike offroad 14, bike road 2, bike offroad 1 | שביל שחור · ואדי התשבי (83, 1.8 km); נחל עובדיה (82, 3.0 km); שביל אדום · מורדות כרמליה (82, 3.6 km) | short 1; 22 new not selected (best 76) |
| פתח תקווה | 1 → **3** / 25–40 | 1 | osm 1, named_ways 1, park_loops 1 | walk run paved 2, hike offroad 1 | הקפת פארק יצחק אוחיון (84, 1.4 km); שביל ישראל (75, 5.3 km); נחלת צבי (66, 0.9 km) | short 22; 14 new not selected (best 61) |
| ראשון לציון | 0 → **3** / 25–40 | 2 | park_loops 3 | walk run paved 3 | הקפת גן בעברית (73, 1.4 km); הקפת פארק אקטיבי (68, 1.9 km); הקפת גן הזיכרון (64, 1.3 km) | short 22; 17 new not selected (best 69) |
| נתניה | 3 → **7** / 25–40 | 2 | osm 3, named_ways 2, bike_adjacent_walk 1, park_loops 1 | walk run paved 5, hike offroad 2 | דרך הלב – נתניה (80, 0.4 km); שביל ישראל (76, 11.1 km); פארק האופניים (75, 1.4 km) | short 18; 14 new not selected (best 67) |
| בני ברק | 0 → **3** / 25–40 | 0 | bike_adjacent_walk 2, neighbourhood 1 | walk run paved 3 | לאורך אזור תעשייה עבר הירקון (74, 2.8 km); לאורך נחל הירקון · הלוך-חזור (74, 3.1 km); לולאת מבצע קדש (הדר יוסף) · 2.5 ק״מ (74, 2.5 km) | short 22; 6 new not selected (best 64) |
| אשדוד | 2 → **6** / 25–40 | 1 | known_routes 2, dataset 1, osm 1, bike_adjacent_walk 1, park_loops 1 | walk run paved 3, hike offroad 2, bike road 1 | שביל שחור · תל אשדוד (86, 2.9 km); שביל הבוסתן (80, 0.4 km); שביל אופניים — משה דיין (2) (76, 2.3 km) | short 19; 27 new not selected (best 69) |
| באר שבע | 9 → **19** / 25–40 | 7 | osm 9, named_ways 2, bike_adjacent_walk 8 | walk run paved 10, hike offroad 9 | שביל שחור · גבעות להב (82, 3.5 km); שביל אדום · נחל עשן (82, 6.6 km); שביל אדום · גבעות גורל (82, 3.5 km) | short 6; 15 new not selected (best 61) |

## מועצות אזוריות (regional_council) — 55

| authority | selected RC8 → RC9 / quota | via floor | by source (RC9 selected) | surface (RC9 selected) | top new routes | gaps |
|---|---|---|---|---|---|---|
| חוף הכרמל | 20 → **20** / 10–20 | 0 | dataset 1, osm 18, bike_adjacent_walk 1 | walk run paved 1, hike offroad 16, bike road 1, bike offroad 2 | סינגל חגית (84, 6.8 km); שביל כחול · עין ע'זאל (84, 2.9 km); חורבת קרתא (83, 1.0 km) | 45 new not selected (best 82) |
| הגלבוע | 20 → **20** / 10–20 | 0 | osm 20 | walk run paved 1, hike offroad 17, bike offroad 2 | שביל עמק המעיינות (82, 10.8 km); דרך נוף שלוחת צבאים (82, 2.9 km); שביל כחול · נחל גבול (82, 8.9 km) | 8 new not selected (best 73) |
| מטה אשר | 20 → **20** / 10–20 | 0 | osm 19, named_ways 1 | walk run paved 1, hike offroad 14, bike offroad 5 | שביל ירוק · שביל נחל הבאר (84, 2.0 km); סינגל כברי (82, 11.6 km); שביל נחל יחיעם (82, 5.9 km) | 25 new not selected (best 82) |
| באר טוביה | 5 → **5** / 10–20 | 0 | osm 3, generated 2 | walk run paved 2, hike offroad 3 | שביל שחור · תל אשדוד (82, 2.6 km); שביל שחור · נחל האלה (81, 1.4 km); שביל אדום 10665 · שלושת המגדלים (79, 0.5 km) | short 5; 40 new not selected (best 69) |
| לב השרון | 13 → **13** / 10–20 | 0 | osm 9, generated 4 | walk run paved 1, hike offroad 12 | שביל כחול · יד לבנים (81, 1.1 km); שביל גולני (79, 6.8 km); שביל שחור · הפרדס (79, 3.1 km) | 31 new not selected (best 69) |
| מנשה | 12 → **12** / 10–20 | 0 | osm 8, generated 4 | hike offroad 10, bike offroad 2 | סינגל עירון טבעת כחולה (82, 14.5 km); שביל כחול 4451 · נחל עירון (82, 4.1 km); שביל כחול · התבור (82, 3.7 km) | 51 new not selected (best 69) |
| אל קסום | 3 → **3** / 10–20 | 0 | osm 2, generated 1 | hike offroad 3 | שביל שחור 11190 · נחל דרגות (79, 0.4 km); שביל גולני (75, 1.9 km); לולאת מכחול · נחל דרגות · 4.5 ק״מ (72, 4.5 km) | short 7; 12 new not selected (best 66) |
| חוף אשקלון | 15 → **15** / 10–20 | 0 | osm 15 | hike offroad 13, bike road 1, bike offroad 1 | דרך נוף נחל שקמה (82, 12.6 km); דרך השיזף (82, 2.6 km); שביל שחור · יד לאשה הלוחמת (82, 3.2 km) | 7 new not selected (best 78) |
| הגליל העליון | 0 → **0** / 10–20 | 0 | — | — | — | short 10; no OSM admin relation |
| עמק המעיינות | 20 → **20** / 10–20 | 0 | osm 19, named_ways 1 | walk run paved 1, hike offroad 17, bike offroad 2 | שביל אדום 3535 · הרי גלבוע (82, 5.7 km); שביל שחור 3628 · בית המוכתר (82, 5.1 km); שביל אדום · נחל תבור (82, 3.6 km) | 9 new not selected (best 79) |
| עמק הירדן | 20 → **20** / 10–20 | 0 | osm 19, named_ways 1 | walk run paved 1, hike offroad 17, bike road 1, bike offroad 1 | שביל עמק המעיינות (83, 15.8 km); סינגל יער שווייץ (82, 10.0 km); שביל ישו (82, 10.4 km) | 15 new not selected (best 79) |
| שדות דן | 0 → **0** / 10–20 | 0 | — | — | — | short 10; 13 new not selected (best 66) |
| לכיש | 20 → **20** / 10–20 | 0 | osm 20 | walk run paved 1, hike offroad 17, bike offroad 2 | דרך נוף נחל שקמה (82, 11.5 km); סובב ברור חיל (82, 4.7 km); סינגל פלוגות (82, 4.3 km) | 20 new not selected (best 82) |
| מרום הגליל | 20 → **20** / 10–20 | 0 | osm 20 | hike offroad 18, bike offroad 2 | שביל הלוחמים (82, 4.2 km); תל חצור למערת עלמה (82, 2.8 km); שביל אדום · נחל דישון (82, 5.2 km) | 25 new not selected (best 81) |
| מרחבים | 18 → **19** / 10–20 | 0 | osm 18, named_ways 1 | walk run paved 1, hike offroad 13, bike road 1, bike offroad 4 | סינגל אופקים (82, 5.9 km); סינגל גרר (שרשרת מערב - ירוק) (82, 3.5 km); שביל כחול · נחל גרר (82, 3.4 km) | 24 new not selected (best 70) |
| נווה מדבר | 2 → **2** / 10–20 | 0 | generated 2 | walk run paved 1, hike offroad 1 | לולאת אבו קרינאת · נחל ערוער · 2.6 ק״מ (71, 2.6 km); לולאת ביר הדאג' · 3.8 ק״מ (70, 3.8 km) | short 8; 10 new not selected (best 68) |
| שפיר | 9 → **10** / 10–20 | 0 | osm 7, bike_adjacent_walk 1, generated 2 | walk run paved 1, hike offroad 8, bike offroad 1 | סינגל פלוגות (82, 11.4 km); שביל שחור · נחל דגנים (82, 2.9 km); שביל שחור · נחל לכיש (82, 2.7 km) | 23 new not selected (best 69) |
| הגליל התחתון | 0 → **0** / 10–20 | 0 | — | — | — | short 10; no OSM admin relation |
| זבולון | 10 → **12** / 10–20 | 0 | osm 10, named_ways 1, bike_adjacent_walk 1 | walk run paved 2, hike offroad 8, bike offroad 2 | שביל אוהד - סובב נופית (83, 2.4 km); סינגל יער קריית אתא (82, 6.0 km); שביל כחול · אבן השבת (82, 3.3 km) | 3 new not selected (best 69) |
| שדות נגב | 12 → **12** / 10–20 | 0 | osm 12 | hike offroad 7, bike road 1, bike offroad 4 | סינגל גרר (שרשרת מערב - ירוק) (82, 4.3 km); סובב צפוני בארי (82, 4.4 km); שביל שחור · נחל שובה (82, 4.5 km) | 3 new not selected (best 81) |
| מגידו | 20 → **20** / 10–20 | 0 | osm 20 | walk run paved 1, hike offroad 17, bike road 1, bike offroad 1 | סובב זהורה (84, 2.3 km); תצפית המאגר (83, 1.1 km); מהר גחר לנחל השופט (82, 2.7 km) | 15 new not selected (best 79) |
| מעלה יוסף | 19 → **19** / 10–20 | 0 | osm 19 | hike offroad 16, bike offroad 3 | שביל החורש (82, 2.7 km); סינגל נחל מצובה - קק"ל (82, 5.1 km); סינגל יחיעם (82, 3.7 km) | 12 new not selected (best 79) |
| בני שמעון | 20 → **20** / 10–20 | 0 | osm 19, named_ways 1 | walk run paved 1, hike offroad 16, bike road 1, bike offroad 2 | סינגל סנסנה (82, 5.0 km); שביל שחור 12462 · נחל גרר (82, 4.6 km); שביל ירוק · דרך הפסלים (82, 4.0 km) | 15 new not selected (best 81) |
| הר חברון | 16 → **18** / 10–20 | 0 | osm 16, bike_adjacent_walk 2 | walk run paved 3, hike offroad 12, bike offroad 3 | שביל ירוק · נחל שפן (82, 3.1 km); שביל אדום · מצודת תוואמין (81, 1.1 km); שביל כחול · גת (81, 1.1 km) | 6 new not selected (best 75) |
| נחל שורק | 0 → **1** / 10–20 | 0 | named_ways 1 | walk run paved 1 | טיילת נחל תמנה (73, 3.5 km) | short 9; 13 new not selected (best 68) |
| שער הנגב | 18 → **19** / 10–20 | 0 | osm 18, bike_adjacent_walk 1 | walk run paved 1, hike offroad 13, bike road 1, bike offroad 4 | סובב ברור חיל (82, 7.8 km); סינגל נחל משלים (82, 4.0 km); שביל ירוק · בוסטר (82, 4.5 km) | 6 new not selected (best 79) |
| אל-בטוף | 1 → **1** / 10–20 | 0 | osm 1 | hike offroad 1 | שביל אדום · המוביל הארצי (80, 2.2 km) | short 9; 6 new not selected (best 62) |
| יואב | 20 → **20** / 10–20 | 0 | osm 20 | walk run paved 1, hike offroad 17, bike offroad 2 | דרך חרובית (82, 4.6 km); שביל אדום 10520 · נחל בעלן (82, 9.6 km); שביל ירוק · תל צפית (82, 2.0 km) | 9 new not selected (best 79) |
| רמת הנגב | 0 → **0** / 10–20 | 0 | — | — | — | short 10; no OSM admin relation |
| מבואות החרמון | 20 → **20** / 10–20 | 0 | osm 20 | walk run paved 1, hike offroad 16, bike road 1, bike offroad 2 | דרך הירדן ההררי (82, 10.5 km); סינגל הרי נפתלי (82, 3.4 km); תל חצור למערת עלמה (82, 3.6 km) | 7 new not selected (best 78) |
| בוסתן אל-מרג' | 2 → **2** / 10–20 | 0 | osm 2 | walk run paved 1, bike offroad 1 | סינגל גבעת המורה (79, 0.4 km); שביל אדום · גבעת המורה (72, 0.5 km) | short 8; 11 new not selected (best 68) |
| ערבות הירדן | 11 → **11** / 10–20 | 0 | osm 11 | hike offroad 10, bike offroad 1 | שביל ירוק 5530 · תל א-שיח ד'יב (82, 3.7 km); שביל שחור 5535 · אנדרטת הבקעה (82, 2.3 km); שביל שחור 5629 (82, 2.1 km) | 1 new not selected (best 68) |
| ברנר | 4 → **6** / 10–20 | 2 | osm 2, bike_adjacent_walk 2, generated 2 | walk run paved 3, hike offroad 3 | דרך נוף נחל גמליאל (79, 4.8 km); שביל אדום · נחל גמליאל (79, 3.9 km); לולאת גן שלמה (קבוצת שילר) · מסגד זרנוגה · 4.5 ק״מ (70, 4.5 km) | short 4; 16 new not selected (best 69) |
| הערבה התיכונה | 20 → **20** / 10–20 | 0 | osm 19, named_ways 1 | walk run paved 1, hike offroad 17, bike offroad 2 | נחל מסור (82, 12.1 km); נחל אמציהו (82, 11.9 km); נחל גוב (82, 4.0 km) | 92 new not selected (best 82) |
| חבל יבנה | 5 → **5** / 10–20 | 0 | osm 4, generated 1 | hike offroad 5 | שביל אדום · נחל שורק (82, 2.9 km); שביל כחול · נחל יבנה (82, 2.6 km); שביל שחור · נחל יבנה (81, 1.3 km) | short 5; 19 new not selected (best 69) |
| גן רווה | 5 → **6** / 10–20 | 0 | osm 4, named_ways 1, generated 1 | walk run paved 1, hike offroad 5 | שביל אדום 10340 · נחל שורק (82, 6.9 km); שביל כחול 10362 · נחל שורק (81, 1.4 km); שביל ירוק · נבי רובין (80, 1.4 km) | short 4; 20 new not selected (best 68) |
| חבל אילות | 20 → **20** / 10–20 | 0 | osm 19, named_ways 1 | walk run paved 1, hike offroad 17, bike offroad 2 | הקניון הלבן (84, 2.5 km); שביל אדום · מכרות עתיקים (83, 1.2 km); שביל כחול · נחל עתק (82, 4.6 km) | 140 new not selected (best 82) |
| גדרות | 0 → **0** / 10–20 | 0 | — | — | — | short 10; 14 new not selected (best 68) |
| מגילות ים המלח | 20 → **20** / 10–20 | 0 | osm 19, named_ways 1 | walk run paved 1, hike offroad 17, bike offroad 2 | דרך רוג'ום א־נאקה–עין גדי (82, 8.9 km); שביל שחור 8120 · נחל אוג (82, 4.3 km); שביל אדום · נחל ישי (82, 2.8 km) | 66 new not selected (best 82) |
| אלונה | 11 → **16** / 10–20 | 0 | osm 11, named_ways 4, bike_adjacent_walk 1 | walk run paved 5, hike offroad 11 | שביל ירוק · נחל תנינים (82, 6.9 km); שביל אדום 4352 · דרך יוליה (82, 4.4 km); שביל שחור 4380 · נחל תנינים (82, 3.2 km) | 5 new not selected (best 69) |
| תמר | 20 → **20** / 10–20 | 0 | osm 19, named_ways 1 | walk run paved 1, hike offroad 17, bike offroad 2 | עוקף נחל פראים (82, 2.8 km); דרך רוג'ום א־נאקה–עין גדי (82, 2.6 km); נחל כידוד עילי (82, 2.5 km) | 129 new not selected (best 82) |
| מועצה אזורית אשכול | 20 → **20** / 10–20 | 0 | osm 19, bike_adjacent_walk 1 | walk run paved 1, hike offroad 15, bike offroad 4 | בארי כחול (שביל טל) (84, 5.0 km); סינגל אסף - כיסופים (83, 18.3 km); סינגל בוהו (82, 5.4 km) | 28 new not selected (best 82) |
| מועצה אזורית גולן | 20 → **20** / 10–20 | 0 | osm 20 | walk run paved 1, hike offroad 16, bike road 1, bike offroad 2 | מפל זוויתן (82, 3.6 km); גובתה (82, 5.7 km); קצרין-זויתן-חניון יהודיה (82, 3.5 km) | 64 new not selected (best 82) |
| מועצה אזורית גוש עציון | 20 → **20** / 10–20 | 0 | osm 20 | walk run paved 2, hike offroad 16, bike offroad 2 | נחל חלץ (82, 3.4 km); עינות טאו (82, 2.2 km); שביל כחול · הר מונטר (82, 4.9 km) | 35 new not selected (best 79) |
| מועצה אזורית גזר | 11 → **11** / 10–20 | 0 | osm 11 | walk run paved 1, hike offroad 9, bike offroad 1 | דרך לח"י (83, 1.2 km); שביל ישראל (82, 5.4 km); שביל כחול · נחל עקרון (82, 3.0 km) | 5 new not selected (best 69) |
| מועצה אזורית גליל עמקים | 0 → **0** / 10–20 | 0 | — | — | — | short 10; no OSM admin relation |
| מועצה אזורית דרום השרון | 15 → **16** / 10–20 | 0 | osm 15, bike_adjacent_walk 1 | walk run paved 2, hike offroad 12, bike offroad 2 | שביל ירוק · מעלה ארומה 2 (83, 1.2 km); שביל שחור · מורד צור נתן צפון (82, 3.3 km); שביל כחול · מצפור חזי (82, 2.2 km) | 10 new not selected (best 81) |
| מועצה אזורית חבל מודיעין | 20 → **20** / 10–20 | 0 | osm 19, named_ways 1 | walk run paved 2, hike offroad 15, bike offroad 3 | סינגל הרצל (83, 10.3 km); טיילת העמק (83, 1.2 km); נחל נטוף (82, 4.5 km) | 26 new not selected (best 81) |
| מועצה אזורית חוף השרון | 11 → **11** / 10–20 | 0 | osm 11 | hike offroad 10, bike offroad 1 | שביל ירוק · נחל רשפון (82, 2.5 km); נחל פולג (81, 5.9 km); שכונה ארעית → געש (81, 1.1 km) | 3 new not selected (best 68) |
| מועצה אזורית מטה בנימין | 20 → **20** / 10–20 | 0 | osm 20 | walk run paved 1, hike offroad 17, bike offroad 2 | סינגל הגורל השביעי (83, 9.7 km); שביל ירוק · נחל פרת · ואדי א-נימר (82, 5.6 km); שביל אדום · דרך נוף דרומית (82, 5 km) | 53 new not selected (best 81) |
| מועצה אזורית מטה יהודה | 20 → **20** / 10–20 | 0 | osm 20 | walk run paved 1, hike offroad 17, bike offroad 2 | נחל רפאים תחתון (86, 5.3 km); שביל כחול · רחוב ביסטרו (85, 1.1 km); שביל הבורות והבארות (84, 3.3 km) | 179 new not selected (best 82) |
| מועצה אזורית משגב | 20 → **20** / 10–20 | 0 | osm 19, named_ways 1 | walk run paved 1, hike offroad 16, bike offroad 3 | סינגל יער שגב (82, 13.9 km); סינגל באורות (82, 2.0 km); שביל אדום · עבירות קשה (82, 11.3 km) | 43 new not selected (best 81) |
| מועצה אזורית עמק חפר | 9 → **10** / 10–20 | 1 | osm 4, named_ways 1, generated 5 | walk run paved 1, hike offroad 9 | שביל ישראל (79, 10.9 km); שביל השרון (78, 19.6 km); אגמון חפר (78, 1.6 km) | 81 new not selected (best 69) |
| מועצה אזורית עמק יזרעאל | 20 → **20** / 10–20 | 0 | osm 20 | walk run paved 1, hike offroad 14, bike offroad 5 | סינגל תמרת (84, 12.3 km); סינגל הסוללים (84, 5.7 km); סובב שמשית (84, 4.0 km) | 56 new not selected (best 82) |
| מועצה אזורית שומרון | 8 → **9** / 10–20 | 0 | osm 8, bike_adjacent_walk 1 | walk run paved 2, hike offroad 5, bike offroad 2 | שביל אדום · נחל נרבתה · אום א-ריחאן (83, 1.0 km); שביל כחול 7413 · שביל נופים לנחל קנה (82, 2.5 km); שביל שחור · שביל חוות יאיר למיצד קנה (81, 1.8 km) | short 1; 71 new not selected (best 79) |

## שאר הרשויות (other) — 197

| authority | selected RC8 → RC9 / quota | via floor | by source (RC9 selected) | surface (RC9 selected) | top new routes | gaps |
|---|---|---|---|---|---|---|
| חולון | 0 → **2** / 15–25 | 0 | existing 1, named_ways 1 | walk run paved 1, bike road 1 | טיילת איילון (77, 1.3 km) | short 13; 13 new not selected (best 68) |
| בית שמש | 6 → **7** / 15–25 | 1 | osm 6, named_ways 1 | walk run paved 1, hike offroad 6 | שביל כחול · שער מערבי (85, 1.7 km); שביל אדום 9333 · נחל שורק (85, 1.3 km); שביל שחור · הרב ישראל גרוסמן (84, 3.1 km) | short 8; 25 new not selected (best 63) |
| רמת גן | 0 → **3** / 15–25 | 0 | named_ways 1, park_loops 2 | walk run paved 3 | לולאה בהפארק הלאומי (78, 2.4 km); שביל יונתן (76, 1.5 km); הקפת פארק אריאל שרון (73, 1.5 km) | short 12; 6 new not selected (best 63) |
| רחובות | 1 → **1** / 15–25 | 0 | osm 1 | hike offroad 1 | שביל שחור 10316 · אנדרטת שואה (79, 0.4 km) | short 14; 26 new not selected (best 64) |
| בת ים | 0 → **0** / 15–25 | 0 | — | — | — | short 15; 8 new not selected (best 61) |
| הרצליה | 5 → **9** / 15–25 | 2 | existing 5, bike_adjacent_walk 1, park_loops 3 | walk run paved 8, hike offroad 1 | הקפת גן לאומי אפולוניה - תל ארשף (77, 1.8 km); הקפת פארק הרצליה (73, 1.9 km); לאורך דרך תל-אביב · הלוך-חזור (70, 3.9 km) | short 6; 15 new not selected (best 70) |
| חדרה | 4 → **4** / 15–25 | 0 | osm 4 | hike offroad 4 | מסלול שער הנגב #1 (82, 2.2 km); שביל כחול · התבור (78, 1.3 km); שביל ישראל (75, 9.5 km) | short 11; 4 new not selected (best 68) |
| כפר סבא | 1 → **3** / 15–25 | 0 | osm 1, park_loops 2 | walk run paved 3 | הקפת פארק מערך המילואים (79, 1.5 km); שביל השרון (75, 7.0 km); הקפת פארק כפר סבא (70, 3.7 km) | short 12; 8 new not selected (best 66) |
| לוד | 0 → **0** / 15–25 | 0 | — | — | — | short 15; 3 new not selected (best 44) |
| מודיעין עילית | 0 → **0** / 15–25 | 0 | — | — | — | short 15; no OSM admin relation |
| רמלה | 0 → **0** / 15–25 | 0 | — | — | — | short 15; 5 new not selected (best 56) |
| רעננה | 1 → **3** / 15–25 | 2 | osm 1, bike_adjacent_walk 1, park_loops 1 | walk run paved 3 | שביל סובב רעננה (71, 7.0 km); הקפת פארק רעננה (69, 3.0 km); לאורך דרך הפארק · הלוך-חזור (65, 3.4 km) | short 12; 9 new not selected (best 65) |
| ראש העין | 4 → **8** / 15–25 | 1 | dataset 1, osm 4, named_ways 3 | walk run paved 4, hike offroad 3, bike road 1 | שביל כחול 7510 · נחל סוסי (81, 1.7 km); שביל אדום · נחל סוסי (79, 0.8 km); שביל גולני (73, 2.0 km) | short 7; 11 new not selected (best 66) |
| רהט | 1 → **1** / 15–25 | 0 | osm 1 | hike offroad 1 | שביל אדום · נחל גרר (81, 1.5 km) | short 14; 6 new not selected (best 66) |
| נצרת | 3 → **3** / 15–25 | 0 | osm 3 | walk run paved 1, hike offroad 1, bike offroad 1 | סינגל יפיע (כפר החורש - יפיע) (81, 1.1 km); שביל כחול · הר קדומים (81, 1.4 km); שביל ישו (76, 4.3 km) | short 12; 6 new not selected (best 58) |
| קרית גת | 2 → **5** / 15–25 | 1 | osm 2, named_ways 2, bike_adjacent_walk 1 | walk run paved 3, hike offroad 1, bike offroad 1 | סינגל פלוגות (82, 2.2 km); שביל אדום · שחריה (79, 0.9 km); טיילת המלך חסן השני (77, 1.7 km) | short 10; 5 new not selected (best 70) |
| נהריה | 2 → **7** / 8–15 | 5 | osm 2, bike_adjacent_walk 4, park_loops 1 | walk run paved 5, hike offroad 1, bike offroad 1 | סינגל כברי (81, 1.1 km); שביל הים (75, 6.9 km); לאורך שביל האופניים בנהריה (69, 1.6 km) | short 1; 2 new not selected (best 49) |
| הוד השרון | 2 → **3** / 8–15 | 0 | osm 2, park_loops 1 | walk run paved 2, hike offroad 1 | שביל ישראל (82, 5.3 km); הקפת הפארק האקולוגי הוד השרון (78, 1.6 km); שביל השרון (73, 5.4 km) | short 5; 5 new not selected (best 66) |
| עפולה | 4 → **5** / 8–15 | 0 | osm 4, named_ways 1 | walk run paved 2, hike offroad 2, bike offroad 1 | נוף גבעת המורה (82, 8.0 km); שביל שחור 3360 · חורבת סהר (82, 2.5 km); סינגל גבעת המורה (81, 9.3 km) | short 3; 9 new not selected (best 62) |
| גבעתיים | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 6 new not selected (best 60) |
| קרית אתא | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 7 new not selected (best 63) |
| יבנה | 1 → **3** / 8–15 | 0 | osm 1, named_ways 1, bike_adjacent_walk 1 | walk run paved 2, hike offroad 1 | שביל אדום · נחל שורק (81, 2.7 km); טיילת הנחל (74, 2.5 km); לאורך שדרות הציונות · הלוך-חזור (70, 3.0 km) | short 5; 9 new not selected (best 64) |
| נוף הגליל | 9 → **9** / 8–15 | 0 | osm 9 | hike offroad 7, bike offroad 2 | סינגל בית קשת (82, 13.9 km); סינגל סובב נוף הגליל (82, 8.2 km); שביל ישראל (82, 5.4 km) | 4 new not selected (best 79) |
| קריית מוצקין | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 5 new not selected (best 67); no OSM admin relation |
| נתיבות | 1 → **1** / 8–15 | 0 | osm 1 | bike offroad 1 | סינגל בוהו (81, 1.4 km) | short 7; 5 new not selected (best 57) |
| אילת | 15 → **15** / 8–15 | 0 | osm 15 | walk run paved 1, hike offroad 13, bike offroad 1 | שביל סובב אילת (82, 14.1 km); סכין יותם (82, 3.7 km); שביל אדום 20560 · שביל נחל שלמה (82, 7.5 km) | 25 new not selected (best 81) |
| עכו | 0 → **1** / 8–15 | 0 | named_ways 1 | walk run paved 1 | נפוליאון בונפרטה (71, 0.9 km) | short 7; 6 new not selected (best 66) |
| קריית ביאליק | 0 → **3** / 8–15 | 0 | dataset 1, named_ways 2 | walk run paved 2, bike road 1 | טיילת שמעון פרס (87, 3.6 km); שביל הפרדס (74, 1.4 km); שביל אופניים — שביל נחל גד (71, 2.9 km) | short 5; 5 new not selected (best 57); no OSM admin relation |
| טבריה | 8 → **8** / 8–15 | 0 | osm 8 | hike offroad 6, bike offroad 2 | שביל ירוק · נחל רקת (82, 2.3 km); טיבריוס (81, 1.8 km); ברניקי בלוז (79, 2.2 km) | 4 new not selected (best 76) |
| אלעד | 3 → **3** / 8–15 | 0 | osm 3 | hike offroad 3 | דרך הכח (79, 0.9 km); שביל גולני (76, 0.7 km); שביל אדום · נחל שילה (76, 1.0 km) | short 5; 3 new not selected (best 55) |
| רמת השרון | 1 → **3** / 8–15 | 0 | osm 1, named_ways 1, bike_adjacent_walk 1 | walk run paved 2, hike offroad 1 | שביל ישראל (82, 2.3 km); שביל השדות (82, 1.1 km); לאורך שביל השדות · הלוך-חזור (75, 4.5 km) | short 5; 9 new not selected (best 68) |
| כרמיאל | 6 → **8** / 8–15 | 0 | osm 6, named_ways 1, park_loops 1 | walk run paved 3, hike offroad 4, bike offroad 1 | שביל שחור · נחל שזור (82, 2.1 km); שביל אדום · נחל צוף (82, 3.3 km); שביל אדום · כרמיאל-חילזון (81, 5.8 km) | 6 new not selected (best 69) |
| נס ציונה | 2 → **2** / 8–15 | 0 | osm 1, generated 1 | walk run paved 1, hike offroad 1 | שביל אדום 10340 · חוות מרדכי (81, 1.2 km); לולאת נס ציונה · בית של אבו ריזק · 2.7 ק״מ (70, 2.7 km) | short 6; 12 new not selected (best 68) |
| טייבה | 1 → **1** / 8–15 | 0 | osm 1 | hike offroad 1 | שביל גולני (79, 6.8 km) | short 7; 2 new not selected (best 58) |
| קרית אונו | 2 → **2** / 8–15 | 0 | existing 2 | hike offroad 2 | — | short 6; 5 new not selected (best 63); no OSM admin relation |
| שפרעם | 1 → **1** / 8–15 | 0 | osm 1 | bike offroad 1 | סינגל אלון הגליל (79, 0.4 km) | short 7; 5 new not selected (best 69) |
| חריש | 2 → **3** / 8–15 | 0 | osm 2, bike_adjacent_walk 1 | walk run paved 1, hike offroad 1, bike offroad 1 | סינגל עירון טבעת כחולה (82, 7.8 km); שביל גולני (77, 0.5 km); לאורך שביל האופניים בחריש · הלוך-חזור (70, 3.1 km) | short 5; 4 new not selected (best 58) |
| אור יהודה | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 4 new not selected (best 57) |
| אופקים | 2 → **8** / 8–15 | 5 | osm 2, named_ways 6 | walk run paved 6, hike offroad 1, bike offroad 1 | שביל כחול · מצודת פטיש (79, 0.5 km); סינגל אופקים (77, 6.3 km); נחל פורה (70, 2.5 km) | 13 new not selected (best 62) |
| דימונה | 6 → **10** / 8–15 | 0 | osm 6, bike_adjacent_walk 4 | walk run paved 4, hike offroad 6 | שביל אדום · נחל ממשית (82, 3.2 km); שביל אדום · נחל אשלון (82, 6.6 km); שביל כחול · שביל הנרקיסים (81, 2.8 km) | 2 new not selected (best 69) |
| באר יעקב | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 5 new not selected (best 55) |
| צפת | 11 → **11** / 8–15 | 0 | osm 11 | hike offroad 9, bike road 1, bike offroad 1 | שביל ישראל (82, 5.7 km); סינגל ביריה (82, 2.6 km); שביל הלוחמים (82, 2.3 km) | 9 new not selected (best 79) |
| טמרה | 3 → **3** / 8–15 | 0 | osm 3 | hike offroad 3 | שביל שחור · נחל שכניה · נחל כבול (82, 5.5 km); שביל אדום · נחל קנקן (82, 6.0 km); שביל כחול · נחל כבול (79, 0.4 km) | short 5; 4 new not selected (best 67) |
| סח'נין | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 6 new not selected (best 65) |
| טירת כרמל | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 3 new not selected (best 59); no OSM admin relation |
| יהוד-מונוסון | 0 → **1** / 8–15 | 0 | named_ways 1 | walk run paved 1 | שביל סובב יהוד מונוסון (71, 0.9 km) | short 7; 5 new not selected (best 54) |
| באקה אל-גרביה | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 3 new not selected (best 49); no OSM admin relation |
| גדרה | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 6 new not selected (best 58) |
| קריית מלאכי | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 2 new not selected (best 59); no OSM admin relation |
| כפר יונה | 0 → **1** / 8–15 | 1 | named_ways 1 | walk run paved 1 | נחל בשור (68, 1.1 km) | short 7; 5 new not selected (best 49) |
| ערד | 15 → **15** / 8–15 | 0 | existing 2, osm 13 | walk run paved 1, hike offroad 12, bike road 1, bike offroad 1 | שביל ישראל לאופניים - קטע קישור בתוך העיר ערד (83, 1.4 km); שביל כחול 11241 · נחל רחף (82, 7.4 km); שביל כחול 11361 · נחל קינה (82, 5.4 km) | 16 new not selected (best 81) |
| גבעת שמואל | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 3 new not selected (best 62) |
| עראבה | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 7 new not selected (best 61) |
| מגדל העמק | 2 → **2** / 8–15 | 0 | osm 2 | bike offroad 2 | סינגל כפר החורש (81, 1.4 km); סובב מגדל העמק (77, 11.0 km) | short 6; 4 new not selected (best 56) |
| אור עקיבא | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 5 new not selected (best 59) |
| כפר קאסם | 1 → **1** / 8–15 | 0 | osm 1 | hike offroad 1 | שביל גולני (76, 2.5 km) | short 7; 5 new not selected (best 61) |
| גני תקווה | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 1 new not selected (best 52) |
| מבשרת ציון | 7 → **7** / 8–15 | 0 | osm 7 | hike offroad 7 | שביל ירושלים (81, 4.1 km); שביל ירוק · שביל עוטף מבשרת ציון (81, 1.6 km); שביל ירוק · בית הסירנה (80, 1.6 km) | short 1; 10 new not selected (best 63) |
| מעלות-תרשיחא | 2 → **2** / 8–15 | 0 | osm 2 | hike offroad 2 | שביל שחור · נחל מרווה (81, 1.1 km); שביל כחול · נחל מרווה (79, 2.0 km) | short 6; 4 new not selected (best 52) |
| גבעת זאב | 3 → **3** / 8–15 | 0 | osm 3 | walk run paved 1, hike offroad 2 | שביל אדום · מערת קבורה (82, 2.3 km); שביל גולני (72, 1.4 km); שביל שחור · סובב נבי סמואל מערבי (70, 2.2 km) | short 5; 8 new not selected (best 64) |
| קלנסווה | 1 → **1** / 8–15 | 0 | osm 1 | hike offroad 1 | שביל גולני (76, 1.9 km) | short 7; 4 new not selected (best 54) |
| כפר כנא | 2 → **2** / 8–15 | 0 | osm 2 | walk run paved 1, hike offroad 1 | שביל ישו (76, 3.6 km); שביל הסנהדרין (71, 2.8 km) | short 6; 2 new not selected (best 45) |
| קריית שמונה | 5 → **5** / 8–15 | 0 | osm 5 | hike offroad 3, bike offroad 2 | סינגל הרי נפתלי (82, 13.7 km); שביל אדום 2050 · מצוק הנעלם (82, 2.8 km); סינגל מנרה לשעבר (81, 1.9 km) | short 3; 6 new not selected (best 78) |
| מגאר | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 3 new not selected (best 56); no OSM admin relation |
| יקנעם עילית | 2 → **8** / 8–15 | 0 | osm 2, named_ways 4, bike_adjacent_walk 2 | walk run paved 6, hike offroad 2 | טיילת נחל השניים (83, 1.9 km); שביל כחול 4235 · נחל סנין (81, 1.1 km); טיילת קק"ל (80, 1.2 km) | 4 new not selected (best 78) |
| תל שבע | 1 → **2** / 8–15 | 1 | osm 1, named_ways 1 | walk run paved 1, hike offroad 1 | שביל סובב באר שבע (79, 0.5 km); אל-ואדי (67, 0.8 km) | short 6; 6 new not selected (best 64) |
| זכרון יעקב | 9 → **10** / 8–15 | 0 | existing 1, osm 8, bike_adjacent_walk 1 | walk run paved 1, hike offroad 7, bike offroad 2 | שביל אדום 4352 · דרך נוף חורשן (82, 12.5 km); שביל ירוק · נחל תנינים (82, 4.5 km); שביל שחור · הר חורשן · סווידה (81, 1.0 km) | 2 new not selected (best 69) |
| שוהם | 0 → **4** / 8–15 | 1 | bike_adjacent_walk 4 | walk run paved 4 | לאורך שביל האופניים בשוהם · הלוך-חזור (76, 4.2 km); לאורך טיילת העמק · הלוך-חזור (73, 3.4 km); לאורך שביל האופניים בשוהם · הלוך-חזור (70, 3.1 km) | short 4; 5 new not selected (best 60); no OSM admin relation |
| חורה | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 2 new not selected (best 42) |
| כפר מנדא | 2 → **2** / 8–15 | 0 | osm 2 | hike offroad 2 | שביל שחור · ספלולים (82, 2.6 km); מסלול כפר מנדא #1 (81, 1.5 km) | short 6; 5 new not selected (best 65) |
| נשר | 9 → **9** / 8–15 | 0 | osm 8, named_ways 1 | walk run paved 1, hike offroad 8 | נוף הכרמל (81, 1.2 km); שביל אדום · נחל נשר (81, 1.8 km); שביל שחור · טיילת הגשרים (81, 1 km) | 2 new not selected (best 78) |
| כסיפה | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 1 new not selected (best 42); no OSM admin relation |
| ערערה-בנגב | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 2 new not selected (best 49) |
| ערערה | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 7 new not selected (best 64) |
| ג'דיידה-מכר | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 3 new not selected (best 51) |
| כפר קרע | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 5 new not selected (best 64) |
| בית שאן | 1 → **1** / 8–15 | 0 | osm 1 | hike offroad 1 | שביל עמק המעיינות (75, 8.3 km) | short 7; 4 new not selected (best 61) |
| קריית טבעון | 3 → **4** / 8–15 | 1 | osm 3, bike_adjacent_walk 1 | walk run paved 1, hike offroad 1, bike offroad 2 | סובב טבעון דרומי (80, 5.5 km); שביל הסנהדרין (78, 3.7 km); סובב טבעון צפוני (75, 9.3 km) | short 4; 9 new not selected (best 69) |
| יפיע | 1 → **1** / 8–15 | 0 | osm 1 | walk run paved 1 | שביל יזרעאל (73, 3.1 km) | short 7; 2 new not selected (best 53) |
| לקיה | 1 → **1** / 8–15 | 0 | osm 1 | walk run paved 1 | שביל אדום · נחל ליקית (72, 1.5 km) | short 7; 5 new not selected (best 67) |
| דאלית אל-כרמל | 0 → **1** / 8–15 | 1 | named_ways 1 | walk run paved 1 | ואדי עיסא (67, 2.4 km) | short 7; 1 new not selected (best 39); no OSM admin relation |
| ריינה | 2 → **2** / 8–15 | 0 | osm 1, generated 1 | hike offroad 2 | שביל ישו (79, 1.0 km); לולאת ריינה · נחל ציפורי · 2.4 ק״מ (71, 2.4 km) | short 6; 4 new not selected (best 68) |
| מזכרת בתיה | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 2 new not selected (best 51) |
| ירכא | 4 → **5** / 8–15 | 1 | osm 4, bike_adjacent_walk 1 | walk run paved 1, hike offroad 4 | שביל שחור · מעלה גיתה (82, 3.6 km); שביל נחל יצהר (79, 0.9 km); שביל ירוק · מצודת תפן (79, 3.2 km) | short 3; 5 new not selected (best 64) |
| בנימינה-גבעת עדה | 3 → **4** / 8–15 | 1 | osm 2, park_loops 1, generated 1 | walk run paved 2, hike offroad 2 | שביל ישראל (79, 0.7 km); שביל ירוק · נחל תנינים (74, 8.8 km); לולאת בנימינה · נחל תנינים · 6.5 ק״מ (70, 6.5 km) | short 4; 9 new not selected (best 64) |
| מעלה עירון | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 10 new not selected (best 62) |
| מג'ד אל-כרום | 3 → **3** / 8–15 | 0 | osm 3 | hike offroad 1, bike offroad 2 | שביל שחור · נחל שגור · בקעת בית כרם (81, 1.6 km); סובב צורית גילון (79, 2.9 km); סינגל יער אחיהוד (76, 1.9 km) | short 5; 9 new not selected (best 68) |
| תל מונד | 2 → **3** / 8–15 | 1 | osm 2, named_ways 1 | walk run paved 1, hike offroad 2 | שביל שחור · נחל חרות (79, 0.8 km); שביל השרון (73, 1.5 km); יער להב (63, 0.9 km) | short 5; 4 new not selected (best 60) |
| אכסאל | 0 → **0** / 8–15 | 0 | — | — | — | short 8; no OSM admin relation |
| אבן יהודה | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 3 new not selected (best 59) |
| ג'סר א-זרקא | 1 → **1** / 8–15 | 0 | osm 1 | hike offroad 1 | שביל ישראל (81, 3.6 km) | short 7; 2 new not selected (best 68) |
| טורעאן | 3 → **3** / 8–15 | 0 | osm 3 | hike offroad 3 | שביל אדום · 'דרך נופית 'יער בית-קשת (81, 1.6 km); שביל ירוק · הר תורען (79, 0.7 km); שביל הסנהדרין (78, 1.8 km) | short 5; 6 new not selected (best 60) |
| רכסים | 1 → **1** / 8–15 | 0 | osm 1 | hike offroad 1 | שביל ישראל (81, 2.0 km) | short 7; 4 new not selected (best 65) |
| אבו סנאן | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 5 new not selected (best 64) |
| עין מאהל | 3 → **3** / 8–15 | 0 | osm 3 | hike offroad 2, bike offroad 1 | שביל ישראל (81, 1.5 km); סינגל בית קשת (79, 0.5 km); שביל אדום · הר דבורה (79, 0.4 km) | short 5; 5 new not selected (best 65) |
| נחף | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 5 new not selected (best 68) |
| שגב-שלום | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 5 new not selected (best 66) |
| פוריידיס | 1 → **1** / 8–15 | 0 | osm 1 | bike offroad 1 | סינגל פוריידיס (81, 1.4 km) | short 7; 4 new not selected (best 64) |
| אעבלין | 2 → **2** / 8–15 | 0 | osm 2 | hike offroad 2 | שביל אדום · נחל שכניה (82, 2.1 km); שביל אדום · נחל קנקן (78, 1.6 km) | short 6; 2 new not selected (best 47) |
| דייר אל-אסד | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 3 new not selected (best 54); no OSM admin relation |
| ג'ת | 1 → **1** / 8–15 | 0 | osm 1 | hike offroad 1 | שביל גולני (79, 5.1 km) | short 7; 5 new not selected (best 59) |
| אזור | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 4 new not selected (best 58) |
| כאבול | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 6 new not selected (best 64) |
| אפרת | 1 → **1** / 8–15 | 0 | osm 1 | walk run paved 1 | שביל שחור 9408 · ואדי ארטאס (82, 2.7 km) | short 7; 8 new not selected (best 66) |
| עספיא | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 3 new not selected (best 53); no OSM admin relation |
| בית ג'ן | 6 → **6** / 8–15 | 0 | osm 6 | walk run paved 4, hike offroad 2 | שביל שחור · עין גרגה (80, 3.5 km); שביל אדום · נחל כזיב (79, 0.5 km); שביל כחול 2348 · עין סרטבה (74, 1.8 km) | short 2; 6 new not selected (best 69) |
| ירוחם | 8 → **9** / 8–15 | 0 | osm 8, bike_adjacent_walk 1 | walk run paved 1, hike offroad 6, bike offroad 2 | סינגל ירוחם (82, 8.4 km); שביל שחור · סכר אגם ירוחם על נחל רביבים (82, 2.8 km); שביל כחול · מחנה מחפשי הנפט (82, 2.1 km) | 5 new not selected (best 69) |
| מיתר | 5 → **5** / 8–15 | 0 | osm 5 | hike offroad 3, bike offroad 2 | שביל ישראל (82, 2.8 km); שביל ירוק · נחל אשתמוע (82, 8.4 km); שביל כחול · נחל חברון (82, 2.4 km) | short 3; 7 new not selected (best 68) |
| בסמ"ה | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 9 new not selected (best 62) |
| מג'דל שמס | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 1 new not selected (best 51); no OSM admin relation |
| ג'לג'וליה | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 4 new not selected (best 58) |
| דייר חנא | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 4 new not selected (best 60); no OSM admin relation |
| דבורייה | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 1 new not selected (best 43); no OSM admin relation |
| חצור הגלילית | 4 → **4** / 8–15 | 0 | osm 4 | hike offroad 3, bike offroad 1 | סינגל ביריה (82, 2.9 km); שביל כחול · נחל פארעם (81, 1.6 km); שביל כחול · עין פארעם (78, 1.2 km) | short 4; 6 new not selected (best 56) |
| ביר אל-מכסור | 2 → **2** / 8–15 | 0 | osm 1, generated 1 | walk run paved 1, bike offroad 1 | סינגל המוביל (חנתון) (82, 3.0 km); לולאת מקמאן · נחל גדורה · 4.3 ק״מ (70, 4.3 km) | short 6; 6 new not selected (best 61) |
| כפר יאסיף | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 2 new not selected (best 58) |
| בועיינה-נוג'ידאת | 0 → **0** / 8–15 | 0 | — | — | — | short 8; no OSM admin relation |
| קרני שומרון | 2 → **4** / 8–15 | 2 | osm 2, named_ways 2 | walk run paved 2, bike offroad 2 | סינגל צוקי קנה (76, 7.0 km); סינגל נוף קנה (71, 12.5 km); הנחל (65, 1.1 km) | short 4; 12 new not selected (best 65) |
| קריית עקרון | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 2 new not selected (best 53); no OSM admin relation |
| צור הדסה | 3 → **4** / 8–15 | 1 | osm 3, named_ways 1 | walk run paved 1, hike offroad 3 | שביל ישראל (79, 0.3 km); שביל שחור · חורבת כפר צום (79, 0.7 km); שביל שחור · מערת נטיפים צור הדסה (79, 0.4 km) | short 4; 7 new not selected (best 78) |
| כוכב יאיר | 2 → **2** / 8–15 | 0 | osm 2 | hike offroad 1, bike offroad 1 | שביל יער אייל (79, 0.6 km); מעלה אלכסנדר המלא (71, 1.1 km) | short 6; 6 new not selected (best 60) |
| אורנית | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 3 new not selected (best 64) |
| כסרא-סמיע | 0 → **0** / 8–15 | 0 | — | — | — | short 8; no OSM admin relation |
| משהד | 3 → **4** / 8–15 | 0 | osm 3, bike_adjacent_walk 1 | walk run paved 1, hike offroad 2, bike offroad 1 | סינגל הושעיה (81, 1.4 km); שביל הסנהדרין (79, 2.5 km); שביל ישו (77, 3.5 km) | short 4; 2 new not selected (best 49) |
| קצרין | 3 → **3** / 8–15 | 0 | osm 3 | hike offroad 2, bike offroad 1 | קצרין-זויתן-חניון יהודיה (82, 3.1 km); מקצרין לבריכות בתרא (79, 0.4 km); סינגל קצרין (70, 15.9 km) | short 5; 4 new not selected (best 59) |
| זרזיר | 1 → **1** / 8–15 | 0 | osm 1 | bike offroad 1 | שביל אדום · גבעת בר (79, 0.3 km) | short 7; 5 new not selected (best 61) |
| עילוט | 2 → **2** / 8–15 | 0 | osm 2 | hike offroad 1, bike offroad 1 | שביל אדום · הר בהרן (80, 1.0 km); סינגל שמשית (79, 0.5 km) | short 6; 7 new not selected (best 64) |
| עומר | 4 → **5** / 8–15 | 0 | osm 4, named_ways 1 | walk run paved 1, hike offroad 4 | שביל כחול 12557 · גבעות להב (82, 2.3 km); שביל אופניים עומר (80, 1.3 km); שביל שחור · נחל ליקית (79, 0.8 km) | short 3; 7 new not selected (best 69) |
| שער שומרון | 0 → **0** / 8–15 | 0 | — | — | — | short 8; no OSM admin relation |
| בענה | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 3 new not selected (best 60) |
| אבו גוש | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 5 new not selected (best 60) |
| ראמה | 3 → **3** / 8–15 | 0 | osm 3 | hike offroad 2, bike offroad 1 | סינגל הר חזון (82, 3.1 km); שביל שחור · נחל הארי (81, 1.5 km); שביל בית הכרם (79, 2.7 km) | short 5; 5 new not selected (best 61) |
| אלפי מנשה | 0 → **1** / 8–15 | 0 | bike_adjacent_walk 1 | walk run paved 1 | לאורך נופיה · הלוך-חזור (70, 8.5 km) | short 7; 3 new not selected (best 57) |
| רמת ישי | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 2 new not selected (best 54) |
| בסמת טבעון | 2 → **3** / 8–15 | 1 | osm 2, named_ways 1 | walk run paved 2, hike offroad 1 | שביל הסנהדרין (79, 2.6 km); שביל ישראל (73, 1.7 km); אל־ואדי (64, 1.8 km) | short 5; 8 new not selected (best 62) |
| שלומי | 2 → **2** / 8–15 | 0 | osm 2 | hike offroad 1, bike offroad 1 | שביל אדום · נחל בצת (79, 1.0 km); סינגל יער חניתה (76, 3.5 km) | short 6; 6 new not selected (best 64) |
| קריית ארבע | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 6 new not selected (best 58) |
| פרדסייה | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 1 new not selected (best 48); no OSM admin relation |
| זמר | 1 → **1** / 8–15 | 0 | generated 1 | hike offroad 1 | לולאת ימה · 4.4 ק״מ (70, 4.4 km) | short 7; 4 new not selected (best 64) |
| שעב | 1 → **1** / 8–15 | 0 | osm 1 | hike offroad 1 | שביל אדום · נחל חילזון (81, 7.4 km) | short 7; 4 new not selected (best 62) |
| קריית יערים | 0 → **0** / 8–15 | 0 | — | — | — | short 8; no OSM admin relation |
| להבים | 3 → **5** / 8–15 | 2 | osm 3, named_ways 2 | walk run paved 2, hike offroad 2, bike offroad 1 | להבים–אבו חוף (79, 1.1 km); שביל אדום · נחל גרר (79, 0.6 km); שביל ירוק · נחל גרר (79, 0.4 km) | short 3; 6 new not selected (best 64) |
| בית דגן | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 1 new not selected (best 47) |
| טובא-זנגרייה | 1 → **1** / 8–15 | 0 | osm 1 | hike offroad 1 | שביל כחול · נחל ראש פינה (81, 1.0 km) | short 7; 5 new not selected (best 63) |
| יאנוח-ג'ת | 4 → **4** / 8–15 | 0 | osm 4 | hike offroad 4 | שביל שחור · מעלה גיתה (81, 1.1 km); שביל נחל יחיעם (79, 3.3 km); שביל כחול · הר אשכר (79, 0.7 km) | short 4; 6 new not selected (best 64) |
| בוקעאתא | 2 → **2** / 8–15 | 0 | osm 2 | hike offroad 1, bike offroad 1 | שביל הגולן (79, 9.5 km); סובב יער אודם (74, 7.0 km) | short 6; 6 new not selected (best 65) |
| חורפיש | 4 → **4** / 8–15 | 0 | osm 4 | hike offroad 4 | שביל שחור · נחל כזיב (81, 1.1 km); שביל כחול · נחל פער (80, 1.6 km); שביל אזורי גליל עליון (79, 0.6 km) | short 4; 5 new not selected (best 64) |
| בני עי"ש | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 2 new not selected (best 58) |
| שבלי - אום אל-גנם | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 2 new not selected (best 48); no OSM admin relation |
| ג'ולס | 0 → **0** / 8–15 | 0 | — | — | — | short 8; no OSM admin relation |
| בית אל | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 1 new not selected (best 44) |
| כעביה-טבאש-חג'אג'רה | 2 → **2** / 8–15 | 0 | osm 2 | hike offroad 2 | שביל כחול · נחל ציפורי (79, 0.5 km); שביל ישראל (78, 1.9 km) | short 6; 3 new not selected (best 45) |
| עמנואל | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 3 new not selected (best 62) |
| פקיעין (בוקייעה) | 2 → **2** / 8–15 | 0 | osm 2 | hike offroad 2 | שביל אזורי גליל עליון (81, 1.3 km); פקיעין-חרשים (79, 2.4 km) | short 6; 6 new not selected (best 67) |
| כפר ורדים | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 4 new not selected (best 59) |
| בית אריה-עופרים | 0 → **1** / 8–15 | 0 | named_ways 1 | walk run paved 1 | טיילת כרמים (76, 1 km) | short 7; 1 new not selected (best 52) |
| מצפה רמון | 15 → **15** / 8–15 | 0 | osm 14, bike_adjacent_walk 1 | walk run paved 1, hike offroad 12, bike offroad 2 | מצפה רמון - חאן בארות (IBT) (82, 9.6 km); צבעי הרמון משפחתי (82, 4.8 km); נחל אפור (82, 4.6 km) | 14 new not selected (best 79) |
| עיילבון | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 2 new not selected (best 48); no OSM admin relation |
| סביון | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 5 new not selected (best 68) |
| יבנאל | 5 → **5** / 8–15 | 0 | osm 5 | hike offroad 5 | שביל ישראל (82, 2.4 km); שביל שחור · נחל יבנאל (82, 2.5 km); שביל ירוק · נחל יבנאל (82, 3.3 km) | short 3; 3 new not selected (best 48) |
| כפר תבור | 4 → **4** / 8–15 | 0 | osm 4 | hike offroad 4 | שביל ישראל (82, 4 km); שביל אדום 3324 · נחל תבור (82, 3.2 km); שביל ירוק 3336 · נחל תבור (82, 2.8 km) | short 4; 5 new not selected (best 67) |
| קדומים | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 10 new not selected (best 62) |
| אלקנה | 1 → **1** / 8–15 | 0 | osm 1 | hike offroad 1 | שביל גולני (78, 1.8 km) | short 7; 5 new not selected (best 58) |
| סאג'ור | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 1 new not selected (best 44); no OSM admin relation |
| כפר ברא | 2 → **2** / 8–15 | 0 | osm 2 | hike offroad 2 | שביל גולני (79, 2.2 km); שביל אדום · مغارة الضبعة (79, 0.7 km) | short 6; 3 new not selected (best 67) |
| מזרעה | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 1 new not selected (best 51) |
| הר אדר | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 4 new not selected (best 59) |
| מסעדה | 3 → **3** / 8–15 | 0 | osm 3 | walk run paved 1, hike offroad 1, bike offroad 1 | סובב יער אודם (79, 2.6 km); שביל הגולן (70, 3.5 km); שביל ירוק · נחל סער (70, 3.1 km) | short 5; 7 new not selected (best 64) |
| כאוכב אבו אל-היג'א | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 2 new not selected (best 52); no OSM admin relation |
| כפר כמא | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 2 new not selected (best 51) |
| אליכין | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 3 new not selected (best 59) |
| פסוטה | 2 → **2** / 8–15 | 0 | osm 2 | hike offroad 2 | מסע מים אל ים (82, 3.5 km); שביל אדום · נחל שרך (81, 1.9 km) | short 6; 5 new not selected (best 67) |
| ג'ש (גוש חלב) | 0 → **0** / 8–15 | 0 | — | — | — | short 8; no OSM admin relation |
| ראש פינה | 3 → **3** / 8–15 | 0 | osm 3 | hike offroad 3 | שביל נחל ראש פינה (81, 1.3 km); שביל ירוק · נחל ראש פינה (81, 1.5 km); שביל כחול · נחל פארעם (79, 0.8 km) | short 5; 8 new not selected (best 78) |
| מעיליא | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 2 new not selected (best 62) |
| ע'ג'ר | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 1 new not selected (best 55) |
| עין קנייא | 1 → **1** / 8–15 | 0 | osm 1 | hike offroad 1 | שביל ישראל (81, 1 km) | short 7; 5 new not selected (best 67) |
| כפר שמריהו | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 6 new not selected (best 59) |
| מגדל | 7 → **7** / 8–15 | 0 | osm 6, generated 1 | walk run paved 1, hike offroad 6 | שביל כחול · שביל אל מול כנרת (82, 3.0 km); שביל סובב כנרת (80, 4.3 km); שביל ישראל (79, 4.7 km) | short 1; 5 new not selected (best 67) |
| מטולה | 3 → **3** / 8–15 | 0 | osm 3 | walk run paved 2, hike offroad 1 | נחל עיון מסלול ארוך (83, 2.4 km); שביל אדום 2049 · חורבת נוחה (83, 0.6 km); שביל גולני (79, 3.5 km) | short 5; 1 new not selected (best 58) |
| מעלה אפרים | 5 → **5** / 8–15 | 0 | osm 5 | walk run paved 2, hike offroad 3 | שביל שחור · עין א-סוח'ן (81, 1.6 km); שביל כחול 5542 (79, 0.6 km); שביל המפקדים (73, 1.9 km) | short 3; 5 new not selected (best 64) |
| יסוד המעלה | 1 → **1** / 8–15 | 0 | osm 1 | hike offroad 1 | שביל שחור · גשר יסוד המעלה (82, 2.3 km) | short 7; 5 new not selected (best 58) |
| אום אל-פחם | 1 → **1** / 8–15 | 0 | generated 1 | hike offroad 1 | לולאת עקדה · נחל עוז · 3.9 ק״מ (71, 3.9 km) | short 7; 9 new not selected (best 67); population unknown → small quota |
| אריאל | 1 → **2** / 8–15 | 0 | osm 1, bike_adjacent_walk 1 | walk run paved 1, bike offroad 1 | סינגל אריאל (79, 7 km); לאורך שביל האופניים באריאל · הלוך-חזור (70, 3.5 km) | short 6; 7 new not selected (best 67); population unknown → small quota |
| ביתר עילית | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 3 new not selected (best 59); population unknown → small quota |
| גן יבנה | 0 → **0** / 8–15 | 0 | — | — | — | short 8; 6 new not selected (best 60); population unknown → small quota |
| דמו · באר שבע | 0 → **0** / 8–15 | 0 | — | — | — | short 8; no OSM admin relation; population unknown → small quota |
| דמו · חיפה | 0 → **0** / 8–15 | 0 | — | — | — | short 8; no OSM admin relation; population unknown → small quota |
| דמו · תל אביב | 0 → **0** / 8–15 | 0 | — | — | — | short 8; no OSM admin relation; population unknown → small quota |
| טירה | 1 → **1** / 8–15 | 0 | osm 1 | hike offroad 1 | שביל גולני (79, 2.3 km) | short 7; 3 new not selected (best 44); population unknown → small quota |
| מגדל תפן | 1 → **1** / 8–15 | 0 | osm 1 | hike offroad 1 | שביל אדום · נחל ינוח (82, 2.5 km) | short 7; 1 new not selected (best 55); population unknown → small quota |
| מודיעין-מכבים-רעות | 10 → **11** / 8–15 | 0 | osm 8, named_ways 1, bike_adjacent_walk 1, park_loops 1 | walk run paved 3, hike offroad 7, bike offroad 1 | סינגל ענבה (82, 12.1 km); שביל ישראל (82, 5.5 km); בקעת הנזירים (81, 1.7 km) | 30 new not selected (best 77); population unknown → small quota |
| מעלה אדומים | 5 → **8** / 8–15 | 0 | osm 5, bike_adjacent_walk 3 | walk run paved 3, hike offroad 4, bike offroad 1 | שביל כחול · טיבק קוטייף (82, 4.7 km); שביל ירוק 8125 · טיבק קוטייף (82, 3.4 km); שביל שחור 8227 · ואדי אל-מדורה (81, 1.8 km) | 2 new not selected (best 69); population unknown → small quota |
| נאות חובב | 0 → **1** / 8–15 | 0 | named_ways 1 | walk run paved 1 | שביל אופניים נאות חובב-עיר הבה"דים (76, 1.9 km) | short 7; 1 new not selected (best 47); population unknown → small quota |
| פרדס חנה-כרכור | 1 → **1** / 8–15 | 0 | osm 1 | hike offroad 1 | שביל פר"כור (76, 0.9 km) | short 7; 7 new not selected (best 48); population unknown → small quota |
| קדימה-צורן | 5 → **8** / 8–15 | 3 | osm 5, named_ways 2, bike_adjacent_walk 1 | walk run paved 4, hike offroad 4 | שביל האירוסים (81, 1.6 km); דרך הלב - עין שריד - יער אילנות (79, 3.0 km); שביל כחול · דרך היער (79, 2.7 km) | 9 new not selected (best 64); population unknown → small quota |
| wix | 0 → **0** / 8–15 | 0 | — | — | — | short 8; no OSM admin relation; population unknown → small quota |

## Known routes — web research (clients + big cities)

Names and existence facts only (municipal / tourism / Wikipedia / KKL / INPA / news pages; no Strava/Komoot/AllTrails/Trailforks; no geometry or text copied). Files: `docs/routes/known-routes/<authorityId>.json`. Matched routes enter the runner as candidates with the citation (`knownRoute`); "existing" = already an official route of that name.

### אשקלון

- ✅ **טיילת בר כוכבא** — osm_ways · 2.3 km · source: https://www.tiuli.com/points-of-interest/540/טיילת-בר-כוכבא-אשקלון
- ❓ **השביל המעגלי בגן לאומי אשקלון** — not matched (no route / relation / named way / big park with this name) · source: https://static-en.parks.org.il/wp-content/uploads/2020/10/מדריך-למדריך-תל-אשקלון.pdf

### קרית ים

- ❓ **טיילת קריית ים** — not matched (no route / relation / named way / big park with this name) · source: https://www.hamichlol.org.il/קריית_ים

### שדרות

- no citable named route found (see the research file notes)

### ירושלים

- ✅ **פארק המסילה** — osm_ways · 1.7 km · source: https://en.wikipedia.org/wiki/Railway_Park
- ✅ **טיילת ארמון הנציב** — osm_ways · 0.4 km · source: https://www.hamichlol.org.il/%D7%98%D7%99%D7%99%D7%9C%D7%AA_%D7%A9%D7%A8%D7%95%D7%91%D7%A8
- ✅ **שביל האופניים ההיקפי של ירושלים** — osm_relation · 17.1 km · source: https://www.inn.co.il/news/408061
- ✅ **שביל ירושלים** — osm_relation · 33.5 km · source: https://www.mako.co.il/travel-israel/jerusalem-50-years/Article-f62cfc7343f2c51006.htm
- ✅ **עמק הארזים: ליפתא - עיינות תלם** — osm_ways · 0.8 km · source: https://www.ynet.co.il/articles/mobile/0,7340,L-4074375,00.html
- ❓ **טיילת האז** — not matched (no route / relation / named way / big park with this name) · source: https://www.hamichlol.org.il/%D7%98%D7%99%D7%99%D7%9C%D7%AA_%D7%A9%D7%A8%D7%95%D7%91%D7%A8
- ❓ **טיילת שרובר** — not matched (no route / relation / named way / big park with this name) · source: https://www.hamichlol.org.il/%D7%98%D7%99%D7%99%D7%9C%D7%AA_%D7%A9%D7%A8%D7%95%D7%91%D7%A8
- ❓ **טיילת גולדמן** — not matched (no route / relation / named way / big park with this name) · source: https://www.hamichlol.org.il/%D7%98%D7%99%D7%99%D7%9C%D7%AA_%D7%A9%D7%A8%D7%95%D7%91%D7%A8

### תל אביב-יפו

- ✅ **פארק המסילה** — existing · 1.9 km · source: https://timeout.co.il/פארק-המסילה-נפתח-2/
- ✅ **שדרות רוטשילד** — osm_ways · 1.9 km · source: https://timeout.co.il/5-מסלולי-ריצה-תל-אביביים-מומלצים/
- ❓ **טיילת תל אביב-יפו** — not matched (no route / relation / named way / big park with this name) · source: https://timeout.co.il/פרויקט-מסלול-חמישה-מסלולים-מעניינים-ל/
- ❓ **שביל הירקון: כיכר היל - נמל תל אביב** — not matched (no route / relation / named way / big park with this name) · source: https://www.ias.co.il/?p=162825
- ❓ **שביל האופניים באלנבי** — not matched (no route / relation / named way / big park with this name) · source: https://timeout.co.il/שביל-אלנבי-אופניים/
- ❓ **פארק הירקון** — not matched (park "גני יהושע" found, but no walkable perimeter (a 620 m stretch of the boundary has no path)) · source: https://www.ias.co.il/?p=162825

### חיפה

- ✅ **שביל חיפה** — existing · 0.9 km · source: https://www.ynet.co.il/articles/mobile/0,7340,L-4358602,00.html
- ✅ **שביל ואדיות חיפה** — osm_relation · 37.6 km · source: https://www.hamichlol.org.il/%D7%A9%D7%91%D7%99%D7%9C_%D7%95%D7%90%D7%93%D7%99%D7%95%D7%AA_%D7%97%D7%99%D7%A4%D7%94
- ✅ **טיילת לואי** — existing · 0.7 km · source: https://www.ynet.co.il/articles/mobile/0,7340,L-4358602,00.html
- ✅ **טיילת הבה"ד** — osm_ways · 0.6 km · source: https://www.ice.co.il/realestate/news/article/930262
- ✅ **טיילת דדו** — existing · 2.0 km · source: https://www.tiuli.com/points-of-interest/845/%D7%97%D7%95%D7%A3-%D7%93%D7%93%D7%95
- ❓ **רצף טיילות החוף חיפה** — not matched (no route / relation / named way / big park with this name) · source: https://www.ias.co.il/?p=88630

### פתח תקווה

- ❓ **הירקון פתח תקווה - מקטע מזרחי** — not matched (no route / relation / named way / big park with this name) · source: https://www.kikar.co.il/416440.html

### ראשון לציון

- ❓ **טיילת ראשון לציון** — not matched (no route / relation / named way / big park with this name) · source: https://www.karamel.co.il/חוף_ראשון_לציון.asp

### נתניה

- ✅ **שמורת אירוס הארגמן** — osm_ways · 0.7 km · source: https://www.ias.co.il/?p=166954
- ❓ **טיילת חופי נתניה** — not matched (no route / relation / named way / big park with this name) · source: https://www.ias.co.il/?p=166954
- ❓ **פארק נתניה – אגם החורף** — not matched (no route / relation / named way / big park with this name) · source: https://www.ias.co.il/?p=166954
- ❓ **חורשת הסרג'נטים** — not matched (no route / relation / named way / big park with this name) · source: https://www.ias.co.il/?p=166954
- ❓ **טיילת גאודי** — not matched (no route / relation / named way / big park with this name) · source: https://www.ias.co.il/?p=166954

### בני ברק

- ❓ **שביל ההליכה והאופניים בני ברק – פארק הירקון** — not matched (no route / relation / named way / big park with this name) · source: https://www.kikar.co.il/israel-news/116981

### אשדוד

- ✅ **טיילת פארק נחל לכיש** — osm_ways · 0.8 km · source: https://www.tiuli.com/points-of-interest/318/%D7%A4%D7%90%D7%A8%D7%A7-%D7%A0%D7%97%D7%9C-%D7%9C%D7%9B%D7%99%D7%A9
- ✅ **שביל הבוסתן** — osm_relation · 0.4 km · source: https://www.tiuli.com/articles/1105/%D7%94%D7%98%D7%A8%D7%99%D7%95-%D7%A9%D7%9C-%D7%90%D7%A9%D7%93%D7%95%D7%93-3-%D7%90%D7%98%D7%A8%D7%A7%D7%A6%D7%99%D7%95%D7%AA-%D7%A9%D7%99%D7%A1%D7%93%D7%A8%D7%95-%D7%9C%D7%9B%D7%9D-%D7%99%D7%95%D7%9D-%D7%9B%D7%99%D7%A3-%D7%91%D7%A2%D7%99%D7%A8
- ❓ **שביל הצבאים** — not matched (no route / relation / named way / big park with this name) · source: https://www.tiuli.com/articles/1105/%D7%94%D7%98%D7%A8%D7%99%D7%95-%D7%A9%D7%9C-%D7%90%D7%A9%D7%93%D7%95%D7%93-3-%D7%90%D7%98%D7%A8%D7%A7%D7%A6%D7%99%D7%95%D7%AA-%D7%A9%D7%99%D7%A1%D7%93%D7%A8%D7%95-%D7%9C%D7%9B%D7%9D-%D7%99%D7%95%D7%9D-%D7%9B%D7%99%D7%A3-%D7%91%D7%A2%D7%99%D7%A8
- ❓ **שביל החוף** — not matched (no route / relation / named way / big park with this name) · source: https://www.tiuli.com/articles/1105/%D7%94%D7%98%D7%A8%D7%99%D7%95-%D7%A9%D7%9C-%D7%90%D7%A9%D7%93%D7%95%D7%93-3-%D7%90%D7%98%D7%A8%D7%A7%D7%A6%D7%99%D7%95%D7%AA-%D7%A9%D7%99%D7%A1%D7%93%D7%A8%D7%95-%D7%9C%D7%9B%D7%9D-%D7%99%D7%95%D7%9D-%D7%9B%D7%99%D7%A3-%D7%91%D7%A2%D7%99%D7%A8
- ❓ **טיילת אשדוד** — not matched (no route / relation / named way / big park with this name) · source: https://www.tiuli.com/articles/1105/%D7%94%D7%98%D7%A8%D7%99%D7%95-%D7%A9%D7%9C-%D7%90%D7%A9%D7%93%D7%95%D7%93-3-%D7%90%D7%98%D7%A8%D7%A7%D7%A6%D7%99%D7%95%D7%AA-%D7%A9%D7%99%D7%A1%D7%93%D7%A8%D7%95-%D7%9C%D7%9B%D7%9D-%D7%99%D7%95%D7%9D-%D7%9B%D7%99%D7%A3-%D7%91%D7%A2%D7%99%D7%A8

### באר שבע

- ✅ **שדרות נפתלי הרץ אימבר** — osm_ways · 6.0 km · source: https://www.ynet.co.il/health/article/Bka3VQwUw
- ✅ **דרך אילן רמון** — osm_ways · 3.8 km · source: https://www.ynet.co.il/health/article/Bka3VQwUw
- ❓ **הטיילת החדשה גן הפעמון - פארק נחל באר שבע** — not matched (park "פארק נחל באר שבע" found, but no walkable perimeter (only 66% of the boundary has a path within 30 m)) · source: https://www.tiuli.com/articles/1356/%D7%94%D7%9B%D7%99%D7%A8%D7%95-%D7%90%D7%AA-%D7%94%D7%98%D7%99%D7%99%D7%9C%D7%AA-%D7%94%D7%97%D7%93%D7%A9%D7%94-%D7%A9%D7%9C-%D7%91%D7%99%D7%A8%D7%AA-%D7%94%D7%93%D7%A8%D7%95%D7%9D
- ❓ **טיילת פארק נחל באר שבע** — not matched (park "פארק נחל באר שבע" found, but no walkable perimeter (only 66% of the boundary has a path within 30 m)) · source: https://www.ias.co.il/?p=137201

## City inventory — readiness (all authorities with a boundary)

`scripts/city-inventory/run.ts --all` dry-run, 2026-10-22. 16 authorities have no stored boundary and were skipped: ג'ש (גוש חלב), הגליל העליון, הגלבוע, מועצה אזורית גליל עמקים, בועיינה-נוג'ידאת, דמו · באר שבע, דמו · חיפה, דמו · תל אביב, רמת הנגב, ג'ולס, כסרא-סמיע, אכסאל, מודיעין עילית, שער שומרון, הגליל התחתון, wix.

| | 🔴 red | 🟡 yellow | 🟢 green |
|---|---|---|---|
| **all (248)** | 246 | 2 | 0 |
| client | 3 | 0 | 0 |
| large_city | 8 | 1 | 0 |
| regional_council | 50 | 0 | 0 |
| other | 185 | 1 | 0 |

Mean readiness score: 56.9 · errors: 0

**Most often missing layers:** shade (248), benches (61), toilets (57), drinking_water (49)

**Top blockers:**
- approved routes # < quota minimum # — 246
- fewer than # approved routes — 244
- shade not measured — 235
- below expected density: benches, drinking_water, toilets — 32
- a source licence is pending — 13
- shade coverage #% < #% — 13
- below expected density: benches — 12
- below expected density: benches, toilets — 10

| authority | tier | readiness | score | approved routes | top blocker |
|---|---|---|---|---|---|
| שדרות | client | 🔴 | 59 | 2 | fewer than 3 approved routes |
| אשקלון | client | 🔴 | 60 | 0 | fewer than 3 approved routes |
| קרית ים | client | 🔴 | 60 | 0 | fewer than 3 approved routes |
| באר שבע | large_city | 🔴 | 45 | 0 | fewer than 3 approved routes |
| נתניה | large_city | 🔴 | 50 | 0 | fewer than 3 approved routes |
| בני ברק | large_city | 🔴 | 50 | 0 | fewer than 3 approved routes |
| פתח תקווה | large_city | 🔴 | 55 | 0 | fewer than 3 approved routes |
| ירושלים | large_city | 🔴 | 60 | 0 | fewer than 3 approved routes |
| ראשון לציון | large_city | 🔴 | 60 | 0 | fewer than 3 approved routes |
| אשדוד | large_city | 🔴 | 60 | 0 | fewer than 3 approved routes |
| חיפה | large_city | 🔴 | 69 | 6 | approved routes 6 < quota minimum 25 |
| תל אביב-יפו | large_city | 🟡 | 80 | 27 | shade coverage 77.1% < 80% |
| לב השרון | regional_council | 🔴 | 50 | 0 | fewer than 3 approved routes |
| אל קסום | regional_council | 🔴 | 50 | 0 | fewer than 3 approved routes |
| שדות דן | regional_council | 🔴 | 50 | 0 | fewer than 3 approved routes |
| לכיש | regional_council | 🔴 | 50 | 0 | fewer than 3 approved routes |
| מרום הגליל | regional_council | 🔴 | 50 | 0 | fewer than 3 approved routes |
| מרחבים | regional_council | 🔴 | 50 | 0 | fewer than 3 approved routes |
| נווה מדבר | regional_council | 🔴 | 50 | 0 | fewer than 3 approved routes |
| שפיר | regional_council | 🔴 | 50 | 0 | fewer than 3 approved routes |
| שדות נגב | regional_council | 🔴 | 50 | 0 | fewer than 3 approved routes |
| מעלה יוסף | regional_council | 🔴 | 50 | 0 | fewer than 3 approved routes |
| בני שמעון | regional_council | 🔴 | 50 | 0 | fewer than 3 approved routes |
| הר חברון | regional_council | 🔴 | 50 | 0 | fewer than 3 approved routes |
| נחל שורק | regional_council | 🔴 | 50 | 0 | fewer than 3 approved routes |
| שער הנגב | regional_council | 🔴 | 50 | 0 | fewer than 3 approved routes |
| אל-בטוף | regional_council | 🔴 | 50 | 0 | fewer than 3 approved routes |
| יואב | regional_council | 🔴 | 50 | 0 | fewer than 3 approved routes |
| בוסתן אל-מרג' | regional_council | 🔴 | 50 | 0 | fewer than 3 approved routes |
| ערבות הירדן | regional_council | 🔴 | 50 | 0 | fewer than 3 approved routes |
| חבל יבנה | regional_council | 🔴 | 50 | 0 | fewer than 3 approved routes |
| חבל אילות | regional_council | 🔴 | 50 | 0 | fewer than 3 approved routes |
| גדרות | regional_council | 🔴 | 50 | 0 | fewer than 3 approved routes |
| אלונה | regional_council | 🔴 | 50 | 0 | fewer than 3 approved routes |
| מועצה אזורית אשכול | regional_council | 🔴 | 50 | 0 | fewer than 3 approved routes |
| מועצה אזורית גוש עציון | regional_council | 🔴 | 50 | 0 | fewer than 3 approved routes |
| מועצה אזורית מטה בנימין | regional_council | 🔴 | 50 | 0 | fewer than 3 approved routes |
| מועצה אזורית משגב | regional_council | 🔴 | 50 | 0 | fewer than 3 approved routes |
| מועצה אזורית שומרון | regional_council | 🔴 | 50 | 0 | fewer than 3 approved routes |
| חוף הכרמל | regional_council | 🔴 | 60 | 0 | fewer than 3 approved routes |
| מטה אשר | regional_council | 🔴 | 60 | 0 | fewer than 3 approved routes |
| באר טוביה | regional_council | 🔴 | 60 | 0 | fewer than 3 approved routes |
| מנשה | regional_council | 🔴 | 60 | 0 | fewer than 3 approved routes |
| חוף אשקלון | regional_council | 🔴 | 60 | 0 | fewer than 3 approved routes |
| עמק המעיינות | regional_council | 🔴 | 60 | 0 | fewer than 3 approved routes |
| עמק הירדן | regional_council | 🔴 | 60 | 0 | fewer than 3 approved routes |
| זבולון | regional_council | 🔴 | 60 | 0 | fewer than 3 approved routes |
| מגידו | regional_council | 🔴 | 60 | 0 | fewer than 3 approved routes |
| מבואות החרמון | regional_council | 🔴 | 60 | 0 | fewer than 3 approved routes |
| ברנר | regional_council | 🔴 | 60 | 0 | fewer than 3 approved routes |
| הערבה התיכונה | regional_council | 🔴 | 60 | 0 | fewer than 3 approved routes |
| גן רווה | regional_council | 🔴 | 60 | 0 | fewer than 3 approved routes |
| מגילות ים המלח | regional_council | 🔴 | 60 | 0 | fewer than 3 approved routes |
| תמר | regional_council | 🔴 | 60 | 0 | fewer than 3 approved routes |
| מועצה אזורית גולן | regional_council | 🔴 | 60 | 0 | fewer than 3 approved routes |
| מועצה אזורית גזר | regional_council | 🔴 | 60 | 0 | fewer than 3 approved routes |
| מועצה אזורית דרום השרון | regional_council | 🔴 | 60 | 0 | fewer than 3 approved routes |
| מועצה אזורית חבל מודיעין | regional_council | 🔴 | 60 | 0 | fewer than 3 approved routes |
| מועצה אזורית חוף השרון | regional_council | 🔴 | 60 | 0 | fewer than 3 approved routes |
| מועצה אזורית מטה יהודה | regional_council | 🔴 | 60 | 0 | fewer than 3 approved routes |
| מועצה אזורית עמק חפר | regional_council | 🔴 | 60 | 0 | fewer than 3 approved routes |
| מועצה אזורית עמק יזרעאל | regional_council | 🔴 | 60 | 0 | fewer than 3 approved routes |
| הוד השרון | other | 🔴 | 45 | 0 | fewer than 3 approved routes |
| נתיבות | other | 🔴 | 45 | 0 | fewer than 3 approved routes |
| ביתר עילית | other | 🔴 | 45 | 0 | fewer than 3 approved routes |
| בית שמש | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| חדרה | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| לוד | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| רמלה | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| ראש העין | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| רהט | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| נצרת | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| קרית גת | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| נהריה | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| עפולה | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| קרית אתא | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| יבנה | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| נוף הגליל | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| קריית מוצקין | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| קריית ביאליק | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| אלעד | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| טייבה | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| קרית אונו | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| שפרעם | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| חריש | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| אור יהודה | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| אופקים | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| דימונה | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| באר יעקב | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| צפת | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| טמרה | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| סח'נין | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| יהוד-מונוסון | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| באקה אל-גרביה | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| קריית מלאכי | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| כפר יונה | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| ערד | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| גבעת שמואל | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| עראבה | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| מגדל העמק | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| אור עקיבא | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| כפר קאסם | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| גני תקווה | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| מעלות-תרשיחא | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| קלנסווה | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| מגאר | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| כפר מנדא | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| כפר קרע | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| בית שאן | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| אום אל-פחם | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| טירה | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| מעלה אדומים | other | 🔴 | 50 | 0 | fewer than 3 approved routes |
| רעננה | other | 🔴 | 55 | 0 | fewer than 3 approved routes |
| אילת | other | 🔴 | 55 | 0 | fewer than 3 approved routes |
| נס ציונה | other | 🔴 | 55 | 0 | fewer than 3 approved routes |
| פרדס חנה-כרכור | other | 🔴 | 55 | 0 | fewer than 3 approved routes |
| חולון | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| רמת גן | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| רחובות | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| בת ים | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| כפר סבא | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| גבעתיים | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| עכו | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| טבריה | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| רמת השרון | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| כרמיאל | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| טירת כרמל | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| גדרה | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| מבשרת ציון | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| גבעת זאב | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| כפר כנא | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| קריית שמונה | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| יקנעם עילית | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| תל שבע | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| שוהם | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| חורה | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| נשר | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| כסיפה | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| ערערה-בנגב | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| ערערה | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| ג'דיידה-מכר | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| קריית טבעון | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| יפיע | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| לקיה | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| דאלית אל-כרמל | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| ריינה | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| מזכרת בתיה | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| ירכא | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| בנימינה-גבעת עדה | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| מעלה עירון | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| מג'ד אל-כרום | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| תל מונד | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| אבן יהודה | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| ג'סר א-זרקא | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| טורעאן | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| רכסים | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| אבו סנאן | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| עין מאהל | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| נחף | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| שגב-שלום | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| פוריידיס | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| אעבלין | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| דייר אל-אסד | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| ג'ת | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| אזור | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| כאבול | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| אפרת | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| עספיא | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| בית ג'ן | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| ירוחם | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| מיתר | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| בסמ"ה | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| מג'דל שמס | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| ג'לג'וליה | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| דייר חנא | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| דבורייה | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| חצור הגלילית | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| ביר אל-מכסור | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| כפר יאסיף | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| קרני שומרון | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| קריית עקרון | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| צור הדסה | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| כוכב יאיר | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| אורנית | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| משהד | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| קצרין | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| זרזיר | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| עילוט | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| עומר | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| בענה | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| אבו גוש | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| ראמה | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| אלפי מנשה | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| רמת ישי | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| בסמת טבעון | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| שלומי | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| קריית ארבע | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| פרדסייה | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| זמר | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| שעב | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| קריית יערים | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| להבים | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| בית דגן | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| טובא-זנגרייה | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| יאנוח-ג'ת | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| בוקעאתא | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| חורפיש | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| בני עי"ש | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| שבלי - אום אל-גנם | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| בית אל | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| כעביה-טבאש-חג'אג'רה | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| עמנואל | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| פקיעין (בוקייעה) | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| כפר ורדים | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| בית אריה-עופרים | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| מצפה רמון | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| עיילבון | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| סביון | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| יבנאל | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| כפר תבור | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| קדומים | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| אלקנה | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| סאג'ור | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| כפר ברא | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| מזרעה | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| הר אדר | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| מסעדה | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| כאוכב אבו אל-היג'א | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| כפר כמא | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| אליכין | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| פסוטה | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| ראש פינה | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| מעיליא | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| ע'ג'ר | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| עין קנייא | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| כפר שמריהו | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| מגדל | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| מטולה | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| מעלה אפרים | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| יסוד המעלה | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| אריאל | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| גן יבנה | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| מגדל תפן | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| מודיעין-מכבים-רעות | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| נאות חובב | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| קדימה-צורן | other | 🔴 | 60 | 0 | fewer than 3 approved routes |
| הרצליה | other | 🔴 | 77 | 12 | approved routes 12 < quota minimum 15 |
| זכרון יעקב | other | 🟡 | 85 | 26 | shade not measured |

