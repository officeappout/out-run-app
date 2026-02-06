'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { formatPace } from '@/features/workout-engine/core/utils/formatPace';

const formatTime = (seconds: number): string => {
  if (!seconds || seconds < 0 || !isFinite(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export default function RunLapsList() {
  const { laps } = useRunningPlayer();
  
  // Force re-render every second to update live data
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      forceUpdate((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Show ALL laps including active one, reversed to show most recent first
  const allLaps = [...laps].reverse();

  if (allLaps.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-white" style={{ fontFamily: 'var(--font-simpler)' }}>
        <div className="text-center text-gray-400">
          <p className="text-lg font-medium mb-2">אין הקפות עדיין</p>
          <p className="text-sm">ההקפות יופיעו כאן לאחר התחלת האימון</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-white overflow-y-auto" style={{ fontFamily: 'var(--font-simpler)' }}>
      {/* Table Header */}
      <div className="sticky top-0 bg-white border-b border-gray-200 z-10 px-6 py-4">
        <div className="flex items-center text-right text-xs font-bold text-gray-500 uppercase tracking-wider">
          <div className="flex-1 text-center">הקפה</div>
          <div className="flex-1 text-center">מרחק ק"מ</div>
          <div className="flex-1 text-center">קצב דק' / ק"מ</div>
          <div className="flex-1 text-center">זמן דק'</div>
        </div>
      </div>

      {/* Table Body */}
      <div className="px-6 py-4 space-y-3">
        {allLaps.map((lap) => {
          const isActive = lap.isActive;
          const distanceKm = ((lap.distanceMeters || 0) / 1000).toFixed(2);
          const pace = formatPace(lap.splitPace || 0);
          const time = formatTime(lap.durationSeconds || 0);

          return (
            <motion.div
              key={lap.id}
              className={`flex items-center py-4 px-4 rounded-xl border transition-colors ${
                isActive
                  ? 'border-[#00ADEF] bg-[#00ADEF]/5 shadow-sm'
                  : 'border-gray-100 bg-white hover:bg-gray-50'
              }`}
              animate={isActive ? {
                boxShadow: [
                  '0 0 0 0 rgba(0, 173, 239, 0.4)',
                  '0 0 0 4px rgba(0, 173, 239, 0)',
                  '0 0 0 0 rgba(0, 173, 239, 0)',
                ],
              } : {}}
              transition={{
                duration: 2,
                repeat: isActive ? Infinity : 0,
                ease: 'easeInOut',
              }}
            >
              {/* Lap Number - Blue Circle with LIVE indicator */}
              <div className="flex-1 text-center relative">
                <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full text-white font-black text-lg ${
                  isActive ? 'bg-[#00ADEF]' : 'bg-[#00ADEF]'
                }`}>
                  {lap.lapNumber}
                </div>
                {isActive && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: [0.5, 1, 0.5], scale: [0.9, 1, 0.9] }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                    className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  >
                    LIVE
                  </motion.div>
                )}
              </div>

              {/* Distance */}
              <div className="flex-1 text-center">
                <div className={`text-lg font-bold ${
                  isActive ? 'text-[#00ADEF]' : 'text-gray-900'
                }`}>
                  {distanceKm}
                </div>
              </div>

              {/* Pace */}
              <div className="flex-1 text-center">
                <div className={`text-lg font-bold ${
                  isActive ? 'text-[#00ADEF]' : 'text-gray-900'
                }`}>
                  {pace}
                </div>
              </div>

              {/* Time */}
              <div className="flex-1 text-center">
                <div className={`text-lg font-bold ${
                  isActive ? 'text-[#00ADEF]' : 'text-gray-900'
                }`}>
                  {time}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
