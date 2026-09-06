# OUT — ארכיטקטורת Marketing Attribution

עדכון אחרון: 05.09.2026 · סטטוס: Stage 1 (חיווט + תשתית) חי בקוד · §12 הצעת "Smart Link פנימי" בדיון, טרם מומש

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
- **iOS**: MMP עם SDK אמיתי (AppsFlyer/Branch/Adjust — **לא** `onelink.to`
  שאנחנו משתמשים בו היום, ראה תיקון ב-§12 — שירות redirect-בלבד בלי
  SDK ובלי attribution) עדיין הפתרון המעשי היחיד אם רוצים יותר
  מהתאמה הסתברותית/קוד-ידני (§11.2) — אין תחליף חינמי ודטרמיניסטי.

**מסקנת ביניים לשלב 2**: יש מקום למסלול **א-סימטרי בכוונה** — Android
עם redirect עצמאי + Play Install Referrer (חינמי, דטרמיניסטי, בלי
ספק חיצוני), iOS ממשיך להזדקק להחלטה נפרדת (הסתברותי בסיכון מדיניות /
קוד ידני / ספק בתשלום). זה משנה את חשבון העלות של "המסלול המלא"
במחקר הקודם — ייתכן שלא צריך SDK מלא בשני הפלטפורמות, אלא רק ב-iOS.

---

## 12. Smart Link פנימי — הצעה לדיון (טרם מומש, 05.09.2026)

> **⚠️ תיקון עובדתי (05.09.2026):** `onelink.to` — הכתובת שמאחורי `nmpcb5`
> וכ-20 קישורים נוספים — **אינו** AppsFlyer OneLink. זהו שירות עצמאי
> (חברת OLTO, פועלת מ-2011): smart-link פשוט להפניה לחנות + QR, **בלי
> SDK ובלי attribution בכלל**. AppsFlyer's OneLink יושב תחת `onelink.me`,
> מוצר נפרד לגמרי — אין לנו אליו שום קשר. כל מה שנכתב בטיוטה הראשונה
> של §12 מתוך הנחה שזה AppsFlyer (כולל "redirect allowlist" ו-
> "template vs per-link" מתיעוד AppsFlyer) **תוקן למטה** על בסיס
> onelink.to האמיתי. §11.2/11.3 למעלה (MMP בתשלום ל-iOS) עדיין מדברים
> על AppsFlyer/Branch/Adjust בתור **אופציה עתידית היפותטית** — זה
> נשאר נכון ורלוונטי, ולא קשור לתיקון הזה.

**מטרה:** להחליף את `onelink.to` במסלול הקריטי (`/admin/links` →
redirect → חנות) בבנייה עצמית על גבי `/api/links/[id]/click` הקיים.
**אין קוד עדיין — זה ניתוח לפני החלטה, לפי בקשה מפורשת.**

### 12.1 הערכת מאמץ (שעות פיתוח, לא כולל native/שלב 2)

| # | סעיף | הערכה | הערה |
|---|---|---|---|
| 1 | שדות יעד (`iosUrl`/`androidUrl`/`desktopUrl`/`fallbackUrl` + ברירת-מחדל גלובלית) | 4–6 | אותו pattern בדיוק כמו `linkType`/`physicalLocation` שכבר נבנה — schema+service+UI toggle "דרוס ברירת מחדל" |
| 2 | ניתוב UA + סינון בוטים | 2–3 עם ספריית בוט מתוחזקת (למשל `isbot`) · 4–6 עם רשימה ידנית | **המלצה: ספרייה, לא רשימה ידנית** — ראה §12.2 |
| 3 | פרמטר referrer + `click_id` לאנדרואיד | 2–3 | בעיקר נכונות URL-encoding; המשך ישיר של §11.1 — לא סותר, זו ההשלמה הטבעית שלו |
| 4 | אנליטיקה (מכשיר/שעה/יום/referrer/מדינה) | 1 (לכידת שדות: `referrer`, `x-vercel-ip-country`) + **8–14 ל-UI עצמו** | הסעיף הכי גדול בכל המפרט — charts/aggregation אמיתיים, לא רק שדות |
| 5 | מחולל QR (לוגו+צבע+quiet zone+preview+PNG/SVG) | 10–14 קוד | **בנוסף:** בדיקת הדפסה+סריקה פיזית אמיתית לפני שמאשרים שהעיצוב עם לוגו/level H עומד בתקן — לא רק code review (ראה §12.2 האם 20% בטוח) |
| 6 | תיקון live-preview (בלי slug) / עם slug (`/r/{slug}`) | 1–2 בלי slug · 4–6 עם slug (uniqueness check + route חדש + מיגרציה לקישורים קיימים) | עם slug גם פותר את הבאג בצורה נקייה יותר — ראה §12.5 |
| — | **סה"כ** | **≈28–47 שעות** | לא כולל native (Android referrer-reading, שלב 2 לפי הגדרתך), ולא כולל את זמן הבדיקה הידנית של סעיף ההצלה (§12.5) |

### 12.2 מה מפסידים — נוסף למה שכבר ציינת

- **סיכון קונפיגורציה חוצה-קישורים — עדיין רלוונטי, אבל בלי המקור ב-AppsFlyer**: `GENERAL_INVITE_ONELINK` (`onelink.to/appout`, ב-`src/lib/config/app-urls.ts`) הוא **אותו שירות** (`onelink.to`), קישור נפרד לגמרי מ-20 הקישורים ב-`/admin/links` — משמש להזמנות חברים, לא שיווק. **onelink.to לא מפרסם תיעוד ציבורי** על האם הגדרות היעד הן per-link או template משותף ברמת-חשבון — לא הצלחתי לאמת את זה מהאתר הציבורי שלהם (ראה §12.3). **המשמעות: אל תניח כלום — תבדוק בעצמך בדשבורד** אם עריכת `nmpcb5` (או קישור בדיקה) מציגה שדות עצמאיים, או משהו שנראה משותף לכל הקישורים באותו חשבון. אם יש ספק — אל תיגע, ותבדוק אך ורק על קישור-בדיקה חדש שלא `nmpcb5` ולא `appout`.
- **8,000+ הקליקים ההיסטוריים בסיכון גבוה יותר משחשבתי**: מהמחירון הציבורי של `onelink.to` (ראה §12.3) — **תוכנית Free שומרת נתונים 90 יום בלבד**; תוכניות בתשלום (Professional ומעלה) שומרות שנתיים. אם החשבון שלכם על Free — חלק מה-8,000 קליקים כבר **נמחקו**. בהתחשב שיש כ-20 קישורים פעילים (Free מוגבל ל-3, Professional ל-10) — כנראה שכבר נמצאים על Team (200 קישורים) או Team Plus, ששם ה-retention הוא שנתיים ואין דחיפות. **תאשר את התוכנית הנוכחית** לפני שקובעים דחיפות.
- **בשלות זיהוי בוטים**: onelink.to משתמש/לא-משתמש בזיהוי בוטים — לא ידוע, לא מתועד ציבורית. מה שכן ידוע: שלנו יתחיל מאפס. המלצה מפורשת נשארת: ספרייה מתוחזקת (`isbot`) ולא רשימת UA ידנית — ותייג את 2-4 השבועות הראשונים כ"ספירה עוד לא מאומתת".
- **אין cross-device graph** — לא הפסד אמיתי: onelink.to הוא redirect-בלבד, ממילא לא סיפק את זה.
- **אובדן "עין שנייה" בלתי-תלויה**: onelink.to כן מציג "Redirect Stats" ו-"UTM Campaigns" משלו (למרות שזה לא SDK/attribution) — כרגע זה עדיין צלב-בדיקה עצמאי למונה שלנו. המלצה נשארת: להשאיר כמה קישורים דיגיטליים חדשים גם ב-onelink.to בתקופת המעבר, כדי לאמת את המונה החדש שלנו מול מקור ידוע.

### 12.3 תוצאת "בדיקה" — מה נמצא על `onelink.to` בפועל (לא AppsFlyer)

**לא בוצעה בדיקה חיה בדשבורד** — אין לי גישה לחשבון `onelink.to` שלכם. מה שמצאתי מהאתר הציבורי של onelink.to (WebFetch, לא אימות אמפירי מהדשבורד):

- **מגבלות תוכנית אמיתיות** (מעמוד המחירים הציבורי): Free/Non-Profit — 3 קישורים; Professional — 10; Team — 200; Team Plus — 500; Enterprise — ללא הגבלה. **מכיוון שיש כ-20 קישורים פעילים כבר, אתם כנראה על Team ומעלה** (Professional לא מספיק).
- **Retention**: Free = 90 יום; תוכניות בתשלום = שנתיים. (ראה §12.2 — משפיע ישירות על דחיפות ייצוא ה-CSV ההיסטורי.)
- **Stats API**: זמין רק ב-Team ומעלה ("Analytics + API access" מוזכר כפיצ'ר בתשלום) — אם אתם על Team+, ייתכן שיש דרך למשוך את ה-8,000 קליקים **דרך API**, לא רק CSV ידני מהדשבורד. שווה לבדוק בתיעוד ה-API שלהם (`support@onelink.to`) לפני שמניחים שצריך ייצוא ידני.
- **לא נמצא בשום מקום ציבורי**: תיעוד על template-vs-per-link, על "redirect allowlist", או על אימות/הגבלת ה-URL שניתן להזין בשדה היעד. **זה שונה מ-AppsFlyer** (שם היה תיעוד רשמי מפורש) — כאן פשוט אין מידע ציבורי, לא "יש allowlist" ולא "אין allowlist". חובה לבדוק ישירות בדשבורד, אין דרך לדעת מראש.

**מקורות:** [onelink.to — What is a smart short link?](https://www.onelink.to/what-is-a-smart-short-link) ·
[onelink.to — עמוד מחירים ציבורי] (נבדק 05.09.2026 דרך fetch; אין URL קבוע מתועד — לחפש "Pricing" מהעמוד הראשי)

### 12.4 התנגשות עם §11 — אין, אבל שתי הערות (מתוקנות)

- **אין התנגשות טכנית.** §12 (Smart Link) הוא superset תואם ל-§11.1 (Android Play Install Referrer) — סעיף 3 כאן בפועל בונה בדיוק את חצי-השרת של אותה תוכנית. §11.2/11.3 (פער iOS) נשאר פתוח בדיוק כפי שהיה — Smart Link לא פותר ולא מחמיר אותו, פשוט לא נוגע בו.
- **הערה אסטרטגית אחת, מתוקנת**: אם בעתיד תרצו MMP אמיתי עם SDK ל-iOS (AppsFlyer/Branch/Adjust — §11.2), זה **חשבון נפרד לגמרי** מ-`onelink.to` הקיים — אין קשר בין "לסגור את onelink.to" לבין "האם אפשר עדיין לאמץ AppsFlyer בעתיד". שני הנושאים בלתי-תלויים לגמרי, לא כמו שהטיוטה הקודמת (בטעות) הניחה.

### 12.5 המלצה מעשית לפרוטוקול הבדיקה (לפני שנוגעים בפרודקשן)

בהתחשב שאין תיעוד ציבורי (§12.3), הפרוטוקול הבא הוא **זהיר יותר** מהטיוטה הקודמת — כל שלב נבדק לפני המשך, לא מונח מראש:
1. אשר את התוכנית הנוכחית שלכם ב-`onelink.to` (Free/Professional/Team/Team Plus) — קובע דחיפות ייצוא (§12.2/§12.3).
2. צור קישור `onelink.to` **חדש לגמרי**, ייעודי לבדיקה בלבד (לא `nmpcb5`, לא `appout`, לא שום קישור בשימוש).
3. בדשבורד: בדוק אם עריכת שדה ה-iOS/Android URL של קישור הבדיקה משפיעה **רק עליו**, או שיש רמז לקונפיגורציה משותפת (למשל: שינוי שמשפיע גם על קישורים אחרים בתצוגה, או מסך "הגדרות חשבון" נפרד מ"הגדרות קישור"). **אם לא בטוח — עצור ושאל support@onelink.to לפני שממשיכים.**
4. רק אחרי שברור שזה מבודד לקישור הבודד: שנה את שדה ה-iOS/Android URL לכתובת בדיקה זמנית שלנו (endpoint שרק מחזיר 200+לוג, לא ה-redirect route האמיתי עדיין) ומדוד latency + התנהגות בדסקטופ.
5. רק אחרי שזה עובד נקי על קישור הבדיקה המבודד — לשקול קישור אמיתי אחד (לא `nmpcb5`) כפיילוט.

---

## 13. Smart Link — מומש (05.09.2026), scope מצומצם

David אישר scope מצומצם מתוך §12 (§1/§2/§3/§6 בלבד; §4/§5 נדחו). **מומש וקומיט מקומי, לא נדחף.**

### 13.1 מה נבנה

- **סכמה** (`marketing-links.service.ts`): `useSmartLink: boolean` (ברירת מחדל `false`/נעדר לכל קישור קיים — **opt-in per-link, לא global switch**, בדיוק כדי לא לשבור את 20 הקישורים הקיימים שממשיכים להצביע ל-onelink.to בדיוק כמו היום), `iosUrl`/`androidUrl`/`desktopUrl`/`fallbackUrl` (override; ריק = `DEFAULT_LINK_DESTINATIONS`).
- **⚠️ ממצא חדש תוך כדי אימות**: `capacitor.config.ts`'s `appId` (`co.il.appout.outrun`) **אינו** ה-package המפורסם בפועל ב-Play. אומת בפועל: `il.co.oversight.outapp` ("Oversight" = בית התוכנה שבנה את האפליקציה, `finance-vendors.seed.ts`). השתמשתי בערך המפורסם-בפועל ל-`DEFAULT_LINK_DESTINATIONS`, **לא** בקוד המקומי. זה לא תוקן במקום אחר — רק דגל.
- **לוגיקה טהורה** (`link-routing.ts`, נבדק ב-21 טסטים): `detectDeviceBucket` (iOS/iPadOS/Android/Desktop מ-UA; מגבלה ידועה ולא ניתנת לפתרון server-side: iPadOS מודרני מזדהה כ-Mac דסקטופ כברירת מחדל), `resolveDestinationUrl` (override→default→fallback), `buildAndroidReferrerRaw`+`appendAndroidReferrer` (double-encoding נכון לפורמט המדויק מהמפרט).
- **Handler משותף** (`link-click-handler.ts`) ל-שני ה-routes: `/r/[id]` (חדש, קנוני) ו-`/api/links/[id]/click` (legacy, נשאר לתאימות). בוטים (`isbot`) לא נספרים ולא מקבלים click-record, אבל עדיין מקבלים redirect תקין. כל כתיבת Firestore (מונה + click-record) best-effort — נכשלת בשקט, אף פעם לא חוסמת את ה-redirect (**נבדק בפועל**, לא רק code review — 2 טסטים ייעודיים מדמים כשל כתיבה).
- **רשומת קליק מורחבת**: `device`, `country` (`x-vercel-ip-country`), `referrer` (HTTP Referer — נבדל מ-`androidReferrerSent`, מחרוזת ה-Play referrer שנשלחה), `clickId`, `ipHash`, `userAgent`, `expireAt`.
- **תיקון Live Preview**: הדרואר ב-`/admin/links` מציג עכשיו `outrun.co.il/r/{id}?utm=...` (מצב עריכה) — לא `onelink.to`. במצב יצירה (אין עדיין id) מוצגת הערה במקום URL מטעה.

### 13.2 דוגמה אמיתית — ה-URL המלא לאנדרואיד (DoD: "הראה לי")

קלט: `link_id=rollup_koach_haifa`, `utm_source=רולאפ_כוח`, `utm_campaign=stadium_2026`:

```
https://play.google.com/store/apps/details?id=il.co.oversight.outapp&referrer=link_id%3Drollup_koach_haifa%26click_id%3De3b0c442-98fc-4c1e-b1f5-2a1c0e1a9e10%26utm_source%3D%25D7%25A8%25D7%2595%25D7%259C%25D7%2590%25D7%25A4_%25D7%259B%25D7%2595%25D7%2597%26utm_campaign%3Dstadium_2026
```

`click_id` הוא `crypto.randomUUID()` אקראי לכל קליק. הערכים העבריים כן עוברים תקין (double-encoded UTF-8) — נבדק בפועל, לא רק ASCII.

### 13.3 מה עדיין נדחה (לפי החלטת David)

§4 (אנליטיקה מפורטת) ו-§5 (מחולל QR) — לא מומשו. **אבל** רשומת הקליק כבר שומרת את כל השדות (`device`/`country`/`referrer`) שיידרשו לזה מאוחר יותר, בלי מיגרציה. שימו לב: `react-qr-code` **כבר מותקן** כתלות (package.json) — QR-רנדור SVG בסיסי קיים כבר; חסר עדיין: לוגו-overlay, ייצוא PNG/SVG בהגדרות הדפוס, ו-error-correction-level H — משנה מעט את הערכת המאמץ של §5 כלפי מטה כשיגיע הזמן.

---

## 14. מעבר דומיין מתוכנן — `outrun.co.il` → `appout.co.il` (בעוד ~שבוע, 05.09.2026)

David הודיע על מעבר דומיין מלא-מערכת מתוכנן. ארבע תת-שאלות, בהתאם ל-PR #37.

### 14.1 §1 — דומיין כמשתנה סביבה (מומש ב-PR #37, לפני מיזוג)

נמצאו **שני** מקומות שהרכיבו את הדומיין באופן שהיה נשבר במעבר:
1. `getTrackingApiUrl()` ב-`admin/links/page.tsx` — היה `window.location.origin` (לא hardcoded, אבל גם לא env-var — התלות במקרה שהאדמין תמיד נצפה מאותו דומיין).
2. `DEFAULT_LINK_DESTINATIONS.desktopUrl`/`fallbackUrl` ב-`marketing-links.service.ts` — היה string קבוע `'https://outrun.co.il'`.

**התיקון**: `SHORT_LINK_DOMAIN` — קבוע חדש ב-`marketing-links.service.ts`, קורא `process.env.NEXT_PUBLIC_SHORT_LINK_DOMAIN` עם נפילה ל-`'https://outrun.co.il'` (כדי שכלום לא נשבר אם המשתנה עוד לא מוגדר). שני המקומות למעלה עודכנו להשתמש בו. `NEXT_PUBLIC_*` (לא סתם `SHORT_LINK_DOMAIN`) — כי הערך נחוץ גם בצד לקוח (הפאנל) וגם בצד שרת (ה-handler), ורק קידומת `NEXT_PUBLIC_` נכנסת לשני העולמות ב-Next.js.

**⚠️ פעולה נדרשת ממך, לא ניתן לבצע מקוד**: הוסף `NEXT_PUBLIC_SHORT_LINK_DOMAIN=https://outrun.co.il` ל-Vercel env vars **עכשיו** (לפני המעבר) — אחרת "לשנות ערך אחד ביום המעבר" לא נכון, כי המשתנה בכלל לא קיים שם עדיין והנפילה ל-hardcoded תמשיך לפעול.

### 14.2 §2 — 301 מהדומיין הישן לחדש (תוכנן, לא מומש — לפי הנחייתך)

**עיצוב מדויק, לביצוע ב-~5 שורות כשמגיע הזמן**, בתחילת `handleLinkClick` (`link-click-handler.ts`), לפני כל קריאת Firestore:

```ts
const requestHost = new URL(request.url).host;
const canonicalHost = new URL(SHORT_LINK_DOMAIN).host;
if (requestHost !== canonicalHost) {
  const canonicalUrl = new URL(request.url);
  canonicalUrl.protocol = new URL(SHORT_LINK_DOMAIN).protocol;
  canonicalUrl.host = canonicalHost;
  return NextResponse.redirect(canonicalUrl.toString(), { status: 301, headers: NO_STORE_HEADERS });
}
```

**למה זה בטוח לספירה ("לא נופל בין הכיסאות")**: ה-301 קורה **לפני** כל ספירה/כתיבה — הבקשה בדומיין הישן אף פעם לא נספרת. הדפדפן/סורק עוקב אחרי ה-301 ומגיע לאותו `path`+`query` (כולל `id`) בדיוק בדומיין החדש — **שם** קורית הספירה הרגילה, בדיוק פעם אחת. אין מצב של ספירה כפולה (הדומיין הישן לא סופר בכלל) ואין מצב של אובדן (ה-301 קורה תמיד, לא מותנה).

**לא מומש עכשיו** כי אין עדיין `appout.co.il` חי לבדוק מולו — ברגע שהדומיין קיים ו-`NEXT_PUBLIC_SHORT_LINK_DOMAIN` מוחלף, זו הוספה של הבלוק למעלה + טסט אחד שמוודא שהוא יורה. **הדומיין הישן לעולם לא יורד** — `outrun.co.il` חייב להישאר מחובר לאותו Vercel project (או ל-project שממשיך להריץ את אותו קוד) לצמיתות, אחרת ה-301 עצמו לא יכול לרוץ.

### 14.3 §3 — Deep Links, checklist (לא מומש, לתיאום עם המעבר)

**שום קוד לא נכתב לסעיף הזה.** סדר פעולות מומלץ:

1. **קודם DNS/Vercel**: לחבר את `appout.co.il` לאותו Vercel project (או deployment מקביל שמריץ את אותו קוד) — בלי זה שום דבר אחר לא ניתן לאימות.
2. **לוודא ששני קבצי ה-well-known מוגשים משני הדומיינים**: `public/.well-known/apple-app-site-association` ו-`assetlinks.json` — אם `appout.co.il` מצביע לאותה deployment, זה קורה אוטומטית (Next.js מגיש `public/` ללא תלות בדומיין הנכנס). אם זה project נפרד ב-Vercel — צריך פריסה נפרדת.
3. **⚠️ תלוי-החלטה נפרדת**: `assetlinks.json` היום מכריז `package_name: co.il.appout.outrun` — לפי `docs/android-package-id-discrepancy.md`, זה כנראה **לא** תואם את האפליקציה שבאמת חיה ב-Play (`il.co.oversight.outapp`). זו לא תוצאה של מעבר הדומיין — זו בעיה קיימת שתחסום את App Links בכל מקרה, בכל דומיין. שווה לפתור אותה (או להחליט במודע לא לפתור) **לפני** שמשקיעים בצעדים 4-5 למטה, אחרת הם לא יעזרו.
4. **iOS**: להוסיף `applinks:appout.co.il` לצד `applinks:outrun.co.il` הקיים ב-`App.entitlements` (**לא להסיר** את הישן) → בילד חדש → TestFlight/App Store. **זמן ביקורת Apple לא מיידי** — אם המעבר באמת בעוד שבוע, להתחיל את זה **השבוע**, לא לחכות.
5. **Android**: להוסיף `<data android:host="appout.co.il" .../>` לכל אחד מ-5 ה-`<data>` הקיימים ב-`AndroidManifest.xml` (לצד `outrun.co.il`, לא במקומו) → בילד חדש → Play Console. זמן ביקורת קצר יותר מ-iOS בד"כ, אבל גם לא מיידי.
6. **רק אחרי** שהבילד החדש (עם שני הדומיינים ב-entitlements/manifest) כבר בשטח אצל רוב המשתמשים (אימוץ, לא רק "פורסם") — המעבר בפועל של קישורים חדשים לדומיין החדש בטוח מבחינת deep-linking.

### 14.4 §4 — אובדן אחסון אטריביושן במעבר דומיין

**האבחנה נכונה**: `localStorage`/`@capacitor/preferences` דרך `onboardingPrefs.ts` הם per-origin (למעשה per-app-bundle ב-Preferences, אבל per-origin ב-localStorage על ה-web/WebView). משתמש שנמצא באמצע onboarding על הדומיין הישן ברגע המעבר — הרשומה שלו לא "נעלמת מהעולם", היא פשוט לא נגישה מה-origin החדש.

**המלצה: לקבל את זה, לא לגשר** — הסיבה: האוכלוסייה הנפגעת חסומה בזמן (רק מי שבאמצע onboarding *בדיוק* ברגע החלפת המשתנה ב-Vercel, לא כל בסיס המשתמשים), והנזק הוא רק תיוג שיווקי (`organic` במקום המקור האמיתי) — לא אובדן משתמש או נתון קריטי. עלות גישור מול תועלת לא מצדיקה את זה לאוכלוסייה כל כך מצומצמת וחולפת.

**אם בכל זאת רוצים לגשר** (זול אבל לא בחינם): עמוד גשר חד-פעמי בדומיין הישן (`outrun.co.il/migrate-storage` או דומה) שקורא את ה-localStorage המקומי, מקודד אותו כפרמטר ב-URL, ומפנה לדומיין החדש; bootstrap בדומיין החדש קורא את הפרמטר וכותב אותו מחדש דרך `onboardingPrefs.ts` לפני שממשיך ניווט רגיל. הערכה: כמה שעות (עמוד אחד + קריאה ב-bootstrap) — **לא מומש, רק אם תחליט שזה שווה את זה**.
