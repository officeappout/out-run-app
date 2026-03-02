'use client';

import React from 'react';
import { ShieldCheck } from 'lucide-react';
import type { PresenceMarker } from '../services/segregation.service';

interface LiveAvatarProps {
  marker: PresenceMarker;
  onClick?: () => void;
}

export default function LiveAvatar({ marker, onClick }: LiveAvatarProps) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-0.5 group"
      style={{ transform: 'translate(-50%, -100%)' }}
    >
      {/* Avatar bubble */}
      <div className="relative">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-black shadow-lg border-2 ${
            marker.isVerified
              ? 'border-cyan-400 bg-gradient-to-br from-cyan-500 to-blue-600'
              : 'border-white bg-gradient-to-br from-gray-400 to-gray-500'
          }`}
        >
          {marker.name.charAt(0)}
        </div>

        {/* Verified badge */}
        {marker.isVerified && (
          <div className="absolute -top-1 -right-1 w-4.5 h-4.5 bg-white rounded-full flex items-center justify-center shadow-sm">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-500" />
          </div>
        )}

        {/* Pulse ring for active presence */}
        <div className="absolute inset-0 rounded-full border-2 border-cyan-400/40 animate-ping" />
      </div>

      {/* Name + school label */}
      <div className="bg-white/95 backdrop-blur-sm rounded-lg px-2 py-0.5 shadow-md border border-gray-100 max-w-[120px]">
        <p className="text-[10px] font-bold text-gray-900 truncate text-center" dir="rtl">
          {marker.name.split(' ')[0]}
        </p>
        {marker.isVerified && marker.schoolName && (
          <p className="text-[8px] text-cyan-600 font-bold truncate text-center">
            {marker.schoolName}
          </p>
        )}
      </div>
    </button>
  );
}
