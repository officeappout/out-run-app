# ביקורת שדה type — סתירות בין reps ל-time

> **קריאה בלבד.** נקרא ישירות מ-`exercises` ב-Firestore (raw docs, לא
> `getAllExercises()`/`normalizeExercise` — הנרמול משלים `type` ברירת מחדל
> `'reps'` כשהוא חסר, מה שהיה מסתיר בדיוק את הדפוס §4 למטה). 372 תרגילים
> נסרקו. אלה 4 הדפוסים שהתבקשו + ממצא נוסף שנמצא תוך כדי בנייה.

## רקע — 6 מקורות קוד שנמצאו ותוקנו בסבב הזה (חלק 1, פירוט מלא ב-03-CHANGES.md)

`isTimeBasedExercise` (`workout-budgeting.utils.ts:348`) דטרמיניסטית וטהורה —
הבעיה מעולם לא הייתה בה, אלא במקומות שדרסו/פספסו אותה במורד הזרם. אומת ישירות:
אותו `exercise_id` ("שכיבות סמיכה ברכיים") הופיע ב-snapshot.sqlite עם
`is_time_based=0` (55 ריצות) **וגם** `=1` (38 ריצות), `exerciseRole='main'`
בשני הצדדים — סתירה אמיתית, לא רעש.

| # | קובץ | הבעיה | התיקון |
|---|---|---|---|
| 1 | `tabata.block.ts` (pool-injection) | `isTimeBased:false` קשיח, בעוד `reps` מכיל שניות (`TABATA_CLASSIC.workSec`) — סתירה ישירה באותה שורה | `isTimeBased:true` — חריג מוצהר ומתועד, הפרוטוקול תמיד תוחם-זמן |
| 2 | `warmup.service.ts` | שכפול חלקי של הלוגיקה, בלי היוריסטיקת השם | קריאה ישירה ל-`isTimeBasedExercise` |
| 3 | `cooldown.service.ts` | שכפול צר ביותר — רק `type==='time'`, בלי straight_arm ובלי היוריסטיקת שם | קריאה ישירה ל-`isTimeBasedExercise` |
| 4 | `home-workout.service.ts` (`generateRecoveryWorkout`) | `reps:15` קשיח לכולם + שכפול לוגיקה חלקי | קריאה ישירה + `reps` נגזר (20 אם זמן, 15 אם לא) |
| 5 | `trio-modifiers.service.ts` (`applyEssentialGearFilter`, naked-backfill) | `isTimeBased:false, reps:10` קשיח לכל תרגיל שנשלף מהמאגר הגולמי | קריאה ישירה + `reps` נגזר |
| 6 | `trio-modifiers.service.ts` (`applyFlowRegression`) | **הכי חמור** — מחליף `ex.exercise` לגמרי (רמת-רגרסיה, בולט 1) בלי לחשב מחדש `isTimeBased`/`mechanicalType` בכלל — התרגיל החדש יורש את הטבע של הישן | חישוב מחדש מיד אחרי ההחלפה |

בנוסף: `isTimeBasedExercise` עצמה תוקנה — `getLocalizedText` בררת מחדל ל-'he',
והקטלוג הזה עברית-בלבד בפועל, כך שהיוריסטיקת השם (hold/plank/hang, לטינית)
כמעט אף פעם לא ירתה על דאטה אמיתי. נוסף `'פלאנק'` כמילת מפתח עברית מפורשת —
נמצא ישירות דרך כתיבת הטסטים לתיקון הזה, לא ניחוש.

**כל הנתיבים האלה תוקנו ואומתו: קריאה חוזרת אמיתית של `generateHomeWorkoutTrio`
אחרי כל תיקון אישרה שהסתירה נעלמה בדיוק בנקודה שאותרה.** נתיבים נוספים שנבדקו
ואומתו כבר נכונים (לא תוקנו כי אין בהם באג): `WorkoutGenerator.ts`'s David Rule,
`applyIntenseOption`, `pyramid.processor.ts`, שלושת מעברי `GuaranteePassRunner.ts`
(דרך `substituteExercise` המשותפת), `assignVolume` (הנתיב הראשי), `applySmartSetCap`
(לא נוגע ב-isTimeBased כלל — רק בכמות סטים). שני מקומות עם `isTimeBased:true`
קשיח נבדקו ואומתו כתקינים בכוונה — לא תוקנו: `home-workout.service.ts` ו-
`recovery-video-content.service.ts`'s "אימון וידאו ליום מנוחה" (sets:1/reps:1 —
בנאי UI לצפייה בסרטון, לא נתון reps/זמן אמיתי).

**התפלגות `type` בקטלוג:**

| ערך | ספירה |
|---|---|
| `reps` | 227 |
| `time` | 91 |
| `(missing)` | 54 |

**התפלגות `loggingMode` בקטלוג** (נדרש לצלוב, אבל ראו הערה למטה — שדה ממערכת אחרת):

| ערך | ספירה |
|---|---|
| `reps` | 305 |
| `(missing)` | 54 |
| `completion` | 13 |

**הערה על `loggingMode`:** `LoggingMode = 'reps' | 'completion'` — שדה נפרד
מ-`ExerciseType`, לא קשור ללוגיקת reps-מול-time של `isTimeBasedExercise`. נבדק
ישירות בקוד: הצריכה היחידה שלו במנוע היא `hybrid/station-content-resolver.ts`
(תחום נפרד — תחנות פארק/hybrid, לא מסלול האימון הרגיל). הוצג כאן כי התבקש
במפורש, לא כי הוא חלק מהבאג.

---

## 1. `type='reps'` אבל `mechanicalType='straight_arm'` — 20 תרגילים

`isTimeBasedExercise` כבר דורס את זה בזמן ריצה (straight_arm מנצח, ומדפיס
`console.warn` על כל קריאה) — כלומר **כל אחד מ-20 האלה מדפיס אזהרה בכל
פעם שהוא נבחר לאימון.** זה תיקון פאנל טהור: לשנות `type` ל-`'time'` בכל שורה.

| שם | type | loggingMode | mechanicalType | movementGroup | הערה | id |
|---|---|---|---|---|---|---|
| הליכות קיר | `reps` | `reps` | `straight_arm` | `vertical_push` |  | `ANvq7ORET7uhLRK4XP6X` |
| דגל אקצנטרי בטאק | `reps` | `reps` | `straight_arm` | `core` |  | `FSbQ2OfFSDzWxGOSRljt` |
| הרמות פרונט לבר רגל אחת | `reps` | `reps` | `straight_arm` | `horizontal_pull` |  | `GXxEpd4yrxil9l6Ajtso` |
| הרמות פרונט לבר בטאק מתקדם | `reps` | `reps` | `straight_arm` | `horizontal_pull` |  | `H9ySMJX46OSm3TgpGn3l` |
| לחיצה מישיבת L לפלנאץ׳ בטאק | `reps` | `reps` | `straight_arm` | `horizontal_push` |  | `HSYxn9dL4d9nUImW3Y7G` |
| סקין דה קאט אקצנטרי (סיבוב על הטבעות שלילי) | `reps` | `reps` | `straight_arm` | `horizontal_pull` |  | `Ku0VMTQFlcAHLMGJ9i6W` |
| שולחן הפוך | `reps` | `reps` | `straight_arm` | `core` |  | `RxpMhnXQBW80jq1no41f` |
| פרפר הפוך | `reps` | `reps` | `straight_arm` | `horizontal_pull` |  | `TlzqC2LIRj0pFLWDILMF` |
| ישיבת L דינמית | `reps` | `reps` | `straight_arm` | `core` |  | `Tr4sEMGrkRtv85IuvE2q` |
| דדליפט הפוך | `reps` | `reps` | `straight_arm` | `horizontal_pull` |  | `VS3FjnFAgULO96XLMK72` |
| סקין דה קאט בטאק (סיבוב על הטבעות בטאק) | `reps` | `reps` | `straight_arm` | `horizontal_pull` |  | `VnLIyB2OtNdPO7Dgl0P6` |
| סקין דה קאט חצי גוף (סיבוב על הטבעות חצי גוף) | `reps` | `reps` | `straight_arm` | `horizontal_pull` |  | `Zmw7ImX37gFhnEcf4GLv` |
| מתח שכמות קשתים | `reps` | `reps` | `straight_arm` | `vertical_pull` |  | `bYVShoP3T506soTMWxHO` |
| מתח שכמות יד אחת | `reps` | `reps` | `straight_arm` | `vertical_pull` |  | `bipC8JTcoyzcJv5Ue0ep` |
| לחיצה מישיבת L לפייק | `reps` | `reps` | `straight_arm` | `horizontal_push` |  | `kb1MB9It40iDOrR1aacW` |
| הרמות פרונט לבר חצי גוף | `reps` | `reps` | `straight_arm` | `horizontal_pull` |  | `n8rmFjVAjKNEfvRt1QwS` |
| מתח שכמות יד אחת עם תמיכה | `reps` | `reps` | `straight_arm` | `vertical_pull` |  | `nSZYgU7RTLsOI8kaxpQj` |
| סקין דה קאט טאק מתקדם | `reps` | `reps` | `straight_arm` | `horizontal_pull` |  | `pEn9K4g6QMLfi80lkC6i` |
| הרמות פרונט לבר בטאק | `reps` | `reps` | `straight_arm` | `horizontal_pull` |  | `r6F53Wm92MuJiDRQsEdp` |
| הרמות פרונט לבר בפישוק | `reps` | `reps` | `straight_arm` | `horizontal_pull` |  | `rjZ61De9VjHeFUu44pwL` |

---

## 2. `type='reps'` אבל השם מכיל מילת-מפתח החזקה — 6 תרגילים

מילות המפתח שנבדקות: hold/plank/hang/החזק/פלאנק (הרשימה המלאה של
`isTimeBasedExercise`, אחרי התיקון לפרומט הזה שהוסיף 'פלאנק' — ראו
03-CHANGES.md). כמו קטגוריה 1 — נדרס בזמן ריצה, אבל שדה `type` בפאנל שגוי.

| שם | type | loggingMode | mechanicalType | movementGroup | הערה | id |
|---|---|---|---|---|---|---|
| פלאנק רגל ויד נגדית | `reps` | `reps` | `—` | `core` |  | `8YpK2KnydcB6Oz1zTMSh` |
| פלאנק עליות ונגיעות בכתפיים | `reps` | `reps` | `—` | `core` |  | `BWbscvj0m3hvxghEMtKV` |
| מתח אקצנטרי עם החזקות | `reps` | `reps` | `bent_arm` | `vertical_pull` |  | `gEEbTNLGhfAIGMCaDCI9` |
| החזקות מקבילים אקצנטרי | `reps` | `reps` | `bent_arm` | `vertical_push` |  | `i5IBSF7eXfN640A6isyM` |
| מתח עם החזקות | `reps` | `reps` | `bent_arm` | `vertical_pull` |  | `nCze4KVY6zUMkzYISWf1` |
| כפיפות ברכים בפלאנק על trx | `reps` | `reps` | `—` | `core` |  | `nNc7TeLC8LtaVQJeK4Tf` |

---

## 3. `type='time'` אבל `movementGroup` דינמי (סקוואט/היפ-הינג'/לאנג'/דחיפה/משיכה) — 55 תרגילים

**תוקן כאן לפני הפרסום — הבדיקה הראשונית שלי הייתה שגויה, מתועד כדי לא לחזור על
הטעות:** ניחשתי ש-DYNAMIC_MOVEMENT_GROUPS דורס `type='time'` בחזרה ל-`false`,
כמו שהוא דורס את ברירת המחדל. **בדקתי ישירות מול הקוד ולא כך — `type==='time'`
הוא הבדיקה הראשונה בפונקציה ומחזיר `true` באופן מיידי, לפני שה-DYNAMIC_MOVEMENT_
GROUPS guard נבדק בכלל.** אומת ריצה אמיתית: `isTimeBasedExercise({type:'time',
movementGroup:'vertical_pull', ...})` → `true`. **כלומר אין כאן באג פונקציונלי —
כל 55 האלה כן יוצגו נכון כ"זמן".**

מה שכן נשאר פה מעניין: 55 תרגילים (60% מתוך 91 תרגילי `type='time'`
בקטלוג כולו) הם החזקות/סקילים ש-`movementGroup` שלהם מקובע למשפחה
"דינמית"-לכאורה (vertical_pull/horizontal_push/squat וכו'). זה **כנראה תקין
בכוונה** — למשל "החזקת מתח ב-15°" שייך למסלול/סולם הרמות של vertical_pull
(פרוגרסיית משיכה), לא לתוכנית סקיל נפרדת — בדיוק כמו שתרגילי דגל שייכים
ל-human_flag ולא ל-core (00-PLAN.md §12.3, טופל בסבב קודם). **לא תוקן כאן —
זו לא סתירה פונקציונלית, ולא ברור שהיא בכלל טעות תיוג. מסומן לעיון דוד, לא
לתיקון.**

| שם | type | loggingMode | mechanicalType | movementGroup | הערה | id |
|---|---|---|---|---|---|---|
| תלייה באחיזה עמוקה | `time` | `reps` | `straight_arm` | `vertical_pull` |  | `26Sv7XtYoiHHVNC3ixSN` |
| החזקת מתח ב-15° | `time` | `reps` | `bent_arm` | `vertical_pull` |  | `2Fl1kzroDz81c4gbuKlU` |
| בק לבר | `time` | `reps` | `straight_arm` | `horizontal_pull` |  | `2rRyq5b7CLbJuOgm8ODa` |
| פרונט לבר רגל אחת בעזרת גומייה | `time` | `reps` | `straight_arm` | `horizontal_pull` |  | `3zffAO0k2ZaHs0WkkQuT` |
| החזקת מתח יד אחת ב-15° | `time` | `reps` | `bent_arm` | `vertical_pull` |  | `48HQdvWfODiRsyd1WQOl` |
| החזקת מקבילים ב-120° עם גומייה | `time` | `reps` | `bent_arm` | `vertical_push` |  | `4YCuuEsNVwUcxNxp3m9H` |
| החזקת מקבילים ב-90° עם גומייה | `time` | `reps` | `bent_arm` | `vertical_push` |  | `7ocGV3FbYbue9nXC8aXh` |
| עמידת פייק | `time` | `reps` | `straight_arm` | `vertical_push` |  | `9BBOvu1SNMzNxgPun8ZH` |
| החזקת מקבילים ב-15° | `time` | `reps` | `bent_arm` | `vertical_push` |  | `Bkb5i5YfYocKrQILfbY3` |
| תלייה פסיבית בתמיכת הרגליים | `time` | `reps` | `straight_arm` | `vertical_pull` |  | `DnRgN3J7j5k6aTKX7lj3` |
| סקוואט כנגד קיר רגל אחת | `time` | `reps` | `—` | `squat` |  | `Du2quNOcewafWMcpxGjq` |
| פרונט לבר בפישוק עם גומייה | `time` | `reps` | `straight_arm` | `horizontal_pull` |  | `DyNJgiO3Y70xKMf48HER` |
| הישענות פסודו פלאנץ׳ | `time` | `reps` | `straight_arm` | `horizontal_push` |  | `E03CQ89CeVwQlVkjxR0d` |
| החזקת מתח ב-15° עם תמיכה | `time` | `reps` | `bent_arm` | `vertical_pull` |  | `FymBLLEurdZP6D7GVoXY` |
| פלאנץ׳ בטאק בעזרת גומייה דקה | `time` | `reps` | `straight_arm` | `horizontal_push` |  | `GWXRsgNHry3dgqpTwCWS` |
| מתח שכמות (תלייה אקטיבית פסיבית) | `time` | `reps` | `straight_arm` | `vertical_pull` |  | `GhVf8ZD1uJR40zA9a7LF` |
| פלאנץ׳ בטאק | `time` | `reps` | `straight_arm` | `horizontal_push` |  | `IHHbt3DABJGof6QxaeVg` |
| החזקת תמיכה על טבעות עם עזרה | `time` | `reps` | `straight_arm` | `vertical_push` |  | `MV1xme0QqOIXMJ23DogV` |
| עמידת פייק גובה שוק | `time` | `reps` | `straight_arm` | `vertical_push` |  | `OaqZzXOBwfVmdJ99w3iC` |
| עמידת ידיים חזה לקיר | `time` | `reps` | `straight_arm` | `vertical_push` |  | `PVqGiE3xg76Dg0EXUsqZ` |
| בננה סופרמן על המתח | `time` | `reps` | `straight_arm` | `vertical_pull` |  | `PnlKBGNsM3XSPN7LG3OH` |
| עמידת ידיים חזה לקיר ב-45° | `time` | `reps` | `straight_arm` | `vertical_push` |  | `RPGCJ5BXPpPG21sF3H4y` |
| החזקת מתח ב-90° | `time` | `reps` | `bent_arm` | `vertical_pull` |  | `SLYwYGa0S8N7XSzSsTkc` |
| החזקת מקבילים ב-15° עם גומייה | `time` | `reps` | `bent_arm` | `vertical_push` |  | `SVWvr2YKMtQN3SJiqWmY` |
| עמידת ידיים | `time` | `reps` | `straight_arm` | `vertical_push` |  | `T95vtujpj07Tq4jRvRxf` |
| פלאנץ׳ בטאק מתקדם  | `time` | `reps` | `straight_arm` | `horizontal_push` |  | `UDep0WLPWfBf9wIhjQGw` |
| פרונט לבר יהלום | `time` | `reps` | `straight_arm` | `horizontal_pull` |  | `USVeZ8mvQNeaconZ9KuG` |
| פלאנץ׳ יהלום בעזרת גומייה דקה | `time` | `reps` | `straight_arm` | `horizontal_push` |  | `W69akLqaO2HD6y9ydzKe` |
| עמידת פייק גובה ברך | `time` | `reps` | `straight_arm` | `vertical_push` |  | `WQBYjQxJEc9Y6FWHigTH` |
| החזקת מתח יד אחת ב-90° | `time` | `reps` | `bent_arm` | `vertical_pull` |  | `WRY4OTLIfEYxdIWZ82hm` |
| פלאנץ׳ בטאק מתקדם בעזרת גומייה דקה | `time` | `reps` | `straight_arm` | `horizontal_push` |  | `WfIRO7kYSBP26ZgoByDX` |
| החזקת מתח יד אחת ב-120° | `time` | `reps` | `bent_arm` | `vertical_pull` |  | `WhivG5FdpScdWU0ZHR3x` |
| תלייה פסיבית | `time` | `reps` | `straight_arm` | `vertical_pull` |  | `Xk0WZ34nEX802B0FxkpA` |
| בק לבר בפישוק | `time` | `reps` | `straight_arm` | `horizontal_pull` |  | `Y3A9AJWaJ6m2cVIoJS7T` |
| החזקת שכיבת סמיכה ב-90° במרפק | `time` | `reps` | `bent_arm` | `horizontal_push` |  | `YMT1UiAdwFPKVjHpyMMz` |
| פרונט לבר בפישוק | `time` | `reps` | `straight_arm` | `horizontal_pull` |  | `ZvmddvrFV5NgwLAgrvec` |
| החזקת מתח ב-90° עם תמיכה | `time` | `reps` | `bent_arm` | `vertical_pull` |  | `aI79OpwpSkVK05nTzkYc` |
| בק לבר בטאק | `time` | `reps` | `straight_arm` | `horizontal_pull` |  | `aSZkQwSZNbaZoPZtxn5q` |
| פרונט לבר מלא | `time` | `reps` | `straight_arm` | `horizontal_pull` |  | `aca3BmSZGKY8ZSTU7qKM` |
| פרונט לבר יהלום עם גומייה | `time` | `reps` | `straight_arm` | `horizontal_pull` |  | `awTUBO1WaFwllqE2XSwX` |
| החזקת מקבילים ב-90° | `time` | `reps` | `bent_arm` | `vertical_push` |  | `bilfw71EhTkDTSv759sV` |
| החזקת מקבילים ב-120° | `time` | `reps` | `bent_arm` | `vertical_push` |  | `jPzXgBtka83RxOgOy8kQ` |
| בק לבר בטאק מתקדם | `time` | `reps` | `straight_arm` | `horizontal_pull` |  | `k0IkLkbf3b8YbUfD5lBR` |
| פרונט לבר חצי גוף | `time` | `reps` | `straight_arm` | `horizontal_pull` |  | `k4GYQX6hRTZxlEzNBofN` |
| פרונט לבר בטאק מתקדם עם גומייה | `time` | `reps` | `straight_arm` | `horizontal_pull` |  | `pgF5rdC4szYH0xGDoZWj` |
| החזקת חתירה ב-90° מעלות במרפק | `time` | `reps` | `bent_arm` | `horizontal_pull` |  | `rUIkmXn3wSpWdt3QbZ2C` |
| פרונט לבר בטאק מתקדם | `time` | `reps` | `straight_arm` | `horizontal_pull` |  | `s9wsh3t7hrr49oxJK6uI` |
| החזקת תמיכה על טבעות | `time` | `reps` | `straight_arm` | `vertical_push` |  | `saxsXI4s9c1a4CAvi8H0` |
| החזקת מקבילים | `time` | `reps` | `straight_arm` | `vertical_push` |  | `tqu4x2f4Zb8FUeokI0aL` |
| החזקת מתח ב-120° עם תמיכה | `time` | `reps` | `bent_arm` | `vertical_pull` |  | `uDGKZMVzOIoGAhSurvzR` |
| החזקת פיסטול סקוואט | `time` | `reps` | `—` | `squat` |  | `uw9RwLsBYD9P1Hrw7jN7` |
| פרונט לבר בטאק | `time` | `reps` | `straight_arm` | `horizontal_pull` |  | `vdsST9Joc5fpZzCgpDbq` |
| החזקת מתח ב-120° | `time` | `reps` | `bent_arm` | `vertical_pull` |  | `wKGGFlDiIZDukG4MVoHD` |
| עמידת פייק גובה אגן | `time` | `reps` | `straight_arm` | `vertical_push` |  | `yqOBxqITC8gc44CG5IXE` |
| סקוואט סטטי כנגד קיר | `time` | `reps` | `—` | `squat` |  | `zXXMkiGHRGQH66J09OYs` |

---

## 4. `type` חסר לגמרי — 54 תרגילים

אלה נופלים ישירות להיוריסטיקות (mechanicalType → movementGroup → שם) בלי שום
איתות מפורש מה-CMS. לא בעיה בפני עצמה (ה-fallback עובד), אבל כל אחד מהם תלוי
לגמרי בכך שהשם/mechanicalType/movementGroup שלו נכונים — אין רשת ביטחון שנייה.

| שם | type | loggingMode | mechanicalType | movementGroup | הערה | id |
|---|---|---|---|---|---|---|
| מתיחת המסתרינג בשכיבה | `—` | `—` | `—` | `—` |  | `24acSdN3XiV2NZ7UnSkZ` |
| חימום סיבובי מפרקים | `—` | `—` | `—` | `—` |  | `34LJ5pJYnk5GPr77xlG9` |
| חצי סמוך קום | `—` | `—` | `—` | `—` |  | `3dIrpJQHp5QbimPVTZDk` |
| הליכות דוב | `—` | `—` | `—` | `—` |  | `4GVlUbVr5r9gNdUCKagI` |
| מתיחת ישיבה בפייק | `—` | `—` | `—` | `—` |  | `4Sjv6yU3LOD6vmaDfz43` |
| סמוך קום | `—` | `—` | `—` | `—` |  | `4kww5BB13UkNaaAjZKS0` |
| חימום סיבובי ירך | `—` | `—` | `—` | `—` |  | `4wCedrBoFjPePiymHoYP` |
| מתיחת דוגמנית | `—` | `—` | `—` | `—` |  | `7spjueGo4OFPIrHHu3Jl` |
| חימום רוטציות לצדדים עמוד השדרה | `—` | `—` | `—` | `—` |  | `8WN9CquCscUXK5SvNiIn` |
| הליכות זחל | `—` | `—` | `—` | `—` |  | `AdIAFteC2tmYWTPaaDtl` |
| פשיטת מרפקים יד מאחורי הראש בהתנגדות גומיה | `—` | `—` | `—` | `—` |  | `CQtZDiAEvfNB8khudfsG` |
| הרחקת כתף שמאל | `—` | `—` | `—` | `—` |  | `DCnxDF0lbfzXLloH8gYp` |
| מתיחות יד אחורית | `—` | `—` | `—` | `—` |  | `GEnSPwxEqIK6HTakuXOI` |
| חימום דינמי ריצה במקום | `—` | `—` | `—` | `—` |  | `GSPTjOAgRueyZZPkryqe` |
| מתיחות שורש כף יד | `—` | `—` | `—` | `—` |  | `J6KQxmkJHwVqVGgnKhVm` |
| חימום כפיפות צידיות | `—` | `—` | `—` | `—` |  | `JBfizf0KaVURhTYjXZac` |
| כפיפת כתף בהתנגדות גומיה | `—` | `—` | `—` | `—` |  | `LitmztKbOSD9MvQwBDsE` |
| מתיחת כתף | `—` | `—` | `—` | `—` |  | `LvRPIsxlZMgYRNBFxFaM` |
| מתיחת קרסול ושוקיים | `—` | `—` | `—` | `—` |  | `MkVq2PbvCCAM77AEEjtN` |
| חימום הנפות | `—` | `—` | `—` | `—` |  | `RAbscOoGqbAN8CbGEYhe` |
| הליכות זחל | `—` | `—` | `—` | `—` |  | `T1XghOTmtU74SeRRg9vb` |
| לחיצת כתפיים בהתנגות גומייה | `—` | `—` | `—` | `—` |  | `TZMFGuNweuAnTLIjyhkx` |
| חימום סיבובי ידיים | `—` | `—` | `—` | `—` |  | `UdAmrvtDL0nBYnj8UMe1` |
| כפיפת מרפקים בהתנגדות גומיה | `—` | `—` | `—` | `—` |  | `UmPbE7WydxjOSw5UlDIT` |
| לחיצת חזה בשכיבה בהתנגדות גומיה | `—` | `—` | `—` | `—` |  | `Vr2htqrpnuBObpjzzzyj` |
| חימום כפיפות לפנים | `—` | `—` | `—` | `—` |  | `WkXqEGdoSpq8KeC6EGAn` |
| מתיחת כלב מביט מבט | `—` | `—` | `—` | `—` |  | `ZWx6yKLawdjSrImWUQoL` |
| חימום דנימי קפיצות כוכב | `—` | `—` | `—` | `—` |  | `ZYssXGqyPrIgvV1vXJcn` |
| מתיחת חתול פרה | `—` | `—` | `—` | `—` |  | `ZmVz1kaBwhYqPPAqnkax` |
| חתירות בעמידה בהתנגדות גומיה | `—` | `—` | `—` | `—` |  | `ZovShNVtJBRPgdwsngxr` |
| מתיחת פרפר | `—` | `—` | `—` | `—` |  | `dK6Rcu8r93CeaBNOL0EU` |
| הליכת סרטן | `—` | `—` | `—` | `—` |  | `eEqv5jF3JkNduEM9Qgp7` |
| חימום סיבובי ברכיים | `—` | `—` | `—` | `—` |  | `eHCiPK74PTW3b7CdrhaZ` |
| חימום סיבובי קרסול | `—` | `—` | `—` | `—` |  | `eHjbkb9XIK2txbwgYWH4` |
| סמוך קום עם שכיבת סמיכה | `—` | `—` | `—` | `—` |  | `f4ZbXHOaV5lRTC9JQPkk` |
| מתיחת ירך קדמית | `—` | `—` | `—` | `—` |  | `g5M36kx6sXaRr8MMWLJj` |
| שכיבות סמיכה בהתנגדות גומיה | `—` | `—` | `—` | `—` |  | `gGlZXMEjhAXTxxmO3hTN` |
| מתיחת מתפלל | `—` | `—` | `—` | `—` |  | `gWHaGzObmixb1vr66l5I` |
| שחיין חזה | `—` | `—` | `—` | `—` |  | `hB253EVZ8ksjQyve6TOu` |
| עמידת כלב רגל ויד נגדית | `—` | `—` | `—` | `—` |  | `hECufw1PU0a0lcUEadY9` |
| מתיחת ראש לצדדים | `—` | `—` | `—` | `—` |  | `kx37r35Yh4EkMNO8y6r8` |
| פשיטת מרפקים בהתנגדות גומיה | `—` | `—` | `—` | `—` |  | `niIBVtXV75LjFsWNJp0k` |
| סקוואט+לחיצת כפתיים בהתנגדות גומיה | `—` | `—` | `—` | `—` |  | `nrPxCJYZtHAyRF6Iywry` |
| סמוך קום מתחילים | `—` | `—` | `—` | `—` |  | `nunGVGOEmOMnxiwh7jcu` |
| חימום סיבובי אגן | `—` | `—` | `—` | `—` |  | `oGqeJNojQ3UNv73n6mBp` |
| (no name) | `—` | `—` | `—` | `—` |  | `qHy5Te1jSPSi5jA3W9d6` |
| סיבוב חיצוני של הכתף | `—` | `—` | `—` | `—` |  | `s0NCgFV5Lqapbe5ceJwy` |
| סקוואט וכפיפת ברך לחזה | `—` | `—` | `—` | `—` |  | `sgjfCmExjbU1CTmSxoMu` |
| עותק של פיסטול סקוואט שלילי שמאל | `—` | `—` | `—` | `—` |  | `sgrEdIolfxaRCgz8Oqyp` |
| הרחקת כתף ימין | `—` | `—` | `—` | `—` |  | `uujJWUGNVRx0G2GEr9S3` |
| הליכות דוב | `—` | `—` | `—` | `—` |  | `v6DZcJA4vW0tjZTA0bUU` |
| פולי עליון על הריצפה עם מגבת | `—` | `—` | `—` | `—` |  | `vUt6DeXfFk9zvRO5IQza` |
| חימום פשיטה וכפיפת עמוד השדרה | `—` | `—` | `—` | `—` |  | `x7nwPNg3YbxnFLvvLLp2` |
| שכיבות סמיכה על טבעות 75 | `—` | `—` | `—` | `—` |  | `xeo8dpAwk2pNe0IuokLk` |

---

## בונוס — `type='rest'` — 0 תרגילים

`ExerciseType` מוגדר כ-`'reps' | 'time' | 'rest'` — ערך שלישי ש-`isTimeBasedExercise`
**לא בודק במפורש בכלל**. תרגיל עם `type:'rest'` נופל לאותן היוריסטיקות כמו `type`
חסר (קטגוריה 4) — אין טיפול ייעודי ל-`'rest'`. לא ברור אם זה תקין (אולי 'rest'
אמור בכלל לא להיכנס לזרימת reps/time הזו) — מסומן לבירור, לא תוקן כאן (מחוץ
לתחום ה-4 הדפוסים המבוקשים).

_(אין)_



---

## Part 3 — רשימה מדורגת לסקירה ידנית (עד 40 שורות)

*חשוד לפי סימנים מבנים בלבד — בלי היכרות עם התרגילים עצמם. כל שורה יכולה לצבור
כמה דגלים (החומרה מסוכמת). דגלים: **C1** = tier מול טווח חזרות בפועל (TIER_TABLE)
— elite/hard עם 6+ חזרות (צפוי 1-3) או easy/flow עם 1-3 (צפוי 10-15). **C2** =
רמה 12+ עם 8+ חזרות. **C3** = רמה 15+ עם החזקה 20+ שניות. **C4** = על 189
התרגילים המגושרים בלבד, אחרי פילוח נכון לזמן-מול-חזרות (התיקון מחלק 1) — פער
פי 2+ מהחציון שדוד נתן לאותו תרגיל.*

**סיכום כמותי לפני הדירוג:** C1 (tier/reps) — 79 elite/hard
עם חזרות גבוהות מדי, 282 easy/flow עם חזרות נמוכות מדי. C2
(רמה/חזרות) — 1 מופעים. C3 (רמה/החזקה) — 0 מופעים. C4 (סטיית קורפוס) —
55 תרגילים (מתוך 189 המגושרים).

| שם | רמה | מה המחולל נותן (חציון) | מה הצפוי (למה סומן) | חומרה |
|---|---|---|---|---|
| מתח צר | 12 | 3 חזרות × 2 סטים | רמה 12 עם 12 חזרות (1 מופעים) \| סטייה מהקורפוס: דוד 5 חזרות (חציון), המחולל 2 (פי 2.5) | 7 |
| דדליפט רומני | 1 | 4 חזרות × 2 סטים | tier=easy עקבי (4/167 מופעים) עם ~3 חזרות — צפוי 10-15 \| סטייה מהקורפוס: דוד 10 חזרות (חציון), המחולל 4 (פי 2.5) | 6 |
| לאנג׳ אחורי | 1 | 4 חזרות × 2 סטים | tier=easy עקבי (4/80 מופעים) עם ~3 חזרות — צפוי 10-15 \| סטייה מהקורפוס: דוד 9 חזרות (חציון), המחולל 4 (פי 2.3) | 6 |
| לאנג׳ קדמי | 1 | 4 חזרות × 2 סטים | tier=easy עקבי (21/119 מופעים) עם ~3 חזרות — צפוי 10-15 \| סטייה מהקורפוס: דוד 9 חזרות (חציון), המחולל 4 (פי 2.3) | 6 |
| היפ טראסט רגל אחת | 2 | 5 חזרות × 2 סטים | tier=easy עקבי (19/116 מופעים) עם ~3 חזרות — צפוי 10-15 \| סטייה מהקורפוס: דוד 10 חזרות (חציון), המחולל 5 (פי 2.0) | 6 |
| דדליפט רגל אחת | 4 | 4 חזרות × 4 סטים | tier=easy עקבי (17/49 מופעים) עם ~2 חזרות — צפוי 10-15 \| סטייה מהקורפוס: דוד 13 חזרות (חציון), המחולל 4 (פי 3.1) | 6 |
| סקוואט קפיצה | 3 | 4 חזרות × 3 סטים | tier=easy עקבי (10/69 מופעים) עם ~3 חזרות — צפוי 10-15 \| סטייה מהקורפוס: דוד 10 חזרות (חציון), המחולל 4 (פי 2.5) | 6 |
| שרימפ סקוואט בעזרת עמוד | 5 | 3 חזרות × 2 סטים | tier=flow עקבי (1/22 מופעים) עם ~3 חזרות — צפוי 10-15 \| סטייה מהקורפוס: דוד 8 חזרות (חציון), המחולל 3 (פי 2.5) | 6 |
| סקוואט בהונות | 6 | 3 חזרות × 2 סטים | tier=easy עקבי (11/23 מופעים) עם ~2 חזרות — צפוי 10-15 \| סטייה מהקורפוס: דוד 10 חזרות (חציון), המחולל 3 (פי 3.3) | 6 |
| היפ טראסט מוגבה רגל אחת | 6 | 4.5 חזרות × 2 סטים | tier=easy עקבי (1/4 מופעים) עם ~2 חזרות — צפוי 10-15 \| סטייה מהקורפוס: דוד 12 חזרות (חציון), המחולל 5 (פי 2.7) | 6 |
| היפ טראסט מוגבה | 6 | 3 חזרות × 2 סטים | tier=easy עקבי (40/70 מופעים) עם ~3 חזרות — צפוי 10-15 \| סטייה מהקורפוס: דוד 14 חזרות (חציון), המחולל 3 (פי 4.7) | 6 |
| לאנג׳ עמוק | 7 | 3 חזרות × 2 סטים | tier=easy עקבי (20/35 מופעים) עם ~3 חזרות — צפוי 10-15 \| סטייה מהקורפוס: דוד 10 חזרות (חציון), המחולל 3 (פי 3.3) | 6 |
| סקוואט בעזרת רצועות | 1 | 2 חזרות × 2 סטים | סטייה מהקורפוס: דוד 10 חזרות (חציון), המחולל 2 (פי 5.0) | 4 |
| חתירות ב-75° | 1 | 5 חזרות × 2 סטים | סטייה מהקורפוס: דוד 10 חזרות (חציון), המחולל 5 (פי 2.0) | 4 |
| מתח אוסטרלי ב-30° מעלות | 3 | 5 חזרות × 2 סטים | סטייה מהקורפוס: דוד 10 חזרות (חציון), המחולל 5 (פי 2.0) | 4 |
| עליות תאומים על מדרגה | 3 | 6 חזרות × 2 סטים | סטייה מהקורפוס: דוד 18 חזרות (חציון), המחולל 6 (פי 2.9) | 4 |
| גוד מורנינג בישיבה | 1 | 3 חזרות × 4 סטים | סטייה מהקורפוס: דוד 11 חזרות (חציון), המחולל 3 (פי 3.7) | 4 |
| חתירות ב-30° | 3 | 5 חזרות × 2 סטים | סטייה מהקורפוס: דוד 10 חזרות (חציון), המחולל 5 (פי 2.0) | 4 |
| עליות תאומים | 1 | 6 חזרות × 2 סטים | סטייה מהקורפוס: דוד 14 חזרות (חציון), המחולל 6 (פי 2.3) | 4 |
| סקוואט | 3 | 2 חזרות × 2 סטים | סטייה מהקורפוס: דוד 10 חזרות (חציון), המחולל 2 (פי 5.0) | 4 |
| שכיבות סמיכה לשכמות | 3 | 6 חזרות × 5 סטים | סטייה מהקורפוס: דוד 13 חזרות (חציון), המחולל 5 (פי 2.5) | 4 |
| ישיבת L בתמיכת הרגליים | 3 | 8 שניות × 2 סטים | סטייה מהקורפוס: דוד 30 שניות (חציון), המחולל 8 (פי 3.8) | 4 |
| שכיבות סמיכה ב-30° | 3 | 4 חזרות × 3 סטים | סטייה מהקורפוס: דוד 10 חזרות (חציון), המחולל 4 (פי 2.5) | 4 |
| פשיטת מרפקים על ספסל | 3 | 4 חזרות × 3 סטים | סטייה מהקורפוס: דוד 13 חזרות (חציון), המחולל 4 (פי 3.1) | 4 |
| פינגווינים | 3 | 4 חזרות × 2 סטים | סטייה מהקורפוס: דוד 30 חזרות (חציון), המחולל 4 (פי 7.5) | 4 |
| דדליפט רומני בהתנגדות גומייה | 3 | 2 חזרות × 4 סטים | סטייה מהקורפוס: דוד 11 חזרות (חציון), המחולל 2 (פי 5.5) | 4 |
| כפיפת ירך על הגבהה | 4 | 5 חזרות × 2 סטים | סטייה מהקורפוס: דוד 11 חזרות (חציון), המחולל 5 (פי 2.2) | 4 |
| סקוואט כנגד קיר | 5 | 2 חזרות × 2 סטים | סטייה מהקורפוס: דוד 20 חזרות (חציון), המחולל 2 (פי 10.0) | 4 |
| לאנג׳ בולגרי | 5 | 4 חזרות × 2 סטים | סטייה מהקורפוס: דוד 10 חזרות (חציון), המחולל 4 (פי 2.5) | 4 |
| שכיבות סמיכה יהלום | 8 | 6 חזרות × 2 סטים | סטייה מהקורפוס: דוד 12 חזרות (חציון), המחולל 6 (פי 2.0) | 4 |
| החזקת מתח ב-90° | 7 | 21 שניות × 2 סטים | סטייה מהקורפוס: דוד 10 שניות (חציון), המחולל 21 (פי 2.0) | 4 |
| לחיצת רגליים כנגד עמוד | 6 | 5 חזרות × 2 סטים | סטייה מהקורפוס: דוד 10 חזרות (חציון), המחולל 5 (פי 2.0) | 4 |
| שכיבות סמיכה מרפקים צמודים | 7 | 6 חזרות × 3 סטים | סטייה מהקורפוס: דוד 12 חזרות (חציון), המחולל 6 (פי 2.0) | 4 |
| החזקת מקבילים ב-90° | 7 | 19 שניות × 2 סטים | סטייה מהקורפוס: דוד 10 שניות (חציון), המחולל 20 (פי 2.0) | 4 |
| עמידת פייק | 7 | 6 שניות × 2 סטים | סטייה מהקורפוס: דוד 23 שניות (חציון), המחולל 6 (פי 3.8) | 4 |
| כפיפת נורדיק בעזרת גומייה | 8 | 2 חזרות × 2 סטים | סטייה מהקורפוס: דוד 5 חזרות (חציון), המחולל 2 (פי 2.5) | 4 |
| החזקת פיסטול סקוואט | 7 | 20.5 שניות × 2 סטים | סטייה מהקורפוס: דוד 7 שניות (חציון), המחולל 21 (פי 3.2) | 4 |
| קפיצה על רגל אחת גובה ברך | 8 | 2 חזרות × 4 סטים | סטייה מהקורפוס: דוד 11 חזרות (חציון), המחולל 2 (פי 5.5) | 4 |
| שכיבות סמיכה רחבות | 10 | 6 חזרות × 2 סטים | סטייה מהקורפוס: דוד 18 חזרות (חציון), המחולל 6 (פי 3.0) | 4 |
| הרמות רגליים בישיבת פייק/L | 8 | 2 חזרות × 2 סטים | סטייה מהקורפוס: דוד 9 חזרות (חציון), המחולל 2 (פי 4.5) | 4 |
