# Notification/Content Coherence Sweep

Generated 2026-09-07 · 560 scenarios (7 personas × 4 times × 5 locations × 4 push triggers) in 17898ms.

**Read-only. No Firestore writes, no FCM sends, no deploy.** Home content via the real `generateHomeWorkoutTrio` → `resolveWorkoutMetadata` (live `workoutMetadata/{workoutTitles,smartDescriptions}` reads). Push content via the real `selectNotificationContent`/`personaliseNotificationText`, imported directly from `functions/src/services/notification-content.service.ts` (live `workoutMetadata/notifications/notifications` reads via Admin SDK) — the exact functions `stepGoalNudgeScheduler.ts`/`onPlannedActivityCreated.ts` call in production, not a re-implementation.

## Methodology & honest limitations

- Exercises/programs/gym-equipment are read from the **frozen** invariants-gate fixture (`tests/invariants/fixtures/`), not live — that layer isn't under audit here and re-fetching it 560× would be slow. `workoutMetadata` and the notification library ARE live, on purpose.
- One fixed representative user profile (level 12, balanced domain levels, home gear) — only persona/time/location/trigger vary, so those are the isolated variables. Exercise-selection correctness is the invariants gate's job, not this sweep's.
- Time buckets map to representative hours: morning=08:30, lunch=13:00 (inside the real Desk Reset Boost window), evening=19:00, night=22:00. The Parent Time-Window Boost's second window (16:00-17:30, park/pickup) isn't separately covered — only 4 buckets were requested.
- `Daily_Goal` push queries use `dailyGoalBucket: 'mid'`; `activityType` is left unset. A different bucket choice would surface different candidates for that trigger.
- **Coherence flags are mechanical keyword checks lifted directly from the real production guards** (workout-metadata.service.ts's own location/airport/desk keyword lists) — not semantic/NLP judgment. A flag means a real production keyword-vocabulary term showed up somewhere it self-evidently shouldn't (e.g. an airport word outside `location=airport`). Absence of a flag is NOT proof of coherence — it only means these specific mechanical checks found nothing.
- **Push vs. home-title "match" is deliberately NOT auto-flagged.** Per the earlier push-infrastructure audit, push and home content are architecturally unrelated systems today (no live push reads the workout-generation pipeline) — so push and title routinely being about different things is the *expected*, structural state, not a per-row bug. Both are shown side by side in the table below for a human to judge case-by-case; treat the whole "push has nothing to do with the workout" finding as one systemic gap (already reported separately), not 560 individual ones.

## Gap summary

**402/560 scenarios (72%) tripped at least one mechanical flag.**

**Single biggest driver:** `Location_Based`, `Habit_Maintenance` matched **0 candidates in every single scenario** (280 rows) — this is a content-authoring gap (no rows in `workoutMetadata/notifications/notifications` for these trigger types, for any tested persona), not a per-scenario logic bug. It alone accounts for the majority of "0 push candidates matched" flags below.

### By push trigger type (match rate)

| Trigger | Matched / Total | Match rate |
|---|---|---|
| Daily_Goal | 140/140 | 100% |
| Inactivity | 140/140 | 100% |
| Location_Based | 0/140 | 0% |
| Habit_Maintenance | 0/140 | 0% |

### Top recurring gap patterns

| Pattern | Count | Share |
|---|---|---|
| 0 push candidates matched | 280 | 50% |
| unresolved token literal: "@בוא" | 34 | 6% |
| desk-theme content at a non-desk location | 30 | 5% |
| "morning" wording outside the morning slot | 29 | 5% |
| unresolved token literal: "@מיקום" | 19 | 3% |
| unresolved token literal: "@זמן_אימון" | 18 | 3% |
| unresolved token literal: "@basePace" | 10 | 2% |
| unresolved token literal: "@weekNumber" | 9 | 2% |
| "evening" wording outside the evening slot | 7 | 1% |
| unresolved token literal: "@קטגוריה" | 5 | 1% |
| unresolved token literal: "@רמה" | 5 | 1% |
| unresolved token literal: "@פער_שבועי" | 3 | 1% |
| unresolved token literal: "@אחוז_התקדמות_רמה" | 2 | 0% |
| unresolved token literal: "@זמן_הגעה" | 1 | 0% |
| unresolved token literal: "@את" | 1 | 0% |
| unresolved token literal: "@ימי_אי_פעילות" | 1 | 0% |

### Worst persona × time clusters (highest flagged-row rate)

| Persona × time | Flagged / Total | Rate |
|---|---|---|
| student × lunch | 18/20 | 90% |
| office_worker × lunch | 18/20 | 90% |
| vatikim × lunch | 18/20 | 90% |
| student × evening | 16/20 | 80% |
| student × night | 16/20 | 80% |
| student × morning | 15/20 | 75% |
| office_worker × morning | 15/20 | 75% |
| office_worker × night | 15/20 | 75% |
| military × night | 15/20 | 75% |
| vatikim × evening | 15/20 | 75% |
| parent × morning | 14/20 | 70% |
| parent × lunch | 14/20 | 70% |
| parent × evening | 14/20 | 70% |
| parent × night | 14/20 | 70% |
| pupil × lunch | 14/20 | 70% |

### By location

| Location | Flagged / Total | Rate |
|---|---|---|
| park | 77/112 | 69% |
| home | 80/112 | 71% |
| street | 82/112 | 73% |
| gym | 85/112 | 76% |
| office | 78/112 | 70% |

## Full grid (grouped by persona)

### parent (56/80 flagged)

| Time | Location | Trigger | Home Title | Home Desc | Category | Push Text | Push Cand. | Flags |
|---|---|---|---|---|---|---|---|---|
| morning | park | Daily_Goal | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל30 דקות של כללי. | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 |  |
| morning | park | Inactivity | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל29 דקות של כללי. | כללי | אבא, הפארק קרוב! @זמן_הגעה דקות של אימון @קטגוריה ו@את/ה אחר… | 103 | unresolved token literal: "@זמן_הגעה" |
| morning | park | Location_Based | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל29 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | park | Habit_Maintenance | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל29 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | home | Daily_Goal | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל30 דקות של כללי. | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 3 |  |
| morning | home | Inactivity | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל30 דקות של כללי. | כללי | ה-@basePace שלך השתפר! בוא/י לשבור שיא ב-5 ק"מ. | 103 | unresolved token literal: "@basePace" |
| morning | home | Location_Based | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל29 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | home | Habit_Maintenance | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל30 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | street | Daily_Goal | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל29 דקות של כללי. | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 |  |
| morning | street | Inactivity | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל30 דקות של כללי. | כללי | זמן להתאושש. בוא/י לאימון בנייה מחדש כדי להמשיך חזק יותר. | 103 |  |
| morning | street | Location_Based | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל30 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | street | Habit_Maintenance | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל29 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | gym | Daily_Goal | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל30 דקות של כללי. | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 |  |
| morning | gym | Inactivity | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל30 דקות של כללי. | כללי | הם שקועים במשחק? @בוא/י ל@זמן_אימון דקות של @קטגוריה. | 103 | unresolved token literal: "@בוא" |
| morning | gym | Location_Based | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל29 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | gym | Habit_Maintenance | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל30 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | office | Daily_Goal | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל29 דקות של כללי. | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 3 |  |
| morning | office | Inactivity | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל29 דקות של כללי. | כללי | קיץ בפתח! בוא/י לעבוד על הגזרה ב@זמן_אימון דקות ממוקדות. | 103 | unresolved token literal: "@זמן_אימון" |
| morning | office | Location_Based | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל30 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | office | Habit_Maintenance | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל29 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | park | Daily_Goal | סוגרים שבוע בפארק | סופש הגיע. בוא נסיים אותו חזק עם גוף מלא בפארק. | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 |  |
| lunch | park | Inactivity | סוגרים שבוע בפארק | סופש הגיע. בוא נסיים אותו חזק עם גוף מלא בפארק. | כללי | זמן לשקט שלך משתמש. בוא/י לריצה קלה ב@מיקום, רק את/ה והאוויר… | 103 | unresolved token literal: "@מיקום" |
| lunch | park | Location_Based | אימון גינה בזמן שהם משחקים | עבודה, ילדים, עומס... בוא נשמור על הגב בפארק. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | park | Habit_Maintenance | סוגרים שבוע בפארק | סופש הגיע. בוא נסיים אותו חזק עם גוף מלא בפארק. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | home | Daily_Goal | עובדים על השלב הנוכחי | תראה להם מה זה כוח רצון. היום עובדים על השלב הנוכח… | כללי | גם עם כל הריצות אחרי הילדים — נשארו רק 1,500 צעדים ליעד | 3 |  |
| lunch | home | Inactivity | עובדים על השלב הנוכחי | תראה להם מה זה כוח רצון. היום עובדים על השלב הנוכח… | כללי | חצי דרך מאחוריך! שבוע @weekNumber בתוכנית ה-@targetDistanceL… | 103 | unresolved token literal: "@weekNumber" |
| lunch | home | Location_Based | עובדים על השלב הנוכחי | תראה להם מה זה כוח רצון. היום עובדים על השלב הנוכח… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | home | Habit_Maintenance | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל30 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | street | Daily_Goal | סוגרת פערים בגוף מלא | הם בעיסוקים שלהם? בוא ננצל את זה ל29 דקות של גוף מ… | כללי | גם עם כל הריצות אחרי הילדים — נשארו רק 1,500 צעדים ליעד | 3 |  |
| lunch | street | Inactivity | סוגרים פערים, אבא | משתמש, אבא עקבי הוא אבא חזק. אתה ב-0% - כמעט שם. | כללי | זקוקה לריסטרט? @זמן_אימון דקות של @קטגוריה והכל נראה אחרת. | 103 | unresolved token literal: "@זמן_אימון" |
| lunch | street | Location_Based | סוגרים פערים, אבא | משתמש, אבא עקבי הוא אבא חזק. אתה ב-0% - כמעט שם. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | street | Habit_Maintenance | חיטוב בזמן שהם משחקים | כדי להרים אותם בלי כאבים, בוא נחזק גוף מלא במאתגר … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | gym | Daily_Goal | סוגרת פערים בגוף מלא | כדי להרים אותם בלי כאבים, בוא נחזק גוף מלא במאתגר … | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 |  |
| lunch | gym | Inactivity | סוגרים שבוע במכון כושר | סופש הגיע. בוא נסיים אותו חזק עם גוף מלא במכון כוש… | כללי | משתמש, קחי @זמן_אימון דקות לעצמך לפני שהבית מתעורר. @קטגוריה… | 103 | unresolved token literal: "@זמן_אימון" |
| lunch | gym | Location_Based | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל29 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | gym | Habit_Maintenance | עובדים על השלב הנוכחי | תראה להם מה זה כוח רצון. היום עובדים על השלב הנוכח… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | office | Daily_Goal | עובדים על השלב הנוכחי | תראה להם מה זה כוח רצון. היום עובדים על השלב הנוכח… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 |  |
| lunch | office | Inactivity | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל29 דקות של כללי. | כללי | הרגליים כבדות מהטיסה? בוא/י לשחרור קצר שיחזיר לך את האנרגיה. | 103 |  |
| lunch | office | Location_Based | אימון גינה בזמן שהם משחקים | כדי להרים אותם בלי כאבים, בוא נחזק גוף מלא במאתגר … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | office | Habit_Maintenance | אימון גינה בזמן שהם משחקים | תראה להם מה זה כוח רצון. היום עובדים על השלב הנוכח… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | park | Daily_Goal | סוגרים שבוע בפארק | סופש הגיע. בוא נסיים אותו חזק עם גוף מלא בפארק. | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 |  |
| evening | park | Inactivity | סוגרים שבוע בפארק | סופש הגיע. בוא נסיים אותו חזק עם גוף מלא בפארק. | כללי | משתמש, נשאר רק @פער_שבועי לסיום היעד השבועי. בוא/י נסגור את … | 103 | unresolved token literal: "@פער_שבועי" |
| evening | park | Location_Based | אימון גינה בזמן שהם משחקים | עבודה, ילדים, עומס... בוא נשמור על הגב בפארק. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | park | Habit_Maintenance | סוגרים שבוע בפארק | סופש הגיע. בוא נסיים אותו חזק עם גוף מלא בפארק. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | home | Daily_Goal | עובדים על השלב הנוכחי | תראה להם מה זה כוח רצון. היום עובדים על השלב הנוכח… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 3 |  |
| evening | home | Inactivity | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל30 דקות של כללי. | כללי | חצי דרך מאחוריך! שבוע @weekNumber בתוכנית ה-@targetDistanceL… | 103 | unresolved token literal: "@weekNumber" |
| evening | home | Location_Based | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל29 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | home | Habit_Maintenance | עובדים על השלב הנוכחי | תראה להם מה זה כוח רצון. היום עובדים על השלב הנוכח… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | street | Daily_Goal | סוגרים פערים, אבא | משתמש, אבא עקבי הוא אבא חזק. אתה ב-0% - כמעט שם. | כללי | גם עם כל הריצות אחרי הילדים — נשארו רק 1,500 צעדים ליעד | 3 |  |
| evening | street | Inactivity | סוגרים לוג בערב | יום עבודה ארוך נגמר. 30 דקות של כללי לשחרור הלחץ מ… | כללי | 5 ק"מ ראשונים בפתח. משתמש, בוא/י לעשות היסטוריה אישית. | 103 |  |
| evening | street | Location_Based | חיטוב בזמן שהם משחקים | סופש הגיע. בוא נסיים אותו חזק עם גוף מלא ברחוב. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | street | Habit_Maintenance | סוגרים פערים, אבא | משתמש, אבא עקבי הוא אבא חזק. אתה ב-0% - כמעט שם. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | gym | Daily_Goal | סוגרת פערים בגוף מלא | כדי להרים אותם בלי כאבים, בוא נחזק גוף מלא במאתגר … | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 |  |
| evening | gym | Inactivity | חיטוב בזמן שהם משחקים | עבודה, ילדים, עומס... בוא נשמור על הגב במכון כושר. | כללי | משתמש, היום ב@מיקום מתקרבים ל@תרגיל_יעד. @זמן_אימון דקות של … | 103 | unresolved token literal: "@מיקום" |
| evening | gym | Location_Based | סוגרים לוג בערב | יום עבודה ארוך נגמר. 30 דקות של כללי לשחרור הלחץ מ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | gym | Habit_Maintenance | חיטוב בזמן שהם משחקים | סופש הגיע. בוא נסיים אותו חזק עם גוף מלא במכון כוש… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | office | Daily_Goal | סוגרת פערים בגוף מלא | הם בעיסוקים שלהם? בוא ננצל את זה ל30 דקות של גוף מ… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 |  |
| evening | office | Inactivity | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל30 דקות של כללי. | כללי | רק עוד קצת! @אחוז_התקדמות_רמה ואבא עובר ל-@רמה_הבאה. | 103 | unresolved token literal: "@אחוז_התקדמות_רמה" |
| evening | office | Location_Based | אימון גינה בזמן שהם משחקים | תראה להם מה זה כוח רצון. היום עובדים על השלב הנוכח… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | office | Habit_Maintenance | סוגרת פערים בגוף מלא | סופש הגיע. בוא נסיים אותו חזק עם גוף מלא במשרד. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | park | Daily_Goal | אימון גינה בזמן שהם משחקים | סופש הגיע. בוא נסיים אותו חזק עם גוף מלא בפארק. | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 3 |  |
| night | park | Inactivity | אימון גינה בזמן שהם משחקים | סופש הגיע. בוא נסיים אותו חזק עם גוף מלא בפארק. | כללי | נחיתה רכה משתמש! בוא/י לשחרר את הגב מהטיסה ב@מיקום. | 103 | unresolved token literal: "@מיקום" |
| night | park | Location_Based | חיטוב בזמן שהם משחקים | עבודה, ילדים, עומס... בוא נשמור על הגב בפארק. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | park | Habit_Maintenance | חיטוב בזמן שהם משחקים | תראה להם מה זה כוח רצון. היום עובדים על השלב הנוכח… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | home | Daily_Goal | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל29 דקות של כללי. | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 |  |
| night | home | Inactivity | עובדים על השלב הנוכחי | תראה להם מה זה כוח רצון. היום עובדים על השלב הנוכח… | כללי | אמא, נשאר לך @פער_שבועי קטן. @בוא/י לסגור אותו עכשיו. | 103 | unresolved token literal: "@פער_שבועי" |
| night | home | Location_Based | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל29 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | home | Habit_Maintenance | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל30 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | street | Daily_Goal | סוגרים שבוע ברחוב | סופש הגיע. בוא נסיים אותו חזק עם גוף מלא ברחוב. | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 3 |  |
| night | street | Inactivity | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל30 דקות של כללי. | כללי | ריצת 5 ק"מ ב-Flow. בוא/י לראות כמה ה-@basePace נהיה קל. | 103 | unresolved token literal: "@basePace" |
| night | street | Location_Based | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל30 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | street | Habit_Maintenance | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל30 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | gym | Daily_Goal | סוגרת פערים בגוף מלא | הם בעיסוקים שלהם? בוא ננצל את זה ל29 דקות של גוף מ… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 |  |
| night | gym | Inactivity | סוגרת פערים בגוף מלא | עבודה, ילדים, עומס... בוא נשמור על הגב במכון כושר. | כללי | בדרך לקצב בסיס חדש! משתמש, בוא/י לשבור שיא אישי. | 103 |  |
| night | gym | Location_Based | ספרינט חיטוב לאמא בדרכים | כדי להרים אותם בלי כאבים, בוא נחזק גוף מלא במאתגר … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | gym | Habit_Maintenance | סוגרת פערים בגוף מלא | כדי להרים אותם בלי כאבים, בוא נחזק גוף מלא במאתגר … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | office | Daily_Goal | סוגרים שבוע במשרד | סופש הגיע. בוא נסיים אותו חזק עם גוף מלא במשרד. | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 3 |  |
| night | office | Inactivity | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל29 דקות של כללי. | כללי | ה-@basePace שלך השתפר! בוא/י לשבור שיא ב-5 ק"מ. | 103 | unresolved token literal: "@basePace" |
| night | office | Location_Based | אימון גינה בזמן שהם משחקים | הם בעיסוקים שלהם? בוא ננצל את זה ל30 דקות של גוף מ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | office | Habit_Maintenance | חיטוב בזמן שהם משחקים | כדי להרים אותם בלי כאבים, בוא נחזק גוף מלא במאתגר … | כללי | _(no match)_ | 0 | 0 push candidates matched |

### student (65/80 flagged)

| Time | Location | Trigger | Home Title | Home Desc | Category | Push Text | Push Cand. | Flags |
|---|---|---|---|---|---|---|---|---|
| morning | park | Daily_Goal | להתעורר לפני הלימודים | לפני שנכנסים לכיתה, בוא להעיר את הגוף עם כללי במאת… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| morning | park | Inactivity | להתעורר לפני הלימודים | לפני שנכנסים לכיתה, בוא להעיר את הגוף עם כללי במאת… | כללי | הקצב שלך השתפר, משתמש! בוא/י לבוסט ל-@basePace. | 88 | unresolved token literal: "@basePace" |
| morning | park | Location_Based | להתעורר לפני הלימודים | לפני שנכנסים לכיתה, בוא להעיר את הגוף עם כללי במאת… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | park | Habit_Maintenance | להתעורר לפני הלימודים | לפני שנכנסים לכיתה, בוא להעיר את הגוף עם כללי במאת… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | home | Daily_Goal | להתעורר לפני הלימודים | לפני שנכנסים לכיתה, בוא להעיר את הגוף עם כללי במאת… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| morning | home | Inactivity | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל30 דקות של כללי. | כללי | מספיק מסכים להיום. @בוא/י ל-@זמן_אימון דקות של ריסטרט לגוף. | 88 | unresolved token literal: "@בוא" |
| morning | home | Location_Based | להתעורר לפני הלימודים | לפני שנכנסים לכיתה, בוא להעיר את הגוף עם כללי במאת… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | home | Habit_Maintenance | להתעורר לפני הלימודים | לפני שנכנסים לכיתה, בוא להעיר את הגוף עם כללי במאת… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | street | Daily_Goal | להתעורר לפני הלימודים | לפני שנכנסים לכיתה, בוא להעיר את הגוף עם כללי במאת… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| morning | street | Inactivity | להתעורר לפני הלימודים | לפני שנכנסים לכיתה, בוא להעיר את הגוף עם כללי במאת… | כללי | קיץ בפתח! בוא/י לעבוד על הגזרה ב@זמן_אימון דקות ממוקדות. | 88 | unresolved token literal: "@זמן_אימון" |
| morning | street | Location_Based | להתעורר לפני הלימודים | לפני שנכנסים לכיתה, בוא להעיר את הגוף עם כללי במאת… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | street | Habit_Maintenance | להתעורר לפני הלימודים | לפני שנכנסים לכיתה, בוא להעיר את הגוף עם כללי במאת… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | gym | Daily_Goal | להתעורר לפני הלימודים | לפני שנכנסים לכיתה, בוא להעיר את הגוף עם כללי במאת… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| morning | gym | Inactivity | להתעורר לפני הלימודים | לפני שנכנסים לכיתה, בוא להעיר את הגוף עם כללי במאת… | כללי | משתמש, ה@מיקום מוכן. @זמן_אימון דקות של @קטגוריה ברמה גבוהה … | 88 | unresolved token literal: "@מיקום" |
| morning | gym | Location_Based | להתעורר לפני הלימודים | לפני שנכנסים לכיתה, בוא להעיר את הגוף עם כללי במאת… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | gym | Habit_Maintenance | להתעורר לפני הלימודים | לפני שנכנסים לכיתה, בוא להעיר את הגוף עם כללי במאת… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | office | Daily_Goal | להתעורר לפני הלימודים | לפני שנכנסים לכיתה, בוא להעיר את הגוף עם כללי במאת… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| morning | office | Inactivity | להתעורר לפני הלימודים | לפני שנכנסים לכיתה, בוא להעיר את הגוף עם כללי במאת… | כללי | חמישי שמח משתמש! סוגרים שבוע באימון peak ב@מיקום. | 88 | unresolved token literal: "@מיקום" |
| morning | office | Location_Based | להתעורר לפני הלימודים | לפני שנכנסים לכיתה, בוא להעיר את הגוף עם כללי במאת… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | office | Habit_Maintenance | להתעורר לפני הלימודים | לפני שנכנסים לכיתה, בוא להעיר את הגוף עם כללי במאת… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | park | Daily_Goal | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 30 דקות למתיחות במשרד והג… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 | desk-theme content at a non-desk location |
| lunch | park | Inactivity | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 28 דקות למתיחות במשרד והג… | כללי | חמישי שמח משתמש! סוגרים שבוע באימון peak ב@מיקום. | 88 | unresolved token literal: "@מיקום"; desk-theme content at a non-desk location |
| lunch | park | Location_Based | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 30 דקות למתיחות במשרד והג… | כללי | _(no match)_ | 0 | 0 push candidates matched; desk-theme content at a non-desk location |
| lunch | park | Habit_Maintenance | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 28 דקות למתיחות במשרד והג… | כללי | _(no match)_ | 0 | 0 push candidates matched; desk-theme content at a non-desk location |
| lunch | home | Daily_Goal | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 30 דקות למתיחות במשרד והג… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| lunch | home | Inactivity | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 29 דקות למתיחות במשרד והג… | כללי | @את/ה ב-@אחוז_התקדמות_רמה ל@רמה_הבאה. בוא/י לסיים חזק. | 88 | unresolved token literal: "@את" |
| lunch | home | Location_Based | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 30 דקות למתיחות במשרד והג… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | home | Habit_Maintenance | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 29 דקות למתיחות במשרד והג… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | street | Daily_Goal | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 30 דקות למתיחות במשרד והג… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 | desk-theme content at a non-desk location |
| lunch | street | Inactivity | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 29 דקות למתיחות במשרד והג… | כללי | רוצה להיראות חזק/ה וקליל/ה? בוא/י לסטריידים מהירים בסיום הרי… | 88 | desk-theme content at a non-desk location |
| lunch | street | Location_Based | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 29 דקות למתיחות במשרד והג… | כללי | _(no match)_ | 0 | 0 push candidates matched; desk-theme content at a non-desk location |
| lunch | street | Habit_Maintenance | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 29 דקות למתיחות במשרד והג… | כללי | _(no match)_ | 0 | 0 push candidates matched; desk-theme content at a non-desk location |
| lunch | gym | Daily_Goal | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 29 דקות למתיחות במשרד והג… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 | desk-theme content at a non-desk location |
| lunch | gym | Inactivity | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 29 דקות למתיחות במשרד והג… | כללי | זמן לחתוך זמנים ב-10 ק"מ. בוא/י נשפר את הקצב היום. | 88 | desk-theme content at a non-desk location |
| lunch | gym | Location_Based | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 29 דקות למתיחות במשרד והג… | כללי | _(no match)_ | 0 | 0 push candidates matched; desk-theme content at a non-desk location |
| lunch | gym | Habit_Maintenance | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 30 דקות למתיחות במשרד והג… | כללי | _(no match)_ | 0 | 0 push candidates matched; desk-theme content at a non-desk location |
| lunch | office | Daily_Goal | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 28 דקות למתיחות במשרד והג… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| lunch | office | Inactivity | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 29 דקות למתיחות במשרד והג… | כללי | זמן ל@קטגוריה. צא/י ל@מיקום ל-@זמן_אימון דקות של עבודה נקייה… | 88 | unresolved token literal: "@קטגוריה" |
| lunch | office | Location_Based | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 30 דקות למתיחות במשרד והג… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | office | Habit_Maintenance | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 28 דקות למתיחות במשרד והג… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | park | Daily_Goal | אימון כללי עצים: פונקציונלי בפארק | סשן 29 דקות בפארק המיועד לשיפור גוף מלא_פיזיולוגי.… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| evening | park | Inactivity | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | חמישי שמח משתמש! סוגרים שבוע באימון peak ב@מיקום. | 88 | unresolved token literal: "@בוא" |
| evening | park | Location_Based | ידיים חזקות ומרשימות | ידיים חזקות זה משהו שכולם ישימו לב אליו. @בוא ל-29… | כללי | _(no match)_ | 0 | 0 push candidates matched; unresolved token literal: "@בוא" |
| evening | park | Habit_Maintenance | סוגרים שבוע בפארק | סופש הגיע. בוא נסיים אותו חזק עם גוף מלא בפארק. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | home | Daily_Goal | מוכנים לגיבוש: כושר קרבי | רוצה להגיע לצבא ולתקתק את הגיבושים? בוא נתחיל לבנו… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| evening | home | Inactivity | סוגרים שבוע חזקים | סופ"ש הגיע. זמן לטעון מצברים. בוא נסגור מאוזן ונרג… | כללי | קיץ בפתח! בוא/י לעבוד על הגזרה ב@זמן_אימון דקות ממוקדות. | 88 | unresolved token literal: "@זמן_אימון" |
| evening | home | Location_Based | טעינת מצברים לסופ"ש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | _(no match)_ | 0 | 0 push candidates matched; unresolved token literal: "@בוא" |
| evening | home | Habit_Maintenance | סוגרים לוג בערב | יום עבודה ארוך נגמר. 29 דקות של כללי לשחרור הלחץ מ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | street | Daily_Goal | לעמוד זקוף ולהרשים | רוצה להגיע לצבא ולתקתק את הגיבושים? בוא נתחיל לבנו… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| evening | street | Inactivity | טעינת מצברים לסופ"ש | ידיים חזקות זה משהו שכולם ישימו לב אליו. @בוא ל-29… | כללי | שבוע חדש, אנרגיה חדשה. @בוא/י לאימון התנעה ב@מיקום. | 88 | unresolved token literal: "@בוא" |
| evening | street | Location_Based | להתעורר לפני הלימודים | לפני שנכנסים לכיתה, בוא להעיר את הגוף עם כללי במאת… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | street | Habit_Maintenance | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | _(no match)_ | 0 | 0 push candidates matched; unresolved token literal: "@בוא" |
| evening | gym | Daily_Goal | הפסקה מהמסך והספרים | העיניים עייפות? 29 דקות של גוף מלא_פיזיולוגי הן בד… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 | desk-theme content at a non-desk location |
| evening | gym | Inactivity | ידיים חזקות ומרשימות | ידיים חזקות זה משהו שכולם ישימו לב אליו. @בוא ל-29… | כללי | בלחץ של דדליין? אימון @עצימות קצר יסדר לך את הפוקוס. | 88 | unresolved token literal: "@בוא" |
| evening | gym | Location_Based | סוגרים לוג בערב | יום עבודה ארוך נגמר. 30 דקות של כללי לשחרור הלחץ מ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | gym | Habit_Maintenance | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | _(no match)_ | 0 | 0 push candidates matched; unresolved token literal: "@בוא" |
| evening | office | Daily_Goal | סוגרים שבוע חזקים | סופ"ש הגיע. זמן לטעון מצברים. בוא נסגור מאוזן ונרג… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| evening | office | Inactivity | נכנסים ל-Flow של לימודים | נכנסים ל-Flow של לימודים. אימון מאתגר קצר לחיבור ב… | כללי | לוהט בחוץ! @בוא/י לאימון ממוזג ב@מיקום. | 88 | unresolved token literal: "@בוא" |
| evening | office | Location_Based | ספרינט אנרגיה בין שיעורים | ידיים חזקות זה משהו שכולם ישימו לב אליו. @בוא ל-30… | כללי | _(no match)_ | 0 | 0 push candidates matched; unresolved token literal: "@בוא" |
| evening | office | Habit_Maintenance | סוגרים פער בגוף מלא | רוצה להגיע לצבא ולתקתק את הגיבושים? בוא נתחיל לבנו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | park | Daily_Goal | ידיים חזקות ומרשימות | ידיים חזקות זה משהו שכולם ישימו לב אליו. @בוא ל-30… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 | unresolved token literal: "@בוא" |
| night | park | Inactivity | סוגרים פער בגוף מלא | רוצה להגיע לצבא ולתקתק את הגיבושים? בוא נתחיל לבנו… | כללי | סומכים על התהליך. שבוע Taper – נחים חזק לקראת היעד. | 88 |  |
| night | park | Location_Based | ספרינט אנרגיה בין שיעורים | ידיים חזקות זה משהו שכולם ישימו לב אליו. @בוא ל-29… | כללי | _(no match)_ | 0 | 0 push candidates matched; unresolved token literal: "@בוא" |
| night | park | Habit_Maintenance | טעינת מצברים לסופ"ש | רוצה להגיע לצבא ולתקתק את הגיבושים? בוא נתחיל לבנו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | home | Daily_Goal | טעינת מצברים לסופ"ש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 | unresolved token literal: "@בוא" |
| night | home | Inactivity | להתעורר לפני הלימודים | לפני שנכנסים לכיתה, בוא להעיר את הגוף עם כללי במאת… | כללי | אין זמן ללמוד? תמיד יש @זמן_אימון דקות לאימון ספרינט. | 88 | unresolved token literal: "@זמן_אימון" |
| night | home | Location_Based | נכנסים ל-Flow של לימודים | נכנסים ל-Flow של לימודים. אימון מאתגר קצר לחיבור ב… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | home | Habit_Maintenance | עובדים על השלב הנוכחי | תראה להם מה זה כוח רצון. היום עובדים על השלב הנוכח… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | street | Daily_Goal | נכנסים ל-Flow של לימודים | נכנסים ל-Flow של לימודים. אימון מאתגר קצר לחיבור ב… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| night | street | Inactivity | ספרינט אנרגיה בין שיעורים | רוצה להגיע לצבא ולתקתק את הגיבושים? בוא נתחיל לבנו… | כללי | אין זמן ללמוד? תמיד יש @זמן_אימון דקות לאימון ספרינט. | 88 | unresolved token literal: "@זמן_אימון" |
| night | street | Location_Based | חזקים יותר ברמה כל הרמות | משתמש, רמה כל הרמות קטנה עליך. בוא/י להראות לכולם … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | street | Habit_Maintenance | להתעורר לפני הלימודים | לפני שנכנסים לכיתה, בוא להעיר את הגוף עם כללי במאת… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | gym | Daily_Goal | מוכנים לגיבוש: כושר קרבי | רוצה להגיע לצבא ולתקתק את הגיבושים? בוא נתחיל לבנו… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| night | gym | Inactivity | סוגרים שבוע חזקים | סופ"ש הגיע. זמן לטעון מצברים. בוא נסגור מאוזן ונרג… | כללי | הים מחכה. @בוא לסגור אימון שישפר לך את המראה. | 88 | unresolved token literal: "@בוא" |
| night | gym | Location_Based | מוכנים לגיבוש: כושר קרבי | רוצה להגיע לצבא ולתקתק את הגיבושים? בוא נתחיל לבנו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | gym | Habit_Maintenance | סוגרים שבוע חזקים | סופ"ש הגיע. זמן לטעון מצברים. בוא נסגור מאוזן ונרג… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | office | Daily_Goal | ספרינט אנרגיה בין שיעורים | רוצה להגיע לצבא ולתקתק את הגיבושים? בוא נתחיל לבנו… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| night | office | Inactivity | לעמוד זקוף ולהרשים | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | שבוע Taper התחיל. פחות ריצה, יותר מנוחה. סומכים על התהליך. | 88 | unresolved token literal: "@בוא" |
| night | office | Location_Based | סוגרים פער בגוף מלא | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | _(no match)_ | 0 | 0 push candidates matched; unresolved token literal: "@בוא" |
| night | office | Habit_Maintenance | טעינת מצברים לסופ"ש | ידיים חזקות זה משהו שכולם ישימו לב אליו. @בוא ל-29… | כללי | _(no match)_ | 0 | 0 push candidates matched; unresolved token literal: "@בוא" |

### pupil (53/80 flagged)

| Time | Location | Trigger | Home Title | Home Desc | Category | Push Text | Push Cand. | Flags |
|---|---|---|---|---|---|---|---|---|
| morning | park | Daily_Goal | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל30 דקות של כללי. | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| morning | park | Inactivity | אימון גינה בזמן שהם משחקים | אימון כללי בפארק המיועד למתקדמים. דגש על גוף מלא_פ… | כללי | משתמש, ה@מיקום מוכן. @זמן_אימון דקות של @קטגוריה ברמה גבוהה … | 62 | unresolved token literal: "@מיקום" |
| morning | park | Location_Based | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל28 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | park | Habit_Maintenance | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב30 דקות של הנעת … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | home | Daily_Goal | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל28 דקות של כללי. | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| morning | home | Inactivity | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל30 דקות של כללי. | כללי | זמן להתאושש. בוא/י לאימון בנייה מחדש כדי להמשיך חזק יותר. | 62 |  |
| morning | home | Location_Based | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל29 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | home | Habit_Maintenance | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל28 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | street | Daily_Goal | להתעורר לפני הלימודים | לפני שנכנסים לכיתה, בוא להעיר את הגוף עם כללי במאת… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| morning | street | Inactivity | להתעורר לפני הלימודים | לפני שנכנסים לכיתה, בוא להעיר את הגוף עם כללי במאת… | כללי | הקצב שלך עולה! בוא/י לאימון כוח ועליות בשבוע @weekNumber. | 62 | unresolved token literal: "@weekNumber" |
| morning | street | Location_Based | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל30 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | street | Habit_Maintenance | להתעורר לפני הלימודים | לפני שנכנסים לכיתה, בוא להעיר את הגוף עם כללי במאת… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | gym | Daily_Goal | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל30 דקות של כללי. | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| morning | gym | Inactivity | להתעורר לפני הלימודים | לפני שנכנסים לכיתה, בוא להעיר את הגוף עם כללי במאת… | כללי | יום הריצה הארוכה! בוא/י נבנה היום את הבסיס האירובי שלך. | 62 |  |
| morning | gym | Location_Based | בוקר של נחת: הנעת מפרקים | בוקר טוב משתמש. בוא נפתח את היום ב29 דקות של הנעת … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | gym | Habit_Maintenance | בוקר של נחת: הנעת מפרקים | בוקר טוב משתמש. בוא נפתח את היום ב29 דקות של הנעת … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | office | Daily_Goal | להתעורר לפני הלימודים | לפני שנכנסים לכיתה, בוא להעיר את הגוף עם כללי במאת… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| morning | office | Inactivity | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב29 דקות של הנעת … | כללי | בונים כושר ב@מיקום. בוא/י לאימון שלב ה-Build לשיפור הקצב. | 62 | unresolved token literal: "@מיקום" |
| morning | office | Location_Based | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל28 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | office | Habit_Maintenance | בוקר של נחת: הנעת מפרקים | בוקר טוב משתמש. בוא נפתח את היום ב29 דקות של הנעת … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | park | Daily_Goal | סוגרים שבוע בפארק | סופש הגיע. בוא נסיים אותו חזק עם גוף מלא בפארק. | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| lunch | park | Inactivity | אימון גינה בזמן שהם משחקים | אימון כללי בפארק המיועד למתקדמים. דגש על גוף מלא_פ… | כללי | חזקים ב-10 ק"מ. בוא/י לאימון שיבנה לך חוסן מנטלי. | 62 |  |
| lunch | park | Location_Based | חיטוב בזמן שהם משחקים | פותחים בוקר בראבק. 28 דקות של כללי להזרמת דם ופוקו… | כללי | _(no match)_ | 0 | 0 push candidates matched; "morning" wording outside the morning slot |
| lunch | park | Habit_Maintenance | אימון גינה בזמן שהם משחקים | העיניים עייפות מהמסך? בוא נזיז את הגוף בפארק עם כל… | כללי | _(no match)_ | 0 | 0 push candidates matched; desk-theme content at a non-desk location |
| lunch | home | Daily_Goal | עובדים על השלב הנוכחי | תראה להם מה זה כוח רצון. היום עובדים על השלב הנוכח… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| lunch | home | Inactivity | עובדים על השלב הנוכחי | תראה להם מה זה כוח רצון. היום עובדים על השלב הנוכח… | כללי | שבוע חדש, אנרגיה חדשה. @בוא/י לאימון התנעה ב@מיקום. | 62 | unresolved token literal: "@בוא" |
| lunch | home | Location_Based | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל30 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | home | Habit_Maintenance | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל29 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | street | Daily_Goal | להרים אותם בלי להתאמץ | להרים את הנכדים בכיף ובלי כאבים. בוא לתרגל יציבה ו… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| lunch | street | Inactivity | לא נשברים בגשם: שומרים על רצף | הגשם לא עוצר אותנו. בוא ל29 דקות של עבודה מהבית כד… | כללי | בחופשה? @זמן_אימון דקות של @קטגוריה והמשך יום מהנה. | 62 | unresolved token literal: "@זמן_אימון" |
| lunch | street | Location_Based | חיטוב בזמן שהם משחקים | זמן לאופטימיזציה. עובדים על השלב הנוכחי בדרך לכיבו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | street | Habit_Maintenance | שחרור כפות ידיים וצוואר | העכבר והמקלדת עייפו אותך? בוא לשחרר את כפות הידיים… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | gym | Daily_Goal | שחרור כפות ידיים וצוואר | העכבר והמקלדת עייפו אותך? בוא לשחרר את כפות הידיים… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| lunch | gym | Inactivity | בוקר של נחת: הנעת מפרקים | בוקר טוב משתמש. בוא נפתח את היום ב29 דקות של הנעת … | כללי | תראי/ה כמה התקדמת! שבוע @weekNumber ואת/ה בגרסה הרבה יותר חז… | 62 | unresolved token literal: "@weekNumber"; "morning" wording outside the morning slot |
| lunch | gym | Location_Based | אימון כללי עצים: פונקציונלי במכון כושר | סשן 30 דקות במכון כושר המיועד לשיפור גוף מלא_פיזיו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | gym | Habit_Maintenance | נכנסים ל-Flow של לימודים | נכנסים ל-Flow של לימודים. אימון מאתגר קצר לחיבור ב… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | office | Daily_Goal | סוגרים שבוע חזקים | סופ"ש הגיע. זמן לטעון מצברים. בוא נסגור מאוזן ונרג… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| lunch | office | Inactivity | מוכנים לגיבוש: כושר קרבי | רוצה להגיע לצבא ולתקתק את הגיבושים? בוא נתחיל לבנו… | כללי | סגרת חודש בתוכנית! משתמש, בוא/י לראות כמה התקדמת בשבוע @week… | 62 | unresolved token literal: "@weekNumber" |
| lunch | office | Location_Based | ים של אנרגיה: אימון כללי | בדרך לים או לבריכה? בוא לבוסט מהיר של גוף מלא_פיזי… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | office | Habit_Maintenance | סוגרים פער בגוף מלא | פותחים בוקר בראבק. 30 דקות של כללי להזרמת דם ופוקו… | כללי | _(no match)_ | 0 | 0 push candidates matched; "morning" wording outside the morning slot |
| evening | park | Daily_Goal | סוגרים לוג בערב | יום עבודה ארוך נגמר. 29 דקות של כללי לשחרור הלחץ מ… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| evening | park | Inactivity | אימון גינה בזמן שהם משחקים | משתמש, הורדת את הווסט? עכשיו בוא נוריד את המתח מהש… | כללי | 3 ק"מ של עוצמה. בוא/י לשפר את המהירות המקסימלית. | 62 |  |
| evening | park | Location_Based | אימון כללי עצים: פונקציונלי בפארק | סשן 28 דקות בפארק המיועד לשיפור גוף מלא_פיזיולוגי.… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | park | Habit_Maintenance | סוגרים שבוע בפארק | סופש הגיע. בוא נסיים אותו חזק עם גוף מלא בפארק. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | home | Daily_Goal | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל28 דקות של כללי. | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| evening | home | Inactivity | סוגרים לוג בערב | יום עבודה ארוך נגמר. 28 דקות של כללי לשחרור הלחץ מ… | כללי | משתמש, מוכנ/ה לביצוע שיא? @זמן_אימון דקות של @קטגוריה ב@מיקו… | 62 | unresolved token literal: "@זמן_אימון" |
| evening | home | Location_Based | סוגרים לוג בערב | יום עבודה ארוך נגמר. 28 דקות של כללי לשחרור הלחץ מ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | home | Habit_Maintenance | סוגרים לוג בערב | יום עבודה ארוך נגמר. 30 דקות של כללי לשחרור הלחץ מ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | street | Daily_Goal | סוגרים לוג בערב | יום עבודה ארוך נגמר. 29 דקות של כללי לשחרור הלחץ מ… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| evening | street | Inactivity | סוגרים לוג בערב | יום עבודה ארוך נגמר. 30 דקות של כללי לשחרור הלחץ מ… | כללי | משתמש, מוכנ/ה לביצוע שיא? @זמן_אימון דקות של @קטגוריה ב@מיקו… | 62 | unresolved token literal: "@זמן_אימון" |
| evening | street | Location_Based | סוגרים לוג בערב | יום עבודה ארוך נגמר. 29 דקות של כללי לשחרור הלחץ מ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | street | Habit_Maintenance | סוגרים לוג בערב | יום עבודה ארוך נגמר. 29 דקות של כללי לשחרור הלחץ מ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | gym | Daily_Goal | סוגרים לוג בערב | יום עבודה ארוך נגמר. 28 דקות של כללי לשחרור הלחץ מ… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| evening | gym | Inactivity | סוגרים לוג בערב | יום עבודה ארוך נגמר. 30 דקות של כללי לשחרור הלחץ מ… | כללי | בחופשה? @זמן_אימון דקות של @קטגוריה והמשך יום מהנה. | 62 | unresolved token literal: "@זמן_אימון" |
| evening | gym | Location_Based | סוגרים לוג בערב | יום עבודה ארוך נגמר. 29 דקות של כללי לשחרור הלחץ מ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | gym | Habit_Maintenance | סוגרים לוג בערב | יום עבודה ארוך נגמר. 30 דקות של כללי לשחרור הלחץ מ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | office | Daily_Goal | סוגרים לוג בערב | יום עבודה ארוך נגמר. 30 דקות של כללי לשחרור הלחץ מ… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| evening | office | Inactivity | סוגרים לוג בערב | יום עבודה ארוך נגמר. 29 דקות של כללי לשחרור הלחץ מ… | כללי | הסוד הוא עקביות. בוא/י לשמור על קצב @basePace חזק. | 62 | unresolved token literal: "@basePace" |
| evening | office | Location_Based | סוגרים לוג בערב | יום עבודה ארוך נגמר. 29 דקות של כללי לשחרור הלחץ מ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | office | Habit_Maintenance | סוגרים לוג בערב | יום עבודה ארוך נגמר. 30 דקות של כללי לשחרור הלחץ מ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | park | Daily_Goal | סוגרים שבוע בפארק | סופש הגיע. בוא נסיים אותו חזק עם גוף מלא בפארק. | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| night | park | Inactivity | חיטוב בזמן שהם משחקים | נפילת האנרגיה של הצהריים? בוא להזרים דם וחמצן למוח… | כללי | משתמש, ה@מיקום מוכן. @זמן_אימון דקות של @קטגוריה ברמה גבוהה … | 62 | unresolved token literal: "@מיקום" |
| night | park | Location_Based | חיטוב בזמן שהם משחקים | שורפים קלוריות ביעילות. מראה שאנחנו בדרך ליעד השבו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | park | Habit_Maintenance | אימון גינה בזמן שהם משחקים | שילוב דומיינים בפארק. אימון כללי המקיף Push, Pull … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | home | Daily_Goal | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל29 דקות של כללי. | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| night | home | Inactivity | עובדים על השלב הנוכחי | תראה להם מה זה כוח רצון. היום עובדים על השלב הנוכח… | כללי | זמן להתאושש. בוא/י לאימון בנייה מחדש כדי להמשיך חזק יותר. | 62 |  |
| night | home | Location_Based | עובדים על השלב הנוכחי | תראה להם מה זה כוח רצון. היום עובדים על השלב הנוכח… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | home | Habit_Maintenance | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל29 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | street | Daily_Goal | להרים אותם בלי להתאמץ | להרים את הנכדים בכיף ובלי כאבים. בוא לתרגל יציבה ו… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| night | street | Inactivity | סוגרת פערים בגוף מלא | נפילת האנרגיה של הצהריים? בוא להזרים דם וחמצן למוח… | כללי | מוכן/ה לדו-ספרתי? 10 ק"מ של סיפוק מחכים לך. | 62 |  |
| night | street | Location_Based | סוגרים לוג בערב | יום עבודה ארוך נגמר. 30 דקות של כללי לשחרור הלחץ מ… | כללי | _(no match)_ | 0 | 0 push candidates matched; "evening" wording outside the evening slot |
| night | street | Habit_Maintenance | חם בחוץ? אימון קריר בפנים | הטמפרטורות עולות. 28 דקות של כללי במזגן ברחוב כדי … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | gym | Daily_Goal | משחררים את הנוקשות בגוף | מרגיש/ה שהגוף 'נעול'? 30 דקות של כללי יחזירו לך את… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| night | gym | Inactivity | סוגרים פערים, אבא | משתמש, אבא עקבי הוא אבא חזק. אתה ב-0% - כמעט שם. | כללי | בדרך לים? @זמן_אימון דקות של @קטגוריה ו@את/ה בשיא שלך. | 62 | unresolved token literal: "@זמן_אימון" |
| night | gym | Location_Based | מנצחים את הנוקשות במכון כושר | מרגיש/ה נוקשות בשרירים? בוא להזרים דם וחמצן עם כלל… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | gym | Habit_Maintenance | שומרים על העצמאות: כוח | שמירה על כוח השריר היא הבסיס לעצמאות. בוא לאימון כ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | office | Daily_Goal | לא נשברים בגשם: שומרים על רצף | הגשם לא עוצר אותנו. בוא ל30 דקות של עבודה מהבית כד… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| night | office | Inactivity | להרים אותם בלי להתאמץ | להרים את הנכדים בכיף ובלי כאבים. בוא לתרגל יציבה ו… | כללי | 3 ק"מ של עוצמה. בוא/י לשפר את המהירות המקסימלית. | 62 |  |
| night | office | Location_Based | מנצחים את הנוקשות במשרד | מרגיש/ה נוקשות בשרירים? בוא להזרים דם וחמצן עם כלל… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | office | Habit_Maintenance | להרים אותם בלי להתאמץ | להרים את הנכדים בכיף ובלי כאבים. בוא לתרגל יציבה ו… | כללי | _(no match)_ | 0 | 0 push candidates matched |

### office_worker (62/80 flagged)

| Time | Location | Trigger | Home Title | Home Desc | Category | Push Text | Push Cand. | Flags |
|---|---|---|---|---|---|---|---|---|
| morning | park | Daily_Goal | אימון גינה בזמן שהם משחקים | משתמש, אתה ב-0%_רמה ל-כל הרמות_הבאה. הנתונים שלך ב… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 3 |  |
| morning | park | Inactivity | בוקר של נחת: הנעת מפרקים | בוקר טוב משתמש. בוא נפתח את היום ב30 דקות של הנעת … | כללי | יוצאים לדרך! שבוע ראשון בתוכנית הריצה מתחיל עכשיו. בוא/י נתנ… | 83 |  |
| morning | park | Location_Based | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל29 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | park | Habit_Maintenance | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב30 דקות של הנעת … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | home | Daily_Goal | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל30 דקות של כללי. | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 |  |
| morning | home | Inactivity | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל28 דקות של כללי. | כללי | עוצר/ת לצהריים? קחי @זמן_אימון דקות למתיחה במשרד, הגב שלך יו… | 83 | unresolved token literal: "@זמן_אימון" |
| morning | home | Location_Based | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל28 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | home | Habit_Maintenance | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל28 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | street | Daily_Goal | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 29 דקות למתיחות במשרד והג… | כללי | הפסקה קצרה מהמשרד? 1,500 צעדים ואת/ה באמצע הדרך | 3 | desk-theme content at a non-desk location |
| morning | street | Inactivity | סוגרים לוג בערב | יום עבודה ארוך נגמר. 30 דקות של כללי לשחרור הלחץ מ… | כללי | אזל ה-Battery? @בוא/י לבוסט אנרגיה קצר ב@מיקום. | 83 | unresolved token literal: "@בוא"; "evening" wording outside the evening slot |
| morning | street | Location_Based | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל30 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | street | Habit_Maintenance | שורפים קלוריות, לא זמן | שורפים קלוריות ביעילות. מראה שאנחנו בדרך ליעד השבו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | gym | Daily_Goal | סוגרים לוג בערב | יום עבודה ארוך נגמר. 29 דקות של כללי לשחרור הלחץ מ… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 | "evening" wording outside the evening slot |
| morning | gym | Inactivity | בוקר של נחת: הנעת מפרקים | בוקר טוב משתמש. בוא נפתח את היום ב30 דקות של הנעת … | כללי | משתמש, רמה @רמה כבר קטנה עליך. @בוא/י לטפס ל@רמה_הבאה. | 83 | unresolved token literal: "@רמה" |
| morning | gym | Location_Based | סוגרים פערים בבאקלוג | יש לנו מאוזן בגוף מלא. בוא נסגור אותו עכשיו ב29 דק… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | gym | Habit_Maintenance | סוגרים לוג בערב | יום עבודה ארוך נגמר. 29 דקות של כללי לשחרור הלחץ מ… | כללי | _(no match)_ | 0 | 0 push candidates matched; "evening" wording outside the evening slot |
| morning | office | Daily_Goal | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב29 דקות של הנעת … | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 |  |
| morning | office | Inactivity | להתעורר לפני הלימודים | לפני שנכנסים לכיתה, בוא להעיר את הגוף עם כללי במאת… | כללי | כובשים את העלייה! בוא/י לבנות רגליים שלא נשברות בריצה. | 83 |  |
| morning | office | Location_Based | שחרור כפות ידיים וצוואר | העכבר והמקלדת עייפו אותך? בוא לשחרר את כפות הידיים… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | office | Habit_Maintenance | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל29 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | park | Daily_Goal | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 29 דקות למתיחות במשרד והג… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 | desk-theme content at a non-desk location |
| lunch | park | Inactivity | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 30 דקות למתיחות במשרד והג… | כללי | הרגליים כבדות מהטיסה? בוא/י לשחרור קצר שיחזיר לך את האנרגיה. | 83 | desk-theme content at a non-desk location |
| lunch | park | Location_Based | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 29 דקות למתיחות במשרד והג… | כללי | _(no match)_ | 0 | 0 push candidates matched; desk-theme content at a non-desk location |
| lunch | park | Habit_Maintenance | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 29 דקות למתיחות במשרד והג… | כללי | _(no match)_ | 0 | 0 push candidates matched; desk-theme content at a non-desk location |
| lunch | home | Daily_Goal | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 29 דקות למתיחות במשרד והג… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 3 |  |
| lunch | home | Inactivity | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 29 דקות למתיחות במשרד והג… | כללי | חצי דרך מאחוריך! שבוע @weekNumber בתוכנית ה-@targetDistanceL… | 83 | unresolved token literal: "@weekNumber" |
| lunch | home | Location_Based | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 28 דקות למתיחות במשרד והג… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | home | Habit_Maintenance | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 30 דקות למתיחות במשרד והג… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | street | Daily_Goal | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 30 דקות למתיחות במשרד והג… | כללי | הפסקה קצרה מהמשרד? 1,500 צעדים ואת/ה באמצע הדרך | 3 | desk-theme content at a non-desk location |
| lunch | street | Inactivity | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 30 דקות למתיחות במשרד והג… | כללי | גשום בחוץ? הכי כיף להתאמן בבית. @בוא/י ל-@זמן_אימון דקות. | 83 | unresolved token literal: "@בוא"; desk-theme content at a non-desk location |
| lunch | street | Location_Based | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 30 דקות למתיחות במשרד והג… | כללי | _(no match)_ | 0 | 0 push candidates matched; desk-theme content at a non-desk location |
| lunch | street | Habit_Maintenance | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 28 דקות למתיחות במשרד והג… | כללי | _(no match)_ | 0 | 0 push candidates matched; desk-theme content at a non-desk location |
| lunch | gym | Daily_Goal | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 30 דקות למתיחות במשרד והג… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 | desk-theme content at a non-desk location |
| lunch | gym | Inactivity | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 30 דקות למתיחות במשרד והג… | כללי | הגשם בחוץ, האימון בפנים. אל תתנ/י למזג האוויר לעצור אותך. | 83 | desk-theme content at a non-desk location |
| lunch | gym | Location_Based | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 30 דקות למתיחות במשרד והג… | כללי | _(no match)_ | 0 | 0 push candidates matched; desk-theme content at a non-desk location |
| lunch | gym | Habit_Maintenance | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 29 דקות למתיחות במשרד והג… | כללי | _(no match)_ | 0 | 0 push candidates matched; desk-theme content at a non-desk location |
| lunch | office | Daily_Goal | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 30 דקות למתיחות במשרד והג… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 |  |
| lunch | office | Inactivity | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 30 דקות למתיחות במשרד והג… | כללי | יש באג בלו"ז: חסר לנו @פער_שבועי. @בוא/י לסגור את זה. | 83 | unresolved token literal: "@פער_שבועי" |
| lunch | office | Location_Based | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 30 דקות למתיחות במשרד והג… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | office | Habit_Maintenance | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 30 דקות למתיחות במשרד והג… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | park | Daily_Goal | סוגרים לוג בערב | יום עבודה ארוך נגמר. 30 דקות של כללי לשחרור הלחץ מ… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 3 |  |
| evening | park | Inactivity | סוגרים לוג בערב | יום עבודה ארוך נגמר. 29 דקות של כללי לשחרור הלחץ מ… | כללי | שורשי כף היד כואבים? @בוא/י ל-@זמן_אימון דקות של שחרור ב@מיק… | 83 | unresolved token literal: "@בוא" |
| evening | park | Location_Based | סוגרים לוג בערב | יום עבודה ארוך נגמר. 28 דקות של כללי לשחרור הלחץ מ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | park | Habit_Maintenance | סוגרים לוג בערב | יום עבודה ארוך נגמר. 28 דקות של כללי לשחרור הלחץ מ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | home | Daily_Goal | סוגרים לוג בערב | יום עבודה ארוך נגמר. 30 דקות של כללי לשחרור הלחץ מ… | כללי | הפסקה קצרה מהמשרד? 1,500 צעדים ואת/ה באמצע הדרך | 3 |  |
| evening | home | Inactivity | סוגרים לוג בערב | יום עבודה ארוך נגמר. 29 דקות של כללי לשחרור הלחץ מ… | כללי | מוכן/ה לשבור שיא? בוא/י לאינטרוולים ארוכים לשיפור הסיבולת. | 83 |  |
| evening | home | Location_Based | סוגרים לוג בערב | יום עבודה ארוך נגמר. 29 דקות של כללי לשחרור הלחץ מ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | home | Habit_Maintenance | סוגרים לוג בערב | יום עבודה ארוך נגמר. 30 דקות של כללי לשחרור הלחץ מ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | street | Daily_Goal | סוגרים לוג בערב | יום עבודה ארוך נגמר. 28 דקות של כללי לשחרור הלחץ מ… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 |  |
| evening | street | Inactivity | סוגרים לוג בערב | יום עבודה ארוך נגמר. 29 דקות של כללי לשחרור הלחץ מ… | כללי | הגב צועק 404? @בוא/י ל@זמן_אימון דקות של שחרור. | 83 | unresolved token literal: "@בוא" |
| evening | street | Location_Based | סוגרים לוג בערב | יום עבודה ארוך נגמר. 29 דקות של כללי לשחרור הלחץ מ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | street | Habit_Maintenance | סוגרים לוג בערב | יום עבודה ארוך נגמר. 30 דקות של כללי לשחרור הלחץ מ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | gym | Daily_Goal | סוגרים לוג בערב | יום עבודה ארוך נגמר. 30 דקות של כללי לשחרור הלחץ מ… | כללי | הפסקה קצרה מהמשרד? 1,500 צעדים ואת/ה באמצע הדרך | 3 |  |
| evening | gym | Inactivity | סוגרים לוג בערב | יום עבודה ארוך נגמר. 29 דקות של כללי לשחרור הלחץ מ… | כללי | שלב ה-Build בשיאו. בוא/י לחזק את הרגליים והסיבולת בשבוע @wee… | 83 | unresolved token literal: "@weekNumber" |
| evening | gym | Location_Based | סוגרים לוג בערב | יום עבודה ארוך נגמר. 30 דקות של כללי לשחרור הלחץ מ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | gym | Habit_Maintenance | סוגרים לוג בערב | יום עבודה ארוך נגמר. 29 דקות של כללי לשחרור הלחץ מ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | office | Daily_Goal | סוגרים לוג בערב | יום עבודה ארוך נגמר. 29 דקות של כללי לשחרור הלחץ מ… | כללי | הפסקה קצרה מהמשרד? 1,500 צעדים ואת/ה באמצע הדרך | 3 |  |
| evening | office | Inactivity | סוגרים לוג בערב | יום עבודה ארוך נגמר. 29 דקות של כללי לשחרור הלחץ מ… | כללי | שבוע חדש, אנרגיה חדשה. @בוא/י לאימון התנעה ב@מיקום. | 83 | unresolved token literal: "@בוא" |
| evening | office | Location_Based | סוגרים לוג בערב | יום עבודה ארוך נגמר. 30 דקות של כללי לשחרור הלחץ מ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | office | Habit_Maintenance | סוגרים לוג בערב | יום עבודה ארוך נגמר. 30 דקות של כללי לשחרור הלחץ מ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | park | Daily_Goal | אימון גינה בזמן שהם משחקים | זמן לאופטימיזציה. עובדים על השלב הנוכחי בדרך לכיבו… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 |  |
| night | park | Inactivity | שחרור כפות ידיים וצוואר | העכבר והמקלדת עייפו אותך? בוא לשחרר את כפות הידיים… | כללי | יום הריצה הארוכה! בוא/י נבנה היום את הבסיס האירובי שלך. | 83 |  |
| night | park | Location_Based | אימון כללי עצים: פונקציונלי בפארק | סשן 30 דקות בפארק המיועד לשיפור גוף מלא_פיזיולוגי.… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | park | Habit_Maintenance | סוגרים פערים בבאקלוג | יש לנו מאוזן בגוף מלא. בוא נסגור אותו עכשיו ב29 דק… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | home | Daily_Goal | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 28 דקות למתיחות במשרד והג… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 |  |
| night | home | Inactivity | שורפים קלוריות, לא זמן | שורפים קלוריות ביעילות. מראה שאנחנו בדרך ליעד השבו… | כללי | קיץ בפתח! בוא/י לעבוד על הגזרה ב@זמן_אימון דקות ממוקדות. | 83 | unresolved token literal: "@זמן_אימון" |
| night | home | Location_Based | סוגרים לוג בערב | יום עבודה ארוך נגמר. 30 דקות של כללי לשחרור הלחץ מ… | כללי | _(no match)_ | 0 | 0 push candidates matched; "evening" wording outside the evening slot |
| night | home | Habit_Maintenance | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל29 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | street | Daily_Goal | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 29 דקות למתיחות במשרד והג… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 | desk-theme content at a non-desk location |
| night | street | Inactivity | סוגרים פערים בבאקלוג | יש לנו מאוזן בגוף מלא. בוא נסגור אותו עכשיו ב30 דק… | כללי | מהמקלדת לאימון. @זמן_אימון דקות של @קטגוריה מחכות לך. | 83 | unresolved token literal: "@זמן_אימון" |
| night | street | Location_Based | סוגרים פערים בבאקלוג | יש לנו מאוזן בגוף מלא. בוא נסגור אותו עכשיו ב30 דק… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | street | Habit_Maintenance | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 30 דקות למתיחות במשרד והג… | כללי | _(no match)_ | 0 | 0 push candidates matched; desk-theme content at a non-desk location |
| night | gym | Daily_Goal | סוגרים לוג בערב | יום עבודה ארוך נגמר. 29 דקות של כללי לשחרור הלחץ מ… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 | "evening" wording outside the evening slot |
| night | gym | Inactivity | שורפים קלוריות, לא זמן | שורפים קלוריות ביעילות. מראה שאנחנו בדרך ליעד השבו… | כללי | סומכים על התהליך. שבוע Taper – נחים חזק לקראת היעד. | 83 |  |
| night | gym | Location_Based | סוגרים לוג בערב | יום עבודה ארוך נגמר. 29 דקות של כללי לשחרור הלחץ מ… | כללי | _(no match)_ | 0 | 0 push candidates matched; "evening" wording outside the evening slot |
| night | gym | Habit_Maintenance | שחרור כפות ידיים וצוואר | העכבר והמקלדת עייפו אותך? בוא לשחרר את כפות הידיים… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | office | Daily_Goal | שחרור כפות ידיים וצוואר | העכבר והמקלדת עייפו אותך? בוא לשחרר את כפות הידיים… | כללי | הפסקה קצרה מהמשרד? 1,500 צעדים ואת/ה באמצע הדרך | 3 |  |
| night | office | Inactivity | סוגרים פערים בבאקלוג | יש לנו מאוזן בגוף מלא. בוא נסגור אותו עכשיו ב29 דק… | כללי | ה@מיקום פנוי עכשיו. בוא/י לסגור את המכסה היומית ב-@זמן_אימון… | 83 | unresolved token literal: "@מיקום" |
| night | office | Location_Based | סוגרים פערים בבאקלוג | יש לנו מאוזן בגוף מלא. בוא נסגור אותו עכשיו ב30 דק… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | office | Habit_Maintenance | שורפים קלוריות, לא זמן | שורפים קלוריות ביעילות. מראה שאנחנו בדרך ליעד השבו… | כללי | _(no match)_ | 0 | 0 push candidates matched |

### military (56/80 flagged)

| Time | Location | Trigger | Home Title | Home Desc | Category | Push Text | Push Cand. | Flags |
|---|---|---|---|---|---|---|---|---|
| morning | park | Daily_Goal | בוקר של נחת: הנעת מפרקים | בוקר טוב משתמש. בוא נפתח את היום ב29 דקות של הנעת … | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| morning | park | Inactivity | בוקר של נחת: הנעת מפרקים | בוקר טוב משתמש. בוא נפתח את היום ב28 דקות של הנעת … | כללי | ה-@basePace שלך השתפר! בוא/י לשבור שיא ב-5 ק"מ. | 82 | unresolved token literal: "@basePace" |
| morning | park | Location_Based | להתעורר לפני הלימודים | לפני שנכנסים לכיתה, בוא להעיר את הגוף עם כללי במאת… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | park | Habit_Maintenance | שומרים על כשירות בשטח | לוחם/ת, בין המשימות והשמירות – 28 דקות של כוח מתפר… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | home | Daily_Goal | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל29 דקות של כללי. | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| morning | home | Inactivity | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל29 דקות של כללי. | כללי | סוף שמירה? @בוא/י לשחרר את המתח ב@מיקוד לפני השינה. | 82 | unresolved token literal: "@בוא" |
| morning | home | Location_Based | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל28 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | home | Habit_Maintenance | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל29 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | street | Daily_Goal | כשירות לוחם ברחוב | המשימה הבאה תמיד בפתח. בוא נשמור על כשירות בגוף מל… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| morning | street | Inactivity | כשירות לוחם ברחוב | המשימה הבאה תמיד בפתח. בוא נשמור על כשירות בגוף מל… | כללי | בבסיס ואין כוח? @בוא/י ל-@זמן_אימון דקות של מרץ בחדר. | 82 | unresolved token literal: "@בוא" |
| morning | street | Location_Based | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב28 דקות של הנעת … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | street | Habit_Maintenance | שומרים על כשירות בשטח | לוחם/ת, בין המשימות והשמירות – 29 דקות של כוח מתפר… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | gym | Daily_Goal | כשירות לוחם במכון כושר | המשימה הבאה תמיד בפתח. בוא נשמור על כשירות בגוף מל… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| morning | gym | Inactivity | שומרים על כשירות בשטח | לוחם/ת, בין המשימות והשמירות – 29 דקות של כוח מתפר… | כללי | משחקים עם הקצב היום! בוא/י לאימון פארטלק משחרר ב@מיקום. | 82 | unresolved token literal: "@מיקום" |
| morning | gym | Location_Based | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב30 דקות של הנעת … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | gym | Habit_Maintenance | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל30 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | office | Daily_Goal | כשירות לוחם במשרד | המשימה הבאה תמיד בפתח. בוא נשמור על כשירות בגוף מל… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| morning | office | Inactivity | סוגרים פערים בבאקלוג הקרבי | חסר לנו מאוזן במערכת. בוא נשלים חוסרים עם 29 דקות … | כללי | לוחם, העליות מחכות. בוא נבנה את הכוח המתפרץ שתצטרך בשטח. | 82 |  |
| morning | office | Location_Based | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב29 דקות של הנעת … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | office | Habit_Maintenance | כשירות לוחם במשרד | המשימה הבאה תמיד בפתח. בוא נשמור על כשירות בגוף מל… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | park | Daily_Goal | כשירות לוחם בפארק | המשימה הבאה תמיד בפתח. בוא נשמור על כשירות בגוף מל… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| lunch | park | Inactivity | אימון כללי עצים: פונקציונלי בפארק | סשן 28 דקות בפארק המיועד לשיפור גוף מלא_פיזיולוגי.… | כללי | נקה רעשים, משתמש. @זמן_אימון דקות של @מיקוד ופוקוס. | 82 | unresolved token literal: "@זמן_אימון" |
| lunch | park | Location_Based | שומרים על כשירות בשטח | לוחם/ת, בין המשימות והשמירות – 30 דקות של כוח מתפר… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | park | Habit_Maintenance | אימון גינה בזמן שהם משחקים | חסר לנו מאוזן במערכת. בוא נשלים חוסרים עם 28 דקות … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | home | Daily_Goal | כשירות לוחם בבית | המשימה הבאה תמיד בפתח. בוא נשמור על כשירות בגוף מל… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| lunch | home | Inactivity | שומרים על כשירות בשטח | לוחם/ת, בין המשימות והשמירות – 30 דקות של כוח מתפר… | כללי | אימון מלא ב@מיקום. @בוא/י נסגור את ה@סטטוס_נפח השבועי ב-@זמן… | 82 | unresolved token literal: "@מיקום" |
| lunch | home | Location_Based | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל30 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | home | Habit_Maintenance | סוגרים פערים בבאקלוג הקרבי | חסר לנו מאוזן במערכת. בוא נשלים חוסרים עם 29 דקות … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | street | Daily_Goal | מסתערים על כל הרמות_הבאה | אתה ב-0%_רמה לכל הרמות_הבאה. המטרה בטווח פגיעה, בו… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| lunch | street | Inactivity | מסתערים על כל הרמות_הבאה | אתה ב-0%_רמה לכל הרמות_הבאה. המטרה בטווח פגיעה, בו… | כללי | יום שמש מושלם! @בוא/י לאימון קצר בחוץ ב@מיקום. | 82 | unresolved token literal: "@בוא" |
| lunch | street | Location_Based | סוגרים פערים בבאקלוג הקרבי | חסר לנו מאוזן במערכת. בוא נשלים חוסרים עם 29 דקות … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | street | Habit_Maintenance | סוגרים פערים בבאקלוג הקרבי | חסר לנו מאוזן במערכת. בוא נשלים חוסרים עם 30 דקות … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | gym | Daily_Goal | שומרים על כשירות בשטח | לוחם/ת, בין המשימות והשמירות – 28 דקות של כוח מתפר… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| lunch | gym | Inactivity | כשירות לוחם במכון כושר | המשימה הבאה תמיד בפתח. בוא נשמור על כשירות בגוף מל… | כללי | זמן ל@קטגוריה. צא/י ל@מיקום ל-@זמן_אימון דקות של עבודה נקייה… | 82 | unresolved token literal: "@קטגוריה" |
| lunch | gym | Location_Based | סוגרים פערים בבאקלוג הקרבי | חסר לנו מאוזן במערכת. בוא נשלים חוסרים עם 30 דקות … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | gym | Habit_Maintenance | מסתערים על כל הרמות_הבאה | אתה ב-0%_רמה לכל הרמות_הבאה. המטרה בטווח פגיעה, בו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | office | Daily_Goal | שומרים על כשירות בשטח | לוחם/ת, בין המשימות והשמירות – 30 דקות של כוח מתפר… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| lunch | office | Inactivity | מסתערים על כל הרמות_הבאה | אתה ב-0%_רמה לכל הרמות_הבאה. המטרה בטווח פגיעה, בו… | כללי | זה היום שלך! כל העבודה הקשה מתנקזת לריצה של היום. בהצלחה! | 82 |  |
| lunch | office | Location_Based | סוגרים פערים בבאקלוג הקרבי | חסר לנו מאוזן במערכת. בוא נשלים חוסרים עם 30 דקות … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | office | Habit_Maintenance | סוגרים פערים בבאקלוג הקרבי | חסר לנו מאוזן במערכת. בוא נשלים חוסרים עם 30 דקות … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | park | Daily_Goal | סוגרים שבוע בפארק | סופש הגיע. בוא נסיים אותו חזק עם גוף מלא בפארק. | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| evening | park | Inactivity | חיטוב בזמן שהם משחקים | חסר לנו מאוזן במערכת. בוא נשלים חוסרים עם 30 דקות … | כללי | משתמש, היום ב@מיקום מתקרבים ל@תרגיל_יעד. @זמן_אימון דקות של … | 82 | unresolved token literal: "@מיקום" |
| evening | park | Location_Based | אימון גינה בזמן שהם משחקים | פותחים בוקר בראבק. 29 דקות של כללי להזרמת דם ופוקו… | כללי | _(no match)_ | 0 | 0 push candidates matched; "morning" wording outside the morning slot |
| evening | park | Habit_Maintenance | סוגרים שבוע בפארק | סופש הגיע. בוא נסיים אותו חזק עם גוף מלא בפארק. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | home | Daily_Goal | עובדים על השלב הנוכחי | תראה להם מה זה כוח רצון. היום עובדים על השלב הנוכח… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| evening | home | Inactivity | עובדים על השלב הנוכחי | תראה להם מה זה כוח רצון. היום עובדים על השלב הנוכח… | כללי | זמן להתאושש. בוא/י לאימון בנייה מחדש כדי להמשיך חזק יותר. | 82 |  |
| evening | home | Location_Based | עובדים על השלב הנוכחי | תראה להם מה זה כוח רצון. היום עובדים על השלב הנוכח… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | home | Habit_Maintenance | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל29 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | street | Daily_Goal | סוגרים לוג בערב | יום עבודה ארוך נגמר. 29 דקות של כללי לשחרור הלחץ מ… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| evening | street | Inactivity | כשירות לוחם ברחוב | המשימה הבאה תמיד בפתח. בוא נשמור על כשירות בגוף מל… | כללי | תקוע/ה בשדה התעופה? @זמן_אימון דקות של שחרור והטיסה תעבור בק… | 82 | unresolved token literal: "@זמן_אימון" |
| evening | street | Location_Based | מסתערים על כל הרמות_הבאה | אתה ב-0%_רמה לכל הרמות_הבאה. המטרה בטווח פגיעה, בו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | street | Habit_Maintenance | סוגרים לוג בערב | יום עבודה ארוך נגמר. 28 דקות של כללי לשחרור הלחץ מ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | gym | Daily_Goal | כשירות לוחם במכון כושר | המשימה הבאה תמיד בפתח. בוא נשמור על כשירות בגוף מל… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| evening | gym | Inactivity | מסתערים על כל הרמות_הבאה | אתה ב-0%_רמה לכל הרמות_הבאה. המטרה בטווח פגיעה, בו… | כללי | חזקים ב-10 ק"מ. בוא/י לאימון שיבנה לך חוסן מנטלי. | 82 |  |
| evening | gym | Location_Based | שומרים על כשירות בשטח | לוחם/ת, בין המשימות והשמירות – 28 דקות של כוח מתפר… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | gym | Habit_Maintenance | מסתערים על כל הרמות_הבאה | אתה ב-0%_רמה לכל הרמות_הבאה. המטרה בטווח פגיעה, בו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | office | Daily_Goal | כשירות לוחם במשרד | המשימה הבאה תמיד בפתח. בוא נשמור על כשירות בגוף מל… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| evening | office | Inactivity | סוגרים פערים בבאקלוג הקרבי | חסר לנו מאוזן במערכת. בוא נשלים חוסרים עם 30 דקות … | כללי | שלב ה-Build בשיאו. בוא/י לחזק את הרגליים והסיבולת בשבוע @wee… | 82 | unresolved token literal: "@weekNumber" |
| evening | office | Location_Based | סוגרים פערים בבאקלוג הקרבי | חסר לנו מאוזן במערכת. בוא נשלים חוסרים עם 30 דקות … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | office | Habit_Maintenance | סוגרים לוג בערב | יום עבודה ארוך נגמר. 29 דקות של כללי לשחרור הלחץ מ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | park | Daily_Goal | חיטוב בזמן שהם משחקים | משתמש, הורדת את הווסט? עכשיו בוא נוריד את המתח מהש… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| night | park | Inactivity | חיטוב בזמן שהם משחקים | משתמש, לוחם ברמה כל הרמות צריך בסיס חזק. היום נתקד… | כללי | אימון @קטגוריה ב@מיקום מתחיל עכשיו. @מוכן/ה להעלות את ה@סקיי… | 82 | unresolved token literal: "@קטגוריה" |
| night | park | Location_Based | סוגרים שבוע בפארק | סופש הגיע. בוא נסיים אותו חזק עם גוף מלא בפארק. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | park | Habit_Maintenance | חיטוב בזמן שהם משחקים | משתמש, הורדת את הווסט? עכשיו בוא נוריד את המתח מהש… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | home | Daily_Goal | עובדים על השלב הנוכחי | תראה להם מה זה כוח רצון. היום עובדים על השלב הנוכח… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| night | home | Inactivity | שומרים על כשירות בשטח | לוחם/ת, בין המשימות והשמירות – 30 דקות של כוח מתפר… | כללי | רמה @רמה קטנה עליך. @בוא/י להסתער על @רמה_הבאה. | 82 | unresolved token literal: "@רמה" |
| night | home | Location_Based | עובדים על השלב הנוכחי | תראה להם מה זה כוח רצון. היום עובדים על השלב הנוכח… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | home | Habit_Maintenance | שומרים על כשירות בשטח | לוחם/ת, בין המשימות והשמירות – 29 דקות של כוח מתפר… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | street | Daily_Goal | סוגרים פערים בבאקלוג הקרבי | חסר לנו מאוזן במערכת. בוא נשלים חוסרים עם 29 דקות … | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| night | street | Inactivity | מסתערים על כל הרמות_הבאה | אתה ב-0%_רמה לכל הרמות_הבאה. המטרה בטווח פגיעה, בו… | כללי | זמן ל@קטגוריה. צא/י ל@מיקום ל-@זמן_אימון דקות של עבודה נקייה… | 82 | unresolved token literal: "@קטגוריה" |
| night | street | Location_Based | מסתערים על כל הרמות_הבאה | אתה ב-0%_רמה לכל הרמות_הבאה. המטרה בטווח פגיעה, בו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | street | Habit_Maintenance | סוגרים פערים בבאקלוג הקרבי | חסר לנו מאוזן במערכת. בוא נשלים חוסרים עם 30 דקות … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | gym | Daily_Goal | כשירות לוחם במכון כושר | המשימה הבאה תמיד בפתח. בוא נשמור על כשירות בגוף מל… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| night | gym | Inactivity | כשירות לוחם במכון כושר | המשימה הבאה תמיד בפתח. בוא נשמור על כשירות בגוף מל… | כללי | זמן ל@קטגוריה. צא/י ל@מיקום ל-@זמן_אימון דקות של עבודה נקייה… | 82 | unresolved token literal: "@קטגוריה" |
| night | gym | Location_Based | שומרים על כשירות בשטח | לוחם/ת, בין המשימות והשמירות – 30 דקות של כוח מתפר… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | gym | Habit_Maintenance | כשירות לוחם במכון כושר | המשימה הבאה תמיד בפתח. בוא נשמור על כשירות בגוף מל… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | office | Daily_Goal | סוגרים פערים בבאקלוג הקרבי | חסר לנו מאוזן במערכת. בוא נשלים חוסרים עם 30 דקות … | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| night | office | Inactivity | שומרים על כשירות בשטח | לוחם/ת, בין המשימות והשמירות – 30 דקות של כוח מתפר… | כללי | חייל/ת, רמה @רמה נראית עליך מעולה. בוא/י להתקדם. | 82 | unresolved token literal: "@רמה" |
| night | office | Location_Based | שומרים על כשירות בשטח | לוחם/ת, בין המשימות והשמירות – 29 דקות של כוח מתפר… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | office | Habit_Maintenance | מסתערים על כל הרמות_הבאה | אתה ב-0%_רמה לכל הרמות_הבאה. המטרה בטווח פגיעה, בו… | כללי | _(no match)_ | 0 | 0 push candidates matched |

### vatikim (60/80 flagged)

| Time | Location | Trigger | Home Title | Home Desc | Category | Push Text | Push Cand. | Flags |
|---|---|---|---|---|---|---|---|---|
| morning | park | Daily_Goal | בוקר של נחת: הנעת מפרקים | בוקר טוב משתמש. בוא נפתח את היום ב28 דקות של הנעת … | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| morning | park | Inactivity | בוקר של נחת: הנעת מפרקים | בוקר טוב משתמש. בוא נפתח את היום ב29 דקות של הנעת … | כללי | גב חזק ליציבה זקופה. @בוא/י לאימון ממוקד ב@מיקום. | 93 | unresolved token literal: "@בוא" |
| morning | park | Location_Based | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב30 דקות של הנעת … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | park | Habit_Maintenance | בוקר של נחת: הנעת מפרקים | בוקר טוב משתמש. בוא נפתח את היום ב29 דקות של הנעת … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | home | Daily_Goal | בוקר של נחת: הנעת מפרקים | בוקר טוב משתמש. בוא נפתח את היום ב29 דקות של הנעת … | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| morning | home | Inactivity | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב28 דקות של הנעת … | כללי | משתמש, ה@מיקום מוכן. @זמן_אימון דקות של @קטגוריה ברמה גבוהה … | 93 | unresolved token literal: "@מיקום" |
| morning | home | Location_Based | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב30 דקות של הנעת … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | home | Habit_Maintenance | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב29 דקות של הנעת … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | street | Daily_Goal | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב28 דקות של הנעת … | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| morning | street | Inactivity | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב29 דקות של הנעת … | כללי | שומרים על יציבות! תרגול ביטחון בתנועה מחכה לך ב@מיקום. | 93 | unresolved token literal: "@מיקום" |
| morning | street | Location_Based | בוקר של נחת: הנעת מפרקים | בוקר טוב משתמש. בוא נפתח את היום ב30 דקות של הנעת … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | street | Habit_Maintenance | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב30 דקות של הנעת … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | gym | Daily_Goal | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב28 דקות של הנעת … | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| morning | gym | Inactivity | בוקר של נחת: הנעת מפרקים | בוקר טוב משתמש. בוא נפתח את היום ב30 דקות של הנעת … | כללי | זמן להתאושש. בוא/י לאימון בנייה מחדש כדי להמשיך חזק יותר. | 93 |  |
| morning | gym | Location_Based | בוקר של נחת: הנעת מפרקים | בוקר טוב משתמש. בוא נפתח את היום ב28 דקות של הנעת … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | gym | Habit_Maintenance | בוקר של נחת: הנעת מפרקים | בוקר טוב משתמש. בוא נפתח את היום ב28 דקות של הנעת … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | office | Daily_Goal | בוקר של נחת: הנעת מפרקים | בוקר טוב משתמש. בוא נפתח את היום ב28 דקות של הנעת … | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| morning | office | Inactivity | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב29 דקות של הנעת … | כללי | שבוע Taper התחיל. פחות ריצה, יותר מנוחה. סומכים על התהליך. | 93 |  |
| morning | office | Location_Based | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב30 דקות של הנעת … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | office | Habit_Maintenance | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב30 דקות של הנעת … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | park | Daily_Goal | כוח למשחקים עם הנכדים | הנכדים מחכים לך בגינה! בוא ל-30 דקות של חיזוק המפר… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| lunch | park | Inactivity | כוח למשחקים עם הנכדים | הנכדים מחכים לך בגינה! בוא ל-29 דקות של חיזוק המפר… | כללי | שומרים על היכולת! רמה @רמה כבר כאן, בוא/י לשמר אותה. | 93 | unresolved token literal: "@רמה" |
| lunch | park | Location_Based | שומרים על הכוח והעצמאות | הכוח שלך הוא העצמאות שלך. בוא לשמור על השרירים והע… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | park | Habit_Maintenance | בוקר של נחת: הנעת מפרקים | בוקר טוב משתמש. בוא נפתח את היום ב28 דקות של הנעת … | כללי | _(no match)_ | 0 | 0 push candidates matched; "morning" wording outside the morning slot |
| lunch | home | Daily_Goal | בוקר של נחת: הנעת מפרקים | בוקר טוב משתמש. בוא נפתח את היום ב29 דקות של הנעת … | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 | "morning" wording outside the morning slot |
| lunch | home | Inactivity | שומרים על הכוח והעצמאות | הכוח שלך הוא העצמאות שלך. בוא לשמור על השרירים והע… | כללי | תקוע/ה בשדה התעופה? @זמן_אימון דקות של שחרור והטיסה תעבור בק… | 93 | unresolved token literal: "@זמן_אימון" |
| lunch | home | Location_Based | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב29 דקות של הנעת … | כללי | _(no match)_ | 0 | 0 push candidates matched; "morning" wording outside the morning slot |
| lunch | home | Habit_Maintenance | כוח למשחקים עם הנכדים | הנכדים מחכים לך בגינה! בוא ל-30 דקות של חיזוק המפר… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | street | Daily_Goal | תחזוקת מפרקים ובריאות | בריאות המפרקים מתחילה בתנועה מבוקרת. 29 דקות של גו… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 | "morning" wording outside the morning slot |
| lunch | street | Inactivity | כוח למשחקים עם הנכדים | הנכדים מחכים לך בגינה! בוא ל-29 דקות של חיזוק המפר… | כללי | מוכן/ה לשבור שיא? בוא/י לאינטרוולים ארוכים לשיפור הסיבולת. | 93 |  |
| lunch | street | Location_Based | תחזוקת מפרקים ובריאות | בריאות המפרקים מתחילה בתנועה מבוקרת. 29 דקות של גו… | כללי | _(no match)_ | 0 | 0 push candidates matched; "morning" wording outside the morning slot |
| lunch | street | Habit_Maintenance | שומרים על העצמאות: כוח | שמירה על כוח השריר היא הבסיס לעצמאות. בוא לאימון כ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | gym | Daily_Goal | בוקר של נחת: הנעת מפרקים | בוקר טוב משתמש. בוא נפתח את היום ב30 דקות של הנעת … | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 | "morning" wording outside the morning slot |
| lunch | gym | Inactivity | תחזוקת מפרקים ובריאות | בריאות המפרקים מתחילה בתנועה מבוקרת. 29 דקות של גו… | כללי | כבר רואים את הסוף! בוא/י לסגור אימון חזק בשבוע @weekNumber. | 93 | unresolved token literal: "@weekNumber"; "morning" wording outside the morning slot |
| lunch | gym | Location_Based | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב30 דקות של הנעת … | כללי | _(no match)_ | 0 | 0 push candidates matched; "morning" wording outside the morning slot |
| lunch | gym | Habit_Maintenance | שומרים על העצמאות: כוח | שמירה על כוח השריר היא הבסיס לעצמאות. בוא לאימון כ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | office | Daily_Goal | בוקר של נחת: הנעת מפרקים | בוקר טוב משתמש. בוא נפתח את היום ב30 דקות של הנעת … | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 | "morning" wording outside the morning slot |
| lunch | office | Inactivity | תחזוקת מפרקים ובריאות | בריאות המפרקים מתחילה בתנועה מבוקרת. 30 דקות של גו… | כללי | 3 ק"מ של עוצמה. בוא/י לשפר את המהירות המקסימלית. | 93 | "morning" wording outside the morning slot |
| lunch | office | Location_Based | תחזוקת מפרקים ובריאות | בריאות המפרקים מתחילה בתנועה מבוקרת. 29 דקות של גו… | כללי | _(no match)_ | 0 | 0 push candidates matched; "morning" wording outside the morning slot |
| lunch | office | Habit_Maintenance | כוח למשחקים עם הנכדים | הנכדים מחכים לך בגינה! בוא ל-30 דקות של חיזוק המפר… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | park | Daily_Goal | כוח למשחקים עם הנכדים | הנכדים מחכים לך בגינה! בוא ל-30 דקות של חיזוק המפר… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| evening | park | Inactivity | שומרים על הכוח והעצמאות | הכוח שלך הוא העצמאות שלך. בוא לשמור על השרירים והע… | כללי | כובשים את העלייה! בוא/י לבנות רגליים שלא נשברות בריצה. | 93 |  |
| evening | park | Location_Based | שומרים על הכוח והעצמאות | הכוח שלך הוא העצמאות שלך. בוא לשמור על השרירים והע… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | park | Habit_Maintenance | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב29 דקות של הנעת … | כללי | _(no match)_ | 0 | 0 push candidates matched; "morning" wording outside the morning slot |
| evening | home | Daily_Goal | שומרים על העצמאות: כוח | שמירה על כוח השריר היא הבסיס לעצמאות. בוא לאימון כ… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| evening | home | Inactivity | תחזוקת מפרקים ובריאות | בריאות המפרקים מתחילה בתנועה מבוקרת. 30 דקות של גו… | כללי | 5 ק"מ ראשונים בפתח. משתמש, בוא/י לעשות היסטוריה אישית. | 93 | "morning" wording outside the morning slot |
| evening | home | Location_Based | שומרים על הכוח והעצמאות | הכוח שלך הוא העצמאות שלך. בוא לשמור על השרירים והע… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | home | Habit_Maintenance | כוח ומרץ למשחק עם הנכדים | הם מלאי אנרגיה? 30 דקות של חיזוק גב וידיים יתנו לך… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | street | Daily_Goal | כוח למשחקים עם הנכדים | הנכדים מחכים לך בגינה! בוא ל-29 דקות של חיזוק המפר… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| evening | street | Inactivity | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב30 דקות של הנעת … | כללי | בוקר של בריאות משתמש. בוא/י לריצה קלה לשמירה על המפרקים. | 93 | "morning" wording outside the morning slot |
| evening | street | Location_Based | כוח ומרץ למשחק עם הנכדים | הם מלאי אנרגיה? 28 דקות של חיזוק גב וידיים יתנו לך… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | street | Habit_Maintenance | בוקר של נחת: הנעת מפרקים | בוקר טוב משתמש. בוא נפתח את היום ב30 דקות של הנעת … | כללי | _(no match)_ | 0 | 0 push candidates matched; "morning" wording outside the morning slot |
| evening | gym | Daily_Goal | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב30 דקות של הנעת … | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 | "morning" wording outside the morning slot |
| evening | gym | Inactivity | כוח למשחקים עם הנכדים | הנכדים מחכים לך בגינה! בוא ל-29 דקות של חיזוק המפר… | כללי | שומרים על יציבות! תרגול ביטחון בתנועה מחכה לך ב@מיקום. | 93 | unresolved token literal: "@מיקום" |
| evening | gym | Location_Based | כוח ומרץ למשחק עם הנכדים | הם מלאי אנרגיה? 28 דקות של חיזוק גב וידיים יתנו לך… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | gym | Habit_Maintenance | שומרים על הכוח והעצמאות | הכוח שלך הוא העצמאות שלך. בוא לשמור על השרירים והע… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | office | Daily_Goal | כוח ומרץ למשחק עם הנכדים | הם מלאי אנרגיה? 28 דקות של חיזוק גב וידיים יתנו לך… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| evening | office | Inactivity | תחזוקת מפרקים ובריאות | בריאות המפרקים מתחילה בתנועה מבוקרת. 29 דקות של גו… | כללי | התקדמות מרשימה! @אחוז_התקדמות_רמה ואנחנו ברמה הבאה. | 93 | unresolved token literal: "@אחוז_התקדמות_רמה"; "morning" wording outside the morning slot |
| evening | office | Location_Based | שומרים על העצמאות: כוח | שמירה על כוח השריר היא הבסיס לעצמאות. בוא לאימון כ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | office | Habit_Maintenance | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב30 דקות של הנעת … | כללי | _(no match)_ | 0 | 0 push candidates matched; "morning" wording outside the morning slot |
| night | park | Daily_Goal | כוח ומרץ למשחק עם הנכדים | הם מלאי אנרגיה? 29 דקות של חיזוק גב וידיים יתנו לך… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| night | park | Inactivity | שומרים על העצמאות: כוח | שמירה על כוח השריר היא הבסיס לעצמאות. בוא לאימון כ… | כללי | יום הריצה הארוכה! בוא/י נבנה היום את הבסיס האירובי שלך. | 93 |  |
| night | park | Location_Based | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב29 דקות של הנעת … | כללי | _(no match)_ | 0 | 0 push candidates matched; "morning" wording outside the morning slot |
| night | park | Habit_Maintenance | שומרים על העצמאות: כוח | שמירה על כוח השריר היא הבסיס לעצמאות. בוא לאימון כ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | home | Daily_Goal | תחזוקת מפרקים ובריאות | בריאות המפרקים מתחילה בתנועה מבוקרת. 30 דקות של גו… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 | "morning" wording outside the morning slot |
| night | home | Inactivity | כוח ומרץ למשחק עם הנכדים | הם מלאי אנרגיה? 29 דקות של חיזוק גב וידיים יתנו לך… | כללי | מוכן/ה לשבור שיא? בוא/י לאינטרוולים ארוכים לשיפור הסיבולת. | 93 |  |
| night | home | Location_Based | כוח למשחקים עם הנכדים | הנכדים מחכים לך בגינה! בוא ל-30 דקות של חיזוק המפר… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | home | Habit_Maintenance | שומרים על הכוח והעצמאות | הכוח שלך הוא העצמאות שלך. בוא לשמור על השרירים והע… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | street | Daily_Goal | שומרים על הכוח והעצמאות | הכוח שלך הוא העצמאות שלך. בוא לשמור על השרירים והע… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| night | street | Inactivity | כוח ומרץ למשחק עם הנכדים | הם מלאי אנרגיה? 29 דקות של חיזוק גב וידיים יתנו לך… | כללי | שומרים על היכולת! רמה @רמה כבר כאן, בוא/י לשמר אותה. | 93 | unresolved token literal: "@רמה" |
| night | street | Location_Based | שומרים על הכוח והעצמאות | הכוח שלך הוא העצמאות שלך. בוא לשמור על השרירים והע… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | street | Habit_Maintenance | תחזוקת מפרקים ובריאות | בריאות המפרקים מתחילה בתנועה מבוקרת. 29 דקות של גו… | כללי | _(no match)_ | 0 | 0 push candidates matched; "morning" wording outside the morning slot |
| night | gym | Daily_Goal | כוח ומרץ למשחק עם הנכדים | הם מלאי אנרגיה? 30 דקות של חיזוק גב וידיים יתנו לך… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| night | gym | Inactivity | כוח ומרץ למשחק עם הנכדים | הם מלאי אנרגיה? 29 דקות של חיזוק גב וידיים יתנו לך… | כללי | הכוח אצלך בידיים. @בוא/י לאימון חיזוק שישפר לך את היום. | 93 | unresolved token literal: "@בוא" |
| night | gym | Location_Based | כוח למשחקים עם הנכדים | הנכדים מחכים לך בגינה! בוא ל-30 דקות של חיזוק המפר… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | gym | Habit_Maintenance | תחזוקת מפרקים ובריאות | בריאות המפרקים מתחילה בתנועה מבוקרת. 30 דקות של גו… | כללי | _(no match)_ | 0 | 0 push candidates matched; "morning" wording outside the morning slot |
| night | office | Daily_Goal | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב30 דקות של הנעת … | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 | "morning" wording outside the morning slot |
| night | office | Inactivity | כוח ומרץ למשחק עם הנכדים | הם מלאי אנרגיה? 30 דקות של חיזוק גב וידיים יתנו לך… | כללי | יוצאים לדרך! שבוע ראשון בתוכנית הריצה מתחיל עכשיו. בוא/י נתנ… | 93 |  |
| night | office | Location_Based | בוקר של נחת: הנעת מפרקים | בוקר טוב משתמש. בוא נפתח את היום ב28 דקות של הנעת … | כללי | _(no match)_ | 0 | 0 push candidates matched; "morning" wording outside the morning slot |
| night | office | Habit_Maintenance | שומרים על העצמאות: כוח | שמירה על כוח השריר היא הבסיס לעצמאות. בוא לאימון כ… | כללי | _(no match)_ | 0 | 0 push candidates matched |

### pro_athlete (50/80 flagged)

| Time | Location | Trigger | Home Title | Home Desc | Category | Push Text | Push Cand. | Flags |
|---|---|---|---|---|---|---|---|---|
| morning | park | Daily_Goal | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב29 דקות של הנעת … | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| morning | park | Inactivity | אימון כללי עצים: פונקציונלי בפארק | סשן 30 דקות בפארק המיועד לשיפור גוף מלא_פיזיולוגי.… | כללי | מוכן/ה לשבור שיא? בוא/י לאינטרוולים ארוכים לשיפור הסיבולת. | 62 |  |
| morning | park | Location_Based | אימון גינה בזמן שהם משחקים | עבודה, ילדים, עומס... בוא נשמור על הגב בפארק. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | park | Habit_Maintenance | סוגרים שבוע בפארק | סופש הגיע. בוא נסיים אותו חזק עם גוף מלא בפארק. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | home | Daily_Goal | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל29 דקות של כללי. | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| morning | home | Inactivity | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל30 דקות של כללי. | כללי | לוחם/ת, 3 ק"מ לתוצאה מושלמת. בוא/י לתת עבודה. | 62 |  |
| morning | home | Location_Based | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל29 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | home | Habit_Maintenance | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל29 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | street | Daily_Goal | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל29 דקות של כללי. | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| morning | street | Inactivity | בוקר של נחת: הנעת מפרקים | בוקר טוב משתמש. בוא נפתח את היום ב28 דקות של הנעת … | כללי | 5 ק"מ ראשונים בפתח. משתמש, בוא/י לעשות היסטוריה אישית. | 62 |  |
| morning | street | Location_Based | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל28 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | street | Habit_Maintenance | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב29 דקות של הנעת … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | gym | Daily_Goal | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל30 דקות של כללי. | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| morning | gym | Inactivity | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל29 דקות של כללי. | כללי | גשום בחוץ? הכי כיף להתאמן בבית. @בוא/י ל-@זמן_אימון דקות. | 62 | unresolved token literal: "@בוא" |
| morning | gym | Location_Based | להתעורר לפני הלימודים | לפני שנכנסים לכיתה, בוא להעיר את הגוף עם כללי במאת… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | gym | Habit_Maintenance | בוקר של נחת: הנעת מפרקים | בוקר טוב משתמש. בוא נפתח את היום ב30 דקות של הנעת … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | office | Daily_Goal | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל29 דקות של כללי. | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| morning | office | Inactivity | להתעורר לפני הלימודים | לפני שנכנסים לכיתה, בוא להעיר את הגוף עם כללי במאת… | כללי | זמן להתאושש. בוא/י לאימון בנייה מחדש כדי להמשיך חזק יותר. | 62 |  |
| morning | office | Location_Based | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל28 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | office | Habit_Maintenance | להתעורר לפני הלימודים | לפני שנכנסים לכיתה, בוא להעיר את הגוף עם כללי במאת… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | park | Daily_Goal | אימון גינה בזמן שהם משחקים | הם בעיסוקים שלהם? בוא ננצל את זה ל29 דקות של גוף מ… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| lunch | park | Inactivity | סוגרים שבוע בפארק | סופש הגיע. בוא נסיים אותו חזק עם גוף מלא בפארק. | כללי | ה@מיקום מחכה לדיוק שלך. @זמן_אימון דקות של @קטגוריה טכנית. | 62 | unresolved token literal: "@מיקום" |
| lunch | park | Location_Based | אימון גינה בזמן שהם משחקים | כדי להרים אותם בלי כאבים, בוא נחזק גוף מלא במאתגר … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | park | Habit_Maintenance | חיטוב בזמן שהם משחקים | רוצה להגיע לצבא ולתקתק את הגיבושים? בוא נתחיל לבנו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | home | Daily_Goal | עובדים על השלב הנוכחי | תראה להם מה זה כוח רצון. היום עובדים על השלב הנוכח… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| lunch | home | Inactivity | עובדים על השלב הנוכחי | תראה להם מה זה כוח רצון. היום עובדים על השלב הנוכח… | כללי | 3 ק"מ של עוצמה. בוא/י לשפר את המהירות המקסימלית. | 62 |  |
| lunch | home | Location_Based | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל30 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | home | Habit_Maintenance | עובדים על השלב הנוכחי | תראה להם מה זה כוח רצון. היום עובדים על השלב הנוכח… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | street | Daily_Goal | שורפים קלוריות, לא זמן | שורפים קלוריות ביעילות. מראה שאנחנו בדרך ליעד השבו… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| lunch | street | Inactivity | לא נשברים בגשם: שומרים על רצף | הגשם לא עוצר אותנו. בוא ל30 דקות של עבודה מהבית כד… | כללי | יום שמש מושלם! @בוא/י לאימון קצר בחוץ ב@מיקום. | 62 | unresolved token literal: "@בוא" |
| lunch | street | Location_Based | ידיים חזקות ומרשימות | ידיים חזקות זה משהו שכולם ישימו לב אליו. @בוא ל-30… | כללי | _(no match)_ | 0 | 0 push candidates matched; unresolved token literal: "@בוא" |
| lunch | street | Habit_Maintenance | חזקים יותר ברמה כל הרמות | משתמש, רמה כל הרמות קטנה עליך. בוא/י להראות לכולם … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | gym | Daily_Goal | סוגרים שבוע חזקים | סופ"ש הגיע. זמן לטעון מצברים. בוא נסגור מאוזן ונרג… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| lunch | gym | Inactivity | טעינת מצברים לסופ"ש | כדי להרים אותם בלי כאבים, בוא נחזק גוף מלא במאתגר … | כללי | ה-@basePace שלך השתפר! בוא/י לשבור שיא ב-5 ק"מ. | 62 | unresolved token literal: "@basePace" |
| lunch | gym | Location_Based | לעמוד זקוף ולהרשים | רוצה להגיע לצבא ולתקתק את הגיבושים? בוא נתחיל לבנו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | gym | Habit_Maintenance | כוח למשחקים עם הנכדים | הנכדים מחכים לך בגינה! בוא ל-29 דקות של חיזוק המפר… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | office | Daily_Goal | להרים אותם בלי להתאמץ | להרים את הנכדים בכיף ובלי כאבים. בוא לתרגל יציבה ו… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| lunch | office | Inactivity | לעמוד זקוף ולהרשים | חסר לנו מאוזן במערכת. בוא נשלים חוסרים עם 30 דקות … | כללי | ריצת 5 ק"מ ב-Flow. בוא/י לראות כמה ה-@basePace נהיה קל. | 62 | unresolved token literal: "@basePace" |
| lunch | office | Location_Based | תחילת שבוע: חוזרים למסלול | יום ראשון הגיע. משתמש, בוא ננקה את ה'עייפות' של הס… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | office | Habit_Maintenance | ידיים חזקות ומרשימות | ידיים חזקות זה משהו שכולם ישימו לב אליו. @בוא ל-29… | כללי | _(no match)_ | 0 | 0 push candidates matched; unresolved token literal: "@בוא" |
| evening | park | Daily_Goal | סוגרים לוג בערב | יום עבודה ארוך נגמר. 29 דקות של כללי לשחרור הלחץ מ… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| evening | park | Inactivity | סוגרים לוג בערב | יום עבודה ארוך נגמר. 28 דקות של כללי לשחרור הלחץ מ… | כללי | מוכן/ה לדו-ספרתי? 10 ק"מ של סיפוק מחכים לך. | 62 |  |
| evening | park | Location_Based | סוגרים שבוע בפארק | סופש הגיע. בוא נסיים אותו חזק עם גוף מלא בפארק. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | park | Habit_Maintenance | סוגרים לוג בערב | יום עבודה ארוך נגמר. 29 דקות של כללי לשחרור הלחץ מ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | home | Daily_Goal | סוגרים לוג בערב | יום עבודה ארוך נגמר. 28 דקות של כללי לשחרור הלחץ מ… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| evening | home | Inactivity | סוגרים לוג בערב | יום עבודה ארוך נגמר. 30 דקות של כללי לשחרור הלחץ מ… | כללי | הסוד הוא עקביות. בוא/י לשמור על קצב @basePace חזק. | 62 | unresolved token literal: "@basePace" |
| evening | home | Location_Based | סוגרים לוג בערב | יום עבודה ארוך נגמר. 29 דקות של כללי לשחרור הלחץ מ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | home | Habit_Maintenance | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל29 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | street | Daily_Goal | סוגרים לוג בערב | יום עבודה ארוך נגמר. 29 דקות של כללי לשחרור הלחץ מ… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| evening | street | Inactivity | סוגרים לוג בערב | יום עבודה ארוך נגמר. 30 דקות של כללי לשחרור הלחץ מ… | כללי | הרגליים כבדות מהטיסה? בוא/י לשחרור קצר שיחזיר לך את האנרגיה. | 62 |  |
| evening | street | Location_Based | סוגרים לוג בערב | יום עבודה ארוך נגמר. 29 דקות של כללי לשחרור הלחץ מ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | street | Habit_Maintenance | סוגרים לוג בערב | יום עבודה ארוך נגמר. 29 דקות של כללי לשחרור הלחץ מ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | gym | Daily_Goal | סוגרים לוג בערב | יום עבודה ארוך נגמר. 29 דקות של כללי לשחרור הלחץ מ… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| evening | gym | Inactivity | סוגרים לוג בערב | יום עבודה ארוך נגמר. 30 דקות של כללי לשחרור הלחץ מ… | כללי | מרגיש/ה כבדות? משתמש, בוא/י לאימון שחרור קליל שיחזיר לך את ה… | 62 |  |
| evening | gym | Location_Based | סוגרים לוג בערב | יום עבודה ארוך נגמר. 29 דקות של כללי לשחרור הלחץ מ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | gym | Habit_Maintenance | סוגרים לוג בערב | יום עבודה ארוך נגמר. 29 דקות של כללי לשחרור הלחץ מ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | office | Daily_Goal | סוגרים לוג בערב | יום עבודה ארוך נגמר. 29 דקות של כללי לשחרור הלחץ מ… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| evening | office | Inactivity | סוגרים לוג בערב | יום עבודה ארוך נגמר. 30 דקות של כללי לשחרור הלחץ מ… | כללי | ה@מיקום מחכה לדיוק שלך. @זמן_אימון דקות של @קטגוריה טכנית. | 62 | unresolved token literal: "@מיקום" |
| evening | office | Location_Based | סוגרים לוג בערב | יום עבודה ארוך נגמר. 30 דקות של כללי לשחרור הלחץ מ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | office | Habit_Maintenance | סוגרים לוג בערב | יום עבודה ארוך נגמר. 30 דקות של כללי לשחרור הלחץ מ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | park | Daily_Goal | סוגרים שבוע בפארק | סופש הגיע. בוא נסיים אותו חזק עם גוף מלא בפארק. | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| night | park | Inactivity | סוגרים שבוע בפארק | סופש הגיע. בוא נסיים אותו חזק עם גוף מלא בפארק. | כללי | בדרך למרוץ 10 ק"מ? בוא/י לאימון הכנה מדויק. | 62 |  |
| night | park | Location_Based | אימון גינה בזמן שהם משחקים | סופש הגיע. בוא נסיים אותו חזק עם גוף מלא בפארק. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | park | Habit_Maintenance | סוגרים שבוע בפארק | סופש הגיע. בוא נסיים אותו חזק עם גוף מלא בפארק. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | home | Daily_Goal | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל30 דקות של כללי. | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| night | home | Inactivity | עובדים על השלב הנוכחי | תראה להם מה זה כוח רצון. היום עובדים על השלב הנוכח… | כללי | בונים כושר ב@מיקום. בוא/י לאימון שלב ה-Build לשיפור הקצב. | 62 | unresolved token literal: "@מיקום" |
| night | home | Location_Based | עובדים על השלב הנוכחי | תראה להם מה זה כוח רצון. היום עובדים על השלב הנוכח… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | home | Habit_Maintenance | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל29 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | street | Daily_Goal | סוגרים פערים, אבא | משתמש, אבא עקבי הוא אבא חזק. אתה ב-0% - כמעט שם. | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| night | street | Inactivity | אימון גינה בזמן שהם משחקים | כדי להרים אותם בלי כאבים, בוא נחזק גוף מלא במאתגר … | כללי | 3 ק"מ של עוצמה. בוא/י לשפר את המהירות המקסימלית. | 62 |  |
| night | street | Location_Based | ספרינט חיטוב לאמא בדרכים | ידיים חזקות זה משהו שכולם ישימו לב אליו. @בוא ל-30… | כללי | _(no match)_ | 0 | 0 push candidates matched; unresolved token literal: "@בוא" |
| night | street | Habit_Maintenance | סוגרים פערים בבאקלוג | יש לנו מאוזן בגוף מלא. בוא נסגור אותו עכשיו ב28 דק… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | gym | Daily_Goal | לנצל את השמש: אימון במכון כושר | המזג אוויר מושלם לתנועה בחוץ. 29 דקות של כללי במכו… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| night | gym | Inactivity | סוגרים פערים בבאקלוג | יש לנו מאוזן בגוף מלא. בוא נסגור אותו עכשיו ב30 דק… | כללי | הסוד הוא עקביות. בוא/י לשמור על קצב @basePace חזק. | 62 | unresolved token literal: "@basePace" |
| night | gym | Location_Based | שורפים קלוריות, לא זמן | שורפים קלוריות ביעילות. מראה שאנחנו בדרך ליעד השבו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | gym | Habit_Maintenance | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 30 דקות למתיחות במשרד והג… | כללי | _(no match)_ | 0 | 0 push candidates matched; desk-theme content at a non-desk location |
| night | office | Daily_Goal | להתעורר לפני הלימודים | לפני שנכנסים לכיתה, בוא להעיר את הגוף עם כללי במאת… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| night | office | Inactivity | סוגרת פערים בגוף מלא | לא התראינו @ימי_אי_פעילות ימים. בגלל התחלה טובה חו… | כללי | עוד שלב בדרך ליעד. שבוע @weekNumber מחכה שתכבוש/י אותו. | 62 | unresolved token literal: "@ימי_אי_פעילות" |
| night | office | Location_Based | בוקר של נחת: הנעת מפרקים | בוקר טוב משתמש. בוא נפתח את היום ב29 דקות של הנעת … | כללי | _(no match)_ | 0 | 0 push candidates matched; "morning" wording outside the morning slot |
| night | office | Habit_Maintenance | סוגרים פערים בבאקלוג | יש לנו מאוזן בגוף מלא. בוא נסגור אותו עכשיו ב30 דק… | כללי | _(no match)_ | 0 | 0 push candidates matched |
