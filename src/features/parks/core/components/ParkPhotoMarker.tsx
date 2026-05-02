'use client';

/**
 * ParkPhotoMarker — "Game Mode" photo pin for parks in Walking mode.
 * ----------------------------------------------------------------------
 * Reuses the `react-map-gl` `<Marker>` + DOM-child pattern documented
 * by `LemurMarker` / `PartnerMarker` (see investigation report). Mounted
 * by `AppMap.tsx` only when `activityType === 'walking'` and
 * `currentZoom >= 14`. In running mode the existing `park-pins`
 * SymbolLayer keeps rendering the lighter vector pin — that's the
 * "athletic / minimal" affordance.
 *
 * Visual recipe:
 *   • Circular badge (default 56 px) with the park's cover photo,
 *     `object-cover` cropped to fill.
 *   • `border-4 border-white` ring + heavy `shadow-xl` so the pin
 *     pops against any map tile (light or dark satellite).
 *   • White CSS triangle (10 px tall) underneath the circle so the
 *     marker reads as a physical pin pinned to the ground point.
 *   • `<Marker anchor="bottom">` is set by the caller so the triangle
 *     tip sits exactly on the park coordinate.
 *
 * Billboard behaviour:
 *   `react-map-gl` markers are HTML overlays composited above the
 *   canvas. They DO NOT rotate / pitch with the map by default, so
 *   the photo always faces the camera ("billboard" out of the box).
 *   No extra Mapbox layout config is needed.
 *
 * Photo resolution + fallback:
 *   The caller passes a single `photoUrl` (already resolved from
 *   `park.imageUrl || park.image || park.images?.[0]`). On <img>
 *   onError we swap to a tree-emoji fallback drawn over a soft
 *   green gradient so we never show a broken-image icon.
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';

interface ParkPhotoMarkerProps {
  /** Park name — used as alt text for accessibility. */
  name: string;
  /** Pre-resolved cover photo URL. May be undefined → emoji fallback. */
  photoUrl?: string | null;
  /** Outer diameter of the circular badge in px. */
  size?: number;
  /** Highlights the marker (selected / focused). Adds a cyan ring + scale. */
  isSelected?: boolean;
  /** Click handler — typically opens the park preview sheet. */
  onClick?: () => void;
}

const FALLBACK_BG =
  'linear-gradient(135deg, #6ee7b7 0%, #34d399 60%, #10b981 100%)';

export default function ParkPhotoMarker({
  name,
  photoUrl,
  size = 56,
  isSelected = false,
  onClick,
}: ParkPhotoMarkerProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const showFallback = !photoUrl || imgFailed;

  const tailHeight = Math.round(size * 0.18); // ≈ 10 px for size 56
  const tailHalfWidth = Math.round(size * 0.13); // ≈ 7 px for size 56

  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={name}
      className="flex flex-col items-center cursor-pointer outline-none border-none bg-transparent"
      style={{
        // Tail-tip is the anchor; this padding doesn't affect Mapbox
        // anchor math because <Marker anchor="bottom"> uses the bottom
        // edge of THIS button as the geographic point.
        padding: 0,
        // `bottom center` keeps the tail tip pinned to the geographic
        // coordinate while the badge scales in/out — feels like the pin
        // grows OUT of the ground rather than parachuting in.
        transformOrigin: 'bottom center',
      }}
      // Spring entrance: snappy "pop" when this marker mounts (i.e. when
      // a park gets selected and the bubble takes over from the vector
      // pin). Damping/stiffness tuned to land in ~250 ms with a tiny
      // overshoot so it reads as a confident promotion, not a jiggle.
      initial={{ scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.4, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 22, mass: 0.6 }}
      whileTap={{ scale: 0.95 }}
    >
      {/* Circular photo badge ───────────────────────────────────────
          `border-4 border-white` is the requested heavy white ring.
          shadow-xl + drop-shadow stack so the pin reads on busy
          satellite imagery as well as flat vector tiles. */}
      <div
        className="relative rounded-full overflow-hidden border-4 border-white shadow-xl"
        style={{
          width: size,
          height: size,
          background: FALLBACK_BG,
          // Outer cyan glow when selected — premium "game mode" feedback.
          // The selected case is the only scenario where this component
          // mounts now (single-highlight rule), so the glow is effectively
          // always-on — kept conditional for forward-compat.
          boxShadow: isSelected
            ? '0 0 0 3px rgba(0,229,255,0.85), 0 6px 14px rgba(0,0,0,0.35)'
            : '0 4px 10px rgba(0,0,0,0.28)',
        }}
      >
        {showFallback ? (
          // Centred tree emoji on green gradient — readable at 56 px
          // and degrades gracefully if the device font set lacks the
          // colour-emoji glyph (still shows a black/white tree).
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ fontSize: Math.round(size * 0.55), lineHeight: 1 }}
          >
            🌳
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl as string}
            alt={name}
            width={size}
            height={size}
            className="w-full h-full object-cover"
            draggable={false}
            onError={() => setImgFailed(true)}
          />
        )}
      </div>

      {/* Pin tail ───────────────────────────────────────────────────
          A pure-CSS triangle (no SVG) drawn directly under the
          circle. The tip points down so the marker "plants" on the
          park's geographic point when used with anchor="bottom". A
          subtle drop-shadow matches the badge above so the two
          shapes feel like one continuous pin silhouette. */}
      <div
        aria-hidden="true"
        style={{
          width: 0,
          height: 0,
          marginTop: -2, // tuck the tail flush against the bottom of the badge
          borderLeft: `${tailHalfWidth}px solid transparent`,
          borderRight: `${tailHalfWidth}px solid transparent`,
          borderTop: `${tailHeight}px solid #ffffff`,
          filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.25))',
        }}
      />
    </motion.button>
  );
}
