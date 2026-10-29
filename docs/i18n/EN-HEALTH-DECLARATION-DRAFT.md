# English health declaration: DRAFT translation + sources

> Status: **DRAFT – legal/medical review required.** Docs only. No catalog or code changed. Companion files: [EN-HEALTH-DECLARATION-LEGAL-QUESTIONS.md](./EN-HEALTH-DECLARATION-LEGAL-QUESTIONS.md), [EN-HEALTH-DECLARATION-WIRING.md](./EN-HEALTH-DECLARATION-WIRING.md). Voice: [EN-VOICE.md](./EN-VOICE.md) (plain, calm, one idea per sentence, gender-neutral, no "please" in routine copy, no medical claims). Term: **health declaration** ([EN-GLOSSARY.md](./EN-GLOSSARY.md) #128, proposed).
> Hebrew sources: `src/features/user/onboarding/data/health-questions.ts`, `src/messages/he/onboarding.json` (`health.*`, `healthPage.*`, `healthDeclaration.*`), `HealthDeclarationStep.tsx`, `public/assets/documents/health-declaration-template.pdf`.

## 0. Three findings that change how to read this draft

1. **The 13 questions are the Israeli statutory form.** They match, almost word for word, the form attached to the Fitness Centers (Licensing and Supervision) regulations, 2015 (Sports Ministry, with Health Ministry consent). The ministry's own explanatory notes say the wording is based on Israeli scientific recommendations and on the **PAR-Q+ (Warburton et al., Health & Fitness Journal of Canada 4(2), 2011)**. So the English phrasing can follow the established PAR-Q+ phrasing, but we must **not copy** PAR-Q+ text (see section 1). Our English is a fresh translation of the Hebrew.
2. **The on-screen `LEGAL_TEXT` is not the only legal text.** The signed PDF is generated from a **static Hebrew template** (`health-declaration-template.pdf`) that has *more* clauses than the screen (two-year renewal, an extra liability clause naming "the municipality", "voluntary declaration", "you will not be able to register" instruction). Only name, date and signature are stamped onto it. An English flow needs an English PDF template too (table D below; see the wiring doc).
3. **The official Israeli form has no "responsibility rests with me alone" sentence.** Our screen text and the PDF add it. That sentence is the biggest legal-effect risk in English-speaking law (waiver). It is translated literally below and flagged; nothing stronger or weaker is invented.

## 1. Sources researched

| # | Source (URL) | What it is | Reuse terms | Informs |
|---|---|---|---|---|
| S1 | Draft regulations + explanatory notes, Fitness Centers (Licensing and Supervision) (Health Declaration and Medical Certificate) Regulations, 2015 (Knesset committee copy): https://production.oknesset.org/pipelines/data/committees/download_document_committee_session/files/87/3/0/309083.DOC ; Hebrew PDF copy: https://melonaim.org/wp-content/uploads/2023/03/הצהרת-מתאמן-במכון-כושר.pdf (fetch failed 404; listed in search) | Official Hebrew form (Part A questionnaire, Part B guidance, Part C declaration, minors' consent annex). Notes say it rests on PAR-Q+ 2011. | Israeli legislation: no copyright over statutes (Copyright Law s.6), but this is a *draft* copy; confirm the final text on Nevo/Reshumot. No official English version found. | All 13 questions (same yes/no semantics), the Part B guidance (yes = medical certificate; change in health = see a doctor), the declaration (`LEGAL_TEXT` sentences 1-2), minors. |
| S2 | CSEP, PAR-Q+ 2023 / PAR-Q+ page: https://csep.ca/forms (credit line used on copies; page itself not fetched) and journal article, 2016 PAR-Q+: https://hfjc.library.ubc.ca/index.php/HFJC/article/view/208 | The reference English screening questionnaire (heart condition, chest pain, dizziness, bone/joint, medication, "other reason"). | **Copyrighted by CSEP.** Copies state: use the entire questionnaire, no changes, credit CSEP. The 2016 article page says Creative Commons Attribution but the site footer says "All Rights Reserved" (conflict). **Do not copy.** Use only as a phrasing reference. | Q1, Q2-4 (chest pain), Q5-6 (dizziness, loss of consciousness), Q7-8 (asthma), Q11 (supervision), Q12 (other condition), Q13 (pregnancy), "consult a doctor if yes". |
| S3 | Peloton Terms of Service, s.17 and s.1: https://www.onepeloton.com/terms-of-service | Fitness subscription terms with a health affirmation (never felt chest pain in activity; not pregnant unless approved), "consult your physician", "solely at your own risk", age 18 (13 for members). | Copyrighted terms. Do not copy text; convention reference only. | Fast-track "I confirm all answers are No", yes-warning, assumption of risk, age gating. |
| S4 | Strava Terms of Service, s.2, 21, 22: https://www.strava.com/legal/terms | Athletic-activity risk acceptance and release; "not medical advice, see your physician"; 13+ (higher where required); minors need parent/guardian permission. | Copyrighted. Reference only. | `LEGAL_TEXT` sentence 3 (responsibility), privacy/terms consent, minors. |
| S5 | Fitbit Terms of Service (redirects to https://support.google.com/product-documentation/answer/14816019), s.2, 10, 11 | "Not intended to diagnose, treat, cure or prevent any disease"; consult doctor if medical/heart condition; "voluntarily and at your own risk"; 13+ with parental consent. | Copyrighted. Reference only. | Safety sheet, yes-warning, "voluntary" phrasing. |
| S6 | NHS, physical activity guidelines for adults: https://www.nhs.uk/live-well/exercise/exercise-guidelines/physical-activity-guidelines-for-adults-aged-19-to-64/ | Public-health advice: "Speak to your GP first if you have not exercised for some time, or if you have medical conditions or concerns." | © Crown copyright; licence not stated on the page (check OGL before quoting). Paraphrase only. | Calm "talk to your doctor" register for warning/blocked/safety copy. |
| S7 | ACSM pre-participation screening (2015 revision; summaries): https://www.acsm.org/blog-detail/acsm-certified-blog/2018/02/01/exercise-preparticipation-screening-removing-barriers-initiating-exercise ; https://www.acefitness.org/continuing-education/certified/february-2018/6898/new-preparticipation-guidelines-remove-barriers-to-exercise | US clinical screening algorithm (activity level, known disease, symptoms, intensity) instead of a yes/no questionnaire. | Copyrighted guidelines; concepts only. | Background only. Our flow is a PAR-Q-style yes/no screen, not the ACSM algorithm. Do not claim ACSM compliance. |
| S8 | UK pre-exercise questionnaire examples (UK leisure centres): https://hordercentre.co.uk/wp-content/uploads/hh-pre-exercise-class-screening-questionnaire-v10_fillable-2.pdf ; https://www.pickaquoy.co.uk/media/1236/pre-exercise-questionnaire-and-consent-form.pdf | Typical UK consent wording: confirm answers are accurate, agree to tell the provider of changes, "a yes means check with a doctor first". | Each is the issuer's copyright; reference only. | "I confirm my answers are accurate" register for `legalText` s.2, yes = check with doctor. |
| S9 | Jerusalem Post, 30 Jul 2015, Knesset drops doctor's note for gyms: https://www.pressreader.com/israel/jerusalem-post/20150730/281728383223691 | Press background (declaration replaces doctor's letter; text derived from a Canadian form; critics). | News copyright; background only. | Why a "yes" must stop/escalate in Israel (certificate needed). |
| S10 | Release/waiver examples (US): https://dxpprod.nsca.com/contentassets/997431c2133b46beb2ae053af809692c/release_of_liability_agreement.pdf | Typical English waiver language ("assumes the risk of...", "consult your physician"). | Issuer copyright; reference only. | Shows the *convention* that waivers are separate, explicit and itemised, unlike our one sentence. |

**Not found (searched Hebrew and English):** any official or widely used English translation of the Israeli health declaration or of the Israeli Fitness Instructors' declaration. Searched: Sports Ministry / Health Ministry, Knesset, Nevo-style summaries. **Not verified:** Nike Training Club's own terms (the nike.com pages fetched returned 404 or navigation only; no claim made about them), UK Active / Exercise Right templates (no public template reached), Sport England (no relevant page).

## 2. Conventions used in the draft

- Gender: every Hebrew `{gender, select, ...}` collapses to one English string (EN-VOICE section 4). Hebrew slash forms (`את/ה`) disappear.
- Yes/no semantics are unchanged: **Yes = a risk answer.** Any Yes blocks signing (Hebrew `hasMedicalIssue`). The inline warning on a Yes and the bottom "cannot continue" banner both stay.
- Question numbers are baked into the Hebrew strings ("1. ..."). Draft keeps them in the string to match behaviour; recommendation: render numbers in code.
- Straight quotes in the catalog; "Yes"/"No" buttons capitalised.

## 3. Tables

Legend for Sources column: S1..S10 above. "Status" for every row: **DRAFT – legal/medical review required.**

### A. The 13 questions (`healthDeclaration.q.*`, stored by id, answer boolean, Yes = true)

| Key / id | Hebrew | DRAFT English | Notes (meaning / risk) | Sources |
|---|---|---|---|---|
| q.heart_disease (1) | 1. האם הרופא שלך אמר לך שאת/ה סובל/ת ממחלות לב? | 1. Has your doctor told you that you have a heart condition? | Hebrew has no "ever"; neither has the official form, so none is added. PAR-Q+ asks "heart condition or high blood pressure"; ours is heart only, so do not add blood pressure. | S1, S2 |
| q.chest_pain_rest (2) | 2. האם את/ה חש כאבים בחזה בזמן מנוחה? | 2. Do you feel pain in your chest when you are resting? | Present tense, same as Hebrew. | S1, S2 |
| q.chest_pain_daily (3) | 3. ... בזמן פעילויות שיגרה ביום-יום? | 3. Do you feel pain in your chest during your normal daily activities? | | S1, S2 |
| q.chest_pain_activity (4) | 4. ... בזמן שאת/ה מבצע פעילות גופנית? | 4. Do you feel pain in your chest when you do physical activity? | | S1, S2 |
| q.dizziness (5) | 5. האם במהלך השנה החולפת איבדת שיווי משקל עקב סחרחורת? | 5. In the past year, have you lost your balance because of dizziness? | The official form adds "answer No if the dizziness was caused by over-breathing (including during vigorous exercise)". **Our Hebrew omits it**, so the English omits it too. RECOMMENDATION for medical review: decide whether to add it (it reduces false blocks). | S1, S2 |
| q.fainting (6) | 6. ... איבדת את הכרתך? | 6. In the past year, have you lost consciousness? | "Fainted" is more common but "lost consciousness" mirrors Hebrew and PAR-Q+. | S1, S2 |
| q.asthma_meds (7) | 7. האם רופא אבחן שאת/ה סובל/ת ממחלת האסתמה ולכן בשלושת החודשים האחרונים נזקקת לטיפול תרופתי? | 7. Has a doctor diagnosed you with asthma and, because of it, have you needed medication in the past three months? | Two conditions joined by "and": both must be true for Yes. Hebrew "ולכן" = causal; kept. | S1 |
| q.asthma_symptoms (8) | 8. ... סבלת מקוצר נשימה או צפצופים? | 8. Has a doctor diagnosed you with asthma and, because of it, have you had shortness of breath or wheezing in the past three months? | Same structure as 7. | S1 |
| q.family_heart (9) | 9. האם אחד מבני משפחתך מדרגת קרבה ראשונה נפטר ממחלת לב? | 9. Has a first-degree relative (parent, sibling or child) died of a heart condition? | Hebrew has no parenthetical. **Parenthetical is an addition** for English readers (term "first-degree relative" is standard in English medicine). Remove if medical reviewer prefers the bare term. | S1 |
| q.family_sudden (10) | 10. ... נפטר ממות פתאומי בגיל מוקדם? (לפני גיל 55 לגבר, 65 לאישה) | 10. Has a first-degree relative died suddenly at a young age? (Before age 55 for a male relative, before age 65 for a female relative.) | The Hebrew age rule refers to the **relative's** sex (official form: "if it is a man ... if it is a woman"). Draft makes that explicit; a reader could otherwise think it is about the user. Flag for medical review. | S1 |
| q.doctor_supervision (11) | 11. האם הרופא שלך אמר לך ב-5 השנים האחרונות לבצע פעילות גופנית רק תחת השגחה רפואית? | 11. In the past five years, has your doctor told you to do physical activity only under medical supervision? | PAR-Q (older) phrases this "only do physical activity recommended by a doctor"; ours is stricter ("under supervision"). Keep ours. | S1, S2 |
| q.chronic_disease (12) | 12. האם הינך סובל ממחלה קבועה (כרונית) שאינה נזכרת בשאלות לעיל ועשויה למנוע או להגביל אותך בביצוע פעילות גופנית? | 12. Do you have a long-term (chronic) condition that is not mentioned above and that could prevent or limit you from doing physical activity? | "Disease" -> "condition" (plain, standard); Hebrew says "disease". Medical review: keep "condition". | S1, S2 (PAR-Q+ "other reason") |
| q.pregnancy (13) | 13. לנשים בהריון: האם ההריון הזה או כל הריון קודם הוגדר הריון בסיכון? | 13. If you are pregnant: has this pregnancy, or any earlier pregnancy, been described as high-risk? | "For women who are pregnant" replaced by "If you are pregnant" (gender-neutral, same behaviour). Everyone still answers (default No). "Described as" mirrors "הוגדר". Medical review: "high-risk" is the standard English term. | S1, S3 |

### B. Legal text on the signature screen (`healthDeclaration.legalText`, shown above the pad)

The Hebrew is one string with three sentences. Row split for review only; code treats it as one string.

| Key | Hebrew | DRAFT English | Notes (meaning / legal-effect risk) | Sources |
|---|---|---|---|---|
| legalText s.1 | אני מצהיר/ה כי קראתי והבנתי את כל השאלון הרפואי וכל התשובות לשאלות בטופס זה הן שליליות. | I declare that I have read and understood the whole medical questionnaire, and that all my answers on this form are "No". | "Negative" -> "No" so it matches the buttons. "Declare" is the closest to מצהיר; in English-speaking law a plain "declare" is a statement, **not** a statutory declaration or sworn statement (no "under penalty"). Hebrew has no penalty wording either; do not add. | S1, S8 |
| legalText s.2 | אני מצהיר/ה כי מסרתי ידיעות מלאות ונכונות על מצבי הרפואי. | I declare that I have given complete and accurate information about my medical condition. | The official form adds "in the past and present". Our Hebrew omits it. Kept omitted. Misstatement consequences (voiding cover, termination) are not in the Hebrew; do not add. | S1, S3, S8 |
| legalText s.3 | ידוע לי כי האחריות לכל פגיעה ו/או נזק למצבי הבריאותי ככל שתהא בעת הפעילות תחול עלי בלבד. | I understand that I alone am responsible for any injury or harm to my health, of any kind, that happens during the activity. | **HIGH RISK.** Not in the official Israeli form. A one-sentence blanket waiver. In UK/EU/Canada/Australia, exclusions for personal injury caused by negligence are limited or void (consumer-protection law; UK: death/personal injury from negligence cannot be excluded). In many US states it needs to be conspicuous and specific. "And/or" -> "or". Draft does **not** extend it to OUT, operators, municipalities (the PDF template does; see D). Decide with lawyer whether to keep, narrow, or replace with the conventional assumption-of-risk wording. | S3, S4, S5, S10 |

### C. `health.*` UI strings (29 keys) and related

| Key | Hebrew | DRAFT English | Notes | Sources |
|---|---|---|---|---|
| health.title | הצהרת בריאות | Health declaration | Glossary #128 (proposed). | S1 |
| health.description | חשוב לנו לשמור על הבריאות שלך. אנא אשר/י את ההצהרה הבאה כדי להמשיך. | Your health matters to us. Confirm the declaration below to continue. | No "please" (voice). Hebrew "אנא" dropped per EN-VOICE section 3. Key appears unused in code (grep); verify before translating. | S6 |
| health.intro.sentence | {gender...} רגע לפני שיוצאים לדרך, חשוב לנו לוודא שאנחנו שומרות/שומרים עליך ב100%. | Before we start, we want to make sure we look after you 100%. | One string, no gender. "100%" is hype-adjacent and an implied promise of safety: **recommend** "Before we start, we want to make sure you're safe." Flagged for voice/legal. Use the calmer variant if the owner agrees. | S6 |
| health.intro.name | {name}, | {name}, | Unchanged. | - |
| health.intro.sub | נשאר לנו רק לעבור על שאלון הבריאות הקצר ולחתום למטה. | All that's left is a short health questionnaire and your signature below. | | - |
| health.privacyInfo | מידע על פרטיות ובטיחות | Privacy and safety info | Opens the safety sheet. | - |
| health.fastTrack.cta | אני מצהיר/ה שכל התשובות הן "לא" | I declare that all my answers are "No" | **HIGH RISK.** One tap sets all 13 answers to No and counts as a declaration. Same legal weight as the signature section; see note below. | S3 |
| health.fastTrack.note | <b>שימו לב:</b> לחיצה על כפתור זה מצהירה שאתם בריאים ולא סובלים מאף אחת מהבעיות הרפואיות המפורטות בשאלון. אם יש לכם ספק, אנא ענו על כל שאלה בנפרד. | <b>Note:</b> Tapping this button declares that you are healthy and have none of the medical problems listed in the questionnaire. If you are not sure, answer each question separately. | "Healthy" is broader than the questions (a medical-claim risk: the Hebrew also says "בריאים"). Safer: "declares that none of the medical problems listed in the questionnaire apply to you". **Recommend** that wording. Plural "you" in Hebrew; English singular. | S3, S8 |
| health.answer.no | לא | No | | - |
| health.answer.yes | כן | Yes | | - |
| health.answer.yesWarning | שים/י לב: עקב תשובתך, מומלץ להתייעץ עם רופא לפני תחילת פעילות גופנית. | Note: because of your answer, we recommend talking to a doctor before you start any physical activity. | "Consult a physician" is the market-standard phrase (Peloton, Fitbit); "talk to" is plainer (voice). Same meaning. "We recommend" is soft; Hebrew is impersonal "מומלץ". | S2, S3, S5, S6 |
| health.signature.title | הצהרת בריאות ואישור תוכנית 📋 | Health declaration and plan approval 📋 | Emoji kept (Hebrew has it); voice doc discourages emoji in legal screens, flag. "Approval" = user confirms so the plan can be issued. | - |
| health.signature.subtitle | אנא קרא/י ואשר/י את הצהרת הבריאות כדי שנוכל להנפיק את התוכנית | Read and confirm the health declaration so we can create your plan. | "להנפיק" (issue) -> "create". | - |
| health.signature.placeholder | חתום/י כאן עם האצבע | Sign here with your finger | | - |
| health.signature.clear | ניקוי חתימה | Clear signature | | - |
| health.signature.received | ✓ החתימה התקבלה | ✓ Signature received | | - |
| health.signature.missing | יש לחתום בתיבה למעלה | Sign in the box above | | - |
| health.terms | אני מצהיר/ה כי כל הנתונים נכונים ומסכים/ה ל<terms>תנאי השימוש</terms>ול<privacy>מדיניות הפרטיות</privacy> | I declare that all the information is correct, and I agree to the <terms>Terms of Use</terms> and the <privacy>Privacy Policy</privacy> | **HIGH RISK (data consent).** One checkbox joins truth-declaration, terms and privacy. In GDPR/UK-GDPR, health data is special-category and needs **explicit, separate, specific** consent; a bundled checkbox is normally insufficient. See RECOMMENDATIONS. Draft translates the Hebrew only. Also: the linked legal documents have **no English version yet** (`src/messages/en/legal.json` is empty). | S1, S4 |
| health.blocked | עקב תשובותיך, לא ניתן להמשיך בתהליך ההרשמה. מומלץ להתייעץ עם רופא ומאמן מקצועי לפני תחילת פעילות גופנית. | Because of your answers, you can't continue with sign-up. We recommend talking to a doctor and a qualified trainer before you start any physical activity. | **HIGH RISK (behaviour).** Same stop as Hebrew: any Yes blocks registration. Official Israeli form instead allows continuing **with a doctor's certificate**; the app has no such path. English market expectation: usually a "see a doctor, then continue" path rather than a hard stop. Not changed; flagged. "Professional trainer" -> "qualified trainer" (common English); `מאמן מקצועי` literally "professional trainer": reviewer to choose. | S1, S3, S9 |
| health.submitting | מכין מסמך חתום... | Preparing your signed document... | | - |
| health.cta.blocked | לא ניתן להמשיך | Can't continue | | - |
| health.cta.submit | אישור והמשך | Confirm and continue | | - |
| health.progress | {answered}/{total} שאלות נענו | {answered} of {total} questions answered | Plural fine for total=13. | - |
| health.hint.sign | נא לחתום בתיבת החתימה למעלה כדי להמשיך | Sign in the box above to continue | "נא" (please) dropped. | - |
| health.hint.terms | נא לאשר את תנאי השימוש ומדיניות הפרטיות | Accept the Terms of Use and Privacy Policy | | - |
| health.safety.title | פרטיות ובטיחות | Privacy and safety | | - |
| health.safety.private | כל המידע שתמלא נשמר באופן פרטי ומאובטח, ומשמש רק לצורך התאמת התוכנית האישית עבורך. | The information you enter is stored privately and securely, and is used only to personalize your plan. | **HIGH RISK (claim).** "Securely" and "only" are commitments about security and purpose limitation; in English markets they are treated as representations (consumer-protection, privacy law). Keep only if the privacy policy backs them. Recommend lawyer check; no weaker or stronger text invented. | S4, S5 |
| health.safety.medical | אם התשובה לאחת השאלות תצביע על בעיה רפואית, מומלץ להתייעץ עם רופא לפני תחילת פעילות גופנית. | If any answer points to a medical problem, we recommend talking to a doctor before you start any physical activity. | Hebrew "תצביע על בעיה רפואית": no diagnosis claimed. | S2, S5, S6 |
| health.safety.ok | הבנתי | Got it | Hebrew "I understood". "Got it" matches the voice; neutral alternative: "OK". | - |
| healthPage.loading | טוען... | Loading... | Different screen (JIT page). | - |
| healthPage.skipFailed | לא הצלחנו לשמור את ההמשך. בדקו את החיבור ונסו שוב. | We couldn't save your progress. Check your connection and try again. | | - |
| healthPage.title | הצהרת בריאות | Health declaration | | - |
| healthPage.description | כדי להתאים לך אימון בטוח, נשמח לדעת על מצבך הרפואי | To fit a safe workout to you, we'd like to know about your medical condition. | "Safe workout" is a safety claim; **recommend** "To match workouts to you, we'd like to know about any medical conditions." | S6 |

`healthConnect.*` is the Apple Health / Health Connect step, not the declaration, and is out of scope.

### D. Signed PDF template (static Hebrew, `public/assets/documents/health-declaration-template.pdf`): English template needed

Name/date/signature are stamped onto this file; its text is **not** drawn from the catalogs. English version needs its own typeset template (LTR, Latin font; `pdf-service.ts` is RTL/Hebrew-font specific).

| Template text (Hebrew) | DRAFT English | Notes / risk |
|---|---|---|
| הצהרת בריאות | Health declaration | |
| שם: / תאריך: | Name: / Date: | Date format: ISO or "27 Oct 2026" (unambiguous). |
| הנחיות | Instructions | |
| אם התשובה לאחת השאלות תצביע על בעיה רפואית, לא תוכל להירשם לאפליקציה. | If any answer points to a medical problem, you won't be able to sign up for the app. | Contradicts the official form (certificate path). Same stop as the app. |
| בכל מקרה של שינוי במצב הבריאותי שלך יש להתייעץ עם רופא לגבי המשך הפעילות הגופנית שלך. | If your health changes, talk to a doctor about whether to continue physical activity. | Matches Part B(3) of the official form. |
| שימו לב, התשובות מסומנות ב-"לא" כברירת מחדל. | Note: answers are marked "No" by default. | Pre-printed No on every question: the PDF records "No" even for a user who never viewed the questions on the fast track. Evidence risk. |
| 13 questions with "לא" | Section A with "No" printed | Template questions are an exact copy of the Hebrew; English template must carry the English questions. |
| אני מצהיר/ה ... כל התשובות ... שליליות. ... מסרתי ידיעות מלאות ונכונות ... בעבר ובהווה | I declare that I have read and understood the whole medical questionnaire and that all my answers on this form are "No". I declare that I have given complete and accurate information about my medical condition, past and present. | Template has "past and present" that the on-screen text lacks; the two Hebrew texts already differ. |
| ידוע לי כי לאחר שנתיים מיום חתימתי על הצהרת בריאות זו יהיה עליי להמציא הצהרת בריאות חדשה. | I understand that two years after I sign this declaration I will need to provide a new one. | Copied from the official form. **No code in the app enforces re-declaration**; check. |
| ידוע לי כי האחריות לכל פגיעה ו/או נזק למצבי הבריאותי ... בעת הפעילות [text corrupted: "בא אני עוסק באת שימוש באפליקציה או במתקנים"] תחול עלי בלבד וכי לעירייה ו/או למי מטעמה לא תהא כל אחריות לפגיעה או לנזק. | I understand that I alone am responsible for any injury or harm to my health, of any kind, that happens during the activity in which I take part [garbled: "using the app or the facilities"], and that the municipality and/or anyone acting on its behalf will have no responsibility for any injury or harm. | **HIGHEST RISK.** (a) The Hebrew has a typo/garble (`בא אני עוסק באת שימוש`); the owner must supply the intended Hebrew before translation. (b) It names "the municipality", apparently a leftover from a municipal template, not OUT. (c) It is a third-party liability release; English-speaking courts read such clauses narrowly. Not translated into final text until (a) and (b) are resolved. |
| התועלת הבריאותית של פעילות גופנית סדירה ברורה / השאלון יבהיר לך באילו מקרים יש להתייעץ עם הרופא/ה. | The health benefits of regular physical activity are clear. This questionnaire will help you decide when to talk to a doctor. | Public-health statement from the official form footer; harmless, keep. |
| אני מוסר/ת הצהרה זו מרצוני החופשי לאחר שהבנתי את תוכנה והבעתי הסכמתי אליה. | I make this declaration of my own free will, after understanding what it says and agreeing to it. | Voluntariness clause; helpful for English-law consent. On-screen text lacks it. |
| חתימה: | Signature: | |

## 4. Fast-track ("all No") flow: behaviour and English notes

1. `health.fastTrack.cta` sets all 13 answers to false, marks all answered, sets `usedFastTrack = true`, scrolls to the signature (`handleFastTrack`).
2. The user still must draw a signature and tick the terms box. Fast-track alone is not a submit.
3. `usedFastTrack` is stored with the record, which is useful evidence that the user did not read each question. Keep.
4. English recommendation: the CTA label "I declare that all my answers are "No"" makes the declaration explicit before the user has seen any question. Alternatives for the lawyer: "All answers are No" (neutral action) with the declaration sentence only in the signature block.

## 5. Gender note

Hebrew uses gendered forms for the **user** (slash forms, `{gender, select}`). English needs none. The only other gender dependency is Q10, where gender refers to the **relative** (kept explicit) and Q13 ("women who are pregnant", now "If you are pregnant").

## 6. RECOMMENDATIONS (conventional in English-speaking markets; NOT added to the declaration text)

1. **Age confirmation** (e.g. "I am 18 or older / of legal age") before the declaration. Peloton, Strava and Fitbit all gate by age; Israeli rules require a parent's written consent under 18 (S1 annex). Today the Hebrew flow has none inside this step; check onboarding for an earlier age gate.
2. **Separate, explicit consent to process health data** (privacy policy) as its own checkbox, not bundled with "terms"; plus a link to an English privacy policy.
3. **"Consult a physician" notice** shown once, plainly, near the questions (not only in the Yes warning), in the style of S3/S5.
4. **A continue path after a Yes** ("a doctor has approved") instead of a hard stop; this is the Israeli statutory path (certificate) and the Peloton path (B).
5. **Itemised assumption of risk**, separate from the truth declaration, if the lawyer wants one (S4, S10), and a decision about who is released (OUT, authority operators).
6. **Record the language and version of the text shown** (wiring doc).
7. **"Not medical advice"** statement (S4, S5) in the safety sheet.
8. **Renewal period** (two years in the official form): decide if the app enforces it.
9. Avoid "healthy" and "safe" and "100%" claims in marketing-tone intro copy.

## 7. Review order

1. Owner: confirm scope (screen text vs PDF), decide the continue-after-Yes behaviour and the garbled PDF clause. 2. Lawyer: legal-questions file. 3. Medical reviewer: Q5, Q9, Q10, Q12 wording and the yes-warning. 4. Voice pass (EN-VOICE). 5. Then the wiring doc's code work.
