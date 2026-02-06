'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Activity, Coins, Flame, Clock } from 'lucide-react';
import { WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';
import { IS_COIN_SYSTEM_ENABLED } from '@/config/feature-flags';

interface ActivityHistoryCardProps {
  workout: WorkoutHistoryEntry;
  onClick: () => void;
}

export default function ActivityHistoryCard({ workout, onClick }: ActivityHistoryCardProps) {
  // Format date in Hebrew - short format: "יום ה', 22 ינו' • 20:45"
  const formatDate = (date: Date): string => {
    const dayLetters = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
    const dayLetter = dayLetters[date.getDay()];
    const day = date.getDate();
    const monthAbbrs = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יונ', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];
    const monthAbbr = monthAbbrs[date.getMonth()];
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `יום ${dayLetter}', ${day} ${monthAbbr}' • ${hours}:${minutes}`;
  };

  // Format duration as MM:SS
  const formatDuration = (seconds: number): string => {
    if (!seconds || seconds < 0 || !isFinite(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Get workout type label
  const getWorkoutTypeLabel = (): string => {
    switch (workout.workoutType) {
      case 'walking':
        return 'הליכה';
      case 'cycling':
        return 'רכיבה';
      case 'hybrid':
        return 'אימון משולב';
      default:
        return 'פעילות';
    }
  };

  const workoutDate = workout.date instanceof Date ? workout.date : new Date(workout.date);

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="w-full bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all text-right"
      dir="rtl"
    >
      <div className="flex flex-row gap-4 p-4">
        {/* Left: Activity Icon */}
        <div className="w-24 h-24 rounded-lg overflow-hidden bg-gradient-to-br from-blue-100 to-blue-200 flex-shrink-0 flex items-center justify-center">
          <Activity size={32} className="text-blue-600" />
        </div>

        {/* Right: Workout Details */}
        <div className="flex-1 flex flex-col justify-between min-w-0">
          {/* Top: Date and Type */}
          <div>
            <div className="flex items-center gap-1 mb-1">
              <Clock size={12} className="text-gray-400" />
              <p className="text-sm font-bold text-gray-900">{formatDate(workoutDate)}</p>
            </div>
            <p className="text-sm font-semibold text-gray-700">{getWorkoutTypeLabel()}</p>
          </div>

          {/* Bottom: Stats and Coins */}
          <div className="flex items-center justify-between mt-3">
            {/* Stats: Calories and Duration */}
            <div className="flex items-center gap-3">
              {workout.calories > 0 && (
                <div className="flex items-center gap-1">
                  <Flame size={14} className="text-orange-500" />
                  <span className="text-sm font-bold text-gray-900">{workout.calories} קלוריות</span>
                </div>
              )}
              {workout.duration > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-sm font-bold text-gray-900">{formatDuration(workout.duration)}</span>
                </div>
              )}
            </div>

            {/* Coins Badge - COIN_SYSTEM_PAUSED: Re-enable in April */}
            {IS_COIN_SYSTEM_ENABLED && workout.earnedCoins > 0 && (
              <div className="flex items-center gap-1 bg-yellow-50 border border-yellow-200 rounded-lg px-2 py-1">
                <Coins size={14} className="text-yellow-600" />
                <span className="text-xs font-bold text-yellow-700">+{workout.earnedCoins} מטבעות</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.button>
  );
}
