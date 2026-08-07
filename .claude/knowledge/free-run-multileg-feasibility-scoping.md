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
**מורכבות: MEDIUM** (לא "שינוי שורה אחת" כפי שהניח הבריף)

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
