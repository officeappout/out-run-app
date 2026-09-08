# Notification/Content Coherence Sweep

Generated 2026-09-08 · 560 scenarios (7 personas × 4 times × 5 locations × 4 push triggers) in 85434ms.

**Read-only. No Firestore writes, no FCM sends, no deploy.** Home content via the real `generateHomeWorkoutTrio` → `resolveWorkoutMetadata` (live `workoutMetadata/{workoutTitles,smartDescriptions}` reads). Push content via the real `selectNotificationContent`/`personaliseNotificationText`, imported directly from `functions/src/services/notification-content.service.ts` (live `workoutMetadata/notifications/notifications` reads via Admin SDK) — the exact functions `stepGoalNudgeScheduler.ts`/`onPlannedActivityCreated.ts` call in production, not a re-implementation.

## Methodology & honest limitations

- Exercises/programs/gym-equipment are read from the **frozen** invariants-gate fixture (`tests/invariants/fixtures/`), not live — that layer isn't under audit here and re-fetching it 560× would be slow. `workoutMetadata` and the notification library ARE live, on purpose.
- One fixed representative user profile (level 12, balanced domain levels, home gear) — only persona/time/location/trigger vary, so those are the isolated variables. Exercise-selection correctness is the invariants gate's job, not this sweep's.
- Time buckets map to representative hours: morning=08:30, lunch=13:00 (inside the real Desk Reset Boost window), evening=19:00, night=22:00. The Parent Time-Window Boost's second window (16:00-17:30, park/pickup) isn't separately covered — only 4 buckets were requested.
- `Daily_Goal` push queries use `dailyGoalBucket: 'mid'`; `activityType` is left unset. A different bucket choice would surface different candidates for that trigger.
- **Coherence flags are mechanical keyword checks lifted directly from the real production guards** (workout-metadata.service.ts's own location/airport/desk keyword lists) — not semantic/NLP judgment. A flag means a real production keyword-vocabulary term showed up somewhere it self-evidently shouldn't (e.g. an airport word outside `location=airport`). Absence of a flag is NOT proof of coherence — it only means these specific mechanical checks found nothing.
- **Push vs. home-title "match" is deliberately NOT auto-flagged.** Per the earlier push-infrastructure audit, push and home content are architecturally unrelated systems today (no live push reads the workout-generation pipeline) — so push and title routinely being about different things is the *expected*, structural state, not a per-row bug. Both are shown side by side in the table below for a human to judge case-by-case; treat the whole "push has nothing to do with the workout" finding as one systemic gap (already reported separately), not 560 individual ones.

## Gap summary

**424/560 scenarios (76%) tripped at least one mechanical flag.**

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
| unresolved token literal: "@בוא" | 68 | 12% |
| "morning" wording outside the morning slot | 26 | 5% |
| home-only content at a non-home location | 18 | 3% |
| unresolved token literal: "@מיקום" | 17 | 3% |
| park-only content at a non-park location | 16 | 3% |
| desk-theme content at a non-desk location | 16 | 3% |
| unresolved token literal: "@זמן_אימון" | 15 | 3% |
| unresolved token literal: "@basePace" | 10 | 2% |
| unresolved token literal: "@weekNumber" | 10 | 2% |
| "night" wording outside the night slot | 8 | 1% |
| unresolved token literal: "@קטגוריה" | 5 | 1% |
| unresolved token literal: "@רמה" | 5 | 1% |
| unresolved token literal: "@פער_שבועי" | 3 | 1% |
| unresolved token literal: "@אחוז_התקדמות_רמה" | 2 | 0% |
| unresolved token literal: "@זמן_הגעה" | 1 | 0% |
| unresolved token literal: "@את" | 1 | 0% |
| "evening" wording outside the evening slot | 1 | 0% |

### Worst persona × time clusters (highest flagged-row rate)

| Persona × time | Flagged / Total | Rate |
|---|---|---|
| student × night | 20/20 | 100% |
| student × morning | 19/20 | 95% |
| student × evening | 19/20 | 95% |
| vatikim × lunch | 19/20 | 95% |
| student × lunch | 18/20 | 90% |
| parent × morning | 17/20 | 85% |
| vatikim × night | 17/20 | 85% |
| parent × lunch | 15/20 | 75% |
| parent × evening | 15/20 | 75% |
| pupil × morning | 15/20 | 75% |
| office_worker × lunch | 15/20 | 75% |
| military × lunch | 15/20 | 75% |
| military × night | 15/20 | 75% |
| vatikim × evening | 15/20 | 75% |
| parent × night | 14/20 | 70% |

### By location

| Location | Flagged / Total | Rate |
|---|---|---|
| park | 79/112 | 71% |
| home | 82/112 | 73% |
| street | 87/112 | 78% |
| gym | 87/112 | 78% |
| office | 89/112 | 79% |

## Full grid (grouped by persona)

### parent (61/80 flagged)

| Time | Location | Trigger | Home Title | Home Desc | Category | Push Text | Push Cand. | Flags |
|---|---|---|---|---|---|---|---|---|
| morning | park | Daily_Goal | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל28 דקות של כללי. | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 |  |
| morning | park | Inactivity | ריצת בוקר אחרי הפיזור | בוקר בפארק לפני הקמפוס — 29 דקות שממלאות אותך אנרג… | כללי | אבא, הפארק קרוב! @זמן_הגעה דקות של אימון @קטגוריה ו@את/ה אחר… | 103 | unresolved token literal: "@זמן_הגעה" |
| morning | park | Location_Based | הם בגן? עכשיו תורך | בוקר בפארק, אוויר פתוח, ראש צלול. 30 דקות שיכניסו … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | park | Habit_Maintenance | הם בגן? עכשיו תורך | בוקר בפארק, אוויר פתוח, ראש צלול. 28 דקות שיכניסו … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | home | Daily_Goal | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל29 דקות של כללי. | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 3 |  |
| morning | home | Inactivity | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל29 דקות של כללי. | כללי | ה-@basePace שלך השתפר! בוא/י לשבור שיא ב-5 ק"מ. | 103 | unresolved token literal: "@basePace" |
| morning | home | Location_Based | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל29 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | home | Habit_Maintenance | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל29 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | street | Daily_Goal | ריצת בוקר אחרי הפיזור | בוקר בפארק, אוויר פתוח, ראש צלול. 28 דקות שיכניסו … | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 | park-only content at a non-park location |
| morning | street | Inactivity | הם בגן? עכשיו תורך | בוקר בפארק לפני הכל. 29 דקות שממלאות אותך אנרגיה ל… | כללי | זמן להתאושש. בוא/י לאימון בנייה מחדש כדי להמשיך חזק יותר. | 103 | park-only content at a non-park location |
| morning | street | Location_Based | הם בגן? עכשיו תורך | בוקר בפארק לפני הכל. 30 דקות שממלאות אותך אנרגיה ל… | כללי | _(no match)_ | 0 | 0 push candidates matched; park-only content at a non-park location |
| morning | street | Habit_Maintenance | רגע לפני העבודה: בוסט אנרגיה | 28 דקות ממוקדות מוקדם בבוקר — הבסיס ליום ברמה שלך. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | gym | Daily_Goal | אימון שקט לפני שהילדים קמים | הבית עוד שקט. בוא ננצל את זה ל29 דקות של כללי. | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 |  |
| morning | gym | Inactivity | רגע לפני העבודה: בוסט אנרגיה | בוקר בפארק לפני הקמפוס — 30 דקות שממלאות אותך אנרג… | כללי | הם שקועים במשחק? @בוא/י ל@זמן_אימון דקות של @קטגוריה. | 103 | unresolved token literal: "@בוא"; park-only content at a non-park location |
| morning | gym | Location_Based | הם בגן? עכשיו תורך | לפני שהיום נחטף — 29 דקות שמעירות אותך ומכניסות פו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | gym | Habit_Maintenance | שקט של בוקר: 30 דקות אמא | בוקר בפארק לפני הקמפוס — 30 דקות שממלאות אותך אנרג… | כללי | _(no match)_ | 0 | 0 push candidates matched; park-only content at a non-park location |
| morning | office | Daily_Goal | הם בגן? עכשיו תורך | בוקר בפארק, אוויר פתוח, ראש צלול. 30 דקות שיכניסו … | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 3 | park-only content at a non-park location |
| morning | office | Inactivity | הם בגן? עכשיו תורך | 28 דקות ממוקדות מוקדם בבוקר — הבסיס ליום ברמה שלך. | כללי | קיץ בפתח! בוא/י לעבוד על הגזרה ב@זמן_אימון דקות ממוקדות. | 103 | unresolved token literal: "@זמן_אימון" |
| morning | office | Location_Based | ריצת בוקר אחרי הפיזור | 29 דקות ממוקדות מוקדם בבוקר — הבסיס ליום ברמה שלך. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | office | Habit_Maintenance | ריצת בוקר אחרי הפיזור | בוקר בפארק לפני הכל. 30 דקות שממלאות אותך אנרגיה ל… | כללי | _(no match)_ | 0 | 0 push candidates matched; park-only content at a non-park location |
| lunch | park | Daily_Goal | חיטוב בזמן שהם משחקים | עבודה, ילדים, עומס... בוא נשמור על הגב בפארק. | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 |  |
| lunch | park | Inactivity | חיטוב בזמן שהם משחקים | היום נגמר, עכשיו תורך. 30 דקות של שקט בשבילך. | כללי | זמן לשקט שלך משתמש. בוא/י לריצה קלה ב@מיקום, רק את/ה והאוויר… | 103 | unresolved token literal: "@מיקום" |
| lunch | park | Location_Based | חיטוב בזמן שהם משחקים | היום נגמר, עכשיו תורך. 28 דקות של שקט בשבילך. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | park | Habit_Maintenance | חיטוב בזמן שהם משחקים | היום נגמר, עכשיו תורך. 29 דקות של שקט בשבילך. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | home | Daily_Goal | ספרינט חיטוב לאמא בדרכים | הבית עוד שקט. בוא ננצל את זה ל30 דקות של כללי. | כללי | גם עם כל הריצות אחרי הילדים — נשארו רק 1,500 צעדים ליעד | 3 |  |
| lunch | home | Inactivity | חיטוב בזמן שהם משחקים | סופש הגיע. בוא נסיים אותו חזק עם גוף מלא בבית. | כללי | חצי דרך מאחוריך! שבוע @weekNumber בתוכנית ה-@targetDistanceL… | 103 | unresolved token literal: "@weekNumber" |
| lunch | home | Location_Based | חיטוב בזמן שהם משחקים | בדרך לים או לבריכה? בוא לבוסט מהיר של גוף מלא_פיזי… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | home | Habit_Maintenance | ספרינט חיטוב לאמא בדרכים | לילה קשוח? בגלל התחלה טובה התאמתי לך אימון מאתגר. | כללי | _(no match)_ | 0 | 0 push candidates matched; "night" wording outside the night slot |
| lunch | street | Daily_Goal | חיטוב בזמן שהם משחקים | משתמש, אבא עקבי הוא אבא חזק. אתה ב-0% - כמעט שם. | כללי | גם עם כל הריצות אחרי הילדים — נשארו רק 1,500 צעדים ליעד | 3 |  |
| lunch | street | Inactivity | ספרינט חיטוב לאמא בדרכים | הם בנדנדות, אתה בגוף מלא. ניצול זמן ברחוב. | כללי | זקוקה לריסטרט? @זמן_אימון דקות של @קטגוריה והכל נראה אחרת. | 103 | unresolved token literal: "@זמן_אימון" |
| lunch | street | Location_Based | חיטוב בזמן שהם משחקים | לילה קשוח? בגלל התחלה טובה התאמתי לך אימון מאתגר. | כללי | _(no match)_ | 0 | 0 push candidates matched; "night" wording outside the night slot |
| lunch | street | Habit_Maintenance | ספרינט חיטוב לאמא בדרכים | הגשם לא עוצר אותנו. בוא ל30 דקות של עבודה מהבית כד… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | gym | Daily_Goal | ספרינט חיטוב לאמא בדרכים | משתמש, אבא עקבי הוא אבא חזק. אתה ב-0% - כמעט שם. | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 |  |
| lunch | gym | Inactivity | חיטוב בזמן שהם משחקים | הגשם לא עוצר אותנו. בוא ל29 דקות של עבודה מהבית כד… | כללי | משתמש, קחי @זמן_אימון דקות לעצמך לפני שהבית מתעורר. @קטגוריה… | 103 | unresolved token literal: "@זמן_אימון" |
| lunch | gym | Location_Based | ספרינט חיטוב לאמא בדרכים | הגשם לא עוצר אותנו. בוא ל29 דקות של עבודה מהבית כד… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | gym | Habit_Maintenance | ספרינט חיטוב לאמא בדרכים | הם בעיסוקים שלהם? בוא ננצל את זה ל28 דקות של גוף מ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | office | Daily_Goal | ספרינט חיטוב לאמא בדרכים | הגשם לא עוצר אותנו. בוא ל29 דקות של עבודה מהבית כד… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 |  |
| lunch | office | Inactivity | ספרינט חיטוב לאמא בדרכים | לילה קשוח? בגלל התחלה טובה התאמתי לך אימון מאתגר. | כללי | הרגליים כבדות מהטיסה? בוא/י לשחרור קצר שיחזיר לך את האנרגיה. | 103 | "night" wording outside the night slot |
| lunch | office | Location_Based | חיטוב בזמן שהם משחקים | הם בעיסוקים שלהם? בוא ננצל את זה ל30 דקות של גוף מ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | office | Habit_Maintenance | חיטוב בזמן שהם משחקים | תראה להם מה זה כוח רצון. היום עובדים על השלב הנוכח… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | park | Daily_Goal | חיטוב בזמן שהם משחקים | עבודה, ילדים, עומס... בוא נשמור על הגב בפארק. | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 |  |
| evening | park | Inactivity | חיטוב בזמן שהם משחקים | היום נגמר, עכשיו תורך. 29 דקות של שקט בשבילך. | כללי | משתמש, נשאר רק @פער_שבועי לסיום היעד השבועי. בוא/י נסגור את … | 103 | unresolved token literal: "@פער_שבועי" |
| evening | park | Location_Based | חיטוב בזמן שהם משחקים | הם בנדנדות, אתה בגוף מלא. ניצול זמן בפארק. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | park | Habit_Maintenance | חיטוב בזמן שהם משחקים | הם בעיסוקים שלהם? בוא ננצל את זה ל29 דקות של גוף מ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | home | Daily_Goal | ניקוי ראש של ערב | היום נגמר, עכשיו תורך. 29 דקות של שקט בשבילך. | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 3 |  |
| evening | home | Inactivity | חיטוב בזמן שהם משחקים | היום נגמר, עכשיו תורך. 28 דקות של שקט בשבילך. | כללי | חצי דרך מאחוריך! שבוע @weekNumber בתוכנית ה-@targetDistanceL… | 103 | unresolved token literal: "@weekNumber" |
| evening | home | Location_Based | חיטוב בזמן שהם משחקים | הם בעיסוקים שלהם? בוא ננצל את זה ל30 דקות של גוף מ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | home | Habit_Maintenance | ניקוי ראש של ערב | היום נגמר, עכשיו תורך. 30 דקות של שקט בשבילך. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | street | Daily_Goal | חיטוב בזמן שהם משחקים | הם בנדנדות, אתה בגוף מלא. ניצול זמן ברחוב. | כללי | גם עם כל הריצות אחרי הילדים — נשארו רק 1,500 צעדים ליעד | 3 |  |
| evening | street | Inactivity | חיטוב בזמן שהם משחקים | בדרך לים או לבריכה? בוא לבוסט מהיר של גוף מלא_פיזי… | כללי | 5 ק"מ ראשונים בפתח. משתמש, בוא/י לעשות היסטוריה אישית. | 103 |  |
| evening | street | Location_Based | חיטוב בזמן שהם משחקים | כדי להרים אותם בלי כאבים, בוא נחזק גוף מלא במאתגר … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | street | Habit_Maintenance | ספרינט חיטוב לאמא בדרכים | כדי להרים אותם בלי כאבים, בוא נחזק גוף מלא במאתגר … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | gym | Daily_Goal | חיטוב בזמן שהם משחקים | בדרך לים או לבריכה? בוא לבוסט מהיר של גוף מלא_פיזי… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 |  |
| evening | gym | Inactivity | חיטוב בזמן שהם משחקים | היום נגמר, עכשיו תורך. 28 דקות של שקט בשבילך. | כללי | משתמש, היום ב@מיקום מתקרבים ל@תרגיל_יעד. @זמן_אימון דקות של … | 103 | unresolved token literal: "@מיקום" |
| evening | gym | Location_Based | חיטוב בזמן שהם משחקים | הגשם לא עוצר אותנו. בוא ל30 דקות של עבודה מהבית כד… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | gym | Habit_Maintenance | חיטוב בזמן שהם משחקים | תראה להם מה זה כוח רצון. היום עובדים על השלב הנוכח… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | office | Daily_Goal | חיטוב בזמן שהם משחקים | לילה קשוח? בגלל התחלה טובה התאמתי לך אימון מאתגר. | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 | "night" wording outside the night slot |
| evening | office | Inactivity | ספרינט חיטוב לאמא בדרכים | הגשם לא עוצר אותנו. בוא ל30 דקות של עבודה מהבית כד… | כללי | רק עוד קצת! @אחוז_התקדמות_רמה ואבא עובר ל-@רמה_הבאה. | 103 | unresolved token literal: "@אחוז_התקדמות_רמה" |
| evening | office | Location_Based | ספרינט חיטוב לאמא בדרכים | סופש הגיע. בוא נסיים אותו חזק עם גוף מלא במשרד. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | office | Habit_Maintenance | ספרינט חיטוב לאמא בדרכים | משתמש, אבא עקבי הוא אבא חזק. אתה ב-0% - כמעט שם. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | park | Daily_Goal | חיטוב בזמן שהם משחקים | משתמש, אבא עקבי הוא אבא חזק. אתה ב-0% - כמעט שם. | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 3 |  |
| night | park | Inactivity | חיטוב בזמן שהם משחקים | תראה להם מה זה כוח רצון. היום עובדים על השלב הנוכח… | כללי | נחיתה רכה משתמש! בוא/י לשחרר את הגב מהטיסה ב@מיקום. | 103 | unresolved token literal: "@מיקום" |
| night | park | Location_Based | חיטוב בזמן שהם משחקים | בדרך לים או לבריכה? בוא לבוסט מהיר של גוף מלא_פיזי… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | park | Habit_Maintenance | חיטוב בזמן שהם משחקים | סופש הגיע. בוא נסיים אותו חזק עם גוף מלא בפארק. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | home | Daily_Goal | ספרינט חיטוב לאמא בדרכים | עבודה, ילדים, עומס... בוא נשמור על הגב בבית. | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 |  |
| night | home | Inactivity | ספרינט חיטוב לאמא בדרכים | עבודה, ילדים, עומס... בוא נשמור על הגב בבית. | כללי | אמא, נשאר לך @פער_שבועי קטן. @בוא/י לסגור אותו עכשיו. | 103 | unresolved token literal: "@פער_שבועי" |
| night | home | Location_Based | חיטוב בזמן שהם משחקים | סופש הגיע. בוא נסיים אותו חזק עם גוף מלא בבית. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | home | Habit_Maintenance | חיטוב בזמן שהם משחקים | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | street | Daily_Goal | חיטוב בזמן שהם משחקים | סופש הגיע. בוא נסיים אותו חזק עם גוף מלא ברחוב. | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 3 |  |
| night | street | Inactivity | ספרינט חיטוב לאמא בדרכים | משתמש, אבא עקבי הוא אבא חזק. אתה ב-0% - כמעט שם. | כללי | ריצת 5 ק"מ ב-Flow. בוא/י לראות כמה ה-@basePace נהיה קל. | 103 | unresolved token literal: "@basePace" |
| night | street | Location_Based | ספרינט חיטוב לאמא בדרכים | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | street | Habit_Maintenance | חיטוב בזמן שהם משחקים | כדי להרים אותם בלי כאבים, בוא נחזק גוף מלא במאתגר … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | gym | Daily_Goal | חיטוב בזמן שהם משחקים | הגשם לא עוצר אותנו. בוא ל29 דקות של עבודה מהבית כד… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 |  |
| night | gym | Inactivity | חיטוב בזמן שהם משחקים | לילה קשוח? בגלל התחלה טובה התאמתי לך אימון מאתגר. | כללי | בדרך לקצב בסיס חדש! משתמש, בוא/י לשבור שיא אישי. | 103 |  |
| night | gym | Location_Based | חיטוב בזמן שהם משחקים | בדרך לים או לבריכה? בוא לבוסט מהיר של גוף מלא_פיזי… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | gym | Habit_Maintenance | ספרינט חיטוב לאמא בדרכים | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | office | Daily_Goal | ספרינט חיטוב לאמא בדרכים | הבית עוד שקט. בוא ננצל את זה ל29 דקות של כללי. | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 3 |  |
| night | office | Inactivity | ספרינט חיטוב לאמא בדרכים | בדרך לים או לבריכה? בוא לבוסט מהיר של גוף מלא_פיזי… | כללי | ה-@basePace שלך השתפר! בוא/י לשבור שיא ב-5 ק"מ. | 103 | unresolved token literal: "@basePace" |
| night | office | Location_Based | חיטוב בזמן שהם משחקים | הבית עוד שקט. בוא ננצל את זה ל29 דקות של כללי. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | office | Habit_Maintenance | ספרינט חיטוב לאמא בדרכים | הגשם לא עוצר אותנו. בוא ל29 דקות של עבודה מהבית כד… | כללי | _(no match)_ | 0 | 0 push candidates matched |

### student (76/80 flagged)

| Time | Location | Trigger | Home Title | Home Desc | Category | Push Text | Push Cand. | Flags |
|---|---|---|---|---|---|---|---|---|
| morning | park | Daily_Goal | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 | unresolved token literal: "@בוא" |
| morning | park | Inactivity | לפתוח את היום באוויר | בוקר בפארק לפני הקמפוס — 29 דקות שממלאות אותך אנרג… | כללי | הקצב שלך השתפר, משתמש! בוא/י לבוסט ל-@basePace. | 88 | unresolved token literal: "@basePace" |
| morning | park | Location_Based | לפתוח את היום באוויר | בוקר בפארק לפני הקמפוס — 30 דקות שממלאות אותך אנרג… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | park | Habit_Maintenance | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | _(no match)_ | 0 | 0 push candidates matched; unresolved token literal: "@בוא" |
| morning | home | Daily_Goal | להתחיל לפני ההרצאות | לפני שהיום נחטף — 29 דקות שמעירות אותך ומכניסות פו… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| morning | home | Inactivity | להתחיל לפני ההרצאות | לפני שהיום נחטף — 29 דקות שמעירות אותך ומכניסות פו… | כללי | מספיק מסכים להיום. @בוא/י ל-@זמן_אימון דקות של ריסטרט לגוף. | 88 | unresolved token literal: "@בוא" |
| morning | home | Location_Based | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | _(no match)_ | 0 | 0 push candidates matched; unresolved token literal: "@בוא" |
| morning | home | Habit_Maintenance | להתחיל לפני ההרצאות | לפני שהיום נחטף — 28 דקות שמעירות אותך ומכניסות פו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | street | Daily_Goal | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 | unresolved token literal: "@בוא" |
| morning | street | Inactivity | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | קיץ בפתח! בוא/י לעבוד על הגזרה ב@זמן_אימון דקות ממוקדות. | 88 | unresolved token literal: "@בוא" |
| morning | street | Location_Based | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | _(no match)_ | 0 | 0 push candidates matched; unresolved token literal: "@בוא" |
| morning | street | Habit_Maintenance | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | _(no match)_ | 0 | 0 push candidates matched; unresolved token literal: "@בוא" |
| morning | gym | Daily_Goal | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 | unresolved token literal: "@בוא" |
| morning | gym | Inactivity | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | משתמש, ה@מיקום מוכן. @זמן_אימון דקות של @קטגוריה ברמה גבוהה … | 88 | unresolved token literal: "@בוא" |
| morning | gym | Location_Based | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | _(no match)_ | 0 | 0 push candidates matched; unresolved token literal: "@בוא" |
| morning | gym | Habit_Maintenance | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | _(no match)_ | 0 | 0 push candidates matched; unresolved token literal: "@בוא" |
| morning | office | Daily_Goal | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 | unresolved token literal: "@בוא" |
| morning | office | Inactivity | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | חמישי שמח משתמש! סוגרים שבוע באימון peak ב@מיקום. | 88 | unresolved token literal: "@בוא" |
| morning | office | Location_Based | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | _(no match)_ | 0 | 0 push candidates matched; unresolved token literal: "@בוא" |
| morning | office | Habit_Maintenance | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | _(no match)_ | 0 | 0 push candidates matched; unresolved token literal: "@בוא" |
| lunch | park | Daily_Goal | ריסטרט על הכיסא בספרייה | הגב נרדם בספרייה? בוא ל-28 דקות של מתיחות על הכיסא… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 | desk-theme content at a non-desk location |
| lunch | park | Inactivity | ריסטרט על הכיסא בספרייה | הגב נרדם בספרייה? בוא ל-29 דקות של מתיחות על הכיסא… | כללי | חמישי שמח משתמש! סוגרים שבוע באימון peak ב@מיקום. | 88 | unresolved token literal: "@מיקום"; desk-theme content at a non-desk location |
| lunch | park | Location_Based | ריסטרט על הכיסא בספרייה | הגב נרדם בספרייה? בוא ל-29 דקות של מתיחות על הכיסא… | כללי | _(no match)_ | 0 | 0 push candidates matched; desk-theme content at a non-desk location |
| lunch | park | Habit_Maintenance | ריסטרט על הכיסא בספרייה | הגב נרדם בספרייה? בוא ל-29 דקות של מתיחות על הכיסא… | כללי | _(no match)_ | 0 | 0 push candidates matched; desk-theme content at a non-desk location |
| lunch | home | Daily_Goal | ריסטרט על הכיסא בספרייה | הגב נרדם בספרייה? בוא ל-30 דקות של מתיחות על הכיסא… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| lunch | home | Inactivity | תחזוקת גב ליושבי הספרייה | יצאת מהספרייה? בוא לנצל את האוויר בבית לאימון גוף … | כללי | @את/ה ב-@אחוז_התקדמות_רמה ל@רמה_הבאה. בוא/י לסיים חזק. | 88 | unresolved token literal: "@את" |
| lunch | home | Location_Based | ריסטרט על הכיסא בספרייה | הגב נרדם בספרייה? בוא ל-28 דקות של מתיחות על הכיסא… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | home | Habit_Maintenance | ריסטרט על הכיסא בספרייה | הגב נרדם בספרייה? בוא ל-29 דקות של מתיחות על הכיסא… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | street | Daily_Goal | ריסטרט על הכיסא בספרייה | הגב נרדם בספרייה? בוא ל-29 דקות של מתיחות על הכיסא… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 | desk-theme content at a non-desk location |
| lunch | street | Inactivity | ריסטרט על הכיסא בספרייה | הגב נרדם בספרייה? בוא ל-29 דקות של מתיחות על הכיסא… | כללי | רוצה להיראות חזק/ה וקליל/ה? בוא/י לסטריידים מהירים בסיום הרי… | 88 | desk-theme content at a non-desk location |
| lunch | street | Location_Based | ריסטרט על הכיסא בספרייה | הגב נרדם בספרייה? בוא ל-30 דקות של מתיחות על הכיסא… | כללי | _(no match)_ | 0 | 0 push candidates matched; desk-theme content at a non-desk location |
| lunch | street | Habit_Maintenance | תחזוקת גב ליושבי הספרייה | יצאת מהספרייה? בוא לנצל את האוויר ברחוב לאימון גוף… | כללי | _(no match)_ | 0 | 0 push candidates matched; desk-theme content at a non-desk location |
| lunch | gym | Daily_Goal | ריסטרט על הכיסא בספרייה | הגב נרדם בספרייה? בוא ל-30 דקות של מתיחות על הכיסא… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 | desk-theme content at a non-desk location |
| lunch | gym | Inactivity | ריסטרט על הכיסא בספרייה | הגב נרדם בספרייה? בוא ל-28 דקות של מתיחות על הכיסא… | כללי | זמן לחתוך זמנים ב-10 ק"מ. בוא/י נשפר את הקצב היום. | 88 | desk-theme content at a non-desk location |
| lunch | gym | Location_Based | ריסטרט על הכיסא בספרייה | הגב נרדם בספרייה? בוא ל-29 דקות של מתיחות על הכיסא… | כללי | _(no match)_ | 0 | 0 push candidates matched; desk-theme content at a non-desk location |
| lunch | gym | Habit_Maintenance | ריסטרט על הכיסא בספרייה | הגב נרדם בספרייה? בוא ל-29 דקות של מתיחות על הכיסא… | כללי | _(no match)_ | 0 | 0 push candidates matched; desk-theme content at a non-desk location |
| lunch | office | Daily_Goal | תחזוקת גב ליושבי הספרייה | יצאת מהספרייה? בוא לנצל את האוויר במשרד לאימון גוף… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| lunch | office | Inactivity | ריסטרט על הכיסא בספרייה | הגב נרדם בספרייה? בוא ל-29 דקות של מתיחות על הכיסא… | כללי | זמן ל@קטגוריה. צא/י ל@מיקום ל-@זמן_אימון דקות של עבודה נקייה… | 88 | unresolved token literal: "@קטגוריה" |
| lunch | office | Location_Based | ריסטרט על הכיסא בספרייה | הגב נרדם בספרייה? בוא ל-28 דקות של מתיחות על הכיסא… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | office | Habit_Maintenance | ריסטרט על הכיסא בספרייה | הגב נרדם בספרייה? בוא ל-26 דקות של מתיחות על הכיסא… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | park | Daily_Goal | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 | unresolved token literal: "@בוא" |
| evening | park | Inactivity | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | חמישי שמח משתמש! סוגרים שבוע באימון peak ב@מיקום. | 88 | unresolved token literal: "@בוא" |
| evening | park | Location_Based | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | _(no match)_ | 0 | 0 push candidates matched; unresolved token literal: "@בוא" |
| evening | park | Habit_Maintenance | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | _(no match)_ | 0 | 0 push candidates matched; unresolved token literal: "@בוא" |
| evening | home | Daily_Goal | לסגור יום עמוס | אחרי יום של לימודים ומטלות — 30 דקות שמשחררות את ה… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| evening | home | Inactivity | לסגור יום עמוס | אחרי יום של לימודים ומטלות — 29 דקות שמשחררות את ה… | כללי | קיץ בפתח! בוא/י לעבוד על הגזרה ב@זמן_אימון דקות ממוקדות. | 88 | unresolved token literal: "@זמן_אימון" |
| evening | home | Location_Based | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | _(no match)_ | 0 | 0 push candidates matched; unresolved token literal: "@בוא" |
| evening | home | Habit_Maintenance | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | _(no match)_ | 0 | 0 push candidates matched; unresolved token literal: "@בוא" |
| evening | street | Daily_Goal | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 | unresolved token literal: "@בוא" |
| evening | street | Inactivity | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | שבוע חדש, אנרגיה חדשה. @בוא/י לאימון התנעה ב@מיקום. | 88 | unresolved token literal: "@בוא" |
| evening | street | Location_Based | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | _(no match)_ | 0 | 0 push candidates matched; unresolved token literal: "@בוא" |
| evening | street | Habit_Maintenance | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | _(no match)_ | 0 | 0 push candidates matched; unresolved token literal: "@בוא" |
| evening | gym | Daily_Goal | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 | unresolved token literal: "@בוא" |
| evening | gym | Inactivity | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | בלחץ של דדליין? אימון @עצימות קצר יסדר לך את הפוקוס. | 88 | unresolved token literal: "@בוא" |
| evening | gym | Location_Based | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | _(no match)_ | 0 | 0 push candidates matched; unresolved token literal: "@בוא" |
| evening | gym | Habit_Maintenance | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | _(no match)_ | 0 | 0 push candidates matched; unresolved token literal: "@בוא" |
| evening | office | Daily_Goal | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 | unresolved token literal: "@בוא" |
| evening | office | Inactivity | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | לוהט בחוץ! @בוא/י לאימון ממוזג ב@מיקום. | 88 | unresolved token literal: "@בוא" |
| evening | office | Location_Based | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | _(no match)_ | 0 | 0 push candidates matched; unresolved token literal: "@בוא" |
| evening | office | Habit_Maintenance | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | _(no match)_ | 0 | 0 push candidates matched; unresolved token literal: "@בוא" |
| night | park | Daily_Goal | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 | unresolved token literal: "@בוא" |
| night | park | Inactivity | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | סומכים על התהליך. שבוע Taper – נחים חזק לקראת היעד. | 88 | unresolved token literal: "@בוא" |
| night | park | Location_Based | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | _(no match)_ | 0 | 0 push candidates matched; unresolved token literal: "@בוא" |
| night | park | Habit_Maintenance | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | _(no match)_ | 0 | 0 push candidates matched; unresolved token literal: "@בוא" |
| night | home | Daily_Goal | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 | unresolved token literal: "@בוא" |
| night | home | Inactivity | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | אין זמן ללמוד? תמיד יש @זמן_אימון דקות לאימון ספרינט. | 88 | unresolved token literal: "@בוא" |
| night | home | Location_Based | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | _(no match)_ | 0 | 0 push candidates matched; unresolved token literal: "@בוא" |
| night | home | Habit_Maintenance | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | _(no match)_ | 0 | 0 push candidates matched; unresolved token literal: "@בוא" |
| night | street | Daily_Goal | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 | unresolved token literal: "@בוא" |
| night | street | Inactivity | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | אין זמן ללמוד? תמיד יש @זמן_אימון דקות לאימון ספרינט. | 88 | unresolved token literal: "@בוא" |
| night | street | Location_Based | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | _(no match)_ | 0 | 0 push candidates matched; unresolved token literal: "@בוא" |
| night | street | Habit_Maintenance | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | _(no match)_ | 0 | 0 push candidates matched; unresolved token literal: "@בוא" |
| night | gym | Daily_Goal | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 | unresolved token literal: "@בוא" |
| night | gym | Inactivity | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | הים מחכה. @בוא לסגור אימון שישפר לך את המראה. | 88 | unresolved token literal: "@בוא" |
| night | gym | Location_Based | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | _(no match)_ | 0 | 0 push candidates matched; unresolved token literal: "@בוא" |
| night | gym | Habit_Maintenance | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | _(no match)_ | 0 | 0 push candidates matched; unresolved token literal: "@בוא" |
| night | office | Daily_Goal | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 | unresolved token literal: "@בוא" |
| night | office | Inactivity | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | שבוע Taper התחיל. פחות ריצה, יותר מנוחה. סומכים על התהליך. | 88 | unresolved token literal: "@בוא" |
| night | office | Location_Based | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | _(no match)_ | 0 | 0 push candidates matched; unresolved token literal: "@בוא" |
| night | office | Habit_Maintenance | להגיע לים הכי מוכן שיש | הקיץ מתקרב. @בוא נתמקד בחיזוק פלג גוף עליון בגוף מ… | כללי | _(no match)_ | 0 | 0 push candidates matched; unresolved token literal: "@בוא" |

### pupil (55/80 flagged)

| Time | Location | Trigger | Home Title | Home Desc | Category | Push Text | Push Cand. | Flags |
|---|---|---|---|---|---|---|---|---|
| morning | park | Daily_Goal | לצאת את היום בתנועה | בוקר בפארק לפני הכל. 30 דקות שממלאות אותך אנרגיה ל… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| morning | park | Inactivity | לצאת את היום בתנועה | בוקר בפארק לפני הכל. 28 דקות שממלאות אותך אנרגיה ל… | כללי | משתמש, ה@מיקום מוכן. @זמן_אימון דקות של @קטגוריה ברמה גבוהה … | 62 | unresolved token literal: "@מיקום" |
| morning | park | Location_Based | לצאת את היום בתנועה | בוקר בפארק לפני הכל. 29 דקות שממלאות אותך אנרגיה ל… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | park | Habit_Maintenance | לצאת את היום בתנועה | בוקר בפארק לפני הכל. 30 דקות שממלאות אותך אנרגיה ל… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | home | Daily_Goal | לפתוח את היום לפני בית הספר | לפני שיוצאים ליום — 29 דקות קצרות שמעירות את הגוף … | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| morning | home | Inactivity | לפתוח את היום לפני בית הספר | לפני שיוצאים ליום — 29 דקות קצרות שמעירות את הגוף … | כללי | זמן להתאושש. בוא/י לאימון בנייה מחדש כדי להמשיך חזק יותר. | 62 |  |
| morning | home | Location_Based | לפתוח את היום לפני בית הספר | לפני שיוצאים ליום — 29 דקות קצרות שמעירות את הגוף … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | home | Habit_Maintenance | לפתוח את היום לפני בית הספר | לפני שיוצאים ליום — 29 דקות קצרות שמעירות את הגוף … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | street | Daily_Goal | לצאת את היום בתנועה | בוקר בפארק לפני הכל. 29 דקות שממלאות אותך אנרגיה ל… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 | park-only content at a non-park location |
| morning | street | Inactivity | לפתוח את היום לפני בית הספר | לפני שיוצאים ליום — 28 דקות קצרות שמעירות את הגוף … | כללי | הקצב שלך עולה! בוא/י לאימון כוח ועליות בשבוע @weekNumber. | 62 | unresolved token literal: "@weekNumber" |
| morning | street | Location_Based | חם בחוץ? אימון קריר בפנים | הטמפרטורות עולות. 28 דקות של כללי במזגן ברחוב כדי … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | street | Habit_Maintenance | לנצל את השמש: אימון ברחוב | המזג אוויר מושלם לתנועה בחוץ. 30 דקות של כללי ברחו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | gym | Daily_Goal | חם בחוץ? אימון קריר בפנים | הטמפרטורות עולות. 28 דקות של כללי במזגן במכון כושר… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| morning | gym | Inactivity | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | יום הריצה הארוכה! בוא/י נבנה היום את הבסיס האירובי שלך. | 62 |  |
| morning | gym | Location_Based | לצאת את היום בתנועה | בוקר בפארק לפני הכל. 29 דקות שממלאות אותך אנרגיה ל… | כללי | _(no match)_ | 0 | 0 push candidates matched; park-only content at a non-park location |
| morning | gym | Habit_Maintenance | ים של אנרגיה: אימון כללי | בדרך לים או לבריכה? בוא לבוסט מהיר של גוף מלא_פיזי… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | office | Daily_Goal | חורף חם: אימון ביתי בסלון | קר בחוץ? הכי כיף להתחמם עם אימון כללי בסלון. 30 דק… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 | home-only content at a non-home location |
| morning | office | Inactivity | לפתוח את היום לפני בית הספר | לפני שיוצאים ליום — 29 דקות קצרות שמעירות את הגוף … | כללי | בונים כושר ב@מיקום. בוא/י לאימון שלב ה-Build לשיפור הקצב. | 62 | unresolved token literal: "@מיקום" |
| morning | office | Location_Based | חם בחוץ? אימון קריר בפנים | הטמפרטורות עולות. 30 דקות של כללי במזגן במשרד כדי … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | office | Habit_Maintenance | לצאת את היום בתנועה | בוקר בפארק לפני הכל. 30 דקות שממלאות אותך אנרגיה ל… | כללי | _(no match)_ | 0 | 0 push candidates matched; park-only content at a non-park location |
| lunch | park | Daily_Goal | לפרוק אחרי יום לימודים | יום ארוך של שיעורים? 29 דקות בפארק לשחרר את הראש ו… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| lunch | park | Inactivity | לפרוק אחרי יום לימודים | יום ארוך של שיעורים? 30 דקות בפארק לשחרר את הראש ו… | כללי | חזקים ב-10 ק"מ. בוא/י לאימון שיבנה לך חוסן מנטלי. | 62 |  |
| lunch | park | Location_Based | לפרוק אחרי יום לימודים | יום ארוך של שיעורים? 28 דקות בפארק לשחרר את הראש ו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | park | Habit_Maintenance | לפרוק אחרי יום לימודים | יום ארוך של שיעורים? 29 דקות בפארק לשחרר את הראש ו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | home | Daily_Goal | הפסקה מהשיעורים | סיימת יום לימודים? 29 דקות בבית להזיז את הגוף ולהר… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| lunch | home | Inactivity | הפסקה מהשיעורים | סיימת יום לימודים? 28 דקות בבית להזיז את הגוף ולהר… | כללי | שבוע חדש, אנרגיה חדשה. @בוא/י לאימון התנעה ב@מיקום. | 62 | unresolved token literal: "@בוא" |
| lunch | home | Location_Based | הפסקה מהשיעורים | סיימת יום לימודים? 29 דקות בבית להזיז את הגוף ולהר… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | home | Habit_Maintenance | הפסקה מהשיעורים | סיימת יום לימודים? 29 דקות בבית להזיז את הגוף ולהר… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | street | Daily_Goal | תנועה בדרך | 29 דקות מהירות בחוץ — כוח ואנרגיה בלי ללכת רחוק. | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| lunch | street | Inactivity | תנועה בדרך | 30 דקות מהירות בחוץ — כוח ואנרגיה בלי ללכת רחוק. | כללי | בחופשה? @זמן_אימון דקות של @קטגוריה והמשך יום מהנה. | 62 | unresolved token literal: "@זמן_אימון" |
| lunch | street | Location_Based | תנועה בדרך | 28 דקות מהירות בחוץ — כוח ואנרגיה בלי ללכת רחוק. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | street | Habit_Maintenance | תנועה בדרך | 29 דקות מהירות בחוץ — כוח ואנרגיה בלי ללכת רחוק. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | gym | Daily_Goal | לנצל את השמש: אימון במכון כושר | המזג אוויר מושלם לתנועה בחוץ. 28 דקות של כללי במכו… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| lunch | gym | Inactivity | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | תראי/ה כמה התקדמת! שבוע @weekNumber ואת/ה בגרסה הרבה יותר חז… | 62 | unresolved token literal: "@weekNumber" |
| lunch | gym | Location_Based | ים של אנרגיה: אימון כללי | בדרך לים או לבריכה? בוא לבוסט מהיר של גוף מלא_פיזי… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | gym | Habit_Maintenance | הפסקה מהשיעורים | סיימת יום לימודים? 28 דקות בבית להזיז את הגוף ולהר… | כללי | _(no match)_ | 0 | 0 push candidates matched; home-only content at a non-home location |
| lunch | office | Daily_Goal | לנצל את השמש: אימון במשרד | המזג אוויר מושלם לתנועה בחוץ. 26 דקות של כללי במשר… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| lunch | office | Inactivity | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | סגרת חודש בתוכנית! משתמש, בוא/י לראות כמה התקדמת בשבוע @week… | 62 | unresolved token literal: "@weekNumber" |
| lunch | office | Location_Based | ים של אנרגיה: אימון כללי | בדרך לים או לבריכה? בוא לבוסט מהיר של גוף מלא_פיזי… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | office | Habit_Maintenance | חם בחוץ? אימון קריר בפנים | הטמפרטורות עולות. 28 דקות של כללי במזגן במשרד כדי … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | park | Daily_Goal | לפרוק בערב בחוץ | ערב בפארק, לבד או עם חברים — 29 דקות של תנועה שמשח… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| evening | park | Inactivity | לפרוק בערב בחוץ | ערב בפארק, לבד או עם חברים — 28 דקות של תנועה שמשח… | כללי | 3 ק"מ של עוצמה. בוא/י לשפר את המהירות המקסימלית. | 62 |  |
| evening | park | Location_Based | לפרוק בערב בחוץ | ערב בפארק, לבד או עם חברים — 28 דקות של תנועה שמשח… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | park | Habit_Maintenance | לפרוק בערב בחוץ | ערב בפארק, לבד או עם חברים — 30 דקות של תנועה שמשח… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | home | Daily_Goal | כוח שרואים | רוצה תוצאות שמרגישים? 28 דקות ממוקדות שבונות אותך … | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| evening | home | Inactivity | כוח שרואים | רוצה תוצאות שמרגישים? 28 דקות ממוקדות שבונות אותך … | כללי | משתמש, מוכנ/ה לביצוע שיא? @זמן_אימון דקות של @קטגוריה ב@מיקו… | 62 | unresolved token literal: "@זמן_אימון" |
| evening | home | Location_Based | כוח שרואים | רוצה תוצאות שמרגישים? 28 דקות ממוקדות שבונות אותך … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | home | Habit_Maintenance | כוח שרואים | רוצה תוצאות שמרגישים? 29 דקות ממוקדות שבונות אותך … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | street | Daily_Goal | כוח שרואים | רוצה תוצאות שמרגישים? 29 דקות ממוקדות שבונות אותך … | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| evening | street | Inactivity | לסיים את היום חזק | 29 דקות שיוציאו ממך את המקסימום — ותלך/י לישון עם … | כללי | משתמש, מוכנ/ה לביצוע שיא? @זמן_אימון דקות של @קטגוריה ב@מיקו… | 62 | unresolved token literal: "@זמן_אימון" |
| evening | street | Location_Based | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | street | Habit_Maintenance | תנועה בדרך | 29 דקות מהירות בחוץ — כוח ואנרגיה בלי ללכת רחוק. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | gym | Daily_Goal | כוח שרואים | רוצה תוצאות שמרגישים? 30 דקות ממוקדות שבונות אותך … | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| evening | gym | Inactivity | ים של אנרגיה: אימון כללי | בדרך לים או לבריכה? בוא לבוסט מהיר של גוף מלא_פיזי… | כללי | בחופשה? @זמן_אימון דקות של @קטגוריה והמשך יום מהנה. | 62 | unresolved token literal: "@זמן_אימון" |
| evening | gym | Location_Based | חם בחוץ? אימון קריר בפנים | הטמפרטורות עולות. 29 דקות של כללי במזגן במכון כושר… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | gym | Habit_Maintenance | חם בחוץ? אימון קריר בפנים | הטמפרטורות עולות. 29 דקות של כללי במזגן במכון כושר… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | office | Daily_Goal | כוח שרואים | רוצה תוצאות שמרגישים? 22 דקות ממוקדות שבונות אותך … | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| evening | office | Inactivity | לפרוק בערב בחוץ | ערב בפארק, לבד או עם חברים — 21 דקות של תנועה שמשח… | כללי | הסוד הוא עקביות. בוא/י לשמור על קצב @basePace חזק. | 62 | unresolved token literal: "@basePace"; park-only content at a non-park location |
| evening | office | Location_Based | לפרוק בערב בחוץ | ערב בפארק, לבד או עם חברים — 30 דקות של תנועה שמשח… | כללי | _(no match)_ | 0 | 0 push candidates matched; park-only content at a non-park location |
| evening | office | Habit_Maintenance | לנצל את השמש: אימון במשרד | המזג אוויר מושלם לתנועה בחוץ. 27 דקות של כללי במשר… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | park | Daily_Goal | חם בחוץ? אימון קריר בפנים | הטמפרטורות עולות. 30 דקות של כללי במזגן בפארק כדי … | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| night | park | Inactivity | לפרוק בערב בחוץ | ערב בפארק, לבד או עם חברים — 28 דקות של תנועה שמשח… | כללי | משתמש, ה@מיקום מוכן. @זמן_אימון דקות של @קטגוריה ברמה גבוהה … | 62 | unresolved token literal: "@מיקום"; "evening" wording outside the evening slot |
| night | park | Location_Based | חם בחוץ? אימון קריר בפנים | הטמפרטורות עולות. 29 דקות של כללי במזגן בפארק כדי … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | park | Habit_Maintenance | לצאת את היום בתנועה | בוקר בפארק לפני הכל. 28 דקות שממלאות אותך אנרגיה ל… | כללי | _(no match)_ | 0 | 0 push candidates matched; "morning" wording outside the morning slot |
| night | home | Daily_Goal | חורף חם: אימון ביתי בסלון | קר בחוץ? הכי כיף להתחמם עם אימון כללי בסלון. 30 דק… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| night | home | Inactivity | ים של אנרגיה: אימון כללי | בדרך לים או לבריכה? בוא לבוסט מהיר של גוף מלא_פיזי… | כללי | זמן להתאושש. בוא/י לאימון בנייה מחדש כדי להמשיך חזק יותר. | 62 |  |
| night | home | Location_Based | לפתוח את היום לפני בית הספר | לפני שיוצאים ליום — 27 דקות קצרות שמעירות את הגוף … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | home | Habit_Maintenance | כוח שרואים | רוצה תוצאות שמרגישים? 30 דקות ממוקדות שבונות אותך … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | street | Daily_Goal | לנצל את השמש: אימון ברחוב | המזג אוויר מושלם לתנועה בחוץ. 30 דקות של כללי ברחו… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| night | street | Inactivity | חם בחוץ? אימון קריר בפנים | הטמפרטורות עולות. 29 דקות של כללי במזגן ברחוב כדי … | כללי | מוכן/ה לדו-ספרתי? 10 ק"מ של סיפוק מחכים לך. | 62 |  |
| night | street | Location_Based | תנועה בדרך | 28 דקות מהירות בחוץ — כוח ואנרגיה בלי ללכת רחוק. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | street | Habit_Maintenance | לנצל את השמש: אימון ברחוב | המזג אוויר מושלם לתנועה בחוץ. 29 דקות של כללי ברחו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | gym | Daily_Goal | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| night | gym | Inactivity | חורף חם: אימון ביתי בסלון | קר בחוץ? הכי כיף להתחמם עם אימון כללי בסלון. 29 דק… | כללי | בדרך לים? @זמן_אימון דקות של @קטגוריה ו@את/ה בשיא שלך. | 62 | unresolved token literal: "@זמן_אימון"; home-only content at a non-home location |
| night | gym | Location_Based | לנצל את השמש: אימון במכון כושר | המזג אוויר מושלם לתנועה בחוץ. 29 דקות של כללי במכו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | gym | Habit_Maintenance | לנצל את השמש: אימון במכון כושר | המזג אוויר מושלם לתנועה בחוץ. 29 דקות של כללי במכו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | office | Daily_Goal | לנצל את השמש: אימון במשרד | המזג אוויר מושלם לתנועה בחוץ. 29 דקות של כללי במשר… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| night | office | Inactivity | חם בחוץ? אימון קריר בפנים | הטמפרטורות עולות. 29 דקות של כללי במזגן במשרד כדי … | כללי | 3 ק"מ של עוצמה. בוא/י לשפר את המהירות המקסימלית. | 62 |  |
| night | office | Location_Based | ים של אנרגיה: אימון כללי | בדרך לים או לבריכה? בוא לבוסט מהיר של גוף מלא_פיזי… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | office | Habit_Maintenance | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | _(no match)_ | 0 | 0 push candidates matched |

### office_worker (56/80 flagged)

| Time | Location | Trigger | Home Title | Home Desc | Category | Push Text | Push Cand. | Flags |
|---|---|---|---|---|---|---|---|---|
| morning | park | Daily_Goal | לנצל את השמש: אימון בפארק | המזג אוויר מושלם לתנועה בחוץ. 30 דקות של כללי בפאר… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 3 |  |
| morning | park | Inactivity | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | יוצאים לדרך! שבוע ראשון בתוכנית הריצה מתחיל עכשיו. בוא/י נתנ… | 83 |  |
| morning | park | Location_Based | לנצל את השמש: אימון בפארק | המזג אוויר מושלם לתנועה בחוץ. 28 דקות של כללי בפאר… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | park | Habit_Maintenance | חם בחוץ? אימון קריר בפנים | הטמפרטורות עולות. 30 דקות של כללי במזגן בפארק כדי … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | home | Daily_Goal | ים של אנרגיה: אימון כללי | בדרך לים או לבריכה? בוא לבוסט מהיר של גוף מלא_פיזי… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 |  |
| morning | home | Inactivity | לנצל את השמש: אימון בבית | המזג אוויר מושלם לתנועה בחוץ. 30 דקות של כללי בבית… | כללי | עוצר/ת לצהריים? קחי @זמן_אימון דקות למתיחה במשרד, הגב שלך יו… | 83 | unresolved token literal: "@זמן_אימון" |
| morning | home | Location_Based | ים של אנרגיה: אימון כללי | בדרך לים או לבריכה? בוא לבוסט מהיר של גוף מלא_פיזי… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | home | Habit_Maintenance | חם בחוץ? אימון קריר בפנים | הטמפרטורות עולות. 30 דקות של כללי במזגן בבית כדי ל… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | street | Daily_Goal | ים של אנרגיה: אימון כללי | בדרך לים או לבריכה? בוא לבוסט מהיר של גוף מלא_פיזי… | כללי | הפסקה קצרה מהמשרד? 1,500 צעדים ואת/ה באמצע הדרך | 3 |  |
| morning | street | Inactivity | לנצל את השמש: אימון ברחוב | המזג אוויר מושלם לתנועה בחוץ. 29 דקות של כללי ברחו… | כללי | אזל ה-Battery? @בוא/י לבוסט אנרגיה קצר ב@מיקום. | 83 | unresolved token literal: "@בוא" |
| morning | street | Location_Based | פוקוס לפני הדיילי | בוקר טוב משתמש. לפני הבלגן, 29 דקות של גוף מלא_פיז… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | street | Habit_Maintenance | לנצל את השמש: אימון ברחוב | המזג אוויר מושלם לתנועה בחוץ. 30 דקות של כללי ברחו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | gym | Daily_Goal | לנצל את השמש: אימון במכון כושר | המזג אוויר מושלם לתנועה בחוץ. 28 דקות של כללי במכו… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 |  |
| morning | gym | Inactivity | חם בחוץ? אימון קריר בפנים | הטמפרטורות עולות. 30 דקות של כללי במזגן במכון כושר… | כללי | משתמש, רמה @רמה כבר קטנה עליך. @בוא/י לטפס ל@רמה_הבאה. | 83 | unresolved token literal: "@רמה" |
| morning | gym | Location_Based | פוקוס לפני הדיילי | בוקר טוב משתמש. לפני הבלגן, 30 דקות של גוף מלא_פיז… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | gym | Habit_Maintenance | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | office | Daily_Goal | ים של אנרגיה: אימון כללי | בדרך לים או לבריכה? בוא לבוסט מהיר של גוף מלא_פיזי… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 |  |
| morning | office | Inactivity | פוקוס לפני הדיילי | בוקר טוב משתמש. לפני הבלגן, 29 דקות של גוף מלא_פיז… | כללי | כובשים את העלייה! בוא/י לבנות רגליים שלא נשברות בריצה. | 83 |  |
| morning | office | Location_Based | ים של אנרגיה: אימון כללי | בדרך לים או לבריכה? בוא לבוסט מהיר של גוף מלא_פיזי… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | office | Habit_Maintenance | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | park | Daily_Goal | הארכת עמוד שדרה במשרד | הישיבה הממושכת מכווצת אותך. בוא להאריך את עמוד השד… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 |  |
| lunch | park | Inactivity | הארכת עמוד שדרה במשרד | הישיבה הממושכת מכווצת אותך. בוא להאריך את עמוד השד… | כללי | הרגליים כבדות מהטיסה? בוא/י לשחרור קצר שיחזיר לך את האנרגיה. | 83 |  |
| lunch | park | Location_Based | הארכת עמוד שדרה במשרד | הישיבה הממושכת מכווצת אותך. בוא להאריך את עמוד השד… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | park | Habit_Maintenance | בוסט אנרגיה במשרד | במשרד? אתה במרחק קרוב מהפארק הקרוב. קצר דקות ואתה … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | home | Daily_Goal | בוסט אנרגיה במשרד | במשרד? אתה במרחק קרוב מהפארק הקרוב. קצר דקות ואתה … | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 3 |  |
| lunch | home | Inactivity | שחרור בכיסא לפני הישיבה | תקוע/ה בישיבה? משתמש, בוא ל-29 דקות של מתיחות בכיס… | כללי | חצי דרך מאחוריך! שבוע @weekNumber בתוכנית ה-@targetDistanceL… | 83 | unresolved token literal: "@weekNumber" |
| lunch | home | Location_Based | בוסט אנרגיה במשרד | במשרד? אתה במרחק קרוב מהפארק הקרוב. קצר דקות ואתה … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | home | Habit_Maintenance | הארכת עמוד שדרה במשרד | הישיבה הממושכת מכווצת אותך. בוא להאריך את עמוד השד… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | street | Daily_Goal | שחרור בכיסא לפני הישיבה | תקוע/ה בישיבה? משתמש, בוא ל-29 דקות של מתיחות בכיס… | כללי | הפסקה קצרה מהמשרד? 1,500 צעדים ואת/ה באמצע הדרך | 3 | desk-theme content at a non-desk location |
| lunch | street | Inactivity | הארכת עמוד שדרה במשרד | הישיבה הממושכת מכווצת אותך. בוא להאריך את עמוד השד… | כללי | גשום בחוץ? הכי כיף להתאמן בבית. @בוא/י ל-@זמן_אימון דקות. | 83 | unresolved token literal: "@בוא" |
| lunch | street | Location_Based | הארכת עמוד שדרה במשרד | הישיבה הממושכת מכווצת אותך. בוא להאריך את עמוד השד… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | street | Habit_Maintenance | מתיחות צהריים במשרד | רגע לפני האוכל: בוא ננצל 30 דקות למתיחות במשרד והג… | כללי | _(no match)_ | 0 | 0 push candidates matched; desk-theme content at a non-desk location |
| lunch | gym | Daily_Goal | בוסט אנרגיה במשרד | במשרד? אתה במרחק קרוב מהפארק הקרוב. קצר דקות ואתה … | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 |  |
| lunch | gym | Inactivity | שחרור בכיסא לפני הישיבה | תקוע/ה בישיבה? משתמש, בוא ל-30 דקות של מתיחות בכיס… | כללי | הגשם בחוץ, האימון בפנים. אל תתנ/י למזג האוויר לעצור אותך. | 83 | desk-theme content at a non-desk location |
| lunch | gym | Location_Based | שחרור בכיסא לפני הישיבה | תקוע/ה בישיבה? משתמש, בוא ל-29 דקות של מתיחות בכיס… | כללי | _(no match)_ | 0 | 0 push candidates matched; desk-theme content at a non-desk location |
| lunch | gym | Habit_Maintenance | הארכת עמוד שדרה במשרד | הישיבה הממושכת מכווצת אותך. בוא להאריך את עמוד השד… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | office | Daily_Goal | בוסט אנרגיה במשרד | במשרד? אתה במרחק קרוב מהפארק הקרוב. קצר דקות ואתה … | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 |  |
| lunch | office | Inactivity | בוסט אנרגיה במשרד | במשרד? אתה במרחק קרוב מהפארק הקרוב. קצר דקות ואתה … | כללי | יש באג בלו"ז: חסר לנו @פער_שבועי. @בוא/י לסגור את זה. | 83 | unresolved token literal: "@פער_שבועי" |
| lunch | office | Location_Based | בוסט אנרגיה במשרד | במשרד? אתה במרחק קרוב מהפארק הקרוב. קצר דקות ואתה … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | office | Habit_Maintenance | בוסט אנרגיה במשרד | במשרד? אתה במרחק קרוב מהפארק הקרוב. קצר דקות ואתה … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | park | Daily_Goal | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 3 |  |
| evening | park | Inactivity | לנצל את השמש: אימון בפארק | המזג אוויר מושלם לתנועה בחוץ. 30 דקות של כללי בפאר… | כללי | שורשי כף היד כואבים? @בוא/י ל-@זמן_אימון דקות של שחרור ב@מיק… | 83 | unresolved token literal: "@בוא" |
| evening | park | Location_Based | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | park | Habit_Maintenance | סוגרים לוג בערב | יום עבודה ארוך נגמר. 30 דקות של כללי לשחרור הלחץ מ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | home | Daily_Goal | סוגרים לוג בערב | יום עבודה ארוך נגמר. 28 דקות של כללי לשחרור הלחץ מ… | כללי | הפסקה קצרה מהמשרד? 1,500 צעדים ואת/ה באמצע הדרך | 3 |  |
| evening | home | Inactivity | סוגרים לוג בערב | יום עבודה ארוך נגמר. 30 דקות של כללי לשחרור הלחץ מ… | כללי | מוכן/ה לשבור שיא? בוא/י לאינטרוולים ארוכים לשיפור הסיבולת. | 83 |  |
| evening | home | Location_Based | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | home | Habit_Maintenance | לנצל את השמש: אימון בבית | המזג אוויר מושלם לתנועה בחוץ. 30 דקות של כללי בבית… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | street | Daily_Goal | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 |  |
| evening | street | Inactivity | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | הגב צועק 404? @בוא/י ל@זמן_אימון דקות של שחרור. | 83 | unresolved token literal: "@בוא" |
| evening | street | Location_Based | ים של אנרגיה: אימון כללי | בדרך לים או לבריכה? בוא לבוסט מהיר של גוף מלא_פיזי… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | street | Habit_Maintenance | ים של אנרגיה: אימון כללי | בדרך לים או לבריכה? בוא לבוסט מהיר של גוף מלא_פיזי… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | gym | Daily_Goal | סוגרים לוג בערב | יום עבודה ארוך נגמר. 29 דקות של כללי לשחרור הלחץ מ… | כללי | הפסקה קצרה מהמשרד? 1,500 צעדים ואת/ה באמצע הדרך | 3 |  |
| evening | gym | Inactivity | סוגרים לוג בערב | יום עבודה ארוך נגמר. 29 דקות של כללי לשחרור הלחץ מ… | כללי | שלב ה-Build בשיאו. בוא/י לחזק את הרגליים והסיבולת בשבוע @wee… | 83 | unresolved token literal: "@weekNumber" |
| evening | gym | Location_Based | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | gym | Habit_Maintenance | לנצל את השמש: אימון במכון כושר | המזג אוויר מושלם לתנועה בחוץ. 29 דקות של כללי במכו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | office | Daily_Goal | ים של אנרגיה: אימון כללי | בדרך לים או לבריכה? בוא לבוסט מהיר של גוף מלא_פיזי… | כללי | הפסקה קצרה מהמשרד? 1,500 צעדים ואת/ה באמצע הדרך | 3 |  |
| evening | office | Inactivity | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | שבוע חדש, אנרגיה חדשה. @בוא/י לאימון התנעה ב@מיקום. | 83 | unresolved token literal: "@בוא" |
| evening | office | Location_Based | חורף חם: אימון ביתי בסלון | קר בחוץ? הכי כיף להתחמם עם אימון כללי בסלון. 29 דק… | כללי | _(no match)_ | 0 | 0 push candidates matched; home-only content at a non-home location |
| evening | office | Habit_Maintenance | חם בחוץ? אימון קריר בפנים | הטמפרטורות עולות. 30 דקות של כללי במזגן במשרד כדי … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | park | Daily_Goal | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 |  |
| night | park | Inactivity | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | יום הריצה הארוכה! בוא/י נבנה היום את הבסיס האירובי שלך. | 83 |  |
| night | park | Location_Based | לנצל את השמש: אימון בפארק | המזג אוויר מושלם לתנועה בחוץ. 29 דקות של כללי בפאר… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | park | Habit_Maintenance | לנצל את השמש: אימון בפארק | המזג אוויר מושלם לתנועה בחוץ. 29 דקות של כללי בפאר… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | home | Daily_Goal | לנצל את השמש: אימון בבית | המזג אוויר מושלם לתנועה בחוץ. 28 דקות של כללי בבית… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 |  |
| night | home | Inactivity | חם בחוץ? אימון קריר בפנים | הטמפרטורות עולות. 24 דקות של כללי במזגן בבית כדי ל… | כללי | קיץ בפתח! בוא/י לעבוד על הגזרה ב@זמן_אימון דקות ממוקדות. | 83 | unresolved token literal: "@זמן_אימון" |
| night | home | Location_Based | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | home | Habit_Maintenance | חם בחוץ? אימון קריר בפנים | הטמפרטורות עולות. 28 דקות של כללי במזגן בבית כדי ל… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | street | Daily_Goal | ים של אנרגיה: אימון כללי | בדרך לים או לבריכה? בוא לבוסט מהיר של גוף מלא_פיזי… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 |  |
| night | street | Inactivity | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | מהמקלדת לאימון. @זמן_אימון דקות של @קטגוריה מחכות לך. | 83 | unresolved token literal: "@זמן_אימון" |
| night | street | Location_Based | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | street | Habit_Maintenance | לנצל את השמש: אימון ברחוב | המזג אוויר מושלם לתנועה בחוץ. 29 דקות של כללי ברחו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | gym | Daily_Goal | חורף חם: אימון ביתי בסלון | קר בחוץ? הכי כיף להתחמם עם אימון כללי בסלון. 30 דק… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 3 | home-only content at a non-home location |
| night | gym | Inactivity | לנצל את השמש: אימון במכון כושר | המזג אוויר מושלם לתנועה בחוץ. 29 דקות של כללי במכו… | כללי | סומכים על התהליך. שבוע Taper – נחים חזק לקראת היעד. | 83 |  |
| night | gym | Location_Based | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | gym | Habit_Maintenance | חורף חם: אימון ביתי בסלון | קר בחוץ? הכי כיף להתחמם עם אימון כללי בסלון. 29 דק… | כללי | _(no match)_ | 0 | 0 push candidates matched; home-only content at a non-home location |
| night | office | Daily_Goal | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | הפסקה קצרה מהמשרד? 1,500 צעדים ואת/ה באמצע הדרך | 3 |  |
| night | office | Inactivity | חם בחוץ? אימון קריר בפנים | הטמפרטורות עולות. 24 דקות של כללי במזגן במשרד כדי … | כללי | ה@מיקום פנוי עכשיו. בוא/י לסגור את המכסה היומית ב-@זמן_אימון… | 83 | unresolved token literal: "@מיקום" |
| night | office | Location_Based | ים של אנרגיה: אימון כללי | בדרך לים או לבריכה? בוא לבוסט מהיר של גוף מלא_פיזי… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | office | Habit_Maintenance | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | _(no match)_ | 0 | 0 push candidates matched |

### military (57/80 flagged)

| Time | Location | Trigger | Home Title | Home Desc | Category | Push Text | Push Cand. | Flags |
|---|---|---|---|---|---|---|---|---|
| morning | park | Daily_Goal | לנצל את השמש: אימון בפארק | המזג אוויר מושלם לתנועה בחוץ. 28 דקות של כללי בפאר… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| morning | park | Inactivity | אימון שטח בפארק | הגשם לא עוצר אותנו. בוא ל30 דקות של עבודה מהבית כד… | כללי | ה-@basePace שלך השתפר! בוא/י לשבור שיא ב-5 ק"מ. | 82 | unresolved token literal: "@basePace" |
| morning | park | Location_Based | לנצל את השמש: אימון בפארק | המזג אוויר מושלם לתנועה בחוץ. 29 דקות של כללי בפאר… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | park | Habit_Maintenance | לנצל את השמש: אימון בפארק | המזג אוויר מושלם לתנועה בחוץ. 29 דקות של כללי בפאר… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | home | Daily_Goal | לנצל את השמש: אימון בבית | המזג אוויר מושלם לתנועה בחוץ. 29 דקות של כללי בבית… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| morning | home | Inactivity | לנצל את השמש: אימון בבית | המזג אוויר מושלם לתנועה בחוץ. 30 דקות של כללי בבית… | כללי | סוף שמירה? @בוא/י לשחרר את המתח ב@מיקוד לפני השינה. | 82 | unresolved token literal: "@בוא" |
| morning | home | Location_Based | חורף חם: אימון ביתי בסלון | קר בחוץ? הכי כיף להתחמם עם אימון כללי בסלון. 29 דק… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | home | Habit_Maintenance | לנצל את השמש: אימון בבית | המזג אוויר מושלם לתנועה בחוץ. 29 דקות של כללי בבית… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | street | Daily_Goal | לנצל את השמש: אימון ברחוב | המזג אוויר מושלם לתנועה בחוץ. 28 דקות של כללי ברחו… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| morning | street | Inactivity | בוקר של כוננות גבוהה | פותחים בוקר בראבק. 28 דקות של כללי להזרמת דם ופוקו… | כללי | בבסיס ואין כוח? @בוא/י ל-@זמן_אימון דקות של מרץ בחדר. | 82 | unresolved token literal: "@בוא" |
| morning | street | Location_Based | ים של אנרגיה: אימון כללי | בדרך לים או לבריכה? בוא לבוסט מהיר של גוף מלא_פיזי… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | street | Habit_Maintenance | בוקר של כוננות גבוהה | פותחים בוקר בראבק. 27 דקות של כללי להזרמת דם ופוקו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | gym | Daily_Goal | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| morning | gym | Inactivity | חורף חם: אימון ביתי בסלון | קר בחוץ? הכי כיף להתחמם עם אימון כללי בסלון. 30 דק… | כללי | משחקים עם הקצב היום! בוא/י לאימון פארטלק משחרר ב@מיקום. | 82 | unresolved token literal: "@מיקום"; home-only content at a non-home location |
| morning | gym | Location_Based | לנצל את השמש: אימון במכון כושר | המזג אוויר מושלם לתנועה בחוץ. 29 דקות של כללי במכו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | gym | Habit_Maintenance | בוקר של כוננות גבוהה | פותחים בוקר בראבק. 29 דקות של כללי להזרמת דם ופוקו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | office | Daily_Goal | לנצל את השמש: אימון במשרד | המזג אוויר מושלם לתנועה בחוץ. 30 דקות של כללי במשר… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| morning | office | Inactivity | חם בחוץ? אימון קריר בפנים | הטמפרטורות עולות. 30 דקות של כללי במזגן במשרד כדי … | כללי | לוחם, העליות מחכות. בוא נבנה את הכוח המתפרץ שתצטרך בשטח. | 82 |  |
| morning | office | Location_Based | בוקר של כוננות גבוהה | פותחים בוקר בראבק. 29 דקות של כללי להזרמת דם ופוקו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | office | Habit_Maintenance | בוקר של כוננות גבוהה | פותחים בוקר בראבק. 27 דקות של כללי להזרמת דם ופוקו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | park | Daily_Goal | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| lunch | park | Inactivity | חם בחוץ? אימון קריר בפנים | הטמפרטורות עולות. 29 דקות של כללי במזגן בפארק כדי … | כללי | נקה רעשים, משתמש. @זמן_אימון דקות של @מיקוד ופוקוס. | 82 | unresolved token literal: "@זמן_אימון" |
| lunch | park | Location_Based | חם בחוץ? אימון קריר בפנים | הטמפרטורות עולות. 29 דקות של כללי במזגן בפארק כדי … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | park | Habit_Maintenance | חם בחוץ? אימון קריר בפנים | הטמפרטורות עולות. 29 דקות של כללי במזגן בפארק כדי … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | home | Daily_Goal | חורף חם: אימון ביתי בסלון | קר בחוץ? הכי כיף להתחמם עם אימון כללי בסלון. 29 דק… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| lunch | home | Inactivity | חם בחוץ? אימון קריר בפנים | הטמפרטורות עולות. 29 דקות של כללי במזגן בבית כדי ל… | כללי | אימון מלא ב@מיקום. @בוא/י נסגור את ה@סטטוס_נפח השבועי ב-@זמן… | 82 | unresolved token literal: "@מיקום" |
| lunch | home | Location_Based | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | home | Habit_Maintenance | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | street | Daily_Goal | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| lunch | street | Inactivity | ים של אנרגיה: אימון כללי | בדרך לים או לבריכה? בוא לבוסט מהיר של גוף מלא_פיזי… | כללי | יום שמש מושלם! @בוא/י לאימון קצר בחוץ ב@מיקום. | 82 | unresolved token literal: "@בוא" |
| lunch | street | Location_Based | חם בחוץ? אימון קריר בפנים | הטמפרטורות עולות. 30 דקות של כללי במזגן ברחוב כדי … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | street | Habit_Maintenance | לנצל את השמש: אימון ברחוב | המזג אוויר מושלם לתנועה בחוץ. 30 דקות של כללי ברחו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | gym | Daily_Goal | ים של אנרגיה: אימון כללי | בדרך לים או לבריכה? בוא לבוסט מהיר של גוף מלא_פיזי… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| lunch | gym | Inactivity | ים של אנרגיה: אימון כללי | בדרך לים או לבריכה? בוא לבוסט מהיר של גוף מלא_פיזי… | כללי | זמן ל@קטגוריה. צא/י ל@מיקום ל-@זמן_אימון דקות של עבודה נקייה… | 82 | unresolved token literal: "@קטגוריה" |
| lunch | gym | Location_Based | חורף חם: אימון ביתי בסלון | קר בחוץ? הכי כיף להתחמם עם אימון כללי בסלון. 30 דק… | כללי | _(no match)_ | 0 | 0 push candidates matched; home-only content at a non-home location |
| lunch | gym | Habit_Maintenance | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | office | Daily_Goal | חם בחוץ? אימון קריר בפנים | הטמפרטורות עולות. 29 דקות של כללי במזגן במשרד כדי … | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| lunch | office | Inactivity | חורף חם: אימון ביתי בסלון | קר בחוץ? הכי כיף להתחמם עם אימון כללי בסלון. 29 דק… | כללי | זה היום שלך! כל העבודה הקשה מתנקזת לריצה של היום. בהצלחה! | 82 | home-only content at a non-home location |
| lunch | office | Location_Based | חורף חם: אימון ביתי בסלון | קר בחוץ? הכי כיף להתחמם עם אימון כללי בסלון. 29 דק… | כללי | _(no match)_ | 0 | 0 push candidates matched; home-only content at a non-home location |
| lunch | office | Habit_Maintenance | חם בחוץ? אימון קריר בפנים | הטמפרטורות עולות. 28 דקות של כללי במזגן במשרד כדי … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | park | Daily_Goal | לנצל את השמש: אימון בפארק | המזג אוויר מושלם לתנועה בחוץ. 30 דקות של כללי בפאר… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| evening | park | Inactivity | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | משתמש, היום ב@מיקום מתקרבים ל@תרגיל_יעד. @זמן_אימון דקות של … | 82 | unresolved token literal: "@מיקום" |
| evening | park | Location_Based | לנצל את השמש: אימון בפארק | המזג אוויר מושלם לתנועה בחוץ. 29 דקות של כללי בפאר… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | park | Habit_Maintenance | ים של אנרגיה: אימון כללי | בדרך לים או לבריכה? בוא לבוסט מהיר של גוף מלא_פיזי… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | home | Daily_Goal | לנצל את השמש: אימון בבית | המזג אוויר מושלם לתנועה בחוץ. 30 דקות של כללי בבית… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| evening | home | Inactivity | חם בחוץ? אימון קריר בפנים | הטמפרטורות עולות. 29 דקות של כללי במזגן בבית כדי ל… | כללי | זמן להתאושש. בוא/י לאימון בנייה מחדש כדי להמשיך חזק יותר. | 82 |  |
| evening | home | Location_Based | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | home | Habit_Maintenance | לנצל את השמש: אימון בבית | המזג אוויר מושלם לתנועה בחוץ. 29 דקות של כללי בבית… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | street | Daily_Goal | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| evening | street | Inactivity | ים של אנרגיה: אימון כללי | בדרך לים או לבריכה? בוא לבוסט מהיר של גוף מלא_פיזי… | כללי | תקוע/ה בשדה התעופה? @זמן_אימון דקות של שחרור והטיסה תעבור בק… | 82 | unresolved token literal: "@זמן_אימון" |
| evening | street | Location_Based | פריקת מתח בסוף היום | לילה לבן או סתם יום עמוס? 30 דקות של כללי יסדרו לך… | כללי | _(no match)_ | 0 | 0 push candidates matched; "night" wording outside the night slot |
| evening | street | Habit_Maintenance | חם בחוץ? אימון קריר בפנים | הטמפרטורות עולות. 29 דקות של כללי במזגן ברחוב כדי … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | gym | Daily_Goal | לנצל את השמש: אימון במכון כושר | המזג אוויר מושלם לתנועה בחוץ. 29 דקות של כללי במכו… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| evening | gym | Inactivity | לנצל את השמש: אימון במכון כושר | המזג אוויר מושלם לתנועה בחוץ. 30 דקות של כללי במכו… | כללי | חזקים ב-10 ק"מ. בוא/י לאימון שיבנה לך חוסן מנטלי. | 82 |  |
| evening | gym | Location_Based | לנצל את השמש: אימון במכון כושר | המזג אוויר מושלם לתנועה בחוץ. 30 דקות של כללי במכו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | gym | Habit_Maintenance | פריקת מתח בסוף היום | לילה לבן או סתם יום עמוס? 28 דקות של כללי יסדרו לך… | כללי | _(no match)_ | 0 | 0 push candidates matched; "night" wording outside the night slot |
| evening | office | Daily_Goal | לנצל את השמש: אימון במשרד | המזג אוויר מושלם לתנועה בחוץ. 29 דקות של כללי במשר… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| evening | office | Inactivity | פריקת מתח בסוף היום | לילה לבן או סתם יום עמוס? 29 דקות של כללי יסדרו לך… | כללי | שלב ה-Build בשיאו. בוא/י לחזק את הרגליים והסיבולת בשבוע @wee… | 82 | unresolved token literal: "@weekNumber"; "night" wording outside the night slot |
| evening | office | Location_Based | פריקת מתח בסוף היום | לילה לבן או סתם יום עמוס? 27 דקות של כללי יסדרו לך… | כללי | _(no match)_ | 0 | 0 push candidates matched; "night" wording outside the night slot |
| evening | office | Habit_Maintenance | לנצל את השמש: אימון במשרד | המזג אוויר מושלם לתנועה בחוץ. 30 דקות של כללי במשר… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | park | Daily_Goal | אימון שטח בפארק | חסר לנו מאוזן במערכת. בוא נשלים חוסרים עם 30 דקות … | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| night | park | Inactivity | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | אימון @קטגוריה ב@מיקום מתחיל עכשיו. @מוכן/ה להעלות את ה@סקיי… | 82 | unresolved token literal: "@קטגוריה" |
| night | park | Location_Based | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | park | Habit_Maintenance | ים של אנרגיה: אימון כללי | בדרך לים או לבריכה? בוא לבוסט מהיר של גוף מלא_פיזי… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | home | Daily_Goal | חם בחוץ? אימון קריר בפנים | הטמפרטורות עולות. 30 דקות של כללי במזגן בבית כדי ל… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| night | home | Inactivity | לנצל את השמש: אימון בבית | המזג אוויר מושלם לתנועה בחוץ. 30 דקות של כללי בבית… | כללי | רמה @רמה קטנה עליך. @בוא/י להסתער על @רמה_הבאה. | 82 | unresolved token literal: "@רמה" |
| night | home | Location_Based | חם בחוץ? אימון קריר בפנים | הטמפרטורות עולות. 29 דקות של כללי במזגן בבית כדי ל… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | home | Habit_Maintenance | חם בחוץ? אימון קריר בפנים | הטמפרטורות עולות. 28 דקות של כללי במזגן בבית כדי ל… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | street | Daily_Goal | ים של אנרגיה: אימון כללי | בדרך לים או לבריכה? בוא לבוסט מהיר של גוף מלא_פיזי… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| night | street | Inactivity | חם בחוץ? אימון קריר בפנים | הטמפרטורות עולות. 29 דקות של כללי במזגן ברחוב כדי … | כללי | זמן ל@קטגוריה. צא/י ל@מיקום ל-@זמן_אימון דקות של עבודה נקייה… | 82 | unresolved token literal: "@קטגוריה" |
| night | street | Location_Based | לנצל את השמש: אימון ברחוב | המזג אוויר מושלם לתנועה בחוץ. 29 דקות של כללי ברחו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | street | Habit_Maintenance | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | gym | Daily_Goal | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| night | gym | Inactivity | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | זמן ל@קטגוריה. צא/י ל@מיקום ל-@זמן_אימון דקות של עבודה נקייה… | 82 | unresolved token literal: "@קטגוריה" |
| night | gym | Location_Based | לנצל את השמש: אימון במכון כושר | המזג אוויר מושלם לתנועה בחוץ. 29 דקות של כללי במכו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | gym | Habit_Maintenance | ים של אנרגיה: אימון כללי | בדרך לים או לבריכה? בוא לבוסט מהיר של גוף מלא_פיזי… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | office | Daily_Goal | לנצל את השמש: אימון במשרד | המזג אוויר מושלם לתנועה בחוץ. 30 דקות של כללי במשר… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| night | office | Inactivity | חורף חם: אימון ביתי בסלון | קר בחוץ? הכי כיף להתחמם עם אימון כללי בסלון. 29 דק… | כללי | חייל/ת, רמה @רמה נראית עליך מעולה. בוא/י להתקדם. | 82 | unresolved token literal: "@רמה"; home-only content at a non-home location |
| night | office | Location_Based | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | office | Habit_Maintenance | חם בחוץ? אימון קריר בפנים | הטמפרטורות עולות. 29 דקות של כללי במזגן במשרד כדי … | כללי | _(no match)_ | 0 | 0 push candidates matched |

### vatikim (64/80 flagged)

| Time | Location | Trigger | Home Title | Home Desc | Category | Push Text | Push Cand. | Flags |
|---|---|---|---|---|---|---|---|---|
| morning | park | Daily_Goal | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב29 דקות של הנעת … | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| morning | park | Inactivity | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב29 דקות של הנעת … | כללי | גב חזק ליציבה זקופה. @בוא/י לאימון ממוקד ב@מיקום. | 93 | unresolved token literal: "@בוא" |
| morning | park | Location_Based | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב29 דקות של הנעת … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | park | Habit_Maintenance | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב28 דקות של הנעת … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | home | Daily_Goal | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב29 דקות של הנעת … | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| morning | home | Inactivity | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב30 דקות של הנעת … | כללי | משתמש, ה@מיקום מוכן. @זמן_אימון דקות של @קטגוריה ברמה גבוהה … | 93 | unresolved token literal: "@מיקום" |
| morning | home | Location_Based | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב29 דקות של הנעת … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | home | Habit_Maintenance | בוקר של נחת: הנעת מפרקים | בוקר טוב משתמש. בוא נפתח את היום ב30 דקות של הנעת … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | street | Daily_Goal | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב29 דקות של הנעת … | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| morning | street | Inactivity | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב29 דקות של הנעת … | כללי | שומרים על יציבות! תרגול ביטחון בתנועה מחכה לך ב@מיקום. | 93 | unresolved token literal: "@מיקום" |
| morning | street | Location_Based | בוקר של נחת: הנעת מפרקים | בוקר טוב משתמש. בוא נפתח את היום ב30 דקות של הנעת … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | street | Habit_Maintenance | בוקר של נחת: הנעת מפרקים | בוקר טוב משתמש. בוא נפתח את היום ב29 דקות של הנעת … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | gym | Daily_Goal | בוקר של נחת: הנעת מפרקים | בוקר טוב משתמש. בוא נפתח את היום ב29 דקות של הנעת … | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| morning | gym | Inactivity | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב29 דקות של הנעת … | כללי | זמן להתאושש. בוא/י לאימון בנייה מחדש כדי להמשיך חזק יותר. | 93 |  |
| morning | gym | Location_Based | בוקר של נחת: הנעת מפרקים | בוקר טוב משתמש. בוא נפתח את היום ב29 דקות של הנעת … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | gym | Habit_Maintenance | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב29 דקות של הנעת … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | office | Daily_Goal | בוקר של נחת: הנעת מפרקים | בוקר טוב משתמש. בוא נפתח את היום ב30 דקות של הנעת … | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| morning | office | Inactivity | בוקר של נחת: הנעת מפרקים | בוקר טוב משתמש. בוא נפתח את היום ב30 דקות של הנעת … | כללי | שבוע Taper התחיל. פחות ריצה, יותר מנוחה. סומכים על התהליך. | 93 |  |
| morning | office | Location_Based | בוקר של נחת: הנעת מפרקים | בוקר טוב משתמש. בוא נפתח את היום ב30 דקות של הנעת … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | office | Habit_Maintenance | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב30 דקות של הנעת … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | park | Daily_Goal | תחזוקת מפרקים ובריאות | בריאות המפרקים מתחילה בתנועה מבוקרת. 30 דקות של גו… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 | "morning" wording outside the morning slot |
| lunch | park | Inactivity | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב29 דקות של הנעת … | כללי | שומרים על היכולת! רמה @רמה כבר כאן, בוא/י לשמר אותה. | 93 | unresolved token literal: "@רמה"; "morning" wording outside the morning slot |
| lunch | park | Location_Based | בוקר של נחת: הנעת מפרקים | בוקר טוב משתמש. בוא נפתח את היום ב29 דקות של הנעת … | כללי | _(no match)_ | 0 | 0 push candidates matched; "morning" wording outside the morning slot |
| lunch | park | Habit_Maintenance | אירובי מתון לבריאות הלב | הלב הוא המנוע שלנו. 29 דקות של כללי במאתגר מתונה ל… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | home | Daily_Goal | תחזוקת מפרקים ובריאות | בריאות המפרקים מתחילה בתנועה מבוקרת. 29 דקות של גו… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 | "morning" wording outside the morning slot |
| lunch | home | Inactivity | שומרים על הכוח והעצמאות | הכוח שלך הוא העצמאות שלך. בוא לשמור על השרירים והע… | כללי | תקוע/ה בשדה התעופה? @זמן_אימון דקות של שחרור והטיסה תעבור בק… | 93 | unresolved token literal: "@זמן_אימון" |
| lunch | home | Location_Based | תחזוקת מפרקים ובריאות | בריאות המפרקים מתחילה בתנועה מבוקרת. 28 דקות של גו… | כללי | _(no match)_ | 0 | 0 push candidates matched; "morning" wording outside the morning slot |
| lunch | home | Habit_Maintenance | שומרים על הכוח והעצמאות | הכוח שלך הוא העצמאות שלך. בוא לשמור על השרירים והע… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | street | Daily_Goal | יציבות ושיווי משקל | יציבות היא המפתח לביטחון בתנועה. בוא לתרגול גוף מל… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| lunch | street | Inactivity | תחזוקת מפרקים ובריאות | בריאות המפרקים מתחילה בתנועה מבוקרת. 29 דקות של גו… | כללי | מוכן/ה לשבור שיא? בוא/י לאינטרוולים ארוכים לשיפור הסיבולת. | 93 | "morning" wording outside the morning slot |
| lunch | street | Location_Based | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב29 דקות של הנעת … | כללי | _(no match)_ | 0 | 0 push candidates matched; "morning" wording outside the morning slot |
| lunch | street | Habit_Maintenance | אירובי מתון לבריאות הלב | הלב הוא המנוע שלנו. 29 דקות של כללי במאתגר מתונה ל… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | gym | Daily_Goal | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב30 דקות של הנעת … | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 | "morning" wording outside the morning slot |
| lunch | gym | Inactivity | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב29 דקות של הנעת … | כללי | כבר רואים את הסוף! בוא/י לסגור אימון חזק בשבוע @weekNumber. | 93 | unresolved token literal: "@weekNumber"; "morning" wording outside the morning slot |
| lunch | gym | Location_Based | כוח ומרץ למשחק עם הנכדים | הם מלאי אנרגיה? 28 דקות של חיזוק גב וידיים יתנו לך… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | gym | Habit_Maintenance | שומרים על הכוח והעצמאות | הכוח שלך הוא העצמאות שלך. בוא לשמור על השרירים והע… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | office | Daily_Goal | בוקר של נחת: הנעת מפרקים | בוקר טוב משתמש. בוא נפתח את היום ב29 דקות של הנעת … | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 | "morning" wording outside the morning slot |
| lunch | office | Inactivity | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב29 דקות של הנעת … | כללי | 3 ק"מ של עוצמה. בוא/י לשפר את המהירות המקסימלית. | 93 | "morning" wording outside the morning slot |
| lunch | office | Location_Based | בוקר של נחת: הנעת מפרקים | בוקר טוב משתמש. בוא נפתח את היום ב30 דקות של הנעת … | כללי | _(no match)_ | 0 | 0 push candidates matched; "morning" wording outside the morning slot |
| lunch | office | Habit_Maintenance | שומרים על הכוח והעצמאות | הכוח שלך הוא העצמאות שלך. בוא לשמור על השרירים והע… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | park | Daily_Goal | אירובי מתון לבריאות הלב | הלב הוא המנוע שלנו. 30 דקות של כללי במאתגר מתונה ל… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| evening | park | Inactivity | כוח למשחקים עם הנכדים | הנכדים מחכים לך בגינה! בוא ל-30 דקות של חיזוק המפר… | כללי | כובשים את העלייה! בוא/י לבנות רגליים שלא נשברות בריצה. | 93 |  |
| evening | park | Location_Based | כוח ומרץ למשחק עם הנכדים | הם מלאי אנרגיה? 29 דקות של חיזוק גב וידיים יתנו לך… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | park | Habit_Maintenance | כוח למשחקים עם הנכדים | הנכדים מחכים לך בגינה! בוא ל-29 דקות של חיזוק המפר… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | home | Daily_Goal | תחזוקת מפרקים ובריאות | בריאות המפרקים מתחילה בתנועה מבוקרת. 28 דקות של גו… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 | "morning" wording outside the morning slot |
| evening | home | Inactivity | תחזוקת מפרקים ובריאות | בריאות המפרקים מתחילה בתנועה מבוקרת. 29 דקות של גו… | כללי | 5 ק"מ ראשונים בפתח. משתמש, בוא/י לעשות היסטוריה אישית. | 93 | "morning" wording outside the morning slot |
| evening | home | Location_Based | שומרים על העצמאות: כוח | שמירה על כוח השריר היא הבסיס לעצמאות. בוא לאימון כ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | home | Habit_Maintenance | כוח למשחקים עם הנכדים | הנכדים מחכים לך בגינה! בוא ל-28 דקות של חיזוק המפר… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | street | Daily_Goal | יציבות וביטחון בתנועה | יציבות היא המפתח לביטחון בתנועה. בוא לתרגול גוף מל… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| evening | street | Inactivity | שומרים על העצמאות: כוח | שמירה על כוח השריר היא הבסיס לעצמאות. בוא לאימון כ… | כללי | בוקר של בריאות משתמש. בוא/י לריצה קלה לשמירה על המפרקים. | 93 |  |
| evening | street | Location_Based | כוח ומרץ למשחק עם הנכדים | הם מלאי אנרגיה? 29 דקות של חיזוק גב וידיים יתנו לך… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | street | Habit_Maintenance | שומרים על העצמאות: כוח | שמירה על כוח השריר היא הבסיס לעצמאות. בוא לאימון כ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | gym | Daily_Goal | תחזוקת מפרקים ובריאות | בריאות המפרקים מתחילה בתנועה מבוקרת. 29 דקות של גו… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 | "morning" wording outside the morning slot |
| evening | gym | Inactivity | כוח למשחקים עם הנכדים | הנכדים מחכים לך בגינה! בוא ל-30 דקות של חיזוק המפר… | כללי | שומרים על יציבות! תרגול ביטחון בתנועה מחכה לך ב@מיקום. | 93 | unresolved token literal: "@מיקום" |
| evening | gym | Location_Based | שומרים על העצמאות: כוח | שמירה על כוח השריר היא הבסיס לעצמאות. בוא לאימון כ… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | gym | Habit_Maintenance | יציבות ושיווי משקל | יציבות היא המפתח לביטחון בתנועה. בוא לתרגול גוף מל… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | office | Daily_Goal | שומרים על הכוח והעצמאות | הכוח שלך הוא העצמאות שלך. בוא לשמור על השרירים והע… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| evening | office | Inactivity | בוקר של נחת: הנעת מפרקים | בוקר טוב משתמש. בוא נפתח את היום ב29 דקות של הנעת … | כללי | התקדמות מרשימה! @אחוז_התקדמות_רמה ואנחנו ברמה הבאה. | 93 | unresolved token literal: "@אחוז_התקדמות_רמה"; "morning" wording outside the morning slot |
| evening | office | Location_Based | יציבות וביטחון בתנועה | יציבות היא המפתח לביטחון בתנועה. בוא לתרגול גוף מל… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | office | Habit_Maintenance | אירובי מתון לבריאות הלב | הלב הוא המנוע שלנו. 29 דקות של כללי במאתגר מתונה ל… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | park | Daily_Goal | כוח ומרץ למשחק עם הנכדים | הם מלאי אנרגיה? 29 דקות של חיזוק גב וידיים יתנו לך… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| night | park | Inactivity | כוח ומרץ למשחק עם הנכדים | הם מלאי אנרגיה? 29 דקות של חיזוק גב וידיים יתנו לך… | כללי | יום הריצה הארוכה! בוא/י נבנה היום את הבסיס האירובי שלך. | 93 |  |
| night | park | Location_Based | בוקר של נחת: הנעת מפרקים | בוקר טוב משתמש. בוא נפתח את היום ב30 דקות של הנעת … | כללי | _(no match)_ | 0 | 0 push candidates matched; "morning" wording outside the morning slot |
| night | park | Habit_Maintenance | שומרים על הכוח והעצמאות | הכוח שלך הוא העצמאות שלך. בוא לשמור על השרירים והע… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | home | Daily_Goal | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב28 דקות של הנעת … | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 | "morning" wording outside the morning slot |
| night | home | Inactivity | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב29 דקות של הנעת … | כללי | מוכן/ה לשבור שיא? בוא/י לאינטרוולים ארוכים לשיפור הסיבולת. | 93 | "morning" wording outside the morning slot |
| night | home | Location_Based | כוח למשחקים עם הנכדים | הנכדים מחכים לך בגינה! בוא ל-30 דקות של חיזוק המפר… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | home | Habit_Maintenance | יציבות וביטחון בתנועה | יציבות היא המפתח לביטחון בתנועה. בוא לתרגול גוף מל… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | street | Daily_Goal | בוקר של נחת: הנעת מפרקים | בוקר טוב משתמש. בוא נפתח את היום ב29 דקות של הנעת … | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 | "morning" wording outside the morning slot |
| night | street | Inactivity | אירובי מתון לבריאות הלב | הלב הוא המנוע שלנו. 30 דקות של כללי במאתגר מתונה ל… | כללי | שומרים על היכולת! רמה @רמה כבר כאן, בוא/י לשמר אותה. | 93 | unresolved token literal: "@רמה" |
| night | street | Location_Based | תחזוקת מפרקים ובריאות | בריאות המפרקים מתחילה בתנועה מבוקרת. 28 דקות של גו… | כללי | _(no match)_ | 0 | 0 push candidates matched; "morning" wording outside the morning slot |
| night | street | Habit_Maintenance | כוח ומרץ למשחק עם הנכדים | הם מלאי אנרגיה? 28 דקות של חיזוק גב וידיים יתנו לך… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | gym | Daily_Goal | יציבות ושיווי משקל | יציבות היא המפתח לביטחון בתנועה. בוא לתרגול גוף מל… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| night | gym | Inactivity | להתעורר עם מפרקים משוחררים | בוקר טוב משתמש. בוא נפתח את היום ב29 דקות של הנעת … | כללי | הכוח אצלך בידיים. @בוא/י לאימון חיזוק שישפר לך את היום. | 93 | unresolved token literal: "@בוא"; "morning" wording outside the morning slot |
| night | gym | Location_Based | שומרים על הכוח והעצמאות | הכוח שלך הוא העצמאות שלך. בוא לשמור על השרירים והע… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | gym | Habit_Maintenance | יציבות וביטחון בתנועה | יציבות היא המפתח לביטחון בתנועה. בוא לתרגול גוף מל… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | office | Daily_Goal | תחזוקת מפרקים ובריאות | בריאות המפרקים מתחילה בתנועה מבוקרת. 29 דקות של גו… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 | "morning" wording outside the morning slot |
| night | office | Inactivity | תחזוקת מפרקים ובריאות | בריאות המפרקים מתחילה בתנועה מבוקרת. 30 דקות של גו… | כללי | יוצאים לדרך! שבוע ראשון בתוכנית הריצה מתחיל עכשיו. בוא/י נתנ… | 93 | "morning" wording outside the morning slot |
| night | office | Location_Based | כוח למשחקים עם הנכדים | הנכדים מחכים לך בגינה! בוא ל-29 דקות של חיזוק המפר… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | office | Habit_Maintenance | יציבות וביטחון בתנועה | יציבות היא המפתח לביטחון בתנועה. בוא לתרגול שישפר … | כללי | _(no match)_ | 0 | 0 push candidates matched |

### pro_athlete (55/80 flagged)

| Time | Location | Trigger | Home Title | Home Desc | Category | Push Text | Push Cand. | Flags |
|---|---|---|---|---|---|---|---|---|
| morning | park | Daily_Goal | לפתוח את היום בעוצמה | בוקר בפארק, אוויר פתוח, ראש צלול. 29 דקות שיכניסו … | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| morning | park | Inactivity | לפתוח את היום בעוצמה | בוקר בפארק, אוויר פתוח, ראש צלול. 29 דקות שיכניסו … | כללי | מוכן/ה לשבור שיא? בוא/י לאינטרוולים ארוכים לשיפור הסיבולת. | 62 |  |
| morning | park | Location_Based | לפתוח את היום בעוצמה | בוקר בפארק, אוויר פתוח, ראש צלול. 30 דקות שיכניסו … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | park | Habit_Maintenance | לפתוח את היום בעוצמה | בוקר בפארק, אוויר פתוח, ראש צלול. 29 דקות שיכניסו … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | home | Daily_Goal | לפתוח את היום חזק | 29 דקות ממוקדות מוקדם בבוקר — הבסיס ליום ברמה שלך. | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| morning | home | Inactivity | לפתוח את היום חזק | 30 דקות ממוקדות מוקדם בבוקר — הבסיס ליום ברמה שלך. | כללי | לוחם/ת, 3 ק"מ לתוצאה מושלמת. בוא/י לתת עבודה. | 62 |  |
| morning | home | Location_Based | לפתוח את היום חזק | 29 דקות ממוקדות מוקדם בבוקר — הבסיס ליום ברמה שלך. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | home | Habit_Maintenance | לפתוח את היום חזק | 30 דקות ממוקדות מוקדם בבוקר — הבסיס ליום ברמה שלך. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | street | Daily_Goal | ים של אנרגיה: אימון כללי | בדרך לים או לבריכה? בוא לבוסט מהיר של גוף מלא_פיזי… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| morning | street | Inactivity | לפתוח את היום בעוצמה | בוקר בפארק, אוויר פתוח, ראש צלול. 30 דקות שיכניסו … | כללי | 5 ק"מ ראשונים בפתח. משתמש, בוא/י לעשות היסטוריה אישית. | 62 | park-only content at a non-park location |
| morning | street | Location_Based | אימון אמצע יום | הפוגה מהשגרה. 29 דקות של גוף מלא לרענן את הגוף ולח… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | street | Habit_Maintenance | חם בחוץ? אימון קריר בפנים | הטמפרטורות עולות. 28 דקות של כללי במזגן ברחוב כדי … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | gym | Daily_Goal | לפתוח את היום בעוצמה | בוקר בפארק, אוויר פתוח, ראש צלול. 30 דקות שיכניסו … | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 | park-only content at a non-park location |
| morning | gym | Inactivity | חורף חם: אימון ביתי בסלון | קר בחוץ? הכי כיף להתחמם עם אימון כללי בסלון. 30 דק… | כללי | גשום בחוץ? הכי כיף להתאמן בבית. @בוא/י ל-@זמן_אימון דקות. | 62 | unresolved token literal: "@בוא"; home-only content at a non-home location |
| morning | gym | Location_Based | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | gym | Habit_Maintenance | לפתוח את היום בעוצמה | בוקר בפארק, אוויר פתוח, ראש צלול. 29 דקות שיכניסו … | כללי | _(no match)_ | 0 | 0 push candidates matched; park-only content at a non-park location |
| morning | office | Daily_Goal | לנצל את השמש: אימון במשרד | המזג אוויר מושלם לתנועה בחוץ. 30 דקות של כללי במשר… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| morning | office | Inactivity | לפתוח את היום בעוצמה | בוקר בפארק, אוויר פתוח, ראש צלול. 29 דקות שיכניסו … | כללי | זמן להתאושש. בוא/י לאימון בנייה מחדש כדי להמשיך חזק יותר. | 62 | park-only content at a non-park location |
| morning | office | Location_Based | ים של אנרגיה: אימון כללי | בדרך לים או לבריכה? בוא לבוסט מהיר של גוף מלא_פיזי… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| morning | office | Habit_Maintenance | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | park | Daily_Goal | לנצל את השמש: אימון בפארק | המזג אוויר מושלם לתנועה בחוץ. 30 דקות של כללי בפאר… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| lunch | park | Inactivity | אימון אמצע יום | הפוגה מהשגרה. 29 דקות של גוף מלא לרענן את הגוף ולח… | כללי | ה@מיקום מחכה לדיוק שלך. @זמן_אימון דקות של @קטגוריה טכנית. | 62 | unresolved token literal: "@מיקום" |
| lunch | park | Location_Based | אימון אמצע יום | הפוגה מהשגרה. 30 דקות של גוף מלא לרענן את הגוף ולח… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | park | Habit_Maintenance | לפתוח את היום בעוצמה | בוקר בפארק, אוויר פתוח, ראש צלול. 28 דקות שיכניסו … | כללי | _(no match)_ | 0 | 0 push candidates matched; "morning" wording outside the morning slot |
| lunch | home | Daily_Goal | אימון אמצע יום בבית | 29 דקות חדות בין המשימות — לשמור על המנוע דולק. | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| lunch | home | Inactivity | אימון אמצע יום בבית | 29 דקות חדות בין המשימות — לשמור על המנוע דולק. | כללי | 3 ק"מ של עוצמה. בוא/י לשפר את המהירות המקסימלית. | 62 |  |
| lunch | home | Location_Based | אימון אמצע יום בבית | 29 דקות חדות בין המשימות — לשמור על המנוע דולק. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | home | Habit_Maintenance | אימון אמצע יום בבית | 28 דקות חדות בין המשימות — לשמור על המנוע דולק. | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | street | Daily_Goal | אימון אמצע יום | הפוגה מהשגרה. 29 דקות של גוף מלא לרענן את הגוף ולח… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| lunch | street | Inactivity | אימון אמצע יום | הפוגה מהשגרה. 29 דקות של גוף מלא לרענן את הגוף ולח… | כללי | יום שמש מושלם! @בוא/י לאימון קצר בחוץ ב@מיקום. | 62 | unresolved token literal: "@בוא" |
| lunch | street | Location_Based | אימון אמצע יום | הפוגה מהשגרה. 29 דקות של גוף מלא לרענן את הגוף ולח… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | street | Habit_Maintenance | אימון אמצע יום | הפוגה מהשגרה. 28 דקות של גוף מלא לרענן את הגוף ולח… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | gym | Daily_Goal | אימון אמצע יום | הפוגה מהשגרה. 30 דקות של גוף מלא לרענן את הגוף ולח… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| lunch | gym | Inactivity | ים של אנרגיה: אימון כללי | בדרך לים או לבריכה? בוא לבוסט מהיר של גוף מלא_פיזי… | כללי | ה-@basePace שלך השתפר! בוא/י לשבור שיא ב-5 ק"מ. | 62 | unresolved token literal: "@basePace" |
| lunch | gym | Location_Based | חורף חם: אימון ביתי בסלון | קר בחוץ? הכי כיף להתחמם עם אימון כללי בסלון. 29 דק… | כללי | _(no match)_ | 0 | 0 push candidates matched; home-only content at a non-home location |
| lunch | gym | Habit_Maintenance | חם בחוץ? אימון קריר בפנים | הטמפרטורות עולות. 28 דקות של כללי במזגן במכון כושר… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | office | Daily_Goal | לנצל את השמש: אימון במשרד | המזג אוויר מושלם לתנועה בחוץ. 29 דקות של כללי במשר… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| lunch | office | Inactivity | ים של אנרגיה: אימון כללי | בדרך לים או לבריכה? בוא לבוסט מהיר של גוף מלא_פיזי… | כללי | ריצת 5 ק"מ ב-Flow. בוא/י לראות כמה ה-@basePace נהיה קל. | 62 | unresolved token literal: "@basePace" |
| lunch | office | Location_Based | אימון אמצע יום | הפוגה מהשגרה. 29 דקות של גוף מלא לרענן את הגוף ולח… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| lunch | office | Habit_Maintenance | אימון אמצע יום | הפוגה מהשגרה. 21 דקות של גוף מלא לרענן את הגוף ולח… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | park | Daily_Goal | לסגור את היום בפארק | אור אחרון, אוויר קריר. 29 דקות של גוף מלא שמסיימות… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| evening | park | Inactivity | לסגור את היום בפארק | אור אחרון, אוויר קריר. 29 דקות של גוף מלא שמסיימות… | כללי | מוכן/ה לדו-ספרתי? 10 ק"מ של סיפוק מחכים לך. | 62 |  |
| evening | park | Location_Based | לסגור את היום בפארק | אור אחרון, אוויר קריר. 28 דקות של גוף מלא שמסיימות… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | park | Habit_Maintenance | לסגור את היום בפארק | אור אחרון, אוויר קריר. 29 דקות של גוף מלא שמסיימות… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | home | Daily_Goal | סשן ערב חד | יום ארוך לא סותר עצימות. 30 דקות ממוקדות בבית — עק… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| evening | home | Inactivity | סשן ערב חד | יום ארוך לא סותר עצימות. 29 דקות ממוקדות בבית — עק… | כללי | הסוד הוא עקביות. בוא/י לשמור על קצב @basePace חזק. | 62 | unresolved token literal: "@basePace" |
| evening | home | Location_Based | סשן ערב חד | יום ארוך לא סותר עצימות. 29 דקות ממוקדות בבית — עק… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | home | Habit_Maintenance | סשן ערב חד | יום ארוך לא סותר עצימות. 29 דקות ממוקדות בבית — עק… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | street | Daily_Goal | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| evening | street | Inactivity | אימון אמצע יום | הפוגה מהשגרה. 28 דקות של גוף מלא לרענן את הגוף ולח… | כללי | הרגליים כבדות מהטיסה? בוא/י לשחרור קצר שיחזיר לך את האנרגיה. | 62 |  |
| evening | street | Location_Based | לנצל את השמש: אימון ברחוב | המזג אוויר מושלם לתנועה בחוץ. 30 דקות של כללי ברחו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | street | Habit_Maintenance | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | gym | Daily_Goal | סשן ערב חד | יום ארוך לא סותר עצימות. 28 דקות ממוקדות בבית — עק… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 | home-only content at a non-home location |
| evening | gym | Inactivity | חם בחוץ? אימון קריר בפנים | הטמפרטורות עולות. 28 דקות של כללי במזגן במכון כושר… | כללי | מרגיש/ה כבדות? משתמש, בוא/י לאימון שחרור קליל שיחזיר לך את ה… | 62 |  |
| evening | gym | Location_Based | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | gym | Habit_Maintenance | לנצל את השמש: אימון במכון כושר | המזג אוויר מושלם לתנועה בחוץ. 28 דקות של כללי במכו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| evening | office | Daily_Goal | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| evening | office | Inactivity | ים של אנרגיה: אימון כללי | בדרך לים או לבריכה? בוא לבוסט מהיר של גוף מלא_פיזי… | כללי | ה@מיקום מחכה לדיוק שלך. @זמן_אימון דקות של @קטגוריה טכנית. | 62 | unresolved token literal: "@מיקום" |
| evening | office | Location_Based | סשן ערב חד | יום ארוך לא סותר עצימות. 27 דקות ממוקדות בבית — עק… | כללי | _(no match)_ | 0 | 0 push candidates matched; home-only content at a non-home location |
| evening | office | Habit_Maintenance | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | park | Daily_Goal | לסגור את היום בפארק | אור אחרון, אוויר קריר. 30 דקות של גוף מלא שמסיימות… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 |  |
| night | park | Inactivity | סשן לילה שקט | גם ההתאוששות היא חלק מהאימון. 30 דקות של תנועה נקי… | כללי | בדרך למרוץ 10 ק"מ? בוא/י לאימון הכנה מדויק. | 62 |  |
| night | park | Location_Based | לנצל את השמש: אימון בפארק | המזג אוויר מושלם לתנועה בחוץ. 29 דקות של כללי בפאר… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | park | Habit_Maintenance | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | home | Daily_Goal | סשן לילה שקט | מאוחר אבל בראש של אימון? 30 דקות ממוקדות בבית, בלי… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| night | home | Inactivity | סשן לילה שקט | מאוחר אבל בראש של אימון? 29 דקות ממוקדות בבית, בלי… | כללי | בונים כושר ב@מיקום. בוא/י לאימון שלב ה-Build לשיפור הקצב. | 62 | unresolved token literal: "@מיקום" |
| night | home | Location_Based | סשן לילה שקט | מאוחר אבל בראש של אימון? 30 דקות ממוקדות בבית, בלי… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | home | Habit_Maintenance | סשן לילה שקט | מאוחר אבל בראש של אימון? 29 דקות ממוקדות בבית, בלי… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | street | Daily_Goal | חם בחוץ? אימון קריר בפנים | הטמפרטורות עולות. 29 דקות של כללי במזגן ברחוב כדי … | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| night | street | Inactivity | אימון אמצע יום | הפוגה מהשגרה. 30 דקות של גוף מלא לרענן את הגוף ולח… | כללי | 3 ק"מ של עוצמה. בוא/י לשפר את המהירות המקסימלית. | 62 |  |
| night | street | Location_Based | סשן לילה שקט | גם ההתאוששות היא חלק מהאימון. 28 דקות של תנועה נקי… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | street | Habit_Maintenance | חם בחוץ? אימון קריר בפנים | הטמפרטורות עולות. 30 דקות של כללי במזגן ברחוב כדי … | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | gym | Daily_Goal | ים של אנרגיה: אימון כללי | בדרך לים או לבריכה? בוא לבוסט מהיר של גוף מלא_פיזי… | כללי | באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד | 2 |  |
| night | gym | Inactivity | לנצל את השמש: אימון במכון כושר | המזג אוויר מושלם לתנועה בחוץ. 29 דקות של כללי במכו… | כללי | הסוד הוא עקביות. בוא/י לשמור על קצב @basePace חזק. | 62 | unresolved token literal: "@basePace" |
| night | gym | Location_Based | לנצל את השמש: אימון במכון כושר | המזג אוויר מושלם לתנועה בחוץ. 30 דקות של כללי במכו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | gym | Habit_Maintenance | חורף חם: אימון ביתי בסלון | קר בחוץ? הכי כיף להתחמם עם אימון כללי בסלון. 30 דק… | כללי | _(no match)_ | 0 | 0 push candidates matched; home-only content at a non-home location |
| night | office | Daily_Goal | סשן לילה שקט | מאוחר אבל בראש של אימון? 30 דקות ממוקדות בבית, בלי… | כללי | רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים | 2 | home-only content at a non-home location |
| night | office | Inactivity | חורף חם: אימון ביתי בסלון | קר בחוץ? הכי כיף להתחמם עם אימון כללי בסלון. 29 דק… | כללי | עוד שלב בדרך ליעד. שבוע @weekNumber מחכה שתכבוש/י אותו. | 62 | unresolved token literal: "@weekNumber"; home-only content at a non-home location |
| night | office | Location_Based | גזרת קיץ: חיטוב בשיא החום | הקיץ כאן וזה הזמן להראות את התוצאות. בוא לחיטוב גו… | כללי | _(no match)_ | 0 | 0 push candidates matched |
| night | office | Habit_Maintenance | ים של אנרגיה: אימון כללי | בדרך לים או לבריכה? בוא לבוסט מהיר של גוף מלא_פיזי… | כללי | _(no match)_ | 0 | 0 push candidates matched |
