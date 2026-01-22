"use client";

import React, { useMemo } from 'react';
import { DaySchedule } from '@/features/home/data/mock-schedule-data';
import { Dumbbell, Bed, Check, Footprints, Move, Bike, Activity } from 'lucide-react';
import { useDailyProgress } from '../hooks/useDailyProgress';

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
  
  // Canonical Hebrew day order used throughout the app (Sunday = 0)
  const HEBREW_DAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'] as const;
  
  // Get today's daily progress from Firestore
  const todayProgress = useDailyProgress();
  
  // Helper to get date string for a day index
  const getDateString = (dayIndex: number): string => {
    const today = new Date();
    const dayDate = new Date(today);
    const todayDayIndex = today.getDay(); // Sunday = 0
    const diff = dayIndex - todayDayIndex;
    dayDate.setDate(today.getDate() + diff);
    return dayDate.toISOString().split('T')[0];
  };
  
  // FIX: Helper to check if a day has workout completed
  const hasWorkoutCompleted = (dayLetter: string): boolean => {
    const todayIndex = new Date().getDay(); // Sunday = 0
    const dayIndex = HEBREW_DAYS.indexOf(dayLetter as any);
    
    if (dayIndex === todayIndex) {
      // Today - check todayProgress from Store
      return todayProgress?.workoutCompleted || false;
    }
    // For past/other days, we currently rely on the 'status' from props
    return false;
  };

  // Normalize selected days from props
  const selectedDays = scheduleDays || [];
  
  // Helper to check if a day is a training day
  const isTrainingDay = (dayLetter: string) => {
    return selectedDays.includes(dayLetter);
  };
  
  // Get day icon based on track and status
  const getDayIcon = (day: DaySchedule) => {
    const { status, day: dayLetter } = day;
    
    // Map the incoming day to its index in the canonical array
    const dayIndex = HEBREW_DAYS.indexOf(dayLetter as (typeof HEBREW_DAYS)[number]);
    const isToday = dayLetter === HEBREW_DAYS[new Date().getDay()];
    
    // 1. Past days: Always use Green Circle with Checkmark (SOURCE A)
    if (status === 'completed' && !isToday) {
      return (
        <div className="w-8 h-8 rounded-full bg-[#4CAF50] flex items-center justify-center text-white shadow-sm">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      );
    }
    
    // 2. Today: Show workout type icon if completed, otherwise loading spinner
    if (isToday || status === 'today') {
      const workoutDone = hasWorkoutCompleted(dayLetter);
      
      // Show icon if workout is completed
      if (workoutDone || todayProgress?.workoutCompleted) {
        const getWorkoutIcon = (workoutType?: string) => {
          const iconProps = { className: "w-5 h-5 text-white", size: 20 };
          if (workoutType) {
            switch (workoutType) {
              case 'running': return <Footprints {...iconProps} />;
              case 'walking': return <Move {...iconProps} />;
              case 'cycling': return <Bike {...iconProps} />;
              case 'strength': return <Dumbbell {...iconProps} />;
              case 'hybrid': return <Activity {...iconProps} />;
              default: return <Check className="w-5 h-5 text-white stroke-[3]" />;
            }
          }
          return <Check className="w-5 h-5 text-white stroke-[3]" />;
        };
        
        return (
          <div className="w-9 h-9 rounded-full bg-[#00ADEF] flex items-center justify-center shadow-md border-2 border-blue-300 relative z-10 animate-in zoom-in duration-300">
            {getWorkoutIcon(todayProgress?.workoutType)}
          </div>
        );
      }
      
      // Loading/Active spinner if today and not yet completed
      return (
        <div className="w-9 h-9 rounded-full border-4 border-blue-100 dark:border-blue-900 flex items-center justify-center relative">
          <div className="absolute inset-0 rounded-full border-4 border-[#00ADEF] border-t-transparent animate-spin"></div>
        </div>
      );
    }
    
    // 3. Future/Scheduled days
    if (status === 'scheduled' || isTrainingDay(dayLetter)) {
      if (!isHealthMode) {
        // PERFORMANCE Mode: Use Icon Layout from SOURCE B
        return (
          <div className="relative">
            <Dumbbell className="text-gray-300 dark:text-gray-600 text-xl transform rotate-12" />
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-[#00ADEF] rounded-full border-2 border-white dark:border-gray-900 flex items-center justify-center">
              <div className="w-1 h-1 bg-white rounded-full"></div>
            </div>
          </div>
        );
      } else {
        // HEALTH Mode: Use Step Circles from SOURCE A with indicator dot
        return (
          <div className="flex flex-col items-center">
            <span className="text-xs filter grayscale opacity-50">💪</span>
            <div className="w-1.5 h-1.5 bg-blue-100 dark:bg-gray-800 rounded-full mt-1"></div>
          </div>
        );
      }
    }
    
    // 4. Rest days
    if (status === 'rest' || !isTrainingDay(dayLetter)) {
      if (!isHealthMode) {
        return <Bed className="text-gray-300 dark:text-gray-700 text-lg opacity-40" />;
      } else {
        return <span className="text-xs text-gray-400 opacity-40">z<sup>z</sup></span>;
      }
    }
    
    return null;
  };

  // Fallback: Empty state
  if (!schedule || schedule.length === 0) {
    return (
      <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 mb-6">
        <div className="flex justify-center items-center py-4">
          <p className="text-sm text-gray-400">טוען לו״ז שבועי...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl p-5 shadow-sm border border-gray-100 dark:border-gray-800 mb-6 relative z-10">
      {/* Header Section */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">לו״ז אימונים</h2>
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 mt-1">
            <div className="w-2 h-2 rounded-full bg-[#00ADEF] animate-pulse"></div>
            <span>התוכנית המותאמת שלך פעילה</span>
          </div>
        </div>
        <button className="p-2.5 bg-gray-50 dark:bg-gray-800 rounded-2xl text-gray-400 hover:text-[#00ADEF] transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </button>
      </div>

      {/* Days Grid */}
      <div className="flex justify-between items-end px-1">
        {schedule.map((day, index) => {
          const isToday = day.day === HEBREW_DAYS[new Date().getDay()];
          const isSelected = isTrainingDay(day.day);
          
          return (
            <button
              key={index}
              onClick={() => onDayClick?.(day)}
              className="flex flex-col items-center gap-3 group"
            >
              <span className={`text-xs font-black transition-colors ${
                isToday 
                  ? 'text-[#00ADEF]' 
                  : isSelected 
                    ? 'text-gray-900 dark:text-gray-200' 
                    : 'text-gray-300 dark:text-gray-600'
              }`}>
                {day.day}
              </span>
              
              <div className="flex items-center justify-center min-h-[40px] transition-transform group-active:scale-90">
                {getDayIcon(day)}
              </div>
            </button>
          );
        })}
      </div>

      {/* Bottom Progress Indicator (Optional visual flair) */}
      <div className="mt-6 pt-4 border-t border-gray-50 dark:border-gray-800/50 flex items-center justify-between">
        <div className="flex -space-x-2 rtl:space-x-reverse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="w-6 h-6 rounded-full border-2 border-white dark:border-[#1E1E1E] bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden">
               <div className="w-full h-full bg-gradient-to-br from-blue-400 to-[#00ADEF] opacity-20"></div>
            </div>
          ))}
        </div>
        <span className="text-[10px] font-bold text-[#00ADEF] uppercase tracking-wider">
          3 אימונים נותרו השבוע
        </span>
      </div>
    </div>
  );
}