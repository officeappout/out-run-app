# מסלולים בכל עיר — מיפוי מה קיים + תוכנית (RC1)

**סטטוס:** מסמך תכנון בלבד, 21.10.2026. לא נכתב קוד, לא נקראה פרודקשן. כל טענה מבוססת על `origin/main` @ `bfbc59d6` (נבדק `git fetch` לפני הקריאה), עם הפניית `file:line`.
**הבקשה (דוד, 21.10):** סוכנים שאוספים מסלולים בעלי שם/רשמיים בכל עיר ממקורות רבים, מדרגים אותם כמו שעשינו ל"פארק המסילה", ומחולל שבונה מסלולים סביב פארקים. "הבסיס קיים".
**עדכון 21.10 (גרסה 2) — הבהרות דוד שנכנסו למסמך:**
1. **סדר מקורות:** קודם מאגרים קיימים ומוסדרים (שבילי שטח להליכה ולאופניים/MTB, רשתות אופניים ארציות ועירוניות, טיילות ומסלולים עירוניים), ורק בסוף מסלולים מחוללים. ראו §2.1 (רשימת מאגרים אמיתית עם URL ורישוי) ו-§3.1.
2. **"לולאות סביב פארקים" = פארקים גדולים ונעימים** (ספורטק, פארק הירקון), **לא** מתקני כושר. מתקני כושר הם עצירה אופציונלית בלבד. ראו §2.5 ו-W5/W6.
3. **איכות על פני כמות:** סט מצומצם ונבחר לכל עיר לפי גודלה, לא אלפים. ראו §3.7 (מכסות), ועדכונים ב-runner (§3.4), בציון (§3.3) ובסקירה (§3.5).
**שורה תחתונה:** דוד צודק — הבסיס קיים, ואף גדול ממה שנראה. יש **שני** צינורות ייבוא OSM שעובדים, צינור גילוי שכבר רץ מהפאנל דרך Cloud Function, מדדי איכות, GraphHopper בפרודקשן מאחורי דגל, ומרכז אישורים. מה שחסר הוא **החיבור**: לולאה על כל הרשויות, ציון אחיד אחד שנכתב על המסלול, ומחולל "סביב פארק גדול" שמשתמש ב-GraphHopper עם via-points. אין צורך בתשתית חדשה, אלא בגלים קטנים. בגרסה 2: המאגרים הממשלתיים והעירוניים (אופניים, גנים) נכנסים כמקור ראשון, והיעד הוא 8-40 מסלולים טובים לעיר, לא כמה שיותר.

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

### 2.1 מקורות — מאגרים קיימים קודם (נבדק ברשת 21.10.2026)

**סדר עדיפות (החלטת דוד, 21.10):** (1) מאגרים מוסדרים קיימים — שבילים מסומנים, רשתות אופניים, טיילות ומסלולים עירוניים ⇒ (2) OSM route relations כבסיס חינמי ארצי ⇒ (3) מסלולים מחוללים, רק איפה שאין מקור טוב.

מקרא: ✅ נבדק עכשיו (ה-API/הקובץ ענה); ⚠️ לא אומת (לפי חיפוש או ידע כללי). "מסחרי?" = האם הרישיון מתיר שימוש באפליקציה מסחרית.

#### א. מאגרים שנבדקו ונמצאו בפועל

| # | מאגר | URL | פורמט | רישוי / מסחרי? | כיסוי | מאמץ ייבוא |
|---|---|---|---|---|---|---|
| 1 | **OSM — Geofabrik `israel-and-palestine`**: relations `route=hiking/foot/walking/running/bicycle/mtb`, `leisure=park`, `highway=footway/cycleway`, טיילות (`name~טיילת`) | https://download.geofabrik.de/asia/israel-and-palestine.html | PBF (~120MB) | ODbL 1.0 — ✅ מסחרי מותר, קרדיט + share-alike על ה-DB הנגזר (`TRAILS-PILOT-SHAAR-HANEGEV.md:110`) | ארצי; שבילים מסומנים של ITC/קק"ל ממופים ב-OSM ע"י הקהילה (`operator`, `osmc:symbol`) | **קיים** — צינור B (`scripts/trails/*`). ✅ |
| 2 | **משרד התחבורה — תשתית רכיבה קיימת** `bph_infra_exist` | https://data.gov.il/dataset/bph_infra_exist | SHP/KMZ/CSV (zip 2MB) | "Other (Open)" — ⚠️ לאמת תנאי data.gov.il למסחרי | מספר ערים, לפי אורתופוטו 2022, מפרט מיפוי תשתיות רכיבה 1.52; עודכן 02.03.2025 ✅ | נמוך: SHP ⇒ GeoJSON, המרת ITM⇒WGS84; זו **שכבת קטעים**, לא מסלולים — צריך הרכבה למסלולים (כמו `trail_segments`) |
| 3 | **משרד התחבורה — "אופנידן"** (רשת בינעירונית למסלולי אופניים, גוש דן) `ofneidan` | https://data.gov.il/dataset/ofneidan | SHP/KMZ/CSV | CC-BY ✅ מסחרי מותר עם קרדיט | גוש דן; עודכן 01.09.2025 ✅ | נמוך; מסלולים בעלי שם — מתאים ישירות ל-`official_routes` (`activityType: cycling`) |
| 4 | **משרד התחבורה — רשת רכיבה מחוז ת"א / מחוז מרכז** `bike_net_tlv`, `bike_net_center` | https://data.gov.il/dataset/bike_net_tlv , https://data.gov.il/dataset/bike_net_center | SHP/KMZ/CSV/DXF | CC-BY ✅ | **רשת מתוכננת** (קבצים מ-2022) ✅ | לשימוש רק כ-hint/הצלבה — מתוכנן ≠ קיים. לא לייבא כמסלול |
| 5 | **משרד התחבורה — תשתית רכיבה מתוכננת** `bph_infra_plan` | https://data.gov.il/dataset/bph_infra_plan | SHP/KMZ/CSV | CC-BY ✅ | עודכן 12.08.2026 ✅ | hint בלבד (מתוכנן) |
| 6 | **שבילי אופניים בירושלים** `bicycle_jer_2019` (משרד התחבורה) | https://data.gov.il/dataset/bicycle_jer_2019 | SHP/KMZ/CSV | CC-BY ✅ | ירושלים, 2019 (קובץ מ-2021) — ⚠️ מיושן | נמוך; להצליב מול OSM |
| 7 | **עיריית באר שבע — שבילי אופניים** `bicycle_track-br7` | https://data.gov.il/dataset/bicycle_track-br7 | **GeoJSON** (גם WGS84 וגם ITM) | "Other (Open)" ⚠️ | באר שבע, עודכן 18.10.2026 ✅ | הכי נמוך — GeoJSON מוכן |
| 8 | **עיריית באר שבע — אתרי טבע עירוני** `urban-nature-br7` | https://data.gov.il/dataset/urban-nature-br7 | GeoJSON | "Other (Open)" ⚠️ | באר שבע ✅ | נמוך; עוגנים לפארקים/מסלולי טבע עירוני |
| 9 | **עיריית תל אביב-יפו — GIS (ArcGIS REST)**: שכבה 577 "שבילי אופניים" (503 רשומות), 551 "שטחים ירוקים וגנים ציבוריים" (2,624 פוליגונים, כולל `shem_gan`, `sug_gan`, `shetach_gan` = שטח), 784 "אופנידן" (74), 834 "מתקני כושר בגינות" | https://gisn.tel-aviv.gov.il/arcgis/rest/services/IView2/MapServer/577 (וכן `/551`, `/784`, `/834`) | Esri JSON / GeoJSON (`query?f=geojson`), עד 2,000 רשומות לבקשה | פורטל המידע הפתוח של ת"א: לפי ה-FAQ מותר שימוש "לכל מטרה" עם קרדיט — ⚠️ לאמת שתנאי השימוש חלים גם על שכבות ה-GIS | ת"א-יפו ✅ (הספירות נבדקו עכשיו) | נמוך-בינוני; **שכבה 551 היא המקור הטוב ביותר שמצאנו לפארקים גדולים** (שטח מוכן לסינון) |

#### ב. מקורות שלא אומתו / דורשים הסכם

| # | מקור | מצב | רישוי | המלצה |
|---|---|---|---|---|
| 10 | **שביל ישראל + שבילים מסומנים** (ועדת השבילים / החברה להגנת הטבע, רט"ג, קק"ל) | ⚠️ לא נמצאה שכבת GIS פתוחה רשמית. מפ"י וחלה"ט דיגיטלו את שביל ישראל (מפות להורדה, לא שכבה) | ⚠️ לא ידוע; כנראה זכויות שמורות | להשתמש ב-OSM (#1) כמקור בפועל — הסימונים ממופים שם; לפנות לחלה"ט/ועדת השבילים להסכם נתונים (B2G) |
| 11 | **סינגלים של קק"ל (MTB)** | ⚠️ אין GPX רשמי פתוח. Trailforks מחזיק רשימת "Official KKL singletracks" (12 מסלולים) — הורדה רק למנויי Pro ו**לשימוש אישי בלבד** | ❌ Trailforks אסור לשימוש מסחרי | OSM (`route=mtb`, `mtb:scale`) — צינור B כבר מטפל; לפנות לקק"ל ישירות |
| 12 | **מסלולי רט"ג בגנים לאומיים ושמורות** | ⚠️ תיאורים ומפות באתר רט"ג; לא נמצא GIS פתוח | ⚠️ לא ידוע | OSM + פנייה |
| 13 | **ירושלים — פורטל נתונים עירוני** (opendata.jerusalem.muni.il, CKAN) / GIS עירוני (jergisng) | ⚠️ ה-API לא ענה בבדיקה | ⚠️ | לנסות שוב; בינתיים #6 + OSM |
| 14 | **חיפה** | ✅ ב-data.gov.il יש לעירייה 9 מאגרים, אף אחד לא שבילים/גנים (רק "מיפוי מתקני ספורט" XLS) | — | OSM; לבקש מהעירייה (חיפה כבר עם 70 מסלולים pending אצלנו) |
| 15 | **הרצליה, נתניה, ראשל"צ, פ"ת ושאר הערים** | ⚠️ לא נמצאו מאגרים ב-data.gov.il (61 ארגונים, ערים: באר שבע, חיפה, פ"ת בלבד) | — | פנייה ישירה לרשויות לקוחות: לבקש SHP/GeoJSON של טיילות, גנים ושבילים. נתיב F (ייבוא GeoJSON/Shapefile ב-`/admin/routes`) כבר תומך |
| 16 | **Israel Hiking Map / Mapeak** | נתוני המסלולים שלו הם OSM (ODbL); אריחי המפה היו בעבר CC BY-NC-SA ⚠️ | נתונים: ODbL ✅; אריחים: לא מסחרי ❌ | לא צריך — אותם נתונים כמו #1 |
| 17 | **Strava / Komoot / AllTrails / Garmin** | — | ❌ תנאי השימוש אוסרים | לא להשתמש |
| 18 | **parkrun** | — | ❌ אין רישיון לגאומטריה | לכל היותר hint ידני |
| 19 | **UGC שלנו** (ריצות משתמשים) | טאב `ugc` במרכז האישורים (`approval-center/page.tsx:70`) | שלנו, בכפוף למדיניות פרטיות | עתידי: "מסלולים פופולריים" מאגרגציה אנונימית |

**הערות רישוי:**
- CC-BY (#3-6) מתיר שימוש מסחרי במפורש, וצריך קרדיט "משרד התחבורה והבטיחות בדרכים — data.gov.il".
- "Other (Open)" ב-data.gov.il (#2, #7, #8): לא מצאנו את נוסח התנאים של הפורטל. הרישיון הפתוח של הלמ"ס, למשל, מתיר שימוש מסחרי. **צריך לאמת לפני ייבוא** (שאלה פתוחה 11).
- **ODbL + מקור ממשלתי באותה רשומה:** אם מסלול משלב גאומטריה מ-OSM עם נתונים ממשלתיים, הוא חלק מ-DB נגזר ODbL. ההמלצה: לשמור `source.type` אחד לכל מסלול, ולשמור את ההעשרות שלנו בנפרד, כמו בהמלצת `TRAILS-PILOT-SHAAR-HANEGEV.md:110`.

### 2.2 לולאת ריצה לפי עיר
אין. צריך runner שעובר על רשימת רשויות, מריץ A או B לכל אחת עם checkpoint, ולא יותר מאחת במקביל (§3.2).

### 2.3 אוטומציית ציון
שלוש מערכות ציון נפרדות (§1.3) ואף אחת לא כותבת ציון אחד ל-`official_routes` שאפשר למיין לפיו. צינור A לא מריץ כוכבים; צינור B לא מריץ certificate.

### 2.4 תור סקירה
- מרכז האישורים קיים, אבל **PR #138 (shape-review בתוך מרכז האישורים) לא ב-main** — רק בענף `origin/routes-approval-merge` (`2d4cd3f0`). ב-main עדיין יש `/admin/routes/shape-review` נפרד (`src/app/admin/routes/shape-review/page.tsx`).
- בהיקף ארצי (אלפי pending) הסקירה הידנית היא צוואר הבקבוק. צריך: מיון לפי ציון, אישור אוטומטי לקבוצה ברורה, וסינון לפי עיר.

### 2.5 מחולל "לולאה סביב פארק גדול" (הוגדר מחדש 21.10)

**ההגדרה של דוד:** פארקים גדולים ונעימים — ספורטק, פארק הירקון, פארק המסילה — **לא** מתקני כושר. מתקן כושר הוא רק עצירה אופציונלית על הלולאה.

**מה יש היום:**
- `smart-walk-backbone.ts` ו-`composeRouteStopsWorkout` עובדים סביב **פארק כושר** (`includeStrength`), בזמן אמת, על Mapbox. GH מסרב להם (`eligible.ts:29-37`). זה מודל אחר ממה שדוד מבקש.
- צינור A כבר מייצר **לולאת היקף** לפארקים בעלי שם: `leisure=park/garden` ⇒ לולאה לאורך הגבול האמיתי של הפוליגון (`geo-discovery-routes.ts:19-25`). אבל אין סף גודל, ולכן גם גינה קטנה נכנסת.
- GraphHopper: אזור `in_parks` כבר מוגדר במודל (`custom-model.ts:30`, `!in_parks ×0.85`), אבל אף קורא לא מעביר `preferParks`. via-points עם `pass_through` (`request-builder.ts:57-59`). `round_trip` לא מקבל via-points.
- **אין אינדקס פארק→מסלול** (`route_adjacency` הוא מסלול↔מסלול, `schemas.ts:210-220`). חיפוש "ליד פארק" רץ בזמן אמת על ≤200 מסלולים (`inventory.service.ts:793`).

**ההגדרה החדשה, שלב אחר שלב:**
1. **מקור הפארקים:**
   - (א) שכבות גנים עירוניות כשיש. ת"א שכבה 551 עם `shetach_gan` (§2.1 #9); באר שבע `urban-nature-br7` (#8).
   - (ב) OSM `leisure=park` / `leisure=nature_reserve` / `landuse=recreation_ground` (פוליגון או relation).
   - (ג) **סף גודל:** ≥ 80 דונם (80,000 מ"ר) **או** היקף ≥ 1.2 ק"מ (אושר ע"י דוד 21.10.2026; קודם נכתב כאן בטעות "8 דונם"). דוגמה לסדר גודל: פארק הירקון מאות דונמים; ספורטק נמצא בתוך פוליגון הירקון/שטח הספורט ⚠️ לאמת מול OSM.
   - (ד) מיזוג פוליגונים צמודים עם אותו שם (פארק הירקון מחולק ב-OSM לכמה חלקים ⚠️).
2. **מועמדי לולאה לכל פארק,** לפי סדר עדיפות:
   1. **לולאה ידועה קיימת** — מסלול מאושר/מאגר (§2.1) או relation OSM שרובו בתוך הפוליגון ⇒ להשתמש בו, לא לחולל.
   2. **לולאת היקף** — כמו צינור A (`buildLoop`), על שבילים בפועל ולא על הקו המתמטי של הגבול: snap ל-footway/path שבתוך באפר 30 מ' מהגבול.
   3. **לולאה פנימית** — GraphHopper via: כניסה ⇒ 2-4 נקודות על שבילים פנימיים בפיזור זוויתי ⇒ כניסה, עם `preferParks` (הפוליגון) ו-`priority ×0.3` מחוץ לפארק. best-of-N, ציון route-quality.
   4. **הרחבה לאורכים** — לולאה פנימית + "שמיניות" (2 לולאות מאותה כניסה) ל-3/5/8 ק"מ.
3. **מתקני כושר כעצירה אופציונלית:** אחרי שהלולאה נבחרה — `resolveRouteStops` (POI ≤180 מ', `route-stops.service.ts:32`) מסמן מתקנים על הלולאה. **לא משנה את הגאומטריה.**
4. **אינדקס:** כל לולאה נשמרת עם `parkRef{source, id, name}` (ולא `visitingParkId`, ששמור לפארקי כושר — `route.types.ts:678`), כדי שמסך פארק יציג "לולאות כאן" בלי חישוב בזמן אמת.

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

**סדר המקורות לכל רשות (גרסה 2):**

| שלב | מקור | נכנס כ- | `source.type` |
|---|---|---|---|
| 1 | מאגר עירוני/ממשלתי לאותה רשות (§2.1 #2-9, #15 כשהרשות נותנת קובץ) | `official_routes` pending, `origin:'dataset_import'` | `municipal_open_data` / `mot_open_data` |
| 2 | OSM relations מסומנים (הליכה/ריצה/אופניים/MTB) + טיילות בעלות שם | pending, `origin:'osm_import'` | `osm` |
| 3 | לולאות סביב פארקים גדולים (§2.5), קודם לולאות ידועות | pending, `origin:'park_loop'` | `osm` + `generated` |
| 4 | **רק אם המכסה לא התמלאה** (§3.7): מחולל לולאות שכונתיות (route-assembly של B / GH) | pending, `origin:'generated'` | `generated` |

**דה-דופליקציה בין שלבים:** Jaccard על מקטעים ≥0.8 (כמו ב-B, `TRAILS-PILOT-SHAAR-HANEGEV.md:102`), או חפיפת באפר 15 מ' ≥70% לגאומטריה שלא באה מהגרף. אם יש כפילות, נשאר המקור בשלב המוקדם יותר.

**ייבוא מאגר (שלב 1):** פונקציה טהורה אחת לכל פורמט: SHP/GeoJSON/ArcGIS-query ⇒ קווים ב-WGS84 (ITM⇒WGS84 דרך `proj4`). אחריה snap לגרף המקטעים של B (כדי לקבל גובה, משטח וצורה כמו כל מסלול אחר), ואז `buildValidatedDoc`. הקווים של משרד התחבורה הם **קטעי תשתית**, לא מסלולים: מרכיבים אותם לשדרות רציפות בעלות שם (stitching כמו ב-A) ומשאירים רק שדרות ≥2 ק"מ.

### 3.2 גלים (PR קטן לכל אחד)

| גל | מה | קבצים עיקריים | גודל | תלות |
|---|---|---|---|---|
| **W0** | תיקוני היגיינה: למחוק/לנעול את `import-osm-routes-tlv.ts` (כותב כברירת מחדל, בלי chokepoint); לתקן את `CITY-MAPPING-PIPELINE-ARCHITECTURE.md:31` המיושן; `CITY-MAPPING-PIPELINE-ARCHITECTURE.md:95` (`'moderate'`) כבר לא רלוונטי — `src/lib/route-collections/schemas.ts:11,152` חוסם אותו; לסמן כסגור | scripts, docs | S | — |
| **W1** | A על PBF + Copernicus + שדות `provenance`/`license` (כמו B, `firestore-docs.ts:127-138`) | `geo-discovery-routes.ts`, `pilot-osm.node.ts` (לחלץ ל-`scripts/lib/`) | M | החלטה פתוחה 3 |
| **W1.5 (חדש)** | **ייבוא מאגרים** (שלב 1 ב-§3.1): `src/lib/dataset-import/` — קוראי SHP/GeoJSON/ArcGIS-query, ITM⇒WGS84, stitching לשדרות, snap לגרף, `source`/`attribution` לכל מאגר. פיילוט: אופנידן (#3) + ת"א 577 (#9) + באר שבע (#7) | `src/lib/dataset-import/*`, `scripts/routes-nationwide/import-dataset.ts` | M | אימות רישוי (שאלה 11) |
| **W2** | **ציון אחיד** `routeScore` (§3.3), כולל רכיב "מקור רשמי" ו-**בחירת top-N למכסה** (§3.7) — פונקציה טהורה + backfill dry-run | `src/lib/route-score/` חדש, `scripts/backfill-route-score.ts` | M | W1 רצוי |
| **W3** | **runner ארצי** (§3.4) — מקורות לפי הסדר, נעצר כשהמכסה מלאה | `scripts/routes-nationwide/run.ts` | M | W1, W1.5, W2 |
| **W4** | תור סקירה לפי עיר (§3.5): מיזוג #138 (rebase), תצוגת "הסט המוצע לעיר X" (N מסלולים + ממתינים), מיון לפי `routeScore` | `approval-center/*`, `RouteShapeReviewTab.tsx` | M | W2 |
| **W5** | **שכבת פארקים גדולים + לולאות סביב פארק — offline** (§2.5): בחירת פארקים (OSM + שכבות עירוניות, סף גודל), לולאה ידועה ⇒ היקף ⇒ פנימית (GH via + `preferParks`), עצירות כושר אופציונליות, `parkRef` | `src/lib/park-loops/*`, `scripts/routes-nationwide/park-loops.ts`, `src/lib/routing/loops/candidates.ts` (מועמד `park_via`) | M | W1, GH זמין (`fix/graphhopper-infra-scripts`) |
| **W6** | **לולאה סביב פארק — חי**: `mode:'park_loop'` ב-`/api/routes/generate` (פארק נבחר ⇒ קודם לולאות מאושרות שלו, ואם אין, via בתוך הפוליגון). **לא** משנה את `eligible.ts`/`includeStrength` של פארקי הכושר | `api-contract.ts`, `loop-service.ts`, מסך פארק — מאחורי דגל חדש | M | W5, GH דלוק |
| W7 (אופציונלי) | חיווט B כשלב בפאנל (`runBuildSegmentGraph`/`runImportNamedRoutes` כבר מיוצאים) ו-composition/גובה כשלבים, לפי `CITY-MAPPING-PIPELINE-ARCHITECTURE.md:42-62` | orchestrator | L | — |

**סטטוס W1 (RC6 שלב 4, 21.10.2026):** בוצע.
- **מקור ה-OSM:** geo-discovery קורא עכשיו את ה-PBF המקומי (`--osm-source=pbf`, ברירת המחדל ב-CLI) דרך `scripts/lib/osm-pbf.node.ts`. זה קורא משותף שחולץ מ-`pilot-osm.node.ts`.
- **אותן שאילתות:** אותן שאילתות QL נענות מקומית על ידי `src/lib/osm-local` (מפרש Overpass מקומי), בלי שינוי בשלבי הגילוי.
- **הפונקציה בענן:** קוראת snapshot אזורי מוכן מראש מ-Storage (`osm/regions/v1/<region>.json.gz`, נבנה ב-`scripts/routes-nationwide/build-osm-region-snapshot.ts`). כשאין snapshot היא חוזרת ל-Overpass.
- **גובה:** Copernicus GLO-30 במקום Mapbox Terrain-RGB.
- **מסמכי המסלול:** כל מסמך נושא `provenance` ו-`attribution`.

### 3.3 מדד ציון (`routeScore`, 0-100) — שימוש חוזר במדדים קיימים בלבד

| רכיב | משקל | מקור קיים | חישוב |
|---|---|---|---|
| איכות משטח/הרכב | 25 | `qualitySignals.composition` | `genuinePct` + ½·`ordinaryPct` (רחוב שקט), עונש על `otherPct` |
| גאומטריה | 20 | `geometryMetrics` + route-quality v1 (`retracedPct`, U-turns, compactness — רק ללולאות) | ספי `acceptance.ts:4-11`; קווי/חד-כיווני לא נענשים על compactness (טיילת לגיטימית, כמו ב-shape-review) |
| בטיחות | 15 | `majorRoadPct`, `crossings.unmarkedPerKm` (`major-roads.ts`) | ספים קיימים |
| מקור/רשמיות | 15 | `source.type` + כוכבי prior של B (`operator` itc/kkl/inpa + שם רשמי) | מאגר עירוני/ממשלתי או שביל מסומן ⇒ 15; relation OSM בעל שם ⇒ 12; טיילת/פארק בעל שם ⇒ 10; stitched ⇒ 6; מחולל ⇒ 3 |
| נוחות | 15 | `qualitySignals.amenities.has`, `qualitySignals.lighting.litCoveragePct` | מים/ספסל/תאורה; צל — כשיהיה (RC2) |
| חוויה/נעימות | 10 | חלק בתוך פארק/ירוק/חוף (`PilotContext.green/parks`, `scripts/trails/lib/pilot-context.ts`), נוף (כמו כוכבי B), אורך 2-15 ק"מ | בונוס קטן (≤2) לעצירת מתקן כושר על המסלול, לא יותר. מתקן כושר הוא תוספת, לא מטרה |

- `confidence` נפרד: כמה מהרכבים חושבו בפועל (מסלול בלי תאורה/מתקנים מקבל ציון חלקי עם confidence נמוך, לא אפס).
- ירוק (≥75 ו-confidence ≥0.8 ו-certificate approve) ⇒ מועמד לאישור-קבוצה; צהוב ⇒ סקירה; אדום (<40 או drop) ⇒ ארכיון אוטומטי **רק אחרי** שדוד מאשר את הכיול.
- **בחירת הסט לעיר (גרסה 2):** הציון לא רק מסנן, הוא **בוחר**. בכל רשות ממיינים לפי `routeScore`, ובוחרים top-N לפי המכסה (§3.7) עם **גיוון**: לכל היותר 2 מסלולים לאותו פארק או טיילת, פיזור בין שכונות (רשת 1 ק"מ), תמהיל אורכים (קצר / בינוני / ארוך), ולפחות מסלול אופניים אחד אם יש מאגר. מה שלא נבחר **לא** נכנס כ-pending, כדי לא להציף את התור. אפשרות א: נשאר רק בקובץ ה-dry-run. אפשרות ב: נשמר כ"מועמד" מוסתר. ⚠️ ל-`official_routes` אין היום מצב כזה (בשימוש: pending, published, archived — `moderation.service.ts:14-19`). לכן אפשרות ב דורשת שדה נפרד (למשל `selection:'candidate'` עם `published:false`), לא ערך status חדש (שאלה 13).
- **כיול:** מריצים על ~100 המסלולים שכבר נסקרו ידנית ב-shape-review (`shapeTrainingReview.decision`, `route-shape-review.service.ts:17-40`) — זו קבוצת אימות מוכנה. פארק המסילה הוא בדיקת עוגן (צריך לצאת ירוק).
- **ODbL:** הציון הוא העשרה שלנו. לפי ההמלצה ב-`TRAILS-PILOT-SHAAR-HANEGEV.md:110`, לשקול לשמור אותו באוסף נפרד (`route_scores/{routeId}`) ולא בתוך המסמך הנגזר מ-OSM (שאלה פתוחה 4).

### 3.4 Runner ארצי — עיצוב

`scripts/routes-nationwide/run.ts` — **סקריפט שדוד מריץ** לכתיבה לפרודקשן; agents מריצים רק dry-run ואמולטור.

- **קלט:** רשימת רשויות מ-`authorities` (קריאה בלבד) + `adminRelationId`/`city_registrations`; `--only=<ids>`, `--kind=municipal|regional`, `--limit=N`.
- **סדר מקורות ומכסה:** שלבים 1⇒4 של §3.1. אחרי כל שלב: ציון, ואם יש כבר N מסלולים "ירוקים" לפי §3.7 — לא ממשיכים לשלב הבא (ובמיוחד לא מחוללים).
- **מקור OSM יחיד:** PBF של Geofabrik (תאריך אחד לכל הריצה = snapshot), osmium extract לכל רשות לפי relation. אריחי Copernicus כבר מוגדרים לכל הארץ (`ISRAEL_COPERNICUS_TILES`).
- **load-safe:** רשות אחת בכל פעם, ללא מקביליות (מכונה 16GB; PBF 120MB, אריחי DEM ~315MB במטמון). `--pause-ms` בין רשויות. בלי Overpass בכלל ⇒ אין rate-limit חיצוני.
- **אידמפוטנטי:** מזהים דטרמיניסטיים (כמו B); create-only ל-`official_routes` (לא דורס מסלול שנערך/אושר בפאנל — `geo-discovery-routes.ts:2216-2218`); checkpoint `scripts/output/nationwide-<date>/checkpoint.json` — ריצה חוזרת ממשיכה מהרשות האחרונה.
- **chokepoint:** כל כתיבה דרך הפונקציות הקיימות (`runGeoDiscovery` / `trails-apply.node.ts`) ⇒ `buildValidatedDoc`. ה-runner עצמו **לא כותב** ל-route collections ⇒ לא צריך להיכנס ל-`AUTHORIZED_ROUTE_WRITERS`.
- **שערים:** רשות בלי `authorityId` חד-ערכי ⇒ דילוג + דיווח (§23 axiom). `TARGET:` מודפס ראשון, `YES` מוקלד, `--project appout-1` + מפתח תואם (העתקה של המעקות מ-`trails-apply.node.ts`).
- **בלעדיות:** נעילה `city_mapping_runs/{authorityId}_routes` (המסמך המוצע ב-`CITY-MAPPING-PIPELINE-ARCHITECTURE.md:86`) — גם סוגר את באג ריצות-ערד-המקבילות.
- **פלט:** `summary.json` לכל רשות: נוצרו / קיימים / דולגו / ירוק / צהוב / אדום / **נבחרו לסט (N מתוך מכסה)** / מקור לכל נבחר. ובנוסף סיכום ארצי. **כתיבה:** רק הסט הנבחר נכנס כ-pending. השאר נשאר בקובץ ה-dry-run, או כמועמד מוסתר אם דוד יבחר בזה (שאלה 13).
- **סדר הרצה מומלץ:** רשויות לקוחות ⇒ 10 ערים גדולות ⇒ מועצות אזוריות ⇒ השאר.
- **מיקום עתידי:** לפי העיקרון הנעול (`CITY-MAPPING-PIPELINE-ARCHITECTURE.md:20`) — הלוגיקה בפונקציה `runNationwideRoutes(authorityIds, apply, db)` שהפאנל יוכל לקרוא לה בהמשך; ה-CLI הוא עטיפה דקה.

### 3.5 סקירה אנושית (לפי עיר, סט קטן)
1. dry-run ⇒ דוד מקבל לכל רשות את **הסט המוצע** (8-40 מסלולים, §3.7) על מפה אחת, עם ציון, מקור וסיבה לכל מסלול, ורשימה קצרה של "הבאים בתור".
2. apply ⇒ רק הסט נכתב כ-pending/`published:false`.
3. מרכז האישורים (W4) — תצוגה "עיר X": הסט כרשימה, אישור/דחייה לכל מסלול (בסט של 8-40 אין צורך באישור-קבוצה), החלפה ב"הבא בתור" בלחיצה, ושדה "חסר משהו" (טיילת/פארק שדוד מכיר ולא נמצא — הופך למשימת ייבוא ידנית).
4. כל החלטה ⇒ `shapeTrainingReview` ⇒ חוזר לכיול הציון.
5. **זמן:** ~250 רשויות × ~20 מסלולים × ~20 שנ' ≈ 28 שעות לכל הארץ, ופחות מחצי שעה לעיר. אפשר לפרוס לפי סדר ההרצה (לקוחות קודם).

### 3.6 עלויות (הערכה)
- **נתונים:** OSM + Copernicus — חינם (קרדיט חובה, כבר מוצג: `route-attribution.ts`, `RouteDetailSheet.tsx:1078`).
- **GraphHopper:** כבר משולם, ~50-70$/חודש (`infra/graphhopper/README.md:120-131`). batch W5 (נניח ~1,500 פארקים גדולים ארצית ⚠️ הערכה × ~3 אורכים × ~8 קריאות) ≈ 36k קריאות בשעות שקטות ⇒ זניח (<5$).
- **מאגרים ממשלתיים/עירוניים:** חינם (CC-BY / פתוח), קרדיט חובה. צריך להוסיף אותם ל-`route-attribution.ts` ולמסך "מקורות מידע".
- **Firestore:** עם מכסות (§3.7): ~250 רשויות × ~15 בממוצע ≈ 4k מסלולים ב-`official_routes`, + מקטעי שבילים לכל מועצה אזורית (שער הנגב לבד: 4,001) ⇒ סדר גודל 4k מסלולים + 200-400k מקטעים ⇒ כתיבות ~0.5M פעם אחת ≈ 1$; אחסון `trail_segments` עם `geometry` — מאות MB ⇒ כמה $/חודש. ריצה חוזרת = 0 כתיבות (contentHash).
- **Mapbox:** חוסכים — GH מחליף את Directions; אין שימוש ב-Mapbox לגובה שמור.
- **זמן אנושי:** הסקירה היא העלות האמיתית. עם מכסות: ~28 שעות לכל הארץ (§3.5), מפוזר על שבועות. בלי מכסות (גרסה 1): ~10k מסלולים, ~55 שעות.

### 3.7 מכסות — איכות על פני כמות (חדש, גרסה 2)

**כלל:** מספר קטן של מסלולים טובים לכל רשות, לפי גודל. המכסה היא **תקרה**: אם אין מספיק מסלולים ירוקים, הסט יוצא קטן יותר, ולא מתמלא במחוללים בינוניים.

| גודל רשות (תושבים, ⚠️ לפי הלמ"ס, לאמת) | דוגמאות | מכסה מוצעת | מתוכם לולאות פארק | מתוכם אופניים |
|---|---|---|---|---|
| עיר גדולה (≥200k) | ירושלים, ת"א-יפו, חיפה, ראשל"צ, פ"ת, אשדוד, נתניה, ב"ש | **25-40** | 6-10 | 4-8 |
| עיר בינונית (70k-200k) | הרצליה, כפר סבא, רעננה, מודיעין, רמת גן | **15-25** | 4-6 | 2-4 |
| עיר קטנה / מועצה מקומית (<70k) | זכרון יעקב, ערד, שדרות, קרית אונו | **8-15** | 2-4 | 0-2 |
| מועצה אזורית | שער הנגב, מטה יהודה | **10-20** (בעיקר שבילי שטח מסומנים) | 0-3 | 2-5 (MTB) |

- **מינימום איכות:** רק `routeScore ≥ 70` נכנס לסט, בלי יוצא מן הכלל. מסלול עם שם רשמי ממאגר ובציון 55-70 מסומן "לסקירה ידנית", לא נבחר אוטומטית.
- **מסלולים קיימים נספרים במכסה:** חיפה (70 pending) והרצליה כבר מעל המכסה. בהן ה-runner לא מוסיף, אלא מציע **צמצום**: מדרג את הקיים ומסמן top-N.
- **ארצית:** ~250 רשויות ⇒ סדר גודל 3,000-5,000 מסלולים, לעומת 10k ומעלה בגרסה 1.
- המספרים הם הצעה ראשונית לכיול (שאלה פתוחה 13).

### 3.8 מי מריץ מה

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
| `fix/loop-orientation-chaining-v2` (`/Users/calisthenicsltd/Development/appout-routes`, `feffb40e`) | שרשור/כיוון לולאות | ייתכן חפיפה עם `loops/candidates.ts` / `route-generator.service.ts` ב-W5/W6 | לבדוק diff לפני W5 |
| `feat/route-quality-phase01`, `feat/graphhopper-routing(-main)` | — | כבר squash-merged (#480, #489) | ענפים ישנים, אפשר לנקות |
| worktrees של `perf-route-stops-*`, `feat-route-stops-card-time` | `route-stops.*`, היברידי | בגרסה 2 W5/W6 **לא** משנים את `eligible.ts` או את `includeStrength`; רק `resolveRouteStops` נקרא לקריאה בלבד לעצירות אופציונליות | אין התנגשות צפויה; לא לגעת ב-`composeHybridPlan` |
| CLAUDE.md, חוב פתוח 2 (`route-stops.generator.ts`) | — | W5 לא נוגע במנוע ההצעות המאוחד | — |

---

## 5. שאלות פתוחות לדוד

> התשובות לגרסה 1 עוד ממתינות. השאלות 6-7 עודכנו לפי ההבהרות של 21.10, ו-11-14 חדשות. ליד כל שאלה מופיעה ההמלצה שלנו.

1. **כמה רשויות ומסלולים יש בפרודקשן היום** (published/pending לפי עיר)? המסמך גזר את זה מקוד בלבד. *המלצה:* שאילתת קריאה אחת לפני W3.
2. **שער הנגב:** להריץ את ה-`--apply` של הפיילוט לפרודקשן (§8 במסמך הפיילוט) לפני ההרחבה, או לדלג ישר ל-runner? *המלצה:* לדלג ישר ל-runner. הפיילוט יוצר 49 מסלולים, מעל המכסה של מועצה אזורית.
3. **Overpass → PBF ל-geo-discovery (W1):** מאושר? זה משנה את ה-Cloud Function worker (vendor copy) ואת הגובה (Mapbox→Copernicus), ואחרי זה צריך backfill לגובה הקיים. *המלצה:* כן.
4. **איפה הציון נשמר:** בתוך `official_routes` או באוסף נפרד `route_scores`? *המלצה:* `route_scores`, כדי להישאר נקי מה-share-alike של ODbL.
5. **אישור-קבוצה:** *המלצה (עודכנה):* בסט של 8-40 לעיר אין צורך. אישור אחד-אחד מתוך תצוגת העיר.
6. **לולאות סביב פארק — offline, חי, או שניהם?** *המלצה:* קודם offline (W5): לולאות קבועות לפארקים הגדולים, נסקרות פעם אחת. החי (W6) אחר כך.
7. **(עודכן) סף "פארק גדול":** ≥ 80 דונם (80,000 מ"ר) או היקף ≥ 1.2 ק"מ? רשימת פארקים שחייבים להיכנס (ספורטק, הירקון, ...)? *המלצה:* הסף הזה, ו-5-10 פארקי עוגן לכיול ממך.
8. **מקורות בהסכם:** לפנות לחלה"ט/ועדת השבילים, קק"ל (סינגלים) ורט"ג לקבלת נתונים (B2G)? *המלצה:* כן, במקביל. בינתיים OSM מכסה את הסימונים. Strava, Trailforks וכו' — לא, בגלל תנאי השימוש.
9. **"הקפת פארק המסילה" כעוגן כיול:** מסכים שזה "ירוק"? יש עוד 2-3 מסלולים טובים או גרועים לכיול?
10. **סדר הרצה:** רשויות לקוחות קודם? מי ברשימה? (`.claude/knowledge/product-context.md` לא נגיש מ-worktree.) *המלצה:* לקוחות ⇒ ערים גדולות ⇒ מועצות אזוריות.
11. **(חדש) רישוי "Other (Open)" ב-data.gov.il** (תשתית רכיבה קיימת, באר שבע) ותנאי ה-GIS של ת"א: מישהו בודק את התנאים לשימוש מסחרי, או שנפנה לבעלי המאגרים? *המלצה:* להתחיל ממאגרי CC-BY (אופנידן, ירושלים) ומ-OSM. את השאר — אחרי אישור כתוב.
12. **(חדש) לבקש מרשויות לקוחות קבצי טיילות, גנים ושבילים?** נתיב F (`/admin/routes`, GeoJSON/Shapefile) כבר קיים. *המלצה:* כן — זה המקור הכי מדויק לעיר, ובאחריות הרשות.
13. **(חדש) מכסות (§3.7):** הטווחים מקובלים? ומה עושים עם מה שלא נבחר — לא לשמור בכלל, או לשמור כ-`candidate` מוסתר? *המלצה:* הטווחים כפי שהם, ו-`candidate` מוסתר כדי שתוכל להחליף מסלול בלחיצה.
14. **(חדש) ערים שכבר מעל המכסה** (חיפה, הרצליה): לצמצם את ה-pending הקיים ל-top-N, ולהעביר את השאר ל-`candidate`? *המלצה:* כן, אחרי שתאשר את הציון על עוגני הכיול.
