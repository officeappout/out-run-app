'use client';

/**
 * /legal/credits — licences and data-source credits (OpenStreetMap ODbL, Mapbox, Ministry of
 * Transport bike paths). Public. Behind `enable_osm_attribution` (default OFF): while the flag
 * is off (or unknown) nothing renders, and once flags are known and it is off, the page 404s.
 */
import React from 'react';
import { notFound } from 'next/navigation';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useT } from '@/hooks/useT';
import { legal } from '@/messages/ns/legal';

const SECTION = 'rounded-2xl border border-slate-200 bg-white shadow-sm px-5 py-5';
const H2 = 'text-base font-black text-slate-900 mb-2';
const P = 'text-sm text-slate-700 leading-relaxed';
const LINK =
  'font-semibold text-[#007EA8] underline underline-offset-2 hover:text-[#006E96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007EA8] rounded-sm';

export default function CreditsPage() {
  const { flags, ready, loading } = useFeatureFlags();
  const t = useT(legal);

  if (!ready || loading) return null;
  if (!flags.enableOsmAttribution) notFound();

  const ext = { target: '_blank', rel: 'noopener noreferrer' } as const;
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white" dir="rtl" lang="he">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 pb-20">
        <a href="/home" className={`${LINK} inline-block mb-4 text-sm`}>{t('credits.backToApp')}</a>
        <header className="mb-6">
          <h1 className="text-2xl font-black text-slate-900">{t('credits.title')}</h1>
          <p className="text-sm text-slate-600 mt-1">{t('credits.intro')}</p>
        </header>
        <div className="space-y-5">
          <section aria-labelledby="credits-osm" className={SECTION}>
            <h2 id="credits-osm" className={H2}>{t('credits.osm.title')}</h2>
            <p className={P}>{t('credits.osm.body')}</p>
            <p dir="ltr" className={`${P} mt-3 font-semibold`}>{t('credits.osm.attribution')}</p>
            <ul className={`${P} mt-3 space-y-1`}>
              <li><a href="https://www.openstreetmap.org/copyright" className={LINK} {...ext}>{t('credits.osm.copyrightLink')}</a></li>
              <li><a href="https://opendatacommons.org/licenses/odbl/1-0/" className={LINK} {...ext}>{t('credits.osm.odblLink')}</a></li>
            </ul>
          </section>
          <section aria-labelledby="credits-trails" className={SECTION}>
            <h2 id="credits-trails" className={H2}>{t('credits.trails.title')}</h2>
            <p className={P}>{t('credits.trails.body')}</p>
          </section>
          <section aria-labelledby="credits-mapbox" className={SECTION}>
            <h2 id="credits-mapbox" className={H2}>{t('credits.mapbox.title')}</h2>
            <p className={P}>{t('credits.mapbox.body')}</p>
            <ul className={`${P} mt-3 space-y-1`}>
              <li><a href="https://www.mapbox.com/" className={LINK} {...ext}>{t('credits.mapbox.link')}</a></li>
              <li><a href="https://www.mapbox.com/about/maps/" className={LINK} {...ext}>{t('credits.mapbox.aboutLink')}</a></li>
            </ul>
          </section>
          <section aria-labelledby="credits-transport" className={SECTION}>
            <h2 id="credits-transport" className={H2}>{t('credits.transport.title')}</h2>
            <p className={P}>{t('credits.transport.body')}</p>
            <p className={`${P} mt-3`}>
              <a href="https://data.gov.il/" className={LINK} {...ext}>{t('credits.transport.link')}</a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
