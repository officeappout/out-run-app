"use client";

import React from 'react';
import { MockWorkout } from '../data/mock-schedule-data';

interface HeroCardProps {
  workout: MockWorkout;
  isRestDay?: boolean;
  isPostWorkout?: boolean;
  postWorkoutData?: {
    improvement: number;
    duration: string;
    streak: number;
  };
  onStart: () => void;
}

export default function HeroCard({
  workout,
  isRestDay = false,
  isPostWorkout = false,
  postWorkoutData,
  onStart,
}: HeroCardProps) {
  const getDifficultyLabel = (difficulty: string) => {
    const labels: Record<string, string> = {
      easy: 'קל',
      medium: 'בינוני',
      hard: 'קשה',
    };
    return labels[difficulty] || difficulty;
  };

  const getDifficultyColor = (difficulty: string) => {
    const colors: Record<string, string> = {
      easy: 'text-green-600',
      medium: 'text-yellow-600',
      hard: 'text-red-600',
    };
    return colors[difficulty] || 'text-gray-600';
  };

  if (isPostWorkout && postWorkoutData) {
    return (
      <div className="w-full bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100">
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <h2 className="text-xl font-bold text-gray-900 mb-2">האימון היומי שלך</h2>
          <div className="flex items-center gap-2 text-green-600">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="font-semibold">האימון בוצע בהצלחה!</span>
          </div>
        </div>

        {/* Content Grid */}
        <div className="px-6 pb-6 grid grid-cols-2 gap-4">
          {/* Left: Details */}
          <div className="space-y-3">
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">{workout.title}</h3>
              <div className="flex items-center gap-3 text-sm text-gray-600">
                <div className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                  <span>שיפור בביצועים של {postWorkoutData.improvement}%</span>
                </div>
                <div className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{postWorkoutData.duration}</span>
                </div>
                <div className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  <span>{postWorkoutData.streak} אימונים ברצף</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Image */}
          <div className="relative h-48 rounded-2xl overflow-hidden bg-gray-100">
            <img
              src={workout.imageUrl}
              alt={workout.title}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        </div>

        {/* CTA Button */}
        <div className="px-6 pb-6">
          <button
            onClick={onStart}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#00E5FF] to-[#00B8D4] text-white font-bold text-lg shadow-lg shadow-[#00E5FF]/30 active:scale-95 transition-transform"
          >
            אני על הגל, תציעו לי עוד אימון!
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100">
      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <h2 className="text-xl font-bold text-gray-900">האימון היומי שלך</h2>
        {isRestDay && (
          <p className="text-sm text-gray-600 mt-2">
            איזה כיף, היום זה נחים :) בכל זאת רוצים לעשות אימון? מוזמנים לעשות אימון התאוששות.
          </p>
        )}
      </div>

      {/* Image with Badge */}
      <div className="relative px-6">
        <div className="relative h-64 rounded-2xl overflow-hidden bg-gray-100">
          <img
            src={workout.imageUrl}
            alt={workout.title}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          
          {/* Badge */}
          <div className="absolute top-4 end-4 bg-white/90 backdrop-blur-sm px-3 py-2 rounded-full flex items-center gap-2 shadow-md">
            <span className="text-yellow-600 font-bold">$</span>
            <span className="text-sm font-bold text-gray-900">
              {workout.coins} = {workout.calories} {"קל׳"}
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-6 pt-4 pb-6 space-y-4">
        <div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">{workout.title}</h3>
          <div className="flex items-center gap-3 text-sm text-gray-600">
            <div className="flex items-center gap-1">
              <svg className={`w-4 h-4 ${getDifficultyColor(workout.difficulty)}`} fill="currentColor" viewBox="0 0 20 20">
                <path d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" />
              </svg>
              <span className={getDifficultyColor(workout.difficulty)}>{getDifficultyLabel(workout.difficulty)}</span>
            </div>
            <div className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{workout.duration} דקות</span>
            </div>
          </div>
        </div>

        {/* CTA Button */}
        <button
          onClick={onStart}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#00E5FF] to-[#00B8D4] text-white font-bold text-lg shadow-lg shadow-[#00E5FF]/30 active:scale-95 transition-transform"
        >
          יאללה, אפשר להתחיל!
        </button>
      </div>
    </div>
  );
}
