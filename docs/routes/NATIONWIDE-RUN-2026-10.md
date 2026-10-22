# Nationwide routes run — dry-run, October 2026 (RC8)

Generated 2026-10-22 from `scripts/routes-nationwide/run.ts` (dry-run, production read-only, live GraphHopper `foot_turns`, ≤ 30 GH calls per authority) on the RC8 branch (#667 + #675). **Nothing was written.** City inventory dry-run: `scripts/city-inventory/run.ts --all` (#674).

Sources per authority, in order: existing `official_routes` → **known routes** from web research (names + citations matched to OSM; researched for the 3 clients + 9 big cities) → open datasets (ofneidan, bicycle_jer_2019 — CC-BY) → named OSM route relations → named OSM paths/promenades stitched into corridors → big-park loops ("הקפת פארק X") → generated loops (pipeline B, then GraphHopper neighbourhood loops named after the streets/park they pass) — the two generating stages only while the quota minimum is unmet. Every candidate is scored with routeScore v1.2 (shade where the city has a layer; turns/zigzag on loops) and the top-N per authority is selected (score ≥ 70; the quota is a ceiling, never padded).

## Totals

| | |
|---|---|
| authorities run | 264 (errors: 0) |
| selected routes | **1138** (35 existing + **1103 new**) vs a summed quota minimum of 2494 |
| quota minimum met | 48 / 264 authorities |
| candidate pool | 3867 (3652 new candidates proposed) |
| bands (pool) | 🟢 22 · 🟡 3837 · 🔴 8 |
| GraphHopper | 5331 live calls, 0 cached, 74 refused by the per-authority budget, 0 errors |

**Selected by source:** existing 35 · known_routes 3 · dataset 0 · osm 1069 · named_ways 0 · park_loops 0 · generated 31 · neighbourhood 0

**New candidates added by stage (after dedup):** known_routes 13 · dataset 0 · osm 2028 · named_ways 329 · park_loops 34 · generated 748 · neighbourhood 500

**Selected by surface class:** walk_run_paved 84 · hike_offroad 900 · bike_road 16 · bike_offroad 138 · unknown 0

## What this run says (read first)

1. **Named OSM relations carry the run.** 2,028 new relation routes, median score 81 — 94% of everything selected (1,069 of 1,138). They are mostly hiking/trail routes, so the selected set is 79% `hike_offroad`; regional councils and the Jerusalem hills fill up, dense coastal cities do not.
2. **Urban candidates exist but sit under the selection floor.** Named corridors (329 new, median 57), big-park loops (34, median 63), GraphHopper neighbourhood loops (500, median 56) and pipeline-B loops (748, median 62) are all real, named routes — but `SELECTION_MIN_SCORE = 70` lets almost none in (31 generated, 3 known routes). Why they score low: no composition / lighting / amenity measurements yet (half points, low confidence), source tier `stitched`/`generated`, and no shade layer outside the Technion cities. Tel Aviv 9/25, Rishon 0/25, Petah Tikva 1/25, Ashkelon 0/15, Kiryat Yam 0/8.
3. **Datasets add nothing new now:** ofneidan + bicycle_jer_2019 give 9 corridor routes, all duplicates of routes already in `official_routes` (imported 21.10).
4. **Web research** found 40 named routes for the 3 clients + 9 big cities (Sderot: none citable): **18 matched** to geometry (5 already in the app, 4 OSM relations, 9 named OSM ways) and **22 unmatched** — listed per city in "Known routes" below for the owner (typical causes: a promenade with no `name` tag in OSM, a park whose boundary has no continuous path, a name the city uses that OSM does not).
5. **GraphHopper:** 5,331 live calls across 264 authorities (≤ 30 each, 74 refused by the budget, 0 errors) — well inside the plan's cost estimate.

## Owner decisions needed

- **Q-A — the selection floor for urban sources.** Options: (a) keep 70 and enrich first (run composition / lighting / amenity tagging on the new candidates, then re-score — the honest path, slower); (b) a separate floor of ~60 for `named_place` / `stitched` / park-loop candidates in authorities short of their quota (fills Tel Aviv / Rishon / clients now, with yellow-band routes); (c) apply with `--write-candidates` so the sub-70 routes land as `selection:'candidate'` for manual review in the panel — only after the review queue hides candidates (W4). No change was made — the floor is an owner number.
- **Q-B — which batches to apply first** (commands below). Recommendation: regional councils + Jerusalem/Haifa (OSM-relation heavy, mostly green/selected) first; dense cities after Q-A.

## Owner apply commands (batched — David runs them; each authority asks for a typed YES)

From the main checkout **after #667 + #675 are merged**, on `main`:

```bash
cd /Users/calisthenicsltd/Development/appout-1
git fetch && git status && git log --oneline -1 origin/main    # main == origin/main, includes #675
export TRAILS_OSM_CACHE_DIR=$PWD/.cache/osm
GH=--graphhopper-url=https://graphhopper-ufsbvwndwa-zf.a.run.app
DS=--datasets-dir=$HOME/Downloads          # ofneidan.zip + bicycle_jer_2019.zip
OUT=--out=scripts/output/nationwide-apply-2026-10

# 1. clients
npx tsx scripts/routes-nationwide/run.ts --apply --project appout-1 $GH $DS $OUT --city=אשקלון "--city=קרית ים" --city=שדרות
# 2. big cities
npx tsx scripts/routes-nationwide/run.ts --apply --project appout-1 $GH $DS $OUT --city=ירושלים "--city=תל אביב-יפו" --city=חיפה "--city=פתח תקווה" "--city=ראשון לציון" --city=נתניה "--city=בני ברק" --city=אשדוד "--city=באר שבע"
# 3. regional councils
npx tsx scripts/routes-nationwide/run.ts --apply --project appout-1 $GH $DS $OUT --kind=regional
# 4. everything else (the checkpoint in $OUT skips what batches 1-3 already did)
npx tsx scripts/routes-nationwide/run.ts --apply --project appout-1 $GH $DS $OUT --kind=municipal
```

Each apply re-computes the candidates (GraphHopper answers can differ slightly from this dry-run; to reuse them exactly, copy this run's `cache/gh/` into `$OUT/cache/gh/` first). Writes are create-only `official_routes` (status `pending`, `published:false`, through `buildValidatedDoc` at the write site) + `route_scores`; existing routes are never modified. Without `--write-candidates` only **selected** routes are created.

City inventory (#674), same batching:

```bash
npx tsx scripts/city-inventory/run.ts --all --tier=client --apply --project appout-1 --out=scripts/output/city-inventory/all-apply
npx tsx scripts/city-inventory/run.ts --all --tier=large_city --apply --project appout-1 --out=scripts/output/city-inventory/all-apply
npx tsx scripts/city-inventory/run.ts --all --tier=regional_council --apply --project appout-1 --out=scripts/output/city-inventory/all-apply
npx tsx scripts/city-inventory/run.ts --all --tier=other --apply --project appout-1 --out=scripts/output/city-inventory/all-apply
```
(`city_inventory` rules from #650 must be deployed before the inventory apply.)

## לקוחות (client) — 3

| authority | selected / quota | new | by source (selected) | surface (selected) | top routes | gaps |
|---|---|---|---|---|---|---|
| אשקלון | 0 / 15–25 | 0 | — | — | — | short 15; 9 new below 70 (best 61) |
| קרית ים | 0 / 8–15 | 0 | — | — | — | short 8; 2 new below 70 (best 62) |
| שדרות | 4 / 8–15 | 2 | existing 2, osm 2 | walk run paved 3, hike offroad 1 | מסלול שדרות #1 (79, 0.7 km); טיילת הכרמים (75, 0.9 km); מסלול הכלניות (72, 1.5 km) | short 4; 6 new below 70 (best 61) |

## ערים גדולות (large_city) — 9

| authority | selected / quota | new | by source (selected) | surface (selected) | top routes | gaps |
|---|---|---|---|---|---|---|
| ירושלים | 30 / 25–40 | 30 | known_routes 2, osm 28 | walk run paved 9, hike offroad 19, bike road 2 | שביל כחול · מערת קבורה (87, 1.0 km); סינגל הרכסים - IMBA (86, 5.0 km); שביל הארז (86, 3.8 km) | 22 new below 70 (best 85) |
| תל אביב-יפו | 9 / 25–40 | 2 | existing 7, osm 2 | walk run paved 8, bike road 1 | שביל ישראל (79, 13.6 km); הקפת פארק המסילה (78, 1.9 km); הקפת מדרון יפו (77, 2.5 km) | short 16; 14 new below 70 (best 66) |
| חיפה | 22 / 25–40 | 9 | existing 13, osm 9 | walk run paved 3, hike offroad 16, bike road 2, bike offroad 1 | טיילת חוף הכרמל (87, 2.0 km); שביל שחור · ואדי התשבי (83, 1.8 km); נחל עובדיה (82, 3.0 km) | short 3; 18 new below 70 (best 76) |
| פתח תקווה | 1 / 25–40 | 1 | osm 1 | hike offroad 1 | שביל ישראל (75, 5.3 km) | short 24; 9 new below 70 (best 61) |
| ראשון לציון | 0 / 25–40 | 0 | — | — | — | short 25; 10 new below 70 (best 65) |
| נתניה | 3 / 25–40 | 3 | osm 3 | walk run paved 1, hike offroad 2 | דרך הלב – נתניה (80, 0.4 km); שביל ישראל (76, 11.1 km); שביל אדום · נַחַל פּוֹלֵג (74, 1.1 km) | short 22; 15 new below 70 (best 67) |
| בני ברק | 0 / 25–40 | 0 | — | — | — | short 25; 7 new below 70 (best 64) |
| אשדוד | 2 / 25–40 | 2 | known_routes 1, osm 1 | hike offroad 2 | שביל שחור · תל אשדוד (86, 2.9 km); שביל הבוסתן (80, 0.4 km) | short 23; 10 new below 70 (best 65) |
| באר שבע | 9 / 25–40 | 9 | osm 9 | hike offroad 9 | שביל שחור · גבעות להב (82, 3.5 km); שביל אדום · נחל עשן (82, 6.6 km); שביל אדום · גבעות גורל (82, 3.5 km) | short 16; 14 new below 70 (best 59) |

## מועצות אזוריות (regional_council) — 55

| authority | selected / quota | new | by source (selected) | surface (selected) | top routes | gaps |
|---|---|---|---|---|---|---|
| חוף הכרמל | 20 / 10–20 | 20 | osm 20 | walk run paved 1, hike offroad 17, bike offroad 2 | סינגל חגית (84, 6.8 km); שביל כחול · עין ע'זאל (84, 2.9 km); חורבת קרתא (83, 1.0 km) | 36 new below 70 (best 81) |
| הגלבוע | 20 / 10–20 | 20 | osm 20 | walk run paved 1, hike offroad 17, bike offroad 2 | שביל עמק המעיינות (82, 10.8 km); דרך נוף שלוחת צבאים (82, 2.9 km); שביל כחול · נחל גבול (82, 8.9 km) | 6 new below 70 (best 73) |
| מטה אשר | 20 / 10–20 | 20 | osm 20 | hike offroad 15, bike offroad 5 | שביל ירוק · שביל נחל הבאר (84, 2.0 km); סינגל כברי (82, 11.6 km); שביל נחל יחיעם (82, 5.9 km) | 18 new below 70 (best 82) |
| באר טוביה | 5 / 10–20 | 5 | osm 3, generated 2 | walk run paved 2, hike offroad 3 | שביל שחור · תל אשדוד (82, 2.6 km); שביל שחור · נחל האלה (81, 1.4 km); שביל אדום 10665 · שלושת המגדלים (79, 0.5 km) | short 5; 40 new below 70 (best 69) |
| לב השרון | 13 / 10–20 | 13 | osm 9, generated 4 | walk run paved 1, hike offroad 12 | שביל כחול · יד לבנים (81, 1.1 km); שביל גולני (79, 6.8 km); שביל שחור · הפרדס (79, 3.1 km) | 31 new below 70 (best 69) |
| מנשה | 12 / 10–20 | 12 | osm 8, generated 4 | hike offroad 10, bike offroad 2 | סינגל עירון טבעת כחולה (82, 14.5 km); שביל כחול 4451 · נחל עירון (82, 4.1 km); שביל כחול · התבור (82, 3.7 km) | 45 new below 70 (best 69) |
| אל קסום | 3 / 10–20 | 3 | osm 2, generated 1 | hike offroad 3 | שביל שחור 11190 · נחל דרגות (79, 0.4 km); שביל גולני (75, 1.9 km); לולאת מכחול · נחל דרגות · 4.5 ק״מ (72, 4.5 km) | short 7; 12 new below 70 (best 66) |
| חוף אשקלון | 15 / 10–20 | 15 | osm 15 | hike offroad 13, bike road 1, bike offroad 1 | דרך נוף נחל שקמה (82, 12.6 km); דרך השיזף (82, 2.6 km); שביל שחור · יד לאשה הלוחמת (82, 3.2 km) | 5 new below 70 (best 78) |
| הגליל העליון | 0 / 10–20 | 0 | — | — | — | short 10; no OSM admin relation |
| עמק המעיינות | 20 / 10–20 | 20 | osm 20 | walk run paved 1, hike offroad 17, bike offroad 2 | שביל אדום 3535 · הרי גלבוע (82, 5.7 km); שביל שחור 3628 · בית המוכתר (82, 5.1 km); שביל אדום · נחל תבור (82, 3.6 km) | 4 new below 70 (best 79) |
| עמק הירדן | 20 / 10–20 | 20 | osm 20 | walk run paved 1, hike offroad 17, bike road 1, bike offroad 1 | שביל עמק המעיינות (83, 15.8 km); סינגל יער שווייץ (82, 10.0 km); שביל ישו (82, 10.4 km) | 13 new below 70 (best 79) |
| שדות דן | 0 / 10–20 | 0 | — | — | — | short 10; 13 new below 70 (best 66) |
| לכיש | 20 / 10–20 | 20 | osm 20 | walk run paved 1, hike offroad 17, bike offroad 2 | דרך נוף נחל שקמה (82, 11.5 km); סובב ברור חיל (82, 4.7 km); סינגל פלוגות (82, 4.3 km) | 18 new below 70 (best 82) |
| מרום הגליל | 20 / 10–20 | 20 | osm 20 | hike offroad 18, bike offroad 2 | שביל הלוחמים (82, 4.2 km); תל חצור למערת עלמה (82, 2.8 km); שביל אדום · נחל דישון (82, 5.2 km) | 25 new below 70 (best 81) |
| מרחבים | 18 / 10–20 | 18 | osm 18 | hike offroad 13, bike road 1, bike offroad 4 | סינגל אופקים (82, 5.9 km); סינגל גרר (שרשרת מערב - ירוק) (82, 3.5 km); שביל כחול · נחל גרר (82, 3.4 km) | 14 new below 70 (best 67) |
| נווה מדבר | 2 / 10–20 | 2 | generated 2 | walk run paved 1, hike offroad 1 | לולאת אבו קרינאת · נחל ערוער · 2.6 ק״מ (71, 2.6 km); לולאת ביר הדאג' · 3.8 ק״מ (70, 3.8 km) | short 8; 10 new below 70 (best 68) |
| שפיר | 9 / 10–20 | 9 | osm 7, generated 2 | hike offroad 8, bike offroad 1 | סינגל פלוגות (82, 11.4 km); שביל שחור · נחל דגנים (82, 2.9 km); שביל שחור · נחל לכיש (82, 2.7 km) | short 1; 26 new below 70 (best 69) |
| הגליל התחתון | 0 / 10–20 | 0 | — | — | — | short 10; no OSM admin relation |
| זבולון | 10 / 10–20 | 10 | osm 10 | hike offroad 8, bike offroad 2 | שביל אוהד - סובב נופית (83, 2.4 km); סינגל יער קריית אתא (82, 6.0 km); שביל כחול · אבן השבת (82, 3.3 km) | 3 new below 70 (best 62) |
| שדות נגב | 12 / 10–20 | 12 | osm 12 | hike offroad 7, bike road 1, bike offroad 4 | סינגל גרר (שרשרת מערב - ירוק) (82, 4.3 km); סובב צפוני בארי (82, 4.4 km); שביל שחור · נחל שובה (82, 4.5 km) | 2 new below 70 (best 81) |
| מגידו | 20 / 10–20 | 20 | osm 20 | walk run paved 1, hike offroad 17, bike road 1, bike offroad 1 | סובב זהורה (84, 2.3 km); תצפית המאגר (83, 1.1 km); מהר גחר לנחל השופט (82, 2.7 km) | 9 new below 70 (best 79) |
| מעלה יוסף | 19 / 10–20 | 19 | osm 19 | hike offroad 16, bike offroad 3 | שביל החורש (82, 2.7 km); סינגל נחל מצובה - קק"ל (82, 5.1 km); סינגל יחיעם (82, 3.7 km) | 12 new below 70 (best 79) |
| בני שמעון | 20 / 10–20 | 20 | osm 20 | hike offroad 17, bike road 1, bike offroad 2 | סינגל סנסנה (82, 5.0 km); שביל שחור 12462 · נחל גרר (82, 4.6 km); שביל ירוק · דרך הפסלים (82, 4.0 km) | 15 new below 70 (best 81) |
| הר חברון | 16 / 10–20 | 16 | osm 16 | walk run paved 1, hike offroad 12, bike offroad 3 | שביל ירוק · נחל שפן (82, 3.1 km); שביל אדום · מצודת תוואמין (81, 1.1 km); שביל כחול · גת (81, 1.1 km) | 6 new below 70 (best 75) |
| נחל שורק | 0 / 10–20 | 0 | — | — | — | short 10; 11 new below 70 (best 65) |
| שער הנגב | 18 / 10–20 | 18 | osm 18 | hike offroad 13, bike road 1, bike offroad 4 | סובב ברור חיל (82, 7.8 km); סינגל נחל משלים (82, 4.0 km); שביל ירוק · בוסטר (82, 4.5 km) | 5 new below 70 (best 79) |
| אל-בטוף | 1 / 10–20 | 1 | osm 1 | hike offroad 1 | שביל אדום · המוביל הארצי (80, 2.2 km) | short 9; 6 new below 70 (best 62) |
| יואב | 20 / 10–20 | 20 | osm 20 | walk run paved 1, hike offroad 17, bike offroad 2 | דרך חרובית (82, 4.6 km); שביל אדום 10520 · נחל בעלן (82, 9.6 km); שביל ירוק · תל צפית (82, 2.0 km) | 8 new below 70 (best 79) |
| רמת הנגב | 0 / 10–20 | 0 | — | — | — | short 10; no OSM admin relation |
| מבואות החרמון | 20 / 10–20 | 20 | osm 20 | walk run paved 1, hike offroad 16, bike road 1, bike offroad 2 | דרך הירדן ההררי (82, 10.5 km); סינגל הרי נפתלי (82, 3.4 km); תל חצור למערת עלמה (82, 3.6 km) | 5 new below 70 (best 78) |
| בוסתן אל-מרג' | 2 / 10–20 | 2 | osm 2 | walk run paved 1, bike offroad 1 | סינגל גבעת המורה (79, 0.4 km); שביל אדום · גבעת המורה (72, 0.5 km) | short 8; 11 new below 70 (best 68) |
| ערבות הירדן | 11 / 10–20 | 11 | osm 11 | hike offroad 10, bike offroad 1 | שביל ירוק 5530 · תל א-שיח ד'יב (82, 3.7 km); שביל שחור 5535 · אנדרטת הבקעה (82, 2.3 km); שביל שחור 5629 (82, 2.1 km) | 1 new below 70 (best 68) |
| ברנר | 4 / 10–20 | 4 | osm 2, generated 2 | walk run paved 1, hike offroad 3 | דרך נוף נחל גמליאל (79, 4.8 km); שביל אדום · נחל גמליאל (79, 3.9 km); לולאת גן שלמה (קבוצת שילר) · מסגד זרנוגה · 4.5 ק״מ (70, 4.5 km) | short 6; 16 new below 70 (best 69) |
| הערבה התיכונה | 20 / 10–20 | 20 | osm 20 | hike offroad 18, bike offroad 2 | נחל מסור (82, 12.1 km); נחל אמציהו (82, 11.9 km); נחל גוב (82, 4.0 km) | 77 new below 70 (best 82) |
| חבל יבנה | 5 / 10–20 | 5 | osm 4, generated 1 | hike offroad 5 | שביל אדום · נחל שורק (82, 2.9 km); שביל כחול · נחל יבנה (82, 2.6 km); שביל שחור · נחל יבנה (81, 1.3 km) | short 5; 19 new below 70 (best 69) |
| גן רווה | 5 / 10–20 | 5 | osm 4, generated 1 | hike offroad 5 | שביל אדום 10340 · נחל שורק (82, 6.9 km); שביל כחול 10362 · נחל שורק (81, 1.4 km); שביל ירוק · נבי רובין (80, 1.4 km) | short 5; 21 new below 70 (best 68) |
| חבל אילות | 20 / 10–20 | 20 | osm 20 | hike offroad 18, bike offroad 2 | הקניון הלבן (84, 2.5 km); שביל אדום · מכרות עתיקים (83, 1.2 km); שביל כחול · נחל עתק (82, 4.6 km) | 131 new below 70 (best 82) |
| גדרות | 0 / 10–20 | 0 | — | — | — | short 10; 14 new below 70 (best 68) |
| מגילות ים המלח | 20 / 10–20 | 20 | osm 20 | hike offroad 18, bike offroad 2 | דרך רוג'ום א־נאקה–עין גדי (82, 8.9 km); שביל שחור 8120 · נחל אוג (82, 4.3 km); שביל אדום · נחל ישי (82, 2.8 km) | 52 new below 70 (best 82) |
| אלונה | 11 / 10–20 | 11 | osm 11 | hike offroad 11 | שביל ירוק · נחל תנינים (82, 6.9 km); שביל אדום 4352 · דרך יוליה (82, 4.4 km); שביל שחור 4380 · נחל תנינים (82, 3.2 km) | 4 new below 70 (best 57) |
| תמר | 20 / 10–20 | 20 | osm 20 | walk run paved 1, hike offroad 17, bike offroad 2 | עוקף נחל פראים (82, 2.8 km); דרך רוג'ום א־נאקה–עין גדי (82, 2.6 km); נחל כידוד עילי (82, 2.5 km) | 117 new below 70 (best 82) |
| מועצה אזורית אשכול | 20 / 10–20 | 20 | osm 20 | hike offroad 16, bike offroad 4 | בארי כחול (שביל טל) (84, 5.0 km); סינגל אסף - כיסופים (83, 18.3 km); סינגל בוהו (82, 5.4 km) | 21 new below 70 (best 82) |
| מועצה אזורית גולן | 20 / 10–20 | 20 | osm 20 | walk run paved 1, hike offroad 16, bike road 1, bike offroad 2 | מפל זוויתן (82, 3.6 km); גובתה (82, 5.7 km); קצרין-זויתן-חניון יהודיה (82, 3.5 km) | 55 new below 70 (best 82) |
| מועצה אזורית גוש עציון | 20 / 10–20 | 20 | osm 20 | walk run paved 2, hike offroad 16, bike offroad 2 | נחל חלץ (82, 3.4 km); עינות טאו (82, 2.2 km); שביל כחול · הר מונטר (82, 4.9 km) | 20 new below 70 (best 79) |
| מועצה אזורית גזר | 11 / 10–20 | 11 | osm 11 | walk run paved 1, hike offroad 9, bike offroad 1 | דרך לח"י (83, 1.2 km); שביל ישראל (82, 5.4 km); שביל כחול · נחל עקרון (82, 3.0 km) | 1 new below 70 (best 67) |
| מועצה אזורית גליל עמקים | 0 / 10–20 | 0 | — | — | — | short 10; no OSM admin relation |
| מועצה אזורית דרום השרון | 15 / 10–20 | 15 | osm 15 | walk run paved 1, hike offroad 12, bike offroad 2 | שביל ירוק · מעלה ארומה 2 (83, 1.2 km); שביל שחור · מורד צור נתן צפון (82, 3.3 km); שביל כחול · מצפור חזי (82, 2.2 km) | 8 new below 70 (best 81) |
| מועצה אזורית חבל מודיעין | 20 / 10–20 | 20 | osm 20 | walk run paved 1, hike offroad 16, bike offroad 3 | סינגל הרצל (83, 10.3 km); נחל נטוף (82, 4.5 km); שביל ירוק · נחל גמזו (82, 7.1 km) | 11 new below 70 (best 81) |
| מועצה אזורית חוף השרון | 11 / 10–20 | 11 | osm 11 | hike offroad 10, bike offroad 1 | שביל ירוק · נחל רשפון (82, 2.5 km); נחל פולג (81, 5.9 km); שכונה ארעית → געש (81, 1.1 km) | 2 new below 70 (best 58) |
| מועצה אזורית מטה בנימין | 20 / 10–20 | 20 | osm 20 | walk run paved 1, hike offroad 17, bike offroad 2 | סינגל הגורל השביעי (83, 9.7 km); שביל ירוק · נחל פרת · ואדי א-נימר (82, 5.6 km); שביל אדום · דרך נוף דרומית (82, 5 km) | 47 new below 70 (best 81) |
| מועצה אזורית מטה יהודה | 20 / 10–20 | 20 | osm 20 | walk run paved 1, hike offroad 17, bike offroad 2 | נחל רפאים תחתון (86, 5.3 km); שביל כחול · רחוב ביסטרו (85, 1.1 km); שביל הבורות והבארות (84, 3.3 km) | 170 new below 70 (best 82) |
| מועצה אזורית משגב | 20 / 10–20 | 20 | osm 20 | walk run paved 1, hike offroad 16, bike offroad 3 | סינגל יער שגב (82, 13.9 km); סינגל באורות (82, 2.0 km); שביל אדום · עבירות קשה (82, 11.3 km) | 39 new below 70 (best 81) |
| מועצה אזורית עמק חפר | 9 / 10–20 | 9 | osm 4, generated 5 | hike offroad 9 | שביל ישראל (79, 10.9 km); שביל השרון (78, 19.6 km); אגמון חפר (78, 1.6 km) | short 1; 81 new below 70 (best 69) |
| מועצה אזורית עמק יזרעאל | 20 / 10–20 | 20 | osm 20 | walk run paved 1, hike offroad 14, bike offroad 5 | סינגל תמרת (84, 12.3 km); סינגל הסוללים (84, 5.7 km); סובב שמשית (84, 4.0 km) | 50 new below 70 (best 82) |
| מועצה אזורית שומרון | 8 / 10–20 | 8 | osm 8 | walk run paved 1, hike offroad 5, bike offroad 2 | שביל אדום · נחל נרבתה · אום א-ריחאן (83, 1.0 km); שביל כחול 7413 · שביל נופים לנחל קנה (82, 2.5 km); שביל שחור · שביל חוות יאיר למיצד קנה (81, 1.8 km) | short 2; 72 new below 70 (best 79) |

## שאר הרשויות (other) — 197

| authority | selected / quota | new | by source (selected) | surface (selected) | top routes | gaps |
|---|---|---|---|---|---|---|
| חולון | 0 / 15–25 | 0 | — | — | — | short 15; 9 new below 70 (best 61) |
| בית שמש | 6 / 15–25 | 6 | osm 6 | hike offroad 6 | שביל כחול · שער מערבי (85, 1.7 km); שביל אדום 9333 · נחל שורק (85, 1.3 km); שביל שחור · הרב ישראל גרוסמן (84, 3.1 km) | short 9; 23 new below 70 (best 63) |
| רמת גן | 0 / 15–25 | 0 | — | — | — | short 15; 9 new below 70 (best 62) |
| רחובות | 1 / 15–25 | 1 | osm 1 | hike offroad 1 | שביל שחור 10316 · אנדרטת שואה (79, 0.4 km) | short 14; 22 new below 70 (best 64) |
| בת ים | 0 / 15–25 | 0 | — | — | — | short 15; 7 new below 70 (best 57) |
| הרצליה | 5 / 15–25 | 0 | existing 5 | walk run paved 4, hike offroad 1 | לולאת מסלול ריצה 1.5 ק"מ (78, 1.0 km); טיילת (77, 0.7 km); הקפת פארק המקפצה (74, 0.6 km) | short 10; 10 new below 70 (best 64) |
| חדרה | 4 / 15–25 | 4 | osm 4 | hike offroad 4 | מסלול שער הנגב #1 (82, 2.2 km); שביל כחול · התבור (78, 1.3 km); שביל ישראל (75, 9.5 km) | short 11; 4 new below 70 (best 68) |
| כפר סבא | 1 / 15–25 | 1 | osm 1 | walk run paved 1 | שביל השרון (75, 7.0 km) | short 14; 9 new below 70 (best 64) |
| לוד | 0 / 15–25 | 0 | — | — | — | short 15; 3 new below 70 (best 56) |
| מודיעין עילית | 0 / 15–25 | 0 | — | — | — | short 15; no OSM admin relation |
| רמלה | 0 / 15–25 | 0 | — | — | — | short 15; 4 new below 70 (best 56) |
| רעננה | 1 / 15–25 | 1 | osm 1 | walk run paved 1 | שביל סובב רעננה (71, 7.0 km) | short 14; 10 new below 70 (best 65) |
| ראש העין | 4 / 15–25 | 4 | osm 4 | walk run paved 1, hike offroad 3 | שביל כחול 7510 · נחל סוסי (81, 1.7 km); שביל אדום · נחל סוסי (79, 0.8 km); שביל גולני (73, 2.0 km) | short 11; 9 new below 70 (best 61) |
| רהט | 1 / 15–25 | 1 | osm 1 | hike offroad 1 | שביל אדום · נחל גרר (81, 1.5 km) | short 14; 6 new below 70 (best 66) |
| נצרת | 3 / 15–25 | 3 | osm 3 | walk run paved 1, hike offroad 1, bike offroad 1 | סינגל יפיע (כפר החורש - יפיע) (81, 1.1 km); שביל כחול · הר קדומים (81, 1.4 km); שביל ישו (76, 4.3 km) | short 12; 6 new below 70 (best 61) |
| קרית גת | 2 / 15–25 | 2 | osm 2 | hike offroad 1, bike offroad 1 | סינגל פלוגות (82, 2.2 km); שביל אדום · שחריה (79, 0.9 km) | short 13; 5 new below 70 (best 61) |
| נהריה | 2 / 8–15 | 2 | osm 2 | hike offroad 1, bike offroad 1 | סינגל כברי (81, 1.1 km); שביל הים (75, 6.9 km) | short 6; 3 new below 70 (best 61) |
| הוד השרון | 2 / 8–15 | 2 | osm 2 | walk run paved 1, hike offroad 1 | שביל ישראל (82, 5.3 km); שביל השרון (73, 5.4 km) | short 6; 4 new below 70 (best 64) |
| עפולה | 4 / 8–15 | 4 | osm 4 | walk run paved 1, hike offroad 2, bike offroad 1 | נוף גבעת המורה (82, 8.0 km); שביל שחור 3360 · חורבת סהר (82, 2.5 km); סינגל גבעת המורה (81, 9.3 km) | short 4; 9 new below 70 (best 61) |
| גבעתיים | 0 / 8–15 | 0 | — | — | — | short 8; 6 new below 70 (best 60) |
| קרית אתא | 0 / 8–15 | 0 | — | — | — | short 8; 6 new below 70 (best 63) |
| יבנה | 1 / 8–15 | 1 | osm 1 | hike offroad 1 | שביל אדום · נחל שורק (81, 2.7 km) | short 7; 8 new below 70 (best 62) |
| נוף הגליל | 9 / 8–15 | 9 | osm 9 | hike offroad 7, bike offroad 2 | סינגל בית קשת (82, 13.9 km); סינגל סובב נוף הגליל (82, 8.2 km); שביל ישראל (82, 5.4 km) | 4 new below 70 (best 79) |
| קריית מוצקין | 0 / 8–15 | 0 | — | — | — | short 8; 4 new below 70 (best 56); no OSM admin relation |
| נתיבות | 1 / 8–15 | 1 | osm 1 | bike offroad 1 | סינגל בוהו (81, 1.4 km) | short 7; 4 new below 70 (best 56) |
| אילת | 15 / 8–15 | 15 | osm 15 | walk run paved 1, hike offroad 13, bike offroad 1 | שביל סובב אילת (82, 14.1 km); סכין יותם (82, 3.7 km); שביל אדום 20560 · שביל נחל שלמה (82, 7.5 km) | 19 new below 70 (best 81) |
| עכו | 0 / 8–15 | 0 | — | — | — | short 8; 6 new below 70 (best 66) |
| קריית ביאליק | 0 / 8–15 | 0 | — | — | — | short 8; 5 new below 70 (best 62); no OSM admin relation |
| טבריה | 8 / 8–15 | 8 | osm 8 | hike offroad 6, bike offroad 2 | שביל ירוק · נחל רקת (82, 2.3 km); טיבריוס (81, 1.8 km); ברניקי בלוז (79, 2.2 km) | 3 new below 70 (best 76) |
| אלעד | 3 / 8–15 | 3 | osm 3 | hike offroad 3 | דרך הכח (79, 0.9 km); שביל גולני (76, 0.7 km); שביל אדום · נחל שילה (76, 1.0 km) | short 5; 3 new below 70 (best 56) |
| רמת השרון | 1 / 8–15 | 1 | osm 1 | hike offroad 1 | שביל ישראל (82, 2.3 km) | short 7; 8 new below 70 (best 68) |
| כרמיאל | 6 / 8–15 | 6 | osm 6 | walk run paved 1, hike offroad 4, bike offroad 1 | שביל שחור · נחל שזור (82, 2.1 km); שביל אדום · נחל צוף (82, 3.3 km); שביל אדום · כרמיאל-חילזון (81, 5.8 km) | short 2; 11 new below 70 (best 69) |
| נס ציונה | 2 / 8–15 | 2 | osm 1, generated 1 | walk run paved 1, hike offroad 1 | שביל אדום 10340 · חוות מרדכי (81, 1.2 km); לולאת נס ציונה · בית של אבו ריזק · 2.7 ק״מ (70, 2.7 km) | short 6; 8 new below 70 (best 68) |
| טייבה | 1 / 8–15 | 1 | osm 1 | hike offroad 1 | שביל גולני (79, 6.8 km) | short 7; 2 new below 70 (best 56) |
| קרית אונו | 2 / 8–15 | 0 | existing 2 | hike offroad 2 | הקפת פארק רייספלד (79, 1.1 km); הקפת פארק צה"ל (73, 0.7 km) | short 6; 4 new below 70 (best 56); no OSM admin relation |
| שפרעם | 1 / 8–15 | 1 | osm 1 | bike offroad 1 | סינגל אלון הגליל (79, 0.4 km) | short 7; 5 new below 70 (best 69) |
| חריש | 2 / 8–15 | 2 | osm 2 | hike offroad 1, bike offroad 1 | סינגל עירון טבעת כחולה (82, 7.8 km); שביל גולני (77, 0.5 km) | short 6; 4 new below 70 (best 58) |
| אור יהודה | 0 / 8–15 | 0 | — | — | — | short 8; 4 new below 70 (best 56) |
| אופקים | 2 / 8–15 | 2 | osm 2 | hike offroad 1, bike offroad 1 | שביל כחול · מצודת פטיש (79, 0.5 km); סינגל אופקים (77, 6.3 km) | short 6; 17 new below 70 (best 62) |
| דימונה | 6 / 8–15 | 6 | osm 6 | hike offroad 6 | שביל אדום · נחל ממשית (82, 3.2 km); שביל אדום · נחל אשלון (82, 6.6 km); שביל כחול · שביל הנרקיסים (81, 2.8 km) | short 2; 4 new below 70 (best 69) |
| באר יעקב | 0 / 8–15 | 0 | — | — | — | short 8; 5 new below 70 (best 56) |
| צפת | 11 / 8–15 | 11 | osm 11 | hike offroad 9, bike road 1, bike offroad 1 | שביל ישראל (82, 5.7 km); סינגל ביריה (82, 2.6 km); שביל הלוחמים (82, 2.3 km) | 8 new below 70 (best 79) |
| טמרה | 3 / 8–15 | 3 | osm 3 | hike offroad 3 | שביל שחור · נחל שכניה · נחל כבול (82, 5.5 km); שביל אדום · נחל קנקן (82, 6.0 km); שביל כחול · נחל כבול (79, 0.4 km) | short 5; 4 new below 70 (best 67) |
| סח'נין | 0 / 8–15 | 0 | — | — | — | short 8; 6 new below 70 (best 65) |
| טירת כרמל | 0 / 8–15 | 0 | — | — | — | short 8; 2 new below 70 (best 56); no OSM admin relation |
| יהוד-מונוסון | 0 / 8–15 | 0 | — | — | — | short 8; 6 new below 70 (best 56) |
| באקה אל-גרביה | 0 / 8–15 | 0 | — | — | — | short 8; 3 new below 70 (best 56); no OSM admin relation |
| גדרה | 0 / 8–15 | 0 | — | — | — | short 8; 6 new below 70 (best 58) |
| קריית מלאכי | 0 / 8–15 | 0 | — | — | — | short 8; 2 new below 70 (best 55); no OSM admin relation |
| כפר יונה | 0 / 8–15 | 0 | — | — | — | short 8; 6 new below 70 (best 62) |
| ערד | 15 / 8–15 | 10 | existing 5, osm 10 | walk run paved 1, hike offroad 12, bike road 1, bike offroad 1 | לולאת נחל יעלים מעגלי (84, 4.5 km); נחל כידוד עילי (83, 4.2 km); נחל טביה (83, 4.6 km) | 11 new below 70 (best 82) |
| גבעת שמואל | 0 / 8–15 | 0 | — | — | — | short 8; 3 new below 70 (best 62) |
| עראבה | 0 / 8–15 | 0 | — | — | — | short 8; 7 new below 70 (best 61) |
| מגדל העמק | 2 / 8–15 | 2 | osm 2 | bike offroad 2 | סינגל כפר החורש (81, 1.4 km); סובב מגדל העמק (77, 11.0 km) | short 6; 4 new below 70 (best 58) |
| אור עקיבא | 0 / 8–15 | 0 | — | — | — | short 8; 4 new below 70 (best 56) |
| כפר קאסם | 1 / 8–15 | 1 | osm 1 | hike offroad 1 | שביל גולני (76, 2.5 km) | short 7; 5 new below 70 (best 61) |
| גני תקווה | 0 / 8–15 | 0 | — | — | — | short 8; 1 new below 70 (best 56) |
| מבשרת ציון | 7 / 8–15 | 7 | osm 7 | hike offroad 7 | שביל ירושלים (81, 4.1 km); שביל ירוק · שביל עוטף מבשרת ציון (81, 1.6 km); שביל ירוק · בית הסירנה (80, 1.6 km) | short 1; 10 new below 70 (best 63) |
| מעלות-תרשיחא | 2 / 8–15 | 2 | osm 2 | hike offroad 2 | שביל שחור · נחל מרווה (81, 1.1 km); שביל כחול · נחל מרווה (79, 2.0 km) | short 6; 4 new below 70 (best 56) |
| גבעת זאב | 3 / 8–15 | 3 | osm 3 | walk run paved 1, hike offroad 2 | שביל אדום · מערת קבורה (82, 2.3 km); שביל גולני (72, 1.4 km); שביל שחור · סובב נבי סמואל מערבי (70, 2.2 km) | short 5; 7 new below 70 (best 64) |
| קלנסווה | 1 / 8–15 | 1 | osm 1 | hike offroad 1 | שביל גולני (76, 1.9 km) | short 7; 4 new below 70 (best 57) |
| כפר כנא | 2 / 8–15 | 2 | osm 2 | walk run paved 1, hike offroad 1 | שביל ישו (76, 3.6 km); שביל הסנהדרין (71, 2.8 km) | short 6; 2 new below 70 (best 56) |
| קריית שמונה | 5 / 8–15 | 5 | osm 5 | hike offroad 3, bike offroad 2 | סינגל הרי נפתלי (82, 13.7 km); שביל אדום 2050 · מצוק הנעלם (82, 2.8 km); סינגל מנרה לשעבר (81, 1.9 km) | short 3; 7 new below 70 (best 78) |
| מגאר | 0 / 8–15 | 0 | — | — | — | short 8; 3 new below 70 (best 56); no OSM admin relation |
| יקנעם עילית | 2 / 8–15 | 2 | osm 2 | hike offroad 2 | שביל כחול 4235 · נחל סנין (81, 1.1 km); מהביג לנחל השופט (78, 1.1 km) | short 6; 13 new below 70 (best 61) |
| תל שבע | 1 / 8–15 | 1 | osm 1 | hike offroad 1 | שביל סובב באר שבע (79, 0.5 km) | short 7; 7 new below 70 (best 64) |
| זכרון יעקב | 9 / 8–15 | 8 | existing 1, osm 8 | hike offroad 7, bike offroad 2 | שביל אדום 4352 · דרך נוף חורשן (82, 12.5 km); שביל ירוק · נחל תנינים (82, 4.5 km); שביל שחור · הר חורשן · סווידה (81, 1.0 km) | 1 new below 70 (best 64) |
| שוהם | 0 / 8–15 | 0 | — | — | — | short 8; 4 new below 70 (best 58); no OSM admin relation |
| חורה | 0 / 8–15 | 0 | — | — | — | short 8; 2 new below 70 (best 56) |
| כפר מנדא | 2 / 8–15 | 2 | osm 2 | hike offroad 2 | שביל שחור · ספלולים (82, 2.6 km); מסלול כפר מנדא #1 (81, 1.5 km) | short 6; 5 new below 70 (best 65) |
| נשר | 9 / 8–15 | 9 | osm 9 | hike offroad 9 | נוף הכרמל (81, 1.2 km); שביל אדום · נחל נשר (81, 1.8 km); שביל שחור · טיילת הגשרים (81, 1 km) | 2 new below 70 (best 78) |
| כסיפה | 0 / 8–15 | 0 | — | — | — | short 8; 1 new below 70 (best 55); no OSM admin relation |
| ערערה-בנגב | 0 / 8–15 | 0 | — | — | — | short 8; 2 new below 70 (best 56) |
| ערערה | 0 / 8–15 | 0 | — | — | — | short 8; 7 new below 70 (best 64) |
| ג'דיידה-מכר | 0 / 8–15 | 0 | — | — | — | short 8; 3 new below 70 (best 56) |
| כפר קרע | 0 / 8–15 | 0 | — | — | — | short 8; 5 new below 70 (best 64) |
| בית שאן | 1 / 8–15 | 1 | osm 1 | hike offroad 1 | שביל עמק המעיינות (75, 8.3 km) | short 7; 4 new below 70 (best 56) |
| קריית טבעון | 3 / 8–15 | 3 | osm 3 | hike offroad 1, bike offroad 2 | סובב טבעון דרומי (80, 5.5 km); שביל הסנהדרין (78, 3.7 km); סובב טבעון צפוני (75, 9.3 km) | short 5; 8 new below 70 (best 67) |
| יפיע | 1 / 8–15 | 1 | osm 1 | walk run paved 1 | שביל יזרעאל (73, 3.1 km) | short 7; 2 new below 70 (best 56) |
| לקיה | 1 / 8–15 | 1 | osm 1 | walk run paved 1 | שביל אדום · נחל ליקית (72, 1.5 km) | short 7; 5 new below 70 (best 67) |
| דאלית אל-כרמל | 0 / 8–15 | 0 | — | — | — | short 8; 2 new below 70 (best 62); no OSM admin relation |
| ריינה | 2 / 8–15 | 2 | osm 1, generated 1 | hike offroad 2 | שביל ישו (79, 1.0 km); לולאת ריינה · נחל ציפורי · 2.4 ק״מ (71, 2.4 km) | short 6; 4 new below 70 (best 68) |
| מזכרת בתיה | 0 / 8–15 | 0 | — | — | — | short 8; 2 new below 70 (best 56) |
| ירכא | 4 / 8–15 | 4 | osm 4 | hike offroad 4 | שביל שחור · מעלה גיתה (82, 3.6 km); שביל נחל יצהר (79, 0.9 km); שביל ירוק · מצודת תפן (79, 3.2 km) | short 4; 5 new below 70 (best 64) |
| בנימינה-גבעת עדה | 3 / 8–15 | 3 | osm 2, generated 1 | walk run paved 1, hike offroad 2 | שביל ישראל (79, 0.7 km); שביל ירוק · נחל תנינים (74, 8.8 km); לולאת בנימינה · נחל תנינים · 6.5 ק״מ (70, 6.5 km) | short 5; 9 new below 70 (best 64) |
| מעלה עירון | 0 / 8–15 | 0 | — | — | — | short 8; 10 new below 70 (best 62) |
| מג'ד אל-כרום | 3 / 8–15 | 3 | osm 3 | hike offroad 1, bike offroad 2 | שביל שחור · נחל שגור · בקעת בית כרם (81, 1.6 km); סובב צורית גילון (79, 2.9 km); סינגל יער אחיהוד (76, 1.9 km) | short 5; 9 new below 70 (best 68) |
| תל מונד | 2 / 8–15 | 2 | osm 2 | hike offroad 2 | שביל שחור · נחל חרות (79, 0.8 km); שביל השרון (73, 1.5 km) | short 6; 5 new below 70 (best 59) |
| אכסאל | 0 / 8–15 | 0 | — | — | — | short 8; no OSM admin relation |
| אבן יהודה | 0 / 8–15 | 0 | — | — | — | short 8; 3 new below 70 (best 59) |
| ג'סר א-זרקא | 1 / 8–15 | 1 | osm 1 | hike offroad 1 | שביל ישראל (81, 3.6 km) | short 7; 2 new below 70 (best 68) |
| טורעאן | 3 / 8–15 | 3 | osm 3 | hike offroad 3 | שביל אדום · 'דרך נופית 'יער בית-קשת (81, 1.6 km); שביל ירוק · הר תורען (79, 0.7 km); שביל הסנהדרין (78, 1.8 km) | short 5; 6 new below 70 (best 60) |
| רכסים | 1 / 8–15 | 1 | osm 1 | hike offroad 1 | שביל ישראל (81, 2.0 km) | short 7; 4 new below 70 (best 65) |
| אבו סנאן | 0 / 8–15 | 0 | — | — | — | short 8; 5 new below 70 (best 64) |
| עין מאהל | 3 / 8–15 | 3 | osm 3 | hike offroad 2, bike offroad 1 | שביל ישראל (81, 1.5 km); סינגל בית קשת (79, 0.5 km); שביל אדום · הר דבורה (79, 0.4 km) | short 5; 5 new below 70 (best 65) |
| נחף | 0 / 8–15 | 0 | — | — | — | short 8; 5 new below 70 (best 68) |
| שגב-שלום | 0 / 8–15 | 0 | — | — | — | short 8; 5 new below 70 (best 66) |
| פוריידיס | 1 / 8–15 | 1 | osm 1 | bike offroad 1 | סינגל פוריידיס (81, 1.4 km) | short 7; 4 new below 70 (best 64) |
| אעבלין | 2 / 8–15 | 2 | osm 2 | hike offroad 2 | שביל אדום · נחל שכניה (82, 2.1 km); שביל אדום · נחל קנקן (78, 1.6 km) | short 6; 2 new below 70 (best 56) |
| דייר אל-אסד | 0 / 8–15 | 0 | — | — | — | short 8; 3 new below 70 (best 56); no OSM admin relation |
| ג'ת | 1 / 8–15 | 1 | osm 1 | hike offroad 1 | שביל גולני (79, 5.1 km) | short 7; 5 new below 70 (best 59) |
| אזור | 0 / 8–15 | 0 | — | — | — | short 8; 4 new below 70 (best 58) |
| כאבול | 0 / 8–15 | 0 | — | — | — | short 8; 6 new below 70 (best 64) |
| אפרת | 1 / 8–15 | 1 | osm 1 | walk run paved 1 | שביל שחור 9408 · ואדי ארטאס (82, 2.7 km) | short 7; 8 new below 70 (best 66) |
| עספיא | 0 / 8–15 | 0 | — | — | — | short 8; 3 new below 70 (best 56); no OSM admin relation |
| בית ג'ן | 6 / 8–15 | 6 | osm 6 | walk run paved 4, hike offroad 2 | שביל שחור · עין גרגה (80, 3.5 km); שביל אדום · נחל כזיב (79, 0.5 km); שביל כחול 2348 · עין סרטבה (74, 1.8 km) | short 2; 6 new below 70 (best 69) |
| ירוחם | 8 / 8–15 | 8 | osm 8 | hike offroad 6, bike offroad 2 | סינגל ירוחם (82, 8.4 km); שביל שחור · סכר אגם ירוחם על נחל רביבים (82, 2.8 km); שביל כחול · מחנה מחפשי הנפט (82, 2.1 km) | 2 new below 70 (best 62) |
| מיתר | 5 / 8–15 | 5 | osm 5 | hike offroad 3, bike offroad 2 | שביל ישראל (82, 2.8 km); שביל ירוק · נחל אשתמוע (82, 8.4 km); שביל כחול · נחל חברון (82, 2.4 km) | short 3; 7 new below 70 (best 68) |
| בסמ"ה | 0 / 8–15 | 0 | — | — | — | short 8; 9 new below 70 (best 62) |
| מג'דל שמס | 0 / 8–15 | 0 | — | — | — | short 8; 1 new below 70 (best 56); no OSM admin relation |
| ג'לג'וליה | 0 / 8–15 | 0 | — | — | — | short 8; 4 new below 70 (best 58) |
| דייר חנא | 0 / 8–15 | 0 | — | — | — | short 8; 4 new below 70 (best 56); no OSM admin relation |
| דבורייה | 0 / 8–15 | 0 | — | — | — | short 8; 1 new below 70 (best 56); no OSM admin relation |
| חצור הגלילית | 4 / 8–15 | 4 | osm 4 | hike offroad 3, bike offroad 1 | סינגל ביריה (82, 2.9 km); שביל כחול · נחל פארעם (81, 1.6 km); שביל כחול · עין פארעם (78, 1.2 km) | short 4; 6 new below 70 (best 56) |
| ביר אל-מכסור | 2 / 8–15 | 2 | osm 1, generated 1 | walk run paved 1, bike offroad 1 | סינגל המוביל (חנתון) (82, 3.0 km); לולאת מקמאן · נחל גדורה · 4.3 ק״מ (70, 4.3 km) | short 6; 6 new below 70 (best 61) |
| כפר יאסיף | 0 / 8–15 | 0 | — | — | — | short 8; 2 new below 70 (best 58) |
| בועיינה-נוג'ידאת | 0 / 8–15 | 0 | — | — | — | short 8; no OSM admin relation |
| קרני שומרון | 2 / 8–15 | 2 | osm 2 | bike offroad 2 | סינגל צוקי קנה (76, 7.0 km); סינגל נוף קנה (71, 12.5 km) | short 6; 14 new below 70 (best 65) |
| קריית עקרון | 0 / 8–15 | 0 | — | — | — | short 8; 2 new below 70 (best 56); no OSM admin relation |
| צור הדסה | 3 / 8–15 | 3 | osm 3 | hike offroad 3 | שביל ישראל (79, 0.3 km); שביל שחור · חורבת כפר צום (79, 0.7 km); שביל שחור · מערת נטיפים צור הדסה (79, 0.4 km) | short 5; 8 new below 70 (best 78) |
| כוכב יאיר | 2 / 8–15 | 2 | osm 2 | hike offroad 1, bike offroad 1 | שביל יער אייל (79, 0.6 km); מעלה אלכסנדר המלא (71, 1.1 km) | short 6; 6 new below 70 (best 60) |
| אורנית | 0 / 8–15 | 0 | — | — | — | short 8; 3 new below 70 (best 64) |
| כסרא-סמיע | 0 / 8–15 | 0 | — | — | — | short 8; no OSM admin relation |
| משהד | 3 / 8–15 | 3 | osm 3 | hike offroad 2, bike offroad 1 | סינגל הושעיה (81, 1.4 km); שביל הסנהדרין (79, 2.5 km); שביל ישו (77, 3.5 km) | short 5; 2 new below 70 (best 56) |
| קצרין | 3 / 8–15 | 3 | osm 3 | hike offroad 2, bike offroad 1 | קצרין-זויתן-חניון יהודיה (82, 3.1 km); מקצרין לבריכות בתרא (79, 0.4 km); סינגל קצרין (70, 15.9 km) | short 5; 4 new below 70 (best 59) |
| זרזיר | 1 / 8–15 | 1 | osm 1 | bike offroad 1 | שביל אדום · גבעת בר (79, 0.3 km) | short 7; 5 new below 70 (best 61) |
| עילוט | 2 / 8–15 | 2 | osm 2 | hike offroad 1, bike offroad 1 | שביל אדום · הר בהרן (80, 1.0 km); סינגל שמשית (79, 0.5 km) | short 6; 7 new below 70 (best 64) |
| עומר | 4 / 8–15 | 4 | osm 4 | hike offroad 4 | שביל כחול 12557 · גבעות להב (82, 2.3 km); שביל שחור · נחל ליקית (79, 0.8 km); שביל אדום · נחל ליקית (79, 0.4 km) | short 4; 8 new below 70 (best 69) |
| שער שומרון | 0 / 8–15 | 0 | — | — | — | short 8; no OSM admin relation |
| בענה | 0 / 8–15 | 0 | — | — | — | short 8; 3 new below 70 (best 60) |
| אבו גוש | 0 / 8–15 | 0 | — | — | — | short 8; 5 new below 70 (best 61) |
| ראמה | 3 / 8–15 | 3 | osm 3 | hike offroad 2, bike offroad 1 | סינגל הר חזון (82, 3.1 km); שביל שחור · נחל הארי (81, 1.5 km); שביל בית הכרם (79, 2.7 km) | short 5; 5 new below 70 (best 61) |
| אלפי מנשה | 0 / 8–15 | 0 | — | — | — | short 8; 3 new below 70 (best 56) |
| רמת ישי | 0 / 8–15 | 0 | — | — | — | short 8; 2 new below 70 (best 56) |
| בסמת טבעון | 2 / 8–15 | 2 | osm 2 | walk run paved 1, hike offroad 1 | שביל הסנהדרין (79, 2.6 km); שביל ישראל (73, 1.7 km) | short 6; 8 new below 70 (best 62) |
| שלומי | 2 / 8–15 | 2 | osm 2 | hike offroad 1, bike offroad 1 | שביל אדום · נחל בצת (79, 1.0 km); סינגל יער חניתה (76, 3.5 km) | short 6; 6 new below 70 (best 64) |
| קריית ארבע | 0 / 8–15 | 0 | — | — | — | short 8; 5 new below 70 (best 58) |
| פרדסייה | 0 / 8–15 | 0 | — | — | — | short 8; 1 new below 70 (best 56); no OSM admin relation |
| זמר | 1 / 8–15 | 1 | generated 1 | hike offroad 1 | לולאת ימה · 4.4 ק״מ (70, 4.4 km) | short 7; 4 new below 70 (best 64) |
| שעב | 1 / 8–15 | 1 | osm 1 | hike offroad 1 | שביל אדום · נחל חילזון (81, 7.4 km) | short 7; 4 new below 70 (best 62) |
| קריית יערים | 0 / 8–15 | 0 | — | — | — | short 8; no OSM admin relation |
| להבים | 3 / 8–15 | 3 | osm 3 | hike offroad 2, bike offroad 1 | להבים–אבו חוף (79, 1.1 km); שביל אדום · נחל גרר (79, 0.6 km); שביל ירוק · נחל גרר (79, 0.4 km) | short 5; 8 new below 70 (best 64) |
| בית דגן | 0 / 8–15 | 0 | — | — | — | short 8; 1 new below 70 (best 53) |
| טובא-זנגרייה | 1 / 8–15 | 1 | osm 1 | hike offroad 1 | שביל כחול · נחל ראש פינה (81, 1.0 km) | short 7; 5 new below 70 (best 63) |
| יאנוח-ג'ת | 4 / 8–15 | 4 | osm 4 | hike offroad 4 | שביל שחור · מעלה גיתה (81, 1.1 km); שביל נחל יחיעם (79, 3.3 km); שביל כחול · הר אשכר (79, 0.7 km) | short 4; 5 new below 70 (best 63) |
| בוקעאתא | 2 / 8–15 | 2 | osm 2 | hike offroad 1, bike offroad 1 | שביל הגולן (79, 9.5 km); סובב יער אודם (74, 7.0 km) | short 6; 6 new below 70 (best 65) |
| חורפיש | 4 / 8–15 | 4 | osm 4 | hike offroad 4 | שביל שחור · נחל כזיב (81, 1.1 km); שביל כחול · נחל פער (80, 1.6 km); שביל אזורי גליל עליון (79, 0.6 km) | short 4; 5 new below 70 (best 64) |
| בני עי"ש | 0 / 8–15 | 0 | — | — | — | short 8; 2 new below 70 (best 58) |
| שבלי - אום אל-גנם | 0 / 8–15 | 0 | — | — | — | short 8; 2 new below 70 (best 56); no OSM admin relation |
| ג'ולס | 0 / 8–15 | 0 | — | — | — | short 8; no OSM admin relation |
| בית אל | 0 / 8–15 | 0 | — | — | — | short 8; 1 new below 70 (best 56) |
| כעביה-טבאש-חג'אג'רה | 2 / 8–15 | 2 | osm 2 | hike offroad 2 | שביל כחול · נחל ציפורי (79, 0.5 km); שביל ישראל (78, 1.9 km) | short 6; 3 new below 70 (best 56) |
| עמנואל | 0 / 8–15 | 0 | — | — | — | short 8; 3 new below 70 (best 62) |
| פקיעין (בוקייעה) | 2 / 8–15 | 2 | osm 2 | hike offroad 2 | שביל אזורי גליל עליון (81, 1.3 km); פקיעין-חרשים (79, 2.4 km) | short 6; 6 new below 70 (best 67) |
| כפר ורדים | 0 / 8–15 | 0 | — | — | — | short 8; 4 new below 70 (best 56) |
| בית אריה-עופרים | 0 / 8–15 | 0 | — | — | — | short 8; 2 new below 70 (best 61) |
| מצפה רמון | 15 / 8–15 | 15 | osm 15 | hike offroad 13, bike offroad 2 | מצפה רמון - חאן בארות (IBT) (82, 9.6 km); צבעי הרמון משפחתי (82, 4.8 km); נחל אפור (82, 4.6 km) | 9 new below 70 (best 79) |
| עיילבון | 0 / 8–15 | 0 | — | — | — | short 8; 2 new below 70 (best 56); no OSM admin relation |
| סביון | 0 / 8–15 | 0 | — | — | — | short 8; 5 new below 70 (best 68) |
| יבנאל | 5 / 8–15 | 5 | osm 5 | hike offroad 5 | שביל ישראל (82, 2.4 km); שביל שחור · נחל יבנאל (82, 2.5 km); שביל ירוק · נחל יבנאל (82, 3.3 km) | short 3; 3 new below 70 (best 56) |
| כפר תבור | 4 / 8–15 | 4 | osm 4 | hike offroad 4 | שביל ישראל (82, 4 km); שביל אדום 3324 · נחל תבור (82, 3.2 km); שביל ירוק 3336 · נחל תבור (82, 2.8 km) | short 4; 5 new below 70 (best 67) |
| קדומים | 0 / 8–15 | 0 | — | — | — | short 8; 10 new below 70 (best 62) |
| אלקנה | 1 / 8–15 | 1 | osm 1 | hike offroad 1 | שביל גולני (78, 1.8 km) | short 7; 4 new below 70 (best 58) |
| סאג'ור | 0 / 8–15 | 0 | — | — | — | short 8; 1 new below 70 (best 55); no OSM admin relation |
| כפר ברא | 2 / 8–15 | 2 | osm 2 | hike offroad 2 | שביל גולני (79, 2.2 km); שביל אדום · مغارة الضبعة (79, 0.7 km) | short 6; 3 new below 70 (best 67) |
| מזרעה | 0 / 8–15 | 0 | — | — | — | short 8; 1 new below 70 (best 56) |
| הר אדר | 0 / 8–15 | 0 | — | — | — | short 8; 4 new below 70 (best 59) |
| מסעדה | 3 / 8–15 | 3 | osm 3 | walk run paved 1, hike offroad 1, bike offroad 1 | סובב יער אודם (79, 2.6 km); שביל הגולן (70, 3.5 km); שביל ירוק · נחל סער (70, 3.1 km) | short 5; 7 new below 70 (best 64) |
| כאוכב אבו אל-היג'א | 0 / 8–15 | 0 | — | — | — | short 8; 2 new below 70 (best 56); no OSM admin relation |
| כפר כמא | 0 / 8–15 | 0 | — | — | — | short 8; 2 new below 70 (best 56) |
| אליכין | 0 / 8–15 | 0 | — | — | — | short 8; 3 new below 70 (best 59) |
| פסוטה | 2 / 8–15 | 2 | osm 2 | hike offroad 2 | מסע מים אל ים (82, 3.5 km); שביל אדום · נחל שרך (81, 1.9 km) | short 6; 5 new below 70 (best 67) |
| ג'ש (גוש חלב) | 0 / 8–15 | 0 | — | — | — | short 8; no OSM admin relation |
| ראש פינה | 3 / 8–15 | 3 | osm 3 | hike offroad 3 | שביל נחל ראש פינה (81, 1.3 km); שביל ירוק · נחל ראש פינה (81, 1.5 km); שביל כחול · נחל פארעם (79, 0.8 km) | short 5; 8 new below 70 (best 78) |
| מעיליא | 0 / 8–15 | 0 | — | — | — | short 8; 2 new below 70 (best 62) |
| ע'ג'ר | 0 / 8–15 | 0 | — | — | — | short 8; 1 new below 70 (best 56) |
| עין קנייא | 1 / 8–15 | 1 | osm 1 | hike offroad 1 | שביל ישראל (81, 1 km) | short 7; 5 new below 70 (best 67) |
| כפר שמריהו | 0 / 8–15 | 0 | — | — | — | short 8; 6 new below 70 (best 59) |
| מגדל | 7 / 8–15 | 7 | osm 6, generated 1 | walk run paved 1, hike offroad 6 | שביל כחול · שביל אל מול כנרת (82, 3.0 km); שביל סובב כנרת (80, 4.3 km); שביל ישראל (79, 4.7 km) | short 1; 5 new below 70 (best 67) |
| מטולה | 3 / 8–15 | 3 | osm 3 | walk run paved 2, hike offroad 1 | נחל עיון מסלול ארוך (83, 2.4 km); שביל אדום 2049 · חורבת נוחה (83, 0.6 km); שביל גולני (79, 3.5 km) | short 5; 1 new below 70 (best 56) |
| מעלה אפרים | 5 / 8–15 | 5 | osm 5 | walk run paved 2, hike offroad 3 | שביל שחור · עין א-סוח'ן (81, 1.6 km); שביל כחול 5542 (79, 0.6 km); שביל המפקדים (73, 1.9 km) | short 3; 5 new below 70 (best 64) |
| יסוד המעלה | 1 / 8–15 | 1 | osm 1 | hike offroad 1 | שביל שחור · גשר יסוד המעלה (82, 2.3 km) | short 7; 5 new below 70 (best 58) |
| אום אל-פחם | 1 / 8–15 | 1 | generated 1 | hike offroad 1 | לולאת עקדה · נחל עוז · 3.9 ק״מ (71, 3.9 km) | short 7; 9 new below 70 (best 67); population unknown → small quota |
| אריאל | 1 / 8–15 | 1 | osm 1 | bike offroad 1 | סינגל אריאל (79, 7 km) | short 7; 6 new below 70 (best 56); population unknown → small quota |
| ביתר עילית | 0 / 8–15 | 0 | — | — | — | short 8; 3 new below 70 (best 62); population unknown → small quota |
| גן יבנה | 0 / 8–15 | 0 | — | — | — | short 8; 4 new below 70 (best 56); population unknown → small quota |
| דמו · באר שבע | 0 / 8–15 | 0 | — | — | — | short 8; no OSM admin relation; population unknown → small quota |
| דמו · חיפה | 0 / 8–15 | 0 | — | — | — | short 8; no OSM admin relation; population unknown → small quota |
| דמו · תל אביב | 0 / 8–15 | 0 | — | — | — | short 8; no OSM admin relation; population unknown → small quota |
| טירה | 1 / 8–15 | 1 | osm 1 | hike offroad 1 | שביל גולני (79, 2.3 km) | short 7; 3 new below 70 (best 56); population unknown → small quota |
| מגדל תפן | 1 / 8–15 | 1 | osm 1 | hike offroad 1 | שביל אדום · נחל ינוח (82, 2.5 km) | short 7; 1 new below 70 (best 56); population unknown → small quota |
| מודיעין-מכבים-רעות | 10 / 8–15 | 10 | osm 10 | hike offroad 9, bike offroad 1 | סינגל ענבה (82, 12.1 km); שביל ישראל (82, 5.5 km); בקעת הנזירים (81, 1.7 km) | 15 new below 70 (best 70); population unknown → small quota |
| מעלה אדומים | 5 / 8–15 | 5 | osm 5 | hike offroad 4, bike offroad 1 | שביל כחול · טיבק קוטייף (82, 4.7 km); שביל ירוק 8125 · טיבק קוטייף (82, 3.4 km); שביל שחור 8227 · ואדי אל-מדורה (81, 1.8 km) | short 3; 13 new below 70 (best 66); population unknown → small quota |
| נאות חובב | 0 / 8–15 | 0 | — | — | — | short 8; 2 new below 70 (best 56); population unknown → small quota |
| פרדס חנה-כרכור | 1 / 8–15 | 1 | osm 1 | hike offroad 1 | שביל פר"כור (76, 0.9 km) | short 7; 5 new below 70 (best 56); population unknown → small quota |
| קדימה-צורן | 5 / 8–15 | 5 | osm 5 | walk run paved 1, hike offroad 4 | שביל האירוסים (81, 1.6 km); דרך הלב - עין שריד - יער אילנות (79, 3.0 km); שביל כחול · דרך היער (79, 2.7 km) | short 3; 10 new below 70 (best 64); population unknown → small quota |
| wix | 0 / 8–15 | 0 | — | — | — | short 8; no OSM admin relation; population unknown → small quota |

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

