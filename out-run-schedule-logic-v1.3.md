# OUT-RUN — מסמך לוגיקת לוז אימונים חכם
## Smart Schedule Engine — Specification Document v1.3
### שינויים מ-v1.1: מדיניות סוף שבוע + 5/6 ימים + Multi-Session Days + ריבוי אימונים

---

## CHANGELOG v1.3
| # | סוג | תיאור |
|---|---|---|
| POLICY-01 | מדיניות | יום שישי = יום אימון לגיטימי; שבת = מחוץ לברירת מחדל |
| FEAT-01 | תכונה | תמיכה מלאה ב-5 ו-6 ימי אימון בשבוע |
| ARCH-02 | ארכיטקטורה | ScheduleDay.session → sessions: SessionItem[] (Multi-Session) |
| LOGIC-01 | לוגיקה | כפל אימונים ביום = WARN, לא ERR (למעט HANDSTAND שמותר תמיד) |

---

## 1. מבנה התוכניות (Program Taxonomy)

### 1.1 תוכניות אב
| מזהה | שם | תוכן | סיווג |
|---|---|---|---|
| FULL_BODY | כל הגוף | דחיפה + משיכה + רגליים | גנרי |
| UPPER_BODY | פלג גוף עליון | דחיפה + משיכה (ללא רגליים) | גנרי |
| UPPER_CALISTHENICS | קליסטניקס עליון | מורכב מסקילי המשתמש | דינמי |

### 1.2 סקילים
| מזהה | שם | כיוון | עומס עיקרי | סיכון גידים | FREE_SLOT |
|---|---|---|---|---|---|
| PLANCHE | פלאנץ' | דחיפה אופקית | כתפיים קדמיות | גבוה | לא |
| HSPU | HSPU | דחיפה אנכית | כתפיים + טרפזים | גבוה | לא |
| FRONT_LEVER | פרונט לבר | משיכה אופקית | רחב גבי + ליבה | גבוה | לא |
| OAPU | מתח יד אחת | משיכה אנכית | גידי מרפק | קריטי | לא |
| MUSCLE_UP | עליית כוח | דינמי מתפרץ | CNS + עליון | גבוה | לא |
| HANDSTAND | עמידת ידיים | עצבי/שיווי משקל | שורש כף יד | בינוני | **כן** |

### 1.3 [ARCH-01 Phase 2] CARDIO_ACCESSORY — תשתית בלבד
```typescript
// Phase 2 — Out of scope v1.x
// מוגדר עכשיו כדי לא לשבור ארכיטקטורה בעתיד
type CardioAccessory = {
  id: 'RUN' | 'WALK' | 'HIIT_CARDIO',
  conflictType: 'NONE',
  countsTowardSkillCap: false,
  minRestHours: 0,
  canShareDayWith: 'ALL',  // יכול לשתף יום עם כל אימון
  phase: 2
}
```

### 1.4 סיווג אנטומי
```typescript
const PUSH_SKILLS: SkillId[]    = ['PLANCHE', 'HSPU']
const PULL_SKILLS: SkillId[]    = ['FRONT_LEVER', 'OAPU']
const DYNAMIC_SKILLS: SkillId[] = ['MUSCLE_UP']
const NEURAL_SKILLS: SkillId[]  = ['HANDSTAND']   // FREE_SLOT
const CARDIO_SKILLS: SkillId[]  = ['RUN', 'WALK']  // Phase 2
```

---

## 2. חוקי עדיפות (Priority Rules)

### 2.1 הגדרת עדיפות
המשתמש מדרג סקילים בסדר עדיפויות בעת ההרשמה (1 = הכי חשוב).

### 2.2 הקצאת משקל לפי עדיפות
| עדיפות | סשנים מלאים/שבוע | נפח ביום משולב |
|---|---|---|
| #1 | 2 | 70–100% |
| #2 | 2 (אחד מלא + אחד משולב) | 60–70% |
| #3 | 1–2 (בעיקר משולב) | 40–60% |
| #4+ | 1 (משולב בלבד) | 30–40% |

### 2.3 מגבלת סקילים — HANDSTAND מוחרג
```typescript
const MAX_ACTIVE_SKILLS = 4  // HANDSTAND לא נספר

function countActiveSkills(userSkills: SkillId[]): number {
  return userSkills.filter(s => s !== 'HANDSTAND').length
}
```

| סקילים קשים (ללא HS) | ימים מינימום | הערה |
|---|---|---|
| 1 | 2 | אידיאלי |
| 2 | 3 | מומלץ 4 |
| 3 | 4 | מינימום מוחלט |
| 4 | 5 | אזהרה + המלצה לצמצם |
| 5+ | חסום | הסבר + בקשה לצמצם ל-4 |

---

## 3. [POLICY-01] מדיניות ימי השבוע

```typescript
const SCHEDULE_POLICY = {
  // ימים 0–5 = ראשון עד שישי
  WEEKDAYS_AVAILABLE: [0, 1, 2, 3, 4, 5],  // ראשון–שישי

  // שישי = יום אימון לגיטימי מלא
  FRIDAY_STATUS: 'AVAILABLE',  // יום 5

  // שבת = מחוץ לברירת מחדל (מנוחה, דייטים, לייפסטייל)
  SATURDAY_STATUS: 'REST_DEFAULT',  // יום 6
  // המשתמש יכול לשבץ שבת ידנית — המערכת תציג WARN_15
  SATURDAY_MANUAL_OVERRIDE: true,

  // ימי שיבוץ מועדפים לפי נפח
  PREFERRED_DAYS: {
    2: [0, 3],         // ראשון + רביעי
    3: [0, 2, 4],      // ראשון + שלישי + חמישי
    4: [0, 1, 3, 4],   // ראשון + שני + רביעי + חמישי
    5: [0, 1, 2, 3, 4], // ראשון–חמישי
    6: [0, 1, 2, 3, 4, 5] // ראשון–שישי
  }
}
```

---

## 4. [FEAT-01] מטריצת תבניות ברירת מחדל — כולל 5 ו-6 ימים

### סימון:
- `F` = FULL | `C` = COMBINED | `R` = RECOVERY/PROTECTIVE | `—` = מנוחה
- `[S]` = Handstand Free Slot (אופציונלי, נוסף כ-session שני)

### 4.1 תוכנית אב בלבד

#### FULL_BODY
| ימים | א | ב | ג | ד | ה | ו | ש |
|---|---|---|---|---|---|---|---|
| 2 | FB | — | — | FB | — | — | — |
| 3 | FB | — | FB | — | FB | — | — |
| 4 | FB | — | FB | — | FB | — | FB |
| 5 | FB | FB | — | FB | FB | FB | — |
| 6 | FB | FB | FB | — | FB | FB | FB* |
> *6 ימים: שבת אופציונלי עם WARN_15

#### UPPER_BODY
| ימים | א | ב | ג | ד | ה | ו | ש |
|---|---|---|---|---|---|---|---|
| 2 | UB | — | — | UB | — | — | — |
| 3 | UB | — | UB | — | UB | — | — |
| 4 | UB | — | UB | — | UB | — | UB |
| 5 | UB | UB | — | UB | UB | UB | — |
| 6 | UB | UB | UB | — | UB | UB | UB* |

### 4.2 סקיל בודד

| ימים | א | ב | ג | ד | ה | ו | ש |
|---|---|---|---|---|---|---|---|
| 2 | F(100%) | — | — | F(100%) | — | — | — |
| 3 | F(100%) | — | F(100%) | — | F(70%) | — | — |
| 4 | F(100%) | — | F(100%) | — | F(100%) | — | F(70%) |
| 5 | F(100%) | F(70%) | — | F(100%) | F(70%) | F(60%) | — |
| 6 | F(100%) | F(70%) | F(60%) | — | F(100%) | F(70%) | — |

### 4.3 שני סקילים

#### א. PUSH + PULL (פלאנץ' + פרונט — האידיאלי)
| ימים | א | ב | ג | ד | ה | ו | ש |
|---|---|---|---|---|---|---|---|
| 2 | PL(100%) | — | — | FL(100%) | — | — | — |
| 3 | PL(100%) | — | FL(100%) | — | C:PL(60%)+FL(60%) | — | — |
| 4 | PL(100%) | — | FL(100%) | — | PL(100%) | FL(100%) | — |
| 5 | PL(100%) | FL(100%) | — | PL(100%) | FL(100%) | C:PL(60%)+FL(60%) | — |
| 6 | PL(100%) | FL(100%) | — | PL(100%) | FL(100%) | PL(70%) | FL(70%) |

#### ב. PUSH + PUSH (פלאנץ' + HSPU)
| ימים | א | ב | ג | ד | ה | ו | ש |
|---|---|---|---|---|---|---|---|
| 2 | PL(100%) | — | — | HSPU(100%) | — | — | — |
| 3 | PL(100%) | — | HSPU(100%) | — | PUSH_ACC(60%) | — | — |
| 4 | PL(100%) | — | HSPU(100%) | — | PL(100%) | HSPU(100%) | — |
| 5 | PL(100%) | HSPU(100%) | — | PL(100%) | HSPU(100%) | PUSH_ACC(50%) | — |
| 6 | PL(100%) | HSPU(100%) | — | PL(100%) | HSPU(100%) | PL(70%) | — |

#### ג. [FIX-01] PULL + PULL (פרונט + OAPU — תיקון 72 שעות)
| ימים | א | ב | ג | ד | ה | ו | ש |
|---|---|---|---|---|---|---|---|
| 2 | FL(100%) | — | — | OAPU(100%) | — | — | — |
| 3 | FL(100%) | — | OAPU(100%) | — | **REST/LEGS** | R_PULL(50%)* | — |
| 4 | FL(100%) | — | OAPU(100%) | — | FL(100%) | OAPU(100%) | — |
| 5 | FL(100%) | OAPU(100%) | — | FL(100%) | OAPU(100%) | R_PULL(50%) | — |
| 6 | FL(100%) | OAPU(100%) | — | FL(100%) | OAPU(100%) | FL(70%) | — |

> *3 ימים: יום ה' = REST/LEGS (אפס תנועות משיכה). יום ו' = R_PULL (72h+ מ-OAPU) ✅

#### ד. DYNAMIC + PUSH (MU + פלאנץ')
| ימים | א | ב | ג | ד | ה | ו | ש |
|---|---|---|---|---|---|---|---|
| 2 | MU(100%) | — | — | PL(100%) | — | — | — |
| 3 | MU(100%) | — | PL(100%) | — | C:MU(50%)+PL(50%) | — | — |
| 4 | MU(100%) | — | PL(100%) | — | MU(100%) | PL(100%) | — |
| 5 | MU(100%) | PL(100%) | — | MU(100%) | PL(100%) | C:MU(50%)+PL(50%) | — |
| 6 | MU(100%) | PL(100%) | — | MU(100%) | PL(100%) | MU(70%) | — |

#### ה. HANDSTAND + סקיל (Free Slot)
```
Handstand נוסף כ-session שני (morning slot) לכל יום שיש בו סקיל כוח.
בתבניות 5–6 ימים: Handstand כבר מקבל 3+ הזדמנויות אוטומטית.
```

### 4.4 שלושה סקילים (4 ימים מינימום)
| א | ב/ג | ד/ה | ו |
|---|---|---|---|
| S1(100%) | S2(100%) | S1(70%)+S3(50%) | S2(70%)+S3(50%) |

**5 ימים — 3 סקילים:**
| א | ב | ג | ד | ה | ו |
|---|---|---|---|---|---|
| S1(100%) | S2(100%) | — | S1(100%) | S2(100%)+S3(60%) | S3(50%) |

**6 ימים — 3 סקילים:**
| א | ב | ג | ד | ה | ו |
|---|---|---|---|---|---|
| S1(100%) | S2(100%) | S3(100%) | S1(70%) | S2(70%) | S3(60%) |

---

## 5. שילוב תוכנית אב + סקיל

### 5.1 עקרון ההחלפה
- יום סקיל **מחליף** יום תוכנית אב
- 5–6 ימים: מספיק ימים לסקיל + תוכנית אב בנפרד

### 5.2 FULL_BODY + סקיל
| ימים | א | ב | ג | ד | ה | ו |
|---|---|---|---|---|---|---|
| 3 | SKILL(100%) | — | FB | — | SKILL(70%) | — |
| 4 | SKILL(100%) | — | FB | — | SKILL(100%) | FB |
| 5 | SKILL(100%) | FB | — | SKILL(100%) | FB | SKILL(70%) |
| 6 | SKILL(100%) | FB | SKILL(70%) | FB | SKILL(100%) | FB |

### 5.3 UPPER_BODY + סקיל דחיפה
```
יום UB הסמוך לסקיל דחיפה = PULL_DOM (70% משיכה, 30% דחיפה)
```

### 5.4 UPPER_BODY + סקיל משיכה
```
יום UB הסמוך לסקיל משיכה = PUSH_DOM (70% דחיפה, 30% משיכה)
```

### 5.5 UPPER_CALISTHENICS — בנייה דינמית
```typescript
function buildUpperCalisthenicsSession(
  skills: PrioritizedSkill[],
  sessionType: 'FULL' | 'COMBINED' | 'RECOVERY'
): SessionItem[] {
  const baseVolumes = { FULL: 1.0, COMBINED: 0.6, RECOVERY: 0.4 }
  const items: SessionItem[] = []

  // סדר קבוע: NEURAL → STATIC_STRENGTH → DYNAMIC → VERTICAL
  const orderedSkills = sortSkillsBySessionOrder(skills)

  for (const skill of orderedSkills) {
    let volume = baseVolumes[sessionType] * priorityWeight[skill.rank]
    const last = items[items.length - 1]

    if (last?.movementType === 'PUSH' && skill.type === 'PUSH') {
      volume *= 0.7
      addWarning('WARN_01')
    }
    if (last?.movementType === 'PULL' && skill.id === 'OAPU') {
      volume *= 0.5
      addWarning('WARN_09')
    }
    items.push({ skillId: skill.id, volumePercent: volume, sessionType })
  }
  return items
}

// סדר תרגילים בתוך סשן:
// 1. HANDSTAND (NEURAL) — CNS רענן
// 2. PLANCHE / FRONT_LEVER (STATIC_STRENGTH)
// 3. MUSCLE_UP (DYNAMIC)
// 4. HSPU / OAPU (VERTICAL)
// 5. תרגילי הכנה ואביזרים
```

---

## 6. [ARCH-02] Multi-Session Days — ריבוי אימונים ביום

### 6.1 מבנה הנתונים המעודכן
```typescript
// לפני (v1.1):
interface ScheduleDay {
  session: SessionItem | null  // אימון יחיד
}

// אחרי (v1.3) — [ARCH-02]:
interface ScheduleDay {
  sessions: SessionItem[]      // מערך — תומך ב-0, 1, 2+ אימונים
  isRestDay: boolean
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6
  warnings: Warning[]
}
```

### 6.2 [LOGIC-01] מדיניות כפל אימונים — WARN, לא ERR

```typescript
// קומבינציות שמייצרות WARN (לא חסימה):
const MULTI_SESSION_WARNINGS: MultiSessionRule[] = [
  {
    condition: (sessions) => sessions.some(s => PUSH_SKILLS.includes(s.skillId))
                          && sessions.some(s => PUSH_SKILLS.includes(s.skillId)),
    code: 'WARN_MS_01',
    message: 'שני אימוני דחיפה ביום אחד — הכתפיים יצטרכו לפחות 3-4 שעות מנוחה בין הסשנים.'
  },
  {
    condition: (sessions) => sessions.some(s => s.skillId === 'FRONT_LEVER')
                          && sessions.some(s => s.skillId === 'OAPU'),
    code: 'WARN_MS_02',
    message: 'פרונט ו-OAPU ביום אחד — עומס קריטי על הגידים. מינימום 4 שעות הפרדה.'
  },
  {
    condition: (sessions) => sessions.some(s => PULL_SKILLS.includes(s.skillId))
                          && sessions.some(s => s.skillId === 'FULL_BODY'),
    code: 'WARN_MS_03',
    message: 'משיכה + Full Body ביום אחד — הגב יעבוד פעמיים. שים את הסקיל בבוקר, Full Body בערב.'
  },
  {
    condition: (sessions) => sessions.some(s => s.skillId === 'MUSCLE_UP')
                          && sessions.length > 1,
    code: 'WARN_MS_04',
    message: 'Muscle-Up + אימון נוסף ביום אחד — MU שורף CNS. שים אותו ראשון, שאר האימונים אחרי 4+ שעות.'
  }
]

// HANDSTAND תמיד מותר כסשן נוסף — אין warning
// CARDIO (Phase 2) תמיד מותר כסשן נוסף — אין warning
```

### 6.3 כלל: Auto-Fill לא יצור Multi-Session Days
```
בתבניות האוטומטיות — המערכת תמיד תפזר אימונים ל-ScheduleDay נפרדים.
Multi-Session נוצר רק:
  א. כשמשתמש גורר ידנית שני אימונים לאותו יום
  ב. כש-HANDSTAND נוסף כ-Free Slot לאותו יום
  ג. Phase 2: CARDIO_ACCESSORY נוסף לאותו יום
```

### 6.4 סדר Sessions בתוך יום Multi-Session
```typescript
const SESSION_ORDER_IN_DAY = [
  'HANDSTAND',      // בוקר — מיומנות עצבית, לפני עייפות
  'SKILL_POWER',    // כוח מקסימלי (PLANCHE, FRONT_LEVER, MU)
  'SKILL_VERTICAL', // כוח אנכי (HSPU, OAPU)
  'UPPER_BODY',     // אימון כללי
  'FULL_BODY',      // כולל רגליים — תמיד אחרון
  'CARDIO'          // Phase 2 — ערב
]
```

---

## 7. מנוע אזהרות — רשימה מלאה v1.3

### 7.1 שגיאות אדומות (🔴 ERR)
| קוד | תנאי | טקסט |
|---|---|---|
| ERR_01 | PUSH+PUSH **באותו session** (לא ביום) | "פלאנץ' ו-HSPU באותו סשן — חלק לסשנים נפרדים." |
| ERR_02 | FL+OAPU **באותו session** | "פרונט ו-OAPU באותו סשן — חייב לחלק." |
| ERR_03 | countActiveSkills() > 4 | "יותר מ-4 סקילים קשים — בחר עד 4." |

### 7.2 אזהרות כתומות (🟠 WARN)
| קוד | תנאי | טקסט |
|---|---|---|
| WARN_01 | PUSH_SKILL יומיים ברצף (ימים שונים) | "יומיים ברצף של דחיפה — הכתפיים לא מתאוששות." |
| WARN_02 | PULL_SKILL יומיים ברצף | "יומיים ברצף של משיכה — הגידים צריכים 48 שעות." |
| WARN_03 | MU + כל סקיל תוך 48 שעות | "MU שורף CNS — הסקיל הבא לפחות יומיים אחר כך." |
| WARN_04 | סקיל קשה < 2X/שבוע | "פעם בשבוע = תחזוקה בלבד, לא התקדמות." |
| WARN_05 | HANDSTAND < 3X/שבוע | "Handstand צריך 3X/שבוע מינימום לשיפור." |
| WARN_06 | 5+ ימים ברצף ללא מנוחה | "5 ימים ברצף — הוסף יום מנוחה." |
| WARN_07 | OAPU > 3X/שבוע | "OAPU מעל 3X — סיכון דלקת גידים כרונית." |
| WARN_08 | יום משולב נפח > 80% | "יום משולב = 60% נפח מקסימום." |
| WARN_09 | אימון משיכה תוך 48h מ-OAPU | "הגידים עדיין בשחזור מה-OAPU." |
| WARN_10 | 3 סקילים + 3 ימים | "3 סקילים ב-3 ימים — הסקיל השלישי פעם אחת בלבד. מומלץ 4 ימים." |
| WARN_11 | UB_PUSH_DOM אחרי PUSH_SKILL ברצף | "כיוונו UB למשיכה דומיננטית אוטומטית." |
| WARN_12 | רגליים לפני סקיל עליון | "סקיל תמיד ראשון — רגליים בסוף." |
| WARN_13 | OAPU + רגליים באותו יום | "עומס CNS גבוה — שעה מנוחה ביניהם." |
| WARN_14 | 3 ימי עליון מתוך 4 ברצף | "3 ימי עליון ברצף — הוסף מנוחה או רגליים." |
| WARN_15 | שיבוץ ידני ביום שבת | "שבת אינו ביום ברירת המחדל — ודא שזה מתאים ללוח החיים שלך." |
| WARN_MS_01 | 2 אימוני דחיפה ביום אחד | "שני דחיפות ביום — 3-4 שעות הפרדה בין הסשנים." |
| WARN_MS_02 | FL + OAPU ביום אחד | "פרונט + OAPU ביום — עומס קריטי על גידים. 4+ שעות הפרדה." |
| WARN_MS_03 | PULL + FULL_BODY ביום אחד | "משיכה + Full Body — שים סקיל בבוקר, Full Body בערב." |
| WARN_MS_04 | MU + אימון נוסף ביום אחד | "MU ראשון תמיד — 4+ שעות לפני האימון הבא." |

---

## 8. [FIX-03] AI Recovery Engine — Rolling Week Window

### 8.1 פרמטרי קלט
```typescript
type RecoveryInput = {
  plannedSessionsPerWeek: number
  actualSessionsThisWeek: number
  lastSessionType: SkillId | ProgramId
  lastSessionDate: Date
  daysRemainingThisWeek: number
  userSkillsByPriority: SkillId[]
  missedSessions: SessionLog[]
  currentWeekDay: 0 | 1 | 2 | 3 | 4 | 5 | 6
}
```

### 8.2 עץ החלטות
```
IF daysRemainingThisWeek > 0:
  effective = actualSessions + daysRemaining
  IF effective >= planned:
    → המשך לוז רגיל (ספוג את הפספוס)
  ELSE:
    → חשב לוז מחדש לפי effective
    → בחר סשן הבא:
        1. מה היה הסקיל האחרון?
        2. MIN_REST_HOURS עבר? ✅/❌
        3. איזה סקיל בעדיפות גבוהה לא קיבל סשן?

IF daysRemainingThisWeek == 0 AND missedSessions.length > 0:
  // [FIX-03] Rolling Week Window
  PROMPT_USER:
    "פספסת [X] אימון/ים השבוע.
     רוצה להשלים [שם הסשן] ביום ראשון הקרוב?
     זה יזיז את לוז השבוע החדש בהתאם."

  IF confirmed:
    → בדוק MIN_REST_HOURS ביום ראשון
    IF hours_ok: שבץ ביום ראשון + הזז שאר הלוז
    ELSE: הצע יום שני/שלישי

  IF declined:
    → אפס שבוע — לוז חדש מיום ראשון
```

### 8.3 חוקי זמן מינימום
```typescript
const MIN_REST_HOURS: Record<string, number> = {
  OAPU: 48,
  MUSCLE_UP: 48,
  FRONT_LEVER: 36,
  PLANCHE: 36,
  HSPU: 36,
  HANDSTAND: 24,
  FULL_BODY: 24,
  UPPER_BODY: 24,
  RUN: 0,   // Phase 2
  WALK: 0
}
```

---

## 9. הגדרות TypeScript מרכזיות v1.3

```typescript
// ===== IDENTIFIERS =====
type SkillId = 'PLANCHE' | 'HSPU' | 'FRONT_LEVER' | 'OAPU' | 'MUSCLE_UP' | 'HANDSTAND'
type ProgramId = 'FULL_BODY' | 'UPPER_BODY' | 'UPPER_CALISTHENICS'
type SessionType = 'FULL' | 'COMBINED' | 'RECOVERY' | 'PROTECTIVE' | 'REST' | 'ACCESSORY'
type MovementType = 'PUSH' | 'PULL' | 'DYNAMIC' | 'NEURAL' | 'CARDIO'
type WarningLevel = 'ERROR' | 'WARN'
type UBDominance = 'PUSH_DOM' | 'PULL_DOM' | 'BALANCED'

// ===== SKILL =====
interface PrioritizedSkill {
  id: SkillId
  priority: number
  movementType: MovementType
  isFreeSlot: boolean       // true = HANDSTAND
  minRestHours: number
  countsTowardCap: boolean  // false = HANDSTAND
}

// ===== SESSION ITEM =====
interface SessionItem {
  skillId: SkillId | ProgramId
  volumePercent: number     // 0–100
  sessionType: SessionType
  dominance?: UBDominance
  orderInDay?: number       // סדר בתוך Multi-Session Day
}

// ===== [ARCH-02] SCHEDULE DAY — Multi-Session =====
interface ScheduleDay {
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6
  sessions: SessionItem[]  // *** מערך — לא יחיד ***
  isRestDay: boolean
  warnings: Warning[]
}

// ===== WARNING =====
interface Warning {
  code: string
  level: WarningLevel
  message: string
  affectedDays: number[]
}

// ===== RECOVERY =====
interface RecoveryRecommendation {
  suggestedSession: SessionItem
  reason: string
  rollingWindowProposal?: RollingWindowProposal
}

interface RollingWindowProposal {
  missedSession: SessionItem
  proposedDay: number
  shiftedSessions: ScheduleDay[]
  validationErrors: Warning[]
}

// ===== MULTI-SESSION RULE =====
interface MultiSessionRule {
  condition: (sessions: SessionItem[]) => boolean
  code: string
  message: string
}

// ===== SCHEDULE POLICY =====
const SCHEDULE_POLICY = {
  FRIDAY_STATUS: 'AVAILABLE' as const,
  SATURDAY_STATUS: 'REST_DEFAULT' as const,
  SATURDAY_MANUAL_OVERRIDE: true,
  MAX_ACTIVE_SKILLS: 4,
  PREFERRED_DAYS: {
    2: [0, 3],
    3: [0, 2, 4],
    4: [0, 1, 3, 4],
    5: [0, 1, 2, 3, 4],
    6: [0, 1, 2, 3, 4, 5]
  }
}
```

---

## 10. מפת החוקים — סדר ביצוע

### שלב 1: ולידציה ראשונית
1. `countActiveSkills()` — חסום אם > 4
2. בדוק ימי מינימום לפי מספר סקילים
3. הפעל ERR_01, ERR_02, ERR_03

### שלב 2: בניית תבנית ברירת מחדל
1. זיהוי סוג תוכנית
2. בחירת תבנית מהמטריצה לפי [סוג × ימים]
3. PULL+PULL 3 ימים: ודא יום משולב ≥ 72h מ-OAPU
4. שיבוץ ב-`sessions: []` לכל יום
5. HANDSTAND: הוסף כ-`sessions[0]` (morning) לימים עם סקיל כוח

### שלב 3: ולידציה על התבנית
1. סרוק WARN_01–WARN_15 (ימים נפרדים)
2. סרוק WARN_MS_01–WARN_MS_04 (Multi-Session באותו יום)
3. הצג אזהרות real-time

### שלב 4: שינוי ידני
1. גרירה של אימון ליום שכבר יש בו sessions → בדוק Multi-Session warnings
2. כל שינוי → ולידציה מחדש
3. שבת → WARN_15 אוטומטי

### שלב 5: AI Recovery Engine
1. בדוק `daysRemainingThisWeek`
2. אם 0 → Rolling Window prompt
3. אם > 0 → effective_frequency + המלצת סשן הבא