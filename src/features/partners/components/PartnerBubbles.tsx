'use client';

/**
 * PartnerBubbles — two floating pill CTAs that surface the Partner Finder
 * directly on the map without taking over the screen.
 *
 * Visually centered horizontally, sitting at ~45% from top so they don't
 * collide with the map's bottom HUD or the search bar at the top. Tapping
 * a pill opens `PartnerOverlay` on the matching tab.
 *
 * z-index sits at z-[65] — above the curated-routes journey carousel (z-40)
 * and the Mapbox facility popups (z-50), but below the navigation hub
 * (z-[70]) and the search overlay (z-[100]). This is intentional — the
 * bubbles are dismissible-by-other-UI, not blocking.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { CalendarDays } from 'lucide-react';

interface PartnerBubblesProps {
  liveCount: number;
  scheduledCount: number;
  onSelectLive: () => void;
  onSelectScheduled: () => void;
}

export function PartnerBubbles({
  liveCount,
  scheduledCount,
  onSelectLive,
  onSelectScheduled,
}: PartnerBubblesProps) {
  return (
    <motion.div
      dir="rtl"
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={{ duration: 0.2 }}
      className="absolute left-1/2 -translate-x-1/2 z-[65] flex items-center gap-2.5 pointer-events-none"
      style={{ top: '45%' }}
    >
      <button
        type="button"
        onClick={onSelectLive}
        className="pointer-events-auto flex items-center gap-2.5 bg-white rounded-full active:scale-95 transition-transform"
        style={{
          padding: '10px 18px',
          border: '0.5px solid rgba(0,0,0,0.12)',
        }}
        aria-label={`מי בחוץ — ${liveCount} מתאמנים פעילים`}
      >
        <span className="relative inline-flex items-center justify-center" style={{ width: 8, height: 8 }}>
          <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-500 opacity-70 animate-ping" />
          <span className="relative inline-flex w-full h-full rounded-full bg-emerald-500" />
        </span>
        <span className="text-[13px] font-black text-gray-900 leading-none">מי בחוץ</span>
        <span
          className="text-[11px] font-black text-white rounded-full leading-none flex items-center justify-center min-w-[20px] h-5 px-1.5"
          style={{ backgroundColor: '#00ADEF' }}
        >
          {liveCount}
        </span>
      </button>

      <button
        type="button"
        onClick={onSelectScheduled}
        className="pointer-events-auto flex items-center gap-2.5 bg-white rounded-full active:scale-95 transition-transform"
        style={{
          padding: '10px 18px',
          border: '0.5px solid rgba(0,0,0,0.12)',
        }}
        aria-label={`מי מתכנן — ${scheduledCount} אימונים מתוכננים`}
      >
        <CalendarDays size={16} className="text-gray-700" aria-hidden />
        <span className="text-[13px] font-black text-gray-900 leading-none">מי מתכנן</span>
        <span
          className="text-[11px] font-black text-white rounded-full leading-none flex items-center justify-center min-w-[20px] h-5 px-1.5"
          style={{ backgroundColor: '#EF9F27' }}
        >
          {scheduledCount}
        </span>
      </button>
    </motion.div>
  );
}

export default PartnerBubbles;
