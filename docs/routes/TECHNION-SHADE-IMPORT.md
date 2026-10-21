# ייבוא מפות הצל של הטכניון (מעבדת אלכסנדרוביץ) כשכבת צל: RC5

**תאריך:** 21.10.2026 · **ענף:** `feat/routes-technion-shade-import` · **המשך של:** `docs/routes/SHADE-LIGHT-DATA.md` §3.6

## 1. הרשאה וייחוס

- **מקור:** `Aleksandrowicz lab, Technion — shade maps`, https://oraleks.net.technion.ac.il/en/shade-maps/
- **הרשאה:** `verbal, via David Shachar Movshovitz, 21.10.2026 — written confirmation pending`. דוד מסר שד"ר אור אלכסנדרוביץ אמר לו שהשימוש במפות בסדר. **אישור בכתב עדיין חסר.** כדאי לקבל אותו לפני שמשהו מהשכבה מוצג למשתמשים.
- **טקסט ייחוס (חובה בכל מקום שמוצג בו צל מהשכבה):** "Shade data: Dr. Or Aleksandrowicz, Faculty of Architecture and Town Planning, Technion"
- שלושת הערכים נמצאים ב-`src/lib/shade/technion-layers.ts` (`TECHNION_SOURCE`, `TECHNION_PERMISSION`, `TECHNION_ATTRIBUTION`). הם נכתבים ל-`manifest.json`, ל-metadata של כל אובייקט ב-Storage, ולכל קובץ פלט.
- ב-ArcGIS, השדה `licenseInfo` ריק בכל השכבות. "public" שם פירושו רק שאפשר לצפות בשכבה.

## 2. מה הורד

כל השכבות נמצאות בתוכן הציבורי של `oraleks@technion.ac.il_Technion_GIS` (ארגון `yAQXemoDSgzdfV2A`). איתרתי אותן כך: חיפוש Web Maps של הבעלים ← בכל עיר מפת "<City> Shade and Tree Maps" ← השכבה "<CODE> street summer shade index". כל השכבות ציבוריות, ו**אף שכבה לא דרשה token**.

| עיר | קוד | שכבה (FeatureServer) | שנת נתונים | פוליגונים במקור | מקטעים בפלט | נזרקו (גאומטריה ריקה) | SI ממוצע |
|---|---|---|---|---|---|---|---|
| תל אביב-יפו | TLV | `TLV_street_summer_shade_index_2022/222` | 2022 | 8,441 | 8,441 | 0 | 0.279 |
| באר שבע | BSV | `BSV_street_SI/83` | 2022 | 5,803 | 5,802 | 1 | 0.075 |
| פתח תקווה | PTV | `PTV_street_summer_shade_index/778` | 2022 | 3,093 | 3,087 | 6 | 0.212 |
| חיפה | HAI | `HAI_street_SI_and_TCC/15` | 2022 | 13,389 | 10,658 | 2,731 | 0.127 |
| אילת | ELT | `ELT_street_summer_shade_index/301` | ⚠️ לא צוין | 2,252 | 2,251 | 1 | 0.104 |
| הרצליה | HRZ | `HRZ_street_summer_shade_index/710` | ⚠️ לא צוין | 2,122 | 2,122 | 0 | 0.254 |
| רעננה | RAN | `RAN_street_summer_shade_index/298` | ⚠️ לא צוין | 1,389 | 1,389 | 0 | 0.246 |
| הוד השרון | HDS | `HDS_street_summer_shade_index/746` | ⚠️ לא צוין | 1,575 | 1,575 | 0 | 0.234 |
| נס ציונה | NSZ | `NSZ_street_summer_shade_index/738` | 2022 | 1,414 | 1,413 | 1 | 0.193 |
| שדרות | SDR | `SDR_street_summer_shade_index/821` | 2023 | 1,467 | 1,467 | 0 | 0.084 |
| פרדס חנה-כרכור | PHK | `PHK_street_summer_shade_index/778` | ⚠️ לא צוין | 1,660 | 1,659 | 1 | 0.116 |
| ביתר עילית | BTR | `BTR_street_summer_shade_index/352` | ⚠️ לא צוין | 478 | 408 | 70 | 0.091 |
| נתיבות | NTV | `NTV_street_summer_shade_index/74` | 2021 | 1,554 | 1,553 | 1 | 0.079 |
| **סה"כ** | | | | **44,637** | **41,825** | | |

- **נזרקו:** רק פיצ'רים עם גאומטריה `null` או ריקה (`[[]]`). ידאתי את זה ידנית בבאר שבע, בחיפה ובביתר עילית. אף פיצ'ר לא נזרק בגלל ערך מדד לא תקין.
- **לא הורדו בכוונה:** השכבות של אזורים, שכונות ושטחים פתוחים (הן לא מקטעי רחוב); שכבות "without trees" ו-"rating" (הערך הראשון כבר נמצא כשדה `siNoTrees` בחלק מהערים, והשני הוא רק סיווג של אותו מדד); וגם שכבת ת"א הישנה `TLV_shade_index_d218_street_segments_2019` (נתוני 2017, `Shade_Index`). במקומה הורדה שכבת 2022. העיר יכולה להתווסף לרישום אם תידרש השוואה.
- **ערים מהבריף שלא נמצאו:** בבריף, ה-id ‏`6f9923a5…` סומן כנתניה, אבל זו בפועל **נתיבות**. ה-id ‏`15efe6a8…` סומן כרמת גן, אבל זו בפועל **רעננה**. עבור נתניה, רמת גן, חולון ועכו (AKR/HOL) **לא נמצאה שכבת רחובות ציבורית** בתוכן של הבעלים (228 Feature Services נסרקו). ⚠️ ייתכן שהן קיימות כפרטיות או בארגון אחר. צריך לשאול את המעבדה כשמבקשים את האישור בכתב.
- **ת"א, דשבורד `6cb98bc9…`:** מצביע על web map `9eb49718…` עם שכבות 2017. השתמשנו בשכבת 2022 העצמאית (item `e1bdc149…`).

## 3. איזה מדד זה

**כל השכבות נושאות את מדד הצל היומי הקיצי (`SI_daily`), לא את ה-SAI של "דרך צל".**

- **SI (Shade Index) יומי-קיצי, 0..1:** החלק מהקרינה הקיצית היומית שנחסם (על ידי בניינים ועצים) לפני שהוא מגיע לקרקע. זה ממוצע על פני פוליגון מקטע הרחוב כולו (מדרכות וכביש). שם השדה הוא `summer_SI` בכל 13 הערים. ב-BSV ובחיפה זה float מלא, ובשאר מעוגל ל-2 ספרות.
- **SAI של "דרך צל"** (https://tzel.org.il/wp-content/uploads/2025/08/Shade-Indicators_eng-2.6.pdf): החלק מתוך 10 בדיקות שעתיות בין 08:00 ל-17:00 (בקיץ) שבהן לפחות 50% מהמדרכה מוצלת. הספים: <0.5 לא מספיק, ≥0.5 סביר, ≥0.7 טוב מאוד, ≥0.9 מצוין. **אף שכבה ציבורית לא נושאת SAI.** הטיפוס `ShadeIndexType` כולל `'SAI'` כדי ששכבה עתידית תתמפה בלי שינוי סכמה.
- **אסור להשוות את המספרים ישירות.** SI של 0.5 הוא לא SAI של 0.5. לכן גם הספים של "דרך צל" לא חלים על SI.

**מיפוי שדות** (נמצא גם ב-`manifest.json` → `fieldMapping`):

| פלט | מקור | ערים |
|---|---|---|
| `shadeIndex` | `summer_SI` | כולן |
| `tcc` (כיסוי חופת עצים 0..1) | `TCC` | כולן חוץ מ-BSV |
| `siNoTrees` (SI מבניינים בלבד) | `SI_no_tree` / `SI_NT` | TLV, PTV, SDR, PHK / NSZ |
| `sourceFeatureId` | `FID` | כולן |

## 4. הנרמול: פוליגון ← קו

המעבדה מפרסמת כל מקטע רחוב כ**פוליגון** (זכות הדרך בין צמתים). `normalizeLayer` (`src/lib/shade/normalize.ts`) הופך כל פוליגון ל-LineString של 2 נקודות לאורך **הציר הראשי** שלו. הציר מחושב ב-PCA לפי מומנטים משוקללים-היקף, כך שהתוצאה לא תלויה בצפיפות הדיגיטציה. `widthM` נשמר כרוחב הפוליגון בניצב לציר.

**אימות מול שדות המעבדה עצמה** (פתח תקווה, 3,087 מקטעים, שדות `length`/`width`): היחס בין אורך הציר שחישבנו לאורך של המעבדה הוא p10=0.997, p50=1.002, p90=1.037. היחס ברוחב הוא p10=0.996, p50=1.012, p90=1.096. במקטעים לא-ישרים (צורת L, כיכר) הקו הוא קירוב, וזה מקובל למטרת התאמה ב-buffer.

הפלט לכל עיר הוא `FeatureCollection` של LineString ב-WGS84 עם המאפיינים `{shadeIndex, indexType, city, sourceLayer, sourceFeatureId, fetchedAt, tcc?, siNoTrees?, widthM}`.

## 5. איפה הנתונים נמצאים

**לא נכנסים לגיט.**

| מה | גודל | מיקום |
|---|---|---|
| Raw (דפי ArcGIS כפי שהתקבלו) | 70.4 MB | תיקיית scratchpad של הסשן: `…/scratchpad/tzel/raw/<city>/page-NNN.geojson`. זמני, נמחק עם הסשן |
| מנורמל | 17.3 MB (‏1.3 MB ב-gzip) | `…/scratchpad/tzel/normalized/<city>.geojson` + `manifest.json` |
| **פרודקשן (יעד)** | 1.30 MB, ‏14 אובייקטים | **Firebase Storage**: `gs://appout-1.firebasestorage.app/shade/technion/v1/<citySlug>.geojson.gz` + `shade/technion/v1/manifest.json` |

כדי ליצור את הנתונים מחדש בכל מכונה:

```bash
npx tsx scripts/shade/fetch-technion-shade.ts --out <dir>              # ~90 שניות, ≤2 בקשות/שנייה, עיר אחת בכל פעם
npx tsx scripts/shade/fetch-technion-shade.ts --out <dir> --from-raw   # נרמול מחדש בלי רשת
```

### העלאה ל-Storage (`scripts/shade/upload-technion-shade.ts`)

- **ברירת המחדל היא dry-run**, אופליין: מדפיס מה היה מועלה ובאיזה גודל.
- `--apply --project appout-1` מעלה. בודק ש-`--project` תואם ל-`project_id` של מפתח השירות (`FIREBASE_SERVICE_ACCOUNT_KEY` מ-`.env.local`, כמו בשאר סקריפטי ה-Admin).
- **לא דורס אובייקט קיים** אלא אם מוסיפים `--overwrite`.
- כל קובץ עיר נשמר ב-gzip עם `contentType: application/geo+json` ו-`contentEncoding: gzip`, ו-custom metadata `{source, attribution, permission, indexType, fetchedAt, city, segmentCount}`.
- **ב-Storage בלבד:** אין כתיבה ל-Firestore ואין שינוי ב-`storage.rules`. האובייקטים נשארים פרטיים, והאפליקציה או השרת קוראים אותם דרך Admin SDK. שימו לב: בגלל `contentEncoding: gzip`, הקריאה `file.download()` פורסת כברירת מחדל. כדי לקבל את ה-gz עצמו מעבירים `{ decompress: false }`.
- **הגרסה** בנתיב (`v1`) מאפשרת לייבא בעתיד גרסה חדשה מהמעבדה בלי לשבור את מי שקורא את הנוכחית.

## 6. איך זה מתחבר ל-routeScore (PR #627, `src/lib/route-score/`)

`shadeShareForLine(line, segments, opts)` (`src/lib/shade/match.ts`):
- הולך לאורך המסלול בצעדים של 5 מ'. כל צעד מותאם לציר המקטע הקרוב ביותר בטווח **15 מ'**. הטווח מורחב בחצי מרוחב הפוליגון, עד 15 מ' נוספים, כדי ששדרה רחבה תותאם גם מהמדרכה.
- מקטע שמקביל למסלול (עד 45°) מקבל עדיפות. כך מסלול שחוצה רחוב צדדי לא "מקבל" את הצל של הרחוב הצדדי.
- מחזיר `{shadeShare, coverage, matchedLengthM, totalLengthM}`. `shadeShare` הוא ממוצע SI משוקלל-אורך **על החלק שהותאם בלבד**, או `null` אם שום דבר לא הותאם.
- `buildShadeIndex` בונה אינדקס רשת (תאים של 100 מ') פעם אחת לכל עיר. בת"א זה לוקח כ-20ms, ומסלול של כ-50 ק"מ מחושב בכ-14ms.

**חיבור לרכיב ה-comfort.** ב-PR #627, `scoreComfort` כבר מצפה ל-`RouteScoreInput.shadeShare` (0..1, `null` = לא נמדד). כשהוא קיים, הנקודות מתחלקות כך: תאורה 6, מתקנים 5, צל 4. נקודות הצל המלאות ניתנות ב-`SHADE_CANOPY_MIN_SHARE = 0.4`. **שתי החלטות לדוד, לפני החיווט:**
1. **סף.** `0.4` הוגדר לכיסוי **חופת עצים**, ואילו כאן הערך הוא **SI יומי**. ממוצעי ה-SI העירוניים נעים בין 0.08 ל-0.28, כך שסף של 0.4 נותן נקודות צל מלאות רק לרחובות המוצלים ביותר. אפשר להשאיר אותו (מחמיר), או לכייל לפי התפלגות (למשל האחוזון ה-75 העירוני).
2. **כיסוי.** הצעה: למלא את `shadeShare` רק כש-`coverage ≥ 0.5`. אחרת להשאיר `null` (לא נמדד, נייטרלי), כדי שמסלול שרובו מחוץ לשכבה לא יידרג לפי קטע קצר.

החיווט עצמו הוא שורה אחת ב-`from-route-doc` או ב-backfill של `route_scores`: לטעון את `shade/technion/v1/<city>.geojson.gz` דרך Admin, לבנות אינדקס, ולהריץ `shadeShareForLine` לכל מסלול בעיר. **זה לא נעשה ב-PR הזה.** הוא תלוי ב-#627 ובשתי ההחלטות למעלה.

## 7. בהמשך: GraphHopper `preferShade`

GraphHopper custom model תומך ב-`areas` (GeoJSON) וב-`priority`/`speed` עם `multiply_by` לפי `in_<area>`. הכיוון המוצע:
- **שלב א' (פשוט):** לייצא את המקטעים עם `shadeIndex ≥ 0.4` כפוליגוני buffer ממוזגים (לפי עיר) לשטח `shaded`, ולהגדיר `preferShade` כ-`{ if: "in_shaded", multiply_by: 1.0 }, { else: "", multiply_by: 0.7 }` על priority. המגבלה: areas גדולים מאטים את ה-routing. צריך לפשט, ולשלוח רק את העיר הרלוונטית לכל בקשה.
- **שלב ב' (נכון):** map-matching של המקטעים ל-OSM ways בזמן import, ואז encoded value מותאם (`shade_index`) על כל edge. ה-custom model יהיה אז `{ if: "shade_index < 0.2", multiply_by: 0.6 }` בלי areas בכלל. זה דורש שינוי ב-import של GraphHopper (route engine vision, phase 1).

## 8. קבצים ב-PR

- `src/lib/shade/`: `types.ts`, `geometry.ts`, `normalize.ts`, `match.ts`, `technion-layers.ts` (רישום 13 השכבות + ייחוס/הרשאה), `index.ts`, וטסטים ב-`__tests__/shade.test.ts` (fixtures זעירים).
- `scripts/shade/fetch-technion-shade.ts`: פאצ'ר שאפשר להריץ שוב. כותב לתיקייה מקומית בלבד.
- `scripts/shade/upload-technion-shade.ts`: העלאה ל-Storage, dry-run כברירת מחדל.
- המסמך הזה.
