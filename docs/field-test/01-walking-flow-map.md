# שלב 1 — מיפוי מסלול הליכה מקצה לקצה (READ-ONLY)

**מאומת מול:** `origin/main` @ `dc6532ed` (19.09.2026) — worktree `sderot-walking-field-test`, checkout נקי, מאומת `git merge-base --is-ancestor origin/main HEAD`.
**שיטה:** קריאת קוד בלבד + `git log`/`git show` לאימות שתיקונים מתועדים אכן נחתו על ה-HEAD הנוכחי. שום דבר כאן לא **הורץ** — זה שלב 2. כל שורה מצוטטת עם `file:line`.

**עדכון 19.09.2026 (בין שלב 3 לשלב 4):** נספח ב' בתחתית הדוח הזה עונה על שאלה שנשארה פתוחה משלב 1 — האם ליווי חי לאורך המסלול + נקודות תרגיל כבר קיים. ראו שם, כולל אימות מול הדגל האמיתי ב-Firestore (לא רק ברירת המחדל בקוד).

---

## תמצית — 3 באגים אמיתיים שנמצאו (לא שערות, מאומתים בקריאת קוד מדויקת)

1. **סיום הליכה מסומן "ריצה" בלוח השנה הביתי.** `useRunningPlayer.ts:1848,1852` שולח `workoutType: 'running'` + `displayIcon: 'run-fast'` ל-`syncWorkoutCompletion` **ללא תנאי**, גם כש-`activityType === 'walking'` — למרות ש-`activityType` זמין באותו scope ומשמש נכון שורתיים מעל (שורה 1824, ל-XP). זה כותב ל-`dailyProgress/{uid}_{date}` (`useProgressionStore.ts:846-899`), שמניע את הצ'ק-מארק/אייקון בלוח הבית. `CompletionWorkoutType` תומך רשמית ב-`'walking'` (`completion-sync.service.ts:19`) — זו כנראה השמטה, לא כוונה.
2. **מסך הסיכום לא יודע שזו הייתה הליכה.** `FreeRunSummary.tsx:56` שולף `sessionActivityType` אבל **אף פעם לא מסתעף עליו**; טקסט השיתוף בשורה 179 קבוע: "🏃 סיימתי אימון ריצה חופשית!" / `#ריצה` — גם למשתמש שהלך. אין מסך סיכום ייעודי להליכה בכלל.
3. **מסלול נטען בלי נרמול גיאומטריה בנתיב שני.** `FreeRunLayer.tsx:102-133` (סשן מודרך/קבוצתי) קורא `official_routes/{id}` ישירות ומטיל את `path` ל-`[number,number][]` **בלי** לעבור דרך `normalizeStoredRoutePath` (`routePath.ts:20-41`) — בעוד שהאחסון האמיתי ב-Firestore הוא אובייקטי `{lng,lat}` (`routePath.ts:4-9`). `buildLaneOffsetPath` (`geoUtils.ts:378-393`) מפרק `point[1]`/`point[0]` — על הצורה הלא-נכונה זה `undefined`/`NaN`. **לא הורץ, ממצא חדש שלא תועד בשום audit קודם.**

מעבר לזה: המנוע עצמו — GPS, סינון רעש, מרחק, deviation — **בנוי היטב ומטפל בהליכה כאזרח מן המניין**, לא כ-hack. הפערים האמיתיים הם בקצוות (סיווג לאחור, תצוגה), לא בליבה.

---

## 1. טעינת מסלול במפה

**נרטיב:** מסלול חי כמסמך רגיל באחת משתי קולקציות Firestore — `official_routes` או `curated_routes` (אותו schema, `route.types.ts:354`). בטעינת המפה, `useRouteGeneration.ts:87` שולף ישירות מ-`official_routes` דרך client SDK (`InventoryService.fetchOfficialRoutes`, `inventory.service.ts:758`) — מוגבל ל-200 מסמכים, **בלי סינון לפי עיר**, מסונן צד-לקוח לפי `isRouteNearby`. זה ממוזג עם מסלולים שנוצרים "תוך כדי" (Mapbox) ב-`useRouteFilter.ts` ויוצא כ-`routesToDisplay` (`useRouteGeneration.ts:104-138`) → `DiscoverLayer.tsx:1215` → `AppMap.tsx`, שם כל מסלול הופך ל-GeoJSON `LineString` (`AppMap.tsx:1221-1242`) ומוצג דרך `<Source id="routes">` + 4 `<Layer>` (`AppMap.tsx:1640-1644`, react-map-gl/Mapbox GL JS).

**חשוב:** "הקטלוג המשותף עם ה-edge cache" (`/api/catalog/parks`) הוא **פארקים בלבד** — אין קאש מקביל למסלולים. מסלולים תמיד קריאת Firestore חיה (עם קאש מודול-פנימי פשוט לסשן, `inventory.service.ts:166-172`, לא edge/CDN).

| רכיב | קיים/חלקי/לא קיים | file:line | הערה |
|---|---|---|---|
| אחסון מסלול (מקור אמת) | קיים | `official_routes`/`curated_routes` Firestore | אותו schema; כתיבה ל-`curated_routes` תמיד כותבת גם ל-`official_routes` (`inventory.service.ts:991-1033`) |
| שליפה למסך מפה | קיים | `useRouteGeneration.ts:87` → `inventory.service.ts:758-801` | `getDocs` ישיר, `limit(200)`, בלי סינון עיר |
| "קטלוג משותף + edge cache" | קיים — **פארקים בלבד** | `src/app/api/catalog/parks/route.ts` | אין מקבילה למסלולים |
| נרמול גיאומטריה (קריאה) | קיים | `routePath.ts:20-41` (`normalizeStoredRoutePath`) | מטפל ב-3 צורות אחסון; **לא כל נתיב קריאה עובר דרכו** — ראו ממצא #3 למעלה |
| רינדור Mapbox | קיים | `AppMap.tsx:1221-1242`, `:1640-1644` | — |
| טיפול בגיאומטריה חסרה/פגומה (הנתיב הראשי) | מטופל בהשמטה שקטה | `AppMap.tsx:1223` — `.filter(r => r.path && r.path.length > 1)` | מאומת קריאה בלבד, לא הורץ |
| נתיב קריאה שני (סשן מודרך/קבוצתי) | **חלקי — עוקף נרמול** | `FreeRunLayer.tsx:102-133` | ממצא #3 למעלה |
| הפרדת הליכה/ריצה בשכבת הנתונים | מינימלית | `ACTIVITY_CONFIGS` (`route.types.ts:675-700`) | שתיהן `mapboxProfile:'walking'` בייצור מסלול; נבדלות רק בפרמטרי-כיוונון (turnPenalty, preferredSurfaces וכו'), לא באחסון/רינדור. ב-`AppMap.tsx:279-284` activityType משפיע רק על סגנון פין פארק (zoom≥14), לא על קו המסלול |

**סכימת מסלול (`route.types.ts:354-642`):** שדות חובה — `id,name,distance,duration,score,type,difficulty,rating,calories,features,segments,path`. גיאומטריה: הטיפוס אומר `[lng,lat]` tuples, אבל האחסון האמיתי ב-Firestore הוא אובייקטי `{lng,lat}` — מיושר רק בזמן קריאה. שדות רלוונטיים להליכה: `activityTypes[]`, `surfaceType`, `elevationGain/maxGrade`, `featureTags` (כולל `water_fountain`, `has_toilets`, `shaded`, `wheelchair_accessible` — `:265-300`), `qualitySignals`, `facilityStops`.

**פערים ישנים שנבדקו מול ה-HEAD הנוכחי — כולם סגורים בפועל (לא רק בתיעוד):**
- יחידת מרחק (km) — פתור, מאומת (`2cbe625c`/`c7904121`/`d2a7e9a5` הם אבות-קדמונים של HEAD).
- אי-התאמת ערך difficulty (`'moderate'` מול `'medium'`) — פתור, מאומת ב-`scripts/geo-discovery-routes.ts:1685-1689`.

**לא נמצא:** שום מסמך audit קיים שמתייחס ל"עדכניות קאש למסלולים" — כי, כאמור, קאש כזה לא קיים בכלל למסלולים.

---

## 2. הפרדת הליכה מריצה — היכן היא קיימת ואיפה היא נעלמת

**קיים ואמיתי, לא stub:** `useRunningPlayer.activityType: 'running'|'walking'` (`useRunningPlayer.ts:148`) נקבע מ-UI חי לגמרי — `FreeRunDrawer.tsx:1136` (chip תלת-מצבי אמיתי: ריצה/הליכה/אופניים, `ACTIVITY_CHIPS` בשורה 135, `CarouselActivity` בשורה 49) וגם `DiscoverLayer.tsx:993,1528,1732`. **זה סותר במפורש** את הדוגמה בכלל §2 של Verification-First Rules ב-CLAUDE.md ("`activityType` תמיד `'running'`, ה-setter מוגדר אבל אף אחד לא קורא לו") — הכלל **מיושן**, כדאי לתקן אותו בנפרד (לא כאן, לא עכשיו).

הליכה מקבלת כוונון GPS משלה: `DISTANCE_THRESHOLD_WALKING` מול `DISTANCE_THRESHOLD_RUNNING` (`useRunningPlayer.ts:1047-1049`), ומשתפת את מנגנון דחיית-קפיצות/reanchor המשוכלל (ראו סעיף 3).

**החלטת מוצר מכוונת (לא באג):** הליכה מקבלת **אותו קצב XP** כמו ריצה — מתועד במפורש: `xp.service.ts:270,282` ("Walking earns the same rate... deliberate choice to reward all movement").

**היכן ההבחנה נשברת בפועל — 2 באגים מאומתים:**

| נקודה | קיים/חלקי/שבור | file:line | הערה |
|---|---|---|---|
| `workouts/{id}` — היסטוריה | תקין | `useRunningPlayer.ts:1668` | `workoutType`/`activityType` מוגדר נכון ל-`'walking'` |
| `dailyProgress` — לוח שנה ביתי | **שבור** | `useRunningPlayer.ts:1848,1852` | קבוע `'running'`/`'run-fast'` — ממצא #1 למעלה |
| מסך סיכום + טקסט שיתוף | **שבור** | `FreeRunSummary.tsx:56,179` | ממצא #2 למעלה |
| XP — נתיב כתיבה | תקין ומאומת | `useRunningPlayer.ts:1824` | `activityType` מועבר נכון ל-`awardRunningXP` |
| לוח מובילים שכונתי | חלקי (לא אומת עד הסוף) | `format-leaderboard-score.ts:14` | `LeaderboardMode = 'general'|'running'|'strength'|'steps'|'distance'` — **אין ערך `'walking'`**. פוסט הפיד מקבל `activityCategory:'cardio'` (אותה סל כמו ריצה, `feed.service.ts:70-74`), אבל בדקתי רק את טקסונומיית הטיפוסים — **לא עקבתי אחרי שאילתת האגרגציה בפועל בבקאנד**, אז אי אפשר לקבוע בוודאות אם הליכה בכלל מופיעה תחת לשונית "ריצה" או נעלמת מהלוח כליל |

**ממצא משני, לא מאומת עד הסוף:** `route-ranking.service.ts:60` — `if (routeActivityType === 'running') coinMultiplier = 20` — רומז שלמסלולי הליכה יש מכפיל-מטבעות שונה (ולא ידוע) בדירוג המסלולים. זה על **בחירת מסלול**, לא על XP סיום אימון — לא נבדק לעומק, מצוין ליתר ביטחון.

---

## 3. ניווט ומעקב (GPS)

**נרטיב:** בזמן סשן פעיל, רכישת GPS מתבצעת ב-`useGPS.ts` (`Geolocation.watchPosition` native / `navigator.geolocation.watchPosition` web), עם throttle של ~500ms/3מ' (`useGPS.ts:203-204`) לפני שדגימה בכלל מגיעה ל-store. `useRunningPlayer.ts` מריץ כל דגימה דרך pipeline סינון לא-טריוויאלי — דחיית-דיוק-גרוע, דחיית-קפיצה (>80מ'), דחיית-מהירות-בלתי-אפשרית (>12מ'/ש'), דחיית-דריפט-נייח, ו-"reanchor" למקרה של תנועה אמיתית אחרי רצף דחיות — לפני חישוב מרחק (Haversine), עדכון ממוצע-קצב מוחלק, וטיקר זמן 1Hz. Wake-lock מבוקש מפורשות בתחילת ריצה/הליכה ומשוחרר בסיום.

| יכולת | קיים/חלקי/לא קיים | file:line | הערה |
|---|---|---|---|
| מקור GPS | קיים | `useGPS.ts:399` (native), `:463` (web) | watch רציף, לא polling |
| Wake lock | קיים | `useRunningPlayer.ts:711-749` / `:752-771` | native: `@capacitor-community/keep-awake`; web: `navigator.wakeLock` |
| חישוב מרחק | קיים | `location.service.ts:112-126` (Haversine) | פונקציה טהורה |
| סינון רעש GPS | קיים, לא טריוויאלי | `useRunningPlayer.ts:1054` (jump), `:1094` (speed), `:1126` (drift), `:969-999` (hysteresis), `:1030-1069` (reanchor cluster) | לא נקודות גולמיות כמו שהן |
| סף מרחק ייעודי להליכה | קיים | `useRunningPlayer.ts:1047-1049` | `DISTANCE_THRESHOLD_WALKING` שונה מ-`_RUNNING` |
| מעקב זמן | קיים | `useRunningPlayer.ts:807-846` | טיקר יחיד 1Hz |
| חישוב קצב | קיים | `useRunningPlayer.ts:1279-1344` | ממוצע נגלל משוקלל 5 נק' |
| התקדמות לאורך מסלול (snap) | קיים | `geoUtils.ts:149-177` (`crossTrackDistanceMeters`) | הטלה על הקטע הקרוב, לא רק על vertex |
| זיהוי סטייה מהמסלול | קיים | `useRunningPlayer.ts:461-511` | סף 40מ', 3 דגימות רצופות → re-route אוטומטי + קריינות עברית (`useRouteDeviationOrchestrator.ts`) |

**הערות אמינות:**
- קיימים **3 מימושי Haversine** נפרדים (`location.service.ts:112`, `useGPS.ts:70`, `geoUtils.ts:3/18`) — פונקציונלית זהים, סיכון נמוך, אך מלכודת דיבוג אם אי-פעם יופיע פער בתצוגת מרחק.
- ה-"שירות" `location.service.ts` (עם ה-wrapper המתועד ל-watchPosition + סף דיוק 50מ') הוא בפועל **קוד מת בנתיב החי** — רק ה-`calculateDistance` שלו נצרך בפועל; המנוע האמיתי חי inline ב-`useRunningPlayer.ts`. תיעוד הכותרת בקובץ מציג את עצמו כ"תעשייתי" — זה מיושן/שאפתני, לא מה שרץ.
- לוגים `[A2-SPIKE]` צפופים עדיין חיים ב-`useRunningPlayer.ts` (למשל שורות 791-796, 817-829, 1216-1224) — קוסמטי בלבד. **לא לגעת** — כלל קבוע: אסור למחוק/לנקות `console.log` קיימים.

---

## 4. עצירות לאורך הדרך (POI / נקודות עניין)

מודל הנתונים **תומך** בזה: `FacilityStop` (`route.types.ts:652-662`) + תגי amenity (`water_fountain`, `shaded` וכו', `:265-278`, קישור ל-`osm_amenities` ב-`:474-480`). יש גם טיפוס legacy מת — `PlannedRoute.stops` (`:237-241`), מיובא אך אף פעם לא נצרך (`useRouteFilter.ts:4`).

**אבל:** זה מוצג **רק במסך התצוגה-המקדימה** של המסלול לפני התחלה (`RouteDetailSheet.tsx:911-925` — רשימה סטטית עם מרחק-מההתחלה, לא "עוד 200 מ'"). בדיקה יזומה של מסכי הניווט החי (FreeRunActive, RouteStoryBar, TurnCarousel) — **אין שום אזכור** ל-`facilityStops`/amenity שם. יש `TurnCarousel.tsx` לפניות (turn-by-turn), אבל בלי תוכן POI/עצירות.

**מסקנה קריטית לדמו בשדרות:** אם התסריט מניח שהאפליקציה תכריז "עוד 200 מטר ברזייה" **תוך כדי הליכה — זה לא בנוי**. אין live proximity alerting בכלל. יש לתאם ציפיות מראש, לא להניח שזה קיים.

---

## 5. סיום מסלול — שמירה, XP, היסטוריה

**נרטיב:** לחיצה על "סיום" (מ-`FreeRunDrawer`, מסלול מודרך/curated, או commute — כולם מתכנסים לאותו עץ `<FreeRun/>`/`FreeRunActive`) קוראת ל-`useRunningPlayer.finishWorkout()` (`useRunningPlayer.ts:1480`, מוגן ב-idempotency guard `_finishInFlight`, `:1485-1493`). זה בונה `workoutPayload` **בצד לקוח** (מרחק/משך/קלוריות/קצב/XP, `:1665-1707`), כותב מסמך `workouts/{id}` ישירות (`storage.service.ts:339`), ואז מפעיל את ה-Guardian Callable (`awardWorkoutXP`) לעדכון `progression.*` בפועל בצד שרת.

| שלב | קיים/חלקי/סוטה | file:line | הערה |
|---|---|---|---|
| Handler סיום | קיים | `useRunningPlayer.ts:1480` | נקרא מ-4 מקומות UI + מסלולים מודרכים (`GuidedRouteView.tsx:21-25`) |
| כתיבת מסמך workout | קיים | `useRunningPlayer.ts:1665-1707` → `storage.service.ts:339` | כתיבת client ישירה; `firestore.rules:727-731` לא חוסם שדות — `xpEarned` כאן הוא **תצוגה בלבד**, לא מקור אמת |
| חישוב סכום XP | client-side | `xp.service.ts:285-294` | הליכה = אותו נוסחה כמו ריצה (החלטת מוצר מכוונת) |
| כתיבת XP לצד שרת | server-owned, מאומת | `awardWorkoutXP.ts:43` → `functions/src/awardWorkoutXP.ts:56-98` → `progression.service.ts:100,128,136,44` | `firestore.rules:254-261` (`noGameIntegrityFieldsChanged`) חוסם כתיבת client ישירה — **מאומת בפועל**, לא רק בהצהרה |
| **אזהרה (לא ספציפית להליכה):** | — | `progression.service.ts:44` | ה-Guardian **לא מחשב מחדש** XP מהמרחק/משך הגולמיים — סומך על `xpDelta` מהלקוח, רק תוחם ל-`MAX_XP_PER_CALL=2000`. תקף גם לריצה, לא פער ייחודי להליכה |
| Streak (`dailyActivity`) | תקין | `completion-sync.service.ts:87-96` → `useActivityStore.ts:497-576` | `activityCategory:'cardio'` תמיד — נכון, הליכה היא cardio |
| **צ'ק-מארק יומי (`dailyProgress`)** | **שבור** | `useRunningPlayer.ts:1847-1848` | ממצא #1 — ראו למעלה |
| היסטוריית אימונים | תקין | `workouts/{id}` | מסווג נכון `'walking'`, בניגוד ל-`dailyProgress` |
| פיד חברתי | קיים אך כבוי | `useRunningPlayer.ts:1770`, דגל `IS_COMMUNITY_FEED_ENABLED=false` (`feature-flags.ts:17`) | פוסט לא נכתב כלל, לריצה ולהליכה כאחד — לא בעיה ספציפית להליכה |
| מסך סיכום ייעודי להליכה | **לא קיים** | `FreeRunSummary.tsx` | ראו ממצא #2 |
| באג רפאים ישן (double-XP) | **תוקן, מאומת ב-HEAD** | `SummaryLayer.tsx:82-100`, commit `ead59320` | מאומת `git merge-base --is-ancestor ead59320 HEAD` = true. הנתיב הזה (`mode==='active'`) משותף גם למסלולי הליכה מודרכים/curated — **אינו סיכון פעיל לטסט השדה** |

---

## 6. מצבי קצה בקוד

| # | מצב קצה | סטטוס | file:line | מה הקוד עושה בפועל |
|---|---|---|---|---|
| 1 | אפליקציה ברקע | מטופל | `useGPS.ts:128-139`, `appForeground.ts:105-115` | חריגה מפורשת: GPS ממשיך כשסשן `active`/`paused`, גם ברקע |
| 2 | מסך נעול | מטופל, אותו אירוע כמו #1 | `appForeground.ts:16-24` | אין אירוע נפרד לנעילה — אותו `isActive:false` כמו רקע |
| 3 | שיחה נכנסת | חלקי (מוסק, לא ספציפי) | `appForeground.ts:16-24`; `useWorkoutPersistence.ts:154-156` | אין קוד ספציפי לשיחה (נבדק — 0 hits ל-CallKit/audio-interruption); זורם דרך אותו מנגנון כמו #1/#2 |
| 4 | אובדן קליטת GPS | חלקי | `useGPS.ts:478-486`, `useRunningPlayer.ts:932-943` | timeout 20 שנ' בווב עם fallback, אבל אזהרת console מודחקת בכוונה לשגיאה הזו; `locationError` **בלי צרכן אחד** בשום מסך; `gpsStatus` קופא על הערך האחרון אם דגימות מפסיקות לגמרי — **אין watchdog** ל"N שניות בלי עדכון" |
| 5 | סוללה חלשה | **לא מטופל** | לא נמצא (0 hits ל-`getBatteryInfo`/`batteryLevel`) | שום לוגיקה מודעת-סוללה בשום מקום |
| 6 | סטייה מהמסלול | מטופל | `useRunningPlayer.ts:79,84,461-512`, `useRouteDeviationOrchestrator.ts:1-37` | סף 40מ', 3 דגימות → re-route אמיתי + קריינות |
| 7 | עצירה באמצע (pause) | חלקי | `useSessionStore.ts:91-108` (ידני); toggle `enableAutoPause` קיים ב-UI אך **לא מחובר לשום לוגיקה** | טיימר הזמן ממשיך לרוץ גם למשתמש נייח שלא לחץ pause |
| 8 | יציאה כפויה / קריסה | **לא מטופל להליכה/ריצה** | לא נמצא persistence ב-`useSessionStore`/`useRunningPlayer` | קיים מנגנון מקביל (`useWorkoutPersistence.ts` + `ResumeWorkoutDialog.tsx`) אבל **רק לשחקן הכוח** — אומת שאין קריאה אליו מ-running |

**השפעה נראית-לעין (השערה מפורשת — ניתן לאמת רק בשטח):**
- #4: הסמן על המפה כנראה "יקפא" בלי אזהרה; פס ה-GPS-status עלול להראות תקין למרות שאין עדכונים.
- #5: אין התראה בתוך האפליקציה; רק ה-OS מציג אזהרת סוללה עצמאית.
- #7: מי שעוצר לדבר יראה זמן ממשיך לעלות — ואם המציג מזכיר "auto pause" מההגדרות, זה לא באמת עושה כלום.
- #8: אם האפליקציה נסגרת/קורסת באמצע הליכה — כל הנתונים של הסשן הזה אבודים, בלי חזרה.

---

## נספח א׳ — התאמה מול axioms.md

- **§2 (XP server-owned):** מתקיים **חלקית**. נתיב הכתיבה מאומת server-owned (לא רק מוצהר) — אבל ה-Guardian לא מחשב XP מחדש מנתונים גולמיים, רק תוחם תקרה. משותף לריצה והליכה כאחד, לא פער ייחודי.
- **כלל Verification-First §2 ב-CLAUDE.md** (הדוגמה על `useRunningPlayer.activityType` תמיד `'running'`) — **מיושן**, נסתר על ידי קוד חי. מומלץ לעדכן בנפרד (מחוץ לתחום השלב הזה).

## נספח ב׳ — ממצאים חדשים שלא תועדו בשום audit קודם (ליומן הסיכונים בשלב 3, לא לתיקון עכשיו)

1. `FreeRunLayer.tsx:102-133` עוקף `normalizeStoredRoutePath` — סיכון NaN בגיאומטריה למסלולים מודרכים/קבוצתיים.
2. `useRunningPlayer.ts:1848,1852` — `dailyProgress` מסמן הליכה כריצה.
3. `FreeRunSummary.tsx:179` — טקסט שיתוף קבוע "ריצה" גם להליכה.
4. אין מסך סיכום ייעודי להליכה.
5. אין live proximity alerting לעצירות/POI — קיים רק pre-run.
6. אין watchdog לאובדן GPS, אין מודעות-סוללה, אין auto-pause מחובר, אין resume אחרי קריסה — כל הרביעה חסרה ספציפית להליכה/ריצה (בניגוד לשחקן הכוח).
7. אין קטגוריית `'walking'` בלוח המובילים השכונתי — פער בטקסונומיה, השפעה מלאה על האגרגציה בבקאנד לא נבדקה.

כל הסעיפים למעלה מבוססים על קריאת קוד מדויקת עם ציטוט file:line — לא הורצו. אימות בהרצה בשלב 2.

---

## נספח ב׳ — תשובה לשאלה הפתוחה משלב 1: ליווי חי לאורך המסלול + נקודות תרגיל

**שלוש ההשערות שהוצגו בשלב 1: (א) נתיב מודרך קיים, (ב) מאחורי feature flag כבוי, (ג) preview-בלבד. התשובה האמיתית משלבת את שלושתן, בשכבות שונות — לא אחת מהן לבד.**

### מנגנון ה-state-machine עצמו: קיים, אמיתי, לא stub

`hybrid-session-controller.ts` + `useHybridRun.ts` מיישמים state machine אמיתי של "רגל הליכה → תחנה → תרגיל → רגל הבאה → ... → סיום", עם `cursor` שמתקדם על פני מערך `segments` גנרי (לא מוגבל לתחנה בודדת — `isFinalLeg` (`useHybridRun.ts:39-42`) בודק אם יש עוד `kind==='strength'` **כלשהו** קדימה, מה שאומר שהמנגנון תומך במספר תחנות ברצף, לא רק אחת). ה-UI החי (`HybridStationLayer.tsx`, **ממוחזר בפועל** בתוך `FreeRunLayer` — לא dead code, פשוט מוחזר `null` כשאין סשן היברידי פעיל) מציג CTA בודד במהלך רגל ההליכה ("📍 הגעתי לתחנה") ומעביר מסך-מלא ל-`StrengthRunner` בזמן התחנה.

**הממצא הקריטי: המעבר "הגעתי לתחנה" הוא לחצן ידני — לא GPS.** גרפתי את כל הריפו לחיפוש caller אחר של `arrive()` חוץ מ-`HybridStationLayer.tsx:69` — **אין אחד**. שום קוד לא בודק מרחק-GPS-בפועל מהתחנה כדי לפתוח אותה אוטומטית (בניגוד ל-`useWalkToRoute.ts:106-217`, שיש בו סף-מרחק אמיתי של 30מ' לזיהוי "הגעה" לתחילת מסלול — מנגנון אחר, למטרה אחרת). המשתמש לוחץ בעצמו מתי "הגיע" — אין אימות שהוא באמת שם. **גם אין לחצן "דלג על תחנה"** — הרכיב כולו נקרא, שני כפתורים בלבד: "הגעתי לתחנה" (רגל רגילה) ו"סיים אימון משולב" (רגל אחרונה בלבד).

### מה בפועל דלוק ומה כבוי — נבדק מול הדגל האמיתי ב-Firestore, לא ברירת המחדל בקוד

| Mode | דגל קוד | ערך אמיתי ב-`system_config/feature_flags` (נקרא כרגע) | נגיש למשתמש רגיל היום? |
|---|---|---|---|
| `full_park_workout` (תחנה בודדת: הליכה→פארק→אימון כוח מלא→חזרה) | `enable_full_park_workout` | **`true`** | **כן** — גם `MAP_OVERVIEW_CHROME_V1=true` (קוד) מתקיים, נדרש רק `hasGps` |
| `route_stops` (כמה עצירות גנריות לאורך לולאה) | `enable_route_stops` | **`false`** (עדכון אחרון ע"י `updated_by: nX2AM2HJ...`) | **לא** — כבוי בפועל, לא רק ברירת מחדל |

**חשוב:** `superAdminValue: true` קיים בהגדרת הדגל (`src/hooks/feature-flag-defs.ts:47`) — כלומר משתמש-אדמין (את/דוד, אם מחוברים כ-super-admin) **יראה** את כרטיס "מסלול + עצירות" גם כשהוא כבוי לתושב רגיל. זו בדיוק הדוגמה הקונקרטית לדרישה #4 בשלב 4: מה שאני/אתה רואים כשבודקים זה לא בהכרח מה שתושב רגיל רואה.

### מסקנה, בשלוש שכבות (לא עונה אחת נכונה — שלושתן, לשכבות שונות)

1. **(ג) preview-בלבד — נכון ברמת ה-Firestore data model הגנרי** (עצירות/POI כלליות — ברזיות, צל — נבדק בשלב 1 §4: מוצג רק ב-preview שלפני יציאה, לא בניווט חי).
2. **(א) נתיב מודרך קיים ועובד — נכון ברמת ה-hybrid-station מנגנון (`useHybridRun`)** — זה אמיתי, בנוי, וחלק ממנו (`full_park_workout`) **חי היום**. אבל "מודרך" = לחיצת כפתור ידנית, לא זיהוי-מיקום אוטומטי.
3. **(ב) feature flag כבוי — נכון ספציפית ל-`route_stops`** (מספר עצירות גנריות לאורך לולאת הליכה, לא תחנת-פארק בודדת) — זה בדיוק סוג הזרימה שהכי קרוב למה שתואר בשלב 5 (הליכה עם תחנות כוח בדרך). כבוי בפועל ב-Firestore, לא רק בברירת מחדל בקוד.

**מה זה אומר לטסט השדה בשדרות:** אם התכנון הוא "הליכה עם כמה עצירות תרגיל בדרך" (route_stops) — **זה לא נגיש למשתמש רגיל היום**, וגם אם יופעל, ה"ליווי" האמיתי הוא כפתור-לחיצה ידני, לא ניווט אוטומטי לתחנה. אם התכנון הוא תחנה בודדת בפארק (full_park_workout) — זה קיים וחי, עדיין עם אותה מגבלת לחיצה-ידנית.

**לא נבדק (מחוץ לתחום):** האם `full_park_workout` נגיש בפועל *בשדרות ספציפית* (תלוי בפארק מצויד + נתוני משתמש) — לא היה חלק מהשאלה שנשאלה.
