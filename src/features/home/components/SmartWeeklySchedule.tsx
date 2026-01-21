"use client";

import React from 'react';
import { DaySchedule } from '@/features/home/data/mock-schedule-data';
import { Dumbbell, Bed } from 'lucide-react';

interface SmartWeeklyScheduleProps {
  schedule: DaySchedule[];
  currentTrack?: 'wellness' | 'performance';
  scheduleDays?: string[]; // Array of Hebrew day letters like ['א', 'ב', 'ג']
  onDayClick?: (day: DaySchedule) => void;
}

export default function SmartWeeklySchedule({ 
  schedule, 
  currentTrack = 'wellness',
  scheduleDays = [],
  onDayClick 
}: SmartWeeklyScheduleProps) {
  const isHealthMode = currentTrack === 'wellness';
  
  // Canonical Hebrew day order used throughout the app
  const HEBREW_DAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'] as const;

  // Normalize selected days from props
  const selectedDays = scheduleDays || [];
  
  // Helper to check if a day is a training day
  const isTrainingDay = (dayIndex: number) => {
    const hebrewLetterForIndex = HEBREW_DAYS[dayIndex];
    return selectedDays.includes(hebrewLetterForIndex);
  };
  
  // Get day icon based on track and status
  const getDayIcon = (day: DaySchedule) => {
    const { status, day: dayLetter, date } = day;
    
    // Map the incoming day to its index in the canonical array
    const dayIndex = HEBREW_DAYS.indexOf(dayLetter as (typeof HEBREW_DAYS)[number]);
    
    // Past days: Always use Green Circle with Checkmark (SOURCE A)
    if (status === 'completed') {
      return (
        <div className="w-8 h-8 rounded-full bg-[#4CAF50] flex items-center justify-center text-white shadow-sm">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      );
    }
    
    // Today: Show loading spinner (SOURCE A)
    if (status === 'today') {
      return (
        <div className="w-9 h-9 rounded-full border-4 border-blue-200 dark:border-blue-900 flex items-center justify-center relative">
          <div className="absolute inset-0 rounded-full border-4 border-[#00C9F2] border-t-transparent animate-spin" style={{ transform: 'rotate(45deg)' }}></div>
        </div>
      );
    }
    
    // Future/Today days: Different logic based on track
    if (status === 'scheduled' || status === 'today') {
      if (!isHealthMode) {
        // PERFORMANCE Mode: Use Icon Layout from SOURCE B
        if (dayIndex >= 0 && isTrainingDay(dayIndex)) {
          return (
            <div className="relative">
              <Dumbbell className="text-gray-400 text-xl transform rotate-180" />
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-[#00C9F2] rounded-full border-2 border-white dark:border-gray-900 flex items-center justify-center">
                <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
          );
        } else {
          return <Bed className="text-gray-400 text-lg" />;
        }
      } else {
        // HEALTH Mode: Use Step Circles from SOURCE A with indicator dot
        if (dayIndex >= 0 && isTrainingDay(dayIndex)) {
          return (
            <div className="flex flex-col items-center">
              <span className="text-xs text-[#00C9F2]">💪</span>
              <div className="w-1 h-1 bg-[#00C9F2] rounded-full mt-0.5"></div>
            </div>
          );
        } else {
          return <span className="text-xs text-gray-400">z<sup>z</sup></span>;
        }
      }
    }
    
    // Rest days - BUT check if it's actually a training day first
    if (status === 'rest') {
      // If this day is in the user's schedule, show workout icon instead of rest
      if (dayIndex >= 0 && isTrainingDay(dayIndex)) {
        if (!isHealthMode) {
          // PERFORMANCE Mode: Show Dumbbell for training days even if status is 'rest'
          return (
            <div className="relative">
              <Dumbbell className="text-gray-400 text-xl transform rotate-180" />
            </div>
          );
        } else {
          // HEALTH Mode: Show workout emoji for training days
          return (
            <div className="flex flex-col items-center">
              <span className="text-xs text-[#00C9F2]">💪</span>
              <div className="w-1 h-1 bg-[#00C9F2] rounded-full mt-0.5"></div>
            </div>
          );
        }
      }
      // Actual rest day (not in schedule)
      if (!isHealthMode) {
        return <Bed className="text-gray-400 text-lg" />;
      } else {
        return <span className="text-xs text-gray-400">z<sup>z</sup></span>;
      }
    }
    
    return null;
  };

  // Fallback: Show empty state if schedule is empty or loading
  if (!schedule || schedule.length === 0) {
    return (
      <div className="bg-white dark:bg-[#1E1E1E] rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 mb-6 relative z-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">לו״ז אימונים</h2>
            <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 mt-1">
              <span>סנכרן את האימונים ליומן שלי</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
        </div>
        <div className="flex justify-center items-center py-8 text-gray-400">
          <p className="text-sm">טוען לו״ז...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-[#1E1E1E] rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 mb-6 relative z-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">לו״ז אימונים</h2>
          <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 mt-1">
            <span>סנכרן את האימונים ליומן שלי</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Week Schedule */}
      <div className="flex justify-between items-center">
        {schedule.map((day, index) => {
          const isToday = day.status === 'today';
          const isSelected = day.status !== 'rest' && day.status !== 'missed';
          
          return (
            <button
              key={index}
              onClick={() => onDayClick?.(day)}
              className="flex flex-col items-center gap-2 transition-transform active:scale-90"
            >
              <span className={`text-sm font-medium ${
                isToday 
                  ? 'font-bold text-gray-900 dark:text-white' 
                  : isSelected 
                    ? 'text-gray-700 dark:text-gray-300' 
                    : 'text-gray-500 dark:text-gray-400 opacity-50'
              }`}>
                {day.day}
              </span>
              
              <div className="flex items-center justify-center min-h-[36px]">
                {getDayIcon(day)}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
