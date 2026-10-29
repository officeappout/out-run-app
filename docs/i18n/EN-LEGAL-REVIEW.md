# English legal translation: lawyer review sheet

> **DRAFT legal translation, must be reviewed by a lawyer before English is enabled for users.**
> Source of truth: Hebrew (`src/messages/he/legal.json`, `legacy-dictionary.json`). English: `src/messages/en/legal.json` (359 keys) and 11 legacy keys (`onboarding.health.*`, `onboarding.terms.title`). One key, `credits.osm.attribution`, is already English in the Hebrew catalog and is intentionally absent from the English file. Translated faithfully and formally; no obligation added or removed. Company names, company number, address, email, dates and section numbers kept exactly. `{placeholders}`, `<b>` and `<link>` tags are code and must not be edited.

## Terms the translator was unsure about

1. **Company name**: `קליסטניקס בע"מ` rendered as "Calisthenics Ltd." (glossary: the lawyer decides the official English form). `ח.פ` rendered "Company No."
2. **Statute names and years.** The Hebrew gives some statutes without a year, so none was added: "Privacy Protection Law (Israel)" (the lawyer may want "Privacy Protection Law, 5741-1981"). Hebrew-calendar years written in letters were converted to digits (`תשע"ה` 5775, `תשע"ז` 5777, `תשי"ח` 5718); the validators have an allowlist for these three numbers.
3. **`חוק מכוני הכושר (רישוי ופיקוח)`** rendered "Fitness Centers Law (Licensing and Supervision)"; the official English title may differ.
4. **`ת"י 5568`** rendered "Israeli Standard SI 5568"; `תקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות)` rendered "Equal Rights for Persons with Disabilities (Service Accessibility Adjustments) Regulations".
5. **`תקנות הגנת הפרטיות (אבטחת מידע)`** rendered "Privacy Protection (Data Security) Regulations".
6. **Section numbering in the privacy policy** is out of order in the Hebrew source (5.1, then 5.3, then 5.2); kept as is. The cross-reference "(see 5.3)" is unchanged.
7. **`תמונות בריאות מאחסון ענן`** (privacyDoc.s9.u2.p2) is literally "health images from cloud storage"; probably the health declaration PDF. Kept literal.
8. **`יאונונמיו`** rendered "will be anonymized"; **`tenant הארגוני`** "organizational tenant" (the Hebrew leaves "tenant" in English).
9. **`סמכות השיפוט הייחודית ... בתל-אביב-יפו`** rendered "exclusive jurisdiction ... Tel Aviv-Yafo".
10. **Arrows**: Hebrew `←` in menu paths (Settings ← Account) is written `→` in English (reading direction). The "← Back to the app" link keeps `←`.
11. **Typo fixed silently in rendering**: Hebrew `reCAPTcHA` appears as "reCAPTCHA". The Hebrew heading numbers and source typos otherwise untouched.
12. **Em dashes** (`—`) used by the Hebrew as separators became commas, colons or parentheses, per the English style rule; meaning unchanged. `ללא יוצא מן הכלל` is "without exception" (twice with "any").
13. **Address**: `שדרות הר ציון 39, תל אביב` rendered "39 Har Zion Boulevard, Tel Aviv".
14. **Gender**: the Hebrew masculine ("המשתמש") became "the user ... they"; the terms use "shall" for obligations of the Company and "undertakes" where the Hebrew says `מתחייב`.
15. **Premium wording and Apple/Google policy** (`בכפוף למדיניות Apple/Google`) kept; no refund language was strengthened or softened.
16. The `help.*` keys (in-app help hub) and `credits.*`/`deleteData.*` are user-facing UI text, translated in the normal app voice, not legal register; they are listed here only because they live in `legal.json`.

## legal.json (key, Hebrew, English)

| Key | Hebrew | English |
|---|---|---|
| `accessibility.meta.title` | הצהרת נגישות \| OUT | Accessibility Statement \| OUT |
| `accessibility.meta.description` | הצהרת הנגישות של OUT: סטטוס ההתאמה לתקן ישראלי ת"י 5568 / WCAG 2.x ברמה AA, פרטי רכז הנגישות ואמצעי פנייה. | OUT’s accessibility statement: conformance status with Israeli Standard SI 5568 / WCAG 2.x at level AA, the accessibility coordinator’s details, and ways to contact us. |
| `accessibility.backToApp` | ← חזרה לאפליקציה | ← Back to the app |
| `accessibility.title` | הצהרת נגישות | Accessibility Statement |
| `accessibility.lastUpdated` | עודכן לאחרונה: {date} | Last updated: {date} |
| `accessibility.commitment.title` | המחויבות שלנו | Our commitment |
| `accessibility.commitment.body` | ב-OUT אנחנו מאמינים שאימון בחוץ צריך להיות נגיש לכולם. אנחנו פועלים להנגשת האפליקציה ואתר OUT לאנשים עם מוגבלות, כחלק מהמחויבות שלנו לבריאות נגישה לכל אחד ואחת. | At OUT, we believe that training outdoors should be accessible to everyone. We are working to make the OUT app and website accessible to people with disabilities, as part of our commitment to health that is accessible to everyone. |
| `accessibility.standard.title` | התקן והסטטוס הנוכחי | The standard and current status |
| `accessibility.standard.body` | אנחנו מתאימים את השירות לתקן הישראלי ת"י 5568 (המבוסס על WCAG 2.x) ברמה AA, בהתאם לתקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות). | We are adapting the service to Israeli Standard SI 5568 (based on WCAG 2.x) at level AA, in accordance with the Equal Rights for Persons with Disabilities (Service Accessibility Adjustments) Regulations. |
| `accessibility.standard.status` | <b>סטטוס: בתהליך התאמה.</b> השירות עדיין אינו עומד במלואו בדרישות התקן. אנחנו בודקים את המסכים באופן שיטתי, מתקנים ליקויים לפי סדר חשיבות, ומעדכנים הצהרה זו ככל שההתאמה מתקדמת. עד להשלמתה ייתכן שחלק מהמסכים והרכיבים עדיין אינם נגישים במלואם. | <b>Status: conformance in progress.</b> The service does not yet fully meet the requirements of the standard. We review the screens systematically, fix deficiencies in order of importance, and update this statement as conformance progresses. Until it is complete, some screens and components may not yet be fully accessible. |
| `accessibility.standard.toolbar` | בנוסף, סרגל נגישות של צד שלישי (UserWay) זמין להפעלה בהגדרות האפליקציה, תחת "הפעלת סרגל נגישות". הסרגל כבוי כברירת מחדל ואינו נטען עד שתפעילו אותו. הוא כלי עזר משלים ואינו מחליף את ההתאמות שאנחנו מבצעים בקוד. | In addition, a third-party accessibility toolbar (UserWay) is available to enable in the app settings, under “Enable accessibility toolbar”. The toolbar is off by default and is not loaded until you enable it. It is a supplementary aid and does not replace the adjustments we make in the code. |
| `accessibility.done.title` | מה כבר הותאם | What has already been adjusted |
| `accessibility.done.iconButtons` | כפתורים המסומנים באייקון בלבד קיבלו שם נגיש לקוראי מסך. | Buttons marked with an icon only have been given an accessible name for screen readers. |
| `accessibility.done.contrast` | צבעי טקסט ואייקונים בגוון הכחול של המותג הוכהו כדי לעמוד ביחס ניגודיות של 4.5:1 לפחות. | Text and icon colors in the brand blue were darkened to meet a contrast ratio of at least 4.5:1. |
| `accessibility.done.intervalLabel` | תווית האינטרוולים במסך האימון הוצגה על רקע אטום כך שהניגודיות אינה תלויה בתוכן שמאחוריה. | The intervals label on the workout screen is displayed on an opaque background, so that the contrast does not depend on the content behind it. |
| `accessibility.adjust.title` | התאמות באפליקציה | Adjustments in the app |
| `accessibility.adjust.rtl` | האפליקציה מוגדרת בשפה ובכיוון הנכונים (עברית מימין לשמאל). | The app is set to the correct language and direction (Hebrew, right to left). |
| `accessibility.adjust.zoom` | אפשר להגדיל את התצוגה (זום) בכל מכשיר, כולל צביטה במסך מגע. | The display can be enlarged (zoom) on any device, including pinching on a touch screen. |
| `accessibility.adjust.reducedMotion` | כשבמכשיר מוגדרת העדפה להפחתת תנועה, חלק מהאנימציות מופחתות. | When the device is set to a reduced motion preference, some animations are reduced. |
| `accessibility.adjust.altText` | לתמונות בעלות תוכן יש טקסט חלופי, ותמונות קישוטיות מוסתרות מקוראי מסך. | Images with content have alternative text, and decorative images are hidden from screen readers. |
| `accessibility.limits.title` | מגבלות ידועות | Known limitations |
| `accessibility.limits.intro` | אנחנו מכירים את המגבלות הבאות ועובדים לתקן אותן: | We are aware of the following limitations and are working to fix them: |
| `accessibility.limits.maps` | המפות באפליקציה אינן נגישות במלואן למקלדת ולקוראי מסך. המידע עליהן זמין גם בפנייה אלינו. | The maps in the app are not fully accessible to keyboards and screen readers. The information on them is also available by contacting us. |
| `accessibility.limits.videos` | סרטוני ההדרכה והתרגילים אינם כוללים כתוביות כרגע. | The instructional and exercise videos do not currently include captions. |
| `accessibility.contact.title` | רכז הנגישות ופנייה אלינו | Accessibility coordinator and contacting us |
| `accessibility.contact.intro` | נתקלתם בקושי, או צריכים את המידע בדרך אחרת? נשמח לשמוע ולטפל בפנייה. | Did you encounter a difficulty, or do you need the information in another way? We will be glad to hear from you and to handle your request. |
| `accessibility.contact.coordinatorLabel` | רכז נגישות: | Accessibility coordinator: |
| `accessibility.contact.emailLabel` | דוא"ל: | Email: |
| `accessibility.contact.phoneLabel` | טלפון: | Phone: |
| `accessibility.contact.tips` | בפנייה מומלץ לציין את המסך או הפעולה, את המכשיר או הדפדפן, ואת טכנולוגיית העזר שבה השתמשתם (אם יש). נשתדל להשיב בהקדם האפשרי. | When contacting us, we recommend stating the screen or action, the device or browser, and the assistive technology you used (if any). We will try to reply as soon as possible. |
| `accessibility.footer` | © 2026 קליסטניקס בע"מ, ח.פ 516841806. | © 2026 Calisthenics Ltd., Company No. 516841806. |
| `privacy.meta.title` | מדיניות פרטיות \| OUT | Privacy Policy \| OUT |
| `privacy.meta.description` | מדיניות הפרטיות של OUT — כיצד אנו אוספים, משתמשים ומגנים על המידע שלך, כולל נתוני Apple HealthKit ו-Google Health Connect. | OUT’s privacy policy: how we collect, use, and protect your information, including Apple HealthKit and Google Health Connect data. |
| `privacy.commitments.badge` | התחייבויות מוחלטות | Absolute commitments |
| `privacy.version` | גרסה {version} · עודכן: {date} | Version {version} · Updated: {date} |
| `privacy.health.badge` | עומד בדרישות Google Play Health Connect ו-Apple HealthKit | Compliant with Google Play Health Connect and Apple HealthKit requirements |
| `privacy.footer.effective` | מדיניות זו נכנסה לתוקף ב-1 בינואר 2026 · עודכנה: {date} | This policy entered into effect on 1 January 2026 · Updated: {date} |
| `termsDoc.title` | תנאי שימוש | Terms of Use |
| `termsDoc.intro.p1` | קליסטניקס בע"מ, ח.פ 516841806 \| גרסה 2.1 \| אפריל 2026 \| office@appout.co.il | Calisthenics Ltd., Company No. 516841806 \| Version 2.1 \| April 2026 \| office@appout.co.il |
| `termsDoc.s1.title` | 1. כללי | 1. General |
| `termsDoc.s1.p1` | אפליקציית OUT מופעלת על-ידי קליסטניקס בע"מ, ח.פ 516841806 (להלן: "החברה"). האפליקציה מספקת שירותי מעקב פעילות גופנית, תוכניות אימון מותאמות אישית, מיפוי מתקני כושר ציבוריים ויצירת קהילות פעילות גופנית. | The OUT app is operated by Calisthenics Ltd., Company No. 516841806 (hereinafter: the “Company”). The app provides physical activity tracking services, personalized training programs, mapping of public fitness facilities, and the creation of physical activity communities. |
| `termsDoc.s1.p2` | השימוש באפליקציה מותנה בקבלה מלאה של תנאי שימוש אלו ומדיניות הפרטיות. ככל שאינך מסכים, אינך רשאי להשתמש באפליקציה. כל משתמש אשר יעשה שימוש באפליקציה ייחשב כמי שהסכים לכל התנאים. | Use of the app is conditional upon full acceptance of these Terms of Use and the Privacy Policy. If you do not agree, you are not permitted to use the app. Any user who uses the app shall be deemed to have agreed to all of the terms. |
| `termsDoc.s1.p3` | מדיניות הפרטיות מהווה חלק בלתי נפרד מתנאי שימוש אלו. | The Privacy Policy forms an integral part of these Terms of Use. |
| `termsDoc.s1.p4` | החברה שומרת לעצמה את הזכות לשנות תנאים אלו מעת לעת. שינויים מהותיים יפורסמו באפליקציה לפחות 30 יום לפני כניסתם לתוקף. המשך שימוש לאחר הפרסום מהווה הסכמה לתנאים המעודכנים. | The Company reserves the right to change these terms from time to time. Material changes will be published in the app at least 30 days before they take effect. Continued use after publication constitutes agreement to the updated terms. |
| `termsDoc.s2.title` | 2. כשירות לשימוש | 2. Eligibility |
| `termsDoc.s2.p1` | האפליקציה מיועדת למשתמשים מגיל 14 ומעלה בלבד. משתמשים מתחת לגיל 14 אינם רשאים להירשם או להשתמש באפליקציה, וניסיון הרשמה ייחסם אוטומטית. | The app is intended only for users aged 14 and over. Users under the age of 14 are not permitted to register or to use the app, and any attempt to register will be blocked automatically. |
| `termsDoc.s2.p2` | משתמשים בגילאי 14–17 מוגדרים כ"קטינים" ויחולו עליהם מגבלות שימוש נוספות, לרבות הגבלות על שיחות פרטיות ותכנים חברתיים. | Users aged 14–17 are defined as “minors”, and additional usage restrictions shall apply to them, including restrictions on private conversations and social content. |
| `termsDoc.s2.p3` | המשתמש מצהיר כי הוא עומד בתנאי הגיל ובכל יתר דרישות הכשירות. החברה שומרת לעצמה את הזכות לבטל חשבון שנפתח בניגוד לתנאי גיל אלו. | The user declares that they meet the age requirements and all other eligibility requirements. The Company reserves the right to cancel an account opened in contravention of these age requirements. |
| `termsDoc.s3.title` | 3. הצהרת בריאות ואחריות גופנית | 3. Health Declaration and Physical Responsibility |
| `termsDoc.s3.p1` | כתנאי לשימוש באפליקציה, כל משתמש ימלא שאלון רפואי ויחתום על הצהרת בריאות בהתאם לחוק מכוני הכושר (רישוי ופיקוח), תיקון מס׳ 2 התשע"ה-2015. החברה רשאית לסרב לאפשר שימוש למשתמש שאינו עומד בתנאי הבריאות הנדרשים. | As a condition of using the app, every user shall complete a medical questionnaire and sign a health declaration in accordance with the Fitness Centers Law (Licensing and Supervision), Amendment No. 2, 5775-2015. The Company may refuse to allow use by a user who does not meet the required health conditions. |
| `termsDoc.s3.p2` | האפליקציה אינה תחליף לייעוץ רפואי מקצועי. החברה ממליצה להיוועץ ברופא לפני תחילת כל פעילות גופנית, ובמיוחד לאנשים עם בעיות בריאות קיימות. | The app is not a substitute for professional medical advice. The Company recommends consulting a doctor before starting any physical activity, especially for people with existing health problems. |
| `termsDoc.s3.p3` | השימוש במתקני כושר ציבוריים הוא על אחריות המשתמש בלבד, בהתאם להנחיות המוצגות בכל מתקן ובשלטים בפארק. | Use of public fitness facilities is at the user’s sole responsibility, in accordance with the instructions displayed at each facility and the signs in the park. |
| `termsDoc.s4.title` | 4. מנויים ותשלומים | 4. Subscriptions and Payments |
| `termsDoc.s4.u1.title` | 4.1 רכישה וחיוב | 4.1 Purchase and billing |
| `termsDoc.s4.u1.p1` | האפליקציה כוללת שירותים חינמיים ושירותים בתשלום. תשלום עבור שירותי פרימיום מבוצע דרך Apple App Store או Google Play Store. המחירים ותנאי החיוב מוצגים בבירור לפני ביצוע הרכישה. | The app includes free services and paid services. Payment for premium services is made through the Apple App Store or the Google Play Store. Prices and billing terms are clearly displayed before the purchase is made. |
| `termsDoc.s4.u1.p2` | המנוי מתחדש אוטומטית בתום כל תקופה, אלא אם בוטל לפחות 24 שעות לפני תום התקופה. | The subscription renews automatically at the end of each period, unless it is canceled at least 24 hours before the end of the period. |
| `termsDoc.s4.u1.p3` | לא יינתן החזר כספי עבור תקופת מנוי שהחלה, אלא בנסיבות חריגות ובכפוף למדיניות Apple/Google. | No refund will be given for a subscription period that has begun, except in exceptional circumstances and subject to Apple/Google policy. |
| `termsDoc.s4.u2.title` | 4.2 ביטול מנוי | 4.2 Canceling a subscription |
| `termsDoc.s4.u2.p1` | ביטול מנוי מתבצע דרך הגדרות Apple ID (iOS) או Google Play (Android). הגישה לשירותים הפרימיום נשמרת עד תום תקופת המנוי ששולמה. | A subscription is canceled through the Apple ID settings (iOS) or Google Play (Android). Access to premium services is retained until the end of the paid subscription period. |
| `termsDoc.s5.title` | 5. מטבעות וירטואליים | 5. Virtual Coins |
| `termsDoc.s5.p1` | האפליקציה כוללת מערכת נקודות וקרדיטים (להלן: "מטבעות") המוענקים למשתמשים על ביצוע אימונים ועמידה ביעדים. | The app includes a system of points and credits (hereinafter: “coins”) awarded to users for completing workouts and meeting goals. |
| `termsDoc.s5.p2` | המטבעות הם וירטואליים בלבד ואין להם כל ערך כספי מחוץ לאפליקציה. | The coins are virtual only and have no monetary value outside the app. |
| `termsDoc.s5.p3` | אין אפשרות לרכוש מטבעות בכסף אמיתי. | It is not possible to purchase coins with real money. |
| `termsDoc.s5.p4` | אין אפשרות להמיר מטבעות למזומן, לזיכוי, לשובר או לכל טובת הנאה מחוץ לאפליקציה. | It is not possible to convert coins into cash, credit, a voucher, or any benefit outside the app. |
| `termsDoc.s5.p5` | המטבעות אינם ניתנים להעברה בין משתמשים. | The coins are not transferable between users. |
| `termsDoc.s5.p6` | בעת מחיקת חשבון — המטבעות נמחקים ולא ניתן לשחזרם. | Upon deletion of an account, the coins are deleted and cannot be restored. |
| `termsDoc.s5.p7` | החברה שומרת לעצמה את הזכות לשנות, לאפס או לבטל מטבעות שנצברו בצורה לא תקינה. | The Company reserves the right to change, reset, or cancel coins that were accumulated improperly. |
| `termsDoc.s6.title` | 6. זכויות יוצרים וקניין רוחני | 6. Copyright and Intellectual Property |
| `termsDoc.s6.p1` | כל זכויות הקניין הרוחני באפליקציה — לרבות תוכניות אימון, סרטוני הסבר, טקסטים, תמונות, גרפים, ממשק המשתמש וסימני מסחר — שייכות לחברה ומוגנות בחוק. | All intellectual property rights in the app, including training programs, explanatory videos, texts, images, graphics, the user interface, and trademarks, belong to the Company and are protected by law. |
| `termsDoc.s6.p2` | חל איסור מוחלט להעתיק, לשכפל, לשנות, להפיץ, לפרסם, ליצור יצירות נגזרות או למכור תכנים אלו ללא רשות מפורשת בכתב מהחברה. | It is strictly prohibited to copy, reproduce, modify, distribute, publish, create derivative works from, or sell this content without the express written permission of the Company. |
| `termsDoc.s6.p3` | סרטוני הדרכה מסוימים מאוחסנים ומוגשים דרך שירות CDN חיצוני (Bunny.net). כל הזכויות שמורות לחברה. | Certain instructional videos are stored and served through an external CDN service (Bunny.net). All rights are reserved to the Company. |
| `termsDoc.s7.title` | 7. תוכן גולשים (UGC) | 7. User-Generated Content (UGC) |
| `termsDoc.s7.u1.title` | 7.1 פרסום תוכן | 7.1 Publishing content |
| `termsDoc.s7.u1.p1` | המשתמש רשאי לפרסם פוסטים ותגובות בפיד הקהילתי. המשתמש אחראי באופן בלעדי לתוכן שהוא מפרסם ומצהיר כי הוא בעל הזכויות לפרסמו. | The user may publish posts and comments in the community feed. The user is solely responsible for the content they publish and declares that they hold the rights to publish it. |
| `termsDoc.s7.u2.title` | 7.2 תוכן אסור | 7.2 Prohibited content |
| `termsDoc.s7.u2.p1` | חל איסור מוחלט להעלות תכנים פוגעניים, מאיימים, גזעניים, מיניים, מטרידים או בלתי חוקיים. | It is strictly prohibited to upload content that is offensive, threatening, racist, sexual, harassing, or unlawful. |
| `termsDoc.s7.u2.p2` | חל איסור להתחזות לאדם אחר או לגוף אחר. | It is prohibited to impersonate another person or entity. |
| `termsDoc.s7.u2.p3` | חל איסור להעלות תכנים המפרים זכויות יוצרים או קניין רוחני של צד שלישי. | It is prohibited to upload content that infringes the copyright or intellectual property of a third party. |
| `termsDoc.s7.u2.p4` | חל איסור להעלות תכנים המכילים וירוסים, תוכנות זדוניות או קישורים לאתרים מזיקים. | It is prohibited to upload content containing viruses, malware, or links to harmful websites. |
| `termsDoc.s7.u3.title` | 7.3 מחיקת תוכן | 7.3 Deleting content |
| `termsDoc.s7.u3.p1` | המשתמש רשאי למחוק פוסטים שפרסם בכל עת. החברה שומרת לעצמה את הזכות להסיר כל תוכן המפר את תנאי השימוש, בתוך 24 שעות מקבלת דיווח. | The user may delete posts they published at any time. The Company reserves the right to remove any content that violates the Terms of Use, within 24 hours of receiving a report. |
| `termsDoc.s7.u4.title` | 7.4 דיווח על תוכן פוגעני | 7.4 Reporting offensive content |
| `termsDoc.s7.u4.p1` | משתמש המזהה תוכן פוגעני מוזמן לדווח עליו דרך כפתור הדיווח באפליקציה. החברה מתחייבת לבחון כל דיווח ולפעול בהתאם תוך 24 שעות. | A user who identifies offensive content is invited to report it through the report button in the app. The Company undertakes to review every report and to act accordingly within 24 hours. |
| `termsDoc.s8.title` | 8. כללי התנהגות | 8. Rules of Conduct |
| `termsDoc.s8.p1` | המשתמש מתחייב להשתמש באפליקציה בתום לב ובהתאם לדין. | The user undertakes to use the app in good faith and in accordance with the law. |
| `termsDoc.s8.p2` | המשתמש מתחייב שלא לנסות לפרוץ, לשבש או לפגוע בפעילות האפליקציה. | The user undertakes not to attempt to hack, disrupt, or harm the operation of the app. |
| `termsDoc.s8.p3` | המשתמש מתחייב שלא לאסוף מידע על משתמשים אחרים ללא הסכמתם. | The user undertakes not to collect information about other users without their consent. |
| `termsDoc.s8.p4` | המשתמש מתחייב שלא לעשות שימוש מסחרי בתכני האפליקציה ללא אישור כתוב. | The user undertakes not to make commercial use of the app’s content without written approval. |
| `termsDoc.s8.p5` | המשתמש מתחייב שלא לזייף נתוני אימונים או נקודות. | The user undertakes not to falsify workout data or points. |
| `termsDoc.s8.p6` | המשתמש מתחייב שלא ליצור חשבונות מרובים לאותו משתמש. | The user undertakes not to create multiple accounts for the same user. |
| `termsDoc.s8.p7` | החברה שומרת על זכותה לחסום גישה, לבטל הרשאות ולהסיר תכנים בכל עת, ובפרט במקרי הפרת תנאי השימוש. | The Company reserves the right to block access, revoke permissions, and remove content at any time, in particular in cases of violation of the Terms of Use. |
| `termsDoc.s9.title` | 9. תכונות חברתיות | 9. Social Features |
| `termsDoc.s9.u1.title` | 9.1 שיחות פרטיות | 9.1 Private conversations |
| `termsDoc.s9.u1.p1` | האפליקציה מאפשרת שיחות פרטיות (DM) בין משתמשים בוגרים (18+). משתמשים קטינים אינם רשאים לנהל שיחות פרטיות עם משתמשים מחוץ ל-tenant הארגוני שלהם. | The app enables private conversations (DM) between adult users (18+). Minor users are not permitted to hold private conversations with users outside their organizational tenant. |
| `termsDoc.s9.u2.title` | 9.2 שיתוף מיקום | 9.2 Location sharing |
| `termsDoc.s9.u2.p1` | שיתוף מיקום על המפה הקהילתית הוא אופציונלי ומתבצע אך ורק בהסכמת המשתמש. מיקום קטינים מטושטש תמיד וקטינים ומבוגרים מופרדים על המפה. | Sharing location on the community map is optional and takes place solely with the user’s consent. The location of minors is always blurred, and minors and adults are separated on the map. |
| `termsDoc.s9.u3.title` | 9.3 עוקבים וחיבורים | 9.3 Followers and connections |
| `termsDoc.s9.u3.p1` | פרופיל המשתמש אינו מופיע בחיפוש כברירת מחדל. המשתמש יכול להפעיל נראות פרופיל דרך הגדרות הפרטיות. | The user’s profile does not appear in search by default. The user can enable profile visibility through the privacy settings. |
| `termsDoc.s10.title` | 10. גישה למצלמה ולגלריה | 10. Access to the Camera and Gallery |
| `termsDoc.s10.p1` | האפליקציה עשויה לבקש גישה למצלמה ולגלריית התמונות של המכשיר למטרות הבאות בלבד: העלאת תמונת פרופיל אישית ושיתוף תמונות אימון בפיד הקהילתי. | The app may request access to the device’s camera and photo gallery for the following purposes only: uploading a personal profile picture and sharing workout photos in the community feed. |
| `termsDoc.s10.p2` | הגישה מתבצעת אך ורק לאחר אישור מפורש של המשתמש דרך תיבת הדו-שיח של מערכת ההפעלה. המשתמש רשאי לבטל גישה זו בכל עת דרך הגדרות המכשיר. | Access takes place solely after the user’s express approval through the operating system’s dialog box. The user may revoke this access at any time through the device settings. |
| `termsDoc.s10.p3` | האפליקציה אינה סורקת, אוספת או מנתחת תמונות אחרות בגלריה. התמונות שהמשתמש בחר להעלות נשמרות באופן מאובטח ב-Firebase Storage ואינן משותפות עם חברות פרסום או גורמים חיצוניים. | The app does not scan, collect, or analyze other images in the gallery. Images that the user chose to upload are stored securely in Firebase Storage and are not shared with advertising companies or external parties. |
| `termsDoc.s10.p4` | האפליקציה אינה מבקשת גישה למיקרופון. | The app does not request access to the microphone. |
| `termsDoc.s11.title` | 11. קישורים לאתרים חיצוניים | 11. Links to External Websites |
| `termsDoc.s11.p1` | האפליקציה עשויה לכלול קישורים לאתרים חיצוניים. החברה אינה אחראית לתכנים של אתרים אלו. הכללת קישור אינה מהווה המלצה מצד החברה. | The app may include links to external websites. The Company is not responsible for the content of these websites. The inclusion of a link does not constitute an endorsement by the Company. |
| `termsDoc.s12.title` | 12. הגבלת אחריות | 12. Limitation of Liability |
| `termsDoc.s12.p1` | האפליקציה ניתנת לשימוש "כמות שהוא" (AS IS). החברה לא תישא באחריות לנזקים ישירים, עקיפים, גופניים או אחרים הנובעים מהשימוש באפליקציה, לרבות נזקים הנובעים מביצוע תרגילים גופניים. | The app is provided for use “as is” (AS IS). The Company shall not be liable for direct, indirect, physical, or other damages arising from the use of the app, including damages arising from performing physical exercises. |
| `termsDoc.s12.p2` | החבות הכספית הכוללת של החברה לא תעלה על תשלומי התמורה ששילם המשתמש ב-6 החודשים שקדמו לאירוע. | The Company’s total financial liability shall not exceed the consideration paid by the user in the 6 months preceding the event. |
| `termsDoc.s12.p3` | לא ניתן להעלות טענות כנגד החברה לאחר 12 חודשים מהאירוע. | No claims may be brought against the Company after 12 months from the event. |
| `termsDoc.s12.p4` | דיווח על הפרות: office@appout.co.il | Reporting violations: office@appout.co.il |
| `termsDoc.s13.title` | 13. דין חל וסמכות שיפוט | 13. Governing Law and Jurisdiction |
| `termsDoc.s13.p1` | תנאי שימוש אלו כפופים לדיני מדינת ישראל. סמכות השיפוט הייחודית נתונה לבתי המשפט המוסמכים בתל-אביב-יפו בלבד. | These Terms of Use are governed by the laws of the State of Israel. The competent courts in Tel Aviv-Yafo shall have exclusive jurisdiction. |
| `termsDoc.s14.title` | 14. הוראות כלליות | 14. General Provisions |
| `termsDoc.s14.p1` | תנאי שימוש אלו, ביחד עם מדיניות הפרטיות, ממצים את מכלול ההוראות החלות. ויתור על זכות אינו ויתור קבוע. ככל שהוראה תימצא בלתי תקפה, לא יפגע תוקפן של יתר ההוראות. | These Terms of Use, together with the Privacy Policy, constitute the entire set of applicable provisions. A waiver of a right is not a permanent waiver. If any provision is found to be invalid, the validity of the remaining provisions shall not be affected. |
| `termsDoc.s14.p2` | החברה תהיה רשאית להמחות את זכויותיה לגוף אחר, ובלבד שאותו גוף יתחייב לפעול בהתאם לתנאי שימוש אלו. | The Company may assign its rights to another entity, provided that such entity undertakes to act in accordance with these Terms of Use. |
| `termsDoc.s14.p3` | מסמך זה נכנס לתוקף ביום 1 בינואר 2026. © 2026 קליסטניקס בע"מ. כל הזכויות שמורות. | This document entered into effect on 1 January 2026. © 2026 Calisthenics Ltd. All rights reserved. |
| `privacyDoc.title` | מדיניות פרטיות | Privacy Policy |
| `privacyDoc.intro.p1` | קליסטניקס בע"מ, ח.פ 516841806 \| גרסה 2.3 \| אוקטובר 2026 \| office@appout.co.il | Calisthenics Ltd., Company No. 516841806 \| Version 2.3 \| October 2026 \| office@appout.co.il |
| `privacyDoc.s1.title` | מבוא | Introduction |
| `privacyDoc.s1.p1` | קליסטניקס בע"מ מחויבת להגנה על פרטיות משתמשי OUT. מדיניות זו מסבירה אילו נתונים אנחנו אוספים, כיצד אנחנו משתמשים בהם ואיך אנחנו מגנים עליהם. | Calisthenics Ltd. is committed to protecting the privacy of OUT users. This policy explains what data we collect, how we use it, and how we protect it. |
| `privacyDoc.s1.p2` | מדיניות זו עומדת בדרישות: חוק הגנת הפרטיות (ישראל), תקנות הגנת הפרטיות (אבטחת מידע) תשע"ז-2017, GDPR (האיחוד האירופי), Apple App Store Review Guidelines, ו-Google Play Developer Program Policies. | This policy complies with the requirements of: the Privacy Protection Law (Israel), the Privacy Protection (Data Security) Regulations, 5777-2017, the GDPR (European Union), the Apple App Store Review Guidelines, and the Google Play Developer Program Policies. |
| `privacyDoc.s2.title` | 1. מידע שאנו אוספים | 1. Information We Collect |
| `privacyDoc.s2.u1.title` | 1.1 מידע שהמשתמש מוסר ישירות | 1.1 Information the user provides directly |
| `privacyDoc.s2.u1.p1` | פרטי הרשמה: שם פרטי, מגדר, תאריך לידה. | Registration details: first name, gender, date of birth. |
| `privacyDoc.s2.u1.p2` | פרטי יצירת קשר: כתובת דוא"ל (אופציונלי — לצורך גיבוי חשבון בלבד). | Contact details: email address (optional, solely for account backup). |
| `privacyDoc.s2.u1.p3` | מידע כושר: גובה, משקל, רמת כושר, ציוד זמין, ימי ושעות אימון מועדפים. | Fitness information: height, weight, fitness level, available equipment, preferred training days and times. |
| `privacyDoc.s2.u1.p4` | הצהרת בריאות: תשובות לשאלון PAR-Q+ (13 שאלות רפואיות). נשמר מאובטח בנפרד. לא משותף עם צדדים שלישיים. | Health declaration: answers to the PAR-Q+ questionnaire (13 medical questions). Stored securely and separately. Not shared with third parties. |
| `privacyDoc.s2.u1.p5` | תוכן גולשים: פוסטים, תגובות, ותמונות שהמשתמש מעלה מרצונו. | User-generated content: posts, comments, and images that the user uploads voluntarily. |
| `privacyDoc.s2.u2.title` | 1.2 מידע פעילות גופנית | 1.2 Physical activity information |
| `privacyDoc.s2.u2.p1` | נתוני אימונים: סוג אימון, משך, עצימות, תרגילים שבוצעו, קרדיטים שנצברו. | Workout data: workout type, duration, intensity, exercises performed, credits accumulated. |
| `privacyDoc.s2.u2.p2` | נתוני ריצה: מסלול GPS מלא, קצב, מרחק, זמן — נאספים רק בזמן הקלטת ריצה פעילה ודורשים אישור מיקום מפורש מהמשתמש. | Running data: full GPS route, pace, distance, time. Collected only while an active run is being recorded and requires the user’s express location permission. |
| `privacyDoc.s2.u2.p3` | רמת התקדמות: ניקוד, רמה, רצף אימונים, הישגים. | Progress level: score, level, workout streak, achievements. |
| `privacyDoc.s2.u3.title` | 1.3 מידע מיקום | 1.3 Location information |
| `privacyDoc.s2.u3.p1` | מיקום משוער: נאסף לצורך הצגת פארקים וקהילות בקרבת מקום. דורש אישור מפורש. | Approximate location: collected in order to display nearby parks and communities. Requires express permission. |
| `privacyDoc.s2.u3.p2` | מיקום בזמן אימון: מטושטש (~100 מטר) לפני שמירה. מיקום מדויק נשמר רק במסלולי ריצה שהמשתמש בחר להקליט. | Location during a workout: blurred (~100 meters) before saving. Precise location is saved only in running routes that the user chose to record. |
| `privacyDoc.s2.u3.p3` | מיקום קטינים: מטושטש תמיד בדרגה גבוהה יותר. קטינים ומבוגרים מופרדים על המפה. | Location of minors: always blurred to a higher degree. Minors and adults are separated on the map. |
| `privacyDoc.s2.u4.title` | 1.4 מידע טכני | 1.4 Technical information |
| `privacyDoc.s2.u4.p1` | מזהה מכשיר אנונימי (Firebase Installation ID). | Anonymous device identifier (Firebase Installation ID). |
| `privacyDoc.s2.u4.p2` | גרסת אפליקציה, מערכת הפעלה, סוג מכשיר. | App version, operating system, device type. |
| `privacyDoc.s2.u4.p3` | נתוני שימוש אנונימיים לצורך שיפור האפליקציה בלבד (ניתן לביטול). | Anonymous usage data for the purpose of improving the app only (can be disabled). |
| `privacyDoc.s3.title` | 2. נתוני בריאות — Apple HealthKit ו-Google Health Connect | 2. Health Data: Apple HealthKit and Google Health Connect |
| `privacyDoc.s3.u1.title` | 2.1 מה נקרא | 2.1 What is read |
| `privacyDoc.s3.u1.p1` | מספר צעדים יומי, דקות פעילות גופנית. | Daily step count, minutes of physical activity. |
| `privacyDoc.s3.u1.p2` | נתוני ריצה ואימון שבוצעו דרך האפליקציה. | Running and workout data performed through the app. |
| `privacyDoc.s3.u1.p3` | האפליקציה אינה קוראת נתוני קלוריות מ-HealthKit או מ-Health Connect. הקלוריות המוצגות מחושבות בתוך האפליקציה על בסיס האימון שבוצע, ונכתבות בחזרה למערכת הבריאות של המכשיר. | The app does not read calorie data from HealthKit or from Health Connect. The calories displayed are calculated within the app on the basis of the workout performed, and are written back to the device’s health system. |
| `privacyDoc.s3.u2.title` | 2.2 מה נכתב | 2.2 What is written |
| `privacyDoc.s3.u2.p1` | נתוני אימונים שבוצעו דרך OUT (סוג, משך, קלוריות). | Workout data performed through OUT (type, duration, calories). |
| `privacyDoc.s3.u2.p2` | נתוני ריצה שהוקלטו דרך האפליקציה. | Running data recorded through the app. |
| `privacyDoc.s3.u3.title` | 2.3 התחייבויות מוחלטות | 2.3 Absolute commitments |
| `privacyDoc.s3.u3.p1` | נתוני בריאות נאספים אך ורק באישור מפורש של המשתמש. | Health data is collected solely with the user’s express permission. |
| `privacyDoc.s3.u3.p2` | נתוני בריאות משמשים אך ורק להצגת נתונים אישיים למשתמש ולמעקב התקדמותו. | Health data is used solely to display personal data to the user and to track the user’s progress. |
| `privacyDoc.s3.u3.p3` | אנחנו לא מעבירים נתוני בריאות לצדדים שלישיים לרבות ספקי פרסום, חברות ביטוח, מעסיקים, או כל גורם אחר. | We do not transfer health data to third parties, including advertising providers, insurance companies, employers, or any other party. |
| `privacyDoc.s3.u3.p4` | אנחנו לא משתמשים בנתוני בריאות למטרות פרסום, שיווק, ניקוד אשראי, או כל מטרה שאינה מעקב אישי. | We do not use health data for advertising, marketing, credit scoring, or any purpose other than personal tracking. |
| `privacyDoc.s3.u3.p5` | נתוני בריאות לא ישמשו לעולם לקביעת זכאות לביטוח, לקבלת החלטות העסקה, לדירוג אשראי, לדיור, ולא יימכרו לברוקרי נתונים או לכל גורם מסחרי אחר — ללא כל יוצא מן הכלל. | Health data will never be used to determine eligibility for insurance, to make employment decisions, for credit rating, or for housing, and will not be sold to data brokers or to any other commercial party, without any exception. |
| `privacyDoc.s3.u3.p6` | ערכי הדאטה מ-HealthKit / Health Connect — מספר צעדים ומשך פעילות — אינם נשמרים בשרתי OUT, ומוצגים בזמן אמת מהמכשיר. | The data values from HealthKit / Health Connect, namely step count and activity duration, are not stored on OUT’s servers, and are displayed in real time from the device. |
| `privacyDoc.s3.u3.p7` | לצורך מניעת כפילויות נשמר מזהה טכני של כל רשומה שנקראה, ללא הערך עצמו וללא תאריך הפעילות. | In order to prevent duplicates, a technical identifier of each record that was read is stored, without the value itself and without the date of the activity. |
| `privacyDoc.s3.u3.p8` | סכומי פעילות מצטברים — למשל סך דקות הפעילות השבועיות — נשמרים בחשבונך, כדי להציג לך את ההתקדמות שלך לאורך זמן. | Accumulated activity totals, for example the total weekly activity minutes, are stored in your account in order to show you your progress over time. |
| `privacyDoc.s3.u3.p9` | כל הנתונים האלה נמחקים לחלוטין עם מחיקת החשבון. | All of this data is deleted completely upon deletion of the account. |
| `privacyDoc.s3.u3.p10` | המשתמש יכול לבטל גישה בכל עת דרך הגדרות הטלפון. | The user can revoke access at any time through the phone settings. |
| `privacyDoc.s4.title` | 3. כיצד אנו משתמשים במידע | 3. How We Use Information |
| `privacyDoc.s4.p1` | הצגת נתוני פעילות אישיים למשתמש. | Displaying personal activity data to the user. |
| `privacyDoc.s4.p2` | הפעלת תוכניות אימון והתאמתן לרמת המשתמש. | Operating training programs and adapting them to the user’s level. |
| `privacyDoc.s4.p3` | שיפור האפליקציה על בסיס דפוסי שימוש אנונימיים (ניתן לביטול). | Improving the app on the basis of anonymous usage patterns (can be disabled). |
| `privacyDoc.s4.p4` | שליחת הודעות Push לתזכורות אימון ועדכונים — בהתאם להעדפות המשתמש ובכפוף לאישורו. | Sending Push notifications for workout reminders and updates, in accordance with the user’s preferences and subject to the user’s approval. |
| `privacyDoc.s4.p5` | שמירת קשר בנושאים הקשורים לשירות (עדכונים, שינויי תנאים). | Keeping in touch on matters related to the service (updates, changes to the terms). |
| `privacyDoc.s4.p6` | שיווק ישיר — אך ורק למשתמשים שנתנו הסכמה מפורשת, עם אפשרות הסרה קלה בכל עת. | Direct marketing, solely to users who have given express consent, with a simple option to opt out at any time. |
| `privacyDoc.s5.title` | 4. הרשאות מכשיר | 4. Device Permissions |
| `privacyDoc.s5.p1` | מיקום (בזמן שימוש): הצגת פארקים קרובים, מעקב מסלולי ריצה, חיבור לקהילות מקומיות. אופציונלי. | Location (while using the app): displaying nearby parks, tracking running routes, connecting to local communities. Optional. |
| `privacyDoc.s5.p2` | התראות Push: תזכורות אימון, הישגים, עדכונים קהילתיים, הודעות שיווקיות (בהסכמה). אופציונלי. | Push notifications: workout reminders, achievements, community updates, marketing messages (with consent). Optional. |
| `privacyDoc.s5.p3` | HealthKit / Health Connect: קריאת צעדים ופעילות גופנית, כתיבת נתוני אימון. אופציונלי. | HealthKit / Health Connect: reading steps and physical activity, writing workout data. Optional. |
| `privacyDoc.s5.p4` | מצלמה וגלריה: העלאת תמונת פרופיל ושיתוף תמונות אימון בלבד. גישה רק באישור מפורש. האפליקציה אינה סורקת תמונות אחרות בגלריה ואינה משתפת תמונות עם גורמי פרסום. אופציונלי. | Camera and gallery: uploading a profile picture and sharing workout photos only. Access only with express permission. The app does not scan other images in the gallery and does not share images with advertising parties. Optional. |
| `privacyDoc.s5.p5` | האפליקציה אינה מבקשת גישה למיקרופון. | The app does not request access to the microphone. |
| `privacyDoc.s6.title` | 5. שירותי צד שלישי ושיתוף נתונים | 5. Third-Party Services and Data Sharing |
| `privacyDoc.s6.p1` | החברה לא מוכרת, לא מחכירה ולא מסחרת מידע אישי של משתמשים. נתוני בריאות לא ישותפו עם כל צד שלישי, ללא יוצא מן הכלל. | The Company does not sell, lease, or trade users’ personal information. Health data will not be shared with any third party, without exception. |
| `privacyDoc.s6.u1.title` | 5.1 ספקי שירות טכנולוגי | 5.1 Technology service providers |
| `privacyDoc.s6.u1.p1` | Firebase / Google Cloud: אחסון נתונים, אימות, Cloud Functions. נתוני משתמש מוצפנים. שרתים בארה"ב ו/או האיחוד האירופי. | Firebase / Google Cloud: data storage, authentication, Cloud Functions. User data is encrypted. Servers in the USA and/or the European Union. |
| `privacyDoc.s6.u1.p2` | Firebase Analytics (Google): ניתוח שימוש אנונימי. ניתן לביטול. | Firebase Analytics (Google): anonymous usage analysis. Can be disabled. |
| `privacyDoc.s6.u1.p3` | Firebase Auth (Google): אימות משתמשים. אימייל, מזהה UID. | Firebase Auth (Google): user authentication. Email, UID identifier. |
| `privacyDoc.s6.u1.p4` | Mapbox: מפות, ניווט, geocoding. קואורדינטות GPS לצורך מפה ומסלולים. | Mapbox: maps, navigation, geocoding. GPS coordinates for the purpose of the map and routes. |
| `privacyDoc.s6.u1.p5` | reCAPTCHA Enterprise (Google): אבטחה נגד בוטים (App Check). טביעת אצבע מכשיר ואותות אינטראקציה. | reCAPTCHA Enterprise (Google): security against bots (App Check). Device fingerprint and interaction signals. |
| `privacyDoc.s6.u1.p6` | Bunny.net: CDN סרטוני הדרכה (אדמין בלבד). קבצי וידאו בלבד. ללא PII של משתמשי קצה. | Bunny.net: CDN for instructional videos (admin only). Video files only. No PII of end users. |
| `privacyDoc.s6.u1.p7` | FCM — Firebase Cloud Messaging: שליחת הודעות Push. טוקן מכשיר בלבד. ללא תוכן אישי. | FCM (Firebase Cloud Messaging): sending Push notifications. Device token only. No personal content. |
| `privacyDoc.s6.u1.p8` | Anthropic: ספק ה-AI לתכונות האימון האישי — רק כשמשתמשים בתכונות אלו (ראו 5.3). | Anthropic: the AI provider for the personal training features, only when these features are used (see 5.3). |
| `privacyDoc.s6.u2.title` | 5.3 תכונות בינה מלאכותית (AI) | 5.3 Artificial intelligence (AI) features |
| `privacyDoc.s6.u2.p1` | כשמשתמשים בתכונות AI באפליקציה (למשל הערת מאמן אישית), נשלח לספק ה-AI, Anthropic, סיכום מצומצם של נתוני האימון שלך — מטרות, רמות, אימונים אחרונים ואזור כללי (עיר או שכונה, לא מיקום מדויק) — לצורך יצירת טקסט אימון אישי בלבד. | When AI features in the app are used (for example, a personal coach note), a limited summary of your training data is sent to the AI provider, Anthropic: goals, levels, recent workouts, and a general area (a city or neighborhood, not a precise location), solely for the purpose of generating personal training text. |
| `privacyDoc.s6.u2.p2` | לא נשלחים פרטי קשר (אימייל, טלפון), שם מלא, הצהרת הבריאות או ערכים גולמיים מ-Apple HealthKit / Google Health Connect. | Contact details (email, phone), full name, the health declaration, and raw values from Apple HealthKit / Google Health Connect are not sent. |
| `privacyDoc.s6.u2.p3` | לפי התנאים המסחריים של Anthropic, מידע שנשלח אליה בשימוש עסקי אינו משמש לאימון מודלים כברירת מחדל. Anthropic עשויה לשמור אותו לתקופה מוגבלת לצורכי אבטחה ומניעת שימוש לרעה, ועיבודו עשוי להיעשות בארה"ב. | Under Anthropic’s commercial terms, information sent to it in business use is not used to train models by default. Anthropic may retain it for a limited period for security and abuse-prevention purposes, and its processing may take place in the USA. |
| `privacyDoc.s6.u2.p4` | תכונות ה-AI זמינות למשתמשים בגירים בלבד. | The AI features are available to adult users only. |
| `privacyDoc.s6.u3.title` | 5.2 שיתוף נתונים עם רשויות מקומיות ורשויות ציבוריות | 5.2 Sharing data with local authorities and public authorities |
| `privacyDoc.s6.u3.p1` | אפליקציית OUT עשויה לשתף עם רשויות מקומיות ורשויות ספורט ציבוריות שותפות נתונים סטטיסטיים אנונימיים ומצטברים בלבד — לדוגמה: עומס כללי על מתקנים ציבוריים, נפח אימונים כולל באזורים גיאוגרפיים, ושעות שיא של שימוש בפארקים. מידע זה משמש אך ורק לצורך שיפור התשתית הספורטיבית הציבורית. | The OUT app may share with partner local authorities and public sports authorities only anonymous and aggregated statistical data, for example: general load on public facilities, total workout volume in geographic areas, and peak hours of park use. This information is used solely for the purpose of improving public sports infrastructure. |
| `privacyDoc.s6.u3.p2` | נתונים אלו הינם אנונימיים לחלוטין, מצטברים ולא ניתנים לקישור לאף משתמש בודד (Non-PII Aggregated Data). אין בהם שם, מזהה, כתובת IP, מיקום מדויק, או כל פרט מזהה אחר. | This data is completely anonymous, aggregated, and cannot be linked to any individual user (Non-PII Aggregated Data). It contains no name, identifier, IP address, precise location, or any other identifying detail. |
| `privacyDoc.s6.u3.p3` | מידע מזהה אישי (PII) — לרבות שם, אימייל, תאריך לידה, פרופיל בריאות וכל נתון שניתן לקשרו למשתמש — לא ישותף, לא יועבר ולא יימכר לרשויות מקומיות, לרשויות ממשלתיות, או לכל גורם אחר. | Personally identifiable information (PII), including name, email, date of birth, health profile, and any data that can be linked to a user, will not be shared, transferred, or sold to local authorities, to government authorities, or to any other party. |
| `privacyDoc.s6.u3.p4` | נתוני בריאות גולמיים ממקורות Apple HealthKit או Google Health Connect — לרבות צעדים, קלוריות ודקות פעילות — לא ישותפו, לא יועברו ולא יימכרו לרשויות מקומיות, לצדדים שלישיים, לספקי פרסום, לחברות ביטוח, למעסיקים, או לכל גורם אחר, ללא כל יוצא מן הכלל. | Raw health data from Apple HealthKit or Google Health Connect sources, including steps, calories, and activity minutes, will not be shared, transferred, or sold to local authorities, to third parties, to advertising providers, to insurance companies, to employers, or to any other party, without any exception. |
| `privacyDoc.s7.title` | 6. אחסון מידע ומיקום שרתים | 6. Data Storage and Server Location |
| `privacyDoc.s7.p1` | כל המידע האישי נשמר באופן מאובטח בשרתי Google Cloud / Firebase. המידע מוצפן הן בהעברה (TLS 1.2+) והן באחסון (AES-256 על ידי Google Cloud KMS). | All personal information is stored securely on Google Cloud / Firebase servers. The information is encrypted both in transit (TLS 1.2+) and at rest (AES-256 by Google Cloud KMS). |
| `privacyDoc.s7.p2` | שרתי Cloud Functions ממוקמים ב-us-central1 (ארה"ב) — משמעות הדבר שנתוני המשתמשים עשויים לעבור עיבוד בארצות הברית. עיבוד זה נעשה בהתאם למדיניות הפרטיות של Google Cloud ועומד בתקני GDPR. | Cloud Functions servers are located in us-central1 (USA), which means that users’ data may be processed in the United States. This processing is carried out in accordance with Google Cloud’s privacy policy and complies with GDPR standards. |
| `privacyDoc.s7.p3` | גיבויים יומיים אוטומטיים מוצפנים ומאוחסנים בנפרד. | Automatic daily backups are encrypted and stored separately. |
| `privacyDoc.s7.p4` | ערכי דאטת הבריאות מ-HealthKit / Health Connect אינם נשמרים בשרתינו. נשמרים רק מזהי רשומות לצורך מניעת כפילות וסכומי פעילות מצטברים, באותה רמת הצפנה כשאר המידע האישי. | The values of the health data from HealthKit / Health Connect are not stored on our servers. Only record identifiers, for the purpose of preventing duplication, and accumulated activity totals are stored, at the same level of encryption as other personal information. |
| `privacyDoc.s7.p5` | הצהרות בריאות (PDF) נשמרות ב-Firebase Storage בהצפנה מלאה, גישה מוגבלת לבעלים ואדמין בלבד. | Health declarations (PDF) are stored in Firebase Storage with full encryption, with access limited to the owner and the admin only. |
| `privacyDoc.s8.title` | 7. הודעות Push | 7. Push Notifications |
| `privacyDoc.s8.p1` | האפליקציה שולחת הודעות Push לאחר קבלת הרשאה מפורשת מהמשתמש. | The app sends Push notifications after receiving express permission from the user. |
| `privacyDoc.s8.p2` | הודעות עסקיות (תזכורות, הישגים) — נשלחות בהתאם להגדרות המשתמש. | Business notifications (reminders, achievements) are sent in accordance with the user’s settings. |
| `privacyDoc.s8.p3` | הודעות שיווקיות — נשלחות אך ורק למשתמשים שנתנו הסכמה מפורשת נפרדת. | Marketing notifications are sent solely to users who have given separate express consent. |
| `privacyDoc.s8.p4` | ביטול כל ההתראות אפשרי בכל עת דרך הגדרות המכשיר או הגדרות האפליקציה. | All notifications can be disabled at any time through the device settings or the app settings. |
| `privacyDoc.s8.p5` | טוקן המכשיר (FCM Token) משמש אך ורק לשליחת הודעות ואינו משותף עם צדדים שלישיים. | The device token (FCM Token) is used solely for sending notifications and is not shared with third parties. |
| `privacyDoc.s9.title` | 8. זכויות המשתמש | 8. User Rights |
| `privacyDoc.s9.u1.title` | 8.1 עיון ותיקון | 8.1 Access and correction |
| `privacyDoc.s9.u1.p1` | המשתמש יכול לעיין ולעדכן את פרטיו האישיים בכל עת דרך הגדרות הפרופיל באפליקציה. | The user can view and update their personal details at any time through the profile settings in the app. |
| `privacyDoc.s9.u2.title` | 8.2 מחיקת חשבון | 8.2 Deleting an account |
| `privacyDoc.s9.u2.p1` | המשתמש רשאי למחוק את חשבונו ואת כל המידע האישי שלו בכל עת, ישירות מתוך האפליקציה: הגדרות ← חשבון ← מחיקת חשבון. | The user may delete their account and all of their personal information at any time, directly from within the app: Settings → Account → Delete account. |
| `privacyDoc.s9.u2.p2` | לאחר אישור, מתחיל תהליך מחיקה אוטומטי הכולל: מחיקת פרטי פרופיל, היסטוריית אימונים, נתוני מיקום, קשרים חברתיים, תמונות בריאות מאחסון ענן. | After confirmation, an automatic deletion process begins, which includes: deletion of profile details, workout history, location data, social connections, and health images from cloud storage. |
| `privacyDoc.s9.u2.p3` | פוסטים שפורסמו בפיד הקהילתי יאונונמיו (המחבר יוחלף ב"משתמש מחוק") ולא יימחקו, כדי לשמור על שלמות השיחות הקהילתיות. | Posts published in the community feed will be anonymized (the author will be replaced with “Deleted user”) and will not be deleted, in order to preserve the integrity of community conversations. |
| `privacyDoc.s9.u2.p4` | תהליך המחיקה מסתיים תוך 24 שעות. יומני ביקורת נשמרים 24 חודשים לצרכי אבטחה. | The deletion process is completed within 24 hours. Audit logs are retained for 24 months for security purposes. |
| `privacyDoc.s9.u2.p5` | שמירה לצורך הגנה משפטית (Legal Hold): בהתאם לחוק ההתיישנות הישראלי (תשי"ח-1958, תקופת התיישנות של 7 שנים), חלק מהנתונים יישמרו לאחר מחיקת החשבון לצורך הגנה משפטית בלבד. הנתונים המשמרים: שם, כתובת אימייל, היסטוריית אימונים (כולל מסלולי GPS), ביקורות בפארקים, והצהרת הבריאות (PAR-Q). נתונים אלו נשמרים בנפרד ומאובטחים, אינם נגישים למשתמש או לכל גורם שאינו מורשה, משמשים אך ורק להגנה משפטית במקרה של תביעה, ונמחקים אוטומטית בתום 7 שנים ממועד מחיקת החשבון. | Retention for legal defense (Legal Hold): in accordance with the Israeli Statute of Limitations Law (5718-1958, limitation period of 7 years), some of the data will be retained after the account is deleted, for legal defense purposes only. The data retained: name, email address, workout history (including GPS routes), park reviews, and the health declaration (PAR-Q). This data is stored separately and securely, is not accessible to the user or to any unauthorized party, is used solely for legal defense in the event of a claim, and is deleted automatically at the end of 7 years from the date the account was deleted. |
| `privacyDoc.s9.u2.p6` | לחלופין: שליחת בקשת מחיקה בכתב ל-office@appout.co.il או דרך הטופס בכתובת https://out-run-app.vercel.app/delete-data. המחיקה תבוצע תוך 15 יום. | Alternatively: sending a written deletion request to office@appout.co.il or through the form at https://out-run-app.vercel.app/delete-data. Deletion will be carried out within 15 days. |
| `privacyDoc.s9.u3.title` | 8.3 ביטול הסכמות | 8.3 Withdrawing consents |
| `privacyDoc.s9.u3.p1` | ביטול שיווק ישיר: דרך הגדרות האפליקציה ← התראות ← שיווק, או פנייה ל-office@appout.co.il. תוך 5 ימי עסקים. | Opting out of direct marketing: through the app settings → Notifications → Marketing, or by contacting office@appout.co.il. Within 5 business days. |
| `privacyDoc.s9.u3.p2` | ביטול Firebase Analytics: הגדרות ← פרטיות ← ביטול שיתוף נתונים אנונימיים. | Disabling Firebase Analytics: Settings → Privacy → Opt out of sharing anonymous data. |
| `privacyDoc.s9.u4.title` | 8.4 בקשת מחיקת נתונים מהאינטרנט | 8.4 Data deletion request from the web |
| `privacyDoc.s9.u4.p1` | משתמשים שהסירו את האפליקציה מהמכשיר יכולים לשלוח בקשת מחיקת נתונים דרך הטופס המקוון: https://out-run-app.vercel.app/delete-data | Users who have removed the app from the device can submit a data deletion request through the online form: https://out-run-app.vercel.app/delete-data |
| `privacyDoc.s9.u4.p2` | הטופס זמין לכל אחד ואינו מחייב התחברות לאפליקציה. בקשות שיתקבלו יטופלו תוך 15 יום. | The form is available to anyone and does not require logging in to the app. Requests received will be handled within 15 days. |
| `privacyDoc.s10.title` | 9. שיחות פרטיות (Chat) | 9. Private Conversations (Chat) |
| `privacyDoc.s10.p1` | הודעות בשיחות פרטיות מוצפנות בהצפנת Firebase (encryption at rest ו-in transit), אך אינן מוצפנות מקצה לקצה. | Messages in private conversations are encrypted with Firebase encryption (encryption at rest and in transit), but are not end-to-end encrypted. |
| `privacyDoc.s10.p2` | קטינים מתחת לגיל 18 אינם יכולים לנהל שיחות פרטיות עם משתמשים מחוץ לארגון שלהם. | Minors under the age of 18 cannot hold private conversations with users outside their organization. |
| `privacyDoc.s11.title` | 10. פרטיות קטינים | 10. Privacy of Minors |
| `privacyDoc.s11.p1` | האפליקציה אינה מיועדת לילדים מתחת לגיל 14. גישה נחסמת אוטומטית. | The app is not intended for children under the age of 14. Access is blocked automatically. |
| `privacyDoc.s11.p2` | קטינים בגילאי 14–17 כפופים למגבלות נוספות: טשטוש מיקום מוגבר, הפרדה ממבוגרים על המפה, הגבלת שיחות פרטיות. | Minors aged 14–17 are subject to additional restrictions: increased location blurring, separation from adults on the map, and restriction of private conversations. |
| `privacyDoc.s11.p3` | אם נודע לנו שנאסף מידע מקטין מתחת לגיל 14 ללא הסכמת הורה, נמחק את המידע לאלתר. | If we learn that information was collected from a minor under the age of 14 without parental consent, we will delete the information immediately. |
| `privacyDoc.s12.title` | 11. מדיניות שמירת נתונים | 11. Data Retention Policy |
| `privacyDoc.s12.p1` | פרטי פרופיל ואימונים: עד מחיקת חשבון, ואז מחיקה תוך 24 שעות. | Profile and workout details: until the account is deleted, and then deletion within 24 hours. |
| `privacyDoc.s12.p2` | הצהרת בריאות (PDF): עד מחיקת חשבון. | Health declaration (PDF): until the account is deleted. |
| `privacyDoc.s12.p3` | נתוני Health Connect / HealthKit: ערכי הדאטה אינם נשמרים כלל. מזהי רשומות וסכומי פעילות מצטברים נשמרים עד מחיקת חשבון, ואז נמחקים תוך 24 שעות. עם שלילת ההרשאה מפסיקה הקריאה מהמכשיר מיידית. | Health Connect / HealthKit data: the data values are not stored at all. Record identifiers and accumulated activity totals are stored until the account is deleted, and then deleted within 24 hours. Upon revocation of permission, reading from the device stops immediately. |
| `privacyDoc.s12.p4` | פוסטים בפיד: מאונונמיים לאחר מחיקת חשבון. | Posts in the feed: anonymized after the account is deleted. |
| `privacyDoc.s12.p5` | הודעות צ'אט: מאונונמיות לאחר מחיקת חשבון. | Chat messages: anonymized after the account is deleted. |
| `privacyDoc.s12.p6` | נתוני מיקום (presence): נמחקים אוטומטית תוך 24 שעות מחוסר פעילות. | Location data (presence): deleted automatically within 24 hours of inactivity. |
| `privacyDoc.s12.p7` | Active workout heartbeat: נמחק אוטומטית תוך 2 שעות מסיום אימון. | Active workout heartbeat: deleted automatically within 2 hours of the end of a workout. |
| `privacyDoc.s12.p8` | יומני ביקורת (Audit Logs): 24 חודשים (נשמרים לצרכי אבטחה גם לאחר מחיקת חשבון). | Audit Logs: 24 months (retained for security purposes even after the account is deleted). |
| `privacyDoc.s12.p9` | הודעות Push שנשלחו: נמחקות אוטומטית לאחר 90 יום. | Push notifications sent: deleted automatically after 90 days. |
| `privacyDoc.s12.p10` | ארכיב משפטי (Legal Hold): שם, כתובת אימייל, היסטוריית אימונים (כולל מסלולי GPS), ביקורות בפארקים, והצהרת בריאות — נשמרים 7 שנים ממועד מחיקת החשבון, מכוח חוק ההתיישנות הישראלי (תשי"ח-1958). נתונים אלו אינם משמשים לכל מטרה מלבד הגנה משפטית, ונמחקים אוטומטית בתום התקופה. | Legal archive (Legal Hold): name, email address, workout history (including GPS routes), park reviews, and health declaration, retained for 7 years from the date the account was deleted, by virtue of the Israeli Statute of Limitations Law (5718-1958). This data is not used for any purpose other than legal defense, and is deleted automatically at the end of the period. |
| `privacyDoc.s13.title` | 12. אבטחת מידע | 12. Information Security |
| `privacyDoc.s13.p1` | הצפנת תעבורה: TLS 1.2+ לכל התקשורת. | Encryption in transit: TLS 1.2+ for all communications. |
| `privacyDoc.s13.p2` | הצפנת אחסון: AES-256 על ידי Google Cloud KMS. | Encryption at rest: AES-256 by Google Cloud KMS. |
| `privacyDoc.s13.p3` | אימות: Firebase Authentication עם תמיכה ב-2FA. | Authentication: Firebase Authentication with 2FA support. |
| `privacyDoc.s13.p4` | בקרת גישה: Firestore Security Rules + Custom Claims JWT. | Access control: Firestore Security Rules + Custom Claims JWT. |
| `privacyDoc.s13.p5` | App Check: reCAPTcHA Enterprise (דפדפן), DeviceCheck (iOS), Play Integrity (Android). | App Check: reCAPTCHA Enterprise (browser), DeviceCheck (iOS), Play Integrity (Android). |
| `privacyDoc.s13.p6` | יומני ביקורת: כל פעולת אדמין מתועדת עם IP, timestamp ותוכן לפני/אחרי. | Audit logs: every admin action is recorded with IP, timestamp, and before/after content. |
| `privacyDoc.s13.p7` | במקרה של הפרת אבטחה מהותית, החברה תודיע למשתמשים המושפעים תוך 72 שעות. | In the event of a material security breach, the Company will notify the affected users within 72 hours. |
| `privacyDoc.s14.title` | 13. שינויים במדיניות | 13. Changes to the Policy |
| `privacyDoc.s14.p1` | שינויים מהותיים יפורסמו באפליקציה ויישלח עדכון למשתמשים רשומים לפחות 30 יום לפני כניסתם לתוקף. | Material changes will be published in the app and an update will be sent to registered users at least 30 days before they take effect. |
| `privacyDoc.s15.title` | 14. יצירת קשר | 14. Contact |
| `privacyDoc.s15.p1` | דוא"ל: office@appout.co.il | Email: office@appout.co.il |
| `privacyDoc.s15.p2` | כתובת: שדרות הר ציון 39, תל אביב | Address: 39 Har Zion Boulevard, Tel Aviv |
| `privacyDoc.s15.p3` | מדיניות זו נכנסת לתוקף ביום 1 בינואר 2026. עודכנה: אוקטובר 2026 (גרסה 2.3). © 2026 קליסטניקס בע"מ. | This policy entered into effect on 1 January 2026. Updated: October 2026 (version 2.3). © 2026 Calisthenics Ltd. |
| `modal.lastUpdated` | עדכון אחרון: {date} | Last updated: {date} |
| `modal.close` | סגור | Close |
| `footer.copyright` | © 2026 קליסטניקס בע"מ, ח.פ 516841806. כל הזכויות שמורות. | © 2026 Calisthenics Ltd., Company No. 516841806. All rights reserved. |
| `deleteData.meta.title` | מחיקת נתונים \| OUT | Data Deletion \| OUT |
| `deleteData.meta.description` | בקשת מחיקת נתונים אישיים מאפליקציית OUT — עבור משתמשים שהסירו את האפליקציה מהמכשיר. | A request to delete personal data from the OUT app, for users who have removed the app from their device. |
| `deleteData.header.title` | מחיקת נתונים אישיים | Personal data deletion |
| `deleteData.header.company` | OUT · קליסטניקס בע"מ | OUT · Calisthenics Ltd. |
| `deleteData.intro.who` | דף זה מיועד למשתמשים שהסירו את אפליקציית OUT מהמכשיר שלהם ומעוניינים לבקש מחיקה של כל הנתונים האישיים שלהם מהשרתים שלנו. | This page is intended for users who have removed the OUT app from their device and wish to request deletion of all of their personal data from our servers. |
| `deleteData.intro.inApp` | אם האפליקציה עדיין מותקנת אצלכם — תוכלו למחוק את החשבון ישירות מתוכה: <b>הגדרות ← חשבון ← מחיקת חשבון</b>. | If the app is still installed on your device, you can delete the account directly from within it: <b>Settings → Account → Delete account</b>. |
| `deleteData.cta.label` | שלחו בקשת מחיקה | Submit a deletion request |
| `deleteData.cta.button` | שלח בקשת מחיקה באימייל | Send a deletion request by email |
| `deleteData.cta.subjectNote` | הנושא "{subject}" ימולא אוטומטית | The subject “{subject}” will be filled in automatically |
| `deleteData.cta.direct` | או שלחו ישירות ל־ <link>{email}</link> | Or send directly to <link>{email}</link> |
| `deleteData.steps.title` | איך התהליך עובד | How the process works |
| `deleteData.steps.request.title` | שלחו בקשה | Submit a request |
| `deleteData.steps.request.body` | לחצו על הכפתור למטה. תיפתח אפליקציית האימייל שלכם עם הנושא והטקסט כבר מוכנים — רק צריך להוסיף את כתובת האימייל שנרשמתם איתה ולשלוח. | Press the button below. Your email app will open with the subject and text already prepared. You only need to add the email address you registered with and send it. |
| `deleteData.steps.verify.title` | אנחנו מאמתים את הבקשה | We verify the request |
| `deleteData.steps.verify.body` | נוודא שהאימייל תואם לחשבון קיים. אם יש צורך, ניצור קשר עבור פרטים נוספים לצורך אימות זהות. | We will verify that the email matches an existing account. If necessary, we will contact you for additional details for the purpose of identity verification. |
| `deleteData.steps.erase.title` | מחיקה תוך 15 יום | Deletion within 15 days |
| `deleteData.steps.erase.body` | לאחר אימות, נמחק את כל הנתונים האישיים שלכם: פרופיל, היסטוריית אימונים, נתוני מיקום, קשרים חברתיים ותמונות. תקבלו אישור בסיום. | After verification, we will delete all of your personal data: profile, workout history, location data, social connections, and images. You will receive confirmation upon completion. |
| `deleteData.steps.timeline` | בקשות מטופלות תוך 15 יום מקבלתן | Requests are handled within 15 days of receipt |
| `deleteData.deleted.title` | מה נמחק | What is deleted |
| `deleteData.deleted.profile` | פרטי פרופיל (שם, גיל, מגדר, פרטי כושר) | Profile details (name, age, gender, fitness details) |
| `deleteData.deleted.history` | היסטוריית אימונים ונתוני ריצה | Workout history and running data |
| `deleteData.deleted.location` | נתוני מיקום ומסלולים מוקלטים | Location data and recorded routes |
| `deleteData.deleted.social` | קשרים חברתיים וחברי קהילה | Social connections and community members |
| `deleteData.deleted.photos` | תמונות פרופיל ותמונות אימון | Profile pictures and workout photos |
| `deleteData.deleted.healthDeclaration` | הצהרת הבריאות (PDF) | The health declaration (PDF) |
| `deleteData.deleted.preferences` | העדפות והגדרות אישיות | Personal preferences and settings |
| `deleteData.notes.title` | לתשומת ליבכם | For your attention |
| `deleteData.notes.feedPosts` | פוסטים שפרסמתם בפיד הקהילתי יאונונמו (שמכם יוחלף ב"משתמש מחוק") כדי לשמור על שלמות השיחות. | Posts you published in the community feed will be anonymized (your name will be replaced with “Deleted user”) in order to preserve the integrity of conversations. |
| `deleteData.notes.auditLogs` | יומני ביקורת אנונימיים נשמרים עד 24 חודשים לצרכי אבטחה בלבד. | Anonymous audit logs are retained for up to 24 months for security purposes only. |
| `deleteData.notes.subscription` | אם יש לכם מנוי פרימיום פעיל — מחיקת הנתונים לא מבטלת את החיוב. יש לבטל מנוי דרך Apple App Store או Google Play לפני הגשת הבקשה. | If you have an active premium subscription, deleting the data does not cancel the billing. You must cancel the subscription through the Apple App Store or Google Play before submitting the request. |
| `deleteData.privacyLink.title` | מדיניות פרטיות מלאה | Full Privacy Policy |
| `deleteData.privacyLink.body` | לפרטים על כל הנתונים שאנחנו אוספים ואיך אנחנו מגנים עליהם | For details on all the data we collect and how we protect it |
| `deleteData.privacyLink.cta` | קראו כאן | Read here |
| `credits.meta.title` | רישיונות וקרדיטים \| OUT | Licenses and Credits \| OUT |
| `credits.meta.description` | מקורות הנתונים והרישיונות שבהם OUT משתמשת: OpenStreetMap, Mapbox ונתוני שבילי אופניים של משרד התחבורה. | The data sources and licenses used by OUT: OpenStreetMap, Mapbox, and bike path data from the Ministry of Transport. |
| `credits.backToApp` | ← חזרה לאפליקציה | ← Back to the app |
| `credits.title` | רישיונות וקרדיטים | Licenses and Credits |
| `credits.intro` | OUT נשענת על נתונים פתוחים ועל תרומתם של אנשים רבים. כאן מפורטים המקורות והרישיונות שלהם. | OUT relies on open data and on the contribution of many people. The sources and their licenses are listed here. |
| `credits.osm.title` | OpenStreetMap | OpenStreetMap |
| `credits.osm.body` | שמות שבילים, מסלולים וחלק מהנתונים על הדרכים והשבילים באפליקציה מגיעים מ-OpenStreetMap, מפה חופשית שנבנית על ידי מתנדבים. הנתונים מופצים ברישיון ODbL 1.0 (Open Database License). | Trail names, routes, and some of the data on roads and paths in the app come from OpenStreetMap, a free map built by volunteers. The data is distributed under the ODbL 1.0 license (Open Database License). |
| `credits.osm.attribution` | © OpenStreetMap contributors | (same as Hebrew, not in en file) |
| `credits.osm.copyrightLink` | זכויות יוצרים ורישיון של OpenStreetMap | OpenStreetMap copyright and license |
| `credits.osm.odblLink` | נוסח הרישיון ODbL 1.0 | The text of the ODbL 1.0 license |
| `credits.trails.title` | מאיפה מגיעים שמות השבילים | Where trail names come from |
| `credits.trails.body` | הגיאומטריה והשמות של השבילים והמסלולים המסומנים שמוצגים באפליקציה מבוססים על תרומות של מתנדבי OpenStreetMap, ברישיון ODbL 1.0. | The geometry and names of the marked trails and routes displayed in the app are based on contributions by OpenStreetMap volunteers, under the ODbL 1.0 license. |
| `credits.mapbox.title` | Mapbox | Mapbox |
| `credits.mapbox.body` | המפות באפליקציה מוצגות באמצעות Mapbox, ומשלבות נתונים מ-OpenStreetMap ומספקים נוספים. הקרדיט של Mapbox מופיע על המפה עצמה. | The maps in the app are displayed using Mapbox, and combine data from OpenStreetMap and additional providers. The Mapbox credit appears on the map itself. |
| `credits.mapbox.link` | אתר Mapbox | Mapbox website |
| `credits.mapbox.aboutLink` | קרדיטים של מפות Mapbox | Mapbox map credits |
| `credits.transport.title` | משרד התחבורה והבטיחות בדרכים | Ministry of Transport and Road Safety |
| `credits.transport.body` | נתוני שבילי אופניים מקורם במשרד התחבורה והבטיחות בדרכים, כפי שפורסמו במאגר הנתונים הממשלתי data.gov.il ברישיון Creative Commons Attribution (CC BY) או ברישיון "אחר (פתוח)", בהתאם לכל מאגר. הנתונים מוצגים עם ייחוס למקור. | Bike path data originates from the Ministry of Transport and Road Safety, as published in the government data repository data.gov.il under the Creative Commons Attribution (CC BY) license or the “Other (Open)” license, depending on each dataset. The data is displayed with attribution to the source. |
| `credits.transport.link` | data.gov.il - שבילי אופניים | data.gov.il - Bike paths |
| `credits.routeSource.osm` | מקור: OpenStreetMap | Source: OpenStreetMap |
| `credits.routeSource.linkLabel` | רישיונות וקרדיטים | Licenses and credits |
| `credits.settingsLink` | רישיונות וקרדיטים | Licenses and credits |
| `help.hub.back` | חזור | Back |
| `help.hub.title` | איך משתמשים ושאלות נפוצות | How to use the app and FAQ |
| `help.hub.searchPlaceholder` | חיפוש: לו״ז, צעדים, פארק... | Search: schedule, steps, park… |
| `help.hub.searchLabel` | חיפוש בשאלות | Search the questions |
| `help.hub.chaptersTitle` | סיור באפליקציה | App tour |
| `help.hub.toursTitle` | סיורים באפליקציה | App tours |
| `help.hub.results` | תוצאות | Results |
| `help.hub.faq` | שאלות נפוצות | FAQ |
| `help.hub.noAnswer` | לא מצאנו תשובה. אפשר לשאול את קלי. | We couldn’t find an answer. You can ask Kelly. |
| `help.hub.askKelly` | לשאול את קלי | Ask Kelly |
| `help.chapter.showTour` | תראה לי | Show me |
| `help.chapter.open` | פתח | Open |
| `help.preview.label` | תצוגה לדוגמה · {name} | Sample preview · {name} |
| `help.preview.player.progress` | תרגיל 2 מתוך 5 | Exercise 2 of 5 |
| `help.preview.player.exercise` | שכיבות סמיכה | Push-ups |
| `help.preview.player.reps` | 12 חזרות | 12 reps |
| `help.preview.player.done` | סיימתי | Done |
| `help.preview.player.howTo` | איך מבצעים | How to do it |
| `help.preview.player.cue1` | כפות הידיים מתחת לכתפיים | Hands under your shoulders |
| `help.preview.player.cue2` | הגוף בקו ישר מהראש לעקבים | Body in a straight line from head to heels |
| `help.preview.player.cue3` | יורדים לאט ודוחפים חזרה | Lower slowly and push back up |
| `help.preview.route.stop` | גינת הכושר | Outdoor gym |
| `help.preview.route.title` | מסלול בפארק · 3.2 ק״מ | Park route · 3.2 km |
| `help.preview.route.meta` | כ־35 דקות · 2 עצירות כוח | About 35 min · 2 strength stops |
| `help.preview.route.start` | יוצאים לדרך | Start route |
| `help.preview.routePlayer.time` | זמן | Time |
| `help.preview.routePlayer.pace` | קצב | Pace |
| `help.preview.station.skip` | דלג על התחנה | Skip station |
| `help.preview.station.progress` | תחנה 1 מתוך 3 | Station 1 of 3 |
| `help.preview.station.title` | גינת הכושר בפארק | Outdoor gym in the park |
| `help.preview.station.duration` | כ־8 דקות | About 8 min |
| `help.preview.station.pullUp` | מתח | Pull-Ups |
| `help.preview.station.plank` | פלאנק | Plank |
| `help.preview.station.dips` | מקבילים | Dips |
| `help.preview.station.reps` | חזרות | Reps |
| `help.preview.station.time` | זמן | Time |
| `help.preview.station.start` | מתחילים | Start |
| `help.chapter.map.title` | מפה ופארקים | Map and parks |
| `help.chapter.map.blurb` | חיפוש פארק, שכבות המפה ומה רואים בפארק | Searching for a park, the map layers, and what you see in a park |
| `help.chapter.workouts.title` | אימונים | Workouts |
| `help.chapter.workouts.blurb` | האימון של היום, בניית אימון לבד ומיקום האימון | Today’s workout, building your own workout, and where you train |
| `help.chapter.schedule.title` | בונה הלו״ז | Schedule builder |
| `help.chapter.schedule.blurb` | הלו״ז השבועי, הזזת אימון ובניית שבוע | Your weekly schedule, moving a workout, and building a week |
| `help.chapter.running.title` | ריצה והליכה | Running and walking |
| `help.chapter.running.blurb` | ריצה והליכה חופשית, מסלולים ותוכנית ריצה | Free running and walking, routes, and the running plan |
| `help.chapter.kelly.title` | קלי | Kelly |
| `help.chapter.kelly.blurb` | מה קלי יודע לעשות ואיך מדברים עם הצוות | What Kelly can do and how to talk to the team |
| `help.chapter.settings.title` | הגדרות | Settings |
| `help.chapter.settings.blurb` | התראות, צעדים, ציוד, חשבון ופרטיות | Notifications, steps, equipment, account, and privacy |

## legacy-dictionary.json (onboarding health declaration and terms title)

| Key | Hebrew | English |
|---|---|---|
| `onboarding.health.title` | הצהרת בריאות ותנאי שימוש | Health Declaration and Terms of Use |
| `onboarding.health.strictTerms` | אני מצהיר/ה כי קראתי ואני מסכימ/ה לתנאי השימוש ומדיניות הפרטיות, וכי מצבי הבריאותי מאפשר לי להשתתף בפעילות גופנית. | I declare that I have read and agree to the Terms of Use and the Privacy Policy, and that my state of health permits me to participate in physical activity. |
| `onboarding.health.disclaimer` | כל המידע שתמלא נשמר באופן פרטי ומאובטח, ומשמש רק לצורך התאמת התוכנית עבורך. | All of the information you enter is stored privately and securely, and is used solely to adapt the program for you. |
| `onboarding.health.medicalWarning` | אם התשובה לאחת השאלות תצביע על בעיה רפואית, לא תוכל להירשם לאפליקציה. | If the answer to any of the questions indicates a medical problem, you will not be able to register for the app. |
| `onboarding.health.consultDoctor` | בכל מקרה של שינוי במצב הבריאותי שלך יש להתייעץ עם רופא לגבי המשך הפעילות הגופנית שלך. | In the event of any change in your state of health, you must consult a doctor regarding the continuation of your physical activity. |
| `onboarding.health.defaultNo` | שימו לב, התשובות מסומנות ב"לא" כברירת מחדל. | Please be aware that the answers are marked “No” by default. |
| `onboarding.health.heartDisease` | האם הרופא שלך אמר לך שאת/ה סובל/ת ממחלות לב? | Has your doctor told you that you suffer from heart disease? |
| `onboarding.health.chestPainRest` | האם את/ה חש כאבים בחזה בזמן מנוחה? | Do you feel pain in your chest while at rest? |
| `onboarding.health.chestPainActivity` | האם את/ה חש כאבים בחזה במהלך פעילויות שיגרה ביום-יום? | Do you feel pain in your chest during routine daily activities? |
| `onboarding.health.approve` | מאשר.ת | I approve |
| `onboarding.terms.title` | תנאי שימוש | Terms of Use |
