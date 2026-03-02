'use client';

/**
 * SafeCityOverlay — renders on top of the map.
 * Shows live avatars, a heatmap indicator badge, and the privacy mode FAB.
 *
 * This component doesn't own the Mapbox instance — it receives
 * `currentLocation` from the parent and renders absolute-positioned
 * elements. A future iteration can use Mapbox custom markers for
 * geo-accurate placement; this first version uses a scrollable
 * horizontal strip at the bottom of the map for discovered users.
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, ShieldCheck, Eye } from 'lucide-react';
import PrivacyModeSwitcher from './PrivacyModeSwitcher';
import type { PresenceMarker } from '../services/segregation.service';
import type { PrivacyMode } from '../store/usePrivacyStore';

interface SafeCityOverlayProps {
  markers: PresenceMarker[];
  heatmapCount: number;
  privacyMode: PrivacyMode;
  ageGroup: 'minor' | 'adult';
  onMarkerTap?: (marker: PresenceMarker) => void;
}

export default function SafeCityOverlay({
  markers,
  heatmapCount,
  privacyMode,
  ageGroup,
  onMarkerTap,
}: SafeCityOverlayProps) {
  return (
    <>
      {/* Privacy FAB — bottom-left */}
      <div className="absolute bottom-28 left-4 z-20">
        <PrivacyModeSwitcher />
      </div>

      {/* Status badge — top-right */}
      <div className="absolute top-4 left-4 z-20 flex flex-col gap-2" dir="rtl">
        {/* Mode indicator */}
        <div className="bg-white/90 backdrop-blur-sm rounded-xl px-3 py-1.5 shadow-md border border-gray-100 flex items-center gap-2">
          <Eye className="w-3.5 h-3.5 text-gray-500" />
          <span className="text-[10px] font-bold text-gray-700">
            {privacyMode === 'ghost'
              ? 'מצב רוח — לא נראה'
              : privacyMode === 'squad'
                ? `חברים — ${markers.length} סביבך`
                : `גלובלי — ${markers.length} מאומתים`}
          </span>
        </div>

        {/* Heatmap badge */}
        {heatmapCount > 0 && (
          <div className="bg-white/90 backdrop-blur-sm rounded-xl px-3 py-1.5 shadow-md border border-gray-100 flex items-center gap-2">
            <Flame className="w-3.5 h-3.5 text-orange-500" />
            <span className="text-[10px] font-bold text-gray-700">
              {heatmapCount} פעילים באזור
            </span>
          </div>
        )}
      </div>

      {/* Live user strip — bottom horizontal scroll */}
      <AnimatePresence>
        {markers.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-20 left-0 right-0 z-10 px-3"
          >
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {markers.map((m) => (
                <button
                  key={m.uid}
                  onClick={() => onMarkerTap?.(m)}
                  className="flex-shrink-0 bg-white/95 backdrop-blur-sm rounded-2xl px-3 py-2 shadow-lg border border-gray-100 flex items-center gap-2.5 active:scale-95 transition-transform"
                  dir="rtl"
                >
                  {/* Avatar */}
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-black ${
                      m.isVerified
                        ? 'bg-gradient-to-br from-cyan-500 to-blue-600 ring-2 ring-cyan-300'
                        : 'bg-gradient-to-br from-gray-400 to-gray-500'
                    }`}
                  >
                    {m.name.charAt(0)}
                  </div>

                  {/* Info */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="text-xs font-bold text-gray-900 truncate max-w-[80px]">
                        {m.name.split(' ')[0]}
                      </p>
                      {m.isVerified && (
                        <ShieldCheck className="w-3 h-3 text-cyan-500 flex-shrink-0" />
                      )}
                    </div>
                    {m.schoolName && (
                      <p className="text-[9px] text-cyan-600 font-bold truncate max-w-[80px]">
                        {m.schoolName}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
