 "use client";

import React from 'react';
import { MockWorkout } from '../data/mock-schedule-data';
import { Play, Clock, Zap } from 'lucide-react';

interface HeroWorkoutCardProps {
  workout: MockWorkout;
  isRestDay?: boolean;
  onStart: () => void;
}

export default function HeroWorkoutCard({ workout, isRestDay = false, onStart }: HeroWorkoutCardProps) {
  const getDifficultyLabel = (difficulty: string) => {
    const labels: Record<string, string> = {
      easy: 'קל',
      medium: 'בינוני',
      hard: 'קשה',
    };
    return labels[difficulty] || difficulty;
  };

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

        {/* 2. Top Badges (Coins & Calories) */}
        <div className="absolute top-4 right-4 flex items-center gap-2">
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
        </div>

        {/* 3. Bottom Content */}
        <div className="absolute bottom-0 left-0 right-0 p-5 flex flex-col justify-end h-full">
          <div className="mb-4">
            <h4 className="text-2xl font-bold text-white mb-2">{workout.title}</h4>
            <p className="text-sm text-gray-200 line-clamp-2 mb-3 opacity-90">
              {workout.description || 'האימון היומי שלך מוכן. בוא נתחיל לזוז!'}
            </p>

            {/* Metadata tags */}
            <div className="flex items-center gap-3 text-xs text-white/80">
              <span className="flex items-center gap-1 bg-white/20 px-2 py-1 rounded-lg backdrop-blur-sm">
                <Zap size={12} className="text-yellow-400" />
                {getDifficultyLabel(workout.difficulty)}
              </span>
              <span className="flex items-center gap-1 bg-white/20 px-2 py-1 rounded-lg backdrop-blur-sm">
                <Clock size={12} className="text-blue-300" />
                {workout.duration} דקות
              </span>
            </div>
          </div>

          {/* 4. CTA Button */}
          <button
            onClick={onStart}
            className="w-full bg-[#00C9F2] hover:bg-[#00B4D8] text-white font-bold py-3.5 rounded-xl shadow-lg shadow-cyan-500/30 transition transform active:scale-95 flex items-center justify-center gap-2"
          >
            <Play size={20} fill="currentColor" />
            <span>התחל אימון</span>
          </button>
        </div>
      </div>
    </div>
  );
}
