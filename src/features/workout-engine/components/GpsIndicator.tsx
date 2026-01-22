'use client';

import React from 'react';
import { motion } from 'framer-motion';

export type GpsStatus = 'searching' | 'poor' | 'good' | 'perfect';

interface GpsIndicatorProps {
  accuracy: number | null;
  status: GpsStatus;
}

/**
 * GPS Signal Indicator Component
 * Displays GPS signal strength with color-coded status and glassmorphism design
 */
export default function GpsIndicator({ accuracy, status }: GpsIndicatorProps) {
  // Determine color and text based on status
  const getStatusConfig = () => {
    switch (status) {
      case 'perfect':
        return {
          dotColor: 'bg-green-500',
          textColor: 'text-green-700',
          bgColor: 'bg-green-500/20',
          borderColor: 'border-green-500/30',
          text: 'קליטה מעולה',
        };
      case 'good':
        return {
          dotColor: 'bg-yellow-500',
          textColor: 'text-yellow-700',
          bgColor: 'bg-yellow-500/20',
          borderColor: 'border-yellow-500/30',
          text: 'קליטה טובה',
        };
      case 'poor':
        return {
          dotColor: 'bg-red-500',
          textColor: 'text-red-700',
          bgColor: 'bg-red-500/20',
          borderColor: 'border-red-500/30',
          text: 'קליטה חלשה',
        };
      case 'searching':
      default:
        return {
          dotColor: 'bg-red-500',
          textColor: 'text-red-700',
          bgColor: 'bg-red-500/20',
          borderColor: 'border-red-500/30',
          text: 'מחפש GPS...',
        };
    }
  };

  const config = getStatusConfig();

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`
        flex items-center gap-2 px-3 py-1.5 rounded-full
        ${config.bgColor} ${config.borderColor} border
        backdrop-blur-md shadow-lg
        pointer-events-auto
      `}
      dir="rtl"
    >
      {/* Pulsing Dot */}
      <div className="relative flex-shrink-0">
        <motion.div
          className={`w-2 h-2 ${config.dotColor} rounded-full`}
          animate={{
            scale: [1, 1.2, 1],
            opacity: [1, 0.7, 1],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
        {/* Outer pulse ring */}
        <motion.div
          className={`absolute inset-0 ${config.dotColor} rounded-full`}
          animate={{
            scale: [1, 2, 1],
            opacity: [0.5, 0, 0.5],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      </div>

      {/* Status Text */}
      <span className={`text-xs font-semibold ${config.textColor} whitespace-nowrap`}>
        {config.text}
      </span>

      {/* Accuracy Display (optional, if accuracy is available) */}
      {accuracy !== null && status !== 'searching' && (
        <span className={`text-[10px] ${config.textColor}/70 font-medium`}>
          {accuracy.toFixed(0)}m
        </span>
      )}
    </motion.div>
  );
}
