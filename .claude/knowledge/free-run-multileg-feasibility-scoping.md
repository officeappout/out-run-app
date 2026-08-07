# Free Run — הרחבה למסלולים מרובי-שלבים + כתובות יעד: מפת היתכנות

> סוג: מחקר/סקופינג בלבד (07.08.2026, עודכן 08.08.2026). **לא נבנה שום קוד.** אומת מול קוד חי ע"י 5 agents מקבילים + סבב תיקון + אימות עצמי על סתירה אחת + סבב תיקון נוסף לאחר בדיקת דוד.
> תרחיש-אב של דוד: מהבית → הטיה לטיילת (תוספת מרחק) → המשך לכתובת חבר ברמת גן → חבר שני מצטרף באמצע, ~22 ק"מ סה"כ.
> מתודולוגיה: `Workflow` עם 5 agents מקבילים (read-only, Read/Grep/Glob), כל אחד חייב ציטוט file:line לכל טענה. 2/5 נכשלו בריצה ראשונה (connection error) ורוצו שוב; agent `distance_cap` חזר עם placeholder בסבב השני ורוץ בנפרד כ-agent בודד. סתירה אחת בין שני agents (סטטוס `useSearchNavigation.fetchNavigationVariants`) אומתה ידנית ע"י grep ישיר.
> **08.08 (סבב 1)**: דוד בדק ידנית מול origin/main ואישר את שתי התגליות המרכזיות (commute mode + הזמנת-ריצה). תיקן קביעה שגויה שלי לגבי `useSearchNavigation.ts` — ראו תיקון #4 למטה; הוביל לזיהוי `NavigationHub.tsx` כאבן-בניין נוספת ליכולת ב׳ (ראו שם).
> **08.08 (סבב 2)**: דוד קיבל החלטות מוצר לגבי א'+ב' (ראו שם) והעלה שתי שאלות טכניות שאומתו ישירות בקוד: (1) `searchAddress` הוא geocoding גולמי לא-מוגבל, אבל התגלה **באג-סדר אמיתי** ב-`useSearchNavigation.ts:123`/`NavigationHub.tsx:337` שמקדם פארקים/מסלולים על פני כתובות — gate חדש שלא היה ברשימה המקורית; (2) "נווט לפארק" אושר במפורש כאותו מנוע commute בדיוק (לא נתיב נפרד) — נעקב עד `park-preview/index.tsx:48-55` → `DiscoverLayer.tsx:479-496`.

---

## תיקונים קריטיים לנקודת המוצא של הבריף

הבריף המקורי הניח כמה דברים שהתבררו כלא-מדויקים בקוד החי:

1. **"מסלול commute חד-כיווני קיים אבל לא מחובר לזרימת בניית אימון ריצה"** — לא מדויק. `route-generator.service.ts` (לא רק `mapbox.service.ts`) כבר מכיל commute-mode מלא ומתועד (`options.destination`, שורות 112-135, 596-603, 967-1040) שמחזיר עד 3 וריאנטים אמיתיים. יותר מזה: המסלול הזה **כבר חי בפרודקשן end-to-end** — נגיש דרך שורת החיפוש הכללית של המפה / מקומות שמורים (בית/עבודה) / כפתורי "נווט" על כרטיסי פארק — לא רק "תשתית קיימת", אלא פיצ'ר שלם עם UI, XP נפרד, ומסך סיכום ("אישור הגעה"). הפער היחיד הוא שהוא לא מגיע מ-`FreeRunDrawer`.
2. **"`route-stitching.service.ts` בונה Diamond loops, אולי אפשר reuse"** — מופרך כמעט לגמרי. הקובץ (1128 שורות) הוא צינור אדמין-בלבד, אופליין, לגמרי מנותק מ-Free Run (קורא יחיד: `src/app/admin/routes/page.tsx`). גם ה-helpers הפנימיים שלו (haversine, Douglas-Peucker) הם שכפולים של גרסאות קנוניות שהצינור החי כבר תלוי בהן (`geoUtils.ts`, `pathSimplify.ts`). מנגנון ה-"שרשור" האמיתי היחיד שם (`bridgeGap` וכו', שורות 743-791) הוא קוד מת — לא נקרא משום מקום.
3. **"מפגש עם חבר זה תחום נפרד, לא ניתוב"** — מופרך חלקית. קיים כבר בקוד **פיצ'ר "הזמן לריצה" חי ומחווט** (`InviteRunButton`, `RunShareBar`, `/api/invite/run-session`, `session/[token]`) שלא הוזכר בבריף המקורי כלל. זו לא התחלה מאפס.
4. **`useSearchNavigation.ts`** — **תוקן (08.08, בעקבות בדיקת דוד).** הניסוח הקודם בגרסה זו ("קוד legacy מת בפועל") היה לא מדויק — טעות שלי בהכללת יתר. המצב המדויק, שחציתי לשני חלקים נפרדים באותו קובץ:
   - **מת, מאומת**: `fetchNavigationVariants` (`useSearchNavigation.ts:130-241`) — מנגנון ה"3 וריאנטים" הישן שקורא ישירות ל-`MapboxService.getSmartPath` ועוקף את `route-generator.service.ts`. `grep -rn "\.fetchNavigationVariants("` בכל הקוד מחזיר אפס קריאות בפועל — רק הגדרה (`useSearchNavigation.ts:247`) ו-pass-through דרך `useMapLogic.ts:176`. הערת הקוד ב-`useMapLogic.ts:66-68` מאשרת: הוחלף ע"י RouteCarousel+commute mode.
   - **חי וחשוב, לא מת**: ה-effect המבוזר (`useSearchNavigation.ts:66-128`, debounce 400ms, סף 3 תווים) שממזג `MapboxService.searchAddress` + פארקים + מסלולים רשמיים לרשימת הצעות אחת (`suggestions`) — זה חי ומרונדר בפועל. `useMapLogic.ts:42` מייצר את ה-hook (`const search = useSearchNavigation(...)`), חושף `searchQuery`/`suggestions` (`useMapLogic.ts:164-167`), אלה זורמים ל-`DiscoverLayer.tsx:966-968` (`logic.searchQuery`, `logic.suggestions`) ומוצגים דרך `FloatingSearchBar.tsx` (שדה הקלט) + **`NavigationHub.tsx`** (390 שורות — קומפוננטה שלמה וחיה: תצוגת ההצעות + מקומות שמורים בית/עבודה מ-`useSavedPlacesStore` (`NavigationHub.tsx:109`) + חיפושים אחרונים, כולה מחוברת ל-`onAddressSelect` שמגיע כ-`handleAddressSelect` מ-`DiscoverLayer.tsx:969` — **אותו** handler שכבר מפעיל `startCommute()`). `NavigationHub` עצמה מותקנת חי ב-`DiscoverLayer.tsx:1145,1148`.
   **מסקנה מתוקנת**: אין "hook מת" כאן — יש קובץ אחד עם פונקציה מתה אחת (`fetchNavigationVariants`) ופייפליין חי ומלא (suggestions) שמזין קומפוננטת UI שלמה וחיה (`NavigationHub`). זה משנה את מיפוי אבני-הבניין של יכולת ב' — ראו שם.
5. **מגבלת ה-20 ק"מ "כנראה שרירותית, לא מגבלת מנוע"** — נכון שהיא שרירותית (`FreeRunDrawer.tsx:534`, commit `36143b77`, ללא הערה), אבל **המנוע כבר מקבל יעדים מעל 20 ק"מ היום** דרך טאבי הזמן/קלוריות + רכיבה (120 דק' רכיבה = 40 ק"מ; 800 קלוריות רכיבה = 32 ק"מ) — ללא בדיקות, וב-2 קבועים מקודדים-קשיח (`isSafe` cutoff, `idealWaypointDistanceKm` לא מחווט) שמשפיעים על איכות הלולאה במרחקים גדולים.

---

## מיפוי לפי יכולת

### א. distance_cap — הרמת מגבלת 20 ק"מ
**מורכבות: MEDIUM** (לא "שינוי שורה אחת" כפי שהניח הבריף) — **✅ נבנה ונדחף ל-main (08.08)**

> **עדכון לאחר בדיקה על מכשיר (08.08, סבב 1)**: דוד מצא כשל אמיתי — לולאה רגילה (בלי כתובת) של 22 ק"מ החזירה "לא הצליח למצוא מסלול". שורש הבעיה: חלון קבלת-המרחק `[target-0.5, target+2.5]` הוא רוחב **מוחלט קבוע** של 3 ק"מ — 100% מיעד של 3 ק"מ, אבל רק ~14% מיעד של 22 ק"מ. תוקן: `computeDistanceWindow()` (הוצא לפונקציה טהורה + טסטים) — הטווח עכשיו סקיילי (10%/15% מהיעד, עם הערכים המקוריים כרצפה). ראו commit `7f9bae0`.
> **עדכון לאחר בדיקה על מכשיר (08.08, סבב 2)**: גם עם הטווח החדש, 22 ק"מ עדיין נכשל — 5 המסלולים שנבנו היו כולם 4-15 ק"מ. חקרתי עם סקריפט read-only מול הנתונים האמיתיים (לא ניחוש): **הבעיה האמיתית — `fetchScoredWaypoints` חתך ל-top-12-לפי-ניקוד-איכות *לפני* שה-scoring המודע-ליעד (`idealWaypointDistanceKm`, התיקון של א') בכלל רץ עליהם.** נתונים אמיתיים מתל אביב: 61 מקטעים בעיר עם ניקוד-תקרה (10.0), מקובצים בקוטר של 5.5 ק"מ בלבד — בזמן שכל אוכלוסיית ה-score≥6 (6106 מסמכים!) פרושה על כל העיר (7×7 ק"מ). `limit(50)` ראה רק את האשכול הזה, בלי קשר למיקום המשתמש או לרדיוס היעד. **תיקון (מאומת אמפירית לפני שנשלח)**: scoring מודע-ליעד על כל 6106 המסמכים החזיר 12/12 מועמדים בטווח 1 ק"מ מהרדיוס האידיאלי (22/6≈3.67 ק"מ) — `limit(300)` (במקום `limit(50)`) כבר משיג תוצאה זהה (12/12), `limit(200)` רק 11/12. שני שינויים: (1) `limit(50)→limit(300)` בשאילתת Firestore, (2) הסרת `.slice(0,12)` הפנימי של `fetchScoredWaypoints` (שהיה מבוסס ניקוד-איכות בלבד) כדי שה-scoring המודע-ליעד הקיים ב-`generateDynamicRoutes` יעשה את הבחירה בפועל. **עלות**: פי 6 קריאות Firestore לעיר עם דאטה (50→300), לא פי 122 (נבדק ונדחה — שליפת כל האוכלוסייה מיותרת). **מגבלה שיורית שלא נפתרה**: אם `idealWaypointDistanceKm` (יעד/6) עולה על הפריסה הגיאוגרפית של נתוני העיר עצמה (תל אביב ~7 ק"מ), אין מקטעים אמיתיים למצוא — הגדלת המאגר לא יוצרת דאטה שלא קיים. לא נצפה ב-22 ק"מ (3.67 ק"מ רדיוס נכנס בנוח ב-7 ק"מ), אבל שווה לזכור. ראו commit `d7c75eb`.
> נבדק גם (סבב 1): האם מסלולים קיוריטד/מסומני-איכות מתעלמים — **לא באופן ישיר**, אבל התיקון בסבב 2 חשף שהלוג "Official backbone" מטעה: הוא בודק `score>=10` (שיכול לקרות גם למקטעים לא-רשמיים שהניקוד הגולמי שלהם כבר 10), לא ספציפית `isOfficial`/`officialRouteId`. בפועל, ב-61 המקטעים שנבדקו בתל אביב — **אף אחד לא היה מסומן-רשמי בפועל** (`isOfficial=false`, `officialRouteId=undefined` בכולם). אין משאב "מסלול-לולאה קיוריטד מוכן" נפרד שמתעלמים ממנו — `route-stitching.service.ts`'s `curated_routes` נשאר מנותק לגמרי מ-Free Run החי (אומת שוב), ואינטגרציה איתו תהיה משימה עצמאית נפרדת אם ירצו בכך.

| קיים ורלוונטי | קובץ:שורות |
|---|---|
| `GoalSlider` — קומפוננטה טהורה, `max` הוא prop בלבד | `FreeRunDrawer.tsx:130-166,534` |
| `computeTargetKm`/`buildRouteGenRequest` — כבר distance-agnostic ומכוסה ב-unit test | `route-request.utils.ts:36-66` |
| `idealWaypointDistanceKm` — override lever קיים, כבר בשימוש ע"י hybrid | `route-generator.service.ts:95,524`; קורא: `start-hybrid-session.ts:413` |
| חלון קבלת-מרחק גנרי `[target-0.5, target+2.5]` | `route-generator.service.ts:781-800` |
| רדיוס חיפוש כבר סקיילי (`targetDistance/2`) | `route-generator.service.ts:335` |

**חסר בפועל:**
- `isSafe` cutoff מקודד-קשיח ל-3.0 ק"מ מהמשתמש, בלי שום lever להרחבה (`route-generator.service.ts:537`) — בלולאה גדולה (waypoints ב-`target/6`, כלומר ~6.7 ק"מ ביעד 40 ק"מ) כמעט כל מועמד ייענש.
- `idealWaypointDistanceKm` לא מחווט לאף קורא של Free Run בפועל (`RouteCarousel.tsx:340`, `useRouteFilter.ts:102-105`, `useRouteDeviationOrchestrator.ts:310` — אף אחד לא מעביר אותו) — כלומר בכל יעד מעל כמה ק"מ, ה-scoring נופל בחזרה ל-`idealDistance=1.0` הקשיח ופועל **נגד** בניית לולאה גדולה.
- כיסוי טסטים: `route-generator.calibration.test.ts` בודק רק עד 2.5 ק"מ.

**ממצא מפתיע**: המנוע כבר מקבל בשקט יעדים מעל 20 ק"מ היום (רכיבה + זמן/קלוריות) דרך אותו נתיב קוד בדיוק — הרמת הסליידר לא פותחת תרחיש חדש, היא חושפת תרחיש קיים ולא-נבדק.

**קוד מטעה**: `route-stitching.service.ts` יש לו tiers עד 50 ק"מ לרכיבה, אבל זה צינור אדמין נפרד לגמרי — לא reusable code, רק תקדים מוצרי (שהחברה כבר קיבלה 50 ק"מ רכיבה במקום אחר).

**סיכון**: לא מכפיל קריאות Mapbox (מספר waypoints נשאר ~3-4 בלי קשר ליעד) — הסיכון הוא **איכות מסלול**, לא קריסה/עלות.

**החלטת דוד (08.08)**: בלי תקרה קשיחה בכלל בסליידר. רק המגבלות הטכניות הטבעיות (Mapbox waypoints, מגבלות מנוע) — לא מספר שרירותי כמו 20/40/50.
**השלכה על התכנון**: הסרת התקרה **לא** מבטלת את הצורך בשני התיקונים שזוהו למעלה (`isSafe` cutoff, `idealWaypointDistanceKm`) — להפך, היא הופכת אותם ממצב-קצה נדיר לתרחיש שמובטח לקרות (בלי תקרה, משתמשים ינסו יעדים גדולים בוודאות, לא רק בתאוריה). **הבהרה חשובה**: אין ל-loop mode "תקרה טבעית" נקייה כמו מגבלת 25-waypoints של Mapbox ל-leg_chaining — היא לא רלוונטית כאן כי הלולאה תמיד משתמשת ב-~3-4 waypoints בלי קשר ליעד. התקרה הטבעית האמיתית ל-loop mode היא **עקומת-הידרדרות איכות רכה**, לא קיר טכני קשיח: ככל שהיעד גדל, כיסוי ה-`street_segments` ב-Firestore (המקור הראשי למועמדי-waypoint) מתדלדל יחסית לרדיוס החיפוש (`searchRadiusKm = targetDistance/2`), וללא תיקון `isSafe`/`idealWaypointDistanceKm` המערכת עלולה להחזיר פחות מ-3 מסלולים תקינים בשקט (fallback ל-`MOCK_ROUTES`) במקום שגיאה גלויה. המלצה: לתקן את שני הקבועים **לפני** או **יחד עם** הסרת התקרה, לא אחרי.

### ב. address_destination — ניווט לכתובת יעד
**מורכבות: LOW** (הפתעה הגדולה של המחקר — כמעט כל השכבות כבר קיימות וחיות)

| קיים וחי בפרודקשן | קובץ:שורות |
|---|---|
| מנוע A-to-B מלא (עד 3 וריאנטים, קריאת Mapbox יחידה) | `route-generator.service.ts:865-1040` |
| קומפוננטה מאוחדת שכבר תומכת `mode='commute'` | `RouteCarousel.tsx:169-430` |
| `startCommute()` — מגשר כתובת→session | `DiscoverLayer.tsx:912-922,924-957,1204-1276` |
| מודל session מלא (XP נפרד, `sessionKind:'commute'`) | `useRunningPlayer.ts:100-137,1429-1600` |
| 4 מסכי HUD חיים כבר מסתעפים נכון על `isCommute` | `FreeRunOverlay/FreeRunActive/AdaptiveMetricsWrapper/FreeRunSummary.tsx` |
| **תוקן (08.08)** — pipeline הצעות חי ומבוזר (mapbox geocoding + פארקים + מסלולים רשמיים ממוזגים לרשימה אחת, debounce 400ms) | `useSearchNavigation.ts:66-128` |
| **תוקן (08.08)** — **`NavigationHub`, קומפוננטת UI שלמה וחיה של "בחר יעד"**: מרנדרת את ה-suggestions, מקומות שמורים בית/עבודה (`useSavedPlacesStore`), וחיפושים אחרונים — הכל מחובר ל-`onAddressSelect` שהוא **בדיוק** אותו handler שמפעיל `startCommute()`. מותקנת חי ב-`DiscoverLayer.tsx:1145,1148`. | `NavigationHub.tsx` (390 שורות), `NavigationHub.tsx:58,102,146,347` (onAddressSelect wiring), `DiscoverLayer.tsx:969` |
| Geocoding גולמי עצמאי (לשימוש רק אם לא רוצים את ה-pipeline המלא) | `mapbox.service.ts:213-233` (`searchAddress`) |
| היפוך גנרי-טהור להלוך-חזור (אם ירצו round-trip) | `park-out-and-back.ts:46-50` |
| מקומות שמורים בית/עבודה — חי, persisted | `useSavedPlacesStore.ts:32-95` |

**חסר בפועל — קטן אף יותר ממה שהוערך במקור (הכל UI-wiring, לא engine, ועכשיו לא-בהכרח דורש בניית שדה-חיפוש חדש בכלל):**
- טריגר חדש בתוך `FreeRunDrawer` שפותח את זרימת ה-`NavigationHub` הקיימת (במקום לבנות שדה חיפוש/הצעות מאפס) — למשל כפתור "יעד: כתובת" שמפעיל את אותו `navState='searching'` שה-search bar הראשי כבר מפעיל.
- callback חדש מ-`FreeRunDrawer` ל-`DiscoverLayer` שמפעיל את `startCommute()` הקיים (ללא שינוי).
- הרחבת טיפוסי `route-request.utils.ts` (אין היום מושג "destination goal").

**סיכון — מדויק יותר עכשיו**: לא טכני — מוצרי/UX, וחזק יותר ממה שכתבתי במקור. `NavigationHub` הוא כבר חוויית "בחר יעד" בוגרת ומלאה (הצעות חיות + בית/עבודה + חיפושים אחרונים). בניית שדה-חיפוש *נפרד* בתוך `FreeRunDrawer` תיצור כפילות UX ממשית מול חוויה קיימת ומלוטשת. **המלצה מתוקנת**: להעדיף הפעלה/reuse של `NavigationHub` הקיים על פני בניית קלט חדש — זה גם פחות עבודה וגם נמנע מפיצול UX.

**החלטות דוד (08.08):**
- **מיקום UI**: כפתור/אפשרות נפרדת **מתחת** לטאבים הקיימים (זמן/מרחק/קלוריות) — לא מחליף אותם, נוסף.
- **ברירת מחדל**: לא משתנה — אם "יעד: כתובת" לא נבחר במפורש, ה-flow נשאר לולאה-הלוך-חזור בדיוק כמו היום. רק בחירה מפורשת פותחת את זרימת הזנת-הכתובת.
- **איחוד עם `NavigationHub`**: מאושר, כמו שהומלץ.

**ממצא נוסף, מאומת (08.08) — שאלה #1 של דוד: האם `searchAddress` מחזיר כל כתובת, או רק פארקים/מסלולים?**
תשובה מדויקת: **שתי הטענות נכונות בו-זמנית, בשכבות שונות** — זה לא gate טכני קשיח, אבל יש bug אמיתי בסדר-התצוגה שדוד צדק לחשוד בו.
- **המנוע עצמו לא מוגבל.** `MapboxService.searchAddress` (`mapbox.service.ts:213-233`) קורא ל-Mapbox Geocoding v5 הגולמי (`mapbox.places`, `country=il`, `limit=5`) **בלי שום פילטר סוג** — מחזיר כל כתובת/POI/שכונה שהגיאוקודר של Mapbox מכיר בישראל, לא רק פארקים.
- **אבל המיזוג-להצעות מקדם פארקים/מסלולים באופן קבוע.** `useSearchNavigation.ts:78-123` בונה את רשימת ה-suggestions כך: `[...parkHits(עד 5), ...routeHits(עד 3), ...geoHits(עד 5, כתובות גולמיות)]` — **סדר קבוע, בלי דירוג-רלוונטיות משולב**. `parkHits`/`routeHits` מסוננים ע"י `p.name/city.toLowerCase().includes(term)` כאשר `term` הוא **כל המחרוזת שהוקלדה**. משמעות בפועל: שאילתת כתובת רגילה ("הרצל 15") כמעט לעולם לא תפעיל את הפילטר הזה (שם/עיר קצרים לא יכילו מחרוזת ארוכה) — אבל שאילתה שמתחילה בשם עיר/פארק (למשל **"רמת גן"**, בדיוק איך שדוד עצמו תיאר את התרחיש שלו: "לרוץ לחבר ברמת גן") **כן** תפעיל אותו, ותציף עד 8 תוצאות פארק/מסלול **לפני** שאפילו תוצאת-כתובת גולמית אחת מופיעה.
- **התצוגה לא עוזרת.** `NavigationHub.tsx:337-368` מרנדר את `displayItems` (= `suggestions`) כרשימה שטוחה אחת תחת כותרת "תוצאות חיפוש" יחידה — **בלי הפרדה לפי מקור ובלי cap**. אין קיבוץ ויזואלי שיעזור למשתמש לדלג ישר לכתובות.
- **מסקנה**: זו לא מגבלה ארכיטקטונית (המנוע התחתון לא "נעול" לפארקים) — זה **באג-סדר אמיתי ומאומת** בשכבת המיזוג/תצוגה, שיפגע בדיוק בתרחיש של דוד (הקלדת שם עיר כצעד ראשון בהזנת כתובת חבר). מכיוון שדוד כבר אישר reuse של `NavigationHub` ליכולת ב', הבאג הזה **עובר בירושה אוטומטית** ל-address_destination. **המלצה**: לתקן את סדר המיזוג (למשל: לשלב geoHits בין parkHits/routeHits לפי ניקוד-רלוונטיות, או לפחות להעלות geoHits מעל parkHits/routeHits כשהשאילתה נראית כמו כתובת עם מספר בית) **לפני או יחד עם** בניית יכולת ב' — לא נדרש לתקן את `searchAddress` עצמו, רק את שכבת המיזוג/תצוגה.

**ממצא נוסף, מאומת (08.08) — שאלה #2 של דוד: האם "נווט לפארק" חולק תשתית עם commute-mode/RouteCarousel, או נתיב נפרד?**
**מאושר במפורש, לא הנחה — עקבתי את השרשרת המלאה עד הקוד:**
1. כפתור "Navigate" בכרטיס פארק: `park-preview/index.tsx:48-55` (`handleNavigate`) → `setPendingCommute({ coords: [park.location.lng, park.location.lat], label: park.name })`.
2. נצרך ע"י `DiscoverLayer.tsx:479-496` (ה-`pendingCommute` consumer) → קורא `setCommuteRouteConfig({ destination, label })` + `setMapMode('commute')`.
3. זה **בדיוק** אותו state (`commuteRouteConfig` + `mapMode='commute'`) שמזין את `RouteCarousel(mode='commute')` → `route-generator.service.ts`'s `generateCommuteRoutes` — **הזהה לחלוטין** לנתיב שמופעל מ-`NavigationHub`/חיפוש-כתובת חופשי.
**מסקנה**: אין נתיב מקביל. "נווט לפארק", "נווט למקום שמור (בית/עבודה)", וחיפוש-כתובת-חופשי הם **שלוש נקודות-כניסה שונות לאותו מנוע commute יחיד**. זה מחזק עוד יותר את דירוג ה-LOW של יכולת ב' — אין סיכון של "מנוע נפרד לפארקים מול כתובות" שצריך לגשר עליו.

---

### ג. leg_chaining — שרשור מקטעים
**מורכבות: HIGH** (הפרויקט האמיתי, אבל מנוע הגיאומטריה כמעט חינם)

| קיים ורלוונטי | קובץ:שורות |
|---|---|
| **הליבה הגיאומטרית כבר גנרית וחיה**: `getSmartPath`/`getSmartPathAlternatives` מקבלות מערך waypoints שרירותי, קריאת Mapbox אחת = מסלול רציף. משמש כבר ע"י loop mode (3-4 waypoints) | `mapbox.service.ts:55-143` |
| דוגמה טהורה לשרשור-קליינט (retrace) | `park-out-and-back.ts:46-50` |
| resolver ליעד בודד — reusable כ"leg אחרון" | `route-generator.service.ts:967-1040` |
| **seam מתועד אך לא ממומש שכבר צפה בדיוק את זה** — `RouteStopsBackboneMode` כולל `'waypoints_through_stops'`, מתועד "also the base for a future short-detour", אבל המימוש הוא `console.warn(...); return null` | `start-hybrid-session.ts:357-361,477-479` |

**false-friend מאומת**: `route-stitching.service.ts` (Diamond loops) — 90% מהקובץ שייך אך ורק לצינור אדמין/curated_routes; ה-helpers ה"שימושיים" (haversine, Douglas-Peucker) משוכפלים ממקומות קנוניים אחרים; מנגנון ה-multi-call chain builder היחיד הוא קוד מת. **לא לגעת בקובץ הזה.**

**חסר בפועל (זה הפרויקט האמיתי):**
1. מודל-נתונים ל"תוכנית מקטעים" מסודרת — לא קיים בשום מקום (`RouteGenerationOptions` אין בו מערך legs).
2. אורקסטרטור שהופך תוכנית לקריאת/קריאות Mapbox.
3. UI להרכבה/עריכה של תוכנית לפני ריצה — לא קיים בשום מסך שנבדק.
4. תמיכת נגן-חי (`FreeRunActive`/`GuidedRouteView`) למעברי מקטע — grep החזיר **אפס** תוצאות ל-leg/waypoint.
5. שימור `route.legs[]` (Mapbox כבר מחזיר פירוט מרחק-לכל-מקטע, אבל הוא נזרק היום ב-`mapbox.service.ts:128-130,197-199`) — נדרש רק אם רוצים פידבק UI לפי-מקטע.

**תלויות**: בולע את via_point (via-point = מקטע עם עצירת-ביניים כפויה); ה-leg האחרון = reuse ישיר של address_destination's `generateCommuteRoutes`.

**המלצה**: להתבסס על `getSmartPath` הקיים כליבה (קריאה אחת מרובת-waypoints כשהתוכנית ידועה מראש), **לא לגעת ב-`route-stitching.service.ts`**, לחווט את ה-seam הקיים `waypoints_through_stops` במקום ליצור נתיב מקביל.

---

### ד. via_point — כפיית מסלול דרך נקודת עניין
**מורכבות: MEDIUM כולל, אבל מתפצל בחדות לשני תת-מקרים**

**תת-מקרה (א) — via-point על leg נקודה-לנקודה (commute): LOW.**
- `getSmartPath`/`getSmartPathAlternatives` כבר מקבלות מערך waypoints גנרי, ללא הגבלת 2 נקודות (מאומת, קריאת קובץ מלאה, 240 שורות).
- **תיקון**: אין תקדים חי בפרודקשן (ראו תיקון #4 למעלה) — `fetchNavigationVariants` מת. הפער האמיתי הוא רק חיווט: `generateCommuteRoutes` שולח מערך waypoints **ריק, מקודד-קשיח** (`route-generator.service.ts:997`) — צריך רק להעביר נקודה אחת דרכו.

**תת-מקרה (ב) — via-point בתוך לולאה סגורה: HIGH אם נדרש פתרון "אמיתי", LOW-MEDIUM אם out-and-back מספיק.**
- מנוע הלולאה הוא generate-candidates-and-reject סביב מרחק-יעד, **לא** constrained pathfinding. המנגנון היחיד הקיים לכפיית נקודה (`findFitnessAnchor`, `route-generator.service.ts:543-569`) מוגבל לדומיין `parks` ולטווח-מרחק מחושב-מראש (0.25×-0.6× מהיעד) — אין שדה כללי לכפיית lat/lng שרירותי.
- **המלצה חזקה**: לא לבנות constrained-loop-solver מאפס. להשתמש בתבנית הקיימת `park-out-and-back.ts` (leg 1 = start→via-point, leg 2 = סינתזת חזרה) — הופך את המקרה הקשה למקרה פרטי של leg_chaining.

**סיכון עיקרי**: גישת generate-and-reject עלולה "להיכשל בשקט" (0 מסלולים תקינים) אם via-point שרירותי לא נופל בטווח האידיאלי שההנחות הקיימות מניחות.

---

### ה. live_join — חבר מצטרף באמצע המסלול
**מורכבות: MEDIUM** (הפתעה שנייה — תשתית חברתית/נוכחות שלמה כבר קיימת וחיה, לא הוזכרה בבריף)

**גילוי מרכזי, לא היה בבריף המקורי**: קיים כבר פיצ'ר "הזמן לריצה" **חי, מחווט קצה-לקצה, נגיש למשתמש אמיתי**:

| רכיב | קובץ | תפקיד |
|---|---|---|
| `InviteRunButton` | `FreeRun/InviteRunButton.tsx` (מותקן גם ב-`FreeRunLayer.tsx:288` החי וגם `FreeRunActive.tsx:413`) | כפתור צף |
| `createRunInvite` | `src/lib/workoutInvite.ts:37-74` | יוצר הזמנה, תומך גם ב-scheduledFor |
| `POST /api/invite/run-session` | `src/app/api/invite/run-session/route.ts:85-261` | קבוצה אפמרית + triple-write §17 + `group_invitations/{token}` (תוקף 2 שעות) |
| `SessionTokenPage` | `src/app/session/[token]/page.tsx` | נחיתת המצטרף → `joinViaDeepLink` → `/map?openRun=<activity>` |
| `useSharedSession` | `useSharedSession.ts` | primitive מרכזי, מוזן ל-`usePresenceLayer` (אקסיום §21) |
| `useGroupPresence`/`useGroupPresenceListener` | `hooks/useGroupPresence.ts:142-397` | onSnapshot חי על מיקומי שותפים, כבר מוצג ב-UI (`FreeRunLayer.tsx:267,290-303`, "X רצים יחד") |

**נפתר**: שאלת FreeRunActive מול FreeRunLayer (מוסכמת פרויקט קיימת) — `MapShell.tsx:588` הוא הנתיב החי ל-Free Run רגיל; `FreeRunActive` חי אבל רק דרך נתיב אחר (מסלולים מונחים/`my_routes`), עם `console.log` מפורש מהצוות: "[FreeRunActive OLD] mounted — should NOT appear during free_run mode". `InviteRunButton` מותקן בשניהם — לא קוד מת.

**גם נפתר**: ההנחה ש"כולם מתחילים מאותו מקום ובאותו זמן" — מופרכת בקוד. המצטרף מנותב ל-`/map?openRun=<activity>` ומייצר לולאה **עצמאית מה-GPS שלו**, בדיוק כמו Free Run רגיל — אין שום אכיפת מיקום/זמן זהה.

**חסר בפועל (צר וממוקד, לא מבני):**
1. שדה מיקום/join-point — נבדק ב-3 מקורות (`GroupInvitationDoc`, `SessionAttendance`, `SharedSessionState`) — **אף אחד לא נושא lat/lng**. `CommunityGroup.meetingLocation` קיים כטיפוס אבל `run-session/route.ts:150-164` לא כותב אותו.
2. שיתוף המסלול הדינמי שהמארח מייצר — חי רק ב-state מקומי, לא נכתב ל-Firestore. המנגנון היחיד לשיתוף מסלול (`routeId→official_routes`, `FreeRunLayer.tsx:81-143`) לא מופעל בזרימת ההזמנה.
3. מנגנון בחירת/חישוב נקודת מפגש — לא קיים כלל.
4. ניווט המצטרף לנקודת המפגש — **תלוי ב-address_destination/via_point**, לא לבנות בנפרד.
5. קצב שידור מיקום: Free Run היום = ~2 דק' (`usePresenceLayer`); הקצב המהיר יותר (30/60 שנ', `useWorkoutPresence`) מוגבל ל-`/workouts/[id]/active` בלבד.

**אזהרה**: קוד ה-live path מכיל `console.log` דיבוג מפורש ("DEBUG — remove after routing confirmed", `MapShell.tsx:224-227`) ולוגיקת retry על PERMISSION-DENIED (`useGroupPresence.ts:361-380`) — סימנים שהמערכת עדיין בייצוב. **מומלץ smoke-test חי על מכשיר אמיתי עם דוד לפני בנייה מעל זה** (כלל Verification-First #3).

---

## תקציב Mapbox API (כפי שהבריף ביקש לשקול)

- **מגבלת waypoints**: עד 25 קואורדינטות לבקשה (driving/walking/cycling). לא מגבלה קרובה — אף תרחיש שנחקר לא מתקרב לזה.
- **Rate limit**: 300 בקשות/דקה ברמת החשבון. **כבר נתקלנו בזה בפועל** — `route-generator.service.ts:855-858` כבר מטמיע delay 1.5 שנ' בין קריאות למניעת 429 בלולאת ה-retry הקיימת של loop mode. זו לא סכנה תיאורטית.
- **תמחור**: 100K בקשות חינם/חודש, אז $2/1000 (עד 500K), $1.60/1000 (עד 1M).
- **המלצה ארכיטקטונית שעלתה עצמאית מ-3/5 agents**: להעדיף **קריאה אחת מרובת-waypoints** על פני קריאות רצופות-למקטע בכל מקום שהתוכנית ידועה מראש — זה בחינם ביחס לעלות של היום (קריאת יעד-בודד קיימת). קריאות נפרדות נחוצות רק ל-re-routing חי אחרי סטייה — זה התרחיש היחיד שמעלה משמעותית נפח/עלות.
- **בונוס חינמי**: `route.legs[]` (פירוט מרחק/משך לכל מקטע) כבר מחושב ע"י Mapbox בכל קריאה מרובת-waypoints, אבל נזרק היום (`mapbox.service.ts:128-130,197-199`) — פידבק "מקטע-לפי-מקטע" ב-UI אפשרי **בלי שום קריאת API נוספת**, רק תיקון wrapper.

Sources: [Directions API | Mapbox](https://docs.mapbox.com/api/navigation/directions/), [Mapbox pricing](https://www.mapbox.com/pricing)

---

## סדר בנייה מומלץ

```
Tier 0 (עצמאי, ללא חסימות, כל אחד ניתן ל-ship בנפרד)
  א. distance_cap        MEDIUM   —  הסרת התקרה + תיקון tuning במנוע הלולאה (הוחלט 08.08: בלי תקרה קשיחה)
  ב. address_destination LOW      —  חיווט UI ל-NavigationHub הקיים (הוחלט 08.08: כפתור נוסף, לא מחליף; default לא משתנה)
     ⚠️ תיקון-קדם נדרש: באג סדר-מיזוג ב-suggestions (parkHits/routeHits תמיד לפני geoHits) — ראו יכולת ב' — עובר בירושה מ-NavigationHub, לתקן לפני/יחד עם ב'

Tier 1 (בנוי ישירות על ב', תוספת מבודדת קטנה)
  ד(א). via-point על leg נקודה-לנקודה   LOW   — thread שדה דרך generateCommuteRoutes
  ד(ב). via-point בתוך לולאה — לא לבנות בנפרד; להטמיע כמקרה פרטי של ג'

Tier 2 (הפרויקט האמיתי — מממש את התרחיש המלא של דוד)
  ג. leg_chaining         HIGH   —  מודל-נתונים + אורקסטרטור + UI הרכבה + תמיכת נגן-חי
     תלוי ב: ב' (leg אחרון), בולע את ד(ב)

Tier 3 (מקביל אפשרי לאחר ב', לא תלוי ב-ג')
  ה. live_join            MEDIUM —  הרחבת תשתית הזמנה/נוכחות חיה שכבר קיימת
     תלוי ב: ב'/ד(א) (ניווט המצטרף לנקודת מפגש)
```

**התרחיש המלא של דוד** (הטיה לטיילת → המשך לכתובת חבר → חבר שני מצטרף, ~22 ק"מ) דורש שילוב של **ב' + ג' + ה'** (וא' כדי לוודא שה-22 ק"מ בכלל אפשריים). אף יכולת בודדת לא מספקת את התרחיש המלא — אבל כל אחת נותנת ערך עצמאי: ב' לבד כבר נותנת "רוץ לכתובת של חבר", א' לבד מרימה את התקרה, ה' לבד מאפשרת לחבר להצטרף לריצה פשוטה כבר היום.

---

## החלטות מוצר נדרשות מדוד (מרוכז לפי יכולת)

**א׳ — distance_cap — ✅ הוחלט (08.08):** בלי תקרה קשיחה כלל; רק מגבלות טכניות טבעיות. נותרו פתוחות (לא הוכרעו במפורש עדיין):
- להרים גם את טאבי זמן/קלוריות (שכבר מרמזים 32-40 ק"מ ברכיבה) באותה רוח של "בלי תקרה", או שיש שיקול נפרד עבורם?
- תקרה אחידה או per-activity (גם בלי תקרה מספרית, ייתכן שרוצים UX שונה בין הליכה לרכיבה)?
- האם `isSafe` (3 ק"מ מהמשתמש) הוא קונספט בטיחות אמיתי ששווה לשמר בצורה מותאמת-קנה-מידה, או שרירותי?

**ב׳ — address_destination — ✅ הוחלט (08.08):** כפתור/אפשרות נפרדת מתחת לטאבים הקיימים (זמן/מרחק/קלוריות) — לא מחליף; ברירת מחדל לא משתנה (לולאה-הלוך-חזור, רק בבחירה מפורשת נפתחת זרימת-כתובת); איחוד עם `NavigationHub` מאושר. פתוח בפועל רק:
- ⚠️ **חדש (08.08)**: לתקן את סדר-המיזוג ב-`useSearchNavigation.ts:123` (parkHits/routeHits תמיד לפני geoHits, בלי דירוג-רלוונטיות) לפני שממשיכים — ראו פירוט מלא ביכולת ב' למעלה. זה gate אמיתי (לא ארכיטקטוני, אבל אמיתי) שיפגע בדיוק בתרחיש "רוץ לחבר ברמת גן" של דוד אם לא יתוקן.
- toggle להלוך-חזור (reuse `buildOutAndBackPath`) — עדיין לא הוכרע אם נדרש בשלב ראשון, מעבר ל-one-way שכבר קיים.

**ג׳ — leg_chaining:**
- "הטיה" (detour) — נקודה מפורשת שהמשתמש בוחר, או הצעה אלגוריתמית?
- מקטע יכול לשנות activity (הליכה↔ריצה↔רכיבה) באמצע, או כל המקטעים חולקים profile אחד?
- תוכנית-מקטעים נשמרת/משותפת (Firestore) או state זמני לריצה בודדת?
- נדרש re-routing חי בסטייה ממקטע? (משפיע משמעותית על עלות/היקף)
- תקרת מספר מקטעים לתוכנית?

**ד׳ — via_point:**
- via-point בתוך לולאה — לולאה אמיתית (רחובות שונים בחזרה) חובה, או out-and-back מספיק מוצרית?
- אילוץ קשה (Mapbox חייב לעבור פיזית) או אילוץ רך (הטיית ניקוד, כמו מכפיל 5x הקיים ל-officialRouteId)?
- מקור הנקודה — חיפוש כתובת חופשי (תלוי ב-ב') או רשימת POI אצורה מראש (עצמאי)?

**ה׳ — live_join:**
- מספיק שהמצטרף יראה נקודה כחולה נעה + יעד משותף (כמו היום, ללא שינוי קוד), או צריך לראות את קו המסלול הפיזי?
- נקודת ההצטרפות — ידנית (פין/מוסכם-מראש) או מחושבת אוטומטית (הכי קרובה על המסלול)?
- קצב 2 הדק' הנוכחי מספיק, או נדרש שדרוג לקצב מהיר יותר?
- הפיצ'ר הוא Free Run בלבד, או גם מסלולים מונחים (my_routes) שגם משתמשים ב-InviteRunButton?

---

## מגבלות המחקר (מה לא אומת)

- **read-only בלבד** — שום smoke-test על מכשיר/דפדפן לא בוצע (לפי כלל Verification-First #3, נדרש לפני build אמיתי, בפרט לזרימת ה-invite ב-ה׳).
- התנהגות Mapbox בפועל (continue_straight + via-point שרירותי לא-פארק) הוסקה מתקדים אחד (`findFitnessAnchor`, פארקים בלבד) — לא נבדקה קריאת API אמיתית.
- לא נבדק לעומק שכבת Firestore/persistence עבור תוכנית-מקטעים משותפת (ג׳) — open question מפורש.

---

## ג' — leg_chaining: המלצות למענה על שאלות המוצר הפתוחות (08.08, agent research)

> סוג: המלצות מבוססות-קוד, לא החלטה. דוד ביקש במפורש "אפשר להעלות המלצות ולסמן מה עוד דורש ממני החלטה, לא לחכות שאני אשאל". לכל שאלה: המלצה + נימוק מעוגן ב-file:line + סימון ודאות (אפשר-להכריע-כברירת-מחדל / דורש-החלטת-דוד, עם הסבר מדוע). לא נכתב או שונה שום קוד — מחקר בלבד, ר"ל אותה מתודולוגיה read-only כמו שאר המסמך.

### 1. "הטיה" (detour) — נקודה מפורשת שהמשתמש בוחר, או הצעה אלגוריתמית?

**המלצה: בחירה מפורשת של המשתמש (via-point שנבחר, לא אלגוריתם-הצעה).**

**נימוק**: סעיף ד' (via_point) של המסמך הזה כבר בדק את זה לעומק וזה בדיוק המקור שהשאלה מפנה אליו. הממצא המרכזי: מנוע הלולאה (loop mode) הוא generate-candidates-and-reject סביב מרחק-יעד — **לא** constrained pathfinding שיודע "תעבור דרך הנקודה הזו". המנגנון האלגוריתמי היחיד שקיים בקוד לכפיית נקודה הוא `findFitnessAnchor` (`route-generator.service.ts:543-569`), והוא **domain-locked לפארקים בלבד** עם טווח-מרחק מחושב-מראש (0.25×-0.6× מהיעד) — אין שדה כללי לכפיית `lat/lng` שרירותי (כתובת, נקודת ציון על מפה, כל דבר שאינו פארק בקטלוג). כדי להפוך "הצעה אלגוריתמית" לפיצ'ר כללי (לא רק-פארקים) יהיה צריך לבנות solver חדש — למעשה constrained-loop-solver, שהמסמך כבר ממליץ נגדו במפורש בסעיף ד' ("**המלצה חזקה**: לא לבנות constrained-loop-solver מאפס").
לעומת זאת, "בחירה מפורשת" היא **בדיוק** אותו primitive שכבר הוחלט ליכולת ב' (`NavigationHub` + `startCommute`, `route-generator.service.ts:967-1040`) — המשתמש בוחר יעד/נקודה מתוך אותה חוויית "בחר יעד" קיימת, ולא צריך מנגנון הצעה חדש בכלל. במילים אחרות: מה שנראה כמו "פחות עבודת מוצר" (הצעה אלגוריתמית חוסכת מהמשתמש להקליד/לבחור) הוא בפועל **המסלול היקר יותר טכנית** — כי אין תשתית הצעה גנרית קיימת, רק תשתית בחירה-מפורשת.
זה לא שולל שיפור עתידי: `findFitnessAnchor` יכול לשמש בסיס ל"הצעות" **מוגבלות לדומיין פארקים** (למשל: "יש פארק במרחק X בכיוון שאתה הולך — לעצור שם?") כתוספת UX מעל הבחירה המפורשת, לא כתחליף לה.

**ודאות: אפשר להכריע כברירת-מחדל.** הנימוק הטכני חד-משמעי — התשתית הקיימת תומכת רק במסלול אחד מבין השניים בעלות סבירה.

### 2. מקטע יכול לשנות activity (הליכה↔ריצה↔רכיבה) באמצע, או כל המקטעים חולקים profile אחד?

**המלצה: כל המקטעים בתוכנית חולקים profile/activity אחד ל-v1. אין מעבר activity בתוך תוכנית.**

**נימוק — שתי שכבות עצמאיות שתומכות באותה מסקנה:**
- **שכבת הניתוב**: קריאת Directions יחידה מרובת-waypoints (ההמלצה הארכיטקטונית של המסמך, ר' "תקציב Mapbox API" למעלה) שולחת `profile` **אחד** לכל הבקשה — `getSmartPath`/`getSmartPathAlternatives` (`mapbox.service.ts:55,156`) מקבלות `profile: 'walking' | 'cycling' | 'driving'` כפרמטר יחיד לכל הקריאה, לא per-waypoint. `generateCommuteRoutes` בפועל בונה את ה-`profile` פעם אחת מ-`activity` יחיד לכל הפונקציה (`route-generator.service.ts:976`: `const profile: 'walking' | 'cycling' = activity === 'cycling' ? 'cycling' : 'walking';`). כדי לתמוך ב-profile שונה per-leg יהיה צריך לפצל בחזרה לקריאות Mapbox נפרדות לפי ריצות-רצופות-של-אותו-activity — בדיוק ההיפך מהיתרון ש"קריאה אחת מרובת-waypoints היא בחינם" (סעיף תקציב Mapbox), ומחזיר את סיכון ה-rate-limit שכבר נתקלנו בו בפועל (`route-generator.service.ts:855-858`, delay 1.5 שנ' בין קריאות).
- **שכבת הנגן החי**: `useRunningPlayer` — ה-store שמריץ את הסשן החי — מגדיר `activityType` כשדה יחיד ברמת ה-state כולו (`useRunningPlayer.ts:142`: `activityType: 'running' | 'walking';`), עם setter יחיד שמחליף אותו במלואו (`setActivityType`, `useRunningPlayer.ts:284,436`) ולא מנגנון "activity לפי מקטע/זמן". השדה הזה מוזרם ישירות ל-XP ולסיכום הסשן כערך יחיד לכל הסשן — למשל `aerobicType`/`workoutType` נגזרים ממנו פעם אחת ב-completion payload (`useRunningPlayer.ts:1547,1575-1576`). כלומר גם אם המנוע הגיאומטרי היה תומך ב-profile-per-leg, **הנגן החי כרגע לא מייצג "סשן עם כמה activity types"** — זה שינוי מבני בסטור, לא רק בניתוב. שימו לב גם: `ActivityType` הכללי בטיפוסים (`route.types.ts:14`) כולל 4 ערכים (`'running' | 'walking' | 'cycling' | 'workout'`), אבל `useRunningPlayer.activityType` מצומצם ל-2 (`'running' | 'walking'`) עם cast מפורש בכל מקום שקורא ל-Firestore/summary (`(activityType as 'running' | 'walking') ?? 'running'`) — כלומר אפילו רכיבה (`cycling`) לא מיוצגת כערך legit בנגן החי היום, לא רק activity-switch-mid-plan.

**ודאות: אפשר להכריע כברירת-מחדל.** שתי שכבות בלתי-תלויות (ניתוב + נגן-חי) מובילות לאותה מסקנה שprofile-אחד-לתוכנית זול משמעותית מ-mixed-profile, ואין בבריף/בתרחיש-האב של דוד (הטיה לטיילת → כתובת חבר, כולה ריצה) שום דרישה מוצרית ל-activity switch. אם בעתיד יעלה צורך מוצרי אמיתי ל"תוכנית מעורבת" (למשל הליכה→רכיבה), זה דורש רה-ארכיטקטורה של `useRunningPlayer` בפני עצמה — לא תוספת קטנה לג'.

### 3. תוכנית-מקטעים נשמרת/משותפת (Firestore) או state זמני לריצה בודדת?

**המלצה: state זמני/ephemeral בזמן-בנייה (על המכשיר), *מתקמפל* למבנה `Route` רגיל ברגע ההתחלה — לא נשמר כמסמך Firestore עצמאי בשלב v1. חריג ממוקד: אם יכולת ה' (live_join) מופעלת על אותה ריצה, המסלול המתומפל (לא "התוכנית" הגולמית) צריך רשומת Firestore קלה, פר-סשן.**

**נימוק — שני תקדימים קיימים בקוד תומכים בכיוון הזה:**
- **תקדים "state מורכב מסודר, לא-Firestore" קיים כבר בדיוק לתוכנית-סוג-הזו**: `ComposedHybridSession` (`start-hybrid-session.ts:41-84`) הוא בדיוק מודל של "רצף שלבים מסודר" (`stations[]`, סדר, כל תחנה עם המרקר שלה) — **מחושב-פעם-אחת ומוחזק ב-state בזמן ריצה**, לא נכתב כמסמך Firestore נפרד לכל תוכנית. `runHybridPlan` מריץ עליו ישירות. זו בדיוק אותה משפחת בעיה (רצף שלבים → הרצה חד-פעמית), ובחרו שם ephemeral, לא persisted.
- **תקדים "טוקן/סשן ephemeral, TTL-קצר" קיים ליכולת דומה בהיקף**: `GroupInvitationDoc` (`group-invitation.service.ts:23-37`) הוא הדגם הכי קרוב ל"אם כן צריך Firestore, איך שומרים דבר-חצי-חי": מסמך top-level ב-`group_invitations/{token}`, TTL קצר (2 שעות, `EXPIRY_MS`, `group-invitation.service.ts:51`), לא חלק מהפרופיל הקבוע של המשתמש, לא shareable/reusable — נוצר ברגע הצורך הספציפי (`createSessionInvitation`, `group-invitation.service.ts:70-99`) ונזרק אחרי חלון הזמן. **זה בדיוק הדגם שמתאים** אם תוכנית-מקטעים צריכה נוכחות ב-Firestore (כלומר: לא "שמור לי את התוכנית לפעם הבאה", אלא "לצורך הריצה *הזו* בלבד, גם משתתפים אחרים צריכים לראות אותה").
- **למה בכלל יכול להידרש Firestore**: המסמך הזה כבר זיהה תלות ישירה ביכולת ה' (live_join) — "שיתוף המסלול הדינמי שהמארח מייצר — חי רק ב-state מקומי, לא נכתב ל-Firestore" (סעיף ה', חוסר #2). זה חוסר קיים **גם היום** ב-Free Run רגיל (בלי ג' בכלל) — ולכן זה לא "עוד עלות שג' מוסיפה", זה חוסר-תשתית עצמאי שה' כבר צריכה לפתור בלי קשר לג'. ברגע שה' פותרת את זה (מסלול מתומפל נכתב לרשומת סשן ephemeral בסגנון `GroupInvitationDoc`), ג' פשוט משתמשת באותה רשומה — לא צריכה תשתית persistence נפרדת משלה.

**ודאות: אפשר להכריע כברירת-מחדל *לחלק הזה בלבד* (ephemeral vs. per-session Firestore לצורך live_join). יש שאלת-משנה אחת שדורשת החלטת דוד באמת**: האם משתמש אמור להיות מסוגל **לשמור תוכנית-מקטעים כתבנית לשימוש חוזר** ("המסלול שלי לימי שלישי: בית→טיילת→ג'ים")? זו שאלת-פיצ'ר מוצרית טהורה — שום תקדים קוד לא פותר אותה כי אין תקדים דומה ("שמור מסלול מותאם-אישית בתור מועדף") בקוד היום מלבד `useSavedPlacesStore` (בית/עבודה, לא תוכניות-מקטעים). אם דוד רוצה reusable templates — זה collection נפרד (`users/{uid}/leg_plan_templates` או דומה) שנוסף מעל ההמלצה כאן, לא סותר אותה.

### 4. נדרש re-routing חי בסטייה ממקטע? (משפיע משמעותית על עלות/היקף)

**המלצה: לא ל-v1. לדחות מפורשות — אבל לתעד שזו הרחבה על תשתית קיימת, לא בנייה מאפס, כשיגיע הזמן.**

**נימוק**: זו הפתעת-המחקר המרכזית של השאלה הזו — **יש כבר מנגנון re-routing-אחרי-סטייה חי ומחווט בפרודקשן**, לא היפותטי:
- זיהוי סטייה: `useRunningPlayer.checkRouteDeviation` (`useRunningPlayer.ts:449-500`), סף 40 מ' (`ROUTE_DEVIATION_THRESHOLD_M`, שורה 73) עם דגימה-עקבית (3 דגימות רצופות, `ROUTE_DEVIATION_SAMPLE_THRESHOLD`, שורה 78) כדי למנוע false positive מקפיצת GPS בודדת.
- אורקסטרציה מלאה: `useRouteDeviationOrchestrator.ts` (365 שורות) — כולל הודעה קולית בעברית ("סטית מהמסלול, מחשב מסלול מחדש לסיום האימון", שורה 86), חישוב מרחק-נותר מול היעד המקורי (לא מול ה-`focusedRoute` הנוכחי — מונע "יעד מתכווץ", שורות 267-278), fallback לקו ישר כשנשאר מעט מדי (`DIRECT_RETURN_THRESHOLD_KM = 0.5`, שורה 58), והפעלה מחדש של `generateDynamicRoutes` עם `activeOfficialRouteId` שמטה את הניקוד פי 5 בחזרה לכיוון המסלול המקורי (`route-generator.service.ts:356-368`, `OFFICIAL_ROUTE_BIAS_MULTIPLIER`).
- זה **כבר עובד** גם ללולאות וגם למסלולים ליניאריים (`isLoopRoute`, `useRouteDeviationOrchestrator.ts:105-115` — קובע אם היעד הוא נקודת-ההתחלה או הקצה הליניארי).

**אבל** — המנגנון הקיים מבין **יעד אחד בלבד** (start-of-loop או end-of-linear). הוא לא יודע "אני באמצע מקטע 2 מתוך 4, אחרי הסטייה אני צריך לחזור למקטע 2 או לדלג ישר למקטע 3?" — זה דורש להזרים אינדקס-מקטע-פעיל + "מה נשאר בתוכנית אחרי המקטע הזה" לתוך האורקסטרטור, שהיום עובד רק מול `focusedRoute` בודד + `guidedRouteDistanceKm` יחיד (`useRunningPlayer.ts` state). זו עבודה אמיתית, לא triviality — אבל היא **הרחבה** של מנגנון קיים ומוכח, לא בנייה חדשה של: זיהוי-סטייה, קול, ניהול-race-condition (`isRecalculatingRoute`/`offRouteEventToken`), וה-bias-מנגנון עצמו. כל אלה כבר קיימים ועובדים.
בהתחשב בכך שדוד תיאר תרחיש-אב סטטי (בית → טיילת → כתובת חבר) בלי אזכור סטייה/re-routing, ושג' כבר מדורגת HIGH complexity לבדה — דחיית re-routing מ-v1 שומרת את ההיקף סביר בלי לוותר על היכולת: כשהיא תידרש, זו תוספת ממוקדת על אורקסטרטור קיים, לא פרויקט נפרד.

**ודאות: אפשר להכריע כברירת-מחדל.** ההיגיון "דחה כי זה scope-creep על HIGH-complexity feature, והתשתית לא הולכת לשום מקום" חד-משמעי מספיק. אם דוד רוצה live re-routing כבר ב-v1 — זו בחירה מודעת להרחיב את ה-scope, לא גילוי של חסם טכני.

### 5. תקרת מספר מקטעים לתוכנית?

**המלצה: 5 מקטעים ל-v1 (ניתן לשנות בקלות — זה קבוע קונפיגורציה, לא מגבלת ארכיטקטורה).**

**נימוק — זו בעיקר שאלת שיקול-דעת מוצרי, לא ארכיאולוגיית-קוד, וחשוב לומר את זה במפורש:**
- **התקרה הטכנית לא מתקרבת להיות הגורם המגביל**: Mapbox Directions מגביל ל-25 קואורדינטות לבקשה (מתועד בסעיף "תקציב Mapbox API" למעלה). גם אם כל מקטע בתוכנית תורם 1-2 waypoints (start/end + via-point אופציונלי לכל מקטע לפי סעיף 1 למעלה), 5 מקטעים = ~6-10 קואורדינטות — רחוק מ-25. אין כאן "תקרה טבעית" חדה כמו שיש ליכולת א' (`distance_cap`) שהמסמך כבר ציין שהיא *לא* קיימת ל-loop mode — פה כן יש קיר טכני, רק שהוא רחוק.
- **התרחיש-אב של דוד עצמו הוא נקודת-עוגן טובה**: "מהבית → הטיה לטיילת (תוספת מרחק) → המשך לכתובת חבר → חבר שני מצטרף באמצע" הוא כ-3 מקטעים קונספטואליים (בית→טיילת, טיילת→כתובת, +הצטרפות-חבר שהיא לא מקטע ניתוב בפני עצמו אלא אירוע live_join). תקרה של 5 נותנת מרווח נוח מעל התרחיש-האב בלי לפתוח UI שצריך לתמוך ב-"בנה תוכנית של 15 עצירות" — סוג UI שהמסמך כבר ציין שלא קיים בשום מסך (חסר #3 בסעיף ג' למעלה: "UI להרכבה/עריכה של תוכנית לפני ריצה — לא קיים בשום מסך שנבדק").
- **5 הוא מספר שרירותי במובן המוצרי** (בדיוק כמו ה-20 ק"מ שדוד כבר ביטל ביכולת א') — אין קוד חי שמכריע "5 ולא 4 ולא 7". הבחירה כאן מבוססת על יחס-סביר בין התרחיש-אב לבין מורכבות UI, לא על ממצא-קוד.

**ודאות: המלצה ברורה, אבל מסומנת כניחוש-מוצרי מודע, לא כברירת-מחדל טכנית-מוכתבת.** אפשר להתחיל ב-5 בלי חשש (זה קבוע יחיד לשינוי, לא ארכיטקטורה) — אבל אם לדוד יש כוונה שונה למספר עצירות ריאלי בחוויית שימוש (למשל: הוא רוצה UI שתומך ברשימה ארוכה יותר, או להפך — שרק 2-3 בשביל v1 מינימלי), זו קריאה שלו, לא משהו שהקוד קובע.

---

### מודל-נתונים: הצעה ראשונית (SKETCH — לא מומש, לא מחווט, לביקורת דוד בלבד)

הסקיצה למטה משקפת את חמש ההמלצות למעלה: leg יחיד יכול להיות either "לכתובת/נקודה" או "עם via-point כפוי" (via_point הופך מקרה-פרטי של leg, כפי שסעיף ד' כבר קבע); `activity` הוא שדה **ברמת התוכנית כולה**, לא per-leg (המלצה #2); אין שדה Firestore-doc-id ברמת התוכנית עצמה (ephemeral, המלצה #3) — רק hook אופציונלי ל-live_join; אין שדה re-routing/deviation state (נדחה, המלצה #4); `maxLegs` הוא קבוע קונפיגורציה נפרד, לא מוטבע בטיפוס (המלצה #5).

```typescript
// PROPOSAL / SKETCH ONLY — not implemented, not wired. For David's review.
// Reflects the 5 recommendations above; file:line precedent cited in each section.

/** Config constant, not part of the type — kept separate so product can tune
 *  it without a type change. Recommendation #5: start at 5. */
export const MAX_LEGS_PER_PLAN = 5;

/**
 * One user-composed hop in a leg plan. Discriminated by `kind`.
 * `to_point` = plain point-to-point leg (destination only — reuses the
 * existing commute engine, generateCommuteRoutes, as-is for that leg).
 * `via_point` = a leg that must physically pass through an explicit
 * intermediate coordinate before reaching its end point — via_point (ד)
 * folded in as a special case of leg_chaining, per the existing doc's
 * own conclusion (§ד, "via_point = מקרה פרטי של leg_chaining").
 * Recommendation #1: the via-point is always USER-PICKED (from the same
 * NavigationHub / address-search flow as capability ב'), never an
 * algorithmic suggestion — no generic "suggest a detour" primitive exists
 * today (findFitnessAnchor is parks-only).
 */
export type RouteLeg =
  | {
      kind: 'to_point';
      /** Stable id for UI list rendering / reordering, e.g. `leg-${index}`. */
      id: string;
      /** Human label shown in the plan-builder list ("לכתובת של דני"). */
      label?: string;
      destination: { lat: number; lng: number };
    }
  | {
      kind: 'via_point';
      id: string;
      label?: string;
      /** The forced intermediate point — always explicit/user-picked (rec. #1). */
      viaPoint: { lat: number; lng: number; label?: string };
      destination: { lat: number; lng: number };
    };

/**
 * A full leg-chaining plan. `activity` is plan-level, not per-leg
 * (recommendation #2 — the live player + the single-profile-per-Mapbox-call
 * routing model both assume one activity for the whole session today;
 * mixed-profile legs are a separate, larger future project, not part of
 * this sketch).
 *
 * Deliberately NOT a Firestore document type — this is authored/held as
 * local state while the user builds the plan (mirrors ComposedHybridSession,
 * start-hybrid-session.ts:41-84: computed once, run once, not persisted as
 * its own collection). See `CompiledLegPlanSession` below for the one case
 * (live_join) where a lightweight Firestore doc is actually needed.
 */
export interface RouteLegPlan {
  /** Single shared profile for the whole plan (recommendation #2). */
  activity: 'running' | 'walking' | 'cycling';
  /** Ordered — execution order is array order, no separate `order` field needed. */
  legs: RouteLeg[];
  /** Where the whole plan starts. Typically the user's current GPS at build time. */
  origin: { lat: number; lng: number };
}

/**
 * What a RouteLegPlan compiles into at "start run" time: one Mapbox
 * multi-waypoint Directions call (getSmartPath-style), matching the doc's
 * own Mapbox-budget recommendation ("קריאה אחת מרובת-waypoints" over
 * per-leg calls). `legBreakdown` recovers the free per-leg distance/duration
 * data Mapbox already returns but the wrapper currently discards
 * (mapbox.service.ts:128-130,197-199) — no extra API cost, just stop
 * throwing it away.
 */
export interface CompiledLegPlanRoute {
  /** Same shape the rest of the map/player pipeline already consumes. */
  route: Route; // from route.types.ts — path, distance, duration, etc.
  /** Per-leg distance/duration, index-aligned with RouteLegPlan.legs. */
  legBreakdown: Array<{ legId: string; distanceKm: number; durationMin: number }>;
}

/**
 * Session-scoped Firestore doc — ONLY written when live_join (ה') is
 * actually invoked on this run (recommendation #3). Modeled directly on
 * GroupInvitationDoc's ephemeral/TTL pattern (group-invitation.service.ts:23-37):
 * top-level collection, short TTL, not part of the user's permanent profile,
 * not a reusable/saved template. A leg plan that never triggers live_join
 * never creates one of these.
 */
export interface CompiledLegPlanSession {
  token: string;              // same generateToken() pattern as group-invitation.service.ts:55-62
  hostUid: string;
  compiledRoute: CompiledLegPlanRoute;
  /** Which leg the host is currently on — updated as they progress. Consumed by
   *  a joiner's UI, NOT by any re-routing logic (live re-routing deferred, rec. #4). */
  activeLegIndex: number;
  createdAt: Timestamp;
  expiresAt: Timestamp;        // mirror EXPIRY_MS pattern, group-invitation.service.ts:51
}

// Deliberately ABSENT from this sketch (by recommendation):
// - any per-leg `activity` override                      → rec. #2 (v1: plan-level only)
// - any `deviation` / `reroute` state on the plan itself  → rec. #4 (deferred, extends
//   useRouteDeviationOrchestrator later, not modeled here)
// - a `savedAsTemplate` / reusable-plan flag              → rec. #3's one open question,
//   needs David's explicit product call before it's added
```
