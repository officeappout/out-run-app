/**
 * Namespace `legal` (i18n wave 2, app pages): every Hebrew key returns exactly what the page rendered
 * before the extraction. The `old` side is the original literal copied verbatim from origin/main
 * (src/app/{accessibility,privacy,delete-data}/page.tsx); multi-line JSX text is written as React
 * rendered it (lines trimmed, joined by one space; `&quot;` → `"`).
 *
 * Counted PER PREFIX (later batches may add keys to the same namespace file).
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/legal.json';
import { legal } from '@/messages/ns/legal';
import { makeT } from '../t';

type Key = keyof typeof he;
const t = makeT('he', legal);
const keysWith = (prefix: string) => (Object.keys(he) as Key[]).filter((k) => k.startsWith(prefix));
/** t.rich with every tag rendered as `<tag>…</tag>` text, so the plain sentence can be compared. */
const richText = (key: Key, values: Record<string, unknown> = {}, tags: string[] = []) => {
  const fns = Object.fromEntries(tags.map((tag) => [tag, (chunks: unknown[]) => `<${tag}>${chunks.join('')}</${tag}>`]));
  return t.rich<string>(key, { ...values, ...fns }).join('');
};

const LEGAL_LAST_UPDATED_HE = 'אוקטובר 2026';
const LEGAL_VERSION = '2.4';

describe('legal · accessibility statement (he)', () => {
  const cases: Array<[Key, string]> = [
    ['accessibility.meta.title', 'הצהרת נגישות | OUT'],
    ['accessibility.meta.description', 'הצהרת הנגישות של OUT — סטטוס ההתאמה לתקן ישראלי ת"י 5568 / WCAG 2.x ברמה AA, פרטי רכז הנגישות ואמצעי פנייה.'],
    ['accessibility.backToApp', '← חזרה לאפליקציה'],
    ['accessibility.title', 'הצהרת נגישות'],
    ['accessibility.commitment.title', 'המחויבות שלנו'],
    ['accessibility.commitment.body', 'ב-OUT אנחנו מאמינים שאימון בחוץ צריך להיות נגיש לכולם. אנחנו פועלים להנגשת האפליקציה ואתר OUT לאנשים עם מוגבלות, כחלק מהמחויבות שלנו לבריאות נגישה לכל אחד ואחת.'],
    ['accessibility.standard.title', 'התקן והסטטוס הנוכחי'],
    ['accessibility.standard.body', 'אנחנו מתאימים את השירות לתקן הישראלי ת"י 5568 (המבוסס על WCAG 2.x) ברמה AA, בהתאם לתקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות).'],
    ['accessibility.standard.toolbar', 'בנוסף, סרגל נגישות של צד שלישי (UserWay) זמין להפעלה בהגדרות האפליקציה, תחת "הפעלת סרגל נגישות". הסרגל כבוי כברירת מחדל ואינו נטען עד שתפעילו אותו. הוא כלי עזר משלים ואינו מחליף את ההתאמות שאנחנו מבצעים בקוד.'],
    ['accessibility.done.title', 'מה כבר הותאם'],
    ['accessibility.done.iconButtons', 'כפתורים המסומנים באייקון בלבד קיבלו שם נגיש לקוראי מסך.'],
    ['accessibility.done.contrast', 'צבעי טקסט ואייקונים בגוון הכחול של המותג הוכהו כדי לעמוד ביחס ניגודיות של 4.5:1 לפחות.'],
    ['accessibility.done.intervalLabel', 'תווית האינטרוולים במסך האימון הוצגה על רקע אטום כך שהניגודיות אינה תלויה בתוכן שמאחוריה.'],
    ['accessibility.contact.title', 'רכז הנגישות ופנייה אלינו'],
    ['accessibility.contact.intro', 'נתקלתם בקושי, או צריכים את המידע בדרך אחרת? נשמח לשמוע ולטפל בפנייה.'],
    ['accessibility.contact.coordinatorLabel', 'רכז נגישות:'],
    ['accessibility.contact.emailLabel', 'דוא"ל:'],
    ['accessibility.contact.phoneLabel', 'טלפון:'],
    ['accessibility.contact.tips', 'בפנייה מומלץ לציין את המסך או הפעולה, את המכשיר או הדפדפן, ואת טכנולוגיית העזר שבה השתמשתם (אם יש). נשתדל להשיב בהקדם האפשרי.'],
    ['accessibility.footer', '© 2026 קליסטניקס בע"מ, ח.פ 516841806.'],
  ];
  const special: Key[] = ['accessibility.lastUpdated', 'accessibility.standard.status'];

  it('every accessibility.* key is covered', () => {
    expect([...cases.map(([k]) => k), ...special].sort()).toEqual(keysWith('accessibility.').sort());
  });
  it('plain strings', () => {
    for (const [key, old] of cases) expect(t(key)).toBe(old);
  });
  it('values and markup', () => {
    const ACCESSIBILITY_LAST_UPDATED_HE = '12 באוקטובר 2026';
    expect(t('accessibility.lastUpdated', { date: ACCESSIBILITY_LAST_UPDATED_HE })).toBe(`עודכן לאחרונה: ${ACCESSIBILITY_LAST_UPDATED_HE}`);
    expect(richText('accessibility.standard.status', {}, ['b'])).toBe(
      '<b>סטטוס: בתהליך התאמה.</b> השירות עדיין אינו עומד במלואו בדרישות התקן. אנחנו בודקים את המסכים באופן שיטתי, מתקנים ליקויים לפי סדר חשיבות, ומעדכנים הצהרה זו ככל שההתאמה מתקדמת. עד להשלמתה ייתכן שחלק מהמסכים והרכיבים עדיין אינם נגישים במלואם.',
    );
  });
});

describe('legal · privacy policy page chrome (he)', () => {
  const cases: Array<[Key, string]> = [
    ['privacy.meta.title', 'מדיניות פרטיות | OUT'],
    ['privacy.meta.description', 'מדיניות הפרטיות של OUT — כיצד אנו אוספים, משתמשים ומגנים על המידע שלך, כולל נתוני Apple HealthKit ו-Google Health Connect.'],
    ['privacy.commitments.badge', 'התחייבויות מוחלטות'],
    ['privacy.health.badge', 'עומד בדרישות Google Play Health Connect ו-Apple HealthKit'],
  ];
  const special: Key[] = ['privacy.version', 'privacy.footer.effective'];

  it('every privacy.* key is covered', () => {
    expect([...cases.map(([k]) => k), ...special].sort()).toEqual(keysWith('privacy.').sort());
  });
  it('plain strings', () => {
    for (const [key, old] of cases) expect(t(key)).toBe(old);
  });
  it('values', () => {
    expect(t('privacy.version', { version: LEGAL_VERSION, date: LEGAL_LAST_UPDATED_HE })).toBe(
      `גרסה ${LEGAL_VERSION} · עודכן: ${LEGAL_LAST_UPDATED_HE}`,
    );
    expect(t('privacy.footer.effective', { date: LEGAL_LAST_UPDATED_HE })).toBe(
      `מדיניות זו נכנסה לתוקף ב-1 בינואר 2026 · עודכנה: ${LEGAL_LAST_UPDATED_HE}`,
    );
  });
});

describe('legal · shared footer (he)', () => {
  it('footer.* keys', () => {
    expect(keysWith('footer.')).toEqual(['footer.copyright']);
    expect(t('footer.copyright')).toBe('© 2026 קליסטניקס בע"מ, ח.פ 516841806. כל הזכויות שמורות.');
  });
});

describe('legal · delete data (he)', () => {
  const cases: Array<[Key, string]> = [
    ['deleteData.meta.title', 'מחיקת נתונים | OUT'],
    ['deleteData.meta.description', 'בקשת מחיקת נתונים אישיים מאפליקציית OUT — עבור משתמשים שהסירו את האפליקציה מהמכשיר.'],
    ['deleteData.header.title', 'מחיקת נתונים אישיים'],
    ['deleteData.header.company', 'OUT · קליסטניקס בע"מ'],
    ['deleteData.intro.who', 'דף זה מיועד למשתמשים שהסירו את אפליקציית OUT מהמכשיר שלהם ומעוניינים לבקש מחיקה של כל הנתונים האישיים שלהם מהשרתים שלנו.'],
    ['deleteData.cta.label', 'שלחו בקשת מחיקה'],
    ['deleteData.cta.button', 'שלח בקשת מחיקה באימייל'],
    ['deleteData.steps.title', 'איך התהליך עובד'],
    ['deleteData.steps.request.title', 'שלחו בקשה'],
    ['deleteData.steps.request.body', 'לחצו על הכפתור למטה. תיפתח אפליקציית האימייל שלכם עם הנושא והטקסט כבר מוכנים — רק צריך להוסיף את כתובת האימייל שנרשמתם איתה ולשלוח.'],
    ['deleteData.steps.verify.title', 'אנחנו מאמתים את הבקשה'],
    ['deleteData.steps.verify.body', 'נוודא שהאימייל תואם לחשבון קיים. אם יש צורך, ניצור קשר עבור פרטים נוספים לצורך אימות זהות.'],
    ['deleteData.steps.erase.title', 'מחיקה תוך 15 יום'],
    ['deleteData.steps.erase.body', 'לאחר אימות, נמחק את כל הנתונים האישיים שלכם: פרופיל, היסטוריית אימונים, נתוני מיקום, קשרים חברתיים ותמונות. תקבלו אישור בסיום.'],
    ['deleteData.steps.timeline', 'בקשות מטופלות תוך 15 יום מקבלתן'],
    ['deleteData.deleted.title', 'מה נמחק'],
    ['deleteData.deleted.profile', 'פרטי פרופיל (שם, גיל, מגדר, פרטי כושר)'],
    ['deleteData.deleted.history', 'היסטוריית אימונים ונתוני ריצה'],
    ['deleteData.deleted.location', 'נתוני מיקום ומסלולים מוקלטים'],
    ['deleteData.deleted.social', 'קשרים חברתיים וחברי קהילה'],
    ['deleteData.deleted.photos', 'תמונות פרופיל ותמונות אימון'],
    ['deleteData.deleted.healthDeclaration', 'הצהרת הבריאות (PDF)'],
    ['deleteData.deleted.preferences', 'העדפות והגדרות אישיות'],
    ['deleteData.notes.title', 'לתשומת ליבכם'],
    ['deleteData.notes.feedPosts', 'פוסטים שפרסמתם בפיד הקהילתי יאונונמו (שמכם יוחלף ב"משתמש מחוק") כדי לשמור על שלמות השיחות.'],
    ['deleteData.notes.auditLogs', 'יומני ביקורת אנונימיים נשמרים עד 24 חודשים לצרכי אבטחה בלבד.'],
    ['deleteData.notes.subscription', 'אם יש לכם מנוי פרימיום פעיל — מחיקת הנתונים לא מבטלת את החיוב. יש לבטל מנוי דרך Apple App Store או Google Play לפני הגשת הבקשה.'],
    ['deleteData.privacyLink.title', 'מדיניות פרטיות מלאה'],
    ['deleteData.privacyLink.body', 'לפרטים על כל הנתונים שאנחנו אוספים ואיך אנחנו מגנים עליהם'],
    ['deleteData.privacyLink.cta', 'קראו כאן'],
  ];
  const special: Key[] = ['deleteData.intro.inApp', 'deleteData.cta.subjectNote', 'deleteData.cta.direct'];

  it('every deleteData.* key is covered', () => {
    expect([...cases.map(([k]) => k), ...special].sort()).toEqual(keysWith('deleteData.').sort());
  });
  it('plain strings', () => {
    for (const [key, old] of cases) expect(t(key)).toBe(old);
  });
  it('values and markup', () => {
    const SUBJECT = 'בקשת מחיקת נתונים';
    const EMAIL = 'office@appout.co.il';
    expect(t('deleteData.cta.subjectNote', { subject: SUBJECT })).toBe(`הנושא "${SUBJECT}" ימולא אוטומטית`);
    expect(richText('deleteData.intro.inApp', {}, ['b'])).toBe(
      'אם האפליקציה עדיין מותקנת אצלכם — תוכלו למחוק את החשבון ישירות מתוכה: <b>הגדרות ← חשבון ← מחיקת חשבון</b>.',
    );
    expect(richText('deleteData.cta.direct', { email: EMAIL }, ['link'])).toBe(`או שלחו ישירות ל־ <link>${EMAIL}</link>`);
  });
});
