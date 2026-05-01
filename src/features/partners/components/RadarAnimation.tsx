'use client';

/**
 * RadarAnimation — full-screen "scanning" overlay
 * -----------------------------------------------
 * Originally built for the partner-finder tap → overlay transition; now
 * also reused by FreeRunRouteSelector during route generation. Two roles:
 *
 *   1. Visual confirmation that the tap was registered.
 *   2. An intentional delay tuned per CONTEXT (see `mode` prop):
 *        • partners → 3.0 s cold dismiss + 3.0 s ring/sweep cycle.
 *          The user is OK waiting; a longer scan reads as "we're really
 *          looking for the right matches".
 *        • routes   → 1.8 s cold dismiss + 1.8 s ring/sweep cycle.
 *          The user wants to GO RUN, so the scan is snappier — runner
 *          gets moving faster.
 *      Cached path is always 800 ms regardless of mode.
 *
 * Visual model — "expansive scan":
 *   • A compact 80 px disc anchors the focal point (sweep arm + center
 *     dot, both at full intensity throughout).
 *   • THREE staggered pulse rings expand from the disc out to 5x its
 *     diameter (~400 px), so the perceived radar coverage spans most of
 *     a phone screen. Each ring uses a multi-keyframe opacity ramp so
 *     it stays bright through the meaningful coverage area and fades
 *     smoothly to 0 only as it approaches RING_MAX_SCALE.
 *   • One full ring expansion = one full sweep arm rotation, so the two
 *     motions feel intrinsically linked at every tempo preset.
 *
 * Z-index sits at z-[68] — above PartnerBubbles (z-[65]) so the radar
 * covers the pills it's replacing. Higher than every discover-mode UI
 * surface but below the post-workout summary (z-[200]).
 */

import React, { useEffect } from 'react';
import { motion } from 'framer-motion';

/**
 * Radar tempo presets. The same animation runs in two contexts with
 * different cognitive loads:
 *
 *   'partners' — finding people. The user is OK waiting; a longer,
 *                more-thorough scan reads as "we're really looking for
 *                the right matches" and matches the social-discovery
 *                framing. RING+SWEEP = 3.0 s, cold dismiss = 3.0 s.
 *
 *   'routes'   — finding running routes. The user wants to GO RUN,
 *                so the scan is snappier. RING+SWEEP = 1.8 s, cold
 *                dismiss = 1.8 s. (Cached dismiss stays at 0.8 s for
 *                both — instant feedback for warm caches doesn't
 *                change with mode.)
 *
 * Cached path always takes precedence (0.8 s) regardless of mode.
 */
type RadarMode = 'partners' | 'routes';
interface RadarTimings {
  ringDurationS: number;
  sweepDurationS: number;
  coldTimeoutMs: number;
}
const TIMINGS: Record<RadarMode, RadarTimings> = {
  partners: { ringDurationS: 3.0, sweepDurationS: 3.0, coldTimeoutMs: 3000 },
  routes:   { ringDurationS: 1.8, sweepDurationS: 1.8, coldTimeoutMs: 1800 },
};

interface RadarAnimationProps {
  tab: 'live' | 'scheduled';
  onComplete: () => void;
  /** True when partner data is already in memory — shorten to 0.8s. */
  isCached: boolean;
  /**
   * Optional copy override. When provided, replaces the default tab-based
   * COPY map. Lets non-partner consumers (e.g. FreeRunRouteSelector) reuse
   * the same animation with their own status string while keeping
   * back-compat for the partner-finder call sites.
   */
  text?: string;
  /**
   * Tempo preset. See `TIMINGS` above for the full table. Defaults to
   * 'partners' so existing call-sites that pre-date this prop keep their
   * original behaviour without an opt-in.
   */
  mode?: RadarMode;
}

const ACCENT = '#00ADEF';
// Maximum scale the pulse rings reach. With the disc at 80px, 5x → 400px
// diameter — wide enough to span a phone screen but with enough fade-out
// that it doesn't look like a solid wall. Constant across both modes;
// only the TEMPO changes per mode.
const RING_MAX_SCALE = 5;

const COPY: Record<'live' | 'scheduled', string> = {
  live: 'מחפש מתאמנים קרוב אליך...',
  scheduled: 'מחפש אימונים מתוכננים...',
};

export function RadarAnimation({
  tab,
  onComplete,
  isCached,
  text,
  mode = 'partners',
}: RadarAnimationProps) {
  // Resolve the tempo preset once per render. Cheap object lookup; we
  // intentionally don't memoise because re-deriving on each render is
  // safer than risking a stale value when `mode` changes mid-flight.
  const timings = TIMINGS[mode];

  useEffect(() => {
    // Cold-start window comes from the mode preset (see TIMINGS table).
    // Cached path always wins at 800 ms regardless of mode — instant
    // feedback for warm caches is the same UX in both contexts.
    const timeoutMs = isCached ? 800 : timings.coldTimeoutMs;
    const t = setTimeout(onComplete, timeoutMs);
    return () => clearTimeout(t);
  }, [isCached, onComplete, timings.coldTimeoutMs]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[68] flex flex-col items-center justify-center pointer-events-auto"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      role="status"
      aria-live="polite"
    >
      {/* ── Radar disc ────────────────────────────────────────────────
          The disc itself stays at 80×80 — that's the visual anchor (sweep
          arm + center dot). The pulse rings expand OUTWARD from this disc
          to RING_MAX_SCALE×, so the perceived radar coverage is ~400 px
          while the focal point stays compact and crisp. */}
      <div className="relative flex items-center justify-center" style={{ width: 80, height: 80 }}>
        {/* Pulse rings — three staggered scale+fade waves. The rings are
            absolutely positioned to fill the disc, then transform-scale
            outward from their geometric center (which is the disc center,
            because inset-0 + rounded-full means the box is centered on the
            disc origin). Multi-keyframe opacity holds the ring visible for
            ~70 % of its travel before fading the last 30 % — the ring
            stays readable at the larger radius instead of fading out
            invisibly halfway through.

            origin-center forces the scale transform to grow symmetrically
            from the box's geometric center, which keeps the pulse exactly
            centered on the user-location dot at every frame. Defence in
            depth: framer-motion already defaults to this transform-origin
            for `scale`, but the explicit class makes the intent obvious. */}
        {[0, timings.ringDurationS / 3, (timings.ringDurationS / 3) * 2].map((delay, i) => {
          // Pre-compute scale stops aligned with the opacity keyframes so
          // framer-motion's `times` array applies cleanly to BOTH props.
          // Picking visually meaningful scale waypoints:
          //   t=0    → 1×        (born at the disc edge)
          //   t=0.3 → 30 % out   (entering the visible map area)
          //   t=0.7 → 80 % out   (the meat of the scan, still bright-ish)
          //   t=1   → max scale  (faded out, just before the next ring)
          const easedScale = (frac: number) =>
            1 + (RING_MAX_SCALE - 1) * frac;
          return (
            <motion.span
              key={`pulse_${i}_${mode}`}
              className="absolute inset-0 rounded-full pointer-events-none origin-center"
              style={{ border: `2px solid ${ACCENT}` }}
              initial={{ scale: 1, opacity: 0.7 }}
              animate={{
                scale: [1, easedScale(0.3), easedScale(0.8), RING_MAX_SCALE],
                opacity: [0.7, 0.55, 0.25, 0],
              }}
              transition={{
                duration: timings.ringDurationS,
                delay,
                repeat: Infinity,
                ease: 'easeOut',
                // Hold the ring near full opacity for the first ~30 % of
                // the travel (still close to the user), step down to mid-
                // bright as it crosses the visible map area, then ramp to
                // 0 as it approaches RING_MAX_SCALE — much smoother than
                // a single linear fade.
                times: [0, 0.3, 0.7, 1],
              }}
            />
          );
        })}

        {/* Base ring */}
        <div
          className="absolute inset-0 rounded-full"
          style={{ border: `2px solid ${ACCENT}`, opacity: 0.8 }}
        />

        {/* Sweep line — origin on left, rotates around center to mimic
            a radar arm. The element is half the disc width and offset so
            its rotation pivot sits exactly at the disc center. */}
        <motion.div
          className="absolute pointer-events-none"
          style={{
            top: '50%',
            left: '50%',
            width: 40,
            height: 2,
            backgroundColor: ACCENT,
            opacity: 0.6,
            transformOrigin: 'left center',
            // Pin pivot to the disc center: shift up by half of own height.
            translateY: -1,
          }}
          initial={{ rotate: 0 }}
          animate={{ rotate: 360 }}
          transition={{
            duration: timings.sweepDurationS,
            repeat: Infinity,
            ease: 'linear',
          }}
        />

        {/* Center dot */}
        <div
          className="absolute rounded-full"
          style={{
            top: '50%',
            left: '50%',
            width: 12,
            height: 12,
            marginTop: -6,
            marginLeft: -6,
            backgroundColor: ACCENT,
          }}
        />
      </div>

      {/* ── Status text ─────────────────────────────────────────────── */}
      <p
        className="text-white font-bold"
        style={{ fontSize: 14, marginTop: 24 }}
        dir="rtl"
      >
        {text ?? COPY[tab]}
      </p>
    </motion.div>
  );
}

export default RadarAnimation;
