"use client";

import React from 'react';
import { MockWorkout } from '../data/mock-schedule-data';
import { Play, Clock, Zap, Dumbbell, SlidersHorizontal } from 'lucide-react';

interface HeroWorkoutCardProps {
  workout: MockWorkout;
  isRestDay?: boolean;
  onStart: () => void;
  /** Callback when user taps "התאם אימון" — opens AdjustWorkoutModal */
  onAdjust?: () => void;
  /** Whether this workout was dynamically generated (shows adjust button) */
  isGenerated?: boolean;
}

/**
 * Render difficulty as bolts (⚡)
 * 1 = Easy (1 bolt, green)
 * 2 = Normal (2 bolts, yellow)
 * 3 = Intense (3 bolts, red/orange)
 */
function DifficultyBolts({ difficulty }: { difficulty: 1 | 2 | 3 }) {
  const configs = {
    1: { count: 1, color: 'text-green-400', bgColor: 'bg-green-500/20', label: 'קל' },
    2: { count: 2, color: 'text-yellow-400', bgColor: 'bg-yellow-500/20', label: 'רגיל' },
    3: { count: 3, color: 'text-orange-400', bgColor: 'bg-orange-500/20', label: 'אינטנסיבי' },
  };
  
  const config = configs[difficulty] || configs[2];
  
  return (
    <span className={`flex items-center gap-1 ${config.bgColor} px-2.5 py-1 rounded-lg backdrop-blur-sm`}>
      <span className="flex items-center">
        {Array.from({ length: config.count }).map((_, i) => (
          <Zap key={i} size={12} className={`${config.color} ${i > 0 ? '-ml-1' : ''}`} fill="currentColor" />
        ))}
        {/* Dim remaining bolts */}
        {Array.from({ length: 3 - config.count }).map((_, i) => (
          <Zap key={`dim-${i}`} size={12} className="text-gray-500/30 -ml-1" fill="currentColor" />
        ))}
      </span>
      <span className={`text-xs font-medium ${config.color} mr-1`}>{config.label}</span>
    </span>
  );
}

export default function HeroWorkoutCard({ workout, isRestDay = false, onStart, onAdjust, isGenerated }: HeroWorkoutCardProps) {
  // Handle both old string format and new number format
  const getDifficultyNumber = (difficulty: string | number): 1 | 2 | 3 => {
    if (typeof difficulty === 'number') {
      return Math.min(3, Math.max(1, difficulty)) as 1 | 2 | 3;
    }
    // Legacy string format
    const mapping: Record<string, 1 | 2 | 3> = {
      easy: 1,
      medium: 2,
      hard: 3,
    };
    return mapping[difficulty] || 2;
  };

  const difficultyNum = getDifficultyNumber(workout.difficulty);

  return (
    <div className="mb-8 px-5">
      <div className="mb-4">
        <h3 className="text-2xl font-extrabold text-gray-900 dark:text-white">האימון היומי שלך</h3>
        {isRestDay ? (
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">איזה כיף היום נחים..</p>
        ) : (
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">מוכן להתחיל?</p>
        )}
      </div>

      <div className="relative w-full h-[420px] rounded-2xl overflow-hidden shadow-[0_18px_45px_rgba(15,23,42,0.45)] group cursor-pointer border border-gray-100 dark:border-gray-800">
        {/* 1. Background Image & Gradient */}
        <div className="absolute inset-0">
          <img
            src={
              workout.imageUrl ||
              'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=800&q=80'
            }
            alt="Workout"
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        </div>

        {/* 2. Top Badges (Coins & Calories) + Adjust Button — z-20 to sit above bottom content */}
        <div className="absolute top-4 right-4 left-4 z-20 flex items-center justify-between">
          <div className="bg-white/90 dark:bg-black/60 backdrop-blur-md rounded-full px-3 py-1.5 flex items-center shadow-lg">
            <span className="text-xs font-bold text-gray-800 dark:text-white ml-1">
              {workout.calories} קל׳
            </span>
            <span className="text-xs text-gray-400 mx-1">=</span>
            <span className="text-xs font-bold text-yellow-500">{workout.coins}</span>
            <div className="w-4 h-4 rounded-full bg-yellow-400 flex items-center justify-center text-[10px] text-yellow-900 font-bold mr-1">
              $
            </div>
          </div>
          {/* Adjust Workout Button */}
          {isGenerated && onAdjust && (
            <button
              onClick={(e) => { e.stopPropagation(); onAdjust(); }}
              className="bg-white/90 dark:bg-black/60 backdrop-blur-md rounded-full px-3 py-1.5 flex items-center gap-1.5 shadow-lg transition-transform active:scale-95"
            >
              <SlidersHorizontal size={14} className="text-cyan-600" />
              <span className="text-xs font-bold text-gray-800 dark:text-white">התאם אימון</span>
            </button>
          )}
        </div>

        {/* 3. Bottom Content — z-10 so top badges (z-20) stay clickable */}
        <div className="absolute bottom-0 left-0 right-0 p-5 flex flex-col justify-end h-full z-10">
          <div className="mb-4">
            <h4 className="text-2xl font-bold text-white mb-2">{workout.title}</h4>
            
            {/* AI Cue (if available) */}
            {workout.aiCue && (
              <p className="text-sm text-cyan-300 mb-2 font-medium">
                {workout.aiCue}
              </p>
            )}
            
            <p className="text-sm text-gray-200 line-clamp-2 mb-3 opacity-90">
              {workout.description || 'האימון היומי שלך מוכן. בוא נתחיל לזוז!'}
            </p>

            {/* Metadata tags - Updated with bolt system */}
            <div className="flex items-center gap-3 flex-wrap text-xs text-white/80">
              {/* Difficulty Bolts */}
              <DifficultyBolts difficulty={difficultyNum} />
              
              {/* Duration */}
              <span className="flex items-center gap-1 bg-white/20 px-2 py-1 rounded-lg backdrop-blur-sm">
                <Clock size={12} className="text-blue-300" />
                {workout.duration} דקות
              </span>
              
              {/* Exercise Count (if available) */}
              {workout.exerciseCount && (
                <span className="flex items-center gap-1 bg-white/20 px-2 py-1 rounded-lg backdrop-blur-sm">
                  <Dumbbell size={12} className="text-purple-300" />
                  {workout.exerciseCount} תרגילים
                </span>
              )}

              {/* Volume Adjustment Badge (e.g. "Back to routine") */}
              {(workout as any).volumeBadge && (
                <span className="flex items-center gap-1 bg-blue-500/30 px-2 py-1 rounded-lg backdrop-blur-sm text-blue-200">
                  {(workout as any).volumeBadge}
                </span>
              )}
            </div>
          </div>

          {/* 4. CTA Button — always visible at bottom */}
          <button
            onClick={onStart}
            className="w-full bg-[#00C9F2] hover:bg-[#00B4D8] text-white font-extrabold py-4 rounded-xl shadow-lg shadow-cyan-500/30 transition transform active:scale-95 flex items-center justify-center gap-2 text-lg"
          >
            <Play size={22} fill="currentColor" />
            <span>התחל אימון</span>
          </button>
        </div>
      </div>
    </div>
  );
}
