# מרכז מיפוי ערים — מסמך תכנון

**סטטוס:** תכנון בלבד. אין כאן קוד ייצור.
**תאריך:** 22.10.2026. נכתב מ-`origin/main` @ `8fb1fd77`.
**הבקשה:** דוד, 22.10.2026. היום `/admin/city-mapping` מציג עיר אחת בכל פעם, וטבלת כל הערים מוסתרת בשורה מקופלת. דוד רוצה מקום אחד שמחבר שלושה חלקים:
- **טבלה** של כל הרשויות.
- **מפה** עם שכבות, שאפשר לאשר ולדחות ישירות ממנה.
- **פאנל פערים** לכל רשות: מה חסר, למה, ומה הפעולה שתתקן.

סינון הטבלה לרשות אחת ממקד את המפה עליה.
**Mockup סטטי (לא בגיט):** נבנה מחוץ לריפו, כקובץ HTML עצמאי עם נתונים מזויפים. הנתיב מופיע בדוח של הסשן.

---

## 0. תקציר

1. **הבסיס כבר קיים.**
   - `city_inventory/{authorityId}` מחזיק לכל רשות ספירות, כיסוי, readiness ופערים.
   - ‏`/api/admin/city-mapping/inventory/all` כבר מחזיר שורה לכל רשות.
   - יש כבר רכיבי מפה (react-map-gl + mapbox-gl) לשכבת מסלולים לחיצה ולנקודות מתקנים.
   - פעולות האישור והדחייה קיימות ב-`moderation.service`.
2. **מה שחסר באמת הוא גאומטריה לפי רשות, שאפשר לשאול עליה דרך השרת.**
   - נקודות (מתקנים, ספסלים, ברזיות, מעברים) כבר נמצאות ב-`osm_amenities`. מסלולים נמצאים ב-`official_routes`.
   - לשכבות הקו והפוליגון (תאורה, צל, אופניים, שבילים) ולשירותים אין היום שום מקור שאילתא לפי רשות.
   - השדה `layers[*].files` תוכנן לזה (תוכנית המיפוי §3.3), אבל הוא תמיד ריק.
3. **כל קריאה עוברת דרך routes חדשים בשרת עם `requireSuperAdminApi`.** אין שאילתות לקוח על `osm_amenities`, `route_scores` או `city_inventory` (axioms §25). אחת הסיבות: ל-`osm_amenities` ול-`route_scores` אין בכלל חוק משלהם, והם נופלים ל-catch-all של root בלבד.
4. **בונים בגלים קטנים מאחורי דגל:**
   - H0: טבלה.
   - H1: מפה עם מסלולים.
   - H2: נקודות עם clustering.
   - H3: אישור ודחייה מהמפה.
   - H4: פאנל פערים.
   - H5: שכבות גאומטריה מ-Storage.
   - H6: מועמדים מתוך `route_scores`, וסימון legacy.

---

## 1. מלאי קיים (מה יש, איפה, מה ממחזרים)

### 1.1 הדף `/admin/city-mapping`

| רכיב | מיקום | מה עושה | בהאב |
|---|---|---|---|
| דף ראשי | `src/app/admin/city-mapping/page.tsx` (761 שורות) | guard לקוח: SA או System Admin בלבד (`:96-98`). בוחר עיר יחידה (`:112-115`). bbox / adminRelationId / dry-run (`:137-144`). ריצת pipeline (`:253`). גילוי מסלולים (`:275`). | **נשאר** כלשונית "הוספה והרצה". הוא לא נמחק. |
| טבלת כל הערים | נטענת ב-`page.tsx:379-384` בתוך `<details>` מקופל. הרכיב ב-`src/features/admin/components/city-inventory/AllCitiesTable.tsx:51` (156 שורות). | מיון, ולחיצה על עיר דרך `onSelectCity(city, authorityId)` (`:23`, `:130`). אין חיפוש ואין סינון. | **מוחלף** בטבלת ההאב. ממחזרים את `sortCityOverviewRows` ואת `parseCityOverviewRow`. |
| כרטיס בריאות מפה | `MapHealthCard.tsx:82` (218 שורות), נטען ב-`page.tsx:387-388` | שכבות, ספירות, כיסוי, מקורות, היסטוריית ריצות ונסיגות | **ממוחזר** כלשונית "שכבות" בפאנל הרשות. |
| לוגיקת תצוגה | `src/features/admin/components/city-inventory/map-health.logic.ts` | `LAYER_LABELS`, `amountText`, `coverageCell`, `gapNotes`, `runRegressions`, ו-"לא נמדד ≠ 0" | **ממוחזר כמו שהוא.** זה מקור הטקסט של הפערים. |
| API לרשות | `src/app/api/admin/city-mapping/inventory/route.ts` (53 שורות) | GET `?authorityId=` מחזיר inventory + 5 ריצות. `requireSuperAdminApi`. Admin SDK. | ממוחזר לפאנל הרשות. |
| API לכל הערים | `src/app/api/admin/city-mapping/inventory/all/route.ts` (61 שורות) | שורה לכל מסמך `city_inventory` + מכסה + מסלולים מאושרים (fallback לפי שם עיר, `overview.ts:31`) | **מורחב** (H0): צפיפות ספסלים/ברזיות/שירותים, פערים מובילים, ממתינים. |
| שורת סקירה | `src/lib/city-inventory/overview.ts:9-24` | `CityOverviewRow`: level, score, approvedRoutes, quota, shade, lighting, lastRefreshAt | מתווספים שדות (§4.1). |
| readiness | `src/lib/city-inventory/readiness.ts:43-53` | 9 משקלים שסכומם 100. `missing[]` ו-`blockers[]` נמצאים על המסמך (`types.ts:129-135`). | מזין את פאנל הפערים. |
| routes נוספים | `src/app/api/admin/city-mapping/{boundary-geometry,resolve-boundary,authority-boundary,register-city,amenities-ingest,amenities-tag,lighting}/route.ts` | כולם `requireSuperAdminApi`. `boundary-geometry` מחזיר GeoJSON של הגבול מ-OSM לפי דרישה ולא שומר אותו (`:9-22`). | `boundary-geometry` משמש כשכבת גבול. `amenities-ingest` ו-`resolve-boundary` משמשים כפעולות בפאנל הפערים. |
| BoundaryConfirmMap | `src/features/admin/components/city-mapping/BoundaryConfirmMap.tsx` (80 שורות) | מפת אישור גבול | דוגמה לשכבת גבול. |

### 1.2 דפי מפה ואישור באדמין

| דף | מיקום | מפה | נתונים | פעולות |
|---|---|---|---|---|
| מרכז אישורים | `src/app/admin/approval-center/page.tsx` (1313 שורות) | `ApprovalPreviewMap` (מודאל) ו-`AmenitiesQueueMap` | **שאילתות לקוח**:<br>• לשונית `routes` = `official_routes` עם `published==false` (`:269-273`)<br>• `amenities` = `fetchAmenitiesByStatus` (`osm-amenity-admin.service.ts:127`), `status==X limit 3000` מכל הארץ | `approveEntity` / `rejectEntity` (`moderation.service.ts:56`, `:195`). Bulk רק ל-SA (`:992`, `:1035`, `:1067`). |
| מודאל אישור | `src/features/admin/components/approval/ApprovalDetailModal.tsx` (454 שורות) | `ApprovalPreviewMap` (`PreviewGeometry`: point / route / climb, `:22-61`) | `getDoc` לפי סוג (`:241`) | כפתורי אישור/דחייה (`:429`, `:437`). `hideNativeActions` ו-`shapeReviewAdmin` (`:58-88`). |
| תור מתקנים במפה | `AmenitiesQueueMap.tsx` (153 שורות) | `<Marker>` אימוג'י לכל פריט. **תקרה של 400** (`:35`), ללא clustering. | פריטים מהלשונית | לחיצה פותחת מודאל. **אין** אישור ישירות מהמפה. |
| סקירת צורה | `src/app/admin/routes/shape-review/page.tsx` (262 שורות), עם `RouteShapeReviewMap.tsx` ו-`RouteShapeReviewSection.tsx` | שכבת קו לחיצה, צבע לפי החלטה (`RouteShapeReviewMap.tsx:54`, `:115`) | `official_routes` לא מפורסמים (`:96-100`). עיר יחידה חובה. | כותב רק `shapeTrainingReview` (`route-shape-review.service.ts:25-40`). **לא** משנה status. |
| איכות מסלולים | `src/app/admin/routes/quality/page.tsx` עם `route-quality/*` | `RouteQualityMap` | מריץ מחולל בצד הלקוח, לא קורא את `route_scores` | אין פעולות. מעבדה. |
| מיקומים ומסלולים | `src/app/admin/locations/page.tsx` (2716 שורות) | אין מפת סקירה. יש רק `LocationPicker` בעריכה (`:1311`) ותמונות סטטיות (`:320-329`). | `getAllParks` / `getParksByAuthority` (`:1660-1669`), `fetchOfficialRoutes` (`:1605`) | עריכה ומחיקה, בלי אישור |
| מפת חום | `src/app/admin/heatmap/page.tsx` → `LiveHeatMap.tsx:21` | heatmap layer | נוכחות חיה | — |

**הערה על השמות "מפת מרכזי מאוחד" ו-"מפת מרכזים — פיתוח":** שמות כאלה לא נמצאו בקוד. הקרובים ביותר בניווט הם:
- `מפת דרכים מאוחדת` (`/admin/master-roadmap`)
- `מפת דרכים — פיתוח` (`/admin/roadmap`)

שניהם ב-`adminNavItems.ts:88-89`. אלה **מפות דרכים של פיתוח (roadmap)**, לא מפות גאוגרפיות, ולכן לא נכללו כאן. ראו שאלה פתוחה 1.

**הערה על `RouteShapeReviewTab`:** אין רכיב בשם הזה. הכוונה כנראה ל-`RouteShapeReviewSection`, שמשובץ במודאל, או לדף `/admin/routes/shape-review`.

### 1.3 מקורות נתונים

| אוסף / קובץ | מה יש | חוק Firestore | גאומטריה? |
|---|---|---|---|
| `city_inventory/{authorityId}` (+`runs`) | ספירות, ק״מ, קמ״ר, צפיפות, כיסוי %, מקורות, readiness | `allow read, write: if false` (`firestore.rules:3508`). רק Admin SDK. | **לא.** `layers[*].files: LayerFile[]` (`types.ts:104-124`) תוכנן ל-Storage, אבל `readCityInventoryDoc` מחזיר `files: []` (`doc.ts:77`), ו-`apply.node.ts` לא מעלה שום קובץ. |
| `official_routes` | מסלולים: `path`, `published`, `status`, `authorityId?`, `city` | `isAdmin()` (`:1605`) | כן (`path`). **אבל** ל-156 מתוך 183 מסמכים אין `authorityId` (נבדק 16.08). צריך fallback לפי `city` (כמו `countApprovedByAuthority`). |
| `curated_routes` | מסלולים אוצרים | `isAdmin()` (`:1624`) | כן. לא בשימוש במרכז האישורים. |
| `parks` | גינות ופארקים: `location`, `authorityId`, `published`, `contentStatus` | `write: isAdmin()` (`:1530`) | נקודה (לא פוליגון) |
| `osm_amenities` | מתקנים. `category` ∈ court, bench, drinking_water, fitness_station, crossing, dog_park (`osm-amenity.types.ts:36`). שדות נוספים: `location`, `geohash`, `status`, `authorityId`, `city`. | **אין חוק ייעודי.** catch-all `isRootAdmin()` (`:3553`). | נקודה. **אין `toilets`**: שירותים נספרים רק ב-`city_inventory` (שלב I5 בתוכנית לא בוצע). |
| `route_scores/{routeId}` | ציון, band, shade, surface, **`selection`** ∈ selected, candidate, manual_review, rejected (`route-score/select.ts:21`, `route-scores-doc.ts:41`) | **אין חוק ייעודי.** catch-all root. | לא. מצטרף ל-`official_routes.path`. |
| `city_mapping_discovery_runs` | ריצות גילוי | — | — |
| Storage | `shade/technion/v1/<citySlug>.geojson.gz`<br>`lighting/v1/<city>.json.gz`<br>(`scripts/shade/upload-technion-shade.ts:83`, `scripts/lighting/build-city.ts:11`) | Storage rules | **לפי slug של עיר, לא לפי authorityId.** רק צל ותאורה. |

### 1.4 מה ממחזרים ומה חסר

**ממחזרים:**
- `inventory/all` ו-`inventory`.
- `map-health.logic.ts` במלואו.
- `MapHealthCard` כלשונית.
- הדפוס של `RouteShapeReviewMap`: GeoJSON source, שכבת קו עם צבע data-driven, ו-`interactiveLayerIds`.
- `ApprovalPreviewMap` עם `PreviewGeometry`.
- `approveEntity` ו-`rejectEntity`, כולל `InventoryService.approveRoute` (`inventory.service.ts:1357`). הוא גם משדר ל-`street_segments` ומחשב adjacency מחדש, ולכן **אסור לעקוף אותו**.
- `REJECTION_CHIPS` מ-`shape-review-chips.ts`.
- `boundary-geometry`.

**חסר:**
1. מפה אחת שמציגה פארקים, מסלולים ומתקנים יחד.
2. אישור ודחייה ישירות מהמפה.
3. clustering. אין כזה בקוד, ויש תקרה של 400 markers.
4. שאילתות לפי רשות בצד השרת (היום קוראים הכול ומסננים בלקוח).
5. גאומטריה לשכבות קו ופוליגון לפי רשות (תאורה, צל, אופניים, שבילים, פארקים גדולים) ולשירותים.
6. נקודת מרכז לכל רשות לתצוגה ארצית (ראו שאלה 4).
7. חיפוש וסינון בטבלה.

---

## 2. פריסה

### 2.1 דסקטופ (≥1280px)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ מרכז מיפוי ערים   [חיפוש רשות…]  [רמה ▾] [סוג ▾] [מכסה ▾] [פער ▾]  ⟳    │
│ 248 רשויות · 61 ירוק · 94 צהוב · 93 אדום · 412 מסלולים ממתינים         │
├───────────────────────────────┬──────────────────────────────────────────┤
│ טבלה (≈44%)                   │ מפה (≈56%)                               │
│ רשות│מוכנות│מסלולים/מכסה│צל│… │ [פארקים][מתקנים][ספסלים][ברזיות]…        │
│ ▸ שדרות  🟡 58 │ 4/8 │ …      │                                          │
│ ▸ אשקלון 🔴 31 │ 1/12│ …      │      ● ● ◉(12)   ━━ מאושר  ┅┅ ממתין      │
│ …  (וירטואלית)                │   [popover: אשר / דחה]                   │
│                               ├──────────────────────────────────────────┤
│                               │ פאנל רשות: [פערים][שכבות][ריצות]          │
│                               │ ✖ צל לא נמדד — למה — [פעולה]              │
└───────────────────────────────┴──────────────────────────────────────────┘
```

- **ב-RTL הטבלה בצד ימין והמפה בצד שמאל.** הקורא מתחיל מהטבלה.
- פאנל הרשות הוא מגירה בתחתית עמודת המפה. הוא נפתח כשבוחרים רשות, ומתקפל לפס של 44px.
- מעל המפה שורה אחת של chips לשכבות. מקבצים אותם: **תשתית כושר**, **נוחות**, **תנועה**, **סביבה**, **מסלולים**.
- הלשונית הקיימת "הוספה והרצה" (ה-pipeline של היום) זמינה מכפתור בכותרת. היא לא נמחקת.

### 2.2 צר (<768px, למשל 390px)

- ערימה אנכית עם לשוניות עליונות: **טבלה | מפה | פערים**.
- הטבלה הופכת לכרטיסים: שם, נקודת רמה, ציון, מסלולים מתוך המכסה, ושני פערים מובילים.
- לחיצה על כרטיס עוברת ללשונית המפה, ממוקדת על הרשות.
- ה-chips של השכבות בשורה שגוללת אופקית בתוך עצמה. הדף עצמו לא גולל לצדדים.
- ה-popover של אישור הופך ל-bottom sheet.
- זה דף אדמין של super-admin, ולכן הוא ייפתח בעיקר בדסקטופ. מספיק שהגרסה הצרה **שמישה**, היא לא צריכה להיות מלאה. גם עריכת גבולות וריצות לא מוצגות בצר.

---

## 3. אינטראקציות

### 3.1 סנכרון טבלה ↔ מפה

- **מצב הדף נשמר ב-URL** (`?authority=<id>&layers=parks,routes_pending&tab=gaps`), כדי שאפשר לשתף קישור ולחזור אחורה. זה מצב תצוגה בלבד, בלי נתונים אישיים.
- **בחירת שורה בטבלה:**
  - המפה עושה `fitBounds` ל-bbox של הרשות.
  - הגבול מצויר.
  - שכבות הרשות נטענות (lazy).
  - פאנל הפערים נפתח.
- **סינון הטבלה לתוצאה אחת** מתנהג כמו בחירה. סינון לכמה תוצאות מדגיש במפה הארצית רק את הנקודות שלהן.
- **במפה הארצית, לחיצה על נקודת רשות** בוחרת את השורה וגוללת אליה (`scrollIntoView`).
- **"נקה"** מחזיר לתצוגה ארצית.

### 3.2 טבלה

- **עמודות:**
  - רשות
  - מוכנות (נקודת צבע + ציון)
  - מסלולים מאושרים מתוך המכסה (פס התקדמות)
  - ממתינים
  - צל %
  - תאורה %
  - ספסלים לק״מ
  - ברזיות לק״מ
  - שירותים לק״מ
  - פערים מובילים (עד 2 תגיות)
  - רענון אחרון
- **"לא נמדד" מוצג כ"לא נמדד" ולא כ-0.** הכלל של `map-health.logic.ts:1-10` נשמר.
- **מסננים:**
  - רמה: אדום, צהוב, ירוק
  - סוג רשות: עירייה, מועצה מקומית, מועצה אזורית
  - מכסה: מתחת למינימום, בטווח, מעל
  - "יש לה פער": צל, תאורה, גבול, מסלולים, מקור ישן
  - "לקוח משלם": קריאה בלבד מ-`authorities.isActiveClient`. **אף פעם לא כותבים אותו** (axioms §6).
- **חיפוש:** טקסט חופשי על השם, מנורמל עם `normCity`.
- **מיון:** כל עמודה. ברירת המחדל היא הציון בסדר עולה, כך שהגרועים ראשונים.
- **ביצועים:** 248 שורות מסתדרות בלי וירטואליזציה. אם המספר יעלה, מוסיפים וירטואליזציה פשוטה (ראו §5).

### 3.3 שכבות

| קבוצה | שכבות | ברירת מחדל |
|---|---|---|
| מסלולים | מאושרים, ממתינים, מועמדים (`route_scores.selection`) | מאושרים וממתינים דולקים |
| תשתית כושר | פארקים, מתקני כושר, מגרשים | פארקים דולקים |
| נוחות | ספסלים, ברזיות, שירותים | כבויות |
| תנועה | מעברי חצייה, שבילי אופניים, שבילים / טיילות | כבויות |
| סביבה | תאורה, צל | כבויות |
| גבול | גבול רשות | דולק תמיד כשרשות נבחרה |

- **כל chip מציג את הספירה מ-`city_inventory`.** אם השכבה עוד לא זמינה כגאומטריה, ה-chip מסומן "נתון בלבד" ומושבת עם tooltip שמסביר למה (למשל "שירותים — אין גאומטריה, רק ספירה; גל H5"). לא מציגים מפה ריקה שנראית כמו "אין שירותים".
- **מקרא בפינת המפה.** צבעי המסלולים:
  - מאושר: טורקיז מלא
  - ממתין: כתום מקווקו
  - מועמד: אפור מנוקד
  - נדחה: מוסתר

### 3.4 אישור ודחייה מהמפה

- **מסלול ממתין:**
  - לחיצה על הקו פותחת popover עם שם, אורך, מקור (`origin`), ציון ו-band מ-`route_scores` אם קיים, וסטטוס צורה (`shapeTrainingReview`).
  - כפתורים: **אשר**, **דחה**, **פרטים** (פותח את `ApprovalDetailModal` הקיים).
- **דחייה:** בוחרים chip סיבה (`REJECTION_CHIPS`) או טקסט חופשי. משתמשים ב-`rejectEntity('route')` הקיים, שכותב `published:false, status:'archived'`. **לא** `bulkRejectRoutes`, כי הוא עושה un-publish רך ל-`pending` (מרכז אישורים, `:604`).
- **אישור:** `approveEntity('route')`, שמפעיל את `InventoryService.approveRoute` (עם broadcast ו-adjacency). לא כותבים payload חדש.
- **מתקן ממתין:** אותו popover. אישור ודחייה דרך **route חדש בשרת** (ראו §6.3), כי החוק של `osm_amenities` הוא catch-all של root בלבד.
- **אישור מרובה במפה:**
  - "אשר את כל הממתינים בתצוגה" פועל רק ברשות ממוקדת.
  - נדרש אישור שמציג את המספר המדויק.
  - משתמשים ב-`bulkApproveRoutes` הקיים.
- **אחרי פעולה:** עדכון אופטימי של צבע הקו ושל מוני הטבלה, ואז קריאה מחדש של השורה. אם יש כשל, מבטלים את העדכון ומציגים toast.
- **שקיפות:** שומרים את `reviewedBy` / `reviewedAt` הקיימים. אין שדות חדשים על המסמך.

### 3.5 פאנל פערים

לכל רשות מוצגת רשימה מסודרת לפי השפעה על הציון, לפי `READINESS_WEIGHTS`. כל פער כולל שלושה דברים: **מה**, **למה** (מקור ותאריך), ו**פעולה**.

| פער (מקור) | למה (טקסט) | פעולה |
|---|---|---|
| `blockers` על "גבול" | "אין גבול מנהלי מאומת" | **פתח אישור גבול**, דרך `resolve-boundary` ו-`BoundaryConfirmMap` (קיים) |
| מסלולים מתחת למכסה (`routeQuota`) | "4 מתוך 8 מינימום" | **הצג ממתינים במפה** (מדליק את השכבה וממקד). אם אין ממתינים: **הפעל גילוי מסלולים** (קיים, `page.tsx:275`), עם אישור. |
| `missing: shade` | "אין שכבת טכניון לעיר" | **הוראת הרצה** (טקסט להעתקה, לא כפתור): העלאת שכבת צל, ואז ריצת מלאי |
| `missing: lighting` | "אין שכבת פנסים, רק תג lit של OSM" | **בקשת GIS מהעירייה**: טקסט מוכן להעתקה. אין שליחה (כללי CRM). |
| נקודות מתחת לצפוי (`below_expected_density`) | "ברזיות 0.2 לק״מ מול חציון 0.6 בערים דומות" | **ייבא מתקנים** (`amenities-ingest`, קיים), או בקשת GIS |
| `stale_source` | "צילום OSM מ-03.2026" | **הוראת רענון מלאי** (סקריפט שדוד מריץ, כמו apply היום) |
| `runRegressions` | "ספסלים 312 ← 0 בין ריצות" | **סמן כחשד לכשל שליפה**. מקשר ללשונית "ריצות". |
| `license_pending` | "שכבה ממתינה לאישור רישיון" | פתיחה של §שאלה 2 בתוכנית המיפוי. ללא פעולה. |

**כלל:** פעולה שכותבת לייצור עם השפעה רחבה (ריצת גילוי אמיתית, apply של מלאי) לא הופכת לכפתור "בלחיצה אחת". היא נשארת עם אישור מפורש, כמו היום, או כהוראה ש-David מריץ בעצמו (מדיניות האוטונומיה).

---

## 4. זרימת נתונים לפי שכבה

### 4.1 טבלה: הרחבה של `GET /api/admin/city-mapping/inventory/all`

השדות שמתווספים ל-`CityOverviewRow` לא דורשים שום קריאה חדשה מעבר למה שהקובץ כבר קורא:
- `benchesDensity`, `waterDensity`, `toiletsDensity` מ-`layers.*.density`. ‏`null` כשהשכבה לא נמדדה.
- `topGaps: string[]` מ-`readiness.missing` ו-`blockers`, עד 3.
- `missingCount`.
- `pendingRoutes`: שאילתה נוספת אחת, `official_routes where published==false select(authorityId, city, status)`. מסננים archived ו-rejected וממפים בעזרת `cityToAuthority` הקיים.
- `bbox` / `center`: ראו שאלה 4.

**הערה:** מספר הרשויות בטבלה הוא מספר מסמכי `city_inventory`, לא 248 קבוע. רשות בלי מלאי לא מופיעה היום. ראו שאלה 3.

### 4.2 שכבות לפי רשות: route חדש אחד

`GET /api/admin/city-mapping/layers?authorityId=<id>&layer=<key>` מחזיר GeoJSON `FeatureCollection` עם properties מינימליים.

| שכבה | מקור | איך | מצב |
|---|---|---|---|
| גבול | `boundary-geometry` (קיים) | היום נשלף מ-OSM בכל קריאה. **להוסיף מטמון** ב-Storage: `city-inventory/{authorityId}/boundary.geojson.gz` | קיים, איטי |
| מסלולים: מאושרים / ממתינים | `official_routes` | Admin SDK: `where authorityId==id`, **ובנוסף** `where city in [names]` (fallback ל-legacy). מאחדים לפי id. מפשטים `path` (Douglas-Peucker, ‏~5 מ׳). | **אפשר לשאול היום** |
| מסלולים: מועמדים | `route_scores where authorityId==id` (+city), עם `selection in [candidate, manual_review]`, מצורפים ל-`path` | Admin SDK. ייתכן שיידרש אינדקס מורכב. | אפשר לשאול. לבדוק אינדקס. |
| פארקים | `parks where authorityId==id` | Admin SDK. נקודה בלבד. | אפשר לשאול |
| מתקני כושר, מגרשים, ספסלים, ברזיות, מעברי חצייה | `osm_amenities where authorityId==id` (+city fallback, `fetchAmenitiesByCity` `:83`). פילטר `category`. | Admin SDK. מחזירים `status` כדי לצבוע ממתין / מאושר. | **אפשר לשאול היום** |
| שירותים | אין ב-`osm_amenities` | **Storage** (H5), או הרחבת enum לפי I5 בתוכנית המיפוי | חסר |
| תאורה | `lighting/v1/<city>.json.gz` (לפי slug) | **Storage**: להעביר או להעתיק לנתיב לפי authorityId (§4.3) | חלקי |
| צל | `shade/technion/v1/<slug>.geojson.gz` | כנ״ל. קבצים כבדים, ולכן מגישים רק מעל zoom 13 ובגרסה מפושטת. | חלקי (ערים עם טכניון) |
| אופניים, שבילים, טיילות, פארקים גדולים | רק ספירות וק״מ ב-`city_inventory` | **Storage** (H5) | חסר |

### 4.3 שכבות Storage: השלמת התכנון של §3.3

1. **הריצה:** `scripts/city-inventory` ב-apply כותב לכל שכבה את הקובץ `city-inventory/{authorityId}/{snapshotDate}/{source}/{layer}.geojson.gz`, ומעדכן את `layers[k].files` עם `{path, bytes, sha256}`.
   - הנתיב הוא לפי התוכנית.
   - ה-apply הוא של דוד בלבד, כמו היום.
   - אותו `sha256` אומר שלא כותבים שוב.
2. **ה-route** קורא את `city_inventory/{id}.layers[k].files[0].path` ומחזיר אחת משתי אפשרויות:
   - (א) **signed URL** קצר-חיים (5 דק׳). הדפדפן מוריד ישירות מ-Storage. **מומלץ**: אין עומס על Vercel ואין מגבלת גודל תגובה.
   - (ב) stream מפושט מהשרת.
3. **Storage rules** לא נפתחים ללקוח. ה-signed URL הוא הדרך היחידה.
4. **הפרדה לפי רישיון** (OSM לעומת ממשלתי) נשמרת בנתיב, `{source}`. ה-attribution מוצג במקרא.

### 4.4 תצוגה ארצית

- נקודה אחת לכל רשות, בצבע לפי רמה ובגודל לפי אוכלוסייה. אין features.
- נדרשת נקודת מרכז לכל רשות (שאלה 4).
- אפשר להדליק "מסלולים מאושרים — כל הארץ" רק כשכבת heat או נקודות (centroid של מסלול), לא כקווים.

---

## 5. ביצועים

| נושא | פתרון |
|---|---|
| 248 שורות | קריאה אחת ל-`inventory/all`, שכבר עושה `getAll` בקבוצה אחת. Cache-Control פרטי של 60 שניות, ורענון ידני. |
| אלפי נקודות לרשות (ת״א: אלפי ספסלים, חיפה: ~2,200 מעברי חצייה) | **`<Source cluster>` המובנה של mapbox-gl** (GeoJSON source עם `cluster: true`). בלי תלות חדשה ובלי markers של React. זה מחליף את הדפוס של `AmenitiesQueueMap`, ‏400 `<Marker>`. |
| קווים (מסלולים, אופניים) | פישוט בשרת. properties מינימליים (`id`, `status`, `name`). שכבת קו אחת לכל קבוצה, עם צבע data-driven. |
| צל ותאורה (כבדים) | `minzoom: 13`. הקובץ נטען רק כשה-chip דולק **וגם** כשיש zoom מספיק. אם עדיין כבד: PMTiles מוכן מראש (גל עתידי, ראו שאלה 6). |
| טעינה עצלה | שכבה נטענת רק כשה-chip דולק ורשות נבחרה. cache בזיכרון לפי `authorityId:layer:snapshotRunId`, כך שהמטמון נשבר כשמסמך המלאי מתחדש. זה מונע את המלכודת של axioms §28: מטמון שמבוסס רק על זמן לא יודע שהקלט השתנה. |
| bundle | המפה נטענת ב-`dynamicImport({ssr:false})`, כמו כל המפות הקיימות. |
| מכסת Firestore | שכבת נקודות לרשות היא קריאה אחת. מגבלה קשיחה של 5,000 features לשכבה עם דגל `truncated`, ובמקרה הזה מוצג באנר. לא מסתירים בשקט. |

---

## 6. אבטחה

1. **guard בדף:** בדיוק כמו `city-mapping/page.tsx:96-98`. `checkUserRole`, ודרוש `isSuperAdmin || isSystemAdmin`. בנוסף, middleware קיים. מנהל רשות לא נכנס להאב. הוא ממשיך לעבוד עם מרכז האישורים המסונן (`scoped()`).
2. **כל route קריאה חדש:** `requireSuperAdminApi(request)` (`src/lib/api-auth.ts:211`) ו-Admin SDK. ולידציה ל-`authorityId`: לא ריק, עד 128 תווים, בלי `/` (כמו `inventory/route.ts`). `layer` נבדק מול רשימה סגורה.
3. **אין שאילתות לקוח** על `city_inventory`, `osm_amenities`, `route_scores` (axioms §25). גם לא על `official_routes` עבור ההאב. הכול עובר בשרת.
4. **כתיבות:**
   - מסלולים: `approveEntity` ו-`rejectEntity` הקיימים. כתיבת מסמך יחיד מהלקוח, מותרת לפי `isAdmin()`. **בלי לשנות חוקים** (CLAUDE.md, כלל אימות 7).
   - מתקנים: route חדש, `POST /api/admin/city-mapping/moderate`, עם `requireSuperAdminApi` ו-Admin SDK. אותו payload בדיוק כמו `moderation.service.ts:82` / `:246`. הסיבה: החוק של `osm_amenities` הוא root בלבד, ו-super-admin שאינו root ייכשל היום בלקוח. **לא פותחים את החוק.**
5. **signed URLs** ל-Storage: קצרי-חיים, רק דרך route עם guard. ה-bucket לא נפתח ללקוח.
6. **`isActiveClient`** מוצג לקריאה בלבד ולא נכתב משום מקום בהאב (axioms §6).
7. **הנחיות לגבי מה לא לבנות:**
   - לא לבנות גישת מנהל רשות להאב "בדרך אגב".
   - לא לסמוך על כך שמסנן `scoped()` בלקוח מגן (axioms §26).
   - אם בעתיד מנהל רשות יקבל האב, צריך guard מפורש ב-route ולא סינון בלקוח.

---

## 7. מה לאחד ומה לסמן (לא מוחקים)

| קיים | החלטה |
|---|---|
| `AllCitiesTable` המקופל ב-`city-mapping/page.tsx:379-384` | **legacy**. מוחלף בטבלת ההאב. מסמנים בהערה `@deprecated — replaced by city-mapping hub (H0)`. מוחקים רק אחרי שבועיים של שימוש, ובאישור. |
| `MapHealthCard` | **ממוחזר** כלשונית "שכבות" בפאנל. נשאר. |
| בוחר העיר וה-pipeline בדף הנוכחי | **נשאר** כלשונית "הוספה והרצה" בתוך ההאב. |
| מרכז אישורים, לשוניות `routes` ו-`amenities` | **נשארות.** מנהלי רשות משתמשים בהן. ההאב הוא נתיב נוסף ל-SA, לא תחליף. מוסיפים קישור "פתח במפה" מכל שורה. |
| `AmenitiesQueueMap` (תקרה של 400) | **legacy-candidate.** מחליפים אותו ברכיב השכבות המשותף, עם clustering, אחרי H2. |
| `/admin/routes/shape-review` | **נשאר.** תפקיד אחר: תיוג צורה לאימון, בלי שינוי status. |
| `/admin/routes/quality` | **נשאר.** מעבדת מחולל. |
| `/admin/locations` | **נשאר.** עריכה. מוסיפים קישור "הצג במרכז המיפוי". |

---

## 8. גלים

כל גל הוא PR נפרד מאחורי הדגל `enable_city_mapping_hub`, ברירת מחדל `false`, בכרטיס בפאנל (מדיניות batch-mode). הדגל משפיע רק על דף admin של SA. אין שינוי בחוקי Firestore באף גל.

| גל | תוכן | בדיקות קבלה |
|---|---|---|
| **H0** | דף `/admin/city-mapping/hub` (shell + guard). טבלה עם חיפוש, מסננים ומיון. הרחבת `CityOverviewRow` (§4.1). URL state. | (1) unit ל-`buildCityOverviewRows` החדש: "לא נמדד" ≠ 0, ו-pending ממופה גם לפי city.<br>(2) test ל-route: 401 בלי הרשאה.<br>(3) ידני: מספר השורות = מספר מסמכי `city_inventory`, וסינון "אדום" מחזיר רק אדומים.<br>(4) 390px בלי גלילה אופקית בדף. |
| **H1** | מפה (react-map-gl). תצוגה ארצית עם נקודות רשויות. בחירה עושה fitBounds וגבול. שכבות מסלולים מאושרים וממתינים דרך `/layers`. | (1) test: route דוחה `layer` לא מוכר ו-`authorityId` עם `/`.<br>(2) ברשות עם legacy בלי authorityId (שדרות), מספר הקווים = `approved + pending` בטבלה.<br>(3) mount-log זמני: הרכיב החי הוא הנכון (CLAUDE.md, כלל אימות 1). |
| **H2** | שכבות נקודות: פארקים, מתקנים, מגרשים, ספסלים, ברזיות, מעברים. clustering מובנה. chips עם ספירות ומצב "נתון בלבד". | (1) חיפה, מעברי חצייה: ~2,200 נקודות בלי קפיאה (מדידה, לא תחושה).<br>(2) chip של שירותים מושבת עם הסבר.<br>(3) `truncated` מוצג כבאנר. |
| **H3** | popover לאישור ודחייה של מסלול (`approveEntity`, `rejectEntity` הקיימים). route `moderate` למתקנים. bulk ברשות ממוקדת. | (1) test ל-route `moderate`: payload זהה ל-moderation.service, ו-401/403.<br>(2) ידני על מסלול בדיקה: אישור מעדכן `street_segments` (broadcast רץ), והמונה בטבלה מתעדכן.<br>(3) דחייה נותנת `archived`, לא `pending`. |
| **H4** | פאנל פערים (§3.5) מ-`readiness` ו-`gapNotes` ו-`runRegressions`. פעולות מקשרות לקיים. טקסטים להעתקה. | (1) unit: הסדר לפי משקל.<br>(2) כל פער עם פעולה מוביל לפעולה קיימת. אין כפתור חדש שכותב לייצור בלי אישור. |
| **H5** | Storage: הריצה כותבת `files[]` ו-route מחזיר signed URL. שכבות תאורה, צל, אופניים, שבילים ושירותים. מטמון גבול. | (1) round-trip test של `files` (axioms §31).<br>(2) אחרי apply ראשון (דוד): `files.length>0`, וה-signed URL פג אחרי 5 דק׳.<br>(3) צל מוצג רק מעל zoom 13. |
| **H6** | שכבת מועמדים מ-`route_scores`. קישורי "פתח במפה" ממרכז האישורים ומ-locations. הערות `@deprecated` (§7). | (1) אינדקס `route_scores` נבדק (אין "0 שאינו 0", MASTER-PLAN §13.47).<br>(2) הקישורים פותחים את הרשות הנכונה. |

---

## 9. שאלות פתוחות, עם המלצה

1. **אילו דפים התכוונת ב"מפת מרכזי מאוחד" וב"מפת מרכזים — פיתוח"?** בקוד יש רק "מפת דרכים מאוחדת" ו-"מפת דרכים — פיתוח", ושניהם roadmap ולא מפה.
   *המלצה:* אם אלה הם, הם מחוץ לתחום. אם יש דף אחר (אולי בענף שלא מוזג), צריך לשלוח שם או נתיב.
2. **נתיב:** דף חדש `/admin/city-mapping/hub`, או החלפה של `/admin/city-mapping`?
   *המלצה:* דף חדש מאחורי דגל. אחרי שבועיים יציבים מעבירים את ה-default, וה-pipeline הישן הופך ללשונית.
3. **רשויות בלי `city_inventory`:** להציג אותן בטבלה כ"לא נמדד"?
   *המלצה:* כן. הטבלה מתבססת על `authorities` ולא על `city_inventory`, כך ש-248 נראות תמיד. רשות שלא נמדדה היא פער בפני עצמו, עם הפעולה "הרץ מלאי".
4. **נקודת מרכז ו-bbox לרשות:** לא ידוע אם קיימים על `authorities` (יש גבולות OSM ל-214 רשויות לפי backfill קודם).
   *המלצה:* לשמור `bbox` ו-`center` על `city_inventory` בריצת המלאי הבאה, כנתון נגזר. עד אז, fallback ל-`city_registrations.bbox`.
5. **אישור מתקנים לא-root:** route בשרת (מוצע), או חוק ייעודי ל-`osm_amenities`?
   *המלצה:* route בשרת. פתיחת החוק דורשת audit נפרד, וחוקים לא מחלישים.
6. **צל ותאורה כבדים:** GeoJSON מפושט מספיק, או PMTiles?
   *המלצה:* להתחיל ב-GeoJSON מפושט עם `minzoom`, ולמדוד על ת״א. PMTiles רק אם נמדד שזה איטי.
7. **שירותים:** להרחיב את `osm_amenities` (I5, כולל מודרציה), או להציג אותם כשכבת Storage בלבד?
   *המלצה:* Storage בלבד בהאב (H5). I5 הוא החלטת מוצר נפרדת, כי הוא משפיע על מה שמשתמשי האפליקציה רואים.
8. **"בקשת GIS מהעירייה":** טקסט להעתקה בלבד, או גם יצירת משימה ב-CRM?
   *המלצה:* טקסט להעתקה בלבד ב-H4. חיבור ל-CRM כטיוטה (לעולם לא שליחה) בגל נפרד, אם תרצה.
9. **bulk מהמפה:** מותר "אשר את כל הממתינים ברשות"?
   *המלצה:* כן, רק ברשות ממוקדת, עם אישור שמציג את המספר המדויק. לעולם לא ארצי.
