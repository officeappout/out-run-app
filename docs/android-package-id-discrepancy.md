# Android `applicationId` — קונפיג מול Play הפועל בפועל

**תאריך:** 05.09.2026 · **סטטוס:** ממצא מתועד, לא תוקן — צד עסקי אצל David/Oversight.
**נתגלה תוך כדי:** אימות destination URLs עבור Smart Link (`docs/architecture/marketing-attribution.md` §13).

---

## התשובה לשאלה: שדה מת או אי-התאמה אמיתית?

**אי-התאמה אמיתית. `appId`/`applicationId` הוא שדה חי, לא מת**, ומופץ באופן עקבי לכל קובצי הקונפיג הנוכחיים בריפו:

| קובץ | ערך |
|---|---|
| `android/app/build.gradle` (שורות 12, 15) — `namespace` + `applicationId` | `co.il.appout.outrun` |
| `ios/App/App.xcodeproj/project.pbxproj` (Debug + Release) — `PRODUCT_BUNDLE_IDENTIFIER` | `co.il.appout.outrun` |
| `ios/App/App/GoogleService-Info.plist` | `co.il.appout.outrun` |
| `ios/App/App/Info.plist` — background-task identifiers | `co.il.appout.outrun.health.*` |
| `capacitor.config.ts` — `appId` | `co.il.appout.outrun` |
| `public/.well-known/assetlinks.json` — `package_name` (Android App Links) | `co.il.appout.outrun` |
| **הרשומה החיה ב-Google Play** (אומת ב-05.09.2026, ראה §13 במסמך האטריביושן) | **`il.co.oversight.outapp`** |

כל קובץ קונפיג בריפו — Android, iOS, Firebase, App Links — עקבי לגמרי סביב `co.il.appout.outrun`. אין override, אין flavor, אין CI script חלופי שמצאתי. `il.co.oversight.outapp` לא מופיע בשום מקום בקוד — **רק** בדף ה-Play החי.

## למה זה קורה (השערה, לא אומתה)

Android (בדומה ל-iOS) נועל `applicationId`/bundle-id לצמיתות ברגע הפרסום הראשון — אי אפשר "לשנות שם" לאפליקציה קיימת ב-Play, רק לפרסם כאפליקציה חדשה. ההשערה הסבירה ביותר: האפליקציה פורסמה לראשונה תחת ה-namespace הזמני/פנימי של בית התוכנה (Oversight — `il.co.oversight.outapp`), והריפו עבר rebrand מאוחר יותר ל-`co.il.appout.outrun` בלי שהעלאה חדשה ל-Play בוצעה תחת ה-package הישן, או שה-CI/pipeline של Oversight דורס את הערך בזמן build בצורה שלא נמצאת בריפו הזה.

## למה זה חשוב — לא סיכון שקט, אלא חסימה גלויה

הפער הזה **לא** יגרום לבאג production שקט — Google Play Console **דוחה מיידית** כל העלאת AAB/APK שבו ה-`applicationId` לא תואם את הרשומה הקיימת. כלומר: הפער הזה ייחשף אוטומטית ובאופן חד-משמעי בפעם הבאה שינסו להעלות בילד אנדרואיד חדש ל-Play — לא לפני כן, ולא בשקט.

**השלכה נוספת שכבר קיימת בפועל (לא חדשה, רק מקבלת הקשר):** `public/.well-known/assetlinks.json` — שכבר סומן ב-Stage 1 (המחקר המקורי, §3.3) כמכיל SHA256 fingerprints מסוג PLACEHOLDER — מצהיר גם על `package_name: co.il.appout.outrun`. אם הרשומה החיה ב-Play היא באמת `il.co.oversight.outapp`, אז Android App Links verification לא יכול לעבוד **בכל מקרה**, גם לו הוחלפו ה-fingerprints לאמיתיים — כי שם החבילה עצמו לא תואם את האפליקציה שבאמת מותקנת מה-Play. זו לא בעיה חדשה שיצרתי; זו אותה בעיה שכבר תועדה, רק עם הסבר נוסף לחומרה שלה.

## מה נבדק ומה לא

✅ נבדק ואומת: כל קובצי הקונפיג המקומיים ברשימה למעלה (grep ישיר על הקבצים).
✅ נבדק ואומת: הרשומה החיה ב-Play (`il.co.oversight.outapp`) — דרך חיפוש ציבורי, לא Play Console.
❌ לא נבדק (אין לי גישה): Play Console עצמו — מי הבעלים הרשום, מה ה-signing key, מתי הועלה הבילד האחרון, והאם קיים pipeline חיצוני (של Oversight) שדורס `applicationId` בזמן build מחוץ לריפו הזה.

## מה לא נעשה (לפי הנחיה מפורשת)

**לא שונה שום package ID, בשום קובץ.** זה תיעוד בלבד.
