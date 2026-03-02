'use client';

import React from 'react';
import { motion } from 'framer-motion';
import type { PresenceMarker } from '../services/segregation.service';
import { getActivityVisual, getLemurAsset } from '../utils/activity-icon';

interface LiveFriendMarkerProps {
  marker: PresenceMarker;
  size?: number;
  onClick?: (marker: PresenceMarker) => void;
}

export default function LiveFriendMarker({ marker, size = 48, onClick }: LiveFriendMarkerProps) {
  const isActive = !!marker.activity;
  const activityVisual = getActivityVisual(marker.activity?.status);
  const level = marker.level ?? 1;
  const imagePath = getLemurAsset(marker.activity?.status);

  return (
    <button
      onClick={() => onClick?.(marker)}
      className="relative flex items-center justify-center cursor-pointer outline-none border-none bg-transparent"
      style={{ width: size + 16, height: size + 16 }}
      aria-label={`${marker.name} – Level ${level}`}
    >
      {/* Cyan pulse ring (only when actively training) */}
      {isActive && (
        <motion.div
          className="absolute rounded-full"
          style={{
            width: size + 14,
            height: size + 14,
            border: '2.5px solid #00BAF7',
          }}
          animate={{ scale: [1, 1.3, 1], opacity: [0.8, 0, 0.8] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      {/* Lemur avatar */}
      <motion.div
        animate={isActive ? { scale: [1, 1.06, 1] } : undefined}
        transition={isActive ? { duration: 2, repeat: Infinity, ease: 'easeInOut' } : undefined}
        className="relative"
        style={{ width: size, height: size }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imagePath}
          alt={marker.name}
          width={size}
          height={size}
          className="rounded-full object-cover border-2 border-white shadow-lg"
          style={{ filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.25))' }}
        />
      </motion.div>

      {/* Activity badge — emoji floats top-left */}
      {isActive && activityVisual && (
        <motion.div
          className="absolute flex items-center justify-center rounded-full shadow-md"
          style={{
            top: 0,
            left: 0,
            width: 22,
            height: 22,
            background: activityVisual.badgeColor,
            fontSize: 12,
            lineHeight: 1,
          }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
        >
          {activityVisual.emoji}
        </motion.div>
      )}

      {/* Level badge — cyan pill bottom-right */}
      <div
        className="absolute flex items-center justify-center rounded-full shadow-sm"
        style={{
          bottom: 2,
          right: 2,
          width: 22,
          height: 16,
          background: '#00BAF7',
          border: '1.5px solid white',
        }}
      >
        <span className="text-[9px] font-black text-white leading-none">{level}</span>
      </div>

      {/* Name label below */}
      <div
        className="absolute text-center whitespace-nowrap"
        style={{ bottom: -14, left: '50%', transform: 'translateX(-50%)' }}
      >
        <span className="text-[10px] font-semibold text-gray-800 bg-white/80 px-1.5 py-0.5 rounded-md shadow-sm">
          {marker.name}
        </span>
      </div>
    </button>
  );
}
