'use client';

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import BrandCtaButton from '@/components/ui/BrandCtaButton';
import { INTRO_IMG, LANDING_COPY } from '../intro-copy';
import { EASE_CSS, EASE_OUT, tween } from '../story-timeline';

export interface IntroLandingProps {
  onQuickSignup: () => void;
  onLogin: () => void;
}

/**
 * The new landing (enable_entry_intro_v1, mockup intro-S1): the city portrait,
 * full-bleed, settling from 1.06 → 1; "ברוכים הבאים ל-OUT" with the logo in place
 * of the word; the existing quick-signup CTA and the underlined login link (both
 * handlers are the landing page's own). Light on purpose — first paint: one
 * image, no map, no globe.
 */
export function IntroLanding({ onQuickSignup, onLogin }: IntroLandingProps) {
  const reduce = !!useReducedMotion();
  const up = (delay: number) =>
    tween({ opacity: 0, y: 12 }, { opacity: 1, y: 0 }, { duration: 0.7, ease: EASE_CSS, delay }, reduce);

  return (
    <div className="absolute inset-0 overflow-hidden bg-white text-v2-ink" dir="rtl">
      <motion.div
        className="absolute inset-0"
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, ease: EASE_CSS }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <motion.img
          src={`${INTRO_IMG}/city-portrait.jpg`}
          alt={LANDING_COPY.cityAlt}
          fetchPriority="high"
          className="absolute inset-0 h-full w-full object-cover object-center"
          style={{ transformOrigin: '50% 60%' }}
          initial={reduce ? false : { scale: 1.06 }}
          animate={{ scale: 1 }}
          transition={{ duration: 2.2, ease: EASE_OUT }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(255,255,255,.92) 0%, rgba(255,255,255,.55) 22%, rgba(255,255,255,0) 34%, rgba(255,255,255,0) 74%, rgba(255,255,255,.9) 88%, #fff 96%)',
          }}
        />
      </motion.div>

      <motion.div
        className="relative flex flex-col items-center gap-2.5 px-[26px] text-center"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 18px)' }}
        {...up(0.5)}
      >
        <h1 className="m-0 flex flex-wrap items-center justify-center gap-1 text-[32px] font-bold leading-10 !tracking-[-0.02em]">
          <span>{LANDING_COPY.titlePre}</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${INTRO_IMG}/logo-out.svg`} alt="OUT" className="mt-0.5 h-[34px] w-auto" />
        </h1>
        <p className="m-0 max-w-[16rem] text-[17px] font-semibold leading-[25px] text-slate-700">
          {LANDING_COPY.sub}
        </p>
      </motion.div>

      <motion.div
        className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-3.5 px-6"
        style={{ paddingBottom: 'max(34px, env(safe-area-inset-bottom, 0px))' }}
        {...up(1)}
      >
        <BrandCtaButton
          whileTap={{ scale: 0.97 }}
          onClick={onQuickSignup}
          className="h-14 w-full max-w-md text-[17px] !font-bold text-v2-on-cta"
          style={{ fontFamily: 'var(--font-simpler)' }}
        >
          {LANDING_COPY.cta}
        </BrandCtaButton>
        <button
          type="button"
          onClick={onLogin}
          className="py-1 text-sm font-bold text-v2-muted underline underline-offset-[3px]"
          style={{ fontFamily: 'var(--font-simpler)' }}
        >
          {LANDING_COPY.login}
        </button>
      </motion.div>
    </div>
  );
}
