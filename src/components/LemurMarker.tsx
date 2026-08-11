'use client';

import React from 'react';
import { resolvePersonaImage } from '@/features/parks/core/hooks/useGroupPresence';

interface LemurMarkerProps {
  size?: number;
  className?: string;
  /** Persona ID from user profile — resolves to the correct lemur character image */
  personaId?: string | null;
}

export default function LemurMarker({ size = 40, className = '', personaId }: LemurMarkerProps) {
  const imgSrc = resolvePersonaImage(personaId);

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
          src={imgSrc}
          alt="User Location"
          width={size}
          height={size}
          className="rounded-full object-cover border-2 border-white shadow-xl drop-shadow-lg"
          style={{
            width: size,
            height: size,
            filter: 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.3))',
          }}
        />
      </div>
    </div>
  );
}
