---
name: exercises-without-level-parked
description: 61 NO_LEVEL exercises (no targetPrograms/programIds), split into 3 groups by David's decision — 18 parked strength exercises, 41 irrelevant prep/flexibility content, 2 data-hygiene items
metadata:
  type: project
---

מוחזק בהחלטת דוד — ממתין להחלטת מוצר. לא באג. לא לטיפול.

**מקור:** ספירה חיה מ-Firestore, 14-15.09.2026 (`exercises` collection, 372 תרגילים סה"כ, 61 מתוכם NO_LEVEL — אין `targetPrograms` ואין `programIds`, אותה הגדרה כמו `/admin/unreachable-exercises`'s NO_LEVEL category). הפילוח לשלוש הקבוצות הוא סיווג ידני חד-פעמי, לא נגזר משום שדה בנתונים — ראה `src/app/admin/unreachable-exercises/page.tsx`'s "NO_LEVEL SUB-CLASSIFICATION" comment, ששם הוא גם ה-source-of-truth הקבוע לפאנל (`PARKED_STRENGTH_IDS`/`DATA_HYGIENE_IDS`).

**תיקון-ספירה, לתיעוד:** הדוח המקורי (14.09.2026) העריך "35" לקבוצת "לא רלוונטי" — קירוב שגוי. הספירה המדויקת היא **41**, לא 35 (18 חוזק + 2 היגיינה + 41 לא-רלוונטי = 61, מדויק — מאומת ישירות מול הנתונים החיים).

---

## קבוצה 1 — תרגילי-כוח שהוחזקו, ממתינים להחלטת מוצר (18)

**לא לתייג, לא למחוק, לא להעלות שוב כממצא בשום דוח — עד שדוד מחליט.**

| שם | ID | קטגוריה |
|---|---|---|
| פשיטת מרפקים יד מאחורי הראש בהתנגדות גומיה | `CQtZDiAEvfNB8khudfsG` | גומייה |
| כפיפת כתף בהתנגדות גומיה | `LitmztKbOSD9MvQwBDsE` | גומייה |
| לחיצת כתפיים בהתנגות גומייה | `TZMFGuNweuAnTLIjyhkx` | גומייה |
| כפיפת מרפקים בהתנגדות גומיה | `UmPbE7WydxjOSw5UlDIT` | גומייה |
| לחיצת חזה בשכיבה בהתנגדות גומיה | `Vr2htqrpnuBObpjzzzyj` | גומייה |
| חתירות בעמידה בהתנגדות גומיה | `ZovShNVtJBRPgdwsngxr` | גומייה |
| שכיבות סמיכה בהתנגדות גומיה | `gGlZXMEjhAXTxxmO3hTN` | גומייה |
| פשיטת מרפקים בהתנגדות גומיה | `niIBVtXV75LjFsWNJp0k` | גומייה |
| סקוואט+לחיצת כפתיים בהתנגדות גומיה | `nrPxCJYZtHAyRF6Iywry` | גומייה |
| חצי סמוך קום | `3dIrpJQHp5QbimPVTZDk` | ברפי/סמוך-קום |
| סמוך קום | `4kww5BB13UkNaaAjZKS0` | ברפי/סמוך-קום |
| סמוך קום עם שכיבת סמיכה | `f4ZbXHOaV5lRTC9JQPkk` | ברפי/סמוך-קום |
| סמוך קום מתחילים | `nunGVGOEmOMnxiwh7jcu` | ברפי/סמוך-קום |
| שחיין חזה | `hB253EVZ8ksjQyve6TOu` | לא-מסווג |
| עמידת כלב רגל ויד נגדית | `hECufw1PU0a0lcUEadY9` | לא-מסווג |
| סקוואט וכפיפת ברך לחזה | `sgjfCmExjbU1CTmSxoMu` | לא-מסווג |
| פולי עליון על הריצפה עם מגבת | `vUt6DeXfFk9zvRO5IQza` | לא-מסווג |
| שכיבות סמיכה על טבעות 75 | `xeo8dpAwk2pNe0IuokLk` | לא-מסווג |

---

## קבוצה 2 — לא רלוונטי, תוכן הכנה/גמישות (41)

חימומים, מתיחות, הליכות, מוביליטי-כתף, וסשני-התאוששות (`role='recovery'`, מתויגים בכוונה). לא צריכים רמה מבחינה מושגית — לא נספרים שוב כממצא.

| שם | ID |
|---|---|
| הליכות דוב | `4GVlUbVr5r9gNdUCKagI` |
| הליכות דוב | `v6DZcJA4vW0tjZTA0bUU` |
| הליכות זחל | `AdIAFteC2tmYWTPaaDtl` |
| הליכות זחל | `T1XghOTmtU74SeRRg9vb` |
| הליכת סרטן | `eEqv5jF3JkNduEM9Qgp7` |
| הרחקת כתף ימין | `uujJWUGNVRx0G2GEr9S3` |
| הרחקת כתף שמאל | `DCnxDF0lbfzXLloH8gYp` |
| חימום דינמי ריצה במקום | `GSPTjOAgRueyZZPkryqe` |
| חימום דנימי קפיצות כוכב | `ZYssXGqyPrIgvV1vXJcn` |
| חימום הנפות | `RAbscOoGqbAN8CbGEYhe` |
| חימום כפיפות לפנים | `WkXqEGdoSpq8KeC6EGAn` |
| חימום כפיפות צידיות | `JBfizf0KaVURhTYjXZac` |
| חימום סיבובי אגן | `oGqeJNojQ3UNv73n6mBp` |
| חימום סיבובי ברכיים | `eHCiPK74PTW3b7CdrhaZ` |
| חימום סיבובי ידיים | `UdAmrvtDL0nBYnj8UMe1` |
| חימום סיבובי ירך | `4wCedrBoFjPePiymHoYP` |
| חימום סיבובי מפרקים | `34LJ5pJYnk5GPr77xlG9` |
| חימום סיבובי קרסול | `eHjbkb9XIK2txbwgYWH4` |
| חימום פשיטה וכפיפת עמוד השדרה | `x7nwPNg3YbxnFLvvLLp2` |
| חימום רוטציות לצדדים עמוד השדרה | `8WN9CquCscUXK5SvNiIn` |
| מתיחות יד אחורית | `GEnSPwxEqIK6HTakuXOI` |
| מתיחות שורש כף יד | `J6KQxmkJHwVqVGgnKhVm` |
| מתיחת דוגמנית | `7spjueGo4OFPIrHHu3Jl` |
| מתיחת המסתרינג בשכיבה | `24acSdN3XiV2NZ7UnSkZ` |
| מתיחת חתול פרה | `ZmVz1kaBwhYqPPAqnkax` |
| מתיחת ירך קדמית | `g5M36kx6sXaRr8MMWLJj` |
| מתיחת ישיבה בפייק | `4Sjv6yU3LOD6vmaDfz43` |
| מתיחת כלב מביט מבט | `ZWx6yKLawdjSrImWUQoL` |
| מתיחת כתף | `LvRPIsxlZMgYRNBFxFaM` |
| מתיחת מתפלל | `gWHaGzObmixb1vr66l5I` |
| מתיחת פרפר | `dK6Rcu8r93CeaBNOL0EU` |
| מתיחת קרסול ושוקיים | `MkVq2PbvCCAM77AEEjtN` |
| מתיחת ראש לצדדים | `kx37r35Yh4EkMNO8y6r8` |
| סיבוב חיצוני של הכתף | `s0NCgFV5Lqapbe5ceJwy` |
| סשן התאוששות #1 | `rec_cec2f81e-6e9b-4192-9831-79b193856b1b` |
| סשן התאוששות #2 | `rec_a8a535cb-d141-48a9-8993-f31d65c97fa0` |
| סשן התאוששות #3 | `rec_00695c88-f3cb-4dfd-897d-fbb59c062099` |
| סשן התאוששות #4 | `rec_b86593dc-ed19-4141-b916-097319437968` |
| סשן התאוששות #5 | `rec_feb437c9-b6db-4f1f-9545-09ae43ee5c3a` |
| סשן התאוששות #6 | `rec_8e2b416a-ea9c-4a0a-8256-988309ab64f9` |
| סשן התאוששות #7 | `rec_9545bbeb-1af7-4903-97a4-5b5b12465111` |

---

## קבוצה 3 — היגיינת נתונים (2)

| שם | ID | בעיה |
|---|---|---|
| `? (unresolvable)` | `qHy5Te1jSPSi5jA3W9d6` | אין `name` בשום שפה (he/en/es) — בלתי-ניתן-לזיהוי בשום מסך |
| עותק של פיסטול סקוואט שלילי שמאל | `sgrEdIolfxaRCgz8Oqyp` | **לא כפילות** (אומת 15.09.2026 — אין תרגיל "פיסטול סקוואט שלילי שמאל" בלי "עותק של") — מסמך צד-שמאל לא-גמור: חסר `movementGroup`/`tags`/`exerciseRole`/`targetPrograms` לגמרי |

**⚠️ תיקון-הכרעה (15.09.2026), חשוב לא-לפספס:** משפחת "פיסטול סקוואט" נסקרה במלואה (7 תרגילים) בעקבות השורה למעלה. **5 מתוכם — כולל 4 עם "Copy of" בשם האנגלי — הם סולם-פרוגרסיה תקין ושלם, L6→L10, עם שמות עבריים נכונים ורמות תקינות.** "Copy of" הוא שריד קוסמטי בשם-האנגלי-בלבד, **לא** בעיית-נתונים — לא נוגעים בהם, לא מתויגים כהיגיינה. `sgrEdIolfxaRCgz8Oqyp` בשורה מעלה נשאר היחיד מהמשפחה שהוא באמת מסמך-לא-גמור. **קבוצת היגיינת-הנתונים כולה היא בדיוק 2 מסמכים — לא יותר**: `qHy5Te1jSPSi5jA3W9d6` ו-`sgrEdIolfxaRCgz8Oqyp`, שני שורות הטבלה למעלה בלבד.

---

## שימוש בפאנל

הסיווג הזה מוטמע ב-`/admin/unreachable-exercises` (15.09.2026) — כרטיס "פירוט 'אין רמה'" מתחת לכרטיסי-הסיבה הראשיים, שלושה תת-כפתורים לחיצים. הסיווג בזמן-ריצה, לא כתוב ל-Firestore — אם תרגיל חדש ייכנס למאגר NO_LEVEL, ברירת-המחדל שלו תהיה "לא רלוונטי" עד שמישהו יעדכן את שתי הרשימות (`PARKED_STRENGTH_IDS`/`DATA_HYGIENE_IDS`) בקוד הפאנל עצמו.
