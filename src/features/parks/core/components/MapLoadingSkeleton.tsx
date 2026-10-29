'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useT } from '@/hooks/useT';
import { map as mapNs } from '@/messages/ns/map';

interface MapLoadingSkeletonProps {
  /**
   * When false, the skeleton fades to opacity 0 with a slight scale-up.
   * AnimatePresence handles the unmount.
   */
  visible: boolean;
}

/**
 * Glassmorphic "AI-thinking" overlay shown over the Mapbox canvas
 * during the map's init pipeline. Unlike a solid loading screen, this
 * is a smart-glass layer: a dense translucent dark tint lets the user
 * sense the map being prepared underneath while the
 * AI overlay (cyan grid, diagonal shimmer, glowing route paths, radar
 * pulse rings, breathing OUT logo) reads as a focusing lens.
 *
 * Visual language is shared with `BrandedSplashScreen` so the cold-open
 * sequence (splash → home → map) feels like one continuous AI motion.
 *
 * Triggering is gated upstream in `AppMap.tsx` to ONLY render on cold
 * start (first AppMap mount in the JS session) — see the
 * `mapHasInitializedInSession` flag there. Tab switches that re-mount
 * AppMap reuse the cached Mapbox style and skip the skeleton entirely.
 */
export default function MapLoadingSkeleton({ visible }: MapLoadingSkeletonProps) {
  const t = useT(mapNs);
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="map-skeleton"
          // Pilot note AC2 (29.10): no backdrop blur. A blur over the WebGL
          // canvas re-blurs the whole viewport on every map frame (the entry
          // flight runs underneath), which stuttered the map on iPhone. A denser
          // tint carries the "glass" look; only opacity / scale animate.
          initial={{ opacity: 1, scale: 1 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.02 }}
          transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
          className="absolute inset-0 z-[50] overflow-hidden"
          style={{
            // Translucent slate tint — provides legibility for the AI
            // overlay content without hiding the map, dense enough that
            // the cyan accents read against any map colour underneath.
            backgroundColor: 'rgba(15, 23, 42, 0.72)',
          }}
          aria-busy="true"
          aria-label={t('mapLoading.ariaLabel')}
        >
          {/* ── Subtle radial vignette ─────────────────────────────────────
              Focuses attention on the centre logo while letting the
              map peek through at the edges. */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(120% 90% at 50% 30%, rgba(11,18,36,0.10) 0%, rgba(2,4,13,0.45) 100%)',
            }}
          />

          {/* ── Topographic grid — subtle cyan lines, masked to soft vignette ── */}
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

          {/* ── Diagonal shimmer sweep — gives the surface a "scanning" feel ── */}
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

          {/* ── Glowing AI route paths — three curves draw and fade in sequence ── */}
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox="0 0 400 800"
            preserveAspectRatio="xMidYMid slice"
          >
            <defs>
              <linearGradient id="map-skeleton-route" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#00E5FF" stopOpacity="0" />
                <stop offset="50%" stopColor="#00E5FF" stopOpacity="1" />
                <stop offset="100%" stopColor="#00E5FF" stopOpacity="0" />
              </linearGradient>
            </defs>
            <motion.path
              d="M -20 200 Q 100 120 200 220 T 420 180"
              stroke="url(#map-skeleton-route)"
              strokeWidth="2.5"
              fill="none"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: [0, 1, 1], opacity: [0, 0.85, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.path
              d="M -20 600 Q 120 540 230 600 T 420 560"
              stroke="url(#map-skeleton-route)"
              strokeWidth="2.5"
              fill="none"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: [0, 1, 1], opacity: [0, 0.7, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 0.7 }}
            />
            <motion.path
              d="M 60 -20 Q 120 200 220 380 T 320 820"
              stroke="url(#map-skeleton-route)"
              strokeWidth="1.5"
              fill="none"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: [0, 1, 1], opacity: [0, 0.6, 0] }}
              transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay: 1.4 }}
            />
          </svg>

          {/* ── Radar pulse rings — three rings expand from centre, staggered ── */}
          <div className="absolute inset-0 flex items-center justify-center">
            {[0, 0.6, 1.2].map((delay, i) => (
              <motion.div
                key={i}
                className="absolute rounded-full border border-cyan-400/30"
                style={{ width: 120, height: 120 }}
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

          {/* ── Centre: breathing OUT logo with cyan halo + caption ── */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <motion.div
              animate={{ scale: [1, 1.06, 1], opacity: [0.85, 1, 0.85] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              className="relative"
            >
              <div
                className="absolute inset-0 -m-8"
                style={{
                  background:
                    'radial-gradient(circle, rgba(0,229,255,0.55) 0%, transparent 70%)',
                }}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/assets/logo/Kind=logotype.svg"
                alt="OUT"
                className="relative h-12 brightness-0 invert"
              />
            </motion.div>

            <motion.p
              animate={{ opacity: [0.45, 0.95, 0.45] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              className="text-cyan-200/80 text-[11px] font-semibold tracking-[0.22em] uppercase"
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              {t('mapLoading.caption')}
            </motion.p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
