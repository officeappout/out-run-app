# Roadmap — חיבור אישור osm_amenities לנתונים חיים

**סטטוס:** מאושר על ידי דוד (22.09.2026), **טרם התחיל מימוש**. נכתב אחרי חקירה שגילתה שאישור פריט ב-Approval Center (טאב "amenities") לא מוביל לשום מקום נראה — לא במסך "מיקומים" באדמין, לא במפה באפליקציה, לא ברשימת תחנות לאימון. הסיבה: אין שום קוד (UI, טריגר, או job) שקורא `osm_amenities` בסטטוס `published` ומזרים אותו הלאה. 3,806 פריטים אושרו נכון לתאריך כתיבת המסמך (1,612 מתוכם באותה ישיבה שהובילה למסמך הזה) בלי לזוז לשום מקום.

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

### 2. fitness_station מאושר → park עם `contentStatus:'pending_review'`
Trigger ב-Cloud Function (`functions/src`, `onUpdate` על `osm_amenities`, כש-status עובר ל-`published` וה-category הוא `fitness_station`) — **לא** hook בתוך `moderation.service.ts`'s bulk-approve (מנוגד לתיעוד הקיים שם, ראה למעלה). ה-park החדש נוצר עם `contentStatus:'pending_review'` (שדה שכבר קיים ב-[park.types.ts:31](../src/features/parks/core/types/park.types.ts#L31)) — **לא גלוי במפה** עד שדוד ישלים `facilityType`/`gymEquipment` ויפרסם ידנית. ברגע שמפורסם — נכנס אוטומטית ל-`resolveRouteStops` בלי לשנות את המנוע עצמו.
כולל:
- Trigger + מניעת כפילויות (idempotency — לא ליצור park כפול אם ה-amenity מאושר שוב).
- Backfill חד-פעמי לפריטים שכבר אושרו (הטריגר תופס רק אישורים עתידיים).
- מסנן/תגית "צריך השלמה" במסך "מיקומים" כדי שדוד יידע אילו parks חדשים ממתינים לו.

**ספירת fitness_station מאושרים היום (=כמה טיוטות ייווצרו ב-backfill):**

| עיר | fitness_station מאושר |
|---|---|
| הרצליה | 34 |
| חיפה | 7 |
| תל אביב-יפו | 5 |
| שדרות | 0 |
| **סה"כ** | **46** |

**שעות:** Trigger+backfill 8-11, מסנן "צריך השלמה" ב-UI 2-4 → **10-15 סה"כ**. **סיכון:** בינוני — יוצר מסמכי `parks` אמיתיים שנכנסים לזרימה החיה (route_stops, עיון מיקומים) ברגע שמפורסמים; `pending_review` ממתן משמעותית אבל התלות בהשלמה ידנית שלך לכל אחד מ-46 (וגדל) עדיין קיימת. **נוגע:** בעיקר אדמין/backend (`functions/src` + Locations UI); אפס שינוי במנוע `resolveRouteStops` עצמו.

### 3. Pins של ברזיות/ספסלים במפה (zoom 14+)
שכבת מפה חדשה ב-[AppMap.tsx](../src/features/parks/core/components/AppMap.tsx#L2208), אותו דפוס "Facility markers zoom 14+" שכבר קיים שם — viewport-bounded, לא collection-wide. קורא `osm_amenities where status=='published'` בלבד.
**שעות:** 4-6. **סיכון:** נמוך — תוסף, לא נוגע בלוגיקה קיימת; לשים לב לביצועים/עומס ויזואלי (gating לפי zoom כבר פותר את זה ברוב המקרים). **נוגע:** קוד אפליקציה (AppMap.tsx בלבד).

### 4. ברזיות/ספסלים במגירת פארק
ProximityJoin חדש ל-osm_amenities מזווית הפארק (מקביל ל-`findAmenityMatchesForRoute` הקיים למסלולים, [route-amenity-tagging.service.ts](../src/features/parks/core/services/route-amenity-tagging.service.ts)), מוזן ל-`ParkDetailSheet`'s chips (כיום מבוססים רק על שדות ידניים של הפארק עצמו — `AMENITY_ICON_MAP`).
**שעות:** 4-6. **סיכון:** נמוך. **נוגע:** קוד אפליקציה (ParkDetailSheet + שירות ג'וין חדש, אין שינוי בפארקים עצמם).

### מאוחר יותר, לא בסדר הזה: שירותים (toilets)
`AmenityCategory` (`osm-amenity.types.ts`) הוא `'court'|'bench'|'drinking_water'|'fitness_station'|'crossing'|'dog_park'` — **אין קטגוריית toilets כלל**. הוספתה דורשת: תג Overpass חדש (`amenity=toilets`), הרחבת ה-enum/schema, וריצת ingestion מחדש לכל עיר. לא "לחבר קיים" — קטגוריה חדשה. הוערך בנפרד (~3-5 שעות נוספות מעבר לאומדן פריט 3) כשמגיע הזמן.

## רטרואקטיבי ל-3,806 שכבר אושרו

- **פריט 3/4 (מפה/מגירת פארק):** כן, ישירות — קריאה חיה מ-Firestore, אין backfill נדרש.
- **מגירת מסלול (כבר קיים):** ✅ בוצע ידנית ב-22.09.2026 לארבע הערים שיש להן כיסוי (שדרות/חיפה/הרצליה/תל אביב-יפו — זכרון יעקב ואשקלון עדיין 0 כיסוי osm_amenities, לא רלוונטי). תוצאה: שדרות 7/28 מסלולים עם ברזייה/ספסל, חיפה 22/77, הרצליה 8/35, תל אביב-יפו 15/27.
- **פריט 2 (park מ-fitness_station):** כן, אבל דורש סקריפט backfill נפרד (הטריגר עצמו תופס רק קדימה) — ה-46 הקיימים בטבלה למעלה.

## מה לא חוסם את שדרות
שום פריט ברשימה הזו לא חוסם את השקת שדרות — ה-pipeline (מסלולים/תאורה/amenities-tagging) כבר עובד עצמאית. זו שכבת נראות נוספת על גבי מה שכבר פועל.
