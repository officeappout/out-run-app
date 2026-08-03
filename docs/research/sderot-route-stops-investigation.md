# מסלול + עצירות — מסמך findings (פיילוט שדרות)

> **סוג:** חקירת קוד בלבד (READ-ONLY). לא נכתב קוד מוצר, לא בוצע commit.
> **תאריך:** 28.07.2026 · **ענף עבודה:** `feat/home-daily-goal-v1`
> **מטרה:** מיפוי מה קיים לשימוש-חוזר מול מה שחסר לבניית "מסלול מוטמע כעמוד-שדרה + עצירות גנריות לאורכו" (כוח/בטן/שחרור), טריו קל/בינוני/קשוח. `full-park` = מקרה פרטי (פארק = עצירה אחת).
> **פיילוט:** מסלול שדרות שכבר במערכת + POIs מהעירייה.

---

## 0. הממצא הכי חשוב לפני הכל — סעיף 7.3 לא קיים במסמך-האב

הבריף מפנה ל-"סעיף 7.3 (מסלול + עצירות)" במסמך-האב.

- **בקוד:** `docs/architecture/workout-recommendation-engine.md` קיים רק ב-worktree `.claude/worktrees/feat+map-overview-chrome/` (הובא ב-commit `ea5dfc4`). בענף הנוכחי אין תיקיית `docs/`.
- **תוכן המסמך (294 שורות):** סעיף 7 מסתיים ב-7.1 (ממשק המחולל) ו-7.2 (מלאי המחוללים). **אין 7.3.** `grep -rn "7.3\|מסלול + עצירות" docs/` → 0 תוצאות.
- **בדרייב:** משכתי את המקור (`docs.google.com/document/d/1risCmdRy1JRuJ45LTx9WRFvu1Ukj-YFGB-xHZWitQnM`) — **זהה לעותק בריפו, גם בלי 7.3.**
- **המושג "עצירה גנרית"** מופיע במסמך-האב רק ב-§13, כהפניה למסמך החזון "חזון מוצר v1.2" → ה-MOAT + "עצירה גנרית" + "נדנוד פרואקטיבי (סעיף 4b)".

**מסקנה:** "7.3" הוא סעיף **שצריך להיכתב**, לא סעיף קיים לקרוא. המזל: **הקוד כבר מקדים את המסמך** — קיים בקוד "GENERIC STOP MODEL (§4b)" ממומש חלקית (ראו סעיף ב.4 + ו). המסמך הזה ממפה בדיוק את הפער בין מה שנבנה למה שחסר, כדי ש-7.3 ייכתב על בסיס עובדות.

---

## סיכום מנהלים (TL;DR)

התשתית **קיימת ברובה** — הפיצ'ר הוא **הכללה של מה שכבר בנוי**, לא בנייה מאפס:

| רכיב | מצב | קובץ עוגן |
|---|---|---|
| `Route` כקלט (עמוד-שדרה) | ✅ קיים — collection `official_routes`, טיפוס `Route` | `route.types.ts:275` |
| מודל "עצירה גנרית" `{מיקום × סוג-פעילות × תוכן}` | ✅ **קיים ומתועד** בקוד (`HybridStopCandidate`, §4b) | `compose-hybrid-session.service.ts:98-110` |
| מנוע compose "מסלול + עצירות" עם חלוקת תקציב | ✅ **קיים** (`composeHybridSession`) | `compose-hybrid-session.service.ts:426` |
| טריו קל/בינוני/קשוח (D1/D2/D3) שולט על סטים/תרגילים/זמן | ✅ קיים (`generateHomeWorkoutTrio` + `BOLT_DURATION_CAPS`/`DIFFICULTY_VOLUME`) | `home-workout.service.ts:546` |
| כרטיס UI לתצוגה בקרוסלת ה-3 | ✅ תוכן-מונחה (`RouteCardUnified`) — אין צורך ב-UI חדש לכרטיס בסיסי | `RouteCardUnified.tsx:32` |
| **תוכן לעצירות שאינן כוח** (בטן/שחרור/מוביליטי) | ❌ **חסר** — dispatcher קיים אבל רק `strength` מחובר | `compose-hybrid-session.service.ts:397-401` |
| **fan-out ריצתי של כמה עצירות שונות** | ❌ **חסר** — היום ה-runtime מייצר עצירת-כוח אחת קשיחה | `start-hybrid-session.ts:371-377` |
| **חיבור `Route` אמיתי מ-`official_routes`** לתוך ה-compose | ❌ **חסר** — היום ה-compose מקבל path של out-and-back מחושב | סעיף ג.1 |
| **שחרור ב-POI קרוב לסוף** (`canBeCooldown` + סף-קרבה) | ❌ **חסר לחלוטין** | סעיף ד |
| **מסלול שדרות אמיתי מהעירייה** | ❌ אין בריפו (יש רק 3 מסלולי דמו סינתטיים) | סעיף א.4 |

**המרחק לפיילוט:** להזין את מסלול+POIs שדרות, לחבר `Route` אמיתי כ-backbone, לפתוח את ה-fan-out לכמה עצירות, ולכתוב 2-3 מחוללי תוכן לא-כוח (בטן/שחרור). ה-UI, החוזה, מנגנון הטריו, וחלוקת התקציב — כבר קיימים.

---

## א. מסלולים (`official_routes`)

### א.1 סכימה ואחסון — ♻️ REUSE (אל תמציא טיפוס חדש)

- **Collection:** `official_routes` (root-level ב-Firestore). מאושר בעשרות call-sites, למשל `src/features/parks/core/services/inventory.service.ts:228,337,351,366,402,448,494,573`.
- **אין טיפוס `OfficialRoute`/`CuratedRoute`.** ה-collection מאחסן את הטיפוס הגנרי **`Route`** — `src/features/parks/core/types/route.types.ts:275`. (`grep -rn "interface OfficialRoute\|interface CuratedRoute" src/` → 0.)
- **שדות `Route` הרלוונטיים** (`route.types.ts:275-436`):
  - `path: [number,number][]` (:325) — **גיאומטריית עמוד-השדרה**. אין שדה `geometry`/`waypoints` נפרד; הכל ב-`path`. באחסון נשמר כ-`{lng,lat}[]` (Firestore אוסר nested arrays) ומנורמל בקריאה ל-`[lng,lat]` דרך `normalizeStoredRoutePath` (`inventory.service.ts:322`).
  - `segments: RouteSegment[]` (:324) — `RouteSegment` (`:112-121`) = `{id?, type: SegmentType, title, subTitle?, distance?, duration?, location?:{lat,lng}, exercises?}`. **זהו כבר מקטע-עם-מיקום-ותוכן** — קרוב מאוד ל"עצירה".
  - `facilityStops?: FacilityStop[]` (:379) — **מודל "עצירות לאורך מסלול" קיים!** `FacilityStop` (`:446-456`) = `{id, name, lat, lng, waypointIndex, priority: FacilityPriority, type, stopType: 'pit-stop'|'journey'}`. `pit-stop` = הפסקת-תרגיל נפרדת (ריצה); `journey` = אלמנט משולב (הליכה).
  - `distance` (:282, ב-**KM**), `duration` (:283, דקות), `difficulty: 'easy'|'medium'|'hard'` (:290), `type/activityType/activityTypes[]` (:286-289), `features: RouteFeatures` (:315, כולל `surface`), `featureTags?: RouteFeatureTag[]` (:321), `authorityId?` (:331), `city?` (:332), `status: 'pending'|'published'|'archived'` (:334), `curatedTier: 'short'|'medium'|'long'` (:369), `isHybrid`/`hybridType`/`hybridActivities[]` (:373-377), `analytics` (:308-312).
- **`isLoop` לא נשמר** כשדה. לולאה מזוהה בזמן-ריצה: `isLoopRoute(route)` (`useRouteDeviationOrchestrator.ts:105`); בדיסקברי OSM זה flag זמני (`scripts/geo-discovery-routes.ts:233`).
- **כתיבה/seed:** `InventoryService.saveRoutes` (`inventory.service.ts:226-307`); `saveCuratedRoutes` dual-write ל-`curated_routes` + `official_routes` (`:543-586`); admin UI (`admin/locations/page.tsx:1778`, `admin/routes/page.tsx:359`, `RouteEditor.tsx`); סקריפטים (`import-osm-routes-tlv.ts`, `geo-discovery-routes.ts`, `recalc-route-distances.ts`); API `src/app/api/admin/seed-sderot/route.ts`.
- **Indexes** (`firestore.indexes.json`): `official_routes` על `(authorityId, curatedTier)`, `(authorityId, isInfrastructure)`, `(tenantId, createdAt)`.

**המלצה:** REUSE את `Route` כמו-שהוא. אל תיצור `OfficialRoute`. ל"עצירות גנריות עירוניות" — **הכללה של `FacilityStop`** (או שדה `stops?`/`poiStops?` חדש) עדיפה על collection חדש.

### א.2 טעינה וצריכה בזמן-ריצה — ♻️ REUSE

- **Fetch:** `InventoryService.fetchOfficialRoutes(authorityIds?, publishedOnly=false)` (`inventory.service.ts:316-359`) — עם `authorityIds` עושה `where('authorityId','in',batch)` ב-chunks של 30; מנרמל path ומסנן פחות מ-2 נקודות. Cache: `getCachedOfficialRoutes()` (`:108-114`).
- **צרכנים (לא-admin):** `useMapLogic.ts:84` (find-by-id → `setFocusedRoute`), `useRouteGeneration.ts:87,155`, `useSearchNavigation.ts:88,148`, `useRouteFilter.ts:154-213` (מסובב את ה-path שיתחיל הכי קרוב למשתמש → `displayPath`), `FreeRunLayer.tsx:102` (טעינת **doc יחיד** למסלול מודרך/קבוצתי), `useRunningPlayer.ts:180,1640`.
- **`getSmartPath`** = עוטף Mapbox Directions (`mapbox.service.ts:55,156,237`) עבור מסלולים **מיוצרים דינמית** — **לא** טעינת `official_routes` שמורים. שני צירים נפרדים.

**המלצה:** REUSE. `fetchOfficialRoutes(authorityIds)` + `getCachedOfficialRoutes()` נותנים טעינה authority-scoped עם ה-index (`authorityId`) שהפיילוט צריך. למסלול פיילוט מוצמד — דפוס doc-יחיד כמו `FreeRunLayer.tsx:102`.

### א.3 רינדור על המפה — ♻️ REUSE (פרט לפינים של עצירות)

- **Renderer:** `src/features/parks/core/components/AppMap.tsx` (react-map-gl). `routesGeoJSON` memo (`:1055-1072`) בונה `FeatureCollection` של `LineString` מ-`visibleRoutes`, מעדיף `displayPath` על `path`. שכבות: `routes-active`/`routes-background` (`:1010-1012`). Overlays של אימון פעיל: `live-path` (:1080), ghost ahead (:1095), passed behind (:1144), deviation connector (:1160).
- **Host דיסקברי:** `DiscoverLayer.tsx` → `RouteCarousel`/`BottomJourneyContainer`/`RouteDetailSheet`.

**המלצה:** REUSE — כל `Route` עם `path` תקין שנכנס ל-`visibleRoutes` מצויר אוטומטית. **BUILD קטן:** פינים של עצירות על המפה = `Source/Layer` חדש ב-`AppMap.tsx` (היום `facilityStops` מרונדרים ב-UI של המסע/journey, לא כשכבת מפה).

### א.4 האם מסלול שדרות כבר קיים? — ⚠️ יש דמו סינתטי, אין מסלול עירייה אמיתי

יש **שתי משמעויות ל"שדרות"** ששוות הפרדה:

1. **שדרות העיר (tenant הפיילוט):** `SDEROT_CENTER = {lat:31.525, lng:34.5955}` (`demo-seed-sderot.ts:38`).
   - **`seed-sderot-demo.ts` כן כותב 3 מסלולי `official_routes` + 4 פארקים** (מאושר: `seedRoutes` `:375`/`addDoc` `:450`; `seedParks` `:310`/`addDoc` `:346`). מחווט לכפתור admin (`src/app/admin/seed-sderot/page.tsx:39`) + API (`api/admin/seed-sderot/route.ts`).
     - המסלולים: "המסלול הירוק - נאות השקמה" (3.2ק"מ, easy, **עם 2 `meetingPoints`** — התחלה/סוף + עמדת-מנוחה אמצעית), "מסלול הבוקר - שדרות בפארק" (4.5ק"מ), "מסלול העיר - שדרות מרכז" (5.1ק"מ). ה-`path` **מחושב סינתטית** מ-offsets סביב `SDEROT_COORDS` — לולאות דמו קטנות, **לא** גיאומטריית שדרה אמיתית.
   - **`demo-seed-sderot.ts`** (קובץ אחר, 1300 שורות) — Step 10 (`:1045-1112`) רק **מעדכן analytics** על `official_routes` **קיימים** של הרשות; אם אין → "אין מסלולים רשמיים לשדרות לעדכון" (`:1068`). לא יוצר גיאומטריה.
2. **שדרה בשם "שדרות …":** קיים בריפו — אבל ב-**אשקלון**: `'ashkelon-sderot-yerushalayim'` = שדרות ירושלים (`scripts/geo-discovery-routes.ts:117-122`), וזה **bbox לדיסקברי OSM**, לא גיאומטריה שמורה.

**עובדה:** אין בריפו מסלול-שדרה-אמיתי של שדרות עם ID/authorityId לדווח. אין geojson/dump בריפו (`find ... -name "*.geojson"` → 0). Firestore חי לא נקרא מכאן.

**`meetingPoints` — ממצא מפתח לעצירות:** בסיד, כל route נושא `meetingPoints: [{name, location:{lat,lng}, description}]` (`seed-sderot-demo.ts:393-404,462`). זהו **הפרימיטיב הקרוב ביותר בנתונים ל"עצירה גנרית על מסלול"** — נקודה עם שם, מיקום ותיאור. **אבל** הוא **data-only:** `grep -rln "meetingPoints" src/` → **רק קובץ הסיד**. אין טיפוס TS, אין UI צרכן, אין compose שקורא אותו. פוטנציאל reuse-כמודל, אבל לא מחובר לכלום.

**המלצה:** BUILD את הנתונים (להזין מסלול שדרות + POIs — ראו ב.6), REUSE את ה-pipeline. אף מסלול היום לא מרכיב "שדרה בודדת + POIs עירוניים גנריים" — ההרכבה הזו net-new.

### א.5 `route-stitching.service` / getSmartPath — ♻️ REUSE (הרחבת עוגן קטנה)

- **`route-stitching.service.ts`** (1128 שורות) — אסטרטגיית "Hero Loop", שומר ל-`curated_routes`. Export ראשי `generateCuratedRoutes(authorityId, name, activityType='cycling', ...)` (`:869`). Pipeline: infra fetch → `filterCompatibleInfrastructure` (:78) → `identifyDensityClusters` (:223, 3-8) → `generateDiamondWaypoints(center, radiusKm, rotation)` (:320, 4 נקודות קרדינליות + סגירת לולאה `[A,B,C,D,A]`) → `buildCircularRoute` (:348, Mapbox Directions ישיר) → snapping אופציונלי לפסילטיז (`snapWaypointsToFacilities` :545, `FACILITY_SNAP_RADIUS_METERS=300` :38 → רושם `facilityStops`) → `douglasPeucker` החלקה (:162) → `saveCuratedRoutes`.
- **Tiers:** `getTierConfigs` (:828) — short/medium/long עם `minKm/maxKm/radiusKm` לכל activity.

**המלצה (ל-AMRAP עתידי על ספורטק):** REUSE את מכונת diamond-loop + tiers (~90%). BUILD קטן: `generateDiamondWaypoints` ממורכז על density-clusters; כדי לקבע לולאה סביב ספורטק ספציפי — להזין center קבוע (דפוס `roundTripAnchors` ב-`geo-discovery-routes.ts:136`) במקום clusters, ולשמור על שאר ה-pipeline. tier `short` = גודל AMRAP טבעי.

---

## ב. עצירות / תחנות / פארקים / POIs

### ב.1 מבנה תחנות פארק — ♻️ REUSE (בשל)

- **אין sub-document "תחנה".** פארק = טיפוס `Park` יחיד עם **מערך ציוד שטוח**; כל פריט ציוד *הוא* ה"תחנה".
  - `Park` — `src/features/parks/core/types/park.types.ts:242-342`: `location:{lat,lng}`, `facilityType?`, `sportTypes?`, `featureTags?`, `gymEquipment?: ParkGymEquipment[]` (:271), `facilities?: ParkFacility[]` (:270), `authorityId?`/`neighborhoodId?` (:275-278), `status?`/`contentStatus?`.
  - `ParkGymEquipment = {equipmentId, brandName}` — `gym-equipment.types.ts:51-54` (מצביע ל-collection `gym_equipment`); `GymEquipment` המלא (`type, recommendedLevel, primaryMuscle, brands[], iconKey`) `:22-45`.
  - Collection `parks`; `createPark` (`parks.service.ts:273-306`).
- **⚠️ "Station" במקום אחר** = תחנות אימון *היברידי*, לא sub-doc של פארק: `ParkWorkoutStation` (`compose-park-workout.service.ts:120`), `StationPark` (`find-station-park.service.ts:16`). לא לבלבל עם ציוד פיזי.

### ב.2 park-detection — ♻️ REUSE

- **Service:** `src/features/workout-engine/services/park-detection.service.ts`:
  - `DETECTION_RADIUS_M = 200` (:15) — טעג-סשן (המשתמש *בפארק*).
  - `EQUIPMENT_DETECTION_RADIUS_M = 1000` (:18) — רזולוציית ציוד (~15 דק' הליכה).
  - `detectNearbyPark(lat,lng,radiusM=200)` (:61-90) — סריקה לינארית על רשימת פארקים cached 10 דק', מחזיר קרוב-ביותר ברדיוס.
- **Equipment resolver** (`park-equipment-resolver.ts`): שרשרת selectedPark → GPS → `firstWorkoutParkId` → fallback; `EQUIPPED_PARK_RADIUS_M=2000` (:25), `MAX_PARK_CANDIDATES=5` (:27), מאחורי `CONTEXT_AWARE_SELECTION_ENABLED` (:87).
- **Hybrid station finder** — **walk band**, לא רק קרוב-ביותר: `walkBand {minMeters:300, maxMeters:1200}` (`station-source.ts:42-46`; `find-station-park.service.ts`).
- Haversine: `calculateDistance` ב-`@/lib/services/location.service` + `geoUtils.ts`.

### ב.3 ParkGating — ♻️ REUSE (פונקציה, לא class)

- **אין class `ParkGating`** — לוגיקה inline + log-tag. `applyParkGating(list)` — `src/features/workout-engine/shared/utils/method-selection.utils.ts:111-122`: רץ רק כש-`location==='park'`; לכל `ExecutionMethod` אוסף gear-ids, מוריד bodyweight/none/surface-gear/optional, ומשאיר רק אם `requiredIds.every(satisfiesGearRequirement)`.
- **אכיפה נוקשה בפארק** (:145-176): בפארק נשקלות רק שיטות park-tagged; אם כולן נופלות ב-gating → התרגיל **מוחרג לגמרי** (`null`, log `[ParkGating] ... excluded` :160). רק bodyweight/surface טהורים שורדים.
- **סינון בריכת-התוכן לפי ציוד לכל עצירה:** `dispatchStopContent` (`compose-hybrid-session.service.ts:316-402`) קורא `filterExercisesContextually` עם `availableEquipment` per-stop (:331), משלים בריכה דלה עם bodyweight (:340), ו-"PREFER IRON" boost (`IRON_PREFERENCE_BONUS=1000` :44) כדי שברזל ינצח משקל-גוף באותו דומיין.

### ב.4 מושג "עצירה גנרית" — ✅✅ **כבר קיים ומתועד** (reuse המודל, build ה-fan-out)

**זה כותרת הממצא.** פרימיטיב `{מיקום, סוג-פעילות, תוכן}` **מתועד ומוטמע כטיפוס** במנוע ההיברידי:

- **הערת כותרת:** `compose-hybrid-session.service.ts:15-17` — *"GENERIC STOP MODEL (§4b): stops are (location kind × activity kind); content is dispatched per activityType."*
- `StopLocationKind` (:90-92): `'gym'|'bench'|'stairs'|'viewpoint'|'spring'|'scenic'|'dog_park'|'open_area'`.
- `StopActivityKind` (:93-95): `'strength'|'mobility'|'stretch'|'core'|'yoga'|'meditation'|'rest_view'`.
- `HybridStopCandidate` (:98-110) = `{stopId, parkId?, locationKind, lat, lng, waypointIndex, availableEquipment, activityType?}` — **בדיוק `{מיקום, סוג-פעילות, מקור-תוכן}`.** פארק מלא = מקרה פרטי שבו `parkId` מוגדר ו-`availableEquipment` = ציוד הפארק.
- **Dispatcher התוכן** `dispatchStopContent` (:316-402): `switch(activityType)` — רק `'strength'` יש מחולל; כל שאר הסוגים נופלים ל-`default` ומחזירים `null` עם log *"activityType '<x>' has no generator yet — skipped"* (:397-401). **ה-seam לבטן/מוביליטי/שחרור בנוי ומחכה.**

**הפער (מה שלא מחווט):** ב-runtime מיוצרת **עצירה אחת בלבד**, קשיחה ל-`activityType:'strength'` — `start-hybrid-session.ts:371-377` (`stopCandidates = [{... activityType:'strength' as const}]`). המרכיב (`selectStops`, `compose-hybrid-session.service.ts:275-310`) **כבר תומך ב-N מועמדים** — פשוט אף אחד לא מזין לו יותר מאחד.

**מקבילה persisted (העצירה השמורה הקרובה ביותר):** `FacilityStop` (`route.types.ts:446-456`), שנבנית ע"י snapping פארקים/פסילטיז ל-waypoints ב-`route-stitching.service.ts:556-618`.

**verification:** `grep -rniE "GenericStop|RouteStop|stopType|waypoint" src/` — אין טיפוס בשם `GenericStop`/`RouteStop`; הפרימיטיבים האמיתיים הם `HybridStopCandidate` (in-memory גנרי) ו-`FacilityStop` (persisted, פארק/פסיליטי בלבד).

### ב.5 מידול POIs — ♻️ REUSE (POI = Park עם sub-type), למעט דשא

- **אין טיפוס/collection `POI` ייעודי.** POIs הם מסמכי `Park` מסומנים:
  - `isPointOfInterest?: boolean` — `contribution.types.ts:34` (נקרא ב-`contribution.service.ts:52`).
  - Picker: `LocationCategory = 'full_park'|'poi'` (`Step1LocationPicker.tsx:19`); `POI_OPTIONS` = bench/dog_park/water_fountain (:21-24) → `facilityType:'urban_spot'|'nature_community'` + `isPointOfInterest:true`.
  - **תצפית = `natureType:'observation_point'`** (`park.types.ts:42`, מרונדר "🏔️ תצפית"); **מעיין = `natureType:'spring'`**.
  - sub-types נוספים: `urbanType` (`'stairs'|'bench'|'skatepark'|'water_fountain'|'toilets'|'parking'|'bike_rack'`, :50), `communityType` (`'dog_park'`, :43).
  - `MapFacility` (POI קל: מים/שירותים/gym/חניה) — `facility.types.ts:6-17`.
- **⛔ דשא / "שטח פתוח" — לא ממודל.** `grep -rniE "דשא|open_field|lawn" src/` → 0 כטיפוס-פארק. הכי קרוב `open_area` קיים **רק** כ-`StopLocationKind` (`compose-hybrid-session.service.ts:92`) ו-fallback bodyweight (`station-source.ts:63`) — **לא** `ParkFacilityCategory`, כלומר אי-אפשר לאחסן "דשא/שטח פתוח" כ-POI היום. **BUILD** אם דוד צריך דשאים כ-POIs.

### ב.6 הזנת POIs / נקודות למאגר — ♻️ REUSE (admin UI, בלי seed script)

- **אין CLI ליצירת פארקים:** `grep -rniE "createPark" scripts/` → 0. כל hit ב-`scripts/` על `collection('parks')` הוא read/update למסמכים קיימים בלבד.
- **3 נתיבי הזנה, כולם ל-`createPark`** (`parks.service.ts:273-306`):
  1. **ייבוא GIS/CSV בכמות (הנתיב ל-POIs של שדרות מהעירייה):** `src/app/admin/locations/import/[category]/page.tsx` — `CATEGORY_CONFIGS` (:101): `parks`(gym_park)/`courts`(court)/`nature_community`(springs/תצפית/dog)/`urban`(urban_spot). Parse: `GISParserService.parseFile` (:272; `gis-parser.service.ts:57`) → `ParsedPoint[]`. Save: `handleSaveAll` (:334-439) → `createPark` (:427), עם `selectedAuthorityId` (שדרות) שחותם `authorityId`+`city`.
  2. **הוספה ידנית:** `admin/locations/page.tsx` → `handleSaveLocation` (:1716) → `createPark` (:1810).
  3. **Authority-scoped / תרומת משתמש:** `admin/authority/locations/page.tsx`; `contribution-wizard` → `contribution.service.ts`.

**המלצה לשדרות:** נתיב (1) ב-`/admin/locations/import/[category]` עם GeoJSON/CSV של הנקודות, category `nature_community` לתצפית/מעיינות (או `urban` לספסלים/מדרגות), `selectedAuthorityId=שדרות`. דשא/שטח-פתוח כ-POI = BUILD (ערך `NatureType`/`UrbanType` חדש + `FACILITY_SPORT_MAPPING`).

---

## ג. מנוע ה-compose הקיים (הליבה שנכליל)

### מבנה: שני composers + orchestrator אחד

| תפקיד | קובץ | Export |
|---|---|---|
| **מנוע גנרי מסלול+עצירות עם חלוקת תקציב (זה ה-backbone שרוצים)** | `compose-hybrid-session.service.ts` | `composeHybridSession` (:426) |
| composer full-park (הלוך-חזור קשיח) | `compose-park-workout.service.ts` | `composeParkWorkoutPlan` (:148) |
| orchestrator ריצתי (פותר route/parks/profile → קורא לאחד) | `start-hybrid-session.ts` | `composeHybridPlan`(:238), `composeFullParkWorkout`(:87), `startHybridSession`(:427), `runHybridPlan`(:407) |

### ג.1 הרכבת מקטעים, הזרקת תחנות, שחרור

- **מבנה מקטע:** `HybridPlannedSegment` (`compose-hybrid-session.service.ts:138-157`) — interface שטוח אחד לשני סוגי-רגל, discriminated ב-`kind:'aerobic'|'strength'`. תוכנית = `HybridPlan {segments, totals, meta}` (:159-176).
- **בניית רשימת המקטעים (הליכה → עצירה → הליכה):** לולאת interleave ב-`composeHybridSession:542-582` — לכל עצירה שורדת דוחף רגל `aerobic` (מ-distance×pace אמיתי, :547) ואז, אם עצירה יושבת על אותה רגל, מקטע `strength` (:569-580). פערי-רגליים: `legGapsKm` (:533). Zone לכל רגל: `legZone` (:253-264) — ראשונה=`jogging` (חימום), אחרונה=`recovery` (wind-down), אמצע לפי emphasis.
- **Full-park:** רשימת המקטעים ב-`composeParkWorkoutPlan:156-203` — לולאה של 2 (`gaps=[outbound,return]`), רגל 0 → תחנה → רגל 1. **הלוך-חזור קבוע, לא מכונת ה-budget-split** (מפורש בכותרת הקובץ :6-8).
- **הזרקת תחנות:** budget-split — תוכן מ-`dispatchStopContent` (נקרא :526), מקטע strength נדחף :569-580 (רק אם `builtStops[leg]` קיים). full-park — התחנה מוזרקת רק אחרי רגל 0 (:187-202).
- **מיקום שחרור:**
  - budget-split: **אין מקטע שחרור ייעודי.** הרגל האווירובית האחרונה נכפית ל-zone `'recovery'` (:262). התאוששות per-station = חצי-מנוחות (`STATION_REST={multiplier:0.5,...}` :194) — "הריצה לתחנה הבאה היא ההתאוששות".
  - full-park: השחרור נשמר **בתוך** תוכן התחנה — `workoutToStrengthBlock` שומר `workout.exercises` שלם (חימום+עיקרי+שחרור) (`compose-park-workout.service.ts:104-114`); רגל-החזרה = release אווירובי. בפיצול ל-plan segments החימום מופרד ל-`'warmup-segment'` והשאר ל-`'hybrid-station'` (`strength-block-to-plan.ts:124-139`).

### ג.2 טריו D1/D2/D3 — ✅ המנגנון לקביעת #עצירות/#תרגילים/זמן

- **Entry:** `generateHomeWorkoutTrio` — `home-workout.service.ts:546`. בונה 3 אופציות ב-pass אחד מבריכה משוקללת משותפת (`_buildSharedPipeline` :554).
- **קושי → משך:** `BOLT_DURATION_CAPS = {1:30, 2:45, 3:60}` (:516-520) — D1 קל ≤30 דק', D2 ≤45, D3 ≤60. מיפוי: `TRAINING_DAY_CONFIGS` (:522-526). ברזולוציה per-option (:644-710): `optionDifficulty=cfg.difficulty` (:683), `boltDurationCap=BOLT_DURATION_CAPS[...]` (:693), `effectiveTime=resolveEffectiveBoltTime(availableTime, cap)` (:694, = min(מבוקש, cap)).
- **משך → #תרגילים:** `getExerciseCountForDuration(availableTime)` (`workout-budgeting.utils.ts:121-133`) מ-`DURATION_SCALING` (:35-41): `≤10→2-3 · ≤30→4-5 · ≤45→6-8 · else(60)→7-10`.
- **קושי → #סטים/reps/hold:** `DIFFICULTY_VOLUME` (`workout-budgeting.utils.ts:85-93`): `D1: 3 סטים/10-12 reps/hold 20-30 · D2: 3-4/6-8/15-25 · D3: 4-5/1-6/5-15`. נצרך ב-`assignVolume` (:468, קורא :475). base scale לפי רמת משתמש: `getBaseSets`/`BASE_SETS_BY_LEVEL` (:43-55).
- **כיוונון נוסף:** `BudgetDistributor` — `_skillClusterCap` (D3, cap 4 main / refill 5 סטים, :388-476), `_balancedClusterCap` (D2, cap 3-4, :503-604).
- **תקרת זמן post-gen:** `enforceVolumeCap(workout,{durationCap:effectiveTime,...})` (`home-workout.service.ts:793-798`) — גוזם תרגילים ואז סטים לרצפה 2. אומדן: `calculateEstimatedDuration` (`workout-budgeting.utils.ts:908`).
- **full-park משתמש בזה 1:1:** `composeFullParkWorkout` קורא `generateHomeWorkoutTrio` פעם אחת וממפה 3 אופציות ל-3 park plans (הברקים קליל/מאוזן/עוצמתי) — `start-hybrid-session.ts:126-180`.

### ג.3 workout-budgeting — שני מפצלים

קובץ: `src/features/workout-engine/logic/workout-budgeting.utils.ts`.

- **(א) בתוך אימון/בלוק יחיד:** תקציב הסטים מפוצל על-פני **דומיינים** (לא עצירות) — `assignVolume` (:468-560): `domainSets=ceil(budget/count)` (:592), תקרה גלובלית `setsPerSlot=max(2,floor(dailySetBudget/exerciseCount))` (:559-561). `BudgetDistributor.distribute` (:107-226).
- **(ב) על-פני עצירות — לא ב-budgeting.utils אלא ב-`composeHybridSession`:**
  - חלוקת זמן: `aerobicShare=EMPHASIS_AEROBIC_SHARE[resolved]` (:183-187, balanced 0.55); `tAerobicMin=timeBudget*share`, `tStrengthMin=timeBudget−tAerobic` (:432-434).
  - #תחנות מהתקציב: `round(tStrengthMin/STATION_MINUTES.ideal)` clamp `[STATION_MIN=1, STATION_MAX=4]` וגם `stopCandidates.length` (:437-443; `STATION_MINUTES={min:8,ideal:10,max:12}` :189-191).
  - תקציב-דקות per-stop: `perStationMin=clamp(tStrengthMin/stations, 8, 12)` (:511-514) → `generateStrengthBlock({blockMinutes:perStationMin,...})` (`strength-block.service.ts:45-77`).
- **חלוקת תקציב על עצירות?** `budgeting.utils`: **לא** (רק דומיינים). `composeHybridSession`: **כן, לחלק הכוח** (`perStationMin`). זמן אווירובי **לא** מתוקצב — רגליים מ-distance×pace אמיתי (:547; `totals.aerobicMin` הוא Σ אמיתי, לא התקציב, :588).

### ג — reuse-vs-build

**רובו REUSE — `composeHybridSession` *כבר הוא* מפזר מסלול-כ-backbone + עצירות-גנריות.** קיים: קלט `HybridComposeInput {routePath, stopCandidates[],...}` (:119-136); מודל עצירה גנרית + dispatcher (:98-110, :316-402); חלוקת תקציב על תחנות (:432-514); בחירת/מיקום עצירות עם ±25% spacing ו-degradation graceful (`selectStops` :275-310); הרכבה משולבת + totals (:536-595); מחולל per-stop מתוקצב-זמן + מנגנון D1/D2/D3.

**חייב BUILD/שינוי כדי להכליל מלא:**
1. **תוכן לעצירות לא-כוח** — רק `strength` יש מחולל; שאר הסוגים `default→null` (:397-401). בטן/שחרור/מוביליטי צריכים מחוללים ב-switch.
2. **חלוקת זמן היא strength-only** — זמן אווירובי distance-derived, לא מתוקצב (:547,588). "לפזר תקציב-זמן כולל על כל העצירות כולל רגליים" = הוספה.
3. **תקרות קשיחות ל-N שרירותי** — `STATION_MAX=4` ו-clamp `[8,12]` דק' מגבילים גנריות.
4. **full-park עוקף הכל** — `composeParkWorkoutPlan` הלוך-חזור 2-רגליים בלי station/budget. כדי שיהיה "מסלול + עצירות", לקפל אותו לתוך `composeHybridSession` במקום composer מקביל.

---

## ד. שחרור (cooldown) — מנוע הבחירה קיים, מיקום-ב-POI חסר לחלוטין

- **Service:** `src/features/workout-engine/services/cooldown.service.ts` (164 שורות, export יחיד `appendCooldownExercises`). זהו **post-pass שמוסיף 2-3 מתיחות סטטיות** לאימון שכבר יוצר. **לא route-aware.**
- **קלטים** (:27-38): `GeneratedWorkout`, `Exercise[]`, `ContextualFilterContext`, `ExecutionLocation`, ו-`availableTimeMin` אופציונלי. **אין קואורדינטות, אין route, אין POI.**
- **בחירה:** בריכה = `exerciseRole==='cooldown'` (:46); סינון location (:50-62); tiering ציוד (:82-107); ניקוד: `+2` אם `primaryMuscle` בשרירים שהאימון השתמש בהם, `+1` אם יש `mainVideoUrl` (:109-129); כמות: `cooldownCountBudget(availableTimeMin)` → `<20→1 · 20-39→2 · 40+→3` (`session-frame.utils.ts:43-48`).
- **Caller יחיד:** `home-workout.service.ts:760-766`. (`grep -rn "appendCooldownExercises" src/` → הגדרה + import + call אחד.)
- **`canBeCooldown` / near-end POI / סף-קרבה — לא קיימים:**
  - `grep -rn "canBeCooldown" src/` → **0**.
  - `grep -rn "nearEnd\|routeEnd\|endOfRoute\|atEnd" src/` → רק hits לא-קשורים (`useWalkToRoute.ts:163-257` = זיהוי-הגעה-ל-trailhead ב-GPS, לא שחרור).
  - `grep -rni "proximity" src/` → shelter/notifications/route-nearby/difficulty-scoring — **אף אחד לא קשור לשחרור.**
- **בהיברידי:** full-park שומר את warmup+main+cooldown של אימון-הבית שלם ולא גוזר מחדש (`compose-park-workout.service.ts:16-19,102,112`) — המתיחות רוכבות בתוך בלוק-הכוח, לא ממוקמות ב-waypoint.

**המלצה:** REUSE את **מנוע בחירת-המתיחות** (`appendCooldownExercises` + ניקוד-שריר + fallback + `cooldownCountBudget`) כמו-שהוא. **BUILD את הכל סביב מיקום ב-POI:** מושג "POI קרוב-לסוף / סף-קרבה", flag `canBeCooldown`, ו-caller שבוחר POI במרחק-סף מסוף המסלול ומעביר location/ציוד למנוע הקיים. גם החתימה תצטרך קלט POI-context שאין לה היום (:27-38).

---

## ה. תצוגה — כרטיס "מסלול + עצירות" בקרוסלת ה-3

### ה.1 `HybridSlotCarousel` — שכבת 3 הכרטיסים

- **קובץ:** `src/features/parks/core/components/hybrid/HybridSlotCarousel.tsx`. פרזנטציוני, צף מעל המפה ב-`z-[100]` (:280). קרוסלת scale-fade של `HybridSlot[]` (:325-356), כרטיס `SlotCard` לכל slot (:342-352), dots (:361), toggle פעילות (:295), ו-`ShimmerPhraseButton` "בנה בעצמך" (:377).
- **`SlotCard`** (:100-183) — שני נתיבי רינדור לפי `UNIFIED_ROUTE_CARDS_ENABLED` (:110): flag ON → מאציל ל-**`RouteCardUnified`** עם `name=slot.title`, `subtitle=slot.subtitle`, `difficulty=slot.bolts` (:112-133); flag OFF → כרטיס legacy inline (:136-182).
- **CTA הוא הטריגר היחיד ל-compose;** לחיצות גוף לא מרכיבות (arming נגד ghost-click, :92-99).
- **צורת ה-slot:** `HybridSlot` (`hybrid-slots.ts:70-93`) = `{id, title, subtitle, bolts:1|2|3, recommended, accent, kind}` — **ערך bolts יחיד, לא טריו.** `SlotKind = 'hybrid'|'aerobic_quick'` (:27) — **אין kind "מסלול+עצירות".**

### ה.2 `HybridOverviewScreen` — מה מרונדר ל-full_park (ופה חי הטריו)

- **קובץ:** `src/features/parks/core/components/hybrid/HybridOverviewScreen.tsx` — **bottom sheet** נגרר (3 detents, :37-58), **לא** כרטיס בקרוסלה. מרנדר את התוכנית: summary דביק (כותרת·דקות·שעת-סיום, :364-393), רצועת-מסע Moovit-style (:395-407), chips, `HybridJourneyAxis`, ו-CTA.
- **ענף full_park** על `composed.bolts` (:373,426,462): שורת כותרת + "פירוט" מתקפל (:427) + **בורר טריו-קושי** מ-`composed.bolts.labels` (`קליל/מאוזן/עוצמתי`) עם דקות per-bolt (:462-481); החלפת bolt מחליפה תוכנית מוכנה-מראש **בלי re-compose** (:85-95).
- **הטריו** מקורו `composed.bolts` (`{plans, selectedIndex, labels}`), מוגדר `start-hybrid-session.ts:42`, מאוכלס :179 (`labels:['קליל','מאוזן','עוצמתי']`). **הוא בגיליון-הסקירה, לא בכרטיס הקרוסלה.**

### ה.3 היכן full_park מרונדר ככרטיס

- **אין קומפוננטת full_park ייעודית** — אותו נתיב `HybridSlotCarousel → SlotCard → RouteCardUnified`.
- Slot: `hybrid-slots.ts:189-204` — נדחף רק כש-`HYBRID_FULL_PARK_WORKOUT_ENABLED && hasEquippedPark && hasStrengthProgram`. שדות: `id:'full_park'`, `title:'אימון מלא בפארק'`, `subtitle:'הליכה לפארק · אימון כוח מלא · חזרה'`, `bolts:2`, `accent:BRAND`, `preset.mode:'full_park_workout'`, `shape:'sandwich'` (:128).
- Gates ב-DiscoverLayer: `hasStrengthProgram` (:512), `hasEquippedPark` (:516), `resolveSlots(...)` (:536-541).
- Props של `RouteCardUnified` (:32-56): `name`, `distanceText`+`durationText` (route) **או** `subtitle` (slot — meta row מסתגל, :72-101), `difficulty: 'easy'|'medium'|'hard'|1|2|3`, `isActive`, `ctaContent`, `onCta`, `ctaLoading`.

### ה.4 `DiscoverLayer` — מצבי-מסך

- **"THE LAW: SINGLE SCREEN STATE"** (:1003-1030). ה-union האמיתי (:1005) הוא **6 מצבים, לא 4:** `'SEARCH'|'NAV'|'ROUTE_CARD'|'PARK_CARD'|'COMMUTE'|'DISCOVERY'` (הבריף השמיט `PARK_CARD`+`COMMUTE`). ענף אחד עולה דרך `renderScreen()` (:1095).
- **כרטיס route מוצג בשתי דרכים:** ROUTE_CARD → `RouteDetailSheet` (:1103-1140); בתוך DISCOVERY → `BottomJourneyContainer` (:1271-1286) מרנדר את קרוסלת ה-`RouteCardUnified`.
- **משטחי היברידי תחת DISCOVERY, כולם `z-[100]`,** בלעדיים לפי `freeRunStep`: entry `ShimmerPhraseButton` (:1290), `HybridSlotCarousel` (`step==='slots'`, :1336), `HybridOverviewScreen` (`step==='overview'`, :1351).

### ה.5 מה נדרש לכרטיס "מסלול + עצירות" — רובו REUSE

- **⚠️ תיקון הנחה מהבריף:** ה"הברקים" (shimmer/glint) **אינם על הכרטיסים.** `grep "shimmer\|glint\|הברקים"` → ה-shimmer היחיד הוא `ShimmerPhraseButton.tsx` (כפתור-הכניסה + "בנה בעצמך", `HybridSlotCarousel.tsx:377`, `DiscoverLayer.tsx:1295`). הכרטיסים עצמם = shadow סטטי + **טבעת cyan פעילה** (`RouteCardUnified.tsx:77-81`). אין מחרוזת `glint`/`הברקים` בקוד.
- **הכרטיס תוכן-מונחה ורה-יוזבילי כמעט בלי UI חדש.** `RouteCardUnified` כבר תומך בטעם-route (`distanceText`+`durationText`) ובטעם-slot (`subtitle`), מסתגל אוטומטית (:72-101). כרטיס "מסלול+עצירות" = `name`=כותרת, `subtitle`="N עצירות"/stats, `difficulty`=1|2|3, `ctaContent`/`onCta`. **בלי קומפוננטה חדשה.**
- **BUILD (net-new):**
  1. מפיק-slot חדש שמחזיר מסלול+עצירות (ה-union היום רק `'hybrid'|'aerobic_quick'`); + ענף ב-`resolveSlots` (`hybrid-slots.ts:161-221`) וב-`handleSelectSlot`/`handleSettleSlot` ב-DiscoverLayer.
  2. **רשימת עצירות מפורטת בתוך הכרטיס** (לא רק "N עצירות") — ל-`RouteCardUnified` אין slot לרשימת-עצירות; פירוט העצירות/מקטעים העשיר קיים **רק בגיליון-הסקירה** (`HybridOverviewScreen` journey strip :148-171 + `HybridJourneyAxis`). = הרחבה.
  3. **טריו-קושי בתוך הכרטיס** = net-new (הכרטיס מראה `bolts` יחיד; הטריו חי ב-overview).

---

## ו. סיכום פערים — מיפוי ל-"7.3" (מסלול + עצירות)

מיפוי ישיר של אבני-הבניין הרעיוניות של 7.3 מול הקוד החי:

| אבן-בניין (מ-7.3 המתוכנן) | מצב בקוד | עוגן | reuse / build |
|---|---|---|---|
| **`Route` כקלט למחולל** | ✅ קיים כטיפוס + collection; ⚠️ ה-compose לא מקבל אותו עדיין | `route.types.ts:275`; `HybridComposeInput.routePath` `compose-hybrid-session.service.ts:119-136` | REUSE הטיפוס; **BUILD** גשר `official_routes.path → routePath` (היום ה-path הוא out-and-back מחושב) |
| **`GenericStop` (מיקום × סוג-פעילות)** | ✅✅ **קיים ומתועד** (§4b) | `HybridStopCandidate` `compose-hybrid-session.service.ts:98-110` | REUSE כמעט מלא |
| **מיקום-על-מסלול (`waypointIndex`, קרבה)** | ✅ קיים בשני מקומות | `HybridStopCandidate.waypointIndex`; `FacilityStop` `route.types.ts:446-456`; snapping `route-stitching.service.ts:556-618` | REUSE |
| **סף-קרבה / spacing עצירות** | ✅ קיים (±25%, degradation) | `selectStops` `compose-hybrid-session.service.ts:275-310`; `FACILITY_SNAP_RADIUS_METERS=300` | REUSE |
| **המחולל הכללי "מסלול + עצירות" + חלוקת תקציב** | ✅ **קיים** (strength) | `composeHybridSession` `:426`; budget-split `:432-514` | REUSE; **BUILD** חלוקת-זמן גם לרגליים |
| **תוכן עצירה: כוח** | ✅ מחובר | `dispatchStopContent` case `'strength'` `:384` | REUSE |
| **תוכן עצירה: בטן/שחרור/מוביליטי** | ❌ **חסר** — seam פתוח, `default→null` | `:397-401` | **BUILD** מחוללי-תוכן ל-`core`/`stretch`/`mobility`/`rest_view` |
| **fan-out ריצתי של >1 עצירה** | ❌ **חסר** — קשיח לעצירת-כוח אחת | `start-hybrid-session.ts:371-377` | **BUILD** מפיק `stopCandidates[]` מ-POIs של המסלול |
| **טריו קל/בינוני/קשוח (D1/D2/D3)** | ✅ קיים, שולט על סטים/תרגילים/זמן | `generateHomeWorkoutTrio` `home-workout.service.ts:546`; `BOLT_DURATION_CAPS`/`DIFFICULTY_VOLUME` | REUSE |
| **`canBeCooldown` + מיקום שחרור ב-POI קרוב-לסוף** | ❌ **חסר לחלוטין** | `cooldown.service.ts` (לא route-aware) | REUSE מנוע-הבחירה; **BUILD** מיקום-ב-POI + flag + סף |
| **כרטיס UI באותה קרוסלת-3** | ✅ תוכן-מונחה (בסיסי) | `RouteCardUnified.tsx:32`; `HybridSlotCarousel.tsx` | REUSE לכרטיס בסיסי; **BUILD** slot-kind חדש + (אופ') רשימת-עצירות/טריו בכרטיס |
| **`full-park` כמקרה פרטי** | ⚠️ קיים כ-composer **מקביל**, לא כמקרה-פרטי | `composeParkWorkoutPlan` `compose-park-workout.service.ts:148` | **BUILD/REFACTOR** — לקפל לתוך `composeHybridSession` (עצירה אחת=פארק) |
| **מסלול+POIs שדרות אמיתיים** | ❌ אין (רק 3 מסלולי דמו + `meetingPoints` data-only) | `seed-sderot-demo.ts:375-475` | **BUILD נתונים** דרך admin import (ב.6) |

### המסלול הקצר ביותר לפיילוט (סדר מוצע, לא מחייב)

1. **נתונים:** להזין מסלול-השדרה של שדרות + POIs (תצפית/דשא/עמדות) דרך `/admin/locations/import` + `RouteEditor` (סעיף ב.6, א.4). *(דשא = ייתכן ערך-טיפוס חדש.)*
2. **קלט Route:** גשר `official_routes.path → composeHybridSession.routePath` + מפיק `stopCandidates[]` מה-POIs שעל המסלול (סעיף ג.1, ב.4). *(מסיר את הקשיחות ב-`start-hybrid-session.ts:371-377`.)*
3. **תוכן עצירות:** מחוללי בטן/שחרור ב-`dispatchStopContent` (סעיף ג — build #1).
4. **שחרור ב-POI:** caller סביב `appendCooldownExercises` עם POI קרוב-לסוף (סעיף ד).
5. **UI:** slot-kind "route+stops" ב-`resolveSlots` → הכרטיס הקיים מרנדר (סעיף ה.5).
6. **full-park:** בהמשך — לקפל כמקרה-פרטי (עצירה אחת) של אותו מנוע.

---

## נספח — פקודות "לא קיים" (מגובות)

| טענה | פקודה | תוצאה |
|---|---|---|
| אין §7.3 במסמך-האב | `grep -rn "7.3\|מסלול + עצירות" docs/` + קריאת Drive doc | 0 / זהה בלי 7.3 |
| אין טיפוס `OfficialRoute`/`CuratedRoute` | `grep -rn "interface OfficialRoute\|interface CuratedRoute" src/` | 0 |
| `meetingPoints` data-only | `grep -rln "meetingPoints" src/` | רק `seed-sderot-demo.ts` |
| אין `GenericStop`/`RouteStop` כטיפוס | `grep -rniE "GenericStop\|RouteStop" src/` | 0 (הפרימיטיב = `HybridStopCandidate`) |
| דשא/שטח-פתוח לא ממודל כ-POI | `grep -rniE "דשא\|open_field\|lawn" src/` | 0 כ-`ParkFacilityCategory` |
| אין CLI ליצירת פארקים | `grep -rniE "createPark" scripts/` | 0 |
| `canBeCooldown` / near-end / proximity-cooldown | `grep -rn "canBeCooldown\|nearEnd" src/` | 0 / hits לא-קשורים |
| אין מחולל תוכן לא-כוח | קריאת `dispatchStopContent:397-401` | רק `case 'strength'`, השאר `default→null` |
| אין geojson/dump בריפו | `find ... -name "*.geojson"` | 0 |

*כל הציטוטים מהעץ הראשי `/Users/calisthenicsltd/Development/appout-1` (ענף `feat/home-daily-goal-v1`). Firestore חי לא נקרא — טענות על מסמכים בפרודקשן מחוץ לתחום.*
