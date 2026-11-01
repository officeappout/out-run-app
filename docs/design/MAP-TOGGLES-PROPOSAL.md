# הצעה: מסנני מפה על פני המפה + פילטר משטח

> סטטוס: הצעה בלבד. אין שינוי קוד. מוקאפ אינטראקטיבי: ראו Artifact "מסנני מפה — הצעה" (הקישור בתיאור ה-PR).
> נבדק מול `origin/main` @ `36623fe2` (נשלף ב-23.10.2026).
> קבצים שבבעלות דוד (קריאה בלבד): `DiscoverLayer.tsx`, `MapShell.tsx`, `AppMap.tsx`, `MapModeHeader.tsx`.

## א. מה לא עובד היום (עם ראיות)

| # | בעיה | ראיה |
|---|------|------|
| 1 | **"מאחור":** המתגים חבויים מאחורי כפתור עגול 44px עם אייקון Layers, ופותחים גיליון מלא שמכסה את המפה. כדי לראות מה כל מתג עושה צריך לסגור את הגיליון. | `MapLayersControl.tsx:30-39` (כפתור `w-11 h-11`), `:93-117` (גיליון `fixed inset-0 z-[48]` + backdrop) |
| 2 | **המיקום:** הכפתור יושב בצד ימין, מתחת לשתי שורות ה-header (חיפוש + פילס מצבים) ב-offset קבוע `52px + safe-area + 116px`. הוא "תלוי באוויר", לא שייך לאף שורה. | `DiscoverLayer.tsx:2138-2157` |
| 3 | **"לא מחובר למפה":** אין שום סימן על המפה שמראה שפילטר פעיל. כבוי = השכבה פשוט נעלמת, בלי מונה, בלי נקודה על הכפתור, בלי הודעה. אי אפשר לדעת שהמפה "ריקה" בגלל סינון. | `AppMap.tsx:1889` (`visibleLayers?.includes('routes')` עוטף את כל ה-Source), `:2474` (מתקנים). אין ב-`MapLayersButton` אינדיקציית מצב. |
| 4 | **אין שמירה:** `visibleLayers` ב-store רגיל בלי `persist`, ברירת מחדל `['parks','routes','gym']`. כל רענון מאפס. | `useMapStore.ts:453` |
| 5 | **שניים מתוך שבעה מתגים לא קשורים לעין:** מים ושירותים מצוירים כאייקונים קטנים; מתג "גינות" ו"מסלולים" מוסתרים מאחורי דגל `enable_map_polish_v1`. | `MapLayersControl.tsx:19-23`, `:62` |
| 6 | **אין פילטר משטח בצד ההצגה בכלל.** משטח קיים רק בצד היצירה: `FreeRunDrawer` → "שבילי עפר" → `surface: 'trail'`. מודל מנטלי כפול: "מה אני רואה" לעומת "מה ייווצר". | `FreeRunDrawer.tsx:1258-1262` (שורה v2), `:1274` (legacy), `route-request.utils.ts:90` (`extras.trail ? 'trail' : 'road'`) |
| 7 | **הפרדת בעלות:** שורת "משתמשים פעילים" בגיליון פותחת גיליון שני (PartnerFilterSheet) וסוגרת את הראשון, מה שמוסיף שלב. | `MapLayersControl.tsx:175-217` |

הערה לגבי z-index: הגיליון על z-[48], מתחת ל-BottomNavbar (z-50) ומעל ה-PartnerOverlay (z-[45]); הכפתור עצמו על z-[50] (`DiscoverLayer.tsx:2142`). אין התנגשות עכשיו, אבל גם אין נוכחות.

## ב. ההצעה

### עקרון: שורת צ'יפים אחת על המפה, מתחת לפילס המצבים

שורה אופקית נגללת (RTL, מתחילה מימין) של צ'יפים בגודל 36px, מתחת ל-`MapModeHeader` ומעל המפה. היא לא פותחת גיליון: לחיצה מחליפה מצב מיידית, והמפה מגיבה מול העיניים.

```
[ חיפוש                                  ]
[ פילס מצבים: גילוי · ריצה חופשית · ...  ]
[ ⟲ איפוס ]  [🌳 גינות 12] [🗺 מסלולים 8] [כביש] [שביל עפר] [💧] [🚻] [💪]   ← חדש, נגלל
```

**למה למעלה ולא למטה:** חוק "כרטיס אחד בלבד" (`.cursorrules`: רק overlay תחתון אחד בכל רגע) תופס את התחתית: קרוסלת מסלולים (`BottomJourneyContainer` z-40), `RouteCarousel`, `WorkoutDrawer` (z-60). שורת צ'יפים תחתונה הייתה מתחרה בכולם. למעלה יש רק את ה-header. חלופת "הברך" (thumb-reachable): כפתור פילטר אחד קטן בצד ה-HUD (`DiscoverLayer.tsx:2161`, `z-[40]`) שמציג רק את מונה הפילטרים הפעילים, ופותח את אותה שורה כ-popover מעל ה-HUD. מומלץ להתחיל מלמעלה ולמדוד.

### שתי קבוצות צ'יפים, מפריד ויזואלי ביניהן

**1. שכבות (toggle, כמו היום):** גינות · מסלולים · מים · שירותים · מכון. כל צ'יפ מציג **מונה חי** של מה שנראה כרגע בתצוגה ("גינות 12"). כבוי = צ'יפ שטוח עם קו חוצה קל ומונה נעלם. מקור המספרים: אותם `visibleRoutes` וגינות ש-`AppMap` כבר מחשב.

**2. משטח (בחירה יחידה או כמה, תלוי ב-activity):**

| מצב ריצה / הליכה | מצב אופניים |
|---|---|
| כביש / סלול (`walk_run_paved`) | אופני כביש (`bike_road`) |
| שביל עפר (`hike_offroad`) | אופני שטח (`bike_offroad`) |

- ברירת מחדל: **הכול** (אין צ'יפ משטח "דלוק"). בחירת צ'יפ = הצג רק את המשטח הזה.
- מסלולים ב-`unknown` (אין נתוני משטח) **לא מוסתרים** בפילטר "הכול"; כשפילטר משטח פעיל הם מוסתרים, וה-empty-state אומר כמה מסלולים הוסתרו בגלל "אין מידע על משטח".
- הצ'יפים מתחלפים אוטומטית לפי ה-activity של המסלולים בתצוגה (`activityType`: running/walking → סט שמאלי; cycling → סט ימני). אם שני סוגים נמצאים, מוצגים לפי ה-activity שנבחר בכותרת/במצב.

### תגובת המפה (החיבור ל"מרגיש קשור למפה")

- המסלולים מתחלפים עם fade של 150ms (opacity על ה-Layer, לא mount/unmount) כדי שהמשתמש יראה מה נעלם.
- כשצ'יפ פעיל, צבע קו המסלול במפה מקבל קידוד משטח: סלול = קו רציף, עפר = קו מקווקו (`line-dasharray`) באותו צבע. כך הצ'יפ והקו "מדברים אותו שפה".
- מונה קטן בפינת השורה: "מוצגים 8 מתוך 14".
- **איפוס אחד:** צ'יפ "⟲ איפוס" בתחילת השורה, מופיע רק כשיש לפחות פילטר אחד לא-ברירת-מחדל. מחזיר גם שכבות וגם משטח.
- **שמירה:** `persist` ל-slice הזה בלבד ב-localStorage. זה סימון UI שאיבודו בסגירה קשה ב-iOS מקובל (axiom 19: לא קריטי ל-onboarding).

### מצב ריק (הפילטר מסתיר הכול)

כרטיס קטן **בתוך המפה, מתחת לשורה** (לא overlay תחתון, לא עוקף את חוק כרטיס-אחד):

> "אין מסלולי שביל עפר באזור הזה. הוסתרו 14 מסלולים סלולים."  [הצג הכול]  [צור מסלול עפר]

הכפתור השני מוביל ל-FreeRunDrawer עם `trail` דלוק (ראו שלב 3).

### איחוד עם "שבילי עפר" ב-FreeRunDrawer (מודל מנטלי אחד)

היום יש שתי העדפות נפרדות: ההצגה (חדש) והיצירה (`extras.trail`). ההצעה: **העדפת משטח אחת** ב-store (`surfacePref: 'any' | 'paved' | 'offroad'`), והיא מזינה את שני הצדדים:

- **הצגה:** מסנן את המסלולים הקיימים לפי `surfaceClass`.
- **יצירה:** `route-request.utils.ts:90` הופך ל-`extras.trail || surfacePref === 'offroad' ? 'trail' : 'road'`. שורת ה-`ToggleRow` "שבילי עפר" ב-FreeRunDrawer נשארת, אבל מאותחלת מה-store וכותבת אליו (מצב שני כיווני).
- **מה לא נוגעים:** הגנרטור (`route-request.utils` מחזיר את אותו shape), `useRouteFilter` ו-`features.surface`. אין שינוי בחוזה ה-API.
- סיכון: משתמש שהפעיל "עפר" בצ'יפ ואז יוצר מסלול ריצה חופשית יקבל עפר בלי לראות שביקש. פתרון: ב-FreeRunDrawer השורה מציגה "לפי המסנן במפה" כשהיא דלוקה מהצ'יפ.

### מה בנתונים

- `surfaceClass` מחושב ב-`src/lib/route-score/surface-class.ts:81` (`classifySurface`) ונכתב ל-`route_scores` (`route-scores-doc.ts:33`). **קוד הלקוח לא קורא אותו** (grep: אין שימוש ב-`src/features`/`src/app`). `Route` בצד הלקוח (`route.types.ts:487`) מכיל רק `surfaceType` ו-`features.surface`.
- שתי אפשרויות לשלב 1:
  - **א (מומלץ):** חישוב בצד הלקוח עם `classifySurface(activityType, surfaceSharesFromDoc(route))`, פונקציות טהורות. אפס קריאות Firestore חדשות, אפס backfill. מחיר: שגיאת חישוב עקבית עם ה-pipeline אם `trail.stats.surfaceMix` לא נטען ללקוח (לבדוק מה `Route` נושא בפועל).
  - **ב:** להעתיק `surfaceClass` ל-`official_routes` ב-backfill הקיים (`scripts/backfill-route-score.ts`). נקי יותר, אבל כתיבה ל-Firestore ופריסה; דורש אישור נפרד.

## ג. התנגשויות ו-RTL

| נושא | ניתוח |
|---|---|
| z-index | שורת הצ'יפים z-[70]-קרוב (ליד `renderTopBar`, שהוא z-[70]). לשים בתוך אותו `motion.div` של `renderTopBar` ← אין ערך חדש ב-budget. הכפתור הישן (z-[50]) מוסר. |
| כרטיס אחד | לא נוגע בתחתית. מצב ריק הוא inline מתחת לשורה. כשהרכיב של `topBarCollapsed` (`DiscoverLayer.tsx:1769`, freeRun step 'route') מסתיר את ה-top bar, השורה נעלמת איתו: בדיוק ההתנהגות הרצויה. |
| `partnerTab !== null` | ה-top bar כבר לא מורנדר ← השורה נעלמת. תואם. |
| RTL | `dir="rtl"` על השורה, `overflow-x:auto`, `scroll-snap`, padding-inline-start כדי שהצ'יפ הראשון לא יידבק לקצה, וגם `-webkit-overflow-scrolling:touch`. מסכה (fade) בקצה השמאלי כרמז לגלילה. |
| Safe area | השורה יושבת בתוך ה-container של `top-bar` שכבר מקזז `env(safe-area-inset-top)`. אין safe-area חדש. |
| יעדי מגע | צ'יפ 36px גובה, רווח 8px; הכפתור המקורי 44px. להעלות ל-40px אם בדיקת נגישות (a11y batch) דורשת 44. |
| צפיפות | שני שורות header + שורת צ'יפים = ~150px מהמסך. במסכים נמוכים (iPhone SE) לשקול הסתרת השורה בזמן pan/zoom. |

## ד. אילו קבצים של דוד צריכים להשתנות (diff מינימלי)

| קובץ (בעלות) | שינוי | גודל משוער |
|---|---|---|
| `src/app/map/layers/DiscoverLayer.tsx` (דוד) | להוסיף `<MapFilterChips />` בתוך `renderTopBar()` אחרי `MapModeHeader` (שורה ~1793), מאחורי דגל. להסיר את בלוק ה-`MapLayersControl` ב-`:2138-2157` רק בשלב 2. | ~12 שורות |
| `src/features/parks/core/components/AppMap.tsx` (דוד) | לסנן `visibleRoutes` לפי `surfaceFilter` לפני בניית `routesGeoJSON` (`:1335`), ולהוסיף `line-dasharray` מותנה. | ~15 שורות |
| `src/features/parks/core/store/useMapStore.ts` | `surfaceFilter`, `setSurfaceFilter`, `resetFilters`, `persist` ל-slice. | ~25 שורות |
| `src/features/parks/core/components/MapFilterChips.tsx` (חדש) | הרכיב עצמו. | ~150 שורות |
| `src/features/parks/core/components/MapLayersControl.tsx` | נשאר עד שלב 2 (flag-off), ואז הופך ל-fallback. | 0 |
| `src/features/parks/core/components/FreeRunDrawer.tsx` + `route-request.utils.ts` | שלב 3 בלבד. | ~10 שורות |
| `src/hooks/feature-flag-defs.ts` + `src/app/admin/system-settings/page.tsx` | דגל חדש `enable_map_surface_filter_v1`, fail-closed (`defaultValue:false`). | ~12 שורות |
| `src/messages/ns/map` | מחרוזות i18n חדשות (he/en). | ~12 שורות |

## ה. תוכנית בשלבים

| שלב | מה | דגל | מאמץ | סיכון |
|---|---|---|---|---|
| 1 | פילטר משטח על מסלולים מוצגים. צ'יפ יחיד של משטח אפשרי + מונה + איפוס, בלי שינוי בגיליון הקיים. | `enable_map_surface_filter_v1` (חדש, כבוי) | 1.5-2 ימים | נמוך: סינון בצד הלקוח; הסיכון הוא כיסוי נתונים (כמה מסלולים `unknown`). |
| 2 | עיצוב מחדש של השכבות לצ'יפים על המפה, מונים חיים, קידוד קו מקווקו, מצב ריק, persist. מסירים את הכפתור הישן. | אותו דגל או `enable_map_chips_v1` | 3-4 ימים | בינוני: נוגע בקבצים של דוד; מדידת צפיפות מסך. |
| 3 | איחוד עם FreeRunDrawer: `surfacePref` משותף. | אותו דגל | 1 יום | בינוני: התנהגות יצירה משתנה לכל מי שהפעיל עפר. |

כל שלב משוחרר כבוי ומופעל בפאנל (לפי "Batch Mode — Flag Every Change").

## ו. אירועי אנליטיקה (שמות מוצעים; helper קיים לאשר)

- `map_filter_chip_toggle` { chip, state, activity, visible_count }
- `map_filter_reset` { active_filters }
- `map_filter_empty_state_shown` { surface, hidden_count, unknown_hidden }
- `map_filter_empty_cta` { action: show_all | generate_offroad }
- `map_surface_filter_to_generation` { surface } (שלב 3)

## ז. החלטות שנדרשות מדוד

1. מיקום: שורת צ'יפים בראש (מומלץ) או כפתור יחיד ליד ה-HUD?
2. כיסוי `unknown`: להסתיר מסלולים בלי נתוני משטח כשפילטר פעיל (מומלץ), או להציג אותם תמיד?
3. מקור `surfaceClass`: חישוב בלקוח (מומלץ) או backfill ל-`official_routes`?
4. האם לקודד משטח בקו מקווקו על המפה, או רק בצ'יפים?
5. אישור לגעת ב-`DiscoverLayer.tsx` ו-`AppMap.tsx` (קבצים שלך) ב-diff הקטן שלמעלה.
6. שלב 3: האם בחירת עפר בצ'יפ אמורה גם לשנות את ברירת המחדל של יצירת מסלול?
