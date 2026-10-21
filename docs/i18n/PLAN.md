# תוכנית לוקליזציה (i18n) לאפליקציית OUT

> סטטוס: **תוכנית בלבד, לא מומש דבר.** נכתב 21.10.2026 מתוך `origin/main` @ `af4a580c`.
> כל המספרים נמדדו על הקוד (סקריפט ספירה, ללא קבצי טסט וללא הערות קוד). אין קריאות/כתיבות לפרודקשן.
> שפה: פרוזה בעברית לדוד, שמות טכניים באנגלית.

---

## 0. החלטות שכבר התקבלו (דוד, 21.10.2026)

1. **שפות:** אנגלית ראשונה. היא זו שבונה את התשתית ואת פריסת ה-LTR. אחריה **רוסית וגרמנית**, ועוד שפות בהמשך.
   כל התשתית מתוכננת כך שכל שפה אחרי אנגלית היא **בעיקר תוכן**: קבצי תרגום, שדות תוכן ב-Firestore ודף החנות.
   הערכה נפרדת ל"הוספת שפה אחת אחרי אנגלית" מופיעה ב-§4.3.
2. **סדר עבודה:** באגי העיצוב הפתוחים במסכים (פריסה בטלפונים קטנים, ניווט אחורה, תקלות ב-onboarding, תזמון אנימציות) מתוקנים **לפני** גלי ה-i18n שנוגעים בפריסה / RTL-LTR.
   לכן יש **גל 0: תיקוני עיצוב בעברית** (placeholder שמוזן מהרשימה של דוד), והוא ראשון.
   גלי ה-i18n מסודרים כך ש**חילוץ מחרוזות טהור (בלי שינוי ויזואלי) יכול לרוץ במקביל לגל 0**, וכל מה שמשנה פריסה מחכה לסיום גל 0.

---

## 1. מצאי (Inventory)

### 1.1 מחרוזות עבריות בקוד, לפי אזור

נספרו: מחרוזות literal (`'…'`, `"…"`, `` `…` ``) וטקסט JSX שמכילים עברית, בקבצי `.ts/.tsx`.
לא נספרו: טסטים, הערות קוד. (ההערכה בבריף, ~1,630 קבצים / ~23.5k מחרוזות / ~64k מילים, כנראה כללה טסטים והערות. הספירה כאן מחמירה יותר.)

| אזור | נתיבים עיקריים | קבצים | מחרוזות | מילים | הקבצים הכבדים |
|---|---|---:|---:|---:|---|
| Onboarding | `src/features/user/onboarding`, `src/app/onboarding*`, `gateway`, `intro`, `join` | 120 | 2,069 | 9,426 | `steps/UnifiedLocation/location-utils.ts` (236), `visual-assessment/BlurredWhyStep.tsx` (95), `steps/ScheduleStep.tsx` (73) |
| Social / arena / ליגות / challenge | `src/features/{social,arena,challenge,messages}`, `src/app/{arena,community,feed,chat,league,challenge,booth}` | 147 | 1,682 | 4,276 | `app/arena/create/page.tsx` (136), `messages/services/MessageService.ts` (94), `arena/components/NeighborhoodLeaderboard.tsx` (66) |
| Players + summary | `workout-engine/{players,summary,components}`, `app/{run,session,active-workout-ui}` | 211 | 1,657 | 3,345 | `players/strength/timed/logic/timed-labels.ts` (53), `summary/components/aerobic/AerobicSummaryView.tsx` (45) |
| Library / תוכן / חיפוש | `src/features/{content,search,workouts}`, `app/{library,search,workouts}` | 85 | 1,482 | 3,226 | `content/branding/core/branding.utils.ts` (524, מפענח תגיות CMS), `search/legacy/LegacySearchPage.tsx` (68) |
| מפה / פארקים / ריצה חופשית | `src/features/{parks,safecity,heatmap,weather,navigation}`, `app/map` | 137 | 1,413 | 3,185 | `parks/core/components/FreeRunDrawer.tsx` (111), `route-preview/RouteDetailSheet.tsx` (75) |
| Home | `src/features/home`, `src/app/home` | 78 | 1,276 | 3,056 | `home/components/SettingsModal.tsx` (210), `WorkoutBuilderSheet.tsx` (90) |
| מחוללי אימון/מסלול (טקסט שנוצר בקוד) | `workout-engine/{services,core,logic,hybrid,shared,engines}` | 92 | 1,226 | 3,247 | `shared/utils/gear-mapping.utils.ts` (265), `services/workout-metadata.service.ts` (129), `services/coach-note.ts` (122), `logic/WorkoutGenerator.ts` (58) |
| פרופיל / התקדמות / הגדרות | `src/features/{profile,user/*,progression-hub,progression-map,activity}` | 96 | 1,182 | 2,221 | `activity/components/StepsAnalyticsView.tsx` (69), `user/progression/config/achievement-definitions.ts` (60) |
| Kelly (מאמן AI) | `src/lib/ai`, `src/features/ai-coach`, `src/app/ai-coach` | 59 | 1,110 | 4,390 | `lib/ai/coach/intent.ts` (203, תבניות זיהוי כוונה בעברית), `coach/app-help/entries.ts` (148), `coach/gender-voice.ts` (57) |
| לו"ז / תוכנית | `src/features/schedule` | 30 | 457 | 1,847 | `engine/reasons.ts` (53), `engine-v2/reasonsV2.ts` (51) |
| פושים (קטלוג, צד לקוח/פאנל) | `src/features/notifications/push-library` | 2 | 454 | 1,939 | `push-library.core.ts` (445 ברירות מחדל) |
| משפטי / עזרה / סטטי | `src/features/{legal,help}`, `app/{privacy,accessibility,delete-data,public}`, `src/lib/app-help` | 11 | 387 | 3,409 | `legal/legal-content.ts` (217) |
| API routes (לא admin) | `src/app/api/**` | 43 | 98 | 321 | `api/authority-manager/*` (שגיאות/סיכומים) |
| Cloud Functions | `functions/src` | 19 | 594 | 2,415 | `shared/push-library.core.ts` (445, **מראה** של הקטלוג), `demo-life/phrase-bank.ts` (57) |
| משותף (components/lib/hooks/store) | שאר `src/` | 121 | 4,129 | 8,762 | `lib/data/israel-locations.ts` (**2,926 — שמות יישובים, דאטה**), `lib/i18n/dictionaries.ts` (153) |
| ורטיקלים (readiness צבאי / wedding / partners) | `src/features/{readiness,wedding,partners}` | 35 | 2,470 | 6,233 | `wedding/data/venueCatalog.ts` (1,488, דאטה) |
| **סה"כ משתמש (בלי admin)** | | **1,267** | **21,092** | **58,883** | |
| **Admin** (`src/app/admin`, `src/features/admin`, `**/admin/**`, `authority-portal`) | | **413** | **13,817** | **39,488** | `admin/workout-settings/page.tsx` (561), `admin/users/[uid]/page.tsx` (377) |

**הליבה שבאמת צריך לתרגם** (בלי דאטה של יישובים, בלי ורטיקלי wedding/readiness, בלי המראה הכפול של הפושים ב-functions): כ-**15,250 מחרוזות / כ-44k מילים**.

### 1.2 טקסט ממוגדר (זכר/נקבה)

| דפוס | היקף | איפה |
|---|---|---|
| `isFemale ? … : …` | 162 מופעים ב-30 קבצים | פזור ב-UI |
| השוואה `=== 'female'` לבחירת טקסט | 88 קבצים | פזור |
| צורות לוכסן (`את/ה`, `מוכן/ה`) | ~395 מופעים | בעיקר admin ותבניות |
| תגיות CMS `@את/ה`, `@מוכן/ה`, `@שם`, `@שעה` | מפענח אחד | `src/features/content/branding/core/branding.utils.ts` (`resolveNotificationText`, `resolveDescription`, `resolveContentTags`) |
| `GenderedText {male,female}` | תוכן תרגילים | `src/features/content/exercises/core/exercise.types.ts:26` |
| `MultilingualText = Record<lang,{neutral,female?}>` | שאלון onboarding | `src/types/onboarding-questionnaire.ts:14` |
| שורות פוש ממוגדרות (`gender`, `subjectGender`, `pairId`) | ספריית הפושים | `push-library.core.ts` |
| Kelly מדבר בלשון זכר, פונה לפי `core.gender` | פרומפט + guard | `src/lib/ai/coach/persona.ts`, `gender-voice.ts` |
| פונקציות ממגדרות נקודתיות | `getGenderedCtaText` (`home/components/HeroWorkoutCard.tsx:386`), `genderize` (`location-utils.ts:872`), `copyGenderOf` (`budget-light/copy.ts:45`), `resolveGenderedText` (`exercises/utils/cue-text.utils.ts:139`) | |

### 1.3 כיווניות (RTL) ופורמטים

| מדד | ערך | משמעות |
|---|---:|---|
| `dir="rtl"` קשיח ב-JSX | **1,161 מופעים ב-680 קבצים** (186 ב-admin) | החסם הגדול ל-LTR. רוב העבודה בגל 4. מובילים: onboarding (58 קבצים), players (57), home (52), arena (42) |
| `<html lang="he" dir="rtl">` | `src/app/layout.tsx:34` | נקודת השליטה הגלובלית |
| מחלקות Tailwind פיזיות (`ml/mr/pl/pr/left/right/text-left/text-right/rounded-l…`) | ~4,109 | צריכות להפוך ללוגיות (`ms/me/ps/pe/start/end/text-start…`). Tailwind 3.4.1 תומך |
| מחלקות לוגיות קיימות | ~478 | |
| וריאנטים `rtl:`/`ltr:` | 10 בלבד | |
| `ChevronLeft/Right`, `ArrowLeft/Right` | 424 | אייקונים שצריכים להתהפך |
| `'he-IL'` קשיח | 259 מופעים ב-140 קבצים | תאריכים/מספרים |
| `toLocale*String(` | 321 | |
| `Asia/Jerusalem` | 53 קבצים | אזור זמן (לא חלק מתוכנית השפה, ראה החלטה 7) |
| TTS בעברית | `workout-engine/core/services/AudioService.ts`, `audio-guidance.service.ts` | הנחיות קוליות בנגן, צריך `lang` לפי שפה |
| תוויות מפה `name_he` | `summary/components/running/RunMapBlock.tsx:90` + 4 מסכי admin | Mapbox `text-field` |

### 1.4 שאריות i18n שכבר קיימות (חשוב: לאחד, לא לבנות לידן)

- `src/lib/i18n/dictionaries.ts`: מילון he/en עם ~190 מפתחות, `getTranslation()`. בשימוש ב-10 קבצים (רכיבי onboarding ישנים, `app/challenge/[inviteCode]/done`).
- `src/lib/i18n/onboarding-locales.ts`: he/en/**ru**, `getOnboardingLocale()`. בשימוש ב-9 קבצים (`OnboardingWizard`, steps).
- `src/hooks/useTranslation.ts` → `useLanguage()` מתוך `src/contexts/LanguageContext.tsx`. **זה React Context**, בניגוד ל-axioms §7 ("Zustand only, no new React Contexts"). הוא מכוון `dir`/`lang` על `<html>` לפי `useAppStore`.
- `src/store/useAppStore.ts`: `language: 'he'|'en'`, נשמר ב-`localStorage('out-app-storage')`. זה **לא** עומד ב-axioms §19 (דגל עמיד ב-native צריך לעבור דרך `onboardingPrefs.ts`).
- `onboarding_language` נקרא מ-`sessionStorage` ב-`OnboardingLayout.tsx:104` ומוזכר ב-`src/lib/onboardingPrefs.ts:24`.
- **שלושה טיפוסי שפה שונים:** `'he'|'en'` (store), `'he'|'en'|'es'` (`features/content/shared/localized-text.types.ts:6`), `'he'|'en'|'ru'` (onboarding). צריך לאחד לטיפוס `Locale` אחד.
- עורך התרגילים כבר תומך בטאבים של שפה (`activeLang` ב-`src/features/content/exercises/admin/ExerciseEditorForm.tsx:124`). יש גם `BulkTranslationDialog.tsx`: ייצוא JSON, תרגום ידני ב-Gemini/Claude, ייבוא שכותב רק את משבצות ה-EN (`services/exercise-translation.utils.ts`).

### 1.5 טקסט שנוצר בצד השרת

| מקור | קבצים | הערה |
|---|---|---|
| פושים | `functions/src/sendPushFromQueue.ts` (title/body מוכנים מראש ב-`push_messages`), `functions/src/services/notification-content.service.ts`, `push-copy.service.ts`, schedulers (`trainingReminderScheduler`, `stepGoalNudgeScheduler`, `retentionScheduler`, `onboardingDropoffDispatcher`, `onKudosCreated`, `onLevelUp`, `chatMessageNotification`…) | הספרייה: `workoutMetadata/notifications/notifications` (`PUSH_LIBRARY_COLLECTION`). מסמך לכל וריאנט. ברירות המחדל בקוד: `push-library.core.ts` (445 מחרוזות). מגבלות: כותרת עד 40 תווים, גוף עד 90 (`PUSH_TITLE_MAX`/`PUSH_BODY_MAX`). שמות המשתנים עבריים (`@שם`, `@שעה`) |
| Kelly | `src/lib/ai/coach/persona.ts` (`COACH_SYSTEM_PROMPT`: "Always answer in Hebrew only"), `reply-guards.ts` (מסיר מילים לועזיות), `turn-engine.ts:357` (`dropHebrewlessSentences`), `intent.ts` (203 תבניות עבריות לקלט המשתמש), `proactive/templates.ts`, `app-help/entries.ts`, `src/lib/ai/review/{checks,prechecks}.ts`, `functions/src/kellyProactiveScheduler.ts` | Kelly **נעול לעברית בשלוש שכבות**: פרומפט, guard ובודק ה-review |
| כותרות ותיאורי אימון | `workout-engine/services/workout-metadata.service.ts` (1,877 שורות), `coach-note.ts`, `trio-labels.service.ts`, `messageService.ts`, `contentFragmentService.ts`, `contentService.ts`, `running-metadata.service.ts` | חלק מהטקסט נשלף משורות ב-Firestore, וחלק בנוי בקוד. כותרות נשמרות בהיסטוריית האימונים |
| נימוקי לו"ז | `schedule/engine/reasons.ts`, `engine-v2/reasonsV2.ts` | |
| API routes | 43 קבצים / 98 מחרוזות | בעיקר הודעות שגיאה. יש להחזיר קודי שגיאה ולתרגם בלקוח |
| מיילים | אין מיילים טרנזקציוניים למשתמשי קצה בקוד (Gmail משמש רק ל-CRM/finance ב-admin) | תבניות המייל של Firebase Auth (אימות/איפוס) מוגדרות בקונסול, לבדוק שפה שם |

### 1.6 אוספי Firestore עם טקסט שמוצג למשתמש, ואיפה עורכים אותם בפאנל

| אוסף | מבנה טקסט היום | עריכה בפאנל |
|---|---|---|
| `exercises` (~370) | `name: LocalizedText {he,en}`, `description`/`instructions: LocalizedText`, `execution_methods[].methodName/specificCues/highlights: LocalizedText`, `notificationText` (string / Gendered / Localized), `notes/highlights: string[]` (legacy) | `/admin/exercises` (העורך, כבר עם `activeLang`) + `BulkTranslationDialog` |
| `programs`, `levels`, `programLevelSettings` | `name: string`, `description?: string` (`content/programs/core/program.types.ts:21,41`) | `/admin/programs`, `/admin/levels` |
| `gear_definitions` | `name/description: {he,en}` | `/admin/gear-definitions` |
| `gym_equipment`, `outdoorBrands` | `name: string` (שמות מותג, לא לתרגם) | `/admin/gym-equipment`, `/admin/brands` |
| ספריית פושים `workoutMetadata/notifications/notifications` | `title/body: string` לכל שורה + gender | `/admin/notifications` (library) |
| `workoutMetadata` (כותרות/תיאורים/phrases), `workout_titles_creative`, `workout_funny_titles`, `workout_content_fragments`, `workout_focus_fragments`, `focus_descriptions`, `workout_time_contexts` | `string` | `/admin/workout-settings` (+ `bulk`, `status`), `/admin/content-messages` |
| `onboarding_questions` / `onboarding_answers` | `MultilingualText` (כבר רב-לשוני: he/en/ru) | `/admin/questionnaire`, `/admin/running/import/decision-tree` |
| `visual_assessment_content` | string | `/admin/visual-assessment` |
| `smart_messages` | string + `targetGender` | `features/messages/services/MessageService.ts` |
| `pressure_messages` (תבניות) | string | `/admin/pressure-messages` |
| `achievements` | string | seed (`src/scripts/seedAchievements.ts`) + `achievement-definitions.ts` |
| `site_content` (FAQ / מאמרים / עזרה, חדש ב-#514) | `title: string`, `body: ArticleBlock[]` | `/admin/content` |
| `parks`, `curated_routes`, `official_routes` | שמות (שמות פרטיים) + תיאורים | `/admin/locations`, `/admin/routes`, `/admin/parks` |
| `community_events`, `feed_posts`, צ'אט | תוכן משתמשים | **לא מתרגמים** |

**וידאו:** סרטוני התרגילים יושבים ב-Bunny Stream (`src/lib/bunny/bunny.config.ts`). הקריינות בעברית. אין היום כתוביות (אין `<track>`/VTT בקוד).

---

## 2. ארכיטקטורה מומלצת

### 2.1 ספרייה: שכבה דקה משלנו מעל `intl-messageformat` (FormatJS / ICU), לא next-intl

**ההמלצה:** מודול `src/lib/i18n/core/` (טהור, בלי React ובלי Firebase) שמשתמש ב-`intl-messageformat`, המנוע שמאחורי react-intl ו-next-intl. מעליו:
- `useT(namespace)`: hook שנרשם ל-store של Zustand (`useLocaleStore`).
- `getT(locale, namespace)`: לשרת, ל-API routes ול-Cloud Functions.

**למה לא next-intl:**
1. היא נשענת על `NextIntlClientProvider`, כלומר React Context. זה מתנגש ב-axioms §7. השכבה שלנו גם **מבטלת** את `LanguageContext` הקיים, כך שמספר ה-Contexts יורד.
2. 1,554 קבצי `'use client'`. רק 5 דפי שרת לא-admin מכילים עברית (`privacy`, `accessibility`, `delete-data`, `workouts/[id]`, `public/wedding/layout`). היתרון של next-intl ב-Server Components כמעט לא רלוונטי כאן.
3. next-intl לא רצה ב-Cloud Functions. פושים ו-Kelly-proactive צריכים את **אותו** מנוע ואת אותם קטלוגים. הפתרון: אותו דפוס mirror כמו `push-library.core.ts` (`functions/scripts/vendor-copy-geo-discovery.js` + טסט שמוודא שהעותקים לא נפרדו).
4. ניתוב לפי locale בכתובת (`/en/...`) לא רצוי. ה-native טוען `server.url` מרוחק (`capacitor.config.ts:20-22`), יש deep links, ו-`src/middleware.ts` כבר מורכב (606 שורות). השפה היא הגדרת משתמש, לא חלק מה-URL.
5. פורמט ההודעות ICU זהה, כך שאם נרצה בעתיד לעבור ל-next-intl/react-intl, הקטלוגים עוברים כמו שהם.

**i18next** נשקל ונדחה: כבד יותר, ICU דורש plugin, ו-react-i18next גם הוא מבוסס Context.

**מבנה קטלוגים:** `src/messages/{locale}/{namespace}.json`. namespaces לפי האזורים ב-§1.1 (`onboarding`, `home`, `map`, `player`, `summary`, `library`, `profile`, `social`, `schedule`, `push`, `coach`, `legal`, `common`, `errors`). הטעינה עצלה (`await import()`) לכל namespace. עברית נטענת סינכרונית, כדי שאין הבהוב כשהדגל כבוי. טיפוס המפתחות נגזר מקטלוג ה-he (type-safe keys).

### 2.2 זיהוי שפה, הגדרת משתמש ואחסון

- טיפוס אחד: `src/lib/i18n/locales.ts` → `type Locale = 'he' | 'en' | 'ru' | 'de'`, `RTL_LOCALES = ['he']` (ובעתיד `ar`). כל שלושת הטיפוסים הקיימים יהיו re-export שלו.
- **סדר הקדימות** (רק כשהדגל `enable_i18n` דלוק. כבוי = תמיד `he`):
  1. `users/{uid}.core.locale`: מקור האמת, ונקרא גם ע"י השרת (פושים, Kelly). זה שדה חדש שהלקוח כותב. `noTenantFieldsChanged()` ב-`firestore.rules:353` לא חוסם אותו, ולכן **אין צורך בשינוי חוקים**. צריך לאמת זאת ב-dry-run לפי axioms §30 אם בכל זאת יידרש שינוי.
  2. `getOnboardingPrefAsync('app_locale')` דרך `src/lib/onboardingPrefs.ts` (axioms §19: שורד סגירה קשה ב-iOS). המפתח מחליף את `onboarding_language` ואת `localStorage('out-app-storage')`.
  3. שפת המכשיר: `@capacitor/device` `getLanguageCode()` ב-**dynamic import** (axioms §4), או `navigator.languages` ב-web. מסוננת ברשימת השפות המותרות.
  4. ברירת מחדל `he`.
- **cookie `out_locale`** כדי ש-`src/app/layout.tsx` (server component) ירנדר `lang`/`dir` נכונים כבר ב-HTML הראשון, בלי הבהוב. כשהדגל כבוי הלקוח מוחק את ה-cookie, כך שמשתמש עברי לא מושפע.
- בורר שפה ב-`src/features/home/components/SettingsModal.tsx` (מסך "כללי"). מופיע רק כשהדגל דלוק.

### 2.3 החלפת RTL/LTR

- `dir` נקבע **רק** על `<html>` (מ-cookie/store). מוחקים את 1,161 ה-`dir="rtl"` הקשיחים ב-codemod, והאלמנטים יורשים את הכיוון.
  חריגים מוצהרים: תוכן שתמיד עברי (ורטיקל readiness/wedding, admin) מקבל `dir="rtl"` מפורש בשורש שלו, לא בכל רכיב.
- מחלקות פיזיות → לוגיות ב-codemod: `ml-→ms-`, `mr-→me-`, `pl-→ps-`, `pr-→pe-`, `left-→start-`, `right-→end-`, `text-left/right→text-start/end`, `rounded-l/r→rounded-s/e`, `border-l/r→border-s/e`, `space-x-reverse` (בדיקה ידנית).
  כש-`dir=rtl`, מחלקה לוגית נותנת **בדיוק** את אותו מיקום פיזי, כך שבעברית שום פיקסל לא זז. מיקום מוחלט על המפה (overlay, FAB) מסווג ידנית: חלקו פיזי בכוונה.
- אייקונים: רכיב `DirIcon` (או `className="rtl:-scale-x-100"` אחיד) עבור 424 החצים והשברונים. **לא** הופכים: play/pause, שעון, גרפים עם ציר זמן, המפה עצמה.
- מחוות וקרוסלות: סימן ה-`x` בגרירות framer-motion, כיוון swipe לניווט אחורה, ופסי התקדמות. רשימה ידנית לכל אזור בגל 4.
- תוויות מפה: `['coalesce', ['get', 'name_' + locale], ['get', 'name']]` במקום `name_he` (`RunMapBlock.tsx:90`).

### 2.4 טקסט ממוגדר

- **בקוד:** ICU `select`. לדוגמה `{gender, select, female {מוכנה?} male {מוכן?} other {מוכנים?}}`. ה-codemod ממיר טרנריים `isFemale ? 'א' : 'ב'` ל-select. הטרנריים שהוא לא מזהה נכנסים לדוח "ידני".
- **כלל:** כל הודעה שפונה למשתמש מקבלת `gender` תמיד, גם בשפות שבהן הערך לא משנה. המתרגם יכול לכווץ את ה-select לענף אחד באנגלית. ברוסית צריך אותו (זמן עבר: `готов/готова`, `сделал/сделала`). בגרמנית פונים ב-`du` ומתחמקים משמות עצם ממוגדרים.
- **בתוכן Firestore:** טיפוס אחד, `LocalizedGendered = Partial<Record<Locale, string | { male: string; female: string; other?: string }>>`. הוא בולע את `GenderedText` הישן (string ⇒ `he`) ואת `MultilingualText` של השאלון (`neutral` ⇒ `other`).
  פונקציה אחת `pickText(value, locale, gender)` עם שרשרת fallback: `locale+gender → locale ניטרלי → en → he+gender → he`. ל-`he` אין fallback, כי זה המקור.
- **תגיות CMS** (`@את/ה`, `@שם`, `@שעה` ב-`branding.utils.ts` ובפושים): לשמור מאחורי הקלעים **מפתחות משתנים ניטרליים** (`{name}`, `{time}`). התגית העברית נשארת כ-alias לתצוגה בעורך העברי בלבד. את `@את/ה` מחליפים ב-select.

### 2.5 מספרים, תאריכים, יחידות

- מודול `src/lib/i18n/core/fmt.ts`: `formatNumber`, `formatDate`, `formatTime`, `formatRelative`, `formatDuration`, `formatDistance`, `formatPace`, `weekdayName`. כולם על `Intl.*` עם ה-locale הנוכחי.
  259 ה-`'he-IL'` וה-321 קריאות `toLocale*` עוברים אליו. בעברית הפלט זהה ל-`he-IL` היום, ולכן byte-identical.
- יחידות: מטרי בכל השפות (ראו החלטה 6).
- תחילת שבוע: היום ראשון. לוגיקת הלו"ז (`weekStartScheduler`, `schedule/`) נשארת על ראשון. רק סדר התצוגה יכול להיות לפי locale (ראו החלטה 7).

### 2.6 טקסט בצד השרת לפי שפת המשתמש

- **פושים:** כל שורה בספרייה מקבלת שדה `locale` (ברירת מחדל `he`, כך ששורות קיימות לא משתנות). הבחירה ב-`push-library.core.ts`:
  `locale מדויק + gender → locale ‘both’ → ברירות מחדל בקוד לאותו locale (מקטלוג push/{locale}.json) → he`.
  השולחים קוראים `core.locale` לצד `core.gender` שהם כבר קוראים. `PUSH_TITLE_MAX`/`PUSH_BODY_MAX` נבדקים לכל locale (גרמנית ארוכה בכ-30%).
- **Kelly:**
  - `COACH_SYSTEM_PROMPT` לפי locale. השורה "Always answer in Hebrew only" הופכת ל-`Always answer in {languageName} only`.
  - `reply-guards.ts`/`findForeignWords`/`dropHebrewlessSentences` הופכים ל-locale-aware ("מילים שלא בכתב של השפה").
  - `gender-voice.ts` חל רק על `he` (וגרסה רוסית לזמן עבר בגוף ראשון, `я проверил`).
  - `intent.ts`: התבניות העבריות נשארות ל-he. בשפות אחרות זיהוי הכוונה עובר למודל (כבר יש tool-routing בפרומפט), או לתבניות מתורגמות בהמשך.
  - בודקי ה-review (`src/lib/ai/review/checks.ts`) מקבלים את ה-locale.
- **כותרות אימון:**
  - שורות `workoutMetadata`/`workout_titles_creative`/fragments מקבלות `locale` כמו פושים.
  - טקסט שנבנה בקוד (`coach-note.ts`, `trio-labels.service.ts`, `gear-mapping.utils.ts`) עובר לקטלוג.
  - בהיסטוריה: שומרים מעכשיו `titleKey + params` לצד `title`, כדי שאפשר יהיה לרנדר מחדש. אימונים ישנים נשארים בעברית (החלטה 10).
- **API routes:** מחזירים `{ code: 'UNIT_NOT_FOUND' }` במקום הודעה עברית, והלקוח מתרגם דרך namespace `errors`.

### 2.7 מודל תוכן ב-Firestore + טאבים בפאנל

- **בלי מיגרציה לעברית.** `pickText` קורא string ישן כ-`{he: value}`. כתיבה חדשה מוסיפה מפתחות שפה. הנתונים העבריים הקיימים לא נוגעים בהם, וזה עומד ב-"Hebrew byte-identical".
- שדות `string` ב-`programs`/`levels`/`site_content`/`visual_assessment_content`/`pressure_messages` מורחבים ל-`string | LocalizedGendered`. ה-zod/טיפוסים מתעדכנים, וכל הקוראים עוברים דרך `pickText`.
- **פאנל:** רכיב משותף `LocaleTabs` + `LocalizedField` (הכללה של `GenderedTextInput.tsx`), כלומר טאבים he/en/ru/de עם תג "חסר"/"מכונה"/"נבדק". נכנס ל:
  - `/admin/exercises`: כבר קיים `activeLang`. מרחיבים מ-he/en לכל ה-locales.
  - `/admin/programs`, `/admin/levels`, `/admin/notifications` (ספרייה: עמודת locale + "שכפל לשפה"), `/admin/workout-settings`, `/admin/content-messages`, `/admin/content`, `/admin/visual-assessment`, `/admin/pressure-messages`, `/admin/gear-definitions`, `/admin/questionnaire` (כבר רב-לשוני).
- **עורך התרגילים:** לפי `.claude/rules/exercise-editor-conventions.md`, ניקוי תרגום שולח `''` בתוך המפה (או `null` לשדה בודד), **אף פעם לא `undefined`**. אחרת `preserveField` (`exercise.service.ts:352-364`) או השמטת המפתח משאירים בשקט את הערך הישן.
  כל שדה שפה חדש מקבל מקרה ב-`scripts/verify-exercise-editor-clear-fields.ts`, ומריצים אותו (round-trip אמיתי, בהרשאת דוד, כי הוא נוגע בפרודקשן).
- **צינור תרגום:** `BulkTranslationDialog` מורחב לכמה שפות יעד. נוסף route `POST /api/admin/i18n/translate` (`requireAdminApi`, `await import` ל-Anthropic SDK דרך `src/lib/ai/anthropic.server.ts` הקיים) שמתרגם לפי מילון מונחים (glossary) וקול המותג (`.claude/rules/brand-voice.md`).
  התוצאה נכתבת עם `review: {[locale]: 'machine'}` ועוברת ל-"נבדק" רק אחרי אישור אדם. מסך "כיסוי תרגום" לכל אוסף.

### 2.8 וידאו (קריינות עברית ב-Bunny)

| אפשרות | מה | עלות משוערת (לאמת מול ספקים) | מאמץ | איכות |
|---|---|---|---|---|
| **A. כתוביות AI** | Whisper (או התמלול של Bunny, לבדוק זמינות/מחיר) → עברית → תרגום LLM → WebVTT לכל שפה. העלאה כ-captions ל-Bunny או `<track>` משלנו. שדה `captions: {[locale]: url}` לכל `execution_method` | זניחה: סנטים לדקה לתמלול + תרגום | brief אחד (~1 יום סוכן) + בדיקת דוד על 10 סרטונים | טובה. דורש קריאה תוך כדי תרגול |
| **B. דיבוב AI** | שירות dubbing (ElevenLabs וכד'), קול אחד קבוע לכל שפה. וידאו נפרד ב-Bunny לכל locale → `videoId` לפי locale | בסדר גודל דולר לדקה לשפה (לאמת). מוכפל במספר השפות | בינוני: pipeline + QA האזנה לכל סרטון | טובה מאוד כשהקריין מחוץ לפריים |
| **C. הקלטה מחדש** | דובר שפת אם | הגבוהה | גבוה | הכי טובה |
| **D. השתקה + הנחיות האפליקציה** | ניגון בלי קול + TTS של האפליקציה (`audio-guidance.service.ts`, כבר קיים) בשפת המשתמש | אפס | נמוך | תלוי בכמה הקריינות מוסיפה מעבר להדגמה |

**המלצה:** A ל-MVP באנגלית. B רק ל-Top-N הסרטונים הנצפים, אחרי מדידה. **חסר נתון:** מספר הסרטונים, סך הדקות, וכמה מהם עם קריינות בפועל. זה נדרש מדוד או משאילתת Bunny API לקריאה בלבד.

---

## 3. גלים

### 3.1 עקרונות לכל גל

- **דגלים:**
  - `enable_i18n` (מאסטר) + דגל לכל שפה: `enable_locale_en`, `enable_locale_ru`, `enable_locale_de`. כולם `defaultValue: false`, `superAdminValue: true`. אלה בוליאנים רגילים ב-`src/hooks/feature-flag-defs.ts` + כרטיס ב-`src/app/admin/system-settings/page.tsx`, וזה עדיף על allow-list במבנה חדש. ה-allow-list האפקטיבי הוא הדגלים הדלוקים.
  - **דגל כבוי = locale קבוע `he` = עברית byte-identical.** בעברית `t()` מחזיר את המחרוזת המקורית בדיוק.
- כל brief לפי `~/Development/agent-briefs/entry-flow/COMMON.md`: worktree משלו מ-`origin/main`, אף פעם לא להריץ את האפליקציה מקומית, `tsc-baseline` + `test:invariants` + `safety-check.sh`, PR בלי מיזוג, ודוד ממזג.
- **היקפי קבצים בלי חפיפה** בין briefs של אותו גל (העמודה "scope"). קטלוג JSON נפרד לכל namespace, כך ששני סוכנים לא כותבים לאותו קובץ.
- מקסימום **3 סוכנים במקביל** (Mac 16GB).

### 3.2 שומרים אוטומטיים (נבנים בגל 1)

1. **`scripts/safety-check.sh` Check 5, "no new hard-coded Hebrew":** קובץ manifest `src/lib/i18n/migrated-paths.txt`. כל שורה **נוספת** ב-`git diff --cached` בקובץ תחת נתיב ממוגר, שמכילה תו עברי מחוץ להערה, חוסמת commit. חריגים: `src/messages/he/**`, טסטים. כל גל חילוץ מוסיף את התיקיות שלו ל-manifest. (לא עורכים allowlists כדי לעקוף, לפי COMMON.md.)
2. **טסט קטלוגים (vitest):**
   - כל מפתח ב-`he` קיים ב-`en` לפני הדלקת `enable_locale_en`.
   - כל הודעה עוברת parse כ-ICU.
   - אותם משתנים `{x}` בכל השפות.
   - אורך פושים ≤ 40/90 לכל locale.
   - אין `'he-IL'` מחוץ ל-`fmt.ts` בנתיבים ממוגרים.
3. **טסט "עברית זהה":** לכל מפתח שה-codemod חילץ נשמר sidecar עם הביטוי המקורי. הטסט מוודא ש-`t(key, sampleArgs)` ב-`he` שווה לפלט המקורי (כולל שני ענפי ה-gender).
4. **בדיקת mirror** ל-`src/lib/i18n/core` ↔ `functions/src/shared/i18n-core`, כמו זו של push-library.

### 3.3 Codemod לחילוץ (`scripts/i18n/extract.ts`, ts-morph)

- **מה הוא עושה:**
  - מחלץ טקסט JSX, מאפייני JSX (`placeholder`, `aria-label`, `title`, `alt`) ומחרוזות literal עם עברית.
  - template literals עם `${x}` הופכים ל-ICU `{x}`.
  - טרנרי gender הופך ל-`select`.
  - `n === 1 ? … : …` הופך ל-`plural` (כשהתבנית ברורה).
  - מוסיף `const t = useT('ns')` בקומפוננטות, ו-`getT` בקוד לא-React.
- **מה הוא מדלג (ולדוח ידני):** מחרוזות שמשמשות כמזהים (השוואות `===`, `case`, מפתחות אובייקט, ערכים שנכתבים ל-Firestore, regex), `console.*`/לוגים, טסטים, ודאטה (`israel-locations.ts`, `venueCatalog.ts`).
- **הערכה:** 70-85% אוטומטי. השאר עובר לבדיקת הסוכן לפי הדוח.

### גל 0: תיקוני עיצוב בעברית (placeholder, ראשון)

מוזן מהרשימה של דוד: פריסה בטלפונים קטנים, ניווט אחורה, תקלות onboarding, תזמון אנימציות. ה-briefs נכתבים כשהרשימה מגיעה.
**כל תיקייה שגל 0 נוגע בה "נעולה" לגלי 2-3 עד שה-PR שלה ממוזג.** טבלת נעילות ב-`docs/i18n/LOCKS.md` מתעדכנת עם כל brief.

### גל 1: תשתית (בלי שינוי ויזואלי, **רץ במקביל לגל 0**)

| Brief | scope | תוכן |
|---|---|---|
| 1A core | `src/lib/i18n/core/**`, `src/lib/i18n/locales.ts`, `src/store/useLocaleStore.ts`, `src/hooks/useT.ts`, `src/hooks/feature-flag-defs.ts` (4 דגלים), כרטיסים ב-`admin/system-settings/page.tsx`, `src/messages/he/common.json` | מנוע ICU, store, `useT`/`getT`, `fmt.ts`, טיפוס `Locale` אחד (re-export בשלושת הטיפוסים הישנים), `pickText`. `useTranslation`/`LanguageContext` הופכים ל-wrapper דק מעל ה-store, ו-`LanguageProvider` יוצא מ-`ClientLayout.tsx` (במצב עברית בלבד ההתנהגות זהה). `onboardingPrefs` key `app_locale` |
| 1B guards | `scripts/safety-check.sh` (Check 5 חדש), `src/lib/i18n/migrated-paths.txt`, `src/lib/i18n/__tests__/**`, mirror ל-`functions/src/shared/i18n-core` + עדכון ה-vendor script | §3.2 |
| 1C codemod | `scripts/i18n/**` | §3.3 + הרצת ניסיון יבשה על `src/features/notifications` (דוח בלבד) |

### גל 2: חילוץ מחרוזות (בלי שינוי ויזואלי, **רץ במקביל לגל 0, רק בתיקיות לא נעולות**)

הסדר: קודם קוד שרת/לוגיקה (שגל 0 לא נוגע בו), אחר כך UI לפי שחרור נעילות.

| Brief | scope | מחרוזות |
|---|---|---:|
| 2A פושים + שרת | `src/features/notifications/**`, `functions/src/{shared,services}/**` (דרך ה-vendor), schedulers ב-`functions/src/*.ts`, `src/app/api/**` (לא admin) → קודי שגיאה, `src/messages/*/{push,errors}.json` | ~600 |
| 2B מחוללים + לו"ז | `src/features/workout-engine/{services,core,logic,hybrid,shared,engines,generator,utils}/**`, `src/features/schedule/**`, `achievement-definitions.ts` | ~1,700 |
| 2C משפטי + עזרה | `src/features/{legal,help}`, `src/app/{privacy,accessibility,delete-data}`, `src/lib/app-help` | ~390 |
| 2D onboarding | `src/features/user/onboarding/**`, `src/app/{onboarding*,gateway,intro,join}` (כולל איחוד `dictionaries.ts`/`onboarding-locales.ts` לקטלוג) | ~2,070 |
| 2E home | `src/features/home/**`, `src/app/home/**` | ~1,280 |
| 2F מפה | `src/features/{parks,safecity,heatmap,weather,navigation}`, `src/app/map` | ~1,410 |
| 2G נגנים + סיכום | `src/features/workout-engine/{players,summary,components,budget-light}`, `src/app/{run,session,active-workout-ui}` | ~1,660 |
| 2H ספרייה / חיפוש / פרופיל | `src/features/{content (לא admin),search,workouts,favorites,profile,user/{progression,identity,places,core,scheduling},progression-hub,progression-map,activity}`, דפי `app` תואמים | ~2,660 |
| 2I social + משותף | `src/features/{social,arena,challenge,messages}`, דפי `app` תואמים, `src/components/**` (לא admin), `src/lib` (לא ai/data) | ~2,900 |
| 2J Kelly (טקסט UI בלבד) | `src/features/ai-coach/**`, `src/app/ai-coach/**`, `src/lib/ai/coach/{action-chips,app-help,suggestions}` | ~400 |

### גל 3: פורמטים (בלי שינוי ויזואלי בעברית, אפשר במקביל לגל 0)

| Brief | scope |
|---|---|
| 3A | החלפת `'he-IL'`/`toLocale*` → `fmt.*` בתיקיות שכבר עברו גל 2 (חלוקה לפי אותה טבלה, 2 סוכנים) |
| 3B | TTS בנגן (`AudioService.ts`, `audio-guidance.service.ts`) עם `lang` לפי locale. תוויות Mapbox |

### גל 4: RTL → לוגי (**משנה פריסה, מחכה לסיום גל 0**)

לכל brief: מחיקת `dir="rtl"` קשיח, מחלקות פיזיות→לוגיות (codemod `scripts/i18n/logical-css.ts` + סיווג ידני של `absolute left/right`), `DirIcon`, ומחוות/קרוסלות. **בעברית אמור להיות זהה פיקסלית.** דוד בודק על Vercel preview עם הדגל דלוק ב-en ובעברית.

| Brief | scope (קבצים עם `dir="rtl"`) |
|---|---|
| 4A | onboarding (58) + home (52) |
| 4B | players + summary (57 + …) |
| 4C | map/parks (28) + arena/social (42) |
| 4D | profile/progress + library/search + שאר `src/components` |
| 4E | `layout.tsx` + cookie + `dir` גלובלי + שורשי ורטיקלים/admin נעולי-RTL |

### גל 5: צנרת שפה ושרת (אחרי גל 2 באזורים הרלוונטיים)

| Brief | scope |
|---|---|
| 5A הגדרת שפה | `core.locale`, זיהוי מכשיר, בורר ב-`SettingsModal.tsx`, cookie, `onboardingPrefs` |
| 5B פושים לפי locale | `push-library.core.ts` (שדה `locale` + שרשרת בחירה), שולחים ב-`functions/src`, עמודת locale ב-`/admin/notifications` |
| 5C מודל תוכן + טאבים בפאנל | `LocaleTabs`/`LocalizedField`, `pickText` אצל הקוראים של programs/levels/site_content/visual_assessment/pressure_messages/workoutMetadata, מסכי admin תואמים |
| 5D עורך תרגילים + צינור תרגום | `src/features/content/exercises/admin/**`, `services/exercise-translation.utils.ts`, `/api/admin/i18n/translate`, `scripts/verify-exercise-editor-clear-fields.ts` |
| 5E כותרות אימון | `workout-metadata.service.ts`, `messageService.ts`, `contentFragmentService.ts`, `titleKey+params` בשמירה |
| 5F Kelly לפי locale | `src/lib/ai/coach/{persona,reply-guards,turn-engine,gender-voice,intent}.ts`, `src/lib/ai/review/**`, `functions/src/kellyProactiveScheduler.ts` |

### גל 6: אנגלית (תוכן)

תרגום LLM של כל קטלוגי `en` עם glossary + קול מותג, ואז בדיקת דובר אנגלית. תרגום תוכן Firestore (תרגילים, תוכניות, פושים, כותרות) דרך הצינור. דף חנות App Store/Play באנגלית. מסמכים משפטיים באנגלית (עורך דין). כתוביות לסרטונים (אפשרות A). בסוף: הדלקת `enable_locale_en`.

### גל 7+: כל שפה נוספת (רוסית, גרמנית, ...)

תוכן בלבד: קטלוגים, תוכן Firestore, prompt של Kelly (שורת השפה + guard), כתוביות, דף חנות, ואז דגל `enable_locale_xx`. ראו §4.3.

### Admin (אופציונלי, לא בתוכנית הבסיס)

13.8k מחרוזות. ההמלצה היא להשאיר בעברית (החלטה 1). רק עורכי התוכן מקבלים טאבי שפה (גל 5C/5D).

---

## 4. הערכות

### 4.1 לפי גל

"סוכן" = שעות עבודה של סוכן לכל brief. "דוד" = זמן review. החישוב לפי 3 סוכנים במקביל.

| גל | briefs | סוכן (לכל brief) | דוד (סה"כ) | לוח זמנים |
|---|---|---|---|---|
| 0 | לפי הרשימה | — | — | לפני גל 4 |
| 1 תשתית | 3 | 4-6 ש' | ~1.5 ש' | 2-3 ימים |
| 2 חילוץ | 10 | 3-5 ש' | ~20-40 ד' ל-PR → ~5 ש' (diff מכני + "עברית זהה" ירוק) | 4-6 ימים, במקביל לגל 0 |
| 3 פורמטים | 3 | 2-3 ש' | ~1 ש' | 1-2 ימים |
| 4 RTL→לוגי | 5 | 4-6 ש' | **~5-6 ש'** (בדיקה ויזואלית he+en במכשיר, החלק היקר) | 4-5 ימים, אחרי גל 0 |
| 5 צנרת/שרת | 6 | 4-8 ש' | ~6 ש' | 5-7 ימים |
| 6 אנגלית | 2-3 | ~8 ש' | ~4 ש' + **מבקר אנגלית ~18-20 ש'** (~45k מילים) | 1-2 שבועות (תלוי במבקר) |

### 4.2 MVP מול מלא

- **MVP (אנגלית, זרימת ליבה):** onboarding → home → מפה/פארק → נגני כוח וריצה → summary → פרופיל בסיסי → בורר שפה → פושים מרכזיים → שמות תרגילים + cues.
  - בחוץ: social/arena/ליגות, Kelly (הכניסה מוסתרת ב-locale ≠ he), כתוביות (או רק ל-Top-20), ורטיקלים (תמיד עברית), admin.
  - גלים: 1, 2A/2B/2D/2E/2F/2G, 3, 4A/4B/4C(מפה)/4E, 5A/5B/5C(חלקי)/5D, 6 חלקי.
  - **~3-4 שבועות קלנדריים**. דוד ~15 ש'. מבקר ~7 ש' (~15k מילים).
- **מלא:** כל הגלים 1-6 + Kelly + כתוביות. **~6-8 שבועות קלנדריים**. דוד ~25 ש'.

### 4.3 הוספת שפה אחת אחרי אנגלית (רוסית / גרמנית)

| פריט | סוכן | אדם |
|---|---|---|
| קטלוגים (תרגום LLM + glossary, תיקון אורכים) | 3-4 ש' | מבקר דובר שפת אם: ~45k מילים UI (~18 ש'), MVP ~15k (~6 ש') |
| תוכן Firestore דרך הצינור (תרגילים, תוכניות, פושים, כותרות) | 2-3 ש' | כלול בבדיקת המבקר |
| Kelly: שורת שפה + guard כתב + (ברוסית) מגדר בגוף ראשון | 3-5 ש' | דוד: 10 שיחות בדיקה, ~1 ש' |
| כתוביות VTT | 1-2 ש' | דגימה |
| דף חנות + צילומי מסך | 1-2 ש' | דוד ~1 ש' |
| QA פריסה (גרמנית ארוכה ב-~30%, טלפונים קטנים) | 2-3 ש' | דוד ~1-2 ש' |
| **סה"כ** | **~1.5-2 ימי סוכן** | **דוד ~3-4 ש', מבקר ~1 שבוע קלנדרי** |

הערות לשפות:
- **רוסית:** plural מרובה (`one/few/many`). ICU מטפל בזה, אבל הקטלוג צריך את כל הענפים. גם מגדר בזמן עבר.
- **גרמנית:** אורך מחרוזות. `du`. אין צורך ב-RTL.

---

## 5. החלטות פתוחות לדוד (עם המלצה)

1. **פאנל admin מתורגם או עברית בלבד?** ההמלצה: **עברית בלבד.** 13.8k מחרוזות, והמשתמשים הם צוות ורשויות בישראל. רק עורכי התוכן מקבלים טאבי שפה. לבחון מחדש כשיהיה לקוח מוסדי דובר שפה אחרת.
2. **וידאו:** ההמלצה: **כתוביות AI (A) ל-MVP**, ודיבוב AI (B) ל-Top-20 אחרי מדידת צפיות. חסר: מספר סרטונים ודקות, ומה מהם עם קריינות.
3. **מי בודק תרגומים?** ההמלצה: LLM כמעבר ראשון (glossary + קול מותג). מבקר פרילנס דובר שפת אם לכל שפה, בתשלום לפי מילה. דוד מאשר רק מונחי מותג (Kelly, OUT, שמות תוכניות) ודף החנות. מסמכים משפטיים אצל עורך דין.
4. **מגדר בשפות בלי הטיה מגדרית:** ההמלצה: ממשיכים לשאול מגדר ב-onboarding (משמש גם ללוגיקת כושר). באנגלית טקסט ניטרלי אחד (ה-select מכווץ). ברוסית select בזמן עבר. בגרמנית `du` והימנעות משמות עצם ממוגדרים. Kelly נשאר "גבר" רק במקום שבו הדקדוק מחייב.
5. **Kelly בשפות אחרות:** ההמלצה: ב-MVP **להסתיר** את הכניסה ל-Kelly ב-locale ≠ he. Kelly באנגלית עולה בגל 5F אחרי שה-guards הותאמו (היום הוא נעול לעברית בשלוש שכבות).
6. **יחידות:** ההמלצה: מטרי בלבד בכל השפות. imperial רק אם ייפתח שוק ארה"ב.
7. **תחילת שבוע ואזור זמן:** ההמלצה: הלוגיקה נשארת ראשון ו-`Asia/Jerusalem`, והשפה היא שפה בלבד. אם הגרמנית מכוונת לשוק **מחוץ לישראל** (ולא לדוברי גרמנית בארץ), אזורי זמן, נתוני מפה ורשויות הם פרויקט נפרד, "גאוגרפיה", שצריך להחליט עליו בנפרד.
8. **ברירת מחדל למשתמש חדש:** ההמלצה: שפת המכשיר אם היא ברשימת השפות המותרות, אחרת עברית. בורר בהגדרות.
9. **כותרות אימונים ישנים בהיסטוריה:** ההמלצה: אימונים שנשמרו לפני המעבר נשארים בעברית. מעכשיו שומרים `titleKey+params` לרינדור בכל שפה.
10. **תוכן חסר תרגום:** ההמלצה: מחרוזות UI חייבות להיות מלאות (CI חוסם הדלקת דגל שפה). בתוכן Firestore, fallback לאנגלית ואז לעברית, עם מסך "כיסוי תרגום" בפאנל. תרגיל בלי שם בשפה עדיין מוצג (fallback), לא מוסתר.
11. **חריגה מ-axioms §7?** ההמלצה: **לא נדרשת.** השכבה מבוססת Zustand ומבטלת את `LanguageContext` הקיים. אם בכל זאת תעדיף next-intl, זו חריגה מפורשת מ-§7 שדורשת את אישורך.

---

## 6. סיכונים ידועים

- **התנגשויות עם סשנים מקבילים:** גלים 2 ו-4 נוגעים בכמעט כל קובץ UI. טבלת נעילות (`docs/i18n/LOCKS.md`), גלים קצרים ו-PRs קטנים שממוזגים מהר.
- **מחרוזות שהן מזהים:** טקסט עברי שמשמש גם כערך לוגי (למשל `getUserGoalHebrew` ב-`branding.service`, תוויות שנשמרות ל-Firestore). ה-codemod מדלג על השוואות, אבל לכל brief יש סעיף "חפש ערכים עבריים שנכתבים לדאטה".
- **אין הרצה מקומית** (האפליקציה פונה לפרודקשן). אימות ויזואלי רק ב-Vercel preview על ידי דוד. זו הסיבה שזמן ה-review בגל 4 הוא היקר בתוכנית.
- **ורטיקלים readiness/wedding:** נשארים עברית. שורש `dir="rtl"` משלהם ונתיב מוחרג ב-guard.
