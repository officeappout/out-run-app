import React, { createElement, Fragment, type ReactNode } from 'react';
import type { Metadata } from 'next';
import { makeT } from '@/lib/i18n/t';
import { SOURCE_LOCALE } from '@/lib/i18n/locales';
import { legal } from '@/messages/ns/legal';

/**
 * Server component: no locale store here. The server-side locale read (out_locale cookie) is wave 4E
 * (src/lib/i18n/locale-cookie.ts) — until then the statement renders from the Hebrew source catalog.
 */
const pageT = () => makeT(SOURCE_LOCALE, legal);

export function generateMetadata(): Metadata {
  const t = pageT();
  return {
    title: t('accessibility.meta.title'),
    description: t('accessibility.meta.description'),
  };
}

/** Bump on every material change to the statement or to the real conformance status. */
const ACCESSIBILITY_LAST_UPDATED_HE = '12 באוקטובר 2026'; // i18n-allow-hebrew: date text — wave 3 (fmt)

const COORDINATOR = {
  name: 'דוד מובשוביץ', // i18n-allow-hebrew: a person's name (data)
  role: 'רכז נגישות', // i18n-allow-hebrew: unused field (the rendered label is accessibility.contact.coordinatorLabel)
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
  const t = pageT();
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white" dir="rtl" lang="he">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 pb-20">
        <a href="/home" className={`${LINK} inline-block mb-4 text-sm`}>
          {t('accessibility.backToApp')}
        </a>
        <header className="mb-6">
          <h1 className="text-2xl font-black text-slate-900">{t('accessibility.title')}</h1>
          <p className="text-xs text-slate-600 mt-1">{t('accessibility.lastUpdated', { date: ACCESSIBILITY_LAST_UPDATED_HE })}</p>
        </header>

        <div className="space-y-5">
          <section aria-labelledby="a11y-commitment" className={SECTION}>
            <h2 id="a11y-commitment" className={H2}>{t('accessibility.commitment.title')}</h2>
            <p className={P}>{t('accessibility.commitment.body')}</p>
          </section>

          <section aria-labelledby="a11y-standard" className={SECTION}>
            <h2 id="a11y-standard" className={H2}>{t('accessibility.standard.title')}</h2>
            <p className={P}>{t('accessibility.standard.body')}</p>
            <p className={`${P} mt-3`}>
              {createElement(
                Fragment,
                null,
                ...t.rich<ReactNode>('accessibility.standard.status', {
                  b: (chunks: ReactNode) => <strong className="text-slate-900">{chunks}</strong>,
                }),
              )}
            </p>
            <p className={`${P} mt-3`}>{t('accessibility.standard.toolbar')}</p>
          </section>

          <section aria-labelledby="a11y-done" className={SECTION}>
            <h2 id="a11y-done" className={H2}>{t('accessibility.done.title')}</h2>
            <ul className="list-disc pr-5 space-y-1.5">
              <li className={P}>{t('accessibility.done.iconButtons')}</li>
              <li className={P}>{t('accessibility.done.contrast')}</li>
              <li className={P}>{t('accessibility.done.intervalLabel')}</li>
            </ul>
          </section>

          <section aria-labelledby="a11y-contact" className={`${SECTION} border-[#007EA8]/40`}>
            <h2 id="a11y-contact" className={H2}>{t('accessibility.contact.title')}</h2>
            <p className={P}>{t('accessibility.contact.intro')}</p>
            <dl className="mt-3 space-y-1.5 text-sm text-slate-700">
              <div className="flex gap-2">
                <dt className="font-bold text-slate-900">{t('accessibility.contact.coordinatorLabel')}</dt>
                <dd>{COORDINATOR.name}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="font-bold text-slate-900">{t('accessibility.contact.emailLabel')}</dt>
                <dd>
                  <a href={`mailto:${COORDINATOR.email}`} className={LINK}>
                    {COORDINATOR.email}
                  </a>
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="font-bold text-slate-900">{t('accessibility.contact.phoneLabel')}</dt>
                <dd>
                  <a href={COORDINATOR.phoneHref} className={LINK} dir="ltr">
                    {COORDINATOR.phone}
                  </a>
                </dd>
              </div>
            </dl>
            <p className={`${P} mt-3`}>{t('accessibility.contact.tips')}</p>
          </section>
        </div>

        <footer className="mt-10 text-center">
          <p className="text-xs text-slate-600">{t('accessibility.footer')}</p>
        </footer>
      </div>
    </div>
  );
}
