import React from 'react';

export const metadata = {
  title: 'מחיקת נתונים | OUT',
  description:
    'בקשת מחיקת נתונים אישיים מאפליקציית OUT — עבור משתמשים שהסירו את האפליקציה מהמכשיר.',
};

const EMAIL = 'office@appout.co.il';
const SUBJECT = 'בקשת מחיקת נתונים';
const MAILTO = `mailto:${EMAIL}?subject=${encodeURIComponent(SUBJECT)}&body=${encodeURIComponent(
  'שלום,\n\nאני מבקש/ת למחוק את כל הנתונים האישיים שלי מאפליקציית OUT.\n\nפרטים:\nשם: \nכתובת אימייל שנרשמתי איתה: \n\nתודה.',
)}`;

const STEPS = [
  {
    num: '1',
    title: 'שלחו בקשה',
    body: 'לחצו על הכפתור למטה. תיפתח אפליקציית האימייל שלכם עם הנושא והטקסט כבר מוכנים — רק צריך להוסיף את כתובת האימייל שנרשמתם איתה ולשלוח.',
  },
  {
    num: '2',
    title: 'אנחנו מאמתים את הבקשה',
    body: 'נוודא שהאימייל תואם לחשבון קיים. אם יש צורך, ניצור קשר עבור פרטים נוספים לצורך אימות זהות.',
  },
  {
    num: '3',
    title: 'מחיקה תוך 15 יום',
    body: 'לאחר אימות, נמחק את כל הנתונים האישיים שלכם: פרופיל, היסטוריית אימונים, נתוני מיקום, קשרים חברתיים ותמונות. תקבלו אישור בסיום.',
  },
];

const WHAT_GETS_DELETED = [
  'פרטי פרופיל (שם, גיל, מגדר, פרטי כושר)',
  'היסטוריית אימונים ונתוני ריצה',
  'נתוני מיקום ומסלולים מוקלטים',
  'קשרים חברתיים וחברי קהילה',
  'תמונות פרופיל ותמונות אימון',
  'הצהרת הבריאות (PDF)',
  'העדפות והגדרות אישיות',
];

const NOTES = [
  'פוסטים שפרסמתם בפיד הקהילתי יאונונמו (שמכם יוחלף ב"משתמש מחוק") כדי לשמור על שלמות השיחות.',
  'יומני ביקורת אנונימיים נשמרים עד 24 חודשים לצרכי אבטחה בלבד.',
  'אם יש לכם מנוי פרימיום פעיל — מחיקת הנתונים לא מבטלת את החיוב. יש לבטל מנוי דרך Apple App Store או Google Play לפני הגשת הבקשה.',
];

export default function DeleteDataPage() {
  return (
    <div
      className="min-h-screen bg-gradient-to-b from-slate-50 to-white"
      dir="rtl"
      lang="he"
    >
      {/* ── Sticky header ── */}
      <header className="bg-white border-b border-slate-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center flex-shrink-0">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#f43f5e"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-black text-slate-900 leading-none">
              מחיקת נתונים אישיים
            </h1>
            <p className="text-[11px] text-slate-400 mt-0.5">
              OUT · קליסטניקס בע&quot;מ
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 pb-20 space-y-6">

        {/* ── Intro card ── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-5">
          <p className="text-sm text-slate-600 leading-relaxed mb-2">
            דף זה מיועד למשתמשים שהסירו את אפליקציית OUT מהמכשיר שלהם ומעוניינים לבקש מחיקה של כל הנתונים האישיים שלהם מהשרתים שלנו.
          </p>
          <p className="text-sm text-slate-600 leading-relaxed">
            אם האפליקציה עדיין מותקנת אצלכם — תוכלו למחוק את החשבון ישירות מתוכה:{' '}
            <span className="font-semibold text-slate-800">הגדרות ← חשבון ← מחיקת חשבון</span>.
          </p>
        </div>

        {/* ── CTA button ── */}
        <div className="bg-rose-50 border border-rose-200 rounded-2xl px-5 py-6 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-rose-600 mb-3">
            שלחו בקשת מחיקה
          </p>
          <a
            href={MAILTO}
            className="inline-flex items-center justify-center gap-2.5 bg-rose-500 hover:bg-rose-600 active:bg-rose-700 text-white font-bold text-sm px-6 py-3.5 rounded-xl transition-colors shadow-sm"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
            שלח בקשת מחיקה באימייל
          </a>
          <p className="text-xs text-rose-500 mt-3">
            הנושא &quot;{SUBJECT}&quot; ימולא אוטומטית
          </p>
          <p className="text-xs text-slate-400 mt-1">
            או שלחו ישירות ל־{' '}
            <a
              href={`mailto:${EMAIL}`}
              className="text-[#5BC2F2] hover:underline font-medium"
            >
              {EMAIL}
            </a>
          </p>
        </div>

        {/* ── Process steps ── */}
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-5">
          <h2 className="font-black text-slate-900 text-sm mb-4">
            איך התהליך עובד
          </h2>
          <ol className="space-y-5">
            {STEPS.map((step) => (
              <li key={step.num} className="flex items-start gap-3.5">
                <span className="flex-shrink-0 mt-0.5 w-7 h-7 rounded-full bg-[#5BC2F2]/10 flex items-center justify-center text-[#5BC2F2] font-black text-xs">
                  {step.num}
                </span>
                <div>
                  <p className="font-bold text-slate-800 text-sm mb-0.5">
                    {step.title}
                  </p>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          {/* Timeline badge */}
          <div className="mt-5 flex items-center gap-2 bg-sky-50 border border-sky-100 rounded-xl px-4 py-2.5">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#0284c7"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="flex-shrink-0"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <p className="text-xs text-sky-700 font-semibold">
              בקשות מטופלות תוך 15 יום מקבלתן
            </p>
          </div>
        </section>

        {/* ── What gets deleted ── */}
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-5">
          <h2 className="font-black text-slate-900 text-sm mb-4">
            מה נמחק
          </h2>
          <ul className="space-y-2">
            {WHAT_GETS_DELETED.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-slate-600 leading-relaxed">
                <span className="mt-1.5 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-400" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        {/* ── Notes / exceptions ── */}
        <section className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-5">
          <div className="flex items-center gap-2 mb-3">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#d97706"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="flex-shrink-0"
              aria-hidden="true"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <h2 className="font-black text-amber-800 text-sm">
              לתשומת ליבכם
            </h2>
          </div>
          <ul className="space-y-2.5">
            {NOTES.map((note) => (
              <li key={note} className="flex items-start gap-2.5 text-sm text-amber-800 leading-relaxed">
                <span className="mt-1.5 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400" />
                {note}
              </li>
            ))}
          </ul>
        </section>

        {/* ── Privacy policy link ── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-slate-800">מדיניות פרטיות מלאה</p>
            <p className="text-xs text-slate-400 mt-0.5">
              לפרטים על כל הנתונים שאנחנו אוספים ואיך אנחנו מגנים עליהם
            </p>
          </div>
          <a
            href="/privacy"
            className="flex-shrink-0 flex items-center gap-1.5 text-[#5BC2F2] text-sm font-semibold hover:underline"
          >
            קראו כאן
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="rotate-180"
              aria-hidden="true"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </a>
        </div>

        {/* ── Footer ── */}
        <footer className="text-center space-y-1.5 pt-2">
          <p className="text-xs text-slate-400">
            © 2026 קליסטניקס בע&quot;מ, ח.פ 516841806. כל הזכויות שמורות.
          </p>
          <a
            href={`mailto:${EMAIL}`}
            className="inline-block text-xs text-[#5BC2F2] hover:underline"
          >
            {EMAIL}
          </a>
        </footer>

      </main>
    </div>
  );
}
