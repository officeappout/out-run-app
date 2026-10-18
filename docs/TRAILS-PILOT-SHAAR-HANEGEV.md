# פיילוט שבילים ארצי — מועצה אזורית שער הנגב (dry-run)

**סטטוס:** נבנה 18.10.2026, **dry-run בלבד — שום דבר לא נכתב לפרודקשן**. אין בקוד הזה נתיב כתיבה ל-Firestore/Storage; `--apply` מסורב במפורש עד שדוד מאשר את §6 ("מה `--apply` היה כותב").
**מקורות:** OSM — Geofabrik `israel-and-palestine` (חותמת נתונים `2026-10-17T20:20:51Z`), גבולות: relation `1473954` (`admin_level=8`, "מועצה אזורית שער הנגב"). גובה — Copernicus DEM GLO-30.

---

## 1. מה נבנה

| # | רכיב | קובץ |
|---|---|---|
| 1 | ספק גובה Copernicus GLO-30 מאחורי ממשק `ElevationProvider` | `src/lib/dem-tile-cache/copernicus-glo30.ts` (טהור), `copernicus-glo30-cache.node.ts` (מטמון דיסק מקומי), `geotiff-float32-decode.node.ts` (קורא GeoTIFF בלי תלויות), `elevation-provider.ts` |
| 1 | פרופיל גובה מוחלק | `src/lib/dem-tile-cache/elevation-profile.ts` — דגימה כל 15 מ' (מוגבל 10–20), median filter (5 דגימות), hysteresis ≥3 מ' לעליות/ירידות, maxGrade על חלון ≥50 מ' בשני הכיוונים |
| 2 | בונה גרף מקטעים | `scripts/trails/build-segment-graph.ts` + `src/lib/trail-graph/segment-graph.ts`, `tags.ts`, `osm-opl.ts`, `geo.ts` |
| 3 | מייבא מסלולים מסומנים + מחולל לולאות | `scripts/trails/import-named-routes.ts` + `src/lib/trail-graph/route-assembly.ts`, `naming.ts`, `difficulty.ts`, `route-stats.ts` |
| 4 | המסמך הזה + סיכומי ה-dry-run | `docs/trails-pilot/shaar-hanegev-*.json` |

**הרצה (מקומית, קוראת רק מידע ציבורי):**
```bash
brew install osmium-tool            # פעם אחת
npx tsx scripts/trails/build-segment-graph.ts     # → .trails-out/shaar-hanegev/segments.json
npx tsx scripts/trails/import-named-routes.ts     # → named-routes.json, generated-routes.json, summary.json, apply-plan.json
```
שני הסקריפטים מקבלים `--relation=<OSM admin relation> --area=<slug>` — אותו קוד לכל רשות. ריצה מלאה: ~10 שניות. ההורדות (PBF של 120MB, 9 אריחי DEM של ~315MB לכל ישראל כולל יו״ש, גולן ואילת) נשמרות ב-`.cache/` (ב-`.gitignore`, **אף פעם לא בקומיט**); הפלטים ב-`.trails-out/` (גם הוא ב-`.gitignore`). שתי ריצות רצופות נותנות `summary.json` זהה (נבדק).

**למה PBF ולא Overpass:** ב-18.10 כל שלושת שרתי ה-Overpass הציבוריים החזירו 502/500 על שאילתה טריוויאלית. ה-PBF הוא הורדה אחת, מתוארכת, ניתנת לשחזור, ואותו קוד עובד לכל הארץ. החיתוך וההמרה ל-OPL נעשים ב-`osmium` (כלי CLI מערכתי — אין בתלויות של `package.json` parser של PBF; `tiny-osmpbf`/`pbf` קיימים ב-`node_modules` רק כתלויות "extraneous" ולא בטוח להסתמך עליהם).

---

## 2. מספרים (dry-run)

| מדד | ערך |
|---|---|
| דרכי OSM שנכללו (ב-bbox של המועצה + 1.5 ק״מ) | 10,317 |
| **מקטעים בתוך גבול המועצה** | **4,001** (832.8 ק״מ) |
| מקטעים עם גובה Copernicus | 100% |
| אורך שחבר בלפחות relation של מסלול | 15.4% |
| **מסלולים מסומנים (OSM relations)** | **23** (16 הליכה, 7 אופניים; 15 `itc`, 5 `kkl`, 1 עמותת גולני, 2 ללא operator) |
| כפילויות שאוחדו (Jaccard ≥ 0.8) | 0 |
| relations שנפסלו (פחות מ-300 מ' בתוך המועצה) | 1 |
| **% עם שם רשמי ב-OSM** | **43.5%** (10/23) |
| שם "צבע + מספר + טופונים" | 10 |
| שם לפי נקודות קצה | 1 |
| **% `needsName`** | **8.7%** (2/23) |
| **מסלולים מחוללים מהגרף** | **26** (18 לולאות, 8 הלוך-חזור) מ-12 יישובים |
| קושי — מסומנים | 18 קל · 3 בינוני · 2 קשה |
| קושי — מחוללים | 22 קל · 4 בינוני |

**כיסוי תגיות (לפי אורך):** סוג דרך — track 71.3%, service 9.1%, residential 6.8%, path 6.7%, footway 3.9%, cycleway 2.2%. משטח — `surface=*` אמיתי רק ב-1.6%, `tracktype` ב-7.6%, ברירת מחדל לפי סוג הדרך ב-90.8% (כל מקטע נושא `surfaceConfidence` כדי שה-UI/פאנל יבדילו עובדה מברירת מחדל). תאורה — אין אף `lit=*` ויש 4 פנסי רחוב בכל ה-bbox: 86.4% "לא מואר" (ברירת מחדל מחוץ לשטח בנוי), 13.6% "לא ידוע" (בתוך יישובים). **אף מקטע לא סומן "מואר" בניחוש.**

---

## 3. מדגם של 15 מסלולים

10 המסומנים המדורגים גבוה + 5 מחוללים. `maxGrade` = שיפוע מקסימלי מתמשך על ≥50 מ', **במקטעים מחוץ לשטח בנוי** (ראו §5 על DSM).

| שם | operator | פעילות | צורה | ק״מ | עלייה (מ') | maxGrade % | קושי (NPS R) | ★ | מקור השם |
|---|---|---|---|---|---|---|---|---|---|
| דרך נוף נחל שקמה | itc | הליכה | linear | 27.1 | 214.6 | 9.4 | hard (154.1) | 4.5 | osm_name |
| רוחמה דורות קצר | kkl | אופניים | linear | 14.8 | 84.1 | 11.1 | medium (71.3) | 4.5 | osm_name |
| סינגל גברעם | kkl | אופניים | linear | 1.3 | 6.6 | 6.6 | easy (5.8) | 4 | osm_name |
| שביל גולני | עמותת חברי גולני | הליכה | linear | 33.0 | 288.8 | 12.2 | hard (197.1) | 3.5 | osm_name |
| שיקמה סובב צפוני | kkl | אופניים | linear | 8.7 | 114.3 | 7.6 | medium (63.5) | 3.5 | osm_name |
| סובב ברור חיל | kkl | אופניים | linear | 7.8 | 52.6 | 14.4 | easy (41.0) | 3.5 | osm_name |
| שביל ירוק · בוסטר | itc | הליכה | linear | 4.5 | 71.8 | 8.2 | easy (36.2) | 3.5 | צבע+טופונים |
| סינגל נחל משלים | kkl | אופניים | linear | 4.0 | 19.8 | 6.2 | easy (18.0) | 3.5 | osm_name |
| שביל שחור · חורבת זדים | itc | הליכה | linear | 4.0 | 62.0 | 9.8 | easy (31.6) | 3.5 | צבע+טופונים |
| דרך נוף ניר משה | itc | הליכה | linear | 3.6 | 64.1 | 8.0 | easy (30.6) | 3.5 | osm_name |
| הלוך-חזור מאור הנר · נחל שקמה · 2.2 ק״מ | — | הליכה | out_and_back | 2.2 | 19.3 | 7.3 | easy (13.1) | 1.5 | מחולל |
| לולאת אור הנר · נחל נירעם · 6.8 ק״מ | — | הליכה | loop | 6.8 | 57.5 | 10.9 | easy (40.0) | 2 | מחולל |
| לולאת ארז · 2.4 ק״מ | — | הליכה | loop | 2.4 | 23.4 | 0 | easy (15.1) | 0.5 | מחולל |
| הלוך-חזור מארז · 3.2 ק״מ | — | הליכה | out_and_back | 3.2 | 19.9 | 3.4 | easy (16.0) | 1 | מחולל |
| לולאת ברור חיל · 2.4 ק״מ | — | הליכה | loop | 2.4 | 6.3 | 3.4 | easy (7.9) | 0.5 | מחולל |

הנתונים המלאים: `docs/trails-pilot/shaar-hanegev-summary.json` (כאן בגיט) ו-`.trails-out/shaar-hanegev/*.json` (מקומי, כולל גיאומטריה).

---

## 4. הכללים (מתועדים כדי שאפשר יהיה לכוונן)

**מקטע:** שרשרת מקסימלית של דרכי OSM בין צמתים שלאורכה לא משתנה שום דבר שמשפיע על המאפיינים (highway/surface/tracktype/lit/sac/mtb/name/access/osmc) **וגם לא החברות במסלולים**. לכן כל מסלול מסומן הוא איחוד מדויק של מקטעים. נכללים: `path, track, footway, cycleway, bridleway, steps, pedestrian, living_street, residential, service`; לא נכללים `access=private/no` (אלא אם `foot=yes`), `foot=no`, `area=yes`, `indoor`, בנייה, `service=parking_aisle/driveway/drive-through/emergency_access`.
> **סטייה מהבריף:** `highway=service` נוסף. בלי זה רוב היישובים לא היו מחוברים לשבילים סביבם (כבישי הקיבוץ הפנימיים ודרכי הגישה החקלאיות ממופים כ-service — 2,389 דרכים ב-bbox). בלי service: 22 מסלולים מחוללים, 3 יישובים בלי אף מסלול; עם service: 26.

**משטח:** `surface` → `tracktype` (grade1 אספלט, grade2 כורכר, grade3–5 עפר) → ברירת מחדל לפי סוג הדרך (track/path מחוץ ליישוב = עפר; residential/cycleway = אספלט; footway ביישוב = ריצוף; אחרת `unknown`). `surfaceConfidence` = `osm_surface | osm_tracktype | highway_default`.

**תאורה:** `lit=*` של OSM → פנסי רחוב (≥60% מנקודות המקטע במרחק ≤30 מ' מ-`highway=street_lamp`) → מחוץ לשטח בנוי: `no` עם `litSource: default_unlit_outside_built_up` → אחרת `unknown`. אין "מואר" בניחוש.

**שטח בנוי:** ≥50% מנקודות המקטע בתוך `landuse=residential` או פוליגון `place=*` (osmium מרכיב multipolygons).

**שמות (בלי LLM, דטרמיניסטי):**
1. `name:he` → `name` של ה-relation (מספר בלבד אינו שם).
2. צבע הסימון (`osmc:symbol`/`colour`) + `ref` + טופונים: "שביל אדום 9251 · נחל …". הטופונים = הדרך בעלת השם הארוכה ביותר במסלול, אחרת התכונה הטבעית/היסטורית בעלת שם הקרובה ביותר (≤1 ק״מ: נחל/ואדי, פסגה, מעיין, עמק, חורבה…).
3. עירוני (≥60% בנוי): "לולאת {פארק}" / "טיילת {שם}".
4. נקודות קצה: "{A} → {B}" (המקום בעל השם הקרוב ביותר לכל קצה, ≤1.5 ק״מ).
5. אחרת "מסלול {יישוב} #n" + `needsName: true`.
מחוללים: "לולאת {יישוב} · {X} ק״מ" / "הלוך-חזור מ{יישוב} · {X} ק״מ", עם "· {טופונים}" אם עוברים ≤300 מ' מתכונה בעלת שם.

**קושי:** נוסחת NPS/Shenandoah `R = √(2 × gain_ft × dist_mi)`: ‏<50 קל, 50–100 בינוני, >100 קשה. ואז **קפיצה אחת** (קל→בינוני, בינוני→קשה) אם יש לפחות אחד מ: maxGrade50m >15% (בשטח פתוח בלבד), `sac_scale ≥ demanding_mountain_hiking`, `mtb:scale ≥ 2`, `tracktype grade4/5`, משטח rock/scree — כל אחד נספר רק אם מכסה ≥100 מ' או ≥5% מהמסלול. **תקרה עירונית:** מסלול ≥80% בנוי לא יהיה "קשה". הפלט תמיד `'easy'|'medium'|'hard'` (ה-enum של `Route.difficulty`). בדקתי `'moderate'`: בתחום המסלולים הוא כבר מטופל (`schemas.ts` חוסם אותו, `route-difficulty.service.ts` ממפה נכון); ה-`'moderate'` שנשאר בקוד הוא `effortLevel` של אימוני ריצה — enum אחר, תקין, לא נגעתי.

**כוכבים (prior, 0–5, מעוגל ל-0.5):** מקור 0–2 (operator רשמי itc/kkl/rtg/inpa + שם רשמי 2 · רשמי בלי שם 1.5 · relation אחר 1 · מחולל 0.5) + נוף 0–1.5 (0.5×חלק מחוץ לבנוי + 0.5 אם תכונה טבעית בעלת שם ≤300 מ' + 0.5×חלק בתוך יער/פארק/שמורה/מטע) + שירותים 0–1 (0.25 לכל סוג ≤100 מ': מים, ספסל/פיקניק, מחסה, שירותים, תצפית) + הרכב 0–0.5 (0.5×חלק שבילים/דרכי עפר, −0.25 אם >50% רחובות). זו נקודת פתיחה עד שיהיו דירוגים אמיתיים.

**כפילויות:** Jaccard על קבוצות מזהי מקטעים ≥0.8 → נשאר הטוב (שם רשמי > צבע+טופונים > … > placeholder, ואז כוכבים). מחוללים שחופפים למסלול מסומן נזרקים.

**מחולל לולאות:** מכל יישוב (`place=village/town/hamlet` בתוך הגבול) מתחילים מצומת הגרף הקרוב (≤500 מ'). לכל יעד אורך (2.5/4/6/8 ק״מ) — נקודת סיבוב אחת לכל אחד מ-8 כיוונים במרחק L/3–L/2, הלוך במסלול הקצר, חזור במסלול הקצר כשמקטעי ההלוך מוענשים ×8; נשמרת לולאה של 2–8 ק״מ עם ≤25% חפיפה, ו-Jaccard <0.6 מול לולאות קודמות מאותו יישוב. אם אין לולאה — הלוך-חזור. עד 3 ליישוב.

---

## 5. רישוי וקרדיט — חובה לפני כל פרסום

- **OSM (ODbL 1.0):** קרדיט "© OpenStreetMap contributors" בכל מסך שמציג מסלולים/מקטעים (מסך מפה + מסך פרטי מסלול). כל מקטע ומסלול נושא `license: 'ODbL-1.0'`. **share-alike:** אוסף המקטעים/המסלולים ב-Firestore הוא *derived database* — אם נפיץ אותו (או "produced work" שמבוסס עליו לציבור), חייבים להציע את מסד הנתונים הנגזר עצמו תחת ODbL (למשל dump להורדה לפי בקשה). ה-UI באפליקציה = produced work (מותר, עם קרדיט). שילוב נתונים קנייניים שלנו *באותה טבלה* הופך אותם ל-ODbL — לכן ההמלצה: `trail_segments` נשאר טהור-OSM, וההעשרות שלנו (דירוגים, תמונות) בקולקציות נפרדות שרק מפנות למזהה.
- **Copernicus GLO-30:** חינמי, דורש קרדיט: `COPERNICUS_DEM_ATTRIBUTION` ב-`copernicus-glo30.ts` ("produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved"; גרסה קצרה `COPERNICUS_DEM_ATTRIBUTION_SHORT`).
- **Mapbox Terrain-RGB:** **לתצוגה בלבד.** תנאי Mapbox אוסרים חילוץ/שמירה של נתונים מהאריחים שלהם. `ElevationProvider.storable` הוא המעקה: `mapboxTerrainDisplayProvider()` הוא `storable: false` ו-`assertStorable()` זורק. **לא שיניתי** את הצינור הקיים (`geo-discovery-routes.ts`, `populate-route-elevation-tlv.ts`, `dem-tile-cache-admin.node.ts`, `dem-tile-fetch-live.node.ts`) שעדיין מפענח Terrain-RGB לגובה שנשמר — זה דורש החלטה + הרצה מחדש של backfill (ראו §7). `copernicusToElevationGrid()` כבר מייצר את אותו פורמט z/x/y של מטמון ה-DEM הקיים, כך שאפשר לחמם מחדש את המטמון מ-Copernicus בלי לשנות אף צרכן.
- **הסתייגות טכנית:** GLO-30 הוא **DSM** (כולל בניינים ועצים), לא DTM. בשטח פתוח בנגב זה זניח; בתוך יישובים "שיפועים" עלולים להיות גגות. לכן הקפיצה הטכנית על שיפוע סופרת רק מקטעים מחוץ לשטח בנוי (`maxGrade50mOpenPct`), וה-median filter מוריד קפיצות נקודתיות. העלייה הכוללת של לולאות פנים-קיבוציות עדיין עלולה להיות מוגזמת בכמה מטרים.

---

## 6. מה `--apply` היה כותב (לאישור דוד — לא מומש, לא הורץ)

גם `docs/trails-pilot/shaar-hanegev-apply-plan.json`. כרגע `--apply` יוצא עם קוד 2 והודעה, בלי שום קוד Firestore.

**קולקציה חדשה `trail_segments`** — 4,001 מסמכים, מזהה דטרמיניסטי `seg_<firstWayId>_<startNode>_<endNode>`:
`geometry` ({lng,lat}[]), `startNode`, `endNode`, `lengthM`, `elevation{provider,gainFwdM,gainRevM,maxGrade50mFwdPct,maxGrade50mRevPct,minEleM,maxEleM}`, `highwayClass`, `surface`, `surfaceRaw`, `surfaceConfidence`, `lit`, `litSource`, `sacScale`, `mtbScale`, `tracktype`, `colour`, `itcRef`, `name`, `inBuiltUp`, `osmWayIds`, `routeRelationIds`, `foot`, `bicycle`, `license`, `authorityId`, `source: "osm_geofabrik_v1"`, `osmTimestamp`, `updatedAt`.
→ דורש חוקי Firestore + אינדקסים חדשים (`authorityId`, ואולי geohash) — **לא נגעתי ב-`firestore.rules`/`firestore.indexes.json`**; צריך: קריאה ציבורית, כתיבה רק admin.

**`official_routes`** — 49 מסמכים חדשים (23 מסומנים + 26 מחוללים), מזהים `osm_rel_<id>` / `gen_<placeNodeId>_<n>`, **create-only** (מדלגים אם המזהה קיים), `status: 'pending'`, `published: false` — כלומר נכנסים למרכז האישורים ולא לאפליקציה עד שדוד מאשר, בדיוק כמו `geo-discovery-routes.ts`. שדות: `name`, `distance` (ק״מ), `duration` (דק', לפי קצב הפעילות), `difficulty` (`easy|medium|hard`), `type` (`walking|cycling`), `path`, `routeShape`, `surfaceType` (הדומיננטי), `elevationGain`, `maxGrade`, `authorityId`, `city`, ועוד אובייקט `trail{kind,nameSource,needsName,segmentIds,segmentForward,stars,difficultyBreakdown,osm,license,attribution}`. הכול יעבור דרך `buildValidatedDoc` (Zod) הקיים.

**שאלות פתוחות לדוד לפני apply:**
1. **מסלולים לינאריים:** כל 23 המסומנים יצאו `linear` (A→B, או חתוכים בגבול המועצה). ל-`Route.routeShape` יש רק `loop|out_and_back`. אפשרויות: (א) להוסיף `'linear'` ל-enum (שינוי סכמה + UI), (ב) לשמור כ-`out_and_back` עם מרחק כפול, (ג) לשמור את המרחק החד-כיווני ולהוסיף `trail.oneWay: true`. ההמלצה שלי: (ג).
2. **מסלולים חתוכים:** 12 מסלולים (`clippedToPilotArea: true`) ממשיכים מחוץ למועצה (למשל שביל גולני, דרך נוף נחל שקמה). בפיילוט הם חתוכים לגבול; בהרצה ארצית הם יתחברו. להעלות חתוכים עכשיו, או לחכות להרצה הארצית?
3. `authorityId` של שער הנגב בקולקציית `authorities` — לא קראתי מפרודקשן; צריך מיפוי relation 1473954 → מזהה הרשות.
4. אישור להוסיף `highway=service` לגרף (§4).

---

## 7. מגבלות ידועות והמשך

- **כפל שמות:** שני relations שונים קיבלו "שביל אדום · חורבת ג'ממה" (ללא `ref` ב-OSM). צריך כלל הבחנה (למשל קצה מזרחי/מערבי) או עריכה ידנית בפאנל.
- **2 `needsName`** (מסלול איבים #1, מסלול רוחמה #1) — לעריכה ידנית בפאנל, לא בניחוש.
- **"סובב …" של קק"ל** יצאו `linear` ולא `loop` כי ה-relations ב-OSM חתוכים/לא רציפים (`continuity` 0.55–0.83 בחלקם). שווה תיקון ב-OSM עצמו (תרומה לקהילה).
- **איבים** — אין מסלול מחולל (הצומת הקרוב לא מחובר מספיק). שאר 11 היישובים קיבלו 1–3.
- **ארכיטקטורה:** לפי `docs/CITY-MAPPING-PIPELINE-ARCHITECTURE.md`, יכולת מיפוי חדשה צריכה להיכנס כשלב ב-`/admin/city-mapping`, לא רק כ-CLI. שני הסקריפטים חושפים `runBuildSegmentGraph()` / `runImportNamedRoutes()` בדיוק כדי שהאורקסטרטור יקרא להם — החיווט הוא PR נפרד (אחרי אישור §6).
- **מעבר הגובה השמור ל-Copernicus** בצינור הקיים (backfill של `elevationGain/maxGrade` ל-`official_routes` הקיימים + חימום מחדש של `dem-tiles/` ב-Storage מ-`copernicusToElevationGrid`) — PR נפרד עם dry-run משלו.
- **הרחבה ארצית:** `--relation=<admin relation>` לכל רשות, או ריצה אחת על כל ה-PBF (osmium מטפל בזה בקלות; אריחי ה-DEM לכל הארץ כבר מוגדרים ב-`ISRAEL_COPERNICUS_TILES`).
