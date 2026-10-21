# מיפוי ערים — תמונה מסודרת אחת לכל עיר (RC4)

**סטטוס:** מחקר ותוכנית בלבד, 21.10.2026. לא נכתב קוד, לא נקראה ולא נכתבה פרודקשן, לא נוצר קשר עם אף גורם. הבסיס: `origin/main` @ `f8747442` (אחרי `git fetch`). כל טענה מסומנת במקור (`file:line` או URL). ⚠️ = לא אומת.
**בונה על (לא חוזר עליהם):** `docs/routes/NATIONWIDE-PLAN.md` (RC1, #620, ממוזג), `docs/routes/SHADE-LIGHT-DATA.md` (RC2, PR #625 פתוח), `docs/architecture/CITY-MAPPING-PIPELINE-ARCHITECTURE.md` (העיקרון הנעול: `/admin/city-mapping` הוא המקום היחיד להפעלת מיפוי עיר, `:18-22`), וגלי RC3 הפתוחים (#624 W0, #627 W2, #630 W1.5).

**המטרה של דוד (21.10):** כמעט בכל עיר בישראל, מחולל המסלולים נותן את המסלול הכי טוב שאפשר: מעדיף מסלול מוכר קיים, הולך בצל כשאפשר, ויודע מה יש בדרך. בשביל זה, לכל עיר צריך להיות בפאנל **מלאי מסודר** של מה שיש בה (פארקים ומגרשים, צל ותאורה, ספסלים/ברזיות/שירותים, כבישים ראשיים ומעברי חצייה, שבילי אופניים/שטח/טיילות), ו**צינור סקריפטים** שבונה ומרענן אותו לכל הארץ, לא עבודה ידנית.

---

## 0. בקצרה

1. **רוב החומר כבר קיים, אבל מפוזר.** יש 8 שלבי מיפוי עיר בפאנל, אוסף נקודות `osm_amenities` עם 6 קטגוריות, `street_segments`, `trail_segments` עם משטח ותאורה לכל מקטע, ו-GraphHopper עם מנגנון `areas` לכל בקשה. **חסרים:** שירותים ציבוריים, פוליגוני פארקים, שבילי אופניים/שטח/טיילות כשכבה, צל, מדד כיסוי לכל שכבה, ותאריך רענון לכל שכבה (§1).
2. **מקורות:** OSM (Geofabrik PBF, ODbL) הוא השלד לכל השכבות. מעליו: חופות עצים של מפ"י (צל), מאגר תשתית הרכיבה הארצי של משרד התחבורה (101 רשויות, 910 ק"מ, נמדד עכשיו, אבל "Other (Open)" — מחכה לאישור כתוב לפי החלטת דוד Q11), ושכבות עירוניות (ת"א, באר שבע). Israel Hiking Map, עמוד ענן, GovMap, Strava/Komoot/AllTrails/Trailforks — לא (§2).
3. **מודל נתונים:** מסמך סיכום אחד לכל רשות ב-Firestore (`city_inventory/{authorityId}`: לכל שכבה ספירה, כיסוי %, מקור, רישיון, תאריך רענון, דגלי איכות). הגאומטריה הכבדה בקבצים ב-Storage, מופרדת לפי רישיון (OSM לחוד, ממשלתי/עירוני לחוד). הנקודות שמשתמש רואה ממשיכות לעבור ב-`osm_amenities` ובשדות המסלול (§3).
4. **צינור:** שלב חדש אחד ב-`/admin/city-mapping` ("מלאי עיר"), שקורא ל-`runCityInventory(authorityId, apply)` — fetch → normalize → classify → coverage → dry-run → דוד מאשר apply. אותו snapshot של PBF ש-RC3 W1 מכין, ולא Overpass. ה-runner הארצי של RC3 (W3) קורא לאותה פונקציה (§4).
5. **פאנל:** כרטיס "בריאות מפה" בעמוד העיר: שורה לכל שכבה (כמה, כיסוי, מקור, מתי רוענן, פער), ופעולת "רענן" אחת (§5).
6. **גלים:** I0 סכמה + פונקציות טהורות, I1 שכבות OSM מ-PBF, I2 כרטיס בפאנל, I3 פוליגוני פארקים גדולים (משותף עם W5), I4 צל (RC2), I5 שכבות ממשלתיות/עירוניות אחרי אישור רישיון, I6 צריכה במחולל מאחורי דגלים (§7).

---

## 1. מה קיים היום (מהקוד)

### 1.1 מסכי עיר/רשות בפאנל

| מסך | מה יש בו | מקור |
|---|---|---|
| "ניהול רשויות" `/admin/authorities` (+`[id]`) | CRM: אנשי קשר, pipeline, משתמשים, לחץ. **אין שום שכבת מפה** | `src/app/admin/layout.tsx:1123`, `src/app/admin/authorities/[id]/page.tsx` |
| "מיפוי עיר" `/admin/city-mapping` (רק super/system admin) | 8 שלבים + פאנל "מצב נוכחי בעיר" (מסלולים, מתקנים לפי קטגוריה, פארקים, תאורה, סמיכות) | `layout.tsx:606,1154`; שלבים `src/app/admin/city-mapping/page.tsx:50-59`; כותרות `:314,369,399` |
| "הוסף עיר" `/admin/city-mapping/add` | `city_registrations/<key>`: bbox, `adminRelationId`, wikidata | `src/lib/city-registrations.ts:48-74` |
| "מיקומים ומסלולים" `/admin/locations`, `/admin/routes`, `/admin/segments`, `/admin/parks` | עריכת פריטים בודדים | `layout.tsx:1333` |

**המשמעות:** "ניהול ערים" שדוד מתאר הוא בפועל `/admin/city-mapping`. הוא כבר מכיל את התחלת התמונה. פאנל הסיכום שלו קורא ישירות מ-Firestore בכל פתיחה (`src/features/admin/services/city-mapping-summary.ts:131-154`). אין שם תאריך רענון לשלב (`CITY-MAPPING-PIPELINE-ARCHITECTURE.md:84`) ואין כיסוי לשכבות שאינן מסלולים.

### 1.2 צינור מיפוי העיר (8 שלבים)

`runCityMapping` (`src/features/admin/services/city-mapping-orchestrator.ts:79-87` לשמות השלבים, `:157` לפונקציה): authorityPreflight → authorityBoundary (כותב `authorities/{id}.boundaryGeoJSON`) → routesGate (גילוי מסלולים דרך poller) → streetSegments → lighting → amenitiesIngest → amenitiesTagging → adjacencyVerify. רץ בדפדפן של המנהל, עיר אחת בכל פעם, עם מחרוזת עיר קנונית אחת לכל השלבים (`:45-58`). החוזה לשלב חדש כבר מוגדר: `run<Capability>(city, apply, db)` + API route דק + שורה ב-`STEP_DEFINITIONS` + דילוג על מה שכבר חושב + שורה בפאנל הסיכום (`CITY-MAPPING-PIPELINE-ARCHITECTURE.md:66-74`).

### 1.3 נתונים לכל עיר שכבר נשמרים

| נתון | איפה | שדות עיקריים | הערות |
|---|---|---|---|
| גבול רשות | `authorities/{id}` | `boundaryGeoJSON` (מחרוזת JSON), `type` (city/regional_council/local_council), `population`, `parentAuthorityId` | `src/types/admin-types.ts:139-195` |
| רישום עיר | `city_registrations/{key}` | `bbox`, `adminRelationId`, `computeLighting` | `src/lib/city-registrations.ts:48-74` |
| נקודות עניין | `osm_amenities` | `category` ∈ court/bench/drinking_water/fitness_station/crossing/dog_park, `status` pending/published/rejected, `authorityId`, `city`, `geohash` | `src/features/parks/core/types/osm-amenity.types.ts:36,44-77`; zod `src/lib/route-collections/schemas.ts:229`. **אין toilets.** שאילתת Overpass: `scripts/extract-osm-amenities-tlv.ts:187-203` |
| פארקים | `parks` | **נקודה** (`location`), לא פוליגון; `facilityType`, `urbanType` (כולל `water_fountain`, `toilets`), `amenities.hasToilets/hasWater` | `src/features/parks/core/types/park.types.ts:19-20,50,242-270`. `urbanType` ריק בכל פארק שפורסם (`:290-295`) |
| מקטעי רחוב | `street_segments` | `surfaceType`, תאורה | `schemas.ts:187-193`; צינור `osm-segment-importer.ts` |
| מקטעי שבילים | `trail_segments` | `surface`, `lit`+`litSource`, `sacScale`, `mtbScale`, `colour`, `itcRef`, `inBuiltUp`, `foot`, `bicycle`, `license` | `src/lib/trail-graph/types.ts:41-70`; שטח/שביל: `src/lib/trail-graph/tags.ts:37` (`OFFROAD_HIGHWAYS`) |
| מסלולים | `official_routes` | `nearbyAmenities[]`, `qualitySignals.{composition,lighting,amenities}`, תג ידני `shaded` | `src/features/parks/core/types/route.types.ts:321,508`; RC1 §1.2 |
| ריצות גילוי | `city_mapping_discovery_runs` | — | `firestore.rules:2815` |

### 1.4 מה המחולל צורך היום

- **GraphHopper** (`enable_graphhopper_routes`, ברירת מחדל `false`, `src/hooks/feature-flag-defs.ts:269`). ה-custom model מקבל רק תגים: `quietStreets`, `avoidUnmarkedCrossings`, `preferParks` (פוליגונים), `preferOurRoutes` (`src/lib/routing/graphhopper/types.ts:14-27`). `preferParks` הופך ל-MultiPolygon אחד ולכלל `!in_parks ×0.85` (`custom-model.ts:29-30,44-58`), אבל **לאף קורא אין מקור פוליגונים להעביר** (חיפוש `preferParks` מחזיר רק את הטיפוסים, המודל והבדיקות).
- Encoded values בגרף: `road_class`, `crossing`, `footway`, `surface`, `foot_network`, `track_type`, `hike_rating`, `mtb_rating` וכו'. **אין `lit` ואין צל** (`infra/graphhopper/config.yml:27`; RC2 §1).
- בקשת `/api/routes/generate`: `start`, `targetKm`, `activity`, `ourRoutes` אופציונלי. אין שדה לשעה, לצל או לנקודות עניין (`src/lib/routing/api-contract.ts:9-27`).
- שכבת OSM לניקוד (כבישים ראשיים + מעברי חצייה) נשלפת מ-Overpass דרך cache שבועי (`src/lib/routing/osm-layer-server.ts:1-30`).
- עצירות בדרך (היברידי) מגיעות מ-`parks` בלבד, ברדיוס 180 מ' (`src/features/workout-engine/hybrid/route-stops.service.ts:32,115`).
- הציון של RC3 W2 כבר מוכן לקבל צל: "Comfort (15): lighting (8) + amenities (7)… Once shade exists… `shadeShare`" (`src/lib/route-score/components.ts:92-95` בענף `feat/routes-w2`, PR #627).

### 1.5 פערים מול המטרה

| שכבה שדוד ביקש | יש היום? | פער |
|---|---|---|
| פארקים/גינות, פארקים גדולים | `parks` כנקודות; פארקים גדולים מתוכננים ב-RC3 W5 | אין פוליגונים, אין שטח, אין קישור ל-`preferParks` |
| מגרשי ספורט | `osm_amenities.court` | אין כיסוי %, רק ספירה |
| צל | ❌ | RC2 נותן מקורות; אין שכבה ואין ערוץ |
| תאורה | למסלולים בלבד (`qualitySignals.lighting`), ול-`trail_segments` | אין כיסוי לרחובות העיר כולה |
| ספסלים, ברזיות | `osm_amenities` | אין מדד שלמות |
| שירותים | ❌ (רק `parks.urbanType='toilets'`, ריק) | קטגוריה חסרה |
| כבישים ראשיים, מעברי חצייה | `road_class`/`crossing` ב-GH; `osm_amenities.crossing`; שכבת ניקוד | אין ספירה לעיר ואין "% מעברים מסומנים" |
| שבילי אופניים (סלול/שטח), שבילי הליכה, טיילות | `trail_segments` (מועצות אזוריות בלבד, פיילוט); מאגרי אופניים ב-W1.5 כמסלולים | אין שכבה עירונית, אין ק"מ לפי סוג |
| מדד כיסוי + מקור + רענון לכל שכבה | ❌ | הכול |

---

## 2. מקורות לכל שכבה (רישוי נבדק)

### 2.1 OSM — מדידת כיסוי (Overpass, 21.10.2026)

שאילתת `out count` אחת לכל עיר מול `overpass-api.de`, בתוך גבול `admin_level=8` (ת"א לפי relation 1382494, השאר לפי שם). זמן הנתונים בשרת: 2026-10-21T08:52Z. Overpass היה עמוס (502 חוזרים, ומראה `kumi.systems` החזירה נתונים מ-07.2026 ולכן לא שימשה), והשאילתות עברו אחרי ניסיונות חוזרים. `nwr` = נקודות + ways + relations.

| שכבה (תג) | ת"א-יפו | חיפה | באר שבע | כפר סבא | שדרות |
|---|---:|---:|---:|---:|---:|
| ברזיות `amenity=drinking_water` | 258 | 81 | **11** | 74 | 9 |
| ספסלים `amenity=bench` | 457 | 282 | 49 | **14** | 21 |
| שירותים `amenity=toilets` | 114 | 24 | 28 | 5 | 1 |
| מתקני כושר `leisure=fitness_station` | 43 | 13 | 4 | 0 | 3 |
| מגרשים `leisure=pitch` | 324 | 187 | 180 | 87 | 27 |
| פארקים `leisure=park` | 506 | 195 | 619 | 105 | 62 |
| גני שעשועים `leisure=playground` | 243 | 126 | 158 | 42 | 45 |
| מעברי חצייה (nodes) `highway=crossing` | 3,593 | 2,449 | 356 | 365 | **17** |
| כבישים ראשיים (ways) `trunk/primary/secondary` | 713 | 907 | 993 | 136 | 243 |
| שבילי אופניים (ways) `highway=cycleway` | 458 | 28 | 112 | 42 | 20 |
| footway (ways) / מתוכם `footway=sidewalk` | 5,264 / 320 | 4,577 / 571 | 2,731 / 62 | 471 / 35 | 346 / 9 |
| path + track (ways) | 1,594 | 834 | 718 | 525 | 54 |
| שבילים עם `surface` (footway/path/cycleway/track/pedestrian) | 2,182 (~30%) | 1,091 (~20%) | 451 (~13%) | 112 (~11%) | 12 (~3%) |
| דרכים הליכתיות עם `lit` (כל ערך) | 1,511 / 13,701 (**11.0%**) | 236 / 9,557 (2.5%) | 529 / 8,229 (6.4%) | 42 / 2,161 (1.9%) | 0 / 1,390 (**0%**) |
| שם מכיל "טיילת" | 16 | 27 | 5 | 0 | 0 |
| relations `route=hiking/foot/walking/running` | 1 | 42 | 13 | 1 | 2 |
| relations `route=bicycle/mtb` | 7 | 0 | 0 | 0 | 0 |
| עצים (nodes) `natural=tree` | 767 | 371 | 347 | 17 | 6 |

"דרכים הליכתיות" כאן = `footway, path, cycleway, track, pedestrian, residential, living_street, tertiary, secondary, primary` — רשימה קצרה יותר מזו של RC2 §2, ולכן האחוזים לא זהים לשם. אחוזי ה-`surface` מקורבים: המכנה חסר `pedestrian`. ⚠️

**מה זה אומר:**
- **הנקודות לא אחידות, והכמות לא מעידה על המציאות.** באר שבע (כ-215 אלף תושבים ⚠️) עם 11 ברזיות ב-OSM, וכפר סבא עם 14 ספסלים — כמעט בטוח חוסר מיפוי, לא חוסר ברזיות. לכן כיסוי לנקודות נמדד כ**צפיפות מול ערים דומות** (§3.4), וכל מספר מוצג עם דגל "מתחת לצפוי".
- **שירותים קיימים ב-OSM בכמות סבירה** (ת"א 114) ואינם אצלנו בכלל (§1.5).
- **מעברי חצייה ממופים טוב בערים הגדולות**, ולא בערים הקטנות (שדרות 17) — ה-`SAFE_CROSSINGS` של GH יעבוד שם על נתון חלקי.
- **תאורה ומשטח — כיסוי נמוך**, כמו שמצא RC2. מדרכות כמעט לא ממופות כ-ways נפרדים (sidewalk 1-12%).
- **שבילי אופניים ב-OSM חלשים מחוץ לת"א** (חיפה 28 ways). לעומת זאת המאגר של משרד התחבורה מכסה 101 רשויות (§2.2).
- **שבילי הליכה מסומנים (relations)** חזקים בחיפה (כרמל) ובבאר שבע, כמעט אפסיים בערי המישור.

### 2.2 מאגר תשתית הרכיבה הארצי של משרד התחבורה (`bph_infra_exist`) — נמדד עכשיו ✅

- **URL:** https://data.gov.il/dataset/bph_infra_exist. "שכבה קווית של סימון מרכז תשתית רכיבה… מיפוי של מספר ערים על בסיס אורטופוטו משנת 2022", מפרט 1.52. עודכן 02.03.2025. רישיון ב-API: `other-open` / "Other (Open)".
- **כיסוי (datastore_search, כל 10,476 הרשומות):** **101 רשויות, כ-910 ק"מ.** המובילות בק"מ: ת"א-יפו ~166 (בשני איותים: "תל אביב יפו" 125 + "תל אביב - יפו" 41), ירושלים 63, מודיעין 52, באר שבע 40, אשדוד 39, נתניה 27, ראשל"צ 26, ראש העין 26, אשקלון 26, הרצליה 22, פ"ת 20. **חיפה רק 15 ק"מ. כפר סבא 11, שדרות 4, ערד 2.**
- **שדות שימושיים במיוחד:** `INFRA` (אספלט 9,657 / מרצפות 719 / בטון 88 / עפר 4) = סלול מול שטח; `Trees` (בצד אחד 3,455 / בשני הצדדים 1,096 / אין 3,402) = proxy לצל לאורך שביל; `BPHType` ("שביל (ג)" 7,763, **"מעבר חציה" 2,489**, "נתיב (ב)" 169); `USABLE`; `AUTHCODE` (קוד למ"ס, עדיף על שם הרשות בגלל האיותים השונים); `LASTCHANGE` (2023-2025).
- **רישוי:** ה-FAQ של data.gov.il, כפי שצוטט בפורום OSM: "המידע פתוח לשימוש חופשי ולא נדרש כל אישור מיוחד", בכפוף לתנאי השימוש, וכל שירות שמשתמש במידע חייב לציין את המקור, המאגר ותאריך העדכון. https://community.openstreetmap.org/t/new-gov-data-source/61963 ⚠️ (ציטוט מ-2012, מקור משני; הנוסח הנוכחי של תנאי האתר לא אותר, כמו ב-RC2 §9.1).
- **מעמד:** לפי החלטת דוד ל-RC3 (Q11, 21.10), "Other (Open)" נשאר בחוץ עד אישור כתוב (`src/lib/dataset-import/registry.ts:1-6` בענף `feat/routes-w15`). **זה המקור הכי טוב לשכבת אופניים עירונית בארץ**, ולכן מומלץ לבקש את האישור (שאלה 2).

### 2.3 שאר המקורות לפי שכבה

מקרא רישוי: ✅ מסחרי מותר · ⚠️ לא אומת · ❌ אסור / לא רלוונטי.

| שכבה | מקור ראשי | השלמה | רישוי | הערות |
|---|---|---|---|---|
| פארקים וגינות (פוליגון + שטח) | OSM `leisure=park/garden`, `landuse=recreation_ground`, `leisure=nature_reserve` | ת"א IView2 שכבה 551 (`shetach_gan`); באר שבע `urban-nature-br7` (RC1 §2.1 #8-9) | OSM ✅ ODbL; ת"א/ב"ש ⚠️ | סף "פארק גדול" (≥8 דונם או היקף ≥1.2 ק"מ) נקבע ב-RC3 Q7 |
| מגרשים, מתקני כושר, גני כלבים | OSM `leisure=pitch` (+`sport`), `leisure=fitness_station`, `leisure=dog_park`, `leisure=track` | `parks` שלנו (אוצר) | ✅ | כבר מיובא ל-`osm_amenities` |
| ברזיות, ספסלים, שירותים | OSM `amenity=drinking_water`, `amenity=bench`, `amenity=toilets` | דיווחי משתמשים/רשות (`parks.urbanType`) | ✅ | שירותים — קטגוריה חדשה |
| מעברי חצייה | OSM `highway=crossing` + `crossing=marked/uncontrolled/traffic_signals/unmarked` | MoT `BPHType='מעבר חציה'` (חציות אופניים בלבד) ⚠️ רישיון | ✅/⚠️ | GH כבר מקודד `crossing` |
| כבישים ראשיים | OSM `highway=trunk/primary/secondary` | — | ✅ | GH `road_class` |
| שבילי אופניים | OSM `highway=cycleway`, `cycleway=*`, `bicycle=designated` | MoT `bph_infra_exist` (§2.2) ⚠️; אופנידן + ירושלים (CC-BY, W1.5) | ✅/⚠️ | סלול/שטח מ-`surface` / `INFRA` |
| שבילי הליכה/שטח, MTB | OSM `highway=path/track/footway` + `sac_scale`, `mtb:scale`, `route=hiking/mtb` relations | `trail_segments` (צינור B) | ✅ | סיווג קיים: `OFFROAD_HIGHWAYS` (`tags.ts:37`), `resolveSurface` (`:85`) |
| טיילות | OSM `name~טיילת`, `highway=pedestrian`, `leisure=promenade`⚠️ (תג לא רשמי) | שכבות עירוניות | ✅ | מיון לפי שם, לא לפי תג |
| צל | חופות מפ"י (`nationalcanopytrees`) / Open Tree Base `canopies_processed` (ODbL) | ת"א חופות 2024 + מבנים עם גובה; Meta CHM (CC BY 4.0) | RC2 §3 | **מדד היעד: SAI** (§2.4) |
| תאורה | OSM `lit` (2.6% מהדרכים, RC2 §2) + `highway=street_lamp` | פנסי באר שבע (29,856), ת"א שכבה 997 | RC2 §6 | "לא מתויג" ≠ "לא מואר" |

**מקורות שנבדקו ונפסלו / לא נחוצים:**

| מקור | מסקנה | ראיה |
|---|---|---|
| **Israel Hiking Map** (israelhiking.osm.org.il / Mapeak) | הנתונים שלו הם OSM — לוקחים ישר מ-OSM. **הקוד והפלטים שלו ב-CC BY-NC-SA 3.0** ("All output of the work should be licensed under the same license"; לשימוש מסחרי — לפנות למחברים) ❌ | https://github.com/IsraelHikingMap/Site/blob/main/LICENSE.md |
| **עמוד ענן** (Amud Anan) | פרויקט קהילתי של יואב רופא. לא נמצאו תנאי שימוש או רישיון לנתונים ⚠️ ⇒ לא להשתמש בלי הסכם | https://apps.apple.com/app/id416537271 |
| **מפות החברה להגנת הטבע** (נמכרות בתוך עמוד ענן) | מוצר בתשלום ❌ | https://www.gadgety.co.il/?p=98620 |
| **GovMap** (מפ"י) | ~340 שכבות מ-45 גופים, API להטמעה; לא נמצאו תנאי שימוש מסחרי ⚠️ ⇒ לא כמקור לייבוא | https://www.hamichlol.org.il/Govmap |
| **סינגלים של קק"ל, רט"ג, ועדת השבילים** | אין GIS פתוח; OSM מכסה בפועל | RC1 §2.1 #10-12 |
| **מפות הצל של הטכניון** (Kikayon, מפות ArcGIS לערים) | אין רישיון ⇒ לא בלי אישור | RC2 §3.6; ראו §2.4 |
| **Overture Places** | POI ממקורות ברישיונות שונים (CDLA-Permissive-2.0, Apache-2.0, CC0) — מותר מסחרית, אבל ברזיות/ספסלים/שירותים כמעט לא שם ⚠️ (לא נמדד) | https://docs.overturemaps.org/attribution/ |
| **Strava, Komoot, AllTrails, Trailforks, Garmin** | ❌ תנאי שימוש (נפסל ב-RC1 §2.1 #11,#17 — לא נבדק מחדש) | — |

### 2.4 צל — tzel.org.il ומדד SAI

- **מה זה:** "דרך צל — המרכז לייעור עירוני והצללה" של המועצה הישראלית לבנייה ירוקה. מפרסם את "Guidelines for Applying Quantitative Shade Indicators" (Aleksandrowicz et al., 2025): https://tzel.org.il/wp-content/uploads/2025/08/Shade-Indicators_eng-2.6.pdf
- **המדד (SAI, Shade Availability Index):** החלק מתוך 10 השעות המלאות 08:00-17:00 ביום קיץ טיפוסי שבהן ≥50% משטח המדרכה מוצל. רמות: <0.5 לא מספיק, ≥0.5 סביר, ≥0.7 טוב מאוד, ≥0.9 מצוין.
- **ממצא חשוב מהמדריך:** אחוז כיסוי חופות הוא מנבא חלש לצל על המדרכה. כיוון הרחוב וגובה המבנים משפיעים מאוד (רחובות צפון-דרום מוצלים יותר).
- **רישוי:** המדריך הוא מתודולוגיה ציבורית — אפשר לממש את ההגדרה בעצמנו. המפות לכל עיר (ת"א, ב"ש, פ"ת, אילת, נתניה, ר"ג, הרצליה ועוד) בלי רישיון מוצהר, והכלי (github.com/oraleks/Kikayon) בלי רישיון ⇒ לא בלי אישור.
- **ההחלטה לתוכנית:** לחשב **מדד דמוי-SAI משלנו** מקלטים פתוחים (חופות + גובה מבנים + מיקום השמש, RC2 §5.1). סף 40% חופות שדוד אישר (RC3 W2, `components.ts:93-95`) הוא **proxy זמני בלבד** עד שה-SAI שלנו מחושב. בשדות נשמור את שניהם: `canopyPct` (מהיר, זמין עכשיו) ו-`saiSummer` (כשיחושב), ותמיד עם `method`, כדי שלא יתבלבלו.

---

## 3. מודל נתונים

### 3.1 עקרונות

1. **הפרדה בין סיכום לגאומטריה.** Firestore מחזיק מסמך קטן לכל רשות (מה המצב). הגאומטריה (אלפי פוליגונים/קווים) נשמרת בקבצים. כך פתיחת עמוד העיר היא קריאה אחת, ולא סריקת אוספים מלאה כמו היום (`city-mapping-summary.ts:131-135`).
2. **הפרדה לפי רישיון (ODbL).** כל קובץ גאומטריה נגזר ממקור אחד. OSM ⇒ קבצי `osm/*` (DB נגזר תחת ODbL, מוכן למסירה אם יבקשו). מקור ממשלתי/עירוני ⇒ קבצים נפרדים עם הקרדיט שלו. מה שמשלב כמה מקורות (כיסוי %, ציון) הוא **העשרה שלנו**, ונשמר בנפרד, כמו ההמלצה ב-RC1 Q4 ו-`route_scores` של W2. ⚠️ פרשנות, לא ייעוץ משפטי.
3. **כל מספר עם מקור, רישיון ותאריך.** שכבה בלי `source.snapshotDate` לא מוצגת כירוקה.
4. **אין כתיבה המונית ל-`osm_amenities`.** כל כתיבה שם עוברת מודרציה (`status`, `osm-amenity.types.ts:67`) ומפעילה טריגר שעלול ליצור פארק (`functions/src/onOsmAmenityWrite.ts`; `park.types.ts:331-337`). המלאי סופר ושומר נקודות בקבצים. רק מה שמשתמש באמת רואה (למשל ברזיות ושירותים לאורך מסלולים) עולה ל-`osm_amenities`, דרך השלב הקיים `amenitiesIngest`.

### 3.2 מסמך סיכום — `city_inventory/{authorityId}` (אוסף חדש)

```ts
interface CityInventory {
  authorityId: string;            // חובה, לפי §23 axioms (רשות מזוהה)
  city: string;                   // המחרוזת הקנונית של city-mapping
  authorityType: 'city' | 'local_council' | 'regional_council';
  areaKm2: number;                // מ-boundaryGeoJSON
  snapshot: { osmPbfDate: string; builtAt: Timestamp; builtBy: string; runId: string };
  layers: Record<InventoryLayerKey, InventoryLayer>;
  readiness: { score: number; level: 'red' | 'yellow' | 'green'; missing: InventoryLayerKey[] };
  updatedAt: FieldValue;          // serverTimestamp
}

type InventoryLayerKey =
  | 'parks' | 'big_parks' | 'courts' | 'fitness_stations'
  | 'benches' | 'drinking_water' | 'toilets'
  | 'major_roads' | 'crossings'
  | 'bike_paved' | 'bike_offroad' | 'bike_unknown' | 'trails_paved' | 'trails_offroad' | 'promenades'
  | 'lighting' | 'shade';

interface InventoryLayer {
  count: number | null;           // נקודות/פוליגונים
  lengthKm?: number | null;       // לשכבות קוויות
  areaKm2?: number | null;        // לפוליגונים
  density?: number | null;        // לק"מ רחוב / לקמ"ר
  coveragePct: number | null;     // ראו §3.4. null = לא נמדד (לא אפס)
  sources: Array<{ key: string; license: string; attribution: string; snapshotDate: string; count: number }>;
  quality: Array<'below_expected_density' | 'single_source' | 'stale_source' | 'untagged_majority' | 'license_pending'>;
  files?: { path: string; bytes: number; sha256: string }[]; // Storage
  lastRefreshAt: Timestamp;
}
```

**גודל:** ~16 שכבות × ~300 בתים ≈ 5KB למסמך; ~255 רשויות ⇒ ~1.3MB לכל הארץ. כתיבה אחת לרשות לכל רענון.

**היסטוריה:** `city_inventory/{authorityId}/runs/{runId}` עם אותם `layers` (בלי `files`), כדי לראות שינוי בין רענונים ולתפוס נסיגה (למשל 0 ספסלים פתאום = כשל שליפה, לא עיר בלי ספסלים — "אפס שאינו אפס", axioms §25).

**ריצות שלבים:** המסמך `city_mapping_runs/{city}_{step}` שהוצע ב-`CITY-MAPPING-PIPELINE-ARCHITECTURE.md:86` נשאר מקור ה"מתי רץ שלב". `city_inventory` הוא "מה יש בעיר".

### 3.3 קבצי גאומטריה — Storage

`city-inventory/{authorityId}/{snapshotDate}/{source}/{layer}.geojson.gz` — למשל `.../osm/benches.geojson.gz`, `.../mot/bike.geojson.gz`, `.../derived/shade-ways.csv.gz`.

| שכבה | הערכת גודל לעיר גדולה (gzip) ⚠️ הערכה |
|---|---|
| נקודות (ספסלים, ברזיות, שירותים, מעברים) | עשרות-מאות KB |
| פוליגוני פארקים (פשוטים) | ~0.5-2MB |
| קווים (אופניים/שבילים/טיילות) | ~0.5-3MB |
| צל לכל way (`osm_way_id, canopyPct, sai…`) | ~0.5-2MB |

לכל הארץ: סדר גודל מאות MB ב-Storage ⇒ סנטים בחודש. ריצה חוזרת עם אותו snapshot = אותו `sha256` ⇒ לא כותבים.

### 3.4 איך מודדים "כיסוי"

אין "אמת" חיצונית למספר הספסלים בעיר. לכן הכיסוי הוא **יחסי ושקוף**, ולכל שכבה כלל אחד:

| שכבה | `coveragePct` = | ⚠️ |
|---|---|---|
| תאורה | אורך רחובות עם `lit` מתויג (yes/no) / כל אורך הרחובות המתאימים | כמו RC2 §2 |
| צל | אורך ways עם ערך צל מחושב / כל ה-ways ההולכיים | — |
| משטח שבילים | ways עם `surface` / כל ה-footway/path/cycleway/track | — |
| מעברי חצייה | מעברים עם `crossing=*` מפורט / כל `highway=crossing` | — |
| נקודות (ספסל/ברזייה/שירותים) | **צפיפות** (לק"מ רחוב) מול החציון של ערים דומות בגודל. מתחת ל-25% מהחציון ⇒ `below_expected_density` | הסף לכיול |
| פארקים | שטח פארקים ב-OSM / שטח בשכבה עירונית (כשיש); אחרת null | — |

### 3.5 איך המחולל צורך את זה

| צרכן | מה הוא מקבל | ערוץ |
|---|---|---|
| GraphHopper — פארקים | פוליגוני `big_parks` של אזור הבקשה ⇒ `preferParks` | `areas` לכל בקשה, כבר קיים (`custom-model.ts:44-58`) |
| GraphHopper — צל | MultiPolygon של ways מוצלים (לפי דלי שעה) ⇒ `preferShade` חדש | `areas` (RC2 §7 ערוץ A); בהמשך CSV לפי way id (ערוץ D) |
| GraphHopper — כבישים ראשיים/מעברים | כבר בגרף (`road_class`, `crossing`) | אין צורך בנתון חדש |
| GraphHopper — אופניים סלול/שטח | `surface` כבר בגרף; MoT ⇒ הזרקת `surface`/`cycleway` ל-PBF לפני import (RC2 §7 ערוץ C) | אחרי אישור רישיון |
| ניקוד מסלול (W2) | `shadeShare`, `litCoveragePct`, עצירות מים/ספסל/שירותים לאורך המסלול | העשרה offline על `official_routes` (`nearbyAmenities`) + `route_scores` |
| עצירות בדרך (היברידי) | `parks` (היום) + ברזיות/שירותים | snap ≤180 מ' כמו `route-stops.service.ts:32`; **בלי** לגעת ב-`composeHybridPlan`/`eligible.ts` |
| מסך העיר בפאנל | `city_inventory/{id}` | קריאה אחת |

**ODbL בפועל:** הבקשה ל-GH נושאת פוליגונים נגזרים מ-OSM לשרת שלנו — שימוש פנימי. מה שמוצג למשתמש הוא "Produced Work" עם קרדיט OSM, שכבר מוצג (`route-attribution.ts`, RC1 §3.6). ⚠️

---

## 4. הצינור — "סוכן מיפוי" לכל עיר

### 4.1 שלבים דטרמיניסטיים

`runCityInventory(authorityId, { apply, snapshot }, deps)` — פונקציה טהורה מבחינת I/O מוזרק, לפי חוזה השלבים (`CITY-MAPPING-PIPELINE-ARCHITECTURE.md:68-74`):

| # | שלב | מה | כותב | אוטומטי? |
|---|---|---|---|---|
| 1 | **resolve** | רשות ⇒ `boundaryGeoJSON` + `adminRelationId`. אין גבול ⇒ עצירה ודיווח (§23) | — | כן |
| 2 | **fetch** | `osmium extract` מה-PBF של ה-snapshot לפי הגבול (אותו extract ש-RC3 W1/W3 מכינים); מאגרים ממשלתיים/עירוניים שאושרו — מ-cache מקומי עם תאריך | קבצים מקומיים | כן |
| 3 | **normalize** | ITM⇒WGS84 (`src/lib/dataset-import/itm.ts`, W1.5), איחוד איותי רשות לפי `AUTHCODE`/קוד למ"ס, חיתוך לגבול | — | כן |
| 4 | **classify** | כל פריט ⇒ `InventoryLayerKey`, לפי טבלת תגים אחת (§2.3). שבילים: סלול/שטח לפי `resolveSurface` (`trail-graph/tags.ts:85`); MoT לפי `INFRA` | — | כן |
| 5 | **enrich** | צל לכל way (canopy%, ובהמשך SAI), תאורה לכל way (`resolveLit`, `tags.ts:126`), פוליגוני פארקים גדולים | — | כן |
| 6 | **coverage** | §3.4 + דגלי איכות + `readiness` | — | כן |
| 7 | **report (dry-run)** | `scripts/output/city-inventory/<date>/<authorityId>.json` + diff מול הריצה הקודמת | קובץ | כן |
| 8 | **apply** | Storage (קבצים) + `city_inventory/{id}` + `runs/{runId}` | Firestore + Storage | **דוד בלבד** |

**ברירת מחדל dry-run.** `--apply` רק לדוד, עם המעקות של `trails-apply.node.ts` (`TARGET:` ראשון, הקלדת `YES`, `--project`) — כמו RC1 §3.4.

### 4.2 מה אוטומטי ומה של דוד

| אוטומטי (agent/סקריפט) | דוד |
|---|---|
| dry-run לכל עיר, דוח, diff | `apply` לפרודקשן |
| חישוב צל/תאורה/כיסוי | אישור רישיון למקור חדש (data.gov.il "Other", ת"א GIS, טכניון) |
| דגלי איכות ("ספסלים מתחת לצפוי") | החלטה אם להעלות נקודות ל-`osm_amenities` (מודרציה) |
| הצעת "פארקי עוגן" | אישור עוגני כיול, הדלקת דגלים, deploy של GraphHopper |

### 4.3 רענון וסדר

- **קצב:** OSM — חודשי (snapshot אחד לכל הארץ, תואם ל-PBF של RC3; ה-graph של GH נבנה שבועית, `infra/graphhopper/README.md:95`). מאגרים ממשלתיים — לפי `metadata_modified` (בדיקה חודשית ב-CKAN; MoT עודכן 03.2025). צל — חד-פעמי לכל snapshot חופות (מפ"י 2021, ת"א 2024).
- **סדר:** רשויות לקוחות ⇒ 10 ערים גדולות ⇒ מועצות אזוריות ⇒ השאר (כמו RC1 §3.4). עיר אחת בכל פעם, בלי מקביליות (מכונה 16GB).
- **זמן ⚠️ הערכה:** extract + classify לעיר ~1-3 דק'; צל canopy% לעיר גדולה ~5-15 דק'. לכל הארץ: לילה אחד-שניים.

### 4.4 חיבור ל-runner הארצי של RC3 (W3) — בלי כפילויות

| משאב | בעלים | RC4 |
|---|---|---|
| PBF snapshot + `osmium extract` לפי רשות | RC3 W1/W3 (`scripts/routes-nationwide/*`) | **צורך** את אותו extract (נתיב קובץ), לא מוריד שוב |
| ITM⇒WGS84, קריאת SHP, רשומת מאגרים ורישיונות | RC3 W1.5 (`src/lib/dataset-import/{itm,read-shapefile,registry}.ts`) | **מייבא**, לא משכפל; מוסיף מאגרי "שכבה" (לא "מסלול") ברשומה נפרדת `src/lib/city-inventory/sources.ts` |
| פוליגוני פארקים גדולים | RC3 W5 (`src/lib/park-loops/*`) | **פונקציה אחת משותפת.** מי שנבנה קודם מחזיק אותה ב-`src/lib/city-inventory/layers/big-parks.ts`, והשני מייבא. W5 עוד לא התחיל — עדיף ש-I3 יבנה אותה ו-W5 יצרוך |
| ציון מסלול | RC3 W2 (`src/lib/route-score/`) | מספק את `shadeShare` ואת עצירות המים; לא נוגע בקוד הציון |
| loop ארצי על רשויות + checkpoint | RC3 W3 (`scripts/routes-nationwide/run.ts`) | W3 קורא ל-`runCityInventory` **לפני** שלב המסלולים (עם ה-extract שכבר יש לו); אותו checkpoint |

---

## 5. הפאנל — כרטיס "בריאות מפה" לעיר

**איפה:** בתוך `/admin/city-mapping`, מעל "מצב נוכחי בעיר" (`page.tsx:369`). לא בעמוד ה-CRM של הרשות, כדי לא לערבב (מותר רק ל-super/system admin, `layout.tsx:606`). בהמשך — קישור קטן מ-`/admin/authorities/[id]`.

**גרסה ראשונה (הכי קטנה ששימושית):**

```
בריאות מפה — באר שבע         snapshot OSM: 2026-10-01 · נבנה 21.10 · 🟡 62/100
┌──────────────┬───────┬────────┬──────────────┬──────────┬─────────────────────┐
│ שכבה         │ כמה   │ כיסוי  │ מקור         │ רוענן    │ פער                 │
├──────────────┼───────┼────────┼──────────────┼──────────┼─────────────────────┤
│ פארקים גדולים│ 14    │ —      │ OSM          │ 21.10    │                     │
│ ברזיות       │ 11    │ 🔴 צפיפות│ OSM        │ 21.10    │ מתחת לצפוי          │
│ שירותים      │ 28    │ 🟡      │ OSM          │ 21.10    │                     │
│ שבילי אופניים│ 40 ק"מ│ —      │ MoT ⚠️ רישיון│ 03.2025  │ ממתין לאישור רישיון │
│ צל           │ —     │ —      │ —            │ —        │ לא חושב             │
│ תאורה        │ 6.4%  │ 🔴      │ OSM          │ 21.10    │ רוב הרחובות לא מתויגים│
└──────────────┴───────┴────────┴──────────────┴──────────┴─────────────────────┘
[ רענן (dry-run) ]  [ הורד דוח ]   — apply רק דרך הסקריפט, דוד
```
(ברזיות, שירותים ותאורה מ-§2.1, אופניים מ-§2.2; פארקים גדולים, הציון והצבעים להמחשה בלבד.)

- קריאה אחת: `city_inventory/{authorityId}`. בלי סריקות אוספים.
- "רענן (dry-run)" יוצר בקשה (כמו `city_mapping_discovery_runs` ל-poller) — לא מריץ PBF בדפדפן.
- גרסה 2: מפה קטנה עם toggle לכל שכבה (מקבצי ה-Storage), ורשימת "מה חסר" כמשימות ("לבקש מהעירייה שכבת ברזיות").
- גרסה 3: טבלה ארצית — כל הרשויות × שכבות, עם צבעים (לתעדוף פניות GIS, הרעיון של דוד מ-21.10).

---

## 6. מצב הסיום במחולל

### 6.1 סדר העדפות (כל אחד מאחורי דגל נפרד, fail-closed)

1. **מסלול מוכר מאושר** — כבר קיים חלקית: `enable_loops_prefer_official` (`feature-flag-defs.ts:276`), והסט הנבחר לכל עיר של RC3 (W2/W3). "סביב פארק" ⇒ קודם הלולאות המאושרות שלו (RC1 W6).
2. **צל** — `preferShade` ב-`buildCustomModel` (תבנית `preferParks`), דגל חדש `enable_routes_prefer_shade`. ביום (לפי שעת היציאה) בלבד. בלילה ⇒ תגמול לרחובות מוארים (לא עונש ללא-מתויג, RC2 §6.1).
3. **נקודות בדרך** — ברזיות/ספסלים/שירותים ≤180 מ' מהמסלול: קודם כ**מידע** על המסלול (רשימה בכרטיס), אחר כך כמשקל קטן בבחירה בין המועמדים (best-of-N ב-`loop-service.ts`), ולא כ-via-point שמעוות את המסלול. דגל `enable_routes_amenity_aware`.
4. **בטיחות** — כבר קיים: `QUIET_FOOT`, `SAFE_CROSSINGS` (`custom-model.ts:9-27`). המלאי רק מודד ומציג אותו לכל עיר.
5. **אופניים** — `activity:'cycling'` ⇒ העדפת שבילי אופניים סלולים; MTB ⇒ שטח. דרך PBF מועשר (אחרי אישור MoT).

### 6.2 מתי עיר "טובה" (readiness)

| רמה | תנאים (⚠️ ספים ראשוניים לכיול) |
|---|---|
| 🔴 | אין גבול רשות, או אין snapshot, או < 3 מסלולים מאושרים |
| 🟡 | גבול + snapshot + כל שכבות ה-OSM נמדדו + ≥ מינימום מסלולים מהמכסה של RC3 §3.7 |
| 🟢 | 🟡 + צל מחושב (≥80% מה-ways ההולכיים) + פוליגוני פארקים גדולים + אף שכבת נקודות לא ב-`below_expected_density` + כל מקור עם רישיון מאושר |

המחולל **לא** חוסם עיר צהובה. הוא פשוט לא מפעיל העדפה ששכבה שלה חסרה (למשל אין צל ⇒ אין `preferShade`, בלי הודעת שגיאה).

---

## 7. גלים (PR קטן לכל אחד)

**כלל התנגשות עם RC3:** RC4 לא עורך אף קובץ שבשימוש RC3: `src/lib/route-score/*`, `src/lib/dataset-import/*`, `scripts/routes-nationwide/*`, `scripts/geo-discovery-routes.ts`, `scripts/trails/*`, `src/lib/routing/loops/candidates.ts`, `docs/architecture/CITY-MAPPING-PIPELINE-ARCHITECTURE.md` (W0). קבצים חדשים תחת `src/lib/city-inventory/` ו-`scripts/city-inventory/`. נבדק מול #624/#627/#630 (`git diff --stat`) ומול worktrees `appout-1-rc3-*`.

| גל | מה | קבצים | גודל | תלות | מקביל ל-RC3? |
|---|---|---|---|---|---|
| **I0** | סכמה + פונקציות טהורות: טיפוסי `CityInventory`, טבלת תגים⇒שכבה (`classify.ts`), כיסוי (`coverage.ts`), readiness, round-trip test עם Timestamp-fake (axioms §31) | `src/lib/city-inventory/{types,classify,coverage,readiness,doc}.ts` + tests | S-M | — | ✅ כן |
| **I1** | שכבות OSM מ-PBF: `runCityInventory` dry-run לעיר (extract ⇒ classify ⇒ coverage ⇒ דוח JSON). פיילוט: באר שבע, ת"א, חיפה, שדרות | `scripts/city-inventory/run.ts`, `src/lib/city-inventory/run.ts` | M | I0; extract של RC3 W1 (או osmium ישיר עד אז) | ✅ (לא נוגע בקבצי W1) |
| **I2** | כרטיס "בריאות מפה" ב-`/admin/city-mapping` (קריאה בלבד) + `apply` בסקריפט + `firestore.rules` ל-`city_inventory` (קריאה: admin, כתיבה: אף לקוח) + dry-run של הכללים לפני מסירה (CLAUDE.md) | `src/features/admin/components/city-inventory/*`, `city-mapping/page.tsx` (הוספת קומפוננטה), `firestore.rules` | M | I1 | ✅ |
| **I3** | פוליגוני פארקים גדולים (OSM + סף RC3 Q7 + מיזוג שמות) כשכבה; W5 צורך | `src/lib/city-inventory/layers/big-parks.ts` | S-M | I1; תיאום עם W5 | ⚠️ לתאם עם W5 |
| **I4** | צל v1: canopy% לכל way מחופות מפ"י/Open Tree Base, ב"ש + ת"א (RC2 §10); קובץ `derived/shade-ways.csv.gz`; `shadeShare` למסלולים ל-W2 | `src/lib/city-inventory/layers/shade.ts`, `scripts/city-inventory/shade.ts` | M | I1, RC2 ממוזג | ✅ |
| **I5** | `amenity=toilets` כקטגוריה ב-`osm_amenities` (הרחבת enum + zod, `osm-amenity.types.ts:36`, `schemas.ts:87,229`) + שלב `amenitiesIngest` מושך גם שירותים | `osm-amenity.types.ts`, `schemas.ts`, `extract-osm-amenities-tlv.ts` | S | — | ✅ (RC3 לא נוגע) |
| **I6** | מקורות ממשלתיים/עירוניים כשכבות (MoT `bph_infra_exist`, פנסי/עצי ב"ש, ת"א IView2) | `src/lib/city-inventory/sources.ts` | M | **אישור רישיון** (שאלה 2) | ✅ |
| **I7** | צריכה במחולל: `preferShade` + `preferParks` מהמלאי ב-`/api/routes/generate`, מאחורי דגלים; מדידה ב-`/admin/routes/quality` | `custom-model.ts`, `types.ts`, `api-contract.ts`, route handler | M | I3, I4, GH דלוק | ⚠️ אחרי W5/W6 (קבצי routing) |
| I8 | SAI לפי שעה (צללי מבנים, ת"א) — ערוץ D ב-GH | GH image + `scripts/city-inventory/sai.ts` | L | I4, החלטת Java | — |
| I9 | טבלה ארצית ב-`/admin/city-mapping` + שילוב ב-W3 | page + `run.ts` של W3 (אחרי ש-W3 ממוזג) | S | I2, W3 | אחרי W3 |

**שלושת הראשונים:** I0 (סכמה), I1 (dry-run OSM ל-4 ערים), I2 (כרטיס בפאנל). אחריהם I5 (שירותים, קטן ועצמאי) ו-I4 (צל).

---

## 8. שאלות פתוחות לדוד (עם המלצה)

1. **מיקום במסך:** כרטיס "בריאות מפה" בתוך `/admin/city-mapping` (ולא בעמוד ה-CRM של הרשות)? *המלצה:* כן. בהמשך קישור מעמוד הרשות.
2. **רישיון data.gov.il "Other (Open)":** לבקש אישור כתוב ממשרד התחבורה (`bph_infra_exist`: 101 רשויות, 910 ק"מ, עם שדות משטח, עצים ומעברי חצייה) ומעיריית באר שבע (עצים, פנסים, מבנים)? *המלצה:* כן, בעדיפות ראשונה. זה המקור הכי טוב לאופניים עירוניים, וחיפה/כפר סבא/שדרות דלים בו (15/11/4 ק"מ), כך ש-OSM נשאר הבסיס בכל מקרה.
3. **צל:** לממש מדד דמוי-SAI משלנו (חופות + גובה מבנים + שמש), ולהשאיר את סף 40% חופות כ-proxy זמני? *המלצה:* כן. במקביל לפנות לטכניון — לא כחסם.
4. **שירותים ציבוריים ב-`osm_amenities`:** להוסיף קטגוריה `toilets` (עוברת מודרציה כמו ברזיות)? *המלצה:* כן (I5). בלי שירותים, "מה יש בדרך" חסר.
5. **נקודות במלאי מול נקודות באפליקציה:** המלאי סופר הכול בקבצים, ורק ברזיות/שירותים/ספסלים **ליד מסלולים** עולים ל-`osm_amenities`? *המלצה:* כן, כדי לא להציף את מרכז האישורים ולא להפעיל את טריגר יצירת הפארקים.
6. **קצב רענון:** OSM חודשי, מאגרים ממשלתיים לפי עדכון, צל לכל snapshot חופות? *המלצה:* כן. רענון ידני מהכרטיס בכל עת (dry-run).
7. **ספי readiness ו"מתחת לצפוי":** מקובלים כנקודת פתיחה (§3.4, §6.2)? *המלצה:* כן, ולכייל אחרי I1 על 4 ערי הפיילוט.
8. **פניית GIS לרשויות לקוחות** (ברזיות, שירותים, עצים, פנסים, שבילים): להתחיל אחרי I2, כשיש טבלה שמראה לכל עיר מה חסר? *המלצה:* כן — הטבלה הופכת ל-pitch ("זה מה שחסר אצלכם"). אנחנו לא פונים לאף אחד; זה בידיים שלך.
9. **פארקים גדולים — מי בונה את הפונקציה:** I3 (מלאי) ו-W5 צורך, או להפך? *המלצה:* I3, כי W5 עוד לא התחיל ופוליגון פארק הוא שכבת מלאי.
10. **Israel Hiking Map:** לא להשתמש (הנתונים הם OSM; הפלטים CC BY-NC-SA). *המלצה:* לא. אם רוצים את אריחי המפה שלהם בתצוגה — רק בהסכם.

---

### נספח: איך נאספו המספרים
- **MoT:** `https://data.gov.il/api/3/action/package_show?id=bph_infra_exist` (רישיון, תאריכים) ו-`datastore_search?resource_id=6c6f191a-0839-411d-ac4f-59abe36a3593&limit=11000&fields=AUTHORITY,LENGTH_M,INFRA,Trees,BPHType,USABLE,LASTCHANGE` (כל 10,476 הרשומות, צבירה מקומית). קובץ ה-CSV הישיר (`aws-e.data.gov.il`) החזיר 403.
- **OSM:** שאילתה אחת לכל עיר, 20 שורות `out count` (`nwr[...](area.c); out count;`), `area(3601382494)` לת"א ו-`area["name"="<עיר>"]["admin_level"="8"]["boundary"="administrative"]` לשאר. בלי הורדת גאומטריה.
- **רישוי:** הקישורים בטבלאות §2. tzel.org.il — המדריך מ-08.2025 (סיכום מהמתאם, לא נקרא מחדש בסשן הזה ⚠️).
