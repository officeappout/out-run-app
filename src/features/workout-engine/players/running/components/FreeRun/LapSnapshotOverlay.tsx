'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { formatPace } from '@/features/workout-engine/core/utils/formatPace';

const formatTime = (seconds: number): string => {
  if (!seconds || seconds < 0 || !isFinite(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export default function LapSnapshotOverlay() {
  const { isSnapshotVisible, lastCompletedLap, hideSnapshot } = useRunningPlayer();

  // Auto-hide after 3 seconds
  useEffect(() => {
    if (isSnapshotVisible && lastCompletedLap) {
      const timer = setTimeout(() => {
        hideSnapshot();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isSnapshotVisible, lastCompletedLap, hideSnapshot]);

  // Only render if we have both visibility flag and lap data
  if (!isSnapshotVisible || !lastCompletedLap) return null;

  const distanceKm = ((lastCompletedLap.distanceMeters || 0) / 1000).toFixed(2);
  const pace = formatPace(lastCompletedLap.splitPace);
  const time = formatTime(lastCompletedLap.durationSeconds || 0);

  return (
    <AnimatePresence>
      {isSnapshotVisible && lastCompletedLap && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 flex items-center justify-center z-[10000] pointer-events-none"
          style={{ fontFamily: 'Assistant, sans-serif' }}
        >
          {/* Backdrop with blur */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          
          {/* Centered Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -50 }}
            transition={{
              type: 'spring',
              stiffness: 300,
              damping: 25,
              duration: 0.3,
            }}
            className="relative bg-white rounded-xl border-2 border-[#00ADEF] shadow-2xl px-6 py-5 min-w-[320px] max-w-[90vw]"
          >
            <div className="flex items-center justify-between gap-4">
              {/* Lap Number (Blue Circle) */}
              <div className="flex-shrink-0">
                <div className="w-14 h-14 rounded-full bg-[#00ADEF] flex items-center justify-center">
                  <span className="text-white font-black text-xl">{lastCompletedLap.lapNumber}</span>
                </div>
              </div>

              {/* Metrics */}
              <div className="flex-1 flex items-center justify-between gap-4">
                {/* Time */}
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900">{time}</div>
                  <div className="text-xs text-gray-500 mt-1">זמן</div>
                </div>

                {/* Pace */}
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900">{pace}</div>
                  <div className="text-xs text-gray-500 mt-1">קצב</div>
                </div>

                {/* Distance */}
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900">{distanceKm}</div>
                  <div className="text-xs text-gray-500 mt-1">ק"מ</div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
