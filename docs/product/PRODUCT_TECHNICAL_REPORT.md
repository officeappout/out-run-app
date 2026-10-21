# OUT-RUN — דוח מוצר טכני מקיף

> תאריך: אפריל 2026 | Branch: production | Codebase: `עותק של out 10.26.2.`

---

## 1. מסכים ו-Navigation

### ארכיטקטורת Routing

- **Next.js 14 App Router** — 145+ קבצי `page.tsx` תחת `src/app/`
- **Root shell**: `src/app/layout.tsx` → `ClientLayout` → `BottomNavbar` + `GlobalDetailOverlay`
- **Middleware** (`src/middleware.ts`): domain-based redirect — admin domain → `/admin/*` (JWT cookie `out_admin_session`); authority portal host → `/authority-portal/*`
- **GlobalDetailOverlay**: sheet גלובלי (פארק / מסלול) שנגיש מכל עמוד דרך `useMapStore.globalSheet`

### טאבים (Bottom Nav)

| טאב | Route | תנאי הצגה |
|-----|-------|-----------|
| בית | `/home` | תמיד |
| מפה | `/map` | תמיד |
| קהילה | `/feed` | `enableCommunityFeed` feature flag (Firestore) |
| הליגה | `/arena` | `enableCommunityFeed` feature flag |

Bottom nav **מוסתר** ב: onboarding, login, `/run`, `/auth`, `/admin`, נתיבים עם `/active`, כאשר session פעיל/מושהה, וכאשר `useMapStore.bottomNavSuppressionCount > 0`.

### מסכים מרכזיים — מיפוי מלא

#### Landing & Auth
| Route | קובץ | סטטוס | תיאור |
|-------|------|--------|-------|
| `/` | `src/app/page.tsx` | ✅ פעיל | Marketing/login carousel + Google sign-in |
| `/gateway` | `src/app/gateway/page.tsx` | ✅ פעיל | Guest onboarding gateway |
| `/join` | `src/app/join/page.tsx` | ✅ פעיל | Join flow |
| `/join/[inviteCode]` | `src/app/join/[inviteCode]/page.tsx` | ✅ פעיל | Invite deep link |
| `/explorer` | `src/app/explorer/page.tsx` | ✅ פעיל | Location explorer (bridge ל-`/map?fromExplorer=true`) |
| `/authority-portal/login` | `src/app/authority-portal/login/page.tsx` | ✅ פעיל | Authority portal login (Magic link, branded) |

#### Core App
| Route | קובץ | סטטוס | תיאור |
|-------|------|--------|-------|
| `/home` | `src/app/home/page.tsx` | ✅ פעיל | Main dashboard (lemur, streak, schedule, workouts) |
| `/map` | `src/app/map/page.tsx` | ✅ פעיל | מפה ראשית — server reads searchParams, client `FullMapView` |
| `/feed` | `src/app/feed/page.tsx` | ✅ פעיל | Community feed (feature-flagged) |
| `/progress` | `src/app/progress/page.tsx` | ✅ פעיל | Progress screen |
| `/search` | `src/app/search/page.tsx` | ✅ פעיל | Search partners/groups |
| `/library` | `src/app/library/page.tsx` | ✅ פעיל | Library |
| `/arena` | `src/app/arena/page.tsx` | ✅ פעיל | League hub (הליגה) |
| `/arena/create` | `src/app/arena/create/page.tsx` | ✅ פעיל | Create arena group |
| `/community/[id]` | `src/app/community/[id]/page.tsx` | ✅ פעיל | Community detail page |
| `/profile` | `src/app/profile/page.tsx` | ✅ פעיל | Own profile |
| `/profile/[userId]` | `src/app/profile/[userId]/page.tsx` | ✅ פעיל | Public profile |
| `/profile/exercise/[exerciseId]` | `src/app/profile/exercise/[exerciseId]/page.tsx` | ✅ פעיל | Per-exercise analytics |
| `/settings/refine-levels` | `src/app/settings/refine-levels/page.tsx` | ✅ פעיל | Level refinement |
| `/roadmap` | `src/app/roadmap/page.tsx` | ✅ פעיל | Roadmap |

#### Workouts & Activity
| Route | קובץ | סטטוס | תיאור |
|-------|------|--------|-------|
| `/run` | `src/app/run/page.tsx` | ✅ פעיל | Active run UI + map; redirect → `/map` ללא session |
| `/workouts/[id]` | `src/app/workouts/[id]/page.tsx` | ✅ פעיל | Shared workout preview + OG metadata |
| `/workouts/[id]/active` | `src/app/workouts/[id]/active/page.tsx` | ✅ פעיל | Active workout session |
| `/workouts/[id]/overview` | `src/app/workouts/[id]/overview/page.tsx` | 🚧 חלקי | כוח: `StrengthOverviewCard` מלא; ריצה/hybrid: **"Coming soon"** |
| `/activity/steps` | `src/app/activity/steps/page.tsx` | ✅ פעיל | Steps analytics |
| `/active-workout-ui` | `src/app/active-workout-ui/page.tsx` | ❌ Stub בלבד | Dev demo — `mockPlan`, לא בשימוש production |

#### Onboarding
| Area | סטטוס |
|------|--------|
| `/onboarding` | ✅ פעיל |
| `/onboarding-dynamic` | ✅ פעיל |
| `/onboarding-new/*` | ✅ פעיל (steps: profile, health, intro, setup, assessment, running schedule, roadmap, selection, persona, phase2, program path, running plan length, summary, dynamic) |

#### Admin (`src/app/admin/`)
✅ עץ גדול של עמודים עם RBAC, org selector, collapsible sidebar.
נתיבים מרכזיים: `/admin/dashboard`, `/admin/users`, `/admin/exercises`, `/admin/parks`, `/admin/routes`, `/admin/running/**`, `/admin/authority/**`, `/admin/heatmap`, `/admin/content-matrix`, `/admin/authority-manager`, ועוד.

### מצבי מפה (Map Mode State Machine)

מוגדר ב-`MapModeContext` + `MapShell`:

```
discover → builder | navigate | free_run | planned_preview → active → summary
```

| Mode | Layer Component | מתי פעיל |
|------|----------------|---------|
| `discover` | `DiscoverLayer` | ברירת מחדל |
| `builder` | `BuilderLayer` | בניית מסלול |
| `navigate` | `NavigateLayer` | ניווט למסלול |
| `free_run` | `FreeRunLayer` | ריצה חופשית |
| `planned_preview` | `PlannedPreviewLayer` | `?workoutId=` בURL |
| `active` | `ActiveWorkoutLayer` | אימון פעיל |
| `summary` | `SummaryLayer` | סיכום אחרי אימון |

`DiscoverLayer` עצמו מריץ state machine פנימי: `SEARCH | NAV | ROUTE_CARD | DISCOVERY`.

---

## 2. מערכת האימון — כוח

### סוגי אימוני כוח

| סוג מבנה | סוג Intent | תיאור |
|----------|-----------|-------|
| `standard` | `normal` | סט רגיל עם מנוחה |
| `emom` | `blast` | Every Minute On the Minute |
| `amrap` | `blast` | As Many Reps As Possible |
| `circuit` | `on_the_way` / `field` | מעגל מהיר |

**Difficulty levels**: 1 (recovery) | 2 (default) | 3 (tree strength)

**Focus types** (blueprint): `full_body`, `upper_push`, `upper_pull`, `lower_body`, `skills`, `core`, `recovery`...

### מאגר התרגילים

- **אחסון**: Firestore collection `exercises` — **כמות תלויה ב-data, לא hard-coded בקוד**
- **קטגוריות שרירים** (`MuscleGroup`): chest, back, shoulders, abs, legs, cardio, full_body ועוד
- **ציוד** (`EquipmentType`): `rings`, `bar`, `dumbbells`, `bands`, `pullUpBar`, `mat`, `kettlebell`, `bench`, `lowBar`, `highBar`, `dipStation`, `wall`, `stairs`, `streetBench`, `none`
- **Movement Groups**: squat, hinge, horizontal/vertical push/pull, core, isolation, flexibility
- **Tags**: `skill`, `compound`; `MechanicalType`: straight_arm / bent_arm / hybrid / none
- **InjuryShieldArea**: שדה לסינון תרגילים לפי פציעות

### סרטוני הדרכה

| שדה | ערך |
|-----|-----|
| Provider ראשי | **Bunny.net Stream** |
| Providers נוספים (legacy) | YouTube, Firebase Storage, `internal` |
| מיקום | Firestore per-exercise document |
| כמות | **תלויה ב-data** — לא מספר קשיח |
| פורמטים | `previewVideo` + `fullTutorial` — per-language (HE/EN) |
| Player | `ExerciseVideoPlayer.tsx` — `<video>` / YouTube iframe / offline cache via `useCachedMediaUrl` |

### לוגיקת התאמה אישית

אורקסטרציה ב-`home-workout.service.ts` → **ContextualEngine** + **WorkoutGenerator**:

| שלב | מה קורה |
|-----|---------|
| Pool | `getAllExercises()` — כל תרגילי Firestore |
| Filter | ContextualEngine: location noise/sweat limits, injury shield, equipment, personas, program filters, level tolerance, **48h muscle exclusion** |
| Score | `ScoredExercise` עם reasoning |
| Budget | `calculateWeeklyBudget` מ-`useWeeklyVolumeStore` → volume caps, recovery/detraining |
| Build | WorkoutGenerator: domain quotas, antagonist pairing, physiological order, `getShuffleSeed` |
| Output | `WorkoutStructure` עם slots (golden/compound/accessory/warmup/cooldown) |

**Intent mode** משפיע על: caps משך, מנוחה, כותרות session.

### ממשק Session כוח

`StrengthRunner.tsx` — Spotify-style layers:
- **WorkoutPlaylist**: draggable full-screen / mini player
- **States**: PREPARING → ACTIVE → REST (log drawer)
- **UI elements**: `ExerciseVideoPlayer`, `IsometricTimerCard`, `RestWithPreview`, `FillingButton`, `WorkoutStoryBars`, `HorizontalPicker` (reps)
- **Wake lock** + `useMediaSession` (OS audio controls)
- **Persistence**: `useWorkoutPersistence`
- **Summary**: `StrengthSummaryPage` → `WorkoutSummaryPage`

---

## 3. מערכת הריצה

### סוגי אימוני ריצה

| קטגוריה | סטטוס |
|---------|--------|
| `free` (ריצה חופשית) | ✅ פעיל |
| `easy_run` | ✅ פעיל |
| `long_run` | ✅ פעיל |
| `tempo` | ✅ פעיל |
| `short_intervals` | ✅ פעיל |
| `long_intervals` | ✅ פעיל |
| `fartlek_easy` / `fartlek_structured` | ✅ פעיל |
| `hill_*` | ✅ פעיל |
| `strides` | ✅ פעיל |
| `my_routes` mode | 🚧 Placeholder ב-`ActiveDashboard.tsx` |

**Run Zones**: walk, jogging, recovery, easy, long_run, fartlek variants, tempo, interval_long/short, sprint — רשימה מלאה ב-`ALL_RUN_ZONES`.

**Runner profiles**: 4 profile types לפי base pace (`determineProfileType`); Goals: `couch_to_5k`, `maintain_fitness`, speed goals.

### GPS Tracking

| פרמטר | ערך |
|--------|-----|
| ספרייה | **Browser Geolocation API** (`navigator.geolocation.watchPosition`) |
| SDK חיצוני | אין |
| דיוק סף | 25 מטר (accuracy threshold) |
| חישוב מרחק | Haversine `calculateDistance` |
| מה נמדד | distance, duration, pace (current + lap), route polyline, GPS accuracy/status, calories |
| גובה (altitude) | typed ב-`GeoPoint` אך **לא מחובר** ב-`useRunningPlayer` |
| cadence | ❌ לא קיים |
| Simulation | ✅ `isSimulationActive` — מאפשר bypass GPS לבדיקות |
| Wake Lock | ✅ API מופעל בזמן ריצה |

**GPS Status**: `searching | poor | good | perfect | simulated`

### מסלולים

- **אחסון**: Firestore — `official_routes` + `curated_routes`
- **כמות**: תלויה ב-data, לא קשיח בקוד
- **מי יוצר**:
  - **Admin pipeline**: `RouteStitchingService.generateCuratedRoutes` — Hero Loop מ-infrastructure segments + Mapbox pathing → שמירה ב-`curated_routes`
  - **ביצירת session**: `generateDynamicRoutes` — waypoints אקראיים קרוב למשתמש → `MapboxService.getSmartPath` → validation
  - **ניווט לפארק**: `RouteService.getSmartRoute` — Mapbox Directions API (walking), home → park → home

### מנוע יצירת מסלולים אוטומטי ✅ קיים

**שני מסלולים**:
1. **Batch curated** (per authority): `RouteStitchingService` — infrastructure fetch, cluster/tier loops, Douglas–Peucker smoothing, hybrid snapping
2. **Per-session dynamic loops**: waypoint fan, Mapbox path validation, distance validation, calorie estimate

### ממשק ריצה בזמן אמת

**ריצה חופשית** (`FreeRunActive.tsx`):
- Glass header "אימון חופשי"
- `GpsIndicator`
- `StatsCarousel` (main metrics / lap metrics)
- Toggle: מפה vs לפים
- `WorkoutSettingsDrawer`, `LapSnapshotOverlay`
- FABs: pause/resume/finish

**ריצה מתוכננת** (`PlannedRunActive.tsx`):
- `BlockCountdownPanel` — count-down per block
- `RunBlockPlaylist` — רשימת blocks
- `RunBriefingDrawer` — briefing לפני התחלה
- `IntervalRunView` למקטעי intervals
- `RunSummary` — סיכום מפורט

---

## 4. המפה

### טכנולוגיה

| שכבה | טכנולוגיה |
|------|-----------|
| Library | **`react-map-gl`** wrapping **`mapbox-gl`** |
| Style בסיס | `mapbox://styles/mapbox/streets-v12` |
| RTL | `mapbox-gl-rtl-text` plugin (initialized once ב-`AppMap.tsx`) |
| Tint פיטנס | `applyFitnessMapStyle` מ-`mapStyleConfig.ts` |
| Labels | Hebrew coercion — `name_he` / `name` על symbol layers |
| Admin | Mapbox Directions API ל-`RouteEditor` |
| Arena | Static Mapbox image URL ל-meeting point |

### שכבות על המפה

| שכבה | מה מוצג | תנאי הצגה |
|------|---------|-----------|
| **Basemap** | Streets v12 + Hebrew labels | תמיד |
| **Routes** | LineString מסלולים: background (gray), focused glow/outline/active (cyan) | `visibleLayers` כולל `'routes'` + לא בזמן active workout |
| **Active workout trace** | `live-path` (איפה רצת), `ghost-path` (מסלול מתוכנן קדימה), zone-colored | בזמן active workout |
| **Parks (clustered)** | Cluster circles + pins (functional/default/minor urban) | תמיד |
| **Route start markers** | נקודות קטנות ב-start של כל מסלול | עם routes layer |
| **Facilities** | מים (droplet), שירותים, gym, חניה — `InventoryService.fetchFacilities()` | zoom ≥ 14 + `visibleLayers` כולל layer type |
| **User position** | `LemurMarker` — scales with zoom; pulse dot zoom < 10; heading cone בניווט | תמיד |
| **Destination** | Purple pin | כשיש `destinationMarker` / `spotFocus` |
| **Partners ("Peloton")** | `PartnerMarker` per partner | מ-`useGroupPresence` — Firestore `presence` |
| **Admin infrastructure** | Route segments | Admin only + "תשתיות" toggle |

**Layer toggles UI** (`MapLayersControl.tsx`): water, gym, toilet בלבד.
**Default `visibleLayers`**: `['parks', 'routes', 'gym']` — water ו-toilet **כבויים** כברירת מחדל.

### חיבור בין מתאמנים על המפה — Live Location

| מרכיב | פרטים |
|-------|-------|
| כתיבה | `useWorkoutPresence` → heartbeat ל-Firestore `presence/{uid}` |
| קריאה | `useGroupPresence` — subscribe ל-`presence` collection, filter ghosts + self |
| מסנני privacy | מינורים חסומים מ-discovery; `verified_global` vs `following` mode |
| עדכון | Real-time Firestore subscription |

### Clustering

| פרמטר | ערך |
|--------|-----|
| Source | `parks-clustered` (GeoJSON, `cluster: true`) |
| `clusterMaxZoom` | 14 |
| `clusterRadius` | 50 |
| Layers | `park-clusters-glow`, `park-clusters`, `park-pins`, `park-minor-pins`, `park-cluster-count` |
| Click | `getClusterExpansionZoom` → `easeTo` |

---

## 5. הממשק החברתי

### Follow / Unfollow ✅ פעיל

- **Firestore doc**: `connections/{userId}` עם `following[]` + `followers[]`
- **Actions**: `followUser`, `unfollowUser`, `loadConnections`, `isFollowing`
- **Partners** = mutual follows (`isPartner`) — אין "friends" נפרד

### Groups / Communities ✅ קיים (data model)

- **Types**: `CommunityGroup`, `CommunityEvent`, `ScheduleSlot` — `src/types/community.types.ts`
- **Sources**: `authority` | `professional` | `user`
- **Firestore**: `community_groups` / `community_events`
- **Group chat**: `createGroupChat` / `addMemberToGroupChat` — `type: 'group'`, `chatId = group_{groupId}`

### פיד פעילות

**A) Social workout feed** (`feed_posts`) — ✅ פעיל:
- `createWorkoutPost` ב-`feed.service.ts`
- `activityCategory`: `strength` | `cardio` | `maintenance`
- `audience`: `public` | `partners` | `private` (default `partners`)
- `activityCredit` = `durationMinutes × multiplier` (strength ×2, cardio/maintenance ×1)
- גדר: `enable_community_feed` feature flag

**B) Personal activity inbox** (`activity/{uid}/feed`) — ✅ פעיל:
- Types: `high_five` | `group_join` | `official_event_join` | `leaderboard_badge`
- Real-time subscription; כתיבה ע"י Cloud Functions + `kudos.service`
- `official_event_join` בtype union אך ללא icon branch (fallthrough bug)

### שיתוף אימונים ✅ פעיל

`createWorkoutPost` + `FeedPostCard.tsx` (category emoji, pace, reactions, delete/report)

### צ'אט בין משתמשים ✅ פעיל

| סוג | Chat ID | תיאור |
|-----|---------|-------|
| DM | `{sortedUids}` | `type: 'dm'`, message types: `text` | `high_five` |
| Group | `group_{groupId}` | `type: 'group'` |

Components: `ChatInbox.tsx`, `ChatThread.tsx`

### חיבור בין מתאמנים תוך כדי אימון 🚧 חלקי

- **Map presence**: `useSocialLiveMap.ts` — friends vs discover, proximity/level filters
- **Group sessions**: `PlannedSession` + `GroupSession` data model — create/join/leave/complete/activate
- **אין**: video calls, live buddy stream

---

## 6. ליגות וקהילות

### מבנה "הליגה" (Arena)

אין תיקיית `src/features/leagues/`. הליגה = **Arena** (`/arena`) המבוסס על **leaderboards אגרגטיביים**:

| פרמטר | ערך |
|--------|-----|
| מטריקה ראשית | `activityCredit` (sum מ-`feed_posts`) |
| מטריקה admin | XP snapshot מ-`leaderboard_snapshots` (Cloud Function `rollupLeaderboard`) |
| Scope | `city` | `school` | `park` |
| Category | `overall` | `cardio` | `strength` |
| טווח זמן | `weekly` (Monday 00:00) | `monthly` (calendar month) |
| Age filter | `minor` | `adult` |

**UI**: `NeighborhoodLeaderboard.tsx` + `useLeaderboard.ts` → `ranking.service.ts`

### קהילות ✅ קיים (data model, WIP UI)

`CommunityGroup` עם: authority alignment, categories (walking, running, yoga...), geo/meeting info, schedules, audience (age/gender), source tier.

### Group Challenges ❌ לא קיים

אין module ייעודי. הקרוב ביותר: community events + leaderboards scoped לשייכות.

---

## 7. גיימיפיקציה — XP, התקדמות, דמויות

### מערכת XP ✅ פעיל

**אימון כוח**:
```
XP = (minutes × DIFFICULTY_MULTIPLIER + sets × 3 + reps × 0.3) × streak_multiplier + goal_bonus
```

**ריצה/הליכה**:
```
XP = (minutes × 3 + km × 10) × streak_multiplier
```

**Streak multiplier**: `1 + (currentStreak × 0.01)`, max 1.30× (30 ימים)

מנגנון: `useProgressionStore` → `awardWorkoutXP` Guardian (Cloud Function) — קליינט לא כותב ישירות ל-XP progression.

מקור config גמיש: `app_config/xp_settings` ב-Firestore (multipliers, goal bonus tiers, min workout duration).

### רמות ✅ פעיל

**10 רמות גלובליות** לפי `globalXP` מצטבר:

| רמה | Threshold XP (fallback) |
|-----|------------------------|
| 1 | 0 |
| 2 | 300 |
| 3 | 800 |
| 4 | 2,000 |
| ... | ... |
| 10 | 100,000 |

שמות עברים (מגדריים) מוגדרים ב-`config/lemur-stages.ts` (`LEVEL_STAGES`).

### דמות — Lemur ✅ קיים (assets חסרים)

**שתי סולמות מקבילות**:

| סולם | מבוסס על | שלבים | קובץ |
|------|---------|--------|------|
| Global XP Level | `globalXP` | 1–10 | `xp-rules.ts` + Firestore `levels` |
| Lemur Stage | `daysActive` (0, 3, 7, 14 ... 120 ימים) | 1–10 | `lemur-evolution.service.ts` |

**`LEMUR_ASSETS_AVAILABLE = false`** — assets עדיין לא בייצור; `LemurAvatar.tsx` מציג fallback icon.

**התאמה אישית**: אין — stage מוצג לפי threshold בלבד.

### Achievements / עיטורים 🚧 בסיסי

**5 achievements קיימים** ב-`achievement.service.ts`:

| ID | שם | תנאי |
|----|-----|------|
| `first_workout` | אימון ראשון | `totalCaloriesBurned > 0` |
| `week_warrior` | לוחם שבוע | `daysActive >= 7` |
| `coin_collector` | אספן מטבעות | `coins >= 1000` |
| `calorie_crusher` | מפוצץ קלוריות | `totalCaloriesBurned >= 10,000` |
| `king_lemur` | מלך הלמורים | `lemurStage >= 10` |

`BadgeDisplay.tsx` מלייבל עצמו **"placeholder for future implementation"**.

### Coin Economy ❌ כבוי

`IS_COIN_SYSTEM_ENABLED = false` — `shouldShowCoinUI()` ו-`shouldProcessCoinRewards()` מחזירים false. Schema קיים ב-DB, לוגיקה frozen.

### Streak ✅ פעיל

| מרכיב | פרטים |
|-------|-------|
| Firestore | `streaks` collection |
| Minimum | **10 דקות** אימון (`STREAK_MINIMUM_MINUTES`) |
| UI | Activity rings ב-home |
| XP effect | streak multiplier ב-`awardStrengthXP` / `awardRunningXP` |
| Reset | `smart-goals.service.ts` — baseline miss → reset ל-0 |

---

## 8. פרופיל משתמש

### מה מוצג בפרופיל

**פרופיל עצמי** (3 טאבים):

| טאב | תוכן |
|-----|------|
| דשבורד | Lemur avatar, streak, Hebrew level name, XP bar, ימים פעילים, אימונים, `GoalCarousel`, `ActiveProgramsCarousel`, `RecentActivityList` |
| היסטוריה | Workout history עם filters: all / running / walking+cycling / strength; drill-down לפר-session |
| השמורים שלי | Favorites |

**פרופיל ציבורי** (`/profile/[userId]`): שם, תמונה, רמה, `mainGoal` (תווית עברית), follow/unfollow, פעילות אחרונה.

**Analytics per exercise**: `/profile/exercise/[exerciseId]` → sparklines + goals.

### מה המשתמש יכול לערוך

| שדה | מיקום |
|-----|-------|
| שם + DOB | Inline ב-`profile/page.tsx` |
| משקל | JIT link → onboarding-new/setup |
| ציוד | JIT link |
| עיר / authorityId | JIT link |
| לוז | JIT link |
| Org / access code | `AccessCodeGate` |
| פרטיות, analytics opt-out, מחיקת חשבון | `SettingsModal` |

### Firestore Schema — UserFullProfile

| שדה | תוכן |
|-----|------|
| `core` | name, email, birthDate, gender, weight, photoURL, authorityId, tenantId, unitId, accessLevel, goals, analyticsOptOut, discoverable |
| `progression` | globalXP, globalLevel, unlockedBadges, coins, domains, activePrograms, lemurStage, daysActive, currentStreak |
| `equipment` | home / office / outdoor gear ids |
| `lifestyle` | scheduleDays, recurringTemplate, trainingTime, reminders, commute, tags, primaryTrack |
| `settings` | pushEnabled, notificationPrefs (channels: training_reminder...) |
| `fcmTokens` / `fcmTokenMeta` | Native push tokens |
| `running` | scheduleDays, runner profile, pace data |
| onboarding | progress fields |

**Workout history**: אוסף **נפרד** — `workouts` collection (לא embed ב-user doc).

---

## 9. לוז ותכנון

### לוח שנה

| Component | סטטוס | תיאור |
|-----------|--------|-------|
| `SmartWeeklySchedule` | ✅ פעיל | שבועי — rings + volume |
| `RollingAgenda` + `AgendaDayCard` | ✅ פעיל | Rolling agenda view |
| `MonthlyCalendarGrid` | ✅ פעיל | Monthly — scheduleDays + recurringTemplate |
| `TrainingPlannerOverlay` | ✅ פעיל | Planning overlay |

### תכנון אימון עתידי

- **`recurringTemplate`**: Hebrew weekday letters → program id arrays, hydration ע"י `hydrateFromTemplate`
- **Onboarding sync**: running days → global schedule + `recurringTemplate` (`onboarding-sync.service.ts`)
- **FullDay timetable optimization**: ❌ לא קיים — only day-of-week + engine budgets

### Reminders / התראות

| ערוץ | סטטוס |
|------|--------|
| Native Push (FCM via Capacitor) | ✅ פעיל |
| Web Push | ❌ מחוץ לscope (documented explicitly) |
| Email reminders | ❌ Placeholder (`authority.service.ts` — TODO) |
| In-app scheduling prefs | ✅ `lifestyle.reminders.runningTime` / `strengthTime` |

**Pipeline**: `engagement.service.ts` → queue → Cloud Function `sendPushFromQueue` → FCM.

### התאמה לזמן זמין

`scheduleDays.length` → `calculateWeeklyBudget` → `SplitDecisionService` + `lead-program.service.ts`.
אין אופטימיזציה לחלונות זמן ספציפיים ביום.

---

## 10. B2G — ממשק העירייה

### White Label ✅ חלקי

| מה ניתן לשינוי | מיקום |
|----------------|-------|
| שם הרשות | `Authority.name` |
| לוגו | `Authority.logoUrl` (נטען ב-authority-portal/login) |
| גבול גאוגרפי | `boundaryGeoJSON`, `radiusKm`, `coordinates` |
| KPI weights | `Authority.kpiWeights` |
| Category icons | `category_branding` (global — לא per-authority) |
| Vertical labels/colors | `VERTICAL_THEMES` ב-`tenantLabels.ts` (municipal/military/educational) |

### City Pass / Access Codes ✅ פעיל

**טכנית**: `access_codes` documents → Cloud Function `validateAccessCode`:
1. בדיקת active/expiry/usage
2. increment usage
3. `set` על `users/{uid}`: `core.tenantId`, `unitId`, `unitPath`, `tenantType`
4. return `onboardingPath` (e.g. `MUNICIPAL_JOIN`)

Client: `src/features/user/onboarding/services/access-code.service.ts`

### פאנל ניהול לעירייה ✅ קיים

| Section | Route | תיאור |
|---------|-------|-------|
| Login | `/authority-portal/login` | Magic link, branded |
| Authority Manager | `/admin/authority-manager` | Analytics dashboard |
| Locations | `/admin/authority/locations` | ניהול מיקומים |
| Routes | `/admin/routes` | ניהול מסלולים |
| Reports | `/admin/authority/reports` | maintenance reports, contributions, ratings |
| Team | `/admin/authority/team` | ניהול צוות |
| Community | `/admin/authority/community` | קהילות |
| Events | `/admin/authority/events` | אירועים |
| Users | `/admin/users` | משתמשים |
| Neighborhoods | `/admin/authority/neighborhoods` | שכונות |
| Heatmap | `/admin/heatmap` | מפת חום (municipal) |

### דאטה לעירייה

- **ממשק**: Firestore-backed admin UI — maintenance reports, user contributions, community moderation, ratings
- **Export pipeline**: אין pipeline ייעודי לייצוא
- **Email reminders**: `authority.service.ts` — **TODO, לא ממומש**
- **Engagement**: `sendPushFromQueue` ל-audiences מוגדרות

---

## 11. Tech Stack ו-Infrastructure

### Frontend

| טכנולוגיה | גרסה / פרטים |
|-----------|-------------|
| Framework | Next.js **14.2.35**, App Router, `force-dynamic` |
| React | ^18 |
| TypeScript | 5 |
| Styling | Tailwind CSS 3.4 + custom design tokens |
| State | **Zustand** (no Redux, no MobX) |
| Animation | framer-motion |
| Forms | react-hook-form |
| Icons | lucide-react |
| Charts | recharts |
| DnD | @dnd-kit |
| Flow diagrams | reactflow |
| Virtual lists | react-window, react-virtuoso |
| Utils | clsx, tailwind-merge, date-fns, axios |
| Particles | tsparticles |

### Maps & Geo

| ספרייה | שימוש |
|--------|-------|
| `mapbox-gl` + `react-map-gl` | מפה ראשית |
| `@mapbox/mapbox-sdk` | Directions API (routing) |
| `@turf/*` | Geo calculations (intersection, buffer, etc.) |
| `leaflet` + `react-leaflet` | נוכח ב-dependencies — שימוש מינימלי |
| `@react-google-maps/api` | נוכח ב-dependencies — שימוש ספציפי |

### Backend / Firebase

| שירות | שימוש |
|-------|-------|
| **Firestore** | Primary DB — users, workouts, parks, routes, communities, leaderboards |
| **Auth** | Client-side Firebase Auth |
| **Storage** | Assets, admin uploads |
| **Analytics** | Firebase Analytics + custom `analytics_events` collection |
| **App Check** | reCAPTCHA Enterprise (web) / DeviceCheck (iOS) / Play Integrity (Android) |
| **Cloud Functions** | `validateAccessCode`, `sendPushFromQueue`, `awardWorkoutXP`, `ingestHealthSamples`, `onUserDelete`, `rollupLeaderboard`, migrations, cleanup, audit logger |
| **Messaging (FCM)** | Native push only |

### External Integrations

| שירות | סטטוס | שימוש |
|-------|--------|-------|
| **Mapbox** | ✅ פעיל | Maps, Directions API |
| **Bunny.net** | ✅ פעיל | Video CDN (`bunny.service.ts` — server-only) |
| **Firebase Analytics** | ✅ פעיל | Events + consent flow |
| **Google Maps** | 🚧 נוכח, שימוש חלקי | Package installed |
| **Stripe** | ❌ לא קיים | לא ב-dependencies |

### Native (Capacitor 6)

| Platform | Details |
|----------|---------|
| App ID | `co.il.appout.outrun` |
| Web dir | `capacitor-shell` |
| Server URL | `https://out-run-app.vercel.app` |
| iOS | DeviceCheck (App Check), foreground notifications |
| Android | Play Integrity (App Check), back button → `history.back()` |
| Plugins | `@capacitor/app`, `keyboard`, `preferences`, `@capacitor-firebase/app-check`, `authentication`, `messaging` |
| Custom | `health-bridge` (`file:./plugins/health-bridge`) — HealthKit / Health Connect |

### Cloud Functions (exported)

`validateAccessCode` | `sendPushFromQueue` | `awardWorkoutXP` | `ingestHealthSamples` | `onUserDelete` | `requestAccountDeletion` | `onUnitWrite` | `rollupLeaderboard` | group member maintenance | migrations | cleanup | audit logger

---

## 12. מצב Production

### Feature Flags (`src/config/feature-flags.ts`)

| Flag | ערך נוכחי | השפעה |
|------|-----------|-------|
| `IS_COIN_SYSTEM_ENABLED` | **`false`** | מסתיר coin UI + עוצר coin rewards |
| `enable_community_feed` | Firestore `system_config/feature_flags` | מציג/מסתיר טאבי קהילה + ליגה |

### מה פעיל לחלוטין ב-Production ✅

- מפה ראשית (Mapbox) + כל שכבות המפה
- אימוני כוח (ContextualEngine + WorkoutGenerator + StrengthRunner)
- ריצה חופשית + ריצה מתוכננת
- ניווט בין מסלולים (Mapbox Directions)
- פרופיל משתמש + workout history
- Follow/unfollow + chat (DM + group)
- Activity feed (workout posts + personal inbox)
- XP system + levels + streak
- Admin portal (super-admin + authority manager)
- Access codes (B2G onboarding)
- Native shell — iOS + Android (Capacitor 6)
- Health Bridge (HealthKit / Health Connect)
- FCM push (native only)
- Onboarding flows (כולל JIT)
- Weekly/monthly scheduling + recurring template
- Leaderboards (arena)
- Community groups (data model + basic UI)

### מה Feature-Flagged / מוסתר 🚧

- **Coin economy**: schema קיים, UI ולוגיקה frozen (`IS_COIN_SYSTEM_ENABLED = false`)
- **קהילה + ליגה tabs**: גדורים ב-`enable_community_feed` מ-Firestore
- **`my_routes` run mode**: placeholder ב-`ActiveDashboard.tsx`

### מה WIP / עדיין לא יצא 🚧

| Feature | מצב |
|---------|-----|
| `/workouts/[id]/overview` לריצה/hybrid | **"Coming soon"** בקוד |
| Lemur assets | `LEMUR_ASSETS_AVAILABLE = false` — fallback icon |
| Badge grid UI | `BadgeDisplay.tsx` labeled "placeholder" — 5 achievements בלבד |
| Web push | Explicitly out of scope, documented |
| Email reminders לרשויות | TODO ב-`authority.service.ts` |
| `official_event_join` icon | Fallthrough ב-`activityIcon()` |
| User customizable avatar | לא קיים — lemur stage בלבד |
| Group challenges | אין module ייעודי |

### Tech Debt משמעותי

| Item | קובץ | חומרה |
|------|------|-------|
| אין CHANGELOG | — | נמוכה |
| `DEBUG_SHUFFLE_ON_REFRESH = Date.now()` — variety hack | `workout-selection.utils.ts` | נמוכה (dev) |
| `activity_icon()` fallthrough ל-`official_event_join` | `ActivityPanel.tsx` | בינונית |
| Dual leaderboard systems (live feed_posts vs XP snapshot) | `ranking.service.ts` + `leaderboard.service.ts` | בינונית |
| Google Maps package installed אך שימוש לא ברור | `package.json` | נמוכה |
| Leaflet + react-leaflet installed — overlap עם Mapbox | `package.json` | נמוכה |
| `UserProfileSheet` TODO ל-DM/chat | `UserProfileSheet` | בינונית |
| Web App Check vs Native App Check — שתי paths | `firebase.ts` | נמוכה |
| `StatsOverview` placeholder running widget | `StatsOverview.tsx` | נמוכה |
| Workout history **לא** embedded ב-user doc — separate collection | design decision | נמוכה |

---

## Summary Dashboard

| מערכת | סטטוס | הערות |
|-------|--------|-------|
| מסכים ו-Navigation | ✅ פעיל | 145+ routes, state machine מפה |
| אימון כוח | ✅ פעיל | ContextualEngine מלא, Bunny videos |
| ריצה | ✅ פעיל | חסר cadence, altitude |
| מפה | ✅ פעיל | Mapbox, clustering, presence |
| ממשק חברתי | ✅ פעיל | follow, chat, feed, groups |
| ליגות | 🚧 WIP | leaderboards פועלים, challenges לא |
| גיימיפיקציה — XP | ✅ פעיל | 10 רמות, streak |
| גיימיפיקציה — Lemur | 🚧 Assets חסרים | logic קיים |
| Achievements | 🚧 בסיסי | 5 בלבד, UI placeholder |
| Coins | ❌ כבוי | flag = false |
| פרופיל | ✅ פעיל | 3 tabs + history |
| לוז | ✅ פעיל | weekly + monthly + recurring |
| Notifications | 🚧 חלקי | native only, web/email חסרים |
| B2G | 🚧 חלקי | access codes + admin UI פועלים, export חסר |
| Tech Stack | ✅ Next 14 / Firebase / Mapbox / Capacitor 6 | |
| Native (iOS + Android) | ✅ פעיל | Capacitor, HealthBridge, FCM |

---

*דוח זה נוצר ע"י ניתוח אוטומטי של הקוד — אפריל 2026*
