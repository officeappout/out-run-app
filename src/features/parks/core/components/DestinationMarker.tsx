'use client';

/**
 * DestinationMarker — premium "you're heading here" pin for commute mode.
 *
 * Matches the visual language of `ParkPhotoMarker` (rounded squircle,
 * cyan accent, soft drop shadow, anchored at the bottom tip on a
 * geographic point) but renders a flag icon instead of a photo so the
 * intent reads as "destination" rather than "place of interest".
 *
 * Animations:
 *   • Continuous slow pulse (`scale 1 → 1.06 → 1`, 2 s loop) signals
 *     "live target" without screaming for attention.
 *   • Outer halo ring runs the inverse pulse so the two halves stay
 *     visually balanced.
 *
 * Z-index sits inside the Mapbox <Marker> overlay layer — same plane
 * as ParkPhotoMarker — so the existing layer stack ordering applies.
 *
 * The optional `label` is rendered as a tiny chip ABOVE the pin
 * (e.g. the user's typed address or saved place name). Truncated at
 * 26 chars for visual balance against the icon footprint.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Flag } from 'lucide-react';

interface DestinationMarkerProps {
  /** Optional label rendered above the pin (e.g. "תל אביב, הרצל 14"). */
  label?: string;
  /** Click handler — defaults to a no-op. Useful for future "route summary" sheets. */
  onClick?: () => void;
}

const ACCENT = '#00ADEF';
const ACCENT_BRIGHT = '#00E5FF';

export default function DestinationMarker({ label, onClick }: DestinationMarkerProps) {
  // Truncate at 26 chars — keeps the chip visually compact and matches
  // the typical "city, street" geocoder result length.
  const display = label && label.length > 26 ? `${label.slice(0, 25)}…` : label;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label ? `יעד: ${label}` : 'יעד'}
      className="relative flex flex-col items-center pointer-events-auto"
      style={{ background: 'transparent', border: 'none', padding: 0 }}
    >
      {/* Label chip — only when a label is supplied. */}
      {display && (
        <div
          dir="rtl"
          className="mb-1 px-2 py-0.5 rounded-full text-[11px] font-black text-white whitespace-nowrap shadow-[0_4px_10px_rgba(0,0,0,0.18)]"
          style={{
            backgroundColor: ACCENT,
            // Tail/triangle pointing down to the pin — pure CSS so we
            // don't need an extra SVG file shipped just for the chip.
            position: 'relative',
          }}
        >
          {display}
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              bottom: -4,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '4px solid transparent',
              borderRight: '4px solid transparent',
              borderTop: `4px solid ${ACCENT}`,
            }}
          />
        </div>
      )}

      {/* Outer halo — inverse-pulsing ring for ambient "live" effect. */}
      <motion.span
        aria-hidden="true"
        className="absolute rounded-full"
        style={{
          // Centred on the pin core; size matches the inner squircle.
          bottom: 4,
          width: 56,
          height: 56,
          background: `radial-gradient(circle, ${ACCENT_BRIGHT}55 0%, ${ACCENT_BRIGHT}00 70%)`,
          transformOrigin: 'center',
        }}
        animate={{ scale: [1, 1.18, 1], opacity: [0.85, 0.45, 0.85] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Pin core — squircle + flag icon, gently pulsing. */}
      <motion.div
        className="relative flex items-center justify-center text-white"
        style={{
          width: 44,
          height: 44,
          background: `linear-gradient(135deg, ${ACCENT_BRIGHT} 0%, ${ACCENT} 100%)`,
          borderRadius: 14,
          boxShadow:
            '0 6px 18px rgba(0, 173, 239, 0.45), 0 2px 6px rgba(0, 0, 0, 0.18)',
          border: '2px solid #FFFFFF',
        }}
        animate={{ scale: [1, 1.06, 1] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Flag size={20} fill="white" strokeWidth={2.4} />
      </motion.div>

      {/* Tail — small triangle that anchors the pin tip on the geo point.
          Mapbox <Marker anchor="bottom"> aligns the bottom edge of THIS
          element to the lat/lng, so the tail bottom is the actual point. */}
      <span
        aria-hidden="true"
        style={{
          width: 0,
          height: 0,
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderTop: `8px solid ${ACCENT}`,
          marginTop: -2,
          filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.15))',
        }}
      />
    </button>
  );
}
