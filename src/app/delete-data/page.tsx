import React, { createElement, Fragment, type ReactNode } from 'react';
import type { Metadata } from 'next';
import { makeT } from '@/lib/i18n/t';
import { SOURCE_LOCALE } from '@/lib/i18n/locales';
import { legal } from '@/messages/ns/legal';

/**
 * Server component: no locale store here. The server-side locale read (out_locale cookie) is wave 4E
 * (src/lib/i18n/locale-cookie.ts) — until then the page renders from the Hebrew source catalog.
 */
const pageT = () => makeT(SOURCE_LOCALE, legal);

export function generateMetadata(): Metadata {
  const t = pageT();
  return {
    title: t('deleteData.meta.title'),
    description: t('deleteData.meta.description'),
  };
}

const EMAIL = 'office@appout.co.il';
// The request email goes to the (Hebrew) office inbox, which handles it by this subject — data, not copy.
const SUBJECT = 'בקשת מחיקת נתונים'; // i18n-allow-hebrew: data — the mailto subject the office inbox handles
const MAILTO = `mailto:${EMAIL}?subject=${encodeURIComponent(SUBJECT)}&body=${encodeURIComponent(
  'שלום,\n\nאני מבקש/ת למחוק את כל הנתונים האישיים שלי מאפליקציית OUT.\n\nפרטים:\nשם: \nכתובת אימייל שנרשמתי איתה: \n\nתודה.', // i18n-allow-hebrew: data — the mailto body sent to the office inbox
)}`;

const STEPS = [
  { num: '1', titleKey: 'deleteData.steps.request.title', bodyKey: 'deleteData.steps.request.body' },
  { num: '2', titleKey: 'deleteData.steps.verify.title', bodyKey: 'deleteData.steps.verify.body' },
  { num: '3', titleKey: 'deleteData.steps.erase.title', bodyKey: 'deleteData.steps.erase.body' },
] as const;

const WHAT_GETS_DELETED = [
  'deleteData.deleted.profile',
  'deleteData.deleted.history',
  'deleteData.deleted.location',
  'deleteData.deleted.social',
  'deleteData.deleted.photos',
  'deleteData.deleted.healthDeclaration',
  'deleteData.deleted.preferences',
] as const;

const NOTES = [
  'deleteData.notes.feedPosts',
  'deleteData.notes.auditLogs',
  'deleteData.notes.subscription',
] as const;

export default function DeleteDataPage() {
  const t = pageT();
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
              {t('deleteData.header.title')}
            </h1>
            <p className="text-[11px] text-slate-600 mt-0.5">
              {t('deleteData.header.company')}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 pb-20 space-y-6">

        {/* ── Intro card ── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-5">
          <p className="text-sm text-slate-600 leading-relaxed mb-2">
            {t('deleteData.intro.who')}
          </p>
          <p className="text-sm text-slate-600 leading-relaxed">
            {createElement(
              Fragment,
              null,
              ...t.rich<ReactNode>('deleteData.intro.inApp', {
                b: (chunks: ReactNode) => <span className="font-semibold text-slate-800">{chunks}</span>,
              }),
            )}
          </p>
        </div>

        {/* ── CTA button ── */}
        <div className="bg-rose-50 border border-rose-200 rounded-2xl px-5 py-6 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-rose-600 mb-3">
            {t('deleteData.cta.label')}
          </p>
          <a
            href={MAILTO}
            className="inline-flex items-center justify-center gap-2.5 bg-rose-700 hover:bg-rose-800 active:bg-rose-900 text-white font-bold text-sm px-6 py-3.5 rounded-xl transition-colors shadow-sm"
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
            {t('deleteData.cta.button')}
          </a>
          <p className="text-xs text-rose-500 mt-3">
            {t('deleteData.cta.subjectNote', { subject: SUBJECT })}
          </p>
          <p className="text-xs text-slate-600 mt-1">
            {createElement(
              Fragment,
              null,
              ...t.rich<ReactNode>('deleteData.cta.direct', {
                email: EMAIL,
                link: (chunks: ReactNode) => (
                  <a href={`mailto:${EMAIL}`} className="text-[#5BC2F2] hover:underline font-medium">
                    {chunks}
                  </a>
                ),
              }),
            )}
          </p>
        </div>

        {/* ── Process steps ── */}
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-5">
          <h2 className="font-black text-slate-900 text-sm mb-4">
            {t('deleteData.steps.title')}
          </h2>
          <ol className="space-y-5">
            {STEPS.map((step) => (
              <li key={step.num} className="flex items-start gap-3.5">
                <span className="flex-shrink-0 mt-0.5 w-7 h-7 rounded-full bg-[#5BC2F2]/10 flex items-center justify-center text-[#5BC2F2] font-black text-xs">
                  {step.num}
                </span>
                <div>
                  <p className="font-bold text-slate-800 text-sm mb-0.5">
                    {t(step.titleKey)}
                  </p>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    {t(step.bodyKey)}
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
              {t('deleteData.steps.timeline')}
            </p>
          </div>
        </section>

        {/* ── What gets deleted ── */}
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-5">
          <h2 className="font-black text-slate-900 text-sm mb-4">
            {t('deleteData.deleted.title')}
          </h2>
          <ul className="space-y-2">
            {WHAT_GETS_DELETED.map((itemKey) => (
              <li key={itemKey} className="flex items-start gap-2.5 text-sm text-slate-600 leading-relaxed">
                <span className="mt-1.5 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-400" />
                {t(itemKey)}
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
              {t('deleteData.notes.title')}
            </h2>
          </div>
          <ul className="space-y-2.5">
            {NOTES.map((noteKey) => (
              <li key={noteKey} className="flex items-start gap-2.5 text-sm text-amber-800 leading-relaxed">
                <span className="mt-1.5 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400" />
                {t(noteKey)}
              </li>
            ))}
          </ul>
        </section>

        {/* ── Privacy policy link ── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-slate-800">{t('deleteData.privacyLink.title')}</p>
            <p className="text-xs text-slate-600 mt-0.5">
              {t('deleteData.privacyLink.body')}
            </p>
          </div>
          <a
            href="/privacy"
            className="flex-shrink-0 flex items-center gap-1.5 text-[#5BC2F2] text-sm font-semibold hover:underline"
          >
            {t('deleteData.privacyLink.cta')}
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
          <p className="text-xs text-slate-600">
            {t('footer.copyright')}
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
