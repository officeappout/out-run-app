'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface MapLoadingSkeletonProps {
  /**
   * When false, the skeleton dissolves out via a camera-lens focus
   * transition: the backdrop blur drops from `blur(24px)` → `blur(0px)`
   * (map underneath sharpens), the skeleton itself fades to opacity 0
   * with a slight scale-up. AnimatePresence handles the unmount.
   */
  visible: boolean;
}

/**
 * Glassmorphic "AI-thinking" overlay shown over the Mapbox canvas
 * during the map's init pipeline. Unlike a solid loading screen, this
 * is a smart-glass layer: a translucent dark tint + a heavy backdrop
 * blur let the user see the map being prepared underneath while the
 * AI overlay (cyan grid, diagonal shimmer, glowing route paths, radar
 * pulse rings, breathing OUT logo) reads as a focusing lens.
 *
 * On exit, framer-motion interpolates `backdropFilter` from the heavy
 * blur back to zero — the map literally comes into focus while the
 * overlay fades and scales out, reading as a single continuous
 * "lens-focusing" gesture instead of a hard reveal.
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
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="map-skeleton"
          dir="rtl"
          // `backdropFilter` is animated by framer-motion: starts at a
          // heavy blur (~Tailwind `backdrop-blur-xl`) plus a saturation
          // boost that pushes the underlying map's colour pop, then
          // resolves to no blur / neutral saturation on exit. The
          // `scale` and `opacity` exit values give the dissolve-outward
          // feel; the cubic-bezier ease keeps the focusing motion
          // perceptually linear at the end.
          initial={{
            opacity: 1,
            scale: 1,
            backdropFilter: 'blur(24px) saturate(160%)',
          }}
          animate={{
            opacity: 1,
            scale: 1,
            backdropFilter: 'blur(24px) saturate(160%)',
          }}
          exit={{
            opacity: 0,
            scale: 1.02,
            backdropFilter: 'blur(0px) saturate(100%)',
          }}
          transition={{ duration: 0.45, ease: [0.25, 0.1, 0.25, 1] }}
          className="absolute inset-0 z-[50] overflow-hidden"
          style={{
            // Translucent slate tint — provides legibility for the AI
            // overlay content without hiding the map. The backdrop blur
            // (animated above) does the heavy lifting for the "glass"
            // effect; this tint just adds a hint of depth so cyan
            // accents read against any map colour underneath.
            backgroundColor: 'rgba(15, 23, 42, 0.32)',
            // Safari prefix — modern WebKit also accepts the unprefixed
            // property, but older iOS Safari versions still require
            // this. Framer-motion only animates the unprefixed name, so
            // on legacy Safari the blur stays at 24 px throughout
            // (acceptable graceful degradation — the lens-focus motion
            // is lost but the layer still appears glassy).
            WebkitBackdropFilter: 'blur(24px) saturate(160%)',
          }}
          aria-busy="true"
          aria-label="טוען מפה"
        >
          {/* ── Subtle radial vignette ─────────────────────────────────────
              Focuses attention on the centre logo while letting the
              blurred map peek through at the edges. Lower opacity than
              the previous solid version since the glass blur is already
              providing the visual depth. */}
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
              <filter id="map-skeleton-glow">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <motion.path
              d="M -20 200 Q 100 120 200 220 T 420 180"
              stroke="url(#map-skeleton-route)"
              strokeWidth="2.5"
              fill="none"
              filter="url(#map-skeleton-glow)"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: [0, 1, 1], opacity: [0, 0.85, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.path
              d="M -20 600 Q 120 540 230 600 T 420 560"
              stroke="url(#map-skeleton-route)"
              strokeWidth="2.5"
              fill="none"
              filter="url(#map-skeleton-glow)"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: [0, 1, 1], opacity: [0, 0.7, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 0.7 }}
            />
            <motion.path
              d="M 60 -20 Q 120 200 220 380 T 320 820"
              stroke="url(#map-skeleton-route)"
              strokeWidth="1.5"
              fill="none"
              filter="url(#map-skeleton-glow)"
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
                className="absolute inset-0 -m-6 blur-2xl"
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
              מנתח את הסביבה
            </motion.p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
