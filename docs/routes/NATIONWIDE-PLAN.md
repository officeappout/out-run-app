# מסלולים בכל עיר — מיפוי מה קיים + תוכנית (RC1)

**סטטוס:** מסמך תכנון בלבד, 21.10.2026. לא נכתב קוד, לא נקראה פרודקשן. כל טענה מבוססת על `origin/main` @ `bfbc59d6` (נבדק `git fetch` לפני הקריאה), עם הפניית `file:line`.
**הבקשה (דוד, 21.10):** סוכנים שאוספים מסלולים בעלי שם/רשמיים בכל עיר ממקורות רבים, מדרגים אותם כמו שעשינו ל"פארק המסילה", ומחולל שבונה מסלולים סביב פארקי כושר. "הבסיס קיים".
**שורה תחתונה:** דוד צודק — הבסיס קיים, ואף גדול ממה שנראה. יש **שני** צינורות ייבוא OSM שעובדים, צינור גילוי שכבר רץ מהפאנל דרך Cloud Function, מדדי איכות, GraphHopper בפרודקשן מאחורי דגל, ומרכז אישורים. מה שחסר הוא **החיבור**: לולאה על כל הרשויות, ציון אחיד אחד שנכתב על המסלול, ומחולל "סביב פארק" שמשתמש ב-GraphHopper עם via-points. אין צורך בתשתית חדשה, אלא ב-6 גלים קטנים.

---

## 1. מה קיים היום (מלאי)

### 1.1 מקורות וצינורות ייבוא מסלולים

| # | צינור | מקור נתונים | כותב ל- | chokepoint (`buildValidatedDoc`) | עיר | ברירת מחדל |
|---|---|---|---|---|---|---|
| A | `scripts/geo-discovery-routes.ts` (2252 שורות) | Overpass (3 מראות, `:476`): relations `route=hiking/foot/walking/running` (`:768-769`), פוליגוני פארקים ⇒ לולאת היקף, לולאות סגורות, מקטעים בעלי שם עם stitching (`:11-52`); אופציונלית round-trips של Mapbox (`--roundtrips`) | `official_routes` כ-`status:'pending'`, `published:false`, `origin:'osm_import'` (`:1820-1829`) | **כן** — `:2157` | פרמטרי: `--region=<key>`; טבלת `REGIONS` (`:179`, זכרון/אשקלון/חיפה) ואחרת `city_registrations/<key>` (`:309-323`) | dry-run (`--apply` כותב; `:84-91` — אחרי תקרית הרצליה 04.09) |
| A' | `functions/src/geoDiscoveryWorker.ts` | אותו `runGeoDiscovery` (עותק vendor, `:50`) | אותו | כן | לפי `city_mapping_discovery_runs.regionKey` | לפי `apply` של המסמך; poller כל 5 דק', 1800 שנ', 1GiB (`:374-375`) |
| B | `scripts/trails/build-segment-graph.ts` + `import-named-routes.ts` + `lib/trails-apply.node.ts` | **Geofabrik PBF** + osmium (`lib/pilot-osm.node.ts:9-53`), גובה Copernicus GLO-30 | `trail_segments` (upsert לפי `contentHash`) + `official_routes` (**create-only**, מזהים דטרמיניסטיים `osm_rel_<id>` / `gen_<placeNodeId>_<n>`, `import-named-routes.ts:121,190,287`) | כן ל-`official_routes` (`import-named-routes.ts:298-304`, `trails-apply.node.ts:211-212`) | פרמטרי: `--relation=<admin relation> --area=<slug>` (ברירת מחדל שער הנגב, `build-segment-graph.ts:125-126`) | dry-run; `--apply --project --authority` + הקלדת `YES`; **הורץ רק באמולטור** (`docs/trails-pilot/TRAILS-PILOT-SHAAR-HANEGEV.md:3`) |
| C | `src/features/admin/services/osm-segment-importer.ts` (`runOsmImport`) + `scripts/import-osm-segments.ts` | Overpass `way[highway~…]` (`osm-segment-importer.ts:382-384`) | `street_segments`, מזהה `osm_<id>` (`:762,787`) | כן בנתיב הפאנל (`:795`); **לא** בנתיב ה-REST של ה-CLI (`import-osm-segments.ts:12-23`) | פרמטרי (`--city --authority --south…`) | dry-run/commit חובה |
| D | `scripts/extract-osm-amenities-tlv.ts` (`runExtractOsmAmenities`) | Overpass: ספסל, מים, מתקני כושר, מעברי חצייה, גינות כלבים (`:191-199`) | `osm_amenities` | כן (`:534`) | `--city= --relationId=` (`:584-596`) | dry-run |
| E | `scripts/import-osm-routes-tlv.ts` | קובץ `/tmp` ישן | `official_routes` | **לא** | TLV קשיח | **כותב כברירת מחדל** — legacy, לא לשימוש |
| F | `/admin/routes` — ייבוא GeoJSON / Shapefile (`src/app/admin/routes/page.tsx:884,993,1228`) + `RouteEditor.tsx:420` (ציור ידני) | קבצים שמעלים ידנית | `official_routes` דרך `InventoryService.saveRoutes` (`inventory.service.ts:639`, validate ב-`:695`) | כן | לפי רשות שנבחרה | ידני. **אין ייבוא GPX/KML.** |
| G | `official-route-broadcaster.ts` | מסלול שנשמר | `street_segments` (`official_<routeId>_seg_<n>`) | **לא** (`:284-287`) | — | אוטומטי בכל שמירה |

**רשימות ה-tripwire:** `scripts/safety-check.sh:127-168` (`AUTHORIZED_ROUTE_WRITERS`) ו-`:169-187` (`MIGRATED_CHOKEPOINT_WRITERS`). שני הצינורות A ו-B כבר נמצאים בשתי הרשימות — **כל runner ארצי חייב לקרוא להם ולא לכתוב בעצמו.**

### 1.2 העשרה (מה מחושב על מסלול קיים)

| שכבה | קוד | שדות | היקף היום |
|---|---|---|---|
| הרכב (מדרכה/שביל אמיתי/רחוב) | `scripts/lib/route-composition-classify.ts:27-31`, `scripts/backfill-route-quality-signals.ts` | `qualitySignals.composition{sidewalkPct,genuinePct,ordinaryPct,otherPct}` | כל ה-DB בבת אחת, לא שלב בפאנל (`CITY-MAPPING-PIPELINE-ARCHITECTURE.md:38`) |
| תאורה | `scripts/lib/route-lighting-street-segments.node.ts`, שלב `lighting` בפאנל | `qualitySignals.lighting{litCoveragePct,isLit,status}` | חיפה applied (77 מסלולים, `a6ff0c79`) |
| מתקנים | `scripts/tag-route-amenities.ts` (ספים `:55-62`) | `nearbyAmenities[]`, `qualitySignals.amenities` | שלב בפאנל; **מדלג על מסלול בלי `qualitySignals`** (הבאג ב-`CITY-MAPPING-PIPELINE-ARCHITECTURE.md:44`) |
| גובה | `populate-route-elevation-tlv.ts` (TLV קשיח), `enrich-route.ts` (מסלול בודד), `scripts/trails/backfill-elevation-profile.ts` | `elevationGain`, `maxGrade`, `elevationProfile` (64 דגימות) | חלקי |
| טיפוסי עליות | `route-enrichment.service.ts` + `InventoryService.recomputeRouteEnrichmentForCity` (`inventory.service.ts:307-487`) | `terrainFeatures[]` | כבוי: `IS_ROUTE_ENRICHMENT_ORCHESTRATOR_ENABLED=false` (`src/config/feature-flags.ts:789`), פיילוט TLV בלבד (`:779`) |
| צל | — | רק תג ידני `shaded` (`route.types.ts:321`) | **לא מחושב בשום מקום** (בסקופ של RC2, ראו §5) |
| צורה | `scripts/backfill-route-shape-classification.ts` (ספים `:47-60`) | `shapeType`, `geometryMetrics`, `isReviewPriority` | מסלולים pending |

### 1.3 ציון ודירוג — שלוש מערכות נפרדות

1. **route-quality v1** — מדדי גאומטריה למסלול מחולל: `src/lib/route-quality/metrics.ts:14-47`; ספי קבלה `acceptance.ts:4-11` (`maxRetracedPct 0.08`, `maxUTurns 0`, `minCompactness 0.22`, `maxUnmarkedCrossingsPerKm 0.5`); עונש דירוג `acceptance.ts:29-35`; מדד "% על המסלולים שלנו" (`our-routes.ts:17-19`). מסך A/B: `/admin/routes/quality` (`src/app/admin/routes/quality/page.tsx`), מדידה: `scripts/route-quality/measure.ts` (7 נקודות התחלה קבועות, `presets.ts:14-23`).
2. **certificate / decide-accuracy** — החלטת approve/edit/drop למסלול מיובא: `src/lib/route-decisions/decide-accuracy.ts:71-76` (`SIDEWALK_EDIT_MIN_PCT=25`, `OTHER_UNKNOWN_REVIEW_THRESHOLD_PCT=40`, `ABSURD_DISTANCE_KM=30`…), confidence 90 ל-approve נקי (`:137`). קורא: `scripts/review-route-accuracy.ts`, טאב `accuracy` במרכז האישורים.
3. **כוכבי prior של צינור השבילים** — 0-5: מקור רשמי 0-2 + נוף 0-1.5 + שירותים 0-1 + הרכב 0-0.5 (`TRAILS-PILOT-SHAAR-HANEGEV.md:100`), נכתב כ-`rating` + `trail.starBreakdown`.

בנוסף: **route-fit** (`src/features/workout-engine/players/running/lib/route-fit/`, #491) — מדרג מסלולים קיימים מול האימון של היום (לא איכות מסלול).

### 1.4 "פארק המסילה" — מה באמת נעשה

**אין סקריפט או מסמך ניקוד ייעודי לפארק המסילה.** "הניקוד" הוא הצטברות של שכבות ההעשרה הרגילות על מסלול אחד, `official_routes/CY5KMrNMD90UAyuU3wom` ("הקפת פארק המסילה"):
- הרכב: `genuinePct 88.6 / sidewalkPct 5 / ordinaryPct 6.4` — `scripts/output/quality-signals-backfill-log-apply-1788087897174.json:2125-2135`. ⇒ approve נקי לפי decide-accuracy.
- תאורה 90% — הודעת הקומיט `e34adfdb` (`backfill-route-lit-tag-tlv.ts`, הוגדר שם כ-dry-run).
- גובה: `elevationGain=11` — `src/features/parks/core/services/__tests__/route-difficulty.test.ts:10`.
- שרשור מסדרון: פארק המסילה ↔ צ'רלס קלור ~553 מ' (`route-adjacency.service.ts:72,235`, `route-generator.service.ts:1724`).
- ממצאי שטח: `docs/field-test/07-corrected-findings-3-leads.md:59-71`, `docs/field-test/14-pre-merge-diagnosis-and-panel-answers.md:77`.

**המשמעות לתוכנית:** "לדרג כמו פארק המסילה" = להריץ את אותן שכבות (הרכב + תאורה + מתקנים + גובה + צורה) על כל מסלול, **ולגזור מהן ציון אחד שנשמר** — זה החלק שלא קיים היום (§3.3).

### 1.5 מחוללים

- **GraphHopper** (self-hosted, Cloud Run me-west1, `infra/graphhopper/README.md:1-21`): דגל `enable_graphhopper_routes` (`src/hooks/feature-flag-defs.ts:259`, ברירת מחדל `false`). פרופילים `foot/out_run/bike/out_bike/mtb`, flexible mode ⇒ custom model לכל בקשה (`infra/graphhopper/config.yml:12-25`). לולאות: `src/lib/routing/loop-service.ts:64-116` (3 round_trip + 3 משולשי via, best-of-6, trimSpurs, ציון route-quality — `loops/scoring.ts:34-86`). **via points כבר נתמכים:** `buildViaRequest` (`src/lib/routing/graphhopper/request-builder.ts:57-59`, `pass_through:true`). **אזור "פארקים" כבר קיים במודל** (`custom-model.ts:30`, `!in_parks ×0.85`) — אבל אף קורא לא מעביר `preferParks`.
- **loops-prefer-official** (`enable_loops_prefer_official`, `feature-flag-defs.ts:266`, #498): מסלולים מחוללים נצמדים למסלולים שלנו (Mapbox: seeds; GH: אזור `in_our_routes ×0.7`). פער מתועד: `curated_routes` לא נכללים (`loops-prefer-official/our-routes-source.ts:9-11`).
- **Mapbox v1** — `route-generator.service.ts` (`generateLoopRoutes:3060`, `generateDynamicRoutes:1501-1523` עם fallback מ-GH).
- **היברידי / route-stops** — `start-hybrid-session.ts:1284` (`composeHybridPlan`), `resolveRouteStops` (`hybrid/route-stops.service.ts:115-178`, POI ≤180 מ'), smart-walk "lollipop" משתמש→פארק→לולאה→משתמש (`smart-cards/smart-walk-backbone.ts`). **ה-GH adapter מסרב ל-`includeStrength`** (`graphhopper-loops/eligible.ts:29-37`) — כלומר כל מסלול-עם-פארק רץ היום על Mapbox.
- **מחולל לולאות של צינור השבילים** (`src/lib/trail-graph/route-assembly.ts`, `TRAILS-PILOT-SHAAR-HANEGEV.md:104`): לולאות 2.5-8 ק"מ סביב כל יישוב על גרף המקטעים — offline, נכתב כ-pending.

### 1.6 תזמור לפי עיר

- `/admin/city-mapping` + `runCityMapping` (`src/features/admin/services/city-mapping-orchestrator.ts:79-87,157`): authorityPreflight → boundary → routesGate → streetSegments → lighting → amenitiesIngest → amenitiesTagging → adjacencyVerify. רץ **בדפדפן** של המנהל, עיר אחת בכל פעם.
- `routesGate` → `triggerRouteDiscovery` (`:471`) → `city_mapping_discovery_runs` → ה-poller. **אין בלעדיות לפי regionKey ב-worker** — שתי ריצות ערד במקביל אומתו בפועל (`city-mapping-orchestrator.ts:419-433`).
- `/admin/city-mapping/add` → `city_registrations/<key>` (`src/lib/city-registrations.ts`, `register-city/route.ts:48`).
- **אין שום runner שעובר על כל הרשויות.**
- ⚠️ `CITY-MAPPING-PIPELINE-ARCHITECTURE.md:31` אומר "גילוי מסלולים נשאר CLI" — **מיושן**; הגילוי כבר מחווט דרך ה-poller. כדאי לתקן את המסמך ההוא ב-PR נפרד.

### 1.7 כיסוי ערים היום (מקוד/מסמכים, לא מפרודקשן)

| עיר | מקור | ראיה |
|---|---|---|
| תל אביב-יפו | פיילוט 27 מסלולים + עליות + מתקנים + תאורה | `import-osm-routes-tlv.ts:30`, `write-climb-segments-tlv.ts:68-78`, `e34adfdb` |
| חיפה | geo-discovery + תאורה applied | `geo-discovery-routes.ts:272-278`, `a6ff0c79`; 70 pending (`docs/audit-2026-10/route-geometry-measurement-report.md`) |
| הרצליה | 34 מסלולים (תקרית 04.09) | `geo-discovery-routes.ts:88-90`; 23 pending בדוח הגאומטריה |
| קרית אונו | 4 pending | דוח הגאומטריה |
| ערד | 26 מסלולים, ריצה אמיתית 05.10 | `city-mapping-orchestrator.ts:457` |
| אשקלון | REGIONS (7 תת-אזורים) — נמחק כולו | `geo-discovery-routes.ts:194-260`, `scripts/delete-ashkelon-routes.ts` |
| זכרון יעקב | REGIONS, ברירת המחדל של ה-CLI | `geo-discovery-routes.ts:182-188` |
| שדרות | 3 מסלולי דמו + מקטעים | `seed-sderot-demo.ts:450`, `segments/page.tsx:42-43` |
| שער הנגב | 4,001 מקטעים + 49 מסלולים — **אמולטור בלבד** | `TRAILS-PILOT-SHAAR-HANEGEV.md:3,128-132` |

**כלומר ~8 רשויות מתוך ~250.** את המספר האמיתי בפרודקשן צריך לאמת בשאילתה (שאלה פתוחה 1).

---

## 2. פערים ל"כל עיר"

### 2.1 מקורות שלא בשימוש

| מקור | מצב | רישוי | הערכה |
|---|---|---|---|
| **OSM route relations** (hiking/foot/walking/running/bicycle/mtb) | **בשימוש חלקי**: A לוקח hiking/foot/walking/running (`:768`); B גם mtb/bicycle (`segment-graph.ts:21-23`). חסר: `route=fitness_trail`, `leisure=track` (מסלולי ריצה באצטדיונים), `route=running` כמעט לא מתויג בישראל | ODbL — קרדיט + share-alike על ה-DB הנגזר (`TRAILS-PILOT-SHAAR-HANEGEV.md:110`) | זול, להרחיב פילטר |
| **מסלולים מסומנים ארציים** (שביל ישראל, ITC, KKL, רט"ג) | נמצאים ב-OSM כ-relations עם `operator` — B כבר מזהה `operator` רשמי לכוכבים | ODbL (דרך OSM) | מכוסה ע"י B |
| **אתרי קק"ל / רט"ג ישירות** | לא בשימוש | **לא ידוע / כנראה זכויות שמורות** — צריך הסכם. אין API פתוח מוכר | לא בגל הראשון; לפנות ב-B2G |
| **מידע פתוח עירוני** (data.gov.il, GIS עירוני, ArcGIS REST של עיריות) | נתיב F תומך GeoJSON/Shapefile + `fetchFromArcGIS` (`routes/page.tsx:802-829`) — ידני | משתנה לפי רשות (רבים CC-BY / רישיון ממשלתי פתוח). לבדוק לכל מקור | בינוני; טוב במיוחד לרשויות לקוחות — הן יכולות לתת קובץ |
| **שבילי אופניים — משרד התחבורה** | לא בשימוש (`CITY-MAPPING-PIPELINE-ARCHITECTURE.md:76`) | לא נבדק | מחוץ לסקופ RC1 |
| **Strava / Garmin / Komoot heatmaps וסגמנטים** | לא בשימוש | **אסור**: תנאי ה-API של Strava אוסרים שימוש בנתונים לבניית מוצר מתחרה/אגרגציה; heatmap אסור לגירוד. Komoot/AllTrails — זכויות שמורות. **לא להשתמש.** | — |
| **מסלולי פארקרן (parkrun)** | לא בשימוש | אין רישיון פתוח; שמות + נקודת התחלה הם עובדה ציבורית, גאומטריה לא | אולי כ-"hint" בלבד, ידני |
| **UGC שלנו** — ריצות משתמשים | קיים טאב `ugc` במרכז האישורים (`approval-center/page.tsx:70`) | שלנו (בכפוף למדיניות פרטיות) | עתידי: "מסלולים פופולריים" מאגרגציה אנונימית |

### 2.2 לולאת ריצה לפי עיר
אין. צריך runner שעובר על רשימת רשויות, מריץ A או B לכל אחת עם checkpoint, ולא יותר מאחת במקביל (§3.2).

### 2.3 אוטומציית ציון
שלוש מערכות ציון נפרדות (§1.3) ואף אחת לא כותבת ציון אחד ל-`official_routes` שאפשר למיין לפיו. צינור A לא מריץ כוכבים; צינור B לא מריץ certificate.

### 2.4 תור סקירה
- מרכז האישורים קיים, אבל **PR #138 (shape-review בתוך מרכז האישורים) לא ב-main** — רק בענף `origin/routes-approval-merge` (`2d4cd3f0`). ב-main עדיין יש `/admin/routes/shape-review` נפרד (`src/app/admin/routes/shape-review/page.tsx`).
- בהיקף ארצי (אלפי pending) הסקירה הידנית היא צוואר הבקבוק. צריך: מיון לפי ציון, אישור אוטומטי לקבוצה ברורה, וסינון לפי עיר.

### 2.5 מחולל "מסלול סביב פארק כושר"
- היום: `smart-walk-backbone.ts` (Mapbox) ו-`composeRouteStopsWorkout` — שניהם **בזמן אמת**, על Mapbox, ו-GH מסרב להם (`eligible.ts:29-37`).
- **מה GraphHopper יודע לעשות כבר עכשיו** (בלי שינוי שרת):
  1. **via-points עם `pass_through`** (`request-builder.ts:57-59`): התחלה → פארק → נקודה X → התחלה. זה כבר מה ש-`viaLoopCandidate` עושה (`loops/candidates.ts:65-78`) — רק שהנקודה P1 אקראית ולא הפארק.
  2. **custom model עם `areas`**: אזור `in_parks` כבר מוגדר (`custom-model.ts:30`) — אפשר להעביר את פוליגון הפארק/ים ולהעדיף הליכה בתוכם.
  3. **round_trip + `headings`** — לבחור כיוון יציאה לכיוון הפארק.
  4. **הגבלה:** `round_trip` לא מקבל via-points; ולכן "לולאה שעוברת בפארק" = via (start→park→P2→start) עם P2 מסובב ב-±60°, best-of-N, ציון route-quality — **אותו מתכון שכבר עובר 77.8%** (`infra/graphhopper/README.md:19-20`).
- **מסלולים קבועים סביב פארק (offline):** אותו דבר כ-batch — לכל פארק כושר מאושר, 2-3 לולאות (2/3/5 ק"מ) שנשמרות כ-pending `official_routes` עם `visitingParkId` (`route.types.ts:678`) ו-`origin:'generated_park_loop'`. זה מה ש"מסלולים סביב פארקי כושר" צריך להיות כדי שיופיעו במפה בלי זמן חישוב.
- **אין אינדקס פארק→מסלול** (`route_adjacency` הוא מסלול↔מסלול בלבד, `schemas.ts:210-220`). "מסלולים ליד פארק X" מחושב בזמן אמת על ≤200 מסלולים במטמון (`inventory.service.ts:793`) — לא יחזיק בהיקף ארצי.

---

## 3. התוכנית

### 3.1 החלטת ארכיטקטורה מוקדמת: איזה צינור הוא "הארצי"

| | A — geo-discovery (Overpass) | B — trails (PBF) |
|---|---|---|
| זמינות מקור | Overpass נפל 502/500 ב-18.10 (`TRAILS-PILOT-SHAAR-HANEGEV.md:26`) | קובץ אחד, מתוארך, ניתן לשחזור |
| עיר | מצוין בעיר (פארקים, טיילות, stitching רחובות) | מצוין בשטח פתוח/מועצות אזוריות |
| גובה | Mapbox Terrain-RGB — **אסור לשמירה** (`TRAILS-PILOT-SHAAR-HANEGEV.md:112`) | Copernicus — מותר עם קרדיט |
| מזהים | `source.externalId`, מזהה מסמך אקראי | דטרמיניסטי, create-only |
| רישוי/provenance | אין שדות license | `provenance` + `attribution` מלאים |
| בפאנל | כן (poller) | לא (מחכה לחיווט) |

**המלצה:** שניהם, לפי סוג רשות — עירייה/מועצה מקומית ⇒ A, מועצה אזורית ⇒ B. **אבל** לפני הרחבה ארצית של A: להעביר את A לקרוא מאותו PBF (קריאה מקומית במקום Overpass) ולהחליף את הגובה ל-Copernicus. שני הצעדים קטנים כי `copernicusToElevationGrid()` כבר מייצר את פורמט המטמון הקיים (`TRAILS-PILOT-SHAAR-HANEGEV.md:112`).

### 3.2 גלים (PR קטן לכל אחד)

| גל | מה | קבצים עיקריים | גודל | תלות |
|---|---|---|---|---|
| **W0** | תיקוני היגיינה: למחוק/לנעול את `import-osm-routes-tlv.ts` (כותב כברירת מחדל, בלי chokepoint); לתקן את `CITY-MAPPING-PIPELINE-ARCHITECTURE.md:31` המיושן; `CITY-MAPPING-PIPELINE-ARCHITECTURE.md:95` (`'moderate'`) כבר לא רלוונטי — `src/lib/route-collections/schemas.ts:11,152` חוסם אותו; לסמן כסגור | scripts, docs | S | — |
| **W1** | A על PBF + Copernicus + שדות `provenance`/`license` (כמו B, `firestore-docs.ts:127-138`) | `geo-discovery-routes.ts`, `pilot-osm.node.ts` (לחלץ ל-`scripts/lib/`) | M | החלטה פתוחה 3 |
| **W2** | **ציון אחיד** `routeScore` (§3.3) — פונקציה טהורה + backfill dry-run; שני הצינורות כותבים אותו בזמן הייבוא | `src/lib/route-score/` חדש, `scripts/backfill-route-score.ts` | M | W1 רצוי |
| **W3** | **runner ארצי** (§3.4) | `scripts/routes-nationwide/run.ts`, `src/lib/route-collections/...` לקריאה בלבד | M | W1, W2 |
| **W4** | תור סקירה: מיזוג #138 (rebase), מיון לפי `routeScore`, פילטר עיר, אישור-קבוצה ל-"ירוק" | `approval-center/*`, `RouteShapeReviewTab.tsx` | M | W2 |
| **W5** | **מחולל סביב פארק** — חי: `mode:'park_loop'` ב-`/api/routes/generate` עם via start→park→P2→start + `preferParks`; לפתוח את `eligible.ts` ל-`includeStrength` עם פארק יחיד | `src/lib/routing/loops/candidates.ts`, `api-contract.ts`, `graphhopper-loops/eligible.ts` — מאחורי דגל חדש | M | GH דלוק בפרודקשן |
| **W6** | **מחולל סביב פארק** — offline: batch על פארקי כושר מאושרים לכל עיר, 2-3 לולאות כ-pending עם `visitingParkId`, דרך `buildValidatedDoc` + אינדקס פארק→מסלול (`parkIds[]` על המסלול, נבנה באותו batch) | `scripts/routes-nationwide/park-loops.ts` | M | W3, W5 |
| W7 (אופציונלי) | חיווט B כשלב בפאנל (`runBuildSegmentGraph`/`runImportNamedRoutes` כבר מיוצאים) ו-composition/גובה כשלבים, לפי `CITY-MAPPING-PIPELINE-ARCHITECTURE.md:42-62` | orchestrator | L | — |

### 3.3 מדד ציון (`routeScore`, 0-100) — שימוש חוזר במדדים קיימים בלבד

| רכיב | משקל | מקור קיים | חישוב |
|---|---|---|---|
| איכות משטח/הרכב | 25 | `qualitySignals.composition` | `genuinePct` + ½·`ordinaryPct` (רחוב שקט), עונש על `otherPct` |
| גאומטריה | 20 | `geometryMetrics` + route-quality v1 (`retracedPct`, U-turns, compactness — רק ללולאות) | ספי `acceptance.ts:4-11`; קווי/חד-כיווני לא נענשים על compactness (טיילת לגיטימית, כמו ב-shape-review) |
| בטיחות | 15 | `majorRoadPct`, `crossings.unmarkedPerKm` (`major-roads.ts`) | ספים קיימים |
| מקור/רשמיות | 15 | כוכבי prior של B (`operator` itc/kkl/inpa + שם רשמי) | אותו חישוב כמו `trail.starBreakdown`; ל-A: relation ⇒ גבוה, segment stitched ⇒ נמוך |
| נוחות | 15 | `qualitySignals.amenities.has`, `qualitySignals.lighting.litCoveragePct` | מים/ספסל/תאורה; צל — כשיהיה (RC2) |
| התאמה לאפליקציה | 10 | אורך 1-15 ק"מ, `visitingParkId`/פארק כושר ≤180 מ' (`route-stops.service.ts:32`) | מסלול שעובר ליד פארק כושר = בונוס — זה ה-USP שלנו |

- `confidence` נפרד: כמה מהרכבים חושבו בפועל (מסלול בלי תאורה/מתקנים מקבל ציון חלקי עם confidence נמוך, לא אפס).
- ירוק (≥75 ו-confidence ≥0.8 ו-certificate approve) ⇒ מועמד לאישור-קבוצה; צהוב ⇒ סקירה; אדום (<40 או drop) ⇒ ארכיון אוטומטי **רק אחרי** שדוד מאשר את הכיול.
- **כיול:** מריצים על ~100 המסלולים שכבר נסקרו ידנית ב-shape-review (`shapeTrainingReview.decision`, `route-shape-review.service.ts:17-40`) — זו קבוצת אימות מוכנה. פארק המסילה הוא בדיקת עוגן (צריך לצאת ירוק).
- **ODbL:** הציון הוא העשרה שלנו. לפי ההמלצה ב-`TRAILS-PILOT-SHAAR-HANEGEV.md:110`, לשקול לשמור אותו באוסף נפרד (`route_scores/{routeId}`) ולא בתוך המסמך הנגזר מ-OSM (שאלה פתוחה 4).

### 3.4 Runner ארצי — עיצוב

`scripts/routes-nationwide/run.ts` — **סקריפט שדוד מריץ** לכתיבה לפרודקשן; agents מריצים רק dry-run ואמולטור.

- **קלט:** רשימת רשויות מ-`authorities` (קריאה בלבד) + `adminRelationId`/`city_registrations`; `--only=<ids>`, `--kind=municipal|regional`, `--limit=N`.
- **מקור יחיד:** PBF של Geofabrik (תאריך אחד לכל הריצה = snapshot), osmium extract לכל רשות לפי relation. אריחי Copernicus כבר מוגדרים לכל הארץ (`ISRAEL_COPERNICUS_TILES`).
- **load-safe:** רשות אחת בכל פעם, ללא מקביליות (מכונה 16GB; PBF 120MB, אריחי DEM ~315MB במטמון). `--pause-ms` בין רשויות. בלי Overpass בכלל ⇒ אין rate-limit חיצוני.
- **אידמפוטנטי:** מזהים דטרמיניסטיים (כמו B); create-only ל-`official_routes` (לא דורס מסלול שנערך/אושר בפאנל — `geo-discovery-routes.ts:2216-2218`); checkpoint `scripts/output/nationwide-<date>/checkpoint.json` — ריצה חוזרת ממשיכה מהרשות האחרונה.
- **chokepoint:** כל כתיבה דרך הפונקציות הקיימות (`runGeoDiscovery` / `trails-apply.node.ts`) ⇒ `buildValidatedDoc`. ה-runner עצמו **לא כותב** ל-route collections ⇒ לא צריך להיכנס ל-`AUTHORIZED_ROUTE_WRITERS`.
- **שערים:** רשות בלי `authorityId` חד-ערכי ⇒ דילוג + דיווח (§23 axiom). `TARGET:` מודפס ראשון, `YES` מוקלד, `--project appout-1` + מפתח תואם (העתקה של המעקות מ-`trails-apply.node.ts`).
- **בלעדיות:** נעילה `city_mapping_runs/{authorityId}_routes` (המסמך המוצע ב-`CITY-MAPPING-PIPELINE-ARCHITECTURE.md:86`) — גם סוגר את באג ריצות-ערד-המקבילות.
- **פלט:** `summary.json` לכל רשות (נוצרו/קיימים/דולגו/ירוק/צהוב/אדום) + סיכום ארצי.
- **סדר הרצה מומלץ:** רשויות לקוחות ⇒ 10 ערים גדולות ⇒ מועצות אזוריות ⇒ השאר.
- **מיקום עתידי:** לפי העיקרון הנעול (`CITY-MAPPING-PIPELINE-ARCHITECTURE.md:20`) — הלוגיקה בפונקציה `runNationwideRoutes(authorityIds, apply, db)` שהפאנל יוכל לקרוא לה בהמשך; ה-CLI הוא עטיפה דקה.

### 3.5 סקירה אנושית
1. ריצת dry-run ⇒ דוד מקבל `summary.json` + 15 מסלולים מדגמיים לכל רשות (כמו בפיילוט, `TRAILS-PILOT-SHAAR-HANEGEV.md:53`).
2. apply ⇒ הכול pending/`published:false`.
3. מרכז האישורים (W4): מיון לפי `routeScore`, ירוקים באישור-קבוצה **ידני** (כפתור אחד לעיר, לא אוטומטי), צהובים אחד-אחד, אדומים מוסתרים.
4. כל החלטה ⇒ `shapeTrainingReview` ⇒ חוזר לכיול הציון.

### 3.6 עלויות (הערכה)
- **נתונים:** OSM + Copernicus — חינם (קרדיט חובה, כבר מוצג: `route-attribution.ts`, `RouteDetailSheet.tsx:1078`).
- **GraphHopper:** כבר משולם, ~50-70$/חודש (`infra/graphhopper/README.md:120-131`). batch W6 (נניח 2,000 פארקי כושר × 3 לולאות × ~8 קריאות) ≈ 50k קריאות בשעות שקטות ⇒ זניח (<5$).
- **Firestore:** נניח ~250 רשויות × ~30 מסלולים + מקטעי שבילים לכל מועצה אזורית (שער הנגב לבד: 4,001) ⇒ סדר גודל 10k מסלולים + 200-400k מקטעים ⇒ כתיבות ~0.5M פעם אחת ≈ 1$; אחסון `trail_segments` עם `geometry` — מאות MB ⇒ כמה $/חודש. ריצה חוזרת = 0 כתיבות (contentHash).
- **Mapbox:** חוסכים — GH מחליף את Directions; אין שימוש ב-Mapbox לגובה שמור.
- **זמן אנושי:** הסקירה היא העלות האמיתית. בלי W2+W4 — 10k מסלולים × ~20 שנ' = ~55 שעות סקירה. עם אישור-קבוצה לירוקים — הערכה של 10-15 שעות.

### 3.7 מי מריץ מה

| תפקיד | מריץ | לא מריץ |
|---|---|---|
| agent קוד (worktree, PR לכל גל) | בונה W0-W6, בדיקות יחידה, dry-run מקומי על PBF ציבורי, אמולטור (`FIRESTORE_EMULATOR_HOST`) | שום כתיבה לפרודקשן, שום deploy |
| agent ביקורת (סשן נפרד, CLAUDE.md חוק 2) | ביקורת לכל PR + `safety-check.sh` | — |
| agent "סוקר ראשון" (אופציונלי) | קורא `summary.json` + מדגם, מסמן חריגות לדוד | לא מאשר מסלולים |
| **דוד** | `--apply` לפרודקשן, אישורים במרכז האישורים, הדלקת דגלים, deploy של GraphHopper/rules | — |

---

## 4. התנגשויות עם עבודה פעילה

| ענף / worktree | נוגע ב- | התנגשות | מה לעשות |
|---|---|---|---|
| `fix/graphhopper-infra-scripts` (`/Users/calisthenicsltd/Development/appout-1-gh-infra-fix`, `1eb1586a`) | `infra/graphhopper/scripts/deploy.sh`, `setup.sh` — **לא ב-main** | W5/W6 תלויים בשרת GH שאפשר לפרוס | למזג לפני W5 |
| `routes-approval-merge` (#138, `2d4cd3f0`) | מרכז האישורים + מחיקת `shape-review/page.tsx`; `d9691046` מזהיר לשמור את chip ה-generator | W4 בונה על אותו מסך | למזג/לעשות rebase ל-#138 **לפני** W4 |
| `docs/routes-shade-light-data` (`/Users/calisthenicsltd/Development/appout-1-routes-rc2`) | מקורות צל/תאורה (מסמכים) | רכיב "נוחות" בציון (§3.3) | לתאם: RC2 קובע את השדה, RC1 רק צורך |
| `fix/loop-orientation-chaining-v2` (`/Users/calisthenicsltd/Development/appout-routes`, `feffb40e`) | שרשור/כיוון לולאות | ייתכן חפיפה עם `route-generator.service.ts` ב-W5 | לבדוק diff לפני W5 |
| `feat/route-quality-phase01`, `feat/graphhopper-routing(-main)` | — | כבר squash-merged (#480, #489) | ענפים ישנים, אפשר לנקות |
| worktrees של `perf-route-stops-*`, `feat-route-stops-card-time` | `route-stops.*`, היברידי | W5 משנה את `eligible.ts` ל-`includeStrength` | W5 מאחורי דגל חדש, לא לגעת ב-`composeHybridPlan` |
| CLAUDE.md, חוב פתוח 2 (`route-stops.generator.ts`) | — | W5 לא נוגע במנוע ההצעות המאוחד | — |

---

## 5. שאלות פתוחות לדוד

1. **כמה רשויות ומסלולים יש בפרודקשן היום** (published/pending לפי עיר)? המסמך גזר את זה מקוד בלבד. שאילתת קריאה אחת תאמת את זה.
2. **שער הנגב:** להריץ את ה-`--apply` של הפיילוט לפרודקשן (§8 במסמך הפיילוט) לפני ההרחבה, או לדלג ישר ל-runner הארצי?
3. **Overpass → PBF ל-geo-discovery (W1):** מאושר? זה משנה את ה-Cloud Function worker (vendor copy) ואת הגובה (Mapbox→Copernicus). אחרי זה צריך backfill לגובה הקיים.
4. **איפה הציון נשמר:** בתוך `official_routes` (פשוט) או באוסף נפרד `route_scores` (נקי מ-ODbL share-alike)?
5. **אישור-קבוצה לירוקים:** מותר כפתור "אשר את כל הירוקים בעיר X", או כל מסלול נסקר בנפרד?
6. **מחולל סביב פארק — חי או offline או שניהם?** offline = מסלולים קבועים במפה (צריך סקירה); חי = מותאם למשתמש (צריך GH דלוק בפרודקשן).
7. **אילו "פארקי כושר"?** רק `facilityType` של מתקני כושר מאושרים, או גם מתקני כושר מ-`osm_amenities` (`leisure=fitness_station`)?
8. **מקורות מעבר ל-OSM:** לפנות לקק"ל/רט"ג/עיריות לקבלת נתונים בהסכם (B2G)? Strava וחברים — לא, בגלל תנאי השימוש.
9. **"הקפת פארק המסילה" כעוגן כיול:** אתה מסכים שזה המסלול שמגדיר "ירוק"? יש עוד 2-3 מסלולים שאתה מחשיב מצוינים או גרועים לכיול?
10. **סדר הרצה:** רשויות לקוחות קודם? מי ברשימה (`.claude/knowledge/product-context.md` לא נגיש מ-worktree)?
