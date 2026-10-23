'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  resolvePersonaMarkerImage,
  preloadLemurMarkerImages,
  isLemurMarkerImageReady,
} from '@/features/parks/core/lib/lemurMarkerImages';

interface LemurMarkerProps {
  size?: number;
  className?: string;
  /** Persona ID from user profile — resolves to the correct lemur character image */
  personaId?: string | null;
}

/** Shown under the <img> only until it has loaded — a soft lemur-grey disc, so
 *  the marker is never an empty ring. Removed on load ⇒ final look unchanged. */
export const LEMUR_MARKER_PLACEHOLDER_BG = 'radial-gradient(circle at 50% 40%, #E5E7EB 0%, #9CA3AF 100%)';

export default function LemurMarker({ size = 40, className = '', personaId }: LemurMarkerProps) {
  // Marker-sized (156 px) art — not the 1587x2245 full artwork (see lemurMarkerImages.ts).
  const imgSrc = resolvePersonaMarkerImage(personaId);
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(() => isLemurMarkerImageReady(imgSrc));

  // Idempotent: a no-op once ClientLayout / AppMap already warmed the cache.
  useEffect(() => { preloadLemurMarkerImages(); }, []);

  // Persona can resolve after mount (profile arrives) ⇒ new src. Re-derive
  // readiness; also catch an <img> that completed before React attached onLoad.
  useEffect(() => {
    const el = imgRef.current;
    setLoaded(isLemurMarkerImageReady(imgSrc) || (!!el && el.complete && el.naturalWidth > 0));
  }, [imgSrc]);

  return (
    <div
      className={`relative flex items-center justify-center ${className}`}
      style={{ width: `${size}px`, height: `${size}px` }}
    >
      {/* Breathing scale animation removed (perf/heat, 11.08.2026): an unconditional
          framer-motion repeat:Infinity loop on the user's OWN marker — always mounted
          whenever the map is open, idle or navigating. Same bug class as the partner-
          marker animate-ping already removed (PartnerMarker.tsx). Do not re-add without
          gating (e.g. only while actively selected/following). */}
      <div className="relative w-full h-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={imgSrc}
          alt="User Location"
          width={size}
          height={size}
          decoding="async"
          loading="eager"
          data-loaded={loaded ? 'true' : 'false'}
          onLoad={() => setLoaded(true)}
          className="rounded-full object-cover border-2 border-white shadow-xl drop-shadow-lg"
          style={{
            width: size,
            height: size,
            filter: 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.3))',
            ...(loaded ? null : { background: LEMUR_MARKER_PLACEHOLDER_BG }),
          }}
        />
      </div>
    </div>
  );
}
