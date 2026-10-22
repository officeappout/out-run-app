# ביקורת מחולל מסלולי אופניים (cycling) — מצב נכון ל-22.10.2026

> קריאה בלבד. נבדק מול `origin/main` @ `ae932fd9` (אחרי `git fetch`). לא נגעתי בקוד אפליקציה, ולא קראתי ל-GraphHopper החי (אין לי גישה/הרשאה — ראו §3 מה לא ניתן לאמת).
> קבצים שבבעלות דוד ושלא נערכו: `AppMap`, `MapShell`, `DiscoverLayer`, `TurnCarousel` — נקראו בלבד.
> כל טענה מסומנת **[אומת בקוד]** או **[לא אומת]**.

## תקציר מנהלים

"מחולל האופניים" אינו מודול אחד שבור. זה **שלושה מסלולים נפרדים** שנראים אותו דבר למשתמש, ובכל אחד פער אחר:

1. **לולאות (בחירת "רכיבה" במסך Free Run)** — עובד על **Mapbox `cycling` profile** כברירת מחדל. הוא מחולל "אמיתי" לאופניים, אבל כל ה-heuristics שלו (ניקוד waypoints, איכות לולאה, ‏`walkway_bias`, מהירות 20 קמ"ש) נבנו להולכי רגל ואין בו אף הכרה בסוג אופניים (כביש/שטח).
2. **GraphHopper** (`enable_graphhopper_routes`, ברירת מחדל **כבוי**) — כן מכיר `cycling` ומנתב על profile `bike`, אבל **לא נבדק מעולם** (אין smoke/בדיקת איכות לאופניים), מדד האיכות מכויל להליכה, ואין שום דרך לבחור `mtb`.
3. **מסלולים רשמיים מהצנרת הארצית** (`official_routes`, `activityType:'cycling'`) — קיימים ומסוננים נכון לפי פעילות, אבל **אין שום סינון/דירוג כביש-מול-שטח באפליקציה**: `surfaceClass` (`bike_road`/`bike_offroad`) מחושב ונשמר ב-`route_scores` ואף קורא באפליקציה לא קורא אותו.

ומעבר ליצירה — **הסשן עצמו**: למשתמש רגיל (`enable_home_v2` כבוי לכולם חוץ מ-super-admin ו-QA) רכיבה **נרשמת כריצה** (HUD, קלוריות, סיכום, XP, אייקון). זה כנראה מה שנראה למשתמש כ"מחולל האופניים לא עובד".

## 1. מה קורה היום כשמשתמש בוחר "אופניים"

### 1.1 נקודות כניסה (UI)

| כניסה | קובץ | הערה |
|---|---|---|
| צ'יפ "רכיבה" ב-FreeRunDrawer | `src/features/parks/core/components/FreeRunDrawer.tsx:186-190` (ACTIVITY_CHIPS), ברירות מחדל `:201` (45 דק׳ / 15 ק"מ / 400 קק"ל) | הכניסה הראשית. `drawerActivity()` ב-`:1460-1461` שולח `'cycling'` ל-`buildRouteGenRequest` |
| בורר פעילות Commute (A→B) | `RouteCarousel.tsx:530-532` + `DiscoverLayer.tsx:2038-2044` | מסלול אל יעד — **Mapbox בלבד** (GH לא מטפל ב-`destination`: `graphhopper-loops/eligible.ts:30`) |
| NavigateLayer (3 וריאנטים) | `src/app/map/layers/NavigateLayer.tsx:17-20, 63` | שלושה כרטיסים walking/running/cycling; `useSearchNavigation.ts:226` מבקש Mapbox `cycling` לאופניים **[אומת]** |
| Hybrid slot carousel | `hybrid/HybridSlotCarousel.tsx:88` | כרטיס רכיבה מסומן `soon: true` ("בקרוב") — לא זמין |
| עריכת מסלול אדמין | `route-geometry-edit.service.ts:76-77` | Mapbox `cycling` למסלולי cycling |

### 1.2 מי מחולל את הלולאה

```
FreeRunDrawer.handleStartWithRoute  (FreeRunDrawer.tsx:1500-1510)
  → onRequestRouteGeneration(buildRouteGenRequest(goal,'cycling',extras))   [route-request.utils.ts]
  → RouteCarousel → generateDynamicRoutes()   (route-generator.service.ts:1507)
        ├─ [אם enable_graphhopper_routes=true && isGraphhopperLoopRequest]
        │     → POST /api/routes/generate {activity:'cycling'}   (graphhopper-loops/api-client.ts, timeout 2s)
        │       → generateLoops → profileForActivity('cycling') = 'bike'   (request-builder.ts:13-15)
        │       כל כשל/timeout/ריק → null → נופלים ל-Mapbox בשקט
        └─ Mapbox v1 pipeline (ברירת המחדל בפועל):
              generateLoopRoutes → profile = 'cycling' (route-generator.service.ts:2718, 2239, 3521)
              MapboxService.getSmartPath(..., 'cycling', waypoints, {continue_straight:'true'})
```

מסלולים רשמיים (`official_routes`) נכנסים במקביל דרך `useRouteFilter.ts:146-148` → `routeMatchesActivity` (strict equality לאופניים, ראו §4).

### 1.3 איפה "נופל ל-running" ולמה

הטענה המקורית ("cycling falls back to 'running' — no pipeline yet") ב-`DiscoverLayer.tsx:2085` **נכונה רק לחלק מהמקרים ושונה ממה שנראה**:

* **היצירה** עצמה *כן* תומכת ב-cycling (Mapbox/GH). ה-"fallback" הוא בעניין **מצב הסשן של הנגן** (`useRunningPlayer.activityType`), לא בעניין יצירת המסלול.
* `DiscoverLayer.tsx:2086-2088` (commute, אחרי בחירת מסלול): `setActivityType(commuteActivity === 'walking' ? 'walking' : 'running')` — **רכיבה ב-commute תמיד נרשמת כריצה**, בלי תלות בדגל. **[אומת]**
* `DiscoverLayer.tsx:2304-2310` (leg-plan מורכב): `setActivityType(... 'walking' : 'running')` ואחריו `handleActivityChange('cycling')` — שני ערכים סותרים באותו handler: ה-store של המפה אומר cycling, הנגן אומר running. **[אומת]**
* `FreeRunDrawer.tsx:1474-1479`: `v2 && selectedActivity==='cycling' ? 'cycling' : 'running'` — **ללא `enable_home_v2` רכיבה = ריצה**. הדגל: `hooks/feature-flag-defs.ts:143` — `defaultValue:false, superAdminValue:true, qaTesterValue:true`. כלומר **משתמש רגיל לעולם לא מקבל מצב ride** (HUD מהירות, GPS gates של אופניים `aerobic-activity.ts:71`, MET אופניים `:104-120`, כותרת "רכיבה" `useFreeRunLive.ts:66`). **[אומת]**
* `completion-sync.service.ts:99-110`: בלי v2, `activityType==='cycling'` נשמר כ-`running` + אייקון ריצה. כלומר גם הרשומה בהיסטוריה/ב-home תהיה "ריצה".
* `useWorkoutSession.ts:229-231`: `startSession(activityType==='walking' ? 'walking' : 'running')` — מצב ה-session store הוא running גם ב-v2. השפעה מעשית: לא נבדקה **[לא אומת]**.
* `useRunningPlayer.ts:2137`: בסיום סשן `if (activityType==='cycling') set({activityType:'running'})` — reset, תקין.
* `useWorkoutSession.ts:225`: מסלול מתוכנן (plan) לא יכול להיות ride — מכוון.

## 2. תקין / שבור / חסר

מקרא: 🟢 עובד · 🔴 שבור (התנהגות שגויה בפועל) · 🟡 חסר (לא נבנה / לא מחווט)

| # | סטטוס | נושא | ראיה |
|---|---|---|---|
| 1 | 🟢 | Mapbox `cycling` profile ללולאות ול-A→B | `route-generator.service.ts:2239, 2718, 3521, 3791`; `useSearchNavigation.ts:226` |
| 2 | 🟢 | מהירות/קלוריות לתכנון: 20 קמ"ש, 25 קק"ל/ק"מ | `route-request.utils.ts:41-42`; `FreeRunDrawer.tsx:1526` |
| 3 | 🟢 | GH server: `activity:'cycling'` נתמך, תקרת 60 ק"מ | `api-contract.ts:94, 119`; `request-builder.ts:14` |
| 4 | 🔴 | **רכיבה נרשמת כריצה למשתמש רגיל** (`enable_home_v2` כבוי) — HUD, קלוריות (מקדם ריצה), היסטוריה, סיכום | `FreeRunDrawer.tsx:1474-1479`; `completion-sync.service.ts:99-110`; flag `feature-flag-defs.ts:143` |
| 5 | 🔴 | commute ו-leg-plan מסתמנים כ-`running` גם ל-cycling, ב-v2 וגם בלעדיו | `DiscoverLayer.tsx:2086-2088, 2304-2310` (ראו §1.3) |
| 6 | 🔴 | **Mapbox `walkway_bias` / quality**: `buildLoopDirectionsParams` מוסיף `walkway_bias` רק ל-walking — לאופניים אין שום העדפה (שבילי אופניים/רחובות שקטים) מעבר ל-profile | `route-quality-v1/mapbox-params.ts:41` |
| 7 | 🔴 | ניקוד waypoints (`scoreWaypoint`) ללא פרמטר `activity` — מבוסס `street_segments` שנבנו להולכי רגל (שיפוע/משטח/פארקים/חדרי כושר), ללא תשתית אופניים | `route-generator.service.ts:1146` (חתימה; אין activity) |
| 8 | 🔴 | **איכות לולאה מכוילת להליכה**: `evaluateLoopQuality` (retrace/uturn/compactness/צמתים לא מסומנים) + `0.5*majorRoadPct` + `turnScorePenalty` — מענישים כבישים ראשיים ופניות, שלגבי אופניים הם לעיתים עדיפים; צמתים לא מסומנים (`avoidUnmarkedCrossings`) הם מושג להולכי רגל | `lib/route-quality/acceptance.ts:23-37`; `loops/scoring.ts:34-86`; `custom-model.ts:36` |
| 9 | 🔴 | **loops-prefer-official מושך אופניים אל מסלולי הליכה**: `ourRoutes` נטענים ללא סינון activity ומוענק `×0.7` לכל מה שמחוץ להם — גם ב-profile `bike`. אופניסט יקבל לולאה שנדבקת למסלולי הליכה (שיכולים להיות שבילי חולות/מדרגות) | `our-routes/index.ts:16`; `custom-model.ts:50-51`; `loops-prefer-official/*` (אין התייחסות ל-activity — grep ריק) [דגל כבוי כברירת מחדל] |
| 10 | 🟡 | **GH `mtb` לא ניתן לבחירה**: `profileForActivity(...,{mtb:true})` קיים ונבדק ביחידה, אבל אף קורא לא מעביר `mtb` — אין UI/סוג אופניים | `request-builder.ts:13-15` (קורא יחיד: `loop-service.ts:77`, `friendly-route.ts:16` — שניהם בלי mtb) |
| 11 | 🟡 | **אין בחירת סוג אופניים (כביש / שטח / עירוני)** בשום מקום ב-UI או ב-Route type; `racingbike` לא מוגדר ב-GH | `FreeRunDrawer.tsx` extras (`route-request.utils.ts:DrawerExtras`) — רק `trail` boolean שהופך ל-`surface:'trail'` |
| 12 | 🟡 | `out_bike` מוגדר בשרת (עם `STEPS ×0.05`) אבל האפליקציה משתמשת ב-`bike` + `QUIET_BIKE` שבצד הלקוח — ללא ה-clause של מדרגות | `config.yml:out_bike`; `models/out_bike.json`; `custom-model.ts:18-22, 44` |
| 13 | 🟡 | **אין בדיקת שפיות/smoke לאופניים**: `smoke.sh` בודק foot/out_run/foot_turns בלבד; מדדי route-quality (`/admin/routes/quality`) רצים על running | `infra/graphhopper/scripts/smoke.sh`; `app/admin/routes/quality/page.tsx:40` |
| 14 | 🟡 | `to-route.ts` של GH: `terrain:'road'`, `surface:'asphalt'`, `difficulty` מ-NPS להליכה (`computeDifficulty`), ו-`duration` מזמן GH — ללא התאמת אופניים (למשל שיפוע שמשמעותו שונה על אופניים; `levelDiff*0.7` ב-`route-ranking.service.ts:86` הוא ההתחשבות היחידה) | `graphhopper-loops/to-route.ts:24-26, 52-60` |
| 15 | 🔴 | **סתירות מהירות אופניים**: 20 קמ"ש (`SPEED_KMH`), 15 קמ"ש (250 מ'/דק׳ ב-`inventory.service.ts:744, 1804`, `trail-graph/firestore-docs.ts:79`), 20 קמ"ש (3 דק׳/ק"מ `route-overview.ts:30`). וגם: **docs של known-routes מסוג bike מחושבים בקצב ריצה** (160 מ'/דק׳ → משך כפול) וקלוריות 65 ל-ק"מ | `known-routes.ts:171, 189-190` (`PACE_RUN_M_PER_MIN` ו-`km*65` לכל kind) |
| 16 | 🟡 | ניווט (TurnCarousel/NavBannerV2): הפניות נגזרות מגיאומטריה (`RouteTurn` ב-`geoUtils`) ללא תלות ב-activity; GH שולח `instructions:false`. לא מצאתי קוד שמתאים סף פניות/lookahead למהירות אופניים | `TurnCarousel.tsx:1-40, 296`; `request-builder.ts:25` — [לא אומת בשטח] |
| 17 | 🟡 | XP לרכיבה: אותה נוסחת ריצה (3 XP/דק׳ + 10 XP/ק"מ) — רוכב ב-20 קמ"ש מקבל ~35% יותר XP לשעה מרץ ב-10 קמ"ש. מכוון ("for now") אבל לא מאושר מול `XP_Progression_Truth.md` (לא נבדק) | `xp.service.ts:262-290` |
| 18 | 🟢 | Hybrid ride: `HybridSlotCarousel` "בקרוב"; `aerobicKind:'cycling'` קיים רק תחת v2 | `FreeRunDrawer.tsx:1538`; `HybridSlotCarousel.tsx:88` |

## 3. האם פרופילי bike/mtb ב-GraphHopper פרוסים בפועל?

**מה שנראה בקוד [אומת]:**

* `infra/graphhopper/config.yml` מגדיר את הפרופילים `bike`, `out_bike`, `mtb` (ו-`foot`, `out_run`, `foot_turns`) — מאז הקומיט הראשון `71402b93` (19.10.2026), כלומר לפני הבנייה השבועית הראשונה.
* `graph.encoded_values` כולל `bike_priority, bike_access, bike_average_speed, bike_road_access, mtb_priority, mtb_access, mtb_average_speed, mtb_rating, roundabout` — כל הנדרש לשלושת הפרופילים.
* `Dockerfile` מייבא את הגרף בזמן build (`import config.yml`) ואופן ה-`weekly.sh`/`cloudbuild.yaml` בונה מחדש מ-`main`. כיוון שהגרף בנוי מ-config יחיד, **אם התמונה שפרוסה נבנתה מ-19.10 ואילך — שלושת הפרופילים בגרף** (ב-flexible mode כל פרופיל הוא רק custom-model על אותו גרף; אין בנייה נפרדת לפרופיל).
* `custom_model_files: [bike.json, bike_elevation.json]` / `[mtb.json, ...]` מתייחסים ל-**מודלים מובנים של GH 11.1** (לא נמצאים ב-`models/` — רק `out_bike/out_run/out_turns`). אותו מנגנון עובד עבור `foot.json` שכן פרוס ומשרת ייצור, ולכן סביר שגם `bike.json`/`mtb.json` נטענים — **[לא אומת: לא הורדתי את ה-jar לבדוק את הקבצים בתוכו]**.
* `profileForActivity('cycling')` → `'bike'` מכוסה ביחידה (`request-builder.test.ts:60-66`).

**מה לא ניתן לאמת (ונדרש מדוד/סשן עם gcloud):**

1. שהתמונה החיה אכן כוללת את הפרופילים (תאריך הבנייה: `/data/graph-cache/out-build-date.txt`; `gcloud run services describe graphhopper`).
2. ש-`bike` עונה בפועל. הבדיקה הקצרה:
   ```bash
   # מ-infra/graphhopper/scripts (דורש gcloud + run.invoker)
   curl -fsS -H "$H" -H 'Content-Type: application/json' "$URL/route" -d '{"profile":"bike","points":[[34.774,32.0779]],"algorithm":"round_trip","round_trip.distance":15000,"round_trip.seed":1,"points_encoded":false,"elevation":true}'
   ```
   וכן `profile:"mtb"` ו-`out_bike`. פרופיל לא קיים → HTTP 400 (ואז האפליקציה נופלת בשקט ל-Mapbox — `graphhopper-loops/index.ts` catch).
3. האם `enable_graphhopper_routes` דלוק בפרודקשן (מסמך `system_config/feature_flags`) — ברירת מחדל `false`.
4. התנהגות סיבוב (round_trip) של 15–60 ק"מ על `bike`: ‏`LOOP_DEADLINE_MS=1400` בשרת ו-`GH_CLIENT_TIMEOUT_MS=2000` בלקוח, ו-`routing.max_visited_nodes:1500000` — עבור מרחקי אופניים ארוכים ייתכן שהכל יגמר ב-timeout ויחזור ל-Mapbox. **[לא נבדק]**.

## 4. מסלולי אופניים מהצנרת הארצית — האם יגיעו לרוכבים?

### 4.1 מה נוצר

* `trail-graph/firestore-docs.ts:109` — קשרי OSM `route=mtb|bicycle`: `type/activityType:'cycling'`, `activityTypes:['cycling']`, `features.surface:'trail'|'road'`, `surfaceType` דומיננטי, `difficulty` מ-NPS (נוסחת הליכה/Shenandoah + bump אם `mtb:scale≥2`).
* `dataset-import/to-route-doc.ts:62-84` (ofneidan, bicycle_jer_2019, `bph_infra_exist`): `cycling`, `difficulty:'easy'`, `surface:'road'`, `infrastructureMode:'cycling'`.
* `known-routes.ts:181-195` kind=`bike` → `cycling`; kind=`mixed` → `activityType:'walking'` עם `activityTypes:['walking','running','cycling']`.
* `bike-adjacent.ts` (שלב `bike_adjacent_walk`) יוצר **הליכה/ריצה** לאורך שבילי אופניים בלבד (`activityTypes:['walking','running']`) — אינו מייצר מסלולי אופניים.
* הניקוד: `route-score` מסווג `surfaceClass` (`surface-class.ts:84`): cycling → `bike_road`/`bike_offroad`. נתוני `NATIONWIDE-RUN-2026-10.md:25-26`: נבחרו ארצית `bike_road 25`, `bike_offroad 138` (RC9). המספר ~116 שציינת (מועצות אזוריות) לא עלה מהמסמך כפי שהוא — לא בדקתי מול Firestore.

### 4.2 האם הם יופיעו בבחירת "רכיבה"?

| שלב | תוצאה | ראיה |
|---|---|---|
| פרסום | כל המסמכים נוצרים `status:'pending'`, `published:false` — **לא נראים עד אישור/פרסום** ב-Approval Center | `known-routes.ts:204-205`; `firestore-docs.ts` (pending) |
| קריאה | `getCachedOfficialRoutes` → `fetchOfficialRoutes` מסנן `published===false` בצד הלקוח | `inventory.service.ts:818-820` |
| התאמת פעילות | `routeMatchesActivity(route,'cycling')` = `primaryRouteActivity(route)==='cycling'` (שוויון קפדני על `activityType||type`) | `route-activity-match.ts:49-59` |
| → מסלולי bike/ofneidan/OSM-bicycle | עוברים (primary = `cycling`) | |
| → known-routes `mixed` | **נחסמים** — primary הוא `walking`, ו-`activityTypes` לא נבדק לאופניים. 🔴 | `route-activity-match.ts:49-59` + `known-routes.ts:181, 195` |
| קרבה | `useRouteFilter.ts:177-195`: `distFromUser<0.4*target \|\| <4km` וגם נסיעה כוללת ≤1.1×target; ‏target מחושב ב-20 קמ"ש (`:139`) — עובד, אבל `matchScore -= dist*3` הוא קנה מידה להולכי רגל | |
| `handleShuffle` | בוחר מסלולים רשמיים לפי **פעילות + קרבה למרחק היעד בלבד** — בלי מרחק מהמשתמש (`useRouteGeneration.ts:172-190`). **[אומת בקוד; ההשפעה בפועל לא נבדקה]** |

### 4.3 כביש לעומת MTB — האם רוכב כביש יקבל סינגל?

**כן, ללא שום הגנה.** הפירוט:

* `surfaceClass` (`bike_road` מול `bike_offroad`) מחושב רק ב-`route_scores` (ראו `route-scores-doc.ts`), ונצרך על ידי `city-mapping-hub.service.ts` (אדמין) בלבד. **grep ב-`src/features`, `src/app` (פרט לאדמין) על `surfaceClass` — אין צרכן באפליקציית המשתמש.** **[אומת]** (הערת הקוד `types.ts:87` "Filter class for the app" עדיין לא מחווטת).
* הסינון/דירוג היחיד שקיים: `preferences.surface` (`'road'|'trail'`, `useRouteFilter.ts:208-211`) — **בונוס +15 / קנס −25 בניקוד**, לא סינון, ונקבע מ-toggle "שבילים" ב-drawer. דיוק תלוי ב-`features.surface`, ש:
  * ב-OSM-relation נקבע נכון (`trail`/`road` לפי ≥50% שטח);
  * ב-known-routes/dataset **נעול ל-`road`/`asphalt`/`easy`** גם כשהמסלול מסומן שטח (`known-routes.ts:199`).
* אין שדה "סוג אופניים" על `Route`; `difficulty` של סינגל הוא NPS (נוסחת טיול) — לא מדד טכני לאופני הרים. `mtb:scale` רק מעלה דרגה אחת.
* בצד היצירה אין `racingbike`/`gravel`; ‏`mtb` לא מחווט (#10, #11).

**מסקנה:** 138 ‏`bike_offroad` ארציים יופיעו לכל מי שבוחר "רכיבה" (אחרי פרסום), מעורבבים עם `bike_road` ללא תיוג, ועם `difficulty` שאינו מותאם לאופניים.

## 5. תוכנית תיקון מתועדפת

מקרא קבצים: 🔒 = קובץ בבעלות דוד (AppMap/MapShell/DiscoverLayer/TurnCarousel) — דורש אישורו; ללא סימון = חופשי.

| עדיפות | מה | גודל | נוגע ב-🔒? |
|---|---|---|---|
| **P0-1** | לאמת את מצב GH החי: smoke ל-`bike`/`mtb`/`out_bike` + בדיקת `enable_graphhopper_routes` בפרודקשן. מוסיף `bike` ל-`smoke.sh` | XS (שעה; דורש gcloud אצל דוד) | לא |
| **P0-2** | להחליט האם רכיבה ל**כל** המשתמשים (הפרדה בין "ride mode" ל-`enable_home_v2`): או דגל נפרד `enable_ride_mode` או פתיחת הענף ב-`FreeRunDrawer.tsx:1474-1479`, `completion-sync.service.ts:99-110`. **זו כנראה הסיבה לתחושת "לא עובד"** | M (דגל + בדיקות + אימות סיכום/XP/היסטוריה בשטח) | לא (FreeRunDrawer/completion-sync אינם ברשימה), אך משפיע על כל הנגן |
| **P0-3** | commute/leg-plan: להעביר `cycling` נכון ל-`setActivityType` (v2 בלבד, כמו ה-drawer) | S | **כן** — `DiscoverLayer.tsx:2086-2088, 2304-2310` |
| **P1-1** | `routeMatchesActivity` לאופניים: להתאים לפי `routeActivities(route).includes('cycling')` (לא רק primary), כדי ש-`mixed` יגיע לרוכבים. לא לשבור strict להליכה. ‏+ טסטים | XS | לא (`route-activity-match.ts`) |
| **P1-2** | לחווט `surfaceClass`/סוג אופניים לאפליקציה: טוגל "כביש / שטח" ל-cycling ב-FreeRunDrawer (extras), סינון אמיתי (לא בונוס) לפי `route_scores.surfaceClass` או שדה מסמך חדש; מסלול ללא נתון → ניטרלי. דורש הכרעת מוצר (האם 3 סוגים: כביש/גראבל/הרים?) | M–L | לא (FreeRunDrawer, useRouteFilter); תצוגה בכרטיס אולי `RouteCarousel` |
| **P1-3** | GH: לחווט `mtb`/`out_bike` לפי בחירת סוג האופניים; להעדיף `out_bike` (כולל STEPS) על `bike`+`QUIET_BIKE`; לשקול הוספת `racingbike` (דורש encoded values חדשים → rebuild של הגרף) | M (+ rebuild) | לא |
| **P1-4** | `loops-prefer-official`: לסנן `ourRoutes` לפי activity (cycling → רק מסלולי cycling; הליכה/ריצה → רק on-foot) לפני `toWireOurRoutes` | S | לא |
| **P1-5** | איכות לולאה לאופניים: `evaluateLoopQuality`/`scoreLoop` מקבלים `activity` — לבטל `avoidUnmarkedCrossings` ולשכך `majorRoadPct` ו-`turnScorePenalty` לאופניים; ל-Mapbox: `walkway_bias` נעקף, וקלט נוסף (למשל `exclude=ferry`) אם רלוונטי. כיול מול סט מדידה (כמו `/admin/routes/quality` שרץ היום רק על running) | M–L | לא |
| **P2-1** | איחוד מהירות אופניים בקבוע אחד: `SPEED_KMH.cycling` (20) מול 250 מ'/דק׳ (15 קמ"ש) ב-`inventory.service.ts:744,1804`, `trail-graph/firestore-docs.ts:79`, `dataset-import/to-route-doc.ts:16`; ותיקון `known-routes.ts` (pace ריצה + 65 קק"ל לכל kind) | S | לא |
| **P2-2** | `to-route.ts` (GH): `terrain/surface` לפי `surface` details של GH במקום קבוע `road/asphalt`; `difficulty` ייעודי לאופניים | S–M | לא |
| **P2-3** | known-routes bike: לקבוע `surface/terrain/difficulty` מנתוני OSM במקום `road/asphalt/easy` | S | לא |
| **P2-4** | ניווט/TurnCarousel לאופניים: סף פניות והתראה מוקדמת לפי מהירות; בדיקת שטח | M | **כן** — `TurnCarousel.tsx` (ו-NavBannerV2) |
| **P2-5** | מדיניות XP לרכיבה (נוסחה נפרדת או מקדם מהירות) — לאשר מול `XP_Progression_Truth.md` ובהחלטת דוד; **לא** להמציא נוסחה | S + החלטה | לא |
| **P3** | `hybrid` עם רכיבה (כרטיס "בקרוב"), פתיחה אחרי P0-2 | M | לא |

### סדר מומלץ
1. **P0-1** (אימות GH), במקביל **P0-2** (החלטה על ride mode — זו ההחלטה שמשנה הכי הרבה למשתמש).
2. **P1-1 + P1-4** (קטנים, חסרי סיכון, בלי קבצי דוד).
3. **P1-2/P1-3** אחרי הכרעת מוצר על "סוגי אופניים".
4. **P0-3, P2-4** רק באישור דוד (קבצים שלו).

## נספח: מה לא נבדק

* מצב הדגלים החי (`enable_graphhopper_routes`, `enable_home_v2`, `enable_loops_prefer_official`) ב-Firestore.
* ה-GraphHopper החי (לא נקראה אפילו `/health`), ותוכן ה-jar (`bike.json`/`mtb.json` המובנים).
* ספירות המסלולים המעשיות ב-Firestore (116 / 138 / 25) — נלקחו מ-`docs/routes/NATIONWIDE-RUN-2026-10.md` ולא נבדקו מול הפרודקשן.
* התנהגות הנגן/ניווט בשטח לרכיבה (GPS, TurnCarousel בקצב 20 קמ"ש).
* `XP_Progression_Truth.md` (לא נקרא — נדרש לפני כל שינוי XP לפי חוק 1 ב-CLAUDE.md).
