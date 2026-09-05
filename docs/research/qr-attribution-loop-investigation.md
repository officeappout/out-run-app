# סגירת מעגל אטריביושן: QR (ברקוד) ← משתמש פעיל — מחקר מצב קיים

> **סוג מסמך:** מחקר/audit בלבד. לא בוצע שום שינוי קוד, migration או deploy.
> **תאריך:** 05.09.2026
> **טווח בדיקה:** `/admin/links`, `/admin/analytics`, `src/lib/marketingAttribution.ts`, האפליקציה הניידת (Capacitor), ותיעוד AppsFlyer/OneLink חיצוני (WebSearch, 2026).

---

## 1. תשובה בשורה אחת

**חלקית — וטוב יותר משנראה על פני השטח, אבל שבור בנקודה קריטית שלא הייתה בהיפותזות המקוריות.**

יש תשתית Firestore + admin panel אמיתית ועובדת: קליק ראשוני (first-party) עם ספירה אטומית, ו-Funnel Dashboard אמיתי מבוסס server-aggregation (לא placeholder). **אבל** פונקציית הלכידה שאמורה לקרוא `utm_source/utm_campaign/utm_medium` מה-URL בכניסה לאתר — קיימת, מתועדת, אך **אף עמוד חי בקוד לא קורא לה**. כלומר: כל משתמש שמשלים onboarding נכתב כ-`source: 'organic'`, תמיד, ללא יוצא מן הכלל — לא בגלל שהמנגנון "חסר", אלא בגלל שהוא dead code שלא זוהה. זה נפרד לחלוטין מהשאלה על AppsFlyer/OneLink, וקודם לה.
בנוסף: אין שום אינטגרציית SDK של AppsFlyer באפליקציה (לא ב-iOS, לא ב-Android, לא ב-`package.json`) — ולכן אין שום מנגנון deferred deep linking עבור משתמש שמתקין טרי מה-App Store/Play Store.

---

## 2. מצב קיים בקוד

### 2.1 `/admin/links` — Marketing UTM Registry

- UI: [`src/app/admin/links/page.tsx`](../../src/app/admin/links/page.tsx) — טבלה מלאה, KPI strip (`totalClicks` = סכום `clicksCount` על כל הקישורים, שורות 97–100), יצירה/עריכה/מחיקה/toggle.
- Service: [`src/features/admin/services/marketing-links.service.ts`](../../src/features/admin/services/marketing-links.service.ts) — collection Firestore top-level `marketing_links` (שורה 38).
- סכמת `MarketingLink` (שורות 61–75): `id, friendlyName, oneLinkUrl, utmSource, utmMedium, utmCampaign, clicksCount, isActive, notes, createdAt, updatedAt, createdBy, updatedBy`. בנוסף נכתב (אך לא בטיפוס המוצג ב-UI): `lastClickAt` (שורה 268), `inactiveClicksCount` ([`route.ts:85`](../../src/app/api/links/%5Bid%5D/click/route.ts#L85)).
- **אין** שדה `barcode_id` / QR-asset / מיקום פיזי / עיר. ה-doc id של Firestore הוא בפועל ה-`link_id` הייחודי לכל ברקוד — אבל שום UI לא חושף אותו כ"מזהה ברקוד".

### 2.2 איך נספרת "לחיצה" — נקבע חד-משמעית

**תשובה: (א) — first-party, אמיתי, לא UI-only.**

[`src/app/api/links/[id]/click/route.ts`](../../src/app/api/links/%5Bid%5D/click/route.ts) הוא endpoint אנונימי (GET+POST) שמבצע:
1. קריאת `marketing_links/{id}` דרך Admin SDK (שורות 66–76).
2. הגדלה אטומית `FieldValue.increment(1)` על `clicksCount` + `lastClickAt` (שורות 93–96) — **בכל ביקור בפועל**, לא רק כשלוחצים כפתור באדמין.
3. 302 redirect לכתובת המחושבת (`buildTrackingUrl`, כולל UTM) (שורה 153).

זה קיים, עובד, ו**כבר מממש את היפותזה מס' 2 מהפרומפט המקורי** (redirect ראשון-צד לפני OneLink). ה-UI חושף את זה כ-"קישור מעקב" עם כפתורי העתק/פתיחה (`getTrackingApiUrl`, [`page.tsx:63–66`](../../src/app/admin/links/page.tsx#L63)).

**הפער האמיתי הוא לא בקוד — הוא תפעולי:** לפי תיאור זרימת העבודה בפועל ("מייצרים ברקוד בפלטפורמת OneLink... ואת ה-URL מזינים לפאנל"), הברקוד הפיזי מקודד כנראה את כתובת ה-`onelink.to` הגולמית **ולא** את `/api/links/{id}/click` שלנו. אם כך — הסריקה בשטח **עוקפת לגמרי** את מונה ה-`clicksCount` שלנו. זו שאלה תפעולית גרידא שלא ניתן לאמת מהקוד → ראה שאלות פתוחות §6.1.

### 2.3 Funnel Dashboard — `/admin/analytics`

זהו הדשבורד שאליו מתייחס הכיתוב ב-`/admin/links` ("כל לחיצה... מוזרמת ל-Funnel Dashboard"), כפי שמצוין מפורשות בתיעוד הקוד עצמו ([`page.tsx:14–19`](../../src/app/admin/links/page.tsx#L14)).

- UI: [`src/app/admin/analytics/page.tsx`](../../src/app/admin/analytics/page.tsx)
- Service: [`src/features/admin/services/funnel-analytics.service.ts`](../../src/features/admin/services/funnel-analytics.service.ts)
- **זה לא placeholder** — משפך 6 שלבים אמיתי, כל שלב = שאילתת `getCountFromServer` נפרדת נגד collection `users`, עם פילטרים אמיתיים (`campaign/source/medium/gender/date`, שורות 148–159):

| שלב | תנאי Firestore | שורה |
|---|---|---|
| נרשמו | `createdAt` בטווח | `funnel-analytics.service.ts:215` |
| אמצע onboarding | `onboardingStep in [10 שלבים]` | `:217–220` |
| סיימו onboarding | `onboardingStatus == COMPLETED` | `:222–225` |
| הפעלה (אימון ראשון) | `progression.workoutCount >= 1` | `:227–230` |
| שימור (3+) | `progression.workoutCount >= 3` | `:232–235` |
| הכנסה | **קבוע `null`** — אין עדיין אינטגרציית תשלום | `:307–314` |

הפילטור לפי source/campaign/medium (`:148–155`) עובד טכנית — אבל ראה §2.4: בפועל, כמעט כל משתמש מסווג כ-`organic`, ולכן הפילטור הזה לא מפיק היום שום תובנה אמיתית ברמת קמפיין.

### 2.4 הממצא המרכזי — לכידת UTM היא dead code

[`src/lib/marketingAttribution.ts`](../../src/lib/marketingAttribution.ts) מגדיר `captureMarketingAttribution(searchParams)` (שורה 110) — אמורה לרוץ ב-mount של עמוד כניסה, לקרוא `utm_source/utm_medium/utm_campaign/gclid/fbclid/ttclid` (`TRACKED_KEYS`, שורות 77–84) ולכתוב ל-`sessionStorage['out_marketing_attribution']`.

**נבדק בגריפ מלא על כל ה-repo (שני חיפושים עצמאיים — קריאה לפונקציה בשם מפורש, וחיפוש גולמי אחר `utm_source`/`gclid` בכל קובץ):**
```
captureMarketingAttribution( -- אין שום call site מחוץ להגדרה עצמה
utm_source / gclid / fbclid / ttclid -- לא נקראים בשום מקום אחר בקוד
```
כלומר: `sessionStorage['out_marketing_attribution']` **אף פעם לא נכתב** בקוד חי. `readMarketingAttribution()` תמיד מחזיר `null`.

התוצאה: [`buildAttributionPayload()`](../../src/lib/marketingAttribution.ts#L197) — שנקראת מ-[`onboarding-sync.service.ts:322`](../../src/features/user/onboarding/services/onboarding-sync.service.ts#L322) בדיוק ברגע ש-`onboardingStatus` הופך ל-`COMPLETED` — **תמיד** נופלת ל-fallback:
```js
{ source: 'organic', medium: null, campaign: null, adId: null, capturedAt: serverTimestamp(), estimatedCAC: null }
```
**לכל משתמש, בלי יוצא מן הכלל**, ללא קשר לאיזה UTM היה ב-URL בפועל.

זה בדיוק סוג הבאג שכלל האימות `"אמת מקור-אמת לפני קריאת state"` ב-CLAUDE.md מתריע מפניו — קוד "נכון" ו"מתועד" שמעולם לא רץ בפועל.

**השלכות במורד הזרם (הכל תלוי בשדה `users/{uid}.marketingAttribution` שתמיד = organic):**
- [`funnel-analytics.service.ts:148–155`](../../src/features/admin/services/funnel-analytics.service.ts#L148) — פילטור לפי campaign/source/medium מחזיר בפועל 0 תוצאות לכל ערך שאינו organic.
- [`admin/analytics/page.tsx:107–135`](../../src/app/admin/analytics/page.tsx#L107) — dropdown "distinct values" של קמפיינים/מקורות יהיה כמעט ריק.
- [`admin/users/all/page.tsx:934–973`](../../src/app/admin/users/all/page.tsx#L934) — badge של "מקור תנועה" לכל משתמש יציג "אורגני" כמעט תמיד.
- [`account-metrics.service.ts:166,176`](../../src/features/admin/services/account-metrics.service.ts#L166) — חישוב CAC ("user qualifies when marketingAttribution.campaign is set") מחזיר בפועל כ-0 משתמשים → **מטריקת CAC לא פונקציונלית כרגע**, למרות שהקוד שלה קיים ומלא.

---

## 3. צד האפליקציה (Capacitor, iOS + Android)

### 3.1 AppsFlyer SDK — לא קיים בשום שכבה

נבדק ונשלל לחלוטין:
- `package.json` — אין תלות `appsflyer` בשום שם חבילה.
- `ios/App/Podfile` — אין AppsFlyer pod.
- `android/app/build.gradle` — אין AppsFlyer dependency.
- `capacitor.config.ts` — בלוק `plugins` לא כולל שום AppsFlyer plugin (רק Firebase Auth/AppCheck/Messaging + Keyboard).

**מסקנה:** אין conversion listener, אין In-App Events (`af_complete_registration`, `af_subscribe`, אימון-ראשון), ואין שום ערוץ שבו ה-backend שלנו מקבל נתון כלשהו מ-AppsFlyer. שאלות 6–9 בפרומפט המקורי — כולן "לא קיים" ולא "חלקי".

### 3.2 מה כן קיים — Universal Links / App Links ל-`outrun.co.il` בלבד

[`src/lib/native/init.ts`](../../src/lib/native/init.ts) מיישם `handleNativeDeepLink()` (שורות 64–146), מחוברת ל-`App.appUrlOpen` + `App.getLaunchUrl()` (שורות 349–362). זו תשתית Capacitor טהורה — **לא AppsFlyer**, ולא deferred (לא שורדת מעבר ל-App Store).

מסלולים נתמכים בפועל (`ios/App/App/App.entitlements`, `public/.well-known/apple-app-site-association`, `android/app/src/main/AndroidManifest.xml`):

| נכס | ערך |
|---|---|
| iOS `applinks:` | `outrun.co.il` בלבד |
| AASA `paths` | `/join/*`, `/session/*`, `/school/*`, `/community`, `/gateway` |
| Android intent-filter | `autoVerify="true"`, host=`outrun.co.il`, אותם 5 path prefixes |
| iOS custom scheme | **לא רשום** — `Info.plist` מכיל רק scheme של Google Sign-In; אין `outrun://` |

**שתי תובנות קריטיות:**
1. `onelink.to` **אינו** ב-associated domains של האפליקציה בשום פלטפורמה. גם משתמש שכבר מותקנת אצלו האפליקציה, שסורק QR שמקודד `onelink.to/xxx` ישירות — לא ייפתח ישירות לתוך האפליקציה שלנו; זה תלוי לגמרי בהאם OneLink מוגדר להפנות בסופו של דבר ל-`outrun.co.il/gateway` וכו' (לא ניתן לאמת בלי גישה לקונפיגורציית OneLink בפועל).
2. אין `outrun://` custom scheme רשום — כך שהקוד ב-`init.ts:70` שמתרגם `outrun://` ל-`https://outrun.app/` הוא כרגע **מת בפועל** (אין דרך שה-OS יפעיל אותו). שימו לב גם לפער: ההערה בקוד (`init.ts:18`) מזכירה דומיין `outrun.app`, בעוד ה-entitlements/AASA בפועל מגדירים `outrun.co.il` — אי-דיוק תיעודי קטן, לא באג פונקציונלי.

### 3.3 ⚠️ ממצא PLACEHOLDER — Android App Links לא מאומת

[`public/.well-known/assetlinks.json`](../../public/.well-known/assetlinks.json) מכיל:
```json
"sha256_cert_fingerprints": ["PLACEHOLDER_PLAY_APP_SIGNING_SHA256", "PLACEHOLDER_UPLOAD_KEY_SHA256"]
```
לפי axioms.md §22 (כלל PLACEHOLDER) — יש להתייחס לכל הנושא כ"לא ידוע": ייתכן שאימות ה-App Links באנדרואיד לא עובר בפועל, כלומר גם קליק על קישור `outrun.co.il` אמיתי (לא OneLink) עלול להיפתח בדפדפן ולא ישירות באפליקציה במכשירי Android. דורש בדיקת מכשיר אמיתי — ראה §6.3.

### 3.4 Deferred Deep Linking — לא קיים, ואין דרך "כמעט" ליישם אותו בלי SDK

ה"generic fallback" ב-`handleNativeDeepLink` (שורות 137–142) כן מעביר query string מלא (כולל UTM אילו היו קיימים) לניווט הפנימי — אך זה רלוונטי רק למקרה שבו האפליקציה **כבר מותקנת** ונפתחת ישירות מ-Universal/App Link תואם. עבור "סרק QR → הותקן טרי מה-store → פתיחה ראשונה" — אין שום מנגנון קיים בקוד שיכול לגשר על זה; זה בדיוק התפקיד שה-SDK של AppsFlyer (device-fingerprint matching בענן) פותר, וגם הוא לא תמיד מדויק ברמת user יחיד.

---

## 4. טבלת פערים

| שלב במעגל | נמדד היום? | איפה יושב הנתון | מה חסר | חומרה |
|---|---|---|---|---|
| סריקת QR בשטח | ⚠️ תלוי תפעולית | אין | לא ידוע אם ה-QR מקודד ל-`/api/links/{id}/click` שלנו או ל-`onelink.to` ישירות | **חוסם** (תלוי תשובה מדוד) |
| קליק (אם עובר דרכנו) | ✅ כן, אמיתי | `marketing_links.clicksCount`, [`click/route.ts:93-96`](../../src/app/api/links/%5Bid%5D/click/route.ts#L93) | — | — |
| הגעה לחנות | ❌ לא | — | אין חיבור ל-OneLink/store analytics כלל | משמעותי |
| התקנה | ❌ לא | — | אין SDK, אין Push API webhook | חוסם |
| פתיחה ראשונה (deferred) | ❌ לא | — | אין SDK; Universal/App Links לא שורדים store round-trip; `onelink.to` לא ב-associated domains | חוסם |
| הרשמה (`marketingAttribution`) | ⚠️ שדה קיים, **שגוי תמיד** | `users/{uid}.marketingAttribution` | `captureMarketingAttribution()` [never called](../../src/lib/marketingAttribution.ts#L110) — כל משתמש = `organic` | **חוסם** |
| אימון ראשון | ✅ נספר, אך בלי מקור אמיתי | `funnel-analytics.service.ts` stage4 | תוצאה נגזרת של הבאג הקודם — אין פילוח אמיתי לפי קמפיין | משמעותי |
| מנוי/תשלום | ❌ לא | `revenue` stage = `null` קבוע | אין אינטגרציית תשלום כלל (עדיין לא רלוונטי — ראה CLAUDE.md) | Nice-to-have כרגע |

**פער ריבוי ברקודים:** ה-schema *כבר* תומך במלואו — כל doc ב-`marketing_links` הוא ברקוד נבדל עם `link_id` ייחודי (ה-Firestore doc id). 5 רולאפים ב-5 שכונות = 5 documents, ללא כל שינוי קוד. הבעיה היחידה היא ששום דבר לא כותב את ה-`link_id` הזה חזרה למשתמש בפועל (אותו באג ליבה מ-§2.4).

**פער iOS (ATT/SKAN):** ללא SDK, השאלה "מה נמדד ברמת משתמש בודד מול אגרגטיבי" לא רלוונטית עדיין — אין מדידה בכלל. במידה וישתלב SDK: SKAN נותן attribution אגרגטיבי, מאוחר (postback מושהה), *ללא* מזהה משתמש — לא ניתן לצרף ל-`user_id` ספציפי לעולם, גם עם SDK. רק משתמשי ATT-opted-in מקבלים attribution דטרמיניסטי שניתן (עקרונית) לצרף ל-user.

---

## 5. אימות/הפרכת ההיפותזות

**H1** — "המונה ב-`/admin/links` לא סופר לחיצות אמיתיות, רק פעולות אדמין."
→ **הופרך (בקוד).** המונה עולה בכל GET/POST ל-`/api/links/[id]/click` דרך Admin SDK — כולל ביקורים אנונימיים אמיתיים משטח. **אבל** אם הברקוד הפיזי מקודד את ה-`onelink.to` הגולמי (כפי שמרמז תיאור התהליך בפועל) — המונה שלנו כן ריק מתוכן, לא בגלל קוד לקוי אלא כי אף אחד לא שולח אליו תעבורה. תלוי אימות תפעולי (§6.1).

**H2** — "redirect משלנו לפני OneLink ייתן ספירת קליקים first-party."
→ **מאומת ומיושם כבר.** `/api/links/[id]/click` הוא בדיוק זה. אין צורך לבנות — צריך לוודא שמשתמשים בו בפועל על הברקוד הפיזי.

**H3** — "הזרקת `af_sub1` ב-OneLink תחזור ב-SDK ותאפשר לקשור `user_id↔link_id`."
→ **מאומת עקרונית, לא ישים כרגע.** לפי תיעוד AppsFlyer, פרמטר `af_sub1` (או עדיף `deep_link_value`/`deep_link_sub` — יש דיווחי side-effects לא עקביים ל-`af_sub1` בהקשר deep-linking ספציפית) חוזר ב-`onConversionDataSuccess`. אך: (א) אין SDK מותקן כלל, ו-(ב) גם אם יותקן — **deferred deep linking הועבר לתוכנית Standard בתשלום החל מ-13.08.2026** (ראה §3, מקורות). כלומר ההיפותזה נכונה טכנית אך דורשת גם קוד וגם תקציב, לא רק קוד.

**H4** — "ה-Funnel Dashboard כבר מכיל את שלבי ה-post-install; חסר רק החיבור למקור."
→ **מאומת חלקית, אך התיאור מטעה.** השלבים אכן קיימים ומחוברים לשדה הנכון. אבל "החיבור למקור" לא "חסר" — הוא **קיים בקוד, כתוב, מתועד, ולעולם לא רץ** (§2.4). זה תיקון של regression/gap שלא זוהה, לא בניית פיצ'ר חדש.

---

## 6. שאלות פתוחות לדוד

1. **הברקוד הפיזי על הרולאפים** — מקודד את `https://onelink.to/nmpcb5` הגולמי, או את `https://outrun.co.il/api/links/{id}/click`? קובע אם H1/H2 כבר פתורות הלכה למעשה או שנדרש שינוי QR.
2. **תוכנית AppsFlyer הנוכחית** של OUT — Zero / Standard / Growth / Enterprise? קובע עלות שוליים למסלול המלא (אם כבר Standard+, ייתכן ש-deferred deep linking כבר כלול).
3. **Android App Links** — האם `assetlinks.json` הוחלף מאז מציאת ה-PLACEHOLDER fingerprints, ואומת בפועל במכשיר? (משפיע גם על מסלול הביניים).
4. **בדיקת מכשיר בפועל**: מה קורה היום כשמשתמש עם האפליקציה כבר מותקנת סורק את ה-QR הקיים (`onelink.to/nmpcb5`)? נפתח בדפדפן, ב-Smart Banner, או ישירות באפליקציה? לא ניתן לענות מהקוד בלבד.
5. **כמה ברקודים פעילים כבר קיימים בשטח היום** מעבר ל"רולאפ כוח"? (ה-schema תומך בכל כמות ללא שינוי — זו שאלה תפעולית בלבד).
6. **דיוק מחיר AppsFlyer Growth ($0.07/conversion, 1M row limit ל-Raw Data API)** — מקור: כתבות צד-שלישי (metacto/appy.to), לא עמוד המחירים הרשמי של AppsFlyer עצמו. יש לאמת ישירות מול נציג AppsFlyer לפני החלטת תקציב.

---

## מקורות חיצוניים (WebSearch, ספטמבר 2026)

- [Raw data reporting/APIs – AppsFlyer Help Center](https://support.appsflyer.com/hc/en-us/sections/6550930711057-Raw-data-reporting-APIs)
- [Push API streaming raw data](https://support.appsflyer.com/hc/en-us/articles/207034356-Push-API-streaming-raw-data)
- [Pull API raw data](https://support.appsflyer.com/hc/en-us/articles/360007530258-Pull-API-raw-data)
- [All your raw data at your fingertips | AppsFlyer](https://www.appsflyer.com/use-cases/raw-data-apis/raw-data-at-your-fingertips/)
- [QR-to-app conversion – AppsFlyer Knowledge Base](https://support.appsflyer.com/hc/en-us/articles/360015119718-QR-to-app-conversion)
- [OneLink guide – AppsFlyer Knowledge Base](https://support.appsflyer.com/hc/en-us/articles/115005248543-OneLink-guide)
- [About link structure and parameters (af_sub1 etc.) – AppsFlyer](https://support.appsflyer.com/hc/en-us/articles/207447163-About-link-structure-and-parameters)
- [About ATT and SKAN – AppsFlyer Help Center](https://support.appsflyer.com/hc/en-us/articles/360011890298-About-ATT-and-SKAN)
- [AppsFlyer Free Plan Changes (Aug 2026): What Moved to Paid & Alternatives](https://appy.to/blog/appsflyer-free-plan-alternative)
- [AppsFlyer launches Zero — official newsroom](https://www.appsflyer.com/company/newsroom/pr/appsflyer-launches-zero/)
- [AppsFlyer Pricing 2026 — metacto (third-party, unverified pricing figures)](https://www.metacto.com/blogs/the-complete-guide-to-appsflyer-costs-setup-integration-maintenance)
