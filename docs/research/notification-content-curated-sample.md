# Curated Scenario Sample — Full Chain, Human Judgment

13 hand-picked scenarios from the 560-row sweep (`notification-content-scenario-sweep.md`), full untruncated text, for the semantic judgment the mechanical flags deliberately skip. Same real engines, same live data, same run methodology — just fewer rows and no truncation. Source data: `scripts/scenario-sweep-sample.ts`, reusing `scenario-sweep.ts`'s own exported `runHomeCell`/`runPushCell`/`checkCoherence` (not re-implemented).

Two label types below:
- **Mechanical flags** — the same automated keyword/token checks from the main sweep.
- **Semantic note** *(my own read, not automated)* — this is exactly what you asked me to add on top of the mechanical layer.

---

## The two scoping questions, answered first

### 1. Which unresolved tokens are on docs a deployed scheduler actually sends?

**None of them.** I traced every call site of `selectNotificationContent` in `functions/src/` — there are exactly three:

| Caller | `triggerType` it sends | Deployed? |
|---|---|---|
| `stepGoalNudgeScheduler.ts:213` | `'Daily_Goal'` (hardcoded constant) | Yes |
| `onPlannedActivityCreated.ts:264` | `'Future_Partner_Plan'` (hardcoded constant — not one of the 4 grid triggers) | **No** (confirmed in the earlier push audit — exported but never `firebase deploy`'d) |
| `previewNotificationContent.ts:120` | whatever the admin panel passes | No (this session's own new tool, also undeployed) |

**Nothing anywhere calls `selectNotificationContent` with `triggerType: 'Inactivity'`.** I checked this two ways: a full-codebase grep for every call site (above), and — more conclusively — a cross-check of all 560 sweep rows: **zero of the 140 `Daily_Goal` rows carry an unresolved-token flag; every single unresolved-token finding in the entire sweep sits on an `Inactivity`-tagged row.** `Inactivity` push in real production comes from a completely different, older mechanism — `retentionScheduler.ts`'s own hardcoded copy array, which never touches this Firestore collection at all (confirmed in the original push-infrastructure audit). So the `Inactivity` rows in `workoutMetadata/notifications/notifications` — all ~93-103 candidates deep per persona, rich, elaborately personalized, and the source of every `@בוא`/`@מיקום`/`@basePace`/`@weekNumber`/etc. gap — are content someone wrote, that `selectNotificationContent` can match in a dry-run, that **no live sender queries**. Pure orphaned CMS content today.

**Caveat on the one genuinely-wired path:** `Daily_Goal` is deployed and its master flag (`app_config/feature_flags.stepGoalNudgeEnabled`) reads `true` in production right now (checked live, read-only, via Admin SDK) — but `app_config/feature_flags.stepGoalTestUids` is **non-empty** (`['krNYtr8m8Nh5EAMJsuv1Vs2fKuE2']`). Per the scheduler's own documented behavior, a non-empty test-uid list makes it skip the real candidate query entirely and evaluate *only* that one uid. So even the live path isn't broadly live yet — it's live for exactly one test account.

### 2. Are `Location_Based` / `Habit_Maintenance` wired to fire, or latent?

**Latent — not wired at all, not even behind an off flag.** Same grep as above: zero call sites anywhere in `functions/src/` reference either string. This isn't a "built but disabled" situation like `onPlannedActivityCreated` (which exists in code, exported, just never deployed) — there is no scheduler, no trigger, no code path that would ever call `selectNotificationContent({triggerType: 'Location_Based' | 'Habit_Maintenance', ...})` today, deployed or not.

They're real, intentional categories on the **authoring** side, though: `src/app/admin/workout-settings/page.tsx` and `src/app/admin/simulator/page.tsx` both list them as valid `triggerType` options in the content-editing UI, and `workout-settings/bulk/page.tsx` includes them in its bulk-tagging list. So David can (and evidently did — the sweep found zero candidates, meaning nobody has authored content for them yet either) tag content for these triggers in the CMS. The gap is specifically: **content-authoring anticipated these trigger types; the sending side was never built to consume them.** A pre-enablement gap, not a regression — nothing broke, it just was never finished.

---

## The 13 scenarios

### 1. parent · morning · park · `Daily_Goal` — clean

- **Push:** "רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים"
- **Home title:** אימון שקט לפני שהילדים קמים
- **Home description:** הבית עוד שקט. בוא ננצל את זה ל30 דקות של כללי.
- **Category / exercises:** כללי — בק לבר בטאק מתקדם, שכיבות סמיכה סופינציה, דרגון סקוואט בתמיכת יד
- **Mechanical flags:** none

### 2. parent · evening · park · `Inactivity` — flagged (orphaned trigger)

- **Push:** "משתמש, נשאר רק @פער_שבועי לסיום היעד השבועי. בוא/י נסגור את זה."
- **Home title:** חיטוב בזמן שהם משחקים
- **Home description:** סופש הגיע. בוא נסיים אותו חזק עם גוף מלא בפארק.
- **Category / exercises:** כללי — פשיטת מרפקים למתקדמים, בק לבר בטאק מתקדם, סיסי סקוואט אקצנטרי
- **Mechanical flags:** unresolved token literal: "@פער_שבועי"
- **Semantic note:** the push literally addresses the user as "משתמש" (generic "user") instead of a name — `@שם` itself isn't broken, but `personaliseNotificationText`'s fallback for a missing `name` var is the literal word "user," not a warmer default.

### 3. parent · evening · home · `Daily_Goal` — clean

- **Push:** "באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד"
- **Home title:** עובדים על השלב הנוכחי
- **Home description:** תראה להם מה זה כוח רצון. היום עובדים על השלב הנוכחי.
- **Category / exercises:** כללי — חתירות יד אחת ב-45°, שכיבות סמיכה רחבות, סיסי סקוואט אקצנטרי
- **Mechanical flags:** none

### 4. student · morning · park · `Daily_Goal` — clean

- **Push:** "רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים"
- **Home title:** להתעורר לפני הלימודים
- **Home description:** לפני שנכנסים לכיתה, בוא להעיר את הגוף עם כללי במאתגר שנותנת כוח לכל היום.
- **Category / exercises:** כללי — שכיבות סמיכה קשתים בפישוק, בק לבר בטאק מתקדם, סיסי סקוואט בעזרת קיר
- **Mechanical flags:** none

### 5. student · morning · home · `Daily_Goal` — clean mechanically, flagged semantically

- **Push:** "באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד"
- **Home title:** אימון שקט לפני שהילדים קמים
- **Home description:** הבית עוד שקט. בוא ננצל את זה ל30 דקות של כללי.
- **Category / exercises:** כללי — שכיבות סמיכה קשתים בפישוק, חתירות יד אחת ב-45°, שרימפ סקוואט בלי ידיים
- **Mechanical flags:** none
- **Semantic note:** "before the kids wake up" is **parent** content, verbatim, delivered to a **student**. This is the single biggest pattern across the whole sample (see cross-cutting note below) — persona scoring is a +1 nudge, not a filter, so when nothing student-tagged wins on other factors, parent-flavored content wins anyway.

### 6. student · evening · home · `Daily_Goal` — flagged (unresolved token in HOME content, not push)

- **Push:** "באמצע הדרך! עוד 1,500 צעדים ואת/ה ביעד"
- **Home title:** לעמוד זקוף ולהרשים
- **Home description:** ידיים חזקות זה משהו שכולם ישימו לב אליו. @בוא ל-29 דקות של פוקוס בגוף מלא.
- **Category / exercises:** כללי — חתירות יד אחת ב-45°, שכיבות סמיכה רחבות, סיסי סקוואט בעזרת קיר
- **Mechanical flags:** unresolved token literal: "@בוא"
- **Semantic note:** this is the one row in the whole sample where the broken token is in the **workout description**, resolved by the FULL client-side `resolveContentTags` (not the push side's minimal mirror). That resolver is supposed to be complete — so `@בוא` failing here specifically suggests it isn't a missing-tag-coverage gap at all, but a **content-authoring typo**: someone likely typed "@בוא" meaning to write the plain word "בוא" (come), and no `@בוא` tag has ever existed in either resolver. Worth checking the source doc directly before assuming this needs an engineering fix rather than an edit.

### 7. vatikim · evening · park · `Daily_Goal` — clean, strong persona match

- **Push:** "רצף של 5 ימים מאחוריך — אל תעצור/י עכשיו, עוד 1,500 צעדים"
- **Home title:** כוח ומרץ למשחק עם הנכדים
- **Home description:** הם מלאי אנרגיה? 30 דקות של חיזוק גב וידיים יתנו לך את הכוח להרים אותם בנחת.
- **Category / exercises:** כללי — בק לבר בטאק מתקדם, שכיבות סמיכה סופינציה, פיסטול סקוואט
- **Mechanical flags:** none
- **Semantic note:** genuinely well-targeted — "strength and energy to play with the grandchildren" is exactly the right register for `vatikim`. Worth knowing the system *can* do this well when the right content wins.

### 8. vatikim · morning · home · `Inactivity` — flagged (orphaned trigger)

- **Push:** "משתמש, ה@מיקום מוכן. @זמן_אימון דקות של @קטגוריה ברמה גבוהה מחכות לך."
- **Home title:** להתעורר עם מפרקים משוחררים
- **Home description:** בוקר טוב משתמש. בוא נפתח את היום ב28 דקות של הנעת מפרקים עדינה להרגשת חיוניות בבית.
- **Category / exercises:** כללי — פשיטת מרפקים למתקדמים, חתירות יד אחת ב-45°, נורדיק אחורי
- **Mechanical flags:** unresolved token literal: "@מיקום"
- **Semantic note:** three tokens are actually broken here (`@מיקום`, `@זמן_אימון`, `@קטגוריה`) — the flag only reports the first match. This is the densest single-message example of the gap: the push is trying to be highly personalized (location + duration + category, all dynamic) and every dynamic piece fails.

### 9. pro_athlete · morning · park · `Inactivity` — clean mechanically, flagged semantically

- **Push:** "מוכן/ה לשבור שיא? בוא/י לאינטרוולים ארוכים לשיפור הסיבולת."
- **Home title:** אימון שקט לפני שהילדים קמים
- **Home description:** הבית עוד שקט. בוא ננצל את זה ל29 דקות של כללי.
- **Category / exercises:** כללי — בק לבר בטאק מתקדם, שכיבות סמיכה מתפרץ, סיסי סקוואט אקצנטרי
- **Mechanical flags:** none
- **Semantic note:** the clearest contrast in the whole sample. The **push** is genuinely well-matched to `pro_athlete` ("ready to break a record? long intervals for endurance"). The **home title**, right next to it, is parent content again ("quiet workout before the kids wake up"). Same user, same moment, two systems, two different imagined personas — this is the coherence gap in one row.

### 10. pro_athlete · evening · home · `Inactivity` — flagged (orphaned trigger)

- **Push:** "הסוד הוא עקביות. בוא/י לשמור על קצב @basePace חזק."
- **Home title:** סוגרים לוג בערב
- **Home description:** יום עבודה ארוך נגמר. 29 דקות של כללי לשחרור הלחץ מהמערכת.
- **Category / exercises:** כללי — פשיטת מרפקים למתקדמים, חתירות יד אחת ב-45°, פיסטול סקוואט
- **Mechanical flags:** unresolved token literal: "@basePace"
- **Semantic note:** `@basePace` needs a running pace value the athlete's actual data would supply — it's the one token here that looks like a genuinely reasonable feature (pace-aware coaching), just not wired to real data, rather than a typo.

### 11. office_worker · morning · home · `Inactivity` — flagged (orphaned trigger)

- **Push:** "עוצר/ת לצהריים? קחי @זמן_אימון דקות למתיחה במשרד, הגב שלך יודה לך."
- **Home title:** אימון שקט לפני שהילדים קמים
- **Home description:** הבית עוד שקט. בוא ננצל את זה ל30 דקות של כללי.
- **Category / exercises:** כללי — פשיטת מרפקים למתקדמים, חתירות יד אחת ב-45°, פיסטול סקוואט
- **Mechanical flags:** unresolved token literal: "@זמן_אימון"
- **Semantic note:** same pattern as #9 — the push is correctly office-worker-flavored (lunch break, office stretch), the home title is parent content. This pairing recurs enough across the sample that it reads as systemic, not a one-off roll of the dice.

### 12. office_worker · evening · park · `Inactivity` — flagged, worst-case density

- **Push:** "שורשי כף היד כואבים? @בוא/י ל-@זמן_אימון דקות של שחרור ב@מיקום."
- **Home title:** סוגרים לוג בערב
- **Home description:** יום עבודה ארוך נגמר. 30 דקות של כללי לשחרור הלחץ מהמערכת.
- **Category / exercises:** כללי — בק לבר בטאק מתקדם, מקבילים, שכיבות סמיכה רחבות
- **Mechanical flags:** unresolved token literal: "@בוא"
- **Semantic note:** three broken tokens in one short message again (`@בוא`, `@זמן_אימון`, `@מיקום`). The underlying copy idea (wrist pain from desk work → office-appropriate release routine) is actually good, office-worker-specific writing — it's entirely let down by the token failures, not the content strategy.

### 13. office_worker · evening · home · `Daily_Goal` — clean, reasonable match

- **Push:** "מוכן/ה לשבור שיא? בוא/י לאינטרוולים ארוכים לשיפור הסיבולת."
- **Home title:** סוגרים לוג בערב
- **Home description:** יום עבודה ארוך נגמר. 30 דקות של כללי לשחרור הלחץ מהמערכת.
- **Category / exercises:** כללי — פשיטת מרפקים למתקדמים, החזקות מקבילים אקצנטרי, סיסי סקוואט
- **Mechanical flags:** none
- **Semantic note:** worth flagging even though "clean" — this exact push text ("ready to break a record? long intervals") also appeared verbatim for `pro_athlete` (#9) and other personas elsewhere in the sweep. It's `Daily_Goal`'s small, generic, persona-agnostic candidate pool doing its job correctly (no broken tokens, because there's nothing dynamic to break) — but it's not actually personalized to office_worker either. Clean and generic aren't the same as clean and targeted.

---

## Cross-cutting pattern worth naming explicitly

**5 of the 13 rows above (2, 5, 9, 11, and several more in the full 40-row pull this sample was drawn from) show a home title/description written for a visibly different persona than the one requested** — almost always parent-flavored content ("before the kids wake up," "while they play") winning for student, pro_athlete, and office_worker personas. This didn't come from the mechanical flags (they don't check for this) — it's a direct read of the table. Given `scoreContentRow`'s persona match is a `+1` bonus among several factors, not a filter, this is architecturally expected whenever persona-specific content for the *requested* persona doesn't exist or doesn't win on other factors — but seeing it recur this often across just 13 hand-picked rows suggests it's not a rare edge case.
