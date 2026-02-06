'use client';

import { motion } from 'framer-motion';
import { Lap } from '@/features/workout-engine/core/types/session.types';

interface LapTableBlockProps {
  laps: Lap[];
}

export default function LapTableBlock({ laps }: LapTableBlockProps) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatPace = (pace: number) => {
    if (!pace || pace === Infinity || pace <= 0) return '0:00';
    const mins = Math.floor(pace);
    const secs = Math.round((pace % 1) * 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Filter out active lap if it has no distance
  const completedLaps = laps.filter(
    (lap) => !lap.isActive || lap.distanceMeters > 0
  );

  if (completedLaps.length === 0) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className="bg-white rounded-xl shadow-sm p-6 mb-6"
      style={{ fontFamily: 'var(--font-simpler)' }}
    >
      <h3 className="text-xl font-black text-gray-900 mb-4">הקפות</h3>
      <div className="space-y-3">
        {completedLaps.map((lap) => (
          <div
            key={lap.id}
            className={`flex items-center px-6 py-4 rounded-xl border-2 transition-all ${
              lap.isActive
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-100 bg-gray-50'
            }`}
          >
            {/* Lap Number */}
            <div className="flex-1 text-end">
              <span
                className={`text-lg font-black ${
                  lap.isActive ? 'text-blue-600' : 'text-gray-900'
                }`}
              >
                {lap.lapNumber}
              </span>
              <span className="text-xs text-gray-500 font-bold me-2 uppercase">
                הקפה
              </span>
            </div>

            {/* Distance */}
            <div className="flex-1 text-center">
              <div className="text-lg font-black text-gray-900">
                {(lap.distanceMeters / 1000).toFixed(2)}
              </div>
              <div className="text-xs text-gray-500 font-bold uppercase">ק"מ</div>
            </div>

            {/* Avg Pace */}
            <div className="flex-1 text-center">
              <div className="text-lg font-black text-gray-900">
                {formatPace(lap.splitPace)}
              </div>
              <div className="text-xs text-gray-500 font-bold uppercase">קצב</div>
            </div>

            {/* Time */}
            <div className="flex-1 text-start">
              <div className="text-lg font-black text-gray-900">
                {formatTime(lap.durationSeconds)}
              </div>
              <div className="text-xs text-gray-500 font-bold uppercase">זמן</div>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
