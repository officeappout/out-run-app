'use client';

import React from 'react';
import { motion } from 'framer-motion';

/**
 * Full-screen branded splash. Shown by the landing page (`/`) while
 * Firebase restores the auth session for returning users — kills the
 * half-second login-page flicker that used to appear on every cold
 * open before the auth state resolved and the redirect to `/home`
 * fired.
 *
 * Visual language is intentionally identical to `MapLoadingSkeleton`
 * (same dark navy gradient, cyan grid, shimmer sweep, radar pulse,
 * breathing logo) so the cold-open sequence feels like one continuous
 * AI-themed motion: splash → home → map.
 *
 * Mounts at z-[100] (the project's "full-screen overlay" tier in the
 * z-index budget) so it covers everything else on the landing route.
 */
export default function BrandedSplashScreen() {
  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[100] overflow-hidden"
      style={{
        background:
          'radial-gradient(120% 90% at 50% 30%, #0b1224 0%, #050816 60%, #02040d 100%)',
      }}
      aria-busy="true"
      aria-label="טוען"
    >
      {/* Topographic grid — matches MapLoadingSkeleton */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0,229,255,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,255,0.10) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage:
            'radial-gradient(ellipse at center, black 25%, transparent 75%)',
          WebkitMaskImage:
            'radial-gradient(ellipse at center, black 25%, transparent 75%)',
        }}
      />

      {/* Diagonal shimmer sweep */}
      <motion.div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(120deg, transparent 35%, rgba(0,229,255,0.18) 50%, transparent 65%)',
          backgroundSize: '220% 220%',
        }}
        animate={{ backgroundPosition: ['0% 0%', '120% 120%'] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }}
      />

      {/* Radar pulse rings — three rings expand from center on staggered loop */}
      <div className="absolute inset-0 flex items-center justify-center">
        {[0, 0.6, 1.2].map((delay, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full border border-cyan-400/30"
            style={{ width: 130, height: 130 }}
            initial={{ scale: 0.6, opacity: 0.6 }}
            animate={{ scale: 2.6, opacity: 0 }}
            transition={{
              duration: 2.4,
              repeat: Infinity,
              ease: 'easeOut',
              delay,
            }}
          />
        ))}
      </div>

      {/* Center: breathing OUT logo with cyan halo */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
        <motion.div
          animate={{ scale: [1, 1.06, 1], opacity: [0.85, 1, 0.85] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          className="relative"
        >
          <div
            className="absolute inset-0 -m-8 blur-2xl"
            style={{
              background:
                'radial-gradient(circle, rgba(0,229,255,0.55) 0%, transparent 70%)',
            }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/logo/Kind=logotype.svg"
            alt="OUT"
            className="relative h-14 brightness-0 invert"
          />
        </motion.div>

        <motion.p
          animate={{ opacity: [0.4, 0.85, 0.4] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          className="text-cyan-200/70 text-[11px] font-semibold tracking-[0.22em] uppercase"
          style={{ fontFamily: 'var(--font-simpler)' }}
        >
          טוען
        </motion.p>
      </div>
    </div>
  );
}
