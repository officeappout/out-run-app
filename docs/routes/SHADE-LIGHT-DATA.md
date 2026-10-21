# RC2 — נתוני צל, עצים, צללי מבנים ותאורת רחוב בישראל: מקורות פתוחים + דרך הטמעה ב-GraphHopper

> **סטטוס:** מחקר בלבד (מסמך). אין קוד, אין כתיבה לפרודקשן, לא הורדו קבצים גדולים. הבדיקות בפועל היו רק שאילתות metadata/ספירה (CKAN API, ArcGIS REST `returnCountOnly`, Overpass `out count`).
> **תאריך:** 21.10.2026. **ענף:** `docs/routes-shade-light-data`. **קשור ל:** `docs/routes/NATIONWIDE-PLAN.md` §3.3 (רכיב "נוחות" בציון. RC2 קובע את השדה, RC1 רק צורך) ושורה 39 שם ("צל: לא מחושב בשום מקום").
> **סימונים:** ✅ נבדק ישירות (URL/API) · ⚠️ לא מאומת (מקור משני, או שלא נמצא נוסח רישיון) · ❌ לא קיים/לא נמצא.

---

## 0. בקצרה

**הבעיה:** הבעלים רוצה מסלולים שמעדיפים צל ביום (עצים + צללי מבנים לפי שעה) ורחובות מוארים בלילה. היום אין לנו לא נתון ולא מנגנון:
- ב-GraphHopper שלנו (11.1) אין encoded value של `lit` ואין `shade` (§1).
- ב-OSM בישראל רק 2.6% מהדרכים הרלוונטיות מתויגות `lit`, ורק 4.2% מהמבנים מתויגים `building:levels` (§2).

**החדשות הטובות:** בישראל יש מקורות פתוחים טובים במיוחד:
1. **מיפוי חופות עצים לאומי של מפ"י.** פוליגונים של כל חופות העצים באזורים הבנויים של כל הרשויות, מצילומי אוויר 2021, ב-data.gov.il. התיאור כולל גם מדד כיסוי חופות לרחוב (§3.1).
2. **תל אביב-יפו (שרת ArcGIS פתוח לשאילתות):** חופות עצים 2024 (159,863 פוליגונים), סקר עצים (39,312), **מבנים עם גובה גג ו-DSM** (45,795) ושכבת פנסים (§3.3, §4.1, §6.3).
3. **באר שבע (data.gov.il, עדכון יומי/חודשי):** 59,571 עצים, 29,856 עמודי תאורה, 26,312 מבנים עם מספר קומות (§3.4, §4.2, §6.3).
4. **מפות הצל של הטכניון (ד"ר אור אלכסנדרוביץ).** כבר חושב "מדד צל קיצי" **לכל מקטע רחוב** לת"א (7,239 מקטעים), באר שבע (5,803) ועוד כ-20 ערים. מוצג בפומבי, אבל **אין רישיון**, ולכן נדרשת פנייה (§3.6).
5. **Meta/WRI Canopy Height (CHMv1/v2).** גובה חופות גלובלי ברזולוציה תת-מטרית, CC BY 4.0. מכסה גם ערים בלי נתונים עירוניים (§3.7).

**הצעד הראשון המומלץ (פירוט ב-§10):** פיילוט "צל עצים סטטי" בבאר שבע ובתל אביב. חופות מפ"י ← אחוז כיסוי לכל way של OSM ← הזרקה ל-GraphHopper דרך מנגנון ה-`areas` לכל בקשה, שכבר קיים אצלנו ומשמש את `preferParks`. זה לא דורש Java ולא import חדש. במקביל: פנייה לטכניון בבקשת רישיון למדד הצל לכל מקטע.

---

## 1. מה כבר יש בריפו (נקודת פתיחה)

| נושא | מצב | ראיה |
|---|---|---|
| מנוע | GraphHopper 11.1 self-hosted, Cloud Run me-west1, flexible mode (custom model לכל בקשה) | `infra/graphhopper/README.md:1-5`, `infra/graphhopper/config.yml:12-25` |
| EVs ב-graph | `foot_access, …, road_class, road_environment, crossing, footway, surface, …, orientation`. **אין `lit`, אין `sidewalk`, אין shade** | `infra/graphhopper/config.yml` (`graph.encoded_values`) |
| `lit` ב-GraphHopper upstream | **לא קיים ב-11.1** (רשימת ה-ImportUnits ב-`DefaultImportRegistry` של תג 11.1 לא כוללת Lit). **נוסף ל-master** ב-commit `e33f85c` "Add support for lit encoded value (#3285)" מ-18.02.2026. גם `Sidewalk.java` קיים רק ב-master | ✅ https://github.com/graphhopper/graphhopper/blob/11.1/core/src/main/java/com/graphhopper/routing/ev/DefaultImportRegistry.java · https://github.com/graphhopper/graphhopper/commit/e33f85c7875756661783866916105bf99846373a · רשימת ה-EVs (master) ב-https://github.com/graphhopper/graphhopper/blob/master/docs/core/custom-models.md |
| מנגנון "אזור" לכל בקשה | כבר בשימוש: `preferParks` ממוזג ל-MultiPolygon אחד עם id `parks`, וכלל `!in_parks ×0.85`; גם `preferOurRoutes` | `src/lib/routing/graphhopper/custom-model.ts:30-31,55-63` |
| תאורה למסלולים שמורים | יש pipeline לפי `street_segments` ותג `lit` של OSM, עם הבחנה של 3 מצבים (yes/no/לא מתויג). חיפה applied, ת"א | `scripts/lib/route-lighting-street-segments.node.ts:1-30`, `docs/routes/NATIONWIDE-PLAN.md:35` |
| צל | **לא מחושב בשום מקום**. רק תג ידני `shaded` | `docs/routes/NATIONWIDE-PLAN.md:39` |

**מסקנה:** כל פתרון צל או תאורה צריך גם **נתון** וגם **ערוץ** אל ה-graph. הערוצים האפשריים ממוינים לפי מאמץ ב-§7.

---

## 2. מדידה: כמה OSM בישראל מתויג היום (Overpass, 21.10.2026)

שאילתות `out count` מול `overpass-api.de`. "דרכים" = `highway ∈ {footway, pedestrian, path, living_street, residential, tertiary, secondary, primary, unclassified, cycleway, steps, service}`. נספרו רק ways. מבנים שממופים כ-relation לא נספרו, כך שזה הערכת חסר קלה.

| אזור | מבנים | עם `building:levels` | עם `height` | דרכים | עם `lit` (כלשהו) | `natural=tree` (nodes) |
|---|---:|---:|---:|---:|---:|---:|
| ישראל (`ISO3166-1=IL`) | 663,079 | 27,688 (**4.2%**) | 5,646 (0.85%) | 352,287 | 9,093 (**2.6%**), מהם `lit=yes` 8,477 | 14,945 (+436 `tree_row`), `street_lamp` nodes: 5,968 |
| תל אביב-יפו | 26,933 | 3,392 (12.6%) | 290 | 16,697 | 1,557 (9.3%) | 767 |
| ירושלים | 40,054 | 624 (1.6%) | 165 | 25,170 | 302 (1.2%) | 1,543 |
| באר שבע | 16,147 | 847 (5.2%) | 112 | 11,240 | 544 (4.8%) | 347 |
| שדרות | 3,104 | 95 (3.1%) | 0 | 1,856 | **0** | 6 |
| חיפה | ⚠️ לא נמדד (Overpass עמוס, 502/timeout) | | | | | |

נמצאו 0 תגי `shade=*` ו-0 תגי `tree_lined=*` על ways בישראל (באותה שאילתה).

**השוואה:** ב-OSM יש 767 עצים בת"א, ואילו בשכבת העירייה יש 39,312 עצים ו-159,863 חופות. ב-OSM יש 290 מבנים עם גובה בת"א, ואילו בשכבת העירייה יש 45,795 מבנים עם `max_height` ו-DSM (§4.1). כלומר: **OSM לבדו לא יספיק לצל ולא לתאורה.** הוא שלד ה-graph בלבד.

הקשר לנתון: בפורום OSM צוטטו 5,635 מבנים בישראל עם תג גובה (2025). זה תואם ל-5,646 שמדדנו. https://community.openstreetmap.org/t/mass-edit-building-height-cleanup/143457 ⚠️ (מקור משני)

---

## 3. עצים וחופות

### 3.1 מפ"י: מיפוי חופות עצים, מאגר גיאוגרפי לאומי ✅ (המקור החשוב ביותר)
- **URL:** https://data.gov.il/dataset/nationalcanopytrees. קובץ `NationalCanopyTreesV2.zip`, 358,820,364 bytes (~342MB), עדכון אחרון של הקובץ 23.03.2023. קטלוג ArcGIS Hub: https://hub.arcgis.com/maps/f3c7eed3d07047f8b518571ea53c5bb2
- **מה זה (לשון התיאור ב-API):** "קובץ גיאוגרפי המכיל תיחום של כלל חופות העצים", מודל למידת מכונה על **צילומי אוויר של מפ"י משנת 2021**, באזורים הבנויים של הרשויות המקומיות. **מדד כיסוי חופות ברחובות** חושב בחיתוך עם שכבת הדרכים של מפ"י, עם buffer של 7.5 מ' מכל ציר נתיב.
- **פורמט:** ZIP (בפועל Shapefile/GDB ⚠️, הקובץ לא הורד). **CRS:** ITM (EPSG:2039) ⚠️ (משתמע מעיבוד Open Tree Base: "המרת הקואורדינטות מרשת ישראל לרשת עולמית").
- **עדכון:** `Frequency: NotConstant`. בפועל snapshot של 2021.
- **רישיון:** ב-data.gov.il מופיע "Other (Open)". הנוסח המלא של תנאי השימוש לא אותר (§9). מקורות משניים מתארים שימוש חופשי לכל מטרה חוקית עם ציון מקור ⚠️. https://community.openstreetmap.org/t/new-gov-data-source/61963 . ב-Open Tree Base אותו מאגר מופיע תחת ODbL (§3.2).
- **כיסוי:** אזורים בנויים בכל הרשויות המקומיות. **לא** יערות קק"ל ושטחים פתוחים.
- **איכות:** חופה דו-ממדית בלי גובה. מ-2021, כך שעצים שנשתלו או נכרתו מאז חסרים או עודפים. לפי הכנסת, זה הבסיס לתוכנית הממשלתית לנטיעות ("70% מהמדרכות מוצלות עד 2040"). https://fs.knesset.gov.il/globaldocs/MMM/9c718b69-0326-ec11-813f-00155d0401c3/2_9c718b69-0326-ec11-813f-00155d0401c3_11_19573.pdf ⚠️ (לא נקרא במלואו)
- **מאמץ הטמעה:** **נמוך-בינוני.** פוליגון ← חיתוך עם buffer של ways של OSM ← `canopy_pct` לכל way. אין צורך בשעה: חופה מעל המדרכה מצלה ברוב שעות היום. זה הבסיס לפיילוט ב-§10.

### 3.2 Open Tree Base (הסדנא לידע ציבורי) ✅
- **URL:** https://opentreebase.datacity.org.il (CKAN, 26 מאגרים). שני מאגרים מעובדים רלוונטיים:
  - `canopies_processed`: חופות מפ"י אחרי איחוד כפילויות והמרה ל-WGS84, GeoJSON. https://opentreebase.datacity.org.il/dataset/canopies_processed
  - `trees_processed`: מאגר עצים מאוחד (סקרים רגליים + עצים שנגזרו מחופות מפ"י בשטח 4-200 מ"ר), CSV/GeoJSON, עדכון 22.12.2025. https://opentreebase.datacity.org.il/dataset/trees_processed
  - סקרי עצים: ירושלים 2022 (~70% מתוכנית העבודה, מרחב ציבורי בלבד), באר שבע, ג'לג'וליה.
- **רישיון:** ODbL (מוצג על כל מאגר). ODbL מתיר שימוש מסחרי, אבל מחייב ייחוס ו-share-alike על **מסד נתונים נגזר שמופץ**. שימוש פנימי לניתוב סביר שאינו "הפצה" ⚠️ (פרשנות, לא ייעוץ משפטי).
- **מאמץ:** **נמוך.** GeoJSON ב-WGS84 מוכן. כדאי להעדיף אותו על פני ה-ZIP הגולמי של מפ"י.

### 3.3 תל אביב-יפו: שרת GIS עירוני ✅
- **URL:** https://gisn.tel-aviv.gov.il/arcgis/rest/services/IView2/MapServer (ArcGIS 11.1, `capabilities: Query,Map,Data`, `maxRecordCount 2000`, כך שצריך לדפדף).
- שכבות רלוונטיות (ספירה ב-`returnCountOnly`, CRS EPSG:2039):

| id | שכבה | גאומטריה | ספירה | שדות עיקריים |
|---|---|---|---:|---|
| 574 | חופות עצים 2024 | Polygon | 159,863 | `date_import` |
| 628 | עצים | Point | 39,312 | `tree_name`, `scientific_name`, `treatment`, `electricity` |
| 865 | עצים מיוחדים | Point | — | — |
| 551 | שטחים ירוקים וגנים ציבוריים | Polygon | — | — |

- **רישיון:** ⚠️ לפורטל OpenData TLV יש מדיניות "free to share and adapt our data for any purpose, provided you give the appropriate credit". https://opendatasource.tel-aviv.gov.il/en/Pages/faq.aspx . **לא ברור שהיא חלה על שכבות IView2** (שרת ה-GIS, לא הפורטל). לפני שימוש: לבקש אישור בכתב מ-tlvopendata@tel-aviv.gov.il (הכתובת מופיעה ב-https://opendatasource.tel-aviv.gov.il/en).
- **עדכון:** שדה `date_import`. החופות מתוארכות 2024. קצב עדכון לא מפורסם ⚠️.
- **מאמץ:** **נמוך.** REST query → GeoJSON (`outSR=4326`), כ-80 עמודים × 2000 לחופות.

### 3.4 באר שבע: data.gov.il ✅
- **עצים:** https://data.gov.il/dataset/trees-br7. **59,571** רשומות (datastore), שדות `plate_num, tree_speci, street_nam, neighborho, itm_x, itm_y, lat, lon`. פורמטים SHP/GeoJSON/CSV/KML/XLSX, ב-WGS84 וב-ITM. `Frequency: Day`, עודכן 18.10.2026.
- **רישיון:** "Other (Open)" (§3.1). **מאמץ:** **נמוך מאוד** (CSV עם lat/lon). **איכות:** נקודות בלי גודל חופה, ולכן צריך רדיוס הנחה או צירוף לחופות מפ"י.

### 3.5 קריית ים: ArcGIS Online ציבורי ✅
- Web Map ציבורי "קריית ים - מפה ציבורית" (https://experience.arcgis.com/experience/11fa7c85ea1142aab192d60c6fbd465d) ו-**Web Scene תלת-ממדי** עם שכבות "מבנים", "הצללות", "עלי עץ", "בולי עץ" (SceneServer) תחת `services8.arcgis.com/0xryktpT5K9G0YMM`.
- שכבת מבנים (FeatureServer `מפת_התמצאות_WFL1/10`) כוללת `HEIGHT`, `BLDG_HT`, `HT_LAND`, `DATA_YEAR`. נראה כמו סכמת מבנים טופוגרפית בסגנון מפ"י ⚠️ (השערה לפי שמות השדות).
- **רישיון:** לא צוין (`licenseInfo` ריק). **שכבת עצים כ-FeatureServer:** לא נמצאה, רק SceneServer (מודלים תלת-ממדיים, קשה לחילוץ). **מאמץ:** בינוני. לקוח OUT, ולכן מועמד טוב לפנייה.

### 3.6 מפות הצל של הטכניון (ד"ר אור אלכסנדרוביץ): כבר "צל לכל מקטע רחוב" ✅/⚠️
- **מה זה:** מפות צל ברזולוציה גבוהה (בניינים + עצים), ו**מדד צל (Shade Index)** של 0-1: שיעור הקרינה הקיצית היומית שנחסמת לפני שהיא מגיעה לקרקע. לפי הדף, עבור "almost 20 cities". https://oraleks.net.technion.ac.il/en/shade-maps/
- **שכבות ציבוריות שנבדקו** (ArcGIS Online של `oraleks@technion.ac.il_Technion_GIS`):
  - ת"א: `TLV_shade_index_d218_street_segments_2019`, **7,239** פוליגוני מקטע רחוב עם `Street_ID, Shade_Index` (CRS 2039). https://services1.arcgis.com/yAQXemoDSgzdfV2A/arcgis/rest/services/TLV_shade_index_d218_street_segments_2019/FeatureServer/0 · דשבורד: https://www.arcgis.com/apps/dashboards/6cb98bc950af440b90d3037ab3327edc
  - באר שבע: `BSV_street_SI`, **5,803** פוליגונים עם `summer_SI`. בנוסף `BSV_Street_tree_canopy_cover_ratio`, `BSV_tree_canopies_2021`, `BSV_building_footprints`, וקרינה מצטברת קיצית (tiles). https://services1.arcgis.com/yAQXemoDSgzdfV2A/arcgis/rest/services/BSV_street_SI/FeatureServer/83 · https://experience.arcgis.com/experience/c7dc3d6facc14e508e2b24c7cc62d1a2/
  - פתח תקווה: https://experience.arcgis.com/experience/3521b02a320f4609a5f77a98d5cbc7e3 (השכבות לא נבדקו).
  - ערים נוספות מופיעות בדף רק בקיצורים (AKR, HOL, ELT, NTV, RAN, HRZ) ⚠️.
- **רישיון:** **לא צוין** (`licenseInfo` ריק). "public" ב-ArcGIS פירושו נגיש לצפייה, לא מורשה לשימוש. **חובה לקבל אישור.**
- **מגבלה:** מדד **יומי-קיצי** אחד, לא לפי שעה. מת"א 2017/2019, כך שהוא מיושן.
- **ערך:** זה כמעט בדיוק השדה שאנחנו צריכים ל-MVP של "צל ביום". הכלי לחישוב (Grasshopper) נמצא ב-https://github.com/oraleks/Kikayon (ללא רישיון ב-GitHub ✅).
- **מאמץ:** נמוך אחרי אישור (פוליגון ← way של OSM). **פנייה:** מומלצת מאוד. אפשר גם לשקול שיתוף פעולה לחישוב לפי שעה.

### 3.7 נתוני לוויין גלובליים (לכיסוי ערים בלי נתונים)

| מקור | רזולוציה | מה | רישיון | גישה | הערות |
|---|---|---|---|---|---|
| **Meta/WRI CHM v1** ✅ | תת-מטרית (שם המאמר "Sub-meter resolution canopy height maps") ⚠️ | גובה חופה | **CC BY 4.0** | `s3://dataforgood-fb-data/forests/v1/alsgedi_global_v6_float/` (us-east-1, `--no-sign-request`). https://registry.opendata.aws/dataforgood-fb-forests/ | דימות Maxar (קרדיט "© 2016 Maxar"), גלובלי. COG/GeoTIFF + GeoJSON עם תאריכי תצפית |
| **Meta/WRI CHMv2** ✅ | ⚠️ לא מצוין בדף | גובה חופה (DINOv3) | **CC BY 4.0** | `s3://dataforgood-fb-data/forests/v2/global/dinov3_global_chm_v2_ml3/`. https://registry.opendata.aws/dataforgood-fb-forestsv2 | עדכון "TBD". מומלץ לבדוק תאריכי דימות לישראל |
| **ETH Global Canopy Height 2020** | 10 מ' | גובה חופה (Sentinel-2 + GEDI) | **CC BY 4.0** | GEE `users/nlang/ETH_GlobalCanopyHeight_2020_10m_v1`. https://gee-community-catalog.org/projects/canopy/ | 10 מ' גס מדי לעץ רחוב בודד. https://arxiv.org/abs/2204.08322 |
| **ESA WorldCover** | 10 מ' | מחלקת "Tree cover" (ערך 10) | **CC BY 4.0** | https://developers.google.com/earth-engine/datasets/catalog/ESA_WorldCover_v200 | 2020/2021. בינארי בלי גובה |

**שימוש מומלץ:** CHM של Meta הוא fallback לערים בלי שכבה עירונית, וגם מקור **לגובה** חופה (שחסר במפ"י) לחישוב צל לפי שעה. **מאמץ:** בינוני (raster, צריך GDAL ו-zonal stats לאורך edges).

### 3.8 קק"ל ❌
לא נמצא פורטל GIS פתוח של קק"ל. יש רק טבלאות סטטיסטיות של שטחי יער (https://ea.kkl-jnf.org/kkl-jnf-forest-data). לשבילי יער: חופות מפ"י (אזור בנוי בלבד) לא מכסות. ESA WorldCover או CHM של Meta כן.

---

## 4. מבנים וגבהים

### 4.1 תל אביב-יפו: מבנים עם גובה ו-DSM ✅ (הכי טוב בארץ שמצאנו)
- שכבה 513 "מבנים" (וגם 808 "הצללת מבנים חדש", אותה סכמה): **45,795** פוליגונים, EPSG:2039. https://gisn.tel-aviv.gov.il/arcgis/rest/services/IView2/MapServer/513
- שדות: `ms_komot` (קומות), `gova_simplex_2019` (גובה מבנה), `min_height`, `max_height` (גובה גג), `dsm_mean`, `dsm_max`, `gova_mpi_2009`, `year`.
- **רישיון:** כמו §3.3 ⚠️. **מאמץ:** נמוך (REST). זה מאפשר חישוב צללי מבנים לפי שעה בת"א **כבר עכשיו**.

### 4.2 באר שבע: מבנים עם קומות ✅
- https://data.gov.il/dataset/buildings-br7. **26,312** רשומות. שדות `floors, Used, Entrances, appartment`. `Frequency: Month`. הערת המאגר: נבנה מצילום אוויר 2005 + עדכוני טופס 4. "לאינדיקציה בלבד".
- **גובה:** רק קומות, ולכן צריך המרה (~3 מ'/קומה, הנחה ⚠️). **מאמץ:** נמוך.

### 4.3 קריית ים: `BLDG_HT` ✅
ראו §3.5. **מאמץ:** נמוך-בינוני. הרישיון לא צוין.

### 4.4 OSM
- **כיסוי:** 4.2% `building:levels`, 0.85% `height` בישראל (§2). ת"א 12.6%. **רישיון:** ODbL. **עדכון:** יומי (Geofabrik, כבר בצנרת השבועית שלנו, `infra/graphhopper/README.md` שלב 7).
- **מאמץ:** אפסי לגאומטריה (כבר ב-PBF). לגבהים: fallback לפי סוג (`building=house` ← 2 קומות וכד', הנחה).

### 4.5 מאגרים גלובליים

| מקור | גובה? | ישראל? | רישיון | הערות |
|---|---|---|---|---|
| **Overture Maps buildings** ✅ | שדה `height` (ממוזג) | גלובלי. מקורות: OSM (עדיפות ראשונה), Esri Community Maps, Microsoft, Google | **ODbL** | Release חודשי. `s3://overturemaps-us-west-2/release/2026-09-23.1/theme=buildings/…`. https://docs.overturemaps.org/guides/buildings . כיסוי הגובה בישראל ⚠️ לא נבדק. סביר שהוא קרוב ל-OSM |
| **Microsoft Global ML Building Footprints** | "tens of millions of height estimates" גלובלית ⚠️ | ⚠️ | ODbL | https://www.microsoft.com/en-us/maps/building-footprints |
| **Google Open Buildings 2.5D Temporal** | כן (4 מ' אפקטיבי) | **❌ כנראה לא.** הכיסוי: אפריקה, דרום ודרום-מזרח אסיה, אמריקה הלטינית | CC BY 4.0 / ODbL | https://developers.google.com/earth-engine/datasets/catalog/GOOGLE_Research_open-buildings-temporal_v1 |
| **GHSL GHS-BUILT-H R2023A** | גובה ממוצע ל-100 מ' | כן | EC reuse (חופשי עם ייחוס) ⚠️ | https://developers.google.com/earth-engine/datasets/catalog/JRC_GHSL_P2023A_GHS_BUILT_H . 100 מ' לא שמיש לצל לרחוב, רק ל-fallback "עירוני צפוף/לא" |

### 4.6 מפ"י: DSM/DTM/מודל תלת-ממדי ❌/⚠️
לא נמצא מוצר DSM או מבנים-עם-גובה של מפ"י כמידע פתוח. ארגון "המרכז למיפוי ישראל" ב-data.gov.il מפרסם 117 מאגרים (קדסטר, תצלומי אוויר 2015 ברזולוציה 2 מ', שכבת דרכים, נחלים וכו'), **בלי מבנים ובלי DSM** (נבדק ב-`package_search?fq=organization:israel_mapping_center`, 21.10.2026). הגובה העירוני שקיים בפועל (ת"א `gova_mpi_2009`, קריית ים `BLDG_HT`) מרמז שמפ"י מספק נתונים לרשויות, אבל לא לציבור ⚠️. **ערוץ אפשרי:** בקשה ממפ"י או דרך הרשות הלקוחה.

---

## 5. חישוב צל לכל מקטע רחוב לפי שעה

### 5.1 גישה מוצעת (תכנון, לא קוד)
1. **דליים של זמן:** לדוגמה 07, 09, 11, 13, 15, 17, 19 (שעון ישראל) × 2 עונות (קיץ/חורף, או 4). כל דלי הוא ערך נפרד לכל edge או way: `shade_h09_summer ∈ [0,1]`.
2. **מיקום השמש:** אזימוט וגובה לפי תאריך ייצוגי ושעה. ספריות: **SunCalc** (JS, BSD-2-Clause, https://github.com/mourner/suncalc ✅) או **pvlib** (Python, BSD-3-Clause, https://github.com/pvlib/pvlib-python ✅).
3. **צללי מבנים:** לכל מבנה עם גובה h, הטלה של הפוליגון בכיוון האזימוט ההפוך באורך `h / tan(altitude)`. איחוד של footprint והטלה = פוליגון צל. כלי מוכן: **pybdshadow** (Python, BSD-3-Clause, https://github.com/ni1o1/pybdshadow ✅, תיעוד https://pybdshadow.readthedocs.io). מבוסס suncalc, דורש geopandas, התיעוד ממליץ על Python 3.7-3.9 ⚠️.
4. **צל עצים:** (א) **סטטי**: חופה מעל נקודת הדגימה נחשבת צל בכל השעות שבהן השמש גבוהה. זה פשוט, ומספיק ל-MVP. (ב) **דינמי**: חופה עם גובה (Meta CHM) מוטלת כמו מבנה.
5. **דגימה לאורך edge:** נקודה כל ~5-10 מ' על ציר ה-way. אפשר גם להזיז ל"מדרכה" (±4-6 מ'), כי לפי CoolWalks הצל שונה מאוד בין שני צדי הרחוב. `shade = נקודות בצל / סה"כ`.
6. **פלט:** CSV של `osm_way_id, shade_h07_s, shade_h09_s, …` (כמו פורמט ה-Csv של openrouteservice, §7).

**חלופה raster:** DSM סינתטי ברזולוציה של 1 מ' (גובה מבנים + גובה חופה) ← shadow mask לכל מיקום שמש (ray-march או `r.sun`/UMEP) ← zonal stats לאורך edges. מדויק יותר, אבל כבד יותר בחישוב. **UMEP** (QGIS, GPL-3.0 ✅, https://github.com/UMEP-dev/UMEP) משמש למפות צל במחקר. הרישיון GPL מתאים לכלי offline, לא לקוד שמוטמע במוצר.

### 5.2 פרויקטים קיימים ללמוד מהם

| פרויקט | מנוע | מה לקחת | מקור |
|---|---|---|---|
| **Shade-optimized routing (IMT Atlantique, נאנט)** | **GraphHopper fork** | סקריפט Python מ-PBF (osmium) מחשב `shade:percentage` לכל way מגבהי מבנים, עצים ושמש. Fork של GH מפרסר את התג ל-EV. Profile JSON. **בלי תלות בשעה** (פער שהם עצמם מציינים) | https://www.openstreetmap.org/user/zorun/diary/406587 · https://github.com/Mehdialaoui02/graphhopper_IMTA (Apache-2.0 ✅) · https://github.com/Jihene556/procom_calcul · דמו https://shaderoutingosm.polyno.me/ |
| **shaded.ors (HeiGIT, היידלברג)** | openrouteservice (נגזר מ-GH) | DSM/DTM + OSM + קרינה ומזג אוויר ← צל. מתוכנן API חינמי ⚠️ | https://en.reset.org/shady-routes-in-times-of-climate-crisis-how-a-routing-app-protects-against-heat-stress/ · https://shaded.openrouteservice.org |
| **openrouteservice `ext_storages.Csv`** | ORS | **פורמט מוכח:** "First column is the OSM way id; later columns are named float values in [-1, 1]", ובחירת עמודה לכל בקשה (`csv_column`). זה בדיוק "צל לפי שעה". ORS ברישיון GPL-3.0, אז לוקחים את הרעיון ולא את הקוד | https://giscience.github.io/openrouteservice/run-instance/configuration/engine/profiles/build |
| **CoolWalks (ברצלונה + מאמר)** | — | LiDAR, וחישוב צל **לכל מדרכה בנפרד**. המאמר מראה שעל רשת סדירה עם גובה אחיד אין יתרון לניתוב צל, ושגבהים מגוונים יוצרים יתרון | https://www.freethink.com/environment/cool-walks · https://pure.itu.dk/en/publications/coolwalks-for-active-mobility-in-urban-street-networks/ |
| **Kikayon (הטכניון)** | Grasshopper | חישוב צל רחובות, אותו צוות כמו §3.6 | https://github.com/oraleks/Kikayon |
| **CityShadeMapper** | R | מפות צל מ-LiDAR + נתיב מקסימום צל | https://pakillo.r-universe.dev/CityShadeMapper/doc/manual.html |

### 5.3 הערכת עלות חישוב (⚠️ הערכה, לא מדידה)
ישראל: כ-352 אלף ways רלוונטיים (§2). 7 שעות × 2 עונות = 14 ערכים לכל way. עם צללי מבנים וקטוריים, הכבד הוא ת"א וירושלים. חישוב **offline שבועי** (אותו cadence כמו בניית ה-graph, `infra/graphhopper/README.md` שלב 7) על VM של Cloud Build סביר. זמני ריצה אמיתיים יימדדו בפיילוט.

---

## 6. תאורת רחוב

### 6.1 OSM `lit`
- **כיסוי:** 2.6% מהדרכים בישראל, ת"א 9.3%, שדרות 0% (§2). `highway=street_lamp`: 5,968 נקודות בכל הארץ.
- **GraphHopper:** `lit` הוא EV מובנה **רק ב-master** (§1). ב-11.1 אין.
- **לקח קיים אצלנו:** "לא מתויג" ≠ "לא מואר". ה-pipeline שלנו כבר מבחין בכך (`scripts/lib/route-lighting-street-segments.node.ts:8-29`). ב-GH, `lit` בוליאני (`SimpleBooleanEncodedValue(KEY, false)`, https://github.com/graphhopper/graphhopper/blob/master/core/src/main/java/com/graphhopper/routing/ev/Lit.java) מתמוטט ל-false גם עבור לא-מתויג. **לכן בלילה עדיף "לתגמל מואר" מאשר "להעניש לא-מואר"**, עד שיהיה כיסוי.

### 6.2 שכבות פנסים עירוניות

| רשות | מקור | ספירה | פורמט / CRS | רישיון | עדכון |
|---|---|---:|---|---|---|
| **באר שבע** ✅ | https://data.gov.il/dataset/street-light-br7 ("עמודי תאורה") | **29,856** (שדות `Lampost, centerligh, LED, NearAddres, lat, lon`) | SHP/GeoJSON/CSV/KML, WGS84 + ITM | Other (Open) ⚠️ | `Month`, עודכן 18.10.2026 |
| **תל אביב-יפו** ✅ | IView2 שכבה 997 "פנסים", https://gisn.tel-aviv.gov.il/arcgis/rest/services/IView2/MapServer/997 | **3,295** עמודים (שדות `t_sug`, `ms_panasim` = מספר פנסים לעמוד) | Point, EPSG:2039 | ⚠️ כמו §3.3 | ⚠️ |
| שאר הערים | ❌ לא נמצא | | | | |

⚠️ **איכות ת"א:** 3,295 עמודים נראה **חלקי** לעיר בגודל ת"א (השערה, לא נבדק מול נתון רשמי). ייתכן שהשכבה כוללת רק סוג מסוים (מרכזיות/עמודי עירייה), בעוד חלק מהתאורה על עמודי חברת החשמל. מבקר המדינה מציין ש"רוב תאורת הרחוב על עמודי חשמל של חח"י", ושלחלק מהרשויות אין מידע מלא על העמודים. https://library.mevaker.gov.il/sites/DigitalLibrary/Pages/Reports/407-9.aspx ⚠️ (סיכום משני). **צריך לבדוק מול צילום רחוב לפני שימוש.**

**הפיכה ל-`lit` לכל edge:** edge נחשב מואר אם יש עמוד בטווח ~20-30 מ' מכל נקודת דגימה (פרמטר להכרעה, הנחה ⚠️). את התוצאה ממזגים עם OSM `lit=yes` (OR) ועם `lit=no` (גובר).

### 6.3 לווייני אורות לילה (proxy גס)

| מקור | רזולוציה | רישיון | גישה | הערות |
|---|---|---|---|---|
| **NASA Black Marble VNP46A2** ✅ | 15 arc-sec (~500 מ') | נתוני NASA: "no restrictions on the use", CC0 לנתונים בלי רישיון אחר. אסור לרמוז על endorsement. https://www.earthdata.nasa.gov/engage/open-data-services-software-policies/data-use-guidance | LAADS / GEE. https://viirsland.gsfc.nasa.gov/Products/NASA/BlackMarble.html · כלי: BlackMarblePy (MPL-2.0) https://pypi.org/project/blackmarblepy | 500 מ' **לא מבחין בין רחובות**. שמיש רק כ-prior "שכונה מוארת/חשוכה" או לשבילים בין-עירוניים |
| **SDGSAT-1 Glimmer Imager** | 10 מ' PAN / 40 מ' MS | ⚠️ לא נמצא נוסח רישיון | הרשמה ב-www.sdgsat.ac.cn, מכסה של 20 תמונות, הרחבה דורשת הצעת מחקר. https://sdgs.un.org/sites/default/files/2025-08/CBAS%20SDGSAT-1%20User%20Manual.pdf | 10 מ' כבר מבחין ברחובות, אבל רישוי וגישה לא ודאיים. לא מומלץ לשלב ראשון |

---

## 7. הטמעה ב-GraphHopper: ערוצים לפי מאמץ

רקע: מ-GH 9.0 ה-`EncodedValueFactory`/`TagParserFactory` הוחלפו ב-`ImportRegistry` (#2935), ו-EVs שבשימוש ב-custom model נוספים אוטומטית. https://github.com/graphhopper/graphhopper/blob/master/CHANGELOG.md . להוספת EV משלך: "It is not yet possible without modifying the source code" (karussell, 12.2024). הדרך המומלצת: להעתיק EV ו-parser קיימים ולרשום אותם ב-`DefaultImportRegistry`. https://discuss.graphhopper.com/t/how-to-add-custom-osm-tags-as-encoded-values-without-modifying-the-graphhopper-source/9256 . מדריך ה-custom models (שפה, אופרטורים, `areas`): https://github.com/graphhopper/graphhopper/blob/master/docs/core/custom-models.md

| # | ערוץ | Java? | import מחדש? | לפי שעה? | מאמץ | מתי |
|---|---|---|---|---|---|---|
| **A** | **`areas` לכל בקשה** (כמו `preferParks` היום): השרת שלנו בונה MultiPolygon של "מקטעים מוצלים בשעה H" לאזור הבקשה, וכלל `!in_shade ×0.7` | לא | לא | **כן**, השרת בוחר את השכבה לפי השעה | **נמוך** | MVP |
| **B** | `custom_areas.directory`: קבצי GeoJSON שנקראים ב-import וזמינים ל-custom models כ-`in_<id>` | לא | כן (שבועי ממילא) | חלקי (area לכל דלי שעה) | נמוך-בינוני | אחרי MVP. ⚠️ ביצועים עם אלפי פוליגונים לא נבדקו. https://github.com/graphhopper/graphhopper/blob/11.1/config-example.yml (סעיף Custom Areas) |
| **C** | **הזרקת תגים ל-PBF + שדרוג ל-GH master** (בשביל `lit` מובנה): osmium מוסיף `lit=yes` ל-ways שזוהו כמוארים מפנסים עירוניים, לפני ה-import | לא | כן | לא (תאורה לא תלויה בשעה) | בינוני (שדרוג מ-11.1 ל-master או ל-12 כשתצא, עם בדיקות regression ב-`/admin/routes/quality`) | תאורה, שלב 2 |
| **D** | **EVs מותאמים ב-Java (`ImportRegistry`)**: `shade_h09_s` וכו' כ-`DecimalEncodedValue`, נקראים מ-CSV לפי OSM way id (רעיון ה-Csv של ORS). ב-11.1 יש כבר `OSMWayID` ב-registry | **כן** (מודול קטן + build של image) | כן | **כן** | בינוני-גבוה | הפתרון ה"נכון" לטווח ארוך |
| E | Fork מלא (כמו IMTA) | כן | כן | כן | גבוה + תחזוקת fork | לא מומלץ |

**הערות טכניות:**
- **גרנולריות:** CSV לפי way id נותן ערך אחד לכל way של OSM, ו-way ארוך מקבל ממוצע. GH מפצל ways ל-edges בצמתים, אבל ה-parser רואה way. לפתרון מדויק יותר: לפצל ways ארוכים ב-preprocess, או לחשב לפי edge אחרי import (מורכב יותר) ⚠️.
- **ערוץ A ומגבלות גודל:** `max_request_header_size: 200k` מוגדר אצלנו (`infra/graphhopper/config.yml`). הגבלת **גוף** הבקשה לא נבדקה ⚠️. MultiPolygon עירוני של אלפי פוליגונים צריך פישוט או buffer. מומלץ לחתוך לפי bbox הבקשה ולמדוד latency.
- **שעה ועונה:** בערוצים A ו-D הבחירה בצד השרת שלנו (`/api/routes/generate`): השעה המתוכננת של הריצה ← דלי ← שכבה או עמודה.
- **פרופילים:** רק `foot`/`out_run` (וכנראה `bike`) צריכים צל. אין צורך לשנות את `mtb`.

---

## 8. אילו רשויות עם GIS פתוח ואילו לא (קלט לרעיון ה-GIS-outreach)

| רשות | פורטל פתוח / GIS | עצים | מבנים + גובה | תאורה | צל (טכניון) | הערה / פעולה |
|---|---|---|---|---|---|---|
| **תל אביב-יפו** | ✅ שרת ArcGIS עם query (https://gisn.tel-aviv.gov.il/arcgis/rest/services) + פורטל https://opendatasource.tel-aviv.gov.il | ✅ 39K נק' + 160K חופות 2024 | ✅ `max_height`, DSM | ⚠️ 3.3K עמודים (חלקי?) | ✅ 2017/2019 | לבקש אישור שימוש בשכבות IView2 |
| **באר שבע** | ✅ data.gov.il (ארגון `beer-sheva`) | ✅ 59.6K, יומי | ✅ קומות | ✅ 29.9K, חודשי | ✅ | **המוכנה ביותר.** פיילוט |
| **ירושלים** | ⚠️ פורטל CKAN https://jerusalem.datacity.org.il (ODbL) בלי עצים, מבנים או תאורה. סקר עצים 2022 דרך Open Tree Base | ⚠️ ~70% | ❌ | ❌ | ❌ | פנייה. `jergisng.jerusalem.muni.il` מחזיר 403 |
| **חיפה** | ⚠️ פורטל CKAN https://opendata.haifa.muni.il (ODbL): מבנים לשימור בלבד, תשתיות כשנתון PDF | ❌ | ❌ | ❌ (רק בשנתון) | ❌ | פנייה. חיפה כבר עם `lit` applied אצלנו מ-OSM |
| **פתח תקווה** | ⚠️ ArcGIS Hub https://muni-petah-tikva.opendata.arcgis.com, מאגר אחד בלבד (ייעודי קרקע); 4 XLSX ב-data.gov.il | ❌ | ❌ | ❌ | ✅ (Experience) | פנייה + טכניון |
| **קריית ים** | ✅ ArcGIS Online ציבורי (Web Map + 3D Scene), בלי רישיון מוצהר | ⚠️ רק תלת-ממד | ✅ `BLDG_HT` | ❌ | ❌ | לקוח. לבקש ייצוא + רישיון |
| **אשקלון** | ⚠️ צפייה בלבד, GISNET V5 של Complot (https://v5.gis-net.co.il/v5/Ashkelon) | ⚠️ לא נבדק | ⚠️ | ⚠️ | ❌ | צופה בלבד, בלי רישיון פתוח. פנייה |
| **שדרות** | ⚠️ צפייה בלבד, GISNET V5 (https://v5.gis-net.co.il/v5/Sderot) | ⚠️ | ⚠️ | ⚠️ | ❌ | OSM `lit`=0%. פנייה (רשות פיילוט שלנו) |
| **ראשון לציון** | ❌ לא נמצא פורטל או GIS ציבורי | | | | | פנייה |
| **מעלה אדומים** | data.gov.il (מבני ציבור CSV) | ❌ | ❌ | ❌ | ❌ | — |
| **כפר סבא** | ⚠️ פורטל CKAN קיים לפי https://ecosystem.ckan.org/site/open-information-kfar-saba (כתובת הפורטל וה-API לא אומתו) | ⚠️ | ⚠️ | ⚠️ | ⚠️ | לבדוק |
| ערים בקיצורי הטכניון (AKR, HOL, ELT, NTV, RAN, HRZ) | — | — | — | — | ✅/⚠️ | לזהות מול הטכניון |

**דפוס לפנייה:** רוב הרשויות מחזיקות GIS (לרוב ESRI או Complot) עם שכבות עצים, תאורה ומבנים לצורכי תחזוקה, אבל לא מפרסמות אותן. בקשה ממוקדת ("SHP/GeoJSON של עמודי תאורה, סקר עצים ומבנים עם קומות, ברישיון שמתיר שימוש בשירות ניווט") עם הצבעה על באר שבע כתקדים (מפרסמת הכול ב-data.gov.il) היא ה-pitch הטבעי.

---

## 9. פריטים לא מאומתים (לבדיקה לפני הסתמכות)
1. **נוסח תנאי השימוש של data.gov.il.** ה-API מציג "Other (Open)". הנוסח הרשמי לא אותר (‎`/terms` מחזיר 404). מקורות משניים מתארים שימוש חופשי לכל מטרה חוקית עם ייחוס.
2. **רישיון שכבות IView2 של ת"א** (שרת GIS ≠ פורטל OpenData).
3. **רישיון מפות הצל של הטכניון.** לא מוצהר, ולכן שימוש רק אחרי אישור.
4. **רישיון קריית ים.** לא מוצהר.
5. **שלמות שכבת הפנסים של ת"א** (3,295).
6. **פורמט ו-CRS בתוך ה-ZIP של מפ"י** (לא הורד, 342MB).
7. **רזולוציה ותאריכי דימות של Meta CHMv2 בישראל.**
8. **כיסוי `height` של Overture בישראל.**
9. **חיפה ב-OSM** (Overpass לא החזיר).
10. **ביצועי `custom_areas` ו-`areas` גדולים ב-GH** (גודל גוף בקשה, latency).
11. **pybdshadow על Python עדכני** (התיעוד ממליץ על 3.7-3.9).
12. **רישיון SDGSAT-1.**

---

## 10. צעד ראשון מומלץ

**"צל עצים סטטי" בבאר שבע ות"א, דרך ערוץ A (בלי Java, בלי import חדש):**
1. **נתון:** `canopies_processed` (Open Tree Base, GeoJSON WGS84, §3.2) + עצי באר שבע (§3.4). חופות ת"א 2024 (§3.3) רק אחרי אישור העירייה.
2. **חישוב offline (סקריפט read-only שמייצר קובץ, בלי כתיבה ל-Firestore):** לכל way רגלי של OSM בעיר: buffer של ±5 מ' ← `canopy_pct` = שטח חופה ∩ buffer / שטח ה-buffer. הסף "מוצל" (למשל ≥40%) להכרעה ⚠️.
3. **ערוץ:** union של ה-ways המוצלים ← MultiPolygon פשוט לכל עיר ← `preferShade` ב-`buildCustomModel`, באותה תבנית של `preferParks` (`src/lib/routing/graphhopper/custom-model.ts:30-31,55-63`), מאחורי דגל חדש (fail-closed).
4. **מדידה:** השוואת A/B ב-`/admin/routes/quality`: אחוז אורך מוצל לפני ואחרי, ומחיר באורך ובאיכות (route-quality v1).
5. **במקביל (לא חוסם):** (א) פנייה לטכניון בבקשת רישיון ל-Shade Index לכל מקטע (ת"א, באר שבע, פ"ת + הרשימה), ושיתוף פעולה אפשרי על חישוב לפי שעה; (ב) פנייה לת"א בבקשת אישור לשכבות IView2 (מבנים עם גובה, חופות 2024, פנסים).
6. **שלב 2:** צללי מבנים לפי שעה בת"א (מבנים 513 + SunCalc/pybdshadow) ← CSV לפי way id ← ערוץ D (`ImportRegistry`). תאורה: פנסי באר שבע ← `lit` דרך ערוץ C (או D).

**למה זה הצעד הראשון:** הנתון פתוח ומוכן (WGS84), הערוץ כבר קיים בקוד ומוכח (`preferParks`), אין שינוי בתשתית GraphHopper, וזה נותן את רוב הערך ("רחובות עם עצים") לפני שמשקיעים בצללי מבנים לפי שעה.

---

### נספח: איך נאספו המספרים (לשחזור)
- CKAN: `https://data.gov.il/api/3/action/package_search?q=…`, `package_show?id=…`, `datastore_search?resource_id=…&limit=1` (שדה `total`). אותו הדבר ב-`opentreebase.datacity.org.il`, `jerusalem.datacity.org.il`, `opendata.haifa.muni.il`.
- ArcGIS: `…/MapServer?f=json` (רשימת שכבות), `…/MapServer/<id>?f=json` (שדות, CRS), `…/query?where=1%3D1&returnCountOnly=true&f=json`. מפות ArcGIS Online: `https://www.arcgis.com/sharing/rest/content/items/<id>/data?f=json`.
- Overpass: `out count` על `area["ISO3166-1"="IL"]` ועל `is_in(lat,lon)` + `admin_level=8` לכל עיר.
