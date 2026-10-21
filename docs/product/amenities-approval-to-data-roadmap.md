# Roadmap — חיבור אישור osm_amenities לנתונים חיים

**סטטוס:** מאושר על ידי דוד (22.09.2026, עודכן 22.09.2026), **טרם התחיל מימוש**. נכתב אחרי חקירה שגילתה שאישור פריט ב-Approval Center (טאב "amenities") לא מוביל לשום מקום נראה — לא במסך "מיקומים" באדמין, לא במפה באפליקציה, לא ברשימת תחנות לאימון. הסיבה: אין שום קוד (UI, טריגר, או job) שקורא `osm_amenities` בסטטוס `published` ומזרים אותו הלאה. 3,806 פריטים אושרו נכון לתאריך כתיבת המסמך (1,612 מתוכם באותה ישיבה שהובילה למסמך הזה) בלי לזוז לשום מקום.

**עיקרון מנחה (עדכון):** מה שדוד מאשר ב-Approval Center הוא **גלוי מיד** — בלי מצב ביניים ("pending_review") לאף אחד מהסוגים. ההבדל בין הסוגים הוא רק **מה** נוצר, לא **מתי** זה גלוי.

## המצב הקיים (baseline, מאומת בקוד)

- **מרכז האישורים** ([approval-center/page.tsx](../src/app/admin/approval-center/page.tsx)) — טאב `amenities` תומך רק ב-`amenitySubView: 'pending' | 'suppressed'`. ברגע שפריט מאושר הוא נעלם מהמסך היחיד שמציג amenities בכלל.
- **מסך "מיקומים"** ([locations/page.tsx](../src/app/admin/locations/page.tsx)) — כל הטאבים שלו (parks/courts/nature_community/urban) הם תצוגות מסוננות של collection `parks` בלבד. אפס קשר ל-`osm_amenities`.
- **המפה באפליקציה** — שכבות `water`/`toilet` ב-`useMapStore.ts` מוזנות משדות ידניים על מסמכי `parks` (למשל `hasWaterFountain`), לא מ-`osm_amenities`. אין שום שכבת מפה שמציגה osm_amenities pins.
- **מגירת מסלול** (RouteDetailSheet) — הדרך **היחידה** הקיימת היום לראות תוצאה של אישור, ורק בעקיפין: `scripts/tag-route-amenities.ts --city=<עיר> --apply` צריך לרוץ ידנית אחרי כל סבב אישורים כדי ש-`Route.qualitySignals.amenities` יתעדכן. לא אוטומטי.
- **מנוע תחנות לאימון** (`resolveRouteStops`, `route-stops.service.ts`) — קורא אך ורק מ-collection `parks`. אפס import של `osm_amenities`. תחנת כוח (`fitness_station`) מאושרת לא יכולה להפוך לתחנה באימון היום, בשום נסיבות.
- **אישור עצמו** ([moderation.service.ts](../src/features/admin/services/moderation.service.ts), `bulkApproveEntities`) — מתועד בכוונה כ"fixed-shape status flip with no other side effects" — routes/parks/contributions הוצאו בכוונה מ-bulk approve כי יש להם תופעות לוואי אמיתיות (publish hooks, XP, וכו'). amenities לא.

## סדר העבודה המאושר (לא להתחיל בלי אישור נפרד לכל שלב)

### 1. תת-מסך "מאושרים" במרכז האישורים
הרחבת `amenitySubView` מ-`'pending'|'suppressed'` ל-`'pending'|'published'|'suppressed'`, והרחבת [osm-amenity-admin.service.ts](../src/features/admin/services/osm-amenity-admin.service.ts)'s `fetchAmenitiesByStatus` (כיום מקבל רק `'pending'|'rejected'`) לתמוך גם ב-`'published'`.
**שעות:** 2-3. **סיכון:** נמוך — read-only, אין path כתיבה חדש. **נוגע:** אדמין בלבד.

### 2. fitness_station מאושר → מתחבר לפארק קיים, או park חדש **published מיד**
Trigger ב-Cloud Function (`functions/src`, `onUpdate` על `osm_amenities`, כש-status עובר ל-`published` וה-category הוא `fitness_station`) — **לא** hook בתוך `moderation.service.ts`'s bulk-approve (מנוגד לתיעוד הקיים שם, ראה למעלה). שתי תוצאות אפשריות, נקבעות בו-זמנית ע"י הטריגר:

- **בתוך/קרוב לפארק קיים** → הציוד מתחבר ל-`gymEquipment` של הפארק הקיים (עדכון, לא יצירה) — **בלי כפילות pin על המפה**.
- **אחרת** → `parks` doc חדש, **`published:true` מיד** (אין `pending_review` — הוחלט בכוונה, ראה עיקרון מנחה למעלה), עם תגית `needsFacilityDetails:true` (שדה חדש) כדי שדוד ישלים `facilityType`/`gymEquipment` בנוחות — אבל **גלוי ונכנס ל-`resolveRouteStops` מהרגע הראשון**, לא רק אחרי השלמה.

כולל:
- Trigger + מניעת כפילויות (idempotency — לא ליצור park כפול אם ה-amenity מאושר שוב, ולא לחבר פעמיים לאותו פארק).
- Backfill חד-פעמי לפריטים שכבר אושרו (הטריגר תופס רק אישורים עתידיים).
- מסנן "חסרים פרטי מתקנים" (`needsFacilityDetails`) במסך "מיקומים" — לא "ממתין לפרסום", אלא "כבר גלוי, כדאי להשלים".

**⚠️ תוצאת ה-dry-run (ראה למטה) קובעת: כמעט תמיד ייווצר park חדש, לא חיבור.** ברדיוס הזיהוי הריאלי (40-200 מ') כמעט כל ה-46 רחוקים מכל פארק קיים — כלומר רוב המימוש בפועל הוא "צור park חדש", וההתחברות לפארק קיים היא מקרה נדיר (2/46), לא הנפוץ. worth לדעת לפני שמתכננים את גודל המימוש — זה לא "בעיקר עדכון קיימים עם קצת חדשים", זה כמעט תמיד חדשים.

**שעות:** Trigger (כולל שני הענפים + idempotency) 8-11, מסנן "חסרים פרטים" ב-UI 2-4 → **10-15 סה"כ**. **סיכון:** בינוני — יוצר מסמכי `parks` אמיתיים **גלויים מיד** למשתמשים (לא ממותן ע"י draft state); איכות המידע התחלתית (בלי facilityType/gymEquipment עד שדוד ישלים) עלולה להיראות "ריקה" בפארק חדש לזמן קצר — סיכון UX אמיתי שכדאי לתת עליו את הדעת (למשל: pin שונה חזותית / לא מוצג ברשימת "תחנות" עד שיש לפחות gymEquipment אחד, גם אם הפארק עצמו published). **נוגע:** בעיקר אדמין/backend (`functions/src` + Locations UI); אפס שינוי במנוע `resolveRouteStops` עצמו — פארק שיש לו gymEquipment נכנס אוטומטית.

**dry-run — פיצול link/new בפועל, לכל עיר, ברדיוסים אפשריים (נגד 1,166 parks עם קואורדינטות; רדיוס 40מ' = אותו קבוע שכבר בשימוש ב-`GARDEN_DEDUP_RADIUS_METERS`):**

| עיר | @40מ' | @100מ' | @200מ' |
|---|---|---|---|
| הרצליה (34) | link=0, new=34 | link=1, new=33 | link=1, new=33 |
| חיפה (7) | link=0, new=7 | link=1, new=6 | link=1, new=6 |
| תל אביב-יפו (5) | link=0, new=5 | link=0, new=5 | link=0, new=5 |
| **סה"כ (46)** | **link=0** | **link=2** | **link=2** |

היסטוגרמת מרחק למקום הקרוב ביותר (כל 46): `≤40מ׳: 0 · 41-100מ׳: 2 · 101-200מ׳: 0 · 201-500מ׳: 16 · 501-1000מ׳: 14 · מעל 1000מ׳: 14`. מעבר ל-200מ' לא הגיוני (מתחיל לחבר לפארק לא-קשור באמת) — **גם ברדיוס הכי סלחני שהגיוני, 44/46 ייצרו park חדש.**

### 3. Pins של ברזיות/ספסלים/מגרשים במפה (zoom 14+) — מיד
שכבת מפה חדשה ב-[AppMap.tsx](../src/features/parks/core/components/AppMap.tsx#L2208), אותו דפוס "Facility markers zoom 14+" שכבר קיים שם — viewport-bounded, לא collection-wide. קורא `osm_amenities where status=='published'` בלבד — קריאה חיה, כל אישור חדש גלוי בטעינת המפה הבאה, בלי backfill/עיבוד ביניים.
**שעות:** 4-6. **סיכון:** נמוך — תוסף, לא נוגע בלוגיקה קיימת; לשים לב לביצועים/עומס ויזואלי (gating לפי zoom כבר פותר את זה ברוב המקרים). **נוגע:** קוד אפליקציה (AppMap.tsx בלבד).

### 4. ברזיות/ספסלים במגירת פארק — מיד
ProximityJoin חדש ל-osm_amenities מזווית הפארק (מקביל ל-`findAmenityMatchesForRoute` הקיים למסלולים, [route-amenity-tagging.service.ts](../src/features/parks/core/services/route-amenity-tagging.service.ts)), מוזן ל-`ParkDetailSheet`'s chips (כיום מבוססים רק על שדות ידניים של הפארק עצמו — `AMENITY_ICON_MAP`). קריאה חיה בפתיחת המגירה (כמו פריט 3), לא backfill.
**שעות:** 4-6. **סיכון:** נמוך. **נוגע:** קוד אפליקציה (ParkDetailSheet + שירות ג'וין חדש, אין שינוי בפארקים עצמם).

### מאוחר יותר, לא בסדר הזה: שירותים (toilets)
`AmenityCategory` (`osm-amenity.types.ts`) הוא `'court'|'bench'|'drinking_water'|'fitness_station'|'crossing'|'dog_park'` — **אין קטגוריית toilets כלל**. הוספתה דורשת: תג Overpass חדש (`amenity=toilets`), הרחבת ה-enum/schema, וריצת ingestion מחדש לכל עיר. לא "לחבר קיים" — קטגוריה חדשה. הוערך בנפרד (~3-5 שעות נוספות מעבר לאומדן פריט 3) כשמגיע הזמן.

## רטרואקטיבי ל-3,806 שכבר אושרו

- **פריט 3/4 (מפה/מגירת פארק):** כן, ישירות — קריאה חיה מ-Firestore, אין backfill נדרש.
- **מגירת מסלול (כבר קיים):** ✅ בוצע ידנית ב-22.09.2026 לארבע הערים שיש להן כיסוי (שדרות/חיפה/הרצליה/תל אביב-יפו — זכרון יעקב ואשקלון עדיין 0 כיסוי osm_amenities, לא רלוונטי). תוצאה: שדרות 7/28 מסלולים עם ברזייה/ספסל, חיפה 22/77, הרצליה 8/35, תל אביב-יפו 15/27.
- **פריט 2 (park מ-fitness_station):** כן, אבל דורש סקריפט backfill נפרד (הטריגר עצמו תופס רק קדימה) — ה-46 הקיימים, שלפי ה-dry-run יווצרו כ-parks חדשים כמעט כולם (44/46, ראה טבלה למעלה). backfill מריץ dry-run קודם (ספירה בלבד, כמו שכבר בוצע כאן) ואז apply נפרד, אותה משמעת dry-run-כברירת-מחדל שכל שאר הסקריפטים בפרויקט הזה כבר עוקבים אחריה.

## מה לא חוסם את שדרות
שום פריט ברשימה הזו לא חוסם את השקת שדרות — ה-pipeline (מסלולים/תאורה/amenities-tagging) כבר עובד עצמאית. זו שכבת נראות נוספת על גבי מה שכבר פועל.
