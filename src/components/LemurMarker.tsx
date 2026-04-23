'use client';

import React from 'react';
import { motion } from 'framer-motion';
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
      <motion.div
        animate={{ 
          scale: [1, 1.05, 1]
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
          type: "tween"
        }}
        className="relative w-full h-full"
      >
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
      </motion.div>
    </div>
  );
}
