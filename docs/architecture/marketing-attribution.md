# OUT — ארכיטקטורת Marketing Attribution

עדכון אחרון: 05.09.2026 · סטטוס: Stage 1 (חיווט + תשתית) חי בקוד

> **רקע:** עד ה-fix הזה, `captureMarketingAttribution()` היה קוד מלא, מתועד,
> ואפילו עם טסטים — אבל אף עמוד חי לא קרא לו, כך שכל משתמש נכתב כ-`organic`
> תמיד. ראה `docs/research/qr-attribution-loop-investigation.md` לניתוח המלא
> של איך זה התגלה. מסמך זה הוא ה-SoT השוטף — אם הארכיטקטורה משתנה, לעדכן כאן.

---

## 1. עקרון-על

**כל כניסה לאתר עוברת דרך `MarketingAttributionBootstrap`, שנטען פעם אחת בכל
עץ הדפים (root layout), בלי תלות בעמוד ספציפי.** אין צורך לזכור לחווט קריאה
בכל landing page חדש — זו בדיוק הסיבה שהבאג הקודם קרה: התלות הייתה "מישהו
יזכור לקרוא לפונקציה", וזה לא קרה. עכשיו זה מבני, לא מוסכמה.

```
כניסה לכל עמוד (כל דומיין/נתיב)
  → RootLayout מרנדר <MarketingAttributionBootstrap />          [src/app/layout.tsx]
    → useSearchParams() בתוך <Suspense>                          [MarketingAttributionBootstrap.tsx]
      → captureMarketingAttribution(searchParams)                [src/lib/marketingAttribution.ts]
        → durable storage (onboardingPrefs.ts: localStorage + Capacitor Preferences)
```

## 2. מדיניות: first-touch wins, לתמיד

הקליק/UTM/link_id **הראשון** שנקלט במכשיר הוא הקבוע — לא נדרס לעולם על ידי
ביקור אורגני מאוחר יותר, גם אם עבר שבוע/חודש. זו החלטה מוצרית מפורשת: משתמש
שלחץ על קמפיין, סגר את הדפדפן, וחזר להירשם מאוחר יותר — עדיין משויך לקליק
ההוא. אין תפוגה (TTL) על הרשומה הזו.

## 3. שכבת האחסון — למה לא sessionStorage

`src/lib/onboardingPrefs.ts` (לא sessionStorage גולמי!) — משום ש-WKWebView
יכול לפנות (evict) גם `localStorage` וגם `sessionStorage` בין סגירה קשה
לפתיחה מחדש ב-iOS, כשהאפליקציה טוענת מ-origin מרוחק דרך `server.url`
(בדיוק המצב שלנו — ראה `capacitor.config.ts`). קליק שיווקי והרשמה שמשלימה
אותו יכולים להיות מופרדים על ידי סגירת אפליקציה קשה — בדיוק המקרה
ש-`onboardingPrefs.ts` (dual-write: localStorage + `@capacitor/preferences`
= NSUserDefaults) כבר נבנה לפתור. משתמשים באותה תשתית, לא ממציאים חדשה.

## 4. שדות שנלכדים

מ-`captureMarketingAttribution` (URL query params, `TRACKED_KEYS` ב-
`marketingAttribution.ts`): `utm_source`, `utm_medium`, `utm_campaign`,
`utm_content`, `utm_term`, `link_id`, `gclid`, `fbclid`, `ttclid`.
נגזרים אוטומטית: `landingPage` (`window.location.pathname+search`),
`referrer` (`document.referrer`), `firstSeenAt` (client epoch-ms).

**חשוב:** אם `utm_source` חסר אבל `link_id`/`gclid`/`fbclid`/`ttclid` קיים,
`source` מקבל ברירת מחדל (`'link'` / `'google'` / `'facebook'` / `'tiktok'`)
— **לעולם לא נשאר `null`** כשיש איתות אמיתי. זה קריטי: `buildAttributionPayload()`
נופל ל-`'organic'` **רק** כשלא הייתה שום לכידה אי-פעם (אין רשומה בכלל),
לא כשהרשומה קיימת בלי `utm_source`. בלי ההבחנה הזו, קישור QR פיזי טיפוסי
(שממלאים לו רק `friendlyName`+מיקום, בלי utm_source) היה נספר כ-organic
בטעות — בדיוק המקרה שהמדד `getMarketingAttributedCount()` קיים כדי לתפוס.

## 5. `link_id` — איך הוא מגיע

`/api/links/[id]/click/route.ts` תמיד מוסיף `?link_id=<doc-id>` ל-URL
היעד לפני ה-redirect (302), **גם כשאין utm_* על הקישור**. זה מה שמאפשר
לסנן ב-`/admin/analytics` לפי ברקוד ספציפי (`marketingAttribution.linkId`)
בלי תלות במילוי ידני של שדות UTM.

## 6. per-click records — `marketing_links/{id}/clicks/{autoId}`

כל ביקור ב-`/api/links/[id]/click` (כולל קישורים כבויים) כותב, בנוסף
לספירת ה-`clicksCount`, רשומת קליק בודדת: `linkId, timestamp, userAgent
(מקוצר ל-300 תווים), ipHash (SHA-256 מלוח, לא IP גולמי), platform
(`ios`/`android`/`web`, מנוחש מ-User-Agent), expireAt` (30 יום קדימה).

**⚠️ פעולה נדרשת שלא ניתן לבצע מקוד:** `expireAt` הוא רק שדה — הוא
**לא** מוחק כלום עד שתוגדר Firestore TTL policy על `clicks.expireAt`
(collection group) דרך ה-Firebase console או `gcloud firestore fields
ttls update` (CLI). בלי זה, הרשומות האלה יצטברו לצמיתות.

**פרטיות:** IP לעולם לא נשמר גולמי — `hashIp()` ב-route.ts מלוח עם
`LINK_CLICK_IP_SALT` (env var, ב-`.env.local` + `.env.example`; **חייב
להתווסף גם ל-Vercel env vars בפרודקשן** — בלי זה נופל לפולבק לא-מלוח
שעדיין לא חושף IP גולמי, אבל פחות עמיד ל-reverse lookup).

## 7. ערוץ ומיקום — `linkType` + `physicalLocation`

`marketing_links` doc כולל `linkType` (`qr_physical`/`web`/`paid_ads`/
`email`/`partner`/`other`, ברירת מחדל `'web'` למסמכים ישנים) ו-
`physicalLocation` (טקסט חופשי, למשל "גן העירוני, רעננה"). זה מה שמבדיל
רולאפ בשטח מקישור שנשלח במייל — שניהם נראים זהים כ-`clicksCount` גולמי.

## 8. Firestore — indexes + rules

- `firestore.indexes.json`: אינדקס אחד חדש, `users` על
  `(marketingAttribution.linkId ASC, createdAt ASC)` — מכסה את מקרה
  השימוש העיקרי (משפך של QR ספציפי אחד). כל שילוב פילטרים אחר
  (source×gender וכו') ממשיך להסתמך על ה-auto-suggest של Firestore
  בכשל ראשון — כמו שהיה לפני, לא הרעה.
- `firestore.rules`: `marketing_links/{id}/clicks/{clickId}` — אין גישת
  client כלל, אפילו לא `isAdmin()` (רק Admin SDK מהראוט, ו-`isRootAdmin()`
  להצצה ידנית עתידית אם תידרש). תואם את העיקרון הקיים של המסמך האב.

## 9. איך זה מונע רגרסיה

`src/lib/__tests__/marketingAttribution.wiring.test.ts` סורק את כל
`src/**/*.{ts,tsx}` (חוץ מ-`__tests__` והגדרת הפונקציה עצמה) ומוודא
שיש **לפחות call site אמיתי אחד** ל-`captureMarketingAttribution(`.
טסט התנהגותי (`marketingAttribution.test.ts`) לא יכול לתפוס את זה —
הוא קורא לפונקציה ישירות, בדיוק מה שהקוד החי נכשל לעשות. אם מישהו
יסיר את `<MarketingAttributionBootstrap />` מ-`layout.tsx` בעתיד בלי
להחליף אותו במשהו אחר — הטסט הזה נכשל ב-CI, לא רק בפרודקשן בשקט.

## 10. מה עדיין לא סגור (מכוון, Stage 1 בלבד)

- **Deferred deep linking** (סריקת QR → התקנה טרייה מה-store → פתיחה
  ראשונה) עדיין לא נתמך — דורש AppsFlyer SDK או Android Play Install
  Referrer API. ראה `docs/research/qr-attribution-loop-investigation.md`
  §3.4 ו-Step 2 planning בהמשך.
- **נתונים היסטוריים**: 617 משתמשים בפרודקשן נבדקו (05.09.2026) — 496
  ללא שדה `marketingAttribution` כלל (קדמו לפיצ'ר או לא השלימו onboarding),
  121 עם `source: 'organic'` — **כולם עם `onboardingCompletedAt` שבור
  (sentinel literal `{_methodName:'serverTimestamp'}` לא-פתור, לא
  Timestamp אמיתי)**, כלומר כנראה נתוני seed/persona ולא משתמשים אמיתיים
  שנפגעו מהבאג. סקריפט `scripts/_backfill-marketing-attribution-unknown-pre-fix.ts`
  קיים ומוכן (dry-run כברירת מחדל) למקרה שיתגלו בעתיד משתמשים אמיתיים
  שכן נפגעו — עדיין לא הורץ ב-`--commit`.

---

## 11. Stage 2 — תכנון בלבד (לא מומש)

תכנון-על מקדים לשלב הבא, כדי לוודא ששלב 1 לא סוגר דלתות. **שום דבר כאן
לא מומש.**

### 11.1 Android — Play Install Referrer API

**כן, ישים בלי native bridge מאפס.** קיימים כמה Capacitor plugins
מתוחזקים (למשל `@capgo/capacitor-install-referrer`, תואם Capacitor 8;
גם `cap-play-install-referrer`) שקוראים ל-Play Install Referrer API
הילידי ומחזירים את מחרוזת ה-referrer + timestamps + instant-experience
flag ב-JS. הזרימה המתוכננת: ה-redirect שלנו (`/api/links/[id]/click`)
מזהה Android דרך User-Agent ומפנה ל-Play Store עם
`&referrer=link_id%3D{id}%26click_id%3D{uuid}`; Google Play שומר את
זה ומעביר אותו לאפליקציה בפתיחה הראשונה; ה-plugin קורא אותו, ומקוד
Capacitor (`native/init.ts`, אותה שכבה שכבר מטפלת ב-`appUrlOpen`)
שולח אותו ל-endpoint חדש (`/api/user/attribute-referrer` או דומה)
שכותב ל-Firestore. זה **דטרמיניסטי** (לא ניחוש) וחינמי — Google Play
מבטיח את השרשור הזה כחלק מה-API הרשמי שלו.

### 11.2 iOS — אין Referrer מקביל

Apple לא חושפת מנגנון "custom referrer ל-App Store" מקביל ל-Play.
שלוש האפשרויות, עם דיוק/עלות/סיכון:

| אפשרות | דיוק | עלות | סיכון |
|---|---|---|---|
| **התאמה הסתברותית** (ip_hash+UA+חלון זמן קצר, בענן שלנו) | ~80–90% ל-desktop→mobile, **יורד משמעותית** על iCloud Private Relay (IP ממוסך) | נמוכה (קוד שלנו בלבד) | ⚠️ **לא רק דיוק — סיכון מדיניות App Store**: Apple's App Store Review Guideline 5.1.2 אוסרת גזירת מזהה-מכשיר למטרות מעקב פרסומי ממשתמש שלא הסכים ל-ATT. זו לא רק "פחות מדויק" — זו סיבה אפשרית לדחיית אפליקציה/אכיפה, לא תלוי אך ורק בדיוק הטכני. |
| **קוד מיקום שהמשתמש מזין** (למשל "הזן קוד מהרולאפ" במסך הרשמה) | ~100% למי שמזין, אבל % נמוך יזינו בפועל (חיכוך UX) | נמוכה | UX — לא כולם יטרחו להזין |
| **ספק בתשלום** (AppsFlyer/Branch/Adjust — אותו SDK deferred-deep-link מהמסלול המלא במחקר הקודם) | הכי גבוה בין השלוש (עדיין לא user-level תחת SKAN/ATT-opted-out) | תוכנית בתשלום (Standard+ אצל AppsFlyer, ראה מחקר קודם) | תלות בספק חיצוני |

### 11.3 האם צריך את OneLink בכלל למסלול הברקוד?

**תשובה: תלוי בפלטפורמה, לא אחידה.**
- **Android**: כנראה **לא** — ה-redirect שלנו יכול לזהות User-Agent
  ולהפנות ישירות ל-`https://play.google.com/store/apps/details?id=co.il.appout.outrun&referrer=...`
  בלי תלות ב-OneLink בכלל, ועדיין לקבל attribution דטרמיניסטי (§11.1).
  מה מפסידים: smart-banner-style detection של "האם האפליקציה כבר
  מותקנת" (OneLink עושה את זה; redirect ידני שלנו תמיד ישלח ל-store
  גם אם האפליקציה כבר על המכשיר, אלא אם נוסיף בעצמנו לוגיקת ניסיון
  Universal Link קודם — ניתן, ה-AASA/App-Links שלנו כבר תומכים ב-5
  הנתיבים הקיימים).
- **iOS**: OneLink (או MMP מקביל) עדיין הפתרון המעשי היחיד אם רוצים
  יותר מהתאמה הסתברותית/קוד-ידני (§11.2) — אין תחליף חינמי ודטרמיניסטי.

**מסקנת ביניים לשלב 2**: יש מקום למסלול **א-סימטרי בכוונה** — Android
עם redirect עצמאי + Play Install Referrer (חינמי, דטרמיניסטי, בלי
ספק חיצוני), iOS ממשיך להזדקק להחלטה נפרדת (הסתברותי בסיכון מדיניות /
קוד ידני / ספק בתשלום). זה משנה את חשבון העלות של "המסלול המלא"
במחקר הקודם — ייתכן שלא צריך SDK מלא בשני הפלטפורמות, אלא רק ב-iOS.
