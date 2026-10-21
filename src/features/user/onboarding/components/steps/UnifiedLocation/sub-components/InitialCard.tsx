'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { MapPin } from 'lucide-react';
import type { InitialCardProps } from '../location-types';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';

export function InitialCard({ gender, locationError, onFindLocation, onSearchManually, mode = 'onboarding', detectedNeighborhood, detectedCity, purpose, v2 = false }: InitialCardProps) {
  const t = useT(onboarding);
  const isExplorer = mode === 'explorer';
  const isRunning = purpose === 'running';
  const userName = typeof window !== 'undefined' 
    ? sessionStorage.getItem('onboarding_personal_name') || ''
    : '';

  const locationAnchor = detectedNeighborhood || detectedCity || null;

  const headline = isRunning
    ? <>{t('location.initial.headline.running', { gender })}</>
    : isExplorer
      ? (locationAnchor
          ? <>{t('location.initial.headline.nearest', { place: locationAnchor })}</>
          : <>{t('location.initial.headline.default')}</>)
      : <>{t('location.initial.headline.default')}</>;

  const subtitle = isRunning
    ? <>{t('location.initial.subtitle.running')}</>
    : <>{t('location.initial.subtitle.default')}</>;

  if (v2) {
    // v2 — a bottom sheet over the full-bleed map. The step is `fixed inset-0`
    // (it covers <main>), so this sheet owns the bottom safe-area inset, once.
    return (
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
        className="absolute bottom-0 left-0 right-0 z-20"
        dir="rtl"
      >
        <div
          className="rounded-t-[28px] bg-white shadow-v2-sheet px-5 pt-3"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
        >
          <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-v2-pill-border" />
          <h2 className="text-[22px] font-black !tracking-[-0.02em] leading-tight text-v2-ink text-right mb-2">
            {headline}
          </h2>
          <p className="text-[14.5px] leading-relaxed text-v2-ink-2 text-right mb-4">
            {subtitle}
          </p>

          {locationError && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="rounded-2xl bg-[#b4232a]/[0.06] px-3.5 py-2.5 mb-4"
            >
              <p className="text-[12.5px] font-bold text-[#b4232a] text-right">
                {locationError}
              </p>
            </motion.div>
          )}

          <button
            type="button"
            onClick={onFindLocation}
            className="w-full h-[52px] rounded-full bg-v2-cta text-[16px] font-extrabold text-v2-on-cta shadow-v2-cta active:scale-[0.97] transition-transform duration-150 ease-v2 flex items-center justify-center gap-2 px-5 whitespace-nowrap"
          >
            <MapPin size={19} className="flex-shrink-0" />
            <span className="truncate">{t('location.initial.gps')}</span>
          </button>

          <button
            type="button"
            onClick={onSearchManually}
            className="w-full mt-2 h-11 text-[14px] font-extrabold text-v2-deep whitespace-nowrap truncate active:scale-[0.97] transition-transform duration-150 ease-v2"
          >
            {t('location.initial.manual')}
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 50 }}
      transition={{ duration: 0.3 }}
      className="absolute bottom-0 left-0 right-0 z-20"
      dir="rtl"
    >
      <div className="bg-gradient-to-t from-white via-white/98 to-transparent pt-12 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="bg-white rounded-t-3xl shadow-[0_-8px_30px_rgba(91,194,242,0.10)] p-6 pb-8 border-t border-slate-100/40">
          <h2 
            className="text-2xl font-bold leading-tight text-slate-900 mb-3"
            style={{ fontFamily: 'var(--font-simpler)', textAlign: 'right' }}
          >
            {headline}
          </h2>
          <p 
            className="text-slate-600 leading-relaxed text-sm mb-4"
            style={{ fontFamily: 'var(--font-simpler)', textAlign: 'right' }}
          >
            {subtitle}
          </p>

          {locationError && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="bg-red-50 border border-red-200 rounded-2xl p-3 mb-4"
            >
              <p className="text-sm text-red-600" style={{ fontFamily: 'var(--font-simpler)' }}>
                {locationError}
              </p>
            </motion.div>
          )}

          <button
            onClick={onFindLocation}
            className="w-full bg-brand-cta hover:brightness-105 text-on-brand font-bold py-4 rounded-2xl shadow-xl shadow-[#5BC2F2]/30 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            <MapPin size={20} />
            <span>{/* i18n-allow-hebrew: legacy v1 (enable_home_v2 on) */}מציאת מיקום אוטומטית (GPS)</span>
          </button>

          <button
            onClick={onSearchManually}
            className="w-full mt-4 text-[#007EA8] hover:text-[#4AADE3] text-sm py-2 transition-colors underline underline-offset-2 font-medium"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            {/* i18n-allow-hebrew: legacy v1 (enable_home_v2 on) */}בחירת עיר ושכונה באופן ידני
          </button>
        </div>
      </div>
    </motion.div>
  );
}
