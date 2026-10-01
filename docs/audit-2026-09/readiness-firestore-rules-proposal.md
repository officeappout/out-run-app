# הצעת firestore.rules — מד כשירות (מוכנה לאישור, לא הוחלה)

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

המסקנה המעשית: ה-**היקף המלא** (מפקד גדוד רואה גם פלוגה) ממשיך לעבוד
רק דרך השרת — בדיוק כפי שכבר עובד היום לכתיבה, ולכל מסלולי ה-GET
הקיימים (`member-workouts` ועוד). ה-rules המוצעים למטה מכסים רק את
החלק ה**ניתן-להוכחה**: ניהול ישיר של יחידה, לא כל מה שתחתיה.

**שתי חלופות, דוד בוחר:**
1. **מומלץ.** קריאה ישירה מהדפדפן מוגבלת ליחידה שמנוהלת *ישירות*;
   תצוגת "כל הפיקוד שלי" (כולל יחידות-בת) נשארת מסך שמוזן ממסלול שרת
   (בדיוק הדפוס הקיים ב-`/admin/authority/units/[unitId]`). אין תחזוקה
   נוספת, אין מקור-אמת כפול.
2. לא מומלץ: denormalize של רשימת כל ה-unitIds שמפקד רואה (כולל
   יורדים) אל מסמך המשתמש שלו עצמו, כדי שתהיה ניתנת-להוכחה ב-rules.
   זה בדיוק אותה משפחת סיכון כמו ה-custom-claim המת של `hasTenant()`
   (axiom §29) — מקור אמת שני שחייבים לסנכרן בכל שינוי בעץ היחידות,
   וישכח.

ברירת המחדל בהצעה למטה היא **חלופה 1**.

---

## טקסט מוצע (להעתקה ל-`firestore.rules`, רק אחרי אישור)

```
// ============================================================
// READINESS — soldier roster, test results, global thresholds
// (docs/audit-2026-09/readiness-firestore-rules-proposal.md)
// No direct client WRITE on any of the three — every mutation goes
// through the compute*() server routes in readiness-write.service.ts,
// which is where authorization, the server-only pass/fail computation
// (point 2 of the locked spec), and audit logging all live. A bare
// client write rule here would let a caller set outcome/uid/mergedInto
// directly, defeating that chokepoint even if no UI ever offers it.
// ============================================================

match /readiness_soldiers/{soldierId} {
  allow read, write: if isRootAdmin() || isAdmin();

  // Tenant owner — single get() on the authority doc named by THIS
  // record's own tenantId field. Provable without an unbounded search
  // (unlike hasTenant()'s dead custom-claim branch, axiom §29) because
  // tenantId here is a fixed, resource-derived path, not a client claim.
  allow read: if isAuthenticated() &&
    resource.data.tenantId is string &&
    get(/databases/$(database)/documents/authorities/$(resource.data.tenantId)).data.managerIds.hasAny([request.auth.uid]);

  // Unit admin — DIRECT management only (see table above). Does not
  // include descendant units.
  allow read: if isAuthenticated() &&
    resource.data.tenantId is string && resource.data.unitId is string &&
    get(/databases/$(database)/documents/tenants/$(resource.data.tenantId)/units/$(resource.data.unitId)).data.managerIds.hasAny([request.auth.uid]);

  // A soldier reads their own linked record.
  allow read: if isAuthenticated() && resource.data.uid == request.auth.uid;
}

match /readiness_results/{resultId} {
  allow read, write: if isRootAdmin() || isAdmin();

  allow read: if isAuthenticated() &&
    resource.data.tenantId is string &&
    get(/databases/$(database)/documents/authorities/$(resource.data.tenantId)).data.managerIds.hasAny([request.auth.uid]);

  allow read: if isAuthenticated() &&
    resource.data.tenantId is string && resource.data.unitId is string &&
    get(/databases/$(database)/documents/tenants/$(resource.data.tenantId)/units/$(resource.data.unitId)).data.managerIds.hasAny([request.auth.uid]);

  // A soldier reads their own result history — one extra get() on their
  // own linked soldier record, bounded by this result's own soldierId
  // field (not an unbounded search).
  allow read: if isAuthenticated() &&
    resource.data.soldierId is string &&
    get(/databases/$(database)/documents/readiness_soldiers/$(resource.data.soldierId)).data.uid == request.auth.uid;
}

match /readiness_thresholds/{docId} {
  // Global by design (point 1) — not tenant-scoped. Any authenticated
  // user may read it (needed to interpret a result's frozen
  // thresholdSnapshot even without re-deriving pass/fail themselves).
  // A narrower read bar is possible but not obviously needed —
  // flagged for David, not assumed.
  allow read: if isAuthenticated();
  allow write: if isRootAdmin(); // matches computeSetThresholds's root-only rule
}
```

---

## מה הוחלט מראש ולא נפתח מחדש כאן

- `readiness_configs` (האוסף הישן) אינו נוגע להצעה הזו — הוא נשאר
  שבור בדיוק כפי שתועד (`00-MASTER-PLAN.md`), לא מתוקן.
- אין קריאה ישירה-מהלקוח לכתיבה בשום מקום כאן — זו החלטה, לא שגיאה.
