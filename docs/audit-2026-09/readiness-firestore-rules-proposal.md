# הצעת firestore.rules — מד כשירות (מוכנה לאישור, לא הוחלה)

**גרסה 3 (01.10.2026) — תיקון נוסף על גרסה 2, אחרי ספירת-פרודקשן:**
5. **`readiness_thresholds` מאבד גם את `allow write: if isRootAdmin()`.**
   אותו היגיון בדיוק שכבר הופעל על שני האוספים האחרים: `computeSetThresholds`
   רץ בשרת, ה-Admin SDK עוקף rules, וההיתר לא נותן לשרת שום יכולת —
   רק מסלול עתידי לעקיפה שקטה. **אחרי התיקון, לבלוק הזה אין אף `allow`
   — נעול לחלוטין מהלקוח. זה מכוון, לא השמטה.**
6. **ספירת-פרודקשן בוצעה** (סקריפט חד-פעמי, ספירות בלבד, נמחק מיד
   אחרי השימוש) — תנאי-סף שדוד קבע לפני אישור
   `allow read: if isRootAdmin() || isAdmin()` על `readiness_soldiers`/
   `readiness_results`: **2 חשבונות עומדים ב-`isAdmin()` בפרודקשן
   היום, שניהם root.** לפי ההכרעה-המותנית שניתנה מראש ("כולם רוט →
   משאירים את הכלל כפי שהוא") — **הכלל נשאר ללא שינוי.**

**גרסה 2 (01.10.2026) — ארבעה תיקונים לפי הכרעת דוד על הגרסה הראשונה:**
1. **אפס write** על שלושת האוספים, לכל תפקיד — כולל root/admin. ה-Admin
   SDK עוקף rules ממילא; היתר write כאן לא נותן לשרת שום יכולת אמיתית,
   רק פותח פתח עתידי לקוד-לקוח לעקוף בשקט את ה-chokepoint (לקבוע
   `outcome`/`uid`/`mergedInto` ישירות). **(גרסה 3 מתקנת: `readiness_thresholds`
   כבר לא יוצא-מן-הכלל — ראו סעיף 5 למעלה.)**
2. **הוסרו כללי הקריאה של tenant_owner/unit_admin** (ה-`get()` על
   `authorities`/`tenants/.../units`) — כל קריאת-קצין עוברת במסלול שרת;
   כלל בלי צרכן הוא חוב, לא הגנה (axiom §26).
3. **הוסרה הקריאה הפתוחה ל-`readiness_thresholds`** — תצלום-הסף כבר
   יושב על כל תוצאה; אין ללקוח צורך במסמך הגלובלי. קריאה — דרך השרת
   בלבד.
4. **`readiness_results`' כלל-העצמי שונה.** הגרסה הראשונה עשתה `get()`
   מקונן על רשומת החייל לכל מסמך — נתקל ב-20-ה-get()-לשאילתה שפיירסטור
   אוכפת (`list`), כך שחייל עם יותר מ-20 תוצאות היה נכשל, בדיוק כשיש לו
   היסטוריה אמיתית. **תוקן בקוד, לא רק בהצעה:** `uid` מדורמל כעת ישירות
   על כל מסמך `readiness_results` (nullable) — **חריג מכוון להקפאת
   ההיסטוריה (points 9/12): זהו מפתח-קריאה בלבד, לא נתון מבוקר. אינו
   באג אם נראה "משתנה" אחרי שהתוצאה כבר נכתבה** — ראו ההערה המלאה
   ב-`ReadinessResult`'s own doc comment ב-`readiness-write.service.ts`,
   ובהערות הישירות בכל אחת משלוש נקודות-העדכון עצמן
   (`computeLinkSoldier`/`computeUnlinkSoldier`/`computeMergeSoldiers`).
   מסונכרן אטומית על ידי `computeLinkSoldier`/`computeUnlinkSoldier`
   (טרנזקציה אחת מעדכנת גם את רשומת החייל וגם את כל תוצאותיו הקיימות)
   ו-`computeMergeSoldiers` (batch מיישב uid גם על התוצאות שהועברו וגם
   על התוצאות הקיימות-מראש של השורד). הכלל עצמו הופך להשוואת-שדה
   ישירה, בלי `get()` כלל. 5 בדיקות חדשות ב-
   `readiness-write.service.test.ts` מוכיחות את העדכון האטומי-על-כולם
   (לא רק התוצאה הראשונה) בכל אחת משלוש הפעולות.

**סטטוס:** הצעה בכתב בלבד, כפי שנדרש. `firestore.rules` עצמו **לא נגע**
בסבב הזה. אין לפרוס שורה אחת מכאן ללא אישור מפורש ובכתב של דוד, ואז —
אך ורק מ-`main` אחרי מיזוג, לעולם לא מענף.

**היקף:** שלושת האוספים החדשים שנבנו בסבב הזה —
`readiness_soldiers` / `readiness_results` / `readiness_thresholds`.
הכתיבה האמיתית כבר קיימת וסגורה: היא עוברת אך ורק דרך 6 מסלולי השרת
ב-`src/app/api/units/readiness/*` (chokepoint ב-
`readiness-write.service.ts`), שאינם תלויים כלל ב-firestore.rules (Admin
SDK עוקף rules תמיד). ה-**קריאה** מהדפדפן (למסכים שיגיעו בשלב הבא) היא
מה שההצעה הזו מכסה.

---

## מה ניתן להוכיח בחוקים טהורים, ומה לא

כל חוק `list`/`get` ב-Firestore חייב להיות **הוכח מראש**, בלי להריץ את
השאילתה — ראו axiom §25 במאגר הזה (`isOwner()` לא יכול לשער שאילתת
אוסף פתוחה). שלוש רמות ההרשאה ב-`UnitPermissionScope` מתנהגות אחרת
מול המגבלה הזו:

| רמה | הוכחה ב-rules טהורים? | איך |
|---|---|---|
| `root` | כן | `isRootAdmin()` — טוקן בלבד, ללא קריאה |
| `tenantOwner` | כן | `get()` יחיד על `authorities/{tenantId}` — ה-tenantId כבר קבוע משדה המסמך הנקרא (`resource.data.tenantId`), לא חיפוש פתוח |
| `unitAdmin` — ניהול **ישיר** של היחידה | כן | `get()` יחיד על `tenants/{tenantId}/units/{unitId}` |
| `unitAdmin` — "מפקד רואה את כל מה שתחתיו" (יחידות-בת, §13.28) | **לא** | ה-walk ב-`expandUnitIdsDownward` הוא BFS אימפרטיבי מעל `parentUnitId`, בלי עומק קבוע מראש — חוק Firestore אינו תומך בלולאה/רקורסיה, ואין דרך לבדוק "אני מנהל של יחידת-אב כלשהי במעלה השרשרת" ב-`get()` בודד או אפילו קבוע |

**היסטוריה, לא עוד הבסיס להצעה (נשאר כאן לתיעוד ההיגיון בלבד):** גרסה 1
הציעה לממש את מה שכן ניתן-להוכחה (ניהול ישיר של יחידה) ישירות ב-rules,
ולהשאיר רק את ההיקף המלא (יחידות-בת) דרך השרת. **הכרעת דוד (01.10.2026,
סעיף 2 למעלה) הלכה רחוק יותר מ"חלופה 1":** אף לא ניהול-ישיר מקבל כלל
קריאה ישיר ב-rules — **כל** קריאת-קצין, ישיר או מורחב כאחד, עוברת דרך
השרת. הטבלה למעלה נשארת רלוונטית להבנת למה דבר כלשהו היה בכלל ניתן
להוכחה — לא כבסיס להחלטה בפועל, שכבר נפלה.

---

## טקסט מוצע, גרסה 3 (להעתקה ל-`firestore.rules`, רק אחרי אישור)

```
// ============================================================
// READINESS — soldier roster, test results, global thresholds
// (docs/audit-2026-09/readiness-firestore-rules-proposal.md, v3)
// No client write anywhere here, not even for root/admin — the Admin
// SDK bypasses rules regardless, so a write grant gives the server no
// real capability, only a latent path for future client-side code to
// set outcome/uid/mergedInto/thresholds directly and silently bypass
// the compute*() chokepoint's authorization and audit logging. Every
// read an officer needs goes through a server route — a rule with no
// consumer is debt, not protection (axiom §26).
//
// readiness_soldiers/readiness_results' isRootAdmin()||isAdmin() read
// grant was checked against production before approval (01.10.2026):
// exactly 2 accounts satisfy isAdmin() today, both root — see
// 00-MASTER-PLAN.md §13.64 for the count. Re-check before relying on
// this again if meaningful time has passed or new admin accounts were
// granted.
// ============================================================

match /readiness_soldiers/{soldierId} {
  allow read: if isRootAdmin() || isAdmin();

  // A soldier reads their own linked record.
  allow read: if isAuthenticated() && resource.data.uid == request.auth.uid;
}

match /readiness_results/{resultId} {
  allow read: if isRootAdmin() || isAdmin();

  // A soldier reads their own result history. `uid` is denormalized
  // onto every result (set at write time from the soldier record, kept
  // in sync by computeLinkSoldier/computeUnlinkSoldier/
  // computeMergeSoldiers in the same transaction/batch as the
  // soldier-record change) — a direct field comparison, not a nested
  // get() on the soldier record. A get()-per-document approach hits
  // Firestore's 20-get()-per-query cap on any list query once a soldier
  // has more than 20 results — exactly when they have real history.
  // `uid` is a deliberate exception to this collection's immutable-
  // history rule (points 9/12 of the locked spec) — a read-key only,
  // not an audited datum. It is NOT a bug if it changes after the
  // result was recorded.
  allow read: if isAuthenticated() && resource.data.uid == request.auth.uid;
}

match /readiness_thresholds/{docId} {
  // No client read, no client write at all — fully locked from the
  // client, deliberately. computeSetThresholds (root-only, enforced in
  // readiness-write.service.ts) is the only writer, via Admin SDK,
  // which bypasses this file regardless of what's written here. The
  // frozen thresholdSnapshot already carried on every result is what a
  // client needs to interpret one.
}
```

---

## מה הוחלט מראש ולא נפתח מחדש כאן

- `readiness_configs` (האוסף הישן) אינו נוגע להצעה הזו — הוא נשאר
  שבור בדיוק כפי שתועד (`00-MASTER-PLAN.md`), לא מתוקן.
- אין קריאה ישירה-מהלקוח לכתיבה בשום מקום כאן — זו החלטה, לא שגיאה.
