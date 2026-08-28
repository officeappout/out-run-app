# Spike היתכנות — שליטת מסך-נעילה לאימונים (כוח + ריצה/אירובי)

> Spike READ-ONLY (18.07.2026). מחקר בלבד — אין קוד. כל טענה ארכיטקטונית מעוגנת ב-file:line מהקוד החי. נוף הפלאגינים מ-מחקר עדכני (יולי 2026).
> מטרה: לאפשר שליטה + מבט על האימון ממסך-הנעילה בלי לפתוח את הטלפון (כמו נגן play/stop), לשני סוגי האימון, גם כדי לחסוך חום/סוללה (מסך כבוי = המפה לא מרנדרת).

---

## 0. השורה התחתונה (תקציר החלטה)

**ניתן לביצוע — כן, לשני סוגי האימון. אבל זה לא "להוסיף כרטיס", זה פרויקט-רקע.** הסיבה: הנחת-המוצא שגויה בנקודה קריטית אחת.

**התיקון הכי חשוב:** ❌ **אין היום שום background-location, ואין שום ריצת-רקע.** מה ש"מחזיק" את הריצה עם GPS זה `navigator.wakeLock.request('screen')` — שמשאיר את **המסך דלוק**. ברגע שהמסך נכבה: ה-WebView מושהה, ה-GPS watch מת, ה-JS מפסיק לתקתק, האימון קופא. כלומר — המצב שרוצים להגיע אליו (מסך כבוי = מפה לא מרנדרת = חיסכון חום/סוללה) **הוא בדיוק המצב שבו האפליקציה כיום מתה**.

מכאן שהפיצ'ר האמיתי מורכב משתי שכבות נפרדות, וה-UI הוא החלק הקל:
- **(A) ריצת-רקע אמיתית** — לשמור את האימון חי כשהמסך כבוי. **לא קיים היום.** החלק הקשה, ושונה בין ריצה לכוח.
- **(B) כרטיס/שליטה במסך-הנעילה** — ה-UI. פלאגינים בשלים, וחלק כבר נבנה חלקית (§2.3).

**המלצה פר-פלטפורמה (מקדימה):**

| פלטפורמה | Phase 1 (MVP) | Phase 2 (פוליש) |
|---|---|---|
| **Android** | Capawesome foreground-service + notification עם כפתורים (pause/stop/next) — לשני הסוגים | — (מספיק טוב מ-MVP) |
| **iOS** | הרחבת ה-`navigator.mediaSession` שכבר קיים + הוספת `audio` background mode כדי שישרוד מסך-כבוי | Live Activity נייטיב (Capgo widget-kit) — כרטיס עשיר + Dynamic Island + כפתורי App Intent |

---

## 1. תיקון הנחת-היסוד — פרמיסה מול מציאות

| ההנחה | המציאות בקוד | מקור |
|---|---|---|
| "יש background location mode שכבר עובד עם מסך כבוי" | ❌ אין. `UIBackgroundModes` = `remote-notification, fetch, processing` בלבד. אין `location`, אין `audio`. אנדרואיד: location "foreground-only", בלי `FOREGROUND_SERVICE`, בלי `ACCESS_BACKGROUND_LOCATION`, בלי `<service>` | [Info.plist:75-80](../../ios/App/App/Info.plist#L75-L80) · [AndroidManifest.xml:75-79](../../android/app/src/main/AndroidManifest.xml#L75-L79) |
| הריצה "רצה ברקע" | הריצה רצה כי המסך **נשאר דלוק** דרך Screen Wake Lock. זה לא ריצת-רקע — זה מניעת-כיבוי-מסך | [useRunningPlayer.ts:694-713](../../src/features/workout-engine/players/running/hooks/useRunningPlayer.ts#L694-L713) · [useScreenWakeLock.ts:14](../../src/features/workout-engine/players/strength/hooks/useScreenWakeLock.ts#L14) |
| "מסך כבוי = חיסכון חום/סוללה" | ✅ נכון וזה הערך האמיתי — Mapbox GL מפסיק לרנדר כשה-WebView לא נראה. אבל היום כיבוי-מסך גם הורג את האימון | — |

היחיד שכן שורד מסך-כבוי היום הוא **מסירת נתוני-בריאות** (HealthKit observer queries / Android WorkManager) — אבל בקצב ~שעתי/30-דק, גס מדי בשביל טיימר חי. [health-bridge](../../plugins/health-bridge/) · [HealthBridgePlugin.swift:334-350](../../plugins/health-bridge/ios/Plugin/HealthBridgePlugin.swift#L334-L350)

> ✅ **אימות של 30 שניות (verification-first):** לרוץ, לכבות מסך, להמתין דקה, להדליק — אם המרחק לא התקדם, זה מאשר את הקריאה. הקוד חד-משמעי, אבל שווה לראות על המכשיר.

---

## 2. הארכיטקטורה הקיימת — מה יש לחווט אליו

### 2.1 טופולוגיית ה-state (מי pull-able ומי לא) — ממצא מרכזי

| Store / hook | Zustand? | קריא מבחוץ דרך `getState()`? |
|---|---|---|
| `useSessionStore` (זמן/מרחק/סטטוס אוניברסלי) | ✅ | ✅ [useSessionStore.ts:38](../../src/features/workout-engine/core/store/useSessionStore.ts#L38) |
| `useRunningPlayer` (קצב/laps/מסלול) | ✅ | ✅ [useRunningPlayer.ts:368](../../src/features/workout-engine/players/running/hooks/useRunningPlayer.ts#L368) |
| `useHybridRun` | ✅ | ✅ [useHybridRun.ts:64](../../src/features/workout-engine/hybrid/useHybridRun.ts#L64) |
| **`useWorkoutStateMachine`** (תרגיל/סט/חזרות) | ❌ React `useState` | ❌ [useWorkoutStateMachine.ts:167](../../src/features/workout-engine/players/strength/hooks/useWorkoutStateMachine.ts#L167) |
| **`useWorkoutTimers`** (טיימר-מנוחה) | ❌ React `useState` | ❌ [useWorkoutTimers.ts:48](../../src/features/workout-engine/players/strength/hooks/useWorkoutTimers.ts#L48) |

**המשמעות למהנדס:** state של ריצה + הייבריד מלא ב-Zustand → גשר נייטיב יכול **למשוך** אותו ישירות. אבל state של **כוח** (תרגיל נוכחי / סט / חזרות / `restTimeLeft`) חי בתוך React ו-**לא ניתן למשיכה** בלי שה-hook מותקן. רק זמן/סטטוס ברמת-הסשן ממורּרים ל-`useSessionStore` ([active/page.tsx:466-489](../../src/app/workouts/[id]/active/page.tsx#L466-L489)).

זה מכתיב ארכיטקטורה: לכוח, **לא** מושכים state מנייטיב — **דוחפים** אותו מתוך React (ה-effect שכבר עושה את זה קיים, §2.3), או ממרּרים את מכונת-המצב ל-Zustand (refactor גדול יותר). ה-MVP המומלץ נמנע מה-refactor ונשען על הדחיפה-מתוך-React הקיימת.

### 2.2 פעולות pause/stop/next שקיימות (לחווט אליהן — לא לכתוב מחדש)

| פעולה | ריצה | כוח |
|---|---|---|
| Pause / Resume | `useSessionStore.pauseSession()/resumeSession()` — [WorkoutControlCluster.tsx:93-100](../../src/features/workout-engine/players/running/components/WorkoutControlCluster.tsx#L93-L100) | `sm.togglePause()` — [useWorkoutStateMachine.ts:935](../../src/features/workout-engine/players/strength/hooks/useWorkoutStateMachine.ts#L935) |
| Stop / Finish | `useRunningPlayer.getState().finishWorkout()` — [useRunningPlayer.ts:1388](../../src/features/workout-engine/players/running/hooks/useRunningPlayer.ts#L1388) | `onComplete` / early-exit — [StrengthRunner.tsx:312](../../src/features/workout-engine/players/strength/StrengthRunner.tsx#L312) |
| Next / Skip | (לא רלוונטי) | `skipRest()` / `moveToNext()` — [useWorkoutStateMachine.ts:921](../../src/features/workout-engine/players/strength/hooks/useWorkoutStateMachine.ts#L921) |

הרכיבים החיים (אחרי סינון legacy): ריצה = `FreeRunOverlay` (החדש, [FreeRunOverlay.tsx:410](../../src/features/workout-engine/players/running/components/FreeRun/FreeRunOverlay.tsx#L410)); `FreeRunActive` הוא legacy מת ללא importer. כוח = [StrengthRunner.tsx](../../src/features/workout-engine/players/strength/StrengthRunner.tsx).

### 2.3 כבר קיים — lock-screen לכוח, בשכבת ה-web בלבד

זה **לא greenfield**. יש מימוש `navigator.mediaSession` (W3C) + לולאת אודיו-שקט לשמירת-חיות, כולו ב-web (Vercel), אפס קוד נייטיב:
- [useMediaSession.ts](../../src/features/workout-engine/players/strength/hooks/useMediaSession.ts) — metadata + `playbackState` + handlers ל-`play`/`pause`/`nexttrack`, ואודיו-לופ כמעט-שקט לשמירת-חיות.
- [usePlayerMediaSession.ts](../../src/features/workout-engine/players/strength/hooks/usePlayerMediaSession.ts) — wrapper ל-StrengthRunner, נצרך ב-[StrengthRunner.tsx:30](../../src/features/workout-engine/players/strength/StrengthRunner.tsx#L30).

⚠️ **אבל** — בלי `audio` background mode ב-iOS, האודיו-השקט וה-JS מושהים כשהמסך נכבה. כלומר סביר שהמימוש עובד היום רק ב-foreground/מסך-דלוק, ולא שורד מסך-כבוי ב-iOS. **צריך אימות על מכשיר** (verification-first — אל תניח ש"זה כבר עובד"). היתרון: ה-effect כבר דוחף state מתוך React → זה עוקף את בעיית ה-`getState()` של §2.1.

### 2.4 דפוס הגשר web→native (התבנית לפלאגין חדש)

הפלאגין המקומי `health-bridge` הוא בדיוק התבנית: `registerPlugin` ([index.ts:5](../../plugins/health-bridge/src/index.ts#L5)), iOS `CAPBridgedPlugin` ([HealthBridgePlugin.swift:37-49](../../plugins/health-bridge/ios/Plugin/HealthBridgePlugin.swift#L37-L49)), Android `@PluginMethod`, ו-`notifyListeners` לאירועים native→web. עובד גם עם `server.url` (web מרוחק) — הגשר מוזרק ע"י Capacitor ללא תלות במקור ה-web. Import דינמי בלבד (אקסיומה §4), לדוגמה [healthBridge/init.ts:92](../../src/lib/healthBridge/init.ts#L92).

---

## 3. פירוק הבעיה: (A) ריצת-רקע + (B) UI מסך-נעילה

לא ניתן לקבל (B) בלי (A) — לכרטיס במסך-הנעילה צריך state חי לשקף. ו-(A) שונה מהותית בין הסוגים:

| | ריצה/אירובי | כוח |
|---|---|---|
| **מה צריך לרוץ ברקע** | GPS ממשיך לצבור מרחק/קצב | טיימר-מנוחה ממשיך לתקתק + כפתורי next/pause |
| **מנגנון ה-background (iOS)** | `location` mode — **ממילא נחוץ** למעקב-GPS-אמיתי במסך-כבוי, ומשאיר JS חי | `audio` mode + audio-cues (הביפים ב-3/2/1 כבר קיימים ב-[useWorkoutTimers.ts:140-146](../../src/features/workout-engine/players/strength/hooks/useWorkoutTimers.ts#L140-L146) → מצדיקים את המצב) |
| **מנגנון ה-background (Android)** | foreground service type `location` | foreground service type `health` |
| **מקור ה-state** | Zustand — pull-able | React-local — push-only (§2.1) |

**עיקרון ה-MVP:** להשאיר את ה-JS של האימון **חי** ברקע → כל ה-hooks הקיימים ממשיכים לתקתק ולדחוף state לכרטיס. **לא** לכתוב מחדש טיימרים/state בנייטיב. באנדרואיד ה-foreground service שומר את התהליך (וה-WebView) חי → מנגנון אחיד לשני הסוגים. ב-iOS צריך background mode פר-סוג (location לריצה, audio לכוח).

---

## 4. גישה מומלצת פר-פלטפורמה

### 4.1 Android — פשוט ובשל

**פלאגין:** `@capawesome-team/capacitor-android-foreground-service`. בשל, מתוחזק. תומך: `start/update/stop`, **כפתורי-פעולה בהתראה** (`id`+`title` → אירוע `buttonClicked` ל-JS), עדכון-התראה חי כשהמסך כבוי, ניהול הרשאות/ערוצים.

נותן MVP מלא לשני הסוגים במכה אחת: foreground service שומר JS חי → ה-hooks מתקתקים → דוחפים טקסט לכרטיס + כפתורים → הכפתורים קוראים לפעולות הקיימות מ-§2.2. **⚠️ תאימות גרסה:** הגרסה העדכנית דורשת Capacitor 8, והמאגר על Capacitor `^6.2.0` ([package.json:44](../../package.json#L44)) → או לנעוֹל גרסת Capawesome תואמת-Cap-6, או לשדרג Capacitor (מאמץ נפרד).

### 4.2 iOS — שתי גישות, ממליץ פאזה

| | **MediaSession / MPNowPlayingInfoCenter** | **Live Activities (ActivityKit)** |
|---|---|---|
| מה זה | כרטיס "Now Playing" בנעילה + play/pause/next | כרטיס עשיר + Dynamic Island |
| דרישת iOS | 15.6 (זמין היום) | 16.2+ (הפרויקט על deployment target **15.6** → חובה gating) |
| כמה בנוי | ✅ חצי-בנוי (web MediaSession §2.3) | ❌ net-new: target חדש של Widget Extension |
| עושר UI | טקסט מוגבל (title/subtitle/artwork) — קשה להראות reps/sets יפה | עשיר: reps, sets, טיימר-native חלק, פסי-התקדמות |
| כפתורים אינטראקטיביים | play/pause/next בלבד | Button/Toggle דרך App Intents (iOS 17+, `LiveActivityIntent` משותף app↔widget) |
| טיימר-מנוחה | מתעדכן מ-JS כל שנייה (בזמן ש-JS חי) | `Text(timerInterval:)` נייטיב — תקתוק חלק בלי JS |
| מגבלות | דורש `audio` mode + אודיו אמיתי; מתנגש עם מוזיקה של המשתמש; עלות סוללה של אודיו-רקע | 8ש' פעיל + 4ש' stale = 12ש' מקס; קצב עדכון מווסת ל-5–15ש' (iOS 18+); עד 5 בו-זמנית |
| פלאגינים 2026 | ה-web API הקיים; או native חדש | Capgo `capacitor-widget-kit` (production-ready, v8.1.9, **דוגמת workout Live Activity**), kisimediaDE, ludufre |

**המלצה:**
- **Phase 1:** הרחב את ה-MediaSession הקיים + הוסף `audio` background mode → נמוך-סיכון, מרבית הקוד קיים, זהה-מנגנון לכוח ולריצה. אמת מסך-כבוי על מכשיר.
- **Phase 2:** Live Activity נייטיב (Capgo) לכרטיס פרימיום + Dynamic Island + כפתורי App Intent, gated ל-16.2+, עם fallback ל-MediaSession במכשירים ישנים. מאמץ גדול יותר (target חדש, entitlements, provisioning, review).

---

## 5. סקיצת MVP פר-סוג-אימון

### 5.1 ריצה/אירובי
```
┌─────────────────────────────────┐
│ 🏃 OUT · Free Run               │
│ 12:34   ·   2.14 km             │  ← useSessionStore: totalDuration, totalDistance
│ 5:52 /km                        │  ← useRunningPlayer.currentPace
│  [ ⏸ Pause ]      [ ⏹ Stop ]    │  ← pauseSession() / finishWorkout()
└─────────────────────────────────┘
```
state pull-able ישירות (Zustand). Stop → `finishWorkout()` (single-save קיים).

### 5.2 כוח
```
┌─────────────────────────────────┐
│ 💪 Pull-ups                     │  ← sm.exerciseName
│ Set 2/4  ·  target 8 reps       │  ← currentRound/totalRounds, targetReps
│ Rest  0:45  ⏳                   │  ← useWorkoutTimers.restTimeLeft (או Text(timerInterval:) ב-Live Activity)
│  [ ⏸ ]   [ ⏭ Skip ]   [ ⏹ ]     │  ← togglePause() / skipRest() / onComplete()
└─────────────────────────────────┘
```
state **נדחף מתוך React** (לא נמשך — §2.1). ה-`usePlayerMediaSession` הקיים כבר עושה את הדחיפה הזו.

### 5.3 משותף מול שונה

| | משותף | שונה |
|---|---|---|
| **מנגנון** | פעולות pause/stop קיימות; דפוס גשר health-bridge; Android FGS זהה | ריצה = pull מ-Zustand; כוח = push מ-React |
| **background mode (iOS)** | — | ריצה=`location` · כוח=`audio` |
| **כפתורים** | pause, stop | כוח מוסיף `next/skip` |
| **תוכן** | זמן חולף | ריצה=מרחק/קצב · כוח=תרגיל/סט/מנוחה |

**הייבריד:** מחוץ ל-MVP (Phase 3). כבר מתזמר run↔strength דרך `useSessionStore` + `useHybridRun` ([useHybridRun.ts:94-148](../../src/features/workout-engine/hybrid/useHybridRun.ts#L94-L148)) — יירש מהשניים.

---

## 6. שינויי-native נדרשים

### iOS ([Info.plist](../../ios/App/App/Info.plist), 2 קבצי entitlements)
- **Phase 1:** הוסף `audio` (כוח) ו-`location` (ריצה) ל-`UIBackgroundModes`. `NSMotionUsageDescription` חסר — הוסף אם משתמשים בתנועה. אין שינוי target/entitlement נדרש ל-MediaSession.
- **Phase 2 (Live Activity):** target חדש של **Widget Extension** (היום יש target אפליקציה יחיד — [project.pbxproj:111](../../ios/App/App.xcodeproj/project.pbxproj#L111)); `NSSupportsLiveActivities=true`; push-to-start entitlement ל-**שני** קבצי ה-entitlements ([App.entitlements](../../ios/App/App/App.entitlements), [AppRelease.entitlements](../../ios/App/App/AppRelease.entitlements)); gating מ-16.2+ (deployment target = 15.6).
- קוד נייטיב חדש תחת `plugins/…/ios/Plugin/*.swift`, רשום ב-[Podfile](../../ios/App/Podfile) — כדפוס health-bridge.

### Android ([AndroidManifest.xml](../../android/app/src/main/AndroidManifest.xml), targetSdk 35)
- הוסף `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_HEALTH`/`FOREGROUND_SERVICE_LOCATION` + `WAKE_LOCK`.
- הצהר `<service android:foregroundServiceType="…">` + `<receiver>` לכפתורים (אין שום `<service>` היום). targetSdk 35 הופך `foregroundServiceType` ל-**חובה**.
- דפוס mirror: manifest של הפלאגין **וגם** manifest של האפליקציה (כמו health-bridge, [הערה AndroidManifest.xml:96-104](../../android/app/src/main/AndroidManifest.xml#L96-L104)).

### דפלוי / מחזור-שחרור — הבהרה מלאה
זה **native, לא Vercel.** שינוי web-בלבד (MediaSession) → `deploy` (Vercel) בלבד, בלי binary חדש ([package.json:14-17](../../package.json#L14-L17)). אבל **כל שינוי בקוד/קונפיג נייטיב** (background modes, FGS, פלאגין) → `npx cap sync` + **binary חדש**: iOS דרך Xcode Archive → TestFlight/App Store (review ~1–3 ימים), Android דרך Gradle `assembleRelease` עם ה-signing הקיים ([build.gradle:5-9](../../android/app/build.gradle#L5-L9)). **אין fastlane/EAS/CI לנייטיב** — בנייה ידנית מקומית (יש `preflight` guards ב-[package.json:30-31](../../package.json#L30-L31)). קונפיג-הרקע וההרשאות לא ניתנים ל-hot-fix דרך Vercel.

---

## 7. סיכונים

1. **🔴 הפרמיסה — ריצת-רקע לא קיימת.** prerequisite לבנייה, לא "הוספה קטנה". כיבוי-מסך היום = מוות-אימון. הופך את ה-spike מ"כרטיס UI" ל"פרויקט ריצת-רקע".
2. **🔴 state של כוח React-local, לא ב-store** (§2.1) — גשר נייטיב שמושך לא יראה reps/sets/מנוחה. פתרון: להישען על הדחיפה-מתוך-React הקיימת (המלצת MVP), או refactor של `useWorkoutStateMachine` ל-Zustand (גדול).
3. **🟠 App Store — `audio` background mode לשמירת-חיות** נבדק ע"י Apple; מוצדק רק אם יש אודיו אמיתי. הביפים של טיימר-המנוחה כבר קיימים ומצדיקים זאת — אבל תעד ובדוק מול guidelines. `location` mode לריצה מוצדק מובן-מאליו.
4. **🟠 צימוד דפלוי (server.url).** ה-web מתעדכן לכולם מיידית, אבל הפלאגין הנייטיב קיים רק ב-binaries מעודכנים → **חובה feature-detection** (`Capacitor.isPluginAvailable` / try-catch) לפני קריאה, אחרת crash למשתמשי-אפליקציה-ישנה.
5. **🟠 ה-MediaSession הקיים כנראה לא שורד מסך-כבוי ב-iOS** בלי `audio` mode — אמת על מכשיר, אל תניח שעובד.
6. **🟡 תאימות פלאגין Capawesome** דורש Capacitor 8 מול Cap 6 בפרויקט — נעל גרסה תואמת או שדרג.
7. **🟡 Android 14/15 (targetSdk 35):** `foregroundServiceType` חובה; מגבלות launch-מרקע (לא רלוונטי — מתחילים באימון-פעיל-בחזית); התראת-FGS ניתנת-להחלקה (Android 14).
8. **🟡 GPS כפול (ריצה):** אל תפתח watcher שני — קרא מ-`useGPSStore` ([useGPSStore.ts:8-11](../../src/features/parks/core/hooks/useGPSStore.ts#L8-L11)). מעבר ל-`location` background mode ישנה התנהגות CLLocationManager — אמת דיוק/סוללה.
9. **🟡 כפתורי Live Activity רצים ב-extension process** בזמן ש-JS מושהה → סנכרון בחזרה ל-JS מורכב (App Group + reconcile ב-resume). ב-MVP עדיף שהכפתורים ינהגו את ה-JS-החי, לא לוגיקה נייטיב עצמאית.

---

## 8. הנחות שהנחתי (מפורש)

- **A1:** "שליטה + מבט ממסך-נעילה" כולל **להשאיר את האימון רץ** במסך-כבוי (אחרת אין state חי לכרטיס). לכן ריצת-רקע בסקופ. אם רוצים רק כרטיס בזמן שהמסך נשאר דלוק — הסקופ מתכווץ דרמטית, אבל זה מנטרל את מטרת החום/סוללה.
- **A2:** "שליטה" = pause/stop (ריצה) + pause/stop/next (כוח). **לא** קלט-נתונים (רישום חזרות) ממסך-הנעילה.
- **A3:** iOS deployment target נשאר 15.6; Live Activities gated ל-16.2+ עם fallback ל-MediaSession.
- **A4:** שימוש-חוזר בפעולות הקיימות (§2.2) — אפס לוגיקת-סשן חדשה.
- **A5:** הביפים הקיימים מצדיקים `audio` mode לכוח; ריצה = `location` mode. (לאמת מול Apple review — סיכון §3.)
- **A6:** הייבריד מחוץ ל-MVP (Phase 3).
- **A7:** אפס חיווט XP/billing חדש — spike קריאה-בלבד, ובכל מקרה 🔒 גייט ה-hybrid: לא לגעת ב-XP עד single-save.
- **A8:** הערכות-המאמץ למטה גסות, לתעדוף בלבד — לא התחייבות.

---

## 9. המלצת המשך (phased) + מאמץ גס

| שלב | תוכן | מאמץ גס |
|---|---|---|
| **0 — אימות** | על מכשיר: (1) האם ריצה שורדת מסך-כבוי היום? (2) האם ה-MediaSession של כוח שורד מסך-כבוי ב-iOS? | ~חצי יום |
| **1a — Android MVP** | Capawesome FGS + כפתורים, שני הסוגים | ~2–4 ימים |
| **1b — iOS MVP** | הרחבת MediaSession + `audio`/`location` modes + feature-detect + אימות מסך-כבוי | ~2–4 ימים |
| **2 — iOS פוליש** | Live Activity נייטיב (Capgo widget-kit): target חדש, App Intents, entitlements, review | ~1–2 שבועות |
| **3 — הייבריד** | ירושה מ-1+2 דרך `useHybridRun` | אחרי 1–2 |

**נקודת-הפתיחה הכי חכמה:** שלב 0 (אימות) — מאשש/מפריך את הפרמיסה ואת מצב ה-MediaSession הקיים, ומזה נגזר כמה מהמאמץ הוא "תיקון ריצת-רקע" מול "כרטיס UI".

---

## מקורות (מחקר פלאגינים 2026)
- Capawesome Android Foreground Service — github.com/capawesome-team/capacitor-android-foreground-service
- Capgo capacitor-widget-kit (workout Live Activity) — github.com/Cap-go/capacitor-widget-kit · kisimediaDE/capacitor-live-activity · ludufre/capacitor-live-activities
- Apple — Adding interactivity to widgets and Live Activities (App Intents); Live Activities HIG
- Android — Foreground service types required (14+); Foreground service types (`health`)
- Apple — MPNowPlayingInfoCenter; MPRemoteCommandCenter (WWDC22)
