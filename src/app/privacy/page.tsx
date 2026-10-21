import React from 'react';
import {
  PRIVACY_POLICY_HE,
  LEGAL_LAST_UPDATED_HE,
  LEGAL_VERSION,
  toParagraphs,
} from '@/features/legal/legal-content';
import type { Metadata } from 'next';
import { makeT } from '@/lib/i18n/t';
import { SOURCE_LOCALE } from '@/lib/i18n/locales';
import { legal } from '@/messages/ns/legal';

/**
 * Server component: no locale store here. The server-side locale read (out_locale cookie) is wave 4E
 * (src/lib/i18n/locale-cookie.ts) — until then the page chrome renders from the Hebrew source catalog.
 * The policy text itself is PRIVACY_POLICY_HE (src/features/legal/legal-content.ts) — not this page's copy.
 */
const pageT = () => makeT(SOURCE_LOCALE, legal);

export function generateMetadata(): Metadata {
  const t = pageT();
  return {
    title: t('privacy.meta.title'),
    description: t('privacy.meta.description'),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Section numbers that receive special enhanced styling */
const HEALTH_SECTION_TITLE = '2. נתוני בריאות — Apple HealthKit ו-Google Health Connect'; // i18n-allow-hebrew: data — compared with PRIVACY_POLICY_HE section titles
const CONTACT_SECTION_TITLE = '14. יצירת קשר'; // i18n-allow-hebrew: data — compared with PRIVACY_POLICY_HE section titles

/** The four zero-sharing commitments (subsection 2.3) that get badge treatment */
const ZERO_SHARING_SUBSECTION = '2.3 התחייבויות מוחלטות'; // i18n-allow-hebrew: data — compared with PRIVACY_POLICY_HE subsection titles

// ─── Sub-components ───────────────────────────────────────────────────────────

function Paragraphs({
  body,
  className = 'text-slate-600 leading-relaxed',
}: {
  body: string | string[];
  className?: string;
}) {
  const paras = toParagraphs(body);
  if (paras.length === 0) return null;
  return (
    <>
      {paras.map((text, i) => (
        <p key={i} className={`mb-2 last:mb-0 ${className}`}>
          {text}
        </p>
      ))}
    </>
  );
}

/** Highlighted card used for zero-sharing commitments (subsection 2.3) */
function CommitmentsCard({ body }: { body: string | string[] }) {
  const t = pageT();
  const items = toParagraphs(body);
  return (
    <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-2xl p-5 space-y-2.5">
      <p className="text-xs font-bold uppercase tracking-widest text-emerald-700 mb-3">
        {t('privacy.commitments.badge')}
      </p>
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2.5">
          <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-white text-[10px] font-black">
            ✓
          </span>
          <p className="text-sm text-emerald-800 leading-relaxed">{item}</p>
        </div>
      ))}
    </div>
  );
}

/** Health data type cards used inside section 2 */
const HEALTH_DATA_ICONS: Record<string, string> = {
  '2.1': '👣',
  '2.2': '✍️',
  '2.3': '🛡️',
};

function HealthSubsection({
  title,
  body,
}: {
  title: string;
  body: string | string[];
}) {
  const key = title.split(' ')[0]; // e.g. "2.1"
  const icon = HEALTH_DATA_ICONS[key] ?? '•';
  const isCommitments = title === ZERO_SHARING_SUBSECTION;

  return (
    <div className="ms-0 mt-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg" aria-hidden="true">
          {icon}
        </span>
        <h4 className="font-bold text-slate-800 text-sm">{title}</h4>
      </div>
      {isCommitments ? (
        <CommitmentsCard body={body} />
      ) : (
        <ul className="space-y-1.5 me-2">
          {toParagraphs(body).map((item, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-sm text-slate-600 leading-relaxed"
            >
              <span className="mt-1.5 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-[#5BC2F2]" />
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PrivacyPage() {
  const doc = PRIVACY_POLICY_HE;
  const t = pageT();

  return (
    <div
      className="min-h-screen bg-gradient-to-b from-slate-50 to-white"
      dir="rtl"
      lang="he"
    >
      {/* ── Hero header ── */}
      <header className="bg-white border-b border-slate-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#5BC2F2]/10 flex items-center justify-center flex-shrink-0">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#5BC2F2"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-black text-slate-900 leading-none">
              {doc.title}
            </h1>
            <p className="text-[11px] text-slate-600 mt-0.5">
              {t('privacy.version', { version: LEGAL_VERSION, date: LEGAL_LAST_UPDATED_HE })}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 pb-20">

        {/* ── Intro card ── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4 mb-8">
          <Paragraphs
            body={doc.intro}
            className="text-xs text-slate-500 leading-relaxed"
          />
        </div>

        {/* ── Sections ── */}
        <div className="space-y-6">
          {doc.sections.map((section) => {
            const isHealth = section.title === HEALTH_SECTION_TITLE;
            const isContact = section.title === CONTACT_SECTION_TITLE;

            return (
              <section
                key={section.title}
                id={`section-${section.title.split('.')[0].replace(/\s/g, '')}`}
                className={[
                  'rounded-2xl border shadow-sm px-5 py-5',
                  isHealth
                    ? 'bg-sky-50 border-sky-200'
                    : isContact
                    ? 'bg-slate-50 border-slate-200'
                    : 'bg-white border-slate-100',
                ].join(' ')}
              >
                {/* Section heading */}
                <div className="flex items-start gap-3 mb-3">
                  {isHealth && (
                    <span
                      className="flex-shrink-0 mt-0.5 text-xl"
                      aria-hidden="true"
                    >
                      🏥
                    </span>
                  )}
                  <h2
                    className={[
                      'font-black leading-snug',
                      isHealth ? 'text-sky-900 text-base' : 'text-slate-900 text-sm',
                    ].join(' ')}
                  >
                    {section.title}
                  </h2>
                </div>

                {/* Section body paragraphs */}
                <Paragraphs body={section.body} className="text-slate-600 leading-relaxed text-sm mb-1" />

                {/* Health section: featured badge */}
                {isHealth && (
                  <div className="mt-3 mb-1 inline-flex items-center gap-1.5 bg-sky-600 text-white text-[11px] font-bold px-3 py-1 rounded-full">
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                    {t('privacy.health.badge')}
                  </div>
                )}

                {/* Subsections */}
                {section.subsections && section.subsections.length > 0 && (
                  <div
                    className={[
                      'mt-4 space-y-1 divide-y',
                      isHealth ? 'divide-sky-200/60' : 'divide-slate-100',
                    ].join(' ')}
                  >
                    {section.subsections.map((sub) =>
                      isHealth ? (
                        <HealthSubsection
                          key={sub.title}
                          title={sub.title}
                          body={sub.body}
                        />
                      ) : (
                        <div key={sub.title} className="pt-4 first:pt-0">
                          <h3 className="font-bold text-slate-800 text-sm mb-2">
                            {sub.title}
                          </h3>
                          <Paragraphs
                            body={sub.body}
                            className="text-slate-600 leading-relaxed text-sm"
                          />
                        </div>
                      ),
                    )}
                  </div>
                )}

                {/* Contact section: inline links */}
                {isContact && (
                  <div className="mt-4 flex flex-col gap-2">
                    <a
                      href="mailto:office@appout.co.il"
                      className="inline-flex items-center gap-2 text-sm text-[#5BC2F2] font-semibold hover:underline"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <rect x="2" y="4" width="20" height="16" rx="2" />
                        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                      </svg>
                      office@appout.co.il
                    </a>
                  </div>
                )}
              </section>
            );
          })}
        </div>

        {/* ── Footer ── */}
        <footer className="mt-10 text-center space-y-2">
          <p className="text-xs text-slate-600">
            {t('privacy.footer.effective', { date: LEGAL_LAST_UPDATED_HE })}
          </p>
          <p className="text-xs text-slate-600">
            {t('footer.copyright')}
          </p>
          <a
            href="mailto:office@appout.co.il"
            className="inline-block text-xs text-[#5BC2F2] hover:underline mt-1"
          >
            office@appout.co.il
          </a>
        </footer>
      </main>
    </div>
  );
}
