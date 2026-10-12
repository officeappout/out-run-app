import React from 'react';

export const metadata = {
  title: 'הצהרת נגישות | OUT',
  description:
    'הצהרת הנגישות של OUT — סטטוס ההתאמה לתקן ישראלי ת"י 5568 / WCAG 2.x ברמה AA, פרטי רכז הנגישות ואמצעי פנייה.',
};

/** Bump on every material change to the statement or to the real conformance status. */
const ACCESSIBILITY_LAST_UPDATED_HE = '12 באוקטובר 2026';

const COORDINATOR = {
  name: 'דוד מובשוביץ',
  role: 'רכז נגישות',
  email: 'david@appout.co.il',
  phone: '054-935-8118',
  phoneHref: 'tel:+972549358118',
} as const;

const SECTION = 'rounded-2xl border border-slate-200 bg-white shadow-sm px-5 py-5';
const H2 = 'text-base font-black text-slate-900 mb-2';
const P = 'text-sm text-slate-700 leading-relaxed';
const LINK =
  'font-semibold text-[#007EA8] underline underline-offset-2 hover:text-[#006E96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007EA8] rounded-sm';

export default function AccessibilityStatementPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white" dir="rtl" lang="he">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 pb-20">
        <a href="/home" className={`${LINK} inline-block mb-4 text-sm`}>
          ← חזרה לאפליקציה
        </a>
        <header className="mb-6">
          <h1 className="text-2xl font-black text-slate-900">הצהרת נגישות</h1>
          <p className="text-xs text-slate-600 mt-1">עודכן לאחרונה: {ACCESSIBILITY_LAST_UPDATED_HE}</p>
        </header>

        <div className="space-y-5">
          <section aria-labelledby="a11y-commitment" className={SECTION}>
            <h2 id="a11y-commitment" className={H2}>המחויבות שלנו</h2>
            <p className={P}>
              ב-OUT אנחנו מאמינים שאימון בחוץ צריך להיות נגיש לכולם. אנחנו פועלים להנגשת
              האפליקציה ואתר OUT לאנשים עם מוגבלות, כחלק מהמחויבות שלנו לבריאות נגישה לכל אחד
              ואחת.
            </p>
          </section>

          <section aria-labelledby="a11y-standard" className={SECTION}>
            <h2 id="a11y-standard" className={H2}>התקן והסטטוס הנוכחי</h2>
            <p className={P}>
              אנחנו מתאימים את השירות לתקן הישראלי ת"י 5568 (המבוסס על WCAG 2.x) ברמה AA, בהתאם
              לתקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות).
            </p>
            <p className={`${P} mt-3`}>
              <strong className="text-slate-900">סטטוס: בתהליך התאמה.</strong> השירות עדיין אינו
              עומד במלואו בדרישות התקן. אנחנו בודקים את המסכים באופן שיטתי, מתקנים ליקויים לפי
              סדר חשיבות, ומעדכנים הצהרה זו ככל שההתאמה מתקדמת. עד להשלמתה ייתכן שחלק מהמסכים
              והרכיבים עדיין אינם נגישים במלואם.
            </p>
          </section>

          <section aria-labelledby="a11y-done" className={SECTION}>
            <h2 id="a11y-done" className={H2}>מה כבר הותאם</h2>
            <ul className="list-disc pr-5 space-y-1.5">
              <li className={P}>כפתורים המסומנים באייקון בלבד קיבלו שם נגיש לקוראי מסך.</li>
              <li className={P}>צבעי טקסט ואייקונים בגוון הכחול של המותג הוכהו כדי לעמוד ביחס ניגודיות של 4.5:1 לפחות.</li>
              <li className={P}>תווית האינטרוולים במסך האימון הוצגה על רקע אטום כך שהניגודיות אינה תלויה בתוכן שמאחוריה.</li>
            </ul>
          </section>

          <section aria-labelledby="a11y-contact" className={`${SECTION} border-[#007EA8]/40`}>
            <h2 id="a11y-contact" className={H2}>רכז הנגישות ופנייה אלינו</h2>
            <p className={P}>
              נתקלתם בקושי, או צריכים את המידע בדרך אחרת? נשמח לשמוע ולטפל בפנייה.
            </p>
            <dl className="mt-3 space-y-1.5 text-sm text-slate-700">
              <div className="flex gap-2">
                <dt className="font-bold text-slate-900">רכז נגישות:</dt>
                <dd>{COORDINATOR.name}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="font-bold text-slate-900">דוא"ל:</dt>
                <dd>
                  <a href={`mailto:${COORDINATOR.email}`} className={LINK}>
                    {COORDINATOR.email}
                  </a>
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="font-bold text-slate-900">טלפון:</dt>
                <dd>
                  <a href={COORDINATOR.phoneHref} className={LINK} dir="ltr">
                    {COORDINATOR.phone}
                  </a>
                </dd>
              </div>
            </dl>
            <p className={`${P} mt-3`}>
              בפנייה מומלץ לציין את המסך או הפעולה, את המכשיר או הדפדפן, ואת טכנולוגיית העזר שבה
              השתמשתם (אם יש). נשתדל להשיב בהקדם האפשרי.
            </p>
          </section>
        </div>

        <footer className="mt-10 text-center">
          <p className="text-xs text-slate-600">© 2026 קליסטניקס בע"מ, ח.פ 516841806.</p>
        </footer>
      </div>
    </div>
  );
}
