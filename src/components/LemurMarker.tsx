'use client';

import React from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';

interface LemurMarkerProps {
  size?: number; // Size in pixels (default: 40)
  className?: string;
}

/**
 * LemurMarker Component
 * Displays a lemur avatar with a gentle breathing animation for map markers
 * 
 * Uses the king-lemur.png image from /public/assets/lemur/
 */
export default function LemurMarker({ size = 40, className = '' }: LemurMarkerProps) {
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
          type: "tween" // Use tween instead of spring for 3-step animation
        }}
        className="relative w-full h-full"
      >
        <Image
          src="/assets/lemur/king-lemur.png"
          alt="User Location"
          width={size}
          height={size}
          className="rounded-full object-cover border-2 border-white shadow-xl drop-shadow-lg"
          style={{ 
            filter: 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.3))'
          }}
          priority
        />
      </motion.div>
    </div>
  );
}
